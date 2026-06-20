import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FACULTIES, getMajorsForFaculty } from "@/lib/academicOptions";

const TRIGGER_CLASS = "h-10 w-full bg-input/70";

// Inject a non-empty current value that isn't part of the canonical list so a
// stored/legacy value still renders instead of showing blank. The backend no
// longer guards these fields, so the frontend list is the only guard and must
// degrade gracefully for data that predates it.
function withCurrentValue(options, current) {
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return options;
}

/**
 * Renders the dependent Faculty + Major selects and owns the dependency:
 * the major select is disabled until a faculty is chosen, lists only that
 * faculty's majors, and clears an incompatible major when the faculty changes.
 *
 * Layout is left to the parent — this renders two sibling field blocks so it
 * can drop straight into an existing form grid.
 */
export default function FacultyMajorSelect({
  faculty,
  major,
  onFacultyChange,
  onMajorChange,
  disabled = false,
  required = false,
  facultyLabel = <Label htmlFor="faculty">Faculty</Label>,
  majorLabel = <Label htmlFor="major">Major</Label>,
  facultyId = "faculty",
  majorId = "major",
  fieldClassName = "space-y-2",
}) {
  const majors = getMajorsForFaculty(faculty);
  const facultyOptions = withCurrentValue(FACULTIES, faculty);
  const majorOptions = withCurrentValue(majors, major);
  const majorDisabled = disabled || !faculty;

  const handleFacultyChange = (value) => {
    onFacultyChange(value);
    // Drop the current major if it doesn't belong to the new faculty.
    if (major && !getMajorsForFaculty(value).includes(major)) {
      onMajorChange("");
    }
  };

  return (
    <>
      <div className={fieldClassName}>
        {facultyLabel}
        <Select
          value={faculty || ""}
          onValueChange={handleFacultyChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={facultyId}
            aria-required={required}
            className={cn(TRIGGER_CLASS)}
          >
            <SelectValue placeholder="Select faculty" />
          </SelectTrigger>
          <SelectContent>
            {facultyOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={fieldClassName}>
        {majorLabel}
        <Select
          value={major || ""}
          onValueChange={onMajorChange}
          disabled={majorDisabled}
        >
          <SelectTrigger
            id={majorId}
            aria-required={required}
            className={cn(TRIGGER_CLASS)}
          >
            <SelectValue
              placeholder={faculty ? "Select major" : "Select a faculty first"}
            />
          </SelectTrigger>
          <SelectContent>
            {majorOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
