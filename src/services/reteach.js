// services/reteach.js — updated for On Deck + Served model
// Notes:
// - Keeps existing APIs you already used, but adds markServedToday and status helpers.
// - Normalizes task status to new model: not_started | in_progress | completed | canceled
// - "verified" from old flow maps to completed. "turned_in" maps to in_progress (awaiting verify).
// - Attendance is idempotent per student per day via deterministic doc id.

import { db } from "../firebaseConfig";
import {
  addDoc, collection, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, onSnapshot, query, where, orderBy,
  arrayUnion, arrayRemove, writeBatch, deleteDoc, getDocs, limit, startAfter
} from "firebase/firestore";
import { todayKey } from "../utils/date";

// ------------------------------
// Helpers
// ------------------------------
const ACTIVE_STATES = new Set(["not_started", "in_progress"]);
const TERMINAL_STATES = new Set(["completed", "canceled"]);

/**
 * Archive a completed task into the student's reteach history, and
 * deactivate the live task so it disappears from "active" views.
 *
 * This is atomic: either both the history entry and the task update commit, or neither does.
 *
 * Writes:
 * - students/{studentId}/reteachHistory/{autoId}  <-- a copy of the finished task with completion metadata
 * - tasks/{taskId} { active: false, state: "completed", completedAt, completedBy, archived: true }
 *
 * @param {string} taskId      Firestore doc id in "tasks"
 * @param {string} completedBy UID of the human finishing it (you)
 */

export async function archiveCompletedTask(taskId, completedBy) {
  if (!taskId) throw new Error("archiveCompletedTask: missing taskId");

  // 1) Read the current task so we can copy relevant fields into history.
  const taskRef = doc(db, "tasks", taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error("archiveCompletedTask: task not found");

  const t = snap.data();
  const studentId = t.studentId;
  if (!studentId) throw new Error("archiveCompletedTask: task missing studentId");

  // Guard: if it's already archived, bail out quietly to avoid dupes.
  if (t.archived === true || t.active === false) return;

  // 2) Prepare a new history doc under the student's subcollection.
  // Using an auto-id so you can archive multiple tasks over time without collisions.
  const historyColl = collection(db, "students", studentId, "reteachHistory");
  // Trick to generate an auto id with modular SDK: create a doc ref off a collection ref.
  const historyRef = doc(historyColl);

  // 3) Batch both writes for all-or-nothing.
  const batch = writeBatch(db);

  // History payload: keep it readable and queryable later.
  batch.set(historyRef, {
    taskId,
    studentId,
    subject: t.subject || "ELA",
    title: t.title || "Untitled Task",
    // Preserve some provenance
    assignedBy: t.assignedBy || null,
    createdAt: t.createdAt || null,
    // Completion metadata
    completedAt: serverTimestamp(),
    completedBy: completedBy || null,
    // Optional analytics hooks
    stateBefore: t.state || "not_started",
    totalMinutes: t.totalMinutes || 0, // if you track minutes on the task later
    // Keep a shallow copy of anything else you might find useful
    snapshot: {
      active: t.active,
      lastUpdated: t.lastUpdated || null
    }
  });

  // Deactivate the task so it leaves the active queue.
  batch.update(taskRef, {
    active: false,            // removes from active queries
    state: "completed",       // belt-and-suspenders
    archived: true,           // explicit flag so you can filter later if needed
    completedAt: serverTimestamp(),
    completedBy: completedBy || null,
    lastUpdated: serverTimestamp()
  });

  // 4) Commit the batch. If this throws, nothing was written.
  await batch.commit();
}

// Attendance by student (most recent first)
export async function listAttendanceByStudent(sid, { pageSize = 10, cursor = null } = {}) {
  let q = query(
    collection(db, "attendance"),
    where("studentId", "==", sid),
    orderBy("date", "desc"),
    limit(pageSize)
  );
  if (cursor) q = query(q, startAfter(cursor));

  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.at(-1) || null,
    done: snap.empty || snap.size < pageSize
  };
}

// Completed tasks history under students/{sid}/reteachHistory
export async function listCompletedTasksByStudent(sid, { pageSize = 10, cursor = null } = {}) {
  let q = query(
    collection(db, "students", sid, "reteachHistory"),
    orderBy("completedAt", "desc"),
    limit(pageSize)
  );
  if (cursor) q = query(q, startAfter(cursor));

  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.at(-1) || null,
    done: snap.empty || snap.size < pageSize
  };
}

