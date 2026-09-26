// src/AuthContext.jsx
import React, { createContext, useEffect, useState } from "react";
import { auth, provider, qaEmulatorMode } from "./firebaseAuth.js";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
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
    let profileRequest = 0;
    let disposed = false;
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
      const request = ++profileRequest;
      const isCurrent = () => !disposed && request === profileRequest && auth.currentUser?.uid === u?.uid;
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
        const { ensureTeacherProfile, listenTeacherProfile } = await import("./services/teacherProfiles.js");
        if (!isCurrent()) return;
        const ref = await ensureTeacherProfile(u, isCurrent);
        if (!isCurrent() || !ref) return;
        unsubscribeProfile = listenTeacherProfile(ref, profileSnapshot => {
          if (!isCurrent()) return;
          setProfile(profileSnapshot.exists() ? { ...EMPTY_PROFILE, ...profileSnapshot.data() } : EMPTY_PROFILE);
          setProfileLoading(false);
          setAuthDebug("Teacher access is current.");
        }, err => {
          if (!isCurrent()) return;
          setProfile(EMPTY_PROFILE);
          setProfileLoading(false);
          setAuthDebug(`Teacher profile failed to refresh: ${describeAuthError(err)}`);
        });
      } catch (err) {
        if (!isCurrent()) return;
        setProfile(EMPTY_PROFILE);
        setAuthDebug(`Teacher profile failed to load: ${describeAuthError(err)}`);
        setProfileLoading(false);
      }
    });

    return () => {
      disposed = true;
      profileRequest += 1;
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
