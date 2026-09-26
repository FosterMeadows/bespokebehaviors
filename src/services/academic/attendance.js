import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  writeBatch,
  runTransaction,
  Timestamp,
  getDoc
} from "firebase/firestore";
import {
  db
} from "../../firebaseConfig";
import {
  todayKey
} from "../../utils/date";
import {
  studentRecordEventRef,
  studentRecordEvent
} from "../studentRecordEvents";
import {
  getAcademicLane,
  academicLaneDocId
} from "./sessions.js";

// ------------------------------
// Attendance / Minutes
// ------------------------------
// Minutes log (kept for compatibility with your drawer). Consider phasing out later.
export async function addMinutes(studentId, minutes, uid, note = "") {
  await addDoc(collection(db, "arLogs"), {
    studentId,
    date: todayKey(),
    minutes,
    createdBy: uid,
    createdAt: serverTimestamp(),
    note: note || null
  });
}

// New: markServedToday — idempotent per student per day
export async function markServedToday(studentId, byUid, room = "", byName = "") {
  const date = todayKey();
  const attId = `${studentId}_${date}`; // deterministic id to prevent duplicates
  const ref = doc(db, "attendance", attId);
  const batch = writeBatch(db);
  const attendance = {
    studentId,
    date,          // YYYY-MM-DD
    by: byUid || null,
    byName: byName || null,
    updatedAt: serverTimestamp(),
  };
  if (room) attendance.room = room;
  batch.set(ref, attendance, { merge: true });
  batch.set(doc(collection(db, "lifecycle")), {
    studentId,
    eventType: "servedDayLogged",
    date,
    by: byUid || null,
    byName: byName || null,
    at: serverTimestamp(),
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId,
    domain: "academic",
    eventType: "attendanceMarked",
    actor: { uid: byUid, name: byName },
    summary: "Marked present for academic reteach",
    sourceCollection: "attendance",
    sourceId: attId,
    details: { date, room: room || null }
  }));
  await batch.commit();
  return attId;
}

export async function recordTodayAcademicAttendance(studentId, staff = {}, laneId, { room = "" } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const attId = `${studentId}_${date}`;
  const attendanceRef = doc(db, "attendance", attId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));

  await runTransaction(db, async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    const attendance = {
      studentId,
      date,
      grade: lane.grade,
      laneId: lane.id,
      by: staff.uid || null,
      byName: staff.name || null,
      updatedAt: serverTimestamp()
    };
    if (room) attendance.room = room;
    transaction.set(attendanceRef, attendance, { merge: true });
    transaction.set(doc(collection(db, "lifecycle")), {
      studentId,
      eventType: "servedDayLogged",
      date,
      grade: lane.grade,
      laneId: lane.id,
      by: staff.uid || null,
      byName: staff.name || null,
      at: serverTimestamp()
    });
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "attendanceMarked",
      actor: staff,
      summary: "Marked present for academic reteach",
      sourceCollection: "attendance",
      sourceId: attId,
      details: { date, room: room || null, laneId: lane.id }
    }));

    if (sessionSnap.exists()) {
      const session = sessionSnap.data();
      const outcomes = { ...(session.outcomes || {}) };
      outcomes[studentId] = {
        status: "present",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
      transaction.update(sessionRef, { outcomes, lastUpdated: serverTimestamp() });
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "sessionOutcomeRecorded",
        actor: staff,
        summary: "Academic session outcome recorded: present",
        sourceCollection: "academicSessions",
        sourceId: sessionRef.id,
        details: { status: "present", laneId: lane.id, date: session.date || date }
      }));
    }
  });
  return attId;
}

export async function unmarkServedToday(studentId, byUid = "", byName = "") {
  const date = todayKey();
  const attId = `${studentId}_${date}`;
  const attendanceRef = doc(db, "attendance", attId);
  const attendanceSnap = await getDoc(attendanceRef);
  const prior = attendanceSnap.exists() ? attendanceSnap.data() : {};
  const batch = writeBatch(db);
  batch.delete(attendanceRef);
  batch.set(doc(collection(db, "lifecycle")), {
    studentId,
    eventType: "servedDayUnlogged",
    date,
    by: byUid || null,
    byName: byName || null,
    at: serverTimestamp()
  });
  batch.set(studentRecordEventRef(), studentRecordEvent({
    studentId,
    domain: "academic",
    eventType: "attendanceUnmarked",
    actor: { uid: byUid, name: byName },
    summary: "Removed academic attendance mark",
    sourceCollection: "attendance",
    sourceId: attId,
    details: { date, priorRoom: prior.room || null, priorRecordedByUid: prior.by || null }
  }));
  await batch.commit();
}

export async function undoTodayAcademicAttendance(studentIds, staff = {}, laneId) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (!ids.length) return;
  const date = todayKey();
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(laneId, date));
  const attendanceRefs = ids.map(studentId => doc(db, "attendance", `${studentId}_${date}`));

  await runTransaction(db, async transaction => {
    const [sessionSnap, ...attendanceSnaps] = await Promise.all([
      transaction.get(sessionRef),
      ...attendanceRefs.map(ref => transaction.get(ref))
    ]);
    const outcomes = { ...(sessionSnap.exists() ? sessionSnap.data().outcomes || {} : {}) };

    ids.forEach((studentId, index) => {
      const prior = attendanceSnaps[index].exists() ? attendanceSnaps[index].data() : {};
      transaction.delete(attendanceRefs[index]);
      outcomes[studentId] = {
        status: "selected",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
      transaction.set(doc(collection(db, "lifecycle")), {
        studentId,
        eventType: "servedDayUnlogged",
        date,
        by: staff.uid || null,
        byName: staff.name || null,
        at: serverTimestamp()
      });
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "attendanceUnmarked",
        actor: staff,
        summary: "Removed academic attendance mark",
        sourceCollection: "attendance",
        sourceId: `${studentId}_${date}`,
        details: { date, priorRoom: prior.room || null, priorRecordedByUid: prior.by || null }
      }));
      transaction.set(studentRecordEventRef(), studentRecordEvent({
        studentId,
        domain: "academic",
        eventType: "sessionOutcomeRecorded",
        actor: staff,
        summary: "Academic session outcome recorded: selected",
        sourceCollection: "academicSessions",
        sourceId: sessionRef.id,
        details: { status: "selected", laneId, date }
      }));
    });

    if (sessionSnap.exists()) {
      transaction.update(sessionRef, { outcomes, lastUpdated: serverTimestamp() });
    }
  });
}
