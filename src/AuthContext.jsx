// src/AuthContext.jsx
import React, { createContext, useEffect, useState } from "react";
import { auth, provider, db } from "./firebaseConfig";
import {
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export const AuthContext = createContext();

const EMPTY_PROFILE = { gradeLevels: [], roles: [], features: {} };
const DEV_PROFILE = {
  displayName: "Dev Owner",
  contactEmail: "dev@example.test",
  gradeLevels: ["6", "7", "8"],
  roles: ["owner", "academic", "admin"],
  features: {
    academic: true,
    behavior: true,
    legacyTools: true,
    admin: true
  }
};

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
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        setAuthDebug("Auth persistence ready.");
        return getRedirectResult(auth);
      })
      .then((result) => {
        setAuthDebug(result?.user ? "Google sign-in completed." : "No redirect result returned.");
        if (result?.user) {
          setAuthError("");
        }
      })
      .catch((err) => {
        const message = describeAuthError(err);
        setAuthError(message);
        setAuthDebug(message);
      });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
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
        const nextProfile = snap.exists() ? snap.data() : EMPTY_PROFILE;
        setProfile(nextProfile);
      } catch (err) {
        setProfile(EMPTY_PROFILE);
        setAuthDebug(`Teacher profile failed to load: ${describeAuthError(err)}`);
      } finally {
        setProfileLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setAuthError("");
    setAuthDebug("Starting Google sign-in...");
    try {
      await setPersistence(auth, browserLocalPersistence);
      const isLocalDevelopment =
        import.meta.env.DEV &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

      if (isLocalDevelopment) {
        const result = await signInWithPopup(auth, provider);
        setAuthDebug(result.user ? "Google sign-in completed." : "Google sign-in returned no account.");
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (err) {
      const message = describeAuthError(err);
      setAuthError(message);
      setAuthDebug(message);
    }
  };
  const logout = () => signOut(auth);
  const devLogin = () => {
    if (!import.meta.env.DEV) return;
    setUser({
      uid: "dev-owner",
      displayName: "Dev Owner",
      email: "dev@example.test"
    });
    setProfile(DEV_PROFILE);
    setProfileLoading(false);
  };
  const activeLogout = user?.uid === "dev-owner"
    ? () => {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
      }
    : logout;

  return (
    <AuthContext.Provider
      value={{ user, profile, profileLoading, authError, authDebug, setProfile, login, logout: activeLogout, devLogin }}
    >
      {children}
    </AuthContext.Provider>
  );
}
