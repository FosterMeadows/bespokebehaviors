import test from "node:test";
import assert from "node:assert/strict";
import { subscribeOperationalRows } from "../src/services/operationalData.js";

test("operational subscriptions wait for all sources and discard failed or stale results", () => {
  const callbacks = {};
  const updates = [];
  const failures = [];
  const stopped = [];
  const stop = subscribeOperationalRows({ tasks: "tasks", sessions: "sessions" },
    value => updates.push(value), (error, key) => failures.push([error, key]),
    (source, success, failure) => {
      callbacks[source] = { success, failure };
      return () => stopped.push(source);
    });
  const rows = id => ({ docs: [{ id, data: () => ({ active: true }) }] });
  callbacks.tasks.success(rows("old-open-task"));
  assert.equal(updates.at(-1).loading, true);
  callbacks.sessions.success(rows("session"));
  assert.equal(updates.at(-1).loading, false);
  const error = new Error("permission-denied");
  callbacks.sessions.failure(error);
  assert.deepEqual(updates.at(-1).errors, ["sessions"]);
  assert.equal(updates.at(-1).data.sessions, undefined);
  assert.deepEqual(failures, [[error, "sessions"]]);
  stop();
  const count = updates.length;
  callbacks.tasks.success(rows("late-snapshot"));
  callbacks.sessions.failure(error);
  assert.equal(updates.length, count);
  assert.equal(failures.length, 1);
  assert.deepEqual(stopped, ["tasks", "sessions"]);
});

test("overlapping queries count a record once and remove it only after it leaves every query", () => {
  const callbacks = {};
  let current;
  const stop = subscribeOperationalRows({ behaviorRecords: ["pending", "recent"] },
    value => { current = value; }, () => {},
    (source, success, failure) => {
      callbacks[source] = { success, failure };
      return () => {};
    });
  const rows = (ids, status = "pending") => ({ docs: ids.map(id => ({ id, data: () => ({ status }) })) });
  callbacks.pending.success(rows(["old", "recent"]));
  assert.equal(current.loading, true);
  callbacks.recent.success(rows(["recent"]));
  assert.equal(current.loading, false);
  assert.equal(current.data.behaviorRecords.length, 2);
  callbacks.pending.success(rows(["old"]));
  callbacks.recent.success(rows(["recent"], "served"));
  assert.equal(current.data.behaviorRecords.length, 2);
  assert.equal(current.data.behaviorRecords.find(row => row.id === "recent").status, "served");
  callbacks.pending.success(rows([]));
  assert.deepEqual(current.data.behaviorRecords.map(row => row.id), ["recent"]);
  callbacks.recent.failure(new Error("unavailable"));
  assert.equal(current.data.behaviorRecords, undefined);
  assert.deepEqual(current.errors, ["behaviorRecords"]);
  stop();
});
