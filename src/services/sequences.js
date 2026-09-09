import { db } from "../firebaseConfig";
import { dateKey } from "../utils/planner.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

export const SEQUENCE_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
];

export const STEP_STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "skipped", label: "Skipped" },
];

export const ACTIVITY_MODE_OPTIONS = [
  "Reading",
  "Writing",
  "Discussion",
  "Vocabulary",
  "Viewing",
  "Workshop",
  "Speaking",
  "Research",
];

const SEQUENCE_STATUSES = new Set(SEQUENCE_STATUS_OPTIONS.map((option) => option.value));
const STEP_STATUSES = new Set(STEP_STATUS_OPTIONS.map((option) => option.value));

function localId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanUrl(value) {
  return String(value || "").trim().slice(0, 1000);
}

function timestampValue(value) {
  return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : 0);
}

function legacyStatus(value) {
  if (value === "completed") return "complete";
  return SEQUENCE_STATUSES.has(value) ? value : "draft";
}

export function createListItem(overrides = {}) {
  return {
    id: localId("item"),
    text: "",
    url: "",
    ...overrides,
  };
}

export function createStep(overrides = {}) {
  return {
    id: localId("step"),
    title: "",
    purpose: "",
    studentExperience: [createListItem()],
    result: "",
    resourcesPrep: [],
    teacherNotes: "",
    tags: [],
    status: "upcoming",
    ...overrides,
  };
}

export function createSummativeCheck(overrides = {}) {
  return {
    id: localId("summative"),
    afterStepId: "",
    title: "",
    description: "",
    ...overrides,
  };
}

function normalizeList(items, includeUrl = true) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item?.id || localId("item"),
    text: String(item?.text || ""),
    ...(includeUrl ? { url: String(item?.url || "") } : {}),
  }));
}

function normalizeStep(step, index) {
  return {
    id: step?.id || localId("step"),
    title: String(step?.title || `Step ${index + 1}`),
    purpose: String(step?.purpose || ""),
    studentExperience: normalizeList(step?.studentExperience?.length ? step.studentExperience : [createListItem()]),
    result: String(step?.result || ""),
    resourcesPrep: normalizeList(step?.resourcesPrep),
    teacherNotes: String(step?.teacherNotes || ""),
    tags: Array.isArray(step?.tags) ? step.tags.filter((tag) => ACTIVITY_MODE_OPTIONS.includes(tag)) : [],
    status: STEP_STATUSES.has(step?.status) ? step.status : "upcoming",
  };
}

function stepFromLegacyLesson(lesson, index) {
  const experience = (Array.isArray(lesson?.activities) ? lesson.activities : [])
    .filter((item) => item?.text || item?.url)
    .map((item) => createListItem({ text: item.text || "", url: item.url || "" }));
  const resourcesPrep = (Array.isArray(lesson?.prepNeeded) ? lesson.prepNeeded : [])
    .filter((item) => item?.text)
    .map((item) => createListItem({ text: item.text || "" }));

  return createStep({
    id: lesson?.id || localId("step"),
    title: lesson?.title || `Step ${index + 1}`,
    studentExperience: experience.length ? experience : [createListItem()],
    resourcesPrep,
  });
}

export function normalizeSequenceRecord(sequence = {}) {
  const status = legacyStatus(sequence.status);
  const rawSteps = Array.isArray(sequence.steps) && sequence.steps.length
    ? sequence.steps
    : (Array.isArray(sequence.lessons) ? sequence.lessons.map(stepFromLegacyLesson) : []);
  const steps = (rawSteps.length ? rawSteps : [createStep()]).map(normalizeStep);
  const activeStep = steps.find((step) => step.status === "active");
  const fallbackStepId = steps.at(-1)?.id || "";

  return {
    ...sequence,
    prepId: String(sequence.prepId || "ela8"),
    title: String(sequence.title || ""),
    description: String(sequence.description || ""),
    outcome: String(sequence.outcome || ""),
    status,
    deckOrder: typeof sequence.deckOrder === "number" && Number.isFinite(sequence.deckOrder) ? sequence.deckOrder : null,
    steps,
    summativeChecks: (Array.isArray(sequence.summativeChecks) ? sequence.summativeChecks : []).map((check) => ({
      id: check?.id || localId("summative"),
      afterStepId: steps.some((step) => step.id === check?.afterStepId) ? check.afterStepId : fallbackStepId,
      title: String(check?.title || ""),
      description: String(check?.description || ""),
    })),
    activeStepId: status === "active" ? (sequence.activeStepId || activeStep?.id || "") : "",
    resources: (Array.isArray(sequence.resources) ? sequence.resources : []).map((resource) => ({
      id: resource?.id || localId("resource"),
      title: String(resource?.title || ""),
      url: String(resource?.url || ""),
    })),
    possibleStandards: Array.isArray(sequence.possibleStandards) ? sequence.possibleStandards : [],
    standardCoverage: Array.isArray(sequence.standardCoverage) ? sequence.standardCoverage : [],
    sequenceReflection: String(sequence.sequenceReflection || ""),
  };
}

