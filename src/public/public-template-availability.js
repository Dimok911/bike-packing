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

export function shouldUseReadonlyTemplateCache({
  allowOfflineCache = false,
  templatesBlocked = false
} = {}) {
  return Boolean(allowOfflineCache || templatesBlocked);
}

export function publicTemplateOptionAccess({
  adminCatalogReadOnly = false
} = {}) {
  return {
    disabled: false,
    readonly: Boolean(adminCatalogReadOnly)
  };
}

function isLocalUnpublishedTemplate(layout) {
  return Boolean(
    layout &&
    (layout.adminDemo || layout.adminSharedSourceId || layout.adminTemplateCopy) &&
    layout.templatePublished === false
  );
}

export function canEditLocalUnpublishedTemplate({
  layout = null,
  liveAdminSession = false,
  rememberedAdminSession = false
} = {}) {
  return Boolean(
    isLocalUnpublishedTemplate(layout) &&
    (liveAdminSession || rememberedAdminSession)
  );
}

export function canEditManagedTemplate({
  layout = null,
  liveAdminSession = false,
  rememberedAdminSession = false,
  templatesBlocked = false
} = {}) {
  if (!layout || !(layout.adminDemo || layout.adminSharedSourceId || layout.adminTemplateCopy)) return false;
  if (isLocalUnpublishedTemplate(layout)) {
    return canEditLocalUnpublishedTemplate({ layout, liveAdminSession, rememberedAdminSession });
  }
  return Boolean(liveAdminSession && !templatesBlocked);
}

export function readonlyPublicTemplateOptionLabel(label, {
  readonly = false,
  marker = "🔒"
} = {}) {
  const text = String(label || "");
  if (!readonly || !text) return text;
  const prefix = `${marker} `;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
}
