import { inputClass, linkClass } from "./AnalyticsUI.jsx";

export function PrimaryFilters({
  selectedPreset,
  preset,
  filters,
  options,
  update,
  moreFilters,
  setMoreFilters,
  activeExtras,
  setParams,
  setStudentSearch,
  setBucket,
  loading,
  error,
  invalidRange,
  analytics
}) {
  return (
    <section
        aria-label="Analytics filters"
        className="sm:sticky top-20 z-10 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="grid grid-cols-2 items-end gap-3 md:flex">
          <label className="text-sm font-semibold text-slate-700 md:w-52">
            Date range
            <select
              className={inputClass}
              value={selectedPreset}
              onChange={(event) => preset(event.target.value)}
            >
              <option value="year">This school year</option>
              <option value="month">This month</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          <div className="md:w-40">
            <SelectFilter
              label="Grades"
              value={filters.grade}
              options={options.grades}
              onChange={(grade) => update({ grade })}
            />
          </div>
          <button
            type="button"
            aria-expanded={moreFilters}
            aria-controls="additional-analytics-filters"
            className="h-10 rounded-lg border border-violet-200 px-3 text-sm font-semibold text-violet-800 focus:ring-2 focus:ring-violet-400"
            onClick={() => setMoreFilters(!moreFilters)}
          >
            {moreFilters ? "Hide filters" : "More filters"}
            {activeExtras.length ? ` (${activeExtras.length})` : ""}
          </button>
          <button
            className={`${linkClass} h-10 text-sm md:ml-auto`}
            onClick={() => {
              setParams({});
              setStudentSearch("");
              setBucket(null);
              setMoreFilters(false);
            }}
          >
            Reset filters
          </button>
        </div>
        <p aria-live="polite" className="mt-2 text-sm text-slate-700">
          {loading
            ? "Loading records…"
            : error
              ? "Records unavailable"
              : invalidRange
                ? "Choose a valid date range"
                : `${analytics.total} served reteaches · ${analytics.uniqueStudents} ${analytics.uniqueStudents === 1 ? "student" : "students"}`}
          {activeExtras.length > 0 && ` · ${activeExtras.join(" · ")}`}
          {selectedPreset === "custom" &&
            ` · ${filters.start || "Any start date"} to ${filters.end || "Any end date"}`}
        </p>
      </section>
  );
}

export function AdditionalFilters({
  selectedPreset,
  filters,
  update,
  moreFilters,
  options,
  studentSearch,
  setStudentSearch,
  students
}) {
  return (
    <section
          id="additional-analytics-filters"
          aria-label="Additional filters"
          className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {selectedPreset === "custom" && (
            <>
              <label className="text-sm font-semibold text-slate-700">
                From
                <input
                  className={inputClass}
                  type="date"
                  value={filters.start}
                  onChange={(event) =>
                    update({ start: event.target.value, preset: "custom" })
                  }
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Through
                <input
                  className={inputClass}
                  type="date"
                  value={filters.end}
                  onChange={(event) =>
                    update({ end: event.target.value, preset: "custom" })
                  }
                />
              </label>
            </>
          )}
          {moreFilters && (
            <>
              <SelectFilter
                label="Assigning teacher"
                value={filters.teacher}
                options={options.teachers}
                onChange={(teacher) => update({ teacher, detailTeacher: null })}
              />
              <SelectFilter
                label="Categories"
                value={filters.context}
                options={options.contexts}
                onChange={(context) => update({ context })}
              />
              <SelectFilter
                label="Locations"
                value={filters.location}
                options={options.locations}
                onChange={(location) => update({ location })}
              />
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Find student
                  <input
                    type="search"
                    className={inputClass}
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search names…"
                  />
                </label>
                <label className="sr-only" htmlFor="analytics-student">
                  Student
                </label>
                <select
                  id="analytics-student"
                  className={inputClass}
                  value={filters.student}
                  onChange={(event) => update({ student: event.target.value })}
                >
                  <option value="">All students</option>
                  {students.map((student) => (
                    <option key={student.value} value={student.value}>
                      {student.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </section>
  );
}

export function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          All{" "}
          {label === "Assigning teacher"
            ? "assigning staff"
            : label.toLowerCase()}
        </option>
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
