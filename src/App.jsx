import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateReport from "./pages/CreateReport.jsx";
import BehaviorLog from "./pages/BehaviorLog.jsx";

import StudentView from "./pages/StudentsList.jsx";
import StudentDetail from "./pages/StudentDetail.jsx";
import ArchiveReports from "./pages/ArchiveReports.jsx";
import Account from "./pages/Account.jsx";
import MyReports from "./pages/MyReports.jsx";
import StandardsTracker from "./pages/StandardsTracker.jsx";

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
        {/* Default landing page changed to Home */}
        <Route path="/" element={<Home />} />
        <Route path="/log" element={<BehaviorLog />} />
        <Route path="/standards" element={<StandardsTracker />} />
        <Route path="/create" element={<CreateReport />} />
        <Route path="/student" element={<StudentView />} />
        <Route path="/student/:name" element={<StudentDetail />} />
        <Route path="/archive" element={<ArchiveReports />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/reports" element={<MyReports />} />
        {/* Optionally keep Dashboard accessible */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
