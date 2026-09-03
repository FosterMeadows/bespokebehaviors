import { collection, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export function studentRecordEventRef() {
  return doc(collection(db, "studentRecordEvents"));
}

export function studentRecordEvent({
  studentId,
  domain,
  eventType,
  actor = {},
  summary = "",
  sourceCollection = "",
  sourceId = "",
  schoolYear = "",
  details = {},
  visibleToUids = []
}) {
  return {
    studentId,
    domain,
    eventType,
    summary,
    sourceCollection,
    sourceId,
    schoolYear,
    details,
    actorUid: actor.uid || null,
    actorName: actor.name || null,
    visibleToUids: [...new Set([actor.uid, ...visibleToUids].filter(Boolean))],
    occurredAt: serverTimestamp()
  };
}
