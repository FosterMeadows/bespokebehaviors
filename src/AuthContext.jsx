// src/AuthContext.jsx
import React, { createContext, useEffect, useState } from "react";
import { auth, provider, db } from "./firebaseConfig";         // ← include db
import { signInWithRedirect, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { signInWithPopup } from "firebase/auth";





export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (u) => {
    if (u) {
      setUser(u);

      const ref = doc(db, "teachers", u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        console.log("🔑 Loaded teacher profile:", data);
        setProfile(data);
      } else {
        console.log("⚠️ No teacher profile found for UID", u.uid);
        setProfile({ gradeLevels: [] });
      }
    } else {
      setUser(null);
      setProfile(null);
    }
  });

  return () => unsubscribe();
}, []);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
