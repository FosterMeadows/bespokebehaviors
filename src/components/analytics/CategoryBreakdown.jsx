import { Expandable, Empty } from "./AnalyticsUI.jsx";

export function CategoryBreakdown({
  analytics,
  openHistory
}) {
  return (
    <Expandable
            name="category-grades"
            title="Behavior categories by grade"
            summary="Percentages describe each category’s share of that grade’s served reteaches in this view. Select a cell to review records."
          >
            {!analytics.total ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Behavior category</th>
                      {analytics.grades.map((grade) => (
                        <th key={grade} className="p-2">
                          {grade === "Unknown grade" ? grade : `Grade ${grade}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.contextByGrade.map((row) => (
                      <tr key={row.label}>
                        <th className="p-2 text-left font-semibold">
                          {row.label}
                        </th>
                        {row.grades.map((cell) => (
                          <td key={cell.grade} className="p-1">
                            <button
                              type="button"
                              disabled={!cell.count}
                              className="w-full rounded-lg bg-violet-50 p-3 text-violet-950 hover:bg-violet-100 focus:ring-2 focus:ring-violet-400 disabled:bg-slate-50 disabled:text-slate-400"
                              aria-label={`${row.label}, grade ${cell.grade}: ${cell.count} served, ${Math.round(cell.percent)} percent`}
                              onClick={() =>
                                openHistory({
                                  grade: cell.grade,
                                  context: row.label,
                                })
                              }
                            >
                              <strong>{cell.count}</strong>
                              <span className="block text-sm">
                                {Math.round(cell.percent)}%
                              </span>
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Expandable>
  );
}
