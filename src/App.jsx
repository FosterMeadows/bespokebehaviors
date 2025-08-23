import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import BehaviorLog from "./pages/BehaviorLog.jsx";
import StandardsTracker from "./pages/StandardsTracker.jsx";
import DailyPlan from "./pages/DailyPlan.jsx";
import GradeCalculator from "./pages/GradeCalculator.jsx";
import TeacherNotes from "./pages/TeacherNotes.jsx";
import MegaChecklist from "./pages/MegaChecklist.jsx";
import WeekAtAGlance from "./pages/WeekAtAGlance";

export default function App() {
  const { user, login, logout } = useContext(AuthContext);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <button
          onClick={login}
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <Layout displayName={user.displayName} logout={logout}>
      <Routes>
        <Route path="/log" element={<BehaviorLog />} />
        <Route path="/standards" element={<StandardsTracker />} />
        <Route path="/dailyplan" element={<DailyPlan />} />
        <Route path="/gradecalculator" element={<GradeCalculator />} />
        <Route path="/teachernotes" element={<TeacherNotes />} />
        <Route path="/megachecklist" element={<MegaChecklist />} />
        <Route path="/week" element={<WeekAtAGlance />} />
        <Route path="/share/:token" element={<SharePage />} />

        <Route path="*" element={<Navigate to="/log" replace />} />
      </Routes>
    </Layout>
  );
}
