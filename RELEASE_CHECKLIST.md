# Checkpoint release checklist

## Before every release

1. Confirm the target Firebase project with `firebase use`.
2. Export or otherwise verify a current Firestore backup.
3. Run `npm ci` from a clean checkout.
4. Run `npm run verify`.
5. Run `npm run test:rules` in CI or from a non-synchronized local workspace.
6. Review `npm audit --omit=dev --audit-level=high`.
7. Verify owner, admin, Academic-only, and Behavior-only test accounts.
8. Check grade-scoped student visibility with accounts assigned to different grades.
9. Verify Academic assignment, session, attendance, undo, and completion flows.
10. Verify Behavior assignment, To Serve, served status, and undo flows.
11. Verify roster import preview with identifiers redacted and an existing-student update.
12. Deploy Firestore rules and indexes before hosting when either changed.
13. Smoke-test the deployed landing, Academic, Behavior, Students, Profile, History, and Import pages.

## Firebase deployment

```powershell
firebase use bespokebehaviors
firebase deploy --only firestore:rules,firestore:indexes
npm run build
firebase deploy --only hosting
```

## Rollback

- Re-deploy the prior tagged source revision for hosting.
- Restore the prior Firestore rules revision from Firebase Console if access behavior regresses.
- Do not delete or rewrite student records as part of an application rollback.
- Keep imported student identity mappings; they preserve record continuity and contain no plaintext student IDs.

## Known operational notes

- Firestore indexes may remain in a building state for several minutes after deployment.
- The local rules test can encounter Windows OneDrive file-read errors. CI or a non-synchronized checkout is the authoritative environment for that test.
- Teachers edit their name and contact email. The owner assigns roles and grade access under Admin → Manage Teachers.
