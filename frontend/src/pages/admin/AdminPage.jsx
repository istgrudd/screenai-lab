import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  Power,
  Search,
  ShieldAlert,
  UserCog,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  adminResetPassword,
  deactivateUser,
  getActivePeriod,
  getActivePeriodStats,
  listUsers,
  reactivateUser,
  updateUserRole,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";

const PAGE_SIZE = 20;

const ROLES = [
  { id: "all", label: "All roles" },
  { id: "candidate", label: "Candidate" },
  { id: "recruiter", label: "Recruiter" },
  { id: "super_admin", label: "Super Admin" },
];

const ROLE_BADGE_VARIANT = {
  super_admin: "default",
  recruiter: "secondary",
  candidate: "outline",
};

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

  // Task 13.4.1 — phase card at the top of the admin panel.
  const [activePeriod, setActivePeriod] = useState(null);
  const [activeStats, setActiveStats] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPeriodLoading(true);
      try {
        const p = await getActivePeriod();
        if (!cancelled) setActivePeriod(p);
      } catch {
        if (!cancelled) setActivePeriod(null);
      }
      try {
        const s = await getActivePeriodStats();
        if (!cancelled) setActiveStats(s);
      } catch {
        if (!cancelled) setActiveStats(null);
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    })();
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
    fetchPage();
  }, [fetchPage]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  };

  const handleRoleChange = async (userId, newRole) => {
    setBusyUserId(userId);
    try {
      await updateUserRole(userId, newRole);
      toast.success("Role updated.");
      fetchPage();
    } catch (err) {
      toast.error(err.message || "Role update failed");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleActive = async (user) => {
    setBusyUserId(user.id);
    try {
      if (user.is_active) {
        await deactivateUser(user.id);
        toast.success(`${user.full_name} deactivated.`);
      } else {
        await reactivateUser(user.id);
        toast.success(`${user.full_name} reactivated.`);
      }
      fetchPage();
    } catch (err) {
      toast.error(err.message || "Action failed");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async (user) => {
    const newPassword = window.prompt(
      `Set a new password for ${user.full_name} (${user.email}).\n` +
        `Minimum 8 characters. Share securely — this is an admin-assisted reset.`
    );
    if (newPassword == null) return; // cancelled
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusyUserId(user.id);
    try {
      await adminResetPassword(user.id, newPassword);
      toast.success(`Password reset for ${user.full_name}.`);
    } catch (err) {
      toast.error(err.message || "Password reset failed");
    } finally {
      setBusyUserId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Promote users, change roles, and deactivate accounts.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/admin/periods">
            <CalendarClock className="w-4 h-4" />
            Kelola Periode Rekrutasi
          </Link>
        </Button>
      </div>

      {/* Task 13.4.1 — phase timeline + stats. */}
      <RecruitmentPhaseCard
        role="super_admin"
        period={activePeriod}
        stats={activeStats}
        loading={periodLoading}
      />

      {/* Filters */}
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-3 items-center">
          <form onSubmit={onSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or NIM"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {total.toLocaleString()} user{total === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No users match those filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>NIM</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[260px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = me?.id === u.id;
                  const busy = busyUserId === u.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {u.nim || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ROLE_BADGE_VARIANT[u.role] || "secondary"}
                          className="text-[10px] uppercase"
                        >
                          {u.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            Deactivated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleRoleChange(u.id, v)}
                            disabled={busy || isSelf}
                          >
                            <SelectTrigger className="w-[150px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="candidate">candidate</SelectItem>
                              <SelectItem value="recruiter">recruiter</SelectItem>
                              <SelectItem value="super_admin">super_admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant={u.is_active ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleToggleActive(u)}
                            disabled={busy || isSelf}
                            className="gap-1"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                            {u.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPassword(u)}
                            disabled={busy}
                            className="gap-1"
                            title="Set a new password for this user"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Reset password
                          </Button>
                        </div>
                        {isSelf && (
                          <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-1">
                            <ShieldAlert className="w-3 h-3" />
                            You can't modify your own account
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1} –{" "}
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
