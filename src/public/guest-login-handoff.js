import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../state/layout-ops.js";

export const GUEST_LOGIN_HANDOFF_VERSION = 2;
export const GUEST_LOGIN_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

const NON_CONTENT_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "editedAt",
  "lastModifiedAt",
  "createdByDeviceId",
  "editedByDeviceId",
  "sourceDeviceId"
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableContentValue(value) {
  if (Array.isArray(value)) return value.map(stableContentValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => !NON_CONTENT_KEYS.has(key))
    .sort()
    .map((key) => [key, stableContentValue(value[key])]));
}

function randomGuestSessionId({
  nowMs = Date.now(),
  random = Math.random,
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
} = {}) {
  if (typeof randomUUID === "function") {
    try {
      const value = String(randomUUID() || "").trim();
      if (value) return value;
    } catch {
      // Fall through to a local non-secret identifier.
    }
  }
  return `guest-${Math.max(0, Number(nowMs) || 0).toString(36)}-${Math.floor(random() * 0x100000000).toString(36)}`;
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem?.(key));
  } catch {
    return null;
  }
}

function removeStoredValue(storage, key) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

export function normalizeGuestWorkspaceManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Number(value.version) !== GUEST_LOGIN_HANDOFF_VERSION
  ) {
    return {
      version: GUEST_LOGIN_HANDOFF_VERSION,
      sessionId: "",
      layoutIds: [],
      updatedAt: ""
    };
  }
  return {
    version: GUEST_LOGIN_HANDOFF_VERSION,
    sessionId: String(value.sessionId || "").trim(),
    layoutIds: uniqueIds(value.layoutIds),
    updatedAt: String(value.updatedAt || "")
  };
}

export function markGuestWorkspaceLayouts(manifest, layoutIds, {
  sessionId = "",
  now = () => new Date().toISOString()
} = {}) {
  const current = normalizeGuestWorkspaceManifest(manifest);
  const normalizedSessionId = String(sessionId || "").trim();
  const currentLayoutIds = normalizedSessionId && current.sessionId === normalizedSessionId
    ? current.layoutIds
    : [];
  return {
    version: GUEST_LOGIN_HANDOFF_VERSION,
    sessionId: normalizedSessionId,
    layoutIds: uniqueIds([...currentLayoutIds, ...uniqueIds(layoutIds)]),
    updatedAt: now()
  };
}

export function guestWorkspaceLayoutFingerprint(sourceState, layoutId) {
  const normalizedLayoutId = String(layoutId || "").trim();
  const layout = sourceState?.layouts?.[normalizedLayoutId];
  if (!layout) return "";
  const containerIds = [...getLayoutContainerIdSet(sourceState, layout)].sort();
  const itemIds = [...getLayoutItemIdSet(sourceState, layout)].sort();
  return hashText(JSON.stringify(stableContentValue({
    layout,
    containers: Object.fromEntries(containerIds.map((id) => [id, sourceState?.containers?.[id] || null])),
    items: Object.fromEntries(itemIds.map((id) => [id, sourceState?.items?.[id] || null]))
  })));
}

export function createGuestWorkspaceSessionTracker(initialState, {
  sessionId = randomGuestSessionId(),
  sessionIdFactory = () => randomGuestSessionId()
} = {}) {
  let currentSessionId = String(sessionId || "").trim() || randomGuestSessionId();
  let baselineFingerprints = {};

  const captureBaseline = (sourceState) => {
    baselineFingerprints = Object.fromEntries(Object.keys(sourceState?.layouts || {})
      .map((layoutId) => [layoutId, guestWorkspaceLayoutFingerprint(sourceState, layoutId)]));
  };
  const layoutChanged = (sourceState, layoutId) => {
    const normalizedLayoutId = String(layoutId || "").trim();
    const currentFingerprint = guestWorkspaceLayoutFingerprint(sourceState, normalizedLayoutId);
    if (!currentFingerprint) return false;
    return currentFingerprint !== String(baselineFingerprints[normalizedLayoutId] || "");
  };
  captureBaseline(initialState);

  return {
    get sessionId() {
      return currentSessionId;
    },
    layoutChanged,
    changedLayoutIds(sourceState) {
      return Object.keys(sourceState?.layouts || {})
        .filter((layoutId) => layoutChanged(sourceState, layoutId));
    },
    reset(sourceState, nextSessionId = sessionIdFactory()) {
      currentSessionId = String(nextSessionId || "").trim() || randomGuestSessionId();
      captureBaseline(sourceState);
      return currentSessionId;
    }
  };
}

export function recordGuestWorkspaceSessionChanges({
  enabled = false,
  layoutIds,
  manifestKey,
  sessionId,
  storage,
  now
} = {}) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!enabled || !normalizedSessionId || !manifestKey) return false;
  const manifest = markGuestWorkspaceLayouts(null, uniqueIds(layoutIds), {
    sessionId: normalizedSessionId,
    now
  });
  try {
    storage?.setItem?.(manifestKey, JSON.stringify(manifest));
    return true;
  } catch {
    return false;
  }
}

export function guestLoginHandoffFingerprint(candidate, layoutIds) {
  const ids = uniqueIds(layoutIds);
  return hashText(JSON.stringify({
    layoutIds: ids,
    sourceState: candidate?.sourceState || null
  }));
}

