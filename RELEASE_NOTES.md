# Release hardening summary

- Grade-scoped student access is enforced in the client queries and Firestore rules.
- Academic session rosters are private to the teacher who created them.
- Teacher roles, grade scope, and account status are owner-managed.
- Teacher Profile access settings are read-only.
- Self-service profile writes cannot modify roles, features, or grade scope.
- Student import identifiers are redacted, hashed, and stored in an admin-only mapping collection.
- Production authentication diagnostics and the client debug overlay are disabled.
- Primary permission failures are shown to users instead of appearing as empty data.
- Full-project lint, unit tests, production build, and dependency audit are part of release verification.
