import { Check } from "lucide-react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function defaultKey(step, index) {
  if (typeof step === "string") return step;
  return step?.key || step?.id || step?.label || String(index);
}

function defaultLabel(step) {
  if (typeof step === "string") return step;
  return step?.label || step?.title || step?.key || step?.id || "Step";
}

function completedSetFrom(value) {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : [value]);
}

function stepState({ key, index, activeIndex, completedSet }) {
  if (completedSet.has(key)) return "completed";
  if (index === activeIndex) return "active";
  if (activeIndex > -1 && index < activeIndex) return "completed";
  return "upcoming";
}

function markerClass(state) {
  if (state === "completed") return "border-success bg-success text-success-foreground";
  if (state === "active") return "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-navy)]";
  return "border-border bg-surface-container-highest text-muted-foreground";
}

function connectorClass(state) {
  if (state === "completed") return "bg-success";
  if (state === "active") return "bg-primary";
  return "bg-surface-container-highest";
}

export default function StepTrack({
  steps = [],
  currentStep,
  completedSteps,
  orientation = "horizontal",
  className,
  getKey,
  getLabel,
}) {
  if (!steps.length) return null;

  const keyForStep = getKey || defaultKey;
  const labelForStep = getLabel || defaultLabel;
  const completedSet = completedSetFrom(completedSteps);
  const currentKey =
    typeof currentStep === "object" && currentStep !== null
      ? keyForStep(currentStep, -1)
      : currentStep;
  const activeIndex = steps.findIndex((step, index) => keyForStep(step, index) === currentKey);
  const vertical = orientation === "vertical";

  return (
    <div
      className={cx(
        vertical ? "space-y-4" : "flex items-start justify-between gap-2",
        className
      )}
    >
      {steps.map((step, index) => {
        const key = keyForStep(step, index);
        const label = labelForStep(step, index);
        const description = typeof step === "object" ? step.description : null;
        const Icon = typeof step === "object" ? step.icon : null;
        const state = stepState({ key, index, activeIndex, completedSet });
        const connectorState = state === "completed" ? "completed" : "upcoming";
        const isLast = index === steps.length - 1;

        if (vertical) {
          return (
            <div key={key} className="relative flex gap-3">
              {!isLast && (
                <div className={cx("absolute left-5 top-11 h-[calc(100%-1.5rem)] w-1 rounded-full", connectorClass(connectorState))} />
              )}
              <div
                className={cx(
                  "z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                  markerClass(state)
                )}
                aria-current={state === "active" ? "step" : undefined}
              >
                {state === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : Icon ? (
                  <Icon className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </div>
              <div className="min-w-0 pb-2">
                <p className={cx("text-sm font-semibold", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
                  {label}
                </p>
                {description && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={key} className="relative flex flex-1 flex-col items-center text-center">
            {!isLast && (
              <div className={cx("absolute left-1/2 top-5 h-1 w-full rounded-full", connectorClass(connectorState))} />
            )}
            <div
              className={cx(
                "z-10 flex h-10 w-10 items-center justify-center rounded-full border-2",
                markerClass(state)
              )}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "completed" ? (
                <Check className="h-4 w-4" />
              ) : Icon ? (
                <Icon className="h-4 w-4" />
              ) : (
                <span className="text-xs font-bold">{index + 1}</span>
              )}
            </div>
            <div className="mt-3 max-w-[9rem] px-1">
              <p className={cx("text-sm font-semibold", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
                {label}
              </p>
              {description && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
