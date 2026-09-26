import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { app, qaEmulatorMode } from "./firebaseAuth.js";

export const analysisFunctions = getFunctions(app, "us-central1");

if (qaEmulatorMode && !globalThis.__CHECKPOINT_QA_FUNCTIONS_CONNECTED__) {
  connectFunctionsEmulator(analysisFunctions, "127.0.0.1", 5001);
  globalThis.__CHECKPOINT_QA_FUNCTIONS_CONNECTED__ = true;
}