// Cancel all active tasks for a student and remove them from today's deck
export async function dismissStudentFromAR(studentId, todayKey) {
  const batch = writeBatch(db);

  // 1) cancel all active tasks for this student
  const q = query(collection(db, "tasks"),
    where("active", "==", true),
    where("studentId", "==", studentId)
  );
  const snap = await getDocs(q);
  snap.forEach(d => {
    batch.update(d.ref, { active: false, state: "canceled" });
  });

  // 2) remove from today's deck (if present)
  if (todayKey) {
    const deckRef = doc(db, "deck", todayKey);
    // arrayRemove would be ideal, but we’ll just fetch then write since you already have helpers
    // do nothing here; call your existing removeFromDeck outside in the UI for clearer UX
  }

  await batch.commit();
}

// Hard delete a single task (use sparingly; archival is nicer)
export async function deleteTaskHard(taskId) {
  await deleteDoc(doc(db, "tasks", taskId));
}







function normalizeStatus(s) {
  if (!s) return "not_started";
  if (s === "verified") return "completed";      // legacy
  if (s === "turned_in") return "in_progress";    // legacy
  if (TERMINAL_STATES.has(s)) return s;
  if (s === "not_started" || s === "in_progress") return s;
  return "not_started";
}

/**
 * Update a single task's workflow state.
 * - taskId: Firestore doc id in "tasks"
 * - newState: one of "not_started" | "needs_to_finish" | "in_progress" | "completed"
 *
 * This only updates the state and lastUpdated timestamp.
 * We are NOT auto-archiving completed tasks here. That's a separate, explicit action.
 */
export async function updateTaskState(taskId, newState) {
  if (!taskId) throw new Error("updateTaskState: missing taskId");
  if (!newState) throw new Error("updateTaskState: missing newState");

  const ref = doc(db, "tasks", taskId);
  await updateDoc(ref, {
    state: newState,
    lastUpdated: serverTimestamp()
  });
}

// ------------------------------
// Students
// ------------------------------
export async function addStudent({ displayName, grade = "", homeroom = "" }) {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, "students"), {
    displayName, grade, homeroom, archived: false, createdAt: now, updatedAt: now
  });
  return ref.id;
}

