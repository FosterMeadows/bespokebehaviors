import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { cancelBehaviorReteach } from "../src/services/behaviorCancellation.js";
import { behaviorSummary } from "../src/utils/behaviorRecords.js";

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
    await setDoc(doc(db, "teachers", "behavior6"), { roles: ["behavior"], gradeLevels: ["6"], displayName: "Behavior Six" });
    await setDoc(doc(db, "teachers", "behavior6other"), { roles: ["behavior"], gradeLevels: ["6"], displayName: "Other Behavior Six" });
    await setDoc(doc(db, "teachers", "behavior7"), { roles: ["behavior"], gradeLevels: ["7"], displayName: "Behavior Seven" });
    await setDoc(doc(db, "teachers", "academic7"), { roles: ["academic"], gradeLevels: ["7"], displayName: "Academic Seven" });
    await setDoc(doc(db, "teachers", "admin"), { roles: ["admin"], gradeLevels: ["6", "7", "8"], displayName: "Administrator" });
    await setDoc(doc(db, "teachers", "mtss"), { roles: ["mtssLead"], gradeLevels: ["6", "7", "8"], displayName: "MTSS Lead" });
    await setDoc(doc(db, "teachers", "owner"), { roles: ["owner"], gradeLevels: ["6", "7", "8"], displayName: "Owner" });
    await setDoc(doc(db, "teachers", "pending"), { displayName: "Pending Teacher", contactEmail: "pending@example.org" });
    await setDoc(doc(db, "students", "s6"), { displayName: "Six Student", grade: "6", homeroom: "A" });
    await setDoc(doc(db, "students", "s7"), { displayName: "Seven Student", grade: "7", homeroom: "B" });
    await setDoc(doc(db, "tasks", "t6"), { studentId: "s6", grade: "6", active: true, title: "Allowed" });
    await setDoc(doc(db, "tasks", "t7"), { studentId: "s7", grade: "7", active: true, title: "Denied" });
  });
});

after(async () => environment?.cleanup());

