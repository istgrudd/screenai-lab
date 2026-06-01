import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

import AuditTimelineCard from "@/components/admin/AuditTimelineCard";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  { value: "user_role_update", label: "User role update" },
  { value: "user_deactivated", label: "User deactivated" },
  { value: "period_closed", label: "Period closed" },
];

const LIMIT_OPTIONS = [10, 20, 50, 100];

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
    Promise.resolve().then(fetchLogs);
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
      <PageHeader
        eyebrow="Super Admin / Audit"
        title="Audit Logs"
        description="Trace recruiter and admin actions with emphasis on sensitive operational changes."
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

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <Filter className="h-5 w-5 text-primary" />
            Audit Filter Panel
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Draft filters are applied only when you press Apply, preserving the
            existing filter workflow.
          </p>
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

      <AuditTimelineCard
        logs={logs}
        total={total}
        page={page}
        totalPages={totalPages}
        loading={loading}
        errorMessage={errorMessage}
        onRetry={fetchLogs}
      />

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
