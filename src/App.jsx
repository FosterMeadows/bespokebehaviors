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
import LegacyDashboard from "./pages/MainDashboard.jsx";
import InterventionHome from "./pages/InterventionHome.jsx";
import SignInPage from "./pages/SignInPage.jsx";
import AcademicDashboard from "./pages/AcademicDashboard.jsx";
import BehaviorWorkspace from "./pages/BehaviorWorkspace.jsx";
import BulkImportStudents from "./pages/Admin/BulkImportStudents.jsx";
import TeacherAccess from "./pages/Admin/TeacherAccess.jsx";
import OneMinuteHuman from "./pages/OneMinuteHuman.jsx";
import ARHistoryPage from "./pages/History.jsx";
import Account from "./pages/Account.jsx";
import StudentsList from "./pages/StudentsList.jsx";
import {
  canUseAcademic,
  canUseAdmin,
  canUseBehavior,
  canUseLegacyTools
} from "./utils/access";

import { useInstallClientLogger, DebugOverlay } from "./debug/ClientLogger.jsx";

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 text-sm text-slate-600">
      Loading access...
    </div>
  );
}

function AccessDenied({ message = "You do not have access to this workspace." }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
      {message}
    </div>
  );
}

function RequireAccess({ allowed, children, message }) {
  return allowed ? children : <AccessDenied message={message} />;
}

export default function App() {
  useInstallClientLogger();

  const { user, profile, profileLoading, authError, authDebug, login, logout, devLogin } = useContext(AuthContext);
  const location = useLocation();
  const isPublic = location.pathname.startsWith("/share");

  if (isPublic) {
    return (
      <>
        <Routes>
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/share/invalid" replace />} />
        </Routes>
        <DebugOverlay />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <SignInPage onSignIn={login} onDevSignIn={devLogin} authError={authError} authDebug={import.meta.env.DEV ? authDebug : ""} />
        <DebugOverlay />
      </>
    );
  }

  if (profileLoading) {
    return (
      <>
        <LoadingScreen />
        <DebugOverlay />
      </>
    );
  }

  const academicAllowed = canUseAcademic(profile);
  const behaviorAllowed = canUseBehavior(profile);
  const legacyAllowed = canUseLegacyTools(profile);
  const adminAllowed = canUseAdmin(profile);

  return (
    <Layout displayName={profile?.displayName || user.displayName} logout={logout} profile={profile}>
      <Routes>
        <Route path="/" element={<InterventionHome profile={profile} user={user} />} />
        <Route
          path="/academic"
          element={
            <RequireAccess allowed={academicAllowed} message="Academic access has not been assigned to your profile.">
              <AcademicDashboard />
            </RequireAccess>
          }
        />
        <Route
          path="/behavior"
          element={
            <RequireAccess allowed={behaviorAllowed} message="Behavior access has not been assigned to your profile.">
              <BehaviorWorkspace />
            </RequireAccess>
          }
        />
        <Route path="/profile" element={<Account />} />
        <Route
          path="/students"
          element={
            <RequireAccess allowed={academicAllowed || behaviorAllowed || adminAllowed} message="Student search requires Academic, Behavior, or schoolwide access.">
              <StudentsList />
            </RequireAccess>
          }
        />

        <Route
          path="/dashboard"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <LegacyDashboard />
            </RequireAccess>
          }
        />
        <Route
          path="/log"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <BehaviorLog />
            </RequireAccess>
          }
        />
        <Route
          path="/standards"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <StandardsTracker />
            </RequireAccess>
          }
        />
        <Route
          path="/dailyplan"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <DailyPlan />
            </RequireAccess>
          }
        />
        <Route
          path="/gradecalculator"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <GradeCalculator />
            </RequireAccess>
          }
        />
        <Route
          path="/teachernotes"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <TeacherNotes />
            </RequireAccess>
          }
        />
        <Route
          path="/megachecklist"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <MegaChecklist />
            </RequireAccess>
          }
        />
        <Route
          path="/week"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <WeekAtAGlance />
            </RequireAccess>
          }
        />
        <Route
          path="/one-minute-human"
          element={
            <RequireAccess allowed={legacyAllowed} message="Legacy tools are not enabled for your profile.">
              <OneMinuteHuman />
            </RequireAccess>
          }
        />
        <Route
          path="/history"
          element={
            <RequireAccess allowed={adminAllowed} message="Schoolwide history requires an admin, MTSS lead, or owner role.">
              <ARHistoryPage />
            </RequireAccess>
          }
        />
        <Route
          path="/admin/import-students"
          element={
            <RequireAccess allowed={adminAllowed} message="Student import requires an admin, MTSS lead, or owner role.">
              <BulkImportStudents />
            </RequireAccess>
          }
        />
        <Route
          path="/admin/teachers"
          element={
            <RequireAccess allowed={legacyAllowed} message="Teacher access management requires the owner role.">
              <TeacherAccess />
            </RequireAccess>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DebugOverlay />
    </Layout>
  );
}
