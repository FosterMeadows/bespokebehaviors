import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUseAcademic,
  canUseAdmin,
  canUseBehavior,
  canUseCommandCenter,
  canUseLegacyTools,
  canOverrideBehaviorThreshold,
  canCancelBehaviorReteach,
  canViewStudent
} from "../src/utils/access.js";

describe("profile access", () => {
  const teacher = { roles: ["academic"], gradeLevels: ["6"] };

  it("grants only configured workspaces", () => {
    assert.equal(canUseAcademic(teacher), true);
    assert.equal(canUseBehavior(teacher), false);
    assert.equal(canUseAdmin(teacher), false);
    assert.equal(canUseCommandCenter(teacher), false);
    assert.equal(canUseLegacyTools(teacher), false);
  });

  it("limits students to assigned grades", () => {
    assert.equal(canViewStudent(teacher, { grade: "6" }), true);
    assert.equal(canViewStudent(teacher, { grade: "7" }), false);
  });

  it("denies every workspace when an account is disabled", () => {
    const disabledOwner = { roles: ["owner", "academic", "behavior"], disabled: true };
    assert.equal(canUseAcademic(disabledOwner), false);
    assert.equal(canUseBehavior(disabledOwner), false);
    assert.equal(canUseAdmin(disabledOwner), false);
    assert.equal(canUseCommandCenter(disabledOwner), false);
    assert.equal(canUseLegacyTools(disabledOwner), false);
    assert.equal(canOverrideBehaviorThreshold(disabledOwner), false);
  });

  it("limits post-threshold reteaches to admin and owner roles", () => {
    assert.equal(canOverrideBehaviorThreshold({ roles: ["behavior"] }), false);
    assert.equal(canOverrideBehaviorThreshold({ roles: ["mtssLead"] }), false);
    assert.equal(canOverrideBehaviorThreshold({ roles: ["admin"] }), true);
    assert.equal(canOverrideBehaviorThreshold({ roles: ["owner"] }), true);
  });

  it("limits the command center to an enabled owner", () => {
    assert.equal(canUseCommandCenter({ roles: ["owner"] }), true);
    assert.equal(canUseCommandCenter({ roles: ["admin"] }), false);
    assert.equal(canUseCommandCenter({ roles: ["mtssLead"] }), false);
    assert.equal(canUseCommandCenter({ roles: ["academic", "behavior"] }), false);
  });

  it("allows only assigning teachers and admins to cancel pending reteaches", () => {
    const record = { assignedByUid: "assigner", status: "pending", grade: "7" };
    assert.equal(canCancelBehaviorReteach({ roles: ["behavior"], gradeLevels: ["6"] }, "assigner", record), true);
    assert.equal(canCancelBehaviorReteach({ roles: ["behavior"] }, "coworker", record), false);
    for (const role of ["admin", "owner"]) {
      assert.equal(canCancelBehaviorReteach({ roles: [role] }, "admin-user", record), true);
      assert.equal(canCancelBehaviorReteach({ roles: [role], disabled: true }, "admin-user", record), false);
      assert.equal(canCancelBehaviorReteach({ roles: [role] }, "admin-user", { ...record, status: "served" }), false);
      assert.equal(canCancelBehaviorReteach({ roles: [role] }, "admin-user", { ...record, status: "cancelled" }), false);
    }
    assert.equal(canCancelBehaviorReteach({ roles: ["mtssLead"] }, "mtss", record), false);
    assert.equal(canCancelBehaviorReteach({ roles: ["academic"] }, "assigner", record), false);
    assert.equal(canCancelBehaviorReteach({ roles: ["owner"] }, "", record), false);
  });
});
