const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function shouldReportConnectionFailure({ mode = "auto", method = "GET" } = {}) {
  const normalizedMode = String(mode || "auto").trim().toLowerCase();
  if (normalizedMode === "background") return false;
  if (normalizedMode === "foreground") return true;
  const normalizedMethod = String(method || "GET").trim().toUpperCase() || "GET";
  return !READ_ONLY_METHODS.has(normalizedMethod);
}
