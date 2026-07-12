import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { CircleUserRound, GraduationCap, Mail, UserRound } from "lucide-react";


export default function Account() {
  const { user, profile } = useContext(AuthContext);
  const [displayName, setDisplayName] = useState("");
  const [gradeLevels, setGradeLevels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [contactEmail, setContactEmail] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setGradeLevels(profile.gradeLevels || []);
      setContactEmail(profile.contactEmail || "");
    }
  }, [profile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (user.uid === "dev-owner") {
      setMessage("Dev profile is local only.");
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, "teachers", user.uid);
           await setDoc(
       ref,
       { displayName, contactEmail },
       { merge: true }
     );
      setMessage("Profile updated successfully.");
    } catch (err) {
      console.error("Error saving profile:", err);
      setMessage("Failed to update profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
            <CircleUserRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Profile workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Manage your teacher identity and assigned grade levels.</div>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
        <div className="border-b border-slate-200 px-5 py-4">
          <h1 className="text-lg font-bold text-slate-950">Account Settings</h1>
          <p className="mt-1 text-sm text-slate-600">These details identify you throughout Reteach Checkpoint.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <UserRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Display Name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="Your display name"
                required
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Contact Email
              </span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="e.g. name@k12.wv.us"
                required
              />
            </label>

            <fieldset className="md:col-span-2">
              <legend className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <GraduationCap className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Grade Levels
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['6','7','8'].map((lev) => (
                  <label key={lev} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50/60">
                    <input type="checkbox" checked={gradeLevels.includes(lev)} readOnly disabled className="h-4 w-4 rounded border-slate-300 text-sky-700" />
                    <span>Grade {lev}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="-mt-3 text-xs text-slate-500 md:col-span-2">Grade access is assigned by the app owner.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
            <div aria-live="polite" className="text-sm font-medium text-slate-600">
              {message || "Changes apply across the app."}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