export function createGuestLoginHandoff({
  candidate,
  eligibleLayoutIds,
  email,
  guestSessionId,
  nowMs = Date.now(),
  ttlMs = GUEST_LOGIN_HANDOFF_TTL_MS
} = {}) {
  const requestedEmail = normalizeEmail(email);
  const normalizedGuestSessionId = String(guestSessionId || "").trim();
  if (!requestedEmail || !normalizedGuestSessionId || !candidate?.sourceState) return null;
  const eligible = new Set(uniqueIds(eligibleLayoutIds));
  const layouts = (Array.isArray(candidate.layouts) ? candidate.layouts : [])
    .filter((layout) => eligible.has(String(layout?.layoutId || "").trim()));
  const layoutIds = layouts.map((layout) => layout.layoutId);
  if (!layoutIds.length) return null;
  return {
    version: GUEST_LOGIN_HANDOFF_VERSION,
    requestedEmail,
    guestSessionId: normalizedGuestSessionId,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + Math.max(1, Number(ttlMs) || GUEST_LOGIN_HANDOFF_TTL_MS)).toISOString(),
    layoutIds,
    sourceFingerprint: guestLoginHandoffFingerprint(candidate, layoutIds)
  };
}

export function storeGuestLoginHandoff({
  candidate,
  email,
  enabled = false,
  guestSessionId,
  handoffKey,
  manifestKey,
  nowMs = Date.now(),
  storage,
  ttlMs = GUEST_LOGIN_HANDOFF_TTL_MS
} = {}) {
  removeStoredValue(storage, handoffKey);
  if (!enabled || !handoffKey || !manifestKey) return false;
  const manifest = normalizeGuestWorkspaceManifest(readJson(storage, manifestKey));
  const normalizedGuestSessionId = String(guestSessionId || "").trim();
  if (!normalizedGuestSessionId || manifest.sessionId !== normalizedGuestSessionId) return false;
  const handoff = createGuestLoginHandoff({
    candidate,
    eligibleLayoutIds: manifest.layoutIds,
    email,
    guestSessionId: normalizedGuestSessionId,
    nowMs,
    ttlMs
  });
  if (!handoff) return false;
  try {
    storage?.setItem?.(handoffKey, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

export function validateGuestLoginHandoff(handoff, {
  candidate,
  user,
  nowMs = Date.now(),
  ttlMs = GUEST_LOGIN_HANDOFF_TTL_MS
} = {}) {
  const fail = (reason) => ({ ok: false, reason, candidate: null });
  if (!handoff || typeof handoff !== "object") return fail("missing-handoff");
  if (Number(handoff.version) !== GUEST_LOGIN_HANDOFF_VERSION) return fail("version-mismatch");
  if (!String(handoff.guestSessionId || "").trim()) return fail("missing-session");
  const requestedEmail = normalizeEmail(handoff.requestedEmail);
  const confirmedEmail = normalizeEmail(user?.email || user?.mail || user?.login);
  if (!requestedEmail || !confirmedEmail || requestedEmail !== confirmedEmail) return fail("account-mismatch");
  const createdAt = Date.parse(String(handoff.createdAt || ""));
  const expiresAt = Date.parse(String(handoff.expiresAt || ""));
  const maxTtlMs = Math.max(1, Number(ttlMs) || GUEST_LOGIN_HANDOFF_TTL_MS);
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= createdAt ||
    expiresAt - createdAt > maxTtlMs
  ) return fail("invalid-lifetime");
  if (expiresAt <= nowMs) return fail("expired");
  if (!candidate?.sourceState) return fail("missing-candidate");
  const layoutIds = uniqueIds(handoff.layoutIds);
  const candidateLayouts = Array.isArray(candidate.layouts) ? candidate.layouts : [];
  const layoutsById = new Map(candidateLayouts.map((layout) => [String(layout?.layoutId || "").trim(), layout]));
  if (!layoutIds.length || layoutIds.some((layoutId) => !layoutsById.has(layoutId))) {
    return fail("missing-layouts");
  }
  const fingerprint = guestLoginHandoffFingerprint(candidate, layoutIds);
  if (!handoff.sourceFingerprint || fingerprint !== handoff.sourceFingerprint) return fail("source-changed");
  const layouts = layoutIds.map((layoutId) => layoutsById.get(layoutId));
  const primary = layouts.find((layout) => layout.layoutId === candidate.layoutId) || layouts[0];
  return {
    ok: true,
    reason: "",
    candidate: {
      ...candidate,
      layouts,
      layoutId: primary?.layoutId || "",
      layoutName: primary?.layoutName || ""
    }
  };
}

export function consumeStoredGuestLoginHandoff(storage, handoffKey) {
  return removeStoredValue(storage, handoffKey);
}

export function resolveStoredGuestLoginHandoffCandidate({
  candidateFromState,
  guestStateKey,
  handoffKey,
  nowMs = Date.now(),
  storage,
  user
} = {}) {
  const handoff = readJson(storage, handoffKey);
  if (!handoff) return null;
  const sourceState = readJson(storage, guestStateKey);
  const validation = validateGuestLoginHandoff(handoff, {
    candidate: typeof candidateFromState === "function" ? candidateFromState(sourceState) : null,
    user,
    nowMs
  });
  if (validation.ok) return validation.candidate;
  removeStoredValue(storage, handoffKey);
  return null;
}
