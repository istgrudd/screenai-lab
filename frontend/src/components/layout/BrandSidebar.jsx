import { useEffect, useState } from "react";
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
  Menu,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  X,
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

function NavItem({ link, pathname, onNavigate }) {
  const Icon = link.icon;

  return (
    <NavLink
      to={link.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isLinkActive(link, pathname, isActive)
            ? "brand-gradient text-white shadow-[var(--shadow-navy)]"
            : "text-white/72 hover:bg-white/10 hover:text-white"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{link.label}</span>
    </NavLink>
  );
}

function SidebarNav({ groups, pathname, onNavigate }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <section key={group.label} className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
            {group.label}
          </p>
          {group.items.map((link) => (
            <NavItem
              key={link.to}
              link={link}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </section>
      ))}
    </nav>
  );
}

function SidebarUserFooter({ user, onNavigate }) {
  if (!user) return null;
  return (
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
        onClick={() => {
          onNavigate?.();
          logout();
        }}
      >
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}

function DesktopSidebar({ user, groups, pathname }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col bg-primary-deep text-white shadow-[var(--shadow-navy)] md:flex">
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

      <SidebarNav groups={groups} pathname={pathname} />
      <SidebarUserFooter user={user} />
    </aside>
  );
}

function MobileTopBar({ user, onOpen }) {
  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open navigation menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted"
      >
        <Menu className="h-5 w-5" />
      </button>
      <MbcLogo variant="primary" size="sm" />
      {user && (
        <Badge variant="outline" className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.08em]">
          {ROLE_LABEL[user.role] || user.role}
        </Badge>
      )}
    </div>
  );
}

function MobileDrawer({ open, onClose, user, groups, pathname }) {
  return (
    <div
      className={cx("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cx(
          "absolute inset-0 bg-foreground/40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <aside
        className={cx(
          "absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col bg-primary-deep text-white shadow-[var(--shadow-navy)] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <div className="font-heading text-base font-bold tracking-normal">
              ScreenAI Lab
            </div>
            <div className="truncate text-xs font-medium text-white/70">
              MBC Laboratory Recruitment
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <SidebarNav groups={groups} pathname={pathname} onNavigate={onClose} />
        <SidebarUserFooter user={user} onNavigate={onClose} />
      </aside>
    </div>
  );
}

export default function BrandSidebar() {
  const user = getCurrentUser();
  const location = useLocation();
  const groups = groupsForRole(user?.role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  // Nav links and logout close the drawer via onNavigate; this also covers
  // Escape and locks body scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  // Close the drawer when the viewport grows to the desktop breakpoint.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handle = (event) => {
      if (event.matches) setDrawerOpen(false);
    };
    mql.addEventListener("change", handle);
    return () => mql.removeEventListener("change", handle);
  }, []);

  return (
    <>
      <DesktopSidebar user={user} groups={groups} pathname={location.pathname} />
      <MobileTopBar user={user} onOpen={() => setDrawerOpen(true)} />
      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        user={user}
        groups={groups}
        pathname={location.pathname}
      />
    </>
  );
}
