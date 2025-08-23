// src/services/sharing.js
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export async function enableSharing(uid) {
  const tRef = doc(db, "teachers", uid);
  const snap = await getDoc(tRef);
  if (!snap.exists()) throw new Error("Teacher doc missing");

  let { shareToken } = snap.data();
  if (!shareToken) {
    // If you stored "" in the console, treat that as missing
    shareToken = crypto.randomUUID();
    await updateDoc(tRef, { shareToken });
  }
  await updateDoc(tRef, { shareEnabled: true });
  return `${location.origin}/share/${shareToken}`;
}

export async function disableSharing(uid) {
  const tRef = doc(db, "teachers", uid);
  await updateDoc(tRef, { shareEnabled: false });
}
