# Written reason analysis: secure setup and operations

The Analytics page and teacher detail now support on-demand AI analysis of served reteach notes. This is a new Firebase callable function; deploying Hosting alone does not enable AI.

## First-time setup

1. Use a funded OpenAI API project and create a project-scoped API key. Configure a spending limit/alert in that project. Do not paste the key into chat, source control, a frontend environment variable, or the browser.
2. Confirm the Firebase project: `firebase use bespokebehaviors`. Cloud Functions requires a billing-enabled Firebase project. Have a project administrator enable billing if needed; this implementation does not change the billing plan.
3. Install backend dependencies: `npm --prefix functions ci`.
4. Store the key using the interactive secret prompt:

   ```powershell
   firebase functions:secrets:set OPENAI_API_KEY --project bespokebehaviors
   ```

   Enter the key only in that prompt. It goes to Google Secret Manager. Do not use a command-line argument containing the key. Never create `VITE_OPENAI_API_KEY`.
5. Run `npm run verify` and `npm run test:rules`. The rules suite should run in CI or an isolated local checkout outside OneDrive.
6. Deploy the backend and its read-only result access rules before publishing the frontend:

   ```powershell
   firebase deploy --only "functions:behavior-analysis,firestore:rules" --project bespokebehaviors
   ```

7. Commit all intended frontend, backend, rules, dependencies, and tests together, then push `main` using the existing release workflow. The current GitHub workflow rebuilds and deploys Hosting; it does not deploy Cloud Functions or rules. For subsequent backend/rule changes, repeat step 6 before pushing the corresponding frontend release.
8. Sign in as an owner/admin/MTSS lead. Open Analytics, choose a small set of served records, and click **Analyze this view**. Verify the resulting suggestions against the original records. Review the count of excluded notes and confirm a second check of unchanged records uses the saved result.

`BEHAVIOR_ANALYSIS_MODEL` is a server-only Firebase string parameter with default `gpt-4.1-mini-2025-04-14`. Configure another compatible model only after checking structured-output support and access. A changed model is recognized by the server on the next explicit analysis check.

For key rotation, update the same secret and redeploy the function so the new secret version is bound.

## Product behavior

- Loading Analytics reads saved analysis from Firestore; it never calls OpenAI.
- A button click invokes `analyzeBehaviorReteaches`. Firebase verifies the signed-in user; the function independently checks the current teacher profile for enabled schoolwide access.
- The client sends filters and a time zone only. The server selects served records itself and ignores client-supplied notes, model names, or prompts.
- Both schoolwide and teacher-detail analyses respect the current date/grade/teacher/category/location/student filters.
- Cached results are shared among authorized schoolwide users and keyed by normalized scope and prompt version. Source fingerprints detect edited notes/categories, replacements, deletions, status changes, and date changes, not just record counts. Stale findings are hidden until refreshed.
- Numeric counts are computed from validated supporting record IDs. Category alternatives must be allowed categories different from the selected category and include an exact supporting excerpt. Unknown IDs, invented quotes, and cross-teacher citations reject the entire new result.
- A failed refresh keeps the previous result, marked stale when appropriate. No source behavior records are changed.
- A selection is limited to 500 served records and 250,000 characters of prepared input. Larger selections must be narrowed; there is no silent sampling. The initial served-record query has a 10,000-record safety limit. Beyond that, indexed retrieval must be implemented before further use.
- One schoolwide request at a time, at least 30 seconds between attempts, at most 100 attempts per UTC day. Provider calls are not automatically retried. A failed request counts toward the attempt limit. Locks expire after three minutes.
- The application shows up to 8 themes, 4 broader observations, 30 category-review suggestions, and 12 teacher observations. This is not an exhaustive audit or a measure of teacher performance. Teacher observations require at least three cited records from that teacher.

## Data handling

Only category, sanitized location, grade, served date, sanitized note, and request-local anonymous record/student/teacher IDs go to OpenAI. Student names, teacher names/emails, contact records, external student IDs, homeroom, academic data, and unrelated histories are not included. The function reads roster/staff names only to remove known names from notes. It excludes blank notes, notes over 2,000 characters, and notes containing common out-of-scope sensitive terms.

Automated redaction is not a guarantee of anonymity: free text can contain unfamiliar names or identifying context. Staff must continue to follow the existing note-entry boundaries in PRIVACY.md. The API request sets `store: false`; this is not a claim of zero provider retention. Apply the school's approved provider/data-retention requirements before activation.

Saved results contain generated descriptions, sanitized supporting excerpts, internal record/staff IDs, scope, source fingerprint, model/version, generation timestamp/user, inclusion counts and excluded-note counts. Raw notes and names are not duplicated in the saved analysis. The browser displays original notes using existing authorized records. Only enabled schoolwide staff can read these results; all client writes and all client access to the request-control collection are denied.

The generated output does not assign discipline, change categories, infer diagnoses/motives, or score teachers. Prompts explicitly treat note text as untrusted data and prohibit following embedded instructions. Review suggestions against records before interpreting them.

## Local QA

Use `npm run qa:emulators` and the existing QA Vite mode. The functions emulator listens on `127.0.0.1:5001`. Without a key, the button shows the setup error and no provider request occurs. Set `OPENAI_API_KEY=not-configured` in ignored `functions/.secret.local` for deterministic no-key testing. If explicitly testing a real provider call, supply a test-project key in that ignored file and use synthetic records only.

`tests/behaviorAnalysis.test.mjs` uses an injected fake provider to test authorization, scoped retrieval, redaction, evidence validation, cached reuse, source changes, failure handling, concurrency, and the real HTTP request shape. No real student data is transmitted by these tests. Live model quality still needs evaluation after key setup.

## Official references

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Firebase callable functions](https://firebase.google.com/docs/functions/callable)
- [Firebase server secrets](https://firebase.google.com/docs/functions/config-env#secret_parameters)

The backend pins a patched `uuid` version under `gaxios@6.7.1` to address its transitive security advisory. That dependency uses only the compatible `v4()` export; revisit the override when Google updates that dependency.

For result-layout QA, run `node scripts/seed-qa-analysis.mjs` after `qa:seed`. It connects explicitly to the local Firestore emulator, writes clearly labeled synthetic findings, and checks the actual repository cache/lock handling using an injected fake provider. It never calls OpenAI.
