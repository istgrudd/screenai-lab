import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  LogOut,
  ClipboardList,
  GraduationCap,
  CheckCircle2,
  UserCog,
  CalendarClock,
  Loader2,
} from "lucide-react";

import DashboardPage from "@/pages/DashboardPage";
import UploadPage from "@/pages/UploadPage";
import RubricConfigPage from "@/pages/RubricConfigPage";
import CandidateDetailPage from "@/pages/CandidateDetailPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import MyApplicationsPage from "@/pages/MyApplicationsPage";

import CandidateDashboardPage from "@/pages/candidate/DashboardPage";
import ProfilePage from "@/pages/candidate/ProfilePage";
import EditProfilePage from "@/pages/candidate/EditProfilePage";
import ApplicationOverviewPage from "@/pages/candidate/ApplicationOverviewPage";
import StartApplicationPage from "@/pages/candidate/StartApplicationPage";
import DocumentsPage from "@/pages/candidate/DocumentsPage";
import ReviewPage from "@/pages/candidate/ReviewPage";
import ApplicationStatusPage from "@/pages/candidate/ApplicationStatusPage";
import AdminPage from "@/pages/admin/AdminPage";
import AdminProfilePage from "@/pages/admin/ProfilePage";
import RecruitmentPeriodPage from "@/pages/admin/RecruitmentPeriodPage";
import RecruiterProfilePage from "@/pages/recruiter/ProfilePage";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  getCurrentUser,
  isAuthenticated,
  logout,
  ROLES,
  defaultPathForRole,
} from "@/lib/auth";
import { getMyApplication } from "@/lib/api";
import { isNotFoundError } from "@/lib/candidateApplication";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
};

const ROLE_BADGE_VARIANT = {
  super_admin: "default",
  recruiter: "secondary",
  candidate: "outline",
};

function navLinksForRole(role) {
  if (role === ROLES.CANDIDATE) {
    return [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        to: "/application",
        label: "Application Overview",
        icon: ClipboardList,
        isActive: (pathname) =>
          ["/application", "/application/start", "/application/review", "/review"].includes(pathname),
      },
      { to: "/documents", label: "Documents", icon: FileText },
      {
        to: "/application/status",
        label: "Application Status",
        icon: CheckCircle2,
        isActive: (pathname) =>
          ["/application/status", "/submitted", "/result"].includes(pathname),
      },
      { to: "/profile", label: "Profile", icon: GraduationCap },
    ];
  }
  if (role === ROLES.RECRUITER || role === ROLES.SUPER_ADMIN) {
    const links = [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/rubrics", label: "Rubrics", icon: FileText },
    ];
    if (role === ROLES.SUPER_ADMIN) {
      links.push({ to: "/admin/users", label: "Admin Panel", icon: UserCog });
      links.push({ to: "/admin/periods", label: "Periode Rekrutasi", icon: CalendarClock });
      links.push({ to: "/admin/profile", label: "Profile", icon: GraduationCap });
    } else {
      links.push({ to: "/recruiter/profile", label: "Profile", icon: GraduationCap });
    }
    return links;
  }
  return [];
}

function Sidebar() {
  const user = getCurrentUser();
  const location = useLocation();
  const links = navLinksForRole(user?.role);

  return (
    <aside className="fixed top-0 left-0 z-40 h-screen w-64 border-r border-border bg-card flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            ScreenAI Lab
          </h1>
          <p className="text-xs text-muted-foreground">MBC Laboratory Recruitment</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                (link.isActive ? link.isActive(location.pathname) : isActive)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`
            }
          >
            <link.icon className="w-4 h-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* User + footer */}
      {user && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium truncate" title={user.email}>
              {user.email}
            </p>
            <Badge
              variant={ROLE_BADGE_VARIANT[user.role] || "secondary"}
              className="text-[10px] uppercase tracking-wide"
            >
              {ROLE_LABEL[user.role] || user.role}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Log out
          </Button>
          <p className="text-xs text-muted-foreground pt-1">
            MBC Laboratory © 2026
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * Shell for authenticated pages — sidebar + content area.
 * Login/register pages render without this wrapper.
 */
function AuthenticatedShell({ children }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-64">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

/** Redirect "/" to the right landing page based on auth + role. */
function RootRedirect() {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  const user = getCurrentUser();
  const target = defaultPathForRole(user?.role);
  if (target === "/") {
    // recruiter/super_admin already land at "/" — render Dashboard directly
    return (
      <ProtectedRoute roles={[ROLES.RECRUITER, ROLES.SUPER_ADMIN]}>
        <DashboardPage />
      </ProtectedRoute>
    );
  }
  return <Navigate to={target} replace />;
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

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated shell */}
          <Route
            path="/"
            element={
              <AuthenticatedShell>
                <RootRedirect />
              </AuthenticatedShell>
            }
          />

          {/* Candidate routes (Phase 1) */}
          <Route
            path="/dashboard"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <CandidateDashboardPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <ProfilePage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <EditProfilePage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/application"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <ApplicationOverviewPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/application/start"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <StartApplicationPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/documents"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <DocumentsPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/application/review"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <ReviewPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/application/status"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <ApplicationStatusPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/review"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <LegacyReviewRedirect />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/submitted"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <Navigate to="/application/status" replace />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/my-applications"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <MyApplicationsPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/result"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <Navigate to="/application/status" replace />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />

          {/* Legacy Capstone CV upload — off-nav, candidate-only (matches backend). */}
          <Route
            path="/upload"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.CANDIDATE]}>
                  <UploadPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />

          {/* Recruiter / Admin routes */}
          <Route
            path="/rubrics"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.RECRUITER, ROLES.SUPER_ADMIN]}>
                  <RubricConfigPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/candidates/:id"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.RECRUITER, ROLES.SUPER_ADMIN]}>
                  <CandidateDetailPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                  <AdminPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/admin/periods"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                  <RecruitmentPeriodPage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
                  <AdminProfilePage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />
          <Route
            path="/recruiter/profile"
            element={
              <AuthenticatedShell>
                <ProtectedRoute roles={[ROLES.RECRUITER, ROLES.SUPER_ADMIN]}>
                  <RecruiterProfilePage />
                </ProtectedRoute>
              </AuthenticatedShell>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </BrowserRouter>
  );
}
