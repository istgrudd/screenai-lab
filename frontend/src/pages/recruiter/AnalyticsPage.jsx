import { BarChart3, Clock, FileText, PieChart, Users } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PLANNED_METRICS = [
  {
    title: "Applicants per division",
    description: "Counts scoped to the active recruitment period.",
    icon: Users,
  },
  {
    title: "Recruitment funnel",
    description: "Draft, submitted, review, screening, and announcement states.",
    icon: PieChart,
  },
  {
    title: "Document completeness",
    description: "Missing document counts and completion percentage.",
    icon: FileText,
  },
  {
    title: "Evaluation progress",
    description: "Pending, evaluated, and announced candidate counts.",
    icon: Clock,
  },
];

export default function RecruiterAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Analytics will be connected after the backend analytics API phase.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Backend API pending</CardTitle>
          <CardDescription>
            This page intentionally does not display fake metrics. It is the stable route and layout placeholder for Phase 9.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PLANNED_METRICS.map((metric) => (
            <div key={metric.title} className="rounded-lg border px-4 py-3 flex gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <metric.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{metric.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metric.description}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
