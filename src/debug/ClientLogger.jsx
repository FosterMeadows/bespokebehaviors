// src/debug/ClientLogger.js
// Drop‑in in‑app logger for when DevTools are blocked by policy.
// Features:
// - Enable with ?debug=1 (or programmatically via enableLogger()).
// - Captures console.log/warn/error + window.onerror + unhandledrejection.
// - Floating overlay with pause/clear/copy + level filters.
// - Persists last N entries to localStorage between reloads.
// - Zero external deps.

import React, { useEffect, useMemo, useRef, useState } from "react";

const LS_KEY = "__omnitool_client_logs_v1";
const MAX_BUFFER = 500; // cap to avoid memory balloons

function nowISO() {
  try { return new Date().toISOString().split("T")[1].replace("Z", ""); } catch { return ""; }
}

function serialize(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
  if (typeof arg === "object") {
    try { return JSON.stringify(arg, null, 2); } catch { /* circular */ }
  }
  return String(arg);
}

// --- Global toggles ---
let _enabled = false;
export function isLoggerEnabled() { return _enabled; }
export function enableLogger() { _enabled = true; }

// --- Install global hooks ---
export function installClientLogger() {
  if (!import.meta.env.DEV) return () => {};
  if (_enabled || /[?&]debug=1\b/.test(window.location.search)) _enabled = true;
  if (! _enabled) return () => {};

  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const push = (level, args) => {
    const entry = {
      id: crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
      t: Date.now(),
      level,
      msg: args.map(serialize).join(" "),
      path: window.location.pathname + window.location.search,
      ua: navigator.userAgent,
    };
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      arr.push(entry);
      while (arr.length > MAX_BUFFER) arr.shift();
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch {}
  };

  console.log = (...a) => { try { push("log", a); } catch {} orig.log(...a); };
  console.warn = (...a) => { try { push("warn", a); } catch {} orig.warn(...a); };
  console.error = (...a) => { try { push("error", a); } catch {} orig.error(...a); };

  const onErr = (msg, src, line, col, err) => {
    const payload = [msg, `at ${src}:${line || 0}:${col || 0}`, err ? serialize(err) : ""].filter(Boolean);
    try { push("error", payload); } catch {}
  };
  const onRej = (ev) => {
    try { push("error", ["UnhandledRejection:", ev.reason ? serialize(ev.reason) : "<no reason>"]); } catch {}
  };

  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);

  return () => {
    console.log = orig.log; console.warn = orig.warn; console.error = orig.error;
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  };
}

// --- Overlay UI ---
export function DebugOverlay() {
  const [open, setOpen] = useState(_enabled);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("all"); // all|log|warn|error
  const [rows, setRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
  });

  const boxRef = useRef(null);

  // live sync from localStorage (polling is cheap, 500ms)
  useEffect(() => {
    if (! _enabled) return;
    const id = setInterval(() => {
      if (paused) return;
      try {
        const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        setRows(arr);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [paused]);

  const view = useMemo(() => rows.filter(r => filter === "all" || r.level === filter), [rows, filter]);

  if (!import.meta.env.DEV || ! _enabled) return null;

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ padding: "6px 10px", border: "1px solid #888", borderRadius: 8, background: "#fff" }}>Logs</button>
      )}

      {open && (
        <div style={{ width: 420, height: 260, display: "flex", flexDirection: "column", background: "#111", color: "#eee", border: "1px solid #444", borderRadius: 10, boxShadow: "0 6px 30px rgba(0,0,0,.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderBottom: "1px solid #333" }}>
            <strong style={{ fontSize: 12, letterSpacing: .3 }}>Client Logs</strong>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginLeft: 8, background: "#000", color: "#eee", border: "1px solid #444", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}>
              <option value="all">all</option>
              <option value="log">log</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
            <button onClick={() => setPaused(p => !p)} style={{ marginLeft: 6, padding: "2px 8px", fontSize: 12, background: paused ? "#555" : "#222", color: "#ddd", border: "1px solid #444", borderRadius: 6 }}>{paused ? "Resume" : "Pause"}</button>
            <button onClick={() => { try { localStorage.setItem(LS_KEY, "[]"); setRows([]); } catch {} }} style={{ marginLeft: 6, padding: "2px 8px", fontSize: 12, background: "#222", color: "#ddd", border: "1px solid #444", borderRadius: 6 }}>Clear</button>
            <button onClick={() => {
              try {
                const text = view.map(r => `[${new Date(r.t).toLocaleTimeString()}] ${r.level.toUpperCase()} ${r.msg}`).join("\n");
                navigator.clipboard.writeText(text);
              } catch {}
            }} style={{ marginLeft: 6, padding: "2px 8px", fontSize: 12, background: "#222", color: "#ddd", border: "1px solid #444", borderRadius: 6 }}>Copy</button>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 12, background: "#222", color: "#ddd", border: "1px solid #444", borderRadius: 6 }}>Hide</button>
          </div>
          <pre ref={boxRef} style={{ flex: 1, margin: 0, padding: 8, overflow: "auto", fontSize: 12, lineHeight: 1.25 }}>
            {view.map((r) => (
              <div key={r.id} style={{ color: r.level === "error" ? "#ff6b6b" : r.level === "warn" ? "#ffd166" : "#9be9a8" }}>
                [{nowISO()}] {r.level.toUpperCase()} {r.msg}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

// Convenience wrapper you can call once in your app root.
export function useInstallClientLogger() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    if (installed) return; const off = installClientLogger(); setInstalled(true); return off;
  }, [installed]);
}