describe("pending reteach cancellation", () => {
  const recordId = "cancel-test";
  const milestoneId = "s7_2026-2027";
  const staff = uid => ({ uid, name: uid === "admin" ? "Administrator" : "Assigning Teacher" });
  const details = { reason: "Elevated to Referral", note: "Handled through the referral process." };

  async function seed({ status = "pending", contact = null, legacy = false } = {}) {
    const createdAt = new Date("2026-08-20T12:00:00Z");
    const record = {
      studentId: "s7", studentName: "Seven Student", grade: "7", homeroom: "B",
      assignedByUid: "behavior6", assignedByName: "Assigning Teacher", reteachDate: "2026-08-20",
      note: "Reflect on classroom expectations.", location: "Classroom", context: "Disruption",
      status, createdAt, servedAt: null, servedByUid: null, servedByName: null,
      ...(legacy ? {} : { schoolYear: "2026-2027", homeContactRequired: Boolean(contact), postThreshold: false, servedPostThreshold: false })
    };
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "behaviorReteaches", recordId), record);
      if (!legacy) {
        await setDoc(doc(db, "behaviorReteachSummaries", recordId), behaviorSummary(record));
        await setDoc(doc(db, "behaviorHomeContactMilestones", milestoneId), {
          studentId: "s7", schoolYear: "2026-2027", assignmentCount: 3,
          thirdReteachReached: Boolean(contact), triggeringReteachId: contact ? recordId : null,
          lastReteachId: recordId, reachedAt: contact ? createdAt : null, createdAt, updatedAt: createdAt, grandfathered: false
        });
      }
      if (contact) await setDoc(doc(db, "behaviorHomeContactRequirements", recordId), {
        reteachId: recordId, studentId: "s7", studentName: record.studentName, grade: "7", homeroom: "B",
        assignedByUid: "behavior6", assignedByName: record.assignedByName, reteachDate: record.reteachDate,
        schoolYear: "2026-2027", status: contact, requiredAt: createdAt,
        contactedParty: contact === "completed" ? "Parent" : "", method: "", attemptDate: "", successful: null,
        note: "", recordedByUid: null, recordedByName: null, recordedAt: null, completedAt: null
      });
    });
    return record;
  }

  for (const uid of ["behavior6", "admin", "owner"]) {
    it(`allows ${uid} to cancel and preserves teacher-visible reasons and an audit`, async () => {
      await seed();
      const db = environment.authenticatedContext(uid).firestore();
      await assertSucceeds(cancelBehaviorReteach(db, recordId, details, staff(uid)));
      const teacherDb = environment.authenticatedContext("behavior6").firestore();
      const record = (await getDoc(doc(teacherDb, "behaviorReteaches", recordId))).data();
      assert.equal(record.status, "cancelled");
      assert.equal(record.cancelledByUid, uid);
      assert.equal(record.cancellationReason, details.reason);
      assert.equal(record.cancellationNote, details.note);
      assert.ok(record.cancelledAt.toMillis());
      assert.equal((await getDoc(doc(db, "behaviorReteachSummaries", recordId))).data().status, "cancelled");
      assert.equal((await getDoc(doc(db, "behaviorHomeContactMilestones", milestoneId))).data().assignmentCount, 2);
      const events = await getDocs(query(collection(teacherDb, "studentRecordEvents"), where("domain", "==", "behavior"), where("visibleToUids", "array-contains", "behavior6")));
      assert.equal(events.size, 1);
      assert.equal(events.docs[0].data().eventType, "reteachCancelled");
      // Summaries remain safe for schoolwide reading.
      assert.equal((await getDoc(doc(db, "behaviorReteachSummaries", recordId))).data().cancellationNote, undefined);
    });
  }

  it("denies a same-grade coworker, disabled assigner, and spoofed cancellation", async () => {
    await seed();
    const coworkerDb = environment.authenticatedContext("behavior7").firestore();
    await assert.rejects(cancelBehaviorReteach(coworkerDb, recordId, details, staff("behavior7")), /Only the assigning/);
    const updates = { status: "cancelled", cancelledAt: serverTimestamp(), cancelledByUid: "behavior7", cancelledByName: "Coworker", cancellationReason: details.reason, cancellationNote: "" };
    await assertFails(updateDoc(doc(coworkerDb, "behaviorReteaches", recordId), updates));
    await assertFails(updateDoc(doc(coworkerDb, "behaviorReteaches", recordId), { ...updates, assignedByUid: "behavior7" }));
    const adminDb = environment.authenticatedContext("admin").firestore();
    await assertFails(updateDoc(doc(adminDb, "behaviorReteaches", recordId), { ...updates, cancelledByUid: "behavior6" }));
    await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "teachers", "behavior6"), { disabled: true }));
    await assertFails(cancelBehaviorReteach(environment.authenticatedContext("behavior6").firestore(), recordId, details, staff("behavior6")));
  });

  it("withdraws a pending linked contact and rearms the third-assignment milestone", async () => {
    await seed({ contact: "pending" });
    const db = environment.authenticatedContext("behavior6").firestore();
    await assertSucceeds(cancelBehaviorReteach(db, recordId, details, staff("behavior6")));
    const contact = (await getDoc(doc(db, "behaviorHomeContactRequirements", recordId))).data();
    assert.equal(contact.status, "cancelled");
    assert.equal(contact.cancellationReason, details.reason);
    const milestone = (await getDoc(doc(db, "behaviorHomeContactMilestones", milestoneId))).data();
    assert.equal(milestone.assignmentCount, 2);
    assert.equal(milestone.thirdReteachReached, false);
    assert.equal(milestone.triggeringReteachId, null);
    await assertFails(updateDoc(doc(db, "behaviorHomeContactRequirements", recordId), { status: "completed", contactedParty: "Parent", method: "Email", attemptDate: "2026-08-27", successful: true, recordedByUid: "behavior6" }));
    // A later assignment must still be permitted to trigger the next contact.
    const record = (await getDoc(doc(db, "behaviorReteaches", recordId))).data();
    const { cancelledAt, cancelledByUid, cancelledByName, cancellationReason, cancellationNote, ...nextRecord } = record;
    assert.ok(cancelledAt && cancelledByUid && cancelledByName && cancellationReason && cancellationNote);
    nextRecord.status = "pending";
    nextRecord.thresholdAcknowledged = false;
    nextRecord.servedCountAtAssignment = 0;
    const batch = writeBatch(db);
    batch.set(doc(db, "behaviorReteaches", "next"), nextRecord);
    batch.update(doc(db, "behaviorHomeContactMilestones", milestoneId), { assignmentCount: 3, thirdReteachReached: true, triggeringReteachId: "next", lastReteachId: "next", reachedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });

  it("preserves completed contacts and the reached milestone", async () => {
    await seed({ contact: "completed" });
    const db = environment.authenticatedContext("admin").firestore();
    await assertSucceeds(cancelBehaviorReteach(db, recordId, details, staff("admin")));
    assert.equal((await getDoc(doc(db, "behaviorHomeContactRequirements", recordId))).data().status, "completed");
    assert.equal((await getDoc(doc(db, "behaviorHomeContactMilestones", milestoneId))).data().thirdReteachReached, true);
  });

  it("supports legacy pending records without a summary or milestone", async () => {
    await seed({ legacy: true });
    const db = environment.authenticatedContext("admin").firestore();
    await assertSucceeds(cancelBehaviorReteach(db, recordId, { reason: "Assigned in Error" }, staff("admin")));
    assert.equal((await getDoc(doc(db, "behaviorReteachSummaries", recordId))).data().status, "cancelled");
  });

  it("validates reasons and refuses partial cancellation writes", async () => {
    await seed({ contact: "pending" });
    const db = environment.authenticatedContext("admin").firestore();
    for (const invalid of [{ reason: "Unknown" }, { reason: "Other", note: "   " }, { reason: "Duplicate", note: "x".repeat(501) }]) {
      await assert.rejects(cancelBehaviorReteach(db, recordId, invalid, staff("admin")));
    }
    await assertFails(updateDoc(doc(db, "behaviorReteaches", recordId), { status: "cancelled", cancelledAt: serverTimestamp(), cancelledByUid: "admin", cancelledByName: "Administrator", cancellationReason: "Duplicate", cancellationNote: "" }));
    await assertSucceeds(cancelBehaviorReteach(db, recordId, { reason: "Other", note: "Alternative response agreed." }, staff("admin")));
    await assert.rejects(cancelBehaviorReteach(db, recordId, details, staff("admin")), /Only pending/);
    await assertFails(updateDoc(doc(db, "behaviorReteaches", recordId), { status: "served" }));
    await assertFails(updateDoc(doc(db, "behaviorReteaches", recordId), { status: "pending" }));
    await assertFails(deleteDoc(doc(db, "behaviorReteaches", recordId)));
  });

  it("refuses cancellation of a served record", async () => {
    await seed({ status: "served" });
    const db = environment.authenticatedContext("admin").firestore();
    await assert.rejects(cancelBehaviorReteach(db, recordId, details, staff("admin")), /Only pending/);
    await assertFails(updateDoc(doc(db, "behaviorReteaches", recordId), { status: "cancelled", cancelledAt: serverTimestamp(), cancelledByUid: "admin", cancelledByName: "Administrator", cancellationReason: "Duplicate", cancellationNote: "" }));
  });

  it("allows only one winner when service and cancellation race", async () => {
    await seed();
    const db = environment.authenticatedContext("admin").firestore();
    const outcomes = await Promise.allSettled([
      cancelBehaviorReteach(db, recordId, details, staff("admin")),
      updateDoc(doc(db, "behaviorReteaches", recordId), { status: "served", servedAt: serverTimestamp(), servedByUid: "admin", servedByName: "Administrator" })
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  });

  it("keeps normal staff service and undo working with synchronized summaries", async () => {
    const record = await seed();
    const db = environment.authenticatedContext("behavior7").firestore();
    const serve = { status: "served", servedAt: serverTimestamp(), servedByUid: "behavior7", servedByName: "Behavior Seven", servedPostThreshold: false };
    const servedBatch = writeBatch(db);
    servedBatch.update(doc(db, "behaviorReteaches", recordId), serve);
    servedBatch.set(doc(db, "behaviorReteachSummaries", recordId), behaviorSummary({ ...record, ...serve }));
    await assertSucceeds(servedBatch.commit());
    const pending = { status: "pending", servedAt: null, servedByUid: null, servedByName: null, servedPostThreshold: false };
    const undoBatch = writeBatch(db);
    undoBatch.update(doc(db, "behaviorReteaches", recordId), pending);
    undoBatch.set(doc(db, "behaviorReteachSummaries", recordId), behaviorSummary({ ...record, ...pending }));
    await assertSucceeds(undoBatch.commit());
  });

  it("does not reset another reteach's pending contact when cancelling an earlier assignment", async () => {
    await seed({ contact: "pending" });
    await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "behaviorHomeContactMilestones", milestoneId), { triggeringReteachId: "different-reteach" }));
    const db = environment.authenticatedContext("admin").firestore();
    await assertSucceeds(cancelBehaviorReteach(db, recordId, details, staff("admin")));
    const milestone = (await getDoc(doc(db, "behaviorHomeContactMilestones", milestoneId))).data();
    assert.equal(milestone.thirdReteachReached, true);
    assert.equal(milestone.triggeringReteachId, "different-reteach");
    assert.equal(milestone.assignmentCount, 2);
  });
});

