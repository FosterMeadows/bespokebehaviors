import test, { before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import React, { act, createContext } from "react";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { toDayKey } from "../src/utils/date.js";

// Render the real dashboard and drawer with controllable Firestore delivery.
// Only the unrelated setup/live layouts are replaced by small interactive views.
const context = createContext(null);
const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const lanes = [
  { id: "6-north", label: "Grade 6 North", grade: "6" },
  { id: "6-south", label: "Grade 6 South", grade: "6" },
  { id: "7", label: "Grade 7", grade: "7" },
  { id: "8", label: "Grade 8", grade: "8" }
];
const students = {
  a: { displayName: "Alpha Student", grade: "6", homeroom: "A" },
  b: { displayName: "Beta Student", grade: "6", homeroom: "B" }
};
const docSnapshot = (id, data) => ({ id, exists: () => data !== undefined, data: () => data });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
let AcademicDashboard, createRoot, root, dom, harness, buildDirectory;

before(async () => {
  const nodeEnvironment = process.env.NODE_ENV;
  const services = ["addStudentToTodayAcademicSession", "removeStudentFromTodayAcademicSession", "addToDeck", "removeFromDeck", "recordTodayAcademicAttendance", "endTodayAcademicSession", "undoTodayAcademicAttendance", "dismissStudentFromAR", "addTasks", "startTodayAcademicSession", "archiveCompletedTask", "cancelTask", "updateTaskState"];
  const mocks = {
    entry: `export { default as AcademicDashboard } from ${JSON.stringify(join(rootDirectory, "src/pages/AcademicDashboard.jsx"))};`,
    auth: "export const AuthContext = globalThis.__academicReliability.context;",
    config: "export const db = {};",
    firestore: `export const doc = (_db, collection, id) => ({ path: collection + '/' + id });
      export const collection = (_db, collection) => ({ collection });
      export const query = (target, ...constraints) => ({ ...target, constraints });
      export const where = (field, operator, value) => ({ field, operator, value });
      export const orderBy = (...args) => ({ orderBy: args });
      export const onSnapshot = (...args) => globalThis.__academicReliability.listen(...args);`,
    services: `export const ACADEMIC_SESSION_LANES = ${JSON.stringify(lanes)};
      export const academicLaneDocId = (lane, date = globalThis.__academicReliability.dayKey()) => date + '_' + lane;
      export const listenTodayAcademicSession = (lane, change, error, date = globalThis.__academicReliability.dayKey()) => globalThis.__academicReliability.listen({ path: 'academicSessions/' + date + '_' + lane }, snap => change(snap.exists() ? snap.data() : null), error);
      export const listAttendanceByStudent = (id) => globalThis.__academicReliability.history('attendance', id);
      export const listCompletedTasksByStudent = (id) => globalThis.__academicReliability.history('completed', id);
      ${services.map(name => `export const ${name} = async () => {};`).join("\n")}`,
    setup: `import { createElement as h } from 'react';
      export function SetupLayout(p) { return h('section', null,
        h('p', null, 'Selected students: ' + p.deckItems.join(',')),
        ...Object.entries(p.studentsMap).map(([id, s]) => h('button', { key: id, onClick: () => p.onOpenDrawer(id) }, 'Open ' + s.displayName))); }`,
    live: `import { createElement as h } from 'react';
      export function LiveGrid(p) { return h('section', null,
        h('p', null, 'Live students: ' + p.deckItems.join(',')),
        h('p', null, 'Present: ' + Object.keys(p.attendanceToday).join(','))); }`
  };
  const result = await build({
    configFile: false, logLevel: "silent", plugins: [react(), {
      name: "academic-reliability-mocks",
      enforce: "pre",
      resolveId(source) {
        const name = source.endsWith("academic-reliability-entry") ? "entry"
          : source.endsWith("AuthContext.jsx") ? "auth"
            : source.endsWith("firebaseConfig") ? "config"
              : source === "firebase/firestore" ? "firestore"
                : source.endsWith("services/academic") ? "services"
                  : source.endsWith("SetupLayout.jsx") ? "setup"
                    : source.endsWith("LiveGrid.jsx") ? "live" : null;
        if (name) return "\0academic-mock:" + name;
      },
      load(id) { if (id.startsWith("\0academic-mock:")) return mocks[id.slice("\0academic-mock:".length)]; }
    }],
    build: { write: false, minify: false, lib: { entry: "academic-reliability-entry", formats: ["es"] },
      rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime"] } }
  });
  if (nodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnvironment;
  await mkdir(join(rootDirectory, "tmp"), { recursive: true });
  buildDirectory = await mkdtemp(join(rootDirectory, "tmp/academic-reliability-"));
  const output = Array.isArray(result) ? result[0].output : result.output;
  await writeFile(join(buildDirectory, "components.mjs"), output.find(item => item.type === "chunk").code);
});

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  for (const name of ["window", "document", "localStorage", "HTMLElement", "Node"]) globalThis[name] = name === "window" ? dom.window : dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  harness = {
    context, dayKey: () => toDayKey(new Date()), listeners: [], historyRequests: [], rosterFailures: 0, decks: {}, sessions: {}, attendance: [],
    history(kind, id) {
      const pending = deferred();
      this.historyRequests.push({ kind, id, ...pending });
      return pending.promise;
    },
    listen(target, change, error) {
      const listener = { target, change, error, active: true };
      this.listeners.push(listener);
      queueMicrotask(() => {
        if (!listener.active) return;
        if (target.path) {
          const [collection, id] = target.path.split('/');
          const data = collection === 'students' ? students[id]
            : collection === 'deck' ? { items: this.decks[id] || [] } : this.sessions[id];
          change(docSnapshot(id, data));
        } else if (target.collection === 'students') {
          if (this.rosterFailures > 0) { this.rosterFailures--; error(new Error('denied')); return; }
          change({ docs: Object.entries(students).map(([id, data]) => docSnapshot(id, data)) });
        } else if (target.collection === 'attendance') {
          change({ docs: this.attendance.map((data, index) => docSnapshot(String(index), data)) });
        } else {
          const student = target.constraints?.find(item => item.field === 'studentId' && item.operator === '==')?.value;
          change({ docs: student ? [docSnapshot(student + '-task', { active: true, studentId: student, title: student + ' work', state: 'not_started', subject: 'ELA' })] : [] });
        }
      });
      return () => { listener.active = false; };
    }
  };
  globalThis.__academicReliability = harness;
  if (!AcademicDashboard) ({ AcademicDashboard } = await import(pathToFileURL(join(buildDirectory, "components.mjs"))));
  root = createRoot(document.getElementById("root"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

after(async () => {
  delete globalThis.__academicReliability;
  if (!buildDirectory) return;
  await unlink(join(buildDirectory, "components.mjs")).catch(error => { if (error.code !== "ENOENT") throw error; });
  await rmdir(buildDirectory);
});

async function mount() {
  const value = { user: { uid: "owner", displayName: "Test Teacher" }, profile: { roles: ["owner"], gradeLevels: ["6", "7", "8"] } };
  await act(async () => root.render(React.createElement(context.Provider, { value }, React.createElement(AcademicDashboard))));
}
async function click(label) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label);
  assert.ok(button, `Button ${label} exists`);
  await act(async () => button.click());
}
const text = () => document.body.textContent;
const historyResult = title => ({ items: [{ id: title, title, subject: "ELA", completedAt: "2026-10-01" }], cursor: null, done: true });

test("a delayed history response cannot populate a different student's drawer", async () => {
  await mount();
  await click("Open Alpha Student");
  await click("History");
  const oldCompleted = harness.historyRequests.find(request => request.kind === "completed" && request.id === "a");
  await click("Close");
  await click("Open Beta Student");
  assert.match(document.querySelector('[role="dialog"]').textContent, /Beta Student/);
  assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /a work|Alpha Student/);
  await click("History");
  const newCompleted = harness.historyRequests.find(request => request.kind === "completed" && request.id === "b");
  assert.ok(newCompleted, "new student's history starts while the old request is pending");
  await act(async () => newCompleted.resolve(historyResult("Beta completion")));
  await act(async () => oldCompleted.resolve(historyResult("Alpha completion")));
  assert.match(text(), /Beta completion/);
  assert.doesNotMatch(text(), /Alpha completion/);
});

test("closing and reopening the same student also discards the previous request", async () => {
  await mount();
  await click("Open Alpha Student");
  await click("History");
  const oldCompleted = harness.historyRequests.find(request => request.kind === "completed");
  await click("Close");
  await click("Open Alpha Student");
  await click("History");
  const newCompleted = harness.historyRequests.filter(request => request.kind === "completed").at(-1);
  assert.notEqual(oldCompleted, newCompleted);
  await act(async () => newCompleted.resolve(historyResult("New completion")));
  await act(async () => oldCompleted.resolve(historyResult("Stale completion")));
  assert.match(text(), /New completion/);
  assert.doesNotMatch(text(), /Stale completion/);
});

test("a failed roster load shows an error and Retry recovers the dashboard", async () => {
  harness.rosterFailures = 1;
  await mount();
  assert.match(document.querySelector('[role="alert"]').textContent, /Students could not be loaded/);
  assert.doesNotMatch(text(), /^Loading\.\.\.$/);
  await click("Retry loading students");
  assert.match(text(), /Open Alpha Student/);
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(harness.listeners.filter(listener => listener.target.collection === "students").length, 2);
});

test("school midnight reconnects every daily listener and clears yesterday's roster and attendance", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-04T03:59:00Z") });
  const yesterday = "2026-10-03_6-north";
  const today = "2026-10-04_6-north";
  harness.decks[yesterday] = ["a"];
  harness.decks[today] = ["b"];
  harness.sessions[yesterday] = { status: "live", activeRoster: ["a"] };
  harness.sessions[today] = { status: "live", activeRoster: ["b"] };
  harness.attendance = [{ studentId: "a", date: "2026-10-03" }];
  await mount();
  assert.match(text(), /Live students: a/);
  assert.match(text(), /Present: a/);
  t.mock.timers.setTime(new Date("2026-10-04T04:01:00Z").getTime());
  assert.equal(toDayKey(new Date()), "2026-10-04");
  await act(async () => window.dispatchEvent(new window.Event("focus")));
  assert.match(text(), /Live students: b/);
  assert.doesNotMatch(text(), /Live students: a|Present: a/);
  const daily = harness.listeners.filter(listener => listener.target.path?.startsWith("academicSessions/") || listener.target.path?.startsWith("deck/"));
  assert.ok(daily.filter(listener => listener.target.path.includes("2026-10-03")).every(listener => !listener.active));
  for (const lane of lanes) assert.ok(daily.some(listener => listener.active && listener.target.path === "academicSessions/2026-10-04_" + lane.id));
  assert.ok(daily.some(listener => listener.active && listener.target.path === "deck/" + today));
});
