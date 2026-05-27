import {
  applySyncVisualState,
  resolveSyncVisualState
} from "./sync-visual-state.js";

export function updateSyncUiControls({
  appUnlocked = false,
  adminReportsDialogController = null,
  canOpenAdminPublishedEdit = () => false,
  canUseLocalEditableState = () => false,
  currentAdminApiWarning = () => "",
  currentPublicTemplateStatusMessage = () => "",
  currentUser = null,
  currentUserEmail = () => "",
  disablePackingVisualStylePanel = () => {},
  document,
  ensureGuestPublicScope = () => {},
  initialRemoteLoadPending = false,
  isForcedOffline = () => false,
  isOfflineRememberedSession = () => false,
  isReadOnlyStateScope = () => false,
  isReadonlyTemplateView = () => false,
  message = "",
  refs,
  state,
  syncMeta,
  syncPackingVisualStyleControls = () => {},
  t = (key) => key
} = {}) {
  const rememberedOffline = isOfflineRememberedSession();
  const loggedIn = Boolean(currentUser || rememberedOffline);
  const unlocked = loggedIn || appUnlocked;
  const forcedOffline = isForcedOffline();
  const privateStateAvailable = canUseLocalEditableState() && !isReadOnlyStateScope();
  if (!privateStateAvailable && unlocked && !initialRemoteLoadPending) ensureGuestPublicScope();
  document.body.classList.toggle("auth-gated", !unlocked);
  document.body.classList.toggle("admin-session", canOpenAdminPublishedEdit());
  document.body.classList.toggle("readonly-template", isReadonlyTemplateView());
  if (!canOpenAdminPublishedEdit()) disablePackingVisualStylePanel();
  syncPackingVisualStyleControls();
  adminReportsDialogController?.syncVisibility?.();
  refs.authBtn.textContent = t("menu.signIn");
  refs.authBtn.hidden = loggedIn;
  refs.authBtn.classList.remove("danger");
  const signOutBtn = document.querySelector("#signOutBtn");
  if (signOutBtn) {
    signOutBtn.textContent = t("menu.signOut");
    signOutBtn.hidden = !loggedIn;
  }
  refs.forceOfflineBtn.textContent = forcedOffline ? t("menu.online") : t("menu.offline");
  refs.forceOfflineBtn.classList.toggle("active", forcedOffline);
  refs.collectionMenuBtn.textContent = state.collectionMode ? t("menu.collectionOn") : t("menu.collectionOff");
  refs.collectionMenuBtn.classList.toggle("active", state.collectionMode);
  if (refs.syncUserEmail) {
    const email = loggedIn ? currentUserEmail() : "";
    const accountLabel = email || t("auth.notSignedIn");
    refs.syncUserEmail.hidden = !unlocked;
    refs.syncUserEmail.textContent = accountLabel;
    refs.syncUserEmail.title = accountLabel;
    refs.syncUserEmail.classList.toggle("admin-user-email", canOpenAdminPublishedEdit());
    refs.syncUserEmail.classList.toggle("guest-user-email", !loggedIn);
  }
  refs.syncBtn.hidden = !loggedIn;
  refs.syncBtn.disabled = !loggedIn || !appUnlocked;
  const adminApiWarning = currentAdminApiWarning();
  const showAdminApiWarning = Boolean(adminApiWarning);
  refs.syncStatus.classList.toggle("admin-api-warning", showAdminApiWarning);
  if (refs.mobileAdminApiWarning) {
    refs.mobileAdminApiWarning.hidden = !showAdminApiWarning;
    refs.mobileAdminApiWarning.textContent = adminApiWarning || "";
  }
  const syncVisualState = resolveSyncVisualState({
    loggedIn,
    unlocked,
    message,
    adminApiWarning: showAdminApiWarning,
    forcedOffline,
    readOnlyScope: isReadOnlyStateScope(),
    dirty: syncMeta.dirty
  });
  applySyncVisualState({ syncButton: refs.syncBtn, stateName: syncVisualState });
  if (adminApiWarning) {
    refs.syncStatus.textContent = adminApiWarning;
    return syncVisualState;
  }
  if (message) {
    refs.syncStatus.textContent = message;
    return syncVisualState;
  }
  if (forcedOffline && appUnlocked) {
    refs.syncStatus.textContent = t("sync.forcedOffline");
    return syncVisualState;
  }
  if (rememberedOffline && appUnlocked && !message) {
    refs.syncStatus.textContent = syncMeta.dirty
      ? "РћС„Р»Р°Р№РЅ В· Р»РѕРєР°Р»СЊРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ СЃРѕС…СЂР°РЅРµРЅС‹ РЅР° СѓСЃС‚СЂРѕР№СЃС‚РІРµ"
      : "РћС„Р»Р°Р№РЅ В· Р»РѕРєР°Р»СЊРЅР°СЏ РєРѕРїРёСЏ Р»РёС‡РЅС‹С… СѓРєР»Р°РґРѕРє";
    return syncVisualState;
  }
  if (!loggedIn && appUnlocked) {
    refs.syncStatus.textContent = privateStateAvailable ? t("sync.localUnlocked") : currentPublicTemplateStatusMessage();
    return syncVisualState;
  }
  if (!loggedIn) {
    refs.syncStatus.textContent = t("sync.localUnlocked");
    return syncVisualState;
  }
  refs.syncStatus.textContent = syncMeta.dirty ? t("sync.dirty") : t("sync.synced");
  return syncVisualState;
}
