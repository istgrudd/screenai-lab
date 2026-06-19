export function isInternalPath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function makeDetailNavigationState(from, fromLabel, returnLabel) {
  return {
    from: isInternalPath(from) ? from : null,
    fromLabel: fromLabel || null,
    returnLabel: returnLabel || (fromLabel ? `Back to ${fromLabel}` : null),
  };
}

export function getSafeReturnPath(locationState, fallback = "/recruiter/candidates") {
  if (isInternalPath(locationState?.from)) return locationState.from;
  return fallback;
}

export function getReturnLabel(locationState, fallback = "Back") {
  if (locationState?.returnLabel) return locationState.returnLabel;
  if (locationState?.fromLabel) return `Back to ${locationState.fromLabel}`;
  return fallback;
}
