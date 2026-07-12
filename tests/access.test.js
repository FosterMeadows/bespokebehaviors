import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canUseAcademic,
  canUseAdmin,
  canUseBehavior,
  canUseLegacyTools,
  canViewStudent
} from "../src/utils/access.js";

describe("profile access", () => {
  const teacher = { roles: ["academic"], gradeLevels: ["6"] };

  it("grants only configured workspaces", () => {
    assert.equal(canUseAcademic(teacher), true);
    assert.equal(canUseBehavior(teacher), false);
    assert.equal(canUseAdmin(teacher), false);
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
    assert.equal(canUseLegacyTools(disabledOwner), false);
  });
});
