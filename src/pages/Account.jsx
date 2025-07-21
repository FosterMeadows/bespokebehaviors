import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";


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

  const toggleGrade = (level) => {
    setGradeLevels((prev) =>
      prev.includes(level)
        ? prev.filter((g) => g !== level)
        : [...prev, level]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const ref = doc(db, "teachers", user.uid);
           await setDoc(
       ref,
       { displayName, gradeLevels, contactEmail },
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
    <div className="max-w-md mx-auto bg-white shadow rounded p-6">
      <h2 className="text-2xl font-semibold mb-4">Account Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            placeholder="Your display name"
            required
          />
        </div>
        <div>
          <span className="block text-sm font-medium mb-1">
            Grade Levels
          </span>
          <div className="flex space-x-4">
            {['6','7','8'].map((lev) => (
              <label key={lev} className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={gradeLevels.includes(lev)}
                  onChange={() => toggleGrade(lev)}
                  className="form-checkbox h-4 w-4 text-green-600"
                />
                <span className="ml-2">Grade {lev}</span>
              </label>
            ))}
          </div>

            {/* School Email */}
     <div>
       <label className="block text-sm font-medium">Contact Email</label>
       <input
         type="email"
                  value={contactEmail}
         onChange={(e) => setContactEmail(e.target.value)}
         className="mt-1 block w-full border rounded p-2"
         placeholder="e.g. name@k12.wv.us"
         required
       />
     </div>


        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
      {message && (
        <p className="mt-4 text-center text-sm text-gray-600">{message}</p>
      )}
    </div>
  );
}
