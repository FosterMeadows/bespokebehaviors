import {
  query,
  collection,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs
} from "firebase/firestore";
import {
  db
} from "../../firebaseConfig";

// Attendance by student (most recent first)
export async function listAttendanceByStudent(sid, { pageSize = 10, cursor = null } = {}) {
  let q = query(
    collection(db, "attendance"),
    where("studentId", "==", sid),
    orderBy("date", "desc"),
    limit(pageSize)
  );
  if (cursor) q = query(q, startAfter(cursor));

  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.at(-1) || null,
    done: snap.empty || snap.size < pageSize
  };
}

// Completed tasks history under students/{sid}/academicHistory
export async function listCompletedTasksByStudent(sid, { pageSize = 10, cursor = null } = {}) {
  const [historyResult, tasksResult] = await Promise.allSettled([
    getDocs(collection(db, "students", sid, "academicHistory")),
    getDocs(query(collection(db, "tasks"), where("studentId", "==", sid)))
  ]);

  if (historyResult.status === "rejected" && tasksResult.status === "rejected") {
    throw historyResult.reason;
  }

  const records = new Map();
  if (tasksResult.status === "fulfilled") {
    tasksResult.value.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(task => task.state === "completed" || task.state === "verified" || task.archived === true)
      .forEach(task => records.set(task.id, { ...task, taskId: task.id }));
  }
  if (historyResult.status === "fulfilled") {
    historyResult.value.docs.forEach(d => {
      const history = { id: d.id, ...d.data() };
      const key = history.taskId || history.id;
      records.set(key, { ...(records.get(key) || {}), ...history, id: key });
    });
  }

  const toMillis = value => {
    if (value?.toMillis) return value.toMillis();
    if (value?.toDate) return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const allItems = [...records.values()].sort(
    (a, b) => toMillis(b.completedAt) - toMillis(a.completedAt)
  );
  const offset = Number.isInteger(cursor) ? cursor : 0;
  const items = allItems.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  return {
    items,
    cursor: nextOffset < allItems.length ? nextOffset : null,
    done: nextOffset >= allItems.length
  };
}
