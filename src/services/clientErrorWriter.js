import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig.jsx";

export async function writeClientError(payload) {
  if (auth.currentUser?.uid !== payload.userUid) return;
  await addDoc(collection(db, "clientErrors"), {
    ...payload,
    occurredAt: serverTimestamp()
  });
}
