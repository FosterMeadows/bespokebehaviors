import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";
import ela8 from "../data/standards/ela8.json";

// Standards packages metadata
const STANDARDS_PACKAGES = [
  { id: "ela8", label: "ELA Grade 8", data: ela8 },
  { id: "ccss-math-8", label: "CCSS Math 8th Grade" },
  { id: "ngss-8", label: "NGSS 8th Grade Science" },
];

export default function StandardsTracker() {
  const { user, profile, setProfile } = useContext(AuthContext);
  const [selectedPackage, setSelectedPackage] = useState(
    profile?.standardsPackage || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // sync initial selection
  useEffect(() => {
    if (profile?.standardsPackage) {
      setSelectedPackage(profile.standardsPackage);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!selectedPackage) return;
    setSaving(true);
    setError(null);
    try {
      const ref = doc(db, "teachers", user.uid);
      await updateDoc(ref, { standardsPackage: selectedPackage });
      setProfile({ ...profile, standardsPackage: selectedPackage });
    } catch (err) {
      console.error("Error saving standards package:", err);
      setError("Failed to save. Please try again.");
    }
    setSaving(false);
  };

  // If no package selected, show dropdown
  if (!selectedPackage) {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Choose Standards Package</h1>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <select
          value={selectedPackage}
          onChange={(e) => setSelectedPackage(e.target.value)}
          className="w-full border rounded p-2 mb-4"
        >
          <option value="" disabled>-- Select a package --</option>
          {STANDARDS_PACKAGES.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving || !selectedPackage}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {saving ? "Saving..." : "Save and Continue"}
        </button>
      </div>
    );
  }

  // Find package data
  const pkg = STANDARDS_PACKAGES.find((p) => p.id === selectedPackage);
  const standards = pkg?.data || [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Standards Tracker</h1>
        <button
          onClick={() => setSelectedPackage("")}
          className="text-sm text-blue-600 hover:underline"
        >Change Package</button>
      </div>

      <p className="text-gray-700">Tracking for <span className="font-medium">{pkg.label}</span></p>

      <div className="border rounded p-4 bg-white">
        {standards.map(({ code, text }) => (
          <div key={code} className="flex items-start space-x-2 mb-2">
            <input type="checkbox" disabled className="mt-1" />
            <p><strong>{code}</strong>: {text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
