import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import RoleNavSidebar from "@/components/navigation/RoleNavSidebar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";

import CandidateDetailPage from "@/pages/CandidateDetailPage";
import LoginPage from "@/pages/LoginPage";
import MyApplicationsPage from "@/pages/MyApplicationsPage";
import RegisterPage from "@/pages/RegisterPage";
import RubricConfigPage from "@/pages/RubricConfigPage";
import UploadPage from "@/pages/UploadPage";

import CandidateDashboardPage from "@/pages/candidate/DashboardPage";
import CandidateProfilePage from "@/pages/candidate/ProfilePage";
import CandidateEditProfilePage from "@/pages/candidate/EditProfilePage";
import ApplicationOverviewPage from "@/pages/candidate/ApplicationOverviewPage";
import StartApplicationPage from "@/pages/candidate/StartApplicationPage";
import DocumentsPage from "@/pages/candidate/DocumentsPage";
import ReviewPage from "@/pages/candidate/ReviewPage";
import ApplicationStatusPage from "@/pages/candidate/ApplicationStatusPage";

import RecruiterOverviewPage from "@/pages/recruiter/OverviewPage";
import RecruiterApplicationsPage from "@/pages/recruiter/ApplicationsPage";
import RecruiterEvaluationPage from "@/pages/recruiter/EvaluationPage";
import RecruiterCandidatesPage from "@/pages/recruiter/CandidatesPage";
import RecruiterDocumentVerificationPage from "@/pages/recruiter/DocumentVerificationPage";
import RecruiterAnnouncementsPage from "@/pages/recruiter/AnnouncementsPage";
import RecruiterAnalyticsPage from "@/pages/recruiter/AnalyticsPage";
import RecruiterProfilePage from "@/pages/recruiter/ProfilePage";
import RecruiterEditProfilePage from "@/pages/recruiter/EditProfilePage";

import AdminOverviewPage from "@/pages/admin/OverviewPage";
import AdminPage from "@/pages/admin/AdminPage";
import RecruitmentPeriodPage from "@/pages/admin/RecruitmentPeriodPage";
import AuditLogsPage from "@/pages/admin/AuditLogsPage";
import EmailTemplatesPage from "@/pages/admin/EmailTemplatesPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import AdminProfilePage from "@/pages/admin/ProfilePage";
import AdminEditProfilePage from "@/pages/admin/EditProfilePage";

import {
  defaultPathForRole,
  getCurrentUser,
  isAuthenticated,
  ROLES,
} from "@/lib/auth";
import { getMyApplication } from "@/lib/api";
import { isNotFoundError } from "@/lib/candidateApplication";

function AuthenticatedShell({ children }) {
  return (
    <div className="flex min-h-screen bg-background">
      <RoleNavSidebar />
      <main className="flex-1 ml-64">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

function ProtectedShell({ roles, children }) {
  return (
    <AuthenticatedShell>
      <ProtectedRoute roles={roles}>{children}</ProtectedRoute>
    </AuthenticatedShell>
  );
}

function RootRedirect() {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const user = getCurrentUser();
  return <Navigate to={defaultPathForRole(user?.role)} replace />;
}

function RouteLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function LegacyReviewRedirect() {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveTarget() {
      try {
        const application = await getMyApplication();
        if (cancelled) return;
        setTarget(
          application.status === "draft"
            ? "/application/review"
            : "/application/status"
        );
      } catch (error) {
        if (cancelled) return;
        setTarget(
          isNotFoundError(error)
            ? "/application/start"
            : "/application/status"
        );
      }
    }

    resolveTarget();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return <RouteLoader />;
  return <Navigate to={target} replace />;
}

const CANDIDATE = [ROLES.CANDIDATE];
const RECRUITER_PLUS = [ROLES.RECRUITER, ROLES.SUPER_ADMIN];
const SUPER_ADMIN = [ROLES.SUPER_ADMIN];

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/"
            element={
              <AuthenticatedShell>
                <RootRedirect />
              </AuthenticatedShell>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <CandidateDashboardPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <CandidateProfilePage />
              </ProtectedShell>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <CandidateEditProfilePage />
              </ProtectedShell>
            }
          />
          <Route
            path="/application"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <ApplicationOverviewPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/application/start"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <StartApplicationPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <DocumentsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/application/review"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <ReviewPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/application/status"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <ApplicationStatusPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <LegacyReviewRedirect />
              </ProtectedShell>
            }
          />
          <Route
            path="/submitted"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <Navigate to="/application/status" replace />
              </ProtectedShell>
            }
          />
          <Route
            path="/result"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <Navigate to="/application/status" replace />
              </ProtectedShell>
            }
          />
          <Route
            path="/my-applications"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <MyApplicationsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedShell roles={CANDIDATE}>
                <UploadPage />
              </ProtectedShell>
            }
          />

          <Route
            path="/recruiter/dashboard"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterOverviewPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/applications"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterApplicationsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/evaluation"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterEvaluationPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/candidates"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterCandidatesPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/documents"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterDocumentVerificationPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/announcements"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterAnnouncementsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/analytics"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterAnalyticsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/rubrics"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RubricConfigPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/candidates/:id"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <CandidateDetailPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/profile"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterProfilePage />
              </ProtectedShell>
            }
          />
          <Route
            path="/recruiter/profile/edit"
            element={
              <ProtectedShell roles={RECRUITER_PLUS}>
                <RecruiterEditProfilePage />
              </ProtectedShell>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <AdminOverviewPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <AdminPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/periods"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <RecruitmentPeriodPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <AuditLogsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/email-templates"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <EmailTemplatesPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <SettingsPage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <AdminProfilePage />
              </ProtectedShell>
            }
          />
          <Route
            path="/admin/profile/edit"
            element={
              <ProtectedShell roles={SUPER_ADMIN}>
                <AdminEditProfilePage />
              </ProtectedShell>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </BrowserRouter>
  );
}
