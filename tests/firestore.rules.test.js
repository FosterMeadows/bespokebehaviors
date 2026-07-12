import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "checkpoint-rules-test",
    firestore: { rules: await readFile("firestore.rules", "utf8") }
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "teachers", "grade6"), { roles: ["academic"], gradeLevels: ["6"], displayName: "Grade Six" });
    await setDoc(doc(db, "teachers", "owner"), { roles: ["owner"], gradeLevels: ["6", "7", "8"], displayName: "Owner" });
    await setDoc(doc(db, "students", "s6"), { displayName: "Six Student", grade: "6", homeroom: "A" });
    await setDoc(doc(db, "students", "s7"), { displayName: "Seven Student", grade: "7", homeroom: "B" });
    await setDoc(doc(db, "tasks", "t6"), { studentId: "s6", active: true, title: "Allowed" });
    await setDoc(doc(db, "tasks", "t7"), { studentId: "s7", active: true, title: "Denied" });
  });
});

after(async () => environment?.cleanup());

describe("grade-scoped Firestore rules", () => {
  it("allows assigned-grade records and denies other grades", async () => {
    const db = environment.authenticatedContext("grade6").firestore();
    await assertSucceeds(getDoc(doc(db, "students", "s6")));
    await assertFails(getDoc(doc(db, "students", "s7")));
    await assertSucceeds(getDoc(doc(db, "tasks", "t6")));
    await assertFails(getDoc(doc(db, "tasks", "t7")));
  });

  it("prevents teachers from changing roles or grade scope", async () => {
    const db = environment.authenticatedContext("grade6").firestore();
    await assertSucceeds(updateDoc(doc(db, "teachers", "grade6"), { displayName: "Updated Name" }));
    await assertFails(updateDoc(doc(db, "teachers", "grade6"), { roles: ["owner"] }));
    await assertFails(updateDoc(doc(db, "teachers", "grade6"), { gradeLevels: ["6", "7", "8"] }));
  });

  it("allows the owner to administer teacher access", async () => {
    const db = environment.authenticatedContext("owner").firestore();
    await assertSucceeds(updateDoc(doc(db, "teachers", "grade6"), { roles: ["academic", "behavior"], gradeLevels: ["6", "7"] }));
  });
});
