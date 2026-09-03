# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Local role-based QA

The QA harness uses local Firebase Auth and Firestore emulators. It never connects QA personas to production.

1. Start the emulators: `npm run qa:emulators`
2. Seed synthetic users and students: `npm run qa:seed`
3. Start the QA app: `npm run dev:qa`
4. Open the local URL and select a persona from the sign-in page.

Available personas cover pending, Grade 6, Grade 7, disabled, and owner access. Run `npm run qa:seed` again whenever the emulator data should be reset.
