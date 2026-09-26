// Authentication initializes independently of database and analysis services.
// ——————————————————————————————————————————————
// 1) Import what you need
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
// (leave analytics out for now unless you actually use it)

// 2) Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBQeW8KSNN2OjN6LXe1fz_Rj51dZq0uAww",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "bespokebehaviors.firebaseapp.com",
  projectId: "bespokebehaviors",
  storageBucket: "bespokebehaviors.appspot.com",   // note the “appspot.com” domain
  messagingSenderId: "291062632545",
  appId: "1:291062632545:web:cc8550e8e88b7d2eec1a20",
  measurementId: "G-8KMFZT5LMK"
};

// 3) Initialize Firebase App
export const app = initializeApp(firebaseConfig);

window.__FIREBASE_OPTIONS__ = app.options;

// 4) Create & export the pieces you need
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account",
  hd: "bcswv.org"
});

export const qaEmulatorMode = import.meta.env.DEV
  && import.meta.env.VITE_QA_EMULATORS === "true";

if (qaEmulatorMode && !globalThis.__CHECKPOINT_QA_AUTH_CONNECTED__) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  globalThis.__CHECKPOINT_QA_AUTH_CONNECTED__ = true;
}
