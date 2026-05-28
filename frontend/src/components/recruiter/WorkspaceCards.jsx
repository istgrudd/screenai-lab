import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function MetricCard({ icon: Icon, label, value, tone = "primary" }) {
  const toneClass =
    tone === "green"
      ? "bg-green-500/10 text-green-600"
      : tone === "yellow"
      ? "bg-yellow-500/10 text-yellow-600"
      : tone === "red"
      ? "bg-red-500/10 text-red-600"
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

export function ShortcutCard({ icon: Icon, title, description, to, action = "Open" }) {
  return (
    <Card className="h-full">
      <CardContent className="py-5 flex flex-col h-full gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        <div className="mt-auto">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to={to}>
              {action}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
