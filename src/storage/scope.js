export const GUEST_STORAGE_SCOPE = "guest";

export function scopedLocalStorageKey(key, scope = GUEST_STORAGE_SCOPE) {
  return scope === GUEST_STORAGE_SCOPE ? key : `${key}::${scope}`;
}

export function userStorageScopeKey(user) {
  const userId = String(user?.id || user?.userId || user?.user_id || user?.sub || "").trim().toLowerCase();
  const email = String(user?.email || user?.mail || user?.login || "").trim().toLowerCase();
  const raw = userId ? `id:${userId}` : (email ? `email:${email}` : GUEST_STORAGE_SCOPE);
  return raw.replace(/[^a-z0-9._:@-]+/g, "_");
}
