import React from "react";
import { LogIn, ShieldCheck } from "lucide-react";

const PRIVACY_NOTICE =
  "This tool is for limited grade-level coordination of make-up work and low-level reteaches. Do not enter grades, IEP information, counseling notes, formal discipline records, sensitive narratives, or WVEIS details.";

export default function SignInPage({ onSignIn, onDevSignIn, authError = "", authDebug = "" }) {
  const showDevSignIn = import.meta.env.DEV && typeof onDevSignIn === "function";

  return (
    <main className="min-h-svh bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-6 py-10">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1 text-sm font-medium text-sky-800">
            <ShieldCheck className="h-4 w-4" />
            checkpoint.school
          </div>
          <h1 className="text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
            Reteach Checkpoint
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-700">
            Sign in with your school Google account to coordinate make-up work and low-level reteaches with your assigned team.
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <LogIn className="h-4 w-4" />
            Sign in with Google
          </button>
          {showDevSignIn && (
            <button
              onClick={onDevSignIn}
              className="ml-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              Continue as Dev Owner
            </button>
          )}
          {authError && (
            <div className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {authError}
            </div>
          )}
          {authDebug && (
            <div className="mt-3 max-w-2xl text-xs font-medium text-slate-500">
              {authDebug}
            </div>
          )}
        </div>

        <section className="mt-6 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {PRIVACY_NOTICE}
        </section>
      </div>
    </main>
  );
}
