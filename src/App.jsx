// src/App.jsx
import React, { lazy, Suspense, useContext } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { AuthContext } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import SignInPage from "./pages/SignInPage.jsx";
import {
  canUseAcademic,
  canUseAdmin,
  canUseBehavior,
  canUseCommandCenter,
  canUseLegacyTools,
  canOverrideBehaviorThreshold,
  hasConfiguredAccess
} from "./utils/access";

import { useInstallClientLogger, useProductionErrorReporter, DebugOverlay } from "./debug/ClientLogger.jsx";

const BehaviorLog = lazy(() => import("./pages/BehaviorLog.jsx"));
const StandardsTracker = lazy(() => import("./pages/StandardsTracker.jsx"));
const GradeCalculator = lazy(() => import("./pages/GradeCalculator.jsx"));
const TeacherNotes = lazy(() => import("./pages/TeacherNotes.jsx"));
const MegaChecklist = lazy(() => import("./pages/MegaChecklist.jsx"));
const SharePage = lazy(() => import("./components/SharePage.jsx"));
const LegacyDashboard = lazy(() => import("./pages/MainDashboard.jsx"));
const InterventionHome = lazy(() => import("./pages/InterventionHome.jsx"));
const AcademicDashboard = lazy(() => import("./pages/AcademicDashboard.jsx"));
const BehaviorWorkspace = lazy(() => import("./pages/BehaviorWorkspace.jsx"));
const BulkImportStudents = lazy(() => import("./pages/Admin/BulkImportStudents.jsx"));
const TeacherAccess = lazy(() => import("./pages/Admin/TeacherAccess.jsx"));
const HomeContacts = lazy(() => import("./pages/Admin/HomeContacts.jsx"));
const OperationalDashboard = lazy(() => import("./pages/Admin/OperationalDashboard.jsx"));
const SupportReports = lazy(() => import("./pages/Admin/SupportReports.jsx"));
const Analytics = lazy(() => import("./pages/Admin/Analytics.jsx"));
const OneMinuteHuman = lazy(() => import("./pages/OneMinuteHuman.jsx"));
const ARHistoryPage = lazy(() => import("./pages/History.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));
const StudentsList = lazy(() => import("./pages/StudentsList.jsx"));
const CommandCenter = lazy(() => import("./pages/CommandCenter.jsx"));
const StudentSupports = lazy(() => import("./pages/StudentSupports.jsx"));
const StandardsPulse = lazy(() => import("./pages/StandardsPulse.jsx"));
const StandardPulseDetail = lazy(() => import("./pages/StandardPulseDetail.jsx"));
const LessonSequences = lazy(() => import("./pages/LessonSequences.jsx"));
const LessonSequenceEditor = lazy(() => import("./pages/LessonSequenceEditor.jsx"));
const ActiveSequence = lazy(() => import("./pages/ActiveSequence.jsx"));
const InstructionPlanner = lazy(() => import("./pages/InstructionPlanner.jsx"));

function PageContent({ children }) {
  return (
    <Suspense fallback={
      <div role="status" className="flex min-h-64 items-center justify-center px-5 text-sm text-slate-600">
        Loading page…
      </div>
    }>
      {children}
    </Suspense>
  );
}

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

  const { user, profile, profileLoading, authError, login, logout, qaLogin, qaEmulatorMode } = useContext(AuthContext);
  useProductionErrorReporter(user);
  const location = useLocation();
  const isPublic = location.pathname.startsWith("/share");

  if (isPublic) {
    return (
      <>
        <PageContent>
          <Routes>
            <Route path="/share/:token" element={<SharePage />} />
            <Route path="*" element={<Navigate to="/share/invalid" replace />} />
          </Routes>
        </PageContent>
        <DebugOverlay />
      </>
    );
  }

  if (!user) {
    return <SignInPage onSignIn={login} authError={authError} qaLogin={qaLogin} qaEmulatorMode={qaEmulatorMode} />;
  }

  if (profileLoading) {
    return (
      <>
        <LoadingScreen />
        <DebugOverlay />
      </>
    );
  }

  if (profile?.disabled === true) {
    return (
      <Layout displayName={profile?.displayName || user.displayName} logout={logout} profile={profile}>
        <PageContent>
          <InterventionHome profile={profile} user={user} logout={logout} />
        </PageContent>
      </Layout>
    );
  }

  if (!hasConfiguredAccess(profile)) {
    return (
      <Layout displayName={profile?.displayName || user.displayName} logout={logout} profile={profile}>
        <PageContent>
          <InterventionHome profile={profile} user={user} logout={logout} />
        </PageContent>
      </Layout>
    );
  }

  const academicAllowed = canUseAcademic(profile);
  const behaviorAllowed = canUseBehavior(profile);
  const commandCenterAllowed = canUseCommandCenter(profile);
  const legacyAllowed = canUseLegacyTools(profile);
  const adminAllowed = canUseAdmin(profile);
  const homeContactAdminAllowed = canOverrideBehaviorThreshold(profile);

  return (
    <Layout displayName={profile?.displayName || user.displayName} logout={logout} profile={profile}>
      <PageContent>
        <Routes>
          <Route path="/" element={<InterventionHome profile={profile} user={user} logout={logout} />} />
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
          <Route path="/command-center/planner" element={<RequireAccess allowed={commandCenterAllowed} message="The Instruction Planner is available only to the owner."><InstructionPlanner /></RequireAccess>} />
          <Route
            path="/command-center"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="The Teacher Command Center is available only to the owner.">
                <CommandCenter />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/standards"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="Standards Pulse is available only to the owner.">
                <StandardsPulse />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/student-supports"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="Student Supports is available only to the owner.">
                <StudentSupports />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/standards/:standardCode"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="Standards Pulse is available only to the owner.">
                <StandardPulseDetail />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/sequences"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="Sequences are available only to the owner.">
                <LessonSequences />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/sequences/active"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="The Active sequence view is available only to the owner.">
                <ActiveSequence />
              </RequireAccess>
            }
          />
          <Route
            path="/command-center/sequences/:sequenceId"
            element={
              <RequireAccess allowed={commandCenterAllowed} message="Sequences are available only to the owner.">
                <LessonSequenceEditor />
              </RequireAccess>
            }
          />
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
          <Route path="/dailyplan" element={<Navigate to="/command-center/planner" replace />} />
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
          <Route path="/week" element={<Navigate to="/command-center/planner" replace />} />
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
            path="/admin/analytics"
            element={
              <RequireAccess allowed={adminAllowed} message="Behavior analytics requires an admin, MTSS lead, or owner role.">
                <Analytics />
              </RequireAccess>
            }
          />
          <Route
            path="/admin/operations"
            element={
              <RequireAccess allowed={adminAllowed} message="Operational health requires an admin, MTSS lead, or owner role.">
                <OperationalDashboard />
              </RequireAccess>
            }
          />
          <Route
            path="/admin/support"
            element={
              <RequireAccess allowed={adminAllowed} message="Support reports require an admin, MTSS lead, or owner role.">
                <SupportReports />
              </RequireAccess>
            }
          />
          <Route
            path="/admin/home-contacts"
            element={
              <RequireAccess allowed={homeContactAdminAllowed} message="Home contact administration requires an admin or owner role.">
                <HomeContacts />
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
      </PageContent>
      <DebugOverlay />
    </Layout>
  );
}