describe("grade-scoped Firestore rules", () => {
  it("allows schoolwide analytics while denying an unscoped teacher query", async () => {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "behaviorReteaches", "analytics-six"), {
        studentId: "s6", studentName: "Six Student", grade: "6", status: "served",
        context: "Disruption", location: "Classroom", assignedByUid: "behavior6"
      });
      await setDoc(doc(db, "behaviorReteaches", "analytics-seven"), {
        studentId: "s7", studentName: "Seven Student", grade: "7", status: "served",
        context: "Peer Conflict", location: "Hallway", assignedByUid: "behavior7"
      });
    });

    const mtssDb = environment.authenticatedContext("mtss").firestore();
    const schoolwide = await assertSucceeds(getDocs(collection(mtssDb, "behaviorReteaches")));
    assert.equal(schoolwide.size, 2);
    await assertFails(getDocs(collection(environment.authenticatedContext("behavior6").firestore(), "behaviorReteaches")));
  });

  it("allows a regular teacher to create seven student tasks atomically", async () => {
    const studentIds = Array.from({ length: 7 }, (_, index) => `batch-s6-${index}`);
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await Promise.all(studentIds.map((studentId, index) => setDoc(doc(db, "students", studentId), {
        displayName: `Batch Student ${index}`,
        grade: "6",
        homeroom: "A"
      })));
    });

    const teacherDb = environment.authenticatedContext("grade6").firestore();
    const batch = writeBatch(teacherDb);
    studentIds.forEach((studentId, index) => batch.set(doc(teacherDb, "tasks", `batch-task-${index}`), {
      studentId,
      active: true,
      grade: "6",
      subject: "ELA",
      title: "Shared assignment"
    }));
    await assertSucceeds(batch.commit());

    const ownerDb = environment.authenticatedContext("owner").firestore();
    const snapshot = await getDocs(query(collection(ownerDb, "tasks"), where("studentId", "in", studentIds)));
    assert.equal(snapshot.size, 7);
  });

  it("loads a regular teacher's active assignments in one grade-scoped query", async () => {
    const studentIds = Array.from({ length: 12 }, (_, index) => `bulk-s6-${index}`);
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await Promise.all(studentIds.flatMap((studentId, index) => [
        setDoc(doc(db, "students", studentId), { displayName: `Student ${index}`, grade: "6", homeroom: "A" }),
        setDoc(doc(db, "tasks", `bulk-task-${index}`), { studentId, grade: "6", active: true, title: `Task ${index}` })
      ]));
    });

    const db = environment.authenticatedContext("grade6").firestore();
    const snapshot = await assertSucceeds(getDocs(query(
      collection(db, "tasks"),
      where("active", "==", true),
      where("grade", "in", ["6"])
    )));
    assert.equal(snapshot.size, 13);
    await assertFails(getDocs(query(
      collection(db, "tasks"),
      where("active", "==", true)
    )));
    await assertFails(getDocs(query(
      collection(db, "tasks"),
      where("active", "==", true),
      where("grade", "in", ["7"])
    )));
  });

  it("allows assigned-grade records and denies other grades", async () => {
    const db = environment.authenticatedContext("grade6").firestore();
    await assertSucceeds(getDoc(doc(db, "students", "s6")));
    await assertFails(getDoc(doc(db, "students", "s7")));
    await assertSucceeds(getDoc(doc(db, "tasks", "t6")));
    await assertFails(getDoc(doc(db, "tasks", "t7")));
    await assertFails(updateDoc(doc(db, "tasks", "t6"), { grade: "7" }));
    await assertFails(updateDoc(doc(db, "tasks", "t6"), { studentId: "s7" }));
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

  it("records an immutable owner audit when teacher access is provisioned", async () => {
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const teacherDb = environment.authenticatedContext("grade6").firestore();
    const occurredAt = new Date("2026-08-07T13:00:00Z");
    const event = {
      action: "teacherAccessUpdated",
      targetUid: "pending",
      targetName: "Pending Teacher",
      targetEmail: "pending@example.org",
      previousRoles: [],
      previousGradeLevels: [],
      previousDisabled: false,
      nextRoles: ["academic", "behavior"],
      nextGradeLevels: ["6"],
      nextDisabled: false,
      actorUid: "owner",
      actorName: "Owner",
      occurredAt
    };

    const batch = writeBatch(ownerDb);
    batch.update(doc(ownerDb, "teachers", "pending"), {
      roles: ["academic", "behavior"],
      gradeLevels: ["6"],
      disabled: false
    });
    batch.set(doc(ownerDb, "teacherAccessEvents", "grant-1"), event);
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(ownerDb, "teacherAccessEvents", "grant-1")));
    await assertFails(updateDoc(doc(ownerDb, "teacherAccessEvents", "grant-1"), {
      nextGradeLevels: ["6", "7", "8"]
    }));
    await assertFails(setDoc(doc(teacherDb, "teacherAccessEvents", "forged"), {
      ...event,
      actorUid: "grade6"
    }));
  });

  it("accepts only privacy-safe client diagnostics", async () => {
    const pendingDb = environment.authenticatedContext("pending").firestore();
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const teacherDb = environment.authenticatedContext("grade6").firestore();
    const safeError = {
      reference: "BB-ABC123",
      userUid: "pending",
      route: "/",
      source: "window-error",
      category: "TypeError",
      release: "2026-08-onboarding",
      online: true,
      userAgent: "Test Browser",
      occurredAt: new Date("2026-08-07T13:05:00Z")
    };

    await assertSucceeds(setDoc(doc(pendingDb, "clientErrors", "safe"), safeError));
    const diagnostic = { ...safeError, cause: "permission", operation: "behavior-count", codeLocation: "/assets/index-Abc123.js:12:34 | /assets/index-Abc123.js:56:78" };
    await assertSucceeds(setDoc(doc(pendingDb, "clientErrors", "diagnostic"), diagnostic));
    for (const field of ["cause", "operation", "codeLocation"]) {
      await assertFails(setDoc(doc(pendingDb, "clientErrors", `unsafe-${field}`), { ...diagnostic, [field]: "Student Jane Doe" }));
    }

    await assertFails(setDoc(doc(pendingDb, "clientErrors", "raw-message"), {
      ...safeError,
      message: "Student Jane Doe failed assignment 4"
    }));
    await assertFails(setDoc(doc(pendingDb, "clientErrors", "spoofed-user"), {
      ...safeError,
      userUid: "owner"
    }));
    await assertFails(updateDoc(doc(pendingDb, "clientErrors", "safe"), {
      category: "Changed"
    }));
    await assertSucceeds(getDoc(doc(ownerDb, "clientErrors", "safe")));
    await assertFails(getDoc(doc(teacherDb, "clientErrors", "safe")));
  });

  it("accepts private staff support reports and limits the admin feed", async () => {
    const pendingDb = environment.authenticatedContext("pending").firestore();
    const teacherDb = environment.authenticatedContext("grade6").firestore();
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const report = {
      reference: "SUP-ABC12345",
      reporterUid: "pending",
      reporterName: "Pending Teacher",
      reporterEmail: "pending@example.org",
      issue: "The page did not open after I selected the workspace.",
      attempted: "Open the Academic workspace.",
      route: "/academic",
      release: "2026-08-support",
      online: true,
      userAgent: "Test Browser",
      status: "open",
      createdAt: new Date("2026-08-09T13:05:00Z"),
      resolvedAt: null,
      resolvedByUid: null,
      resolvedByName: null
    };

    await assertSucceeds(setDoc(doc(pendingDb, "supportReports", "safe"), report));
    await assertFails(setDoc(doc(pendingDb, "supportReports", "spoofed"), {
      ...report,
      reporterUid: "owner"
    }));
    await assertSucceeds(getDoc(doc(ownerDb, "supportReports", "safe")));
    await assertFails(getDoc(doc(teacherDb, "supportReports", "safe")));
    await assertFails(updateDoc(doc(teacherDb, "supportReports", "safe"), { status: "resolved" }));
    await assertSucceeds(updateDoc(doc(ownerDb, "supportReports", "safe"), {
      status: "resolved",
      resolvedAt: new Date("2026-08-09T13:15:00Z"),
      resolvedByUid: "owner",
      resolvedByName: "Owner"
    }));
  });

  it("keeps command-center standards and sequences private to the owner", async () => {
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const adminDb = environment.authenticatedContext("admin").firestore();
    const mtssDb = environment.authenticatedContext("mtss").firestore();
    const teacherDb = environment.authenticatedContext("grade6").firestore();
    const standardPath = ["teacherCommandCenters", "owner", "standards", "ELA.8.1"];

    await assertSucceeds(setDoc(doc(ownerDb, ...standardPath), {
      standardCode: "ELA.8.1",
      packageId: "ela8",
      status: "introduced",
      lastTouchedDate: "2026-07-22",
      updatedByUid: "owner"
    }));
    await assertSucceeds(setDoc(doc(ownerDb, ...standardPath, "entries", "entry-1"), {
      standardCode: "ELA.8.1",
      status: "introduced",
      date: "2026-07-22",
      note: "Modeled citing the strongest evidence.",
      createdByUid: "owner"
    }));
    await assertSucceeds(getDocs(collection(ownerDb, "teacherCommandCenters", "owner", "standards")));
    await assertSucceeds(getDoc(doc(ownerDb, ...standardPath, "entries", "entry-1")));
    await assertSucceeds(setDoc(doc(ownerDb, "teacherCommandCenters", "owner", "sequences", "sequence-1"), {
      title: "Evidence sequence",
      status: "active",
      createdByUid: "owner"
    }));
    await assertSucceeds(getDocs(collection(ownerDb, "teacherCommandCenters", "owner", "sequences")));

    for (const name of ["plannerSettings", "winWeeks", "elaWeeks", "plannerTasks", "instructionEvents", "instructionReports"]) {
      const path = ["teacherCommandCenters", "owner", name, "planner-test"];
      await assertSucceeds(setDoc(doc(ownerDb, ...path), { title: "Owner planning record" }));
      await assertSucceeds(getDoc(doc(ownerDb, ...path)));
      for (const deniedDb of [adminDb, mtssDb, teacherDb, environment.unauthenticatedContext().firestore()]) {
        await assertFails(getDoc(doc(deniedDb, ...path)));
        await assertFails(getDocs(collection(deniedDb, "teacherCommandCenters", "owner", name)));
        await assertFails(setDoc(doc(deniedDb, ...path), { title: "Denied" }));
      }
      await assertFails(setDoc(doc(ownerDb, "teacherCommandCenters", "another-owner", name, "planner-test"), { title: "Wrong owner" }));
    }

    for (const deniedDb of [adminDb, mtssDb, teacherDb]) {
      await assertFails(getDoc(doc(deniedDb, ...standardPath)));
      await assertFails(getDocs(collection(deniedDb, "teacherCommandCenters", "owner", "standards")));
      await assertFails(setDoc(doc(deniedDb, ...standardPath), {
        standardCode: "ELA.8.1",
        status: "assessed",
        lastTouchedDate: "2026-07-23",
        updatedByUid: "not-owner"
      }));
      await assertFails(getDoc(doc(deniedDb, "teacherCommandCenters", "owner", "sequences", "sequence-1")));
      await assertFails(getDocs(collection(deniedDb, "teacherCommandCenters", "owner", "sequences")));
      await assertFails(setDoc(doc(deniedDb, "teacherCommandCenters", "owner", "sequences", "blocked"), {
        title: "Blocked sequence",
        status: "active"
      }));
    }
  });

  it("blocks post-threshold reteach creation for normal staff", async () => {
    const behaviorDb = environment.authenticatedContext("behavior6").firestore();
    const ownerDb = environment.authenticatedContext("owner").firestore();

    await assertSucceeds(setDoc(doc(behaviorDb, "behaviorReteaches", "sixth"), {
      studentId: "s6",
      assignedByUid: "behavior6",
      grade: "6",
      postThreshold: false,
      thresholdAcknowledged: false,
      servedCountAtAssignment: 5
    }));
    await assertFails(setDoc(doc(behaviorDb, "behaviorReteaches", "blocked-count"), {
      studentId: "s6",
      assignedByUid: "behavior6",
      grade: "6",
      postThreshold: false,
      thresholdAcknowledged: false,
      servedCountAtAssignment: 6
    }));
    await assertFails(setDoc(doc(behaviorDb, "behaviorReteaches", "blocked-override"), {
      studentId: "s6",
      assignedByUid: "behavior6",
      grade: "6",
      postThreshold: true,
      thresholdAcknowledged: true,
      servedCountAtAssignment: 6
    }));
    await assertSucceeds(setDoc(doc(ownerDb, "behaviorReteaches", "owner-override"), {
      studentId: "s6",
      assignedByUid: "owner",
      grade: "6",
      postThreshold: true,
      thresholdAcknowledged: true,
      servedCountAtAssignment: 6
    }));
  });

  it("allows schoolwide assignment while protecting cross-grade notes", async () => {
    const creatorDb = environment.authenticatedContext("behavior6").firestore();
    const otherGradeSixDb = environment.authenticatedContext("behavior6other").firestore();
    const gradeSevenDb = environment.authenticatedContext("behavior7").firestore();
    const createdAt = new Date("2026-07-14T12:00:00Z");
    const fullRecord = {
      studentId: "s7",
      studentName: "Seven Student",
      grade: "7",
      homeroom: "B",
      assignedByUid: "behavior6",
      assignedByName: "Behavior Six",
      reteachDate: "2026-07-14",
      note: "Private written reteach text",
      location: "Classroom",
      context: "Procedures",
      postThreshold: false,
      thresholdAcknowledged: false,
      thresholdAcknowledgedAt: null,
      servedCountAtAssignment: 2,
      status: "pending",
      createdAt,
      servedAt: null,
      servedByUid: null,
      servedByName: null,
      servedPostThreshold: false
    };
    const summary = {
      studentId: fullRecord.studentId,
      studentName: fullRecord.studentName,
      grade: fullRecord.grade,
      homeroom: fullRecord.homeroom,
      assignedByUid: fullRecord.assignedByUid,
      assignedByName: fullRecord.assignedByName,
      reteachDate: fullRecord.reteachDate,
      location: fullRecord.location,
      context: fullRecord.context,
      postThreshold: fullRecord.postThreshold,
      status: fullRecord.status,
      createdAt: fullRecord.createdAt,
      servedAt: fullRecord.servedAt,
      servedByUid: fullRecord.servedByUid,
      servedByName: fullRecord.servedByName,
      servedPostThreshold: fullRecord.servedPostThreshold
    };

    await assertSucceeds(getDoc(doc(creatorDb, "students", "s7")));
    const batch = writeBatch(creatorDb);
    batch.set(doc(creatorDb, "behaviorReteaches", "cross-grade"), fullRecord);
    batch.set(doc(creatorDb, "behaviorReteachSummaries", "cross-grade"), summary);
    await assertSucceeds(batch.commit());

    await assertSucceeds(getDoc(doc(creatorDb, "behaviorReteaches", "cross-grade")));
    await assertSucceeds(getDocs(query(
      collection(creatorDb, "behaviorReteaches"),
      where("assignedByUid", "==", "behavior6")
    )));
    await assertSucceeds(getDoc(doc(gradeSevenDb, "behaviorReteaches", "cross-grade")));
    await assertFails(getDoc(doc(otherGradeSixDb, "behaviorReteaches", "cross-grade")));
    const safeSnapshot = await getDoc(doc(otherGradeSixDb, "behaviorReteachSummaries", "cross-grade"));
    assert.equal(safeSnapshot.exists(), true);
    assert.equal(Object.hasOwn(safeSnapshot.data(), "note"), false);
    const gradeSevenQueue = await assertSucceeds(getDocs(query(
      collection(gradeSevenDb, "behaviorReteachSummaries"),
      where("status", "==", "pending"),
      where("grade", "in", ["7"])
    )));
    assert.deepEqual(gradeSevenQueue.docs.map(item => item.id), ["cross-grade"]);
    await assertFails(updateDoc(doc(creatorDb, "behaviorReteachSummaries", "cross-grade"), {
      note: fullRecord.note
    }));
  });

  it("allows sanitized backfill for legacy reteaches without threshold fields", async () => {
    const createdAt = new Date("2026-06-01T12:00:00Z");
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "behaviorReteaches", "legacy"), {
        studentId: "s6",
        studentName: "Six Student",
        grade: "6",
        homeroom: "A",
        assignedByUid: "behavior6",
        assignedByName: "Behavior Six",
        reteachDate: "2026-06-01",
        note: "Legacy private note",
        location: "Classroom",
        context: "Procedures",
        status: "served",
        createdAt,
        servedAt: createdAt,
        servedByUid: "behavior6",
        servedByName: "Behavior Six"
      });
    });

    const ownerDb = environment.authenticatedContext("owner").firestore();
    await assertSucceeds(setDoc(doc(ownerDb, "behaviorReteachSummaries", "legacy"), {
      studentId: "s6",
      studentName: "Six Student",
      grade: "6",
      homeroom: "A",
      assignedByUid: "behavior6",
      assignedByName: "Behavior Six",
      reteachDate: "2026-06-01",
      location: "Classroom",
      context: "Procedures",
      postThreshold: false,
      status: "served",
      createdAt,
      servedAt: createdAt,
      servedByUid: "behavior6",
      servedByName: "Behavior Six",
      servedPostThreshold: false
    }));
  });

  it("creates and protects a third-reteach home contact requirement", async () => {
    const createdAt = new Date("2026-07-14T14:00:00Z");
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "behaviorHomeContactMilestones", "s6_2025-2026"), {
        studentId: "s6",
        schoolYear: "2025-2026",
        assignmentCount: 2,
        thirdReteachReached: false,
        lastReteachId: "prior",
        createdAt,
        updatedAt: createdAt,
        grandfathered: false
      });
    });

    const creatorDb = environment.authenticatedContext("behavior6").firestore();
    const otherTeacherDb = environment.authenticatedContext("behavior6other").firestore();
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const fullRecord = {
      studentId: "s6",
      studentName: "Six Student",
      grade: "6",
      homeroom: "A",
      assignedByUid: "behavior6",
      assignedByName: "Behavior Six",
      reteachDate: "2026-07-14",
      note: "Private note",
      location: "Classroom",
      context: "Procedures",
      schoolYear: "2025-2026",
      homeContactRequired: true,
      postThreshold: false,
      thresholdAcknowledged: false,
      thresholdAcknowledgedAt: null,
      servedCountAtAssignment: 2,
      status: "pending",
      createdAt,
      servedAt: null,
      servedByUid: null,
      servedByName: null,
      servedPostThreshold: false
    };
    const summary = {
      studentId: "s6",
      studentName: "Six Student",
      grade: "6",
      homeroom: "A",
      assignedByUid: "behavior6",
      assignedByName: "Behavior Six",
      reteachDate: "2026-07-14",
      location: "Classroom",
      context: "Procedures",
      postThreshold: false,
      status: "pending",
      createdAt,
      servedAt: null,
      servedByUid: null,
      servedByName: null,
      servedPostThreshold: false
    };
    const requirement = {
      reteachId: "third-contact",
      studentId: "s6",
      studentName: "Six Student",
      grade: "6",
      homeroom: "A",
      assignedByUid: "behavior6",
      assignedByName: "Behavior Six",
      reteachDate: "2026-07-14",
      schoolYear: "2025-2026",
      status: "pending",
      requiredAt: createdAt,
      contactedParty: "",
      method: "",
      attemptDate: "",
      successful: null,
      note: "",
      recordedByUid: null,
      recordedByName: null,
      recordedAt: null,
      completedAt: null
    };

    const batch = writeBatch(creatorDb);
    batch.set(doc(creatorDb, "behaviorReteaches", "third-contact"), fullRecord);
    batch.set(doc(creatorDb, "behaviorReteachSummaries", "third-contact"), summary);
    batch.update(doc(creatorDb, "behaviorHomeContactMilestones", "s6_2025-2026"), {
      assignmentCount: 3,
      thirdReteachReached: true,
      lastReteachId: "third-contact",
      updatedAt: createdAt,
      reachedAt: createdAt,
      triggeringReteachId: "third-contact",
      grandfathered: false
    });
    batch.set(doc(creatorDb, "behaviorHomeContactRequirements", "third-contact"), requirement);
    await assertSucceeds(batch.commit());

    await assertSucceeds(getDoc(doc(creatorDb, "behaviorHomeContactRequirements", "third-contact")));
    await assertSucceeds(getDoc(doc(otherTeacherDb, "behaviorHomeContactRequirements", "third-contact")));
    await assertSucceeds(getDoc(doc(ownerDb, "behaviorHomeContactRequirements", "third-contact")));
    await assertSucceeds(updateDoc(doc(creatorDb, "behaviorHomeContactRequirements", "third-contact"), {
      status: "completed",
      contactedParty: "Parent",
      method: "Phone Call",
      attemptDate: "2026-07-15",
      successful: false,
      note: "No answer; voicemail left.",
      recordedByUid: "behavior6",
      recordedByName: "Behavior Six",
      recordedAt: createdAt,
      completedAt: createdAt
    }));
    await assertFails(updateDoc(doc(otherTeacherDb, "behaviorHomeContactRequirements", "third-contact"), {
      status: "completed",
      contactedParty: "Parent",
      method: "Email",
      attemptDate: "2026-07-15",
      successful: true,
      recordedByUid: "behavior6other"
    }));
  });

  it("limits dated behavior buybacks to admin and owner accounts", async () => {
    const ownerDb = environment.authenticatedContext("owner").firestore();
    const teacherDb = environment.authenticatedContext("behavior6").firestore();
    const buyback = {
      studentId: "s6",
      studentName: "Six Student",
      grade: "6",
      homeroom: "A",
      buybackDate: "2026-07-14",
      schoolYear: "2025-2026",
      recordedByUid: "owner",
      recordedByName: "Owner",
      recordedAt: new Date("2026-07-14T16:00:00Z")
    };

    await assertSucceeds(setDoc(doc(ownerDb, "behaviorBuybacks", "buyback-1"), buyback));
    await assertSucceeds(getDoc(doc(teacherDb, "behaviorBuybacks", "buyback-1")));
    await assertFails(setDoc(doc(teacherDb, "behaviorBuybacks", "buyback-2"), {
      ...buyback,
      recordedByUid: "behavior6",
      recordedByName: "Behavior Six"
    }));
  });

  it("shares the daily Academic roster and session only with Academic staff", async () => {
    const academicDb = environment.authenticatedContext("grade6").firestore();
    const behaviorDb = environment.authenticatedContext("behavior6").firestore();
    await assertSucceeds(setDoc(doc(academicDb, "deck", "2026-07-13_6-north"), {
      date: "2026-07-13",
      laneId: "6-north",
      grade: "6",
      createdBy: "grade6",
      items: ["s6"]
    }));
    await assertSucceeds(setDoc(doc(academicDb, "academicSessions", "2026-07-13_6-north"), {
      date: "2026-07-13",
      laneId: "6-north",
      grade: "6",
      status: "live",
      roster: ["s6"]
    }));
    await assertSucceeds(getDoc(doc(academicDb, "deck", "2026-07-13_6-north")));
    await assertSucceeds(getDoc(doc(academicDb, "academicSessions", "2026-07-13_6-north")));
    await assertFails(getDoc(doc(behaviorDb, "deck", "2026-07-13_6-north")));
    await assertFails(getDoc(doc(behaviorDb, "academicSessions", "2026-07-13_6-north")));

    const academic7Db = environment.authenticatedContext("academic7").firestore();
    await assertFails(getDoc(doc(academicDb, "deck", "2026-07-13_7")));
    await assertFails(setDoc(doc(academicDb, "deck", "2026-07-13_7"), {
      date: "2026-07-13", laneId: "7", grade: "7", createdBy: "grade6", items: ["s7"]
    }));
    await assertSucceeds(setDoc(doc(academic7Db, "deck", "2026-07-13_7"), {
      date: "2026-07-13", laneId: "7", grade: "7", createdBy: "academic7", items: ["s7"]
    }));
    await assertFails(setDoc(doc(academicDb, "deck", "2026-07-13_7"), {
      date: "2026-07-13", laneId: "7", grade: "6", createdBy: "grade6", items: ["s6"]
    }));
  });

  it("keeps immutable student record events inside student scope", async () => {
    const gradeSixDb = environment.authenticatedContext("grade6").firestore();
    const behaviorSixDb = environment.authenticatedContext("behavior6").firestore();
    const behaviorSevenDb = environment.authenticatedContext("behavior7").firestore();
    const occurredAt = new Date("2026-07-14T16:00:00Z");

    const academicEvent = {
      studentId: "s6",
      domain: "academic",
      eventType: "attendanceMarked",
      summary: "Marked present",
      sourceCollection: "attendance",
      sourceId: "s6_2026-07-14",
      schoolYear: "2025-2026",
      details: { date: "2026-07-14" },
      actorUid: "grade6",
      actorName: "Grade Six",
      visibleToUids: ["grade6"],
      occurredAt
    };
    await assertSucceeds(setDoc(doc(gradeSixDb, "studentRecordEvents", "academic-s6"), academicEvent));
    await assertSucceeds(getDoc(doc(gradeSixDb, "studentRecordEvents", "academic-s6")));
    await assertFails(updateDoc(doc(gradeSixDb, "studentRecordEvents", "academic-s6"), { summary: "Changed" }));

    const crossGradeBehaviorEvent = {
      ...academicEvent,
      studentId: "s7",
      domain: "behavior",
      eventType: "reteachAssigned",
      actorUid: "behavior6",
      actorName: "Behavior Six",
      visibleToUids: ["behavior6"]
    };
    await assertSucceeds(setDoc(doc(behaviorSixDb, "studentRecordEvents", "behavior-s7"), crossGradeBehaviorEvent));
    await assertSucceeds(getDoc(doc(behaviorSixDb, "studentRecordEvents", "behavior-s7")));
    await assertSucceeds(getDoc(doc(behaviorSevenDb, "studentRecordEvents", "behavior-s7")));
    await assertFails(getDoc(doc(gradeSixDb, "studentRecordEvents", "behavior-s7")));
  });
});

