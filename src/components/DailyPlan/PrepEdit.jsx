// src/components/DailyPlan/PrepEdit.jsx
import Select from "react-select";
import { Chevron, CopyIcon, PasteIcon } from "../icons";
import SortableList from "./SortableList";

export default function PrepEdit({
  id,
  name,
  pastel,
  data,
  standardOptions,
  collapsed,
  onToggleCollapse,
  onChangeTitle,
  onChangePerformanceGoal,
  onChangeObjective,
  onChangeStandards,
  onAddPrepStep,
  onRemovePrepStep,
  onEditPrepStep,
  onAddSeqStep,
  onRemoveSeqStep,
  onEditSeqStep,
  onReorderPrepStep,
  onReorderSeqStep,
  onCopy,
  onPaste,
  canPaste,
}) {
  const prepSteps = Array.isArray(data.prepSteps) ? data.prepSteps : [""];
  const seqSteps = Array.isArray(data.seqSteps) ? data.seqSteps : [""];

  return (
    <section className="bg-white p-5 rounded-lg border border-gray-200 shadow-md space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold" style={{ color: pastel.text }}>{name}</h2>
        <div className="flex items-center space-x-2">
          <button type="button" onClick={() => onCopy(id)} className="px-2 py-1 rounded hover:bg-gray-100" title="Copy prep" aria-label="Copy prep">
            <CopyIcon />
          </button>
          <button
            type="button"
            onClick={() => onPaste(id)}
            className={`px-2 py-1 rounded hover:bg-gray-100 ${!canPaste ? "opacity-50 pointer-events-none" : ""}`}
            title="Paste to prep"
            aria-label="Paste to prep"
            disabled={!canPaste}
          >
            <PasteIcon />
          </button>
          <button
            className="ml-2 px-2 py-1 rounded hover:bg-gray-100"
            aria-label={collapsed ? "Expand section" : "Collapse section"}
            aria-expanded={!collapsed}
            type="button"
            onClick={() => onToggleCollapse(id)}
            style={{ fontSize: 15, color: pastel.text, lineHeight: 1.2 }}
          >
            <Chevron collapsed={collapsed} />
          </button>
        </div>
      </div>

      <div
        style={{
          maxHeight: collapsed ? 0 : 2000,
          opacity: collapsed ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.5,0,0.5,1), opacity 0.22s",
        }}
        aria-hidden={collapsed}
      >
        <div className="mb-2">
          <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Lesson Title</label>
          <input
            type="text"
            className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
            value={data.title || ""}
            onChange={e => onChangeTitle(id, e.target.value)}
          />
        </div>

        <div className="mb-2">
          <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Standards</label>
          <Select
            isMulti
            options={standardOptions}
            value={standardOptions.filter(o => (data.standards || []).includes(o.value))}
            onChange={opts => onChangeStandards(id, opts ? opts.map(x => x.value) : [])}
            className="react-select-container"
            classNamePrefix="react-select"
          />
        </div>

        <section className="mb-4 bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-inner" style={{ borderLeft: `6px solid ${pastel.bg}` }}>
          <div className="mb-2">
            <label className="block font-semibold mb-1" style={{ color: pastel.text }}>Performance Goal</label>
            <input
              type="text"
              className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
              value={data.performanceGoal || ""}
              onChange={e => onChangePerformanceGoal(id, e.target.value)}
              placeholder="End product, assessment, or measurable outcome"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: pastel.text }}>Daily Objective</label>
            <input
              type="text"
              className="w-full border rounded p-2 text-gray-900 bg-gray-50 focus:ring-2 focus:ring-gray-300"
              value={data.objective || ""}
              onChange={e => onChangeObjective(id, e.target.value)}
              placeholder="We will..."
            />
          </div>
        </section>

        {/* What do I need? (sortable) */}
        <div className="mb-2">
          <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>What do I need?</label>

          <SortableList
            items={prepSteps}
            idPrefix={`${id}-prep`}
            onReorder={(from, to) => onReorderPrepStep(id, from, to)}
            renderItem={(i) => (
              <div className="flex items-start space-x-2">
                <textarea
                  className="flex-1 border rounded p-2 resize-none overflow-hidden bg-gray-50 focus:ring-2 focus:ring-gray-300"
                  rows={1}
                  value={prepSteps[i] || ""}
                  onChange={e => onEditPrepStep(id, i, e.target.value)}
                  onInput={e => {
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder={`Thing ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onRemovePrepStep(id, i)}
                  className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded transition"
                >
                  ✕
                </button>
              </div>
            )}
          />

          <button
            type="button"
            onClick={() => onAddPrepStep(id)}
            className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mt-2 font-semibold"
          >
            + Add Thing
          </button>
        </div>

        {/* Planned Lesson Sequence (sortable) */}
        <div className="mb-2 mt-4">
          <label className="block text-lg font-medium mb-1" style={{ color: pastel.text }}>Planned Lesson Sequence</label>

          <SortableList
            items={seqSteps}
            idPrefix={`${id}-seq`}
            onReorder={(from, to) => onReorderSeqStep(id, from, to)}
            renderItem={(i) => (
              <div className="flex items-start space-x-2">
                <textarea
                  className="flex-1 border rounded p-2 resize-none overflow-hidden bg-gray-50 focus:ring-2 focus:ring-gray-300"
                  rows={1}
                  value={seqSteps[i] || ""}
                  onChange={e => onEditSeqStep(id, i, e.target.value)}
                  onInput={e => {
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder={`Plan ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onRemoveSeqStep(id, i)}
                  className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded transition"
                >
                  ✕
                </button>
              </div>
            )}
          />

          <button
            type="button"
            onClick={() => onAddSeqStep(id)}
            className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mt-2 font-semibold"
          >
            + Add Plan
          </button>
        </div>
      </div>
    </section>
  );
}
