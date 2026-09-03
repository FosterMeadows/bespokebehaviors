import React from "react";
import { BookOpenCheck, CheckCircle2, History, LogIn, ShieldCheck } from "lucide-react";
import { QA_PERSONAS } from "../qa/personas";

const WORKSPACES = [
  {
    icon: BookOpenCheck,
    title: "Academic Work",
    description: "Assign make-up work and run the daily Academic Session."
  },
  {
    icon: ShieldCheck,
    title: "Behavior Reteaches",
    description: "Coordinate low-level reteaches and record when they are served."
  },
  {
    icon: History,
    title: "Connected History",
    description: "Keep each student’s Academic and Behavior story in one place."
  }
];

export default function SignInPage({ onSignIn, authError = "", qaLogin, qaEmulatorMode = false }) {
  return (
    <main className="relative min-h-svh overflow-hidden bg-slate-50 text-slate-950">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-sky-100/70 blur-3xl" />
        <div className="absolute -bottom-56 -left-44 h-[38rem] w-[38rem] rounded-full bg-violet-100/50 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-svh w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:px-10">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-700 text-white shadow-lg shadow-sky-700/20">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-950">Checkpoint</div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-800">Reteach Coordination</div>
            </div>
          </div>

          <h1 className="mt-8 max-w-xl text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl">
            Keep the follow-up work moving.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            One shared workspace for Academic make-up work, Behavior reteaches, and the student history that connects them.
          </p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {WORKSPACES.map(item => (
              <div key={item.title} className="rounded-xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
                {React.createElement(item.icon, { className: "h-5 w-5 text-sky-700", "aria-hidden": true })}
                <h2 className="mt-3 text-sm font-bold text-slate-950">{item.title}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full rounded-2xl border border-slate-200/80 bg-white p-7 shadow-2xl shadow-slate-300/35 sm:p-9">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
            <LogIn className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-950">Welcome Back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sign in with your school Google account to open Checkpoint.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign In with Google
          </button>

          {qaEmulatorMode && (
            <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4" aria-label="QA personas">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-violet-800">Local QA personas</div>
              <p className="mt-1 text-xs leading-5 text-violet-900">Emulator data only. This panel is excluded from production.</p>
              <div className="mt-3 grid gap-2">
                {QA_PERSONAS.map(persona => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => qaLogin(persona.email)}
                    className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-left hover:border-violet-400"
                  >
                    <span className="block text-sm font-bold text-slate-900">{persona.label}</span>
                    <span className="block text-xs text-slate-600">{persona.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {authError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900" role="alert">
              {authError}
            </div>
          )}

          <div className="mt-7 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
            Academic, Behavior, and Student History—connected in one workspace.
          </div>
        </section>
      </div>
    </main>
  );
}
