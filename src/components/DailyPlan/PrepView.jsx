// src/components/DailyPlan/PrepView.jsx
import { Chevron } from "../icons";

export default function PrepView({
  id,
  name,
  pastel,
  prep = {},
  standardsIndex,
  collapsed,
  onToggleCollapse,
  onTogglePrep,
  onToggleSeq,
}) {
  return (
    <section className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
      {/* Header with prep name and lesson title */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold" style={{ color: pastel.text }}>
            {name}
          </h2>
          <div className="mt-0.5 text-gray-800 truncate" title={prep.title || ""}>
            {prep.title ? (
              <span className="font-medium">{prep.title}</span>
            ) : (
              <span className="italic text-gray-400">Untitled lesson</span>
            )}
          </div>
        </div>

        <button
          className="ml-2 px-2 py-1 rounded hover:bg-gray-100 shrink-0"
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(id)}
          style={{ fontSize: 15, color: pastel.text, lineHeight: 1.2 }}
        >
          <Chevron collapsed={collapsed} />
        </button>
      </div>

      {/* Collapsible body */}
      <div
        style={{
          maxHeight: collapsed ? 0 : 2000,
          opacity: collapsed ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.5,0,0.5,1), opacity 0.22s",
        }}
      >
        {/* Standards */}
        <div className="font-semibold mb-1" style={{ color: pastel.text }}>
          Standards
        </div>
        <ul className="list-disc pl-6 space-y-1 mb-4">
          {(prep.standards || []).map(code => {
            const s = standardsIndex[code];
            return (
              <li key={code} className="text-gray-800 flex items-center">
                <span
                  className="rounded px-2 py-0.5 text-xs mr-2 font-mono"
                  style={{ background: pastel.bg, color: pastel.text, opacity: 0.85 }}
                >
                  {code}
                </span>
                {s?.text}
              </li>
            );
          })}
        </ul>

        {/* Performance/Objective */}
        <section
          className="mb-4 bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-inner"
          style={{ borderLeft: `6px solid ${pastel.bg}` }}
        >
          <div className="mb-2">
            <div className="font-semibold" style={{ color: pastel.text }}>
              Performance Goal
            </div>
            <div className="text-gray-800">
              {prep.performanceGoal || <span className="italic text-gray-400">None set</span>}
            </div>
          </div>
          <div>
            <div className="font-semibold" style={{ color: pastel.text }}>
              Daily Objective
            </div>
            <div className="text-gray-800">
              {prep.objective || <span className="italic text-gray-400">None set</span>}
            </div>
          </div>
        </section>

        {/* What do I need? */}
        {(prep.prepSteps || []).length > 0 && (
          <section className="bg-gray-50 p-3 rounded border border-gray-200 shadow-sm">
            <h3 className="font-medium mb-2" style={{ color: pastel.text }}>
              What do I need?
            </h3>
            <ul className="pl-6 space-y-1">
              {(prep.prepSteps || []).map((step, i) => (
                <li key={i} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={prep.prepDone?.[i] || false}
                    onChange={() => onTogglePrep(id, i)}
                    className="mr-2 scale-110 accent-gray-600"
                    aria-label={`Mark prep item ${i + 1} ${prep.prepDone?.[i] ? "incomplete" : "complete"}`}
                  />
                  <span className={prep.prepDone?.[i] ? "line-through text-gray-500" : ""}>{step}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sequence */}
        {(prep.seqSteps || []).length > 0 && (
          <section className="bg-gray-50 p-3 rounded border border-gray-200 shadow-sm mt-4">
            <h3 className="font-medium mb-2" style={{ color: pastel.text }}>
              Planned Lesson Sequence
            </h3>
            <ul className="pl-6 space-y-1">
              {(prep.seqSteps || []).map((step, i) => (
                <li key={i} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={prep.seqDone?.[i] || false}
                    onChange={() => onToggleSeq(id, i)}
                    className="mr-2 scale-110 accent-gray-600"
                    aria-label={`Mark sequence item ${i + 1} ${prep.seqDone?.[i] ? "incomplete" : "complete"}`}
                  />
                  <span className={prep.seqDone?.[i] ? "line-through text-gray-500" : ""}>{step}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
