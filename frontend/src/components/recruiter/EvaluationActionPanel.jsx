import { AlertTriangle, Play, RotateCw, Sparkles } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORKFLOW_DIVISIONS } from "@/lib/recruiterWorkspace";

export default function EvaluationActionPanel({
  selectedDivision,
  onDivisionChange,
  activePeriod,
  summary,
  canReEvaluate,
  evaluating,
  onRun,
  onReRun,
}) {
  const phase = activePeriod?.current_phase || null;
  const phaseWarn = activePeriod && phase !== "EVALUATION";

  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Evaluation Control
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 font-heading text-xl tracking-normal">
              <Sparkles className="h-5 w-5 text-primary" />
              Run by Division
            </CardTitle>
          </div>
          {phase && <PhaseBadge phase={phase} size="md" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {phaseWarn && (
          <div className="flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3 text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-6">
              Evaluation is being run outside the official evaluation window.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Division
            </p>
            <Select
              value={selectedDivision}
              onValueChange={onDivisionChange}
              disabled={evaluating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a division" />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_DIVISIONS.map((division) => (
                  <SelectItem key={division.id} value={division.id}>
                    {division.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => onRun?.()}
            disabled={evaluating || !selectedDivision}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run Evaluation
          </Button>
          {canReEvaluate && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onReRun?.()}
              disabled={evaluating || !selectedDivision}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              Re-evaluate All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Applications</p>
            <p className="font-heading text-xl font-bold">{summary?.applicationCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Evaluated</p>
            <p className="font-heading text-xl font-bold">{summary?.scoredCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-heading text-xl font-bold">{summary?.pendingEvaluationCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Threshold N</p>
            <p className="font-heading text-xl font-bold">{activePeriod?.threshold_n ?? "-"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
