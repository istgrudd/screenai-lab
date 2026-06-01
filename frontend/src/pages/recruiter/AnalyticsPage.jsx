import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  Clock,
  FileWarning,
  Filter,
  Gauge,
  GraduationCap,
  Layers3,
  ListChecks,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRecruiterAnalytics } from "@/lib/api";

const DIVISION_OPTIONS = [
  { value: "all", label: "All divisions" },
  { value: "big_data", label: "Big Data" },
  { value: "cyber_security", label: "Cyber Security" },
  { value: "game_tech", label: "Game Tech" },
  { value: "gis", label: "GIS" },
];

const FUNNEL_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "document_review", label: "Document Review" },
  { key: "correction_requested", label: "Correction" },
  { key: "verified", label: "Verified" },
  { key: "screening", label: "Screening" },
  { key: "announced_pass", label: "Pass" },
  { key: "announced_fail", label: "Fail" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY_ANALYTICS = {
  active_period: null,
  summary: {},
  applicants_per_division: [],
  funnel_counts: {},
  document_completeness: {},
  missing_documents_by_type: [],
  evaluation_progress: {},
  score_distribution: { buckets: [] },
  demographics: {
    faculty_distribution: [],
    major_distribution: [],
    year_distribution: [],
  },
};

function formatNumber(value) {
  if (value === null || value === undefined) return "0";
  return Number(value).toLocaleString("en-US");
}

function formatScore(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(1);
}

function maxOf(items, key) {
  return Math.max(0, ...items.map((item) => Number(item?.[key] || 0)));
}

function barWidth(value, max) {
  if (!max || value <= 0) return "0%";
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
}

function BarRow({ label, value, max, detail }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium truncate">{label}</p>
          {detail && (
            <p className="text-xs text-muted-foreground truncate">{detail}</p>
          )}
        </div>
        <span className="font-semibold tabular-nums">{formatNumber(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: barWidth(Number(value || 0), max) }}
        />
      </div>
    </div>
  );
}

