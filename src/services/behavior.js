import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  where
} from "firebase/firestore";
import {
  canOverrideBehaviorThreshold,
  canUseBehavior,
  canViewStudent,
  getAllowedGradeLevels
} from "../utils/access";
import { studentRecordEvent, studentRecordEventRef } from "./studentRecordEvents";

import { behaviorSchoolYear, behaviorSummary } from "../utils/behaviorRecords.js";
import { cancelBehaviorReteach as cancelReteach } from "./behaviorCancellation.js";
export { behaviorSchoolYear } from "../utils/behaviorRecords.js";

export function cancelBehaviorReteach(recordId, details, staff) {
  return cancelReteach(db, recordId, details, staff);
}

export const BEHAVIOR_THRESHOLD = 6;

export const HOME_CONTACT_METHODS = ["Phone Call", "Text Message", "Email", "In Person", "Other"];

export const LOCATION_OPTIONS = [
  "Classroom",
  "Hallway",
  "Outside",
  "Cafeteria",
  "Restroom",
  "Gym",
  "Library",
  "Bus area",
  "Other"
];

export const BEHAVIOR_CATEGORY_OPTIONS = [
  "Disruption",
  "Off-Task Behavior",
  "Failure to Follow Directions",
  "Disrespectful Communication",
  "Inappropriate Language",
  "Peer Conflict",
  "Physical Contact or Horseplay",
  "Unsafe Behavior",
  "Technology Misuse",
  "Materials or Property Misuse",
  "Out of Assigned Area",
  "Routine or Procedure Violation",
  "Other"
];

export function normalizeStudent(student) {
  return {
    ...student,
    displayName: student.displayName || student.studentName || student.name || "Unnamed student",
    grade: student.grade == null ? "" : String(student.grade),
    homeroom: student.homeroom || student.homeRoom || ""
  };
}