export async function getStudent(sid) {
  const snap = await getDoc(doc(db, "students", sid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Optional: archive/unarchive a student's current AR case (soft)
export async function archiveStudentCase(studentId, reason = "completed", byUid = "") {
  await updateDoc(doc(db, "students", studentId), {
    archived: true,
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, "lifecycle"), {
    studentId,
    eventType: reason === "completed" ? "autoArchived" : "exitedByStaff",
    reason,
    by: byUid || null,
    at: serverTimestamp(),
  });
}

// Find a student by exact displayName + homeroom
// To avoid a composite index requirement, we query by name then filter by homeroom client-side.
export async function findStudentByNameHomeroom(displayName, homeroom = "") {
  const q1 = query(collection(db, "students"), where("displayName", "==", displayName));
  const snap = await new Promise((resolve, reject) => {
    onSnapshot(q1, s => resolve(s), err => reject(err));
  });
  const candidates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const match = candidates.find(s => (s.homeroom || "") === (homeroom || ""));
  return match || null;
}

// Upsert a student by name+homeroom (create or update)
export async function upsertStudent({ displayName, grade = "", homeroom = "" }) {
  const name = (displayName || "").trim();
  const room = (homeroom || "").trim();
  const grd  = (grade || "").trim();
  if (!name) throw new Error("displayName required");

  const existing = await findStudentByNameHomeroom(name, room);
  const now = serverTimestamp();

  if (existing) {
    await updateDoc(doc(db, "students", existing.id), {
      displayName: name,
      grade: grd,
      homeroom: room,
      archived: false,
      updatedAt: now,
    });
    return { id: existing.id, created: false };
  }

  const ref = await addDoc(collection(db, "students"), {
    displayName: name,
    grade: grd,
    homeroom: room,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, created: true };
}

// Bulk import helper for the admin page
export async function bulkImportStudents(rows) {
  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const name = (r.displayName || "").trim();
    const grade = (r.grade || "").trim();
    const room = (r.homeroom || "").trim();
    if (!name) { skipped++; continue; }
    const res = await upsertStudent({ displayName: name, grade, homeroom: room });
    if (res.created) created++; else updated++;
  }
  return { ok: true, created, updated, skipped };
}


// ------------------------------
// Tasks
// ------------------------------
export async function addTask({ studentId, subject, title, assignedBy, teacher = "" }) {
  const now = serverTimestamp();
  return addDoc(collection(db, "tasks"), {
    studentId, subject, title, assignedBy, teacher,
    state: "not_started", active: true,
    assignedAt: now, lastUpdated: now
  });
}

export function listenActiveTasks(cb) {
  const q = query(
    collection(db, "tasks"),
    where("active", "==", true),
    orderBy("lastUpdated", "desc")
  );
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map(d => {
      const data = d.data();
      const state = normalizeStatus(data.state);
      return { id: d.id, ...data, state };
    });
    cb(tasks);
  });
}

// New: setTaskStatus (explicit) and small helpers
export async function setTaskStatus(taskId, status) {
  const state = normalizeStatus(status);
  await updateDoc(doc(db, "tasks", taskId), {
    state,
    active: !TERMINAL_STATES.has(state),
    lastUpdated: serverTimestamp(),
  });
}

export async function completeTask(taskId) { return setTaskStatus(taskId, "completed"); }
export async function cancelTask(taskId, reason = "") {
  await setTaskStatus(taskId, "canceled");
  await addDoc(collection(db, "lifecycle"), {
    taskId,
    eventType: "taskCanceled",
    reason: reason || null,
    at: serverTimestamp(),
  });
}

// Legacy: bumpTaskState now walks not_started -> in_progress -> completed
export async function bumpTaskState(taskId, currentState) {
  const state = normalizeStatus(currentState);
  const order = ["not_started", "in_progress", "completed"];
  const idx = Math.max(0, order.indexOf(state));
  const next = order[Math.min(idx + 1, order.length - 1)];
  await setTaskStatus(taskId, next);
}

// ------------------------------
// Attendance / Minutes
// ------------------------------
// Minutes log (kept for compatibility with your drawer). Consider phasing out later.
export async function addMinutes(studentId, minutes, uid, note = "") {
  await addDoc(collection(db, "arLogs"), {
    studentId,
    date: todayKey(),
    minutes,
    createdBy: uid,
    createdAt: serverTimestamp(),
    note: note || null
  });
}

// New: markServedToday — idempotent per student per day
export async function markServedToday(studentId, byUid, room = "") {
  const date = todayKey();
  const attId = `${studentId}_${date}`; // deterministic id to prevent duplicates
  const ref = doc(db, "attendance", attId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    // already marked today; lightly update recorder/room if provided
    await updateDoc(ref, {
      by: byUid || snap.data().by || null,
      room: room || snap.data().room || null,
      updatedAt: serverTimestamp(),
    });
    return attId;
  }
  await setDoc(ref, {
    studentId,
    date,          // YYYY-MM-DD
    room: room || null,
    by: byUid || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, "lifecycle"), {
    studentId,
    eventType: "servedDayLogged",
    date,
    by: byUid || null,
    at: serverTimestamp(),
  });
  return attId;
}

// ------------------------------
// Deck (date-scoped)
// ------------------------------
export async function ensureTodayDeck(ownerUid) {
  const ref = doc(db, "deck", todayKey());
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      items: [],
      createdBy: ownerUid,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  }
  return ref;
}

export async function addToDeck(studentId) {
  const ref = doc(db, "deck", todayKey());
  await updateDoc(ref, { items: arrayUnion(studentId), lastUpdated: serverTimestamp() });
}

export async function removeFromDeck(studentId) {
  const ref = doc(db, "deck", todayKey());
  await updateDoc(ref, { items: arrayRemove(studentId), lastUpdated: serverTimestamp() });
}

// ------------------------------
// Optional utility: check if a student should auto-archive (no active tasks)
// Call after any task status change; leave wiring to UI or a Cloud Function if preferred.
// ------------------------------
export async function maybeAutoArchiveStudent(studentId) {
  // Lightweight client-side check: query for any active tasks
  const q1 = query(collection(db, "tasks"), where("studentId", "==", studentId), where("active", "==", true));
  const snap = await new Promise(resolve => onSnapshot(q1, s => resolve(s), { once: true }));
  if (snap.empty) {
    await archiveStudentCase(studentId, "completed");
  }
}
