import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIVISIONS, STATUSES } from "@/lib/recruiterWorkspace";

export default function ApplicationFilters({
  divisionFilter,
  statusFilter,
  onDivisionChange,
  onStatusChange,
  children,
}) {
  const filtered = divisionFilter !== "all" || statusFilter !== "all";

  return (
    <Card>
      <CardContent className="py-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        <Select value={divisionFilter} onValueChange={onDivisionChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIVISIONS.map((division) => (
              <SelectItem key={division.id} value={division.id}>
                {division.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onDivisionChange("all");
              onStatusChange("all");
            }}
          >
            Reset
          </Button>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
