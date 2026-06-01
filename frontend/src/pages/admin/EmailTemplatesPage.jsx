import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Mail,
  RotateCcw,
  Search,
} from "lucide-react";

import EmailOperationsPanel from "@/components/admin/EmailOperationsPanel";
import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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

function notificationLabel(value) {
  const known = NOTIFICATION_TYPES.find((item) => item.value === value);
  if (known) return known.label;
  return String(value || "unknown").replace(/_/g, " ");
}

function formatTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID");
}

function displayText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function UserSummary({ user, fallbackEmail }) {
  if (!user) {
    return (
      <div className="min-w-[170px] max-w-[240px]">
        <p className="truncate font-medium">{fallbackEmail || "-"}</p>
        <p className="text-xs text-muted-foreground">No linked user</p>
      </div>
    );
  }

  return (
    <div className="min-w-[170px] max-w-[240px] space-y-1">
      <p className="truncate font-medium">
        {user.full_name || `User #${user.id}`}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {user.email || fallbackEmail}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">#{user.id}</span>
        {user.role && (
          <StatusBadge label={String(user.role).replace("_", " ")} tone="brand" />
        )}
      </div>
    </div>
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
          filters.notificationType !== "all"
            ? filters.notificationType
            : undefined,
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
    Promise.resolve().then(fetchNotifications);
  }, [fetchNotifications]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const summaryValues = useMemo(() => summary || { total }, [summary, total]);

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
      <PageHeader
        eyebrow="Super Admin / Emails"
        title="Email Operations"
        description="Monitor workflow notifications, provider mode, and delivery outcomes without implying editable templates."
        status={
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
        }
      />

      <EmailOperationsPanel
        summary={summaryValues}
        config={config}
        total={total}
        loading={loading}
      />

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <Filter className="h-5 w-5 text-primary" />
            Email Filter Panel
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Filters keep the existing apply/reset behavior and send the same API
            params as before.
          </p>
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
                onValueChange={(value) =>
                  updateDraftFilter("notificationType", value)
                }
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
                <Search className="h-4 w-4" />
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={resetFilters}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl tracking-normal">
            Notification Log
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {Number(total || 0).toLocaleString()} email notifications. Page{" "}
            {page} of {totalPages}.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5">
              <LoadingState variant="table" label="Loading email notifications..." />
            </div>
          ) : errorMessage ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
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
            <div className="p-5">
              <EmptyState
                icon={Mail}
                title="No email logs yet"
                description="There are no email notifications for the current filter. This can be normal before workflows send messages."
              />
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
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimestamp(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap rounded-full text-[10px] uppercase tracking-wide"
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
                        <StatusBadge status={item.status} entityType="email" />
                      </TableCell>
                      <TableCell className="text-sm">
                        {displayText(item.provider)}
                      </TableCell>
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
    </div>
  );
}
