import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { validateWin } from "../utils/planner.js";

const root = (uid) => ["teacherCommandCenters", uid];
export function listenPlannerRows(uid, name, onRows, onError) {
  if (!uid) return () => {};
  return onSnapshot(collection(db, ...root(uid), name), (snapshot) => onRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
}
export function listenPlannerSelection(uid, onValue, onError) {
  if (!uid) return () => {};
  return onSnapshot(doc(db, ...root(uid), "plannerSettings", "selection"), (snapshot) => onValue(snapshot.data() || {}), onError);
}
export function selectPlannerSequence(uid, sequenceId) {
  return setDoc(doc(db, ...root(uid), "plannerSettings", "selection"), { sequenceId });
}
export function saveElaWeekDays(uid, week, days) {
  return setDoc(doc(db, ...root(uid), "elaWeeks", week), {
    week,
    days,
    updatedAt: serverTimestamp(),
  });
}
export function saveWin(uid, win, completing = false) {
  const error = validateWin(win, completing || win.status === "complete");
  if (error) throw new Error(error);
  const { id: _id, ...data } = win;
  return setDoc(doc(db, ...root(uid), "winWeeks", win.week), {
    ...data, skills: win.skills.map((skill) => ({ name: skill.name.trim(), code: skill.code.toUpperCase() })),
    status: completing ? "complete" : win.status,
    ...(completing && win.status !== "complete" ? { completedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });
}
export function addPlannerTask(uid, date, text) {
  return addDoc(collection(db, ...root(uid), "plannerTasks"), { date, text: text.trim(), done: false, order: Date.now() });
}
export function updatePlannerTask(uid, id, changes) { return updateDoc(doc(db, ...root(uid), "plannerTasks", id), changes); }
export function removePlannerTask(uid, id) { return deleteDoc(doc(db, ...root(uid), "plannerTasks", id)); }
export function saveInstructionReport(uid, report) {
  return addDoc(collection(db, ...root(uid), "instructionReports"), { ...report, createdAt: serverTimestamp() });
}