function sortByName(a, b) {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

function sortByCreatedAtDesc(a, b) {
  const aMillis = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
  const bMillis = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
  return bMillis - aMillis;
}

function isPermissionDenied(err) {
  return err?.code === "permission-denied" || /missing or insufficient permissions/i.test(err?.message || "");
}

export function listenBehaviorStudents(profile, onRows, onError) {
  const allowedGrades = getAllowedGradeLevels(profile);
  const canViewAll = canOverrideBehaviorThreshold(profile);
  if (!canViewAll && !allowedGrades.length) {
    onRows([]);
    return () => {};
  }
  const studentQuery = canViewAll
    ? collection(db, "students")
    : query(collection(db, "students"), where("grade", "in", allowedGrades.slice(0, 30)));
  return onSnapshot(
    studentQuery,
    (snap) => {
      const rows = snap.docs
        .map((studentDoc) => normalizeStudent({ id: studentDoc.id, ...studentDoc.data() }))
        .filter((student) => canViewAll || canViewStudent(profile, student))
        .sort(sortByName);
      onRows(rows);
    },
    onError
  );
}

export function listenBehaviorAssignmentStudents(profile, onRows, onError) {
  if (!canUseBehavior(profile)) {
    onRows([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "students"),
    (snap) => {
      const rows = snap.docs
        .map((studentDoc) => normalizeStudent({ id: studentDoc.id, ...studentDoc.data() }))
        .filter((student) => student.archived !== true && student.active !== false)
        .sort(sortByName);
      onRows(rows);
    },
    onError
  );
}

export async function getBehaviorServedCount(studentId) {
  if (!studentId) return { served: 0, buybacks: 0, adjusted: 0, servedRecords: [], buybackRecords: [] };

  let snap;
  let buybackSnap;
  try {
    [snap, buybackSnap] = await Promise.all([
      getDocs(query(collection(db, "behaviorReteachSummaries"), where("studentId", "==", studentId))),
      getDocs(query(collection(db, "behaviorBuybacks"), where("studentId", "==", studentId)))
    ]);
  } catch (err) {
    if (isPermissionDenied(err)) {
      throw new Error("Behavior history is unavailable for this student.");
    }
    throw err;
  }
  const currentSchoolYear = behaviorSchoolYear();
  const currentRecords = snap.docs.filter((recordDoc) => {
    const record = recordDoc.data();
    return behaviorSchoolYear(record.reteachDate || record.createdAt) === currentSchoolYear;
  });
  const servedRecords = currentRecords
    .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
    .filter((record) => record.status === "served")
    .sort((a, b) => {
      const aDate = a.reteachDate || a.servedAt?.toMillis?.() || a.servedAt?.seconds || "";
      const bDate = b.reteachDate || b.servedAt?.toMillis?.() || b.servedAt?.seconds || "";
      return String(aDate).localeCompare(String(bDate));
    });
  const served = servedRecords.length;
  const pending = currentRecords.filter((recordDoc) => recordDoc.data().status === "pending").length;
  const buybackRecords = buybackSnap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(record => (record.schoolYear || behaviorSchoolYear(record.buybackDate || record.recordedAt)) === currentSchoolYear)
    .sort((a, b) => dateValue(b.buybackDate || b.recordedAt) - dateValue(a.buybackDate || a.recordedAt));
  const safeBuybacks = buybackRecords.length;

  return {
    served,
    buybacks: safeBuybacks,
    adjusted: Math.max(0, served - safeBuybacks),
    pending,
    servedRecords,
    buybackRecords
  };
}

export async function recordBehaviorBuyback(student, staff) {
  const buybackDate = new Date().toLocaleDateString("en-CA");
  const buybackRef = doc(collection(db, "behaviorBuybacks"));
  const batch = writeBatch(db);
  batch.set(buybackRef, {
    studentId: student.id,
    studentName: student.displayName,
    grade: student.grade || "",
    homeroom: student.homeroom || "",
    buybackDate,
    schoolYear: behaviorSchoolYear(buybackDate),
    recordedByUid: staff.uid,
    recordedByName: staff.name,
    recordedAt: serverTimestamp()
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: student.id,
    domain: "behavior",
    eventType: "buybackRecorded",
    actor: staff,
    summary: "Recorded behavior buyback",
    sourceCollection: "behaviorBuybacks",
    sourceId: buybackRef.id,
    schoolYear: behaviorSchoolYear(buybackDate),
    details: { buybackDate },
    visibleToUids: [staff.uid]
  }));
  await batch.commit();
  return buybackRef;
}

export function listenPendingBehaviorReteaches(profile, onRows, onError) {
  const allowedGrades = getAllowedGradeLevels(profile);
  const canViewAll = canOverrideBehaviorThreshold(profile);
  if (!canViewAll && !allowedGrades.length) {
    onRows([]);
    return () => {};
  }
  const pendingQuery = canViewAll
    ? query(collection(db, "behaviorReteaches"), where("status", "==", "pending"))
    : query(
        collection(db, "behaviorReteachSummaries"),
        where("status", "==", "pending"),
        where("grade", "in", allowedGrades.slice(0, 30))
      );
  let snapshotGeneration = 0;
  return onSnapshot(
    pendingQuery,
    async (snap) => {
      const generation = ++snapshotGeneration;
      const summaries = snap.docs
        .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
        .filter((record) => canViewAll || allowedGrades.includes(String(record.grade || "")));

      if (canViewAll) {
        onRows(summaries.sort(sortByCreatedAtDesc));
        return;
      }

      try {
        const recordSnaps = await Promise.all(
          summaries.map((record) => getDoc(doc(db, "behaviorReteaches", record.id)))
        );
        if (generation !== snapshotGeneration) return;
        const rows = recordSnaps
          .filter((recordSnap) => recordSnap.exists() && recordSnap.data().status === "pending")
          .map((recordSnap) => ({ id: recordSnap.id, ...recordSnap.data() }))
          .sort(sortByCreatedAtDesc);
        onRows(rows);
      } catch (err) {
        if (generation === snapshotGeneration) onError?.(err);
      }
    },
    (err) => {
      if (isPermissionDenied(err)) {
        onError?.(new Error("The To Serve list could not be loaded for your assigned grades."));
        return;
      }
      onError?.(err);
    }
  );
}

export async function ensureBehaviorReteachSummaries() {
  const [recordsSnap, summariesSnap] = await Promise.all([
    getDocs(collection(db, "behaviorReteaches")),
    getDocs(collection(db, "behaviorReteachSummaries"))
  ]);
  const existing = new Set(summariesSnap.docs.map((item) => item.id));
  const missing = recordsSnap.docs.filter((item) => !existing.has(item.id));

  for (let start = 0; start < missing.length; start += 400) {
    const batch = writeBatch(db);
    missing.slice(start, start + 400).forEach((recordDoc) => {
      batch.set(doc(db, "behaviorReteachSummaries", recordDoc.id), behaviorSummary(recordDoc.data()));
    });
    await batch.commit();
  }

  return missing.length;
}

export function listenMyBehaviorReteaches(userId, onRows, onError) {
  if (!userId) {
    onRows([]);
    return () => {};
  }

  const myQuery = query(
    collection(db, "behaviorReteaches"),
    where("assignedByUid", "==", userId)
  );

  return onSnapshot(
    myQuery,
    (snap) => {
      const rows = snap.docs
        .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
        .sort(sortByCreatedAtDesc);
      onRows(rows);
    },
    (err) => {
      if (isPermissionDenied(err)) {
        onError?.(new Error("Your reteach statuses could not be loaded."));
        return;
      }
      onError?.(err);
    }
  );
}

export function listenMyHomeContactRequirements(userId, onRows, onError) {
  if (!userId) {
    onRows([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "behaviorHomeContactRequirements"), where("assignedByUid", "==", userId)),
    (snap) => onRows(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => dateValue(b.requiredAt) - dateValue(a.requiredAt))),
    onError
  );
}

