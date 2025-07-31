import React, { useState } from "react";
import ela8 from "../data/standards/ela8.json";

export default function StandardsKanban() {
  // Initial state: all standards in "upcoming"
  const [columns, setColumns] = useState({
    upcoming: ela8,
    q1: [],
    q2: [],
    q3: [],
    q4: [],
  });
  // Collapse state for each column
  const [open, setOpen] = useState({
    upcoming: true,
    q1: false,
    q2: false,
    q3: false,
    q4: false,
  });

  const toggleColumn = (col) => {
    setOpen((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const renderColumn = (key, title) => {
    const cards = columns[key] || [];
    return (
      <div className="w-1/5 border rounded-lg bg-gray-50">
        {/* Header */}
        <div
          className="flex items-center justify-between p-2 bg-gray-200 cursor-pointer"
          onClick={() => toggleColumn(key)}
        >
          <span className="font-semibold">{title} ({cards.length})</span>
          <span className="text-sm">
            {open[key] ? "−" : "+"}
          </span>
        </div>
        {/* Cards */}
        {open[key] && (
          <div className="p-2 space-y-2 max-h-[60vh] overflow-auto">
            {cards.map((c) => (
              <div
                key={c.code}
                className="p-2 bg-white border rounded shadow-sm"
              >
                <strong>{c.code}</strong>: {c.text}
              </div>
            ))}
            {cards.length === 0 && (
              <p className="text-gray-500 italic">No standards</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex space-x-4 p-6">
      {renderColumn("upcoming", "Upcoming")}
      {renderColumn("q1", "Q1")}
      {renderColumn("q2", "Q2")}
      {renderColumn("q3", "Q3")}
      {renderColumn("q4", "Q4")}
    </div>
  );
}
