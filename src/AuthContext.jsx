// src/AuthContext.jsx
import React, { createContext, useEffect, useState } from "react";
import { auth, provider, db, qaEmulatorMode } from "./firebaseConfig";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onSnapshot } from "firebase/firestore";
import { QA_PASSWORD } from "./qa/personas";

export const AuthContext = createContext();

const EMPTY_PROFILE = { gradeLevels: [], roles: [], features: {} };
function describeAuthError(err) {
  if (!err) return "Google sign-in failed.";
  return [err.code, err.message].filter(Boolean).join(": ") || "Google sign-in failed.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authDebug, setAuthDebug] = useState("Auth initializing...");

  useEffect(() => {
    let unsubscribeProfile = () => {};
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        setAuthDebug("Auth persistence ready.");
      })
      .catch((err) => {
        const message = describeAuthError(err);
        setAuthError(message);
        setAuthDebug(message);
      });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      unsubscribeProfile();
      unsubscribeProfile = () => {};
      setProfileLoading(true);

      if (!u) {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setAuthDebug("No signed-in Firebase user.");
        return;
      }

      setUser(u);
      setAuthDebug("Signed-in account loaded.");
      try {
        const ref = doc(db, "teachers", u.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const pendingProfile = {
            displayName: u.displayName || u.email || "Teacher",
            contactEmail: u.email || ""
          };
          await setDoc(ref, pendingProfile);
        }
        if (auth.currentUser?.uid !== u.uid) return;
        unsubscribeProfile = onSnapshot(ref, profileSnapshot => {
          setProfile(profileSnapshot.exists() ? { ...EMPTY_PROFILE, ...profileSnapshot.data() } : EMPTY_PROFILE);
          setProfileLoading(false);
          setAuthDebug("Teacher access is current.");
        }, err => {
          setProfile(EMPTY_PROFILE);
          setProfileLoading(false);
          setAuthDebug(`Teacher profile failed to refresh: ${describeAuthError(err)}`);
        });
      } catch (err) {
        setProfile(EMPTY_PROFILE);
        setAuthDebug(`Teacher profile failed to load: ${describeAuthError(err)}`);
        setProfileLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeProfile();
    };
  }, []);

  const login = async () => {
    setAuthError("");
    setAuthDebug("Starting Google sign-in...");
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, provider);
      setAuthDebug(result.user ? "Google sign-in completed." : "Google sign-in returned no account.");
    } catch (err) {
      const message = describeAuthError(err);
      setAuthError(message);
      setAuthDebug(message);
    }
  };
  const logout = () => signOut(auth);
  const qaLogin = async email => {
    if (!qaEmulatorMode) return;
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, email, QA_PASSWORD);
    } catch (err) {
      setAuthError(`QA sign-in failed: ${describeAuthError(err)}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, profileLoading, authError, authDebug, setProfile, login, logout, qaLogin, qaEmulatorMode }}
    >
      {children}
    </AuthContext.Provider>
  );
}
