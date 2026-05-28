import { ShieldCheck } from "lucide-react";

import AdminPlaceholderPage from "@/components/admin/AdminPlaceholderPage";

export default function AuditLogsPage() {
  return (
    <AdminPlaceholderPage
      icon={ShieldCheck}
      title="Audit Logs"
      description="Inspect recruiter and admin actions once the audit log API is available."
      pending="The audit log listing endpoint is scheduled for a later full-stack phase. This route is protected and ready for the future table, filters, and pagination."
      items={[
        "Planned filters: action type, actor, candidate, date range.",
        "Planned columns: action, actor, affected record, old/new value, reason, timestamp.",
      ]}
    />
  );
}
