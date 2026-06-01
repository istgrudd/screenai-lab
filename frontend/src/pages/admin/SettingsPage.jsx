import { Settings } from "lucide-react";

import AdminPlaceholderPage from "@/components/admin/AdminPlaceholderPage";

export default function SettingsPage() {
  return (
    <AdminPlaceholderPage
      icon={Settings}
      title="Settings"
      description="System settings placeholder for future backend-supported controls."
      pending="No settings API is available in this phase. This page keeps the route and navigation stable without implying that settings can be saved today."
      items={[
        "Recruitment defaults",
        "Email provider",
        "Evaluation parameters",
        "Access control",
      ]}
    />
  );
}
