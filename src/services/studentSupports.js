import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const CONTEXTS = ["Used", "Offered", "Refused", "Not needed", "General observation"];

function cleanText(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function localId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function timestampValue(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  return value instanceof Date ? value.getTime() : 0;
}

function supportCollection(ownerUid) {
  return collection(db, "teacherCommandCenters", ownerUid, "studentSupports");
}

function supportDocument(ownerUid, studentId) {
  return doc(db, "teacherCommandCenters", ownerUid, "studentSupports", studentId);
}

function cleanNote(note) {
  const context = CONTEXTS.includes(note?.context) ? note.context : "General observation";
  return {
    id: cleanText(note?.id, 120) || localId("note"),
    date: cleanText(note?.date, 10),
    context,
    details: cleanText(note?.details, 2000),
    createdAtMs: Number(note?.createdAtMs) || Date.now(),
  };
}

function cleanAccommodation(accommodation) {
  return {
    id: cleanText(accommodation?.id, 120) || localId("accommodation"),
    text: cleanText(accommodation?.text, 1000),
    notes: (Array.isArray(accommodation?.notes) ? accommodation.notes : [])
      .map(cleanNote)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAtMs - a.createdAtMs),
  };
}

export function normalizeSupportStudent(row) {
  return {
    id: cleanText(row?.id, 120),
    name: cleanText(row?.name, 240),
    classPeriod: cleanText(row?.classPeriod, 120),
    accommodations: (Array.isArray(row?.accommodations) ? row.accommodations : [])
      .map(cleanAccommodation)
      .filter((item) => item.text),
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null,
  };
}

export function listenSupportStudents(ownerUid, onRows, onError) {
  if (!ownerUid) {
    onRows([]);
    return () => {};
  }
  return onSnapshot(supportCollection(ownerUid), (snapshot) => {
    const rows = snapshot.docs.map((item) => normalizeSupportStudent({ id: item.id, ...item.data() }));
    rows.sort((a, b) => a.classPeriod.localeCompare(b.classPeriod, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    onRows(rows);
  }, onError);
}

export async function createSupportStudent(ownerUid, { name, classPeriod }) {
  if (!ownerUid) throw new Error("An owner account is required.");
  const cleanedName = cleanText(name, 240);
  if (!cleanedName) throw new Error("Enter a student name.");
  const reference = await addDoc(supportCollection(ownerUid), {
    schemaVersion: 1,
    name: cleanedName,
    classPeriod: cleanText(classPeriod, 120),
    accommodations: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: ownerUid,
    updatedByUid: ownerUid,
  });
  return reference.id;
}

export async function updateSupportStudent(ownerUid, studentId, changes) {
  if (!ownerUid || !studentId) throw new Error("A student record is required.");
  const payload = { updatedAt: serverTimestamp(), updatedByUid: ownerUid };
  if (Object.hasOwn(changes, "name")) payload.name = cleanText(changes.name, 240);
  if (Object.hasOwn(changes, "classPeriod")) payload.classPeriod = cleanText(changes.classPeriod, 120);
  if (Object.hasOwn(changes, "accommodations")) {
    payload.accommodations = (Array.isArray(changes.accommodations) ? changes.accommodations : [])
      .map(cleanAccommodation)
      .filter((item) => item.text);
  }
  await updateDoc(supportDocument(ownerUid, studentId), payload);
}

export async function deleteSupportStudent(ownerUid, studentId) {
  if (!ownerUid || !studentId) throw new Error("A student record is required.");
  await deleteDoc(supportDocument(ownerUid, studentId));
}

export function newAccommodation(text) {
  return cleanAccommodation({ text, notes: [] });
}

export function newAccommodationNote({ date, context, details }) {
  return cleanNote({ date, context, details });
}

export { CONTEXTS as SUPPORT_NOTE_CONTEXTS, timestampValue };
