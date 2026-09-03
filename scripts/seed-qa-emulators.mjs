import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFile } from "node:fs/promises";

const projectId = "bespokebehaviors";
const authBase = `http://127.0.0.1:9099`;
const password = "checkpoint-qa-only";

const personas = [
  {
    email: "pending.teacher@example.test",
    displayName: "Pending Teacher",
    profile: { displayName: "Pending Teacher", contactEmail: "pending.teacher@example.test" }
  },
  {
    email: "grade6.teacher@example.test",
    displayName: "Grade 6 Teacher",
    profile: {
      displayName: "Grade 6 Teacher",
      contactEmail: "grade6.teacher@example.test",
      roles: ["academic", "behavior"],
      gradeLevels: ["6"],
      disabled: false
    }
  },
  {
    email: "grade7.teacher@example.test",
    displayName: "Grade 7 Teacher",
    profile: {
      displayName: "Grade 7 Teacher",
      contactEmail: "grade7.teacher@example.test",
      roles: ["academic", "behavior"],
      gradeLevels: ["7"],
      disabled: false
    }
  },
  {
    email: "disabled.teacher@example.test",
    displayName: "Disabled Teacher",
    profile: {
      displayName: "Disabled Teacher",
      contactEmail: "disabled.teacher@example.test",
      roles: ["academic", "behavior"],
      gradeLevels: ["6"],
      disabled: true
    }
  },
  {
    email: "owner@example.test",
    displayName: "QA Owner",
    profile: {
      displayName: "QA Owner",
      contactEmail: "owner@example.test",
      roles: ["owner", "academic", "behavior", "admin"],
      gradeLevels: ["6", "7", "8"],
      disabled: false
    }
  }
];

const students = [
  ["qa-6-academic", "AcademicSix QATest", "6", "QA6 North"],
  ["qa-6-behavior", "BehaviorSix QATest", "6", "QA6 South"],
  ["qa-7-academic", "AcademicSeven QATest", "7", "QA7"],
  ["qa-7-behavior", "BehaviorSeven QATest", "7", "QA7"],
  ["qa-8-academic", "AcademicEight QATest", "8", "QA8"],
  ["qa-8-behavior", "BehaviorEight QATest", "8", "QA8"]
];

const servedReteaches = [
  ["qa-r1", "qa-6-behavior", "BehaviorSix QATest", "6", "Disruption", "Classroom", "2026-08-18"],
  ["qa-r2", "qa-6-behavior", "BehaviorSix QATest", "6", "Disruption", "Hallway", "2026-08-25"],
  ["qa-r3", "qa-6-academic", "AcademicSix QATest", "6", "Off-Task Behavior", "Classroom", "2026-09-02"],
  ["qa-r4", "qa-6-academic", "AcademicSix QATest", "6", "Peer Conflict", "Cafeteria", "2026-09-08"],
  ["qa-r5", "qa-7-behavior", "BehaviorSeven QATest", "7", "Failure to Follow Directions", "Classroom", "2026-08-20"],
  ["qa-r6", "qa-7-behavior", "BehaviorSeven QATest", "7", "Peer Conflict", "Hallway", "2026-09-04"],
  ["qa-r7", "qa-7-academic", "AcademicSeven QATest", "7", "Technology Misuse", "Library", "2026-09-10"],
  ["qa-r8", "qa-8-behavior", "BehaviorEight QATest", "8", "Unsafe Behavior", "Gym", "2026-08-22"],
  ["qa-r9", "qa-8-behavior", "BehaviorEight QATest", "8", "Disrespectful Communication", "Cafeteria", "2026-08-28"],
  ["qa-r10", "qa-8-academic", "AcademicEight QATest", "8", "Unsafe Behavior", "Outside", "2026-09-03"]
];

const academicTasks = [
  ["qa-task-6-a", "qa-6-academic", "6", "ELA", "Synthetic essay revision", true],
  ["qa-task-6-b", "qa-6-academic", "6", "Math", "Synthetic practice set", true],
  ["qa-task-6-legacy", "qa-6-behavior", null, "ELA", "Synthetic legacy assignment", true],
  ["qa-task-7-a", "qa-7-academic", "7", "Science", "Synthetic lab reflection", true],
  ["qa-task-8-complete", "qa-8-academic", "8", "Social Studies", "Synthetic completed response", false]
];

async function createAuthUser(persona) {
  const response = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa-emulator`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: persona.email,
      password,
      displayName: persona.displayName,
      returnSecureToken: true
    })
  });
  if (!response.ok) throw new Error(`Could not create ${persona.email}: ${await response.text()}`);
  return response.json();
}

const clearAuth = await fetch(`${authBase}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
if (!clearAuth.ok) throw new Error(`Could not clear Auth emulator: ${await clearAuth.text()}`);

const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: await readFile("firestore.rules", "utf8")
  }
});

try {
  await environment.clearFirestore();
  const authUsers = [];
  for (const persona of personas) authUsers.push([persona, await createAuthUser(persona)]);

  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [persona, authUser] of authUsers) {
      await setDoc(doc(db, "teachers", authUser.localId), persona.profile);
    }
    for (const [id, displayName, grade, homeroom] of students) {
      await setDoc(doc(db, "students", id), {
        displayName,
        grade,
        homeroom,
        active: true,
        archived: false,
        externalStudentId: `QA-${id.toUpperCase()}`
      });
    }
    for (const [id, studentId, studentName, grade, context, location, date] of servedReteaches) {
      await setDoc(doc(db, "behaviorReteaches", id), {
        studentId,
        studentName,
        grade,
        homeroom: `QA${grade}`,
        assignedByUid: "qa-owner",
        assignedByName: "QA Owner",
        reteachDate: date,
        note: "Synthetic emulator-only analytics record.",
        location,
        context,
        schoolYear: "2026-2027",
        status: "served",
        createdAt: new Date(`${date}T12:00:00Z`),
        servedAt: new Date(`${date}T14:00:00Z`),
        servedByUid: "qa-owner",
        servedByName: "QA Owner"
      });
    }
    for (const [id, studentId, grade, subject, title, active] of academicTasks) {
      const task = {
        studentId,
        subject,
        title,
        active,
        state: active ? "not_started" : "completed",
        assignedBy: "qa-owner",
        teacher: "QA Owner",
        notes: "Synthetic emulator-only academic record.",
        assignedAt: new Date("2026-09-01T12:00:00Z"),
        lastUpdated: new Date("2026-09-01T12:00:00Z")
      };
      if (grade) task.grade = grade;
      await setDoc(doc(db, "tasks", id), task);
    }
  });
  console.log(`Seeded ${personas.length} QA personas, ${students.length} synthetic students, ${servedReteaches.length} served reteaches, and ${academicTasks.length} academic tasks.`);
} finally {
  await environment.cleanup();
}
