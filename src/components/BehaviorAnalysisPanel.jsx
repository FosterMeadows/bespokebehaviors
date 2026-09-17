import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Link } from "react-router";
import { Sparkles, ChevronDown } from "lucide-react";
import { db, analysisFunctions } from "../firebaseConfig";
import {
  MAX_ANALYSIS_RECORDS,
  normalizeAnalysisScope,
  scopeIdentity,
  sourceIdentity,
} from "../../functions/shared/behaviorAnalysis.js";

const linkClass =
  "rounded font-semibold text-violet-800 underline underline-offset-4 focus:ring-2 focus:ring-violet-400";
async function digest(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function RecordEvidence({ ids, recordsById, label = "supporting records" }) {
  const [limit, setLimit] = useState(10);
  const records = [...new Set(ids)]
    .map((id) => recordsById.get(id))
    .filter(Boolean);
  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-violet-800">
        View {records.length} {label}
      </summary>
      <ul className="mt-3 space-y-3">
        {records.slice(0, limit).map((record) => (
          <li
            key={record.id}
            className="border-t border-slate-100 pt-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {record.studentName || "Student"} ·{" "}
                {record.assignedByName || "Assigning staff not recorded"}
              </span>
              <Link
                className={linkClass}
                to={`/history?tab=behavior&record=${encodeURIComponent(record.id)}`}
              >
                Open record
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Selected category: {record.context || "Not recorded"} ·{" "}
              {record.location || "Location not recorded"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">
              {record.note || "No written reason recorded."}
            </p>
          </li>
        ))}
      </ul>
      {records.length > limit && (
        <button
          type="button"
          className={`${linkClass} mt-3 text-sm`}
          onClick={() => setLimit(limit + 20)}
        >
          Show more records
        </button>
      )}
    </details>
  );
}

function AnalysisFindings({ saved, recordsById }) {
  const { result } = saved;
  return (
    <div className="mt-5 space-y-6">
      {result.omittedFindings > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          {result.omittedFindings} AI suggestions were excluded because their
          supporting evidence could not be verified. Only verified findings are
          shown; this analysis may be incomplete.
        </p>
      )}
      <div>
        <h3 className="font-bold text-slate-950">What the notes suggest</h3>
        {result.insights.length ? (
          result.insights.map((insight, index) => (
            <article key={index} className="mt-3 rounded-lg bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-700">{insight.text}</p>
              <RecordEvidence
                ids={insight.recordIds}
                recordsById={recordsById}
              />
            </article>
          ))
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No supported cross-record summary was returned for this selection.
          </p>
        )}
      </div>
      <div>
        <h3 className="font-bold text-slate-950">Recurring themes</h3>
        <p className="mt-1 text-xs text-slate-500">
          Themes may overlap. Counts come from linked records, not estimates.
        </p>
        {result.themes.length ? (
          <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
            {result.themes.map((theme, index) => (
              <article
                key={index}
                className="rounded-lg border border-violet-100 p-4"
              >
                <h4 className="font-semibold">
                  {theme.title}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    · {theme.recordIds.length} records
                  </span>
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {theme.description}
                </p>
                <RecordEvidence
                  ids={theme.recordIds}
                  recordsById={recordsById}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No recurring theme was identified with enough supporting records.
          </p>
        )}
      </div>
      <div>
        <h3 className="font-bold text-slate-950">
          Category review · {result.categoryReviews.length} suggestions
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Compare what the note describes with the category selected by the
          assigning teacher. These are suggestions for review, not findings of
          error.
        </p>
        {result.categoryReviews.length ? (
          <div className="mt-3 space-y-3">
            {result.categoryReviews.map((review) => {
              const record = recordsById.get(review.recordId);
              if (!record) return null;
              return (
                <article
                  key={review.recordId}
                  className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">
                      {record.assignedByName || "Assigning staff not recorded"}{" "}
                      · {record.studentName || "Student"}
                    </h4>
                    <Link
                      className={linkClass}
                      to={`/history?tab=behavior&record=${encodeURIComponent(review.recordId)}`}
                    >
                      Open record
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">
                        Selected category
                      </p>
                      <p className="mt-1 text-sm">{review.selectedCategory}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">
                        Possible alternative
                      </p>
                      <p className="mt-1 text-sm">{review.suggestedCategory}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase text-slate-500">
                    Written reason
                  </p>
                  <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-amber-300 pl-3 text-sm leading-6">
                    {record.note}
                  </blockquote>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    <strong>AI observation: </strong>
                    {review.explanation}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Supporting excerpt from the redacted note: “
                    {review.evidence}”
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No verified category-review suggestions are available. This does not
            establish that every category is correct.
          </p>
        )}
      </div>
      <div>
        <h3 className="font-bold text-slate-950">
          Patterns by assigning teacher
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Each observation requires at least three supporting records from that
          teacher. Differences may reflect teaching context or student
          populations.
        </p>
        {result.teacherPatterns.length ? (
          result.teacherPatterns.map((pattern, index) => {
            const teacher = [...recordsById.values()].find(
              (record) => record.assignedByUid === pattern.teacherId,
            );
            return (
              <article
                key={index}
                className="mt-3 rounded-lg border border-slate-200 p-4"
              >
                <h4 className="font-semibold">
                  {teacher?.assignedByName || "Assigning staff"}
                </h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pattern.description}
                </p>
                <RecordEvidence
                  ids={pattern.recordIds}
                  recordsById={recordsById}
                />
              </article>
            );
          })
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No teacher-level pattern met the evidence requirement in this
            analysis.
          </p>
        )}
      </div>
      <RecordEvidence
        ids={saved.analyzedRecordIds}
        recordsById={recordsById}
        label="analyzed records"
      />
    </div>
  );
}

function AnalysisPanel({ scope, records, title }) {
  const scopeText = scopeIdentity(scope);
  const sourceText = sourceIdentity(records, scope);
  const [identity, setIdentity] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const recordsById = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );

  useEffect(() => {
    let active = true;
    Promise.all([digest(scopeText), digest(sourceText)])
      .then(([id, fingerprint]) => {
        if (active) setIdentity({ id, fingerprint, scopeText, sourceText });
      })
      .catch(() => {
        if (active)
          setError(
            "This browser could not prepare the analysis. Use a secure connection and try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [scopeText, sourceText]);
  const analysisId = identity?.scopeText === scopeText ? identity.id : null;
  useEffect(() => {
    if (!analysisId) return undefined;
    return onSnapshot(
      doc(db, "behaviorAnalyses", analysisId),
      (snapshot) => {
        setSaved(snapshot.data() || null);
        if (snapshot.data()?.status === "complete") setError("");
        setLoaded(true);
      },
      () => {
        setError(
          "Saved AI analysis is unavailable. The server function and analysis access rules must be deployed before using this feature.",
        );
        setLoaded(true);
      },
    );
  }, [analysisId]);
  useEffect(() => {
    if (saved?.status !== "running") return undefined;
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [saved?.status]);
  const current = Boolean(
    saved?.result &&
      identity?.sourceText === sourceText &&
      saved.sourceFingerprint === identity.fingerprint,
  );
  const running =
    saved?.status === "running" && clock - Date.parse(saved.startedAt) < 180000;
  const canAnalyze = Boolean(
    analysisId &&
      records.length > 0 &&
      records.length <= MAX_ANALYSIS_RECORDS &&
      !pending &&
      !running,
  );
  async function analyze() {
    setPending(true);
    setError("");
    setExpanded(true);
    try {
      await httpsCallable(analysisFunctions, "analyzeBehaviorReteaches", {
        timeout: 195000,
      })({ filters: scope });
    } catch (failure) {
      setError(
        failure.code === "functions/not-found"
          ? "The analysis service could not be reached. Try again shortly."
          : failure.message === "internal" || failure.message === "INTERNAL"
            ? "Analysis could not be completed. Try again shortly."
            : failure.message || "Analysis could not be completed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm"
      aria-label={title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex items-start gap-2 rounded text-left focus:ring-2 focus:ring-violet-400"
        >
          <Sparkles className="mt-0.5 h-5 w-5 text-violet-600" />
          <span>
            <span className="block text-base font-bold text-slate-950">
              {title}
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Recurring note themes and possible category differences in this
              filtered view.
            </span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={analyze}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus:ring-2 focus:ring-violet-400 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {pending || running
            ? "Analyzing…"
            : saved?.result && !current
              ? "Refresh analysis"
              : current
                ? "Check analysis"
                : "Analyze this view"}
        </button>
      </div>
      <div aria-live="polite" className="mt-3 text-xs leading-5 text-slate-500">
        {!loaded
          ? "Checking for saved analysis…"
          : saved?.result
            ? `Last analyzed ${new Date(saved.generatedAt).toLocaleString()} · ${saved.analyzedCount} notes analyzed from ${saved.servedCount} served reteaches · ${current ? "Current" : "Records changed—refresh required"}`
            : "No saved analysis for these filters. AI runs only when you request it."}
        {current &&
          ` · ${saved.result.themes.length} themes · ${saved.result.categoryReviews.length} category-review suggestions`}
      </div>
      {records.length > MAX_ANALYSIS_RECORDS && (
        <p className="mt-2 text-sm text-amber-800">
          Narrow the filters to {MAX_ANALYSIS_RECORDS} or fewer served
          reteaches.
        </p>
      )}
      {!records.length && (
        <p className="mt-2 text-sm text-slate-500">
          No served reteaches in this view.
        </p>
      )}
      {(error || saved?.error) && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          {error || saved.error}
        </p>
      )}
      {expanded && (
        <>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            AI reviews what was written; it cannot establish what happened or
            judge staff performance. Suggestions never change records or assign
            consequences. Known names and contact details are removed before
            analysis, but notes may still contain identifying context.
          </p>
          {saved?.result && !current && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              The saved findings are hidden because this view’s records have
              changed. Refresh to review the current notes.
            </p>
          )}
          {saved?.model && ` · ${saved.model}`}
          {current && (
            <>
              <p className="mt-3 text-xs text-slate-500">
                Excluded notes: {saved.excluded.missingNote} blank ·{" "}
                {saved.excluded.sensitiveNote} containing out-of-scope sensitive
                terms · {saved.excluded.longNote} exceeding the note limit.
                Analysis is limited to the included notes.
              </p>
              <AnalysisFindings saved={saved} recordsById={recordsById} />
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function BehaviorAnalysisPanel({
  filters,
  records,
  title = "Written Reason Analysis",
}) {
  let scope;
  try {
    scope = normalizeAnalysisScope({
      ...filters,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return (
      <p
        role="alert"
        className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950"
      >
        Choose valid filters before requesting written reason analysis.
      </p>
    );
  }
  return (
    <AnalysisPanel
      key={scopeIdentity(scope)}
      scope={scope}
      records={records}
      title={title}
    />
  );
}
