import { Badge } from "@/components/ui/badge";
import {
  getPhaseMeta,
  PHASE_TONE_CLASS,
} from "@/lib/phaseMaps";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function sizeClass(size) {
  if (size === "md") return "px-2.5 py-1 text-xs";
  if (size === "lg") return "px-3 py-1.5 text-sm";
  return "px-2 py-0.5 text-[10px]";
}

export default function PhaseBadge({
  phase,
  label,
  tone,
  size = "sm",
  className,
  uppercase = true,
}) {
  const meta = getPhaseMeta(phase);
  const displayTone = tone || meta.tone;
  const displayLabel = label || meta.label;

  return (
    <Badge
      variant="outline"
      className={cx(
        "inline-flex w-fit items-center rounded-full border font-semibold tracking-[0.04em]",
        uppercase && "uppercase",
        sizeClass(size),
        PHASE_TONE_CLASS[displayTone] || PHASE_TONE_CLASS.neutral,
        className
      )}
    >
      {displayLabel}
    </Badge>
  );
}
