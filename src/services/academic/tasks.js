import {
  doc,
  getDoc,
  collection,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  onSnapshot,
  orderBy,
  addDoc
} from "firebase/firestore";
import {
  db
} from "../../firebaseConfig";
import {
  studentRecordEventRef,
  studentRecordEvent
} from "../studentRecordEvents";
import {
  formatAcademicStatus
} from "../../utils/academicPresentation";
import {
  canUseAcademic,
  getAllowedGradeLevels,
  isSchoolwide,
  canViewStudent
} from "../../utils/access";
import {
  academicTaskDocId
} from "../../utils/academicTaskIdentity";

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
      summary: `${d.data().title || "Academic assignment"}: Removed when student was removed`,
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
 * - newState: one of "not_started" | "in_progress" (legacy "needs_to_finish" is still accepted)
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
    summary: `${task.title || "Academic assignment"}: ${formatAcademicStatus(task.state || "not_started")} to ${formatAcademicStatus(newState)}`,
    sourceCollection: "tasks",
    sourceId: taskId,
    details: { previousState: task.state || null, nextState: newState }
  }));
  await batch.commit();
}

// ------------------------------
// Tasks
// ------------------------------
export const MAX_TASK_BATCH_SIZE = 7;

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
    summary: `${task.title || "Academic assignment"}: ${formatAcademicStatus(task.state || "not_started")} to ${formatAcademicStatus(state)}`,
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
