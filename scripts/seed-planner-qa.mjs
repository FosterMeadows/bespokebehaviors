// Local emulators only. Run qa:seed first to create the QA owner.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { mondayOf, dateKey, addDays, blankWin } from "../src/utils/planner.js";

const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-emulator", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "owner@example.test", password: "checkpoint-qa-only", returnSecureToken: true }),
});
if (!response.ok) throw new Error("Start the local emulators and run npm run qa:seed first.");
const { localId: uid } = await response.json();
const environment = await initializeTestEnvironment({ projectId: "bespokebehaviors", firestore: { host: "127.0.0.1", port: 8080 } });
const week = mondayOf();
const previous = addDays(week, -7);
const timestamp = (date) => new Date(`${date}T12:00:00`);
const step = (id, title, purpose, status = "upcoming") => ({ id, title, purpose, status, studentExperience: [{ id: `${id}-activity`, text: "Read the passage, annotate evidence, and discuss your reasoning.", url: "" }], resourcesPrep: [{ id: `${id}-prep`, text: "Prepare the shared passage and response sheet.", url: "" }], teacherNotes: "Sample planning data. Adjust scaffolds for each class.", tags: ["Reading", "Discussion"], result: "A response supported by textual evidence." });
try {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const write = (collection, id, data) => setDoc(doc(db, "teacherCommandCenters", uid, collection, id), data);
    const sequence = { schemaVersion: 3, prepId: "ela8", title: "Sample: Identity and belonging", description: "Explore how character choices reveal belonging and identity.", outcome: "Write an argument supported by textual evidence.", status: "active", activeStepId: "qa-step-2", steps: [step("qa-step-1", "Notice character choices", "Identify details that reveal character motivation.", "complete"), step("qa-step-2", "Discuss the strongest evidence", "Explain which details best support an interpretation.", "active"), step("qa-step-3", "Write and revise an argument", "Develop an evidence-based argument about belonging.")], summativeChecks: [], resources: [], possibleStandards: ["ELA.8.1", "ELA.8.3"], standardCoverage: [], sequenceReflection: "", updatedAt: timestamp(week), completedAt: null };
    await write("sequences", "qa-planner-active", sequence);
    await write("sequences", "qa-planner-next", { ...sequence, title: "Sample: Theme across texts", status: "draft", activeStepId: "", steps: [step("qa-theme", "Compare themes", "Compare how two texts develop a shared theme.")], possibleStandards: ["ELA.8.2"], deckOrder: 1 });
    await write("sequences", "qa-planner-historical", { ...sequence, title: "Sample: Earlier evidence lesson", status: "complete", activeStepId: "", steps: [step("qa-old", "Explain your evidence", "Connect a quotation to an inference.", "complete")], standardCoverage: [{ standardCode: "ELA.8.1", coverageLevel: "introduced", needsRevisit: true, note: "Practice explaining how evidence supports the answer." }], sequenceReflection: "Students selected useful evidence; explanations need another pass.", completedAt: timestamp(previous) });
    await write("plannerSettings", "selection", { sequenceId: "qa-planner-active" });
    const win = { ...blankWin(week), title: "Sample: Inference practice", materialsUrl: "https://www.canva.com/", notes: "15 minutes: model an inference from the shared passage.\n15 minutes: scaffolded independent questions.\n15 minutes: IXL practice.\nReplace the sample link and skill codes with your own when trying the planner.", standards: ["ELA.8.1"], skills: [{ name: "Sample: Make inferences from literary texts", code: "ABC" }, { name: "Sample: Identify supporting evidence", code: "DEF" }] };
    await write("winWeeks", week, win);
    await write("winWeeks", previous, { ...win, week: previous, title: "Sample: Finding strong evidence", status: "complete", reflection: "Students found relevant details. Some still needed a model connecting the evidence to their reasoning.", completedAt: timestamp(addDays(previous, 4)) });
    for (const [id, date, text, done] of [["qa-task-today", dateKey(), "Try moving this item to another day", false], ["qa-task-materials", week, "Prepare the WIN materials", true], ["qa-task-review", addDays(week, 4), "Reflect on the weekly WIN lesson", false]]) {
      await write("plannerTasks", id, { date, text, done, order: Date.now() });
    }
    await write("instructionEvents", "qa-instruction-step", { kind: "step", sequenceId: "qa-planner-active", sequenceTitle: sequence.title, date: week, recordedAt: timestamp(week), outcome: sequence.outcome, step: sequence.steps[0], possibleStandards: sequence.possibleStandards });
  });
  console.log(`Seeded sample planner records for the weeks of ${previous} and ${week}. Production was not contacted.`);
} finally { await environment.cleanup(); }
