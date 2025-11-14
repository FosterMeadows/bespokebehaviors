// src/App.jsx
import React, { useContext } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import BehaviorLog from "./pages/BehaviorLog.jsx";
import StandardsTracker from "./pages/StandardsTracker.jsx";
import DailyPlan from "./pages/DailyPlan.jsx";
import GradeCalculator from "./pages/GradeCalculator.jsx";
import TeacherNotes from "./pages/TeacherNotes.jsx";
import MegaChecklist from "./pages/MegaChecklist.jsx";
import WeekAtAGlance from "./pages/WeekAtAGlance";
import SharePage from "./components/SharePage.jsx";
import Dashboard from "./pages/MainDashboard.jsx";
import ReteachDashboard from "./pages/ReteachDashboard.jsx";
import BulkImportStudents from "./pages/Admin/BulkImportStudents.jsx";
import OneMinuteHuman from "./pages/OneMinuteHuman.jsx";
import ARHistoryPage from "./pages/History.jsx"

// 👇 import both hook + overlay
import { useInstallClientLogger, DebugOverlay } from "./debug/ClientLogger.jsx";

export default function App() {
  // installs console/error hooks when ?debug=1 is present
  useInstallClientLogger();

  const { user, login, logout } = useContext(AuthContext);
  const location = useLocation();
  const isPublic = location.pathname.startsWith("/share");

  // PUBLIC ROUTES
  if (isPublic) {
    return (
      <>
        <Routes>
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/share/invalid" replace />} />
        </Routes>
        {/* overlay renders but is invisible unless ?debug=1 */}
        <DebugOverlay />
      </>
    );
  }

  // PRIVATE ROUTES: require auth
  if (!user) {
    return (
      <>
        <div className="flex items-center justify-center h-screen">
          <button
            onClick={login}
            className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Sign in with Google
          </button>
        </div>
        <DebugOverlay />
      </>
    );
  }

  return (
    <Layout displayName={user.displayName} logout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/log" element={<BehaviorLog />} />
        <Route path="/standards" element={<StandardsTracker />} />
        <Route path="/dailyplan" element={<DailyPlan />} />
        <Route path="/gradecalculator" element={<GradeCalculator />} />
        <Route path="/teachernotes" element={<TeacherNotes />} />
        <Route path="/megachecklist" element={<MegaChecklist />} />
        <Route path="/week" element={<WeekAtAGlance />} />
        <Route path="/reteach" element={<ReteachDashboard />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/one-minute-human" element={<OneMinuteHuman />} />
        <Route path="/history" element={<ARHistoryPage />} />
        <Route path="*" element={<Navigate to="/dailyplan" replace />} />
        <Route path="/admin/import-students" element={<BulkImportStudents />} />
      </Routes>
      <DebugOverlay />
    </Layout>
  );
}
