import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig.jsx";

export async function ensureTeacherProfile(user, isCurrent) {
  const ref = doc(db, "teachers", user.uid);
  const snap = await getDoc(ref);
  if (!isCurrent()) return null;
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || user.email || "Teacher",
      contactEmail: user.email || ""
    });
  }
  return isCurrent() ? ref : null;
}

export function listenTeacherProfile(ref, onProfile, onError) {
  return onSnapshot(ref, onProfile, onError);
}
