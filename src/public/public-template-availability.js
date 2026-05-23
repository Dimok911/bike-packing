export function isNetworkUnavailable({
  forcedOffline = false,
  hasNavigatorOnline = false,
  navigatorOnline = true
} = {}) {
  return Boolean(forcedOffline || (hasNavigatorOnline && !navigatorOnline));
}

export function publishedTemplateBlockReason({
  forcedOffline = false,
  hasNavigatorOnline = false,
  navigatorOnline = true,
  language = "ru"
} = {}) {
  if (!isNetworkUnavailable({ forcedOffline, hasNavigatorOnline, navigatorOnline })) return "";
  const english = String(language || "").trim().toLowerCase() === "en";
  if (forcedOffline) {
    return english
      ? "Templates are blocked in forced offline mode."
      : "Шаблоны заблокированы в принудительном офлайн-режиме.";
  }
  return english
    ? "Templates are blocked while there is no internet connection."
    : "Шаблоны заблокированы, пока нет интернета.";
}