export function listenAllHomeContactRequirements(onRows, onError) {
  return onSnapshot(
    collection(db, "behaviorHomeContactRequirements"),
    (snap) => onRows(snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => dateValue(b.requiredAt) - dateValue(a.requiredAt))),
    onError
  );
}

function dateValue(value) {
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value || 0));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export async function recordHomeContactAttempt(requirementId, details, staff) {
  if (!requirementId) throw new Error("Missing home contact requirement id.");
  const requirementRef = doc(db, "behaviorHomeContactRequirements", requirementId);
  const requirementSnap = await getDoc(requirementRef);
  if (!requirementSnap.exists()) throw new Error("Home contact requirement could not be found.");
  const requirement = requirementSnap.data();
  if (requirement.status !== "pending") throw new Error("This home contact is no longer pending.");
  const batch = writeBatch(db);
  batch.update(requirementRef, {
    status: "completed",
    contactedParty: String(details.contactedParty || "").trim(),
    method: details.method,
    attemptDate: details.attemptDate,
    successful: details.successful === true,
    note: String(details.note || "").trim(),
    recordedByUid: staff.uid,
    recordedByName: staff.name,
    recordedAt: serverTimestamp(),
    completedAt: serverTimestamp()
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: requirement.studentId,
    domain: "behavior",
    eventType: "homeContactRecorded",
    actor: staff,
    summary: `Home contact ${details.successful === true ? "completed" : "attempted"} by ${details.method}`,
    sourceCollection: "behaviorHomeContactRequirements",
    sourceId: requirementId,
    schoolYear: requirement.schoolYear || "",
    details: {
      contactedParty: String(details.contactedParty || "").trim(),
      method: details.method,
      attemptDate: details.attemptDate,
      successful: details.successful === true,
      note: String(details.note || "").trim()
    },
    visibleToUids: [requirement.assignedByUid, staff.uid]
  }));
  return batch.commit();
}

