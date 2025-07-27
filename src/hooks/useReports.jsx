import { useState, useEffect, useContext } from "react";
import { AuthContext } from "../AuthContext.jsx";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit as limitFn
} from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * Hook to subscribe in real time to reports for the current user.
 * Optional filters:
 *  - studentName: fetch only reports for a specific student
 *  - limit: maximum number of documents to return
 * 
 * Returns { reports, loading, error }.
 */
export function useReports({ studentName, limit } = {}) {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;

    // Build base query: teacherId filter + optional studentName
    let q = query(
      collection(db, "reports"),
      where("teacherId", "==", user.uid)
    );

    if (studentName) {
      q = query(q, where("studentName", "==", studentName));
    }

    // Order and optional limit
    q = query(q, orderBy("timestamp", "desc"));
    if (typeof limit === "number") {
      q = query(q, limitFn(limit));
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setReports(items);
        setLoading(false);
      },
      (err) => {
        console.error("Error in useReports:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, studentName, limit]);

  return { reports, loading, error };
}
