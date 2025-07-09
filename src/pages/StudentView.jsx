// src/pages/StudentView.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

export default function StudentView() {
  const [allNames, setAllNames]       = useState([]);
  const [queryText, setQueryText]     = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const navigate                       = useNavigate();
  const containerRef                   = useRef();

  // 1) Load all distinct studentName values from the reports collection
  useEffect(() => {
    async function loadNames() {
      const snap = await getDocs(collection(db, "reports"));
      const names = snap.docs.map(d => d.data().studentName || "");
      setAllNames(Array.from(new Set(names)));
    }
    loadNames();
  }, []);

  // 2) Filter suggestions as the user types
  useEffect(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return setSuggestions([]);
    setSuggestions(
      allNames
        .filter(n => n.toLowerCase().includes(q))
        .slice(0, 10)
    );
  }, [queryText, allNames]);

  // 3) When the user clicks a suggestion, navigate to the detail page
  function selectName(name) {
    setQueryText(name);
    setSuggestions([]);
    navigate(`/student/${encodeURIComponent(name)}`);
  }

  // 4) Hide suggestions if the user clicks outside the input area
  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Student View</h2>

      <div className="relative mb-6" ref={containerRef}>
        <label className="block text-sm font-medium mb-1">
          Search Student Name
        </label>
        <input
          type="text"
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          placeholder="Start typing..."
          className="w-full border rounded p-2"
        />

        {suggestions.length > 0 && (
          <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-60 overflow-auto">
            {suggestions.map(name => (
              <li
                key={name}
                onClick={() => selectName(name)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!queryText && (
        <p className="text-gray-500">Type a student’s name to get started.</p>
      )}
    </div>
  );
}
