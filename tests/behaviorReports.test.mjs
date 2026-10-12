import test, { before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import React, { act, createContext } from "react";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const context = createContext(null);
const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
let buildDirectory, api, root, dom, harness;
const record = (id, studentId, studentName, date, note) => ({
  id, studentId, studentName, reteachDate: date, createdAt: new Date(date),
  note, context: "Disruption", location: "Classroom", grade: "6", assignedByName: "Teacher"
});

before(async () => {
  const nodeEnvironment = process.env.NODE_ENV;
  const mocks = {
    entry: `export { default } from ${JSON.stringify(join(rootDirectory, "src/pages/BehaviorWorkspace.jsx"))};`,
    auth: "export const AuthContext = globalThis.__behaviorReports.context;",
    errors: "export const reportClientError = async () => {};",
    reports: `export const downloadReteachReport = async record => globalThis.__behaviorReports.individual.push(record);
      export const downloadReteachReports = records => globalThis.__behaviorReports.generate(records);`,
    assignment: "export function BehaviorAssignmentForm() { return null; }",
    stats: "export default function Stats() { return null; }",
    behavior: `export const BEHAVIOR_THRESHOLD = 6;
      export const HOME_CONTACT_METHODS = [];
      export const ensureBehaviorReteachSummaries = async () => {};
      export const normalizeStudent = student => student;
      export const getBehaviorServedCount = async () => ({ adjusted: 0 });
      export const listenBehaviorAssignmentStudents = (_profile, change) => { change([]); return () => {}; };
      export const listenMyBehaviorReteaches = (_uid, change) => { change([]); return () => {}; };
      export const listenMyHomeContactRequirements = (_uid, change) => { change([]); return () => {}; };
      export const listenPendingBehaviorReteaches = (_profile, change) => {
        globalThis.__behaviorReports.deliver = change;
        change(globalThis.__behaviorReports.records);
        return () => {};
      };
      export const createBehaviorReteach = async () => {};
      export const cancelBehaviorReteach = async () => {};
      export const markBehaviorReteachServed = async () => {};
      export const restoreBehaviorReteachPending = async () => {};
      export const recordHomeContactAttempt = async () => {};`
  };
  const result = await build({
    configFile: false, logLevel: "silent", plugins: [react(), {
      name: "behavior-reports-mocks", enforce: "pre",
      resolveId(source) {
        const name = source.endsWith("behavior-reports-entry") ? "entry"
          : source.endsWith("AuthContext.jsx") ? "auth"
            : /services\/behavior$/.test(source) ? "behavior"
              : source.endsWith("services/clientErrors") ? "errors"
                : source.endsWith("utils/reteachReport") ? "reports"
                  : source.endsWith("BehaviorAssignmentForm.jsx") ? "assignment"
                    : source.endsWith("BehaviorStudentStats.jsx") ? "stats" : null;
        if (name) return "\0behavior-reports:" + name;
      },
      load(id) { if (id.startsWith("\0behavior-reports:")) return mocks[id.slice("\0behavior-reports:".length)]; }
    }],
    build: { write: false, minify: false, lib: { entry: "behavior-reports-entry", formats: ["es"] },
      rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime"] } }
  });
  if (nodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnvironment;
  await mkdir(join(rootDirectory, "tmp"), { recursive: true });
  buildDirectory = await mkdtemp(join(rootDirectory, "tmp/behavior-reports-"));
  const output = Array.isArray(result) ? result[0].output : result.output;
  await writeFile(join(buildDirectory, "components.mjs"), output.find(item => item.type === "chunk").code);
});

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  for (const name of ["window", "document", "HTMLElement", "Node"])
    globalThis[name] = name === "window" ? dom.window : dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  harness = {
    context, batches: [], individual: [],
    // The raw queue interleaves students; the UI stacks Bobby's reports together.
    records: [
      record("bobby-1", "bobby", "Bobby", "2026-10-01", "First Bobby report"),
      record("stacy-1", "stacy", "Stacy", "2026-10-02", "Stacy report"),
      record("bobby-2", "bobby", "Bobby", "2026-10-03", "Second Bobby report"),
      record("gwen-1", "gwen", "Gwen", "2026-10-04", "Gwen report")
    ],
    async generate(records) { this.batches.push(records); }
  };
  globalThis.__behaviorReports = harness;
  if (!api) api = await import(pathToFileURL(join(buildDirectory, "components.mjs")));
  const { createRoot } = await import("react-dom/client");
  root = createRoot(document.getElementById("root"));
  const value = { user: { uid: "teacher" }, profile: { roles: ["behavior"], gradeLevels: ["6"] } };
  await act(async () => root.render(React.createElement(context.Provider, { value }, React.createElement(api.default))));
  await click(button("To Serve"));
});

afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });
after(async () => {
  delete globalThis.__behaviorReports;
  if (!buildDirectory) return;
  await unlink(join(buildDirectory, "components.mjs"));
  await rmdir(buildDirectory);
});

const button = label => [...document.querySelectorAll("button")].find(item => item.textContent.startsWith(label));
const checkboxes = () => [...document.querySelectorAll('input[type="checkbox"]')];
async function click(element) { assert.ok(element); await act(async () => element.click()); }

test("selects individual stacked reports and downloads once in displayed order", async () => {
  assert.equal(button("Generate Selected Reports").disabled, true);
  assert.equal(checkboxes().length, 4);
  await click(checkboxes()[3]);
  await click(checkboxes()[1]);
  await click(checkboxes()[0]);
  assert.match(button("Generate Selected Reports").textContent, /\(3\)/);
  assert.equal(checkboxes()[2].checked, false);
  await click(button("Generate Selected Reports"));
  assert.equal(harness.batches.length, 1);
  assert.deepEqual(harness.batches[0].map(row => row.id), ["bobby-1", "bobby-2", "gwen-1"]);
  assert.deepEqual(harness.individual, []);
  await click(button("Clear selection"));
  assert.equal(button("Generate Selected Reports").disabled, true);
  await click(button("Generate Report"));
  assert.equal(harness.individual[0].id, "bobby-1");
});

test("drops hidden and removed reports from selection", async () => {
  await click(checkboxes()[0]);
  await click(checkboxes()[2]);
  const input = document.querySelector('input[type="text"]');
  async function search(value) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  }
  await search("Bobby");
  assert.match(button("Generate Selected Reports").textContent, /\(1\)/);
  await search("");
  assert.equal(checkboxes()[2].checked, false);
  await act(async () => harness.deliver(harness.records.filter(row => row.id !== "bobby-1")));
  assert.equal(button("Generate Selected Reports").disabled, true);
  await act(async () => harness.deliver(harness.records));
  assert.equal(checkboxes()[0].checked, false);
});

test("disables duplicate generation and restores selection after a batch error", async () => {
  let reject;
  harness.generate = records => {
    harness.batches.push(records);
    return new Promise((_resolve, rejectPromise) => { reject = rejectPromise; });
  };
  await click(checkboxes()[0]);
  await click(button("Generate Selected Reports"));
  assert.equal(button("Generating selected reports").disabled, true);
  assert.equal(checkboxes()[0].disabled, true);
  assert.equal(button("Generating...").disabled, true);
  await click(button("Generating selected reports"));
  assert.equal(harness.batches.length, 1);
  await act(async () => reject(new Error("Template unavailable")));
  assert.match(document.body.textContent, /Could not generate selected reports: Template unavailable/);
  assert.equal(button("Generate Selected Reports").disabled, false);
  assert.equal(checkboxes()[0].checked, true);
});
