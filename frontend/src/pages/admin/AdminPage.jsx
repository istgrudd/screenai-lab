import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  Power,
  ShieldAlert,
  UserCog,
} from "lucide-react";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import MetricCard from "@/components/common/MetricCard";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import PeriodSafetyPanel from "@/components/admin/PeriodSafetyPanel";
import UserManagementPanel from "@/components/admin/UserManagementPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deactivateUser,
  getActivePeriod,
  getActivePeriodStats,
  listUsers,
  reactivateUser,
  sendAdminPasswordResetLink,
  updateUserRole,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const PAGE_SIZE = 20;

const ROLE_OPTIONS = [
  { id: "candidate", label: "candidate" },
  { id: "recruiter", label: "recruiter" },
  { id: "super_admin", label: "super_admin" },
];

function roleTone(role) {
  if (role === "super_admin") return "destructive";
  if (role === "recruiter") return "brand";
  return "neutral";
}

function roleLabel(role) {
  return String(role || "unknown").replace("_", " ");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminPage() {
  const me = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const [activePeriod, setActivePeriod] = useState(null);
  const [activeStats, setActiveStats] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodContext() {
      setPeriodLoading(true);
      try {
        const period = await getActivePeriod();
        if (!cancelled) setActivePeriod(period);
      } catch {
        if (!cancelled) setActivePeriod(null);
      }
      try {
        const stats = await getActivePeriodStats();
        if (!cancelled) setActiveStats(stats);
      } catch {
        if (!cancelled) setActiveStats(null);
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    }

    Promise.resolve().then(loadPeriodContext);
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers({
        page,
        limit: PAGE_SIZE,
        role: roleFilter !== "all" ? roleFilter : undefined,
        q: appliedQuery || undefined,
      });
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, appliedQuery]);

  useEffect(() => {
    Promise.resolve().then(fetchPage);
  }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeUsers = useMemo(
    () => users.filter((user) => user.is_active).length,
    [users]
  );
  const superAdmins = useMemo(
    () => users.filter((user) => user.role === "super_admin").length,
    [users]
  );

  const onSearchSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  };

  const handleRoleChange = async (userId, newRole) => {
    setBusyUserId(userId);
    try {
      await updateUserRole(userId, newRole);
      toast.success("Role updated.");
      await fetchPage();
    } catch (err) {
      toast.error(err.message || "Role update failed");
    } finally {
      setBusyUserId(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;
    setBusyUserId(user.id);
    try {
      if (confirmAction.type === "deactivate") {
        await deactivateUser(user.id);
        toast.success(`${user.full_name} deactivated.`);
        await fetchPage();
      } else if (confirmAction.type === "reactivate") {
        await reactivateUser(user.id);
        toast.success(`${user.full_name} reactivated.`);
        await fetchPage();
      } else if (confirmAction.type === "reset-password") {
        await sendAdminPasswordResetLink(user.id);
        toast.success(`Password reset link sent to ${user.full_name}.`);
      }
    } catch (err) {
      toast.error(err.message || "Action failed");
    } finally {
      setBusyUserId(null);
      setConfirmAction(null);
    }
  };

  const confirmTitle =
    confirmAction?.type === "deactivate"
      ? `Deactivate ${confirmAction.user?.full_name}?`
      : confirmAction?.type === "reactivate"
      ? `Reactivate ${confirmAction.user?.full_name}?`
      : "Send assisted password reset?";
  const confirmDescription =
    confirmAction?.type === "deactivate"
      ? "This disables account access. The account can be reactivated later by a super admin."
      : confirmAction?.type === "reactivate"
      ? "This restores account access for the selected user."
      : confirmAction?.user
      ? `Send a password reset link to ${confirmAction.user.full_name} (${confirmAction.user.email}). The user will set their own password via email.`
      : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin / Users"
        title="User Management"
        description="Manage roles, account status, and assisted password reset with clear self-protection."
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/admin/periods">
              <CalendarClock className="h-4 w-4" />
              Kelola Periode
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={UserCog}
          label="Users in current page"
          value={loading ? "..." : users.length}
          helper={`${Number(total || 0).toLocaleString()} total matched records.`}
        />
        <MetricCard
          icon={Power}
          label="Active on page"
          value={loading ? "..." : activeUsers}
          helper="Current page only; use filters for narrower review."
          tone="success"
        />
        <MetricCard
          icon={ShieldAlert}
          label="Super admins on page"
          value={loading ? "..." : superAdmins}
          helper="Review role changes carefully before promoting users."
          tone="warning"
        />
      </div>

      <PeriodSafetyPanel
        activePeriod={activePeriod}
        activeStats={activeStats}
        applications={[]}
        loading={periodLoading}
      />

      <UserManagementPanel
        query={query}
        onQueryChange={setQuery}
        roleFilter={roleFilter}
        onRoleFilterChange={(value) => {
          setRoleFilter(value);
          setPage(1);
        }}
        onSearchSubmit={onSearchSubmit}
        total={total}
        page={page}
        totalPages={totalPages}
      />

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl tracking-normal">
            Accounts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}. Role updates refetch this page after
            the backend confirms the change.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5">
              <LoadingState variant="table" label="Loading users..." />
            </div>
          ) : users.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={UserCog}
                title="No users match those filters"
                description="Try a wider search query or switch role filter back to all roles."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>NIM</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[420px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isSelf = me?.id === user.id;
                    const busy = busyUserId === user.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {user.nim || "-"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={roleLabel(user.role)}
                            tone={roleTone(user.role)}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={user.is_active ? "active" : "deactivated"}
                            entityType="user"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(user.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Select
                              value={user.role}
                              onValueChange={(value) =>
                                handleRoleChange(user.id, value)
                              }
                              disabled={busy || isSelf}
                            >
                              <SelectTrigger className="h-9 w-[150px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    {role.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant={user.is_active ? "outline" : "default"}
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  type: user.is_active
                                    ? "deactivate"
                                    : "reactivate",
                                  user,
                                })
                              }
                              disabled={busy || isSelf}
                              className="gap-2"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                              {user.is_active ? "Deactivate" : "Reactivate"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  type: "reset-password",
                                  user,
                                })
                              }
                              disabled={busy || isSelf}
                              className="gap-2"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Assisted Password Reset
                            </Button>
                          </div>
                          {isSelf && (
                            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ShieldAlert className="h-3 w-3" />
                              You cannot modify your own account.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1} -{" "}
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={
          confirmAction?.type === "reset-password"
            ? "Send Reset Link"
            : "Confirm"
        }
        cancelLabel="Cancel"
        destructive={confirmAction?.type === "deactivate"}
        loading={Boolean(confirmAction?.user && busyUserId === confirmAction.user.id)}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
}
