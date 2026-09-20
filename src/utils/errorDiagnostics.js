// Never persist raw messages, stack text, URLs, or function arguments.
export const ERROR_CAUSES = {
  permission: "Database access was denied.",
  index: "A required database index is missing or still building.",
  network: "A network request failed or the service was unavailable.",
  authentication: "The sign-in session could not be verified.",
  timeout: "The operation took too long to complete.",
  resource: "A required resource could not be found.",
  conflict: "The operation conflicted with another update.",
  javascript: "An application code error occurred.",
  unknown: "Unrecognized cause. Use the code location to investigate."
};
export const ERROR_OPERATIONS = {
  unknown: "Unidentified background operation",
  "behavior-prepare": "Prepare behavior summaries",
  "behavior-count": "Load behavior counts",
  "behavior-create": "Create behavior reteach",
  "behavior-serve": "Mark behavior reteach served",
  "behavior-undo": "Undo behavior service",
  "behavior-pdf": "Generate behavior PDF",
  "behavior-contact": "Record home contact"
};
const CODES = new Set(["permission-denied", "unauthenticated", "unavailable", "deadline-exceeded", "failed-precondition", "not-found", "aborted", "resource-exhausted", "internal", "cancelled", "auth/network-request-failed", "auth/user-token-expired"]);
const NAMES = new Set(["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "FirebaseError"]);
export function errorDiagnostics(error, operation = "unknown", origin = "") {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  const message = String(error?.message || error || "");
  const category = CODES.has(code) ? code : NAMES.has(error?.name) ? error.name : "Error";
  let cause = "unknown";
  if (/requires an index|index.*building/i.test(message)) cause = "index";
  else if (code === "permission-denied" || /missing or insufficient permissions/i.test(message)) cause = "permission";
  else if (["unauthenticated", "auth/user-token-expired"].includes(code)) cause = "authentication";
  else if (code === "deadline-exceeded") cause = "timeout";
  else if (code === "not-found") cause = "resource";
  else if (code === "aborted") cause = "conflict";
  else if (["unavailable", "auth/network-request-failed"].includes(code) || /failed to fetch|networkerror|network request failed|loading chunk|dynamically imported module/i.test(message)) cause = "network";
  else if (["TypeError", "ReferenceError", "SyntaxError", "RangeError"].includes(category)) cause = "javascript";
  const frames = [];
  for (const match of String(error?.stack || "").matchAll(/https?:\/\/[^\s)]+/g)) {
    try {
      const coordinate = match[0].match(/^(.*):(\d+):(\d+)$/);
      if (!coordinate) continue;
      const url = new URL(coordinate[1]);
      if (url.origin !== origin || url.search || url.hash || !/^\/assets\/[A-Za-z0-9_-]+\.js$/.test(url.pathname)) continue;
      const frame = `${url.pathname}:${coordinate[2]}:${coordinate[3]}`;
      if (frame.length > 160) continue;
      frames.push(frame);
      if (frames.length === 3) break;
    } catch { /* Ignore malformed frames. */ }
  }
  return { category, cause, operation: Object.hasOwn(ERROR_OPERATIONS, operation) ? operation : "unknown", codeLocation: frames.join(" | ") };
}
export function diagnosticKey(item) {
  return JSON.stringify([item.route, item.release, item.category, item.cause || "legacy", item.operation || "unknown", item.codeLocation || ""]);
}
export function groupClientErrors(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.cause ? diagnosticKey(item) : item.id;
    const time = item.occurredAt?.toMillis?.() ?? (item.occurredAt?.seconds || 0) * 1000;
    if (!groups.has(key)) groups.set(key, { ...item, count: 0, first: time, last: time, sources: new Set() });
    const group = groups.get(key);
    group.count += 1;
    group.first = Math.min(group.first, time);
    group.last = Math.max(group.last, time);
    group.sources.add(item.source);
  }
  return [...groups.values()].sort((a, b) => b.last - a.last);
}
