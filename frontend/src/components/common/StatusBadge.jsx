import { Badge } from "@/components/ui/badge";
import {
  getStatusMeta,
  STATUS_TONE_CLASS,
} from "@/lib/statusMaps";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function sizeClass(size) {
  if (size === "md") return "px-2.5 py-1 text-xs";
  if (size === "lg") return "px-3 py-1.5 text-sm";
  return "px-2 py-0.5 text-[10px]";
}

export default function StatusBadge({
  status,
  entityType = "application",
  label,
  tone,
  size = "sm",
  className,
  icon,
  uppercase = true,
}) {
  const meta = getStatusMeta(status, entityType);
  const displayTone = tone || meta.tone;
  const displayLabel = label || meta.label;
  const Icon = icon;

  return (
    <Badge
      variant="outline"
      className={cx(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border font-semibold tracking-[0.04em]",
        uppercase && "uppercase",
        sizeClass(size),
        STATUS_TONE_CLASS[displayTone] || STATUS_TONE_CLASS.neutral,
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {displayLabel}
    </Badge>
  );
}
