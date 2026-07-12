import React, { useCallback, useEffect, useState } from "react";

/**
 * One-Minute Human — Minimal, Presentable, Big-Screen
 * - Three modes (Narrative / Why-Fi / Argument), one at a time
 * - Huge timer, huge results, centered layout
 * - Class picker + simple per-class leaderboard (localStorage)
 * - Keyboard: Space = start/stop timer, S = spin, R = reset results
 */

const CLASSES = ["8th A", "8th B", "8th C", "Honors"];

// Pools
const CHARACTERS = [
  "a sleep-deprived wizard",
  "a raccoon who thinks it’s a lawyer",
  "the last librarian on Earth",
  "a substitute teacher made of slime",
  "a time-travelling janitor",
  "a cloud with anger issues",
  "a kid who only speaks in movie quotes",
  "a hamster astronaut",
  "an evil vending machine",
  "a sentient pencil that hates essays",
  "a ghost allergic to haunted houses",
  "an alien exchange student",
  "a refrigerator with stage fright",
  "a robot who wants to dream",
  "a principal who’s secretly a superhero",
];

const SETTINGS = [
  "the school cafeteria at midnight",
  "a mall sinking into the ocean",
  "inside a video game updating itself",
  "the lost-and-found five years later",
  "a library where books whisper gossip",
  "a bus trapped in a time loop",
  "a carnival that appears once a century",
  "the roof during a thunderstorm",
  "the moon’s first fast-food restaurant",
  "the center of a giant snow globe",
  "a classroom where everything is slightly wrong",
  "a city built entirely out of candy",
  "the teacher’s lounge in an alternate dimension",
  "a museum where exhibits argue with visitors",
  "the inside of your own dream",
];

const WHYFI_QUESTIONS = [
  "Why is the sky blue?",
  "Why do onions make people cry?",
  "Why do we hiccup?",
  "Why do our fingers wrinkle in water?",
  "Why do airplanes leave white trails?",
  "Why do cats purr?",
  "Why can’t we tickle ourselves?",
  "Why is metal colder than wood at the same temperature?",
  "Why are leaves green, then not?",
  "Why do some people sneeze in bright sunlight?",
  "Why can we see the moon during the day?",
];

const ARG_PROMPTS = [
  "Should homework be banned?",
  "Is AI-generated art ‘real’ art?",
  "Should schools have uniforms?",
  "Is social media more harmful than helpful for teens?",
  "Should we grade participation?",
  "Should cell phones be allowed in class?",
  "Is year-round school a good idea?",
];

// Utils
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const key = (className) => `omh_lb_${className}`;
const MODES = ["Narrative", "Why-Fi", "Argument", "Leaderboard"];

/* -------------------- Leaderboard hook -------------------- */
function useLeaderboard(selectedClass) {
  const [board, setBoard] = useState([]);
  useEffect(() => {
    const raw = localStorage.getItem(key(selectedClass));
    setBoard(raw ? JSON.parse(raw) : []);
  }, [selectedClass]);
  useEffect(() => {
    localStorage.setItem(key(selectedClass), JSON.stringify(board));
  }, [board, selectedClass]);

  const addOrUpdate = (name, delta) => {
    setBoard((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (idx >= 0) copy[idx] = { ...copy[idx], pts: copy[idx].pts + delta };
      else copy.push({ name: name.trim(), pts: delta });
      return copy
        .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
        .slice(0, 100);
    });
  };
  const reset = () => setBoard([]);
  return { board, addOrUpdate, reset };
}

