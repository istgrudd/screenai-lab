import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Upload,
  FileText,
  BarChart3,
  LogOut,
  ClipboardList,
} from "lucide-react";

import DashboardPage from "@/pages/DashboardPage";
import UploadPage from "@/pages/UploadPage";
import RubricConfigPage from "@/pages/RubricConfigPage";
import CandidateDetailPage from "@/pages/CandidateDetailPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import MyApplicationsPage from "@/pages/MyApplicationsPage";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  getCurrentUser,
  isAuthenticated,
  logout,
  ROLES,
  defaultPathForRole,
} from "@/lib/auth";

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
      { to: "/upload", label: "Upload", icon: Upload },
      { to: "/my-applications", label: "My Applications", icon: ClipboardList },
    ];
  }
  if (role === ROLES.RECRUITER || role === ROLES.SUPER_ADMIN) {
    return [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/rubrics", label: "Rubrics", icon: FileText },
    ];
  }
  return [];
}

function Sidebar() {
  const user = getCurrentUser();
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
                isActive
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

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </BrowserRouter>
  );
}
