import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  FileWarning,
  Filter,
  Gauge,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import MetricCard from "@/components/common/MetricCard";
import PhaseBadge from "@/components/common/PhaseBadge";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  { value: "game_tech", label: "Game Technology" },
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
    ipk_distribution: [],
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

function BarRow({ label, value, max, detail, tone = "primary" }) {
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
      ? "bg-warning"
      : tone === "destructive"
      ? "bg-destructive"
      : "bg-primary";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{label}</p>
          {detail && (
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
        <span className="font-semibold tabular-nums">{formatNumber(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: barWidth(Number(value || 0), max) }}
        />
      </div>
    </div>
  );
}

function InsightCard({ title, children }) {
  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-xl tracking-normal">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SmallStat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-4 py-3">
      <p className="font-heading text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ActivePeriodSummary({ activePeriod, summary }) {
  return (
    <Card className="brand-card">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Active Period
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-bold tracking-normal">
              {activePeriod.name}
            </h2>
            <PhaseBadge phase={activePeriod.current_phase} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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

  const selectedDivisionLabel =
    DIVISION_OPTIONS.find((item) => item.value === divisionFilter)?.label ||
    "All divisions";
  const summary = analytics?.summary || {};
  const activePeriod = analytics?.active_period;
  const documentCompleteness = analytics?.document_completeness || {};
  const evaluation = analytics?.evaluation_progress || {};
  const scoreDistribution = useMemo(
    () => analytics?.score_distribution || { buckets: [] },
    [analytics]
  );
  const demographics = useMemo(() => analytics?.demographics || {}, [analytics]);

  const applicantsByDivision = useMemo(
    () => analytics?.applicants_per_division || [],
    [analytics]
  );
  const missingDocuments = useMemo(
    () => analytics?.missing_documents_by_type || [],
    [analytics]
  );
  const funnelItems = useMemo(
    () =>
      FUNNEL_STEPS.map((step) => ({
        ...step,
        count: analytics?.funnel_counts?.[step.key] || 0,
      })),
    [analytics]
  );
  const scoreBuckets = useMemo(
    () => scoreDistribution?.buckets || [],
    [scoreDistribution]
  );
  const facultyDistribution = useMemo(
    () => demographics.faculty_distribution || [],
    [demographics]
  );
  const majorDistribution = useMemo(
    () => demographics.major_distribution || [],
    [demographics]
  );
  const yearDistribution = useMemo(
    () => demographics.year_distribution || [],
    [demographics]
  );
  const ipkDistribution = useMemo(
    () => demographics.ipk_distribution || [],
    [demographics]
  );

  const maxDivisionTotal = useMemo(
    () => maxOf(applicantsByDivision, "total"),
    [applicantsByDivision]
  );
  const maxFunnelCount = useMemo(
    () => maxOf(funnelItems, "count"),
    [funnelItems]
  );
  const maxMissingCount = useMemo(
    () => maxOf(missingDocuments, "missing_count"),
    [missingDocuments]
  );
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
  const maxIpkCount = useMemo(
    () => maxOf(ipkDistribution, "count"),
    [ipkDistribution]
  );
  const hasApplications = Number(summary.total_applications || 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Analytics"
        title="Analytics"
        description={`Active-period recruitment metrics for ${selectedDivisionLabel.toLowerCase()}.`}
        action={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={divisionFilter} onValueChange={setDivisionFilter}>
              <SelectTrigger className="w-56">
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
        }
      />

      {loading ? (
        <LoadingState label="Loading analytics..." />
      ) : !activePeriod ? (
        <EmptyState
          icon={Clock}
          title="No active recruitment period"
          description="Analytics are scoped to the active recruitment period. Create or activate a period to start collecting metrics."
        />
      ) : !hasApplications ? (
        <>
          <ActivePeriodSummary
            activePeriod={activePeriod}
            summary={summary}
          />
          <EmptyState
            icon={Users}
            title="No applications in the active period"
            description="Metrics and charts will populate here as candidates submit their applications."
          />
        </>
      ) : (
        <>
          <ActivePeriodSummary activePeriod={activePeriod} summary={summary} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={Users}
              label="Total applications"
              value={formatNumber(summary.total_applications)}
            />
            <MetricCard
              icon={ShieldCheck}
              label="Verified"
              value={formatNumber(summary.total_verified)}
              tone="success"
            />
            <MetricCard
              icon={Sparkles}
              label="Evaluated"
              value={formatNumber(summary.total_evaluated)}
              tone="success"
            />
            <MetricCard
              icon={Gauge}
              label="Average score"
              value={formatScore(summary.average_score)}
              tone="warning"
            />
            <MetricCard
              icon={FileWarning}
              label="Review or correction"
              value={formatNumber(
                Number(evaluation.document_review_blocked_count || 0) +
                  Number(evaluation.correction_blocked_count || 0)
              )}
              tone="destructive"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <InsightCard title="Applicants Per Division">
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
            <p className="py-4 text-sm text-muted-foreground">No division data.</p>
          )}
        </InsightCard>

        <InsightCard title="Funnel Counts">
          {funnelItems.map((step) => (
            <BarRow
              key={step.key}
              label={step.label}
              value={step.count}
              max={maxFunnelCount}
            />
          ))}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <InsightCard title="Document Completeness">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SmallStat label="Required docs" value={documentCompleteness.required_count || 0} />
            <SmallStat label="Complete apps" value={documentCompleteness.complete_count || 0} />
            <SmallStat label="Incomplete apps" value={documentCompleteness.incomplete_count || 0} />
          </div>
        </InsightCard>

        <InsightCard title="Missing Documents">
          {missingDocuments.length ? (
            missingDocuments.map((item) => (
              <BarRow
                key={item.doc_type}
                label={item.label || item.doc_type}
                value={item.missing_count}
                max={maxMissingCount}
                tone="warning"
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No missing document data.
            </p>
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <InsightCard title="Score Distribution">
          <div className="grid grid-cols-3 gap-3">
            <SmallStat label="Scored" value={scoreDistribution.count || 0} />
            <SmallStat label="Min" value={formatScore(scoreDistribution.min)} />
            <SmallStat label="Max" value={formatScore(scoreDistribution.max)} />
          </div>
          {scoreBuckets.length ? (
            scoreBuckets.map((bucket) => (
              <BarRow
                key={bucket.label}
                label={bucket.label}
                value={bucket.count}
                max={maxScoreBucket}
                tone="success"
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No score data.</p>
          )}
        </InsightCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <InsightCard title="Faculty Distribution">
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
            <p className="py-4 text-sm text-muted-foreground">
              No faculty distribution data.
            </p>
          )}
        </InsightCard>

        <InsightCard title="Major Distribution">
          {majorDistribution.length ? (
            majorDistribution.map((item) => (
              <BarRow
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxMajorCount}
                detail={`${formatScore(item.percentage)}% of scope`}
                tone="success"
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No major distribution data.
            </p>
          )}
        </InsightCard>

        <InsightCard title="Year Distribution">
          {yearDistribution.length ? (
            yearDistribution.map((item) => (
              <BarRow
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxYearCount}
                detail={`${formatScore(item.percentage)}% of scope`}
                tone="success"
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No year data.</p>
          )}
        </InsightCard>

        <InsightCard title="IPK Distribution">
          {ipkDistribution.length ? (
            ipkDistribution.map((item) => (
              <BarRow
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxIpkCount}
                detail={`${formatScore(item.percentage)}% of scope`}
                tone="warning"
              />
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No IPK distribution data.
            </p>
          )}
        </InsightCard>
          </div>
        </>
      )}
    </div>
  );
}
