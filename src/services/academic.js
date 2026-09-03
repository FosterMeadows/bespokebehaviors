// services/academic.js — updated for On Deck + Served model
// Notes:
// - Keeps existing APIs you already used, but adds markServedToday and status helpers.
// - Normalizes task status to new model: not_started | in_progress | completed | canceled
// - "verified" from old flow maps to completed. "turned_in" maps to in_progress (awaiting verify).
// - Attendance is idempotent per student per day via deterministic doc id.

import { db } from "../firebaseConfig";
import {
  addDoc, collection, doc, getDoc, updateDoc,
  serverTimestamp, onSnapshot, query, where, orderBy,
  arrayRemove, writeBatch, deleteDoc, getDocs, limit, startAfter, runTransaction, Timestamp
} from "firebase/firestore";
import { todayKey } from "../utils/date";
import { studentRecordEvent, studentRecordEventRef } from "./studentRecordEvents";
import { academicTaskDocId } from "../utils/academicTaskIdentity";
import { canUseAcademic, canViewStudent, getAllowedGradeLevels, isSchoolwide } from "../utils/access";

// ------------------------------
// Helpers
// ------------------------------
const ACTIVE_STATES = new Set(["not_started", "needs_to_finish", "in_progress"]);
const TERMINAL_STATES = new Set(["completed", "canceled"]);