export async function createBehaviorReteach(payload, { allowPostThreshold = false } = {}) {
  const currentCount = await getBehaviorServedCount(payload.studentId);
  const postThreshold = currentCount.adjusted >= BEHAVIOR_THRESHOLD;

  if (postThreshold && !allowPostThreshold) {
    throw new Error("This student has reached the six-reteach threshold. No additional reteach can be added.");
  }
  if (postThreshold && !payload.thresholdAcknowledged) {
    throw new Error("Acknowledge the escalation threshold before adding this reteach.");
  }

  const now = serverTimestamp();
  const recordRef = doc(collection(db, "behaviorReteaches"));
  const schoolYear = behaviorSchoolYear(payload.reteachDate);
  const milestoneRef = doc(db, "behaviorHomeContactMilestones", `${payload.studentId}_${schoolYear}`);
  const requirementRef = doc(db, "behaviorHomeContactRequirements", recordRef.id);
  const baseAssignmentCount = currentCount.adjusted + currentCount.pending;
  let homeContactRequired = false;

  await runTransaction(db, async (transaction) => {
    const milestoneSnap = await transaction.get(milestoneRef);
    const milestone = milestoneSnap.exists() ? milestoneSnap.data() : null;
    const priorAssignmentCount = milestone
      ? Number(milestone.assignmentCount) || 0
      : baseAssignmentCount;
    const alreadyReached = milestone
      ? milestone.thirdReteachReached === true
      : baseAssignmentCount >= 3;
    const nextAssignmentCount = priorAssignmentCount + 1;
    homeContactRequired = !alreadyReached && nextAssignmentCount >= 3;

    const record = {
    studentId: payload.studentId,
    studentName: payload.studentName,
    grade: payload.grade || "",
    homeroom: payload.homeroom || "",
    assignedByUid: payload.assignedByUid,
    assignedByName: payload.assignedByName,
    reteachDate: payload.reteachDate,
    note: payload.note,
    location: payload.location,
    context: payload.context,
    schoolYear,
    homeContactRequired,
    postThreshold,
    thresholdAcknowledged: postThreshold && Boolean(payload.thresholdAcknowledged),
    thresholdAcknowledgedAt: postThreshold && payload.thresholdAcknowledged ? now : null,
    servedCountAtAssignment: currentCount.adjusted,
    status: "pending",
    createdAt: now,
    servedAt: null,
    servedByUid: null,
    servedByName: null,
    servedPostThreshold: false
    };

    const milestoneUpdate = {
      studentId: payload.studentId,
      schoolYear,
      assignmentCount: nextAssignmentCount,
      thirdReteachReached: alreadyReached || homeContactRequired,
      lastReteachId: recordRef.id,
      updatedAt: now
    };
    if (!milestoneSnap.exists()) {
      milestoneUpdate.createdAt = now;
      milestoneUpdate.grandfathered = alreadyReached;
    }
    if (homeContactRequired) {
      milestoneUpdate.grandfathered = false;
      milestoneUpdate.reachedAt = now;
      milestoneUpdate.triggeringReteachId = recordRef.id;
    }

    transaction.set(milestoneRef, milestoneUpdate, { merge: true });
    transaction.set(recordRef, record);
    transaction.set(doc(db, "behaviorReteachSummaries", recordRef.id), behaviorSummary(record));
    if (homeContactRequired) {
      transaction.set(requirementRef, {
        reteachId: recordRef.id,
        studentId: payload.studentId,
        studentName: payload.studentName,
        grade: payload.grade || "",
        homeroom: payload.homeroom || "",
        assignedByUid: payload.assignedByUid,
        assignedByName: payload.assignedByName,
        reteachDate: payload.reteachDate,
        schoolYear,
        status: "pending",
        requiredAt: now,
        contactedParty: "",
        method: "",
        attemptDate: "",
        successful: null,
        note: "",
        recordedByUid: null,
        recordedByName: null,
        recordedAt: null,
        completedAt: null
      });
    }
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId: payload.studentId,
      domain: "behavior",
      eventType: "reteachAssigned",
      actor: { uid: payload.assignedByUid, name: payload.assignedByName },
      summary: `Assigned behavior reteach: ${payload.context}`,
      sourceCollection: "behaviorReteaches",
      sourceId: recordRef.id,
      schoolYear,
      details: {
        reteachDate: payload.reteachDate,
        location: payload.location,
        context: payload.context,
        postThreshold,
        thresholdAcknowledged: postThreshold && Boolean(payload.thresholdAcknowledged)
      },
      visibleToUids: [payload.assignedByUid]
    }));
  });

  return { ref: recordRef, homeContactRequired };
}

