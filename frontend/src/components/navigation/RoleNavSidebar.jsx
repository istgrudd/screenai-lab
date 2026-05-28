import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser, logout, ROLES } from "@/lib/auth";

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

const CANDIDATE_GROUPS = [
  {
    label: "Home",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Application",
    items: [
      {
        to: "/application",
        label: "Application Overview",
        icon: ClipboardList,
        activePaths: ["/application", "/application/start", "/application/review", "/review"],
      },
      { to: "/documents", label: "Documents", icon: FileText },
      {
        to: "/application/status",
        label: "Application Status",
        icon: CheckCircle2,
        activePaths: ["/application/status", "/submitted", "/result"],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        to: "/profile",
        label: "Profile",
        icon: GraduationCap,
        activePrefix: "/profile",
      },
    ],
  },
];

const RECRUITER_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/recruiter/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Recruitment",
    items: [
      { to: "/recruiter/applications", label: "Applications", icon: ClipboardList },
      { to: "/recruiter/evaluation", label: "Evaluation", icon: Sparkles },
      {
        to: "/recruiter/candidates",
        label: "Candidates",
        icon: Users,
        activePrefix: ["/recruiter/candidates", "/candidates/"],
      },
      { to: "/recruiter/documents", label: "Document Verification", icon: ShieldCheck },
      { to: "/recruiter/announcements", label: "Announcements", icon: Bell },
      { to: "/recruiter/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Configuration",
    items: [{ to: "/rubrics", label: "Rubrics", icon: FileText }],
  },
  {
    label: "Account",
    items: [
      {
        to: "/recruiter/profile",
        label: "Profile",
        icon: GraduationCap,
        activePrefix: "/recruiter/profile",
      },
    ],
  },
];

const ADMIN_GROUPS = [
  {
    label: "Overview",
    items: [{ to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Recruitment",
    items: [
      { to: "/recruiter/applications", label: "Applications", icon: ClipboardList },
      { to: "/recruiter/evaluation", label: "Evaluation", icon: Sparkles },
      {
        to: "/recruiter/candidates",
        label: "Candidates",
        icon: Users,
        activePrefix: ["/recruiter/candidates", "/candidates/"],
      },
      { to: "/recruiter/documents", label: "Document Verification", icon: ShieldCheck },
      { to: "/recruiter/announcements", label: "Announcements", icon: Bell },
      { to: "/recruiter/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/users", label: "Users", icon: UserCog },
      { to: "/admin/periods", label: "Periods", icon: CalendarClock },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ShieldCheck },
      { to: "/admin/email-templates", label: "Email Templates", icon: Mail },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Configuration",
    items: [{ to: "/rubrics", label: "Rubrics", icon: FileText }],
  },
  {
    label: "Account",
    items: [
      {
        to: "/admin/profile",
        label: "Profile",
        icon: GraduationCap,
        activePrefix: "/admin/profile",
      },
    ],
  },
];

function groupsForRole(role) {
  if (role === ROLES.CANDIDATE) return CANDIDATE_GROUPS;
  if (role === ROLES.RECRUITER) return RECRUITER_GROUPS;
  if (role === ROLES.SUPER_ADMIN) return ADMIN_GROUPS;
  return [];
}

function matchesPrefix(pathname, prefix) {
  if (!prefix) return false;
  if (Array.isArray(prefix)) {
    return prefix.some((item) => pathname === item || pathname.startsWith(item));
  }
  return pathname === prefix || pathname.startsWith(prefix);
}

function isLinkActive(link, pathname, isActive) {
  if (link.activePaths?.includes(pathname)) return true;
  if (matchesPrefix(pathname, link.activePrefix)) return true;
  return isActive;
}

export default function RoleNavSidebar() {
  const user = getCurrentUser();
  const location = useLocation();
  const groups = groupsForRole(user?.role);

  return (
    <aside className="fixed top-0 left-0 z-40 h-screen w-64 border-r border-border bg-card flex flex-col">
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

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isLinkActive(link, location.pathname, isActive)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                <link.icon className="w-4 h-4" />
                <span className="truncate">{link.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

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
            MBC Laboratory 2026
          </p>
        </div>
      )}
    </aside>
  );
}
