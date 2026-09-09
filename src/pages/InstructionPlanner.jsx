import React, { useContext, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { AuthContext } from "../AuthContext.jsx";
import { listenSequences, completeAndActivateNext, skipAndActivateNext } from "../services/sequences.js";
import { listenPlannerRows, listenPlannerSelection, saveElaWeekDays, selectPlannerSequence } from "../services/planner.js";
import { addDays, assignedSkills, dateKey, displayDate, mondayOf, safeMaterialsUrl } from "../utils/planner.js";
import WinPlan from "../components/WinPlan.jsx";
import PlannerDay from "../components/PlannerDay.jsx";
import PlannerElaDay from "../components/PlannerElaDay.jsx";
import InstructionReport from "../components/InstructionReport.jsx";
import ela8 from "../data/standards/ela8.json";

const views = [["today", "Today"], ["win", "WIN Coverage"], ["ixl", "Assigned IXL Skills"], ["reports", "Instruction Reports"]];
const recordViews = views.filter(([key]) => key !== "today");
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40";

function LessonItems({ title, items = [], numbered = false }) {
  const visibleItems = items.filter((item) => item.text?.trim() || safeMaterialsUrl(item.url));
  if (!visibleItems.length) return null;
  const List = numbered ? "ol" : "ul";
  return <section className={numbered ? "rounded-lg bg-violet-50/50 p-4" : ""}>
    <h4 className="text-sm font-bold text-slate-950">{title}</h4>
    <List className={`mt-2 space-y-3 pl-5 text-base leading-7 text-slate-700 marker:font-semibold marker:text-violet-600 ${numbered ? "list-decimal" : "list-disc"}`}>
      {visibleItems.map((item) => <li key={item.id} className="pl-1">
        <span className="whitespace-pre-wrap break-words">{item.text}</span>
        {safeMaterialsUrl(item.url) && <a className="mt-1 flex w-fit items-center gap-1 rounded text-sm font-bold text-violet-800 underline underline-offset-2 hover:text-violet-600" href={safeMaterialsUrl(item.url)} target="_blank" rel="noreferrer" aria-label={`Open resource: ${item.text || "Lesson material"}`}>Open Resource <ExternalLink size={13} aria-hidden="true" /></a>}
      </li>)}
    </List>
  </section>;
}

export default function InstructionPlanner() {
  const { user } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  const today = dateKey();
  const view = views.some(([key]) => key === params.get("view")) ? params.get("view") : "today";
  const rawDate = params.get("date");
  const plannerDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(new Date(`${rawDate}T12:00:00`).getTime()) ? rawDate : today;
  const rawWeek = params.get("week");
  const week = view === "today" ? mondayOf(plannerDate) : rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) && !Number.isNaN(new Date(`${rawWeek}T12:00:00`).getTime()) ? mondayOf(rawWeek) : mondayOf(today);
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [elaWeeks, setElaWeeks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [selection, setSelection] = useState(null);
  const [loaded, setLoaded] = useState({});
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [winHistoryMode, setWinHistoryMode] = useState("standards");
  useEffect(() => {
    const received = (name, setter) => (value) => { setter(value); setLoaded((current) => ({ ...current, [name]: true })); };
    const failed = () => setError("Could not load planner data. Refresh to retry before making changes.");
    const stops = [listenSequences(user.uid, received("sequences", setSequences), failed), listenPlannerSelection(user.uid, received("selection", setSelection), failed),
      ...[["winWeeks", setWeeks], ["elaWeeks", setElaWeeks], ["plannerTasks", setTasks], ["instructionEvents", setEvents], ["instructionReports", setReports]].map(([name, setter]) => listenPlannerRows(user.uid, name, received(name, setter), failed))];
    return () => stops.forEach((stop) => stop());
  }, [user.uid]);
  useEffect(() => {
    const leave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    const followLink = (e) => {
      const link = e.target.closest?.("a[href]");
      if (dirty && link && link.target !== "_blank") { e.preventDefault(); e.stopPropagation(); setError("Save or cancel your WIN edits before leaving the planner."); }
    };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", followLink, true); };
  }, [dirty]);
  useEffect(() => {
    // Adopt the existing active sequence once. Subsequent changes are manual.
    if (!loaded.selection || !loaded.sequences || selection?.sequenceId != null) return;
    const sequenceId = sequences.find((item) => item.status === "active")?.id || "";
    setSelection({ sequenceId });
    selectPlannerSequence(user.uid, sequenceId).catch(() => setError("Could not remember the selected sequence. Choose it again to retry."));
  }, [loaded.selection, loaded.sequences, selection, sequences, user.uid]);
  function navigate(nextView, nextWeek = week, nextDate = plannerDate) {
    if (dirty) { setError("Save or cancel your WIN edits before changing views or dates."); return; }
    setError(""); setSearch(""); setParams({ view: nextView, week: nextWeek, ...(nextView === "today" ? { date: nextDate } : {}) });
  }
  async function run(action) { setBusy(true); setError(""); try { await action(); return true; } catch (e) { setError(e.message || "Could not save this change."); return false; } finally { setBusy(false); } }
  const selectedId = selection?.sequenceId ?? sequences.find((item) => item.status === "active")?.id ?? "";
  const selected = sequences.find((item) => item.id === selectedId);
  const activeStep = selected?.steps.find((step) => step.id === selected.activeStepId || step.status === "active");
  const loading = Object.keys(loaded).length < 7;
  const completedWeeks = weeks.filter((item) => item.status === "complete").sort((a, b) => b.week.localeCompare(a.week));
  return <div className="mx-auto max-w-7xl space-y-4 pb-12 pt-1">
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-slate-200 pb-3">
      <div className="mr-auto min-w-48">
        <h1 className="text-xl font-bold text-slate-950">Instruction Planner</h1>
        <p className="mt-0.5 text-sm font-medium text-slate-500">{view === "today" ? plannerDate === today ? `Today · ${displayDate(today)}` : `${new Date(`${plannerDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })} · ${displayDate(plannerDate)}` : recordViews.find(([key]) => key === view)?.[1]}</p>
      </div>
      {view !== "today" && <button className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-violet-800" onClick={() => navigate("today", mondayOf(today), today)}><ArrowLeft size={15} /> Back to Planner</button>}
      <details className="group relative">
        <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold shadow-sm [&::-webkit-details-marker]:hidden ${view === "today" ? "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>Planner Records <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></summary>
        <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {recordViews.map(([key, label]) => <button key={key} className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${view === key ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"}`} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); navigate(key); }}>{label}</button>)}
        </div>
      </details>
      {view === "today" && <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <button aria-label="Previous Day" className="px-2.5 text-slate-500 hover:bg-violet-50 hover:text-violet-800" onClick={() => { const date = addDays(plannerDate, -1); navigate("today", mondayOf(date), date); }}><ChevronLeft size={16} /></button>
        <input aria-label="Choose Day" type="date" className="border-x border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 outline-none focus:bg-violet-50" value={plannerDate} onChange={(e) => e.target.value && navigate("today", mondayOf(e.target.value), e.target.value)} />
        <button aria-label="Next Day" className="px-2.5 text-slate-500 hover:bg-violet-50 hover:text-violet-800" onClick={() => { const date = addDays(plannerDate, 1); navigate("today", mondayOf(date), date); }}><ChevronRight size={16} /></button>
        <button disabled={plannerDate === today} className="border-l border-slate-200 px-3 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:text-slate-300" onClick={() => navigate("today", mondayOf(today), today)}>Today</button>
      </div>}
    </header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-600">Loading planner…</p> : <>
      {view === "today" && <>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
          <PlannerDay uid={user.uid} date={plannerDate} today={plannerDate === today} tasks={tasks} onError={setError} />
          <WinPlan key={week} uid={user.uid} week={week} saved={weeks.find((item) => item.week === week)} onDirty={setDirty} />
          </div>
          {plannerDate !== today ? <PlannerElaDay date={plannerDate} sequences={sequences} projection={elaWeeks.find((item) => item.week === week)} busy={busy} onSaveDays={(days) => run(() => saveElaWeekDays(user.uid, week, days))} /> :
          <section className="rounded-xl border border-violet-200 bg-white shadow-sm">
            <header className="rounded-t-xl border-b border-violet-200 bg-violet-50 px-5 py-4">
              <h2 className="text-xs font-bold tracking-wider text-violet-800">ELA · Where We Are</h2>
              <label className="mt-2 block">
                <span className="sr-only">Selected Sequence</span>
                <select disabled={busy} className="w-full rounded-lg border border-violet-200 bg-white/60 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" value={selectedId} onChange={(e) => run(() => selectPlannerSequence(user.uid, e.target.value))}>
                  <option value="">No Sequence Selected</option>
                  {sequences.map((item) => <option key={item.id} value={item.id}>{item.title || "Untitled Sequence"} · {item.status.charAt(0).toUpperCase() + item.status.slice(1)}</option>)}
                </select>
              </label>
            </header>
            <div className="space-y-4 p-5">
            {selected && <>
              <div className="border-b border-violet-100 pb-4">
                <p className="text-xs font-bold tracking-wide text-violet-700">Current Position{activeStep && <> · Step {selected.steps.indexOf(activeStep) + 1} of {selected.steps.length}</>}</p>
                <h3 className="mt-2 text-xl font-bold leading-7 text-slate-950">{activeStep ? activeStep.title || "Untitled Step" : selected.status === "complete" ? "Sequence Complete" : "No Active Step Selected"}</h3>
                {activeStep?.purpose && <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{activeStep.purpose}</p>}
              </div>
              {activeStep && <div className="space-y-5">
                <LessonItems title="Student Experience" items={activeStep.studentExperience} numbered />
                <LessonItems title="Resources & Prep" items={activeStep.resourcesPrep} />
                {activeStep.teacherNotes?.trim() && <section className="border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-bold text-slate-950">Teacher Notes</h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{activeStep.teacherNotes}</p>
                </section>}
                {activeStep.result?.trim() && <section className="border-l-4 border-violet-300 py-1 pl-4">
                  <h4 className="text-sm font-bold text-violet-800">Expected Result</h4>
                  <p className="mt-1 whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{activeStep.result}</p>
                </section>}
              </div>}
              <details className="border-t border-slate-100 pt-4">
                <summary className="cursor-pointer text-sm font-bold text-violet-800">View All Steps</summary>
                <div className="mt-3 space-y-3 text-sm leading-6">
                  {selected.outcome && <p><strong>Sequence Outcome:</strong> {selected.outcome}</p>}
                  <ol className="space-y-2">{selected.steps.map((step, index) => <li key={step.id} className={step.id === activeStep?.id ? "rounded-lg border border-violet-300 bg-violet-50 p-3" : "rounded-lg border border-slate-200 p-3"}>
                    <Link className="font-bold text-violet-800" to={"/command-center/sequences/" + selected.id + "#step-" + step.id}>{index + 1}. {step.title || "Untitled Step"}</Link>
                    <span className="ml-2 text-xs text-slate-500">{step.status.charAt(0).toUpperCase() + step.status.slice(1)}</span>
                  </li>)}</ol>
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Link className={button} to={"/command-center/sequences/" + selected.id}>Open Sequence</Link>
                {activeStep && selected.status === "active" && <>
                  <button disabled={busy} className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40" onClick={() => run(() => completeAndActivateNext(user.uid, selected.id, selected))}>Complete Step & Advance</button>
                  <button disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40" onClick={() => run(() => skipAndActivateNext(user.uid, selected.id, selected))}>Skip Step</button>
                </>}
              </div>
            </>}
          </div></section>}
        </div>
      </>}
      {view === "ixl" && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Assigned IXL skills</h2><input aria-label="Search assigned skills" placeholder="Search skill name or code" className="my-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-3 pr-4">Assigned Monday</th><th className="pr-4">IXL skill</th><th>Code</th></tr></thead><tbody>{assignedSkills(weeks).filter((skill) => `${skill.name} ${skill.code}`.toLowerCase().includes(search.toLowerCase())).map((skill) => <tr key={skill.id} className="border-b border-slate-100"><td className="whitespace-nowrap py-4 pr-4"><button className="font-semibold text-violet-700 underline" onClick={() => navigate("today", skill.week, skill.week)}>{displayDate(skill.week)}</button></td><td className="pr-4">{skill.name}</td><td className="font-mono font-bold">{skill.code}</td></tr>)}</tbody></table></div>{!assignedSkills(weeks).length && <p className="py-6 text-sm text-slate-500">Skills appear here when you save them in a WIN plan.</p>}</section>}
      {view === "win" && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">WIN coverage history</h2><p className="mt-1 text-sm text-slate-600">Confirmed practice and one reflection per week.</p></div><Link to="/command-center/standards" className={button}>Standards Pulse</Link></div>
        <div className="flex flex-wrap gap-3"><input aria-label="Search WIN coverage" placeholder="Search topic, standard, or reflection" className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Group WIN history" className={button} value={winHistoryMode} onChange={(e) => setWinHistoryMode(e.target.value)}><option value="standards">By standard</option><option value="weeks">By week</option></select></div>
        {winHistoryMode === "standards" ? ela8.filter((standard) => completedWeeks.some((item) => item.standards.includes(standard.code)) && `${standard.code} ${standard.text} ${completedWeeks.filter((item) => item.standards.includes(standard.code)).map((item) => `${item.title} ${item.reflection}`).join(" ")}`.toLowerCase().includes(search.toLowerCase())).map((standard) => {
          const history = completedWeeks.filter((item) => item.standards.includes(standard.code));
          return <details key={standard.code} className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm leading-6"><strong className="text-violet-800">{standard.code} · Practiced in {history.length} week{history.length === 1 ? "" : "s"}</strong><p className="mt-1 text-slate-700">{standard.text}</p></summary><div className="mt-4 space-y-4">{history.map((item) => <div key={item.week} className="border-t border-slate-100 pt-3"><button className="text-sm font-bold text-violet-800 underline" onClick={() => navigate("today", item.week, item.week)}>{displayDate(item.week)} · {item.title}</button><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.reflection}</p></div>)}</div></details>;
        }) : completedWeeks.filter((item) => `${item.title} ${item.standards.join(" ")} ${item.reflection}`.toLowerCase().includes(search.toLowerCase())).map((item) => <article key={item.week} className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-sky-800">Week of {displayDate(item.week)}</p><h3 className="mt-1 text-lg font-bold">{item.title}</h3></div><button className={button} onClick={() => navigate("today", item.week, item.week)}>Open Week</button></div><ul className="mt-3 space-y-2">{item.standards.map((code) => <li key={code} className="text-sm leading-6"><span className="font-bold text-violet-800">{code} · Practiced</span><span className="ml-2 text-slate-600">{ela8.find((standard) => standard.code === code)?.text}</span></li>)}</ul><p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-6 text-slate-700">{item.reflection}</p></article>)}
        {!completedWeeks.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Complete a WIN week to record practiced standards and its reflection here.</p>}
      </section>}
      {view === "reports" && <InstructionReport uid={user.uid} sequences={sequences} weeks={weeks} events={events} reports={reports} />}
    </>}
  </div>;
}
