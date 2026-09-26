import {
  todayKey
} from "../../utils/date";
import {
  doc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  onSnapshot
} from "firebase/firestore";
import {
  db
} from "../../firebaseConfig";
import {
  studentRecordEventRef,
  studentRecordEvent
} from "../studentRecordEvents";

// ------------------------------
// Academic session lanes
// ------------------------------
export const ACADEMIC_SESSION_LANES = Object.freeze([
  { id: "6-north", label: "Grade 6 North", grade: "6" },
  { id: "6-south", label: "Grade 6 South", grade: "6" },
  { id: "7", label: "Grade 7", grade: "7" },
  { id: "8", label: "Grade 8", grade: "8" }
]);

export function academicLaneDocId(laneId, date = todayKey()) {
  return `${date}_${laneId}`;
}

export function getAcademicLane(laneId) {
  const lane = ACADEMIC_SESSION_LANES.find(item => item.id === laneId);
  if (!lane) throw new Error(`Unknown Academic session lane: ${laneId}`);
  return lane;
}

function laneFields(lane, date) {
  return { date, laneId: lane.id, laneLabel: lane.label, grade: lane.grade };
}

async function readTodayLaneStates(transaction, date, grade) {
  const refs = ACADEMIC_SESSION_LANES.filter(lane => lane.grade === grade).map(lane => ({
    lane,
    deckRef: doc(db, "deck", academicLaneDocId(lane.id, date)),
    sessionRef: doc(db, "academicSessions", academicLaneDocId(lane.id, date))
  }));
  const snapshots = await Promise.all(refs.flatMap(({ deckRef, sessionRef }) => [
    transaction.get(deckRef),
    transaction.get(sessionRef)
  ]));
  return refs.map((refsForLane, index) => {
    const deckSnap = snapshots[index * 2];
    const sessionSnap = snapshots[(index * 2) + 1];
    return {
      ...refsForLane,
      deckSnap,
      sessionSnap,
      deck: deckSnap.exists() ? deckSnap.data() : {},
      session: sessionSnap.exists() ? sessionSnap.data() : {}
    };
  });
}

function findStudentLaneConflict(states, studentId, targetLaneId) {
  return states.find(state => state.lane.id !== targetLaneId && (
    (state.deck.items || []).includes(studentId)
    || (state.session.status === "live" && (state.session.activeRoster || []).includes(studentId))
  ));
}

function throwLaneConflict(conflict, studentId) {
  const error = new Error(`Student is already in ${conflict.lane.label}.`);
  error.code = "academic/student-in-other-lane";
  error.studentId = studentId;
  error.laneId = conflict.lane.id;
  error.laneLabel = conflict.lane.label;
  throw error;
}

