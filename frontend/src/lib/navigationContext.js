export function isInternalPath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export function makeDetailNavigationState(from, fromLabel, returnLabel) {
  return {
    from: isInternalPath(from) ? from : null,
    fromLabel: fromLabel || null,
    returnLabel: returnLabel || (fromLabel ? `Kembali ke ${fromLabel}` : null),
  };
}

export function getSafeReturnPath(locationState, fallback = "/recruiter/candidates") {
  if (isInternalPath(locationState?.from)) return locationState.from;
  return fallback;
}

export function getReturnLabel(locationState, fallback = "Kembali") {
  if (locationState?.returnLabel) return locationState.returnLabel;
  if (locationState?.fromLabel) return `Kembali ke ${locationState.fromLabel}`;
  return fallback;
}
