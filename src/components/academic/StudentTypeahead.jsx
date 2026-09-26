import { useState, useRef, useId, useMemo, useEffect } from "react";
import { Avatar } from "./Avatar.jsx";

export function StudentTypeahead({ students, value, onSelect, onClear, inputClassName = "", dropdownClassName = "" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef(null);
  const listboxId = useId();

  const selected = value ? students.find(s => s.id === value) : null;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 10);
    return students
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.homeroom && s.homeroom.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [query, students]);

  const chooseStudent = (student) => {
    if (!student) return;
    onSelect(student.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      chooseStudent(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    function onDoc(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white border border-slate-300 shadow-sm text-sm">
          <Avatar name={selected.name} />
          <span className="truncate max-w-[260px]">
            {selected.name}
            {selected.homeroom ? ` • ${selected.homeroom}` : ""}
            {selected.grade ? ` • G${selected.grade}` : ""}
          </span>
        </span>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 shadow-sm"
          onClick={onClear}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition ${inputClassName}`}
        placeholder="Type a student name…"
        aria-label="Search Students"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => { setOpen(true); setActiveIndex((current) => current < 0 ? 0 : current); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Student Suggestions"
          className={`absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-auto ${dropdownClassName}`}
        >
          {suggestions.length === 0 && (
            <div className="p-2 text-sm text-slate-500">No Matches</div>
          )}
          {suggestions.map((s, index) => (
            <button
              type="button"
              key={s.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseStudent(s)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left ${index === activeIndex ? "bg-sky-50" : "hover:bg-slate-50"}`}
            >
              <Avatar name={s.name} />
              <div className="truncate">
                <div className="text-sm font-medium truncate text-slate-900">{s.name}</div>
                {(s.homeroom || s.grade) && (
                  <div className="text-xs text-slate-500 truncate">
                    {s.homeroom ? s.homeroom : ""}
                    {s.homeroom && s.grade ? " • " : ""}
                    {s.grade ? `G${s.grade}` : ""}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
