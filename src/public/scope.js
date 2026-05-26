import {
  DEMO_ITEM_KEY,
  DEMO_SHARED_LAYOUT_ID,
  GUEST_DEMO_COPY_FLAG,
  PUBLIC_LEGACY_RECORD_SOURCE,
  SHARED_ITEM_KEY_PREFIX,
  VIEW_SCOPE_DEMO,
  VIEW_SCOPE_SHARED
} from "../config/constants.js";
import { normalizeUiLanguage } from "../utils/language.js";

const DEMO_PUBLIC_DEFAULT_LANGUAGE = "ru";

export function isPublishedLayoutEditable(layout) {
  return Boolean(layout?.adminDemo || layout?.adminSharedSourceId);
}

export function isGuestDemoCopyLayoutRecord(layout) {
  return Boolean(layout?.[GUEST_DEMO_COPY_FLAG]);
}

export function hasGuestDemoCopyLayoutRecord(layouts) {
  return Object.values(layouts || {}).some(isGuestDemoCopyLayoutRecord);
}

export function isReadOnlyScope(modeState) {
  return [VIEW_SCOPE_DEMO, VIEW_SCOPE_SHARED].includes(modeState?.viewScope) && Boolean(modeState?.readonlyLayoutId);
}

export function activeReadOnlyLayoutIdFromScope(modeState) {
  return modeState?.readonlyLayoutId || modeState?.sharedLayoutId || "";
}

export function isDemoItemKey(itemKey) {
  const key = String(itemKey || "").trim();
  return key === DEMO_ITEM_KEY ||
    key.startsWith(`${DEMO_ITEM_KEY}:`) ||
    key.startsWith(`${DEMO_ITEM_KEY}-`);
}

export function isReadOnlyItemKey(itemKey) {
  return isDemoItemKey(itemKey);
}

export function isReadOnlyBikePackingRecord(record) {
  if (!record || typeof record !== "object") return false;
  const itemKey = String(record.itemKey || record.item_key || record.key || "").trim();
  const visibility = String(record.visibility || record.listVisibility || record.list_visibility || "").trim().toLowerCase();
  const source = String(record.source || record.recordSource || record.record_source || "").trim();
  return isDemoItemKey(itemKey) ||
    visibility === "public" ||
    source === PUBLIC_LEGACY_RECORD_SOURCE;
}

export function shouldClearPackingListContextForPrivateMutation({ listId = "", record = null, isPublicTemplateListId = () => false } = {}) {
  return Boolean(isPublicTemplateListId(listId) || isReadOnlyBikePackingRecord(record));
}

export function createReadOnlyBikePackingError() {
  const error = new Error("Demo/public bike-packing is read-only; create a private copy before saving.");
  error.code = "bike_packing_read_only";
  error.readOnlyBikePacking = true;
  return error;
}

export function isReadOnlyBikePackingError(error) {
  return Boolean(error?.readOnlyBikePacking || error?.code === "bike_packing_read_only");
}

export function demoLanguageSuffix(language) {
  const normalized = normalizeUiLanguage(language);
  return normalized === DEMO_PUBLIC_DEFAULT_LANGUAGE ? "" : normalized;
}

export function demoItemKeyForLanguage(language) {
  const suffix = demoLanguageSuffix(language);
  return suffix ? `${DEMO_ITEM_KEY}:${suffix}` : DEMO_ITEM_KEY;
}

export function demoAdminIdForLanguage(language) {
  const suffix = demoLanguageSuffix(language);
  return suffix || DEMO_ITEM_KEY;
}

export function demoPublicListIdForLanguage(language) {
  const suffix = demoLanguageSuffix(language);
  return suffix ? `public-demo-state-${suffix}` : "public-demo-state";
}

export function demoAdminIdForPublicListId(listId, language) {
  const id = String(listId || "").trim();
  if (id === "public-demo-state") return DEMO_ITEM_KEY;
  if (id.startsWith("public-demo-state-")) return id.slice("public-demo-state-".length) || demoAdminIdForLanguage(language);
  return demoAdminIdForLanguage(language);
}

export function demoPublicListIdForAdminId(adminId, language) {
  const id = String(adminId || "").trim();
  if (!id || id === DEMO_ITEM_KEY) return demoPublicListIdForLanguage(language);
  if (id.startsWith("public-demo-state-")) return id;
  return `public-demo-state-${id}`;
}

export function demoAdminPathForLanguage(suffix = "", language) {
  const adminId = demoAdminIdForLanguage(language);
  if (adminId === DEMO_ITEM_KEY) return `/bike-packing/admin/demo-state${suffix}`;
  return `/bike-packing/admin/demo-states/${encodeURIComponent(adminId)}${suffix}`;
}

export function demoAdminPathForPublicListId(suffix = "", listId = "", language) {
  const adminId = demoAdminIdForPublicListId(listId, language);
  if (adminId === DEMO_ITEM_KEY) return `/bike-packing/admin/demo-state${suffix}`;
  return `/bike-packing/admin/demo-states/${encodeURIComponent(adminId)}${suffix}`;
}

export function demoAdminStatePathForLanguage(language) {
  const adminId = demoAdminIdForLanguage(language);
  if (adminId === DEMO_ITEM_KEY) return "/bike-packing/admin/demo-state";
  return demoAdminPathForLanguage("/state", language);
}

export function demoAdminStatePathForPublicListId(listId = "", language) {
  return demoAdminPathForPublicListId("/state", listId, language);
}

export function sharedLayoutItemKey(layoutId, language) {
  return layoutId === DEMO_SHARED_LAYOUT_ID ? demoItemKeyForLanguage(language) : `${SHARED_ITEM_KEY_PREFIX}${layoutId}`;
}