function StatPill({ label, value, icon: Icon, format = formatNumber }) {
  return (
    <div className="rounded-lg border px-3 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums leading-none">
          {format(value)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Loading analytics
    </div>
  );
}

export default function RecruiterAnalyticsPage() {
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getRecruiterAnalytics({ division: divisionFilter });
        if (!cancelled) setAnalytics(data || EMPTY_ANALYTICS);
      } catch (error) {
        if (!cancelled) setAnalytics(EMPTY_ANALYTICS);
        toast.error(error.message || "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [divisionFilter]);

  const summary = analytics?.summary || {};
  const activePeriod = analytics?.active_period;
  const documentCompleteness = analytics?.document_completeness || {};
  const evaluation = analytics?.evaluation_progress || {};
  const scoreDistribution = analytics?.score_distribution || { buckets: [] };
  const demographics = analytics?.demographics || {};
  const applicantsByDivision = analytics?.applicants_per_division || [];
  const missingDocuments = analytics?.missing_documents_by_type || [];
  const funnelCounts = analytics?.funnel_counts || {};
  const facultyDistribution = demographics.faculty_distribution || [];
  const majorDistribution = demographics.major_distribution || [];
  const yearDistribution = demographics.year_distribution || [];

  const maxDivisionTotal = useMemo(
    () => maxOf(applicantsByDivision, "total"),
    [applicantsByDivision]
  );
  const funnelItems = useMemo(
    () =>
      FUNNEL_STEPS.map((step) => ({
        ...step,
        count: funnelCounts?.[step.key] || 0,
      })),
    [funnelCounts]
  );
  const maxFunnelCount = useMemo(
    () => maxOf(funnelItems, "count"),
    [funnelItems]
  );
  const maxMissingCount = useMemo(
    () => maxOf(missingDocuments, "missing_count"),
    [missingDocuments]
  );
  const scoreBuckets = scoreDistribution?.buckets || [];
  const maxScoreBucket = useMemo(
    () => maxOf(scoreBuckets, "count"),
    [scoreBuckets]
  );
  const maxFacultyCount = useMemo(
    () => maxOf(facultyDistribution, "count"),
    [facultyDistribution]
  );
  const maxMajorCount = useMemo(
    () => maxOf(majorDistribution, "count"),
    [majorDistribution]
  );
  const maxYearCount = useMemo(
    () => maxOf(yearDistribution, "count"),
    [yearDistribution]
  );

  const selectedDivisionLabel =
    DIVISION_OPTIONS.find((item) => item.value === divisionFilter)?.label ||
    "All divisions";
  const hasApplications = Number(summary.total_applications || 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Active-period recruitment metrics for {selectedDivisionLabel.toLowerCase()}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent align="end">
              {DIVISION_OPTIONS.map((division) => (
                <SelectItem key={division.value} value={division.value}>
                  {division.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activePeriod ? (
        <Card>
          <CardContent className="py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active period</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{activePeriod.name}</h2>
                <Badge variant="secondary">{activePeriod.current_phase}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Threshold</p>
                <p className="font-semibold tabular-nums">
                  {activePeriod.threshold_n ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Applications</p>
                <p className="font-semibold tabular-nums">
                  {formatNumber(summary.total_applications)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-semibold tabular-nums">
                  {formatNumber(summary.submitted_or_later)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Average score</p>
                <p className="font-semibold tabular-nums">
                  {formatScore(summary.average_score)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">No active recruitment period</p>
              <p className="text-sm text-muted-foreground mt-1">
                Analytics are scoped to the active period, so all metrics are zero.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <LoadingBlock />}

      {!loading && activePeriod && !hasApplications && (
        <Card className="border-dashed">
          <CardContent className="py-6 flex items-start gap-3">
            <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">No applications in the active period</p>
              <p className="text-sm text-muted-foreground mt-1">
                The dashboard is ready and will populate as candidates submit applications.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          icon={Users}
          label="Total applications"
          value={loading ? "..." : formatNumber(summary.total_applications)}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Verified"
          value={loading ? "..." : formatNumber(summary.total_verified)}
          tone="green"
        />
        <MetricCard
          icon={Sparkles}
          label="Evaluated"
          value={loading ? "..." : formatNumber(summary.total_evaluated)}
          tone="green"
        />
        <MetricCard
          icon={Gauge}
          label="Average score"
          value={loading ? "..." : formatScore(summary.average_score)}
          tone="yellow"
        />
        <MetricCard
          icon={FileWarning}
          label="Review or correction"
          value={
            loading
              ? "..."
              : formatNumber(
                  Number(evaluation.document_review_blocked_count || 0) +
                    Number(evaluation.correction_blocked_count || 0)
                )
          }
          tone="red"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Applicants Per Division
            </CardTitle>
            <CardDescription>
              Overview remains unfiltered so division comparisons stay visible.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {applicantsByDivision.length ? (
              applicantsByDivision.map((item) => (
                <BarRow
                  key={item.division}
                  label={item.label || item.division}
                  value={item.total}
                  max={maxDivisionTotal}
                  detail={`${formatNumber(item.submitted_or_later)} submitted or later`}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No division data.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-primary" />
              Funnel Counts
            </CardTitle>
            <CardDescription>
              Application status distribution in the selected scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {funnelItems.map((step) => (
              <BarRow
                key={step.key}
                label={step.label}
                value={step.count}
                max={maxFunnelCount}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Distribusi Angkatan
            </CardTitle>
            <CardDescription>
              Year distribution for submitted or later applications in scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {yearDistribution.length ? (
              yearDistribution.map((item) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxYearCount}
                  detail={`${formatScore(item.percentage)}% of scope`}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                Belum ada data angkatan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Distribusi Fakultas
            </CardTitle>
            <CardDescription>
              Faculty distribution for submitted or later applications in scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {facultyDistribution.length ? (
              facultyDistribution.map((item) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxFacultyCount}
                  detail={`${formatScore(item.percentage)}% of scope`}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No faculty distribution data.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Distribusi Jurusan
            </CardTitle>
            <CardDescription>
              Major distribution for submitted or later applications in scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {majorDistribution.length ? (
              majorDistribution.map((item) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxMajorCount}
                  detail={`${formatScore(item.percentage)}% of scope`}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No major distribution data.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              Document Completeness
            </CardTitle>
            <CardDescription>
              Based on required uploaded document types in the selected scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Average completion</span>
                <span className="font-semibold tabular-nums">
                  {formatNumber(documentCompleteness.average_completion_pct)}%
                </span>
              </div>
              <Progress
                value={Number(documentCompleteness.average_completion_pct || 0)}
                className="h-2"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatPill
                icon={ListChecks}
                label="Required docs"
                value={documentCompleteness.required_count || 0}
              />
              <StatPill
                icon={ShieldCheck}
                label="Complete apps"
                value={documentCompleteness.complete_count || 0}
              />
              <StatPill
                icon={FileWarning}
                label="Incomplete apps"
                value={documentCompleteness.incomplete_count || 0}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-primary" />
              Missing Documents
            </CardTitle>
            <CardDescription>
              Missing required document counts by document type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {missingDocuments.length ? (
              missingDocuments.map((item) => (
                <BarRow
                  key={item.doc_type}
                  label={item.label || item.doc_type}
                  value={item.missing_count}
                  max={maxMissingCount}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No missing document data.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Evaluation Progress
            </CardTitle>
            <CardDescription>
              Evaluation readiness and blocked application counts.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatPill
              icon={ShieldCheck}
              label="Eligible"
              value={evaluation.eligible_for_evaluation || 0}
            />
            <StatPill
              icon={Sparkles}
              label="Evaluated"
              value={evaluation.evaluated_count || 0}
            />
            <StatPill
              icon={Clock}
              label="Pending"
              value={evaluation.pending_evaluation_count || 0}
            />
            <StatPill
              icon={FileWarning}
              label="Correction blocked"
              value={evaluation.correction_blocked_count || 0}
            />
            <StatPill
              icon={ClipboardCheck}
              label="Document review"
              value={evaluation.document_review_blocked_count || 0}
            />
            <StatPill
              icon={Gauge}
              label="Errors"
              value={evaluation.error_count || 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Score Distribution
            </CardTitle>
            <CardDescription>
              Composite score buckets for evaluated applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatPill icon={Users} label="Scored" value={scoreDistribution.count || 0} />
              <StatPill
                icon={Gauge}
                label="Min"
                value={scoreDistribution.min}
                format={formatScore}
              />
              <StatPill
                icon={Gauge}
                label="Max"
                value={scoreDistribution.max}
                format={formatScore}
              />
            </div>
            <div className="space-y-4">
              {scoreBuckets.length ? (
                scoreBuckets.map((bucket) => (
                  <BarRow
                    key={bucket.label}
                    label={bucket.label}
                    value={bucket.count}
                    max={maxScoreBucket}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No score data.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
