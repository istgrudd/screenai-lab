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

import MbcLogo from "@/components/brand/MbcLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser, logout, ROLES } from "@/lib/auth";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
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
      { to: "/admin/email-templates", label: "Emails", icon: Mail },
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

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

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

function NavItem({ link, pathname, compact = false }) {
  const Icon = link.icon;

  return (
    <NavLink
      to={link.to}
      end
      className={({ isActive }) =>
        cx(
          "group flex items-center gap-3 rounded-xl text-sm font-medium transition-colors",
          compact ? "px-3 py-2" : "px-3 py-2.5",
          isLinkActive(link, pathname, isActive)
            ? "brand-gradient text-white shadow-[var(--shadow-navy)]"
            : compact
              ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              : "text-white/72 hover:bg-white/10 hover:text-white"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={compact ? "whitespace-nowrap" : "truncate"}>{link.label}</span>
    </NavLink>
  );
}

function DesktopSidebar({ user, groups, pathname }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col bg-primary-deep text-white shadow-[var(--shadow-navy)] lg:flex">
      <div className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <MbcLogo variant="white" size="sm" showText={false} />
          <div className="min-w-0">
            <div className="font-heading text-base font-bold tracking-normal">
              ScreenAI Lab
            </div>
            <div className="text-xs font-medium text-white/70">
              MBC Laboratory Recruitment
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <section key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
              {group.label}
            </p>
            {group.items.map((link) => (
              <NavItem key={link.to} link={link} pathname={pathname} />
            ))}
          </section>
        ))}
      </nav>

      {user && (
        <div className="space-y-3 border-t border-white/15 px-4 py-4">
          <div className="rounded-xl bg-white/10 px-3 py-3">
            <p className="truncate text-sm font-medium text-white" title={user.email}>
              {user.email}
            </p>
            <Badge className="mt-2 border-white/20 bg-white/15 text-[10px] uppercase tracking-[0.08em] text-white hover:bg-white/15">
              {ROLE_LABEL[user.role] || user.role}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-white/78 hover:bg-white/10 hover:text-white"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      )}
    </aside>
  );
}

function MobileSidebar({ user, groups, pathname }) {
  const links = groups.flatMap((group) => group.items);

  return (
    <div className="border-b border-border bg-card/95 px-4 py-4 shadow-sm backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <MbcLogo variant="primary" size="sm" />
        {user && (
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-[0.08em]">
            {ROLE_LABEL[user.role] || user.role}
          </Badge>
        )}
      </div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {links.map((link) => (
          <NavItem key={`${link.to}-${link.label}`} link={link} pathname={pathname} compact />
        ))}
      </nav>
    </div>
  );
}

export default function BrandSidebar() {
  const user = getCurrentUser();
  const location = useLocation();
  const groups = groupsForRole(user?.role);

  return (
    <>
      <DesktopSidebar user={user} groups={groups} pathname={location.pathname} />
      <MobileSidebar user={user} groups={groups} pathname={location.pathname} />
    </>
  );
}
