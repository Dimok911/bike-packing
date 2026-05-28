export function shouldRecoverUnsyncedLocalChanges({
  applyingRemoteState = false,
  currentUser = null,
  canUsePrivateState = false,
  readOnlyStateScope = false,
  adminPublicEditScope = false,
  syncMeta = {},
  hasLocalSyncChanges = () => false
} = {}) {
  if (applyingRemoteState) return false;
  if (!currentUser) return false;
  if (!canUsePrivateState) return false;
  if (readOnlyStateScope || adminPublicEditScope) return false;
  if (syncMeta?.dirty) return false;
  return Boolean(hasLocalSyncChanges());
}
