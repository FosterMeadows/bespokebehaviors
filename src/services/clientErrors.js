import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { APP_RELEASE } from "../utils/release";

const recentReports = new Map();

function safeToken(value, fallback = "unknown", limit = 80) {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_./:-]/g, "-").slice(0, limit);
  return cleaned || fallback;
}

function referenceId() {
  const randomPart = globalThis.crypto?.randomUUID?.().replace(/-/g, "")
    || Math.random().toString(36).slice(2, 10);
  return `BB-${randomPart.slice(0, 8).toUpperCase()}`;
}

function safeRoute() {
  const segments = String(window.location.pathname || "/").split("/");
  return segments.map((segment, index) => {
    const parent = segments[index - 1];
    if (parent === "students") return ":student";
    if (parent === "standards") return ":standard";
    if (parent === "sequences") return ":sequence";
    return safeToken(segment, "", 40);
  }).join("/").slice(0, 160) || "/";
}

export async function reportClientError(error, { source = "application" } = {}) {
  const user = auth.currentUser;
  if (!user?.uid || import.meta.env.DEV) return "";

  const category = safeToken(error?.code || error?.name || typeof error, "error");
  const safeSource = safeToken(source, "application");
  const route = safeRoute();
  const fingerprint = `${user.uid}:${route}:${safeSource}:${category}`;
  const now = Date.now();
  if (now - (recentReports.get(fingerprint) || 0) < 30_000) return "";
  recentReports.set(fingerprint, now);

  const reference = referenceId();
  try {
    await addDoc(collection(db, "clientErrors"), {
      reference,
      userUid: user.uid,
      route,
      source: safeSource,
      category,
      release: APP_RELEASE,
      online: navigator.onLine,
      userAgent: String(navigator.userAgent || "unknown").slice(0, 240),
      occurredAt: serverTimestamp()
    });
    return reference;
  } catch {
    return reference;
  }
}
