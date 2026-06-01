import { createElement } from "react";
import { Clock } from "lucide-react";

import ActionCard from "@/components/common/ActionCard";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/layout/PageHeader";

export default function AdminPlaceholderPage({
  icon: Icon = Clock,
  title,
  description,
  pending,
  items = [],
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin"
        title={title}
        description={description}
        status={
          <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-warning">
            {createElement(Icon, { className: "h-3.5 w-3.5" })}
            Backend pending
          </span>
        }
      />

      <EmptyState
        icon={Icon}
        title="Backend support pending"
        description={pending}
        className="border-dashed"
      />

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item) => (
            <ActionCard
              key={item}
              icon={Clock}
              title={item}
              description="Planned setting only. No save action is available until the backend exposes a supported API."
              tone="info"
            />
          ))}
        </div>
      )}
    </div>
  );
}