/* -------------------- Big Timer -------------------- */
function BigTimer({ seconds, running, onDone }) {
  const [t, setT] = useState(seconds);
  useEffect(() => setT(seconds), [seconds]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setT((x) => {
        if (x <= 1) {
          clearInterval(id);
          onDone && onDone();
          return 0;
        }
        return x - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onDone]);

  const pct = Math.max(0, Math.min(100, (t / seconds) * 100 || 0));

  return (
    <div className="w-full max-w-3xl">
      <div
        className={`mx-auto flex items-center justify-center rounded-3xl border text-center
          ${t <= 10 ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}
          h-28`}
      >
        <span className="tabular-nums text-6xl font-bold tracking-tight">{t}s</span>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
        <div
          className={`h-2 rounded-full ${t <= 10 ? "bg-red-400" : "bg-slate-700"}`}
          style={{ width: `${pct}%`, transition: "width 0.25s linear" }}
        />
      </div>
    </div>
  );
}

/* -------------------- Header Bar -------------------- */
function HeaderBar({
  mode,
  setMode,
  selectedClass,
  setSelectedClass,
  seconds,
  setSeconds,
  running,
  setRunning,
  onSpin,
  onResetResults,
}) {
  return (
    <header className="mx-auto w-full max-w-6xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">One-Minute Human</h1>
          <span className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600">
            Mind first. Machine later.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="Mode"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            aria-label="Class"
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={seconds}
            onChange={(e) => setSeconds(parseInt(e.target.value))}
            aria-label="Timer"
          >
            {[30, 45, 60, 90, 120].map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>

          <button
            className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white ${
              running ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
            onClick={() => setRunning((v) => !v)}
            title="Start/stop timer (Space)"
          >
            {running ? "Stop" : "Start"}
          </button>

          <button
            className="rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100"
            onClick={onSpin}
            title="Spin (S)"
          >
            Spin
          </button>

          <button
            className="rounded-2xl border px-4 py-2 text-sm hover:bg-slate-100"
            onClick={onResetResults}
            title="Reset results (R)"
          >
            Reset
          </button>
        </div>
      </div>
    </header>
  );
}

/* -------------------- Centered Boards -------------------- */
function CenterStage({ children }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 py-6">
      {children}
    </div>
  );
}

function ResultBlock({ title, lines }) {
  return (
    <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      {title && <p className="mb-3 text-sm font-medium text-slate-500">{title}</p>}
      <div className="space-y-4">
        {lines.map((l, idx) => (
          <p key={idx} className="text-3xl leading-snug">
            {l || "—"}
          </p>
        ))}
      </div>
    </div>
  );
}

/* -------------------- Leaderboard UI -------------------- */
function LeaderboardView({ selectedClass }) {
  const { board, addOrUpdate, reset } = useLeaderboard(selectedClass);
  const [name, setName] = useState("");
  const [delta, setDelta] = useState(3);

  return (
    <CenterStage>
      <div className="w-full max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Leaderboard — {selectedClass}</h2>
          <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-100" onClick={reset}>
            Reset
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-slate-600">Student</label>
            <input
              className="w-56 rounded-xl border px-3 py-2"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Tickets</label>
            <input
              type="number"
              className="w-24 rounded-xl border px-3 py-2"
              value={delta}
              onChange={(e) => setDelta(parseInt(e.target.value || 0))}
            />
          </div>
          <button
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            onClick={() => {
              if (!name.trim()) return;
              addOrUpdate(name, delta);
              setName("");
            }}
          >
            + Add
          </button>
        </div>

        <ol className="divide-y rounded-2xl border">
          {board.length === 0 && (
            <li className="p-3 text-sm text-slate-500">No entries yet. Add someone above.</li>
          )}
          {board.map((p, i) => (
            <li key={p.name} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm">
                  {i + 1}
                </span>
                <span className="text-base font-medium">{p.name}</span>
              </div>
              <span className="text-sm tabular-nums">{p.pts} tickets</span>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-xs text-slate-500">
          Tips: +3 for 30s survival, +5 volunteer, +1 good question.
        </p>
      </div>
    </CenterStage>
  );
}

/* -------------------- Main Page -------------------- */
export default function OneMinuteHuman() {
  const [mode, setMode] = useState(MODES[0]); // Narrative default
  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);

  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);

  // Narrative state
  const [charPick, setCharPick] = useState("");
  const [setPick, setSetPick] = useState("");

  // Why-Fi state
  const [whyfi, setWhyfi] = useState("");

  // Argument state
  const [argu, setArgu] = useState("");

  // Spin logic per mode
  const spin = useCallback(() => {
    if (mode === "Narrative") {
      setCharPick(pick(CHARACTERS));
      setSetPick(pick(SETTINGS));
      return;
    }
    if (mode === "Why-Fi") {
      setWhyfi(pick(WHYFI_QUESTIONS));
      return;
    }
    if (mode === "Argument") {
      setArgu(pick(ARG_PROMPTS));
      return;
    }
  }, [mode]);

  const resetResults = useCallback(() => {
    setCharPick("");
    setSetPick("");
    setWhyfi("");
    setArgu("");
  }, []);

  // Keyboard shortcuts: Space = start/stop, S = spin, R = reset results
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((v) => !v);
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        spin();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetResults();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetResults, spin]);

  return (
    <div className="min-h-svh bg-white text-slate-900">
      <HeaderBar
        mode={mode}
        setMode={setMode}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        seconds={seconds}
        setSeconds={setSeconds}
        running={running}
        setRunning={setRunning}
        onSpin={spin}
        onResetResults={resetResults}
      />

      {/* Center stage area */}
      {mode !== "Leaderboard" ? (
        <CenterStage>
          <BigTimer seconds={seconds} running={running} onDone={() => setRunning(false)} />

          {mode === "Narrative" && (
            <ResultBlock
              title="Story Spin"
              lines={[
                charPick ? `Character: ${charPick}` : "",
                setPick ? `Setting: ${setPick}` : "",
                (!charPick && !setPick) ? "Spin to get a character and a setting. Tell a story with a beginning, a conflict, and a resolution before the timer hits zero." : "",
              ]}
            />
          )}

          {mode === "Why-Fi" && (
            <ResultBlock
              title="Informative: Why-Fi"
              lines={[
                whyfi || "Spin to get a question. Look it up briefly, close the screen, explain it in your own words.",
                "Goal: clear explanation in 60 seconds. No notes.",
              ]}
            />
          )}

          {mode === "Argument" && (
            <ResultBlock
              title="Argument: Convince Me"
              lines={[
                argu || "Spin to get a prompt. Two minutes to think, one minute to persuade.",
                "Structure: claim, two reasons, one counterpoint if possible.",
              ]}
            />
          )}

          <div className="flex gap-2">
            <button
              className="rounded-2xl bg-slate-900 px-6 py-3 text-lg font-semibold text-white hover:opacity-90"
              onClick={spin}
            >
              Spin
            </button>
            <button
              className="rounded-2xl border px-6 py-3 text-lg hover:bg-slate-100"
              onClick={resetResults}
            >
              Reset
            </button>
          </div>
        </CenterStage>
      ) : (
        <LeaderboardView selectedClass={selectedClass} />
      )}

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 text-xs text-slate-500">
        <p>Shortcuts: Space start/stop • S spin • R reset results</p>
      </footer>
    </div>
  );
}
