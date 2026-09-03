import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { APP_RELEASE } from "../utils/release";

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function supportReference() {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `SUP-${token}`;
}

export async function createSupportReport({ issue, attempted = "", route = "", reporterName = "" }) {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) throw new Error("Sign in is required to send a report.");

  const safeIssue = clean(issue, 1200);
  if (!safeIssue) throw new Error("Describe what happened before sending the report.");

  const reference = supportReference();
  await addDoc(collection(db, "supportReports"), {
    reference,
    reporterUid: currentUser.uid,
    reporterName: clean(reporterName || currentUser.displayName || "Staff Member", 160),
    reporterEmail: clean(currentUser.email, 160),
    issue: safeIssue,
    attempted: clean(attempted, 600),
    route: clean(route || window.location.pathname, 160),
    release: APP_RELEASE,
    online: navigator.onLine,
    userAgent: clean(navigator.userAgent, 500),
    status: "open",
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedByUid: null,
    resolvedByName: null
  });
  return reference;
}

export function listenSupportReports(onRows, onError) {
  return onSnapshot(
    query(collection(db, "supportReports"), orderBy("createdAt", "desc"), limit(100)),
    snapshot => onRows(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export async function setSupportReportStatus(reportId, status, staff = {}) {
  if (!reportId || !["open", "resolved"].includes(status)) throw new Error("Invalid support report update.");
  await updateDoc(doc(db, "supportReports", reportId), {
    status,
    resolvedAt: status === "resolved" ? serverTimestamp() : null,
    resolvedByUid: status === "resolved" ? staff.uid || null : null,
    resolvedByName: status === "resolved" ? clean(staff.name || "Staff Member", 160) : null
  });
}
