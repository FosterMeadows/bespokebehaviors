import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { AuthContext } from "../../AuthContext.jsx";
import { useNavigate, useSearchParams } from "react-router";
import { schoolYearBounds, analyticsOptions, buildBehaviorAnalytics, dateKey } from "../../utils/behaviorAnalytics.js";
import { onSnapshot, collection } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { BarChart3 } from "lucide-react";
import { PrimaryFilters, AdditionalFilters } from "../../components/analytics/AnalyticsFilters.jsx";
import { Metric, percent, Card, Expandable } from "../../components/analytics/AnalyticsUI.jsx";
import BehaviorAnalysisPanel from "../../components/BehaviorAnalysisPanel.jsx";
import { RankedBars, Trend } from "../../components/analytics/AnalyticsCharts.jsx";
import { CategoryBreakdown } from "../../components/analytics/CategoryBreakdown.jsx";
import { TeacherTable, TeacherDetail } from "../../components/analytics/TeacherAnalytics.jsx";
import { RepeatedReteaches } from "../../components/analytics/RepeatedReteaches.jsx";

export default function Analytics() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const defaults = schoolYearBounds();
  const filters = {
    start: params.get("start") ?? defaults.start,
    end: params.get("end") ?? defaults.end,
    grade: params.get("grade") || "",
    teacher: params.get("teacher") || "",
    context: params.get("context") || "",
    location: params.get("location") || "",
    student: params.get("student") || "",
  };
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [interval, setInterval] = useState("monthly");
  const [bucket, setBucket] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      collection(db, "behaviorReteaches"),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setLoading(false);
        setError("");
      },
      () => {
        setError(
          "Behavior analytics could not be loaded. Reload to try again.",
        );
        setLoading(false);
      },
    );
  }, [user]);
  const options = useMemo(() => analyticsOptions(records), [records]);
  // URL filters keep the selected view available after a History drilldown.
  const serializedFilters = JSON.stringify(filters);
  const analytics = useMemo(
    () => buildBehaviorAnalytics(records, JSON.parse(serializedFilters)),
    [records, serializedFilters],
  );
  const invalidRange = Boolean(
    filters.start && filters.end && filters.start > filters.end,
  );
  const detailTeacher = params.get("detailTeacher") || "";
  const detailRef = useRef(null);
  useEffect(() => {
    if (detailTeacher && !loading && !error) detailRef.current?.focus();
  }, [detailTeacher, loading, error]);
  const detail = useMemo(
    () =>
      detailTeacher
        ? buildBehaviorAnalytics(records, {
            ...JSON.parse(serializedFilters),
            teacher: detailTeacher,
          })
        : null,
    [detailTeacher, records, serializedFilters],
  );
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) =>
      value === null ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace: true });
    setBucket(null);
  };
  const openHistory = (changes = {}) => {
    const next = new URLSearchParams({
      tab: "behavior",
      ...filters,
      ...changes,
    });
    navigate(`/history?${next.toString()}`);
  };
  const preset = (value) => {
    const now = new Date();
    const start = new Date(now);
    if (value === "month") start.setDate(1);
    if (value === "30") start.setDate(start.getDate() - 29);
    update(
      value === "year"
        ? { ...defaults, preset: value }
        : value === "custom"
          ? { preset: value }
          : { start: dateKey(start), end: dateKey(now), preset: value },
    );
  };
  const students = options.students.filter(
    (student) =>
      student.value === filters.student ||
      student.label.toLowerCase().includes(studentSearch.toLowerCase()),
  );
  const selectedPreset =
    params.get("preset") ||
    (params.has("start") || params.has("end") ? "custom" : "year");
  const activeExtras = [
    filters.teacher &&
      (options.teachers.find((item) => item.value === filters.teacher)?.label ||
        "Selected teacher"),
    filters.context,
    filters.location,
    filters.student &&
      (options.students.find((item) => item.value === filters.student)?.label ||
        "Selected student"),
  ].filter(Boolean);
  if (!user) return null;
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <BarChart3 className="h-10 w-10 rounded-lg bg-violet-100 p-2 text-violet-700" />
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-violet-800">
            Admin Workspace
          </p>
          <h1 className="text-xl font-bold text-slate-950">
            Behavior Analytics
          </h1>
          <p className="text-sm text-slate-600">
            See the school overview, review patterns in the notes, and open the
            records behind them.
          </p>
        </div>
      </header>
      <PrimaryFilters
          selectedPreset={selectedPreset}
          preset={preset}
          filters={filters}
          options={options}
          update={update}
          moreFilters={moreFilters}
          setMoreFilters={setMoreFilters}
          activeExtras={activeExtras}
          setParams={setParams}
          setStudentSearch={setStudentSearch}
          setBucket={setBucket}
          loading={loading}
          error={error}
          invalidRange={invalidRange}
          analytics={analytics}
        />
      {(moreFilters || selectedPreset === "custom") && (
        <AdditionalFilters
          selectedPreset={selectedPreset}
          filters={filters}
          update={update}
          moreFilters={moreFilters}
          options={options}
          studentSearch={studentSearch}
          setStudentSearch={setStudentSearch}
          students={students}
        />
      )}
      {invalidRange && (
        <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">
          The start date must be on or before the end date.
        </p>
      )}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">
          {error}
        </p>
      ) : loading ? (
        <p className="p-8 text-center text-slate-600">
          Loading served reteaches…
        </p>
      ) : invalidRange ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Served reteaches"
              value={analytics.total}
              detail="All records in this filtered view"
              onClick={() => openHistory()}
            />
            <Metric
              label="Students involved"
              value={analytics.uniqueStudents}
              detail="Each student counted once in this view"
              onClick={() => openHistory()}
            />
            <Metric
              label="Students with multiple reteaches"
              value={analytics.repeatStudents}
              detail={`${analytics.repeatStudents} of ${analytics.uniqueStudents} ${analytics.uniqueStudents === 1 ? "student" : "students"} in this view`}
              onClick={() => openHistory({ repeat: "1" })}
            />
            <Metric
              label="Top behavior category"
              value={analytics.topContext?.label || "—"}
              detail={
                analytics.topContext
                  ? `${analytics.topContext.count} served · ${percent(analytics.topContext.count, analytics.total)}% of this view`
                  : "No served records"
              }
              onClick={
                analytics.topContext
                  ? () => openHistory({ context: analytics.topContext.label })
                  : undefined
              }
            />
          </div>
          <BehaviorAnalysisPanel
            key={serializedFilters}
            filters={filters}
            records={analytics.records}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Served reteaches by grade"
              description="Count and share within the selected filters."
            >
              <RankedBars
                rows={analytics.gradeCounts}
                total={analytics.total}
                kind="grade"
                onSelect={(grade) => openHistory({ grade })}
              />
            </Card>
            <Trend
              analytics={analytics}
              interval={interval}
              onInterval={setInterval}
              openHistory={openHistory}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Locations that stand out"
              description="Where the recorded behavior occurred. Select a location to open its records."
            >
              <RankedBars
                rows={analytics.locations}
                total={analytics.total}
                kind="location"
                onSelect={(location) => openHistory({ location })}
              />
            </Card>
            <Card
              title="Behavior categories that stand out"
              description="Counts show served reteaches. Repeated reteaches count students with two or more in the same category."
            >
              <RankedBars
                rows={analytics.contexts}
                total={analytics.total}
                kind="context"
                onSelect={(context) => openHistory({ context })}
              />
            </Card>
          </div>
          <CategoryBreakdown
          analytics={analytics}
          openHistory={openHistory}
        />
          <Expandable
            name="teachers"
            title="Explore reteaches by assigning teacher"
            summary="Open the staff breakdown and select a teacher for details. Counts reflect served reteaches, not staff performance."
          >
            <TeacherTable
              rows={analytics.teachers}
              total={analytics.total}
              onSelect={(teacher) => update({ detailTeacher: teacher })}
            />
          </Expandable>
          {detail && (
            <TeacherDetail
          detailRef={detailRef}
          options={options}
          detailTeacher={detailTeacher}
          update={update}
          detail={detail}
          openHistory={openHistory}
          interval={interval}
          setInterval={setInterval}
          serializedFilters={serializedFilters}
          filters={filters}
        />
          )}
          <RepeatedReteaches
          analytics={analytics}
          openHistory={openHistory}
          bucket={bucket}
          setBucket={setBucket}
        />
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-5 text-slate-600">
            Counts describe served reteach events. Student averages and repeat
            rates use only students in the selected records, not enrollment.
            Assigning staff counts exclude records without a staff ID. Dates use
            served date, falling back to reteach date or creation date when
            unavailable.
            {analytics.missingStudents > 0 &&
              ` ${analytics.missingStudents} records lack a student ID and are excluded from student counts and averages.`}
          </p>
        </>
      )}
    </div>
  );
}
