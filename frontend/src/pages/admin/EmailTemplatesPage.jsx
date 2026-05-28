import { Mail } from "lucide-react";

import AdminPlaceholderPage from "@/components/admin/AdminPlaceholderPage";

export default function EmailTemplatesPage() {
  return (
    <AdminPlaceholderPage
      icon={Mail}
      title="Email Templates"
      description="Prepare the workspace for future configurable notification copy."
      pending="Email templates are intentionally hardcoded in the backend first. Editable database-backed templates are deferred until the email notification lifecycle is stable."
      items={[
        "Planned templates: verification, forgot password, document rejection, announcement.",
        "Initial UI remains read-only until backend template endpoints exist.",
      ]}
    />
  );
}
