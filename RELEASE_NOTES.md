# Release hardening summary

- Split the Academic service into student records, tasks, attendance, sessions,
  and history modules. Existing imports and all public functions remain available;
  database paths and operations are unchanged.

- Split Admin Analytics into filters, charts, teacher details, category breakdown,
  and repeated-reteach components while preserving filtering and drilldown behavior.

- Split Behavior Workspace into assignment, pending-reteach, personal-reteach,
  and tab components. Presentation helpers and existing development fixtures now
  live separately; permissions, subscriptions, and action handlers are unchanged.

- Split Academic Dashboard into roster setup, live-session controls, student
  search, student details/history, and shared feedback components. Removed unused
  roster UI variants while preserving the active components' behavior.

- Operational Health filters completed Behavior history and Academic sessions by
  the reporting window, and loads only outstanding home contacts. Pending work
  remains visible regardless of age. Overlapping queries are deduplicated, and
  failed loads show an unavailable state instead of misleading zero totals.
- Academic task and student roster reads remain comprehensive for compatibility
  with older tasks missing active/state fields and for current grade accuracy.
  These subscriptions are retained when switching reporting windows.

- Workspace and shared-plan pages load on demand, with an accessible loading
  indicator. Sign-in stays in the initial bundle; failed page downloads use the
  existing Reload Checkpoint recovery screen.

- Retired the legacy Daily Plan editor and Week at a Glance screen. Old `/dailyplan`
  and `/week` links redirect to Instruction Planner. Saved legacy plan data,
  shared-plan readers, and historical standards coverage remain available.

- Grade-scoped student access is enforced in the client queries and Firestore rules.
- Academic session rosters are private to the teacher who created them.
- Teacher roles, grade scope, and account status are owner-managed.
- Teacher Profile access settings are read-only.
- Self-service profile writes cannot modify roles, features, or grade scope.
- Student import identifiers are redacted, hashed, and stored in an admin-only mapping collection.
- Production authentication diagnostics and the client debug overlay are disabled.
- Primary permission failures are shown to users instead of appearing as empty data.
- Full-project lint, unit tests, production build, and dependency audit are part of release verification.
