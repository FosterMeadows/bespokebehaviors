export const COVERAGE_LEVEL_OPTIONS = [
  { value: "introduced", label: "Introduced" },
  { value: "practiced", label: "Practiced" },
  { value: "assessed", label: "Assessed" },
];

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
}

export function buildStandardsPulse(standards, sequences) {
  const states = new Map(standards.map((standard) => [standard.code, {
    ...standard,
    coverageLevel: "not_addressed",
    needsRevisit: false,
    latestNote: "",
    latestSequenceId: "",
    latestSequenceTitle: "",
    history: [],
  }]));

  const completed = (Array.isArray(sequences) ? sequences : [])
    .filter((sequence) => sequence.status === "complete" || sequence.status === "completed")
    .sort((a, b) => timestampValue(a.completedAt || a.updatedAt) - timestampValue(b.completedAt || b.updatedAt));

  completed.forEach((sequence) => {
    (Array.isArray(sequence.standardCoverage) ? sequence.standardCoverage : []).forEach((coverage) => {
      const state = states.get(coverage.standardCode);
      if (!state || !COVERAGE_LEVEL_OPTIONS.some((option) => option.value === coverage.coverageLevel)) return;
      const historyItem = {
        sequenceId: sequence.id,
        sequenceTitle: sequence.title || "Untitled sequence",
        outcome: sequence.outcome || "",
        coverageLevel: coverage.coverageLevel,
        needsRevisit: coverage.needsRevisit === true,
        note: coverage.note || "",
        sequenceReflection: sequence.sequenceReflection || "",
      };
      state.history.push(historyItem);
      state.coverageLevel = historyItem.coverageLevel;
      state.needsRevisit = historyItem.needsRevisit;
      state.latestNote = historyItem.note;
      state.latestSequenceId = historyItem.sequenceId;
      state.latestSequenceTitle = historyItem.sequenceTitle;
    });
  });

  return Array.from(states.values()).map((state) => ({ ...state, history: [...state.history].reverse() }));
}