function removeStudentsFromLane(transaction, state, studentIds, staff = {}) {
  const ids = new Set(studentIds);
  if ((state.deck.items || []).some(studentId => ids.has(studentId))) {
    transaction.set(state.deckRef, {
      items: (state.deck.items || []).filter(id => !ids.has(id)),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  }
  if (state.sessionSnap.exists() && (state.session.activeRoster || []).some(studentId => ids.has(studentId))) {
    const outcomes = { ...(state.session.outcomes || {}) };
    studentIds.forEach(studentId => {
      outcomes[studentId] = {
        status: "removed",
        updatedByUid: staff.uid || null,
        updatedByName: staff.name || null,
        updatedAt: Timestamp.now()
      };
    });
    transaction.update(state.sessionRef, {
      activeRoster: (state.session.activeRoster || []).filter(id => !ids.has(id)),
      outcomes,
      lastUpdated: serverTimestamp()
    });
  }
}

function removeStudentFromLane(transaction, state, studentId, staff = {}) {
  removeStudentsFromLane(transaction, state, [studentId], staff);
}

// ------------------------------
// Deck (date + lane scoped)
// ------------------------------
export async function addToDeck(studentId, ownerUid, laneId, { move = false, staff = {} } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    const conflict = findStudentLaneConflict(states, studentId, lane.id);
    if (conflict && !move) throwLaneConflict(conflict, studentId);
    if (conflict) removeStudentFromLane(transaction, conflict, studentId, staff);
    transaction.set(target.deckRef, {
      items: [...new Set([...(target.deck.items || []), studentId])],
      createdBy: target.deck.createdBy || ownerUid || null,
      ...laneFields(lane, date),
      createdAt: target.deck.createdAt || serverTimestamp(),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function removeFromDeck(studentId, laneId) {
  const ref = doc(db, "deck", academicLaneDocId(laneId));
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    transaction.update(ref, {
      items: (snap.data().items || []).filter(id => id !== studentId),
      lastUpdated: serverTimestamp()
    });
  });
}

// ------------------------------
// One shared Academic session per lane, per school day
// ------------------------------
export function listenTodayAcademicSession(laneId, cb, onError) {
  return onSnapshot(doc(db, "academicSessions", academicLaneDocId(laneId)), snap => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

export async function startTodayAcademicSession({ hostUid, hostName, roster = [], laneId, moveConflicts = false }) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    if (target.session.status === "live") {
      const error = new Error(`${lane.label} already has a live session.`);
      error.code = "academic/session-already-live";
      throw error;
    }
    const conflicts = roster.map(studentId => ({
      studentId,
      state: findStudentLaneConflict(states, studentId, lane.id)
    })).filter(item => item.state);
    if (conflicts.length && !moveConflicts) throwLaneConflict(conflicts[0].state, conflicts[0].studentId);
    states.forEach(state => {
      const studentIds = conflicts.filter(conflict => conflict.state.lane.id === state.lane.id).map(conflict => conflict.studentId);
      if (studentIds.length) removeStudentsFromLane(transaction, state, studentIds, { uid: hostUid, name: hostName });
    });
    const current = target.session;
    const fullRoster = [...new Set([...(current.roster || []), ...roster])];
    const outcomes = { ...(current.outcomes || {}) };
    roster.forEach(studentId => {
      outcomes[studentId] = { status: "selected", updatedByUid: hostUid || null, updatedByName: hostName || null, updatedAt: Timestamp.now() };
    });
    transaction.set(target.sessionRef, {
      ...laneFields(lane, date),
      status: "live",
      hostUid: hostUid || null,
      hostName: hostName || null,
      startedAt: serverTimestamp(),
      endedAt: null,
      endedByUid: null,
      endedByName: null,
      roster: fullRoster,
      activeRoster: [...roster],
      outcomes,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function addStudentToTodayAcademicSession(studentId, staff = {}, laneId, { move = false } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  await runTransaction(db, async transaction => {
    const states = await readTodayLaneStates(transaction, date, lane.grade);
    const target = states.find(state => state.lane.id === lane.id);
    const conflict = findStudentLaneConflict(states, studentId, lane.id);
    if (conflict && !move) throwLaneConflict(conflict, studentId);
    if (conflict) removeStudentFromLane(transaction, conflict, studentId, staff);
    const outcomes = { ...(target.session.outcomes || {}) };
    outcomes[studentId] = {
      status: "selected",
      updatedByUid: staff.uid || null,
      updatedByName: staff.name || null,
      updatedAt: Timestamp.now()
    };
    transaction.set(target.deckRef, {
      items: [...new Set([...(target.deck.items || []), studentId])],
      createdBy: target.deck.createdBy || staff.uid || null,
      ...laneFields(lane, date),
      createdAt: target.deck.createdAt || serverTimestamp(),
      lastUpdated: serverTimestamp()
    }, { merge: true });
    transaction.set(target.sessionRef, {
      ...laneFields(lane, date),
      roster: [...new Set([...(target.session.roster || []), studentId])],
      activeRoster: [...new Set([...(target.session.activeRoster || []), studentId])],
      outcomes,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });
}

export async function recordTodayAcademicSessionOutcome(studentId, status, staff = {}, laneId) {
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(laneId));
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(sessionRef);
    if (!snap.exists()) return;
    const session = snap.data();
    const outcomes = { ...(session.outcomes || {}) };
    outcomes[studentId] = {
      status,
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
      summary: `Academic session outcome recorded: ${status}`,
      sourceCollection: "academicSessions",
      sourceId: sessionRef.id,
      details: { status, laneId, date: session.date || todayKey() }
    }));
  });
}

export async function removeStudentFromTodayAcademicSession(studentId, staff = {}, laneId) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));
  const deckRef = doc(db, "deck", academicLaneDocId(lane.id, date));
  await runTransaction(db, async transaction => {
    const [sessionSnap, deckSnap] = await Promise.all([transaction.get(sessionRef), transaction.get(deckRef)]);
    const session = sessionSnap.exists() ? sessionSnap.data() : {};
    const deck = deckSnap.exists() ? deckSnap.data() : {};
    const outcomes = { ...(session.outcomes || {}) };
    outcomes[studentId] = {
      status: "removed",
      updatedByUid: staff.uid || null,
      updatedByName: staff.name || null,
      updatedAt: Timestamp.now()
    };
    transaction.set(deckRef, { items: (deck.items || []).filter(id => id !== studentId), lastUpdated: serverTimestamp() }, { merge: true });
    if (sessionSnap.exists()) transaction.update(sessionRef, {
      activeRoster: (session.activeRoster || []).filter(id => id !== studentId), outcomes, lastUpdated: serverTimestamp()
    });
    transaction.set(studentRecordEventRef(), studentRecordEvent({
      studentId,
      domain: "academic",
      eventType: "sessionOutcomeRecorded",
      actor: staff,
      summary: "Removed from academic session",
      sourceCollection: "academicSessions",
      sourceId: sessionRef.id,
      details: { status: "removed", laneId: lane.id, date }
    }));
  });
}

export async function endTodayAcademicSession({ staff = {}, unmarkedStudentIds = [], laneId } = {}) {
  const date = todayKey();
  const lane = getAcademicLane(laneId);
  const sessionRef = doc(db, "academicSessions", academicLaneDocId(lane.id, date));
  const deckRef = doc(db, "deck", academicLaneDocId(lane.id, date));
  await runTransaction(db, async transaction => {
    const [sessionSnap, deckSnap] = await Promise.all([transaction.get(sessionRef), transaction.get(deckRef)]);
    const session = sessionSnap.exists() ? sessionSnap.data() : {};
    const outcomes = { ...(session.outcomes || {}) };
    unmarkedStudentIds.forEach(studentId => {
      outcomes[studentId] = { status: "no_show", updatedByUid: staff.uid || null, updatedByName: staff.name || null, updatedAt: Timestamp.now() };
    });
    if (sessionSnap.exists()) transaction.update(sessionRef, {
      status: "ended", activeRoster: [], outcomes, endedAt: serverTimestamp(),
      endedByUid: staff.uid || null, endedByName: staff.name || null, lastUpdated: serverTimestamp()
    });
    if (deckSnap.exists()) transaction.update(deckRef, { items: [], lastUpdated: serverTimestamp() });
  });
}
