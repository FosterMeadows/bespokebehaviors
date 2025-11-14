# Copilot Instructions for bespokebehaviors

## Project Overview
- **Framework:** React (with Vite for build/dev), using JSX and modern hooks.
- **Structure:**
  - `src/pages/`: Main app pages (e.g., Dashboard, Reports, Students, Admin)
  - `src/components/`: Reusable UI components and icons
  - `src/services/`: Data/service modules (plans, reteach, sharing)
  - `src/hooks/`: Custom React hooks
  - `src/data/`: Static data (e.g., standards JSON)
  - `src/utils/`: Utility functions (e.g., date.js)
  - `public/`: Static assets and root `index.html`

## Build & Run
- **Dev server:** `npm run dev` (Vite)
- **Build:** `npm run build`
- **Preview:** `npm run preview`
- **Lint:** `npm run lint` (uses ESLint config)
- **No explicit test setup found.**

## Key Patterns & Conventions
- **Context:** `AuthContext.jsx` provides authentication context via React Context API.
- **Service Modules:** API/data logic is separated in `src/services/` (e.g., `plans.js`, `reteach.js`). Import these for data operations.
- **Hooks:** Custom hooks in `src/hooks/` (e.g., `useReports.jsx`, `useRandomPastel.js`) encapsulate reusable logic.
- **Component Organization:** Pages import components from `src/components/` and subfolders for modular UI.
- **Assets:** SVGs and images are in `src/assets/` and referenced in components/pages.
- **Styling:** Uses Tailwind CSS (`tailwind.config.cjs`, `postcss.config.cjs`). Styles are in `src/index.css`.
- **Firebase:** Config in `src/firebaseConfig.jsx`, settings in `firebase.json`.

## Integration Points
- **Firebase:** Used for authentication and possibly data storage. See `firebaseConfig.jsx` and `AuthContext.jsx`.
- **Vite:** Handles build/dev server. Config in `vite.config.js`.
- **ESLint:** Linting via `eslint.config.js`.
- **Tailwind CSS:** Utility-first styling, configured in `tailwind.config.cjs`.

## Productivity Tips for AI Agents
- **When adding features:** Place page-level logic in `src/pages/`, reusable UI in `src/components/`, and shared logic in `src/services/` or `src/hooks/`.
- **For new data flows:** Create service modules in `src/services/` and custom hooks in `src/hooks/` as needed.
- **For UI changes:** Use/extend components in `src/components/` and reference assets from `src/assets/`.
- **For authentication:** Use the context from `AuthContext.jsx`.
- **For static data:** Place JSON or config files in `src/data/`.

## Example: Adding a New Page
1. Create a new file in `src/pages/` (e.g., `NewFeature.jsx`).
2. Import needed components from `src/components/` and logic from `src/services/`/`src/hooks/`.
3. Add route logic if using a router (not detected, but follow existing page patterns).

---

_If any conventions or workflows are unclear, please ask FosterMeadows for clarification or provide feedback to improve these instructions._
