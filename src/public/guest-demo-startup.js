import { DEMO_SHARED_LAYOUT_ID } from "../config/constants.js";

export function shouldRenderGuestDemoPreviewDuringAuthCheck({
  currentUser,
  forcedOffline,
  sharedListRoute,
  hadAuthoritativeLocalStateAtStartup
} = {}) {
  return !currentUser &&
    !forcedOffline &&
    !sharedListRoute &&
    !hadAuthoritativeLocalStateAtStartup;
}

export function ensureGuestDemoPreviewPayload({
  language,
  getPayload,
  setPayload,
  createPayload
} = {}) {
  if (!getPayload?.(language)) {
    setPayload?.(language, createPayload?.(language));
    return true;
  }
  return false;
}

export function isStartupGuestDemoPreview({
  initialRemoteLoadPending,
  currentUser,
  readOnlyStateScope,
  activeReadOnlyLayoutId
} = {}) {
  return Boolean(initialRemoteLoadPending) &&
    !currentUser &&
    Boolean(readOnlyStateScope) &&
    activeReadOnlyLayoutId === DEMO_SHARED_LAYOUT_ID;
}

export function shouldKeepReadonlyDemoAfterAuthCheck(context = {}) {
  return Boolean(context.readOnlyStateScope) && !isStartupGuestDemoPreview(context);
}

export function looksLikeMojibakeText(value = "") {
  const text = String(value || "");
  if (!text) return false;
  return /(?:Р.|С.|Ð|Ñ|�)/.test(text);
}

export function readableGuestDemoLayoutName(name = "", fallback = "Моя демо-укладка") {
  const text = String(name || "").trim();
  if (!text || looksLikeMojibakeText(text)) return fallback;
  return text;
}

export function guestDemoCopyLayoutName(sourceName = "", {
  fallbackName = "Demo copy",
  normalizeName = (name) => String(name || "").trim(),
  uniqueName = null,
  exactTemplateName = false
} = {}) {
  const baseName = normalizeName(readableGuestDemoLayoutName(sourceName, fallbackName)) || fallbackName;
  if (exactTemplateName) return baseName;
  return uniqueName ? uniqueName(baseName) : baseName;
}

export function shouldImportGuestLayoutBeforeRemote({
  candidate,
  remoteStateMeaningful,
  localStateCanOverrideRemote
} = {}) {
  return Boolean(candidate?.sourceState && candidate.layoutId) &&
    !remoteStateMeaningful &&
    !localStateCanOverrideRemote;
}

export function guestDemoStartupAction({
  forcePublicScope = false,
  preferLocalCopy = false,
  allowAutomaticLocalCopy = false,
  canUsePrivateState = false,
  syncDirty = false,
  hadAuthoritativeLocalStateAtStartup = false,
  suspiciousEmptyState = false
} = {}) {
  if (forcePublicScope) return "readonly";
  if (preferLocalCopy && allowAutomaticLocalCopy && !canUsePrivateState) return "copy";
  if (!syncDirty || !hadAuthoritativeLocalStateAtStartup || suspiciousEmptyState) return "readonly";
  return "keep";
}