function cleanList(items, maxItems = 50) {
  return (Array.isArray(items) ? items : []).slice(0, maxItems).map((item) => ({
    id: cleanText(item?.id, 120) || localId("item"),
    text: cleanText(item?.text, 700),
    url: cleanUrl(item?.url),
  })).filter((item) => item.text || item.url);
}

function cleanSteps(steps) {
  let foundActive = false;
  return (Array.isArray(steps) ? steps : []).slice(0, 60).map((step) => {
    let status = STEP_STATUSES.has(step?.status) ? step.status : "upcoming";
    if (status === "active") {
      if (foundActive) status = "upcoming";
      foundActive = true;
    }
    return {
      id: cleanText(step?.id, 120) || localId("step"),
      title: cleanText(step?.title, 180),
      purpose: cleanText(step?.purpose, 1200),
      studentExperience: cleanList(step?.studentExperience),
      result: cleanText(step?.result, 1200),
      resourcesPrep: cleanList(step?.resourcesPrep),
      teacherNotes: cleanText(step?.teacherNotes, 2500),
      tags: [...new Set((Array.isArray(step?.tags) ? step.tags : []).filter((tag) => ACTIVITY_MODE_OPTIONS.includes(tag)))],
      status,
    };
  });
}

function cleanCoverage(coverage) {
  const levels = new Set(["introduced", "practiced", "assessed"]);
  return (Array.isArray(coverage) ? coverage : []).slice(0, 100).map((item) => ({
    standardCode: cleanText(item?.standardCode, 80),
    coverageLevel: levels.has(item?.coverageLevel) ? item.coverageLevel : "introduced",
    needsRevisit: item?.needsRevisit === true,
    note: cleanText(item?.note, 1000),
  })).filter((item) => item.standardCode);
}

function cleanSummativeChecks(checks, steps) {
  const stepIds = new Set(steps.map((step) => step.id));
  const fallbackStepId = steps.at(-1)?.id || "";
  return (Array.isArray(checks) ? checks : []).slice(0, 60).map((check) => ({
    id: cleanText(check?.id, 120) || localId("summative"),
    afterStepId: stepIds.has(check?.afterStepId) ? check.afterStepId : fallbackStepId,
    title: cleanText(check?.title, 180),
    description: cleanText(check?.description, 1800),
  }));
}

function cleanSequence(sequence) {
  const normalized = normalizeSequenceRecord(sequence);
  const steps = cleanSteps(normalized.steps);
  const activeStep = steps.find((step) => step.status === "active");
  return {
    schemaVersion: 3,
    prepId: cleanText(normalized.prepId, 80) || "ela8",
    title: cleanText(normalized.title, 180),
    description: cleanText(normalized.description, 1800),
    outcome: cleanText(normalized.outcome, 2200),
    status: legacyStatus(normalized.status),
    activeStepId: normalized.status === "active" ? (activeStep?.id || "") : "",
    steps,
    summativeChecks: cleanSummativeChecks(normalized.summativeChecks, steps),
    resources: (Array.isArray(normalized.resources) ? normalized.resources : []).slice(0, 40).map((resource) => ({
      id: cleanText(resource?.id, 120) || localId("resource"),
      title: cleanText(resource?.title, 240),
      url: cleanUrl(resource?.url),
    })).filter((resource) => resource.title || resource.url),
    possibleStandards: [...new Set(normalized.possibleStandards.map((code) => cleanText(code, 80)).filter(Boolean))].slice(0, 100),
    standardCoverage: cleanCoverage(normalized.standardCoverage),
    sequenceReflection: cleanText(normalized.sequenceReflection, 2500),
  };
}

function sequenceCollection(ownerUid) {
  return collection(db, "teacherCommandCenters", ownerUid, "sequences");
}

function sequenceDocument(ownerUid, sequenceId) {
  return doc(db, "teacherCommandCenters", ownerUid, "sequences", sequenceId);
}

