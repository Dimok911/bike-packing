import { clonePlain } from "../utils/json.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function defaultNormalizeLanguage(value = "", fallback = "ru") {
  return normalizeText(value).toLowerCase() || fallback;
}

export function publicTemplateMetadataPath(target, {
  demoAdminPathForPublicListId
} = {}) {
  if (!target) return "";
  if (target.type === "demo") {
    if (typeof demoAdminPathForPublicListId !== "function") return "";
    return demoAdminPathForPublicListId("/metadata", target.demoListId || "", target.language || "");
  }
  if (target.type === "shared") {
    const sharedId = normalizeText(target.sharedId);
    return sharedId ? `/bike-packing/admin/shared-layouts/${encodeURIComponent(sharedId)}/metadata` : "";
  }
  return "";
}

export function publicTemplateDeletePath(target, {
  demoAdminPathForPublicListId
} = {}) {
  if (!target) return "";
  if (target.type === "demo") {
    if (typeof demoAdminPathForPublicListId !== "function") return "";
    return demoAdminPathForPublicListId("", target.demoListId || "", target.language || "");
  }
  if (target.type === "shared") {
    const sharedId = normalizeText(target.sharedId);
    return sharedId ? `/bike-packing/admin/shared-layouts/${encodeURIComponent(sharedId)}` : "";
  }
  return "";
}

export function publicDemoTemplateExactDeletePath(listId) {
  const id = normalizeText(listId);
  return id ? `/bike-packing/admin/demo-templates/${encodeURIComponent(id)}` : "";
}

export function publicTemplateDeleteResponseMatches(data, listId) {
  const expectedId = normalizeText(listId);
  return Boolean(expectedId && data?.deleted === true && normalizeText(data?.listId) === expectedId);
}

export function canonicalCatalogConfirmsDemoTemplateAbsent(data, listId) {
  const expectedId = normalizeText(listId);
  if (!expectedId || data?.canonical !== true || data?.unified !== true) return false;
  const records = Array.isArray(data?.lists) ? data.lists : [];
  return !records.some((record) => {
    const recordId = normalizeText(record?.id || record?.listId || record?.list_id);
    const kind = normalizeText(record?.publicTemplateKind || record?.role);
    return recordId === expectedId && (kind === "demo" || recordId === "public-demo-state" || recordId.startsWith("public-demo-state-"));
  });
}

export function publicTemplateMetadataTarget(target, {
  previousTarget = null
} = {}) {
  if (!target) return null;
  if (target.type !== "demo" || previousTarget?.type !== "demo") return target;
  const previousListId = normalizeText(previousTarget.demoListId);
  if (!previousListId) return target;
  return {
    ...target,
    demoListId: previousListId
  };
}

export function publicTemplateMetadataRequest(layout, target, {
  demoTemplate = null,
  sharedLayout = null,
  uiLanguage = "ru",
  normalizeLanguage = defaultNormalizeLanguage,
  normalizeDemoName = (name) => normalizeText(name),
  demoFallbackName = () => "Demo layout"
} = {}) {
  const fallbackLanguage = normalizeLanguage(uiLanguage);
  const language = target?.type === "demo"
    ? normalizeLanguage(layout?.adminDemoLanguage || layout?.language || target?.language || fallbackLanguage)
    : normalizeLanguage(layout?.language || sharedLayout?.language || target?.language || fallbackLanguage);
  const fallbackName = target?.type === "demo"
    ? normalizeText(demoTemplate?.name) || demoFallbackName(language)
    : normalizeText(sharedLayout?.name) || normalizeText(target?.sharedId);
  const rawName = normalizeText(layout?.name) || fallbackName;
  const name = target?.type === "demo"
    ? normalizeDemoName(rawName, language)
    : rawName;
  return {
    title: name,
    name,
    language
  };
}

export function normalizePublicTemplateMetadataResponse(data, fallback = {}, {
  normalizeLanguage = defaultNormalizeLanguage
} = {}) {
  const name = normalizeText(data?.title || data?.name || fallback.title || fallback.name);
  const language = normalizeLanguage(data?.language || fallback.language);
  return {
    name,
    title: name,
    language
  };
}

export function applyPublicTemplateMetadataToPayload(payload, {
  name = "",
  title = "",
  language = ""
} = {}) {
  if (!payload || typeof payload !== "object") return payload || null;
  const next = clonePlain(payload);
  const layouts = next.layouts && typeof next.layouts === "object" ? next.layouts : {};
  const activeLayout = layouts[next.activeLayoutId] || Object.values(layouts)[0] || null;
  if (!activeLayout || typeof activeLayout !== "object") return next;
  const metadataName = normalizeText(name || title);
  const metadataLanguage = defaultNormalizeLanguage(language, "");
  if (metadataName) activeLayout.name = metadataName;
  if (metadataLanguage) activeLayout.language = metadataLanguage;
  return next;
}
