import { db } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { canViewStudent, getAllowedGradeLevels, isSchoolwide } from "../utils/access";

export const BEHAVIOR_THRESHOLD = 6;

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

export const CONTEXT_OPTIONS = [
  "Off-task behavior",
  "Materials",
  "Technology use",
  "Side conversations",
  "Procedures",
  "Respectful participation",
  "Transition",
  "Independent work",
  "Group work",
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
  if (!isSchoolwide(profile) && !allowedGrades.length) {
    onRows([]);
    return () => {};
  }
  const studentQuery = isSchoolwide(profile)
    ? collection(db, "students")
    : query(collection(db, "students"), where("grade", "in", allowedGrades.slice(0, 30)));
  return onSnapshot(
    studentQuery,
    (snap) => {
      const rows = snap.docs
        .map((studentDoc) => normalizeStudent({ id: studentDoc.id, ...studentDoc.data() }))
        .filter((student) => canViewStudent(profile, student))
        .sort(sortByName);
      onRows(rows);
    },
    onError
  );
}

export async function getBehaviorServedCount(studentId, buybacks = 0) {
  if (!studentId) return { served: 0, buybacks: 0, adjusted: 0, servedRecords: [] };

  let snap;
  try {
    snap = await getDocs(
      query(collection(db, "behaviorReteaches"), where("studentId", "==", studentId))
    );
  } catch (err) {
    if (isPermissionDenied(err)) {
      throw new Error("Behavior history is unavailable for this student.");
    }
    throw err;
  }
  const servedRecords = snap.docs
    .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
    .filter((record) => record.status === "served")
    .sort((a, b) => {
      const aDate = a.reteachDate || a.servedAt?.toMillis?.() || a.servedAt?.seconds || "";
      const bDate = b.reteachDate || b.servedAt?.toMillis?.() || b.servedAt?.seconds || "";
      return String(aDate).localeCompare(String(bDate));
    });
  const served = servedRecords.length;
  const safeBuybacks = Math.max(0, Number(buybacks) || 0);

  return {
    served,
    buybacks: safeBuybacks,
    adjusted: Math.max(0, served - safeBuybacks),
    servedRecords
  };
}

export function listenPendingBehaviorReteaches(profile, onRows, onError) {
  const allowedGrades = getAllowedGradeLevels(profile);
  if (!isSchoolwide(profile) && !allowedGrades.length) {
    onRows([]);
    return () => {};
  }
  const pendingQuery = isSchoolwide(profile)
    ? query(collection(db, "behaviorReteaches"), where("status", "==", "pending"))
    : query(
        collection(db, "behaviorReteaches"),
        where("status", "==", "pending"),
        where("grade", "in", allowedGrades.slice(0, 30))
      );
  return onSnapshot(
    pendingQuery,
    (snap) => {
      const rows = snap.docs
        .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
        .filter((record) => {
          if (isSchoolwide(profile)) return true;
          return allowedGrades.includes(String(record.grade || ""));
        })
        .sort(sortByCreatedAtDesc);
      onRows(rows);
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

export async function createBehaviorReteach(payload) {
  const now = serverTimestamp();
  return addDoc(collection(db, "behaviorReteaches"), {
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
    status: "pending",
    createdAt: now,
    servedAt: null,
    servedByUid: null,
    servedByName: null
  });
}

export async function markBehaviorReteachServed(recordId, servedBy) {
  if (!recordId) throw new Error("Missing behavior reteach id.");

  return updateDoc(doc(db, "behaviorReteaches", recordId), {
    status: "served",
    servedAt: serverTimestamp(),
    servedByUid: servedBy.uid,
    servedByName: servedBy.name
  });
}

export async function restoreBehaviorReteachPending(recordId) {
  if (!recordId) throw new Error("Missing behavior reteach id.");

  return updateDoc(doc(db, "behaviorReteaches", recordId), {
    status: "pending",
    servedAt: null,
    servedByUid: null,
    servedByName: null
  });
}
