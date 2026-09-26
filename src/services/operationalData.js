import { collection, onSnapshot, or, query, where } from "firebase/firestore";

// Keep the compatibility reads separate so changing the window does not reload
// the roster or tasks. Missing active/state fields count as open in older tasks;
// Firestore field filters would silently omit them. Grades use the current roster.
export function operationalWorkloadQueries(db, includeHomeContacts) {
  return {
    tasks: collection(db, "tasks"),
    students: collection(db, "students"),
    ...(includeHomeContacts ? {
      homeContacts: query(collection(db, "behaviorHomeContactRequirements"), where("status", "==", "pending")),
    } : {}),
  };
}

function since(field, start) {
  // Stored dates include Firestore timestamps, ISO strings, and legacy serialized
  // timestamps. Widen string dates by one day for timezone offsets; the metrics
  // apply the exact local window and primary/fallback-date precedence afterward.
  const stringStart = new Date(start.getTime() - 86_400_000).toISOString().slice(0, 10);
  return [
    where(field, ">=", start),
    where(field, ">=", stringStart),
    where(field, ">=", start.getTime()),
  ];
}

function dateQueries(db, name, fields, start) {
  return fields.flatMap(field => [
    query(collection(db, name), or(...since(field, start))),
    query(collection(db, name), where(field + ".seconds", ">=", Math.floor(start.getTime() / 1000))),
  ]);
}

export function operationalWindowQueries(db, start) {
  // Separate fields into separate queries: range ordering across different fields
  // would exclude documents missing one of those fields, including legacy rows.
  return {
    behaviorRecords: [
      query(collection(db, "behaviorReteachSummaries"), where("status", "==", "pending")),
      ...dateQueries(db, "behaviorReteachSummaries", ["createdAt", "reteachDate"], start),
    ],
    sessions: dateQueries(db, "academicSessions", ["date", "startedAt"], start),
  };
}

export function mergeOperationalRows(groups) {
  return [...new Map(groups.flat().map(row => [row.id, row])).values()];
}

export function subscribeOperationalRows(queries, onChange, onError, listen = onSnapshot) {
  const entries = Object.entries(queries).flatMap(([key, sources]) =>
    (Array.isArray(sources) ? sources : [sources]).map((source, index) => ({ key, source, id: key + ":" + index })));
  const snapshots = new Map();
  const loaded = new Set();
  const failed = new Set();
  let active = true;
  const publish = () => {
    const errors = [...new Set(entries.filter(entry => failed.has(entry.id)).map(entry => entry.key))];
    const data = Object.fromEntries(Object.keys(queries).filter(key => !errors.includes(key)).map(key => [
      key, mergeOperationalRows(entries.filter(entry => entry.key === key).map(entry => snapshots.get(entry.id) || [])),
    ]));
    onChange({ data, loading: loaded.size < entries.length, errors });
  };
  const stops = entries.map(({ key, source, id }) => listen(source, snapshot => {
    if (!active) return;
    snapshots.set(id, snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    loaded.add(id);
    failed.delete(id);
    publish();
  }, error => {
    if (!active) return;
    snapshots.delete(id);
    loaded.add(id);
    failed.add(id);
    publish();
    onError(error, key);
  }));
  return () => {
    active = false;
    stops.forEach(stop => stop());
  };
}
