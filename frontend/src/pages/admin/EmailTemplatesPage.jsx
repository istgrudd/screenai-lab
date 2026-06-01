import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  Search,
  Send,
  Server,
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
import { getAdminEmailNotifications } from "@/lib/api";

const PAGE_SIZE = 20;
const LIMIT_OPTIONS = [10, 20, 50, 100];

const INITIAL_FILTERS = {
  notificationType: "all",
  status: "all",
  toEmail: "",
  dateFrom: "",
  dateTo: "",
};

const NOTIFICATION_TYPES = [
  { value: "all", label: "All notifications" },
  { value: "application_submitted", label: "Application submitted" },
  { value: "document_rejected", label: "Document rejected" },
  { value: "announcement_published", label: "Announcement published" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "captured", label: "Captured" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "disabled", label: "Disabled" },
];

const TEMPLATE_PREVIEWS = [
  "Email Verification",
  "Forgot Password",
  "Admin Password Reset Link",
  "Application Submitted",
  "Document Rejected",
  "Announcement Published",
];

const STATUS_BADGE_CLASS = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  captured: "border-sky-200 bg-sky-50 text-sky-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  disabled: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-muted-foreground/30",
};

function notificationLabel(value) {
  const known = NOTIFICATION_TYPES.find((item) => item.value === value);
  if (known) return known.label;
  return String(value || "unknown").replace(/_/g, " ");
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

function StatusBadge({ status }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wide whitespace-nowrap ${
        STATUS_BADGE_CLASS[status] || "border-muted-foreground/30"
      }`}
    >
      {displayText(status)}
    </Badge>
  );
}

function UserSummary({ user, fallbackEmail }) {
  if (!user) {
    return (
      <div className="min-w-[170px] max-w-[240px]">
        <p className="font-medium truncate">{fallbackEmail}</p>
        <p className="text-xs text-muted-foreground">No linked user</p>
      </div>
    );
  }

  return (
    <div className="min-w-[170px] max-w-[240px] space-y-1">
      <p className="font-medium truncate">
        {user.full_name || `User #${user.id}`}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {user.email || fallbackEmail}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">#{user.id}</span>
        {user.role && (
          <Badge variant="secondary" className="text-[9px] uppercase">
            {String(user.role).replace("_", " ")}
          </Badge>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone = "primary" }) {
  const toneClass =
    tone === "green"
      ? "bg-green-500/10 text-green-600"
      : tone === "red"
      ? "bg-red-500/10 text-red-600"
      : tone === "yellow"
      ? "bg-yellow-500/10 text-yellow-600"
      : "bg-primary/10 text-primary";

  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EmailTemplatesPage() {
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await getAdminEmailNotifications({
        page,
        limit,
        notification_type:
          filters.notificationType !== "all" ? filters.notificationType : undefined,
        status: filters.status !== "all" ? filters.status : undefined,
        to_email: filters.toEmail || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
      });
      setNotifications(data.items || []);
      setSummary(data.summary || null);
      setConfig(data.config || null);
      setTotal(data.total || 0);
    } catch (error) {
      const message = error.message || "Failed to load email notifications";
      setErrorMessage(message);
      setNotifications([]);
      setSummary(null);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const summaryValues = useMemo(() => {
    const values = summary || {};
    return {
      total: values.total ?? total,
      delivered: (values.sent || 0) + (values.captured || 0),
      failed: values.failed || 0,
      mock: (values.disabled || 0) + (values.captured || 0),
    };
  }, [summary, total]);

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
            <Mail className="w-6 h-6 text-primary" />
            Emails
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor workflow email delivery logs and provider state.
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard icon={Inbox} label="Total emails" value={summaryValues.total} />
        <SummaryCard
          icon={CheckCircle2}
          label="Sent or captured"
          value={summaryValues.delivered}
          tone="green"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Failed"
          value={summaryValues.failed}
          tone="red"
        />
        <SummaryCard
          icon={Send}
          label="Disabled or mock"
          value={summaryValues.mock}
          tone="yellow"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            Provider Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p className="font-medium">{config?.provider || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email enabled</p>
            <p className="font-medium">{config?.email_enabled ? "Enabled" : "Disabled"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Environment</p>
            <p className="font-medium">{config?.environment || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">From email</p>
            <p className="font-medium truncate">{config?.from_email || "-"}</p>
          </div>
        </CardContent>
      </Card>

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
              <Label htmlFor="email-notification-type">Notification type</Label>
              <Select
                value={draftFilters.notificationType}
                onValueChange={(value) => updateDraftFilter("notificationType", value)}
              >
                <SelectTrigger id="email-notification-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-status">Status</Label>
              <Select
                value={draftFilters.status}
                onValueChange={(value) => updateDraftFilter("status", value)}
              >
                <SelectTrigger id="email-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-recipient">Recipient email</Label>
              <Input
                id="email-recipient"
                type="email"
                value={draftFilters.toEmail}
                onChange={(event) => updateDraftFilter("toEmail", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-date-from">Date from</Label>
              <Input
                id="email-date-from"
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) => updateDraftFilter("dateFrom", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-date-to">Date to</Label>
              <Input
                id="email-date-to"
                type="date"
                value={draftFilters.dateTo}
                onChange={(event) => updateDraftFilter("dateTo", event.target.value)}
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
            {total.toLocaleString()} email notification{total === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading email notifications...
            </div>
          ) : errorMessage ? (
            <div className="py-16 px-4 text-center text-sm text-destructive">
              <p>{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchNotifications}
              >
                Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No email notifications match those filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">Created</TableHead>
                    <TableHead className="w-[210px]">Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[120px]">Provider</TableHead>
                    <TableHead className="w-[120px]">Application</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide whitespace-nowrap"
                        >
                          {notificationLabel(item.notification_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <UserSummary user={item.user} fallbackEmail={item.to_email} />
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[280px] whitespace-pre-wrap break-words text-sm">
                          {item.subject}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-sm">{displayText(item.provider)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.related_application_id
                          ? `#${item.related_application_id}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[280px] whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {displayText(item.error_message)}
                        </span>
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
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Read-only Templates</CardTitle>
          <CardDescription>
            Template copy is hardcoded in backend services for this phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_PREVIEWS.map((templateName) => (
            <div
              key={templateName}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              {templateName}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
