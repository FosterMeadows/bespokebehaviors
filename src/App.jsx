import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateReport from "./pages/CreateReport.jsx";
import ViewReports from "./pages/ViewReports.jsx";
import StudentView from "./pages/StudentView.jsx";
import StudentDetail from "./pages/StudentDetail.jsx"; // ← new
import ArchiveReports from "./pages/ArchiveReports.jsx";

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<CreateReport />} />
        <Route path="/view" element={<ViewReports />} />
        <Route path="/student" element={<StudentView />} />
        <Route path="/archive" element={<ArchiveReports />} />
        <Route path="/student/:name" element={<StudentDetail />} /> {/* ← new */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