describe("AI analysis access", () => {
  async function seedAnalysis() {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "behaviorAnalyses", "saved-analysis"), { result: { themes: [] }, sourceFingerprint: "test" });
      await setDoc(doc(context.firestore(), "behaviorAnalysisControl", "school"), { dailyAttempts: 1 });
      await setDoc(doc(context.firestore(), "teachers", "disabledAdmin"), { roles: ["admin"], disabled: true });
    });
  }

  it("allows only enabled schoolwide staff to read saved analysis", async () => {
    await seedAnalysis();
    for (const uid of ["admin", "owner", "mtss"]) await assertSucceeds(getDoc(doc(environment.authenticatedContext(uid).firestore(), "behaviorAnalyses", "saved-analysis")));
    for (const uid of ["grade6", "behavior6", "pending", "disabledAdmin"]) await assertFails(getDoc(doc(environment.authenticatedContext(uid).firestore(), "behaviorAnalyses", "saved-analysis")));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "behaviorAnalyses", "saved-analysis")));
  });

  it("denies client creation, edits, deletion, and all lock access even to owners", async () => {
    await seedAnalysis();
    for (const uid of ["owner", "admin", "behavior6"]) {
      const db = environment.authenticatedContext(uid).firestore();
      await assertFails(setDoc(doc(db, "behaviorAnalyses", "fake"), { result: {} }));
      await assertFails(updateDoc(doc(db, "behaviorAnalyses", "saved-analysis"), { sourceFingerprint: "spoofed" }));
      await assertFails(deleteDoc(doc(db, "behaviorAnalyses", "saved-analysis")));
      await assertFails(getDoc(doc(db, "behaviorAnalysisControl", "school")));
      await assertFails(setDoc(doc(db, "behaviorAnalysisControl", "school"), { dailyAttempts: 0 }));
    }
  });
});
