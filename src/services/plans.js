// src/services/plans.js
import { db } from "../firebaseConfig";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

export function planRef(uid, dateKey) {
  return doc(db, "teachers", uid, "dailyPlans", dateKey);
}

export async function getDailyPlan(uid, dateKey) {
  const snap = await getDoc(planRef(uid, dateKey));
  return snap.exists() ? snap.data() : null;
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