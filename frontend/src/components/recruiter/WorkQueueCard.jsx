import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  FileSearch,
  Megaphone,
  RotateCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function countBy(applications, predicate) {
  return (applications || []).filter(predicate).length;
}

function queueItems(applications = []) {
  const evaluated = countBy(applications, (app) => app.evaluation?.composite_score != null);
  return [
    {
      key: "submitted",
      label: "Applications submitted",
      count: countBy(applications, (app) => app.status === "submitted"),
      description: "New applications ready to enter document review.",
      tone: "info",
      to: "/recruiter/applications",
    },
    {
      key: "documents",
      label: "Documents pending review",
      count: countBy(applications, (app) => app.status === "document_review" || app.status === "submitted"),
      description: "Candidates waiting for document verification.",
      tone: "warning",
      to: "/recruiter/documents",
    },
    {
      key: "correction",
      label: "Correction requested",
      count: countBy(applications, (app) => app.status === "correction_requested"),
      description: "Candidates still blocked by document corrections.",
      tone: "destructive",
      to: "/recruiter/documents",
    },
    {
      key: "ready",
      label: "Ready for evaluation",
      count: countBy(applications, (app) => app.status === "verified"),
      description: "Verified candidates eligible for evaluation.",
      tone: "success",
      to: "/recruiter/evaluation",
    },
    {
      key: "pending",
      label: "Pending evaluation",
      count: countBy(applications, (app) => app.status === "verified" && app.evaluation?.composite_score == null),
      description: "Verified candidates without evaluation scores.",
      tone: "warning",
      to: "/recruiter/evaluation",
    },
    {
      key: "announcement",
      label: "Ready for announcement",
      count: evaluated,
      description: "Evaluated candidates available for pass/fail publishing.",
      tone: "brand",
      to: "/recruiter/announcements",
    },
  ];
}

function QueueIcon({ queueKey, className }) {
  if (queueKey === "submitted") return <ClipboardList className={className} />;
  if (queueKey === "documents") return <FileSearch className={className} />;
  if (queueKey === "correction") return <ShieldAlert className={className} />;
  if (queueKey === "ready") return <Sparkles className={className} />;
  if (queueKey === "pending") return <RotateCw className={className} />;
  return <Megaphone className={className} />;
}

function toneClass(tone) {
  if (tone === "success") return "bg-success/10 text-success";
  if (tone === "warning") return "bg-warning/10 text-warning";
  if (tone === "destructive") return "bg-destructive/10 text-destructive";
  if (tone === "info") return "bg-info/10 text-info";
  return "bg-primary/10 text-primary";
}

export default function WorkQueueCard({ applications = [], className }) {
  const items = queueItems(applications);

  return (
    <Card className={`brand-card ${className || ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-xl tracking-normal">Work Queue</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Prioritized recruiter work across document review, evaluation, and announcements.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => {
          return (
            <Link
              key={item.key}
              to={item.to}
              className="group rounded-xl bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container-high"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass(item.tone)}`}>
                  <QueueIcon queueKey={item.key} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <span className="font-heading text-xl font-bold tabular-nums text-foreground">
                      {item.count}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
        <div className="lg:col-span-2 flex justify-end pt-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/recruiter/applications">
              Open full application list
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
