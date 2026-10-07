import test, { before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import React, { act, createContext } from "react";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { todayInputValue } from "../src/utils/behaviorPresentation.js";
import { behaviorSchoolYear, behaviorSummary } from "../src/utils/behaviorRecords.js";

// Exercise the real form, popup, count query, and assignment transaction.
// Firebase delivery is controlled so a second teacher can change the count.
const context = createContext(null);
const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const student = { id: "s6", displayName: "Test Student", grade: "6", homeroom: "A" };
const snapshot = (id, data) => ({ id, exists: () => data !== undefined, data: () => data });
const payload = (assignedByUid = "teacher") => ({
  studentId: student.id, studentName: student.displayName, grade: "6", homeroom: "A",
  assignedByUid, assignedByName: assignedByUid, reteachDate: todayInputValue(),
  location: "Classroom", context: "Disruption", note: "Review classroom expectations."
});
let api, root, dom, harness, buildDirectory;

before(async () => {
  const nodeEnvironment = process.env.NODE_ENV;
  const mocks = {
    entry: `export { default as BehaviorWorkspace } from ${JSON.stringify(join(rootDirectory, "src/pages/BehaviorWorkspace.jsx"))};
      export { getBehaviorServedCount, createBehaviorReteach } from ${JSON.stringify(join(rootDirectory, "src/services/behavior.js"))};`,
    auth: "export const AuthContext = globalThis.__behaviorThreshold.context;",
    config: "export const db = {};",
    errors: "export const reportClientError = async () => {};",
    stats: "export default function Stats() { return null; }",
    firestore: `export const collection = (_db, collection) => ({ collection });
      export const doc = (dbOrCollection, collectionOrId, id) => {
        const collection = dbOrCollection.collection || collectionOrId;
        const documentId = dbOrCollection.collection ? collectionOrId || ('new-' + ++globalThis.__behaviorThreshold.ids) : id;
        return { collection, id: documentId, path: collection + '/' + documentId };
      };
      export const where = (field, operator, value) => ({ field, operator, value });
      export const query = (target, ...constraints) => ({ ...target, constraints });
      export const getDocs = target => globalThis.__behaviorThreshold.getDocs(target);
      export const getDocsFromServer = target => globalThis.__behaviorThreshold.getDocs(target);
      export const getDoc = async ref => globalThis.__behaviorThreshold.getDoc(ref);
      export const onSnapshot = (target, change) => globalThis.__behaviorThreshold.listen(target, change);
      export const serverTimestamp = () => new Date();
      export const runTransaction = (_db, callback) => globalThis.__behaviorThreshold.transact(callback);
      export const writeBatch = () => ({ set() {}, update() {}, commit: async () => {} });`
  };
  const result = await build({
    configFile: false, logLevel: "silent", plugins: [react(), {
      name: "behavior-threshold-mocks", enforce: "pre",
      resolveId(source) {
        const name = source.endsWith("behavior-threshold-entry") ? "entry"
          : source.endsWith("AuthContext.jsx") ? "auth"
            : source.endsWith("firebaseConfig") ? "config"
              : source === "firebase/firestore" ? "firestore"
                : source.endsWith("services/clientErrors") ? "errors"
                  : source.endsWith("BehaviorStudentStats.jsx") ? "stats" : null;
        if (name) return "\0behavior-threshold:" + name;
      },
      load(id) { if (id.startsWith("\0behavior-threshold:")) return mocks[id.slice("\0behavior-threshold:".length)]; }
    }],
    build: { write: false, minify: false, lib: { entry: "behavior-threshold-entry", formats: ["es"] },
      rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime"] } }
  });
  if (nodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnvironment;
  await mkdir(join(rootDirectory, "tmp"), { recursive: true });
  buildDirectory = await mkdtemp(join(rootDirectory, "tmp/behavior-threshold-"));
  const output = Array.isArray(result) ? result[0].output : result.output;
  await writeFile(join(buildDirectory, "components.mjs"), output.find(item => item.type === "chunk").code);
});

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  for (const name of ["window", "document", "localStorage", "HTMLElement", "Node"])
    globalThis[name] = name === "window" ? dom.window : dom.window[name];
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  harness = {
    context, ids: 0, revision: 0, transactions: 0, countQueries: 0, records: new Map(), buybacks: [], milestone: undefined,
    seed(served, pending, buybacks = 0) {
      this.records.clear();
      for (let index = 0; index < served + pending; index++) this.records.set("prior-" + index, {
        ...payload("other-teacher"), status: index < served ? "served" : "pending", createdAt: new Date()
      });
      this.buybacks = Array.from({ length: buybacks }, () => ({ studentId: student.id, schoolYear: behaviorSchoolYear() }));
    },
    async getDocs(target) {
      if (target.collection === "behaviorBuybacks") return { docs: this.buybacks.map((row, index) => snapshot(String(index), row)) };
      if (target.collection === "behaviorReteachSummaries") {
        this.countQueries++;
        if (this.countError) throw new Error("Count unavailable");
        return { docs: [...this.records].map(([id, row]) => snapshot(id, behaviorSummary(row))) };
      }
      return { docs: [] };
    },
    getDoc(ref) {
      return snapshot(ref.id, ref.collection === "behaviorHomeContactMilestones" ? this.milestone : this.records.get(ref.id));
    },
    listen(target, change) {
      let active = true;
      // Pending records belong to another grade's teachers, while schoolwide
      // sanitized counts still include them for the assignment cutoff.
      queueMicrotask(() => { if (active) change({ docs: target.collection === "students" ? [snapshot(student.id, student)] : [] }); });
      return () => { active = false; };
    },
    async transact(callback) {
      this.transactions++;
      if (this.beforeTransaction) { this.beforeTransaction(); this.beforeTransaction = null; }
      for (let attempt = 0; attempt < 5; attempt++) {
        const revision = this.revision;
        const writes = [];
        await callback({ get: async ref => this.getDoc(ref), set: (ref, row) => writes.push([ref, row]) });
        if (revision !== this.revision) continue;
        for (const [ref, row] of writes) {
          if (ref.collection === "behaviorReteaches") this.records.set(ref.id, row);
          if (ref.collection === "behaviorHomeContactMilestones") this.milestone = { ...this.milestone, ...row };
        }
        this.revision++;
        return;
      }
      throw new Error("Too many transaction conflicts");
    }
  };
  globalThis.__behaviorThreshold = harness;
  if (!api) api = await import(pathToFileURL(join(buildDirectory, "components.mjs")));
  const { createRoot } = await import("react-dom/client");
  root = createRoot(document.getElementById("root"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

after(async () => {
  delete globalThis.__behaviorThreshold;
  if (!buildDirectory) return;
  await unlink(join(buildDirectory, "components.mjs"));
  await rmdir(buildDirectory);
});

async function mount(role = "behavior") {
  const value = { user: { uid: "teacher", displayName: "Teacher" }, profile: { roles: [role], gradeLevels: ["6"] } };
  await act(async () => root.render(React.createElement(context.Provider, { value }, React.createElement(api.BehaviorWorkspace))));
}

async function change(selector, value) {
  const element = document.querySelector(selector);
  assert.ok(element, selector + " exists");
  const prototype = Object.getPrototypeOf(element);
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

async function click(label) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label);
  assert.ok(button, label + " exists");
  await act(async () => button.click());
}

async function selectStudent() {
  await change("#behavior-student-search", "Test");
  const suggestion = [...document.querySelectorAll("button")].find(item => item.textContent.startsWith("Test Student"));
  assert.ok(suggestion);
  await act(async () => suggestion.click());
}

async function completeForm() {
  await change("#behavior-location", "Classroom");
  await change("#behavior-context", "Disruption");
  await change("textarea", "Review classroom expectations.");
}

test("4 served plus 2 pending from other teachers shows the WVEIS popup and blocks assignment", async () => {
  harness.seed(4, 2);
  await mount();
  await selectStudent();
  const dialog = document.querySelector("dialog[open]");
  assert.ok(dialog);
  assert.match(dialog.textContent, /count is 6.*served Reteaches plus pending Reteaches/);
  assert.match(dialog.textContent, /habitual violation of school rules and follow the WVEIS procedures/);
  assert.match(document.body.textContent, /Current Count: 6 · Threshold Reached/);
  assert.match(document.body.textContent, /4 Served \+ 2 Pending/);
  assert.equal(document.querySelector('button[type="submit"]'), null);
  await click("Understood");
  assert.equal(document.querySelector("dialog"), null);
  assert.equal(harness.records.size, 6);
  assert.equal(harness.transactions, 0);
});

test("a combined count of five allows the sixth and records both counts", async () => {
  harness.seed(4, 1);
  await mount();
  await selectStudent();
  assert.equal(document.querySelector("dialog"), null);
  assert.match(document.body.textContent, /Current Count: 5 · 1 Until Threshold/);
  await completeForm();
  await click("Add to List");
  const added = [...harness.records.values()].find(row => row.assignedByUid === "teacher");
  assert.ok(added);
  assert.equal(added.servedCountAtAssignment, 4);
  assert.equal(added.pendingCountAtAssignment, 1);
  assert.equal(added.postThreshold, false);
  assert.equal(harness.records.size, 6);
});

test("buybacks reduce the served portion while cancelled and previous-year records are excluded", async () => {
  harness.seed(4, 2, 1);
  harness.records.set("cancelled", { ...payload(), status: "cancelled" });
  harness.records.set("last-year", { ...payload(), status: "pending", reteachDate: "2020-01-01" });
  const count = await api.getBehaviorServedCount(student.id);
  assert.equal(count.adjusted, 3);
  assert.equal(count.pending, 2);
  await mount();
  await selectStudent();
  assert.equal(document.querySelector("dialog"), null);
  assert.match(document.body.textContent, /Current Count: 5 · 1 Until Threshold/);
  await completeForm();
  await click("Add to List");
  const added = [...harness.records.values()].find(row => row.assignedByUid === "teacher" && row.status === "pending" && row.reteachDate === todayInputValue());
  assert.equal(added.servedCountAtAssignment, 3);
  assert.equal(added.pendingCountAtAssignment, 2);
});

test("a count that changes before submission shows the popup without creating a record", async () => {
  harness.seed(4, 1);
  await mount();
  await selectStudent();
  await completeForm();
  harness.seed(4, 2);
  await click("Add to List");
  assert.match(document.querySelector("dialog[open]").textContent, /count is 6/);
  assert.equal(harness.records.size, 6);
  assert.equal(harness.transactions, 0);
});

test("a count that changes between submission and the transaction also shows the popup", async () => {
  harness.seed(4, 1);
  await mount();
  await selectStudent();
  await completeForm();
  harness.beforeTransaction = () => harness.seed(4, 2);
  await click("Add to List");
  assert.match(document.querySelector("dialog[open]").textContent, /count is 6/);
  assert.equal(harness.records.size, 6);
  assert.equal(harness.transactions, 1);
});

test("simultaneous assignments recheck the combined count after a transaction conflict", async () => {
  harness.seed(4, 1);
  const results = await Promise.allSettled([
    api.createBehaviorReteach(payload("teacher-a")),
    api.createBehaviorReteach(payload("teacher-b"))
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "behavior/threshold-reached");
  assert.equal(harness.records.size, 6);
  assert.ok(harness.countQueries >= 3);
});

test("admins still need to acknowledge the combined threshold before overriding it", async () => {
  harness.seed(4, 2);
  await mount("admin");
  await selectStudent();
  assert.equal(document.querySelector("dialog"), null);
  assert.match(document.body.textContent, /6 Reteaches served or pending/);
  await completeForm();
  assert.equal(document.querySelector('button[type="submit"]').disabled, true);
  await assert.rejects(api.createBehaviorReteach(payload(), { allowPostThreshold: true }), /Acknowledge/);
  await act(async () => document.querySelector('input[type="checkbox"]').click());
  await click("Add Post-Threshold Reteach");
  const added = [...harness.records.values()].find(row => row.assignedByUid === "teacher");
  assert.equal(added.postThreshold, true);
  assert.equal(added.thresholdAcknowledged, true);
  assert.equal(harness.records.size, 7);
});

test("an unavailable count cannot enable saving a Reteach", async () => {
  harness.countError = true;
  await mount();
  await selectStudent();
  await completeForm();
  assert.equal(document.querySelector('button[type="submit"]').disabled, true);
  assert.match(document.body.textContent, /Count unavailable/);
  assert.equal(harness.transactions, 0);
});
