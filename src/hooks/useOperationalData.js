import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import { operationalWindowQueries, operationalWorkloadQueries, subscribeOperationalRows } from "../services/operationalData.js";
import { startOfWindow } from "../utils/operationalMetrics.js";

function useRows(queries) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => subscribeOperationalRows(queries,
    result => setSnapshot({ queries, ...result }),
    (error, key) => console.error(`[OperationalDashboard] ${key}`, error),
  ), [queries]);
  // Do not briefly render the previous window/account while new listeners start.
  return snapshot?.queries === queries ? snapshot : { data: {}, loading: true, errors: [] };
}

export function useOperationalData(uid, days, includeHomeContacts) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const start = startOfWindow(now, days).getTime();
  const workloadQueries = useMemo(() => ({ uid, rows: operationalWorkloadQueries(db, includeHomeContacts) }), [uid, includeHomeContacts]);
  const windowQueries = useMemo(() => ({ uid, rows: operationalWindowQueries(db, new Date(start)) }), [uid, start]);
  const workload = useRows(workloadQueries.rows);
  const windowed = useRows(windowQueries.rows);
  return {
    data: { ...workload.data, ...windowed.data },
    loading: workload.loading || windowed.loading,
    errors: [...workload.errors, ...windowed.errors],
    now,
  };
}
