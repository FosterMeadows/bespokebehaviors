import React, { useMemo, useState, useEffect } from "react";

/** Pastel palette + hook to mirror DailyPlan aesthetic */
const PASTEL_COLORS = [
  { bg: "hsl(200, 60%, 90%)", text: "hsl(200, 50%, 40%)" },
  { bg: "hsl(160, 60%, 90%)", text: "hsl(160, 50%, 32%)" },
  { bg: "hsl(40, 80%, 92%)",  text: "hsl(40, 50%, 38%)" },
  { bg: "hsl(280, 60%, 93%)", text: "hsl(280, 50%, 40%)" },
  { bg: "hsl(340, 60%, 94%)", text: "hsl(340, 50%, 42%)" },
];

function useRandomPastel() {
  const [color, setColor] = useState(PASTEL_COLORS[0]);
  useEffect(() => {
    setColor(PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]);
  }, []);
  return color;
}

export default function GradeCalculator() {
  const pastel = useRandomPastel();

  const [totalInput, setTotalInput] = useState("");
  const [totalPoints, setTotalPoints] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const gradientStyle = useMemo(
    () => ({
      minHeight: "100vh",
      width: "100%",
      background: `radial-gradient(circle at 50% 50%, ${pastel.bg} 0%, ${pastel.bg} 30%, #fff 70%, #fff 100%)`,
      transition: "background 0.8s",
      padding: "2.5rem 0",
    }),
    [pastel]
  );

  function generateScale() {
    setError("");
    const n = Number(totalInput);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      setRows([]);
      setTotalPoints(null);
      setError("Enter a positive whole number.");
      return;
    }
    const data = [];
    for (let score = n; score >= 0; score--) {
      const pct = Math.round((score / n) * 100);
      data.push({ score, total: n, pct });
    }
    setTotalPoints(n);
    setRows(data);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") generateScale();
  }

  return (
    <div style={gradientStyle}>
      <div className="max-w-4xl mx-auto p-6 space-y-6 bg-gray-50 rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
          <h1 className="text-2xl font-bold" style={{ color: pastel.text }}>
            Grade Calculator
          </h1>
        </div>

        {/* Controls — centered */}
        <section
          className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm"
          style={{ borderLeft: `6px solid ${pastel.bg}` }}
        >
          <div className="max-w-xl mx-auto text-center">
            <label
              htmlFor="totalPoints"
              className="block text-lg font-medium mb-2"
              style={{ color: pastel.text }}
            >
              Total points for the assignment
            </label>
            <div className="flex items-center justify-center gap-3">
              <input
                id="totalPoints"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                className="w-40 border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300 text-center"
                placeholder="e.g., 20"
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={generateScale}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-900 text-white rounded-lg font-semibold shadow transition"
              >
                Generate Scale
              </button>
            </div>
            {error && <p className="mt-2 text-red-600 font-semibold">{error}</p>}
          </div>
        </section>

        {/* Results — compact container, centered; clean two-column table */}
        <section className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold" style={{ color: pastel.text }}>
              Results {totalPoints ? `for ${totalPoints} points` : ""}
            </h2>
            {rows.length > 0 && (
              <span
                className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: pastel.bg, color: pastel.text, opacity: 0.85 }}
              >
                {rows.length} rows
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-gray-500 italic">Enter a total and click Generate.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded border border-gray-200 max-w-sm md:max-w-md lg:max-w-lg mx-auto">
              <table className="table-auto w-full text-center">
                <thead className="bg-gray-100 sticky top-0 z-20">
                  <tr className="text-sm text-gray-600">
                    <th className="py-2 px-3 font-semibold">Fraction</th>
                    <th className="py-2 px-3 font-semibold">Percent</th>
                  </tr>
                </thead>
                <tbody className="relative z-0">
                  {rows.map((r) => (
                    <tr key={r.score} className="border-t border-gray-100">
                      <td className="py-1.5 px-3 text-gray-800 font-mono">
                        {r.score}/{r.total}
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className="text-sm font-semibold px-2 py-0.5 rounded inline-block align-middle"
                          style={{ background: pastel.bg, color: pastel.text, opacity: 0.9 }}
                        >
                          {r.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-500">
          Percent values are rounded to the nearest whole number.
        </p>
      </div>
    </div>
  );
}