/**
 * Archive a completed task into the student's Academic Intervention history, and
 * deactivate the live task so it disappears from "active" views.
 *
 * This is atomic: either both the history entry and the task update commit, or neither does.
 *
 * Writes:
 * - students/{studentId}/academicHistory/{autoId}  <-- a copy of the finished task with completion metadata
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
  const historyColl = collection(db, "students", studentId, "academicHistory");
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
    notes: t.notes || "",
    teacher: t.teacher || "",
    // Preserve some provenance
    assignedBy: t.assignedBy || null,
    assignedAt: t.assignedAt || null,
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
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId,
    domain: "academic",
    eventType: "taskCompleted",
    actor: { uid: completedBy },
    summary: `Completed academic assignment: ${t.title || "Untitled Task"}`,
    sourceCollection: "tasks",
    sourceId: taskId,
    details: { previousState: t.state || "not_started", nextState: "completed" }
  }));

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

// Completed tasks history under students/{sid}/academicHistory
export async function listCompletedTasksByStudent(sid, { pageSize = 10, cursor = null } = {}) {
  const [historyResult, tasksResult] = await Promise.allSettled([
    getDocs(collection(db, "students", sid, "academicHistory")),
    getDocs(query(collection(db, "tasks"), where("studentId", "==", sid)))
  ]);

  if (historyResult.status === "rejected" && tasksResult.status === "rejected") {
    throw historyResult.reason;
  }

  const records = new Map();
  if (tasksResult.status === "fulfilled") {
    tasksResult.value.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(task => task.state === "completed" || task.state === "verified" || task.archived === true)
      .forEach(task => records.set(task.id, { ...task, taskId: task.id }));
  }
  if (historyResult.status === "fulfilled") {
    historyResult.value.docs.forEach(d => {
      const history = { id: d.id, ...d.data() };
      const key = history.taskId || history.id;
      records.set(key, { ...(records.get(key) || {}), ...history, id: key });
    });
  }

  const toMillis = value => {
    if (value?.toMillis) return value.toMillis();
    if (value?.toDate) return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const allItems = [...records.values()].sort(
    (a, b) => toMillis(b.completedAt) - toMillis(a.completedAt)
  );
  const offset = Number.isInteger(cursor) ? cursor : 0;
  const items = allItems.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  return {
    items,
    cursor: nextOffset < allItems.length ? nextOffset : null,
    done: nextOffset >= allItems.length
  };
}

// Cancel all active tasks for a student and remove them from today's deck
export async function dismissStudentFromAR(studentId, todayKey, actor = {}) {
  const batch = writeBatch(db);

  // 1) cancel all active tasks for this student
  const q = query(collection(db, "tasks"),
    where("active", "==", true),
    where("studentId", "==", studentId)
  );
  const snap = await getDocs(q);
  snap.forEach(d => {
    batch.update(d.ref, { active: false, state: "canceled" });
    batch.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "taskStatusChanged",
      actor,
      summary: `${d.data().title || "Academic assignment"}: canceled when student was removed`,
      sourceCollection: "tasks",
      sourceId: d.id,
      details: { previousState: d.data().state || null, nextState: "canceled" }
    }));
  });

  // 2) remove from today's deck (if present)
  if (todayKey) {
    void todayKey;
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
  if (s === "not_started" || s === "needs_to_finish" || s === "in_progress") return s;
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
export async function updateTaskState(taskId, newState, actor = {}) {
  if (!taskId) throw new Error("updateTaskState: missing taskId");
  if (!newState) throw new Error("updateTaskState: missing newState");

  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("updateTaskState: task not found");
  const task = snap.data();
  const batch = writeBatch(db);
  batch.update(ref, {
    state: newState,
    lastUpdated: serverTimestamp()
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: task.studentId,
    domain: "academic",
    eventType: "taskStatusChanged",
    actor,
    summary: `${task.title || "Academic assignment"}: ${task.state || "not started"} to ${newState}`,
    sourceCollection: "tasks",
    sourceId: taskId,
    details: { previousState: task.state || null, nextState: newState }
  }));
  await batch.commit();
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
export const MAX_TASK_BATCH_SIZE = 5;

function chunkAcademicValues(values, size = 8) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function listenPendingAcademicStudentCount(profile, onCount, onError) {
  if (!canUseAcademic(profile)) {
    onCount(0);
    return () => {};
  }

  const allowedGrades = getAllowedGradeLevels(profile);
  if (!isSchoolwide(profile) && !allowedGrades.length) {
    onCount(0);
    return () => {};
  }

  if (isSchoolwide(profile)) {
    return onSnapshot(
      query(collection(db, "tasks"), where("active", "==", true)),
      snapshot => onCount(new Set(snapshot.docs.map(taskDoc => taskDoc.data().studentId).filter(Boolean)).size),
      onError
    );
  }

  // The grade-scoped query returns the normal count quickly. A background
  // reconciliation preserves older active tasks created before task grades
  // became required; it may update the initial count once all legacy batches load.
  let taskUnsubscribers = [];
  const unsubscribeDirect = onSnapshot(
    query(
      collection(db, "tasks"),
      where("active", "==", true),
      where("grade", "in", allowedGrades.slice(0, 30))
    ),
    snapshot => onCount(new Set(snapshot.docs.map(taskDoc => taskDoc.data().studentId).filter(Boolean)).size),
    () => {}
  );
  const unsubscribeStudents = onSnapshot(
    query(collection(db, "students"), where("grade", "in", allowedGrades.slice(0, 30))),
    snapshot => {
      taskUnsubscribers.forEach(unsubscribe => unsubscribe());
      const studentIds = snapshot.docs
        .map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() }))
        .filter(student => canViewStudent(profile, student))
        .map(student => student.id);
      if (!studentIds.length) {
        onCount(0);
        taskUnsubscribers = [];
        return;
      }
      const chunks = chunkAcademicValues(studentIds);
      const pendingByChunk = new Map();
      const loadedChunks = new Set();
      taskUnsubscribers = chunks.map((studentIdChunk, index) => onSnapshot(
        query(collection(db, "tasks"), where("active", "==", true), where("studentId", "in", studentIdChunk)),
        taskSnapshot => {
          pendingByChunk.set(index, taskSnapshot.docs.map(taskDoc => taskDoc.data().studentId).filter(Boolean));
          loadedChunks.add(index);
          if (loadedChunks.size === chunks.length) {
            onCount(new Set([...pendingByChunk.values()].flat()).size);
          }
        },
        onError
      ));
    },
    onError
  );

  return () => {
    unsubscribeDirect();
    unsubscribeStudents();
    taskUnsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

export async function addTask({ studentId, subject, title, assignedBy, teacher = "", notes = "", grade = "" }) {
  const now = serverTimestamp();
  const ref = doc(db, "tasks", await academicTaskDocId({ studentId, subject, title }));
  const batch = writeBatch(db);
  batch.set(ref, {
    studentId, subject, title, assignedBy, teacher, notes, grade,
    state: "not_started", active: true,
    assignedAt: now, lastUpdated: now
  });
  await batch.commit();
  return ref;
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
export async function setTaskStatus(taskId, status, actor = {}) {
  const state = normalizeStatus(status);
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Task not found");
  const task = snap.data();
  const batch = writeBatch(db);
  batch.update(ref, { state, active: !TERMINAL_STATES.has(state), lastUpdated: serverTimestamp() });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: task.studentId,
    domain: "academic",
    eventType: "taskStatusChanged",
    actor,
    summary: `${task.title || "Academic assignment"}: ${task.state || "not started"} to ${state}`,
    sourceCollection: "tasks",
    sourceId: taskId,
    details: { previousState: task.state || null, nextState: state }
  }));
  await batch.commit();
  return task;
}

export async function completeTask(taskId, actor = {}) { return setTaskStatus(taskId, "completed", actor); }
export async function cancelTask(taskId, reason = "", actor = {}) {
  const task = await setTaskStatus(taskId, "canceled", actor);
  await addDoc(collection(db, "lifecycle"), {
    studentId: task.studentId,
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
export async function markServedToday(studentId, byUid, room = "", byName = "") {
  const date = todayKey();
  const attId = `${studentId}_${date}`; // deterministic id to prevent duplicates
  const ref = doc(db, "attendance", attId);
  const batch = writeBatch(db);
  const attendance = {
    studentId,
    date,          // YYYY-MM-DD
    by: byUid || null,
    byName: byName || null,
    updatedAt: serverTimestamp(),
  };
  if (room) attendance.room = room;
  batch.set(ref, attendance, { merge: true });
  batch.set(doc(collection(db, "lifecycle")), {
    studentId,
    eventType: "servedDayLogged",
    date,
    by: byUid || null,
    byName: byName || null,
    at: serverTimestamp(),
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId,
    domain: "academic",
    eventType: "attendanceMarked",
    actor: { uid: byUid, name: byName },
    summary: "Marked present for academic reteach",
    sourceCollection: "attendance",
    sourceId: attId,
    details: { date, room: room || null }
  }));
  await batch.commit();
  return attId;
}

export async function recordTodayAcademicAttendance(studentId, staff = {}, laneId, { room = "" } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const attId = `${studentId}_${date}`;
  const attendanceRef = doc(db, "attendance", attId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));

  await runTransaction(db, async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    const attendance = {
      studentId,
      date,
      grade: lane.grade,
      laneId: lane.id,
      by: staff.uid || null,
      byName: staff.name || null,
      updatedAt: serverTimestamp()
    };
    if (room) attendance.room = room;
    transaction.set(attendanceRef, attendance, { merge: true });
    transaction.set(doc(collection(db, "lifecycle")), {
      studentId,
      eventType: "servedDayLogged",
      date,
      grade: lane.grade,
      laneId: lane.id,
      by: staff.uid || null,
      byName: staff.name || null,
      at: serverTimestamp()
    });
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "attendanceMarked",
      actor: staff,
      summary: "Marked present for academic reteach",
      sourceCollection: "attendance",
      sourceId: attId,
      details: { date, room: room || null, laneId: lane.id }
    }));

    if (sessionSnap.exists()) {
      const session = sessionSnap.data();
      const outcomes = { ...(session.outcomes || {}) };
      outcomes[studentId] = {
        status: "present",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
      transaction.update(sessionRef, { outcomes, lastUpdated: serverTimestamp() });
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "sessionOutcomeRecorded",
        actor: staff,
        summary: "Academic session outcome recorded: present",
        sourceCollection: "academicSessions",
        sourceId: sessionRef.id,
        details: { status: "present", laneId: lane.id, date: session.date || date }
      }));
    }
  });
  return attId;
}

function normalizeImportKey(value) {
  return String(value || "").trim().toUpperCase();
}

async function hashImportKey(value) {
  const normalized = normalizeImportKey(value);
  if (!normalized) throw new Error("Student identifier required");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function previewStudentRosterImport(rows) {
  const [studentSnap, keySnap] = await Promise.all([
    getDocs(collection(db, "students")),
    getDocs(collection(db, "studentImportKeys"))
  ]);
  const students = new Map(studentSnap.docs.map(studentDoc => [studentDoc.id, { id: studentDoc.id, ...studentDoc.data() }]));
  const mappings = new Map(keySnap.docs.map(keyDoc => [keyDoc.id, keyDoc.data().studentId]));
  const exactStudents = new Map();
  for (const student of students.values()) {
    const exactKey = [student.displayName, student.grade, student.homeroom].map(value => String(value || "").trim().toLowerCase()).join("|");
    if (!exactStudents.has(exactKey)) exactStudents.set(exactKey, []);
    exactStudents.get(exactKey).push(student.id);
  }

  return Promise.all(rows.map(async row => {
    if (!row.valid) return { ...row, status: "invalid" };
    const keyHash = await hashImportKey(row.externalStudentId);
    let studentId = mappings.get(keyHash) || "";
    let matchedBy = studentId ? "identifier" : "";
    if (!studentId) {
      const exactKey = [row.displayName, row.grade, row.homeroom].map(value => String(value || "").trim().toLowerCase()).join("|");
      const exactMatches = exactStudents.get(exactKey) || [];
      if (exactMatches.length === 1) {
        studentId = exactMatches[0];
        matchedBy = "exact";
      }
    }
    const existing = studentId ? students.get(studentId) : null;
    const unchanged = existing
      && String(existing.displayName || "").trim() === row.displayName
      && String(existing.grade || "").trim() === row.grade
      && String(existing.homeroom || "").trim() === row.homeroom
      && existing.archived !== true;
    return {
      ...row,
      keyHash,
      studentId,
      matchedBy,
      status: existing ? (unchanged ? (matchedBy === "exact" ? "link" : "unchanged") : "update") : "new"
    };
  }));
}

export async function importStudentRoster(rows) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.valid || !row.keyHash) {
      skipped += 1;
      continue;
    }
    if (row.status === "unchanged" && row.matchedBy === "identifier") {
      unchanged += 1;
      continue;
    }
    const existed = await runTransaction(db, async transaction => {
      const keyRef = doc(db, "studentImportKeys", row.keyHash);
      const keyDoc = await transaction.get(keyRef);
      const mappedStudentId = keyDoc.exists() ? keyDoc.data().studentId : "";
      const studentRef = mappedStudentId
        ? doc(db, "students", mappedStudentId)
        : row.studentId
          ? doc(db, "students", row.studentId)
          : doc(collection(db, "students"));
      const studentDoc = await transaction.get(studentRef);
      const now = serverTimestamp();
      transaction.set(studentRef, {
        displayName: row.displayName,
        grade: row.grade,
        homeroom: row.homeroom,
        archived: false,
        ...(studentDoc.exists() ? {} : { createdAt: now }),
        updatedAt: now
      }, { merge: true });
      transaction.set(keyRef, {
        studentId: studentRef.id,
        ...(keyDoc.exists() ? {} : { createdAt: now }),
        updatedAt: now
      }, { merge: true });
      return studentDoc.exists();
    });
    if (existed) updated += 1;
    else created += 1;
  }
  return { ok: true, created, updated, unchanged, skipped };
}

export async function updateStudentRecord(studentId, updates) {
  if (!studentId) throw new Error("Student record required");
  await updateDoc(doc(db, "students", studentId), {
    displayName: String(updates.displayName || "").trim(),
    grade: String(updates.grade || "").trim(),
    homeroom: String(updates.homeroom || "").trim(),
    updatedAt: serverTimestamp()
  });
}

export async function addTasks({ studentIds, subject, title, assignedBy, teacher = "", notes = "", grade = "" }) {
  const uniqueStudentIds = [...new Set((studentIds || []).map(id => String(id || "").trim()).filter(Boolean))];
  if (uniqueStudentIds.length === 0) throw new Error("At least one student is required");
  if (uniqueStudentIds.length > MAX_TASK_BATCH_SIZE) {
    throw new Error(`No more than ${MAX_TASK_BATCH_SIZE} students can be assigned at once`);
  }

  const refs = await Promise.all(uniqueStudentIds.map(async studentId =>
    doc(db, "tasks", await academicTaskDocId({ studentId, subject, title }))
  ));
  const batch = writeBatch(db);
  const now = serverTimestamp();
  refs.forEach((ref, index) => {
    const studentId = uniqueStudentIds[index];
    batch.set(ref, {
      studentId, subject, title, assignedBy, teacher, notes, grade,
      state: "not_started", active: true,
      assignedAt: now, lastUpdated: now
    });
  });
  await batch.commit();
  return refs;
}

export async function unmarkServedToday(studentId, byUid = "", byName = "") {
  const date = todayKey();
  const attId = `${studentId}_${date}`;
  const attendanceRef = doc(db, "attendance", attId);
  const attendanceSnap = await getDoc(attendanceRef);
  const prior = attendanceSnap.exists() ? attendanceSnap.data() : {};
  const batch = writeBatch(db);
  batch.delete(attendanceRef);
  batch.set(doc(collection(db, "lifecycle")), {
    studentId,
    eventType: "servedDayUnlogged",
    date,
    by: byUid || null,
    byName: byName || null,
    at: serverTimestamp()
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId,
    domain: "academic",
    eventType: "attendanceUnmarked",
    actor: { uid: byUid, name: byName },
    summary: "Removed academic attendance mark",
    sourceCollection: "attendance",
    sourceId: attId,
    details: { date, priorRoom: prior.room || null, priorRecordedByUid: prior.by || null }
  }));
  await batch.commit();
}

export async function undoTodayAcademicAttendance(studentIds, staff = {}, laneId) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (!ids.length) return;
  const date = todayKey();
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(laneId, date));
  const attendanceRefs = ids.map(studentId => doc(db, "attendance", `${studentId}_${date}`));

  await runTransaction(db, async transaction => {
    const [sessionSnap, ...attendanceSnaps] = await Promise.all([
      transaction.get(sessionRef),
      ...attendanceRefs.map(ref => transaction.get(ref))
    ]);
    const outcomes = { ...(sessionSnap.exists() ? sessionSnap.data().outcomes || {} : {}) };

    ids.forEach((studentId, index) => {
      const prior = attendanceSnaps[index].exists() ? attendanceSnaps[index].data() : {};
      transaction.delete(attendanceRefs[index]);
      outcomes[studentId] = {
        status: "selected",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
      transaction.set(doc(collection(db, "lifecycle")), {
        studentId,
        eventType: "servedDayUnlogged",
        date,
        by: staff.uid || null,
        byName: staff.name || null,
        at: serverTimestamp()
      });
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "attendanceUnmarked",
        actor: staff,
        summary: "Removed academic attendance mark",
        sourceCollection: "attendance",
        sourceId: `${studentId}_${date}`,
        details: { date, priorRoom: prior.room || null, priorRecordedByUid: prior.by || null }
      }));
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "sessionOutcomeRecorded",
        actor: staff,
        summary: "Academic session outcome recorded: selected",
        sourceCollection: "academicSessions",
        sourceId: sessionRef.id,
        details: { status: "selected", laneId, date }
      }));
    });

    if (sessionSnap.exists()) {
      transaction.update(sessionRef, { outcomes, lastUpdated: serverTimestamp() });
    }
  });
}

// ------------------------------
// Academic session lanes
// ------------------------------
export const ACADEMIC_SESSION_LANES = Object.freeze([
  { id: "6-north", label: "Grade 6 North", grade: "6" },
  { id: "6-south", label: "Grade 6 South", grade: "6" },
  { id: "7", label: "Grade 7", grade: "7" },
  { id: "8", label: "Grade 8", grade: "8" }
]);

export function academicLaneDocId(laneId, date = todayKey()) {
  return `${date}_${laneId}`;
}

function getAcademicLane(laneId) {
  const lane = ACADEMIC_SESSION_LANES.find(item => item.id === laneId);
  if (!lane) throw new Error(`Unknown Academic session lane: ${laneId}`);
  return lane;
}

function laneFields(lane, date) {
  return { date, laneId: lane.id, laneLabel: lane.label, grade: lane.grade };
}

async function readTodayLaneStates(transaction, date, grade) {
  const refs = ACADEMIC_SESSION_LANES.filter(lane => lane.grade === grade).map(lane => ({
    lane,
    deckRef: doc(db, "deck", academicLaneDocId(lane.id, date)),
    sessionRef: doc(db, "academicSessions", academicLaneDocId(lane.id, date))
  }));
  const snapshots = await Promise.all(refs.flatMap(({ deckRef, sessionRef }) => [
    transaction.get(deckRef),
    transaction.get(sessionRef)
  ]));
  return refs.map((refsForLane, index) => {
    const deckSnap = snapshots[index * 2];
    const sessionSnap = snapshots[(index * 2) + 1];
    return {
      ...refsForLane,
      deckSnap,
      sessionSnap,
      deck: deckSnap.exists() ? deckSnap.data() : {},
      session: sessionSnap.exists() ? sessionSnap.data() : {}
    };
  });
}

function findStudentLaneConflict(states, studentId, targetLaneId) {
  return states.find(state => state.lane.id !== targetLaneId && (
    (state.deck.items || []).includes(studentId)
    || (state.session.status === "live" && (state.session.activeRoster || []).includes(studentId))
  ));
}

function throwLaneConflict(conflict, studentId) {
  const error = new Error(`Student is already in ${conflict.lane.label}.`);
  error.code = "academic/student-in-other-lane";
  error.studentId = studentId;
  error.laneId = conflict.lane.id;
  error.laneLabel = conflict.lane.label;
  throw error;
}

function removeStudentsFromLane(transaction, state, studentIds, staff = {}) {
  const ids = new Set(studentIds);
  if ((state.deck.items || []).some(studentId => ids.has(studentId))) {
    transaction.set(state.deckRef, {
      items: (state.deck.items || []).filter(id => !ids.has(id)),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  }
  if (state.sessionSnap.exists() && (state.session.activeRoster || []).some(studentId => ids.has(studentId))) {
    const outcomes = { ...(state.session.outcomes || {}) };
    studentIds.forEach(studentId => {
      outcomes[studentId] = {
        status: "removed",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
    });
    transaction.update(state.sessionRef, {
      activeRoster: (state.session.activeRoster || []).filter(id => !ids.has(id)),
      outcomes,
      lastUpdated: serverTimestamp()
    });
  }
}

function removeStudentFromLane(transaction, state, studentId, staff = {}) {
  removeStudentsFromLane(transaction, state, [studentId], staff);
}

// ------------------------------
// Deck (date + lane scoped)
// ------------------------------
export async function ensureTodayDeck(ownerUid, laneId) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const ref = doc(db, "deck", academicLaneDocId(lane.id, date));
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (snap.exists()) return;
    transaction.set(ref, {
      items: [],
      createdBy: ownerUid || null,
      ...laneFields(lane, date),
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  });
  return ref;
}

export async function addToDeck(studentId, ownerUid, laneId, { move = false, staff = {} } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    const conflict = findStudentLaneConflict(states, studentId, lane.id);
    if (conflict && !move) throwLaneConflict(conflict, studentId);
    if (conflict) removeStudentFromLane(transaction, conflict, studentId, staff);
    transaction.set(target.deckRef, {
      items: [...new Set([...(target.deck.items || []), studentId])],
      createdBy: target.deck.createdBy || ownerUid || null,
      ...laneFields(lane, date),
      createdAt: target.deck.createdAt || serverTimestamp(),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function removeFromDeck(studentId, ownerUid, laneId) {
  const ref = await ensureTodayDeck(ownerUid, laneId);
  await updateDoc(ref, { items: arrayRemove(studentId), lastUpdated: serverTimestamp() });
}

// ------------------------------
// One shared Academic session per lane, per school day
// ------------------------------
export function listenTodayAcademicSession(laneId, cb, onError) {
  return onSnapshot(doc(db, "academicSessions", academicLaneDocId(laneId)), snap => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

export async function startTodayAcademicSession({ hostUid, hostName, roster = [], laneId, moveConflicts = false }) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    const conflicts = roster.map(studentId => ({
      studentId,
      state: findStudentLaneConflict(states, studentId, lane.id)
    })).filter(item => item.state);
    if (conflicts.length && !moveConflicts) throwLaneConflict(conflicts[0].state, conflicts[0].studentId);
    states.forEach(state => {
      const studentIds = conflicts.filter(conflict => conflict.state.lane.id === state.lane.id).map(conflict => conflict.studentId);
      if (studentIds.length) removeStudentsFromLane(transaction, state, studentIds, { uid: hostUid, name: hostName });
    });
    const current = target.session;
    const fullRoster = [...new Set([...(current.roster || []), ...roster])];
    const outcomes = { ...(current.outcomes || {}) };
    roster.forEach(studentId => {
      outcomes[studentId] = { status: "selected", updatedByUid: hostUid || null, updatedByName: hostName || null, updatedAt: Timestamp.now() };
    });
    transaction.set(target.sessionRef, {
      ...laneFields(lane, date),
      status: "live",
      hostUid: hostUid || null,
      hostName: hostName || null,
      startedAt: serverTimestamp(),
      endedAt: null,
      endedByUid: null,
      endedByName: null,
      roster: fullRoster,
      activeRoster: [...roster],
      outcomes,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function addStudentToTodayAcademicSession(studentId, staff = {}, laneId, { move = false } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    const conflict = findStudentLaneConflict(states, studentId, lane.id);
    if (conflict && !move) throwLaneConflict(conflict, studentId);
    if (conflict) removeStudentFromLane(transaction, conflict, studentId, staff);
    const outcomes = { ...(target.session.outcomes || {}) };
    outcomes[studentId] = {
      status: "selected",
      updatedByUid: staff.uid || null,
      updatedByName: staff.name || null,
      updatedAt: Timestamp.now()
    };
    transaction.set(target.deckRef, {
      items: [...new Set([...(target.deck.items || []), studentId])],
      createdBy: target.deck.createdBy || staff.uid || null,
      ...laneFields(lane, date),
      createdAt: target.deck.createdAt || serverTimestamp(),
      lastUpdated: serverTimestamp()
    }, { merge: true });
    transaction.set(target.sessionRef, {
      ...laneFields(lane, date),
      roster: [...new Set([...(target.session.roster || []), studentId])],
      activeRoster: [...new Set([...(target.session.activeRoster || []), studentId])],
      outcomes,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function recordTodayAcademicSessionOutcome(studentId, status, staff = {}, laneId) {
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(laneId));
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(sessionRef);
    if (!snap.exists()) return;
    const session = snap.data();
    const outcomes = { ...(session.outcomes || {}) };
    outcomes[studentId] = {
      status,
      updatedByUid: staff.uid || null,
      updatedByName: staff.name || null,
      updatedAt: Timestamp.now()
    };
    transaction.update(sessionRef, { outcomes, lastUpdated: serverTimestamp() });
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "sessionOutcomeRecorded",
      actor: staff,
      summary: `Academic session outcome recorded: ${status}`,
      sourceCollection: "academicSessions",
      sourceId: sessionRef.id,
      details: { status, laneId, date: session.date || todayKey() }
    }));
  });
}

export async function removeStudentFromTodayAcademicSession(studentId, staff = {}, laneId) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));
  const deckRef = doc(db, "deck", academicLaneDocId(lane.id, date));
  await runTransaction(db, async transaction => {
    const [sessionSnap, deckSnap] = await Promise.all([transaction.get(sessionRef), transaction.get(deckRef)]);
    const session = sessionSnap.exists() ? sessionSnap.data() : {};
    const deck = deckSnap.exists() ? deckSnap.data() : {};
    const outcomes = { ...(session.outcomes || {}) };
    outcomes[studentId] = {
      status: "removed",
      updatedByUid: staff.uid || null,
      updatedByName: staff.name || null,
      updatedAt: Timestamp.now()
    };
    transaction.set(deckRef, { items: (deck.items || []).filter(id => id !== studentId), lastUpdated: serverTimestamp() }, { merge: true });
    if (sessionSnap.exists()) transaction.update(sessionRef, {
      activeRoster: (session.activeRoster || []).filter(id => id !== studentId), outcomes, lastUpdated: serverTimestamp()
    });
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "sessionOutcomeRecorded",
      actor: staff,
      summary: "Removed from academic session",
      sourceCollection: "academicSessions",
      sourceId: sessionRef.id,
      details: { status: "removed", laneId: lane.id, date }
    }));
  });
}

export async function endTodayAcademicSession({ staff = {}, unmarkedStudentIds = [], laneId } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));
  const deckRef = doc(db, "deck", academicLaneDocId(lane.id, date));
  await runTransaction(db, async transaction => {
    const [sessionSnap, deckSnap] = await Promise.all([transaction.get(sessionRef), transaction.get(deckRef)]);
    const session = sessionSnap.exists() ? sessionSnap.data() : {};
    const outcomes = { ...(session.outcomes || {}) };
    unmarkedStudentIds.forEach(studentId => {
      outcomes[studentId] = { status: "no_show", updatedByUid: staff.uid || null, updatedByName: staff.name || null, updatedAt: Timestamp.now() };
    });
    if (sessionSnap.exists()) transaction.update(sessionRef, {
      status: "ended", activeRoster: [], outcomes, endedAt: serverTimestamp(),
      endedByUid: staff.uid || null, endedByName: staff.name || null, lastUpdated: serverTimestamp()
    });
    if (deckSnap.exists()) transaction.update(deckRef, { items: [], lastUpdated: serverTimestamp() });
  });
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
