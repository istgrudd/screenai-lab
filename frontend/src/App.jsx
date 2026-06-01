import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";

import CandidateDetailPage from "@/pages/CandidateDetailPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import LoginPage from "@/pages/LoginPage";
import MyApplicationsPage from "@/pages/MyApplicationsPage";
import RegisterPage from "@/pages/RegisterPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import RubricConfigPage from "@/pages/RubricConfigPage";
import UploadPage from "@/pages/UploadPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";

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
import { getMyApplication, getMyProfile } from "@/lib/api";
import {
  isNotFoundError,
  missingRequiredProfileFields,
} from "@/lib/candidateApplication";

function AuthenticatedShell({ children }) {
  return <AppShell>{children}</AppShell>;
}

function ProtectedShell({ roles, children }) {
  return (
    <AuthenticatedShell>
      <ProtectedRoute roles={roles}>{children}</ProtectedRoute>
    </AuthenticatedShell>
  );
}

function CandidateProfileGuard({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, missing: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (location.pathname === "/profile/edit") {
        setState({ loading: false, missing: [] });
        return;
      }
      try {
        const profile = await getMyProfile();
        if (!cancelled) {
          setState({
            loading: false,
            missing: missingRequiredProfileFields(profile),
          });
        }
      } catch {
        if (!cancelled) setState({ loading: false, missing: [] });
      }
    }

    setState({ loading: true, missing: [] });
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) return <RouteLoader />;
  if (state.missing.length > 0) {
    return (
      <Navigate
        to="/profile/edit"
        replace
        state={{ from: location, missingProfileFields: state.missing }}
      />
    );
  }
  return children;
}

function CandidateShell({ children }) {
  return (
    <ProtectedShell roles={CANDIDATE}>
      <CandidateProfileGuard>{children}</CandidateProfileGuard>
    </ProtectedShell>
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
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

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
              <CandidateShell>
                <CandidateDashboardPage />
              </CandidateShell>
            }
          />
          <Route
            path="/profile"
            element={
              <CandidateShell>
                <CandidateProfilePage />
              </CandidateShell>
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
              <CandidateShell>
                <ApplicationOverviewPage />
              </CandidateShell>
            }
          />
          <Route
            path="/application/start"
            element={
              <CandidateShell>
                <StartApplicationPage />
              </CandidateShell>
            }
          />
          <Route
            path="/documents"
            element={
              <CandidateShell>
                <DocumentsPage />
              </CandidateShell>
            }
          />
          <Route
            path="/application/review"
            element={
              <CandidateShell>
                <ReviewPage />
              </CandidateShell>
            }
          />
          <Route
            path="/application/status"
            element={
              <CandidateShell>
                <ApplicationStatusPage />
              </CandidateShell>
            }
          />
          <Route
            path="/review"
            element={
              <CandidateShell>
                <LegacyReviewRedirect />
              </CandidateShell>
            }
          />
          <Route
            path="/submitted"
            element={
              <CandidateShell>
                <Navigate to="/application/status" replace />
              </CandidateShell>
            }
          />
          <Route
            path="/result"
            element={
              <CandidateShell>
                <Navigate to="/application/status" replace />
              </CandidateShell>
            }
          />
          <Route
            path="/my-applications"
            element={
              <CandidateShell>
                <MyApplicationsPage />
              </CandidateShell>
            }
          />
          <Route
            path="/upload"
            element={
              <CandidateShell>
                <UploadPage />
              </CandidateShell>
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
