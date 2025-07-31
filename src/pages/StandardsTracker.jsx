import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import ela8 from "../data/standards/ela8.json";

const STANDARDS_PACKAGES = [
  { id: "ela8", label: "ELA Grade 8", data: ela8 },
  { id: "ccss-math-8", label: "CCSS Math 8th Grade" },
  { id: "ngss-8", label: "NGSS 8th Grade Science" },
];

export default function StandardsTracker() {
  const { user, profile, setProfile } = useContext(AuthContext);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coverage, setCoverage] = useState({});
  const navigate = useNavigate();

  // load saved package
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const ref = doc(db, "teachers", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSelected(snap.data().standardsPackage || "");
        }
      } catch (e) {
        console.error("Failed to load package:", e);
        setError("Could not load saved package.");
      }
      setLoading(false);
    })();
  }, [user]);

  // autosave on selection
  useEffect(() => {
    if (!user || !selected) return;
    const ref = doc(db, "teachers", user.uid);
    updateDoc(ref, { standardsPackage: selected })
      .then(() => setProfile({ ...profile, standardsPackage: selected }))
      .catch((e) => {
        console.error("Autosave failed:", e);
        setError("Failed to save selection.");
      });
  }, [selected]);

  // fetch coverage
  useEffect(() => {
    if (!user || !selected) return;
    (async () => {
      try {
        const plansRef = collection(db, "teachers", user.uid, "dailyPlans");
        const snap = await getDocs(plansRef);
        const cov = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const d = new Date(data.date);
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const year = d.getFullYear();
          const param = `${month}.${day}.${year}`;
          (data.standards || []).forEach((code) => {
            if (!cov[code]) cov[code] = [];
            cov[code].push({
              display: data.date,
              param,
              id: docSnap.id,
            });
          });
        });
        setCoverage(cov);
      } catch (e) {
        console.error("Failed to load coverage:", e);
        setError("Could not load coverage data.");
      }
    })();
  }, [user, selected]);

  // generate a desaturated random color
  const genColor = () => {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 30%, 60%)`;
  };

  // map each pill id to a stable color
  const pillColors = useMemo(() => {
    const map = {};
    Object.values(coverage).forEach((arr) => {
      arr.forEach(({ id }) => {
        if (!map[id]) map[id] = genColor();
      });
    });
    return map;
  }, [coverage]);

  if (loading) return <div className="p-6 text-center">Loading…</div>;

  if (!selected) {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Choose Standards Package</h1>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full border rounded p-2"
        >
          <option value="" disabled>
            -- Select a package --
          </option>
          {STANDARDS_PACKAGES.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const pkg = STANDARDS_PACKAGES.find((p) => p.id === selected);
  const standardsList = pkg?.data || [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Standards Tracker</h1>
        <button
          onClick={() => setSelected("")}
          className="text-sm text-blue-600 hover:underline"
        >
          Change Package
        </button>
      </div>

      <p className="text-gray-700">
        Tracking for <span className="font-medium">{pkg.label}</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {standardsList.map(({ code, text }) => (
          <div key={code} className="border rounded p-4 bg-white">
            <p className="font-semibold">{code}</p>
            <p className="text-sm text-gray-700 mb-2">{text}</p>
            <div className="flex flex-wrap gap-2">
              {(coverage[code] || []).map(({ display, param, id }) => (
                <button
                  key={id}
                  onClick={() => navigate(`/dailyplan?date=${param}`)}
                  style={{ backgroundColor: pillColors[id] }}
                  className="px-3 py-1 text-white rounded-full text-xs"
                >
                  {display}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
