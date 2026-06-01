import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { getAdminAuditLogs } from "@/lib/api";

const PAGE_SIZE = 20;
const INITIAL_FILTERS = {
  actionType: "all",
  recruiterId: "",
  candidateId: "",
  dateFrom: "",
  dateTo: "",
};

const ACTION_TYPES = [
  { value: "all", label: "All actions" },
  { value: "document_verification", label: "Document verification" },
  { value: "document_review_finalized", label: "Document review finalized" },
  { value: "announcement", label: "Announcement" },
  { value: "bulk_announcement", label: "Bulk announcement" },
  { value: "score_override", label: "Score override" },
];

const LIMIT_OPTIONS = [10, 20, 50, 100];

const ACTION_BADGE_CLASS = {
  document_verification: "border-sky-200 bg-sky-50 text-sky-700",
  document_review_finalized: "border-emerald-200 bg-emerald-50 text-emerald-700",
  announcement: "border-amber-200 bg-amber-50 text-amber-700",
  bulk_announcement: "border-orange-200 bg-orange-50 text-orange-700",
  score_override: "border-violet-200 bg-violet-50 text-violet-700",
};

function actionLabel(actionType) {
  const known = ACTION_TYPES.find((item) => item.value === actionType);
  if (known) return known.label;
  return String(actionType || "unknown").replace(/_/g, " ");
}

function formatTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function displayText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function ActionBadge({ actionType }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide whitespace-nowrap ${
        ACTION_BADGE_CLASS[actionType] || "border-muted-foreground/30"
      }`}
    >
      {actionLabel(actionType)}
    </Badge>
  );
}

function UserSummary({ user, showRole = false }) {
  if (!user) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="min-w-[150px] max-w-[220px] space-y-1">
      <p className="font-medium truncate">
        {user.full_name || `User #${user.user_id}`}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {user.email || "No email"}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">#{user.user_id}</span>
        {showRole && user.role && (
          <Badge variant="secondary" className="text-[9px] uppercase">
            {String(user.role).replace("_", " ")}
          </Badge>
        )}
        {!showRole && user.nim && <span className="font-mono">{user.nim}</span>}
      </div>
    </div>
  );
}

function LongText({ value, className = "" }) {
  return (
    <span
      className={`block max-w-[260px] whitespace-pre-wrap break-words text-xs leading-relaxed ${className}`}
    >
      {displayText(value)}
    </span>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await getAdminAuditLogs({
        page,
        limit,
        action_type:
          filters.actionType !== "all" ? filters.actionType : undefined,
        recruiter_id: filters.recruiterId || undefined,
        candidate_id: filters.candidateId || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
      });
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      const message = error.message || "Failed to load audit logs";
      setErrorMessage(message);
      setLogs([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    setPage(1);
    setDraftFilters(INITIAL_FILTERS);
    setFilters(INITIAL_FILTERS);
  };

  const updateDraftFilter = (key, value) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">
            Review immutable recruiter and admin actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows</span>
          <Select
            value={String(limit)}
            onValueChange={(value) => {
              setLimit(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {LIMIT_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={applyFilters}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
          >
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="audit-action-type">Action type</Label>
              <Select
                value={draftFilters.actionType}
                onValueChange={(value) => updateDraftFilter("actionType", value)}
              >
                <SelectTrigger id="audit-action-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audit-recruiter-id">Actor ID</Label>
              <Input
                id="audit-recruiter-id"
                type="number"
                min="1"
                inputMode="numeric"
                value={draftFilters.recruiterId}
                onChange={(event) =>
                  updateDraftFilter("recruiterId", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audit-candidate-id">Affected user ID</Label>
              <Input
                id="audit-candidate-id"
                type="number"
                min="1"
                inputMode="numeric"
                value={draftFilters.candidateId}
                onChange={(event) =>
                  updateDraftFilter("candidateId", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audit-date-from">Date from</Label>
              <Input
                id="audit-date-from"
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) =>
                  updateDraftFilter("dateFrom", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audit-date-to">Date to</Label>
              <Input
                id="audit-date-to"
                type="date"
                value={draftFilters.dateTo}
                onChange={(event) =>
                  updateDraftFilter("dateTo", event.target.value)
                }
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-6">
              <Button type="submit" className="gap-2">
                <Search className="w-4 h-4" />
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={resetFilters}
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {total.toLocaleString()} audit log{total === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading audit logs...
            </div>
          ) : errorMessage ? (
            <div className="py-16 px-4 text-center text-sm text-destructive">
              <p>{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchLogs}
              >
                Retry
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No audit logs match those filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">Timestamp</TableHead>
                    <TableHead className="w-[190px]">Action Type</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Affected User</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>New Value</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(log.timestamp)}
                      </TableCell>
                      <TableCell>
                        <ActionBadge actionType={log.action_type} />
                      </TableCell>
                      <TableCell>
                        <UserSummary user={log.actor} showRole />
                      </TableCell>
                      <TableCell>
                        <UserSummary user={log.affected_user} />
                      </TableCell>
                      <TableCell>
                        <LongText value={log.old_value} />
                      </TableCell>
                      <TableCell>
                        <LongText value={log.new_value} />
                      </TableCell>
                      <TableCell>
                        <LongText value={log.reason} className="max-w-[320px]" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > limit && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of{" "}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
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
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