export function listenSequences(ownerUid, onRows, onError) {
  if (!ownerUid) {
    onRows([]);
    return () => {};
  }
  return onSnapshot(
    sequenceCollection(ownerUid),
    (snapshot) => {
      const rows = snapshot.docs.map((item) => normalizeSequenceRecord({ id: item.id, ...item.data() }));
      const rank = { active: 0, draft: 1, complete: 2, archived: 3 };
      rows.sort((a, b) => {
        const statusDifference = rank[a.status] - rank[b.status];
        if (statusDifference) return statusDifference;
        if (a.status === "draft") {
          const aHasOrder = Number.isFinite(a.deckOrder);
          const bHasOrder = Number.isFinite(b.deckOrder);
          if (aHasOrder && bHasOrder && a.deckOrder !== b.deckOrder) return a.deckOrder - b.deckOrder;
          if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
        }
        return timestampValue(b.updatedAt || b.completedAt) - timestampValue(a.updatedAt || a.completedAt);
      });
      onRows(rows);
    },
    onError
  );
}

export function listenSequence(ownerUid, sequenceId, onSequence, onError) {
  if (!ownerUid || !sequenceId) return () => {};
  return onSnapshot(
    sequenceDocument(ownerUid, sequenceId),
    (snapshot) => onSequence(snapshot.exists() ? normalizeSequenceRecord({ id: snapshot.id, ...snapshot.data() }) : null),
    onError
  );
}

export function listenActiveSequence(ownerUid, onSequence, onError) {
  return listenSequences(ownerUid, (rows) => onSequence(rows.find((sequence) => sequence.status === "active") || null), onError);
}

export async function createSequence(ownerUid) {
  if (!ownerUid) throw new Error("An owner account is required.");
  const reference = await addDoc(sequenceCollection(ownerUid), {
    schemaVersion: 3,
    prepId: "ela8",
    title: "Untitled sequence",
    description: "",
    outcome: "",
    status: "draft",
    deckOrder: Date.now(),
    activeStepId: "",
    steps: [createStep()],
    summativeChecks: [],
    resources: [],
    possibleStandards: [],
    standardCoverage: [],
    sequenceReflection: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    archivedAt: null,
    createdByUid: ownerUid,
    updatedByUid: ownerUid,
  });
  return reference.id;
}

