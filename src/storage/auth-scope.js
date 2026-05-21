import {
  AUTH_EMAIL_KEY,
  AUTH_STORAGE_SCOPE_KEY,
  AUTH_USER_ID_KEY,
  STORAGE_KEY,
  SYNC_META_KEY
} from "../config/constants.js";
import { GUEST_STORAGE_SCOPE, scopedLocalStorageKey, userStorageScopeKey } from "./scope.js";

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function storageGet(storage, key) {
  try {
    return storage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Best-effort local preference cleanup.
  }
}

export function normalizeAuthScopeKey(scopeKey) {
  const value = String(scopeKey || "").trim().toLowerCase().replace(/[^a-z0-9._:@-]+/g, "_");
  if (!value || value === GUEST_STORAGE_SCOPE) return "";
  return value;
}

export function authIdentityFromUser(user = null) {
  return {
    id: String(user?.id || user?.userId || user?.user_id || user?.sub || "").trim().toLowerCase(),
    email: String(user?.email || user?.mail || user?.login || "").trim().toLowerCase()
  };
}

export function getSavedAuthEmailFromStorage(storage = defaultStorage()) {
  return String(storageGet(storage, AUTH_EMAIL_KEY)).trim().toLowerCase();
}

export function getSavedAuthUserIdFromStorage(storage = defaultStorage()) {
  return String(storageGet(storage, AUTH_USER_ID_KEY)).trim().toLowerCase();
}

export function getSavedAuthScopeKeyFromStorage(storage = defaultStorage()) {
  return normalizeAuthScopeKey(storageGet(storage, AUTH_STORAGE_SCOPE_KEY));
}

export function saveAuthEmailToStorage(email, storage = defaultStorage()) {
  const value = String(email || "").trim().toLowerCase();
  if (value) return storageSet(storage, AUTH_EMAIL_KEY, value);
  storageRemove(storage, AUTH_EMAIL_KEY);
  return true;
}

export function saveAuthUserIdToStorage(userId, storage = defaultStorage()) {
  const value = String(userId || "").trim().toLowerCase();
  if (value) return storageSet(storage, AUTH_USER_ID_KEY, value);
  storageRemove(storage, AUTH_USER_ID_KEY);
  return true;
}

export function saveAuthScopeKeyToStorage(scopeKey, storage = defaultStorage()) {
  const value = normalizeAuthScopeKey(scopeKey);
  if (value) return storageSet(storage, AUTH_STORAGE_SCOPE_KEY, value);
  storageRemove(storage, AUTH_STORAGE_SCOPE_KEY);
  return true;
}

export function rememberAuthenticatedUserInStorage(user, storage = defaultStorage()) {
  const { id, email } = authIdentityFromUser(user);
  if (id) saveAuthUserIdToStorage(id, storage);
  if (email) saveAuthEmailToStorage(email, storage);
  saveAuthScopeKeyToStorage(userStorageScopeKey({ id, email }), storage);
}

export function currentUserIdFromStorage(user = null, storage = defaultStorage()) {
  const { id } = authIdentityFromUser(user);
  if (id) return id;
  if (user) return "";
  return getSavedAuthUserIdFromStorage(storage);
}

export function hasLocalStateForScope(scopeKey, storage = defaultStorage()) {
  const scope = normalizeAuthScopeKey(scopeKey);
  if (!scope) return false;
  return Boolean(storageGet(storage, scopedLocalStorageKey(STORAGE_KEY, scope)));
}

export function loadSyncMetaForScope(scopeKey, storage = defaultStorage()) {
  const scope = normalizeAuthScopeKey(scopeKey);
  if (!scope) return null;
  try {
    const raw = storageGet(storage, scopedLocalStorageKey(SYNC_META_KEY, scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function localUserStateScopeCandidates(storage = defaultStorage()) {
  const prefix = `${STORAGE_KEY}::`;
  const candidates = [];
  try {
    const length = Number(storage?.length) || 0;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index) || "";
      if (!key.startsWith(prefix)) continue;
      const scopeKey = normalizeAuthScopeKey(key.slice(prefix.length));
      if (scopeKey) candidates.push(scopeKey);
    }
  } catch {
    return [];
  }
  return [...new Set(candidates)];
}

export function rememberedOfflineScopeKey({ id = "", email = "", storage = defaultStorage() } = {}) {
  const savedScope = getSavedAuthScopeKeyFromStorage(storage);
  if (hasLocalStateForScope(savedScope, storage)) return savedScope;

  const directScope = normalizeAuthScopeKey(userStorageScopeKey({ id, email }));
  if (hasLocalStateForScope(directScope, storage)) return directScope;

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const candidates = localUserStateScopeCandidates(storage);
  if (normalizedEmail) {
    const byMeta = candidates.find((scopeKey) => {
      const meta = loadSyncMetaForScope(scopeKey, storage);
      return String(meta?.accountEmail || "").trim().toLowerCase() === normalizedEmail;
    });
    if (byMeta) return byMeta;
  }

  return candidates.length === 1 ? candidates[0] : "";
}

export function buildRememberedOfflineUser({ user = null, storage = defaultStorage(), signedOut = false } = {}) {
  // CRITICAL: offline-auth-scope. Never fall back to guest/demo when a private local scope is known.
  if (signedOut) return null;
  const fromUser = authIdentityFromUser(user);
  const id = fromUser.id || currentUserIdFromStorage(null, storage);
  const email = fromUser.email || getSavedAuthEmailFromStorage(storage);
  const scopeKey = rememberedOfflineScopeKey({ id, email, storage });
  if (!id && !email && !scopeKey) return null;
  return { id, email, scopeKey, offlineRemembered: true };
}
