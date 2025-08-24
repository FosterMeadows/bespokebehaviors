// src/services/plans.js
import { db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

export function planRef(uid, dateKey) {
  return doc(db, "teachers", uid, "dailyPlans", dateKey);
}

/**
 * PURE READ. Never writes.
 * Returns { id, ...data } or null.
 */
export async function getDailyPlan(uid, dateKey) {
  const snap = await getDoc(planRef(uid, dateKey));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create a brand‑new plan document. No merge. Caller supplies payload.
 * We add createdAt/updatedAt/rev.
 */
export async function initDailyPlan(uid, dateKey, payload) {
  await setDoc(
    planRef(uid, dateKey),
    {
      ...payload,            // e.g. { dateKey, date, weekday, preps: {...} }
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      rev: 1,
    },
    { merge: false }
  );
}

/**
 * Transactional update that bumps rev and touches updatedAt.
 * Pass only the fields you intend to change (no isPublic/weekday magic).
 */
export async function updateDailyPlan(uid, dateKey, updates) {
  const ref = planRef(uid, dateKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("updateDailyPlan: document does not exist");
    }
    const current = snap.data();
    const currentRev = typeof current.rev === "number" ? current.rev : 0;
    tx.update(ref, {
      ...updates,
      rev: currentRev + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Toggle helpers for done-arrays, wrapped in the same transactional bump.
 */
export async function updatePrepDone(uid, dateKey, prepId, doneArray) {
  await updateDailyPlan(uid, dateKey, {
    [`preps.${prepId}.prepDone`]: doneArray,
  });
}

export async function updateSeqDone(uid, dateKey, prepId, doneArray) {
  await updateDailyPlan(uid, dateKey, {
    [`preps.${prepId}.seqDone`]: doneArray,
  });
}

/**
 * Store per‑teacher prep slot names (used by the share page to label preps).
 */
export async function savePrepNames(uid, preps) {
  await setDoc(doc(db, "teachers", uid), { prepNames: preps }, { merge: true });
}
