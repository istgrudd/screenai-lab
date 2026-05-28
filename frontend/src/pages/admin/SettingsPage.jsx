import { Settings } from "lucide-react";

import AdminPlaceholderPage from "@/components/admin/AdminPlaceholderPage";

export default function SettingsPage() {
  return (
    <AdminPlaceholderPage
      icon={Settings}
      title="Settings"
      description="Global operational settings placeholder for future backend support."
      pending="No settings API is available in this frontend-only phase. This page keeps the route and navigation stable without implying that settings are already configurable."
      items={[
        "Possible settings: email sender identity and notification toggles.",
        "Possible settings: analytics defaults and operational feature flags.",
      ]}
    />
  );
}
