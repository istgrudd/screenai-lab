import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALLOWED_YEARS } from "@/lib/academicOptions";

const TRIGGER_CLASS = "h-10 w-full bg-input/70";

// Keep a stored/legacy year visible even if it's no longer an allowed intake.
function withCurrentYear(years, current) {
  if (current && !years.includes(current)) {
    return [current, ...years];
  }
  return years;
}

/**
 * Year (angkatan) select sourced from ALLOWED_YEARS. Emits the chosen value as
 * a number so the form payload stays `year: int` for the backend.
 */
export default function YearSelect({
  id = "year",
  value,
  onChange,
  disabled = false,
  required = false,
  className,
}) {
  const current =
    value === null || value === undefined || value === "" ? "" : String(value);
  const options = withCurrentYear(
    ALLOWED_YEARS.map(String),
    current
  );

  return (
    <Select
      value={current}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-required={required}
        className={cn(TRIGGER_CLASS, className)}
      >
        <SelectValue placeholder="Select year" />
      </SelectTrigger>
      <SelectContent>
        {options.map((year) => (
          <SelectItem key={year} value={year}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