export async function saveSequenceDraft(ownerUid, sequenceId, sequence) {
  if (!ownerUid || !sequenceId) throw new Error("A sequence is required.");
  await updateDoc(sequenceDocument(ownerUid, sequenceId), {
    ...cleanSequence(sequence),
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
}

export async function activateSequence(ownerUid, sequenceId, sequence, stepId = "") {
  const clean = cleanSequence(sequence);
  const snapshot = await getDocs(sequenceCollection(ownerUid));
  const batch = writeBatch(db);

  snapshot.docs.forEach((item) => {
    if (item.id === sequenceId || legacyStatus(item.data().status) !== "active") return;
    const other = cleanSequence(normalizeSequenceRecord(item.data()));
    if (other.prepId !== clean.prepId) return;
    batch.update(item.ref, {
      status: "draft",
      deckOrder: Date.now(),
      activeStepId: "",
      steps: other.steps.map((step) => step.status === "active" ? { ...step, status: "upcoming" } : step),
      updatedAt: serverTimestamp(),
      updatedByUid: ownerUid,
    });
  });

  const selectedId = stepId || clean.activeStepId;
  if (selectedId) {
    const selected = clean.steps.find((step) => step.id === selectedId);
    if (!selected?.title || !selected.purpose || !selected.studentExperience.some((item) => item.text)) {
      throw new Error("The active step needs a title, purpose, and student experience.");
    }
  }
  batch.update(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    status: "active",
    activeStepId: selectedId,
    steps: clean.steps.map((step) => ({
      ...step,
      status: step.id === selectedId ? "active" : (step.status === "active" ? "upcoming" : step.status),
    })),
    completedAt: null,
    archivedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
  await batch.commit();
}

export async function setStepStatus(ownerUid, sequenceId, sequence, stepId, status) {
  if (!STEP_STATUSES.has(status) || !sequence.steps.some((step) => step.id === stepId)) throw new Error("Choose a valid step and status.");
  if (status === "active") {
    await activateSequence(ownerUid, sequenceId, sequence, stepId);
    return;
  }
  const clean = cleanSequence(sequence);
  const steps = clean.steps.map((step) => step.id === stepId ? { ...step, status } : step);
  const batch = writeBatch(db);
  const finished = clean.steps.find((step) => step.id === stepId);
  if (status === "complete" && finished?.status !== "complete") recordInstruction(batch, ownerUid, sequenceId, clean, finished);
  batch.update(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    steps,
    activeStepId: clean.activeStepId === stepId ? "" : clean.activeStepId,
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
  await batch.commit();
}

function recordInstruction(batch, ownerUid, sequenceId, sequence, step = null) {
  const reference = doc(collection(db, "teacherCommandCenters", ownerUid, "instructionEvents"));
  batch.set(reference, {
    kind: step ? "step" : "sequence", sequenceId, sequenceTitle: sequence.title,
    date: dateKey(), recordedAt: serverTimestamp(), outcome: sequence.outcome,
    ...(step ? { step: { ...step, status: "complete" }, possibleStandards: sequence.possibleStandards } : { standardCoverage: sequence.standardCoverage, reflection: sequence.sequenceReflection }),
  });
}

async function finishAndAdvance(ownerUid, sequenceId, sequence, finishedStatus) {
  const clean = cleanSequence(sequence);
  const currentIndex = clean.steps.findIndex((step) => step.id === clean.activeStepId || step.status === "active");
  if (currentIndex < 0) throw new Error("Choose an active step first.");
  const next = clean.steps.slice(currentIndex + 1).find((step) => !["complete", "skipped"].includes(step.status));
  const steps = clean.steps.map((step, index) => {
    if (index === currentIndex) return { ...step, status: finishedStatus };
    if (step.id === next?.id) return { ...step, status: "active" };
    return step.status === "active" ? { ...step, status: "upcoming" } : step;
  });
  const batch = writeBatch(db);
  if (finishedStatus === "complete") recordInstruction(batch, ownerUid, sequenceId, clean, clean.steps[currentIndex]);
  batch.update(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    status: "active",
    steps,
    activeStepId: next?.id || "",
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
  await batch.commit();
}

export function completeAndActivateNext(ownerUid, sequenceId, sequence) {
  return finishAndAdvance(ownerUid, sequenceId, sequence, "complete");
}

export function skipAndActivateNext(ownerUid, sequenceId, sequence) {
  return finishAndAdvance(ownerUid, sequenceId, sequence, "skipped");
}

export async function completeSequence(ownerUid, sequenceId, sequence) {
  const clean = cleanSequence(sequence);
  if (!clean.title) throw new Error("Give the sequence a title before completing it.");
  if (!clean.outcome) throw new Error("Describe the expected result before completing the sequence.");
  if (!clean.standardCoverage.length) throw new Error("Select at least one standard covered by this sequence.");
  const batch = writeBatch(db);
  if (clean.status !== "complete") {
    clean.steps.filter((step) => step.status === "active").forEach((step) => recordInstruction(batch, ownerUid, sequenceId, clean, step));
    recordInstruction(batch, ownerUid, sequenceId, clean);
  }
  batch.update(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    status: "complete",
    activeStepId: "",
    steps: clean.steps.map((step) => step.status === "active" ? { ...step, status: "complete" } : step),
    completedAt: serverTimestamp(),
    archivedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
  await batch.commit();
}

export async function archiveSequence(ownerUid, sequenceId, sequence) {
  const clean = cleanSequence(sequence);
  await updateDoc(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    status: "archived",
    activeStepId: "",
    steps: clean.steps.map((step) => step.status === "active" ? { ...step, status: "upcoming" } : step),
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
}

export async function reopenSequence(ownerUid, sequenceId, sequence) {
  const clean = cleanSequence(sequence);
  await updateDoc(sequenceDocument(ownerUid, sequenceId), {
    ...clean,
    status: "draft",
    deckOrder: Date.now(),
    activeStepId: "",
    steps: clean.steps.map((step) => step.status === "active" ? { ...step, status: "upcoming" } : step),
    completedAt: null,
    archivedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: ownerUid,
  });
}

export async function reorderOnDeckSequences(ownerUid, sequenceIds) {
  if (!ownerUid) throw new Error("An owner account is required.");
  const orderedIds = [...new Set((Array.isArray(sequenceIds) ? sequenceIds : []).filter(Boolean))];
  const batch = writeBatch(db);
  orderedIds.forEach((sequenceId, index) => {
    batch.update(sequenceDocument(ownerUid, sequenceId), {
      deckOrder: index,
      updatedByUid: ownerUid,
    });
  });
  await batch.commit();
}
