# Release workflow

- Treat planner, sequences, standards integration, services, and their tests as one feature when releasing related changes. Inspect tracked and untracked files before committing so local feature files are not left out of pushes.
- Production hosting rebuilds the committed `main` branch on every push. Commit all intended feature dependencies before pushing; a local-only deployment will be overwritten by the next automated release.
- Run `npm run verify` before release and `npm run test:rules` when Firestore access behavior or its tests change.
- Preserve existing Firestore collection paths and account ownership when restoring features. Never seed or reset production data as part of restoring the planner UI.
