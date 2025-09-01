import { db } from "../firebaseConfig";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

export function planRef(uid, dateKey) {
  return doc(db, "teachers", uid, "dailyPlans", dateKey);
}

export async function getDailyPlan(uid, dateKey) {
  const snap = await getDoc(planRef(uid, dateKey));
  return snap.exists() ? snap.data() : null;
}

export async function initDailyPlan(uid, dateKey, base) {
  await setDoc(planRef(uid, dateKey), base, { merge: true });
}

export async function updateDailyPlan(uid, dateKey, updates) {
  await updateDoc(planRef(uid, dateKey), updates);
}

export async function updatePrepDone(uid, dateKey, prepId, updated) {
  await updateDoc(planRef(uid, dateKey), { [`preps.${prepId}.prepDone`]: updated });
}

export async function updateSeqDone(uid, dateKey, prepId, updated) {
  await updateDoc(planRef(uid, dateKey), { [`preps.${prepId}.seqDone`]: updated });
}

export async function savePrepNames(uid, preps) {
  await setDoc(doc(db, "teachers", uid), { prepNames: preps }, { merge: true });
}
