import {
  serverTimestamp,
  addDoc,
  collection,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDocs,
  runTransaction
} from "firebase/firestore";
import {
  db
} from "../../firebaseConfig";

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
