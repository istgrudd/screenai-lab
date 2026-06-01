import { Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { id: "all", label: "All roles" },
  { id: "candidate", label: "Candidate" },
  { id: "recruiter", label: "Recruiter" },
  { id: "super_admin", label: "Super Admin" },
];

export default function UserManagementPanel({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  onSearchSubmit,
  total,
  page,
  totalPages,
}) {
  return (
    <Card className="brand-card">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold tracking-normal">
                User Management Safety
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Self account protection remains active. Deactivation and
                assisted password reset require confirmation before API calls.
              </p>
            </div>
          </div>

          <form
            onSubmit={onSearchSubmit}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search by name, email, or NIM"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
            <Select value={roleFilter} onValueChange={onRoleFilterChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </form>
        </div>

        <div className="rounded-xl bg-surface-container-low px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Current Result
          </p>
          <p className="mt-2 font-heading text-3xl font-bold tabular-nums">
            {Number(total || 0).toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
