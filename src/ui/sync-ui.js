import {
  applySyncVisualState,
  resolveSyncVisualState
} from "./sync-visual-state.js";
import { currentDocumentLanguage } from "../utils/language.js";

function localText(en, ru) {
  return currentDocumentLanguage() === "en" ? en : ru;
}

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
  isCurrentPrivateLayout = () => false,
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
  const publicTemplateMessage = currentPublicTemplateStatusMessage();
  const messageText = String(message || "");
  const effectiveMessage = loggedIn && isCurrentPrivateLayout() && messageText === publicTemplateMessage
    ? ""
    : messageText;
  if (!privateStateAvailable && unlocked && !initialRemoteLoadPending) ensureGuestPublicScope();
  document.body.classList.toggle("auth-gated", !unlocked);
  document.body.classList.toggle("admin-session", canOpenAdminPublishedEdit());
  document.body.classList.toggle("readonly-template", isReadonlyTemplateView());
  if (!canOpenAdminPublishedEdit()) disablePackingVisualStylePanel();
  syncPackingVisualStyleControls();
  adminReportsDialogController?.syncVisibility?.();
  refs.authBtn.textContent = rememberedOffline
    ? localText("Confirm sign-in", "Подтвердить вход")
    : t("menu.signIn");
  refs.authBtn.hidden = Boolean(currentUser);
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
    const accountLabel = rememberedOffline
      ? (email ? localText(`Local · ${email}`, `Локально · ${email}`) : localText("Local account", "Локальный аккаунт"))
      : (email || t("auth.notSignedIn"));
    const accountTitle = rememberedOffline
      ? localText(
        `Server sign-in is not confirmed. Local copy: ${email || "account"}`,
        `Вход на сервере не подтверждён. Локальная копия: ${email || "аккаунт"}`
      )
      : accountLabel;
    refs.syncUserEmail.hidden = !unlocked;
    refs.syncUserEmail.textContent = accountLabel;
    refs.syncUserEmail.title = accountTitle;
    refs.syncUserEmail.classList.toggle("admin-user-email", canOpenAdminPublishedEdit());
    refs.syncUserEmail.classList.toggle("local-remembered-email", rememberedOffline);
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
    rememberedOffline,
    readOnlyScope: isReadOnlyStateScope(),
    dirty: syncMeta.dirty
  });
  applySyncVisualState({
    syncButton: refs.syncBtn,
    stateName: syncVisualState,
    language: currentDocumentLanguage()
  });
  if (adminApiWarning) {
    refs.syncStatus.textContent = adminApiWarning;
    return syncVisualState;
  }
  if (effectiveMessage) {
    refs.syncStatus.textContent = effectiveMessage;
    return syncVisualState;
  }
  if (forcedOffline && appUnlocked) {
    refs.syncStatus.textContent = t("sync.forcedOffline");
    return syncVisualState;
  }
  if (rememberedOffline && appUnlocked && !message) {
    refs.syncStatus.textContent = syncMeta.dirty
      ? localText("Local copy · changes are saved on this device", "Локальная копия · изменения сохранены на этом устройстве")
      : localText("Local copy of personal layouts · sign in to sync", "Локальная копия личных укладок · войдите для синхронизации");
    return syncVisualState;
  }
  if (!loggedIn && appUnlocked) {
    refs.syncStatus.textContent = privateStateAvailable ? t("sync.localUnlocked") : publicTemplateMessage;
    return syncVisualState;
  }
  if (!loggedIn) {
    refs.syncStatus.textContent = t("sync.localUnlocked");
    return syncVisualState;
  }
  refs.syncStatus.textContent = syncMeta.dirty ? t("sync.dirty") : t("sync.synced");
  return syncVisualState;
}
