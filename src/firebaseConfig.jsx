import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { app, qaEmulatorMode } from "./firebaseAuth.js";

export { auth, provider, qaEmulatorMode } from "./firebaseAuth.js";
export const db = getFirestore(app);

if (qaEmulatorMode && !globalThis.__CHECKPOINT_QA_FIRESTORE_CONNECTED__) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__CHECKPOINT_QA_FIRESTORE_CONNECTED__ = true;
}
