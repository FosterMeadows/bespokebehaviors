import React, { useState } from "react";
import ReportForm from "../components/ReportForm.jsx";

export default function CreateReport() {
  const [showToast, setShowToast] = useState(false);

  const handleSuccess = () => {
    setShowToast(true);
    // Hide toast after 3 seconds
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="relative">
      <h2 className="text-2xl font-semibold mb-4">Create a Report</h2>
      <ReportForm onSuccess={handleSuccess} />

      {/* Toast notification */}
      {showToast && (
        <div
          className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-500 opacity-100"
        >
          Report saved!
        </div>
      )}
    </div>
  );
}