export async function markBehaviorReteachServed(recordId, servedBy) {
  if (!recordId) throw new Error("Missing behavior reteach id.");

  const recordRef = doc(db, "behaviorReteaches", recordId);
  const recordSnap = await getDoc(recordRef);
  if (!recordSnap.exists()) throw new Error("Behavior reteach could not be found.");
  if (recordSnap.data().status !== "pending") throw new Error("This reteach is no longer pending.");
  const servedAt = serverTimestamp();
  const updates = {
    status: "served",
    servedAt,
    servedByUid: servedBy.uid,
    servedByName: servedBy.name,
    servedPostThreshold: Boolean(servedBy.servedPostThreshold)
  };
  const batch = writeBatch(db);
  batch.update(recordRef, updates);
  batch.set(
    doc(db, "behaviorReteachSummaries", recordId),
    behaviorSummary({ ...recordSnap.data(), ...updates }),
    { merge: true }
  );
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: recordSnap.data().studentId,
    domain: "behavior",
    eventType: "reteachServed",
    actor: servedBy,
    summary: `Marked behavior reteach served: ${recordSnap.data().context || "Reteach"}`,
    sourceCollection: "behaviorReteaches",
    sourceId: recordId,
    schoolYear: recordSnap.data().schoolYear || behaviorSchoolYear(recordSnap.data().reteachDate),
    details: { previousStatus: recordSnap.data().status || "pending", nextStatus: "served", servedPostThreshold: Boolean(servedBy.servedPostThreshold) },
    visibleToUids: [recordSnap.data().assignedByUid, servedBy.uid]
  }));
  return batch.commit();
}

export async function restoreBehaviorReteachPending(recordId, restoredBy = {}) {
  if (!recordId) throw new Error("Missing behavior reteach id.");

  const recordRef = doc(db, "behaviorReteaches", recordId);
  const recordSnap = await getDoc(recordRef);
  if (!recordSnap.exists()) throw new Error("Behavior reteach could not be found.");
  if (recordSnap.data().status !== "served") throw new Error("Only a served reteach can be returned to pending.");
  const updates = {
    status: "pending",
    servedAt: null,
    servedByUid: null,
    servedByName: null,
    servedPostThreshold: false
  };
  const batch = writeBatch(db);
  batch.update(recordRef, updates);
  batch.set(
    doc(db, "behaviorReteachSummaries", recordId),
    behaviorSummary({ ...recordSnap.data(), ...updates }),
    { merge: true }
  );
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId: recordSnap.data().studentId,
    domain: "behavior",
    eventType: "reteachRestoredPending",
    actor: restoredBy,
    summary: `Restored behavior reteach to pending: ${recordSnap.data().context || "Reteach"}`,
    sourceCollection: "behaviorReteaches",
    sourceId: recordId,
    schoolYear: recordSnap.data().schoolYear || behaviorSchoolYear(recordSnap.data().reteachDate),
    details: {
      previousStatus: recordSnap.data().status || "served",
      nextStatus: "pending",
      priorServedAt: recordSnap.data().servedAt || null,
      priorServedByUid: recordSnap.data().servedByUid || null,
      priorServedByName: recordSnap.data().servedByName || null,
      priorServedPostThreshold: Boolean(recordSnap.data().servedPostThreshold)
    },
    visibleToUids: [recordSnap.data().assignedByUid, restoredBy.uid]
  }));
  return batch.commit();
}
