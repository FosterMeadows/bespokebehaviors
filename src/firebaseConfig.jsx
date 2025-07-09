// src/firebaseConfig.js
// ——————————————————————————————————————————————
// 1) Import what you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// (leave analytics out for now unless you actually use it)

// 2) Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBQeW8KSNN2OjN6LXe1fz_Rj51dZq0uAww",
  authDomain: "bespokebehaviors.firebaseapp.com",
  projectId: "bespokebehaviors",
  storageBucket: "bespokebehaviors.appspot.com",   // note the “appspot.com” domain
  messagingSenderId: "291062632545",
  appId: "1:291062632545:web:cc8550e8e88b7d2eec1a20",
  measurementId: "G-8KMFZT5LMK"
};

// 3) Initialize Firebase App
const app = initializeApp(firebaseConfig);

// 4) Create & export the pieces you need
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db       = getFirestore(app);
