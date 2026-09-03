import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { canCancelBehaviorReteach } from "../utils/access.js";
import { behaviorSchoolYear, behaviorSummary, CANCELLATION_REASONS } from "../utils/behaviorRecords.js";

// Accept the database explicitly so the real transaction can also run in emulator tests.
export async function cancelBehaviorReteach(db, recordId, details, staff) {
  if (!recordId || !staff?.uid) throw new Error("A reteach and signed-in staff member are required.");
  const reason = details?.reason;
  const note = String(details?.note || "").trim();
  if (!CANCELLATION_REASONS.includes(reason)) throw new Error("Select a cancellation reason.");
  if (reason === "Other" && !note) throw new Error("Explain why this reteach is being cancelled.");
  if (note.length > 500) throw new Error("Cancellation details must be 500 characters or fewer.");

  const recordRef = doc(db, "behaviorReteaches", recordId);
  const eventRef = doc(collection(db, "studentRecordEvents"));
  return runTransaction(db, async transaction => {
    const recordSnap = await transaction.get(recordRef);
    if (!recordSnap.exists()) throw new Error("This reteach could not be found.");
    const record = recordSnap.data();
    if (record.status !== "pending") throw new Error("Only pending reteaches can be cancelled. This reteach has already changed.");
    const profileSnap = await transaction.get(doc(db, "teachers", staff.uid));
    if (!canCancelBehaviorReteach(profileSnap.data(), staff.uid, record)) {
      throw new Error("Only the assigning teacher or an admin can cancel this reteach.");
    }

    const schoolYear = record.schoolYear || behaviorSchoolYear(record.reteachDate || record.createdAt);
    const milestoneRef = doc(db, "behaviorHomeContactMilestones", `${record.studentId}_${schoolYear}`);
    const milestoneSnap = await transaction.get(milestoneRef);
    // Legacy records without a contact obligation have no requirement document.
    const requirementRef = doc(db, "behaviorHomeContactRequirements", recordId);
    const requirementSnap = record.homeContactRequired ? await transaction.get(requirementRef) : null;
    const withdrawContact = requirementSnap?.exists() && requirementSnap.data().status === "pending";
    const now = serverTimestamp();
    const cancellation = {
      status: "cancelled", cancelledAt: now, cancelledByUid: staff.uid,
      cancelledByName: staff.name || profileSnap.data()?.displayName || "Staff Member",
      cancellationReason: reason, cancellationNote: note
    };

    transaction.update(recordRef, cancellation);
    transaction.set(doc(db, "behaviorReteachSummaries", recordId), behaviorSummary({ ...record, ...cancellation }));
    if (withdrawContact) transaction.update(requirementRef, cancellation);
    if (milestoneSnap.exists()) {
      const milestone = milestoneSnap.data();
      const resetContact = milestone.triggeringReteachId === recordId && withdrawContact;
      transaction.update(milestoneRef, {
        assignmentCount: Math.max(0, milestone.assignmentCount - 1),
        lastCancelledReteachId: recordId,
        updatedAt: now,
        ...(resetContact ? { thirdReteachReached: false, triggeringReteachId: null, reachedAt: null } : {})
      });
    }
    transaction.set(eventRef, {
      studentId: record.studentId, domain: "behavior", eventType: "reteachCancelled",
      actorUid: staff.uid, actorName: cancellation.cancelledByName,
      summary: `Cancelled Reteach: ${reason}`, sourceCollection: "behaviorReteaches",
      sourceId: recordId, schoolYear, occurredAt: now,
      details: { previousStatus: "pending", nextStatus: "cancelled", reason, note, homeContactWithdrawn: Boolean(withdrawContact) },
      visibleToUids: [...new Set([record.assignedByUid, staff.uid])]
    });
  });
}
