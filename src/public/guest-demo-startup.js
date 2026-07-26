import { DEMO_SHARED_LAYOUT_ID } from "../config/constants.js";
import { looksLikeMojibakeText } from "../utils/text.js";

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

export function readableGuestDemoLayoutName(name = "", fallback = "Моя демо-укладка") {
  const text = String(name || "").trim();
  if (!text || looksLikeMojibakeText(text)) return fallback;
  return text;
}

export function guestDemoCopyLayoutName(sourceName = "", {
  fallbackName = "Demo copy",
  preferredName = "",
  normalizeName = (name) => String(name || "").trim(),
  uniqueName = null,
  exactTemplateName = false
} = {}) {
  const preferred = readableGuestDemoLayoutName(preferredName, "");
  const source = readableGuestDemoLayoutName(sourceName, fallbackName);
  const baseName = normalizeName(preferred || source) || fallbackName;
  if (exactTemplateName) return baseName;
  return uniqueName ? uniqueName(baseName) : baseName;
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
