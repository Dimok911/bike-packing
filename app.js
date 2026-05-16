import {
  STORAGE_KEY,
  APP_VERSION,
  SYNC_META_KEY,
  BASE_STATE_KEY,
  RECOVERY_STATE_KEY,
  RECOVERY_STATE_MAX,
  AUTH_EMAIL_KEY,
  AUTH_SIGNED_OUT_KEY,
  FORCE_OFFLINE_KEY,
  DEVICE_META_KEY,
  UI_SETTINGS_KEY,
  ACTIVE_LIST_ID_KEY,
  ACTIVE_LAYOUT_CHOICE_KEY,
  ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
  ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
  API_BASE,
  PHOTO_DB_NAME,
  PHOTO_DB_VERSION,
  PHOTO_STORE,
  ITEM_PHOTO_MAX_SIZE,
  ITEM_PHOTO_THUMB_SIZE,
  ITEM_PHOTO_QUALITY,
  DATA_SCOPE_KEY,
  DATA_ITEM_KEY,
  DEMO_LAYOUT_SELECT_VALUE,
  DEMO_SHARED_LAYOUT_ID,
  GUEST_DEMO_COPY_FLAG,
  SHARED_LAYOUTS_STORAGE_KEY,
  SESSION_MODE_GUEST,
  SESSION_MODE_USER,
  SESSION_MODE_ADMIN,
  VIEW_SCOPE_PRIVATE,
  VIEW_SCOPE_GUEST_LOCAL,
  VIEW_SCOPE_DEMO,
  VIEW_SCOPE_SHARED,
  VIEW_SCOPE_ADMIN_PUBLIC_EDIT,
  STATE_SCOPE_PRIVATE,
  STATE_SCOPE_DEMO,
  STATE_SCOPE_SHARED,
  SHARED_LIST_QUERY_PARAM,
  LANGUAGE_KEY,
  DEFAULT_LANGUAGE,
  ADMIN_EMAILS,
  ADMIN_USER_IDS,
  COLLAPSE_DEFAULTS_VERSION,
  API_TIMEOUT_MS,
  LIST_API_TIMEOUT_MS,
  LIST_SAVE_API_TIMEOUT_MS,
  POINTER_DRAG_START_DISTANCE,
  TOUCH_DRAG_DELAY_MS,
  TOUCH_DRAG_CANCEL_DISTANCE,
  TOUCH_SCROLL_CANCEL_DISTANCE,
  NESTED_GROUP_HOVER_DELAY_MS,
  EDGE_SCROLL_ZONE,
  EDGE_SCROLL_MAX_SPEED,
  REMOTE_REFRESH_INTERVAL_MS,
  SEARCH_RENDER_DEBOUNCE_MS
} from "./src/config/constants.js";
import { I18N } from "./src/data/i18n.js";
import {
  REQUIRED_CHARGE_CATEGORY,
  categories,
  locations,
  sharedLayouts,
  demoSharedLayout
} from "./src/data/demo-data.js";
import { guessCategory, guessLocation } from "./src/data/guess.js";
import {
  activeReadOnlyLayoutIdFromScope,
  createReadOnlyBikePackingError,
  demoAdminIdForLanguage as demoAdminIdForLanguageFromScope,
  demoAdminPathForLanguage as demoAdminPathForLanguageFromScope,
  demoAdminStatePathForLanguage as demoAdminStatePathForLanguageFromScope,
  demoItemKeyForLanguage as demoItemKeyForLanguageFromScope,
  demoLanguageSuffix as demoLanguageSuffixFromScope,
  demoPublicListIdForLanguage as demoPublicListIdForLanguageFromScope,
  hasGuestDemoCopyLayoutRecord,
  isGuestDemoCopyLayoutRecord,
  isPublishedLayoutEditable,
  isReadOnlyBikePackingError,
  isReadOnlyBikePackingRecord,
  isReadOnlyItemKey,
  isReadOnlyScope,
  sharedLayoutItemKey as sharedLayoutItemKeyFromScope
} from "./src/public/scope.js";
import { normalizeContainerColor } from "./src/state/container-fields.js";
import {
  hasStateIntegrityMeta,
  isMeaningfulPackingState,
  isPackingStateShape,
  normalizeIntegrityCount,
  normalizeStateRevision,
  remoteStateIntegrityError,
  stateIntegrityMetaFromResponse,
  stateStats
} from "./src/state/diagnostics.js";
import { createBlankBikePackingState } from "./src/state/empty-state.js";
import {
  createEmptyLayoutArrangement,
  createLayoutArrangementFromCurrentState,
  uniqueLayoutIds
} from "./src/state/layout-arrangement.js";
import {
  applyDefaultCollapsedContainers,
  defaultRootContainerLocation,
  itemCategories,
  migrateContainerOrder,
  normalizeItemCategories
} from "./src/state/normalize.js";
import { repairContainerMembershipFromItemLinks } from "./src/state/repair.js";
import {
  annotatePayloadError,
  syncPayloadSizeReport
} from "./src/sync/payload-report.js";
import {
  ENTITY_SYNC_CONFIG,
  buildChangedEntitySyncEntries as buildChangedEntitySyncEntriesForSync,
  buildEntitySyncBody as buildEntitySyncBodyForSync,
  hasLegacyPayloadChanges as hasLegacyPayloadChangesForSync,
  isEntitySyncUnavailableError,
  legacyComparableStateForSync as legacyComparableStateForSyncPayload,
  splitEntitySyncEntries as splitEntitySyncEntriesForSync
} from "./src/sync/entity-sync.js";
import {
  hasRemotePhotoUrl,
  normalizePhotoStatus,
  normalizePhotoUrlFields
} from "./src/sync/photos.js";
import {
  cloneStateForSyncPayload,
  stripContainerArrangementFields,
  stripItemPlacementFields
} from "./src/sync/serialize.js";
import { escapeHtml } from "./src/utils/html.js";
import { clonePlain } from "./src/utils/json.js";
import { normalizeUiLanguage } from "./src/utils/language.js";
import { nowIso } from "./src/utils/time.js";
import {
  formatVolume,
  formatWeight,
  parseVolumeInput,
  parseWeightInput
} from "./src/utils/weight.js";

const sharedLayoutsByLanguage = createSharedLayoutsByLanguage(sharedLayouts);
let uiLanguage = loadUiLanguage();
const missingDemoPublicTemplates = {};
applyPublicTemplateLanguage();

let applyingLayoutArrangement = false;
const hadLocalStateAtStartup = hasLocalSavedState();
const state = loadState();
const uiSettings = loadUiSettings();
let editingItemId = null;
let editingItemTitleId = null;
let editingRootContainerId = null;
let editingContainerId = null;
const modeState = {
  viewScope: VIEW_SCOPE_PRIVATE,
  stateScope: STATE_SCOPE_PRIVATE,
  readonlyLayoutId: "",
  sharedLayoutId: "",
  adminPublishedEditLayoutId: ""
};
let linkedSharedListLayout = null;
let sharedVirtualCollapsedContainers = {};
let draggingItemId = null;
let draggingContainerId = null;
let itemUsageFilter = "all";
let itemSortMode = normalizeSortMode(uiSettings.itemSortMode);
let rootContainerUsageFilter = "all";
let rootContainerSortMode = normalizeSortMode(uiSettings.rootContainerSortMode);
let selectedCategoryFilters = [];
let addToContainerTargetId = null;
let recentlyAddedItemId = null;
let pendingPackingScroll = null;
let lastPackingScrollSnapshot = null;
let lastItemTitleTap = { id: "", time: 0 };
let lastRootContainerTitleTap = { id: "", time: 0 };
let syncMeta = loadSyncMeta();
let syncDevice = loadSyncDevice();
let currentUser = null;
let syncTimer = null;
let publishedLayoutSaveTimer = null;
let applyingRemoteState = false;
let appUnlocked = true;
let initialRemoteLoadPending = false;
let syncVisualState = "local";
let remoteRefreshTimer = null;
let remoteRefreshInFlight = false;
let personalListApiUnavailable = false;
let itemEntitySyncUnavailable = false;
let containerEntitySyncUnavailable = false;
let layoutEntitySyncUnavailable = false;
let historyRecords = [];
let expandedHistoryRecordId = "";
let expandedHistoryGroups = {};
let historyComparisonState = null;
let activeHistorySource = "private";
let filterViewCollapseSignature = "";
let filterViewCollapsedContainers = {};
let filterMatchIndex = 0;
let filterMatchSignature = "";
let pendingFilterJump = false;
let searchContextCommitTimer = null;
let filterNavRefreshFrame = null;
let modalScrollLock = null;
let itemDialogInitialSnapshot = null;
let rootContainerDialogInitialSnapshot = null;
let rootContainerDialogPendingRootIds = null;
let rootContainerDialogPendingParentId = undefined;
let rootContainerDialogPendingParentIndex = null;
let lastToastSignature = "";
let lastToastAt = 0;
let containerPickerMode = "item";
let containerPickerTargetContainerId = "";
let containerPickerLayoutId = "";
let itemDialogTargetLayoutId = "";
let editingDictionaryEntry = null;
let fixedScrollbarRefreshFrame = null;
let searchRenderTimer = null;
let suppressNextFilterJump = false;
let modalTouchStartY = 0;
let itemDialogPhotoDraft = null;
let itemDialogPhotoObjectUrl = "";
let rootContainerDialogPhotoDraft = null;
let rootContainerDialogPhotoObjectUrl = "";
let sharedDialogCopyItemId = "";
const photoObjectUrls = new Map();
let photoUploadInFlight = false;
let currentPackingListId = loadActivePackingListId();
let currentPackingListMeta = null;
let explicitLayoutChoice = { id: "", at: 0 };

const refs = {
  syncStatus: document.querySelector("#syncStatus"),
  appVersion: document.querySelector("#appVersion"),
  authBtn: document.querySelector("#authBtn"),
  authGateBtn: document.querySelector("#authGateBtn"),
  sharedLayoutsBtn: document.querySelector("#sharedLayoutsBtn"),
  shareListBtn: document.querySelector("#shareListBtn"),
  languageSelect: document.querySelector("#languageSelect"),
  syncBtn: document.querySelector("#syncBtn"),
  forceOfflineBtn: document.querySelector("#forceOfflineBtn"),
  collectionMenuBtn: document.querySelector("#collectionMenuBtn"),
  menuBtn: document.querySelector("#menuBtn"),
  topMenu: document.querySelector("#topMenu"),
  historyBtn: document.querySelector("#historyBtn"),
  controls: document.querySelector(".controls"),
  layoutSelect: document.querySelector("#layoutSelect"),
  searchInput: document.querySelector("#searchInput"),
  clearSearchBtn: document.querySelector("#clearSearchBtn"),
  filterContextBtn: document.querySelector("#filterContextBtn"),
  locationFilter: document.querySelector("#locationFilter"),
  clearLocationFilterBtn: document.querySelector("#clearLocationFilterBtn"),
  categoryFilter: document.querySelector("#categoryFilter"),
  clearCategoryFilterBtn: document.querySelector("#clearCategoryFilterBtn"),
  categoryFilterDialog: document.querySelector("#categoryFilterDialog"),
  categoryFilterList: document.querySelector("#categoryFilterList"),
  resetCategoryFilterBtn: document.querySelector("#resetCategoryFilterBtn"),
  applyCategoryFilterBtn: document.querySelector("#applyCategoryFilterBtn"),
  addToContainerDialog: document.querySelector("#addToContainerDialog"),
  addToContainerTitle: document.querySelector("#addToContainerTitle"),
  addToContainerPath: document.querySelector("#addToContainerPath"),
  addToContainerSearch: document.querySelector("#addToContainerSearch"),
  clearAddToContainerSearchBtn: document.querySelector("#clearAddToContainerSearchBtn"),
  addToContainerResults: document.querySelector("#addToContainerResults"),
  newSubcontainerName: document.querySelector("#newSubcontainerName"),
  createSubcontainerBtn: document.querySelector("#createSubcontainerBtn"),
  layoutRootDialog: document.querySelector("#layoutRootDialog"),
  layoutRootSearch: document.querySelector("#layoutRootSearch"),
  clearLayoutRootSearchBtn: document.querySelector("#clearLayoutRootSearchBtn"),
  layoutRootResults: document.querySelector("#layoutRootResults"),
  searchFilterLabel: document.querySelector("#searchFilterLabel"),
  locationFilterLabel: document.querySelector("#locationFilterLabel"),
  categoryFilterLabel: document.querySelector("#categoryFilterLabel"),
  metaToggleBtn: document.querySelector("#metaToggleBtn"),
  filterNav: document.querySelector("#filterNav"),
  filterPrevBtn: document.querySelector("#filterPrevBtn"),
  filterNextBtn: document.querySelector("#filterNextBtn"),
  filterNavStatus: document.querySelector("#filterNavStatus"),
  collectionActions: document.querySelector(".collection-actions"),
  collectionModeBtn: document.querySelector("#collectionModeBtn"),
  unpackedOnlyBtn: document.querySelector("#unpackedOnlyBtn"),
  unpackAllBtn: document.querySelector("#unpackAllBtn"),
  summary: document.querySelector("#summary"),
  packingView: document.querySelector("#packingView"),
  itemsView: document.querySelector("#itemsView"),
  bagsView: document.querySelector("#bagsView"),
  settingsView: document.querySelector("#settingsView"),
  dialog: document.querySelector("#itemDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  itemName: document.querySelector("#itemName"),
  itemWeight: document.querySelector("#itemWeight"),
  itemQuantity: document.querySelector("#itemQuantity"),
  itemQuantityMinus: document.querySelector("#itemQuantityMinus"),
  itemQuantityPlus: document.querySelector("#itemQuantityPlus"),
  itemTotalWeight: document.querySelector("#itemTotalWeight"),
  itemLocation: document.querySelector("#itemLocation"),
  itemCategoryList: document.querySelector("#itemCategoryList"),
  itemContainer: document.querySelector("#itemContainer"),
  itemContainerLabel: document.querySelector("#itemContainerLabel"),
  itemContainerCurrent: document.querySelector("#itemContainerCurrent"),
  itemContainerPickerBtn: document.querySelector("#itemContainerPickerBtn"),
  itemCopyToContainerBtn: document.querySelector("#itemCopyToContainerBtn"),
  containerPickerDialog: document.querySelector("#containerPickerDialog"),
  containerPickerTitle: document.querySelector("#containerPickerTitle"),
  containerPickerLayoutField: document.querySelector("#containerPickerLayoutField"),
  containerPickerLayoutSelect: document.querySelector("#containerPickerLayoutSelect"),
  containerPickerNoneBtn: document.querySelector("#containerPickerNoneBtn"),
  containerPickerBoard: document.querySelector("#containerPickerBoard"),
  itemNote: document.querySelector("#itemNote"),
  itemPhotoInput: document.querySelector("#itemPhotoInput"),
  itemPhotoPreview: document.querySelector("#itemPhotoPreview"),
  itemPhotoRemoveBtn: document.querySelector("#itemPhotoRemoveBtn"),
  itemPhotoStatus: document.querySelector("#itemPhotoStatus"),
  copySharedItemDialogBtn: document.querySelector("#copySharedItemDialogBtn"),
  saveItemBtn: document.querySelector("#saveItemBtn"),
  rootContainerDialog: document.querySelector("#rootContainerDialog"),
  rootContainerDialogTitle: document.querySelector("#rootContainerDialogTitle"),
  rootContainerName: document.querySelector("#rootContainerName"),
  rootContainerWeight: document.querySelector("#rootContainerWeight"),
  rootContainerVolume: document.querySelector("#rootContainerVolume"),
  rootContainerColor: document.querySelector("#rootContainerColor"),
  rootContainerLocation: document.querySelector("#rootContainerLocation"),
  rootContainerPlacementField: document.querySelector("#rootContainerPlacementField"),
  rootContainerPlacementLabel: document.querySelector("#rootContainerPlacementLabel"),
  rootContainerPlacementCurrent: document.querySelector("#rootContainerPlacementCurrent"),
  rootContainerPlacementBtn: document.querySelector("#rootContainerPlacementBtn"),
  rootContainerCopyToContainerBtn: document.querySelector("#rootContainerCopyToContainerBtn"),
  rootContainerNote: document.querySelector("#rootContainerNote"),
  rootContainerPhotoInput: document.querySelector("#rootContainerPhotoInput"),
  rootContainerPhotoPreview: document.querySelector("#rootContainerPhotoPreview"),
  rootContainerPhotoRemoveBtn: document.querySelector("#rootContainerPhotoRemoveBtn"),
  rootContainerPhotoStatus: document.querySelector("#rootContainerPhotoStatus"),
  saveRootContainerBtn: document.querySelector("#saveRootContainerBtn"),
  rootPlacementDialog: document.querySelector("#rootPlacementDialog"),
  rootPlacementTitle: document.querySelector("#rootPlacementTitle"),
  rootPlacementBoard: document.querySelector("#rootPlacementBoard"),
  newLayoutBtn: document.querySelector("#newLayoutBtn"),
  layoutDialog: document.querySelector("#layoutDialog"),
  layoutName: document.querySelector("#layoutName"),
  layoutCreateMode: document.querySelector("#layoutCreateMode"),
  layoutCopyLabel: document.querySelector("#layoutCopyLabel"),
  layoutCopyFrom: document.querySelector("#layoutCopyFrom"),
  saveLayoutBtn: document.querySelector("#saveLayoutBtn"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmCancelBtn: document.querySelector("#confirmCancelBtn"),
  confirmOkBtn: document.querySelector("#confirmOkBtn"),
  confirmCloseBtn: document.querySelector("#confirmDialog header .icon-button"),
  conflictDialog: document.querySelector("#conflictDialog"),
  conflictList: document.querySelector("#conflictList"),
  conflictServerBtn: document.querySelector("#conflictServerBtn"),
  conflictApplyBtn: document.querySelector("#conflictApplyBtn"),
  authDialog: document.querySelector("#authDialog"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authSubmitBtn: document.querySelector("#authSubmitBtn"),
  authDialogStatus: document.querySelector("#authDialogStatus"),
  historyDialog: document.querySelector("#historyDialog"),
  historySourceControls: document.querySelector("#historySourceControls"),
  historySourceTabs: document.querySelector("#historySourceTabs"),
  historySharedField: document.querySelector("#historySharedField"),
  historySharedSelect: document.querySelector("#historySharedSelect"),
  historyStatus: document.querySelector("#historyStatus"),
  historyList: document.querySelector("#historyList"),
  sharedLayoutsDialog: document.querySelector("#sharedLayoutsDialog"),
  sharedLayoutsList: document.querySelector("#sharedLayoutsList"),
  sharedCopyLayoutSelect: document.querySelector("#sharedCopyLayoutSelect"),
  copySharedLayoutBtn: document.querySelector("#copySharedLayoutBtn"),
  toastRegion: document.querySelector("#toastRegion")
};

init();

function isLocalDevOrigin() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function loadUiLanguage() {
  try {
    return normalizeUiLanguage(localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function saveUiLanguage(language) {
  safeSetLocalStorage(LANGUAGE_KEY, normalizeUiLanguage(language));
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("[bike-packing] localStorage write skipped", key, error);
    return false;
  }
}

function persistStateSnapshot(snapshot = state) {
  return safeSetLocalStorage(STORAGE_KEY, JSON.stringify(snapshot));
}

function t(key, values = {}) {
  const dictionary = I18N[uiLanguage] || I18N[DEFAULT_LANGUAGE] || {};
  const fallback = I18N[DEFAULT_LANGUAGE]?.[key] || key;
  return String(dictionary[key] || fallback).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function createSharedLayoutsByLanguage(layouts) {
  const ruLayouts = layouts;
  const enLayouts = clonePlain(layouts).map((layout) => ({
    ...layout,
    id: `${layout.id}-en`,
    name: layout.name === "Bikepacking reference" ? "Bikepacking reference" : layout.name,
    subtitle: "Shared layout",
    language: "en"
  }));
  ruLayouts.forEach((layout) => {
    layout.language = "ru";
  });
  return { ru: ruLayouts, en: enLayouts };
}

function currentSharedLayouts(language = uiLanguage) {
  return sharedLayoutsByLanguage[normalizeUiLanguage(language)] || sharedLayoutsByLanguage[DEFAULT_LANGUAGE] || [];
}

function applyPublicTemplateLanguage() {
  demoSharedLayout.name = t("demo.layoutName");
  demoSharedLayout.subtitle = t("demo.subtitle");
  syncDemoStatePayloadForLanguage(uiLanguage);
}

function syncDemoStatePayloadForLanguage(language = uiLanguage) {
  demoSharedLayout.statePayload = demoStatePayloadForLanguage(language);
}

function demoStatePayloadForLanguage(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  return demoSharedLayout.statePayloadByLanguage?.[normalized] || null;
}

function setDemoStatePayloadForLanguage(language, payload) {
  const normalized = normalizeUiLanguage(language);
  demoSharedLayout.statePayloadByLanguage = demoSharedLayout.statePayloadByLanguage || {};
  demoSharedLayout.statePayloadByLanguage[normalized] = payload || null;
  if (normalized === normalizeUiLanguage(uiLanguage)) demoSharedLayout.statePayload = payload || null;
}

function setDemoPublicTemplateMissing(language, missing) {
  missingDemoPublicTemplates[normalizeUiLanguage(language)] = Boolean(missing);
}

function isDemoPublicTemplateMissing(language = uiLanguage) {
  return Boolean(missingDemoPublicTemplates[normalizeUiLanguage(language)]);
}

function currentPublicTemplateStatusMessage() {
  if (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && isDemoPublicTemplateMissing(uiLanguage)) {
    return uiLanguage === "en"
      ? "EN demo has not been published yet · isolated empty template is shown"
      : "Демо для этого языка ещё не опубликовано · показана пустая изолированная заготовка";
  }
  return uiLanguage === "en"
    ? "Demo/public read-only · create a private copy to save changes"
    : "Demo/public read-only · создайте личную копию для сохранения";
}

async function setUiLanguage(language) {
  const nextLanguage = normalizeUiLanguage(language);
  if (nextLanguage === uiLanguage) return;
  const wasDemoView = activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID;
  const wasAdminDemoEdit = Boolean(state.layouts?.[state.activeLayoutId]?.adminDemo);
  uiLanguage = nextLanguage;
  saveUiLanguage(uiLanguage);
  applyPublicTemplateLanguage();
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  const readonlyId = activeReadOnlyLayoutId();
  if (isReadOnlyStateScope() && readonlyId && readonlyId !== DEMO_SHARED_LAYOUT_ID && !findSharedLayout(readonlyId)) {
    setActivePrivateScope();
  }
  applyStaticTranslations();
  render();
  updateSyncUi();
  if (wasAdminDemoEdit) {
    try {
      if (!currentUser) {
        updateSyncUi("Demo/admin: войдите админом, чтобы редактировать версию выбранного языка");
        return;
      }
      await openAdminDemoLayout();
    } catch (error) {
      updateSyncUi(`Demo load failed: ${error.message}`);
    }
    return;
  }
  if (wasDemoView && activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID) {
    try {
      updateSyncUi(`${t("demo.layoutName")} · loading`);
      if (canOpenAdminPublishedEdit()) {
        await openAdminDemoLayout();
      } else {
        setDemoStatePayloadForLanguage(uiLanguage, await defaultDemoState(uiLanguage));
        render();
        updateSyncUi();
      }
    } catch (error) {
      updateSyncUi(`Demo load failed: ${error.message}`);
    }
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = uiLanguage;
  document.title = t("app.title");
  const appTitle = document.querySelector(".topbar h1");
  const authGateTitle = document.querySelector(".auth-gate h2");
  const authGateText = document.querySelector(".auth-gate p");
  const languageLabel = document.querySelector("#languageSelectLabel");
  const layoutLabel = document.querySelector(".controls label");
  const searchLabel = document.querySelector("#searchFilterLabel");
  const locationLabel = document.querySelector("#locationFilterLabel");
  const categoryLabel = document.querySelector("#categoryFilterLabel");
  if (appTitle) appTitle.textContent = t("app.title");
  if (authGateTitle) authGateTitle.textContent = uiLanguage === "en" ? "Sign in to open your packing lists" : "Войдите, чтобы открыть сборы";
  if (authGateText) {
    authGateText.textContent = uiLanguage === "en"
      ? "Layouts, weight and storage places will be available after signing in with a magic link."
      : "Укладка, вес и места хранения будут доступны после входа по magic link.";
  }
  if (refs.authGateBtn) refs.authGateBtn.textContent = uiLanguage === "en" ? "Get sign-in link" : "Получить ссылку для входа";
  if (refs.syncBtn) refs.syncBtn.textContent = t("buttons.sync");
  if (refs.sharedLayoutsBtn) refs.sharedLayoutsBtn.textContent = t("menu.sharedLayouts");
  if (refs.shareListBtn) refs.shareListBtn.textContent = t("menu.shareList");
  if (languageLabel) languageLabel.textContent = t("menu.language");
  if (layoutLabel?.firstChild) layoutLabel.firstChild.textContent = `${t("labels.layout")}\n          `;
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  if (searchLabel?.firstChild) searchLabel.firstChild.textContent = `${t("labels.search")}\n            `;
  refs.searchInput.placeholder = t("placeholders.search");
  if (locationLabel?.firstChild) locationLabel.firstChild.textContent = `${t("labels.storage")}\n          `;
  if (categoryLabel?.firstChild) categoryLabel.firstChild.textContent = `${t("labels.category")}\n          `;
  document.querySelectorAll(".tabs .tab").forEach((tab) => {
    const key = `tabs.${tab.dataset.view}`;
    tab.textContent = t(key);
  });
  if (refs.copySharedLayoutBtn) refs.copySharedLayoutBtn.textContent = uiLanguage === "en" ? "Copy whole layout" : "Скопировать всю укладку";
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
}

function init() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    if (isLocalDevOrigin()) {
      navigator.serviceWorker.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => null);
    } else {
      navigator.serviceWorker.register("./sw.js");
    }
  }
  if (refs.appVersion) refs.appVersion.textContent = APP_VERSION;
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  applyStaticTranslations();
  preventDoubleTapZoom();
  setupModalScrollLock();
  setupTouchActionButtonFeedback();
  document.addEventListener("pointerdown", blurActiveEditableBeforeButtonAction, true);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  refs.layoutSelect.addEventListener("change", async (event) => {
    event.currentTarget?.blur?.();
    await flushActivePublishedEditSave();
    const value = event.target.value;
    if (value === DEMO_LAYOUT_SELECT_VALUE) {
      if (await confirmPublicLayoutTransition("demo")) {
        if (canOpenAdminPublishedEdit()) await openAdminDemoLayout();
        else await openDemoLayoutFromSelect();
      } else {
        renderFilters();
      }
      return;
    }
    if (value.startsWith("shared:")) {
      const layoutId = value.slice("shared:".length);
      if (await confirmPublicLayoutTransition("shared", findSharedLayout(layoutId))) {
        if (canOpenAdminPublishedEdit()) await openSharedLayoutForAdmin(layoutId);
        else await openSharedLayoutViewer(layoutId);
      } else {
        renderFilters();
      }
      return;
    }
    openPrivateLayout(value);
  });
  refs.searchInput.addEventListener("input", handleSearchInput);
  refs.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    applySearchInputNow();
  });
  refs.searchInput.addEventListener("focus", updateSearchFocusState);
  refs.searchInput.addEventListener("blur", preserveSearchBlurViewport);
  refs.clearSearchBtn.addEventListener("pointerdown", (event) => event.preventDefault());
  refs.clearSearchBtn.addEventListener("click", clearSearch);
  refs.filterContextBtn.addEventListener("click", toggleFilterContext);
  refs.locationFilter.addEventListener("change", render);
  refs.clearLocationFilterBtn.addEventListener("click", () => clearSelectFilter(refs.locationFilter));
  refs.categoryFilter.addEventListener("click", openCategoryFilterDialog);
  refs.clearCategoryFilterBtn.addEventListener("click", clearCategoryFilter);
  refs.resetCategoryFilterBtn.addEventListener("click", () => {
    refs.categoryFilterList.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
  });
  refs.applyCategoryFilterBtn.addEventListener("click", applyCategoryFilterDialog);
  refs.addToContainerSearch.addEventListener("input", renderAddToContainerResults);
  refs.clearAddToContainerSearchBtn.addEventListener("pointerdown", (event) => event.preventDefault());
  refs.clearAddToContainerSearchBtn.addEventListener("click", clearAddToContainerSearch);
  refs.createSubcontainerBtn.addEventListener("click", createSubcontainerFromAddDialog);
  refs.addToContainerDialog.addEventListener("close", () => {
    addToContainerTargetId = null;
    refs.addToContainerSearch.value = "";
    refs.newSubcontainerName.value = "";
  });
  refs.layoutRootSearch.addEventListener("input", renderLayoutRootResults);
  refs.clearLayoutRootSearchBtn.addEventListener("pointerdown", (event) => event.preventDefault());
  refs.clearLayoutRootSearchBtn.addEventListener("click", clearLayoutRootSearch);
  refs.layoutRootDialog.addEventListener("close", () => {
    refs.layoutRootSearch.value = "";
  });
  refs.rootContainerPlacementBtn.addEventListener("click", openRootContainerPlacementAction);
  refs.rootContainerCopyToContainerBtn?.addEventListener("click", openRootContainerCopyPickerDialog);
  refs.itemContainerPickerBtn.addEventListener("click", openItemContainerPickerDialog);
  refs.itemCopyToContainerBtn?.addEventListener("click", openItemCopyContainerPickerDialog);
  refs.containerPickerLayoutSelect?.addEventListener("change", () => {
    containerPickerLayoutId = refs.containerPickerLayoutSelect.value || getPublishedEditLayoutId();
    renderContainerPicker();
  });
  refs.containerPickerNoneBtn.addEventListener("click", () => {
    if (containerPickerMode === "container-copy") {
      selectContainerPickerTarget("");
      return;
    }
    selectItemContainer("");
  });
  refs.metaToggleBtn.addEventListener("click", toggleItemMeta);
  refs.filterPrevBtn.addEventListener("pointerdown", commitSearchInputForNavigation);
  refs.filterNextBtn.addEventListener("pointerdown", commitSearchInputForNavigation);
  refs.filterPrevBtn.addEventListener("click", () => moveFilterMatch(-1));
  refs.filterNextBtn.addEventListener("click", () => moveFilterMatch(1));
  refs.collectionModeBtn.addEventListener("click", toggleCollectionMode);
  refs.collectionMenuBtn.addEventListener("click", toggleCollectionMode);
  refs.unpackedOnlyBtn.addEventListener("click", () => {
    state.showOnlyUnpacked = !state.showOnlyUnpacked;
    if (state.showOnlyUnpacked) state.collectionMode = true;
    saveLocalUiState();
    render();
  });
  refs.unpackAllBtn.addEventListener("click", unpackAllItems);
  refs.saveItemBtn.addEventListener("click", saveDialogItem);
  refs.itemWeight.addEventListener("input", updateItemQuantityUi);
  refs.itemQuantity.addEventListener("input", updateItemQuantityUi);
  refs.itemQuantity.addEventListener("change", normalizeItemQuantityInput);
  refs.itemQuantityMinus.addEventListener("click", () => changeItemDialogQuantity(-1));
  refs.itemQuantityPlus.addEventListener("click", () => changeItemDialogQuantity(1));
  refs.itemPhotoInput?.addEventListener("change", handleItemPhotoInputChange);
  refs.itemPhotoRemoveBtn?.addEventListener("click", removeItemDialogPhoto);
  refs.copySharedItemDialogBtn?.addEventListener("click", copySharedItemFromReadonlyDialog);
  refs.rootContainerPhotoInput?.addEventListener("change", handleRootContainerPhotoInputChange);
  refs.rootContainerPhotoRemoveBtn?.addEventListener("click", removeRootContainerDialogPhoto);
  refs.dialog.querySelector("form")?.addEventListener("input", updateItemDialogSaveState);
  refs.dialog.querySelector("form")?.addEventListener("change", updateItemDialogSaveState);
  refs.dialog.querySelector("form")?.addEventListener("submit", handleItemFormSubmit);
  refs.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestCloseItemDialog();
  });
  refs.saveRootContainerBtn.addEventListener("click", saveRootContainerDialog);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("input", updateRootContainerDialogSaveState);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("change", updateRootContainerDialogSaveState);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("submit", handleRootContainerFormSubmit);
  refs.rootContainerDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestCloseRootContainerDialog();
  });
  refs.rootContainerDialog.addEventListener("close", () => {
    editingRootContainerId = null;
    rootContainerDialogInitialSnapshot = null;
    rootContainerDialogPendingRootIds = null;
    rootContainerDialogPendingParentId = undefined;
    rootContainerDialogPendingParentIndex = null;
    resetRootContainerDialogPhotoDraft();
  });
  refs.dialog.addEventListener("close", () => {
    itemDialogInitialSnapshot = null;
    resetSharedReadonlyItemDialog();
    resetItemDialogPhotoDraft();
  });
  refs.newLayoutBtn.addEventListener("click", () => {
    if (isSharedLayoutView()) {
      copySharedLayout(activeReadOnlyLayoutId());
      return;
    }
    openLayoutDialog();
  });
  refs.layoutCreateMode.addEventListener("change", updateLayoutCopyVisibility);
  refs.saveLayoutBtn.addEventListener("click", saveNewLayout);
  refs.authBtn.addEventListener("click", handleAuthButton);
  refs.authGateBtn.addEventListener("click", handleAuthButton);
  refs.sharedLayoutsBtn.addEventListener("click", openSharedLayoutsDialog);
  refs.shareListBtn?.addEventListener("click", shareCurrentPackingListByLink);
  refs.languageSelect?.addEventListener("change", (event) => {
    setUiLanguage(event.target.value).catch((error) => updateSyncUi(`Language switch failed: ${error.message}`));
  });
  refs.copySharedLayoutBtn.addEventListener("click", () => copySharedLayout(currentSharedLayouts()[0]?.id));
  refs.forceOfflineBtn.addEventListener("click", toggleForcedOfflineMode);
  refs.authForm.addEventListener("submit", submitAuthDialog);
  refs.syncBtn.addEventListener("click", () => syncNow({ force: true }));
  refs.menuBtn.addEventListener("click", toggleTopMenu);
  refs.topMenu.addEventListener("click", (event) => {
    if (event.target.closest("button")) closeTopMenu();
  });
  refs.historyBtn.addEventListener("click", openHistoryDialog);
  refs.historySourceTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-source]");
    if (!button) return;
    activeHistorySource = button.dataset.historySource || "private";
    expandedHistoryRecordId = "";
    expandedHistoryGroups = {};
    historyComparisonState = null;
    refreshHistoryDialog();
  });
  refs.historySharedSelect?.addEventListener("change", () => {
    expandedHistoryRecordId = "";
    expandedHistoryGroups = {};
    historyComparisonState = null;
    refreshHistoryDialog();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".top-menu-wrap")) return;
    closeTopMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTopMenu();
  });
  window.addEventListener("online", () => {
    if (isForcedOffline()) {
      updateSyncUi();
      return;
    }
    if (currentUser) {
      uploadPendingPhotos({ markDirty: true }).catch(() => null);
      syncNow();
    } else if (appUnlocked) {
      updateSyncUi("Интернет появился · нажмите «Синхр.» для проверки входа");
    }
  });
  window.addEventListener("offline", () => {
    const hadUser = Boolean(currentUser);
    currentUser = null;
    appUnlocked = true;
    if (isExplicitlySignedOut() || !hadUser) {
      enterSignedOutPublicMode("Офлайн · личные списки скрыты, открыт demo/public режим").catch(() => {
        setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
        render();
        updateSyncUi("Офлайн · личные списки скрыты, открыт demo/public режим");
      });
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi("Офлайн · локальная укладка доступна");
  });
  window.addEventListener("focus", handleWindowReturn);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) handleWindowReturn();
  });
  window.addEventListener("resize", () => {
    updateViewScopedControls();
    updateCompactStickyControls();
    scheduleFixedScrollbarRefresh();
  }, { passive: true });
  window.addEventListener("scroll", () => {
    updateCompactStickyControls();
    scheduleFilterNavigationRefresh();
  }, { passive: true });
  document.querySelector("#exportBtn").addEventListener("click", exportData);
  document.querySelector("#resetBtn").addEventListener("click", resetData);

  appUnlocked = true;
  const sharedListId = sharedListIdFromLocation();
  const signedOut = isExplicitlySignedOut();
  const offlineNow = "onLine" in navigator && !navigator.onLine;
  const shouldLoadLocalFirst = Boolean(sharedListId) || (!signedOut && isForcedOffline());
  if (shouldLoadLocalFirst) {
    repairActiveEmptyAdminDemoDraft();
    clearActiveAdminDemoStateOnStartup();
    render();
    updateSyncUi();
  } else {
    initialRemoteLoadPending = true;
    updateSyncUi("Проверяю вход...");
  }
  startRemoteStateWatcher();
  if (sharedListId) {
    openSharedListFromLink(sharedListId);
  } else if (isForcedOffline()) {
    if (signedOut) enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыт demo/public режим");
    else unlockOfflineState("Принудительно офлайн · локальная укладка доступна");
  } else if (offlineNow) {
    enterSignedOutPublicMode("Офлайн · вход не подтверждён, открыт demo/public режим");
  } else {
    checkAuthAndLoad();
  }
}

function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    if (document.body.classList.contains("dragging-ui") || document.body.classList.contains("drag-pending-ui")) return;
    const now = Date.now();
    if (now - lastTouchEnd <= 320) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false, capture: true });

  document.addEventListener("dblclick", (event) => {
    event.preventDefault();
  }, { capture: true });
}

function blurActiveEditableBeforeButtonAction(event) {
  const button = event.target.closest?.("button");
  if (!button || button.disabled) return;
  if (button.closest?.("dialog")?.open) return;
  if (button.closest?.(".search-control-row, .filter-field")) return;
  if (button === refs.saveRootContainerBtn) return;
  const active = document.activeElement;
  if (!isEditableElement(active) || button.contains(active)) return;
  active.blur();
}

function isEditableElement(element) {
  if (!element || element === document.body) return false;
  if (element.matches?.("input, textarea, select")) return true;
  return Boolean(element.isContentEditable);
}

function setupTouchActionButtonFeedback() {
  let activeButton = null;
  let startX = 0;
  let startY = 0;
  let feedbackTimer = null;
  let moved = false;
  const selector = ".edit-button, .copy-item-button, .remove-layout-button, .delete-item-button, .add-to-container-button, .collapse-button";

  const clearFeedbackTimer = () => {
    if (!feedbackTimer) return;
    window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
  };

  const clearActiveButton = () => {
    clearFeedbackTimer();
    activeButton?.classList.remove("touch-feedback-active");
    activeButton = null;
  };

  const scheduleFeedback = () => {
    clearFeedbackTimer();
    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      if (!moved) activeButton?.classList.add("touch-feedback-active");
    }, 70);
  };

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    const button = event.target.closest?.(selector);
    if (!button || button.disabled) return;
    clearActiveButton();
    const touch = event.touches[0];
    activeButton = button;
    startX = touch.clientX;
    startY = touch.clientY;
    moved = false;
    scheduleFeedback();
  }, { passive: true, capture: true });

  document.addEventListener("touchmove", (event) => {
    if (!activeButton || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const distance = Math.hypot(touch.clientX - startX, touch.clientY - startY);
    if (distance <= 8) return;
    moved = true;
    clearActiveButton();
  }, { passive: true, capture: true });

  document.addEventListener("touchend", () => {
    if (!activeButton) return;
    clearFeedbackTimer();
    if (!moved) {
      activeButton.classList.add("touch-feedback-active");
      window.setTimeout(clearActiveButton, 130);
      return;
    }
    clearActiveButton();
  }, { passive: true, capture: true });

  document.addEventListener("touchcancel", clearActiveButton, { passive: true, capture: true });
}

function setupModalScrollLock() {
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", updateModalScrollLock);
    dialog.addEventListener("cancel", () => requestAnimationFrame(updateModalScrollLock));
  });
  document.addEventListener("touchstart", captureModalTouchStart, { passive: true, capture: true });
  document.addEventListener("touchmove", preventBackgroundModalScroll, { passive: false, capture: true });
  document.addEventListener("wheel", preventBackgroundModalWheel, { passive: false, capture: true });
}

function openModalDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  updateModalScrollLock();
}

function hasOpenModalDialog() {
  return Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);
}

function updateModalScrollLock() {
  if (hasOpenModalDialog()) {
    lockPageScrollForModal();
  } else {
    unlockPageScrollForModal();
  }
}

function lockPageScrollForModal() {
  if (modalScrollLock) return;
  const softLock = shouldUseSoftModalScrollLock();
  modalScrollLock = {
    softLock,
    x: window.scrollX,
    y: window.scrollY,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    overflow: document.body.style.overflow
  };
  document.body.classList.add("modal-scroll-locked");
  if (softLock) return;
  document.body.style.position = "fixed";
  document.body.style.top = `-${modalScrollLock.y}px`;
  document.body.style.left = `-${modalScrollLock.x}px`;
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

function unlockPageScrollForModal() {
  if (!modalScrollLock) return;
  const { softLock, x, y, position, top, left, right, width, overflow } = modalScrollLock;
  modalScrollLock = null;
  document.body.classList.remove("modal-scroll-locked");
  if (softLock) return;
  document.body.style.position = position;
  document.body.style.top = top;
  document.body.style.left = left;
  document.body.style.right = right;
  document.body.style.width = width;
  document.body.style.overflow = overflow;
  window.scrollTo(x, y);
}

function shouldUseSoftModalScrollLock() {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  return Boolean(coarsePointer && window.innerWidth <= 760);
}

function captureModalTouchStart(event) {
  modalTouchStartY = event.touches?.[0]?.clientY || 0;
}

function preventBackgroundModalScroll(event) {
  if (!modalScrollLock) return;
  const dialog = event.target.closest?.("dialog");
  if (dialog?.open && event.target !== dialog) {
    const currentY = event.touches?.[0]?.clientY || modalTouchStartY;
    const deltaY = currentY - modalTouchStartY;
    if (canScrollInsideOpenDialog(event.target, dialog, deltaY)) return;
  }
  event.preventDefault();
}

function preventBackgroundModalWheel(event) {
  if (!modalScrollLock) return;
  const dialog = event.target.closest?.("dialog");
  if (dialog?.open && event.target !== dialog && canScrollInsideOpenDialog(event.target, dialog, -event.deltaY)) return;
  event.preventDefault();
}

function canScrollInsideOpenDialog(target, dialog, deltaY) {
  if (!deltaY) return true;
  const scroller = findModalScrollableAncestor(target, dialog);
  if (!scroller) return false;
  const maxScroll = scroller.scrollHeight - scroller.clientHeight;
  if (maxScroll <= 0) return false;
  if (deltaY > 0) return scroller.scrollTop > 0;
  return scroller.scrollTop < maxScroll - 1;
}

function findModalScrollableAncestor(target, dialog) {
  let element = target;
  while (element && element !== dialog && element !== document.body) {
    if (element.scrollHeight > element.clientHeight + 1) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return element;
    }
    element = element.parentElement;
  }
  return null;
}

function createEmptyUserState() {
  const leftId = "demo-left-bag";
  const rightId = "demo-right-bag";
  const bikeId = "demo-bike";
  const selfId = "demo-on-self";
  const clothesKitId = "demo-clothes-kit";
  const repairKitId = "demo-repair-kit";
  const hygieneKitId = "demo-hygiene-kit";
  const foodKitId = "demo-food-kit";
  const bikePocketId = "demo-bike-pocket";
  const selfPocketId = "demo-self-pocket";
  const items = {
    "demo-item-jacket": {
      id: "demo-item-jacket",
      name: "Легкая куртка",
      weight: 280,
      location: "Дом",
      category: "Одежда",
      containerId: clothesKitId,
      note: ""
    },
    "demo-item-snack": {
      id: "demo-item-snack",
      name: "Перекус на день",
      weight: 450,
      location: "Надо купить",
      category: "Еда",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-gas": {
      id: "demo-item-gas",
      name: "Газовый баллон",
      weight: 230,
      location: "Надо купить",
      category: "Кухня",
      containerId: leftId,
      note: ""
    },
    "demo-item-rain-pants": {
      id: "demo-item-rain-pants",
      name: "Дождевые штаны",
      weight: 230,
      location: "Дом",
      category: "Одежда",
      containerId: clothesKitId,
      note: ""
    },
    "demo-item-first-aid": {
      id: "demo-item-first-aid",
      name: "Мини-аптечка",
      weight: 190,
      location: "Дача",
      category: "Медицина",
      containerId: rightId,
      note: ""
    },
    "demo-item-tube": {
      id: "demo-item-tube",
      name: "Запасная камера",
      weight: 120,
      location: "Дом",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-tool": {
      id: "demo-item-tool",
      name: "Мультитул",
      weight: 180,
      location: "Не знаю где",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-patches": {
      id: "demo-item-patches",
      name: "Заплатки для камеры",
      weight: 35,
      location: "Дом",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-chain-link": {
      id: "demo-item-chain-link",
      name: "Замок цепи",
      weight: 12,
      location: "Не знаю где",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-toothbrush": {
      id: "demo-item-toothbrush",
      name: "Зубная щетка и паста",
      weight: 90,
      location: "Дом",
      category: "Гигиена",
      containerId: hygieneKitId,
      note: ""
    },
    "demo-item-towel": {
      id: "demo-item-towel",
      name: "Полотенце маленькое",
      weight: 110,
      location: "Дом",
      category: "Гигиена",
      containerId: hygieneKitId,
      note: ""
    },
    "demo-item-porridge": {
      id: "demo-item-porridge",
      name: "Каши на завтрак",
      weight: 360,
      location: "Надо купить",
      category: "Еда",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-mug": {
      id: "demo-item-mug",
      name: "Кружка",
      weight: 95,
      location: "Дом",
      category: "Кухня",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-bottle": {
      id: "demo-item-bottle",
      name: "Фляга с водой",
      weight: 850,
      location: "Уже на велосипеде",
      category: "Вода",
      containerId: bikeId,
      note: ""
    },
    "demo-item-pump": {
      id: "demo-item-pump",
      name: "Насос",
      weight: 160,
      location: "Уже на велосипеде",
      category: "Ремонт",
      containerId: bikePocketId,
      note: ""
    },
    "demo-item-front-light": {
      id: "demo-item-front-light",
      name: "Передний фонарь",
      weight: 95,
      location: "Дом",
      category: "Электроника",
      containerId: bikePocketId,
      note: ""
    },
    "demo-item-phone": {
      id: "demo-item-phone",
      name: "Телефон",
      weight: 210,
      location: "Дом",
      category: "Электроника",
      containerId: selfPocketId,
      note: ""
    },
    "demo-item-documents": {
      id: "demo-item-documents",
      name: "Документы",
      weight: 80,
      location: "Дом",
      category: "Документы",
      containerId: selfPocketId,
      note: ""
    },
    "demo-item-glasses": {
      id: "demo-item-glasses",
      name: "Очки",
      weight: 35,
      location: "Не знаю где",
      category: "Прочее",
      containerId: selfId,
      note: ""
    },
    "demo-item-powerbank": {
      id: "demo-item-powerbank",
      name: "Повербанк",
      weight: 320,
      location: "Дом",
      category: "Электроника",
      containerId: selfPocketId,
      note: ""
    }
  };
  return {
    locations: ["Дом", "Дача", "Уже на велосипеде", "Надо купить", "Не знаю где"],
    categories: ["Одежда", "Еда", "Вода", "Ремонт", "Медицина", "Кухня", "Электроника", "Документы", "Гигиена", REQUIRED_CHARGE_CATEGORY, "Прочее"],
    containers: {
      [leftId]: {
        id: leftId,
        name: "Левая сумка",
        parentId: null,
        childIds: [clothesKitId, foodKitId],
        itemIds: ["demo-item-gas"],
        order: [
          { type: "container", id: clothesKitId },
          { type: "container", id: foodKitId },
          { type: "item", id: "demo-item-gas" }
        ]
      },
      [clothesKitId]: {
        id: clothesKitId,
        name: "Пакет с одеждой",
        parentId: leftId,
        childIds: [],
        itemIds: ["demo-item-jacket", "demo-item-rain-pants"],
        order: [
          { type: "item", id: "demo-item-jacket" },
          { type: "item", id: "demo-item-rain-pants" }
        ]
      },
      [foodKitId]: {
        id: foodKitId,
        name: "Пакет с едой",
        parentId: leftId,
        childIds: [],
        itemIds: ["demo-item-snack", "demo-item-porridge", "demo-item-mug"],
        order: [
          { type: "item", id: "demo-item-snack" },
          { type: "item", id: "demo-item-porridge" },
          { type: "item", id: "demo-item-mug" }
        ]
      },
      [rightId]: {
        id: rightId,
        name: "Правая сумка",
        parentId: null,
        childIds: [repairKitId, hygieneKitId],
        itemIds: ["demo-item-first-aid"],
        order: [
          { type: "container", id: repairKitId },
          { type: "container", id: hygieneKitId },
          { type: "item", id: "demo-item-first-aid" }
        ]
      },
      [repairKitId]: {
        id: repairKitId,
        name: "Пакет для ремонта",
        parentId: rightId,
        childIds: [],
        itemIds: ["demo-item-tube", "demo-item-tool", "demo-item-patches", "demo-item-chain-link"],
        order: [
          { type: "item", id: "demo-item-tube" },
          { type: "item", id: "demo-item-tool" },
          { type: "item", id: "demo-item-patches" },
          { type: "item", id: "demo-item-chain-link" }
        ]
      },
      [hygieneKitId]: {
        id: hygieneKitId,
        name: "Гигиена",
        parentId: rightId,
        childIds: [],
        itemIds: ["demo-item-toothbrush", "demo-item-towel"],
        order: [
          { type: "item", id: "demo-item-toothbrush" },
          { type: "item", id: "demo-item-towel" }
        ]
      },
      [bikeId]: {
        id: bikeId,
        name: "На велосипеде",
        parentId: null,
        childIds: [bikePocketId],
        itemIds: ["demo-item-bottle"],
        order: [
          { type: "item", id: "demo-item-bottle" },
          { type: "container", id: bikePocketId }
        ]
      },
      [bikePocketId]: {
        id: bikePocketId,
        name: "Бардачок на раме",
        parentId: bikeId,
        childIds: [],
        itemIds: ["demo-item-pump", "demo-item-front-light"],
        order: [
          { type: "item", id: "demo-item-pump" },
          { type: "item", id: "demo-item-front-light" }
        ]
      },
      [selfId]: {
        id: selfId,
        name: "На себе",
        parentId: null,
        childIds: [selfPocketId],
        itemIds: ["demo-item-glasses"],
        order: [
          { type: "item", id: "demo-item-glasses" },
          { type: "container", id: selfPocketId }
        ]
      },
      [selfPocketId]: {
        id: selfPocketId,
        name: "Карманы куртки",
        parentId: selfId,
        childIds: [],
        itemIds: ["demo-item-phone", "demo-item-documents", "demo-item-powerbank"],
        order: [
          { type: "item", id: "demo-item-phone" },
          { type: "item", id: "demo-item-documents" },
          { type: "item", id: "demo-item-powerbank" }
        ]
      }
    },
    items,
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Демо-укладка",
        rootContainerIds: [leftId, rightId, bikeId, selfId]
      }
    },
    activeLayoutId: "layout-main",
    collapsedContainers: {
      [repairKitId]: true,
      [hygieneKitId]: true,
      [foodKitId]: true,
      [clothesKitId]: true,
      [bikePocketId]: true,
      [selfPocketId]: true
    },
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    showItemMeta: true,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
}

function createEmptyPublicTemplateState(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  const layoutId = "layout-main";
  const name = I18N[normalized]?.["demo.layoutName"] || I18N[DEFAULT_LANGUAGE]?.["demo.layoutName"] || "Demo layout";
  const template = createBlankBikePackingState();
  template.layouts = {
    [layoutId]: {
      id: layoutId,
      name,
      rootContainerIds: [],
      arrangement: {
        rootContainerIds: [],
        containers: {},
        items: {},
        packedItems: {}
      }
    }
  };
  template.activeLayoutId = layoutId;
  return template;
}

function createDemoSeedState() {
  return createEmptyUserState();
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const initial = createEmptyUserState();
    normalizeContainerFields(initial);
    normalizeItemFields(initial);
    repairContainerMembershipFromItemLinks(initial);
    normalizeLayoutFields(initial);
    normalizeItemCategories(initial);
    migrateContainerOrder(initial);
    applyLayoutArrangement(initial.activeLayoutId, initial);
    applyDefaultCollapsedContainers(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(saved);
    if (!parsed.collapsedContainers) parsed.collapsedContainers = {};
    if (typeof parsed.showItemMeta !== "boolean") parsed.showItemMeta = false;
    if (typeof parsed.showFilterContext !== "boolean") parsed.showFilterContext = false;
    if (typeof parsed.collectionMode !== "boolean") parsed.collectionMode = false;
    if (typeof parsed.showOnlyUnpacked !== "boolean") parsed.showOnlyUnpacked = false;
    if (!parsed.packedItems || typeof parsed.packedItems !== "object") parsed.packedItems = {};
    normalizeContainerFields(parsed);
    normalizeItemFields(parsed);
    cleanupGeneratedCatalogArtifacts(parsed);
    repairContainerMembershipFromItemLinks(parsed);
    normalizeLayoutFields(parsed);
    normalizeItemCategories(parsed);
    migrateContainerOrder(parsed);
    applyLayoutArrangement(parsed.activeLayoutId, parsed);
    applyDefaultCollapsedContainers(parsed);
    const recovered = recoverBetterLocalSnapshotIfNeeded(parsed);
    if (recovered) {
      persistStateSnapshot(recovered);
      return recovered;
    }
    if (isSuspiciousEmptyPackingState(parsed)) {
      const fallback = createEmptyUserState();
      normalizeContainerFields(fallback);
      normalizeItemFields(fallback);
      repairContainerMembershipFromItemLinks(fallback);
      normalizeLayoutFields(fallback);
      normalizeItemCategories(fallback);
      migrateContainerOrder(fallback);
      applyLayoutArrangement(fallback.activeLayoutId, fallback);
      applyDefaultCollapsedContainers(fallback);
      return fallback;
    }
    persistStateSnapshot(parsed);
    return parsed;
  } catch {
    return createEmptyUserState();
  }
}

function hasLocalSavedState() {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

function loadBaseState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BASE_STATE_KEY));
    return normalizeRemoteState(parsed);
  } catch {
    return null;
  }
}

function saveBaseState(nextState = state) {
  safeSetLocalStorage(BASE_STATE_KEY, JSON.stringify(nextState));
}

function loadRecoverySnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECOVERY_STATE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecoverySnapshot(reason, snapshot = state) {
  try {
    if (!isMeaningfulPackingState(snapshot)) return;
    const entry = {
      createdAt: nowIso(),
      reason: String(reason || "snapshot"),
      stats: stateStats(snapshot),
      payload: JSON.parse(JSON.stringify(snapshot))
    };
    const snapshots = loadRecoverySnapshots();
    snapshots.unshift(entry);
    safeSetLocalStorage(RECOVERY_STATE_KEY, JSON.stringify(snapshots.slice(0, RECOVERY_STATE_MAX)));
  } catch {
    // Recovery snapshots are best-effort and must never interrupt the app.
  }
}

function recoverBetterLocalSnapshotIfNeeded(currentState) {
  try {
    const currentStats = stateStats(currentState);
    if (currentStats.nestedContainers >= 4 && currentStats.items < 250) return null;
    const snapshots = loadRecoverySnapshots();
    let best = null;
    let bestScore = 0;
    snapshots.forEach((entry) => {
      const candidate = normalizeRecoveryPayload(entry?.payload);
      if (!candidate) return;
      const stats = stateStats(candidate);
      if (stats.items < 10 || stats.containers < 6 || stats.nestedContainers < 6) return;
      if (stats.items < Math.max(10, Math.floor(currentStats.items * 0.25))) return;
      if (stats.placedItems < Math.max(5, Math.floor(currentStats.placedItems * 0.5))) return;
      const hierarchyGain = stats.nestedContainers - currentStats.nestedContainers;
      const bloatDrop = currentStats.items - stats.items;
      if (hierarchyGain < 4 && bloatDrop < 50) return;
      const score = stats.nestedContainers * 5 + Math.max(stats.placedItems, stats.linkedItems) + bloatDrop;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    if (!best) return null;
    return best;
  } catch {
    return null;
  }
}

function normalizeRecoveryPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidate = JSON.parse(JSON.stringify(payload));
  if (!candidate.locations || !candidate.categories || !candidate.containers || !candidate.items || !candidate.layouts) return null;
  if (!candidate.collapsedContainers) candidate.collapsedContainers = {};
  if (!candidate.packedItems || typeof candidate.packedItems !== "object") candidate.packedItems = {};
  normalizeContainerFields(candidate);
  normalizeItemFields(candidate);
  cleanupGeneratedCatalogArtifacts(candidate);
  repairContainerMembershipFromItemLinks(candidate);
  normalizeLayoutFields(candidate);
  normalizeItemCategories(candidate);
  migrateContainerOrder(candidate);
  applyLayoutArrangement(candidate.activeLayoutId, candidate);
  applyDefaultCollapsedContainers(candidate);
  return candidate;
}

function loadSyncDevice() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_META_KEY));
    if (saved?.id && saved?.name) return saved;
  } catch {
    // Recreate below.
  }
  const meta = {
    id: globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: guessDeviceName()
  };
  try {
    safeSetLocalStorage(DEVICE_META_KEY, JSON.stringify(meta));
  } catch {
    // Device labels are optional sync metadata.
  }
  return meta;
}

function guessDeviceName() {
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  return "Это устройство";
}

function loadSyncMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {};
    return {
      dirty: Boolean(meta.dirty),
      serverUpdatedAt: meta.serverUpdatedAt || null,
      localUpdatedAt: meta.localUpdatedAt || null,
      lastSyncedLocalUpdatedAt: meta.lastSyncedLocalUpdatedAt || null,
      stateRevision: normalizeStateRevision(meta.stateRevision ?? meta.state_revision),
      payloadHash: meta.payloadHash || null,
      entityHash: meta.entityHash || null,
      itemCount: normalizeIntegrityCount(meta.itemCount),
      containerCount: normalizeIntegrityCount(meta.containerCount),
      layoutCount: normalizeIntegrityCount(meta.layoutCount),
      payloadSize: normalizeIntegrityCount(meta.payloadSize)
    };
  } catch {
    return {
      dirty: false,
      serverUpdatedAt: null,
      localUpdatedAt: null,
      lastSyncedLocalUpdatedAt: null,
      stateRevision: null,
      payloadHash: null,
      entityHash: null,
      itemCount: null,
      containerCount: null,
      layoutCount: null,
      payloadSize: null
    };
  }
}

function saveSyncMeta() {
  safeSetLocalStorage(SYNC_META_KEY, JSON.stringify(syncMeta));
}

function loadUiSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY)) || {};
    return {
      itemSortMode: normalizeSortMode(parsed.itemSortMode),
      rootContainerSortMode: normalizeSortMode(parsed.rootContainerSortMode)
    };
  } catch {
    return {
      itemSortMode: "asc",
      rootContainerSortMode: "asc"
    };
  }
}

function saveUiSettings() {
  try {
    safeSetLocalStorage(UI_SETTINGS_KEY, JSON.stringify({
      itemSortMode: normalizeSortMode(itemSortMode),
      rootContainerSortMode: normalizeSortMode(rootContainerSortMode)
    }));
  } catch {
    // Sorting preferences are local convenience settings.
  }
}

function loadActivePackingListId() {
  try {
    const listId = localStorage.getItem(ACTIVE_LIST_ID_KEY) || "";
    if (isPublicTemplateListId(listId)) {
      localStorage.removeItem(ACTIVE_LIST_ID_KEY);
      return "";
    }
    return listId;
  } catch {
    return "";
  }
}

function isPublicTemplateListId(listId) {
  const id = String(listId || "").trim();
  return id === "public-demo-state" ||
    id.startsWith("public-demo-state-") ||
    id.startsWith("public-shared-layout-");
}

function saveActivePackingListId(listId) {
  currentPackingListId = isPublicTemplateListId(listId) ? "" : String(listId || "");
  if (!currentPackingListId) currentPackingListMeta = null;
  try {
    if (currentPackingListId) safeSetLocalStorage(ACTIVE_LIST_ID_KEY, currentPackingListId);
    else localStorage.removeItem(ACTIVE_LIST_ID_KEY);
  } catch {
    // Active list id is a convenience cache; sync can still work through the legacy endpoint.
  }
}

function normalizeActiveLayoutChoice(choice) {
  const value = String(choice || "").trim();
  if (!value) return "";
  if (value === DEMO_LAYOUT_SELECT_VALUE) return value;
  if (value.startsWith("shared:")) return value.slice("shared:".length) ? value : "";
  return value;
}

function isPrivateLayoutChoice(choice) {
  const normalized = normalizeActiveLayoutChoice(choice);
  return Boolean(normalized && normalized !== DEMO_LAYOUT_SELECT_VALUE && !normalized.startsWith("shared:"));
}

function isPrivateUserLayoutId(layoutId) {
  const layout = state.layouts?.[layoutId];
  return Boolean(layout && !layout.adminDemo && !layout.adminSharedSourceId && !layout?.[GUEST_DEMO_COPY_FLAG]);
}

function loadActiveLayoutChoice() {
  try {
    return normalizeActiveLayoutChoice(localStorage.getItem(ACTIVE_LAYOUT_CHOICE_KEY) || "");
  } catch {
    return "";
  }
}

function loadActivePrivateLayoutChoice() {
  try {
    const choice = normalizeActiveLayoutChoice(localStorage.getItem(ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY) || "");
    return isPrivateLayoutChoice(choice) && isPrivateUserLayoutId(choice) ? choice : "";
  } catch {
    return "";
  }
}

function isActiveLayoutChoiceExplicit() {
  try {
    return localStorage.getItem(ACTIVE_LAYOUT_CHOICE_SOURCE_KEY) === "explicit";
  } catch {
    return false;
  }
}

function saveActiveLayoutChoice(choice) {
  const normalized = normalizeActiveLayoutChoice(choice);
  try {
    if (normalized) {
      safeSetLocalStorage(ACTIVE_LAYOUT_CHOICE_KEY, normalized);
      safeSetLocalStorage(ACTIVE_LAYOUT_CHOICE_SOURCE_KEY, "explicit");
    } else {
      localStorage.removeItem(ACTIVE_LAYOUT_CHOICE_KEY);
      localStorage.removeItem(ACTIVE_LAYOUT_CHOICE_SOURCE_KEY);
    }
    if (isPrivateLayoutChoice(normalized) && isPrivateUserLayoutId(normalized)) {
      safeSetLocalStorage(ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY, normalized);
    }
  } catch {
    // The last opened layout is only a UI preference.
  }
}

function currentLayoutChoice() {
  const readonlyId = activeReadOnlyLayoutId();
  if (isReadOnlyStateScope()) {
    return readonlyId === DEMO_SHARED_LAYOUT_ID ? DEMO_LAYOUT_SELECT_VALUE : `shared:${readonlyId}`;
  }
  const layout = state.layouts?.[state.activeLayoutId];
  if (layout?.adminDemo) return DEMO_LAYOUT_SELECT_VALUE;
  if (layout?.adminSharedSourceId) return `shared:${layout.adminSharedSourceId}`;
  return state.activeLayoutId || "";
}

function rememberActiveLayoutChoice(choice = currentLayoutChoice()) {
  saveActiveLayoutChoice(choice);
  if (isPrivateLayoutChoice(choice)) {
    explicitLayoutChoice = { id: choice, at: Date.now() };
  }
}

function rememberPrivateServerLayoutChoice() {
  const layoutId = state.layouts?.[state.activeLayoutId] ? state.activeLayoutId : Object.values(state.layouts || {})[0]?.id || "";
  if (!layoutId || !isPrivateUserLayoutId(layoutId)) return;
  saveActiveLayoutChoice(layoutId);
}

function layoutArrangementScore(targetState, layout) {
  if (!layout || typeof layout !== "object") return 0;
  const containers = targetState?.containers || {};
  const items = targetState?.items || {};
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const arrangedItems = arrangement.items && typeof arrangement.items === "object"
    ? Object.entries(arrangement.items).filter(([itemId, containerId]) => items[itemId] && containers[containerId]).length
    : 0;
  const linkedItems = Object.values(arrangement.containers || {}).reduce((sum, placement) => {
    return sum + uniqueLayoutIds(Array.isArray(placement?.itemIds) ? placement.itemIds : []).filter((itemId) => items[itemId]).length;
  }, 0);
  const nestedContainers = Object.values(arrangement.containers || {}).filter((placement) =>
    placement?.parentId && containers[placement.parentId]
  ).length;
  const roots = uniqueLayoutIds([
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
    ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
  ]).filter((containerId) => containers[containerId]).length;
  return layoutArrangementContentScore(targetState, layout) + roots;
}

function layoutArrangementContentScore(targetState, layout) {
  if (!layout || typeof layout !== "object") return 0;
  const containers = targetState?.containers || {};
  const items = targetState?.items || {};
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const arrangedItems = arrangement.items && typeof arrangement.items === "object"
    ? Object.entries(arrangement.items).filter(([itemId, containerId]) => items[itemId] && containers[containerId]).length
    : 0;
  const linkedItems = Object.values(arrangement.containers || {}).reduce((sum, placement) => {
    return sum + uniqueLayoutIds(Array.isArray(placement?.itemIds) ? placement.itemIds : []).filter((itemId) => items[itemId]).length;
  }, 0);
  const nestedContainers = Object.values(arrangement.containers || {}).filter((placement) =>
    placement?.parentId && containers[placement.parentId]
  ).length;
  return Math.max(arrangedItems, linkedItems) + nestedContainers;
}

function isMeaningfulLayout(targetState, layout) {
  return layoutArrangementContentScore(targetState, layout) > 0;
}

function bestMeaningfulLayoutId(targetState) {
  return Object.values(targetState?.layouts || {})
    .filter((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId)
    .sort((a, b) => layoutArrangementScore(targetState, b) - layoutArrangementScore(targetState, a))[0]?.id || "";
}

function isRecentExplicitLayoutChoice(layoutId, maxAgeMs = 30000) {
  return Boolean(layoutId && explicitLayoutChoice.id === layoutId && Date.now() - explicitLayoutChoice.at <= maxAgeMs);
}

function resolvePreferredLayoutId(targetState, preferredLayoutId = "", preferredLayoutName = "", { allowEmptyPreferred = false } = {}) {
  const layouts = targetState?.layouts || {};
  if (allowEmptyPreferred && preferredLayoutId && layouts[preferredLayoutId]) return preferredLayoutId;
  if (preferredLayoutId && isMeaningfulLayout(targetState, layouts[preferredLayoutId])) return preferredLayoutId;
  const normalizedName = String(preferredLayoutName || "").trim().toLowerCase();
  if (normalizedName) {
    const byName = Object.values(layouts).find((layout) =>
      String(layout?.name || "").trim().toLowerCase() === normalizedName &&
      isMeaningfulLayout(targetState, layout)
    );
    if (byName?.id) return byName.id;
  }
  const activeLayout = layouts[targetState?.activeLayoutId];
  if (isMeaningfulLayout(targetState, activeLayout)) return activeLayout.id;
  const bestLayoutId = bestMeaningfulLayoutId(targetState);
  if (bestLayoutId) return bestLayoutId;
  if (preferredLayoutId && layouts[preferredLayoutId]) return preferredLayoutId;
  return "";
}

function preferredCurrentLayoutRef() {
  const layout = state.layouts?.[state.activeLayoutId];
  return {
    id: state.activeLayoutId || "",
    name: layout?.name || "",
    allowEmpty: Boolean(state.activeLayoutId && state.layouts?.[state.activeLayoutId])
  };
}

async function restoreSavedLayoutChoice({ publicOnly = false, privateOnly = false } = {}) {
  const explicitChoice = isActiveLayoutChoiceExplicit();
  const activePrivateChoice = !publicOnly && isPrivateUserLayoutId(state.activeLayoutId)
    ? state.activeLayoutId
    : "";
  const privateChoice = !publicOnly ? loadActivePrivateLayoutChoice() || activePrivateChoice : "";
  let choice = loadActiveLayoutChoice();
  const adminPublicChoice = !publicOnly && canOpenAdminPublishedEdit() && (
    choice === DEMO_LAYOUT_SELECT_VALUE ||
    String(choice || "").startsWith("shared:")
  );
  if (privateOnly && adminPublicChoice) choice = privateChoice;
  if (!privateOnly && !adminPublicChoice && !publicOnly && choice === DEMO_LAYOUT_SELECT_VALUE && !explicitChoice && privateChoice) choice = privateChoice;
  if (!publicOnly && isPrivateLayoutChoice(choice) && !isPrivateUserLayoutId(choice) && privateChoice) choice = privateChoice;
  if (!choice) choice = privateChoice;
  if (!choice) return false;
  if (choice === DEMO_LAYOUT_SELECT_VALUE) {
    if (privateOnly) return false;
    if (canOpenAdminPublishedEdit() && !publicOnly) await openAdminDemoLayout({ remember: false });
    else await openDemoLayoutFromSelect({ remember: false });
    return true;
  }
  if (choice.startsWith("shared:")) {
    if (privateOnly) return false;
    const layoutId = choice.slice("shared:".length);
    if (!findSharedLayout(layoutId)) return false;
    if (canOpenAdminPublishedEdit() && !publicOnly) await openSharedLayoutForAdmin(layoutId, { remember: false });
    else await openSharedLayoutViewer(layoutId, { remember: false });
    return true;
  }
  const savedLayout = state.layouts?.[choice];
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminDemo) {
    await openAdminDemoLayout({ remember: false });
    return true;
  }
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminSharedSourceId) {
    await openSharedLayoutForAdmin(savedLayout.adminSharedSourceId, { remember: false });
    return true;
  }
  if (publicOnly || !canUsePrivateState() || !isPrivateUserLayoutId(choice)) return false;
  openPrivateLayout(choice, { remember: false });
  saveActiveLayoutChoice(choice);
  return true;
}

function rememberCurrentPackingListRecord(record) {
  const normalized = normalizeRemoteListRecord(record);
  const id = remoteRecordId(normalized);
  if (isPublicTemplateListId(id) || isReadOnlyBikePackingRecord(normalized)) {
    saveActivePackingListId("");
    return normalized;
  }
  if (id) saveActivePackingListId(id);
  currentPackingListMeta = normalized;
  return normalized;
}

function normalizeSortMode(value) {
  return ["asc", "desc", "none"].includes(value) ? value : "asc";
}

function normalizeContainerFields(targetState = state) {
  const fallbackLocation = defaultRootContainerLocation(targetState);
  Object.values(targetState.containers || {}).forEach((container) => {
    const weight = Number(container.weight || 0);
    const volume = Number(container.volume || 0);
    container.weight = Number.isFinite(weight) && weight > 0 ? Math.round(weight) : 0;
    container.volume = Number.isFinite(volume) && volume > 0 ? Math.round(volume * 10) / 10 : 0;
    const location = typeof container.location === "string" ? container.location.trim() : "";
    container.location = location || fallbackLocation;
    container.note = typeof container.note === "string" ? container.note : "";
    container.color = normalizeContainerColor(container.color);
    normalizeItemPhotos(container);
  });
}

function normalizeLayoutFields(targetState = state) {
  const containers = targetState.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const rootContainerIds = Object.values(containers)
    .filter((container) => container && !container.parentId)
    .map((container) => container.id)
    .filter(Boolean);
  const privateRootContainerIds = rootContainerIds.filter((containerId) =>
    !isGeneratedCatalogContainerSyncArtifact(containerId, containers[containerId]) &&
    !isGeneratedCatalogContainerStateArtifact(containerId, containers[containerId], targetState)
  );
  const containerIdSet = new Set(Object.keys(containers));
  if (!targetState.layouts || typeof targetState.layouts !== "object") targetState.layouts = {};

  Object.entries(targetState.layouts).forEach(([layoutId, layout]) => {
    if (!layout || typeof layout !== "object") {
      delete targetState.layouts[layoutId];
      return;
    }
    layout.id = layout.id || layoutId;
    layout.name = String(layout.name || "Текущая укладка").trim() || "Текущая укладка";
    const seen = new Set();
    const publicLayout = Boolean(layout.adminDemo || layout.adminSharedSourceId);
    layout.rootContainerIds = (Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
      .filter((containerId) => containerIdSet.has(containerId))
      .filter((containerId) => publicLayout ||
        (
          !isGeneratedCatalogContainerSyncArtifact(containerId, containers[containerId]) &&
          !isGeneratedCatalogContainerStateArtifact(containerId, containers[containerId], targetState)
        )
      )
      .filter((containerId) => {
        if (seen.has(containerId)) return false;
        seen.add(containerId);
        return true;
      });
    const hasStoredArrangement = Boolean(
      layout.arrangement &&
      typeof layout.arrangement === "object" &&
      (Array.isArray(layout.arrangement.rootContainerIds) ||
        (layout.arrangement.containers && typeof layout.arrangement.containers === "object") ||
        (layout.arrangement.items && typeof layout.arrangement.items === "object"))
    );
    const fallbackRootIds = publicLayout ? [] : privateRootContainerIds;
    if (!layout.rootContainerIds.length && !hasStoredArrangement && fallbackRootIds.length) {
      layout.rootContainerIds = [...fallbackRootIds];
    }
    normalizeLayoutArrangement(layout, targetState);
  });

  const layoutValues = Object.values(targetState.layouts);
  if (!layoutValues.length) {
    const id = "layout-main";
    targetState.layouts[id] = {
      id,
      name: "Текущая укладка",
      rootContainerIds: [...privateRootContainerIds]
    };
  }

  if (!targetState.activeLayoutId || !targetState.layouts[targetState.activeLayoutId]) {
    const firstWithContainers = Object.values(targetState.layouts).find((layout) => layout.rootContainerIds?.length);
    const fallback = firstWithContainers || Object.values(targetState.layouts)[0];
    targetState.activeLayoutId = fallback?.id || "layout-main";
  }
}

function normalizeLayoutArrangement(layout, targetState = state) {
  if (!layout || typeof layout !== "object") return createEmptyLayoutArrangement();
  const hadStoredArrangement = Boolean(
    layout.arrangement &&
    typeof layout.arrangement === "object" &&
    layout.arrangement.containers &&
    typeof layout.arrangement.containers === "object" &&
    layout.arrangement.items &&
    typeof layout.arrangement.items === "object"
  );
  if (
    !layout.arrangement ||
    typeof layout.arrangement !== "object" ||
    !layout.arrangement.containers ||
    typeof layout.arrangement.containers !== "object" ||
    !layout.arrangement.items ||
    typeof layout.arrangement.items !== "object"
  ) {
    repairContainerMembershipFromItemLinks(targetState);
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || []);
  }
  const arrangement = layout.arrangement;
  const containers = targetState.containers || {};
  const items = targetState.items || {};
  const containerIdSet = new Set(Object.keys(containers));
  const itemIdSet = new Set(Object.keys(items));
  const uniqueRootIds = [];
  const fallbackRootIds = Object.values(containers)
    .filter((container) => container && !container.parentId)
    .map((container) => container.id)
    .filter(Boolean);
  const sourceRootIds = [
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
    ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []),
    ...(!hadStoredArrangement ? fallbackRootIds : [])
  ];
  sourceRootIds.forEach((id) => {
    if (!containerIdSet.has(id) || uniqueRootIds.includes(id)) return;
    uniqueRootIds.push(id);
  });
  arrangement.rootContainerIds = uniqueRootIds;
  layout.rootContainerIds = uniqueRootIds;
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  repairBareLayoutRootArrangement(layout, targetState);
  Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
    if (!containerIdSet.has(containerId) || !placement || typeof placement !== "object") {
      delete arrangement.containers[containerId];
      return;
    }
    placement.parentId = placement.parentId && containerIdSet.has(placement.parentId) ? placement.parentId : "";
    placement.itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : []).filter((id) => itemIdSet.has(id));
    placement.childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((id) => containerIdSet.has(id));
    placement.order = (Array.isArray(placement.order) ? placement.order : [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? placement.itemIds.includes(entry.id) : placement.childIds.includes(entry.id))
      .filter((entry, index, list) => list.findIndex((item) => item.type === entry.type && item.id === entry.id) === index);
  });
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
    if (!itemIdSet.has(itemId) || !containerIdSet.has(containerId)) delete arrangement.items[itemId];
  });
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  Object.keys(arrangement.packedItems).forEach((itemId) => {
    if (!itemIdSet.has(itemId)) delete arrangement.packedItems[itemId];
  });
  const placedItems = Math.max(
    Object.values(items).filter((item) => item?.containerId && containerIdSet.has(item.containerId)).length,
    Object.values(containers).reduce((sum, container) => {
      return sum + uniqueLayoutIds(Array.isArray(container?.itemIds) ? container.itemIds : []).filter((itemId) => itemIdSet.has(itemId)).length;
    }, 0)
  );
  const arrangedItems = Object.keys(arrangement.items || {}).length;
  if (!hadStoredArrangement && placedItems >= 3 && arrangedItems < Math.max(1, Math.floor(placedItems * 0.5))) {
    repairContainerMembershipFromItemLinks(targetState);
    const rebuilt = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || uniqueRootIds);
    if (Object.keys(rebuilt.items || {}).length > arrangedItems) {
      layout.arrangement = rebuilt;
      return normalizeLayoutArrangement(layout, targetState);
    }
  }
  return arrangement;
}

function repairBareLayoutRootArrangement(layout, targetState = state) {
  const arrangement = layout?.arrangement;
  if (!layout || !arrangement || typeof arrangement !== "object") return false;
  let repaired = false;
  (layout.rootContainerIds || []).forEach((rootId) => {
    const currentScore = layoutArrangementContainerTreeScore(arrangement, rootId);
    const sourceLayout = findBestSourceLayoutForContainerTree(rootId, { excludeLayoutId: layout.id, targetState });
    const sourceArrangement = sourceLayout?.arrangement;
    const sourceScore = layoutArrangementContainerTreeScore(sourceArrangement, rootId);
    if (!sourceArrangement || sourceScore <= currentScore) return;
    const snapshot = snapshotContainerTreeFromLayoutArrangement(rootId, { sourceLayoutId: sourceLayout.id, targetState });
    if (!snapshot) return;
    Object.entries(snapshot.containers).forEach(([containerId, container]) => {
      arrangement.containers[containerId] = {
        parentId: container.parentId || "",
        itemIds: [...(container.itemIds || [])],
        childIds: [...(container.childIds || [])],
        order: (container.order || []).map((entry) => ({ type: entry.type, id: entry.id }))
      };
    });
    Object.entries(snapshot.items).forEach(([itemId, item]) => {
      if (item?.containerId) arrangement.items[itemId] = item.containerId;
    });
    repaired = true;
  });
  return repaired;
}

function captureActiveLayoutArrangement(targetState = state) {
  if (applyingLayoutArrangement) return;
  const layout = targetState.layouts?.[targetState.activeLayoutId];
  if (!layout) return;
  layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || []);
  layout.rootContainerIds = [...layout.arrangement.rootContainerIds];
}

function withLayoutArrangementApplied(layoutId, callback) {
  const previousLayoutId = state.activeLayoutId;
  const previousMode = snapshotModeState();
  const targetLayout = state.layouts?.[layoutId];
  if (!targetLayout) return callback?.();
  if (layoutId === previousLayoutId) return callback?.();
  captureActiveLayoutArrangement();
  state.activeLayoutId = layoutId;
  if (isAdminEditablePublishedLayout(layoutId)) setTemporaryAdminEditLayout(layoutId);
  applyLayoutArrangement(layoutId);
  try {
    return callback?.();
  } finally {
    captureActiveLayoutArrangement();
    state.activeLayoutId = previousLayoutId;
    restoreModeState(previousMode);
    if (previousLayoutId && state.layouts?.[previousLayoutId]) applyLayoutArrangement(previousLayoutId);
  }
}

async function withLayoutArrangementAppliedAsync(layoutId, callback) {
  const previousLayoutId = state.activeLayoutId;
  const previousMode = snapshotModeState();
  const targetLayout = state.layouts?.[layoutId];
  if (!targetLayout) return await callback?.();
  if (layoutId === previousLayoutId) return await callback?.();
  captureActiveLayoutArrangement();
  state.activeLayoutId = layoutId;
  if (isAdminEditablePublishedLayout(layoutId)) setTemporaryAdminEditLayout(layoutId);
  applyLayoutArrangement(layoutId);
  try {
    return await callback?.();
  } finally {
    captureActiveLayoutArrangement();
    state.activeLayoutId = previousLayoutId;
    restoreModeState(previousMode);
    if (previousLayoutId && state.layouts?.[previousLayoutId]) applyLayoutArrangement(previousLayoutId);
  }
}

function applyLayoutArrangement(layoutId = state.activeLayoutId, targetState = state) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return;
  const hadStoredArrangement = Boolean(
    layout.arrangement &&
    typeof layout.arrangement === "object" &&
    layout.arrangement.containers &&
    typeof layout.arrangement.containers === "object" &&
    layout.arrangement.items &&
    typeof layout.arrangement.items === "object"
  );
  applyingLayoutArrangement = true;
  try {
    repairContainerMembershipFromItemLinks(targetState);
    const previousItemContainers = {};
    const previousContainerParents = {};
    Object.entries(targetState.items || {}).forEach(([itemId, item]) => {
      if (item?.containerId && targetState.containers?.[item.containerId]) previousItemContainers[itemId] = item.containerId;
    });
    Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
      if (container?.parentId && targetState.containers?.[container.parentId]) {
        previousContainerParents[containerId] = container.parentId;
      }
    });
    const arrangement = normalizeLayoutArrangement(layout, targetState);
    const arrangedContainerIds = new Set(Object.keys(arrangement.containers || {}));
    Object.values(targetState.items || {}).forEach((item) => {
      item.containerId = "";
    });
    Object.values(targetState.containers || {}).forEach((container) => {
      container.parentId = null;
      container.childIds = [];
      container.itemIds = [];
      container.order = [];
    });
    layout.rootContainerIds = [...arrangement.rootContainerIds];
    Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
      const container = targetState.containers?.[containerId];
      if (!container) return;
      container.parentId = placement.parentId || null;
      container.childIds = [...(placement.childIds || [])].filter((id) => targetState.containers?.[id]);
      container.itemIds = [...(placement.itemIds || [])].filter((id) => targetState.items?.[id]);
      container.order = [...(placement.order || [])]
        .filter((entry) => entry.type === "item" ? targetState.items?.[entry.id] : targetState.containers?.[entry.id])
        .map((entry) => ({ type: entry.type, id: entry.id }));
    });
    Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
      if (targetState.items?.[itemId] && targetState.containers?.[containerId]) {
        targetState.items[itemId].containerId = containerId;
      }
    });
    if (!hadStoredArrangement) {
      Object.entries(previousItemContainers).forEach(([itemId, containerId]) => {
        const item = targetState.items?.[itemId];
        const container = targetState.containers?.[containerId];
        if (!item || item.containerId || !container) return;
        item.containerId = containerId;
        if (!container.itemIds.includes(itemId)) container.itemIds.push(itemId);
        if (!container.order.some((entry) => entry?.type === "item" && entry.id === itemId)) {
          container.order.push({ type: "item", id: itemId });
        }
      });
      Object.entries(previousContainerParents).forEach(([containerId, parentId]) => {
        const container = targetState.containers?.[containerId];
        const parent = targetState.containers?.[parentId];
        if (!container || !parent || container.parentId || arrangedContainerIds.has(containerId)) return;
        container.parentId = parentId;
        if (!parent.childIds.includes(containerId)) parent.childIds.push(containerId);
        if (!parent.order.some((entry) => entry?.type === "container" && entry.id === containerId)) {
          parent.order.push({ type: "container", id: containerId });
        }
      });
    }
    targetState.packedItems = { ...(arrangement.packedItems || {}) };
    repairContainerMembershipFromItemLinks(targetState);
    migrateContainerOrder(targetState);
  } finally {
    applyingLayoutArrangement = false;
  }
}

function switchActiveLayout(layoutId, { remember = true } = {}) {
  if (!canUsePrivateState() && !isGuestDemoCopyLayout(layoutId)) {
    enterSignedOutPublicMode(currentPublicTemplateStatusMessage()).catch(() => {
      setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
      render();
      updateSyncUi(currentPublicTemplateStatusMessage());
    });
    return;
  }
  if (!layoutId || !state.layouts?.[layoutId] || layoutId === state.activeLayoutId) {
    if (canUsePrivateState()) setActivePrivateScope();
    else setActiveLocalEditableScope(layoutId);
    if (layoutId && state.layouts?.[layoutId] && remember) rememberActiveLayoutChoice(layoutId);
    render();
    return;
  }
  if (canUsePrivateState()) setActivePrivateScope();
  else setActiveLocalEditableScope(layoutId);
  captureActiveLayoutArrangement();
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  explicitLayoutChoice = { id: layoutId, at: Date.now() };
  if (remember) rememberActiveLayoutChoice(layoutId);
  if (!(state.layouts[layoutId]?.rootContainerIds || []).length) {
    rootContainerUsageFilter = "all";
  }
  render();
}

function openPrivateLayout(layoutId, options = {}) {
  if (!canUsePrivateState() && !isGuestDemoCopyLayout(layoutId)) {
    enterSignedOutPublicMode(currentPublicTemplateStatusMessage()).catch(() => null);
    return;
  }
  if (canUsePrivateState()) setActivePrivateScope();
  else setActiveLocalEditableScope(layoutId);
  switchActiveLayout(layoutId, options);
}

function activateAdminPublishedLayout(layoutId, { remember = true } = {}) {
  if (!layoutId || !isAdminEditablePublishedLayout(layoutId)) return false;
  if (!setViewScope(VIEW_SCOPE_ADMIN_PUBLIC_EDIT, { adminLayoutId: layoutId })) return false;
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  if (remember) {
    const layout = state.layouts?.[layoutId];
    if (layout?.adminDemo) rememberActiveLayoutChoice(DEMO_LAYOUT_SELECT_VALUE);
    else if (layout?.adminSharedSourceId) rememberActiveLayoutChoice(`shared:${layout.adminSharedSourceId}`);
  }
  saveState({ sync: false });
  switchView("packing");
  render();
  return true;
}

function rememberRemoteIntegrityMeta(...sources) {
  const meta = sources.length === 1 && sources[0]?.payloadHash !== undefined
    ? sources[0]
    : stateIntegrityMetaFromResponse(...sources);
  if (!hasStateIntegrityMeta(meta)) return;
  syncMeta.payloadHash = meta.payloadHash || syncMeta.payloadHash || null;
  syncMeta.entityHash = meta.entityHash || syncMeta.entityHash || null;
  syncMeta.itemCount = meta.itemCount;
  syncMeta.containerCount = meta.containerCount;
  syncMeta.layoutCount = meta.layoutCount;
  syncMeta.payloadSize = meta.payloadSize;
  syncMeta.stateRevision = meta.stateRevision ?? syncMeta.stateRevision ?? null;
}

function blockRemoteIntegrityFailureIfNeeded(remoteState, meta, rawPayload = null) {
  const error = remoteStateIntegrityError(remoteState, meta, rawPayload);
  if (!error) return false;
  saveRecoverySnapshot("blocked-integrity", state);
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  rememberRemoteIntegrityMeta(meta);
  saveSyncMeta();
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderInitialLocalFallbackIfNeeded();
  const message = `Серверная версия не прошла проверку целостности: ${error.message}. Локальная версия оставлена.`;
  updateSyncUi(message);
  showToast(message, "error");
  return true;
}

function assertRemoteStateIntegrity(remoteState, meta, rawPayload = null) {
  const error = remoteStateIntegrityError(remoteState, meta, rawPayload);
  if (!error) return;
  throw new Error(`Серверная версия не прошла проверку целостности: ${error.message}`);
}

function isDestructiveStateRegression(nextState, previousState) {
  if (!nextState || !previousState || !isMeaningfulPackingState(previousState)) return false;
  const previous = stateStatsForDestructiveComparison(previousState);
  const next = stateStatsForDestructiveComparison(nextState);
  if (previous.items >= 10 && next.items < Math.max(1, Math.floor(previous.items * 0.5))) return true;
  if (previous.containers >= 6 && next.containers < Math.max(1, Math.floor(previous.containers * 0.5))) return true;
  if (previous.containers >= 6 &&
    next.items >= Math.floor(previous.items * 0.85) &&
    previous.containers - next.containers >= 3 &&
    next.containers < Math.max(1, Math.floor(previous.containers * 0.65))) {
    return true;
  }
  const previousPlacedOrLinked = Math.max(previous.placedItems, previous.linkedItems, previous.arrangedItems);
  const nextPlacedOrLinked = Math.max(next.placedItems, next.linkedItems, next.arrangedItems);
  if (previousPlacedOrLinked >= 10 && nextPlacedOrLinked < Math.max(1, Math.floor(previousPlacedOrLinked * 0.5))) return true;
  const entityCountsShrank = next.items < previous.items || next.containers < previous.containers;
  if (
    entityCountsShrank &&
    previous.nestedContainers >= 6 &&
    next.nestedContainers < Math.max(1, Math.floor(previous.nestedContainers * 0.5))
  ) return true;
  return false;
}

function stateStatsForDestructiveComparison(targetState) {
  if (!targetState) return stateStats(targetState);
  try {
    const comparable = cloneStateForSync(targetState, { forSync: true });
    return stateStats(comparable);
  } catch {
    return stateStats(targetState);
  }
}

function isSuspiciousEmptyPackingState(targetState = state) {
  return Boolean(
    targetState &&
    !Object.keys(targetState.items || {}).length &&
    !Object.keys(targetState.containers || {}).length
  );
}

function normalizeItemFields(targetState = state) {
  Object.values(targetState.items || {}).forEach((item) => {
    item.weight = parseWeightInput(item.weight);
    item.quantity = normalizeItemQuantity(item.quantity);
    normalizeItemPhotos(item);
  });
}

function normalizeItemPhotos(item) {
  if (!item || typeof item !== "object") return [];
  if (!Array.isArray(item.photos)) item.photos = [];
  item.photos = item.photos
    .filter((photo) => photo && typeof photo === "object")
    .map((photo) => {
      normalizePhotoUrlFields(photo);
      return {
        id: String(photo.id || photo.localId || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        localId: photo.localId ? String(photo.localId) : "",
        status: normalizePhotoStatus(photo.status),
        url: typeof photo.url === "string" ? photo.url : "",
        thumbUrl: typeof photo.thumbUrl === "string" ? photo.thumbUrl : "",
        listId: typeof photo.listId === "string" || typeof photo.listId === "number" ? String(photo.listId) : "",
        fileName: typeof photo.fileName === "string" ? photo.fileName : "",
        type: typeof photo.type === "string" ? photo.type : "",
        size: Number.isFinite(Number(photo.size)) ? Number(photo.size) : 0,
        width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
        height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0,
        createdAt: typeof photo.createdAt === "string" ? photo.createdAt : nowIso(),
        updatedAt: typeof photo.updatedAt === "string" ? photo.updatedAt : nowIso(),
        error: typeof photo.error === "string" ? photo.error : ""
      };
    });
  return item.photos;
}

function saveState({ sync = true } = {}) {
  captureActiveLayoutArrangement();
  const privateStateCanPersist = canUseLocalEditableState() && !isReadOnlyStateScope();
  if (privateStateCanPersist) {
    persistStateSnapshot(state);
  } else if (!isAdminEditablePublishedLayout()) {
    if (sync && !applyingRemoteState) {
      syncMeta.dirty = false;
      saveSyncMeta();
      updateSyncUi(currentPublicTemplateStatusMessage());
    }
    return;
  }
  if (sync && !applyingRemoteState && isAdminEditablePublishedLayout()) {
    scheduleActivePublishedEditSave();
    updateSyncUi("Public-укладка изменена · публикую...");
    return;
  }
  if (sync && !applyingRemoteState && isReadOnlyBikePackingContext()) {
    syncMeta.dirty = false;
    saveSyncMeta();
    updateSyncUi(currentPublicTemplateStatusMessage());
    return;
  }
  if (sync && !applyingRemoteState) {
    if (!hasLocalSyncChanges()) {
      syncMeta.dirty = false;
      syncMeta.localUpdatedAt = syncMeta.lastSyncedLocalUpdatedAt || syncMeta.serverUpdatedAt || syncMeta.localUpdatedAt;
      saveSyncMeta();
      updateSyncUi();
      return;
    }
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    updateSyncUi();
    scheduleRemoteSave();
  }
}

function hasLocalSyncChanges(baseState = loadBaseState()) {
  if (!baseState) return true;
  return !sameJson(serializeState({ forSync: true }), cloneStateForSync(baseState, { forSync: true }));
}

function clearStaleDirtyFlagIfNoLocalChanges() {
  if (!syncMeta.dirty) return false;
  if (hasLocalSyncChanges()) return false;
  syncMeta.dirty = false;
  syncMeta.localUpdatedAt = syncMeta.lastSyncedLocalUpdatedAt || syncMeta.serverUpdatedAt || syncMeta.localUpdatedAt;
  saveSyncMeta();
  updateSyncUi();
  return true;
}

function isAdminEditablePublishedLayout(layoutId = state.activeLayoutId) {
  return isPublishedLayoutEditable(state.layouts?.[layoutId]);
}

function isGuestDemoCopyLayout(layoutId = state.activeLayoutId) {
  return isGuestDemoCopyLayoutRecord(state.layouts?.[layoutId]);
}

function hasGuestDemoCopyLayout() {
  return hasGuestDemoCopyLayoutRecord(state.layouts);
}

function currentSessionMode() {
  if (isAdminUser()) return SESSION_MODE_ADMIN;
  if (currentUser || isForcedOffline()) return SESSION_MODE_USER;
  return SESSION_MODE_GUEST;
}

function currentViewScope() {
  return modeState.viewScope;
}

function isGuestSession() {
  return currentSessionMode() === SESSION_MODE_GUEST;
}

function isAdminSession() {
  return currentSessionMode() === SESSION_MODE_ADMIN;
}

function snapshotModeState() {
  return { ...modeState };
}

function restoreModeState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  Object.assign(modeState, {
    viewScope: snapshot.viewScope || VIEW_SCOPE_PRIVATE,
    stateScope: snapshot.stateScope || STATE_SCOPE_PRIVATE,
    readonlyLayoutId: snapshot.readonlyLayoutId || "",
    sharedLayoutId: snapshot.sharedLayoutId || "",
    adminPublishedEditLayoutId: snapshot.adminPublishedEditLayoutId || ""
  });
}

function setTemporaryAdminEditLayout(layoutId) {
  if (!layoutId || !isAdminEditablePublishedLayout(layoutId)) return false;
  modeState.adminPublishedEditLayoutId = layoutId;
  return true;
}

function setViewScope(scope, { readonlyLayoutId = "", adminLayoutId = "" } = {}) {
  if (scope === VIEW_SCOPE_ADMIN_PUBLIC_EDIT) {
    if (!adminLayoutId || !isAdminEditablePublishedLayout(adminLayoutId)) return false;
    modeState.viewScope = VIEW_SCOPE_ADMIN_PUBLIC_EDIT;
    modeState.stateScope = STATE_SCOPE_PRIVATE;
    modeState.readonlyLayoutId = "";
    modeState.sharedLayoutId = "";
    modeState.adminPublishedEditLayoutId = adminLayoutId;
    return true;
  }

  if (scope === VIEW_SCOPE_DEMO || scope === VIEW_SCOPE_SHARED) {
    const layoutId = readonlyLayoutId || (scope === VIEW_SCOPE_DEMO ? DEMO_SHARED_LAYOUT_ID : "");
    if (!layoutId || !findSharedLayout(layoutId)) return false;
    modeState.viewScope = scope;
    modeState.stateScope = layoutId === DEMO_SHARED_LAYOUT_ID ? STATE_SCOPE_DEMO : STATE_SCOPE_SHARED;
    modeState.readonlyLayoutId = layoutId;
    modeState.sharedLayoutId = layoutId;
    modeState.adminPublishedEditLayoutId = "";
    if (layoutId === DEMO_SHARED_LAYOUT_ID) syncDemoStatePayloadForLanguage(uiLanguage);
    return true;
  }

  modeState.viewScope = scope === VIEW_SCOPE_GUEST_LOCAL ? VIEW_SCOPE_GUEST_LOCAL : VIEW_SCOPE_PRIVATE;
  modeState.stateScope = STATE_SCOPE_PRIVATE;
  modeState.readonlyLayoutId = "";
  modeState.sharedLayoutId = "";
  modeState.adminPublishedEditLayoutId = "";
  return true;
}

function canUseLocalEditableState(layoutId = state.activeLayoutId) {
  return canUsePrivateState() || isGuestDemoCopyLayout(layoutId);
}

function isPublicLayoutContext() {
  return isReadOnlyStateScope() || currentViewScope() === VIEW_SCOPE_ADMIN_PUBLIC_EDIT || isAdminEditablePublishedLayout();
}

function setActivePrivateScope() {
  if (canUsePrivateState()) return setViewScope(VIEW_SCOPE_PRIVATE);
  if (isGuestDemoCopyLayout()) return setViewScope(VIEW_SCOPE_GUEST_LOCAL);
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  return false;
}

function setActiveLocalEditableScope(layoutId = state.activeLayoutId) {
  return setViewScope(!canUsePrivateState() && isGuestDemoCopyLayout(layoutId)
    ? VIEW_SCOPE_GUEST_LOCAL
    : VIEW_SCOPE_PRIVATE);
}

function setActiveReadOnlyScope(layoutId) {
  if (!layoutId || !findSharedLayout(layoutId)) {
    setActivePrivateScope();
    return false;
  }
  return setViewScope(layoutId === DEMO_SHARED_LAYOUT_ID ? VIEW_SCOPE_DEMO : VIEW_SCOPE_SHARED, { readonlyLayoutId: layoutId });
}

function isReadOnlyStateScope() {
  return isReadOnlyScope(modeState);
}

function activeReadOnlyLayoutId() {
  return activeReadOnlyLayoutIdFromScope(modeState);
}

function isReadOnlyBikePackingContext(record = null) {
  return isPublicLayoutContext() ||
    isReadOnlyBikePackingRecord(record) ||
    isReadOnlyBikePackingRecord(currentPackingListMeta);
}

function canUsePrivateState() {
  return !isGuestSession();
}

function ensureGuestPublicScope() {
  if (canUsePrivateState() || sharedListIdFromLocation()) return false;
  if (isGuestDemoCopyLayout()) return false;
  if (isReadOnlyStateScope()) return false;
  if (!demoStatePayloadForLanguage(uiLanguage)) {
    setDemoStatePayloadForLanguage(uiLanguage, createEmptyPublicTemplateState(uiLanguage));
  }
  return setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
}

function demoLanguageSuffix(language = uiLanguage) {
  return demoLanguageSuffixFromScope(language);
}

function demoItemKeyForLanguage(language = uiLanguage) {
  return demoItemKeyForLanguageFromScope(language);
}

function demoAdminIdForLanguage(language = uiLanguage) {
  return demoAdminIdForLanguageFromScope(language);
}

function demoPublicListIdForLanguage(language = uiLanguage) {
  return demoPublicListIdForLanguageFromScope(language);
}

function demoAdminPathForLanguage(suffix = "", language = uiLanguage) {
  return demoAdminPathForLanguageFromScope(suffix, language);
}

function demoAdminStatePathForLanguage(language = uiLanguage) {
  return demoAdminStatePathForLanguageFromScope(language);
}

function sharedLayoutItemKey(layoutId) {
  return sharedLayoutItemKeyFromScope(layoutId, uiLanguage);
}

function schedulePublishedLayoutSave(layoutId, delay = 900) {
  if (!canOpenAdminPublishedEdit() || !isAdminEditablePublishedLayout(layoutId)) return;
  if (publishedLayoutSaveTimer) window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveTimer = window.setTimeout(() => {
    publishedLayoutSaveTimer = null;
    savePublishedLayoutRecord(layoutId).catch((error) => {
      updateSyncUi(`Не удалось сохранить public-укладку: ${error.message}`);
    });
  }, delay);
}

function getPublishedEditLayoutId() {
  return isAdminEditablePublishedLayout(modeState.adminPublishedEditLayoutId)
    ? modeState.adminPublishedEditLayoutId
    : state.activeLayoutId;
}

function getPublishedWorkLayout(layoutId = getPublishedEditLayoutId()) {
  return state.layouts?.[layoutId] || null;
}

function scheduleActivePublishedEditSave(delay = 500) {
  const layoutId = getPublishedEditLayoutId();
  if (!isAdminEditablePublishedLayout(layoutId)) return;
  schedulePublishedLayoutSave(layoutId, delay);
}

async function flushActivePublishedEditSave() {
  const layoutId = getPublishedEditLayoutId();
  if (!publishedLayoutSaveTimer || !isAdminEditablePublishedLayout(layoutId) || !canOpenAdminPublishedEdit()) return;
  window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveTimer = null;
  try {
    await savePublishedLayoutRecord(layoutId);
  } catch (error) {
    updateSyncUi(`Не удалось сохранить public-укладку: ${error.message}`);
  }
}

function publishedLayoutTarget(layout, { defaultToDemo = false } = {}) {
  if (!layout) return null;
  if (layout.adminDemo || layout.adminSharedSourceId === DEMO_SHARED_LAYOUT_ID) {
    return { type: "demo", sharedId: "", language: layout.adminDemoLanguage || uiLanguage };
  }
  if (layout.adminSharedSourceId) {
    return { type: "shared", sharedId: layout.adminSharedSourceId };
  }
  return defaultToDemo ? { type: "demo", sharedId: "", language: uiLanguage } : null;
}

function publicListIdForPublishedTarget(target) {
  if (!target) return "";
  return target.type === "demo"
    ? demoPublicListIdForLanguage(target.language || uiLanguage)
    : `public-shared-layout-${String(target.sharedId || "").trim()}`;
}

function saveLocalUiState() {
  saveState({ sync: false });
}

function currentEditMeta(when = nowIso()) {
  return {
    updatedAt: when,
    updatedByDeviceId: syncDevice?.id || "local-device",
    updatedByDeviceName: syncDevice?.name || "Это устройство"
  };
}

function currentCreateMeta(when = nowIso()) {
  return {
    createdAt: when,
    ...currentEditMeta(when)
  };
}

function markEdited(record, when = nowIso()) {
  if (!record || typeof record !== "object") return when;
  Object.assign(record, currentEditMeta(when));
  return when;
}

function touchItem(itemId, when = nowIso()) {
  markEdited(state.items?.[itemId], when);
  return when;
}

function touchContainer(containerId, when = nowIso()) {
  markEdited(state.containers?.[containerId], when);
  return when;
}

function touchLayout(layoutId, when = nowIso()) {
  markEdited(state.layouts?.[layoutId], when);
  return when;
}

function touchActiveLayout(when = nowIso()) {
  return touchLayout(state.activeLayoutId, when);
}

function serializeState(options = {}) {
  captureActiveLayoutArrangement();
  return cloneStateForSync(state, options);
}

function cloneStateForSync(sourceState, { forSync = false } = {}) {
  return cloneStateForSyncPayload(sourceState, {
    forSync,
    cleanupGeneratedCatalogArtifacts,
    pruneAdminPublishedDraftsForSync
  });
}

function buildChangedEntitySyncEntries(type, baseState, localState, { forceOverwrite = false } = {}) {
  return buildChangedEntitySyncEntriesForSync(type, baseState, localState, {
    forceOverwrite,
    ...entitySyncStateDeps()
  });
}

function legacyComparableStateForSync(sourceState, entitySync = null) {
  return legacyComparableStateForSyncPayload(sourceState, entitySync, entitySyncStateDeps());
}

function hasLegacyPayloadChanges(baseState, localState, entitySync = null) {
  return hasLegacyPayloadChangesForSync(baseState, localState, entitySync, entitySyncStateDeps());
}

function buildEntitySyncBody(type, entries, { forceOverwrite = false } = {}) {
  return buildEntitySyncBodyForSync(type, entries, {
    forceOverwrite,
    ...entitySyncBodyContext()
  });
}

function splitEntitySyncEntries(type, entries) {
  return splitEntitySyncEntriesForSync(type, entries, entitySyncBodyContext());
}

function entitySyncStateDeps() {
  return {
    cloneStateForSync,
    createEmptyUserState,
    localUpdatedAt: syncMeta.localUpdatedAt
  };
}

function entitySyncBodyContext() {
  return {
    syncDevice,
    syncMeta
  };
}

async function syncChangedEntityType(type, { baseState = null, forceOverwrite = false, listId = "" } = {}) {
  const config = ENTITY_SYNC_CONFIG[type];
  if (!config) return { type, attempted: false, skipped: true, safeForLegacyCompare: true };
  if (isReadOnlyBikePackingContext()) return { attempted: false, skipped: true, readOnly: true };
  const entries = buildChangedEntitySyncEntries(type, baseState, state, { forceOverwrite });
  if (!entries.length) return { type, attempted: false, skipped: false, entryCount: 0, safeForLegacyCompare: true };
  if (isEntitySyncTypeUnavailable(type) || personalListApiUnavailable) {
    return { type, attempted: false, skipped: true, unavailable: true, entryCount: entries.length, safeForLegacyCompare: false };
  }
  const targetListId = listId || await ensureCurrentPackingListId();
  if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
  if (isReadOnlyBikePackingContext()) return { attempted: false, skipped: true, readOnly: true };
  try {
    const results = [];
    for (const batch of splitEntitySyncEntries(type, entries)) {
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(targetListId)}/${config.endpoint}/sync`, {
        method: "POST",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify(buildEntitySyncBody(type, batch, { forceOverwrite }))
      });
      results.push(data);
    }
    const conflicts = results.flatMap((data) => Array.isArray(data?.conflicts) ? data.conflicts : []);
    if (conflicts.length) {
      const remote = await fetchRemoteStateRecord().catch(() => null);
      const error = new Error(`${type} entity sync conflict`);
      error.status = 409;
      error.data = {
        ok: false,
        code: "conflict",
        conflicts,
        record: remote?.record || null,
        serverPayload: remote?.record?.payload || null,
        serverUpdatedAt: remoteUpdatedAt(remote?.record) || results.find((data) => data?.serverUpdatedAt)?.serverUpdatedAt || null
      };
      throw error;
    }
    const integrityMeta = [...results]
      .reverse()
      .map((data) => stateIntegrityMetaFromResponse(data))
      .find(hasStateIntegrityMeta) || null;
    return {
      type,
      attempted: true,
      entryCount: entries.length,
      safeForLegacyCompare: true,
      serverUpdatedAt: [...results].reverse().find((data) => data?.serverUpdatedAt)?.serverUpdatedAt || integrityMeta?.updatedAt || nowIso(),
      integrityMeta,
      upserted: results.flatMap((data) => Array.isArray(data?.upserted) ? data.upserted : []),
      deleted: results.flatMap((data) => Array.isArray(data?.deleted) ? data.deleted : [])
    };
  } catch (error) {
    if (isEntitySyncUnavailableError(error, type) || isNetworkError(error)) {
      markEntitySyncTypeUnavailable(type);
      return { type, attempted: false, skipped: true, unavailable: true, entryCount: entries.length, safeForLegacyCompare: false };
    }
    throw error;
  }
}

function isEntitySyncTypeUnavailable(type) {
  if (type === "item") return itemEntitySyncUnavailable;
  if (type === "container") return containerEntitySyncUnavailable;
  if (type === "layout") return layoutEntitySyncUnavailable;
  return true;
}

function markEntitySyncTypeUnavailable(type) {
  if (type === "item") itemEntitySyncUnavailable = true;
  else if (type === "container") containerEntitySyncUnavailable = true;
  else if (type === "layout") layoutEntitySyncUnavailable = true;
}

async function syncChangedItemEntities({ baseState = null, forceOverwrite = false } = {}) {
  return syncChangedEntityType("item", { baseState, forceOverwrite });
}

async function syncChangedBikePackingEntities({ baseState = null, forceOverwrite = false } = {}) {
  let listId = currentPackingListId || "";
  const item = await syncChangedEntityType("item", { baseState, forceOverwrite, listId });
  if (!listId && currentPackingListId) listId = currentPackingListId;
  const container = await syncChangedEntityType("container", { baseState, forceOverwrite, listId });
  if (!listId && currentPackingListId) listId = currentPackingListId;
  const layout = await syncChangedEntityType("layout", { baseState, forceOverwrite, listId });
  const results = [item, container, layout];
  const integrityMeta = [...results].reverse().map((result) => result.integrityMeta).find(hasStateIntegrityMeta) || null;
  return {
    attempted: results.some((result) => result.attempted),
    skipped: results.every((result) => result.skipped),
    unavailable: results.some((result) => result.unavailable),
    serverUpdatedAt: [...results].reverse().find((result) => result.serverUpdatedAt)?.serverUpdatedAt || integrityMeta?.updatedAt || null,
    integrityMeta,
    item,
    container,
    layout,
    upserted: results.flatMap((result) => Array.isArray(result.upserted) ? result.upserted : []),
    deleted: results.flatMap((result) => Array.isArray(result.deleted) ? result.deleted : [])
  };
}

function pruneAdminPublishedDraftsForSync(cloned) {
  const layouts = cloned.layouts || {};
  const draftLayoutIds = Object.values(layouts)
    .filter((layout) => layout?.adminDemo || layout?.adminSharedSourceId || layout?.[GUEST_DEMO_COPY_FLAG])
    .map((layout) => layout.id)
    .filter(Boolean);
  const draftContainers = new Set();
  const collectDraftContainer = (containerId) => {
    const container = cloned.containers?.[containerId];
    if (!container || draftContainers.has(containerId)) return;
    draftContainers.add(containerId);
    (container.childIds || []).forEach(collectDraftContainer);
  };
  draftLayoutIds.forEach((layoutId) => {
    (layouts[layoutId]?.rootContainerIds || []).forEach(collectDraftContainer);
    delete layouts[layoutId];
  });

  const retainedContainers = new Set();
  const collectRetainedContainer = (containerId) => {
    const container = cloned.containers?.[containerId];
    if (!container || retainedContainers.has(containerId)) return;
    retainedContainers.add(containerId);
    (container.childIds || []).forEach(collectRetainedContainer);
  };
  Object.values(layouts).forEach((layout) => {
    (layout.rootContainerIds || []).forEach(collectRetainedContainer);
  });

  const containersToDrop = new Set();
  draftContainers.forEach((containerId) => {
    if (!retainedContainers.has(containerId)) collectContainerTreeForDrop(cloned, containerId, containersToDrop);
  });
  Object.entries(cloned.containers || {}).forEach(([containerId, container]) => {
    if (isPublicSyncContainer(containerId, container)) collectContainerTreeForDrop(cloned, containerId, containersToDrop);
  });
  containersToDrop.forEach((containerId) => {
    delete cloned.containers[containerId];
  });
  Object.entries(cloned.items || {}).forEach(([itemId, item]) => {
    if (
      isPublicSyncItem(itemId, item) ||
      (item?.containerId && (!cloned.containers?.[item.containerId] || containersToDrop.has(item.containerId)))
    ) {
      delete cloned.items[itemId];
    }
  });
  Object.values(cloned.containers || {}).forEach((container) => {
    container.childIds = (container.childIds || []).filter((id) => cloned.containers?.[id]);
    container.itemIds = (container.itemIds || []).filter((id) => cloned.items?.[id]);
    container.order = (container.order || []).filter((entry) => {
      if (entry?.type === "container") return Boolean(cloned.containers?.[entry.id]);
      if (entry?.type === "item") return Boolean(cloned.items?.[entry.id]);
      return false;
    });
  });
  Object.values(cloned.layouts || {}).forEach((layout) => {
    layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => cloned.containers?.[id]);
    if (layout.arrangement && typeof layout.arrangement === "object") {
      const arrangement = layout.arrangement;
      arrangement.rootContainerIds = (arrangement.rootContainerIds || layout.rootContainerIds || []).filter((id) => cloned.containers?.[id]);
      arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
      Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
        if (!cloned.containers?.[containerId] || !placement || typeof placement !== "object") {
          delete arrangement.containers[containerId];
          return;
        }
        placement.parentId = placement.parentId && cloned.containers?.[placement.parentId] ? placement.parentId : "";
        placement.childIds = (placement.childIds || []).filter((id) => cloned.containers?.[id]);
        placement.itemIds = (placement.itemIds || []).filter((id) => cloned.items?.[id]);
        placement.order = (placement.order || []).filter((entry) => {
          if (entry?.type === "container") return Boolean(cloned.containers?.[entry.id]);
          if (entry?.type === "item") return Boolean(cloned.items?.[entry.id]);
          return false;
        });
      });
      arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
      Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
        if (!cloned.items?.[itemId] || !cloned.containers?.[containerId]) delete arrangement.items[itemId];
      });
      arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
      Object.keys(arrangement.packedItems).forEach((itemId) => {
        if (!cloned.items?.[itemId]) delete arrangement.packedItems[itemId];
      });
    }
  });

  if (draftLayoutIds.includes(cloned.activeLayoutId)) {
    cloned.activeLayoutId = Object.values(layouts)[0]?.id || "";
  }
}

function isPublicSyncItem(itemId, item) {
  return Boolean(
    hasPublicOriginMarker(item) ||
    item?.publicCatalogLayoutId ||
    item?.adminDemo ||
    item?.adminSharedSourceId ||
    String(itemId || item?.id || "").startsWith("guest-demo-item-") ||
    isGeneratedCatalogSyncArtifact(itemId, item)
  );
}

function isPublicSyncContainer(containerId, container) {
  return Boolean(
    hasPublicOriginMarker(container) ||
    container?.publicCatalogLayoutId ||
    container?.adminDemo ||
    container?.adminSharedSourceId ||
    String(containerId || container?.id || "").startsWith("guest-demo-container-") ||
    isGeneratedCatalogContainerSyncArtifact(containerId, container)
  );
}

function hasPublicOriginMarker(record) {
  if (!record || typeof record !== "object") return false;
  const scope = generatedCatalogString(record.scope).toLowerCase();
  const sourceType = generatedCatalogString(record.sourceType || record.source_type).toLowerCase();
  const visibility = generatedCatalogString(record.visibility).toLowerCase();
  const sourceListId = generatedCatalogString(record.sourceListId || record.source_list_id || record.listId || record.list_id).toLowerCase();
  if (scope && scope !== "private") return true;
  if (["demo", "shared", "public", "public-template", "curated-bikepacker"].includes(sourceType)) return true;
  if (["public", "shared"].includes(visibility)) return true;
  if (sourceListId.startsWith("public-demo") || sourceListId.startsWith("public-shared")) return true;
  return Boolean(record.isDemo || record.adminDemo || record.adminShared || record.adminSharedSourceId);
}

function cleanupGeneratedCatalogArtifacts(targetState = state, { forSync = false } = {}) {
  const items = targetState?.items && typeof targetState.items === "object" ? targetState.items : {};
  const containers = targetState?.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const containerIdsToDrop = new Set();
  Object.entries(containers).forEach(([containerId, container]) => {
    const shouldDrop = forSync
      ? isGeneratedCatalogContainerSyncArtifact(containerId, container)
      : isGeneratedCatalogContainerStateArtifact(containerId, container, targetState);
    if (shouldDrop) collectContainerTreeForDrop(targetState, containerId, containerIdsToDrop);
  });
  const itemIdsToDrop = Object.entries(items)
    .filter(([itemId, item]) => forSync
      ? isGeneratedCatalogSyncArtifact(itemId, item)
      : isGeneratedCatalogStateArtifact(itemId, item, targetState)
    )
    .map(([itemId]) => itemId);
  Object.entries(items).forEach(([itemId, item]) => {
    if (item?.containerId && containerIdsToDrop.has(item.containerId)) itemIdsToDrop.push(itemId);
  });
  if (!itemIdsToDrop.length && !containerIdsToDrop.size) return 0;

  containerIdsToDrop.forEach((containerId) => {
    delete containers[containerId];
    if (targetState.collapsedContainers && typeof targetState.collapsedContainers === "object") {
      delete targetState.collapsedContainers[containerId];
    }
  });
  [...new Set(itemIdsToDrop)].forEach((itemId) => {
    delete items[itemId];
    if (targetState.packedItems && typeof targetState.packedItems === "object") {
      delete targetState.packedItems[itemId];
    }
  });
  scrubMissingEntityReferences(targetState);
  return itemIdsToDrop.length + containerIdsToDrop.size;
}

function collectContainerTreeForDrop(targetState, containerId, containerIdsToDrop) {
  if (!containerId || containerIdsToDrop.has(containerId)) return;
  const container = targetState?.containers?.[containerId];
  if (!container) return;
  containerIdsToDrop.add(containerId);
  (container.childIds || []).forEach((childId) => collectContainerTreeForDrop(targetState, childId, containerIdsToDrop));
  Object.entries(targetState.containers || {}).forEach(([childId, child]) => {
    if (child?.parentId === containerId) collectContainerTreeForDrop(targetState, childId, containerIdsToDrop);
  });
}

function isGeneratedCatalogSyncArtifact(itemId, item) {
  if (!item || typeof item !== "object") return false;
  const id = generatedCatalogString(itemId || item.id);
  const sourceId = generatedCatalogString(item.sharedSourceId);
  return Boolean(
    hasPublicOriginMarker(item) ||
    item.publicCatalogLayoutId ||
    item.adminDemo ||
    item.adminSharedSourceId ||
    id.startsWith("demo-item-") ||
    id.startsWith("admin-demo-item-") ||
    id.startsWith("item-shared-") ||
    id.includes("item-shared-item-shared-") ||
    sourceId.startsWith("item-shared-") ||
    sourceId.includes("item-shared-item-shared-")
  );
}

function isGeneratedCatalogContainerSyncArtifact(containerId, container) {
  if (!container || typeof container !== "object") return false;
  const id = generatedCatalogString(containerId || container.id);
  const sourceId = generatedCatalogString(container.sharedSourceId);
  return Boolean(
    hasPublicOriginMarker(container) ||
    container.publicCatalogLayoutId ||
    container.adminDemo ||
    container.adminSharedSourceId ||
    id.startsWith("demo-") ||
    id.startsWith("admin-demo-container-") ||
    id.startsWith("container-shared-") ||
    id.includes("container-shared-container-shared-") ||
    sourceId.startsWith("container-shared-") ||
    sourceId.includes("container-shared-container-shared-")
  );
}

function isGeneratedCatalogStateArtifact(itemId, item, targetState = state) {
  if (!item || typeof item !== "object") return false;
  const id = generatedCatalogString(itemId || item.id);
  const sourceId = generatedCatalogString(item.sharedSourceId);
  const containerId = generatedCatalogString(item.containerId);
  const hasValidContainer = Boolean(containerId && targetState?.containers?.[containerId]);
  if (hasValidContainer) return false;
  return Boolean(
    hasPublicOriginMarker(item) ||
    id.startsWith("demo-item-") ||
    id.startsWith("admin-demo-item-") ||
    id.includes("item-shared-item-shared-") ||
    sourceId.startsWith("item-shared-") ||
    sourceId.includes("item-shared-item-shared-")
  );
}

function isGeneratedCatalogContainerStateArtifact(containerId, container, targetState = state) {
  if (!container || typeof container !== "object") return false;
  const id = generatedCatalogString(containerId || container.id);
  const sourceId = generatedCatalogString(container.sharedSourceId);
  const parentId = generatedCatalogString(container.parentId);
  const hasValidParent = Boolean(parentId && targetState?.containers?.[parentId]);
  const isRecursiveSharedContainer = id.includes("container-shared-container-shared-") ||
    sourceId.startsWith("container-shared-") ||
    sourceId.includes("container-shared-container-shared-");
  if (hasPublicOriginMarker(container)) return true;
  if (container.publicCatalogLayoutId || container.adminDemo || container.adminSharedSourceId) return true;
  if (id.startsWith("demo-") || id.startsWith("admin-demo-container-") || id.startsWith("container-shared-")) return true;
  if (!isRecursiveSharedContainer) return false;
  return !hasValidParent || id.includes("container-shared-container-shared-") || sourceId.startsWith("container-shared-");
}

function generatedCatalogString(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function scrubMissingEntityReferences(targetState = state) {
  const itemIds = new Set(Object.keys(targetState?.items || {}));
  const containerIds = new Set(Object.keys(targetState?.containers || {}));
  Object.values(targetState?.containers || {}).forEach((container) => {
    if (!container || typeof container !== "object") return;
    if (container.parentId && !containerIds.has(container.parentId)) container.parentId = null;
    container.childIds = uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : []).filter((id) => containerIds.has(id));
    container.itemIds = uniqueLayoutIds(Array.isArray(container.itemIds) ? container.itemIds : []).filter((id) => itemIds.has(id));
    container.order = (Array.isArray(container.order) ? container.order : []).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.type === "item") return itemIds.has(entry.id);
      if (entry.type === "container") return containerIds.has(entry.id);
      return false;
    });
  });
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    layout.rootContainerIds = uniqueLayoutIds(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []).filter((id) => containerIds.has(id));
    const arrangement = layout?.arrangement;
    if (!arrangement || typeof arrangement !== "object") return;
    arrangement.rootContainerIds = uniqueLayoutIds(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []).filter((id) => containerIds.has(id));
    arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
    Object.keys(arrangement.containers).forEach((containerId) => {
      if (!containerIds.has(containerId)) delete arrangement.containers[containerId];
    });
    arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
    Object.keys(arrangement.items).forEach((itemId) => {
      const containerId = arrangement.items[itemId];
      if (!itemIds.has(itemId) || !containerIds.has(containerId)) delete arrangement.items[itemId];
    });
    arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
    Object.keys(arrangement.packedItems).forEach((itemId) => {
      if (!itemIds.has(itemId)) delete arrangement.packedItems[itemId];
    });
    Object.values(arrangement.containers || {}).forEach((placement) => {
      if (!placement || typeof placement !== "object") return;
      placement.parentId = placement.parentId && containerIds.has(placement.parentId) ? placement.parentId : "";
      placement.childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((id) => containerIds.has(id));
      placement.itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : []).filter((id) => itemIds.has(id));
      placement.order = (Array.isArray(placement.order) ? placement.order : []).filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (entry.type === "item") return itemIds.has(entry.id);
        if (entry.type === "container") return containerIds.has(entry.id);
        return false;
      });
    });
  });
}

function normalizeRemoteState(payload) {
  if (!payload || typeof payload !== "object") return null;
  const normalized = JSON.parse(JSON.stringify(payload));
  if (!normalized.locations || !normalized.categories || !normalized.containers || !normalized.items || !normalized.layouts) {
    return null;
  }
  if (!normalized.collapsedContainers) normalized.collapsedContainers = {};
  if (typeof normalized.showItemMeta !== "boolean") normalized.showItemMeta = false;
  if (typeof normalized.showFilterContext !== "boolean") normalized.showFilterContext = false;
  if (typeof normalized.collectionMode !== "boolean") normalized.collectionMode = false;
  if (typeof normalized.showOnlyUnpacked !== "boolean") normalized.showOnlyUnpacked = false;
  if (!normalized.packedItems || typeof normalized.packedItems !== "object") normalized.packedItems = {};
  normalizeContainerFields(normalized);
  normalizeItemFields(normalized);
  cleanupGeneratedCatalogArtifacts(normalized);
  repairContainerMembershipFromItemLinks(normalized);
  normalizeLayoutFields(normalized);
  normalizeItemCategories(normalized);
  migrateContainerOrder(normalized);
  applyLayoutArrangement(normalized.activeLayoutId, normalized);
  applyDefaultCollapsedContainers(normalized);
  return normalized;
}

function normalizePublishedStatePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const normalized = JSON.parse(JSON.stringify(payload));
  if (!normalized.locations || !normalized.categories || !normalized.containers || !normalized.items || !normalized.layouts) {
    return null;
  }
  if (!normalized.collapsedContainers) normalized.collapsedContainers = {};
  if (typeof normalized.showItemMeta !== "boolean") normalized.showItemMeta = true;
  if (typeof normalized.showFilterContext !== "boolean") normalized.showFilterContext = false;
  if (typeof normalized.collectionMode !== "boolean") normalized.collectionMode = false;
  if (typeof normalized.showOnlyUnpacked !== "boolean") normalized.showOnlyUnpacked = false;
  if (!normalized.packedItems || typeof normalized.packedItems !== "object") normalized.packedItems = {};
  normalizeContainerFields(normalized);
  normalizeItemFields(normalized);
  repairContainerMembershipFromItemLinks(normalized);
  normalizeLayoutFields(normalized);
  normalizeItemCategories(normalized);
  migrateContainerOrder(normalized);
  repairPublishedLayoutArrangement(normalized);
  applyLayoutArrangement(normalized.activeLayoutId, normalized);
  applyDefaultCollapsedContainers(normalized);
  return normalized;
}

function repairPublishedLayoutArrangement(targetState) {
  const layout = targetState.layouts?.[targetState.activeLayoutId] || Object.values(targetState.layouts || {})[0];
  if (!layout) return;
  const linkedItemCount = Object.values(targetState.items || {}).filter((item) => item?.containerId && targetState.containers?.[item.containerId]).length;
  const linkedChildCount = Object.values(targetState.containers || {}).filter((container) => container?.parentId && targetState.containers?.[container.parentId]).length;
  const arrangement = layout.arrangement;
  const arrangedItemCount = arrangement?.items && typeof arrangement.items === "object" ? Object.keys(arrangement.items).length : 0;
  const arrangedChildCount = arrangement?.containers && typeof arrangement.containers === "object"
    ? Object.values(arrangement.containers).reduce((count, placement) => count + (Array.isArray(placement?.childIds) ? placement.childIds.length : 0), 0)
    : 0;
  const staleArrangement =
    !arrangement ||
    typeof arrangement !== "object" ||
    (linkedItemCount > arrangedItemCount) ||
    (linkedChildCount > arrangedChildCount && arrangedChildCount === 0);
  if (!staleArrangement) return;
  const rootContainerIds = Array.isArray(layout.rootContainerIds) && layout.rootContainerIds.length
    ? layout.rootContainerIds
    : Object.values(targetState.containers || {}).filter((container) => container && !container.parentId).map((container) => container.id).filter(Boolean);
  layout.arrangement = createLayoutArrangementFromCurrentState(targetState, rootContainerIds);
}

function replaceState(nextState, { preserveLocalUi = true } = {}) {
  saveRecoverySnapshot("before-replace", state);
  const previousCollapsedContainers = preserveLocalUi ? state.collapsedContainers : null;
  const previousShowItemMeta = preserveLocalUi ? state.showItemMeta : null;
  const previousShowFilterContext = preserveLocalUi ? state.showFilterContext : null;
  const previousCollectionMode = preserveLocalUi ? state.collectionMode : null;
  const previousShowOnlyUnpacked = preserveLocalUi ? state.showOnlyUnpacked : null;
  applyingRemoteState = true;
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
  normalizeContainerFields(state);
  normalizeItemFields(state);
  cleanupGeneratedCatalogArtifacts(state);
  repairContainerMembershipFromItemLinks(state);
  normalizeLayoutFields(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  applyLayoutArrangement(state.activeLayoutId, state);
  if (previousCollapsedContainers) {
    state.collapsedContainers = mergeLocalCollapsedContainers(state.collapsedContainers || {}, previousCollapsedContainers);
  }
  if (preserveLocalUi) {
    state.showItemMeta = typeof previousShowItemMeta === "boolean" ? previousShowItemMeta : Boolean(state.showItemMeta);
    state.showFilterContext = typeof previousShowFilterContext === "boolean" ? previousShowFilterContext : Boolean(state.showFilterContext);
    state.collectionMode = Boolean(previousCollectionMode);
    state.showOnlyUnpacked = Boolean(previousShowOnlyUnpacked && state.collectionMode);
  }
  persistStateSnapshot(state);
  applyingRemoteState = false;
}

function mergeLocalCollapsedContainers(nextCollapsed, previousCollapsed) {
  const merged = { ...nextCollapsed };
  Object.keys(previousCollapsed || {}).forEach((containerId) => {
    if (state.containers?.[containerId]) merged[containerId] = previousCollapsed[containerId];
  });
  return merged;
}

function remoteUpdatedAt(record) {
  return record?.updatedAt || record?.updated_at || record?.updatedAtUtc || null;
}

function timeValue(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function serverChangedSinceLastSync(remoteTime) {
  const knownServerTime = timeValue(syncMeta.serverUpdatedAt);
  return Boolean(remoteTime && knownServerTime && remoteTime > knownServerTime + 1000);
}

function blockDestructiveRemoteState(remoteState, label = "server") {
  repairPlacementRegressionFromReference(remoteState, state);
  if (!isDestructiveStateRegression(remoteState, state)) return false;
  saveRecoverySnapshot(`blocked-${label}`, state);
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  saveSyncMeta();
  appUnlocked = true;
  const localStats = stateStats(state);
  const remoteStats = stateStats(remoteState);
  const message = `Серверная версия выглядит усечённой: было items ${localStats.items}, containers ${localStats.containers}; стало items ${remoteStats.items}, containers ${remoteStats.containers}. Локальная версия оставлена.`;
  updateSyncUi(message);
  showToast(message, "error");
  return true;
}

function repairPlacementRegressionFromReference(targetState, referenceState = state) {
  if (!targetState || !referenceState || !isMeaningfulPackingState(targetState) || !isMeaningfulPackingState(referenceState)) return false;
  const repairedHierarchy = repairContainerHierarchyRegressionFromReference(targetState, referenceState);
  const before = stateStats(targetState);
  const reference = stateStats(referenceState);
  const beforePlacement = Math.max(before.placedItems, before.linkedItems, before.arrangedItems);
  const referencePlacement = Math.max(reference.placedItems, reference.linkedItems, reference.arrangedItems);
  if (referencePlacement < 10 || beforePlacement >= Math.max(1, Math.floor(referencePlacement * 0.5))) return repairedHierarchy;
  if (before.items < Math.max(1, Math.floor(reference.items * 0.5))) return repairedHierarchy;

  let repaired = 0;
  Object.entries(targetState.items || {}).forEach(([itemId, item]) => {
    const referenceItem = referenceState.items?.[itemId];
    const referenceContainerId = referenceItem?.containerId;
    if (!item || !referenceContainerId || !targetState.containers?.[referenceContainerId]) return;
    if (item.containerId && targetState.containers[item.containerId]) return;
    item.containerId = referenceContainerId;
    repaired += 1;
  });
  if (!repaired) return false;

  targetState.packedItems = targetState.packedItems && typeof targetState.packedItems === "object" ? targetState.packedItems : {};
  Object.entries(referenceState.packedItems || {}).forEach(([itemId, value]) => {
    if (value && targetState.items?.[itemId]) targetState.packedItems[itemId] = true;
  });
  repairContainerMembershipFromItemLinks(targetState);
  migrateContainerOrder(targetState);
  const layout = targetState.layouts?.[targetState.activeLayoutId];
  if (layout) {
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || []);
    layout.rootContainerIds = [...layout.arrangement.rootContainerIds];
  }
  return true;
}

function repairContainerHierarchyRegressionFromReference(targetState, referenceState = state) {
  const before = stateStats(targetState);
  const reference = stateStats(referenceState);
  if (reference.nestedContainers < 6) return false;
  if (before.nestedContainers >= Math.max(1, Math.floor(reference.nestedContainers * 0.5))) return false;
  if (before.containers < Math.max(1, Math.floor(reference.containers * 0.5))) return false;

  let repaired = 0;
  Object.entries(referenceState.containers || {}).forEach(([containerId, referenceContainer]) => {
    const targetContainer = targetState.containers?.[containerId];
    const referenceParentId = referenceContainer?.parentId;
    if (!targetContainer || !referenceParentId || !targetState.containers?.[referenceParentId]) return;
    if (targetContainer.parentId && targetState.containers[targetContainer.parentId]) return;
    targetContainer.parentId = referenceParentId;
    repaired += 1;
  });
  if (!repaired) return false;

  Object.values(targetState.containers || {}).forEach((container) => {
    if (!container || typeof container !== "object") return;
    container.childIds = [];
  });
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    const parentId = container?.parentId;
    if (!parentId || !targetState.containers?.[parentId]) return;
    const parent = targetState.containers[parentId];
    if (!parent.childIds.includes(containerId)) parent.childIds.push(containerId);
  });
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    const referenceContainer = referenceState.containers?.[containerId];
    const validItemIds = new Set(container.itemIds || []);
    const validChildIds = new Set(container.childIds || []);
    const restoredOrder = [];
    (referenceContainer?.order || []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.type === "item" && validItemIds.has(entry.id)) restoredOrder.push({ type: "item", id: entry.id });
      if (entry.type === "container" && validChildIds.has(entry.id)) restoredOrder.push({ type: "container", id: entry.id });
    });
    container.itemIds.forEach((itemId) => {
      if (!restoredOrder.some((entry) => entry.type === "item" && entry.id === itemId)) restoredOrder.push({ type: "item", id: itemId });
    });
    container.childIds.forEach((childId) => {
      if (!restoredOrder.some((entry) => entry.type === "container" && entry.id === childId)) restoredOrder.push({ type: "container", id: childId });
    });
    container.order = restoredOrder;
  });
  const layout = targetState.layouts?.[targetState.activeLayoutId];
  if (layout) {
    const referenceLayout = referenceState.layouts?.[referenceState.activeLayoutId] || referenceState.layouts?.[targetState.activeLayoutId];
    const referenceRoots = uniqueLayoutIds(referenceLayout?.rootContainerIds || []).filter((id) =>
      targetState.containers?.[id] && !targetState.containers[id].parentId
    );
    layout.rootContainerIds = referenceRoots.length
      ? referenceRoots
      : Object.values(targetState.containers || {}).filter((container) => !container.parentId).map((container) => container.id);
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds);
  }
  return true;
}

function repairRemoteStateFromLocalReferences(remoteState) {
  if (!remoteState) return false;
  const baseState = loadBaseState();
  if (baseState && repairPlacementRegressionFromReference(remoteState, baseState)) return true;
  return repairPlacementRegressionFromReference(remoteState, state);
}

function blockDestructiveLocalSave() {
  const baseState = loadBaseState();
  if (!isDestructiveStateRegression(state, baseState)) return false;
  saveRecoverySnapshot("blocked-save", state);
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  saveSyncMeta();
  const localStats = stateStatsForDestructiveComparison(state);
  const baseStats = stateStatsForDestructiveComparison(baseState);
  const basePlaced = Math.max(baseStats.placedItems, baseStats.linkedItems, baseStats.arrangedItems);
  const localPlaced = Math.max(localStats.placedItems, localStats.linkedItems, localStats.arrangedItems);
  updateSyncUi(`Локальная версия выглядит усечённой: база items ${baseStats.items}, containers ${baseStats.containers}, связей ${basePlaced}, вложенных контейнеров ${baseStats.nestedContainers}; сейчас items ${localStats.items}, containers ${localStats.containers}, связей ${localPlaced}, вложенных контейнеров ${localStats.nestedContainers}. На сервер не отправлено.`);
  return true;
}

function repairCollapsedActiveLayoutBeforeSave() {
  const activeLayout = state.layouts?.[state.activeLayoutId];
  if (!activeLayout) return false;
  if (loadActiveLayoutChoice() === state.activeLayoutId) return false;
  if (isRecentExplicitLayoutChoice(state.activeLayoutId)) return false;
  if (layoutArrangementContentScore(state, activeLayout) > 0) return false;
  const bestLayoutId = bestMeaningfulLayoutId(state);
  if (!bestLayoutId || bestLayoutId === state.activeLayoutId) return false;
  const stats = stateStatsForDestructiveComparison(state);
  if (stats.items < 10 || stats.containers < 6) return false;
  saveRecoverySnapshot("collapsed-active-layout-before-save", state);
  state.activeLayoutId = bestLayoutId;
  applyLayoutArrangement(bestLayoutId);
  rememberActiveLayoutChoice(bestLayoutId);
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  saveSyncMeta();
  renderPreservingPackingScroll();
  updateSyncUi("Активная укладка была пустой · переключил на непустую укладку перед сохранением.");
  return true;
}

function isCurrentLocalStateDestructiveRegression() {
  return isDestructiveStateRegression(state, loadBaseState());
}

async function loadCurrentServerStateDirectly({ notify = false, preferredLayout = null } = {}) {
  updateSyncUi("Загружаю текущую серверную версию...");
  const data = await fetchRemoteStateRecord();
  const record = data?.record || data?.list || data || null;
  const remoteState = normalizeRemoteState(record?.payload || data?.payload || data?.state);
  const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
  const remoteRawPayload = record?.payload || data?.payload || data?.state || null;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return false;
  if (!remoteState) throw new Error("Сервер не вернул текущую версию укладки.");
  const updatedAt = remoteUpdatedAt(record) || data?.serverUpdatedAt || remoteIntegrityMeta.updatedAt || nowIso();
  const applied = applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, {
    allowDestructive: true,
    preferredLayout
  });
  if (applied && notify) showToast("Загружена текущая серверная версия.", "success");
  return applied;
}

async function offerLoadServerForTruncatedLocalState({ notify = false, preferredLayout = null } = {}) {
  if (!isCurrentLocalStateDestructiveRegression()) return false;
  blockDestructiveLocalSave();
  const confirmed = await askConfirmDialog({
    title: "Локальная раскладка выглядит повреждённой",
    text: "На этом устройстве потеряны связи вещей с сумками или вложенность контейнеров. Эту версию нельзя отправлять на сервер. Загрузить текущую серверную версию без обращения к истории?",
    okText: "Взять с сервера",
    cancelText: "Оставить локальную",
    tone: "danger"
  });
  if (!confirmed) return true;
  await loadCurrentServerStateDirectly({ notify, preferredLayout });
  return true;
}

function applyRemoteState(remoteState, updatedAt, integrityMeta = null, rawPayload = null, { allowDestructive = false, preferredLayout = null } = {}) {
  repairRemoteStateFromLocalReferences(remoteState);
  const preferredLayoutId = resolvePreferredLayoutId(remoteState, preferredLayout?.id, preferredLayout?.name, {
    allowEmptyPreferred: Boolean(preferredLayout?.allowEmpty)
  });
  if (preferredLayoutId) remoteState.activeLayoutId = preferredLayoutId;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, integrityMeta, rawPayload)) return false;
  if (!allowDestructive && blockDestructiveRemoteState(remoteState, "remote-apply")) {
    renderInitialLocalFallbackIfNeeded();
    return false;
  }
  replaceState(remoteState);
  removePublicLayoutDrafts();
  setActivePrivateScope();
  rememberPrivateServerLayoutChoice();
  saveBaseState(serializeState({ forSync: true }));
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = updatedAt || null;
  syncMeta.localUpdatedAt = updatedAt || null;
  syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
  rememberRemoteIntegrityMeta(integrityMeta);
  saveSyncMeta();
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  updateSyncUi();
  return true;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function mergeStateFromBase(baseState, localState, remoteState) {
  if (!baseState) return { merged: null, conflicts: [{ type: "state", label: "Нет базовой серверной копии" }] };
  const merged = clone(remoteState);
  const conflicts = [];

  merged.locations = mergeStringList(baseState.locations || [], localState.locations || [], remoteState.locations || []);
  merged.categories = mergeStringList(baseState.categories || [], localState.categories || [], remoteState.categories || []);
  merged.items = mergeRecordMap("item", baseState.items || {}, localState.items || {}, remoteState.items || {}, conflicts);
  merged.containers = mergeRecordMap("container", baseState.containers || {}, localState.containers || {}, remoteState.containers || {}, conflicts);
  merged.layouts = mergeRecordMap("layout", baseState.layouts || {}, localState.layouts || {}, remoteState.layouts || {}, conflicts);
  merged.collapsedContainers = clone(localState.collapsedContainers || remoteState.collapsedContainers || {});
  merged.packedItems = mergeRecordMap("packed", baseState.packedItems || {}, localState.packedItems || {}, remoteState.packedItems || {}, conflicts);

  ["activeLayoutId", "collapseDefaultsVersion"].forEach((key) => {
    merged[key] = mergeScalarField(key, baseState[key], localState[key], remoteState[key], conflicts);
  });
  merged.showItemMeta = Boolean(localState.showItemMeta);
  merged.showFilterContext = Boolean(localState.showFilterContext);
  merged.collectionMode = Boolean(localState.collectionMode);
  merged.showOnlyUnpacked = Boolean(localState.showOnlyUnpacked && merged.collectionMode);

  migrateContainerOrder(merged);
  applyLayoutArrangement(merged.activeLayoutId, merged);
  applyDefaultCollapsedContainers(merged);
  return { merged, conflicts };
}

function mergeStringList(baseList, localList, remoteList) {
  const result = [];
  [...remoteList, ...localList].forEach((value) => {
    if (typeof value === "string" && !result.includes(value)) result.push(value);
  });
  baseList.forEach((value) => {
    if (localList.includes(value) && remoteList.includes(value) && !result.includes(value)) result.push(value);
  });
  return result;
}

function mergeRecordMap(type, baseMap, localMap, remoteMap, conflicts) {
  const merged = {};
  const ids = new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(remoteMap)]);
  ids.forEach((id) => {
    const baseHas = Object.prototype.hasOwnProperty.call(baseMap, id);
    const localHas = Object.prototype.hasOwnProperty.call(localMap, id);
    const remoteHas = Object.prototype.hasOwnProperty.call(remoteMap, id);
    const baseValue = baseMap[id];
    const localValue = localMap[id];
    const remoteValue = remoteMap[id];
    const baseCompare = comparableValueForMerge(type, baseValue);
    const localCompare = comparableValueForMerge(type, localValue);
    const remoteCompare = comparableValueForMerge(type, remoteValue);
    const localChanged = baseHas ? !sameJson(localCompare, baseCompare) || !localHas : localHas;
    const remoteChanged = baseHas ? !sameJson(remoteCompare, baseCompare) || !remoteHas : remoteHas;

    if (
      remoteChanged &&
      !remoteHas &&
      isPlacementOnlyLocalChangeAgainstDeletedRemote(type, baseCompare, localCompare, {
        baseHas,
        localHas,
        remoteHas
      })
    ) {
      return;
    }

    if (localChanged && remoteChanged && !sameJson(localCompare, remoteCompare)) {
      conflicts.push({
        type,
        id,
        label: conflictLabel(type, id, localValue, remoteValue, baseValue),
        localValue: localHas ? clone(localValue) : null,
        remoteValue: remoteHas ? clone(remoteValue) : null,
        baseValue: baseHas ? clone(baseValue) : null,
        localHas,
        remoteHas
      });
      if (remoteHas) merged[id] = clone(remoteValue);
      return;
    }
    if (localChanged) {
      if (localHas) merged[id] = clone(localValue);
      return;
    }
    if (remoteHas) merged[id] = clone(remoteValue);
  });
  return merged;
}

function isPlacementOnlyLocalChangeAgainstDeletedRemote(type, baseCompare, localCompare, flags = {}) {
  if (!flags.baseHas || !flags.localHas || flags.remoteHas) return false;
  if (!["item", "container"].includes(type)) return false;
  const changedKeys = changedComparableKeys(baseCompare, localCompare);
  if (!changedKeys.length) return true;
  const placementKeys = type === "item"
    ? new Set(["containerId"])
    : new Set(["parentId", "itemIds", "childIds", "order"]);
  return changedKeys.every((key) => placementKeys.has(key));
}

function changedComparableKeys(a, b) {
  return Object.keys({ ...(a || {}), ...(b || {}) })
    .filter((key) => !isConflictMetaField(key))
    .filter((key) => !sameJson(a?.[key], b?.[key]));
}

function comparableValueForMerge(type, value) {
  if (!["item", "container", "layout"].includes(type) || !value || typeof value !== "object") return value;
  const comparable = { ...value };
  Object.keys(comparable).forEach((key) => {
    if (isConflictMetaField(key)) delete comparable[key];
  });
  if (type === "item") stripItemPlacementFields(comparable);
  if (type === "container") stripContainerArrangementFields(comparable);
  if ((type === "item" || type === "container") && Array.isArray(comparable.photos)) {
    comparable.photos = comparable.photos.map(comparablePhotoForMerge).filter(Boolean);
  }
  return comparable;
}

function normalizeComparableContainerForMerge(container) {
  const itemSet = new Set(uniqueLayoutIds(Array.isArray(container.itemIds) ? container.itemIds : []));
  const childSet = new Set(uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : []));
  container.itemIds = [...itemSet].sort();
  container.childIds = [...childSet].sort();
  container.order = normalizeComparableContainerOrder(container.order, itemSet, childSet);
}

function normalizeComparableContainerOrder(order, itemSet, childSet) {
  const seen = new Set();
  return (Array.isArray(order) ? order : [])
    .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
    .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
    .map((entry) => ({ type: entry.type, id: entry.id }))
    .filter((entry) => {
      const key = `${entry.type}:${entry.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function comparablePhotoForMerge(photo) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const id = String(photo.id || photo.photoId || photo.localId || "").trim();
  if (!id) return null;
  return {
    id,
    width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
    height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0
  };
}

function mergeScalarField(key, baseValue, localValue, remoteValue, conflicts) {
  const localChanged = !sameJson(localValue, baseValue);
  const remoteChanged = !sameJson(remoteValue, baseValue);
  if (localChanged && remoteChanged && !sameJson(localValue, remoteValue)) {
    conflicts.push({
      type: "setting",
      id: key,
      label: settingLabel(key),
      localValue: clone(localValue),
      remoteValue: clone(remoteValue),
      baseValue: clone(baseValue),
      localHas: true,
      remoteHas: true
    });
    return remoteValue;
  }
  if (localChanged) return localValue;
  return remoteValue;
}

function wasUpdatedByCurrentDevice(value) {
  if (!value || typeof value !== "object") return false;
  const deviceId = String(value.updatedByDeviceId || value.sourceDeviceId || "").trim();
  if (deviceId && deviceId === syncDevice.id) return true;
  const deviceName = String(value.updatedByDeviceName || value.sourceDeviceName || "").trim();
  return Boolean(!deviceId && deviceName && deviceName === syncDevice.name);
}

function isOwnLayoutEchoConflict(conflicts) {
  return Boolean(
    conflicts.length &&
    conflicts.every((conflict) =>
      conflict.type === "layout" &&
      conflict.localHas &&
      conflict.remoteHas &&
      (
        (
          wasUpdatedByCurrentDevice(conflict.localValue) &&
          wasUpdatedByCurrentDevice(conflict.remoteValue)
        ) ||
        (
          sameJson(conflict.localValue?.updatedByDeviceId || "", conflict.remoteValue?.updatedByDeviceId || "") &&
          sameJson(conflict.localValue?.updatedByDeviceName || "", conflict.remoteValue?.updatedByDeviceName || "") &&
          sameJson(conflict.localValue?.updatedAt || "", conflict.remoteValue?.updatedAt || "")
        )
      )
    )
  );
}

function conflictLabel(type, id, localValue, remoteValue, baseValue) {
  const value = localValue || remoteValue || baseValue || {};
  if (type === "item") return value.name || `Вещь ${id}`;
  if (type === "container") return value.name || `Контейнер ${id}`;
  if (type === "layout") return value.name || `Укладка ${id}`;
  if (type === "packed") return `Собранность: ${state.items[id]?.name || id}`;
  if (type === "collapsed") return `Сворачивание: ${state.containers[id]?.name || id}`;
  return id;
}

function settingLabel(key) {
  const labels = {
    activeLayoutId: "Текущая укладка",
    showItemMeta: "Показ меток",
    collapseDefaultsVersion: "Состояние сворачивания"
  };
  return labels[key] || key;
}

function formatMergeConflicts(conflicts) {
  return conflicts.slice(0, 6).map((conflict) => `• ${conflict.label}`).join("\n") +
    (conflicts.length > 6 ? `\n…и ещё ${conflicts.length - 6}` : "");
}

function applyConflictChoices(mergedState, conflicts, choices) {
  conflicts.forEach((conflict, index) => {
    const choice = choices[index] || "local";
    const useLocal = choice === "local";
    const value = useLocal ? conflict.localValue : conflict.remoteValue;
    const exists = useLocal ? conflict.localHas : conflict.remoteHas;
    if (conflict.type === "setting") {
      if (exists) mergedState[conflict.id] = clone(value);
      return;
    }
    const target = conflictTargetMap(mergedState, conflict.type);
    if (!target) return;
    if (exists) target[conflict.id] = clone(value);
    else delete target[conflict.id];
  });
  migrateContainerOrder(mergedState);
  applyDefaultCollapsedContainers(mergedState);
}

function conflictTargetMap(targetState, type) {
  if (type === "item") return targetState.items;
  if (type === "container") return targetState.containers;
  if (type === "layout") return targetState.layouts;
  if (type === "collapsed") return targetState.collapsedContainers;
  if (type === "packed") return targetState.packedItems;
  return null;
}

function askConflictResolution(conflicts) {
  refs.conflictList.innerHTML = conflicts.map((conflict, index) => {
    const defaultChoice = conflictDefaultChoice(conflict);
    return `
    <section class="conflict-card">
      <h3>${escapeHtml(conflict.label)}</h3>
      <div class="conflict-kind">${escapeHtml(conflictKindLabel(conflict))}</div>
      <p>${escapeHtml(conflictSummary(conflict))}</p>
      ${renderConflictDetails(conflict)}
      <div class="conflict-choice">
        <label>
          <input type="radio" name="conflict-${index}" value="local"${defaultChoice === "local" ? " checked" : ""} />
          <span>Моё</span>
          <small>${escapeHtml(conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name, "нет локально"))}</small>
        </label>
        <label>
          <input type="radio" name="conflict-${index}" value="remote"${defaultChoice === "remote" ? " checked" : ""} />
          <span>С сервера</span>
          <small>${escapeHtml(conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, "сервер", "нет в серверной укладке"))}</small>
        </label>
      </div>
    </section>
  `;
  }).join("");
  refs.conflictDialog.returnValue = "";
  return new Promise((resolve) => {
    const cleanup = () => {
      refs.conflictDialog.removeEventListener("close", handleClose);
      refs.conflictServerBtn.onclick = null;
      refs.conflictApplyBtn.onclick = null;
    };
    const readChoices = () => Object.fromEntries(conflicts.map((conflict, index) => {
      const selected = refs.conflictList.querySelector(`input[name="conflict-${index}"]:checked`);
      return [index, selected?.value || conflictDefaultChoice(conflict)];
    }));
    const handleClose = () => {
      const returnValue = refs.conflictDialog.returnValue || "cancel";
      const result = returnValue === "server" ? "server" : (returnValue === "default" ? readChoices() : "cancel");
      cleanup();
      resolve(result);
    };
    refs.conflictServerBtn.onclick = (event) => {
      event.preventDefault();
      refs.conflictDialog.close("server");
    };
    refs.conflictApplyBtn.onclick = (event) => {
      event.preventDefault();
      refs.conflictDialog.close("default");
    };
    refs.conflictDialog.addEventListener("close", handleClose);
    openModalDialog(refs.conflictDialog);
  });
}

function conflictDefaultChoice(conflict) {
  if (!conflict?.remoteHas) return conflict?.baseValue ? "remote" : "local";
  if (!conflict.localHas) return "remote";
  const localTime = conflictTimestamp(conflict.localValue);
  const remoteTime = conflictTimestamp(conflict.remoteValue);
  if (remoteTime && (!localTime || remoteTime > localTime + 1000)) return "remote";
  return "local";
}

function conflictKindLabel(conflict) {
  const layoutText = conflictLayoutScopeText(conflict);
  if (conflict.type === "item") {
    if (isItemPlacementConflict(conflict)) return `Вещь в укладке${layoutText ? `: ${layoutText}` : ""}`;
    return "Вещь";
  }
  if (conflict.type === "container") {
    if (isContainerPlacementConflict(conflict)) return `Сумка/контейнер в укладке${layoutText ? `: ${layoutText}` : ""}`;
    return "Сумка/контейнер";
  }
  if (conflict.type === "layout") return "Укладка";
  if (conflict.type === "packed") return "Собранность вещи";
  if (conflict.type === "setting") return "Настройка";
  return "Конфликт";
}

function isItemPlacementConflict(conflict) {
  return false;
}

function isContainerPlacementConflict(conflict) {
  return false;
}

function conflictLayoutScopeText(conflict) {
  const containerIds = [
    conflict.localValue?.containerId,
    conflict.remoteValue?.containerId,
    conflict.baseValue?.containerId,
    conflict.type === "container" ? conflict.id : "",
    conflict.localValue?.parentId,
    conflict.remoteValue?.parentId,
    conflict.baseValue?.parentId
  ].filter(Boolean);
  const names = layoutNamesForConflictContainers(containerIds);
  if (names.length) return names.slice(0, 2).join(", ") + (names.length > 2 ? "..." : "");
  return state.layouts?.[state.activeLayoutId]?.name || "";
}

function layoutNamesForConflictContainers(containerIds = []) {
  const ids = new Set(containerIds.filter(Boolean));
  if (!ids.size) return [];
  return Object.values(state.layouts || {})
    .filter((layout) => layout && layoutContainsAnyConflictContainer(layout, ids))
    .map((layout) => layout.name || layout.id)
    .filter(Boolean);
}

function layoutContainsAnyConflictContainer(layout, ids) {
  const roots = Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [];
  if (roots.some((id) => ids.has(id))) return true;
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const arrangementRoots = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  if (arrangementRoots.some((id) => ids.has(id))) return true;
  return Object.keys(arrangement.containers || {}).some((id) => ids.has(id));
}

function conflictTimestamp(value) {
  return timeValue(value?.updatedAt || value?.updated_at || value?.clientUpdatedAt || "");
}

function renderConflictDetails(conflict) {
  const rows = conflictDetailRows(conflict);
  if (!rows.length) return "";
  return `
    <div class="conflict-diff" aria-label="Что изменилось">
      <div class="conflict-diff-head">
        <span>Поле</span>
        <span>Моё</span>
        <span>С сервера</span>
      </div>
      ${rows.map((row) => `
        <div class="conflict-diff-row">
          <span>${escapeHtml(row.label)}</span>
          <span>${escapeHtml(row.local)}</span>
          <span>${escapeHtml(row.remote)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function conflictDetailRows(conflict) {
  if (!conflict.localHas || !conflict.remoteHas) {
    return [{
      label: "Статус",
      local: conflict.localHas ? "есть локально" : "нет локально",
      remote: conflict.remoteHas ? "есть в серверной укладке" : "нет в серверной укладке"
    }];
  }
  const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
  const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
  if (sameJson(localValue, remoteValue)) return [];
  if (conflict.type === "packed" || conflict.type === "setting") {
    return [{
      label: conflict.type === "packed" ? "Собранность" : settingLabel(conflict.id),
      local: formatConflictFieldValue(localValue, "value", conflict, conflict.type === "packed" ? "boolean" : ""),
      remote: formatConflictFieldValue(remoteValue, "value", conflict, conflict.type === "packed" ? "boolean" : "")
    }];
  }
  const rows = conflictDiffFieldDefinitions(conflict)
    .filter(([key]) => !sameJson(localValue?.[key], remoteValue?.[key]))
    .map(([key, label, format]) => ({
      label,
      local: formatConflictFieldValue(localValue?.[key], key, conflict, format),
      remote: formatConflictFieldValue(remoteValue?.[key], key, conflict, format)
    }));
  const knownKeys = new Set(conflictDiffFieldDefinitions(conflict).map(([key]) => key));
  Object.keys({ ...(localValue || {}), ...(remoteValue || {}) })
    .filter((key) => !knownKeys.has(key) && !isConflictMetaField(key))
    .filter((key) => !sameJson(localValue?.[key], remoteValue?.[key]))
    .slice(0, Math.max(0, 8 - rows.length))
    .forEach((key) => {
      rows.push({
        label: key,
        local: formatConflictFieldValue(localValue?.[key], key, conflict),
        remote: formatConflictFieldValue(remoteValue?.[key], key, conflict)
      });
    });
  return rows.slice(0, 8);
}

function conflictDiffFieldDefinitions(conflict) {
  if (conflict.type === "item") {
    return [
      ["name", "Название"],
      ["weight", "Вес", "weight"],
      ["quantity", "Количество"],
      ["location", "Место хранения"],
      ["categories", "Категории", "list"],
      ["category", "Категория"],
      ["containerId", "Где лежит", "container"],
      ["note", "Заметка"],
      ["photos", "Фото", "photos"]
    ];
  }
  if (conflict.type === "container") {
    return [
      ["name", "Название"],
      ["weight", "Вес", "weight"],
      ["volume", "Объём"],
      ["location", "Место хранения"],
      ["parentId", "Вложено в", "container"],
      ["itemIds", "Вещи внутри", "count"],
      ["childIds", "Вложенные сумки", "count"],
      ["order", "Порядок внутри", "count"],
      ["note", "Заметка"],
      ["color", "Цвет"],
      ["photos", "Фото", "photos"]
    ];
  }
  if (conflict.type === "layout") {
    return [
      ["name", "Название"],
      ["rootContainerIds", "Сумки в укладке", "count"],
      ["arrangement", "Раскладка", "arrangement"]
    ];
  }
  if (conflict.type === "packed") return [["value", "Собранность", "boolean"]];
  if (conflict.type === "setting") return [["value", settingLabel(conflict.id)]];
  return [];
}

function isConflictMetaField(key) {
  return [
    "id",
    "createdAt",
    "created_at",
    "createdByDeviceId",
    "createdByDeviceName",
    "updatedAt",
    "updated_at",
    "updatedByDeviceId",
    "updatedByDeviceName",
    "clientUpdatedAt",
    "client_updated_at",
    "sourceDeviceId",
    "sourceDeviceName",
    "source_device_id",
    "source_device_name"
  ].includes(key);
}

function formatConflictFieldValue(value, key, conflict, format = "") {
  if (conflict.type === "packed" && key === "value") return value ? "собрано" : "не собрано";
  if (value == null || value === "") return "пусто";
  if (format === "weight") return formatWeight(parseWeightInput(value));
  if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || "пусто" : String(value);
  if (format === "container") return formatConflictContainerValue(value);
  if (format === "photos") return Array.isArray(value) ? `${value.length} фото` : (value ? "есть" : "нет");
  if (format === "count") return formatConflictCountValue(value, key, conflict);
  if (format === "arrangement") return formatArrangementConflictValue(value);
  if (format === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "пусто";
  if (typeof value === "object") return formatCompactJson(value);
  return String(value);
}

function formatConflictCountValue(value, key, conflict) {
  if (!Array.isArray(value)) return formatCompactJson(value);
  if (conflict?.type === "container" && (key === "itemIds" || key === "childIds" || key === "order")) {
    const names = value.map((entry) => conflictContainerEntryLabel(entry, key)).filter(Boolean);
    if (!names.length) return "0";
    return `${value.length}: ${names.slice(0, 4).join(" → ")}${names.length > 4 ? "…" : ""}`;
  }
  return `${value.length}`;
}

function conflictContainerEntryLabel(entry, key) {
  if (key === "order" && entry && typeof entry === "object") {
    const id = String(entry.id || "");
    if (!id) return "";
    return entry.type === "container"
      ? (state.containers?.[id]?.name || id)
      : (state.items?.[id]?.name || id);
  }
  const id = String(entry || "");
  if (!id) return "";
  return key === "childIds"
    ? (state.containers?.[id]?.name || id)
    : (state.items?.[id]?.name || id);
}

function formatConflictContainerValue(value) {
  const id = String(value || "");
  if (!id) return "вне укладки";
  return state.containers?.[id]?.name || id;
}

function formatArrangementConflictValue(value) {
  if (!value || typeof value !== "object") return "пусто";
  const containers = value.containers && typeof value.containers === "object" ? Object.keys(value.containers).length : 0;
  const items = value.items && typeof value.items === "object" ? Object.keys(value.items).length : 0;
  const roots = Array.isArray(value.rootContainerIds) ? value.rootContainerIds.length : 0;
  return `${roots} корневых, ${containers} сумок, ${items} вещей`;
}

function formatCompactJson(value) {
  const text = JSON.stringify(value ?? null);
  if (!text) return "пусто";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function conflictSummary(conflict) {
  const localText = conflictValueSummary(conflict, conflict.localValue, conflict.localHas, "нет локально");
  const remoteText = conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas, "нет в серверной укладке");
  const localStamp = conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name, "нет локально");
  const remoteStamp = conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, "сервер", "нет в серверной укладке");
  const difference = conflictDifferenceSummary(conflict);
  return `Моё: ${localText} (${localStamp}). Сервер: ${remoteText} (${remoteStamp}).${difference ? ` Разница: ${difference}.` : ""}`;
}

function conflictVersionStamp(value, exists, fallbackDevice, missingText = "нет") {
  if (!exists) return missingText;
  const device = value?.updatedByDeviceName || fallbackDevice || "устройство";
  const time = formatShortDateTime(value?.updatedAt);
  return time ? `${device}, ${time}` : device;
}

function formatShortDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function conflictValueSummary(conflict, value, exists, missingText = "нет") {
  if (!exists) return missingText;
  if (conflict.type === "item") {
    return [value.name, value.location, itemCategories(value).join(", ")].filter(Boolean).join(" · ") || "изменено";
  }
  if (conflict.type === "container" || conflict.type === "layout") return value.name || "изменено";
  if (conflict.type === "packed") return value ? "собрано" : "не собрано";
  if (conflict.type === "collapsed") return value ? "свернуто" : "развернуто";
  if (conflict.type === "setting") return String(value);
  return "изменено";
}

function conflictDifferenceSummary(conflict) {
  if (!conflict.localHas || !conflict.remoteHas) return "";
  const localValue = comparableValueForMerge(conflict.type, conflict.localValue);
  const remoteValue = comparableValueForMerge(conflict.type, conflict.remoteValue);
  if (sameJson(localValue, remoteValue)) return "";
  if (conflict.type === "item") {
    return describeChangedFields(localValue, remoteValue, [
      ["name", "название"],
      ["weight", "вес"],
      ["quantity", "количество"],
      ["location", "место"],
      ["category", "категория"],
      ["categories", "категории"],
      ["containerId", "сумка/пакет"],
      ["note", "заметка"],
      ["photos", "фото"]
    ]);
  }
  if (conflict.type === "container") {
    return describeChangedFields(localValue, remoteValue, [
      ["name", "название"],
      ["weight", "вес"],
      ["volume", "объём"],
      ["location", "место"],
      ["note", "заметка"],
      ["color", "цвет"],
      ["itemIds", "состав"],
      ["childIds", "вложенные сумки"],
      ["order", "порядок внутри"],
      ["parentId", "расположение"],
      ["photos", "фото"]
    ]);
  }
  if (conflict.type === "layout") {
    return describeChangedFields(localValue, remoteValue, [
      ["name", "название"],
      ["rootContainerIds", "сумки в укладке"],
      ["arrangement", "раскладка колонок"]
    ]);
  }
  if (conflict.type === "packed") return "собранность";
  if (conflict.type === "setting") return settingLabel(conflict.id);
  return "";
}

function describeChangedFields(localValue, remoteValue, fields) {
  const changed = fields
    .filter(([key]) => !sameJson(localValue?.[key], remoteValue?.[key]))
    .map(([, label]) => label);
  if (changed.length) return changed.slice(0, 4).join(", ") + (changed.length > 4 ? "…" : "");
  return "служебные данные";
}

function isNetworkError(error) {
  return Boolean(error?.isNetworkError);
}

function isTimeoutError(error) {
  return Boolean(error?.isTimeoutError);
}

function isTemporaryServerStorageError(error) {
  const message = `${error?.message || ""} ${error?.data?.error || ""} ${error?.data?.message || ""}`;
  return /out of sort memory|sort buffer/i.test(message);
}

function createNetworkError(message, cause = null, options = {}) {
  const networkError = new Error(message);
  networkError.isNetworkError = true;
  if (options.timeout) networkError.isTimeoutError = true;
  networkError.cause = cause;
  return networkError;
}

function apiErrorMessage(error) {
  return String(
    error?.data?.message ||
    error?.data?.error ||
    error?.data?.code ||
    error?.message ||
    "unknown error"
  );
}

function unlockOfflineState(message = "Локально · можно работать, войдите для сохранения в аккаунт") {
  currentUser = null;
  appUnlocked = true;
  if (!isForcedOffline()) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
    renderPreservingPackingScroll();
    updateSyncUi(currentPublicTemplateStatusMessage());
    return;
  }
  renderInitialLocalFallbackIfNeeded();
  updateSyncUi(message);
}

function toggleTopMenu(event) {
  event.stopPropagation();
  const open = refs.topMenu.hidden;
  refs.topMenu.hidden = !open;
  refs.menuBtn.setAttribute("aria-expanded", String(open));
}

function closeTopMenu() {
  if (!refs.topMenu || refs.topMenu.hidden) return;
  refs.topMenu.hidden = true;
  refs.menuBtn?.setAttribute("aria-expanded", "false");
}

function currentUserEmail() {
  const fromUser = String(currentUser?.email || currentUser?.mail || currentUser?.login || "").trim().toLowerCase();
  if (fromUser) return fromUser;
  try {
    return String(localStorage.getItem(AUTH_EMAIL_KEY) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function currentUserId() {
  return String(currentUser?.id || currentUser?.userId || currentUser?.user_id || currentUser?.sub || "").trim().toLowerCase();
}

function isAdminUser() {
  if (!currentUser) return false;
  const email = currentUserEmail();
  const userId = currentUserId();
  return ADMIN_EMAILS.includes(email) || ADMIN_USER_IDS.includes(userId);
}

function canOpenAdminPublishedEdit() {
  return isAdminSession();
}

function updateSyncUi(message = "") {
  const loggedIn = Boolean(currentUser);
  const unlocked = loggedIn || appUnlocked;
  const forcedOffline = isForcedOffline();
  const privateStateAvailable = canUseLocalEditableState() && !isReadOnlyStateScope();
  if (!privateStateAvailable && unlocked) ensureGuestPublicScope();
  document.body.classList.toggle("auth-gated", !unlocked);
  refs.authBtn.textContent = loggedIn ? t("menu.signOut") : t("menu.signIn");
  refs.forceOfflineBtn.textContent = forcedOffline ? t("menu.online") : t("menu.offline");
  refs.forceOfflineBtn.classList.toggle("active", forcedOffline);
  refs.collectionMenuBtn.textContent = state.collectionMode ? t("menu.collectionOn") : t("menu.collectionOff");
  refs.collectionMenuBtn.classList.toggle("active", state.collectionMode);
  refs.syncBtn.disabled = !loggedIn && !appUnlocked;
  updateSyncVisualState({ loggedIn, unlocked, message });
  if (message) {
    refs.syncStatus.textContent = message;
    return;
  }
  if (forcedOffline && appUnlocked) {
    refs.syncStatus.textContent = t("sync.forcedOffline");
    return;
  }
  if (!loggedIn && appUnlocked) {
    refs.syncStatus.textContent = privateStateAvailable ? t("sync.localUnlocked") : currentPublicTemplateStatusMessage();
    return;
  }
  if (!loggedIn) {
    refs.syncStatus.textContent = t("sync.localUnlocked");
    return;
  }
  refs.syncStatus.textContent = syncMeta.dirty ? t("sync.dirty") : t("sync.synced");
}

function updateSyncVisualState({ loggedIn, unlocked, message = "" }) {
  let nextState = "local";
  const lowerMessage = message.toLowerCase();
  if (isForcedOffline()) {
    nextState = "offline";
  } else if (lowerMessage.includes("не удалось") || lowerMessage.includes("нет соединения") || lowerMessage.includes("сервер недоступен")) {
    nextState = "error";
  } else if (!loggedIn && unlocked) {
    nextState = isReadOnlyStateScope() ? "synced" : "offline";
  } else if (loggedIn && (lowerMessage.includes("сохраня") || lowerMessage.includes("загружа") || lowerMessage.includes("проверя"))) {
    nextState = "syncing";
  } else if (loggedIn && syncMeta.dirty) {
    nextState = "dirty";
  } else if (loggedIn) {
    nextState = "synced";
  }
  syncVisualState = nextState;
  document.body.classList.toggle("sync-local", syncVisualState === "local");
  document.body.classList.toggle("sync-offline", syncVisualState === "offline");
  document.body.classList.toggle("sync-syncing", syncVisualState === "syncing");
  document.body.classList.toggle("sync-dirty", syncVisualState === "dirty");
  document.body.classList.toggle("sync-synced", syncVisualState === "synced");
  document.body.classList.toggle("sync-error", syncVisualState === "error");
  refs.syncBtn.dataset.syncState = syncVisualState;
}

async function apiFetch(path, options = {}) {
  if (isForcedOffline()) {
    throw createNetworkError("принудительный офлайн-режим");
  }
  if ("onLine" in navigator && !navigator.onLine) {
    throw createNetworkError("нет соединения с сервером");
  }
  const { timeoutMs = API_TIMEOUT_MS, ...fetchOptions } = options;
  const isFormDataBody = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: "include",
      cache: fetchOptions.cache || "no-store",
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {})
      }
    });
  } catch (error) {
    const timeout = error?.name === "AbortError";
    const message = timeout ? "сервер не ответил вовремя" : "нет соединения с сервером";
    throw createNetworkError(message, error, { timeout });
  } finally {
    window.clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const apiError = new Error(data?.message || data?.error || data?.code || `HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.data = data;
    apiError.path = path;
    apiError.method = fetchOptions.method || "GET";
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] API error", {
        method: apiError.method,
        path,
        status: response.status,
        response: data
      });
    }
    throw apiError;
  }
  return data;
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Не удалось открыть хранилище фото"));
  });
}

async function photoDbStore(mode, callback) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, mode);
    const store = transaction.objectStore(PHOTO_STORE);
    let request;
    try {
      request = callback(store);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Не удалось прочитать фото"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Ошибка хранилища фото"));
    };
  });
}

function putCachedPhoto(record) {
  return photoDbStore("readwrite", (store) => store.put(record));
}

function getCachedPhoto(id) {
  if (!id) return Promise.resolve(null);
  return photoDbStore("readonly", (store) => store.get(id)).catch(() => null);
}

function deleteCachedPhoto(id) {
  if (!id) return Promise.resolve();
  return photoDbStore("readwrite", (store) => store.delete(id)).catch(() => null);
}

async function createItemPhotoFromFile(file) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("Выберите файл изображения.");
  }
  const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const full = await resizeImageFile(file, ITEM_PHOTO_MAX_SIZE, ITEM_PHOTO_QUALITY);
  const thumb = await resizeImageFile(file, ITEM_PHOTO_THUMB_SIZE, ITEM_PHOTO_QUALITY);
  const createdAt = nowIso();
  await putCachedPhoto({
    id: photoId,
    blob: full.blob,
    thumbBlob: thumb.blob,
    fileName: file.name || "item-photo.jpg",
    type: full.blob.type || "image/jpeg",
    size: full.blob.size,
    width: full.width,
    height: full.height,
    createdAt,
    updatedAt: createdAt
  });
  return {
    id: photoId,
    localId: photoId,
    status: "pending",
    url: "",
    thumbUrl: "",
    fileName: file.name || "",
    type: full.blob.type || "image/jpeg",
    size: full.blob.size,
    width: full.width,
    height: full.height,
    createdAt,
    updatedAt: createdAt,
    error: ""
  };
}

async function resizeImageFile(file, maxSize, quality) {
  const bitmap = await loadImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Не удалось подготовить фото.");
  return { blob, width, height };
}

function loadImageBitmap(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть фото."));
    };
    image.src = url;
  });
}

function primaryItemPhoto(item) {
  const photos = normalizeItemPhotos(item);
  return normalizePhotoUrlFields(photos[0]) || null;
}

function itemPhotoSignature(item) {
  const photo = primaryItemPhoto(item);
  if (!photo) return "";
  return [
    photo.id,
    photo.localId,
    photo.status,
    photo.url,
    photo.thumbUrl,
    photo.updatedAt,
    photo.error
  ].join("|");
}

function getPhotoUploadScope(layoutId = null) {
  if (!layoutId) return null;
  const layout = state.layouts?.[layoutId];
  if (!layout) return null;
  const containerIds = getActiveLayoutContainerIdSet(layout);
  const itemIds = new Set();
  containerIds.forEach((containerId) => {
    (state.containers?.[containerId]?.itemIds || []).forEach((itemId) => itemIds.add(itemId));
  });
  return { containerIds, itemIds };
}

function isEntityInPhotoUploadScope(entity, entityType, scope) {
  if (!scope) return true;
  if (entityType === "container") return scope.containerIds.has(entity.id);
  return scope.itemIds.has(entity.id);
}

function getUploadablePhotoEntries({ layoutId = null, listId = "" } = {}) {
  const scope = getPhotoUploadScope(layoutId);
  const entries = [];
  Object.values(state.items || {}).forEach((item) => {
    if (!isEntityInPhotoUploadScope(item, "item", scope)) return;
    normalizeItemPhotos(item).forEach((photo) => {
      if (isPhotoUsableFromServer(photo, listId)) return;
      const needsListReupload = listId && hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId);
      if (needsListReupload && photo.status === "missing-local-file") return;
      if (!needsListReupload && !["pending", "error", "uploading"].includes(photo.status)) return;
      if (!needsListReupload && photo.url && photo.thumbUrl && photo.status === "synced") return;
      entries.push({ entity: item, entityType: "item", photo });
    });
  });
  Object.values(state.containers || {}).forEach((container) => {
    if (!isEntityInPhotoUploadScope(container, "container", scope)) return;
    normalizeItemPhotos(container).forEach((photo) => {
      if (isPhotoUsableFromServer(photo, listId)) return;
      const needsListReupload = listId && hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId);
      if (needsListReupload && photo.status === "missing-local-file") return;
      if (!needsListReupload && !["pending", "error", "uploading"].includes(photo.status)) return;
      if (!needsListReupload && photo.url && photo.thumbUrl && photo.status === "synced") return;
      entries.push({ entity: container, entityType: "container", photo });
    });
  });
  return entries;
}

function getUnsyncedPhotoEntries({ layoutId = null, listId = "" } = {}) {
  const scope = getPhotoUploadScope(layoutId);
  const entries = [];
  Object.values(state.items || {}).forEach((item) => {
    if (!isEntityInPhotoUploadScope(item, "item", scope)) return;
    normalizeItemPhotos(item).forEach((photo) => {
      if (hasRemotePhotoUrl(photo)) return;
      if (photo.localId || photo.status !== "synced") entries.push({ entity: item, entityType: "item", photo });
    });
  });
  Object.values(state.containers || {}).forEach((container) => {
    if (!isEntityInPhotoUploadScope(container, "container", scope)) return;
    normalizeItemPhotos(container).forEach((photo) => {
      if (hasRemotePhotoUrl(photo)) return;
      if (photo.localId || photo.status !== "synced") entries.push({ entity: container, entityType: "container", photo });
    });
  });
  return entries;
}

function isPhotoUsableFromServer(photo, listId = "") {
  if (!hasRemotePhotoUrl(photo)) return false;
  if (listId && !isPhotoStoredForList(photo, listId)) return false;
  photo.status = "synced";
  photo.error = "";
  return true;
}

function isPhotoStoredForList(photo, listId) {
  const normalizedListId = String(listId || "");
  if (!normalizedListId) return true;
  if (photo?.listId && String(photo.listId) === normalizedListId) return true;
  const encoded = encodeURIComponent(normalizedListId);
  return [photo?.url, photo?.thumbUrl].some((src) =>
    typeof src === "string" && (src.includes(`/lists/${normalizedListId}/`) || src.includes(`/lists/${encoded}/`))
  );
}

function bikePackingPhotoAssetUrl(listId, photoId, variant) {
  if (!listId || !photoId) return "";
  return `${API_BASE}/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photoId)}/${variant}`;
}

function normalizeUploadedPhotoAssetUrls(photo, listId, uploadPath) {
  normalizePhotoUrlFields(photo);
  const photoId = photo?.id || photo?.photoId;
  if (!photo || !String(uploadPath || "").includes("/admin/") || !listId || !photoId) return photo;
  photo.url = bikePackingPhotoAssetUrl(listId, photoId, "file");
  photo.thumbUrl = bikePackingPhotoAssetUrl(listId, photoId, "thumb");
  return photo;
}

function isViewingPublishedTarget(target) {
  const readonlyLayoutId = activeReadOnlyLayoutId();
  if (!target || !readonlyLayoutId) return false;
  if (target.type === "demo") return readonlyLayoutId === DEMO_SHARED_LAYOUT_ID;
  return target.type === "shared" && readonlyLayoutId === target.sharedId;
}

function refreshPublishedLayoutView(target) {
  if (!isViewingPublishedTarget(target)) return;
  renderPreservingPackingScroll();
}

async function uploadPendingPhotos({ markDirty = false, layoutId = null, listId = "" } = {}) {
  if (photoUploadInFlight || !currentUser || isForcedOffline()) return false;
  if (isReadOnlyBikePackingContext()) return false;
  const entries = getUploadablePhotoEntries({ layoutId, listId });
  if (!entries.length) return false;
  let changed = false;
  photoUploadInFlight = true;
  try {
    const targetListId = listId || await ensureCurrentPackingListId();
    if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
    if (isReadOnlyBikePackingContext()) return false;
    for (const entry of entries) {
      const uploaded = await uploadEntityPhoto(targetListId, entry.entity, entry.photo, entry.entityType);
      changed = uploaded || changed;
    }
  } catch {
    // Keep photos queued locally; the next manual or automatic sync will retry.
  } finally {
    photoUploadInFlight = false;
  }
  if (changed) {
    if (markDirty) {
      saveState();
    } else {
      persistStateSnapshot(state);
    }
    renderPreservingPackingScroll();
  }
  return changed;
}

async function uploadEntityPhoto(listId, entity, photo, entityType = "item") {
  return uploadEntityPhotoToPath(`/bike-packing/lists/${encodeURIComponent(listId)}/photos`, listId, entity, photo, entityType);
}

async function uploadPublishedLayoutPhotos(layoutId, target, entries = null) {
  if (photoUploadInFlight || !currentUser || isForcedOffline()) return false;
  const uploadEntries = entries || getUploadablePhotoEntries({ layoutId, listId: publicListIdForPublishedTarget(target) });
  if (!uploadEntries.length) return false;
  const path = target.type === "demo"
    ? demoAdminPathForLanguage("/photos", target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/photos`;
  const listId = publicListIdForPublishedTarget(target);
  let changed = false;
  photoUploadInFlight = true;
  try {
    for (const entry of uploadEntries) {
      const uploaded = await uploadEntityPhotoToPath(path, listId, entry.entity, entry.photo, entry.entityType);
      changed = uploaded || changed;
    }
  } finally {
    photoUploadInFlight = false;
  }
  if (changed) {
    persistStateSnapshot(state);
    renderPreservingPackingScroll();
  }
  return changed;
}

async function uploadEntityPhotoToPath(path, listId, entity, photo, entityType = "item") {
  const localId = photo.localId || photo.id;
  const cached = await getCachedPhoto(localId);
  if (!cached?.blob) {
    photo.status = "missing-local-file";
    photo.error = "Локальный файл фото не найден.";
    photo.updatedAt = nowIso();
    return true;
  }

  photo.status = "uploading";
  photo.error = "";
  photo.updatedAt = nowIso();
  persistStateSnapshot(state);

  try {
    const formData = new FormData();
    formData.append("entityType", entityType);
    formData.append("entityId", entity.id);
    if (entityType === "item") formData.append("itemId", entity.id);
    formData.append("photoId", photo.id);
    formData.append("file", cached.blob, cached.fileName || photo.fileName || `${photo.id}.jpg`);
    if (cached.thumbBlob) formData.append("thumb", cached.thumbBlob, `thumb-${photo.id}.jpg`);
    const data = await apiFetch(path, {
      method: "POST",
      body: formData,
      timeoutMs: 30000
    });
    const serverPhoto = normalizeUploadedPhotoAssetUrls(data.photo || data, listId, path);
    Object.assign(photo, {
      ...photo,
      ...serverPhoto,
      id: serverPhoto.id || photo.id,
      localId,
      listId: String(serverPhoto.listId || serverPhoto.list_id || listId || ""),
      status: "synced",
      error: "",
      updatedAt: serverPhoto.updatedAt || nowIso()
    });
    if (entityType === "container") touchContainer(entity.id, photo.updatedAt);
    else touchItem(entity.id, photo.updatedAt);
    return true;
  } catch (error) {
    photo.status = "error";
    photo.error = error.message || "Не удалось загрузить фото.";
    photo.updatedAt = nowIso();
    return true;
  }
}

async function deleteRemotePhotoIfPossible(entityId, photo, entityType = "item") {
  if (!currentUser || isForcedOffline() || !photo?.id) return;
  if (isReadOnlyBikePackingContext()) return;
  try {
    const listId = await ensureCurrentPackingListId();
    if (!currentPackingListMeta && listId) await fetchRemoteListDetailRecord(listId).catch(() => null);
    if (isReadOnlyBikePackingContext()) return;
    await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photo.id)}`, {
      method: "DELETE"
    });
  } catch {
    // Deletion of orphaned remote files is best-effort; state sync is the source of truth for the item.
  }
}

function normalizePackingListsResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.lists)) return data.lists;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function chooseDefaultPackingList(lists) {
  const editableLists = lists.filter((list) => !isReadOnlyBikePackingRecord(list));
  const saved = currentPackingListId && editableLists.find((list) => list?.id === currentPackingListId);
  if (saved) return saved;
  return editableLists.find((list) => list?.isDefault || list?.default || list?.itemKey === DATA_ITEM_KEY) ||
    editableLists.find((list) => list?.role === "owner" || list?.owner || list?.canEdit) ||
    editableLists[0] ||
    null;
}

async function ensureCurrentPackingListId() {
  if (isPublicTemplateListId(currentPackingListId)) saveActivePackingListId("");
  if (currentPackingListId) return currentPackingListId;
  const data = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
  const list = chooseDefaultPackingList(normalizePackingListsResponse(data));
  if (list?.id) {
    saveActivePackingListId(list.id);
    return currentPackingListId;
  }
  throw new Error("Список для загрузки фото не найден.");
}

async function refreshCurrentPackingListId() {
  try {
    if (isPublicTemplateListId(currentPackingListId)) saveActivePackingListId("");
    const data = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
    const list = chooseDefaultPackingList(normalizePackingListsResponse(data));
    if (list?.id) saveActivePackingListId(list.id);
  } catch {
    // Legacy sync still works without the new list catalog; photos will wait in IndexedDB.
  }
}

async function checkAuthAndLoad({ syncDirtyNotify = false } = {}) {
  if (isForcedOffline()) {
    if (isExplicitlySignedOut()) {
      await enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыт demo/public режим");
      return;
    }
    unlockOfflineState("Принудительно офлайн · локальная укладка доступна");
    return;
  }
  let authData = null;
  try {
    updateSyncUi("Проверяю вход...");
    authData = await apiFetch("/auth/me");
  } catch (error) {
    currentUser = null;
    if (isNetworkError(error)) {
      await enterSignedOutPublicMode("Вход не подтверждён · личные списки скрыты, открыт demo/public режим");
      return;
    }
    appUnlocked = true;
    await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
    updateSyncUi();
    return;
  }

  currentUser = authData.user || authData.me || authData.account || null;
  if (!currentUser && (authData.id || authData.email)) currentUser = { id: authData.id, email: authData.email };
  if (!currentUser) {
    appUnlocked = true;
    await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
    updateSyncUi();
    return;
  }

  setExplicitlySignedOut(false);
  appUnlocked = true;
  updateSyncUi("Вход выполнен · загружаю данные...");

  try {
    if (syncMeta.dirty && hasLocalSavedState()) {
      updateSyncUi("Есть локальные изменения · проверяю даты...");
      await loadRemoteState({ notifyDirtySave: syncDirtyNotify });
      await restoreSavedLayoutChoice({ privateOnly: true });
      return;
    }
    await loadRemoteState();
    await restoreSavedLayoutChoice({ privateOnly: true });
  } catch (error) {
    if (isNetworkError(error)) {
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Вход выполнен · офлайн, локальная укладка доступна");
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi(`Вход выполнен · не удалось загрузить данные: ${error.message}`);
  }
}

function handleWindowReturn() {
  if (!currentUser && !isForcedOffline()) {
    checkAuthAndLoad();
    return;
  }
  checkRemoteStateFreshness({ notify: true });
}

async function handleAuthButton() {
  if (isForcedOffline()) {
    showToast("Сначала выключите офлайн-режим в меню.", "error");
    return;
  }
  if (currentUser) {
    const confirmed = await askConfirmDialog({
      title: "Выйти из аккаунта?",
      text: "После выхода список будет скрыт на этом устройстве до нового входа. Локальная копия не удалится, но офлайн-доступ после явного выхода будет отключён.",
      okText: "Выйти",
      cancelText: "Остаться"
    });
    if (!confirmed) return;
    try {
      updateSyncUi("Выходим...");
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Even if the network fails, clear only the local UI state. The HttpOnly cookie remains server-owned.
    }
    currentUser = null;
    appUnlocked = true;
    setExplicitlySignedOut(true);
    await enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыта demo/public укладка");
    showToast("Вы вышли. Личные списки скрыты; войдите снова, чтобы открыть их.", "success");
    return;
  }

  openAuthDialog();
}

function getSavedAuthEmail() {
  try {
    return localStorage.getItem(AUTH_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function saveAuthEmail(email) {
  safeSetLocalStorage(AUTH_EMAIL_KEY, email);
}

function isExplicitlySignedOut() {
  try {
    return localStorage.getItem(AUTH_SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function setExplicitlySignedOut(value) {
  try {
    if (value) safeSetLocalStorage(AUTH_SIGNED_OUT_KEY, "1");
    else localStorage.removeItem(AUTH_SIGNED_OUT_KEY);
  } catch {
    // The server cookie remains the source of truth; this flag only controls local offline fallback.
  }
}

function isForcedOffline() {
  try {
    return localStorage.getItem(FORCE_OFFLINE_KEY) === "1";
  } catch {
    return false;
  }
}

function setForcedOffline(value) {
  try {
    if (value) safeSetLocalStorage(FORCE_OFFLINE_KEY, "1");
    else localStorage.removeItem(FORCE_OFFLINE_KEY);
  } catch {
    // Manual offline mode is only a local preference.
  }
}

async function toggleForcedOfflineMode() {
  const next = !isForcedOffline();
  setForcedOffline(next);
  if (next) {
    if (syncTimer) {
      window.clearTimeout(syncTimer);
      syncTimer = null;
    }
    currentUser = null;
    appUnlocked = true;
    updateSyncUi("Принудительно офлайн · локальная укладка доступна");
    showToast("Офлайн-режим включён. API не будет использоваться.", "success");
    return;
  }
  updateSyncUi("Офлайн-режим выключен · проверяю вход...");
  showToast("Офлайн-режим выключен. Можно синхронизироваться.", "success");
  await checkAuthAndLoad();
}

function openAuthDialog() {
  refs.authEmail.value = getSavedAuthEmail();
  refs.authDialogStatus.textContent = "";
  refs.authDialogStatus.className = "dialog-status";
  refs.authSubmitBtn.disabled = false;
  refs.authSubmitBtn.textContent = "Отправить ссылку";
  openModalDialog(refs.authDialog);
  window.setTimeout(() => {
    refs.authEmail.focus();
    refs.authEmail.select();
  }, 0);
}

async function submitAuthDialog(event) {
  event.preventDefault();
  if (isForcedOffline()) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = "Офлайн-режим включён. Выключите его в меню, чтобы войти.";
    updateSyncUi("Принудительно офлайн · вход отключён");
    return;
  }
  const email = refs.authEmail.value.trim();
  if (!email) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = "Введите email, на который отправить ссылку.";
    refs.authEmail.focus();
    return;
  }
  try {
    refs.authSubmitBtn.disabled = true;
    refs.authDialogStatus.className = "dialog-status";
    refs.authDialogStatus.textContent = "Отправляю ссылку...";
    updateSyncUi("Отправляю ссылку для входа...");
    await apiFetch("/auth/request-magic-link", {
      method: "POST",
      body: JSON.stringify({
        email,
        redirectUrl: location.origin === "https://vniipo-help.ru"
          ? "https://vniipo-help.ru/bike-packing/"
          : location.href
      })
    });
    saveAuthEmail(email);
    refs.authDialogStatus.className = "dialog-status success";
    refs.authDialogStatus.textContent = "Ссылка отправлена. Откройте письмо на этом устройстве, затем вернитесь сюда.";
    refs.authSubmitBtn.textContent = "Отправить ещё раз";
    updateSyncUi("Ссылка отправлена · откройте письмо и перейдите по magic link");
  } catch (error) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = `Не удалось отправить ссылку: ${error.message}`;
    updateSyncUi(`Не удалось отправить ссылку: ${error.message}`);
  } finally {
    refs.authSubmitBtn.disabled = false;
  }
}

function scheduleRemoteSave(delay = 900) {
  if (isForcedOffline() || !currentUser || applyingRemoteState) return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncNow(), delay);
}

async function syncNow({ force = false } = {}) {
  if (syncTimer) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (isForcedOffline()) {
    updateSyncUi("Принудительно офлайн · синхронизация отключена");
    if (force) showToast("Офлайн-режим включён. Чтобы синхронизироваться, выключите его в меню.", "error");
    return;
  }
  if (isReadOnlyStateScope()) {
    await refreshActiveReadOnlyPublicTemplate({ notify: force });
    return;
  }
  if (!currentUser && isAdminUser() && isReadOnlyStateScope()) {
    if (force) {
      showToast("Для публикации demo/shared нужно войти админом.", "error");
      handleAuthButton();
    }
    return;
  }
  if (!currentUser) {
    const hadLocalChanges = syncMeta.dirty;
    await checkAuthAndLoad({ syncDirtyNotify: force });
    if (!currentUser) {
      if (force) showToast(appUnlocked ? "Офлайн: войдите, когда появится интернет." : "Нужно войти для синхронизации.", "error");
      return;
    }
    if (force && hadLocalChanges && !syncMeta.dirty) return;
  }
  if (canOpenAdminPublishedEdit() && isReadOnlyStateScope()) {
    if (!currentUser) {
      if (force) {
        showToast("Для публикации demo/shared нужно войти админом.", "error");
        handleAuthButton();
      }
      return;
    }
    const readonlyId = activeReadOnlyLayoutId();
    if (readonlyId === DEMO_SHARED_LAYOUT_ID) {
      await openAdminDemoLayout();
      if (force) showToast("Открыт admin-edit demo. Изменения теперь будут публиковаться автоматически.", "success");
      return;
    }
    if (readonlyId) {
      await openSharedLayoutForAdmin(readonlyId);
      if (force) showToast("Открыт admin-edit shared. Изменения теперь будут публиковаться автоматически.", "success");
      return;
    }
  }
  if (publishedLayoutSaveTimer && isAdminEditablePublishedLayout(getPublishedEditLayoutId())) {
    await flushActivePublishedEditSave();
    if (force) showToast("Public-укладка опубликована.", "success");
    return;
  }
  if (publishedLayoutSaveTimer) {
    window.clearTimeout(publishedLayoutSaveTimer);
    publishedLayoutSaveTimer = null;
  }
  if (isReadOnlyBikePackingContext()) {
    syncMeta.dirty = false;
    saveSyncMeta();
    const message = currentPublicTemplateStatusMessage();
    updateSyncUi(message);
    if (force) showToast(message, isDemoPublicTemplateMissing(uiLanguage) ? "warning" : "error");
    return;
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  if (isAdminEditablePublishedLayout()) {
    try {
      await savePublishedLayoutRecord(state.activeLayoutId, { notify: force });
    } catch (error) {
      updateSyncUi(`Не удалось сохранить public-укладку: ${error.message}`);
      if (force) showToast(`Не удалось сохранить public-укладку: ${error.message}`, "error");
    }
    return;
  }
  if (!force && !syncMeta.dirty) {
    updateSyncUi();
    return;
  }
  if (force && !syncMeta.dirty) {
    const uploadedPhotos = await uploadPendingPhotos({ markDirty: false });
    if (uploadedPhotos) {
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      await saveRemoteState({ notify: true });
      return;
    }
    updateSyncUi();
    showToast("Уже синхронизировано.", "success");
    return;
  }
  if (force && syncMeta.dirty) {
    const preferredLayout = preferredCurrentLayoutRef();
    if (await offerLoadServerForTruncatedLocalState({ notify: true, preferredLayout })) return;
    updateSyncUi("Есть локальные изменения · проверяю даты...");
    await loadRemoteState({ notifyDirtySave: true, preferredLayout });
    return;
  }
  await saveRemoteState({ notify: force, preferredLayout: force ? preferredCurrentLayoutRef() : null });
}

async function refreshActiveReadOnlyPublicTemplate({ notify = false } = {}) {
  const readonlyId = activeReadOnlyLayoutId();
  if (!readonlyId) return;
  try {
    updateSyncUi(readonlyId === DEMO_SHARED_LAYOUT_ID
      ? "Обновляю demo с сервера..."
      : "Обновляю shared с сервера...");
    if (readonlyId === DEMO_SHARED_LAYOUT_ID) {
      const demoState = await defaultDemoState(uiLanguage);
      setDemoStatePayloadForLanguage(uiLanguage, demoState);
      render();
      syncMeta.dirty = false;
      saveSyncMeta();
      const message = currentPublicTemplateStatusMessage();
      updateSyncUi(message);
      if (notify) {
        const missing = isDemoPublicTemplateMissing(uiLanguage);
        const refreshedMessage = uiLanguage === "en" ? "Demo refreshed from server." : "Демо обновлено с сервера.";
        showToast(missing ? message : refreshedMessage, missing ? "warning" : "success");
      }
      return;
    }
    const loaded = await loadSharedLayoutPayload(readonlyId).catch(() => false);
    render();
    syncMeta.dirty = false;
    saveSyncMeta();
    const layout = findSharedLayout(readonlyId);
    const message = loaded
      ? `Shared укладка обновлена с сервера${layout?.name ? ` · ${layout.name}` : ""}`
      : `Shared укладка открыта из локальной заготовки${layout?.name ? ` · ${layout.name}` : ""}`;
    updateSyncUi(message);
    if (notify) showToast(message, loaded ? "success" : "warning");
  } catch (error) {
    const message = `Не удалось обновить public-укладку: ${error.message}`;
    updateSyncUi(message);
    if (notify) showToast(message, "error");
  }
}

function buildRemoteSaveBody({ forceOverwrite = false } = {}) {
  const sourceUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  const payload = serializeState({ forSync: true });
  return {
    scopeKey: DATA_SCOPE_KEY,
    itemKey: DATA_ITEM_KEY,
    baseServerUpdatedAt: forceOverwrite ? null : (syncMeta.serverUpdatedAt || null),
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    clientUpdatedAt: sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    sourceUpdatedAt,
    sourceDeviceId: syncDevice.id,
    sourceDeviceName: syncDevice.name,
    force: forceOverwrite,
    forceOverwrite,
    fullReplace: forceOverwrite,
    payload
  };
}

function buildListSaveBody({ forceOverwrite = false } = {}) {
  const sourceUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  const payload = serializeState({ forSync: true });
  return {
    baseServerUpdatedAt: forceOverwrite ? null : (syncMeta.serverUpdatedAt || null),
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    clientUpdatedAt: sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    force: forceOverwrite,
    forceOverwrite,
    fullReplace: forceOverwrite,
    payload
  };
}

function normalizeRemoteListRecord(data) {
  const list = data?.list || data?.record || data;
  const integrityMeta = stateIntegrityMetaFromResponse(data, list);
  const payload =
    list?.payload ||
    list?.state ||
    list?.assembledState ||
    list?.assembled_state ||
    data?.payload ||
    data?.state ||
    data?.assembledState ||
    data?.assembled_state ||
    data?.serverPayload ||
    null;
  return {
    ...(list || {}),
    ...integrityMeta,
    payload,
    updatedAt: remoteUpdatedAt(list) || integrityMeta.updatedAt || data?.updatedAt || data?.serverUpdatedAt || null
  };
}

async function fetchRemoteStateRecord() {
  const listRecord = await fetchRemoteListStateRecord().catch((error) => {
    if (!shouldFallbackToLegacyPersonalSync(error)) throw error;
    return null;
  });
  if (listRecord?.payload) return { record: listRecord, source: "list" };

  const params = new URLSearchParams({ scopeKey: DATA_SCOPE_KEY, itemKey: DATA_ITEM_KEY });
  try {
    const data = await apiFetch(`/bike-packing-data.json?${params.toString()}`, { timeoutMs: LIST_API_TIMEOUT_MS });
    const legacyRecord = normalizeRemoteListRecord({
      ...(data.record || data.list || data),
      source: data.record?.source || data.list?.source || data.source || "",
      payload: data.record?.payload || data.list?.payload || data.payload || null
    });
    currentPackingListMeta = legacyRecord;
    return { ...data, record: legacyRecord, source: "legacy" };
  } catch (error) {
    if (listRecord && isTemporaryServerStorageError(error)) return { record: listRecord, source: "list" };
    throw error;
  }
}

async function fetchRemoteListDetailRecord(listId) {
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
    timeoutMs: LIST_API_TIMEOUT_MS
  });
  const record = normalizeRemoteListRecord(data);
  if (remoteRecordId(record) === String(listId || "")) currentPackingListMeta = record;
  return record;
}

function sharedListIdFromLocation() {
  try {
    const url = new URL(location.href);
    return String(url.searchParams.get(SHARED_LIST_QUERY_PARAM) || url.searchParams.get("shared") || "").trim();
  } catch {
    return "";
  }
}

function buildSharedListUrl(listId) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(SHARED_LIST_QUERY_PARAM, listId);
  return url.toString();
}

function listRecordVisibility(record) {
  return String(record?.visibility || record?.listVisibility || record?.list_visibility || "").trim().toLowerCase();
}

async function fetchSharedListLinkRecord(listId) {
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
    timeoutMs: LIST_API_TIMEOUT_MS
  });
  const record = normalizeRemoteListRecord(data);
  const visibility = listRecordVisibility(record);
  if (visibility !== "shared" && visibility !== "public") {
    const error = new Error("Этот список не открыт по ссылке.");
    error.status = 403;
    throw error;
  }
  return record;
}

async function openSharedListFromLink(listId) {
  const normalizedListId = String(listId || "").trim();
  if (!normalizedListId) return false;
  appUnlocked = true;
  updateSyncUi("Открываю shared-список по ссылке...");
  try {
    const record = await fetchSharedListLinkRecord(normalizedListId);
    const payload = normalizePublishedStatePayload(record.payload);
    assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record.payload);
    if (!payload) throw new Error("Сервер вернул пустую или повреждённую укладку.");
    linkedSharedListLayout = {
      id: `list-${remoteRecordId(record, normalizedListId)}`,
      listId: remoteRecordId(record, normalizedListId),
      name: record.title || "Shared список",
      subtitle: "Доступ по ссылке",
      roots: [],
      statePayload: payload,
      listRecord: record,
      linkedSharedList: true
    };
    setActiveReadOnlyScope(linkedSharedListLayout.id);
    switchView("packing");
    render();
    updateSyncUi(`Shared список · ${linkedSharedListLayout.name}`);
    return true;
  } catch (error) {
    setActivePrivateScope();
    render();
    updateSyncUi(`Не удалось открыть shared-список: ${error.message}`);
    return false;
  }
}

async function shareCurrentPackingListByLink() {
  if (!currentUser) {
    showToast("Войдите, чтобы создать ссылку на список.", "error");
    handleAuthButton();
    return;
  }
  if (isPublicLayoutContext()) {
    showToast("Для demo/shared просмотра сначала создайте личную копию.", "error");
    return;
  }
  try {
    updateSyncUi("Готовлю список к публикации по ссылке...");
    await flushActivePublishedEditSave();
    const uploadedPhotos = await uploadPendingPhotos({ markDirty: true });
    if (uploadedPhotos) {
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
    }
    if (syncMeta.dirty) await saveRemoteState({ notify: false });
    const listId = await ensureCurrentPackingListId();
    if (!currentPackingListMeta && listId) await fetchRemoteListDetailRecord(listId).catch(() => null);
    const body = buildListSaveBody({ forceOverwrite: true });
    body.visibility = "shared";
    body.title = currentPackingListMeta?.title || state.layouts?.[state.activeLayoutId]?.name || "Велоукладка";
    body.description = currentPackingListMeta?.description || "";
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
      method: "PUT",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify(body)
    });
    rememberCurrentPackingListRecord(data);
    const link = buildSharedListUrl(listId);
    await copySharedListLink(link);
    updateSyncUi("Список открыт по ссылке · ссылка скопирована");
    showToast("Ссылка на список скопирована.", "success");
  } catch (error) {
    updateSyncUi(`Не удалось создать shared-ссылку: ${error.message}`);
    showToast(`Не удалось создать ссылку: ${error.message}`, "error");
  }
}

async function copySharedListLink(link) {
  try {
    await navigator.clipboard?.writeText(link);
  } catch {
    window.prompt("Ссылка на shared-список:", link);
  }
}

async function fetchRemoteListStateSnapshot(listId) {
  try {
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/state`, {
      timeoutMs: LIST_API_TIMEOUT_MS
    });
    return normalizeRemoteListRecord(data);
  } catch (stateError) {
    try {
      return await fetchRemoteListDetailRecord(listId);
    } catch {
      throw stateError;
    }
  }
}

async function saveRemoteStateRecord({ forceOverwrite = false } = {}) {
  if (isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  const listData = await saveRemoteListStateRecord({ forceOverwrite }).catch((error) => {
    if (!shouldFallbackToLegacyPersonalSync(error)) throw error;
    return null;
  });
  if (listData) return { ...listData, source: "list" };

  const requestBody = buildRemoteSaveBody({ forceOverwrite });
  const body = JSON.stringify(requestBody);
  const report = syncPayloadSizeReport(requestBody.payload, body);
  return apiFetch("/bike-packing-data.json", {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body
  }).catch((error) => {
    throw annotatePayloadError(error, report);
  });
}

function shouldFallbackToLegacyPersonalSync(error) {
  if (error?.path?.includes("/bike-packing/lists")) personalListApiUnavailable = true;
  return error?.status !== 409;
}

async function fetchRemoteListStateRecord() {
  if (personalListApiUnavailable) return null;
  if (isPublicTemplateListId(currentPackingListId)) saveActivePackingListId("");
  if (currentPackingListId) {
    try {
      const record = await fetchRemoteListStateSnapshot(currentPackingListId);
      if (record?.payload) return record;
    } catch (error) {
      if (error.status === 404) saveActivePackingListId("");
      else throw error;
    }
  }

  const data = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
  const list = chooseDefaultPackingList(normalizePackingListsResponse(data));
  if (!list) return null;
  const catalogRecord = rememberCurrentPackingListRecord(list);
  if (catalogRecord?.payload) return catalogRecord;
  if (!list.id) return catalogRecord;
  return await fetchRemoteListStateSnapshot(list.id);
}

async function saveRemoteListStateRecord({ forceOverwrite = false } = {}) {
  if (isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  if (personalListApiUnavailable) throw createSkippedPersonalListApiError();
  const listId = await ensureCurrentPackingListId();
  if (!currentPackingListMeta && listId) {
    await fetchRemoteListDetailRecord(listId).catch(() => null);
  }
  if (isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  const requestBody = buildListSaveBody({ forceOverwrite });
  const body = JSON.stringify(requestBody);
  const report = syncPayloadSizeReport(requestBody.payload, body);
  try {
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
      method: "PUT",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body
    });
    const record = rememberCurrentPackingListRecord(data);
    return data;
  } catch (error) {
    if (error.status === 404) {
      saveActivePackingListId("");
      const refreshedListId = await ensureCurrentPackingListId();
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(refreshedListId)}`, {
        method: "PUT",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body
      }).catch((putError) => {
        throw annotatePayloadError(putError, report);
      });
      const record = rememberCurrentPackingListRecord(data);
      return data;
    }
    if (error.status !== 405) throw annotatePayloadError(error, report);
  }
  const data = await apiFetch("/bike-packing/lists", {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body
  }).catch((error) => {
    throw annotatePayloadError(error, report);
  });
  const record = rememberCurrentPackingListRecord(data);
  return data;
}

function createSkippedPersonalListApiError() {
  const error = new Error("personal list API skipped after server error");
  error.status = 503;
  error.path = "/bike-packing/lists";
  return error;
}

async function fetchStateRecordByItemKey(itemKey) {
  const record = await fetchStateRecordMetaByItemKey(itemKey);
  return normalizePublishedStatePayload(record?.payload || null);
}

async function fetchStateRecordMetaByItemKey(itemKey) {
  const params = new URLSearchParams({ scopeKey: DATA_SCOPE_KEY, itemKey });
  const data = await apiFetch(`/bike-packing-data.json?${params.toString()}`, { timeoutMs: LIST_API_TIMEOUT_MS });
  const record = data.record || data.list || data;
  return normalizeRemoteListRecord({ ...record, payload: record?.payload || data.payload || null });
}

async function saveStateRecordByItemKey(itemKey, payload) {
  if (isReadOnlyItemKey(itemKey) || isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  const sourceUpdatedAt = nowIso();
  const syncPayload = cloneStateForSync(payload, { forSync: true });
  const requestBody = {
    scopeKey: DATA_SCOPE_KEY,
    itemKey,
    clientUpdatedAt: sourceUpdatedAt,
    sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    sourceDeviceId: syncDevice.id,
    sourceDeviceName: syncDevice.name,
    force: true,
    forceOverwrite: true,
    payload: syncPayload
  };
  const body = JSON.stringify(requestBody);
  const report = syncPayloadSizeReport(syncPayload, body);
  return apiFetch("/bike-packing-data.json", {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body
  }).catch((error) => {
    throw annotatePayloadError(error, report);
  });
}

function remoteRecordId(record, fallbackId = "") {
  return String(
    record?.id ||
    record?._id ||
    record?.listId ||
    record?.list_id ||
    record?.recordId ||
    record?.record_id ||
    fallbackId ||
    ""
  );
}

async function ensureStateRecordListId(itemKey, seedPayload) {
  if (isReadOnlyItemKey(itemKey) || isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  try {
    const record = await fetchStateRecordMetaByItemKey(itemKey);
    const id = remoteRecordId(record);
    if (id) return id;
  } catch {
    // The save below can create the public record if it does not exist yet.
  }
  const data = await saveStateRecordByItemKey(itemKey, seedPayload || createEmptyUserState());
  const record = normalizeRemoteListRecord(data);
  const id = remoteRecordId(record);
  if (!id && typeof console !== "undefined" && console.warn) {
    console.warn("[bike-packing] Public record has no list id; photos will keep their existing URLs.", { itemKey });
  }
  return id;
}

async function fetchPublishedListStateById(listId) {
  const record = await fetchRemoteListStateSnapshot(listId);
  const payload = normalizePublishedStatePayload(record?.payload || null);
  assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record?.payload || null);
  return payload;
}

async function loadPublishedDemoState(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  try {
    const demoState = await fetchPublishedListStateById(demoPublicListIdForLanguage(normalized));
    if (isSafePublishedDemoState(demoState)) {
      setDemoPublicTemplateMissing(normalized, false);
      return demoState;
    }
  } catch {
    try {
      const demoState = await fetchStateRecordByItemKey(demoItemKeyForLanguage(normalized));
      if (isSafePublishedDemoState(demoState)) {
        setDemoPublicTemplateMissing(normalized, false);
        return demoState;
      }
    } catch {
      // Missing localized demo is a normal isolated state until admin publishes it.
    }
  }
  setDemoPublicTemplateMissing(normalized, true);
  return null;
}

function isSafePublishedDemoState(demoState) {
  if (!isPackingStateShape(demoState)) return false;
  const stats = stateStats(demoState);
  if (stats.items > 80 || stats.containers > 60 || stats.layouts > 3 || stats.rootContainers > 10) return false;
  const activeLayout = demoState.layouts?.[demoState.activeLayoutId] || Object.values(demoState.layouts || {})[0];
  if (activeLayout && (activeLayout.rootContainerIds || []).length > 10) return false;
  return !hasGeneratedPublicArtifacts(demoState);
}

function hasGeneratedPublicArtifacts(targetState) {
  return Object.entries(targetState?.items || {}).some(([itemId, item]) =>
    isGeneratedCatalogSyncArtifact(itemId, item) ||
    isGeneratedCatalogStateArtifact(itemId, item, targetState)
  ) || Object.entries(targetState?.containers || {}).some(([containerId, container]) =>
    isGeneratedCatalogContainerSyncArtifact(containerId, container) ||
    isGeneratedCatalogContainerStateArtifact(containerId, container, targetState)
  ) || Object.values(targetState?.layouts || {}).some((layout) =>
    layout?.adminDemo ||
    layout?.adminSharedSourceId ||
    String(layout?.id || "").startsWith("layout-admin-")
  );
}

async function defaultDemoState(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  const published = await loadPublishedDemoState(normalized);
  if (published) {
    setDemoStatePayloadForLanguage(normalized, published);
    return published;
  }
  const fallback = normalized === DEFAULT_LANGUAGE
    ? createDemoSeedState()
    : createEmptyPublicTemplateState(normalized);
  setDemoStatePayloadForLanguage(normalized, fallback);
  return fallback;
}

async function loadGuestPublishedDemoOnStartup({ forcePublicScope = false, remember = false } = {}) {
  const demoState = await defaultDemoState();
  setDemoStatePayloadForLanguage(uiLanguage, demoState);
  if (forcePublicScope) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
    initialRemoteLoadPending = false;
    renderPreservingPackingScroll();
    return true;
  }
  if (forcePublicScope || !syncMeta.dirty || !hadLocalStateAtStartup || isSuspiciousEmptyPackingState(state)) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  }
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  return true;
}

async function enterSignedOutPublicMode(message = "") {
  currentUser = null;
  appUnlocked = true;
  saveActivePackingListId("");
  currentPackingListMeta = null;
  await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
  switchView("packing");
  render();
  updateSyncUi(message || currentPublicTemplateStatusMessage());
}

function localPersonalStateForDemoFallback() {
  return null;
}

async function saveRemoteState({ notify = false, forceOverwrite = false, preferredLayout = null } = {}) {
  if (!currentUser) return;
  if (forceOverwrite) {
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
  }
  if (!forceOverwrite && clearStaleDirtyFlagIfNoLocalChanges()) return;
  if (isReadOnlyBikePackingContext()) {
    syncMeta.dirty = false;
    saveSyncMeta();
    const message = currentPublicTemplateStatusMessage();
    updateSyncUi(message);
    if (notify) showToast(message, isDemoPublicTemplateMissing(uiLanguage) ? "warning" : "error");
    return;
  }
  repairCollapsedActiveLayoutBeforeSave();
  try {
    await uploadPendingPhotos();
    if (isSuspiciousEmptyPackingState()) {
      syncMeta.dirty = false;
      saveSyncMeta();
      updateSyncUi("Пустая локальная укладка не отправлена на сервер · загрузите восстановленную версию");
      if (notify) showToast("Пустая локальная укладка не отправлена на сервер.", "error");
      return;
    }
    if (!forceOverwrite && blockDestructiveLocalSave()) {
      if (notify) showToast("Локальная версия похожа на усечённую. Я не отправил её на сервер.", "error");
      return;
    }
    updateSyncUi("Сохраняю на сервер...");
    const baseBeforeSave = loadBaseState();
    const entitySync = await syncChangedBikePackingEntities({ baseState: baseBeforeSave, forceOverwrite });
    const hasLegacyChanges = hasLegacyPayloadChanges(baseBeforeSave, state, entitySync);
    if (!forceOverwrite && entitySync.attempted && !hasLegacyChanges) {
      syncMeta.dirty = false;
      syncMeta.serverUpdatedAt = entitySync.serverUpdatedAt || syncMeta.serverUpdatedAt;
      syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || entitySync.serverUpdatedAt || new Date().toISOString();
      syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
      rememberRemoteIntegrityMeta(entitySync.integrityMeta);
      saveBaseState(serializeState({ forSync: true }));
      saveSyncMeta();
      updateSyncUi();
      if (notify) showToast("Синхронизация завершена.", "success");
      return;
    }
    const data = await saveRemoteStateRecord({ forceOverwrite });
    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = remoteUpdatedAt(data.record || data.list || data) || new Date().toISOString();
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(data.record || data.list || data, data);
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    updateSyncUi();
    if (notify) showToast("Синхронизация завершена.", "success");
  } catch (error) {
    if (isReadOnlyBikePackingError(error)) {
      syncMeta.dirty = false;
      saveSyncMeta();
      const message = currentPublicTemplateStatusMessage();
      updateSyncUi(message);
      if (notify) showToast(message, isDemoPublicTemplateMissing(uiLanguage) ? "warning" : "error");
      return;
    }
    syncMeta.dirty = true;
    saveSyncMeta();
    if (error.status === 409) {
      if (forceOverwrite) {
        updateSyncUi("Сервер всё ещё отклоняет принудительное сохранение · локальная версия оставлена");
        if (notify) showToast("Сервер не принял принудительное сохранение. Локальная версия не потеряна.", "error");
        return;
      }
      await handleRemoteSaveConflict(error, { notify, preferredLayout });
      return;
    }
    if (isTemporaryServerStorageError(error)) {
      updateSyncUi("Серверная синхронизация временно недоступна · изменения сохранены на устройстве");
      if (notify) showToast("Серверная синхронизация временно недоступна. Изменения остались на устройстве.", "error");
      return;
    }
    if (isTimeoutError(error)) {
      updateSyncUi("Сервер долго отвечает · изменения сохранены на устройстве");
      if (notify) showToast("Сервер долго отвечает. Изменения остались на устройстве.", "error");
      return;
    }
    if (isNetworkError(error)) {
      updateSyncUi("Офлайн · изменения сохранены на устройстве");
      if (notify) showToast("Нет соединения. Изменения остались на устройстве.", "error");
      return;
    }
    updateSyncUi(`Не удалось синхронизировать: ${error.message}`);
    if (notify) showToast(`Не удалось синхронизировать: ${error.message}`, "error");
  }
}

async function handleRemoteSaveConflict(error, { notify = false, preferredLayout = null } = {}) {
  const record = error.data?.record || error.data?.currentRecord || null;
  const remoteState = normalizeRemoteState(record?.payload || error.data?.payload || error.data?.serverPayload);
  const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, error.data);
  const updatedAt = remoteUpdatedAt(record) || error.data?.serverUpdatedAt || null;
  appUnlocked = true;
  updateSyncUi("Сервер изменился · нужно выбрать версию...");
  const remoteRawPayload = record?.payload || error.data?.payload || error.data?.serverPayload || null;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
  if (!remoteState) {
    if (notify) showToast("Сервер сообщил о конфликте. Локальные изменения не отправлены.", "error");
    return;
  }
  const baseState = loadBaseState();
  const mergeResult = baseState ? mergeStateFromBase(baseState, state, remoteState) : null;
  if (mergeResult?.merged && mergeResult.conflicts.length) {
    if (isOwnLayoutEchoConflict(mergeResult.conflicts)) {
      updateSyncUi("Р Р°СЃРєР»Р°РґРєР° РёР·РјРµРЅРµРЅР° РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ В· РѕС‚РїСЂР°РІР»СЏСЋ Р±РµР· РѕРєРЅР° РєРѕРЅС„Р»РёРєС‚Р°...");
      await saveRemoteState({ notify, forceOverwrite: true });
      return;
    }
    const resolution = await askConflictResolution(mergeResult.conflicts);
    if (resolution === "server") {
      if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) showToast("Загружена серверная версия.", "success");
      return;
    }
    if (resolution === "cancel") {
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
      saveSyncMeta();
      updateSyncUi("Конфликты не применены · локальные изменения сохранены на устройстве");
      return;
    }
    applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
    replaceState(mergeResult.merged);
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    syncMeta.serverUpdatedAt = updatedAt || syncMeta.serverUpdatedAt;
    saveSyncMeta();
    renderPreservingPackingScroll();
    updateSyncUi("Конфликты объединены · отправляю на сервер...");
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  if (mergeResult?.merged && !mergeResult.conflicts.length) {
    replaceState(mergeResult.merged);
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    syncMeta.serverUpdatedAt = updatedAt || syncMeta.serverUpdatedAt;
    saveSyncMeta();
    renderPreservingPackingScroll();
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  const useLocal = await askConfirmDialog({
    title: "Список меняли на другом устройстве",
    text: "Серверная версия изменилась после последней загрузки. Оставить локальные изменения и отправить их поверх серверной версии?",
    okText: "Оставить локальную",
    cancelText: "Загрузить серверную"
  });
  if (useLocal) {
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) showToast("Загружена серверная версия.", "success");
}

async function loadRemoteState({ notifyDirtySave = false, preferredLayout = null } = {}) {
  if (!currentUser) return;
  if (isPublicLayoutContext()) {
    appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi();
    return;
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  try {
    let data = await fetchRemoteStateRecord();
    let record = data.record;
    let remoteState = normalizeRemoteState(record?.payload);
    if (!remoteState && data.source === "list") {
      saveActivePackingListId("");
      data = await fetchRemoteStateRecord();
      record = data.record;
      remoteState = normalizeRemoteState(record?.payload);
    }
    const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
    const remoteRawPayload = record?.payload || data?.payload || data?.state || null;
    if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
    const serverTimeText = remoteUpdatedAt(record);
    const serverTime = timeValue(serverTimeText);
    const localTime = timeValue(syncMeta.localUpdatedAt);
    const isInitialRemotePull = initialRemoteLoadPending;
    const hasFreshLocalDirtyState = syncMeta.dirty && hasLocalSavedState() && Boolean(localTime) && (!serverTime || localTime > serverTime);
    const shouldPreferLocalDirtyState = syncMeta.dirty && hasLocalSavedState() && (
      hasFreshLocalDirtyState ||
      (!isInitialRemotePull && !syncMeta.serverUpdatedAt)
    );
    if (!remoteState) {
      if (hasLocalSavedState()) {
        if (isSuspiciousEmptyPackingState()) {
          appUnlocked = true;
          syncMeta.dirty = false;
          saveSyncMeta();
          renderInitialLocalFallbackIfNeeded();
          updateSyncUi("На сервере пусто · локальная пустая укладка не отправлена");
          return;
        }
        appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("На сервере пока пусто · сохраняю локальные изменения...");
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      replaceState(createEmptyUserState());
      syncMeta.dirty = true;
      saveSyncMeta();
      initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      appUnlocked = true;
      updateSyncUi("На сервере пока пусто · отправляю локальные данные...");
      await saveRemoteState();
      return;
    }

    const localJson = JSON.stringify(serializeState({ forSync: true }));
    const remoteJson = JSON.stringify(cloneStateForSync(remoteState, { forSync: true }));
    if (localJson !== remoteJson) {
      if (isSuspiciousEmptyPackingState() && isMeaningfulPackingState(remoteState)) {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
        if (notifyDirtySave) showToast("Загружена восстановленная версия с сервера.", "success");
        return;
      }
      if (!syncMeta.dirty) {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (isInitialRemotePull && !hasFreshLocalDirtyState) {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (shouldPreferLocalDirtyState || (!isInitialRemotePull && !serverChangedSinceLastSync(serverTime) && localTime >= serverTime)) {
        appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Локальные изменения новее · отправляю на сервер...");
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      const mergeResult = mergeStateFromBase(loadBaseState(), serializeState(), remoteState);
      if (mergeResult.merged && !mergeResult.conflicts.length) {
        replaceState(mergeResult.merged);
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = nowIso();
        saveSyncMeta();
        appUnlocked = true;
        initialRemoteLoadPending = false;
        renderPreservingPackingScroll();
        updateSyncUi("Изменения объединены · отправляю на сервер...");
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      if (!mergeResult.merged) {
        appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Найдены разные версии укладки...");
        const useServer = await askConfirmDialog({
          title: "Есть конфликты изменений",
          text: `Некоторые элементы менялись и здесь, и на другом устройстве:\n\n${formatMergeConflicts(mergeResult.conflicts)}\n\nЗагрузить серверную версию? Если оставить локальную, она будет отправлена на сервер.`,
          okText: "Загрузить серверную",
          cancelText: "Оставить локальную"
        });
        if (useServer) {
          applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
          return;
        }
        syncMeta.dirty = true;
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Есть конфликты изменений...");
      const resolution = await askConflictResolution(mergeResult.conflicts);
      if (resolution === "server") {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (resolution === "cancel") {
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Конфликты не применены · локальные изменения сохранены на устройстве");
        return;
      }
      applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
      replaceState(mergeResult.merged);
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      updateSyncUi("Конфликты объединены · отправляю на сервер...");
      await saveRemoteState({ notify: notifyDirtySave });
      return;
    }

    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = serverTimeText || null;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(remoteIntegrityMeta);
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    appUnlocked = true;
    if (initialRemoteLoadPending) {
      initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
    }
    updateSyncUi();
  } catch (error) {
    if (isTemporaryServerStorageError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Серверная синхронизация временно недоступна · локальная укладка доступна");
      return;
    }
    if (isTimeoutError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Сервер долго отвечает · локальная укладка доступна");
      return;
    }
    if (isNetworkError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Офлайн · локальная укладка доступна");
      return;
    }
    appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi(`Сервер недоступен: ${error.message}`);
  }
}

function startRemoteStateWatcher() {
  if (remoteRefreshTimer) window.clearInterval(remoteRefreshTimer);
  remoteRefreshTimer = window.setInterval(() => checkRemoteStateFreshness(), REMOTE_REFRESH_INTERVAL_MS);
}

async function checkRemoteStateFreshness({ notify = false } = {}) {
  if (isForcedOffline()) return;
  if (isPublicLayoutContext()) return;
  if (!currentUser || syncMeta.dirty || remoteRefreshInFlight) return;
  if (document.hidden) return;
  if ("onLine" in navigator && !navigator.onLine) return;
  const previousServerUpdatedAt = syncMeta.serverUpdatedAt;
  try {
    remoteRefreshInFlight = true;
    await loadRemoteState();
    const serverChanged = previousServerUpdatedAt &&
      syncMeta.serverUpdatedAt &&
      previousServerUpdatedAt !== syncMeta.serverUpdatedAt;
    if (notify && serverChanged && !syncMeta.dirty) {
      showToast("Подтянуты свежие изменения с сервера.", "success");
    }
  } finally {
    remoteRefreshInFlight = false;
  }
}

async function openAdminDemoLayout({ remember = true } = {}) {
  if (!canOpenAdminPublishedEdit()) {
    showToast("Демо может редактировать только админ.", "error");
    return;
  }
  removePublicLayoutDrafts();
  const existing = Object.values(state.layouts || {}).find((layout) => layout.adminDemo);
  if (false && existing) {
    repairAdminDemoLayout(existing);
    if (!isLayoutMeaningful(existing.id)) {
      removeLayoutTree(existing.id);
      const demoState = await defaultDemoState();
      importDemoStateAsEditableLayout(demoState);
      if (remember) rememberActiveLayoutChoice(DEMO_LAYOUT_SELECT_VALUE);
      updateSyncUi();
      showToast("Пустая локальная демо-укладка пересобрана.", "success");
      return;
    }
    setActivePrivateScope();
    switchActiveLayout(existing.id, { remember: false });
    if (remember) rememberActiveLayoutChoice(DEMO_LAYOUT_SELECT_VALUE);
    switchView("packing");
    showToast("Открыта локальная демо-укладка для правки.", "success");
    return;
  }
  try {
    updateSyncUi("Загружаю демо-укладку для правки...");
    const demoState = await defaultDemoState();
    importDemoStateAsEditableLayout(demoState);
    if (remember) rememberActiveLayoutChoice(DEMO_LAYOUT_SELECT_VALUE);
    updateSyncUi();
    showToast("Демо-укладка добавлена как обычная укладка. Правьте её и опубликуйте из меню.", "success");
  } catch (error) {
    updateSyncUi();
    showToast(`Не удалось открыть демо: ${error.message}`, "error");
  }
}

function removeAdminDemoLayouts() {
  Object.values(state.layouts || {})
    .filter((layout) => layout?.adminDemo)
    .forEach((layout) => removeLayoutTree(layout.id));
}

function removePublicLayoutDrafts({ exceptLayoutId = "" } = {}) {
  const drafts = Object.values(state.layouts || {})
    .filter((layout) => (layout?.adminDemo || layout?.adminSharedSourceId) && layout.id !== exceptLayoutId);
  drafts.forEach((layout) => removeLayoutTree(layout.id));
  if (modeState.adminPublishedEditLayoutId && !state.layouts?.[modeState.adminPublishedEditLayoutId]) {
    modeState.adminPublishedEditLayoutId = "";
  }
  return drafts.length > 0;
}

async function refreshActiveAdminDemoOnStartup() {
  return clearActiveAdminDemoStateOnStartup();
  if (!state.layouts?.[state.activeLayoutId]?.adminDemo) return false;
  updateSyncUi("Обновляю демо-укладку...");
  removeAdminDemoLayouts();
  const demoState = await defaultDemoState();
  importDemoStateAsEditableLayout(demoState);
  updateSyncUi();
  return true;
}

function clearActiveAdminDemoStateOnStartup() {
  const activePublicDraft = state.layouts?.[state.activeLayoutId] || null;
  const readonlyLayoutId = activePublicDraft?.adminSharedSourceId || (activePublicDraft?.adminDemo ? DEMO_SHARED_LAYOUT_ID : "");
  const removed = removePublicLayoutDrafts();
  if (readonlyLayoutId) setActiveReadOnlyScope(readonlyLayoutId);
  return removed;
}

async function openDemoLayoutFromSelect({ remember = true } = {}) {
  if (canOpenAdminPublishedEdit()) {
    await openAdminDemoLayout({ remember });
    return;
  }
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  if (remember) rememberActiveLayoutChoice(DEMO_LAYOUT_SELECT_VALUE);
  switchView("packing");
  render();
  try {
    setDemoStatePayloadForLanguage(uiLanguage, await defaultDemoState(uiLanguage));
    render();
    updateSyncUi("Демо-укладка · просмотр");
  } catch (error) {
    setActivePrivateScope();
    render();
    updateSyncUi();
    showToast(`Не удалось открыть демо: ${error.message}`, "error");
  }
}

async function confirmPublicLayoutTransition(kind, layout = null) {
  const admin = canOpenAdminPublishedEdit();
  if (kind === "demo") {
    return askConfirmDialog({
      title: admin ? "Открыть демо-укладку для правки?" : "Открыть демо-укладку?",
      text: admin
        ? "Это публичная демо-укладка. Изменения будут сохраняться отдельно от вашей личной укладки и после синхронизации станут видны другим пользователям."
        : "Это демонстрационная укладка. Ее нельзя редактировать напрямую, но можно копировать вещи и сумки в свои укладки.",
      okText: admin ? "Открыть демо" : "Смотреть демо",
      cancelText: "Остаться здесь",
      tone: "warning"
    });
  }
  return askConfirmDialog({
    title: admin ? "Открыть shared-укладку для правки?" : "Открыть shared-укладку?",
    text: admin
      ? `Это публичная shared-укладка${layout?.name ? ` «${layout.name}»` : ""}. Изменения будут сохраняться отдельно от вашей личной укладки и после синхронизации станут видны другим пользователям.`
      : `Вы открываете чужую shared-укладку${layout?.name ? ` «${layout.name}»` : ""}. Редактирование заблокировано, доступно только копирование в свои укладки.`,
    okText: admin ? "Открыть для правки" : "Смотреть shared",
    cancelText: "Остаться здесь",
    tone: "warning"
  });
}

function isLayoutMeaningful(layoutId, targetState = state) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return false;
  const visitedContainers = new Set();
  const visit = (containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container || visitedContainers.has(containerId)) return 0;
    visitedContainers.add(containerId);
    return (container.itemIds || []).filter((itemId) => targetState.items?.[itemId]).length +
      (container.childIds || []).reduce((sum, childId) => sum + visit(childId), 0);
  };
  return (layout.rootContainerIds || []).reduce((sum, containerId) => sum + visit(containerId), 0) > 0;
}

function removeLayoutTree(layoutId, targetState = state) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return;
  const containersToDelete = new Set();
  const itemsToDelete = new Set();
  const collect = (containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container || containersToDelete.has(containerId)) return;
    containersToDelete.add(containerId);
    (container.itemIds || []).forEach((itemId) => itemsToDelete.add(itemId));
    (container.childIds || []).forEach(collect);
  };
  (layout.rootContainerIds || []).forEach(collect);
  delete targetState.layouts[layoutId];
  containersToDelete.forEach((containerId) => delete targetState.containers[containerId]);
  itemsToDelete.forEach((itemId) => delete targetState.items[itemId]);
  Object.keys(targetState.collapsedContainers || {}).forEach((containerId) => {
    if (containersToDelete.has(containerId)) delete targetState.collapsedContainers[containerId];
  });
  if (targetState.activeLayoutId === layoutId) {
    targetState.activeLayoutId = Object.values(targetState.layouts || {})[0]?.id || "";
  }
  saveState({ sync: false });
}

function repairActiveEmptyAdminDemoDraft() {
  const layout = state.layouts?.[state.activeLayoutId];
  if (!layout?.adminDemo || isLayoutMeaningful(layout.id)) return false;
  removeLayoutTree(layout.id);
  importDemoStateAsEditableLayout(createBlankBikePackingState());
  return true;
}

function importDemoStateAsEditableLayout(demoState) {
  const source = normalizePublishedStatePayload(demoState) || createBlankBikePackingState();
  const sourceLayout = source.layouts?.[source.activeLayoutId] || Object.values(source.layouts || {})[0];
  if (!sourceLayout) throw new Error("В демо нет укладки.");
  const stamp = Date.now();
  const layoutId = `layout-admin-demo-${stamp}`;
  const containerMap = {};
  const changedAt = nowIso();
  const itemMap = {};

  const copyContainer = (containerId, parentId = null) => {
    if (containerMap[containerId]) return containerMap[containerId];
    const container = source.containers?.[containerId];
    if (!container) return "";
    const nextId = `admin-demo-container-${stamp}-${containerId}`;
    containerMap[containerId] = nextId;
    state.containers[nextId] = {
      ...clone(container),
      id: nextId,
      parentId,
      childIds: [],
      itemIds: [],
      order: [],
      adminDemo: true,
      publicCatalogLayoutId: layoutId,
      ...currentCreateMeta(changedAt)
    };
    (container.childIds || []).forEach((id) => copyContainer(id, nextId));
    return nextId;
  };

  const rootContainerIds = (sourceLayout.rootContainerIds || []).map((id) => copyContainer(id, null)).filter(Boolean);
  Object.values(source.items || {}).forEach((item) => {
    const nextContainerId = item.containerId ? containerMap[item.containerId] : "";
    const nextId = `admin-demo-item-${stamp}-${item.id}`;
    itemMap[item.id] = nextId;
    state.items[nextId] = {
      ...clone(item),
      id: nextId,
      containerId: nextContainerId,
      adminDemo: true,
      publicCatalogLayoutId: layoutId,
      ...currentCreateMeta(changedAt)
    };
  });
  Object.entries(containerMap).forEach(([sourceId, nextId]) => {
    const sourceContainer = source.containers[sourceId];
    const targetContainer = state.containers[nextId];
    if (!sourceContainer || !targetContainer) return;
    targetContainer.childIds = (sourceContainer.childIds || []).map((id) => containerMap[id]).filter(Boolean);
    targetContainer.itemIds = (sourceContainer.itemIds || []).map((id) => itemMap[id]).filter(Boolean);
    targetContainer.order = (sourceContainer.order || []).map((entry) => {
      if (entry.type === "container") {
        const id = containerMap[entry.id];
        return id ? { type: "container", id } : null;
      }
      const id = itemMap[entry.id];
      return id ? { type: "item", id } : null;
    }).filter(Boolean);
  });
  state.layouts[layoutId] = {
    id: layoutId,
    name: sourceLayout.name || "Демо для всех",
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    adminDemo: true,
    adminDemoLanguage: uiLanguage,
    ...currentCreateMeta(changedAt)
  };
  state.activeLayoutId = layoutId;
  state.locations = mergeStringList(state.locations || [], source.locations || [], state.locations || []);
  state.categories = mergeStringList(state.categories || [], source.categories || [], state.categories || []);
  applyLayoutArrangement(layoutId);
  setActivePrivateScope();
  saveState({ sync: false });
  switchView("packing");
  render();
}

function repairAdminDemoLayout(layout) {
  if (!layout?.adminDemo) return false;
  const stamp = String(layout.id || "").match(/^layout-admin-demo-(\d+)/)?.[1] || "";
  const prefix = stamp ? `admin-demo-container-${stamp}-` : "admin-demo-container-";
  const rootContainerIds = Object.values(state.containers || {})
    .filter((container) => !container.parentId && String(container.id || "").startsWith(prefix))
    .map((container) => container.id);
  if (!rootContainerIds.length) return false;
  const itemPrefix = stamp ? `admin-demo-item-${stamp}-` : "admin-demo-item-";
  Object.values(state.items || {})
    .filter((item) => String(item.id || "").startsWith(itemPrefix))
    .forEach((item) => {
      if (!item.containerId || !state.containers[item.containerId]) {
        const sourceId = String(item.id).slice(itemPrefix.length);
        const fallbackContainer = Object.values(state.containers || {}).find((container) =>
          String(container.id || "").startsWith(prefix) &&
          String(container.itemIds || []).includes(sourceId)
        );
        if (fallbackContainer) item.containerId = fallbackContainer.id;
      }
    });
  layout.rootContainerIds = rootContainerIds;
  layout.arrangement = createLayoutArrangementFromCurrentState(state, rootContainerIds);
  touchLayout(layout.id);
  saveState();
  return true;
}

async function publishActiveLayoutAsDemo() {
  if (!canOpenAdminPublishedEdit()) {
    showToast("Публиковать демо может только админ.", "error");
    return;
  }
  if (!currentUser) {
    showToast("Нужно войти админом, чтобы опубликовать демо.", "error");
    return;
  }
  if (isSharedLayoutView()) {
    showToast("Сначала откройте свою редактируемую демо-укладку.", "error");
    return;
  }
  const layout = state.layouts?.[state.activeLayoutId];
  if (!layout) return;
  const confirmed = await askConfirmDialog({
    title: "Опубликовать текущую укладку как демо?",
    text: `Укладка «${layout.name}» станет демо-укладкой по умолчанию для других пользователей.`,
    okText: "Опубликовать",
    cancelText: "Отмена"
  });
  if (!confirmed) return;
  try {
    updateSyncUi("Публикую демо-укладку...");
    layout.adminDemo = true;
    layout.adminDemoLanguage = uiLanguage;
    touchLayout(layout.id);
    saveState();
    await savePublishedLayoutRecord(layout.id);
    updateSyncUi();
    showToast("Демо-укладка опубликована.", "success");
  } catch (error) {
    updateSyncUi();
    showToast(`Не удалось опубликовать демо: ${error.message}`, "error");
  }
}

async function savePublishedLayoutRecord(layoutId = state.activeLayoutId, { notify = false } = {}) {
  const layout = state.layouts?.[layoutId];
  if (!layout) return;
  if (!canOpenAdminPublishedEdit()) {
    showToast("Public-укладки может сохранять только админ.", "error");
    return;
  }
  if (!currentUser) {
    showToast("Нужно войти админом, чтобы сохранить public-укладку.", "error");
    return;
  }
  const target = publishedLayoutTarget(layout, { defaultToDemo: true });
  if (!target) return;
  updateSyncUi(target.type === "demo" ? "Сохраняю демо-укладку..." : "Сохраняю shared-укладку...");
  const publicListId = publicListIdForPublishedTarget(target);
  const publishedPayload = await withLayoutArrangementAppliedAsync(layoutId, async () => {
    const uploadablePhotos = getUploadablePhotoEntries({ layoutId, listId: publicListId });
    if (uploadablePhotos.length) {
      updateSyncUi(target.type === "demo" ? "Загружаю фото демо-укладки..." : "Загружаю фото shared-укладки...");
      await uploadPublishedLayoutPhotos(layoutId, target, uploadablePhotos);
    }
    const unsyncedPhotos = getUnsyncedPhotoEntries({ layoutId, listId: publicListId });
    if (unsyncedPhotos.length) {
      const firstError = unsyncedPhotos.find((entry) => entry.photo?.error)?.photo?.error || "";
      throw new Error(firstError || `Не удалось загрузить фото (${unsyncedPhotos.length}). Public-укладка не сохранена, чтобы не опубликовать локальные ссылки.`);
    }
    return exportLayoutAsDemoState(layoutId);
  });
  const path = target.type === "demo"
    ? demoAdminStatePathForLanguage(target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
  try {
    await apiFetch(path, {
      method: "POST",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify({
        title: layout.name || "",
        description: layout.note || "",
        payload: publishedPayload
      })
    });
  } catch (error) {
    const targetLabel = target.type === "demo"
      ? `demo:${target.language || uiLanguage}`
      : `shared:${target.sharedId || ""}`;
    const publishError = new Error(`${error.message || "publish failed"} [${targetLabel} ${path}]`);
    publishError.cause = error;
    publishError.path = path;
    publishError.target = target;
    throw publishError;
  }
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = nowIso();
  saveSyncMeta();
  if (target.type === "demo") {
    setDemoStatePayloadForLanguage(target.language || uiLanguage, publishedPayload);
  } else {
    const sharedLayout = findSharedLayout(target.sharedId);
    if (sharedLayout) sharedLayout.statePayload = publishedPayload;
  }
  refreshPublishedLayoutView(target);
  updateSyncUi();
  if (notify) showToast(target.type === "demo" ? "Демо-укладка сохранена." : "Shared-укладка сохранена.", "success");
}

function exportLayoutAsDemoState(layoutId = state.activeLayoutId) {
  captureActiveLayoutArrangement();
  const layout = state.layouts?.[layoutId];
  if (!layout) throw new Error("Укладка не найдена.");
  const containers = {};
  const items = {};
  const containerIdMap = new Map();
  const itemIdMap = new Map();
  const mapContainerId = (containerId) => {
    if (containerIdMap.has(containerId)) return containerIdMap.get(containerId);
    const container = state.containers?.[containerId];
    const nextId = uniquePublishedRecordId(containers, cleanPublishedEntityId("container", container, containerId));
    containerIdMap.set(containerId, nextId);
    return nextId;
  };
  const mapItemId = (itemId) => {
    if (itemIdMap.has(itemId)) return itemIdMap.get(itemId);
    const item = state.items?.[itemId];
    const nextId = uniquePublishedRecordId(items, cleanPublishedEntityId("item", item, itemId));
    itemIdMap.set(itemId, nextId);
    return nextId;
  };
  const remapOrder = (order = []) => order.map((entry) => {
    if (entry?.type === "container") {
      const id = containerIdMap.get(entry.id);
      return id ? { type: "container", id } : null;
    }
    if (entry?.type === "item") {
      const id = itemIdMap.get(entry.id);
      return id ? { type: "item", id } : null;
    }
    return null;
  }).filter(Boolean);
  const walk = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return "";
    const nextContainerId = mapContainerId(containerId);
    if (containers[nextContainerId]) return nextContainerId;
    containers[nextContainerId] = clone(container);
    containers[nextContainerId].id = nextContainerId;
    containers[nextContainerId].parentId = container.parentId ? mapContainerId(container.parentId) : null;
    delete containers[nextContainerId].adminDemo;
    delete containers[nextContainerId].adminSharedSourceId;
    delete containers[nextContainerId].sharedSourceId;
    delete containers[nextContainerId].publicCatalogLayoutId;
    (container.itemIds || []).forEach((itemId) => {
      if (state.items?.[itemId]) {
        const nextItemId = mapItemId(itemId);
        items[nextItemId] = clone(state.items[itemId]);
        items[nextItemId].id = nextItemId;
        items[nextItemId].containerId = nextContainerId;
        delete items[nextItemId].adminDemo;
        delete items[nextItemId].adminSharedSourceId;
        delete items[nextItemId].sharedSourceId;
        delete items[nextItemId].publicCatalogLayoutId;
      }
    });
    (container.childIds || []).forEach(walk);
    containers[nextContainerId].childIds = (container.childIds || []).map((id) => containerIdMap.get(id)).filter(Boolean);
    containers[nextContainerId].itemIds = (container.itemIds || []).map((id) => itemIdMap.get(id)).filter(Boolean);
    containers[nextContainerId].order = remapOrder(container.order || []);
    if (!containers[nextContainerId].order.length) {
      containers[nextContainerId].order = [
        ...containers[nextContainerId].itemIds.map((id) => ({ type: "item", id })),
        ...containers[nextContainerId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    return nextContainerId;
  };
  const rootContainerIds = (layout.rootContainerIds || []).map(walk).filter(Boolean);
  const demoLayout = {
    ...clone(layout),
    id: "layout-main",
    name: layout.name || "Демо-укладка",
    rootContainerIds
  };
  delete demoLayout.adminDemo;
  delete demoLayout.adminSharedSourceId;
  delete demoLayout.sharedSourceId;
  delete demoLayout.publicCatalogLayoutId;
  const demoState = {
    locations: [...(state.locations || locations)],
    categories: [...(state.categories || categories)],
    containers,
    items,
    layouts: { "layout-main": demoLayout },
    activeLayoutId: "layout-main",
    collapsedContainers: {},
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    showItemMeta: true,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
  demoLayout.arrangement = createLayoutArrangementFromCurrentState(demoState, demoLayout.rootContainerIds);
  return normalizePublishedStatePayload(demoState) || demoState;
}

function cleanPublishedEntityId(type, entity, fallbackId = "") {
  const prefix = type === "container" ? "container" : "item";
  const sourceSeed = cleanGeneratedEntityId(entity?.sharedSourceId || entity?.id || fallbackId);
  const nameSeed = entity?.name ? cssSafeId(entity.name) : "";
  let seed = sourceSeed || nameSeed || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  seed = String(seed).trim();
  if (!seed.startsWith(`${prefix}-`)) seed = `${prefix}-${seed}`;
  seed = seed.replace(/[^a-zа-я0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return seed || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanGeneratedEntityId(value) {
  let id = String(value || "").trim();
  if (!id) return "";
  let previous = "";
  while (id && id !== previous) {
    previous = id;
    id = id
      .replace(/^admin-demo-container-\d+-/, "")
      .replace(/^admin-demo-item-\d+-/, "")
      .replace(/^container-shared-/, "")
      .replace(/^item-shared-/, "")
      .replace(/^shared-virtual-container-/, "")
      .replace(/^shared-virtual-item-/, "");
  }
  return id;
}

function openSharedLayoutsDialog() {
  const layoutId = currentSharedLayouts()[0]?.id;
  if (canOpenAdminPublishedEdit()) {
    openSharedLayoutForAdmin(layoutId);
    return;
  }
  openSharedLayoutViewer(layoutId);
}

async function openSharedLayoutViewer(layoutId, { remember = true } = {}) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  if (canOpenAdminPublishedEdit()) {
    await openSharedLayoutForAdmin(layoutId, { remember });
    return;
  }
  setActiveReadOnlyScope(layoutId);
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  switchView("packing");
  render();
  updateSyncUi(`Shared укладка · просмотр ${layout.name || ""}`);
  try {
    const loaded = await loadSharedLayoutPayload(layoutId);
    if (activeReadOnlyLayoutId() !== layoutId) return;
    if (loaded) {
      render();
      updateSyncUi(`Shared укладка · загружена с сервера ${layout.name || ""}`);
    }
  } catch {
    if (activeReadOnlyLayoutId() !== layoutId) return;
    updateSyncUi(`Shared укладка · встроенная версия ${layout.name || ""}`);
  }
}

async function openSharedLayoutForAdmin(layoutId, { remember = true } = {}) {
  const layout = findSharedLayout(layoutId);
  if (!layout || !canOpenAdminPublishedEdit()) return;
  updateSyncUi(`Shared укладка · загружаю для правки ${layout.name || ""}`);
  try {
    await loadSharedLayoutPayload(layoutId);
  } catch {
    // Built-in shared templates remain editable if the public endpoint is unavailable.
  }
  removePublicLayoutDrafts();
  const editableLayout = materializeSharedLayoutForAdmin(layoutId);
  if (!editableLayout) return;
  activateAdminPublishedLayout(editableLayout.id, { remember: false });
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  updateSyncUi(`Shared укладка · админ-редактирование ${layout.name || ""}`);
}

async function loadSharedLayoutPayload(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return false;
  const remoteState = await fetchStateRecordByItemKey(sharedLayoutItemKey(layoutId));
  if (!isPackingStateShape(remoteState)) return false;
  layout.statePayload = remoteState;
  return true;
}

function mergeBuiltInSharedLayoutEntries(layout, sourceState) {
  const sourceLayout = sourceState.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState.layouts || {})[0];
  if (!sourceLayout || !Array.isArray(layout?.roots) || !layout.roots.length) return sourceState;
  const merged = clone(sourceState);
  const targetLayout = merged.layouts[sourceLayout.id] || sourceLayout;
  targetLayout.rootContainerIds = Array.isArray(targetLayout.rootContainerIds) ? targetLayout.rootContainerIds : [];
  const containerBySource = new Map();
  Object.values(merged.containers || {}).forEach((container) => {
    if (container.sharedSourceId) containerBySource.set(container.sharedSourceId, container.id);
  });
  const itemKeys = new Set();
  Object.values(merged.items || {}).forEach((item) => {
    if (item.sharedSourceId) itemKeys.add(`source:${item.sharedSourceId}`);
    if (item.id) itemKeys.add(`id:${item.id}`);
    if (item.name) itemKeys.add(`name:${normalizeSharedGearName(item.name)}`);
  });
  const changedAt = nowIso();

  layout.roots.forEach((root) => {
    let containerId = containerBySource.get(root.id);
    if (!containerId) {
      containerId = uniquePublishedRecordId(merged.containers, `shared-root-${root.id}`);
      merged.containers[containerId] = sharedRootToPublishedContainer(root, containerId, changedAt);
      containerBySource.set(root.id, containerId);
      if (!targetLayout.rootContainerIds.includes(containerId)) targetLayout.rootContainerIds.push(containerId);
    }
    const container = merged.containers[containerId];
    if (!container) return;
    container.itemIds = Array.isArray(container.itemIds) ? container.itemIds : [];
    container.order = Array.isArray(container.order) ? container.order : [];
    (root.items || []).forEach((item) => {
      const itemKey = `source:${item.id}`;
      const nameKey = `name:${normalizeSharedGearName(item.name)}`;
      if (itemKeys.has(itemKey) || itemKeys.has(nameKey)) return;
      const itemId = uniquePublishedRecordId(merged.items, `shared-item-${item.id}`);
      merged.items[itemId] = sharedItemToPublishedItem(item, itemId, containerId, changedAt);
      container.itemIds.push(itemId);
      container.order.push({ type: "item", id: itemId });
      itemKeys.add(itemKey);
      itemKeys.add(`id:${itemId}`);
      itemKeys.add(nameKey);
    });
  });

  targetLayout.arrangement = createLayoutArrangementFromCurrentState(merged, targetLayout.rootContainerIds);
  return normalizePublishedStatePayload(merged) || merged;
}

function normalizeSharedGearName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniquePublishedRecordId(records, preferredId) {
  if (!records?.[preferredId]) return preferredId;
  let index = 2;
  while (records[`${preferredId}-${index}`]) index += 1;
  return `${preferredId}-${index}`;
}

function sharedRootToPublishedContainer(root, id, changedAt) {
  return {
    id,
    name: root.name,
    parentId: null,
    childIds: [],
    itemIds: [],
    order: [],
    weight: Number(root.weightGrams || 0),
    volume: Number(root.volumeLiters || 0),
    color: "",
    location: defaultRootContainerLocation(state),
    note: root.description || "",
    photos: [],
    sharedSourceId: root.id,
    ...currentCreateMeta(changedAt)
  };
}

function sharedItemToPublishedItem(item, id, containerId, changedAt) {
  return {
    id,
    name: item.name,
    weight: Number(item.weightGrams || 0),
    quantity: 1,
    location: defaultRootContainerLocation(state),
    category: "Прочее",
    categories: ["Прочее"],
    containerId,
    note: item.description || "",
    photos: [],
    sharedSourceId: item.id,
    ...currentCreateMeta(changedAt)
  };
}

async function openAdminSharedLayoutFromSelect(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  setActivePrivateScope();
  updateSyncUi(`Shared укладка · загружаю для правки ${layout.name || ""}`);
  try {
    await loadSharedLayoutPayload(layoutId);
  } catch {
    // Built-in shared layout remains editable until the first admin sync publishes it.
  }
  removePublicLayoutDrafts();
  const editableLayout = materializeSharedLayoutForAdmin(layoutId);
  if (!editableLayout) return;
  switchView("packing");
  render();
  updateSyncUi(`Shared укладка · админ-редактирование ${layout.name || ""}`);
}

function renderSharedLayouts() {
  fillSelect(
    refs.sharedCopyLayoutSelect,
    Object.values(state.layouts).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId).map((layout) => [layout.id, layout.name]),
    state.activeLayoutId
  );
  refs.sharedLayoutsList.innerHTML = currentSharedLayouts().map((layout) => {
    const roots = sharedLayoutRoots(layout);
    const totalWeight = roots.reduce((sum, root) => sum + sharedRootWeight(root), 0);
    const itemCount = roots.reduce((sum, root) => sum + (root.items || []).length, 0);
    return `
      <section class="shared-layout-block">
        <div class="shared-layout-heading">
          <div>
            <h3>${escapeHtml(layout.name)}</h3>
            <span>${escapeHtml(layout.subtitle)}</span>
          </div>
          <strong>${roots.length} ${escapeHtml(t("summary.bags"))} · ${itemCount} ${escapeHtml(t("tabs.items").toLowerCase())} · ${formatWeight(totalWeight)}</strong>
        </div>
        <div class="shared-board">
          ${roots.map((root) => renderSharedRootColumn(layout, root)).join("")}
        </div>
      </section>
    `;
  }).join("");
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-root]").forEach((button) => {
    button.addEventListener("click", () => copySharedRoot(button.dataset.copySharedRoot));
  });
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-item]").forEach((button) => {
    button.addEventListener("click", () => copySharedItem(button.dataset.copySharedItem));
  });
}

function bindSharedLayoutEvents(root = document) {
  root.querySelectorAll("[data-copy-shared-layout]").forEach((button) => {
    button.addEventListener("click", () => copySharedLayout(button.dataset.copySharedLayout));
  });
  root.querySelectorAll("[data-copy-shared-root]").forEach((button) => {
    button.addEventListener("click", () => copySharedRoot(button.dataset.copySharedRoot));
  });
  root.querySelectorAll("[data-copy-shared-item]").forEach((button) => {
    button.addEventListener("click", () => copySharedItem(button.dataset.copySharedItem));
  });
}

function bindSharedVirtualEvents(root = document) {
  const demoSource = activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  if (!demoSource) addSharedReadOnlyCopyButtons(root);
  bindSharedLayoutEvents(root);
  root.querySelectorAll("[data-copy-layout-item], [data-copy-item], [data-edit-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const virtualId = button.dataset.copyLayoutItem || button.dataset.copyItem || button.dataset.editItem;
      const sourceId = originalSharedId(virtualId, "shared-virtual-item-");
      if (!sourceId) return;
      if (button.dataset.editItem && canOpenAdminPublishedEdit()) editSharedSourceAsAdmin("item", sourceId);
      else if (!canOpenAdminPublishedEdit()) openSharedReadonlyItemDialog(sourceId);
      else copySharedItem(sourceId);
    });
  });
  root.querySelectorAll("[data-copy-root], [data-edit-root], [data-delete-root], [data-add-to-container], [data-edit-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const virtualId = button.dataset.copyRoot || button.dataset.editRoot || button.dataset.deleteRoot ||
        button.dataset.addToContainer || button.dataset.editContainer;
      const sourceId = originalSharedId(virtualId, "shared-virtual-container-");
      if (!sourceId) return;
      if (canOpenAdminPublishedEdit() && (button.dataset.editRoot || button.dataset.editContainer || button.dataset.addToContainer || button.dataset.deleteRoot)) {
        const action = button.dataset.addToContainer ? "add" : button.dataset.deleteRoot ? "delete" : "edit";
        editSharedSourceAsAdmin("container", sourceId, action);
      } else {
        copySharedRoot(sourceId);
      }
    });
  });
  root.querySelectorAll("[data-remove-from-layout], [data-delete-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (canOpenAdminPublishedEdit() && button.dataset.deleteItem) {
        const sourceId = originalSharedId(button.dataset.deleteItem, "shared-virtual-item-");
        if (sourceId) editSharedSourceAsAdmin("item", sourceId, "delete");
      }
    });
  });
  root.querySelectorAll("[data-toggle-container]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerId = button.dataset.toggleContainer;
      capturePackingScroll();
      sharedVirtualCollapsedContainers[containerId] = !sharedVirtualCollapsedContainers[containerId];
      render();
    });
  });
  root.querySelectorAll("[data-toggle-column]").forEach((button) => {
    button.addEventListener("click", () => {
      withSharedVirtualState(() => {
        const containerIds = getDescendantContainerIds(button.dataset.toggleColumn);
        const shouldCollapse = containerIds.some((id) => !state.collapsedContainers[id]);
        containerIds.forEach((id) => {
          state.collapsedContainers[id] = shouldCollapse;
        });
      });
      capturePackingScroll();
      render();
    });
  });
  root.querySelectorAll("#addRootContainerBtn").forEach((button) => {
    button.textContent = "Скопировать всю укладку";
    if (demoSource) button.textContent = demoCopyActionText();
    button.addEventListener("click", () => copySharedLayout(activeReadOnlyLayoutId()));
  });
  if (!canOpenAdminPublishedEdit()) {
    if (demoSource) {
      root.querySelectorAll("[data-copy-layout-item], [data-copy-item], [data-copy-root]").forEach((button) => {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
      });
    }
    root.querySelectorAll("[data-edit-item]").forEach((button) => {
      button.title = "Открыть и скопировать";
      button.setAttribute("aria-label", "Открыть и скопировать");
      if (demoSource) {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
      }
    });
    root.querySelectorAll("[data-edit-root], [data-edit-container], [data-add-to-container], [data-remove-from-layout], [data-delete-item], [data-delete-root]").forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
    });
  }
  root.querySelectorAll("input, textarea, select").forEach((element) => {
    if (element.closest(".controls")) return;
    if (element.closest(".items-filter-row, .root-containers-toolbar")) return;
    element.disabled = true;
  });
}

function addSharedReadOnlyCopyButtons(root = document) {
  root.querySelectorAll("[data-root-container-id], [data-subcontainer-id]").forEach((card) => {
    const virtualId = card.dataset.rootContainerId || card.dataset.subcontainerId;
    const sourceId = originalSharedId(virtualId, "shared-virtual-container-");
    if (!sourceId) return;
    const tools = card.querySelector(".container-tools, .subcontainer-tools");
    if (!tools || tools.querySelector(`[data-copy-root="${CSS.escape(virtualId)}"]`)) return;
    const button = document.createElement("button");
    button.className = "header-icon-button copy-item-button";
    button.type = "button";
    button.dataset.copyRoot = virtualId;
    button.title = "Скопировать";
    button.setAttribute("aria-label", "Скопировать");
    button.innerHTML = '<span aria-hidden="true">⧉</span>';
    tools.insertBefore(button, tools.firstChild);
  });
}

function sharedLayoutRoots(layout) {
  return Array.isArray(layout?.roots) ? layout.roots : [];
}

function renderSharedRootColumn(layout, root) {
  const itemCount = (root.items || []).length;
  return `
    <article class="container-card shared-root-column">
      <div class="container-header">
        <div class="container-header-main">
          ${renderSharedGearPhoto(root)}
          <div>
            <h3>${escapeHtml(root.name)}</h3>
            <span class="container-location">${formatWeight(sharedRootWeight(root))}${root.volumeLiters ? ` · ${formatVolume(root.volumeLiters)}` : ""}</span>
          </div>
        </div>
        <button class="copy-item-button" type="button" data-copy-shared-root="${escapeHtml(root.id)}" aria-label="Скопировать сумку" title="Скопировать сумку">
          <span aria-hidden="true">⧉</span>
        </button>
      </div>
      ${root.description ? `<p class="shared-root-note">${escapeHtml(root.description)}</p>` : ""}
      <div class="dropzone">
        ${(root.items || []).map((item) => renderSharedItemCard(layout, root, item)).join("") || `<div class="empty">${itemCount ? "" : "Внутри пока нет вещей"}</div>`}
      </div>
    </article>
  `;
}

function renderSharedItemCard(layout, root, item) {
  return `
    <article class="shared-gear-card">
      ${renderSharedGearPhoto(item)}
      <div class="shared-gear-body">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="shared-gear-meta">
          ${root?.name ? `<span class="shared-weight">${escapeHtml(root.name)}</span>` : ""}
          <span class="shared-weight">Вес: ${formatWeight(item.weightGrams)}${item.weightAlt ? ` · ${escapeHtml(item.weightAlt)}` : ""}</span>
          ${item.volumeLiters ? `<span class="shared-weight">${formatVolume(item.volumeLiters)}</span>` : ""}
        </div>
        <button class="ghost shared-copy-button" type="button" data-copy-shared-item="${escapeHtml(item.id)}">
          Скопировать вещь
        </button>
      </div>
    </article>
  `;
}

function renderSharedGearPhoto(bag) {
  if (!state.showItemMeta) return "";
  if (bag.imageUrl) {
    return `
      <div class="shared-gear-photo">
        <img src="${escapeHtml(bag.imageUrl)}" alt="${escapeHtml(bag.name)}" loading="lazy" />
      </div>
    `;
  }
  return `
    <div class="shared-gear-photo shared-gear-photo-${escapeHtml(bag.photoKind || "bag")}" aria-label="${escapeHtml(bag.name)}" role="img">
      <span>${escapeHtml(sharedGearInitials(bag.name))}</span>
    </div>
  `;
}

function sharedGearInitials(name) {
  return String(name)
    .split(/[\s-]+/)
    .filter((part) => /^[A-Za-z0-9]/.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "BG";
}

function sharedRootWeight(root) {
  return Number(root.weightGrams || 0) + (root.items || []).reduce((sum, item) => sum + Number(item.weightGrams || 0), 0);
}

function findSharedLayout(layoutId) {
  if (layoutId === DEMO_SHARED_LAYOUT_ID) return demoSharedLayout;
  if (linkedSharedListLayout?.id === layoutId) return linkedSharedListLayout;
  return currentSharedLayouts().find((layout) => layout.id === layoutId) || null;
}

function publicSharedLayouts() {
  return [demoSharedLayout, ...(linkedSharedListLayout ? [linkedSharedListLayout] : []), ...currentSharedLayouts()];
}

function findSharedPublishedContainer(containerId) {
  for (const layout of publicSharedLayouts()) {
    const sourceState = sharedLayoutStatePayload(layout);
    if (sourceState?.containers?.[containerId]) return { layout, sourceState, container: sourceState.containers[containerId] };
  }
  return null;
}

function findSharedPublishedItem(itemId) {
  for (const layout of publicSharedLayouts()) {
    const sourceState = sharedLayoutStatePayload(layout);
    if (sourceState?.items?.[itemId]) return { layout, sourceState, item: sourceState.items[itemId] };
  }
  return null;
}

function findSharedRoot(rootId) {
  const published = findSharedPublishedContainer(rootId);
  if (published) return { ...sharedRootFromPublishedContainer(published.container), sourceState: published.sourceState };
  for (const layout of publicSharedLayouts()) {
    const root = sharedLayoutRoots(layout).find((item) => item.id === rootId);
    if (root) return root;
  }
  return null;
}

function findSharedItem(itemId) {
  const published = findSharedPublishedItem(itemId);
  if (published) return { item: sharedItemFromPublishedItem(published.item), root: null, layout: published.layout, sourceState: published.sourceState };
  for (const layout of publicSharedLayouts()) {
    for (const root of sharedLayoutRoots(layout)) {
      const item = (root.items || []).find((entry) => entry.id === itemId);
      if (item) return { item, root, layout };
    }
  }
  return null;
}

function sharedRootFromPublishedContainer(container) {
  return {
    id: container.id,
    name: container.name,
    description: container.note || "",
    weightGrams: Number(container.weight || 0),
    volumeLiters: Number(container.volume || 0),
    imageUrl: container.photos?.[0]?.thumbUrl || container.photos?.[0]?.url || "",
    items: []
  };
}

function sharedItemFromPublishedItem(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.note || "",
    weightGrams: Number(item.weight || 0) * Number(item.quantity || 1),
    imageUrl: item.photos?.[0]?.thumbUrl || item.photos?.[0]?.url || ""
  };
}

function selectedSharedTargetLayoutId() {
  const selected = refs.sharedCopyLayoutSelect?.value;
  const layout = state.layouts[selected];
  return layout && !layout.adminDemo && !layout.adminSharedSourceId ? selected : "";
}

function chooseSharedCopyTargetLayoutId() {
  const layouts = Object.values(state.layouts || {}).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId);
  if (!layouts.length) return "";
  if (layouts.length === 1) return layouts[0].id;
  const list = layouts.map((layout, index) => `${index + 1}. ${layout.name}`).join("\n");
  const answer = window.prompt(`В какую вашу укладку скопировать?\n${list}`, "1");
  const index = Number.parseInt(answer || "", 10) - 1;
  return layouts[index]?.id || layouts[0].id;
}

async function copySharedRoot(rootId) {
  const published = findSharedPublishedContainer(rootId);
  if (published) {
    const targetLayoutId = chooseSharedCopyTargetLayoutId() || selectedSharedTargetLayoutId();
    if (!targetLayoutId) return;
    const rootName = published.container.name;
    const sourceSnapshot = snapshotContainerTree(rootId, { targetState: published.sourceState });
    if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, rootName))) return;
    copyPublishedContainerToState(published.sourceState, rootId, { targetLayoutId });
    setActivePrivateScope();
    saveState();
    switchActiveLayout(targetLayoutId);
    render();
    renderSharedLayouts();
    showToast(`«${rootName}» скопировано в выбранную укладку.`, "success");
    return;
  }
  const root = findSharedRoot(rootId);
  if (!root) return;
  const targetLayoutId = chooseSharedCopyTargetLayoutId() || selectedSharedTargetLayoutId();
  if (!targetLayoutId) return;
  const sourceSnapshot = legacySharedRootSnapshot(root);
  if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, root.name))) return;
  copySharedRootToState(root, { targetLayoutId });
  setActivePrivateScope();
  saveState();
  switchActiveLayout(targetLayoutId);
  render();
  renderSharedLayouts();
  showToast(`«${root.name}» скопировано в выбранную укладку.`, "success");
}

async function copySharedItem(itemId) {
  const published = findSharedPublishedItem(itemId);
  if (published) {
    const targetLayoutId = chooseSharedCopyTargetLayoutId();
    if (!targetLayoutId) return;
    const sourceSnapshot = { rootId: "", containers: {}, items: { [itemId]: published.item } };
    if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, published.item.name))) return;
    const copiedItemId = copyPublishedItemToState(published.sourceState, itemId, { containerId: "" });
    setActivePrivateScope();
    saveState();
    switchActiveLayout(targetLayoutId);
    render();
    renderSharedLayouts();
    openItemDialog(copiedItemId);
    showToast(`«${published.item.name}» скопировано в вещи.`, "success");
    return;
  }
  const match = findSharedItem(itemId);
  if (!match) return;
  const targetLayoutId = chooseSharedCopyTargetLayoutId();
  if (!targetLayoutId) return;
  const sourceSnapshot = { rootId: "", containers: {}, items: { [itemId]: match.item } };
  if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, match.item.name))) return;
  const copiedItemId = copySharedItemToState(match.item, { containerId: "" });
  setActivePrivateScope();
  saveState();
  switchActiveLayout(targetLayoutId);
  render();
  renderSharedLayouts();
  openItemDialog(copiedItemId);
  showToast(`«${match.item.name}» скопировано в вещи.`, "success");
}

function copyPublishedContainerToState(sourceState, containerId, { targetLayoutId = "", parentId = null, changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const sourceSnapshot = snapshotContainerTree(containerId, { targetState: sourceState });
  if (!sourceSnapshot) return "";
  const sourceLayoutId = sourceState?.activeLayoutId || Object.values(sourceState?.layouts || {})[0]?.id || "";
  const containerMap = idMap?.containers || new Map();
  const itemMap = idMap?.items || new Map();
  const makeContainerId = (sourceId) => preserveSource
    ? `container-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const makeItemId = (sourceId) => preserveSource
    ? `item-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const copyItem = (sourceItemId, nextContainerId) => {
    const sourceItem = sourceSnapshot.items[sourceItemId] || sourceState.items?.[sourceItemId];
    if (!sourceItem) return "";
    if (itemMap.has(sourceItemId)) return itemMap.get(sourceItemId);
    const nextId = makeItemId(sourceItemId);
    itemMap.set(sourceItemId, nextId);
    if (idMap?.items) idMap.items.set(sourceItemId, nextId);
    state.items[nextId] = {
      ...cloneIsolatedEntity(sourceItem),
      id: nextId,
      containerId: nextContainerId,
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(state.items[nextId], "item", sourceItemId, sourceLayoutId);
    if (preserveSource) state.items[nextId].sharedSourceId = sourceItemId;
    return nextId;
  };

  const copyContainer = (sourceContainerId, nextParentId = null) => {
    const sourceContainer = sourceSnapshot.containers[sourceContainerId] || sourceState.containers?.[sourceContainerId];
    if (!sourceContainer) return "";
    if (containerMap.has(sourceContainerId)) return containerMap.get(sourceContainerId);
    const nextId = makeContainerId(sourceContainerId);
    containerMap.set(sourceContainerId, nextId);
    if (idMap?.containers) idMap.containers.set(sourceContainerId, nextId);
    state.containers[nextId] = {
      ...cloneIsolatedEntity(sourceContainer),
      id: nextId,
      parentId: nextParentId,
      childIds: [],
      itemIds: [],
      order: [],
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(state.containers[nextId], "container", sourceContainerId, sourceLayoutId);
    if (preserveSource) state.containers[nextId].sharedSourceId = sourceContainerId;
    state.collapsedContainers[nextId] = false;

    const copiedChildren = new Map();
    const copiedItems = new Map();
    state.containers[nextId].childIds = (sourceContainer.childIds || []).map((childId) => {
      const copiedId = copyContainer(childId, nextId);
      if (copiedId) copiedChildren.set(childId, copiedId);
      return copiedId;
    }).filter(Boolean);
    state.containers[nextId].itemIds = (sourceContainer.itemIds || []).map((itemId) => {
      const copiedId = copyItem(itemId, nextId);
      if (copiedId) copiedItems.set(itemId, copiedId);
      return copiedId;
    }).filter(Boolean);
    state.containers[nextId].order = (sourceContainer.order || []).map((entry) => {
      if (entry?.type === "container") {
        const copiedId = copiedChildren.get(entry.id) || containerMap.get(entry.id);
        return copiedId ? { type: "container", id: copiedId } : null;
      }
      if (entry?.type === "item") {
        const copiedId = copiedItems.get(entry.id) || itemMap.get(entry.id);
        return copiedId ? { type: "item", id: copiedId } : null;
      }
      return null;
    }).filter(Boolean);
    if (!state.containers[nextId].order.length) {
      state.containers[nextId].order = [
        ...state.containers[nextId].itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...state.containers[nextId].childIds.map((childId) => ({ type: "container", id: childId }))
      ];
    }
    return nextId;
  };

  const id = copyContainer(sourceSnapshot.rootId || containerId, parentId);
  if (!id) return "";
  if (!parentId && targetLayoutId && state.layouts[targetLayoutId]) {
    const layout = state.layouts[targetLayoutId];
    layout.rootContainerIds = [...(layout.rootContainerIds || []), id];
    layout.arrangement = createLayoutArrangementFromCurrentState(state, layout.rootContainerIds);
    touchLayout(targetLayoutId, changedAt);
  }
  return id;
}

function markLocalPublicCopyOrigin(record, kind, sourceId, sourceLayoutId = "") {
  if (!record || !sourceId) return;
  record._publicCopySourceKind = kind;
  record._publicCopySourceId = String(sourceId);
  record._publicCopySourceLayoutId = sourceLayoutId ? String(sourceLayoutId) : "";
}

function copyPublishedItemToState(sourceState, itemId, { containerId = "", changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const source = sourceState.items?.[itemId];
  if (!source) return "";
  const sourceLayoutId = sourceState?.activeLayoutId || Object.values(sourceState?.layouts || {})[0]?.id || "";
  const id = preserveSource
    ? `item-shared-${itemId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  idMap?.items?.set(itemId, id);
  state.items[id] = {
    ...cloneIsolatedEntity(source),
    id,
    containerId,
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.items[id], "item", itemId, sourceLayoutId);
  if (preserveSource) state.items[id].sharedSourceId = itemId;
  if (containerId && state.containers[containerId]) {
    const container = state.containers[containerId];
    container.itemIds.push(id);
    container.order.push({ type: "item", id });
    touchContainer(containerId, changedAt);
  }
  return id;
}

function legacySharedRootSnapshot(root) {
  const containers = {};
  const items = {};
  if (!root?.id) return { rootId: "", containers, items };
  containers[root.id] = {
    id: root.id,
    name: root.name,
    childIds: [],
    itemIds: (root.items || []).map((item) => item.id).filter(Boolean),
    order: (root.items || []).map((item) => ({ type: "item", id: item.id })).filter((entry) => entry.id)
  };
  (root.items || []).forEach((item) => {
    if (item?.id) items[item.id] = item;
  });
  return { rootId: root.id, containers, items };
}

function publicCopyDuplicateSummaryForSnapshot(targetLayoutId, sourceSnapshot) {
  const sourceContainerIds = new Set(Object.keys(sourceSnapshot?.containers || {}).map(String));
  const sourceItemIds = new Set(Object.keys(sourceSnapshot?.items || {}).map(String));
  const result = { containerIds: [], itemIds: [] };
  if (!sourceContainerIds.size && !sourceItemIds.size) return result;
  withLayoutArrangementApplied(targetLayoutId, () => {
    const targetLayout = state.layouts[targetLayoutId];
    getActiveLayoutContainerIdSet(targetLayout).forEach((containerId) => {
      const container = state.containers[containerId];
      if (container?._publicCopySourceKind === "container" && sourceContainerIds.has(String(container._publicCopySourceId || ""))) {
        result.containerIds.push(containerId);
      }
    });
    currentAppliedLayoutItemIds(targetLayout).forEach((itemId) => {
      const item = state.items[itemId];
      if (item?._publicCopySourceKind === "item" && sourceItemIds.has(String(item._publicCopySourceId || ""))) {
        result.itemIds.push(itemId);
      }
    });
  });
  if (sourceItemIds.size) {
    Object.entries(state.items || {}).forEach(([itemId, item]) => {
      if (item?._publicCopySourceKind === "item" && sourceItemIds.has(String(item._publicCopySourceId || ""))) {
        result.itemIds.push(itemId);
      }
    });
  }
  return {
    containerIds: [...new Set(result.containerIds)],
    itemIds: [...new Set(result.itemIds)]
  };
}

async function confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, sourceName = "") {
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout) return false;
  const duplicates = publicCopyDuplicateSummaryForSnapshot(targetLayoutId, sourceSnapshot);
  if (!duplicates.containerIds.length && !duplicates.itemIds.length) return true;
  const duplicate = await askConfirmDialog({
    title: "Уже скопировано в эту укладку",
    text: `«${sourceName || "Элемент"}» уже есть в укладке «${targetLayout.name || "Укладка"}» как копия из demo/shared. Создать ещё одну отдельную копию?`,
    okText: "Дублировать",
    cancelText: "Пропустить",
    highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже найдены по исходным ID`,
    tone: "safe"
  });
  if (duplicate) return true;
  showToast("Копирование пропущено: такая demo/shared копия уже есть в целевой укладке.", "success");
  return false;
}

function cloneIsolatedEntity(entity) {
  const cloned = clone(entity || {});
  delete cloned.scope;
  delete cloned.source;
  delete cloned.origin;
  delete cloned.sourceType;
  delete cloned.source_type;
  delete cloned.visibility;
  delete cloned.sourceId;
  delete cloned.source_id;
  delete cloned.sourceScope;
  delete cloned.source_scope;
  delete cloned.sourceListId;
  delete cloned.source_list_id;
  delete cloned.listId;
  delete cloned.list_id;
  delete cloned.sourceItemId;
  delete cloned.source_item_id;
  delete cloned.sourceContainerId;
  delete cloned.source_container_id;
  delete cloned.sourceLayoutId;
  delete cloned.source_layout_id;
  delete cloned.sharedSourceId;
  delete cloned.sharedSourceItemId;
  delete cloned.sharedSourceContainerId;
  delete cloned.sharedSourceLayoutId;
  delete cloned.publicSourceId;
  delete cloned.publicSourceItemId;
  delete cloned.publicSourceContainerId;
  delete cloned.publicSourceLayoutId;
  delete cloned.publicCatalogLayoutId;
  delete cloned.publicCatalogItemId;
  delete cloned.publicCatalogContainerId;
  delete cloned.templateId;
  delete cloned.templateSourceId;
  delete cloned.adminDemo;
  delete cloned.isDemo;
  delete cloned.adminShared;
  delete cloned.adminSharedSourceId;
  return cloned;
}

function demoCopyActionText() {
  return uiLanguage === "en" ? "Use as new layout" : "\u0412\u0437\u044f\u0442\u044c \u043a\u0430\u043a \u043d\u043e\u0432\u0443\u044e \u0443\u043a\u043b\u0430\u0434\u043a\u0443";
}

function demoCopyLayoutName(sourceName = "") {
  const fallback = uiLanguage === "en" ? "Demo copy" : "\u041c\u043e\u044f \u0434\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430";
  const baseName = String(sourceName || fallback).trim();
  return baseName || fallback;
}

function copyPublishedDemoStateToLocalLayout(demoState, { activate = true, remember = true } = {}) {
  const source = normalizePublishedStatePayload(demoState) || createBlankBikePackingState();
  const sourceLayout = source.layouts?.[source.activeLayoutId] || Object.values(source.layouts || {})[0];
  if (!sourceLayout) return "";
  const stamp = Date.now();
  const changedAt = nowIso();
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = (sourceLayout.rootContainerIds || [])
    .map((id) => copyPublishedContainerToState(source, id, { targetLayoutId: "", changedAt, idMap }))
    .filter(Boolean);

  const layoutId = `layout-guest-demo-${stamp}`;
  state.layouts[layoutId] = {
    id: layoutId,
    name: demoCopyLayoutName(sourceLayout.name),
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    [GUEST_DEMO_COPY_FLAG]: !canUsePrivateState(),
    demoSourceLanguage: uiLanguage,
    ...currentCreateMeta(changedAt)
  };
  state.locations = mergeStringList(state.locations || [], source.locations || [], state.locations || []);
  state.categories = mergeStringList(state.categories || [], source.categories || [], state.categories || []);
  if (activate) {
    setActiveLocalEditableScope(layoutId);
    state.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
    if (remember) rememberActiveLayoutChoice(layoutId);
    switchView("packing");
  }
  saveState();
  render();
  return layoutId;
}

async function createLocalDemoCopy({ forceNew = false, remember = true } = {}) {
  const existing = !forceNew
    ? Object.values(state.layouts || {}).find((layout) => layout?.[GUEST_DEMO_COPY_FLAG])
    : null;
  if (existing) {
    openPrivateLayout(existing.id, { remember });
    return existing.id;
  }
  const demoState = await defaultDemoState(uiLanguage);
  const layoutId = copyPublishedDemoStateToLocalLayout(demoState, { remember });
  updateSyncUi(currentUser ? "" : t("sync.localUnlocked"));
  return layoutId;
}

function copySharedLayout(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  if (layout.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit()) {
    createLocalDemoCopy({ forceNew: true }).catch((error) => {
      updateSyncUi(`Demo copy failed: ${error.message}`);
    });
    return;
  }
  const changedAt = nowIso();
  const sourceState = sharedLayoutStatePayload(layout);
  const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
  const rootIds = sourceState
    ? (sourceLayout?.rootContainerIds || []).map((id) => copyPublishedContainerToState(sourceState, id, { targetLayoutId: "", changedAt }))
    : sharedLayoutRoots(layout).map((root) => copySharedRootToState(root, { targetLayoutId: "", changedAt }));
  const nextLayoutId = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.layouts[nextLayoutId] = {
    id: nextLayoutId,
    name: sourceLayout?.name || layout.name,
    rootContainerIds: rootIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootIds),
    ...currentCreateMeta(changedAt)
  };
  state.activeLayoutId = nextLayoutId;
  applyLayoutArrangement(nextLayoutId);
  setActivePrivateScope();
  rememberActiveLayoutChoice(nextLayoutId);
  saveState();
  if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
  switchView("packing");
  render();
  showToast(`Укладка «${layout.name}» скопирована.`, "success");
}

function materializeSharedLayoutForAdmin(layoutId = activeReadOnlyLayoutId()) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return null;
  let editableLayout = Object.values(state.layouts || {}).find((entry) => entry.adminSharedSourceId === layout.id);
  if (!editableLayout) {
    const changedAt = nowIso();
    const idMap = { containers: new Map(), items: new Map() };
    const sourceState = sharedLayoutStatePayload(layout);
    const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
    const rootIds = sourceState
      ? (sourceLayout?.rootContainerIds || []).map((id) =>
          copyPublishedContainerToState(sourceState, id, { targetLayoutId: "", changedAt, idMap, preserveSource: true })
        )
      : sharedLayoutRoots(layout).map((root) =>
          copySharedRootToState(root, { targetLayoutId: "", changedAt, idMap, preserveSource: true })
        );
    const nextLayoutId = `layout-admin-shared-${layout.id}-${Date.now()}`;
    editableLayout = {
      id: nextLayoutId,
      name: sourceLayout?.name || layout.name,
      rootContainerIds: rootIds,
      arrangement: createLayoutArrangementFromCurrentState(state, rootIds),
      adminSharedSourceId: layout.id,
      ...currentCreateMeta(changedAt)
    };
    state.layouts[nextLayoutId] = editableLayout;
    saveState({ sync: false });
  } else {
    const syncedPublished = mergePublishedSharedStateIntoAdminLayout(layout, editableLayout);
    const syncedBuiltIn = sharedLayoutStatePayload(layout) ? false : mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout);
    if (syncedPublished || syncedBuiltIn) saveState({ sync: false });
  }
  return editableLayout;
}

function mergePublishedSharedStateIntoAdminLayout(layout, editableLayout) {
  const sourceState = sharedLayoutStatePayload(layout);
  const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
  if (!sourceState || !sourceLayout || !editableLayout) return false;
  const changedAt = nowIso();
  const layoutContainerIds = new Set();
  const collectContainer = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container || layoutContainerIds.has(containerId)) return;
    layoutContainerIds.add(containerId);
    (container.childIds || []).forEach(collectContainer);
  };
  (editableLayout.rootContainerIds || []).forEach(collectContainer);

  const containersBySource = new Map();
  const containersByName = new Map();
  layoutContainerIds.forEach((containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return;
    if (container.sharedSourceId) containersBySource.set(container.sharedSourceId, container);
    if (container.name) containersByName.set(normalizeSharedGearName(container.name), container);
  });

  const itemsBySource = new Map();
  const itemsByName = new Map();
  Object.values(state.items || {}).forEach((item) => {
    if (!item || !layoutContainerIds.has(item.containerId)) return;
    if (item.sharedSourceId) itemsBySource.set(item.sharedSourceId, item);
    if (item.name) itemsByName.set(normalizeSharedGearName(item.name), item);
  });

  let changed = false;
  const syncEntity = (target, source, sourceId) => {
    if (!target || !source) return;
    if (sourceId && target.sharedSourceId !== sourceId) {
      target.sharedSourceId = sourceId;
      changed = true;
    }
    if (syncPublishedEntityPhotos(target, source)) {
      target.updatedAt = source.updatedAt || changedAt;
      changed = true;
    }
  };
  const syncContainerTree = (sourceContainerId) => {
    const sourceContainer = sourceState.containers?.[sourceContainerId];
    if (!sourceContainer) return;
    const targetContainer =
      containersBySource.get(sourceContainerId) ||
      containersByName.get(normalizeSharedGearName(sourceContainer.name));
    syncEntity(targetContainer, sourceContainer, sourceContainerId);
    (sourceContainer.itemIds || []).forEach((sourceItemId) => {
      const sourceItem = sourceState.items?.[sourceItemId];
      if (!sourceItem) return;
      const targetItem =
        itemsBySource.get(sourceItemId) ||
        itemsByName.get(normalizeSharedGearName(sourceItem.name));
      syncEntity(targetItem, sourceItem, sourceItemId);
    });
    (sourceContainer.childIds || []).forEach(syncContainerTree);
  };

  (sourceLayout.rootContainerIds || []).forEach(syncContainerTree);
  if (changed) {
    editableLayout.arrangement = createLayoutArrangementFromCurrentState(state, editableLayout.rootContainerIds || []);
    touchLayout(editableLayout.id, changedAt);
  }
  return changed;
}

function syncPublishedEntityPhotos(target, source) {
  const sourcePhotos = (Array.isArray(source?.photos) ? source.photos : [])
    .map((photo) => normalizePhotoUrlFields(clone(photo)))
    .filter(hasRemotePhotoUrl);
  if (!sourcePhotos.length) return false;
  const currentPhotos = (Array.isArray(target?.photos) ? target.photos : [])
    .map((photo) => normalizePhotoUrlFields(clone(photo)))
    .filter(hasRemotePhotoUrl);
  if (sameJson(currentPhotos, sourcePhotos)) return false;
  target.photos = sourcePhotos;
  return true;
}

function mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout) {
  if (!layout || !editableLayout || !Array.isArray(layout.roots) || !layout.roots.length) return false;
  const changedAt = nowIso();
  const layoutContainerIds = new Set();
  const collectContainer = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container || layoutContainerIds.has(containerId)) return;
    layoutContainerIds.add(containerId);
    (container.childIds || []).forEach(collectContainer);
  };
  (editableLayout.rootContainerIds || []).forEach(collectContainer);

  const rootBySource = new Map();
  const rootByName = new Map();
  (editableLayout.rootContainerIds || []).forEach((containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return;
    if (container.sharedSourceId) rootBySource.set(container.sharedSourceId, containerId);
    if (container.name) rootByName.set(normalizeSharedGearName(container.name), containerId);
  });

  const itemKeys = new Set();
  Object.values(state.items || {}).forEach((item) => {
    if (!item || !layoutContainerIds.has(item.containerId)) return;
    if (item.sharedSourceId) itemKeys.add(`source:${item.sharedSourceId}`);
    if (item.name) itemKeys.add(`name:${normalizeSharedGearName(item.name)}`);
  });

  let changed = false;
  layout.roots.forEach((root) => {
    let containerId =
      rootBySource.get(root.id) ||
      rootBySource.get(`shared-root-${root.id}`) ||
      rootByName.get(normalizeSharedGearName(root.name));

    if (!containerId) {
      containerId = copySharedRootToState(root, { targetLayoutId: "", changedAt, preserveSource: true });
      editableLayout.rootContainerIds = [...(editableLayout.rootContainerIds || []), containerId];
      changed = true;
      (root.items || []).forEach((item) => {
        itemKeys.add(`source:${item.id}`);
        itemKeys.add(`source:shared-item-${item.id}`);
        itemKeys.add(`name:${normalizeSharedGearName(item.name)}`);
      });
      return;
    }

    const container = state.containers?.[containerId];
    if (!container) return;
    (root.items || []).forEach((item) => {
      const sourceKey = `source:${item.id}`;
      const publishedSourceKey = `source:shared-item-${item.id}`;
      const nameKey = `name:${normalizeSharedGearName(item.name)}`;
      if (itemKeys.has(sourceKey) || itemKeys.has(publishedSourceKey) || itemKeys.has(nameKey)) return;
      copySharedItemToState(item, { containerId, changedAt, preserveSource: true });
      itemKeys.add(sourceKey);
      itemKeys.add(publishedSourceKey);
      itemKeys.add(nameKey);
      changed = true;
    });
  });

  if (changed) {
    editableLayout.arrangement = createLayoutArrangementFromCurrentState(state, editableLayout.rootContainerIds || []);
    touchLayout(editableLayout.id, changedAt);
  }
  return changed;
}

function findMaterializedSharedItemId(sourceId) {
  return Object.values(state.items || {}).find((item) => item.sharedSourceId === sourceId)?.id || "";
}

function findMaterializedSharedContainerId(sourceId) {
  return Object.values(state.containers || {}).find((container) => container.sharedSourceId === sourceId)?.id || "";
}

function editSharedSourceAsAdmin(type, sourceId, action = "edit") {
  if (!canOpenAdminPublishedEdit()) return false;
  const layout = materializeSharedLayoutForAdmin();
  if (!layout) return false;
  activateAdminPublishedLayout(layout.id);
  if (type === "item") {
    const itemId = findMaterializedSharedItemId(sourceId);
    if (itemId) {
      if (action === "delete") confirmDeleteItem(itemId);
      else openItemDialog(itemId);
    }
    return true;
  }
  const containerId = findMaterializedSharedContainerId(sourceId);
  if (containerId) {
    if (action === "add") openAddToContainerDialog(containerId);
    else if (action === "delete") confirmDeleteRootContainer(containerId);
    else openRootContainerDialog(containerId);
  }
  return true;
}

function copySharedRootToState(root, { targetLayoutId = selectedSharedTargetLayoutId(), changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const id = preserveSource
    ? `container-shared-${root.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  idMap?.containers?.set(root.id, id);
  state.containers[id] = {
    id,
    name: root.name,
    parentId: null,
    childIds: [],
    itemIds: [],
    order: [],
    weight: Number(root.weightGrams || 0),
    volume: Number(root.volumeLiters || 0),
    color: "",
    location: defaultRootContainerLocation(state),
    note: root.description || "",
    photos: sharedGearPhotos(root, changedAt),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.containers[id], "container", root.id, "legacy-shared");
  if (preserveSource) state.containers[id].sharedSourceId = root.id;
  (root.items || []).forEach((item) => copySharedItemToState(item, { containerId: id, changedAt, idMap, preserveSource }));
  state.collapsedContainers[id] = false;
  if (targetLayoutId && state.layouts[targetLayoutId]) {
    const layout = state.layouts[targetLayoutId];
    layout.rootContainerIds = [...(layout.rootContainerIds || []), id];
    layout.arrangement = createLayoutArrangementFromCurrentState(state, layout.rootContainerIds);
    touchLayout(targetLayoutId, changedAt);
  }
  return id;
}

function copySharedItemToState(item, { containerId = "", changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const id = preserveSource
    ? `item-shared-${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  idMap?.items?.set(item.id, id);
  state.items[id] = {
    id,
    name: item.name,
    weight: Number(item.weightGrams || 0),
    quantity: 1,
    location: defaultRootContainerLocation(state),
    category: "Прочее",
    categories: ["Прочее"],
    containerId,
    note: item.description || "",
    photos: sharedGearPhotos(item, changedAt),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.items[id], "item", item.id, "legacy-shared");
  if (preserveSource) state.items[id].sharedSourceId = item.id;
  if (!state.categories.includes("Прочее")) state.categories.push("Прочее");
  if (containerId && state.containers[containerId]) {
    const container = state.containers[containerId];
    container.itemIds.push(id);
    container.order.push({ type: "item", id });
    touchContainer(containerId, changedAt);
  }
  return id;
}

function sharedGearPhotos(gear, changedAt = nowIso()) {
  if (!gear.imageUrl) return [];
  return [{
    id: `shared-photo-${gear.id}`,
    localId: "",
    status: "synced",
    url: gear.imageUrl,
    thumbUrl: gear.imageUrl,
    fileName: "",
    type: "",
    size: 0,
    width: 0,
    height: 0,
    createdAt: changedAt,
    updatedAt: changedAt,
    error: ""
  }];
}

async function openHistoryDialog() {
  if (isForcedOffline()) {
    showToast("История недоступна в офлайн-режиме.", "error");
    return;
  }
  if (!currentUser) {
    showToast("История доступна после входа.", "error");
    return;
  }
  if (!canOpenAdminPublishedEdit()) activeHistorySource = "private";
  expandedHistoryRecordId = "";
  expandedHistoryGroups = {};
  historyComparisonState = null;
  renderHistorySourceControls();
  openModalDialog(refs.historyDialog);
  refreshHistoryDialog();
}

function renderHistorySourceControls() {
  if (!refs.historySourceControls) return;
  const admin = canOpenAdminPublishedEdit();
  refs.historySourceControls.hidden = !admin;
  if (!admin) return;
  if (!["private", "demo", "shared"].includes(activeHistorySource)) activeHistorySource = "private";
  refs.historySourceTabs?.querySelectorAll("[data-history-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historySource === activeHistorySource);
  });
  if (refs.historySharedField) refs.historySharedField.hidden = activeHistorySource !== "shared";
  if (refs.historySharedSelect) {
    const sharedOptions = currentSharedLayouts();
    const selected = refs.historySharedSelect.value ||
      (activeReadOnlyLayoutId() !== DEMO_SHARED_LAYOUT_ID ? activeReadOnlyLayoutId() : "") ||
      sharedOptions[0]?.id ||
      "";
    fillSelect(refs.historySharedSelect, sharedOptions.map((layout) => [layout.id, layout.name]), selected);
  }
}

async function refreshHistoryDialog() {
  renderHistorySourceControls();
  refs.historyStatus.className = "dialog-status";
  refs.historyStatus.textContent = "Загружаю историю...";
  refs.historyList.innerHTML = "";
  try {
    const source = activeHistorySource;
    const [records, comparisonState] = await Promise.all([
      loadRemoteHistory(source),
      loadCurrentHistoryComparisonState(source).catch(() => null)
    ]);
    if (source !== activeHistorySource) return;
    historyRecords = records;
    historyComparisonState = comparisonState;
    renderHistoryRecords(historyRecords);
  } catch (error) {
    refs.historyStatus.className = "dialog-status error";
    refs.historyStatus.textContent = `Не удалось загрузить историю: ${error.message}`;
  }
}

async function loadCurrentHistoryComparisonState(source = activeHistorySource) {
  if (source === "demo") {
    const payload = await fetchPublishedListStateById(demoPublicListIdForLanguage());
    return normalizePublishedStatePayload(payload);
  }
  if (source === "shared") {
    const sharedId = refs.historySharedSelect?.value || currentSharedLayouts()[0]?.id || "";
    if (!sharedId) return null;
    const payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId));
    return normalizePublishedStatePayload(payload);
  }
  return normalizeRemoteState(serializeState({ forSync: true }));
}

async function loadRemoteHistory(source = "private") {
  let path = "";
  if (source === "demo") {
    path = demoAdminPathForLanguage("/history");
  } else if (source === "shared") {
    const sharedId = refs.historySharedSelect?.value || currentSharedLayouts()[0]?.id || "";
    if (!sharedId) throw new Error("Нет shared-укладок для истории.");
    path = `/bike-packing/admin/shared-layouts/${encodeURIComponent(sharedId)}/history`;
  } else {
    const listId = await ensureCurrentPackingListId();
    try {
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/history`, {
        timeoutMs: LIST_API_TIMEOUT_MS
      });
      const records = Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.history)
          ? data.history
          : [];
      return sortHistoryRecords(records).map((record) => ({
        ...record,
        listId: record.listId || record.list_id || listId,
        source: record.source || "bike_packing_list_history"
      }));
    } catch (error) {
      throw new Error(`Новая история списка недоступна: ${apiErrorMessage(error)}`);
    }
  }
  const data = await apiFetch(path);
  const records = Array.isArray(data.records)
    ? data.records
    : Array.isArray(data.history)
      ? data.history
      : [];
  return sortHistoryRecords(records);
}

function sortHistoryRecords(records) {
  return records
    .filter((record) => record && typeof record === "object")
    .sort((a, b) => {
      const byDate = timeValue(b.createdAt || b.created_at) - timeValue(a.createdAt || a.created_at);
      if (byDate) return byDate;
      return Number(b.id || 0) - Number(a.id || 0);
    });
}

function renderHistoryRecords(records) {
  if (!records.length) {
    refs.historyStatus.className = "dialog-status";
    refs.historyStatus.textContent = `${historySourceLabel()} · истории пока нет. Она появится после нескольких успешных сохранений.`;
    refs.historyList.innerHTML = "";
    return;
  }
  const groups = groupHistoryRecords(records);
  refs.historyStatus.className = "dialog-status success";
  refs.historyStatus.textContent = `${historySourceLabel()} · найдено версий: ${records.length} · укладок: ${groups.length}`;
  refs.historyList.innerHTML = groups.map((group, groupIndex) => {
    const expanded = expandedHistoryGroups[group.key] ?? groupIndex === 0;
    const latestAt = formatHistoryDateTime(group.records[0]?.createdAt || group.records[0]?.created_at);
    return `
      <details class="history-group" data-history-group="${escapeHtml(group.key)}"${expanded ? " open" : ""}>
        <summary class="history-group-summary">
          <span>
            <strong>${escapeHtml(group.title)}</strong>
            <small>${group.records.length} ${pluralRu(group.records.length, "версия", "версии", "версий")}${latestAt ? ` · последняя ${escapeHtml(latestAt)}` : ""}</small>
          </span>
        </summary>
        <div class="history-group-records">
          ${group.records.map((record, index) => renderHistoryRecordArticle(record, index, group.records)).join("")}
        </div>
      </details>
    `;
  }).join("");
  refs.historyList.querySelectorAll("[data-history-group]").forEach((groupElement) => {
    groupElement.addEventListener("toggle", () => {
      expandedHistoryGroups[groupElement.dataset.historyGroup || ""] = groupElement.open;
    });
  });
  refs.historyList.querySelectorAll("[data-history-record]").forEach((recordElement) => {
    recordElement.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const key = recordElement.dataset.historyRecord || "";
      expandedHistoryRecordId = expandedHistoryRecordId === key ? "" : key;
      renderHistoryRecords(historyRecords);
    });
  });
  refs.historyList.querySelectorAll("[data-restore-history]").forEach((button) => {
    button.addEventListener("click", () => restoreHistoryRecord(button.dataset.restoreHistory));
  });
}

function groupHistoryRecords(records) {
  const groups = new Map();
  records.forEach((record) => {
    const payload = historyRecordState(record);
    const title = historyPayloadTitle(payload, "Без названия");
    const key = title || "Без названия";
    if (!groups.has(key)) groups.set(key, { key, title: key, records: [] });
    groups.get(key).records.push(record);
  });
  return Array.from(groups.values());
}

function pluralRu(count, one, few, many) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function renderHistoryRecordArticle(record, index, records) {
  const recordKey = historyRecordKey(record, index);
  const payload = historyRecordState(record);
  const summary = summarizeHistoryPayload(payload);
  const createdAt = formatHistoryDateTime(record.createdAt || record.created_at);
  const sourceAt = formatHistoryDateTime(record.sourceUpdatedAt || record.source_updated_at);
  const device = record.sourceDeviceName || record.source_device_name || "устройство не указано";
  const expanded = expandedHistoryRecordId === recordKey;
  return `
    <article class="history-record${expanded ? " expanded" : ""}" data-history-record="${escapeHtml(recordKey)}">
      <div class="history-record-main">
        <strong>${escapeHtml(createdAt || "без даты")}</strong>
        <p>${escapeHtml(summary)}</p>
        <small>${escapeHtml(device)}${sourceAt ? ` · изменение: ${escapeHtml(sourceAt)}` : ""}</small>
      </div>
      <button type="button" class="ghost" data-restore-history="${escapeHtml(String(record.id))}">${activeHistorySource === "private" ? "Восстановить" : "Опубликовать"}</button>
      ${expanded ? renderHistoryRecordComparison(record, index, records) : ""}
    </article>
  `;
}

function historyRecordState(record, source = activeHistorySource) {
  const payload =
    record?.payload ||
    record?.state ||
    record?.assembledState ||
    record?.assembled_state ||
    record?.serverPayload ||
    record?.record?.payload ||
    record?.record?.state ||
    record?.record?.assembledState ||
    record?.record?.assembled_state;
  return source === "demo" || source === "shared"
    ? normalizePublishedStatePayload(payload)
    : normalizeRemoteState(payload);
}

function historyRecordKey(record, index = 0) {
  return String(record?.id ?? record?.createdAt ?? record?.created_at ?? index);
}

function renderHistoryRecordComparison(record, index, records) {
  const selectedState = historyRecordState(record);
  const targetState = index === 0
    ? currentHistoryComparisonState()
    : historyRecordState(records[index - 1]);
  const targetLabel = index === 0 ? "текущей версии" : "более новой версии";
  if (!selectedState || !targetState) {
    return `<div class="history-record-details"><p class="history-diff-empty">Не удалось сравнить payload этой записи.</p></div>`;
  }
  const diff = buildHistoryStateDiff(selectedState, targetState);
  const sections = [
    renderHistoryDiffSection("Вещи", diff.items),
    renderHistoryDiffSection("Сумки и места", diff.containers),
    renderHistoryDiffSection("Укладки", diff.layouts),
    renderHistoryDiffSection("Собранность", diff.packed),
    renderHistoryDiffSection("Справочники и настройки", diff.settings)
  ].filter(Boolean).join("");
  return `
    <div class="history-record-details">
      <h3>Отличия от ${escapeHtml(targetLabel)}</h3>
      ${sections || `<p class="history-diff-empty">Отличий не найдено.</p>`}
    </div>
  `;
}

function currentHistoryComparisonState() {
  if (activeHistorySource === "demo") {
    return historyComparisonState ? normalizePublishedStatePayload(historyComparisonState) : null;
  }
  if (activeHistorySource === "shared") {
    return historyComparisonState ? normalizePublishedStatePayload(historyComparisonState) : null;
  }
  return historyComparisonState
    ? normalizeRemoteState(historyComparisonState)
    : normalizeRemoteState(serializeState({ forSync: true }));
}

function buildHistoryStateDiff(fromState, toState) {
  return {
    items: diffHistoryMap("item", fromState.items || {}, toState.items || {}, fromState, toState),
    containers: diffHistoryMap("container", fromState.containers || {}, toState.containers || {}, fromState, toState),
    layouts: diffHistoryMap("layout", fromState.layouts || {}, toState.layouts || {}, fromState, toState),
    packed: diffHistoryPacked(fromState.packedItems || {}, toState.packedItems || {}, fromState, toState),
    settings: diffHistorySettings(fromState, toState)
  };
}

function diffHistoryMap(type, fromMap, toMap, fromState, toState) {
  const added = [];
  const removed = [];
  const changed = [];
  const ids = new Set([...Object.keys(fromMap || {}), ...Object.keys(toMap || {})]);
  ids.forEach((id) => {
    const before = fromMap?.[id];
    const after = toMap?.[id];
    if (!before && after) {
      added.push(historyEntityLine(type, id, after, toState, "added"));
      return;
    }
    if (before && !after) {
      removed.push(historyEntityLine(type, id, before, fromState, "removed"));
      return;
    }
    const beforeValue = historyComparableEntity(type, before);
    const afterValue = historyComparableEntity(type, after);
    if (!sameJson(beforeValue, afterValue)) {
      changed.push({
        title: historyEntityTitle(type, after || before, toState),
        details: historyChangedFields(type, beforeValue, afterValue, fromState, toState)
      });
    }
  });
  return { added, removed, changed };
}

function historyComparableEntity(type, value) {
  const comparable = comparableValueForMerge(type, value) || {};
  const cloned = JSON.parse(JSON.stringify(comparable));
  Object.keys(cloned).forEach((key) => {
    if (isConflictMetaField(key)) delete cloned[key];
  });
  return cloned;
}

function historyEntityLine(type, id, value, targetState, mode) {
  const title = historyEntityTitle(type, value, targetState) || id;
  const meta = [];
  if (type === "item") {
    if (value?.containerId) meta.push(historyContainerName(targetState, value.containerId));
    if (itemCategories(value).length) meta.push(itemCategories(value).join(", "));
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "container") {
    const count = Array.isArray(value?.itemIds) ? value.itemIds.length : 0;
    if (count) meta.push(`${count} вещей`);
    if (Number(value?.weight || 0)) meta.push(formatWeight(value.weight));
  }
  if (type === "layout") {
    const roots = Array.isArray(value?.rootContainerIds) ? value.rootContainerIds.length : 0;
    meta.push(`${roots} корневых сумок`);
  }
  return {
    title,
    details: meta.filter(Boolean).join(" · "),
    mode
  };
}

function historyEntityTitle(type, value, targetState) {
  if (!value) return "";
  if (type === "item" || type === "container" || type === "layout") return value.name || value.id || "";
  return String(value.id || "");
}

function historyContainerName(targetState, containerId) {
  const id = String(containerId || "");
  if (!id) return "вне укладки";
  return targetState?.containers?.[id]?.name || id;
}

function historyChangedFields(type, beforeValue, afterValue, fromState, toState) {
  const definitions = conflictDiffFieldDefinitions({ type });
  const rows = definitions
    .filter(([key]) => !sameJson(beforeValue?.[key], afterValue?.[key]))
    .map(([key, label, format]) => {
      const before = formatHistoryDiffValue(beforeValue?.[key], format, fromState);
      const after = formatHistoryDiffValue(afterValue?.[key], format, toState);
      return `${label}: ${before} -> ${after}`;
    });
  const knownKeys = new Set(definitions.map(([key]) => key));
  Object.keys({ ...(beforeValue || {}), ...(afterValue || {}) })
    .filter((key) => !knownKeys.has(key) && !isConflictMetaField(key))
    .filter((key) => !sameJson(beforeValue?.[key], afterValue?.[key]))
    .forEach((key) => rows.push(`${key}: ${formatCompactJson(beforeValue?.[key])} -> ${formatCompactJson(afterValue?.[key])}`));
  return rows;
}

function formatHistoryDiffValue(value, format = "", targetState = state) {
  if (value == null || value === "") return "пусто";
  if (format === "weight") return formatWeight(parseWeightInput(value));
  if (format === "list") return Array.isArray(value) ? value.filter(Boolean).join(", ") || "пусто" : String(value);
  if (format === "container") return historyContainerName(targetState, value);
  if (format === "photos") return Array.isArray(value) ? `${value.length} фото` : (value ? "есть" : "нет");
  if (format === "count") return Array.isArray(value) ? `${value.length}` : formatCompactJson(value);
  if (format === "arrangement") return formatArrangementConflictValue(value);
  if (format === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "пусто";
  if (typeof value === "object") return formatCompactJson(value);
  return String(value);
}

function diffHistoryPacked(fromPacked, toPacked, fromState, toState) {
  const changed = [];
  const ids = new Set([...Object.keys(fromPacked || {}), ...Object.keys(toPacked || {})]);
  ids.forEach((itemId) => {
    const before = Boolean(fromPacked?.[itemId]);
    const after = Boolean(toPacked?.[itemId]);
    if (before === after) return;
    const item = toState.items?.[itemId] || fromState.items?.[itemId] || { name: itemId };
    changed.push({
      title: item.name || itemId,
      details: [`${before ? "собрано" : "не собрано"} -> ${after ? "собрано" : "не собрано"}`]
    });
  });
  return { added: [], removed: [], changed };
}

function diffHistorySettings(fromState, toState) {
  const changed = [];
  const fields = [
    ["locations", "Места хранения", "list"],
    ["categories", "Категории", "list"],
    ["showItemMeta", "Метаданные вещей", "boolean"],
    ["collectionMode", "Режим сбора", "boolean"],
    ["showOnlyUnpacked", "Только несобранное", "boolean"],
    ["activeLayoutId", "Активная укладка", ""]
  ];
  fields.forEach(([key, label, format]) => {
    if (sameJson(fromState?.[key], toState?.[key])) return;
    changed.push({
      title: label,
      details: [`${formatHistoryDiffValue(fromState?.[key], format, fromState)} -> ${formatHistoryDiffValue(toState?.[key], format, toState)}`]
    });
  });
  return { added: [], removed: [], changed };
}

function renderHistoryDiffSection(title, diff) {
  if (!diff) return "";
  const added = diff.added || [];
  const removed = diff.removed || [];
  const changed = diff.changed || [];
  if (!added.length && !removed.length && !changed.length) return "";
  return `
    <section class="history-diff-section">
      <h4>${escapeHtml(title)}</h4>
      ${renderHistoryDiffGroup("Добавлено", added, "added")}
      ${renderHistoryDiffGroup("Удалено", removed, "removed")}
      ${renderHistoryDiffGroup("Изменено", changed, "changed")}
    </section>
  `;
}

function renderHistoryDiffGroup(title, rows, mode) {
  if (!rows?.length) return "";
  return `
    <div class="history-diff-group ${escapeHtml(mode)}">
      <strong>${escapeHtml(title)}: ${rows.length}</strong>
      <ul>
        ${rows.map((row) => `
          <li>
            <span>${escapeHtml(row.title || "без названия")}</span>
            ${Array.isArray(row.details)
              ? `<small>${row.details.map((detail) => escapeHtml(detail)).join("<br>")}</small>`
              : row.details
                ? `<small>${escapeHtml(row.details)}</small>`
                : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function historySourceLabel(source = activeHistorySource) {
  if (source === "demo") return "Демо";
  if (source === "shared") {
    const layout = findSharedLayout(refs.historySharedSelect?.value);
    return layout?.name ? `Shared · ${layout.name}` : "Shared";
  }
  return "Моя история";
}

function summarizeHistoryPayload(payload) {
  if (!payload) return "версия не распознана";
  const itemCount = Object.keys(payload.items || {}).length;
  const containerCount = Object.keys(payload.containers || {}).length;
  const layout = payload.layouts?.[payload.activeLayoutId];
  const layoutName = layout?.name ? ` · ${layout.name}` : "";
  return `${itemCount} вещей · ${containerCount} контейнеров${layoutName}`;
}

function formatHistoryDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function restoreHistoryRecord(recordId) {
  const record = historyRecords.find((item) => String(item.id) === String(recordId));
  const restoredState = historyRecordState(record);
  if ((activeHistorySource === "demo" || activeHistorySource === "shared") && record && restoredState) {
    await publishPublicHistoryRecord(record, restoredState);
    return;
  }
  if (!record || !restoredState) {
    showToast("Не удалось прочитать выбранную версию.", "error");
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Восстановить версию?",
    text: `Будет восстановлена версия от ${formatHistoryDateTime(record.createdAt || record.created_at) || "неизвестной даты"}. Текущая версия перед этим останется в истории.`,
    okText: "Восстановить",
    cancelText: "Отмена"
  });
  if (!confirmed) return;
  refs.historyDialog.close();
  updateSyncUi("Восстанавливаю версию на сервере...");
  try {
    await restorePrivateHistoryRecordOnServer(record);
    showToast("Версия восстановлена.", "success");
  } catch (error) {
    updateSyncUi(`Не удалось восстановить версию: ${error.message}`);
    showToast(`Не удалось восстановить версию: ${error.message}`, "error");
  }
}

async function restorePrivateHistoryRecordOnServer(record) {
  const historyId = Number(record?.id || 0);
  if (!Number.isFinite(historyId) || historyId <= 0) {
    throw new Error("Не удалось определить ID версии из истории.");
  }
  const source = String(record?.source || "").trim();
  if (source && source !== "bike_packing_list_history") {
    throw new Error("Эта версия загружена из старой истории и не может быть восстановлена новой ручкой списка.");
  }
  const currentListId = await ensureCurrentPackingListId();
  const historyListId = String(record?.listId || record?.list_id || "").trim();
  const listId = historyListId || currentListId;
  if (!listId) {
    throw new Error("Не удалось определить список для восстановления версии.");
  }
  if (!syncMeta.stateRevision) {
    const currentRecord = await fetchRemoteListDetailRecord(listId);
    rememberRemoteIntegrityMeta(currentRecord);
    saveSyncMeta();
  }
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/history/${encodeURIComponent(historyId)}/restore`, {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      baseStateRevision: syncMeta.stateRevision ?? null,
      stateRevision: syncMeta.stateRevision ?? null
    })
  });
  const recordData = normalizeRemoteListRecord(data);
  rememberCurrentPackingListRecord(recordData);
  const restoredState = normalizeRemoteState(recordData.payload);
  if (!restoredState) throw new Error("Сервер вернул пустую или повреждённую версию.");
  const integrityMeta = stateIntegrityMetaFromResponse(recordData, data);
  const updatedAt = remoteUpdatedAt(recordData) || data?.serverUpdatedAt || integrityMeta.updatedAt || nowIso();
  if (!applyRemoteState(restoredState, updatedAt, integrityMeta, recordData.payload, { allowDestructive: true })) {
    throw new Error("Не удалось применить версию с сервера.");
  }
}

function selectedHistoryPublishedTarget() {
  if (activeHistorySource === "demo") return { type: "demo", sharedId: "", language: uiLanguage };
  if (activeHistorySource !== "shared") return null;
  const sharedId = refs.historySharedSelect?.value || currentSharedLayouts()[0]?.id || "";
  return sharedId ? { type: "shared", sharedId } : null;
}

function historyPayloadTitle(payload, fallback = "") {
  const layout = payload?.layouts?.[payload.activeLayoutId] || Object.values(payload?.layouts || {})[0];
  return String(layout?.name || fallback || "").trim();
}

async function publishPublicHistoryRecord(record, payload) {
  if (!canOpenAdminPublishedEdit()) {
    showToast("Публиковать версии demo/shared может только админ.", "error");
    return;
  }
  const target = selectedHistoryPublishedTarget();
  if (!target) {
    showToast("Не удалось определить public-укладку для истории.", "error");
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Опубликовать версию?",
    text: `Будет опубликована версия ${historySourceLabel()} от ${formatHistoryDateTime(record.createdAt || record.created_at) || "неизвестной даты"}. Текущая public-версия перед этим должна остаться в истории.`,
    okText: "Опубликовать",
    cancelText: "Отмена"
  });
  if (!confirmed) return;
  const path = target.type === "demo"
    ? demoAdminStatePathForLanguage(target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
  refs.historyDialog.close();
  updateSyncUi(target.type === "demo" ? "Публикую demo-версию из истории..." : "Публикую shared-версию из истории...");
  await apiFetch(path, {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      title: record.title || record.listTitle || historyPayloadTitle(payload, historySourceLabel()),
      description: record.description || "",
      payload
    })
  });
  if (target.type === "demo") {
    setDemoStatePayloadForLanguage(target.language || uiLanguage, payload);
  } else {
    const sharedLayout = findSharedLayout(target.sharedId);
    if (sharedLayout) sharedLayout.statePayload = payload;
  }
  refreshPublishedLayoutView(target);
  updateSyncUi();
  showToast("Версия из истории опубликована.", "success");
}

function switchView(view) {
  if (getCurrentView() === "packing" && view !== "packing") {
    capturePackingScroll();
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  refs.packingView.classList.toggle("hidden", view !== "packing");
  refs.itemsView.classList.toggle("hidden", view !== "items");
  refs.bagsView.classList.toggle("hidden", view !== "bags");
  refs.settingsView.classList.toggle("hidden", view !== "settings");
  renderFilters();
  renderSummary();
  updateViewScopedControls(view);
  updateFilterNavigationUi();
  if (view === "packing") {
    requestAnimationFrame(() => restorePendingPackingScroll(refs.packingView.querySelector(".board")));
  }
  syncFixedScrollbarVisibility();
}

function render() {
  ensureGuestPublicScope();
  capturePackingScroll();
  document.body.classList.toggle("shared-layout-view", isSharedLayoutView());
  renderFilters();
  renderSummary();
  renderPacking();
  renderItems();
  renderBags();
  renderSettings();
  updateViewScopedControls();
  updateFilterNavigationUi();
  scheduleFixedScrollbarRefresh();
  hydrateItemPhotos(document);
}

function getCurrentView() {
  return document.querySelector(".tab.active")?.dataset.view || "packing";
}

function updateViewScopedControls(view = getCurrentView()) {
  const sharedView = isSharedLayoutView();
  const filtersVisible = view === "packing" || view === "items" || view === "bags";
  const categoryVisible = view === "packing" || view === "items";
  const stableMobileControls = shouldKeepScopedControlsStable();
  document.querySelectorAll("[data-main-filter-control]").forEach((element) => {
    const isCollectionActions = element === refs.collectionActions;
    const isCategoryFilter = element === refs.categoryFilterLabel;
    const visible = isCollectionActions
      ? !sharedView && view === "packing" && state.collectionMode
      : isCategoryFilter
        ? categoryVisible
        : filtersVisible;
    const keepSpace = isCollectionActions
      ? false
      : isCategoryFilter
        ? view === "bags"
        : stableMobileControls;
    setScopedControlState(element, visible, keepSpace);
  });
  setScopedControlState(refs.metaToggleBtn, view === "packing" || view === "items" || view === "bags", false);
  refs.summary.classList.toggle("scoped-control-muted", view === "settings");
  refs.summary.setAttribute("aria-disabled", String(view === "settings"));
  refs.filterNav.hidden = !filtersVisible || !isFilterContextActive();
  requestAnimationFrame(updateCompactStickyControls);
}

function shouldKeepScopedControlsStable() {
  return window.matchMedia?.("(max-width: 520px)")?.matches;
}

function updateStickyControlsHeight() {
  const height = shouldUseStickyFilterControls() && refs.controls && !refs.controls.hidden
    ? Math.ceil(refs.controls.getBoundingClientRect().height)
    : 0;
  document.documentElement.style.setProperty("--sticky-controls-height", `${height}px`);
}

function updateCompactStickyControls() {
  const searchEditing = shouldKeepScopedControlsStable() && isSearchInputEditing();
  const sticky = shouldUseStickyFilterControls();
  const compact = sticky
    && refs.controls
    && !refs.controls.hidden
    && !searchEditing
    && shouldKeepScopedControlsStable()
    && window.scrollY > 0
    && refs.controls.getBoundingClientRect().top <= 0;
  document.body.classList.toggle("filter-sticky-controls", Boolean(sticky));
  document.body.classList.toggle("compact-sticky-controls", Boolean(compact));
  document.body.classList.toggle("search-input-focused", Boolean(searchEditing));
  updateStickyControlsHeight();
}

function shouldUseStickyFilterControls() {
  if (!hasActiveContentFilter()) return false;
  return getCurrentView() === "packing" || getCurrentView() === "items" || getCurrentView() === "bags";
}

function isSearchInputEditing() {
  return document.activeElement === refs.searchInput;
}

function updateSearchFocusState() {
  requestAnimationFrame(updateCompactStickyControls);
}

function preserveSearchBlurViewport() {
  const lock = captureSearchBlurViewportLock();
  if (!lock) {
    updateSearchFocusState();
    return;
  }
  const restore = () => restoreSearchBlurViewportLock(lock);
  requestAnimationFrame(restore);
  window.setTimeout(restore, 80);
  window.setTimeout(restore, 180);
  window.setTimeout(restore, 360);
}

function captureSearchBlurViewportLock() {
  const view = getCurrentView();
  if (!shouldKeepScopedControlsStable() || !["packing", "items"].includes(view) || !isFilterContextActive()) return null;
  const target = getFilterMatchElements()[filterMatchIndex];
  if (!target || target.offsetParent === null) return null;
  const rect = target.getBoundingClientRect();
  const stickyBottom = stickyViewportBottom();
  if (rect.bottom <= stickyBottom || rect.top >= window.innerHeight) return null;
  const board = view === "packing" ? refs.packingView.querySelector(".board") : null;
  return {
    view,
    element: target,
    top: rect.top,
    boardLeft: board?.scrollLeft || 0,
    windowX: window.scrollX || 0
  };
}

function restoreSearchBlurViewportLock(lock) {
  updateCompactStickyControls();
  if (!lock.element?.isConnected) return;
  const board = lock.view === "packing" ? refs.packingView.querySelector(".board") : null;
  if (board) board.scrollLeft = lock.boardLeft;
  const rect = lock.element.getBoundingClientRect();
  window.scrollTo({
    left: lock.windowX,
    top: Math.max(0, window.scrollY + rect.top - lock.top),
    behavior: "auto"
  });
  syncFixedScrollbarVisibility();
}

function setScopedControlState(element, active, keepSpace) {
  if (!element) return;
  if (keepSpace) {
    element.hidden = false;
    element.classList.toggle("scoped-control-muted", !active);
    element.setAttribute("aria-disabled", String(!active));
    return;
  }
  element.classList.remove("scoped-control-muted");
  element.removeAttribute("aria-disabled");
  element.hidden = !active;
}

function renderPreservingPackingScroll() {
  const board = refs.packingView.querySelector(".board");
  if (board && !refs.packingView.classList.contains("hidden")) {
    capturePackingScroll();
  }
  render();
}

function renderInitialLocalFallbackIfNeeded() {
  if (!initialRemoteLoadPending) return false;
  initialRemoteLoadPending = false;
  repairActiveEmptyAdminDemoDraft();
  clearActiveAdminDemoStateOnStartup();
  renderPreservingPackingScroll();
  return true;
}

function renderFilters() {
  const personalLayouts = canUsePrivateState()
    ? Object.values(state.layouts || {}).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId)
    : Object.values(state.layouts || {}).filter((layout) => layout?.[GUEST_DEMO_COPY_FLAG]);
  const readonlyLayoutId = activeReadOnlyLayoutId();
  const activeLayout = state.layouts?.[state.activeLayoutId];
  const selectedLayoutValue = isReadOnlyStateScope()
    ? (readonlyLayoutId === DEMO_SHARED_LAYOUT_ID ? DEMO_LAYOUT_SELECT_VALUE : `shared:${readonlyLayoutId}`)
    : activeLayout?.adminDemo
      ? DEMO_LAYOUT_SELECT_VALUE
      : activeLayout?.adminSharedSourceId
        ? `shared:${activeLayout.adminSharedSourceId}`
    : state.activeLayoutId;
  const layoutOptions = [
    [DEMO_LAYOUT_SELECT_VALUE, t("demo.layoutName"), "demo"],
    ...personalLayouts.map((layout) => [layout.id, layout.name, "personal"]),
    ...(linkedSharedListLayout ? [[`shared:${linkedSharedListLayout.id}`, `${t("shared.prefix")}: ${linkedSharedListLayout.name}`, "shared"]] : []),
    ...currentSharedLayouts().map((layout) => [`shared:${layout.id}`, `${t("shared.prefix")}: ${layout.name}`, "shared"])
  ];
  fillSelect(refs.layoutSelect, layoutOptions, selectedLayoutValue);
  refs.layoutSelect.classList.toggle("layout-select-demo", selectedLayoutValue === DEMO_LAYOUT_SELECT_VALUE);
  refs.layoutSelect.classList.toggle("layout-select-shared", String(selectedLayoutValue).startsWith("shared:"));
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  fillSelect(refs.layoutCopyFrom, personalLayouts.map((layout) => [layout.id, layout.name]), state.activeLayoutId);
  selectedCategoryFilters = selectedCategoryFilters.filter((category) => state.categories.includes(category));
  const locationOptions = getAvailableLocationFilterOptions();
  fillSelect(refs.locationFilter, [["", t("filters.allPlaces")], ...locationOptions.map((loc) => [loc, loc])], refs.locationFilter.value);
  updateCategoryFilterButton();
  fillSelect(refs.itemLocation, state.locations.map((loc) => [loc, loc]));
  renderItemCategoryPicker();
  refs.clearSearchBtn.hidden = !refs.searchInput.value.trim();
  const locationFilterActive = Boolean(refs.locationFilter.value);
  const categoryFilterActive = selectedCategoryFilters.length > 0;
  refs.clearLocationFilterBtn.hidden = !locationFilterActive;
  refs.clearCategoryFilterBtn.hidden = !categoryFilterActive;
  refs.clearLocationFilterBtn.parentElement.classList.toggle("filter-field-active", locationFilterActive);
  refs.clearCategoryFilterBtn.parentElement.classList.toggle("filter-field-active", categoryFilterActive);
  updateFilterHighlights();
  updateMetaToggle();
  updateFilterContextToggle();
  refs.collectionModeBtn.closest(".collection-panel")?.classList.toggle("collection-panel-active", state.collectionMode);
  refs.collectionModeBtn.textContent = state.collectionMode ? "✓ Сбор включен" : "Режим сбора";
  refs.collectionModeBtn.classList.toggle("active", state.collectionMode);
  refs.unpackedOnlyBtn.hidden = !state.collectionMode;
  refs.unpackedOnlyBtn.textContent = state.showOnlyUnpacked ? "Фильтр: не собрано" : "Показать не собрано";
  refs.unpackedOnlyBtn.classList.toggle("active", state.showOnlyUnpacked);
  refs.unpackAllBtn.hidden = !state.collectionMode || !Object.values(state.packedItems || {}).some(Boolean);
}

function toggleCollectionMode() {
  state.collectionMode = !state.collectionMode;
  if (!state.collectionMode) state.showOnlyUnpacked = false;
  saveLocalUiState();
  render();
}

function handleSearchInput(event) {
  refs.clearSearchBtn.hidden = !refs.searchInput.value.trim();
  updateFilterHighlights();
  if (searchRenderTimer) window.clearTimeout(searchRenderTimer);
  const isDeleting = String(event?.inputType || "").startsWith("delete");
  searchRenderTimer = window.setTimeout(() => {
    searchRenderTimer = null;
    suppressNextFilterJump = isDeleting;
    render();
    scheduleSearchContextCommit({ jump: !isDeleting });
  }, isDeleting ? SEARCH_RENDER_DEBOUNCE_MS + 180 : SEARCH_RENDER_DEBOUNCE_MS);
}

function applySearchInputNow() {
  if (searchRenderTimer) {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = null;
  }
  render();
  scheduleSearchContextCommit();
}

function scheduleSearchContextCommit({ jump = true } = {}) {
  if (searchContextCommitTimer) {
    window.clearTimeout(searchContextCommitTimer);
    searchContextCommitTimer = null;
  }
  if (!shouldKeepScopedControlsStable() || !state.showFilterContext || !hasActiveContentFilter()) return;
  searchContextCommitTimer = window.setTimeout(() => {
    searchContextCommitTimer = null;
    filterMatchIndex = 0;
    pendingFilterJump = Boolean(jump);
    updateFilterNavigationUi();
  }, 520);
}

function commitSearchInputForNavigation() {
  if (!shouldKeepScopedControlsStable()) return;
  if (document.activeElement === refs.searchInput) {
    refs.searchInput.blur();
  }
}

function toggleItemMeta() {
  state.showItemMeta = !state.showItemMeta;
  saveLocalUiState();
  render();
}

function toggleFilterContext() {
  const next = !state.showFilterContext;
  state.showFilterContext = next;
  filterMatchIndex = 0;
  filterMatchSignature = "";
  pendingFilterJump = next && hasActiveContentFilter();
  saveLocalUiState();
  render();
}

function updateMetaToggle() {
  const label = state.showItemMeta ? "Скрыть метки и фото" : "Показать метки и фото";
  refs.metaToggleBtn.classList.toggle("active", state.showItemMeta);
  refs.metaToggleBtn.setAttribute("aria-label", label);
  refs.metaToggleBtn.setAttribute("aria-pressed", String(state.showItemMeta));
  refs.metaToggleBtn.title = label;
}

function updateFilterContextToggle() {
  const label = state.showFilterContext ? "Фильтр с контекстом включен" : "Показывать контекст фильтра";
  refs.filterContextBtn.classList.toggle("active", state.showFilterContext);
  refs.filterContextBtn.setAttribute("aria-label", label);
  refs.filterContextBtn.setAttribute("aria-pressed", String(state.showFilterContext));
  refs.filterContextBtn.title = label;
}

function updateFilterHighlights() {
  const searchActive = Boolean(refs.searchInput.value.trim());
  const locationActive = Boolean(refs.locationFilter.value);
  const categoryActive = selectedCategoryFilters.length > 0;
  refs.searchInput.classList.toggle("filter-active", searchActive);
  refs.locationFilter.classList.toggle("filter-active", locationActive);
  refs.categoryFilter.classList.toggle("filter-active", categoryActive);
  refs.searchFilterLabel.classList.toggle("filter-label-active", searchActive);
  refs.locationFilterLabel.classList.toggle("filter-label-active", locationActive);
  refs.categoryFilterLabel.classList.toggle("filter-label-active", categoryActive);
}

function clearSearch() {
  if (searchRenderTimer) {
    window.clearTimeout(searchRenderTimer);
    searchRenderTimer = null;
  }
  if (searchContextCommitTimer) {
    window.clearTimeout(searchContextCommitTimer);
    searchContextCommitTimer = null;
  }
  if (!state.showFilterContext) {
    refs.searchInput.value = "";
    renderAndScrollToTop(refs.searchInput);
    return;
  }
  const viewport = captureViewportSnapshot();
  const anchor = captureVisibleContentAnchor();
  keepAnchorContainersOpen(anchor);
  refs.searchInput.value = "";
  render();
  restoreViewportSnapshot(viewport, refs.searchInput, anchor);
}

function clearSelectFilter(select) {
  if (!state.showFilterContext) {
    select.value = "";
    renderAndScrollToTop();
    return;
  }
  const viewport = captureViewportSnapshot();
  const anchor = captureVisibleContentAnchor();
  keepAnchorContainersOpen(anchor);
  select.value = "";
  render();
  restoreViewportSnapshot(viewport, null, anchor);
}

function clearCategoryFilter() {
  if (!state.showFilterContext) {
    selectedCategoryFilters = [];
    renderAndScrollToTop(refs.categoryFilter);
    return;
  }
  const viewport = captureViewportSnapshot();
  const anchor = captureVisibleContentAnchor();
  keepAnchorContainersOpen(anchor);
  selectedCategoryFilters = [];
  render();
  restoreViewportSnapshot(viewport, refs.categoryFilter, anchor);
}

function renderAndScrollToTop(focusTarget = null) {
  pendingPackingScroll = null;
  render();
  const apply = () => {
    const board = refs.packingView.querySelector(".board");
    if (board) board.scrollLeft = 0;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    syncFixedScrollbarVisibility();
  };
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function updateCategoryFilterButton() {
  const count = selectedCategoryFilters.length;
  if (!count) {
    refs.categoryFilter.textContent = t("filters.allCategories");
  } else if (count === 1) {
    refs.categoryFilter.textContent = selectedCategoryFilters[0];
  } else {
    refs.categoryFilter.textContent = uiLanguage === "en" ? `${count} categories` : `${count} категории`;
  }
}

function openCategoryFilterDialog() {
  const selectedSet = new Set(selectedCategoryFilters);
  const availableSet = new Set(getAvailableCategoryFilterOptions());
  const categoriesToShow = state.categories.filter((category) => selectedSet.has(category) || availableSet.has(category));
  refs.categoryFilterList.innerHTML = categoriesToShow.map((category) => {
    const id = `filter-category-${cssSafeId(category)}`;
    return `
      <label class="category-option category-filter-option" for="${id}">
        <input id="${id}" type="checkbox" value="${escapeHtml(category)}" ${selectedSet.has(category) ? "checked" : ""} />
        <span>${escapeHtml(category)}</span>
      </label>
    `;
  }).join("") || `<div class="empty">Нет категорий для текущего поиска</div>`;
  openModalDialog(refs.categoryFilterDialog);
}

function applyCategoryFilterDialog(event) {
  event.preventDefault();
  const viewport = captureViewportSnapshot();
  const anchor = captureVisibleContentAnchor();
  keepAnchorContainersOpen(anchor);
  selectedCategoryFilters = [...refs.categoryFilterList.querySelectorAll("input:checked")].map((input) => input.value);
  refs.categoryFilterDialog.close();
  render();
  restoreViewportSnapshot(viewport, refs.categoryFilter, anchor);
}

function openAddToContainerDialog(containerId) {
  if (!state.containers[containerId]) return;
  addToContainerTargetId = containerId;
  refs.addToContainerTitle.textContent = "Добавить";
  refs.addToContainerPath.textContent = containerPath(containerId);
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  refs.newSubcontainerName.value = "";
  renderAddToContainerResults();
  openModalDialog(refs.addToContainerDialog);
  requestAnimationFrame(() => refs.addToContainerSearch.focus({ preventScroll: true }));
}

function renderAddToContainerResults() {
  const containerId = addToContainerTargetId;
  if (!containerId || !state.containers[containerId]) {
    refs.addToContainerResults.innerHTML = "";
    return;
  }
  const query = refs.addToContainerSearch.value.trim().toLowerCase();
  refs.clearAddToContainerSearchBtn.hidden = !query;
  const items = getItemsForActiveCatalog()
    .filter((item) => !isItemInActiveLayout(item))
    .filter((item) => matchesAddToContainerSearch(item, query))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .slice(0, 60);
  refs.addToContainerResults.innerHTML = items.map((item) => {
    const alreadyHere = item.containerId === containerId;
    return `
      <button
        class="add-item-result ${alreadyHere ? "already-here" : ""}"
        type="button"
        data-add-existing-item="${item.id}"
        ${alreadyHere ? "disabled" : ""}
      >
        <strong>${highlightText(item.name, query)}</strong>
      </button>
    `;
  }).join("") || `<div class="empty">Ничего не найдено</div>`;

  refs.addToContainerResults.querySelectorAll("[data-add-existing-item]").forEach((button) => {
    button.addEventListener("click", () => addExistingItemToContainer(button.dataset.addExistingItem));
  });
}

function matchesAddToContainerSearch(item, query) {
  if (!query) return true;
  return item.name.toLowerCase().includes(query);
  return [
    item.name,
    itemCategories(item).join(" "),
    item.location,
    item.note || "",
    item.containerId ? containerPath(item.containerId) : "Вне укладки"
  ].join(" ").toLowerCase().includes(query);
}

function clearAddToContainerSearch() {
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  renderAddToContainerResults();
  refs.addToContainerSearch.focus({ preventScroll: true });
}

function openLayoutRootDialog() {
  refs.layoutRootSearch.value = "";
  refs.clearLayoutRootSearchBtn.hidden = true;
  renderLayoutRootResults();
  openModalDialog(refs.layoutRootDialog);
}

function renderLayoutRootResults() {
  const query = refs.layoutRootSearch.value.trim().toLowerCase();
  refs.clearLayoutRootSearchBtn.hidden = !query;
  const activeIds = new Set(getVisibleLayoutRootIds(getPublishedWorkLayout()));
  const roots = getRootContainers()
    .filter(isRootContainerInActiveCatalog)
    .filter((container) => !activeIds.has(container.id))
    .filter((container) => matchesLayoutRootSearch(container, query))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  refs.layoutRootResults.innerHTML = roots.map((container) => `
    <button class="add-item-result" type="button" data-add-layout-root="${container.id}">
      <strong>${highlightText(container.name, query)}</strong>
      <small>${formatWeight(Number(container.weight || 0))}${container.volume ? ` · ${String(container.volume).replace(".", ",")} л` : ""}</small>
    </button>
  `).join("") || `<div class="empty">Все подходящие сумки и места уже в укладке</div>`;

  refs.layoutRootResults.querySelectorAll("[data-add-layout-root]").forEach((button) => {
    button.addEventListener("click", () => addRootContainerToActiveLayout(button.dataset.addLayoutRoot));
  });
}

function matchesLayoutRootSearch(container, query) {
  if (!query) return true;
  return [
    container.name,
    container.location || "",
    container.note || ""
  ].join(" ").toLowerCase().includes(query);
}

function clearLayoutRootSearch() {
  refs.layoutRootSearch.value = "";
  refs.clearLayoutRootSearchBtn.hidden = true;
  renderLayoutRootResults();
  refs.layoutRootSearch.focus({ preventScroll: true });
}

function updateRootContainerPlacementButton() {
  const containerId = editingRootContainerId;
  const container = state.containers[containerId];
  if (!containerId || !container) {
    refs.rootContainerPlacementField.hidden = true;
    return;
  }
  const isPackage = Boolean(container.parentId);
  const active = isPackage || getRootContainerDialogLayoutRootIds().includes(containerId);
  const currentText = isPackage
    ? containerPath(getRootContainerDialogParentId())
    : (active ? "Текущая укладка" : "Вне текущей укладки");
  refs.rootContainerPlacementField.hidden = false;
  if (refs.rootContainerPlacementLabel) refs.rootContainerPlacementLabel.textContent = "Находится в";
  if (refs.rootContainerPlacementCurrent) {
    refs.rootContainerPlacementCurrent.hidden = false;
    refs.rootContainerPlacementCurrent.textContent = currentText || "Вне укладки";
    refs.rootContainerPlacementCurrent.classList.toggle("active", active);
  }
  refs.rootContainerPlacementBtn.textContent = isPackage ? "Переложить" : "Переставить";
  refs.rootContainerPlacementBtn.classList.remove("active");
  refs.rootContainerPlacementBtn.classList.add("repack-button");
  refs.rootContainerPlacementBtn.setAttribute("aria-label", isPackage
    ? `Переложить из ${currentText || "текущего места"}`
    : `Переставить: ${currentText}`);
}

function getRootContainerDialogParentId() {
  if (rootContainerDialogPendingParentId !== undefined) return rootContainerDialogPendingParentId;
  return state.containers[editingRootContainerId]?.parentId || "";
}

function getRootContainerDialogParentIndex() {
  if (rootContainerDialogPendingParentIndex !== null) return rootContainerDialogPendingParentIndex;
  const container = state.containers[editingRootContainerId];
  const parent = state.containers[getRootContainerDialogParentId()];
  if (!container || !parent) return "";
  const index = (parent.order || []).findIndex((entry) => entry.type === "container" && entry.id === container.id);
  return index >= 0 ? index : "";
}

function openRootContainerPlacementAction(event) {
  event?.preventDefault();
  const container = state.containers[editingRootContainerId];
  if (!container) return;
  if (container.parentId) {
    openContainerParentPickerDialog();
    return;
  }
  openRootPlacementDialog();
}

function openRootPlacementDialog() {
  const containerId = editingRootContainerId;
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  refs.rootPlacementTitle.textContent = `Переставить «${container.name}»`;
  renderRootPlacementBoard(containerId);
  openModalDialog(refs.rootPlacementDialog);
}

function renderRootPlacementBoard(containerId) {
  const rootIds = getRootContainerDialogLayoutRootIds();
  const slots = [];
  for (let index = 0; index <= rootIds.length; index += 1) {
    slots.push(renderRootPlacementSlot(containerId, index));
    if (index < rootIds.length) slots.push(renderRootPlacementColumn(rootIds[index], containerId));
  }
  refs.rootPlacementBoard.innerHTML = slots.join("") || renderRootPlacementSlot(containerId, 0);
  refs.rootPlacementBoard.querySelectorAll("[data-place-root-index]").forEach((button) => {
    button.addEventListener("click", () => placeRootContainerInActiveLayout(containerId, Number(button.dataset.placeRootIndex)));
  });
  bindHorizontalTouchScroll(refs.rootPlacementBoard);
}

function bindHorizontalTouchScroll(board) {
  if (!board || board.dataset.touchScrollBound === "true") return;
  board.dataset.touchScrollBound = "true";
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let horizontalScroll = false;
  let suppressClickUntil = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let momentumFrame = null;

  const stopMomentum = () => {
    if (!momentumFrame) return;
    cancelAnimationFrame(momentumFrame);
    momentumFrame = null;
  };

  const clampScrollLeft = (value) => {
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    return Math.max(0, Math.min(max, value));
  };

  const startMomentum = () => {
    stopMomentum();
    if (!horizontalScroll || Math.abs(velocityX) < 0.08) return;
    let velocity = velocityX;
    let previousTime = performance.now();
    const step = (time) => {
      const elapsed = Math.min(32, time - previousTime);
      previousTime = time;
      const nextLeft = clampScrollLeft(board.scrollLeft - velocity * elapsed);
      const hitEdge = nextLeft === 0 || nextLeft >= Math.max(0, board.scrollWidth - board.clientWidth);
      board.scrollLeft = nextLeft;
      velocity *= Math.pow(0.94, elapsed / 16);
      if (hitEdge) velocity *= 0.35;
      if (Math.abs(velocity) < 0.015) {
        momentumFrame = null;
        return;
      }
      momentumFrame = requestAnimationFrame(step);
    };
    momentumFrame = requestAnimationFrame(step);
  };

  board.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    stopMomentum();
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = board.scrollLeft;
    horizontalScroll = false;
    lastX = touch.clientX;
    lastTime = performance.now();
    velocityX = 0;
  }, { passive: true });

  board.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (!horizontalScroll) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      horizontalScroll = true;
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - lastTime);
    velocityX = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = now;
    board.scrollLeft = clampScrollLeft(startLeft - dx);
    suppressClickUntil = Date.now() + 350;
  }, { passive: false });

  board.addEventListener("touchend", startMomentum, { passive: true });
  board.addEventListener("touchcancel", stopMomentum, { passive: true });

  board.addEventListener("click", (event) => {
    if (Date.now() <= suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

function renderRootPlacementSlot(containerId, slotIndex) {
  const rootIds = getRootContainerDialogLayoutRootIds();
  const currentIndex = rootIds.indexOf(containerId);
  const disabled = currentIndex >= 0 && (slotIndex === currentIndex || slotIndex === currentIndex + 1);
  return `
    <button
      class="root-placement-slot"
      type="button"
      data-place-root-index="${slotIndex}"
      ${disabled ? "disabled" : ""}
      aria-label="Поставить сюда"
      title="Поставить сюда"
    >+</button>
  `;
}

function renderRootPlacementColumn(rootId, selectedId) {
  const container = state.containers[rootId];
  if (!container) return "";
  return `
    <article class="root-placement-column ${rootId === selectedId ? "selected" : ""}">
      <strong>${escapeHtml(container.name)}</strong>
      <span>${formatWeight(containerWeight(rootId))}</span>
      <div class="root-placement-children">
        ${(container.childIds || []).slice(0, 5).map((childId) => {
          const child = state.containers[childId];
          return child ? `<small>${escapeHtml(child.name)}</small>` : "";
        }).join("")}
      </div>
    </article>
  `;
}

function placeRootContainerInActiveLayout(containerId, slotIndex) {
  const index = normalizeRootPlacementIndex(containerId, slotIndex);
  const rootIds = getRootContainerDialogLayoutRootIds().filter((id) => id !== containerId);
  rootIds.splice(Math.max(0, Math.min(index, rootIds.length)), 0, containerId);
  rootContainerDialogPendingRootIds = rootIds;
  refs.rootPlacementDialog.close();
  updateRootContainerPlacementButton();
  updateRootContainerDialogSaveState();
  showToast("Место выбрано. Нажмите «Сохранить».", "success");
}

function normalizeRootPlacementIndex(containerId, slotIndex) {
  const rootIds = getRootContainerDialogLayoutRootIds();
  const currentIndex = rootIds.indexOf(containerId);
  if (currentIndex >= 0 && currentIndex < slotIndex) return slotIndex - 1;
  return slotIndex;
}

function getRootContainerDialogLayoutRootIds() {
  if (rootContainerDialogPendingRootIds) return [...rootContainerDialogPendingRootIds];
  const layout = getPublishedWorkLayout();
  return [...getVisibleLayoutRootIds(layout)];
}

function applyRootContainerDialogPlacement() {
  if (!rootContainerDialogPendingRootIds) return false;
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  if (!layout) return false;
  const currentIds = layout.rootContainerIds || [];
  if (snapshotsEqual(currentIds, rootContainerDialogPendingRootIds)) return false;
  layout.rootContainerIds = [...rootContainerDialogPendingRootIds];
  touchLayout(layoutId);
  return true;
}

function addRootContainerToActiveLayout(containerId, targetIndex = null, { closeDialog = true, renderAfter = true } = {}) {
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  if (!layout || !state.containers[containerId]) return;
  layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => id !== containerId);
  const index = targetIndex === null
    ? layout.rootContainerIds.length
    : Math.max(0, Math.min(targetIndex, layout.rootContainerIds.length));
  layout.rootContainerIds.splice(index, 0, containerId);
  markRecordActivePublicCatalog(state.containers[containerId]);
  touchLayout(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  if (closeDialog && refs.layoutRootDialog.open) refs.layoutRootDialog.close();
  if (renderAfter) render();
}

function highlightText(value, rawQuery) {
  const text = String(value || "");
  const query = String(rawQuery || "").trim();
  if (!query) return escapeHtml(text);
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<mark>${escapeHtml(text.slice(index, index + query.length))}</mark>${escapeHtml(text.slice(index + query.length))}`;
}

function addExistingItemToContainer(itemId) {
  const containerId = addToContainerTargetId;
  if (!state.items[itemId] || !state.containers[containerId]) return;
  refs.addToContainerDialog.close();
  state.collapsedContainers[containerId] = false;
  saveLocalUiState();
  recentlyAddedItemId = itemId;
  moveItem(itemId, containerId, null, { captureScroll: false });
  requestAnimationFrame(() => focusRecentlyAddedItem(itemId));
}

function createSubcontainerFromAddDialog(event) {
  event.preventDefault();
  const parentId = addToContainerTargetId;
  const parent = state.containers[parentId];
  const name = refs.newSubcontainerName.value.trim();
  if (!parent || !name) return;
  const changedAt = nowIso();
  const id = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.containers[id] = {
    id,
    name,
    parentId,
    childIds: [],
    itemIds: [],
    order: [],
    weight: 0,
    ...currentCreateMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.containers[id]);
  parent.childIds = parent.childIds || [];
  parent.childIds.push(id);
  parent.order = parent.order || [];
  parent.order.push({ type: "container", id });
  state.collapsedContainers[parentId] = false;
  state.collapsedContainers[id] = false;
  touchContainer(parentId, changedAt);
  saveLocalUiState();
  saveState();
  scheduleActivePublishedEditSave();
  refs.addToContainerDialog.close();
  render();
  requestAnimationFrame(() => {
    refs.packingView.querySelector(`[data-subcontainer-id="${cssEscape(id)}"]`)
      ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  });
}

function focusRecentlyAddedItem(itemId) {
  const card = refs.packingView.querySelector(`[data-item-id="${cssEscape(itemId)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => {
    if (recentlyAddedItemId === itemId) {
      recentlyAddedItemId = null;
      card.classList.remove("just-added");
    }
  }, 1700);
}

function getFilterOptionItems() {
  const view = getCurrentView();
  if (view === "packing") return getActiveLayoutItems();
  return getItemsForActiveCatalog();
}

function getAvailableLocationFilterOptions() {
  const currentLocation = refs.locationFilter.value;
  const available = new Set();
  if (getCurrentView() === "bags") {
    getRootContainers().filter(isRootContainerInActiveCatalog).forEach((container) => {
      if (matchesRootContainerFieldsFilter(container, { ignoreLocation: true })) {
        available.add(container.location || defaultRootContainerLocation(state));
      }
    });
    if (currentLocation) available.add(currentLocation);
    return state.locations.filter((location) => available.has(location));
  }
  getFilterOptionItems().forEach((item) => {
    if (matchesItemFieldsFilter(item, { ignoreLocation: true }) && matchesCollectionFilter(item)) {
      available.add(item.location);
    }
  });
  if (currentLocation) available.add(currentLocation);
  return state.locations.filter((location) => available.has(location));
}

function getAvailableCategoryFilterOptions() {
  const available = new Set();
  getFilterOptionItems().forEach((item) => {
    if (matchesItemFieldsFilter(item, { ignoreCategories: true }) && matchesCollectionFilter(item)) {
      itemCategories(item).forEach((category) => available.add(category));
    }
  });
  selectedCategoryFilters.forEach((category) => available.add(category));
  return state.categories.filter((category) => available.has(category));
}

function fillSelect(select, entries, selected = "") {
  const current = selected || select.value;
  select.innerHTML = entries.map(([value, label, kind = ""]) => {
    const className = kind ? ` class="select-option-${escapeHtml(kind)}"` : "";
    return `<option value="${escapeHtml(value)}"${className}>${escapeHtml(label)}</option>`;
  }).join("");
  if (entries.some(([value]) => value === current)) select.value = current;
}

function renderItemCategoryPicker(selected = null, { fallbackDefault = true } = {}) {
  const selectedSet = new Set(selected || getDialogSelectedCategories());
  if (fallbackDefault && !selectedSet.size && state.categories[0]) selectedSet.add(state.categories[0]);
  refs.itemCategoryList.innerHTML = state.categories.map((category) => {
    const id = `item-category-${cssSafeId(category)}`;
    return `
      <label class="category-option" for="${id}">
        <input id="${id}" type="checkbox" value="${escapeHtml(category)}" ${selectedSet.has(category) ? "checked" : ""} />
        <span>${escapeHtml(category)}</span>
      </label>
    `;
  }).join("");
}

function getDialogSelectedCategories() {
  const checked = [...refs.itemCategoryList.querySelectorAll("input:checked")].map((input) => input.value);
  return checked.length ? checked : [state.categories[0] || "Прочее"];
}

function openItemContainerPickerDialog(event) {
  event?.preventDefault();
  containerPickerMode = "item";
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function openItemCopyContainerPickerDialog(event) {
  event?.preventDefault();
  if (!editingItemId || !state.items[editingItemId]) return;
  containerPickerMode = "item-copy";
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function openContainerParentPickerDialog(event) {
  event?.preventDefault();
  if (!editingRootContainerId || !state.containers[editingRootContainerId]?.parentId) return;
  containerPickerMode = "container";
  containerPickerTargetContainerId = editingRootContainerId;
  containerPickerLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function openRootContainerCopyPickerDialog(event) {
  event?.preventDefault();
  if (!editingRootContainerId || !state.containers[editingRootContainerId]) return;
  containerPickerMode = "container-copy";
  containerPickerTargetContainerId = editingRootContainerId;
  containerPickerLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function renderContainerPicker() {
  const layoutOptions = getContainerPickerLayoutOptions();
  if (!layoutOptions.some((layout) => layout.id === containerPickerLayoutId)) {
    containerPickerLayoutId = layoutOptions[0]?.id || getPublishedEditLayoutId();
  }
  updateContainerPickerTitle();
  renderContainerPickerLayoutSelect(layoutOptions);
  let boardHtml = "";
  withLayoutArrangementApplied(containerPickerLayoutId, () => {
    const layout = state.layouts?.[containerPickerLayoutId] || getPublishedWorkLayout();
    const rootIds = getVisibleLayoutRootIds(layout);
    boardHtml = rootIds.map(renderContainerPickerColumn).join("");
  });
  refs.containerPickerBoard.innerHTML = boardHtml ||
    `<div class="empty">В текущей укладке нет верхних элементов</div>`;
  refs.containerPickerNoneBtn.hidden = containerPickerMode === "container" || containerPickerMode === "item-copy";
  refs.containerPickerNoneBtn.classList.toggle("active", containerPickerMode === "item" && !refs.itemContainer.value);
  refs.containerPickerNoneBtn.textContent = containerPickerMode === "container-copy"
    ? "В корень укладки"
    : refs.itemContainer.value ? "Убрать из укладки" : "Вне укладки";
  refs.containerPickerBoard.querySelectorAll("[data-pick-container]").forEach((button) => {
    button.addEventListener("click", () => selectContainerPickerTarget(button.dataset.pickContainer));
  });
  refs.containerPickerBoard.querySelectorAll("[data-pick-container-parent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectContainerPickerTarget(button.dataset.pickContainerParent, Number(button.dataset.pickContainerIndex));
    });
  });
  bindHorizontalTouchScroll(refs.containerPickerBoard);
}

function getContainerPickerLayoutOptions() {
  const currentLayout = getPublishedWorkLayout();
  const copyMode = containerPickerMode === "item-copy" || containerPickerMode === "container-copy";
  if (!copyMode) {
    return currentLayout ? [currentLayout] : [];
  }
  const activePublishedLayoutId = getPublishedEditLayoutId();
  return Object.values(state.layouts || {})
    .filter((layout) => (!layout.adminDemo && !layout.adminSharedSourceId) || layout.id === activePublishedLayoutId)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
}

function renderContainerPickerLayoutSelect(layoutOptions) {
  if (!refs.containerPickerLayoutField || !refs.containerPickerLayoutSelect) return;
  const visible = (containerPickerMode === "item-copy" || containerPickerMode === "container-copy") && layoutOptions.length > 1;
  refs.containerPickerLayoutField.hidden = !visible;
  if (!visible) return;
  fillSelect(
    refs.containerPickerLayoutSelect,
    layoutOptions.map((layout) => [layout.id, layout.name || "Укладка"]),
    containerPickerLayoutId
  );
}

function updateContainerPickerTitle() {
  if (!refs.containerPickerTitle) return;
  if (containerPickerMode === "item-copy") {
    refs.containerPickerTitle.textContent = "Скопировать в место";
    return;
  }
  if (containerPickerMode === "container-copy") {
    const target = state.containers[containerPickerTargetContainerId];
    refs.containerPickerTitle.textContent = target?.name ? `Скопировать «${target.name}»` : "Скопировать в место";
    return;
  }
  const target = containerPickerMode === "container" ? state.containers[containerPickerTargetContainerId] : null;
  refs.containerPickerTitle.textContent = target?.name ? `Выбрать место для «${target.name}»` : "Выбрать место";
}

function renderContainerPickerColumn(containerId) {
  const container = state.containers[containerId];
  if (!container) return "";
  if (!isContainerPickerTargetAllowed(containerId)) return renderContainerPickerChildren(container.id, 0);
  const selected = getContainerPickerSelectedId() === containerId;
  return `
    <article class="container-picker-column">
      <button class="container-picker-root ${selected ? "selected" : ""}" type="button" data-pick-container="${container.id}">
        <strong>${escapeHtml(container.name)}</strong>
        <span>${formatWeight(containerWeight(container.id))}</span>
      </button>
      <div class="container-picker-nested">
        ${renderContainerPickerChildren(container.id, 0)}
      </div>
    </article>
  `;
}

function renderContainerPickerChildren(containerId, level) {
  const container = state.containers[containerId];
  if (!container) return "";
  const shouldRenderSlots = shouldShowContainerPickerSlotsForParent(containerId);
  const order = container.order || [];
  let containerPosition = 0;
  const pieces = order.map((entry, index) => {
    if (entry.type !== "container") return "";
    const child = state.containers[entry.id];
    if (!child) return "";
    const isCurrentContainer = isContainerPickerCurrentTarget(child.id);
    const beforeSlot = !isCurrentContainer && shouldRenderSlots
      ? renderContainerPickerSlot(containerId, index, level, containerPosition > 0, isContainerPickerCurrentPositionSlot(containerId, index))
      : "";
    containerPosition += 1;
    if (isCurrentContainer) return "";
    if (!isContainerPickerTargetAllowed(child.id)) {
      return containerPickerMode === "container" ? "" : `${beforeSlot}${renderContainerPickerChildren(child.id, level + 1)}`;
    }
    const selected = getContainerPickerSelectedId() === child.id;
    const nested = containerPickerMode === "container" ? "" : renderContainerPickerChildren(child.id, level + 1);
    return `
      ${beforeSlot}
      <button
        class="container-picker-node ${selected ? "selected" : ""}"
        type="button"
        data-pick-container="${child.id}"
        style="--level: ${level}"
      >
        <span>${escapeHtml(child.name)}</span>
        <small>${formatWeight(containerWeight(child.id))}</small>
      </button>
      ${nested}
    `;
  }).join("");
  const endSlot = shouldRenderSlots
    ? renderContainerPickerSlot(containerId, order.length, level, containerPosition > 0, isContainerPickerCurrentPositionSlot(containerId, order.length))
    : "";
  return `${pieces}${endSlot}`;
}

function renderContainerPickerCurrentSlot(level, compact = false) {
  return `
    <div
      class="container-picker-slot current ${compact ? "compact" : ""}"
      style="--level: ${level}"
      aria-current="true"
    >Текущее место</div>
  `;
}

function isContainerPickerCurrentTarget(containerId) {
  return (containerPickerMode === "container" || containerPickerMode === "container-copy") &&
    containerId === containerPickerTargetContainerId;
}

function shouldShowContainerPickerSlotsForParent(parentId) {
  if (containerPickerMode !== "container") return false;
  const parent = state.containers[parentId];
  return Boolean(parent && !parent.parentId);
}

function renderContainerPickerSlot(parentId, orderIndex, level, compact = false, isCurrentPosition = false) {
  if (containerPickerMode !== "container") return "";
  if (!isContainerPickerTargetAllowed(parentId)) return "";
  if (isCurrentPosition) return renderContainerPickerCurrentSlot(level, compact);
  const selected = getContainerPickerSelectedId() === parentId && getContainerPickerSelectedIndex() === orderIndex;
  return `
    <button
      class="container-picker-slot ${compact ? "compact" : ""} ${selected ? "selected" : ""}"
      type="button"
      data-pick-container-parent="${parentId}"
      data-pick-container-index="${orderIndex}"
      style="--level: ${level}"
      aria-label="Поставить сюда"
      title="Поставить сюда"
    >+</button>
  `;
}

function isContainerPickerCurrentPositionSlot(parentId, orderIndex) {
  if (containerPickerMode !== "container" || !containerPickerTargetContainerId) return false;
  const movingContainer = state.containers[containerPickerTargetContainerId];
  const parent = state.containers[parentId];
  if (!movingContainer || !parent || movingContainer.parentId !== parentId) return false;
  const currentIndex = (parent.order || []).findIndex((entry) => entry.type === "container" && entry.id === movingContainer.id);
  return currentIndex >= 0 && orderIndex === currentIndex + 1;
}

function getContainerPickerSelectedId() {
  if (containerPickerMode === "item-copy" || containerPickerMode === "container-copy") return "";
  return containerPickerMode === "container" ? getRootContainerDialogParentId() : refs.itemContainer.value;
}

function getContainerPickerSelectedIndex() {
  return containerPickerMode === "container" ? rootContainerDialogPendingParentIndex : null;
}

function isContainerPickerTargetAllowed(containerId) {
  if (containerPickerMode !== "container" && containerPickerMode !== "container-copy") return true;
  if (!containerPickerTargetContainerId) return true;
  if (containerId === containerPickerTargetContainerId) return false;
  return !getDescendantContainerIds(containerPickerTargetContainerId).includes(containerId);
}

async function selectContainerPickerTarget(containerId, targetIndex = null) {
  if (containerPickerMode === "container") {
    selectRootContainerParent(containerId, targetIndex);
    return;
  }
  if (containerPickerMode === "item-copy") {
    await copyItemToContainerInLayout(editingItemId, containerId, containerPickerLayoutId);
    return;
  }
  if (containerPickerMode === "container-copy") {
    await copyContainerTreeToLayout(editingRootContainerId, containerPickerLayoutId, containerId);
    return;
  }
  selectItemContainer(containerId);
}

function selectItemContainer(containerId) {
  itemDialogTargetLayoutId = getPublishedEditLayoutId();
  refs.itemContainer.value = containerId || "";
  updateItemContainerPickerButton();
  updateItemDialogSaveState();
  refs.containerPickerDialog.close();
}

async function copyItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic && layoutContainsItem(targetLayoutId, itemId)) {
    const duplicate = await askConfirmDialog({
      title: "Вещь уже есть в этой укладке",
      text: `«${source.name || "Вещь"}» уже участвует в укладке «${targetLayout.name || "Укладка"}». Создать отдельную копию этой вещи?`,
      okText: "Дублировать",
      cancelText: "Пропустить",
      tone: "safe"
    });
    if (!duplicate) {
      refs.containerPickerDialog.close();
      showToast("Копирование пропущено: вещь уже есть в целевой укладке.", "success");
      return;
    }
    duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId);
    return;
  }
  if (!targetIsPublic && linkExistingItemToContainerInLayout(itemId, targetContainerId, targetLayoutId)) return;
  duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId);
}

function layoutContainsItem(layoutId, itemId) {
  let contains = false;
  withLayoutArrangementApplied(layoutId, () => {
    contains = currentAppliedLayoutItemIds(state.layouts[layoutId]).has(itemId);
  });
  return contains;
}

function currentAppliedLayoutItemIds(layout = state.layouts[state.activeLayoutId]) {
  const ids = new Set();
  getVisibleLayoutRootIds(layout).forEach((containerId) => {
    getContainerItemIdsDeep(containerId).forEach((itemId) => ids.add(itemId));
  });
  return ids;
}

function linkExistingItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!state.items[itemId] || !targetLayout) return false;
  const changedAt = nowIso();
  let linked = false;
  withLayoutArrangementApplied(targetLayoutId, () => {
    const targetContainer = state.containers[targetContainerId];
    if (!targetContainer || !getActiveLayoutContainerIdSet(targetLayout).has(targetContainerId)) return;
    if (currentAppliedLayoutItemIds(targetLayout).has(itemId)) return;
    targetContainer.itemIds = targetContainer.itemIds || [];
    if (!targetContainer.itemIds.includes(itemId)) targetContainer.itemIds.push(itemId);
    targetContainer.order = targetContainer.order || [];
    if (!targetContainer.order.some((entry) => entry?.type === "item" && entry.id === itemId)) {
      targetContainer.order.push({ type: "item", id: itemId });
    }
    state.items[itemId].containerId = targetContainerId;
    touchLayout(targetLayoutId, changedAt);
    linked = true;
  });
  if (!linked) return false;
  saveState();
  refs.containerPickerDialog.close();
  showToast("Вещь добавлена в выбранную укладку без создания дубля.", "success");
  return true;
}

function duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  const sourceSnapshot = clone(source);
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  let copied = false;
  withLayoutArrangementApplied(targetLayoutId, () => {
    const targetContainer = state.containers[targetContainerId];
    if (!targetContainer || !getActiveLayoutContainerIdSet(targetLayout).has(targetContainerId)) return;
    const copyId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.items[copyId] = {
      ...clone(sourceSnapshot),
      id: copyId,
      name: makeItemCopyName(sourceSnapshot.name),
      containerId: targetContainerId,
      photos: [],
      createdAt: changedAt,
      ...currentEditMeta(changedAt)
    };
    if (targetIsPublic) {
      state.items[copyId].publicCatalogLayoutId = targetLayoutId;
    } else {
      delete state.items[copyId].publicCatalogLayoutId;
      delete state.items[copyId].adminDemo;
      delete state.items[copyId].adminSharedSourceId;
    }
    targetContainer.itemIds = targetContainer.itemIds || [];
    if (!targetContainer.itemIds.includes(copyId)) targetContainer.itemIds.push(copyId);
    targetContainer.order = targetContainer.order || [];
    targetContainer.order.push({ type: "item", id: copyId });
    touchItem(copyId, changedAt);
    touchContainer(targetContainerId, changedAt);
    copied = true;
  });
  if (!copied) return;
  saveState();
  if (targetIsPublic) schedulePublishedLayoutSave(targetLayoutId);
  refs.containerPickerDialog.close();
  showToast("Вещь скопирована в выбранную укладку.", "success");
}

function snapshotContainerTree(containerId, { sourceLayoutId = "", excludeLayoutId = "", targetState = state } = {}) {
  const arrangementSnapshot = snapshotContainerTreeFromLayoutArrangement(containerId, { sourceLayoutId, excludeLayoutId, targetState });
  if (arrangementSnapshot) return arrangementSnapshot;
  const root = targetState.containers?.[containerId];
  if (!root) return null;
  const containers = {};
  const items = {};
  const visitedContainers = new Set();
  const copyItem = (itemId) => {
    if (items[itemId]) return;
    const item = targetState.items?.[itemId];
    if (item) items[itemId] = clone(item);
  };
  const copyContainer = (id) => {
    if (visitedContainers.has(id)) return;
    const container = targetState.containers?.[id];
    if (!container) return;
    visitedContainers.add(id);
    containers[id] = clone(container);
    (container.itemIds || []).forEach(copyItem);
    (container.order || []).forEach((entry) => {
      if (entry?.type === "item") copyItem(entry.id);
      if (entry?.type === "container") copyContainer(entry.id);
    });
    (container.childIds || []).forEach(copyContainer);
  };
  copyContainer(containerId);
  return { rootId: containerId, containers, items };
}

function snapshotContainerTreeFromLayoutArrangement(containerId, { sourceLayoutId = "", excludeLayoutId = "", targetState = state } = {}) {
  const source = sourceLayoutId
    ? targetState.layouts?.[sourceLayoutId]
    : findBestSourceLayoutForContainerTree(containerId, { excludeLayoutId, targetState });
  const arrangement = source?.arrangement;
  if (!arrangement || typeof arrangement !== "object" || !arrangement.containers?.[containerId]) return null;
  const containers = {};
  const items = {};
  const visitedContainers = new Set();
  const copyItem = (itemId, parentId) => {
    if (items[itemId]) return;
    const item = targetState.items?.[itemId];
    if (item) items[itemId] = { ...clone(item), containerId: parentId };
  };
  const copyContainer = (id, parentId = null) => {
    if (visitedContainers.has(id)) return;
    const container = targetState.containers?.[id];
    const placement = arrangement.containers?.[id];
    if (!container || !placement) return;
    visitedContainers.add(id);
    const itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : []).filter((itemId) => targetState.items?.[itemId]);
    const childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((childId) => targetState.containers?.[childId]);
    const itemSet = new Set(itemIds);
    const childSet = new Set(childIds);
    const order = (Array.isArray(placement.order) ? placement.order : [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    containers[id] = {
      ...clone(container),
      parentId,
      childIds,
      itemIds,
      order: order.length ? order : [
        ...itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...childIds.map((childId) => ({ type: "container", id: childId }))
      ]
    };
    itemIds.forEach((itemId) => copyItem(itemId, id));
    childIds.forEach((childId) => copyContainer(childId, id));
  };
  copyContainer(containerId, null);
  return containers[containerId] ? { rootId: containerId, containers, items } : null;
}

function findBestSourceLayoutForContainerTree(containerId, { excludeLayoutId = "", targetState = state } = {}) {
  return Object.values(targetState.layouts || {})
    .filter((layout) => layout?.id !== excludeLayoutId)
    .map((layout) => ({
      layout,
      score: layoutArrangementContainerTreeScore(layout?.arrangement, containerId) +
        ((layout?.arrangement?.rootContainerIds || layout?.rootContainerIds || []).includes(containerId) ? 1000 : 0)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.layout || null;
}

function layoutArrangementContainerTreeScore(arrangement, containerId) {
  if (!arrangement || typeof arrangement !== "object" || !arrangement.containers?.[containerId]) return 0;
  const visited = new Set();
  const walk = (id) => {
    if (visited.has(id)) return 0;
    const placement = arrangement.containers?.[id];
    if (!placement) return 0;
    visited.add(id);
    const itemCount = Array.isArray(placement.itemIds) ? placement.itemIds.length : 0;
    const childIds = Array.isArray(placement.childIds) ? placement.childIds : [];
    return 1 + itemCount + childIds.reduce((sum, childId) => sum + walk(childId), 0);
  };
  return walk(containerId);
}

async function copyContainerTreeToLayout(containerId, targetLayoutId = state.activeLayoutId, targetParentId = "") {
  const targetLayout = state.layouts[targetLayoutId];
  const sourceSnapshot = snapshotContainerTree(containerId, { excludeLayoutId: targetLayoutId });
  if (!sourceSnapshot || !targetLayout) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) {
    const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
    if (duplicates.containerIds.length || duplicates.itemIds.length) {
      const duplicate = await askConfirmDialog({
        title: "Такие элементы уже есть в укладке",
        text: `В укладке «${targetLayout.name || "Укладка"}» уже есть часть этой сумки/ветки. Создать отдельные копии вместо повторного добавления?`,
        okText: "Дублировать",
        cancelText: "Пропустить",
        highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже есть в целевой укладке`,
        tone: "safe"
      });
      if (!duplicate) {
        refs.containerPickerDialog.close();
        showToast("Копирование пропущено: элементы уже есть в целевой укладке.", "success");
        return;
      }
      duplicateContainerTreeToLayout(containerId, targetLayoutId, targetParentId);
      return;
    }
    if (linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId, targetParentId)) return;
  }
  duplicateContainerTreeToLayout(containerId, targetLayoutId, targetParentId);
}

function layoutDuplicateSummaryForContainerTree(layoutId, sourceSnapshot) {
  const sourceContainerIds = new Set(Object.keys(sourceSnapshot?.containers || {}));
  const sourceItemIds = new Set(Object.keys(sourceSnapshot?.items || {}));
  const result = { containerIds: [], itemIds: [] };
  withLayoutArrangementApplied(layoutId, () => {
    const targetContainerIds = getActiveLayoutContainerIdSet(state.layouts[layoutId]);
    const targetItemIds = currentAppliedLayoutItemIds(state.layouts[layoutId]);
    result.containerIds = [...sourceContainerIds].filter((id) => targetContainerIds.has(id));
    result.itemIds = [...sourceItemIds].filter((id) => targetItemIds.has(id));
  });
  return result;
}

function linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "") {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return false;
  const changedAt = nowIso();
  let linked = false;
  withLayoutArrangementApplied(targetLayoutId, () => {
    const targetContainerSet = getActiveLayoutContainerIdSet(targetLayout);
    if (targetParentId && (!state.containers[targetParentId] || !targetContainerSet.has(targetParentId))) return;
    const applySourceContainer = (sourceContainerId, parentId = null) => {
      const sourceContainer = sourceSnapshot.containers[sourceContainerId];
      const targetContainer = state.containers[sourceContainerId];
      if (!sourceContainer || !targetContainer) return "";
      targetContainer.parentId = parentId || null;
      targetContainer.childIds = (sourceContainer.childIds || []).filter((id) => state.containers[id]);
      targetContainer.itemIds = (sourceContainer.itemIds || []).filter((id) => state.items[id]);
      targetContainer.order = (sourceContainer.order || [])
        .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
        .filter((entry) => entry.type === "item" ? targetContainer.itemIds.includes(entry.id) : targetContainer.childIds.includes(entry.id))
        .map((entry) => ({ type: entry.type, id: entry.id }));
      if (!targetContainer.order.length) {
        targetContainer.order = [
          ...targetContainer.itemIds.map((id) => ({ type: "item", id })),
          ...targetContainer.childIds.map((id) => ({ type: "container", id }))
        ];
      }
      targetContainer.itemIds.forEach((itemId) => {
        if (state.items[itemId]) state.items[itemId].containerId = sourceContainerId;
      });
      targetContainer.childIds.forEach((childId) => applySourceContainer(childId, sourceContainerId));
      state.collapsedContainers[sourceContainerId] = false;
      return sourceContainerId;
    };
    const rootId = applySourceContainer(sourceSnapshot.rootId, targetParentId || null);
    if (!rootId) return;
    if (targetParentId) {
      const parent = state.containers[targetParentId];
      parent.childIds = parent.childIds || [];
      if (!parent.childIds.includes(rootId)) parent.childIds.push(rootId);
      parent.order = parent.order || [];
      if (!parent.order.some((entry) => entry?.type === "container" && entry.id === rootId)) {
        parent.order.push({ type: "container", id: rootId });
      }
      state.collapsedContainers[targetParentId] = false;
    } else {
      targetLayout.rootContainerIds = uniqueLayoutIds([...(targetLayout.rootContainerIds || []), rootId]);
    }
    touchLayout(targetLayoutId, changedAt);
    linked = true;
  });
  if (!linked) return false;
  saveState();
  if (refs.containerPickerDialog.open) refs.containerPickerDialog.close();
  render();
  showToast("Сумка или пакет добавлены в выбранную укладку без создания дублей.", "success");
  return true;
}

function duplicateContainerTreeToLayout(containerId, targetLayoutId = state.activeLayoutId, targetParentId = "") {
  const targetLayout = state.layouts[targetLayoutId];
  const sourceSnapshot = snapshotContainerTree(containerId);
  if (!sourceSnapshot || !targetLayout) return;
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const mapRecordToTarget = (record) => {
    if (!record) return;
    if (targetIsPublic) {
      record.publicCatalogLayoutId = targetLayoutId;
    } else {
      delete record.publicCatalogLayoutId;
      delete record.adminDemo;
      delete record.adminSharedSourceId;
    }
  };
  let copied = false;
  withLayoutArrangementApplied(targetLayoutId, () => {
    const targetContainerSet = getActiveLayoutContainerIdSet(targetLayout);
    if (targetParentId && (!state.containers[targetParentId] || !targetContainerSet.has(targetParentId))) return;
    const copyItemTree = (itemId, parentId) => {
    const item = sourceSnapshot.items[itemId];
    if (!item) return "";
    const nextId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.items[nextId] = {
      ...cloneIsolatedEntity(item),
      id: nextId,
      containerId: parentId,
      createdAt: changedAt,
      ...currentEditMeta(changedAt)
    };
    mapRecordToTarget(state.items[nextId]);
    delete state.packedItems?.[nextId];
    return nextId;
  };
  const copyContainerTree = (sourceContainerId, parentId, isTop = false) => {
    const container = sourceSnapshot.containers[sourceContainerId];
    if (!container) return "";
    const nextId = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.containers[nextId] = {
      ...cloneIsolatedEntity(container),
      id: nextId,
      name: isTop ? makeContainerCopyName(container.name) : container.name,
      parentId: parentId || null,
      childIds: [],
      itemIds: [],
      order: [],
      color: normalizeContainerColor(container.color),
      createdAt: changedAt,
      ...currentEditMeta(changedAt)
    };
    mapRecordToTarget(state.containers[nextId]);
    state.collapsedContainers[nextId] = false;
    const copiedItems = new Map();
    const copiedContainers = new Map();
    const copyChildContainer = (childId) => {
      const id = copyContainerTree(childId, nextId);
      if (id) copiedContainers.set(childId, id);
      return id;
    };
    const copyChildItem = (itemId) => {
      const id = copyItemTree(itemId, nextId);
      if (id) copiedItems.set(itemId, id);
      return id;
    };
    state.containers[nextId].childIds = (container.childIds || []).map(copyChildContainer).filter(Boolean);
    state.containers[nextId].itemIds = (container.itemIds || []).map(copyChildItem).filter(Boolean);
    state.containers[nextId].order = (container.order || []).map((entry) => {
      if (entry.type === "container") {
        const id = copiedContainers.get(entry.id);
        return id ? { type: "container", id } : null;
      }
      const id = copiedItems.get(entry.id);
      return id ? { type: "item", id } : null;
    }).filter(Boolean);
    if (!state.containers[nextId].order.length) {
      state.containers[nextId].order = [
        ...state.containers[nextId].itemIds.map((id) => ({ type: "item", id })),
        ...state.containers[nextId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    return nextId;
  };
  const nextRootId = copyContainerTree(sourceSnapshot.rootId, targetParentId || null, true);
  if (!nextRootId) return;
  if (targetParentId) {
    const parent = state.containers[targetParentId];
    parent.childIds = parent.childIds || [];
    if (!parent.childIds.includes(nextRootId)) parent.childIds.push(nextRootId);
    parent.order = parent.order || [];
    parent.order.push({ type: "container", id: nextRootId });
    state.collapsedContainers[targetParentId] = false;
    touchContainer(targetParentId, changedAt);
  } else {
    targetLayout.rootContainerIds = [...(targetLayout.rootContainerIds || []), nextRootId];
  }
  touchLayout(targetLayoutId, changedAt);
    copied = true;
  });
  if (!copied) return;
  saveState();
  if (targetIsPublic) schedulePublishedLayoutSave(targetLayoutId);
  refs.containerPickerDialog.close();
  render();
  showToast("Сумка или пакет скопированы в выбранную укладку.", "success");
}

function selectRootContainerParent(parentId, targetIndex = null) {
  const containerId = containerPickerTargetContainerId || editingRootContainerId;
  if (!containerId || !state.containers[containerId] || !state.containers[parentId]) return;
  if (!isContainerPickerTargetAllowed(parentId)) return;
  rootContainerDialogPendingParentId = parentId;
  rootContainerDialogPendingParentIndex = Number.isFinite(targetIndex) ? targetIndex : null;
  updateRootContainerPlacementButton();
  updateRootContainerDialogSaveState();
  refs.containerPickerDialog.close();
  showToast("Место выбрано. Нажмите «Сохранить».", "success");
}

function updateItemContainerPickerButton() {
  const containerId = refs.itemContainer.value;
  const hasContainer = Boolean(containerId && state.containers[containerId]);
  const path = hasContainer ? containerPath(containerId) : "Вне укладки";
  if (refs.itemContainerLabel) refs.itemContainerLabel.textContent = hasContainer ? "Лежит в" : "Положить в";
  if (refs.itemContainerCurrent) {
    refs.itemContainerCurrent.hidden = false;
    refs.itemContainerCurrent.textContent = path;
    refs.itemContainerCurrent.classList.toggle("active", hasContainer);
  }
  refs.itemContainerPickerBtn.textContent = "Переложить";
  refs.itemContainerPickerBtn.classList.remove("active");
  refs.itemContainerPickerBtn.classList.add("repack-button");
  refs.itemContainerPickerBtn.setAttribute("aria-label", hasContainer
    ? `Переложить из ${path}`
    : "Положить в укладку");
}

function cssSafeId(value) {
  return String(value).toLowerCase().replace(/[^a-zа-я0-9_-]+/gi, "-");
}

function getFilterMatchElements() {
  const view = getCurrentView();
  const root = view === "items"
    ? refs.itemsView
    : view === "packing"
      ? refs.packingView
      : view === "bags"
        ? refs.bagsView
        : null;
  if (!root) return [];
  return [...root.querySelectorAll(".filter-match[data-filter-match-id]")];
}

function filterNavigationSignature() {
  return [getCurrentView(), contentFilterSignature(), state.showFilterContext ? "context" : "filter"].join("\u001f");
}

function updateFilterNavigationUi() {
  const visible = isFilterContextActive() && (getCurrentView() === "packing" || getCurrentView() === "items" || getCurrentView() === "bags");
  refs.filterNav.hidden = !visible;
  if (!visible) {
    pendingFilterJump = false;
    filterMatchSignature = "";
    filterMatchIndex = 0;
    return;
  }
  const signature = filterNavigationSignature();
  const matches = getFilterMatchElements();
  if (signature !== filterMatchSignature) {
    filterMatchSignature = signature;
    filterMatchIndex = 0;
    pendingFilterJump = !suppressNextFilterJump;
    suppressNextFilterJump = false;
  }
  if (filterMatchIndex >= matches.length) filterMatchIndex = Math.max(0, matches.length - 1);
  refs.filterPrevBtn.disabled = matches.length < 1;
  refs.filterNextBtn.disabled = matches.length < 1;
  refs.filterNavStatus.textContent = matches.length ? `${filterMatchIndex + 1}/${matches.length}` : "0/0";
  if (pendingFilterJump) {
    pendingFilterJump = false;
    if (matches.length) requestAnimationFrame(() => scrollToFilterMatch(filterMatchIndex, { highlight: true }));
  }
}

function scheduleFilterNavigationRefresh() {
  if (filterNavRefreshFrame) return;
  filterNavRefreshFrame = requestAnimationFrame(() => {
    filterNavRefreshFrame = null;
    updateFilterNavigationUi();
  });
}

function moveFilterMatch(step) {
  const matches = getFilterMatchElements();
  if (!matches.length) return;
  filterMatchIndex = (filterMatchIndex + step + matches.length) % matches.length;
  scrollToFilterMatch(filterMatchIndex, { highlight: true });
  updateFilterNavigationUi();
}

function scrollToFilterMatch(index, { highlight = false } = {}) {
  const matches = getFilterMatchElements();
  const target = matches[index];
  if (!target) return;
  if (expandFilterMatchAncestors(target)) {
    render();
    requestAnimationFrame(() => scrollToFilterMatch(index, { highlight }));
    return;
  }
  matches.forEach((element) => element.classList.remove("filter-focus"));
  if (highlight) target.classList.add("filter-focus");
  target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => target.classList.remove("filter-focus"), 1200);
}

function expandFilterMatchAncestors(target) {
  if (getCurrentView() !== "packing" || !hasActiveContentFilter()) return false;
  const containers = [];
  let current = target.closest(".subcontainer");
  while (current) {
    containers.push(current);
    current = current.parentElement?.closest(".subcontainer") || null;
  }
  let changed = false;
  containers.forEach((container) => {
    const containerId = container.dataset.subcontainerId;
    if (!containerId) return;
    ensureFilterViewCollapseState();
    if (filterViewCollapsedContainers[containerId] !== false) {
      filterViewCollapsedContainers[containerId] = false;
      changed = true;
    }
  });
  return changed;
}

function renderSummary() {
  if (isSharedLayoutView()) {
    renderSharedSummary();
    return;
  }
  const view = getCurrentView();
  const isPackingView = view === "packing";
  const isFiltered = isSummaryFiltered(view);
  if (view === "bags") {
    const containers = getSummaryRootContainers();
    const totalWeight = containers.reduce((sum, container) => sum + Number(container.weight || 0), 0);
    const notHome = containers.filter((container) => {
      const location = container.location || defaultRootContainerLocation(state);
      return location !== "Дом" && location !== "Уже на велосипеде";
    }).length;
    const unknownWeight = containers.filter((container) => !Number(container.weight || 0)).length;
    refs.summary.innerHTML = [
      metric(formatWeight(totalWeight), filteredLabel("общий вес сумок", isFiltered)),
      metric(String(containers.length), filteredLabel("сумок показано", isFiltered)),
      metric(String(notHome), filteredLabel("не дома и не на веле", isFiltered)),
      metric(String(unknownWeight), filteredLabel("без веса", isFiltered))
    ].join("");
    return;
  }
  const visibleItems = getSummaryItems(view);
  const totalWeight = getSummaryWeight(view, visibleItems, isFiltered);
  const unknownWeight = visibleItems.filter((item) => !Number(item.weight)).length;
  const notHome = visibleItems.filter((item) => item.location !== "Дом" && item.location !== "Уже на велосипеде").length;
  if (isPackingView && state.collectionMode) {
    const activeItems = getActiveLayoutItems().filter(matchesBaseFilters);
    const packedCount = activeItems.filter((item) => isItemPacked(item.id)).length;
    const unpackedCount = Math.max(0, activeItems.length - packedCount);
    refs.summary.innerHTML = [
      metric(`${packedCount} / ${activeItems.length}`, "собрано"),
      metric(String(unpackedCount), "осталось собрать"),
      metric(String(notHome), filteredLabel("не дома и не на веле", isFiltered)),
      metric(String(unknownWeight), filteredLabel("без веса", isFiltered))
    ].join("");
    return;
  }
  refs.summary.innerHTML = [
    metric(formatWeight(totalWeight), filteredLabel(t("summary.totalWeight"), isFiltered)),
    metric(String(visibleItems.length), filteredLabel(t("summary.itemsShown"), isFiltered)),
    metric(String(notHome), filteredLabel(t("summary.notPacked"), isFiltered)),
    metric(String(unknownWeight), filteredLabel(t("summary.withoutWeight"), isFiltered))
  ].join("");
}

function getSummaryItems(view = getCurrentView()) {
  if (view === "items") return getItemsViewSummaryItems();
  return getActiveLayoutItems().filter(matchesFilters);
}

function getSummaryWeight(view, items, isFiltered) {
  if (view === "packing") {
    const layout = state.layouts[state.activeLayoutId];
    const rootWeight = (layout?.rootContainerIds || []).reduce((sum, containerId) => sum + rootContainerOwnWeight(containerId), 0);
    return rootWeight + items.reduce((sum, item) => sum + itemTotalWeight(item), 0);
  }
  return items.reduce((sum, item) => sum + itemTotalWeight(item), 0);
}

function getItemsViewSummaryItems() {
  return getItemsForActiveCatalog().filter((item) => matchesItemFieldsFilter(item, { includeContainerPath: true }));
}

function getSummaryRootContainers() {
  return getRootContainersForSettings();
}

function isSummaryFiltered(view = getCurrentView()) {
  if (view === "items") return hasActiveContentFilter();
  if (view === "bags") return rootContainerUsageFilter !== "all" || hasActiveContentFilter("bags");
  return hasActiveContentFilter() || (state.collectionMode && state.showOnlyUnpacked);
}

function filteredLabel(label, isFiltered) {
  return isFiltered ? `${label} в фильтре` : label;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function isSharedLayoutView() {
  return Boolean(isReadOnlyStateScope() && findSharedLayout(activeReadOnlyLayoutId()));
}

function currentSharedLayout() {
  return findSharedLayout(activeReadOnlyLayoutId());
}

function sharedLayoutStatePayload(layout = currentSharedLayout()) {
  return normalizePublishedStatePayload(layout?.statePayload);
}

function sharedVirtualLayoutId(layoutId) {
  return `shared-virtual-layout-${layoutId}`;
}

function sharedVirtualContainerId(rootId) {
  return `shared-virtual-container-${rootId}`;
}

function sharedVirtualItemId(itemId) {
  return `shared-virtual-item-${itemId}`;
}

function originalSharedId(virtualId, prefix) {
  return String(virtualId || "").startsWith(prefix) ? String(virtualId).slice(prefix.length) : "";
}

function createSharedVirtualState(layout = currentSharedLayout()) {
  const publishedState = sharedLayoutStatePayload(layout);
  if (publishedState) return createSharedVirtualStateFromPublishedState(layout, publishedState);

  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || "shared");
  const containers = {};
  const items = {};
  const rootContainerIds = [];
  const changedAt = "1970-01-01T00:00:00.000Z";
  sharedLayoutRoots(layout).forEach((root) => {
    const containerId = sharedVirtualContainerId(root.id);
    rootContainerIds.push(containerId);
    containers[containerId] = {
      id: containerId,
      name: root.name,
      parentId: null,
      childIds: [],
      itemIds: [],
      order: [],
      weight: Number(root.weightGrams || 0),
      volume: Number(root.volumeLiters || 0),
      color: "",
      location: defaultRootContainerLocation(state),
      note: root.description || "",
      photos: sharedGearPhotos(root, changedAt),
      createdAt: changedAt,
      updatedAt: changedAt,
      sharedSourceId: root.id
    };
    (root.items || []).forEach((item) => {
      const itemId = sharedVirtualItemId(item.id);
      items[itemId] = {
        id: itemId,
        name: item.name,
        weight: Number(item.weightGrams || 0),
        quantity: 1,
        location: defaultRootContainerLocation(state),
        category: "Прочее",
        categories: ["Прочее"],
        containerId,
        note: item.description || "",
        photos: sharedGearPhotos(item, changedAt),
        createdAt: changedAt,
        updatedAt: changedAt,
        sharedSourceId: item.id
      };
      containers[containerId].itemIds.push(itemId);
      containers[containerId].order.push({ type: "item", id: itemId });
    });
  });
  return {
    items,
    containers,
    layouts: {
      [virtualLayoutId]: {
        id: virtualLayoutId,
        name: layout?.name || "Shared укладка",
        rootContainerIds,
        arrangement: createLayoutArrangementFromCurrentState({ items, containers, layouts: {}, activeLayoutId: virtualLayoutId }, rootContainerIds),
        createdAt: changedAt,
        updatedAt: changedAt
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: { ...sharedVirtualCollapsedContainers },
    packedItems: {},
    locations: [defaultRootContainerLocation(state)],
    showItemMeta: true,
    categories: ["Прочее"]
  };
}

function createSharedVirtualStateFromPublishedState(layout, sourceState) {
  const sourceLayout = sourceState.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState.layouts || {})[0];
  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || sourceLayout?.id || "shared");
  const containerMap = new Map();
  const itemMap = new Map();
  const containers = {};
  const items = {};
  const changedAt = sourceLayout?.updatedAt || "1970-01-01T00:00:00.000Z";

  const mapContainerId = (id) => {
    if (!containerMap.has(id)) containerMap.set(id, sharedVirtualContainerId(id));
    return containerMap.get(id);
  };
  const mapItemId = (id) => {
    if (!itemMap.has(id)) itemMap.set(id, sharedVirtualItemId(id));
    return itemMap.get(id);
  };
  const copyItem = (itemId, containerId = "") => {
    const item = sourceState.items?.[itemId];
    if (!item) return "";
    const nextId = mapItemId(itemId);
    if (items[nextId]) return nextId;
    items[nextId] = {
      ...clone(item),
      id: nextId,
      containerId,
      sharedSourceId: itemId,
      createdAt: item.createdAt || changedAt,
      updatedAt: item.updatedAt || changedAt
    };
    return nextId;
  };
  const copyContainer = (containerId, parentId = null) => {
    const container = sourceState.containers?.[containerId];
    if (!container) return "";
    const nextId = mapContainerId(containerId);
    if (containers[nextId]) return nextId;
    containers[nextId] = {
      ...clone(container),
      id: nextId,
      parentId,
      childIds: [],
      itemIds: [],
      order: [],
      sharedSourceId: containerId,
      createdAt: container.createdAt || changedAt,
      updatedAt: container.updatedAt || changedAt
    };
    containers[nextId].childIds = (container.childIds || []).map((id) => copyContainer(id, nextId)).filter(Boolean);
    containers[nextId].itemIds = (container.itemIds || []).map((id) => copyItem(id, nextId)).filter(Boolean);
    containers[nextId].order = (container.order || []).map((entry) => {
      if (entry.type === "container") {
        const id = copyContainer(entry.id, nextId);
        return id ? { type: "container", id } : null;
      }
      const id = copyItem(entry.id, nextId);
      return id ? { type: "item", id } : null;
    }).filter(Boolean);
    if (!containers[nextId].order.length) {
      containers[nextId].order = [
        ...containers[nextId].itemIds.map((id) => ({ type: "item", id })),
        ...containers[nextId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    return nextId;
  };

  const rootContainerIds = (sourceLayout?.rootContainerIds || []).map((id) => copyContainer(id, null)).filter(Boolean);
  return {
    items,
    containers,
    layouts: {
      [virtualLayoutId]: {
        ...(sourceLayout ? clone(sourceLayout) : {}),
        id: virtualLayoutId,
        name: layout?.name || sourceLayout?.name || "Shared укладка",
        rootContainerIds,
        arrangement: createLayoutArrangementFromCurrentState({ items, containers, layouts: {}, activeLayoutId: virtualLayoutId }, rootContainerIds),
        createdAt: sourceLayout?.createdAt || changedAt,
        updatedAt: sourceLayout?.updatedAt || changedAt
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: { ...sharedVirtualCollapsedContainers },
    packedItems: {},
    locations: [...(sourceState.locations || [defaultRootContainerLocation(state)])],
    showItemMeta: sourceState.showItemMeta !== false,
    categories: [...(sourceState.categories || ["Прочее"])],
    collectionMode: false,
    showOnlyUnpacked: false
  };
}

function withSharedVirtualState(callback) {
  const virtualState = createSharedVirtualState();
  const previous = {
    items: state.items,
    containers: state.containers,
    layouts: state.layouts,
    activeLayoutId: state.activeLayoutId,
    collapsedContainers: state.collapsedContainers,
    packedItems: state.packedItems,
    locations: state.locations,
    categories: state.categories,
    showItemMeta: state.showItemMeta,
    collectionMode: state.collectionMode,
    showOnlyUnpacked: state.showOnlyUnpacked
  };
  state.items = virtualState.items;
  state.containers = virtualState.containers;
  state.layouts = virtualState.layouts;
  state.activeLayoutId = virtualState.activeLayoutId;
  state.collapsedContainers = virtualState.collapsedContainers;
  state.packedItems = virtualState.packedItems;
  state.locations = virtualState.locations;
  state.categories = virtualState.categories;
  state.showItemMeta = virtualState.showItemMeta !== false;
  state.collectionMode = false;
  state.showOnlyUnpacked = false;
  try {
    return callback(virtualState);
  } finally {
    sharedVirtualCollapsedContainers = { ...state.collapsedContainers };
    state.items = previous.items;
    state.containers = previous.containers;
    state.layouts = previous.layouts;
    state.activeLayoutId = previous.activeLayoutId;
    state.collapsedContainers = previous.collapsedContainers;
    state.packedItems = previous.packedItems;
    state.locations = previous.locations;
    state.categories = previous.categories;
    state.showItemMeta = previous.showItemMeta;
    state.collectionMode = previous.collectionMode;
    state.showOnlyUnpacked = previous.showOnlyUnpacked;
  }
}

function getSharedItems(layout = currentSharedLayout()) {
  return sharedLayoutRoots(layout).flatMap((root) =>
    (root.items || []).map((item) => ({ ...item, rootId: root.id, rootName: root.name }))
  );
}

function getSharedSearchQuery() {
  return (refs.searchInput?.value || "").trim().toLowerCase();
}

function matchesSharedGearSearch(gear, rootName = "") {
  const query = getSharedSearchQuery();
  if (!query) return true;
  return [
    gear?.name,
    gear?.description,
    gear?.weightAlt,
    rootName
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function getFilteredSharedRootEntries(layout = currentSharedLayout()) {
  return sharedLayoutRoots(layout).map((root) => {
    const rootMatches = matchesSharedGearSearch(root);
    const items = rootMatches
      ? (root.items || [])
      : (root.items || []).filter((item) => matchesSharedGearSearch(item, root.name));
    return { ...root, items };
  }).filter((root) => matchesSharedGearSearch(root) || (root.items || []).length);
}

function getFilteredSharedItems(layout = currentSharedLayout()) {
  return getSharedItems(layout).filter((item) => matchesSharedGearSearch(item, item.rootName));
}

function renderSharedSummary() {
  withSharedVirtualState(() => {
    const view = getCurrentView();
    const summaryView = view === "settings" ? "packing" : view;
    const visibleItems = summaryView === "items" ? getItemsViewSummaryItems() : getActiveLayoutItems().filter(matchesFilters);
    const totalWeight = getSummaryWeight(summaryView, visibleItems, hasActiveContentFilter());
    const unknownWeight = visibleItems.filter((item) => !Number(item.weight)).length;
    const rootCount = state.layouts[state.activeLayoutId]?.rootContainerIds?.length || 0;
    refs.summary.innerHTML = [
      metric(t("shared.prefix"), t("shared.viewMetric")),
      metric(formatWeight(totalWeight), t("summary.totalWeight")),
      metric(String(rootCount), t("summary.bags")),
      metric(String(unknownWeight), t("summary.withoutWeight"))
    ].join("");
  });
  return;
  const layout = currentSharedLayout();
  const roots = sharedLayoutRoots(layout);
  const filteredRoots = getFilteredSharedRootEntries(layout);
  const items = getFilteredSharedItems(layout);
  const filtered = Boolean(getSharedSearchQuery());
  const totalWeight = (filtered ? filteredRoots : roots).reduce((sum, root) => sum + sharedRootWeight(root), 0);
  refs.summary.innerHTML = [
    metric(t("shared.prefix"), t("shared.viewMetric")),
    metric(formatWeight(totalWeight), t("summary.totalWeight")),
    metric(String(roots.length), t("summary.bags")),
    metric(String(items.length), t("summary.itemsShown"))
  ].join("");
}

function renderPacking() {
  if (isSharedLayoutView()) {
    renderSharedPacking();
    return;
  }
  const layout = state.layouts[state.activeLayoutId] || Object.values(state.layouts || {})[0] || { rootContainerIds: [] };
  const rootIds = getVisibleLayoutRootIds(layout);
  const columns = hasActiveContentFilter() && !isFilterContextActive()
    ? rootIds.filter(containerHasVisibleFilterResult).map(renderFilteredContainer)
    : rootIds.map(renderContainer);
  refs.packingView.innerHTML = `<div class="board">${columns.join("") || `<div class="empty board-empty">${escapeHtml(t("empty.notFound"))}</div>`}</div>`;
  bindPackingEvents(refs.packingView);
  const sharedBoard = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(sharedBoard);
  bindBoardScroll(sharedBoard);
  bindFixedScrollbar(sharedBoard);
}

function renderSharedModeBanner(layout = currentSharedLayout(), { compact = false } = {}) {
  const demoSource = layout?.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  const buttonText = demoSource ? demoCopyActionText() : t("buttons.copyAll");
  const viewerText = demoSource
    ? (uiLanguage === "en"
      ? "Original demo source is read-only."
      : "\u0418\u0441\u0445\u043e\u0434\u043d\u0430\u044f \u0434\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430.")
    : t("shared.viewerText");
  return `
    <div class="shared-mode-banner ${compact ? "shared-mode-banner-compact" : ""}">
      <strong>${escapeHtml(layout?.name || t("shared.layout"))}</strong>
      <span>${escapeHtml(viewerText)}</span>
      <button type="button" class="ghost" data-copy-shared-layout="${escapeHtml(layout?.id || "")}">${escapeHtml(buttonText)}</button>
    </div>
  `;
}

function renderSharedPacking() {
  withSharedVirtualState(() => {
    const layout = state.layouts[state.activeLayoutId] || Object.values(state.layouts || {})[0] || { rootContainerIds: [] };
    const rootIds = layout.rootContainerIds || [];
    const columns = hasActiveContentFilter() && !isFilterContextActive()
      ? rootIds.filter(containerHasVisibleFilterResult).map(renderFilteredContainer)
      : rootIds.map(renderContainer);
    refs.packingView.innerHTML = `
      ${renderSharedModeBanner(currentSharedLayout())}
      <div class="board">${columns.join("") || `<div class="empty board-empty">Ничего не найдено</div>`}</div>
    `;
  });
  bindSharedVirtualEvents(refs.packingView);
  const sharedBoard = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(sharedBoard);
  bindBoardScroll(sharedBoard);
  bindFixedScrollbar(sharedBoard);
  return;
  const layout = currentSharedLayout();
  const roots = getFilteredSharedRootEntries(layout);
  refs.packingView.innerHTML = `
    <div class="shared-mode-banner">
      <strong>${escapeHtml(layout?.name || "Shared укладка")}</strong>
      <span>Вы смотрите укладку другого пользователя. Копирование добавит данные в ваши укладки.</span>
      <button type="button" class="ghost" data-copy-shared-layout="${escapeHtml(layout?.id || "")}">Скопировать всю</button>
    </div>
    <div class="board shared-board-main">
      ${roots.map((root) => renderSharedRootColumn(layout, root)).join("") || `<div class="empty board-empty">Shared укладка пустая</div>`}
    </div>
  `;
  bindSharedLayoutEvents(refs.packingView);
  const board = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(board);
  bindBoardScroll(board);
  bindFixedScrollbar(board);
}

function capturePackingScroll() {
  const board = refs.packingView.querySelector(".board");
  const packingHidden = refs.packingView.classList.contains("hidden");
  if (packingHidden && lastPackingScrollSnapshot) {
    pendingPackingScroll = { ...lastPackingScrollSnapshot };
    return;
  }
  pendingPackingScroll = {
    boardLeft: board?.scrollLeft || 0,
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0
  };
  if (!packingHidden) {
    lastPackingScrollSnapshot = { ...pendingPackingScroll };
  }
}

function captureViewportSnapshot() {
  const board = refs.packingView.querySelector(".board");
  return {
    boardLeft: board?.scrollLeft || 0,
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0
  };
}

function restoreViewportSnapshot(snapshot, focusTarget = null, anchor = null) {
  const apply = () => {
    const board = refs.packingView.querySelector(".board");
    if (board) board.scrollLeft = snapshot.boardLeft;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    const anchorElement = anchor ? findAnchorElement(anchor) : null;
    if (anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const nextY = window.scrollY + rect.top - anchor.top;
      window.scrollTo({ left: snapshot.windowX, top: Math.max(0, nextY), behavior: "auto" });
    } else {
      window.scrollTo({ left: snapshot.windowX, top: snapshot.windowY, behavior: "auto" });
    }
    syncFixedScrollbarVisibility();
  };
  const passes = anchor ? 8 : 2;
  const settle = (remaining) => {
    requestAnimationFrame(() => {
      apply();
      if (remaining > 0) settle(remaining - 1);
    });
  };
  settle(passes);
  if (anchor) {
    window.setTimeout(apply, 120);
    window.setTimeout(apply, 280);
  }
}

function stickyViewportBottom() {
  return [refs.controls, document.querySelector(".tabs-row")]
    .filter(Boolean)
    .reduce((bottom, element) => {
      const style = window.getComputedStyle(element);
      if (style.position !== "sticky" || element.hidden || element.offsetParent === null) return bottom;
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return bottom;
      return Math.max(bottom, rect.bottom);
    }, 0);
}

function captureVisibleContentAnchor() {
  const view = getCurrentView();
  const root = view === "items" ? refs.itemsView : refs.packingView;
  if (!root || root.classList.contains("hidden")) return null;
  const top = stickyViewportBottom() + 1;
  const topContext = view === "packing" ? getTopPackingContextAnchor(root, top) : null;
  if (topContext) return buildVisibleContentAnchor(topContext);
  const itemCandidates = getVisibleAnchorCandidates(root, "[data-item-id], [data-list-item-id]", top);
  const candidates = itemCandidates.length
    ? itemCandidates
    : getVisibleAnchorCandidates(root, "[data-subcontainer-id], [data-root-container-id]", top);
  const first = candidates[0];
  return first ? buildVisibleContentAnchor(first) : null;
}

function buildVisibleContentAnchor(candidate) {
  if (!candidate?.element) return null;
  const { element, rect } = candidate;
  const key = anchorKey(element);
  const openContainerIds = uniqueIds([
    ...(candidate.openContainerIds || []),
    ...getOpenAncestorContainerIds(element)
  ]);
  return key ? { key, top: rect.top, openContainerIds } : null;
}

function getTopPackingContextAnchor(root, top) {
  const containers = [...root.querySelectorAll("[data-subcontainer-id]")]
    .filter((element) => element.offsetParent !== null && !element.classList.contains("collapsed"))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.top <= top && rect.bottom > top)
    .sort((a, b) => b.rect.top - a.rect.top);
  const context = containers[0];
  if (!context) return null;
  const openContainerIds = getOpenAncestorContainerIds(context.element);
  const candidate = getVisibleAnchorCandidates(context.element, "[data-item-id]", top)[0] || context;
  candidate.openContainerIds = openContainerIds;
  return candidate;
}

function getVisibleAnchorCandidates(root, selector, top) {
  return [...root.querySelectorAll(selector)]
    .filter((element) => element.offsetParent !== null)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > top && rect.top < window.innerHeight)
    .sort((a, b) => Math.max(a.rect.top, top) - Math.max(b.rect.top, top));
}

function anchorKey(element) {
  if (element.dataset.itemId) return `item:${element.dataset.itemId}`;
  if (element.dataset.listItemId) return `list-item:${element.dataset.listItemId}`;
  if (element.dataset.subcontainerId) return `container:${element.dataset.subcontainerId}`;
  if (element.dataset.rootContainerId) return `root:${element.dataset.rootContainerId}`;
  return "";
}

function findAnchorElement(anchor) {
  const [type, id] = String(anchor.key || "").split(":");
  if (!type || !id) return null;
  const escapedId = cssEscape(id);
  if (type === "item") return refs.packingView.querySelector(`[data-item-id="${escapedId}"]`);
  if (type === "list-item") return refs.itemsView.querySelector(`[data-list-item-id="${escapedId}"]`);
  if (type === "container") return refs.packingView.querySelector(`[data-subcontainer-id="${escapedId}"]`);
  if (type === "root") return refs.packingView.querySelector(`[data-root-container-id="${escapedId}"]`);
  return null;
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

function getOpenAncestorContainerIds(element) {
  if (getCurrentView() !== "packing") return [];
  const containers = [];
  let current = element.matches?.(".subcontainer") ? element : element.closest(".subcontainer");
  while (current) {
    containers.push(current);
    current = current.parentElement?.closest(".subcontainer") || null;
  }
  return containers
    .filter((container) => !container.classList.contains("collapsed"))
    .map((container) => container.dataset.subcontainerId)
    .filter(Boolean);
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function keepAnchorContainersOpen(anchor) {
  if (!anchor?.openContainerIds?.length) return;
  anchor.openContainerIds.forEach((containerId) => {
    if (state.containers[containerId]) state.collapsedContainers[containerId] = false;
  });
  saveLocalUiState();
}

function restorePendingPackingScroll(board) {
  if (!pendingPackingScroll || !board) return;
  if (refs.packingView.classList.contains("hidden")) return;
  const { boardLeft, windowX, windowY } = pendingPackingScroll;
  pendingPackingScroll = null;
  lastPackingScrollSnapshot = { boardLeft, windowX, windowY };
  board.scrollLeft = boardLeft;
  window.scrollTo({ left: windowX, top: windowY, behavior: "auto" });
  requestAnimationFrame(() => {
    board.scrollLeft = boardLeft;
    window.scrollTo({ left: windowX, top: windowY, behavior: "auto" });
    syncFixedScrollbarVisibility();
  });
}

function renderContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const descendantIds = getDescendantContainerIds(containerId);
  const hasNestedContainers = descendantIds.length > 0;
  const allNestedCollapsed = hasNestedContainers && descendantIds.every((id) => state.collapsedContainers[id]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  return `
    <article class="container-card ${packed ? "packed-container" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          <h2>${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}</h2>
        </div>
        <div class="container-tools">
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          <button
            class="header-icon-button"
            data-edit-container="${container.id}"
            aria-label="Редактировать"
            title="Редактировать"
          >&#9998;</button>
          ${hasNestedContainers ? `
            <button
              class="header-icon-button"
              data-toggle-column="${container.id}"
              aria-label="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
              title="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
            >
              <span class="stack-icon ${allNestedCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
                <span class="stack-chevron stack-chevron-up"></span>
                <span class="stack-chevron stack-chevron-down"></span>
              </span>
            </button>
          ` : ""}
          <span>${formatWeight(total)}</span>
        </div>
      </header>
      ${renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${renderContainerContents(container.id)}
      </div>
    </article>
  `;
}

function renderFilteredContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const packed = state.collectionMode && isContainerPacked(containerId);
  return `
    <article class="container-card ${packed ? "packed-container" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          <h2>${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${highlight(container.name)}</h2>
        </div>
        <div class="container-tools">
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          <button
            class="header-icon-button"
            data-edit-container="${container.id}"
            aria-label="Редактировать"
            title="Редактировать"
          >&#9998;</button>
          <span>${formatWeight(total)}</span>
        </div>
      </header>
      ${renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${renderFilteredContainerContents(container.id)}
      </div>
    </article>
  `;
}

function renderSubcontainer(containerId) {
  const container = state.containers[containerId];
  const collapsed = isFilterContextActive()
    ? getFilterViewCollapsed(
        containerId,
        !shouldExpandContainerForActiveFilter(containerId) && Boolean(state.collapsedContainers[containerId])
      )
    : Boolean(state.collapsedContainers[containerId]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  const title = editingContainerId === container.id
    ? `<input class="container-title-input" data-container-title-input="${container.id}" value="${escapeHtml(container.name)}" />`
    : `<strong data-container-title-text="${container.id}">${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}</strong>`;
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""}" data-subcontainer-id="${container.id}">
      <div class="subcontainer-title">
        <div class="subcontainer-title-main">
          <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${collapsed ? "Развернуть" : "Свернуть"}">
            <span class="chevron-icon ${iconClass}" aria-hidden="true"></span>
          </button>
          ${title}
        </div>
        <div class="subcontainer-tools">
          <button class="header-icon-button add-to-container-button" data-add-to-container="${container.id}" aria-label="Добавить вещь" title="Добавить вещь">+</button>
          <button class="header-icon-button" data-edit-container="${container.id}" aria-label="Редактировать" title="Редактировать">&#9998;</button>
          <span>${formatWeight(containerWeight(containerId))}</span>
        </div>
      </div>
      ${collapsed ? "" : renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${renderContainerContents(container.id)}
      </div>
    </section>
  `;
}

function renderFilteredSubcontainer(containerId) {
  const container = state.containers[containerId];
  const result = getContainerFilterResult(containerId);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const collapsed = getFilterViewCollapsed(containerId, defaultCollapsed);
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  const title = editingContainerId === container.id
    ? `<input class="container-title-input" data-container-title-input="${container.id}" value="${escapeHtml(container.name)}" />`
    : `<strong data-container-title-text="${container.id}">${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${highlight(container.name)}</strong>`;
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""}" data-subcontainer-id="${container.id}">
      <div class="subcontainer-title">
        <div class="subcontainer-title-main">
          <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${collapsed ? "Развернуть" : "Свернуть"}">
            <span class="chevron-icon ${iconClass}" aria-hidden="true"></span>
          </button>
          ${title}
        </div>
        <div class="subcontainer-tools">
          <button class="header-icon-button add-to-container-button" data-add-to-container="${container.id}" aria-label="Добавить вещь" title="Добавить вещь">+</button>
          <button class="header-icon-button" data-edit-container="${container.id}" aria-label="Редактировать" title="Редактировать">&#9998;</button>
          <span>${formatWeight(containerWeight(containerId))}</span>
        </div>
      </div>
      ${collapsed ? "" : renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${collapsed ? "" : renderFilteredContainerContents(container.id)}
      </div>
    </section>
  `;
}

function renderContainerContents(containerId) {
  const container = state.containers[containerId];
  migrateContainerOrder(state);
  return container.order.map((entry) => {
    if (entry.type === "item") {
      const item = state.items[entry.id];
      if (!item || (!isFilterContextActive() && !matchesFilters(item))) return "";
      if (isItemRemovedFromActiveLayout(item)) return "";
      return renderItemCard(item);
    }
    if (entry.type === "container") return renderSubcontainer(entry.id);
    return "";
  }).join("");
}

function renderFilteredContainerContents(containerId) {
  const container = state.containers[containerId];
  migrateContainerOrder(state);
  return container.order.map((entry) => {
    if (entry.type === "item") {
      const item = state.items[entry.id];
      if (!item || !matchesFilters(item)) return "";
      if (isItemRemovedFromActiveLayout(item)) return "";
      return renderItemCard(item);
    }
    if (entry.type === "container") {
      if (!containerHasVisibleFilterResult(entry.id)) return "";
      return renderFilteredSubcontainer(entry.id);
    }
    return "";
  }).join("");
}

function hasActiveContentFilter(view = getCurrentView()) {
  const categoryActive = view === "bags" ? false : selectedCategoryFilters.length > 0;
  return Boolean(refs.searchInput.value.trim() || refs.locationFilter.value || categoryActive);
}

function isFilterContextActive() {
  return Boolean(state.showFilterContext && hasActiveContentFilter());
}

function shouldExpandContainerForActiveFilter(containerId) {
  if (!hasActiveContentFilter()) return false;
  const result = getContainerFilterResult(containerId);
  return Boolean(result.hasMatchingItems || result.hasVisibleChildContainers);
}

function contentFilterSignature() {
  if (!hasActiveContentFilter()) return "";
  const view = getCurrentView();
  return [
    state.activeLayoutId,
    refs.searchInput.value.trim().toLowerCase(),
    refs.locationFilter.value,
    view === "bags" ? "" : selectedCategoryFilters.join(","),
    state.collectionMode && state.showOnlyUnpacked ? "unpacked" : ""
  ].join("\u001f");
}

function ensureFilterViewCollapseState() {
  const signature = contentFilterSignature();
  if (signature !== filterViewCollapseSignature) {
    filterViewCollapseSignature = signature;
    filterViewCollapsedContainers = {};
  }
}

function getFilterViewCollapsed(containerId, defaultCollapsed) {
  ensureFilterViewCollapseState();
  if (Object.prototype.hasOwnProperty.call(filterViewCollapsedContainers, containerId)) {
    return filterViewCollapsedContainers[containerId];
  }
  return defaultCollapsed;
}

function toggleFilterViewCollapsed(containerId) {
  const result = getContainerFilterResult(containerId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const current = getFilterViewCollapsed(containerId, defaultCollapsed);
  filterViewCollapsedContainers[containerId] = !current;
}

function containerTitleMatchesSearch(container) {
  const query = refs.searchInput.value.trim().toLowerCase();
  if (!query) return false;
  return container.name.toLowerCase().includes(query);
}

function containerHasVisibleFilterResult(containerId) {
  return getContainerFilterResult(containerId).visible;
}

function getContainerFilterResult(containerId) {
  const container = state.containers[containerId];
  if (!container) {
    return { visible: false, titleMatch: false, hasMatchingItems: false, hasVisibleChildContainers: false };
  }
  let hasMatchingItems = false;
  let hasVisibleChildContainers = false;
  (container.order || []).forEach((entry) => {
    if (entry.type === "item") {
      const item = state.items[entry.id];
      if (item && !isItemRemovedFromActiveLayout(item) && matchesFilters(item)) hasMatchingItems = true;
      return;
    }
    if (entry.type === "container" && containerHasVisibleFilterResult(entry.id)) {
      hasVisibleChildContainers = true;
    }
  });
  const titleMatch = containerTitleMatchesSearch(container);
  return {
    visible: titleMatch || hasMatchingItems || hasVisibleChildContainers,
    titleMatch,
    hasMatchingItems,
    hasVisibleChildContainers
  };
}

function isItemRemovedFromActiveLayout(item) {
  return !item?.containerId;
}

function isItemPacked(itemId) {
  return Boolean(state.packedItems?.[itemId]);
}

function getContainerItemIdsDeep(containerId) {
  const container = state.containers[containerId];
  if (!container) return [];
  return [
    ...(container.itemIds || []),
    ...(container.childIds || []).flatMap((childId) => getContainerItemIdsDeep(childId))
  ].filter((itemId) => state.items[itemId] && !isItemRemovedFromActiveLayout(state.items[itemId]));
}

function isContainerPacked(containerId) {
  const itemIds = getContainerItemIdsDeep(containerId);
  return itemIds.length > 0 && itemIds.every(isItemPacked);
}

function startInlineItemTitleEdit(itemId) {
  if (!state.items[itemId] || editingItemTitleId === itemId) return;
  editingItemTitleId = itemId;
  editingContainerId = null;
  renderPreservingPackingScroll();
}

function togglePacked(itemId) {
  if (!state.items[itemId]) return;
  capturePackingScroll();
  const changedAt = nowIso();
  state.packedItems = state.packedItems || {};
  if (state.packedItems[itemId]) delete state.packedItems[itemId];
  else state.packedItems[itemId] = true;
  touchItem(itemId, changedAt);
  saveState();
  render();
}

function unpackAllItems() {
  if (!Object.values(state.packedItems || {}).some(Boolean)) return;
  openConfirmDialog({
    title: "Разобрать все вещи?",
    text: "Все отметки «собрано» будут сняты. Сами вещи и укладка останутся на месте.",
    okText: "Разобрать",
    onConfirm: () => {
      capturePackingScroll();
      const changedAt = nowIso();
      Object.keys(state.packedItems || {}).forEach((itemId) => touchItem(itemId, changedAt));
      state.packedItems = {};
      state.showOnlyUnpacked = false;
      saveState();
      render();
    }
  });
}

function renderItemCard(item) {
  const packed = isItemPacked(item.id);
  const collection = Boolean(state.collectionMode);
  const filterMatch = isFilterContextActive() && matchesFilters(item);
  const title = editingItemTitleId === item.id
    ? `<input class="item-title-input" data-item-title-input="${item.id}" value="${escapeHtml(item.name)}" />`
    : `<strong class="item-title" data-item-drag="${item.id}">${highlight(item.name)}${renderItemQuantityText(item)}</strong>`;
  return `
    <article class="item-card ${packed ? "packed-item" : ""} ${filterMatch ? "filter-match" : ""} ${recentlyAddedItemId === item.id ? "just-added" : ""}" data-item-id="${item.id}" ${filterMatch ? `data-filter-match-id="${item.id}"` : ""}>
      <div class="item-card-top ${collection ? "with-pack-toggle" : ""}">
        ${collection ? `
          <button
            class="pack-toggle ${packed ? "packed" : ""}"
            data-toggle-packed="${item.id}"
            aria-label="${packed ? "Отметить как не собранное" : "Отметить как собранное"}"
            title="${packed ? "Собрано" : "Не собрано"}"
          >${packed ? "✓" : ""}</button>
        ` : ""}
        ${title}
        <button class="copy-item-button" data-copy-layout-item="${item.id}" aria-label="Скопировать" title="Скопировать">
          <span aria-hidden="true">⧉</span>
        </button>
        <button class="edit-button" data-edit-item="${item.id}" aria-label="Редактировать" title="Редактировать">
          <span aria-hidden="true">&#9998;</span>
        </button>
        <button class="remove-layout-button" data-remove-from-layout="${item.id}" aria-label="Убрать из укладки" title="Убрать из укладки">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="meta ${state.showItemMeta ? "" : "meta-hidden"}">
        <span class="pill">${formatItemWeight(item)}</span>
        ${itemCategories(item).map((category) => `<span class="pill">${highlight(category)}</span>`).join("")}
        <span class="pill ${item.location === "Не знаю где" || item.location === "Надо купить" ? "warn" : ""}">${highlight(item.location)}</span>
      </div>
      ${renderItemPhoto(item)}
    </article>
  `;
}

function renderItemPhoto(item, { force = false } = {}) {
  if (!state.showItemMeta) return "";
  const photo = primaryItemPhoto(item);
  if (!photo) return "";
  const localId = photo.localId || photo.id;
  const src = photoRemoteSrc(photo) || (localId && photoObjectUrls.get(localId)) || "";
  const statusText = src ? "" : photo.status === "pending" ? "ждёт загрузки" :
    photo.status === "uploading" ? "загружается" :
      photo.status === "error" ? "ошибка загрузки" :
        photo.status === "missing-local-file" ? "нет локального файла" : "";
  return `
    <div class="item-photo ${!src && photo.status !== "synced" ? "item-photo-pending" : ""}">
      <img
        ${src ? `src="${escapeHtml(src)}"` : `data-photo-local-id="${escapeHtml(localId)}"`}
        alt=""
        loading="lazy"
      />
      ${statusText ? `<span>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

function photoRemoteSrc(photo) {
  normalizePhotoUrlFields(photo);
  const src = photo?.thumbUrl || photo?.url || "";
  return versionedPhotoUrl(src, photo?.updatedAt || photo?.id || "");
}

function versionedPhotoUrl(src, version) {
  if (!src || !version || /^(blob|data):/i.test(src)) return src || "";
  try {
    const url = new URL(src, window.location.href);
    url.searchParams.set("v", String(version));
    return url.href;
  } catch {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}v=${encodeURIComponent(String(version))}`;
  }
}

async function hydrateItemPhotos(root = document) {
  const images = [...root.querySelectorAll("img[data-photo-local-id]")];
  await Promise.all(images.map(async (image) => {
    const localId = image.dataset.photoLocalId;
    const existingUrl = photoObjectUrls.get(localId);
    if (existingUrl) {
      image.src = existingUrl;
      image.removeAttribute("data-photo-local-id");
      return;
    }
    const cached = await getCachedPhoto(localId);
    const blob = cached?.thumbBlob || cached?.blob;
    if (!blob) return;
    image.src = getPhotoObjectUrl(localId, blob);
    image.removeAttribute("data-photo-local-id");
  }));
}

function getPhotoObjectUrl(id, blob) {
  if (photoObjectUrls.has(id)) return photoObjectUrls.get(id);
  const url = URL.createObjectURL(blob);
  photoObjectUrls.set(id, url);
  return url;
}

function bindPackingEvents(root) {
  const placeholder = document.createElement("div");
  placeholder.className = "drop-placeholder";
  bindPointerPackingDrag(root, placeholder);
  bindRootColumnDrag(root);

  root.querySelectorAll("[data-item-drag]").forEach((handle) => {
    const editTitle = (event) => {
      if (event.target.closest("button, input")) return;
      if (document.body.classList.contains("dragging-ui")) return;
      const card = handle.closest(".item-card");
      if (card?.dataset.justDragged === "true") return;
      event.preventDefault();
      startInlineItemTitleEdit(handle.dataset.itemDrag);
    };
    handle.addEventListener("click", (event) => {
      const itemId = handle.dataset.itemDrag;
      const now = Date.now();
      const isDoubleTap = event.detail === 2 || (lastItemTitleTap.id === itemId && now - lastItemTitleTap.time < 360);
      if (isDoubleTap) {
        lastItemTitleTap = { id: "", time: 0 };
        editTitle(event);
        return;
      }
      lastItemTitleTap = { id: itemId, time: now };
    });
    handle.addEventListener("dblclick", editTitle);
    handle.addEventListener("dragstart", (event) => {
      const card = handle.closest(".item-card");
      draggingItemId = handle.dataset.itemDrag;
      draggingContainerId = null;
      card?.classList.add("dragging");
      event.dataTransfer.setData("text/item-id", draggingItemId);
      event.dataTransfer.setData("text/plain", draggingItemId);
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      handle.closest(".item-card")?.classList.remove("dragging");
      draggingItemId = null;
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll("[data-item-title-input]").forEach((input) => {
    input.focus({ preventScroll: true });
    input.select();
    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      const itemId = input.dataset.itemTitleInput;
      const value = input.value.trim();
      capturePackingScroll();
      if (value && state.items[itemId]) {
        state.items[itemId].name = value;
        touchItem(itemId);
        saveState();
      }
      editingItemTitleId = null;
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      capturePackingScroll();
      editingItemTitleId = null;
      render();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
  });

  root.querySelectorAll("[data-container-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      draggingContainerId = handle.dataset.containerDrag;
      draggingItemId = null;
      handle.classList.add("dragging");
      handle.closest(".subcontainer")?.classList.add("dragging");
      event.dataTransfer.setData("text/container-id", draggingContainerId);
      event.dataTransfer.setData("text/plain", `container:${draggingContainerId}`);
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      handle.classList.remove("dragging");
      handle.closest(".subcontainer")?.classList.remove("dragging");
      draggingContainerId = null;
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll(".subcontainer-title").forEach((title) => {
    title.draggable = false;
    let clickTimer = null;
    title.addEventListener("click", (event) => {
      if (event.target.closest("button, input")) return;
      if (document.body.classList.contains("dragging-ui")) return;
      const subcontainer = title.closest(".subcontainer");
      if (subcontainer?.dataset.justDragged === "true") return;
      const containerId = subcontainer?.dataset.subcontainerId;
      if (!containerId || editingContainerId === containerId) return;
      if (event.detail !== 1) return;
      clickTimer = window.setTimeout(() => {
        capturePackingScroll();
        state.collapsedContainers[containerId] = !state.collapsedContainers[containerId];
        saveLocalUiState();
        render();
      }, 180);
    });
    title.addEventListener("dblclick", (event) => {
      if (event.target.closest("button, input")) return;
      event.preventDefault();
      if (clickTimer) window.clearTimeout(clickTimer);
      const containerId = title.closest(".subcontainer")?.dataset.subcontainerId;
      if (!containerId) return;
      editingContainerId = containerId;
      editingItemTitleId = null;
      renderPreservingPackingScroll();
    });
    title.addEventListener("dragstart", (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
      const containerId = title.closest(".subcontainer")?.dataset.subcontainerId;
      if (!containerId) return;
      draggingContainerId = containerId;
      draggingItemId = null;
      title.closest(".subcontainer")?.classList.add("dragging");
      event.dataTransfer.setData("text/container-id", containerId);
      event.dataTransfer.setData("text/plain", `container:${containerId}`);
      event.dataTransfer.effectAllowed = "move";
    });
    title.addEventListener("dragend", () => {
      title.closest(".subcontainer")?.classList.remove("dragging");
      draggingContainerId = null;
      cleanupDropState(root, placeholder);
    });
  });

  root.querySelectorAll("[data-container-title-input]").forEach((input) => {
    input.focus({ preventScroll: true });
    input.select();
    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      const containerId = input.dataset.containerTitleInput;
      const value = input.value.trim();
      capturePackingScroll();
      if (value && state.containers[containerId]) {
        state.containers[containerId].name = value;
        touchContainer(containerId);
        saveState();
      }
      editingContainerId = null;
      render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      capturePackingScroll();
      editingContainerId = null;
      render();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
  });

  root.querySelectorAll(".dropzone").forEach((zone) => {
    zone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) return;
      markDropzoneDragOver(root, zone);
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) {
        removeDropzoneDragOver(zone);
        if (placeholder.parentElement === zone) placeholder.remove();
        return;
      }
      markDropzoneDragOver(root, zone);
      if (draggingContainerId) {
        const afterEntry = getEntryAfterPointer(zone, event.clientY);
        placePlaceholder(zone, placeholder, afterEntry);
        if (isOriginalContainerPosition(zone, placeholder)) {
          removeDropzoneDragOver(zone);
          placeholder.remove();
        }
      } else {
        const afterEntry = getEntryAfterPointer(zone, event.clientY);
        placePlaceholder(zone, placeholder, afterEntry);
        if (isOriginalItemPosition(zone, placeholder)) {
          removeDropzoneDragOver(zone);
          placeholder.remove();
        }
      }
    });
    zone.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget || zone.contains(event.relatedTarget)) return;
      removeDropzoneDragOver(zone);
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isBlockedDropzone(zone)) {
        cleanupDropState(root, placeholder);
        return;
      }
      const plainData = event.dataTransfer.getData("text/plain");
      const containerId = event.dataTransfer.getData("text/container-id") ||
        (plainData.startsWith("container:") ? plainData.slice("container:".length) : "");
      if (containerId) {
        if (placeholder.parentElement !== zone) {
          cleanupDropState(root, placeholder);
          draggingContainerId = null;
          return;
        }
        const containerIndex = getPlaceholderContainerIndex(zone, placeholder);
        cleanupDropState(root, placeholder);
        draggingContainerId = null;
        moveContainer(containerId, zone.dataset.containerId, containerIndex);
        return;
      }
      const itemId = event.dataTransfer.getData("text/item-id") || plainData;
      if (itemId) {
        if (placeholder.parentElement !== zone) {
          cleanupDropState(root, placeholder);
          draggingItemId = null;
          return;
        }
        const itemIndex = getPlaceholderItemIndex(zone, placeholder);
        cleanupDropState(root, placeholder);
        draggingItemId = null;
        moveItem(itemId, zone.dataset.containerId, itemIndex);
      }
    });
  });

  root.querySelectorAll("[data-move-item]").forEach((select) => {
    select.addEventListener("change", () => moveItem(select.dataset.moveItem, select.value));
  });

  root.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => openItemDialog(button.dataset.editItem));
  });

  root.querySelectorAll("[data-edit-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openRootContainerDialog(button.dataset.editContainer);
    });
  });

  root.querySelectorAll("[data-add-to-container]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openAddToContainerDialog(button.dataset.addToContainer);
    });
  });

  root.querySelectorAll("[data-toggle-packed]").forEach((button) => {
    button.addEventListener("click", () => togglePacked(button.dataset.togglePacked));
  });

  root.querySelectorAll("[data-remove-from-layout]").forEach((button) => {
    button.addEventListener("click", () => confirmRemoveItemFromActiveLayout(button.dataset.removeFromLayout));
  });
  root.querySelectorAll("[data-copy-layout-item]").forEach((button) => {
    button.addEventListener("click", () => copyItem(button.dataset.copyLayoutItem, { keepPlacement: true }));
  });

  root.querySelectorAll("[data-toggle-container]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerId = button.dataset.toggleContainer;
      capturePackingScroll();
      if (hasActiveContentFilter()) {
        toggleFilterViewCollapsed(containerId);
        render();
        return;
      }
      state.collapsedContainers[containerId] = !state.collapsedContainers[containerId];
      saveLocalUiState();
      render();
    });
  });

  root.querySelectorAll("[data-toggle-column]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerIds = getDescendantContainerIds(button.dataset.toggleColumn);
      const shouldCollapse = containerIds.some((id) => !state.collapsedContainers[id]);
      capturePackingScroll();
      containerIds.forEach((id) => {
        state.collapsedContainers[id] = shouldCollapse;
      });
      saveLocalUiState();
      render();
    });
  });
}

function needsHoldToDrag(event) {
  return event.pointerType === "touch" || event.pointerType === "pen" || event.type?.startsWith("touch");
}

function isHoldDragInput(inputType) {
  return inputType === "touch" || inputType === "pen";
}

function vibrateDragStart(input) {
  const shouldVibrate = typeof input === "string" ? isHoldDragInput(input) : needsHoldToDrag(input);
  if (!shouldVibrate || !navigator.vibrate) return;
  navigator.vibrate(12);
}

function getTouchPoint(event) {
  return event.touches?.[0] || event.changedTouches?.[0] || null;
}

function markDragPending(source) {
  source.classList.add("drag-pending");
  document.body.classList.add("drag-pending-ui");
}

function clearDragPending(source) {
  source.classList.remove("drag-pending");
  document.body.classList.remove("drag-pending-ui");
}

function preventDragContextMenu(event) {
  if (!document.body.classList.contains("drag-pending-ui") && !document.body.classList.contains("dragging-ui")) return;
  event.preventDefault();
}

function createPreDragScroller(board, startX, startY) {
  let axis = null;
  let lastX = startX;
  let lastY = startY;
  let frame = null;
  let pendingX = 0;
  let pendingY = 0;

  const apply = () => {
    frame = null;
    if (axis === "x" && board) {
      board.scrollLeft -= pendingX;
    } else if (axis === "y") {
      window.scrollBy({ left: 0, top: -pendingY, behavior: "auto" });
    }
    pendingX = 0;
    pendingY = 0;
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  const update = (clientX, clientY) => {
    const dx = clientX - startX;
    const dy = clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!axis) {
      if (Math.max(absX, absY) < 5) return;
      axis = absX > absY * 1.15 ? "x" : "y";
    }
    if (axis === "x") {
      pendingX += clientX - lastX;
    } else {
      pendingY += clientY - lastY;
    }
    lastX = clientX;
    lastY = clientY;
    schedule();
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  };

  return { update, stop };
}

function createBoardEdgeScroller(board, onScroll) {
  let frame = null;
  let speedX = 0;
  let speedY = 0;

  const scrollTarget = (target, delta) => {
    if (!target || !delta) return false;
    const before = target.scrollLeft;
    target.scrollTo({ left: before + delta, behavior: "auto" });
    if (target.scrollLeft !== before) return true;
    target.scrollLeft = before + delta;
    return target.scrollLeft !== before;
  };

  const scrollPageX = (delta) => {
    const page = document.scrollingElement || document.documentElement;
    const maxScroll = Math.max(0, page.scrollWidth - page.clientWidth);
    if (!maxScroll) return false;
    const before = window.scrollX || page.scrollLeft;
    window.scrollBy({ left: delta, top: 0, behavior: "auto" });
    return (window.scrollX || page.scrollLeft) !== before;
  };

  const scrollPageY = (delta) => {
    const page = document.scrollingElement || document.documentElement;
    const maxScroll = Math.max(0, page.scrollHeight - page.clientHeight);
    if (!maxScroll) return false;
    const before = window.scrollY || page.scrollTop;
    window.scrollBy({ left: 0, top: delta, behavior: "auto" });
    return (window.scrollY || page.scrollTop) !== before;
  };

  const tick = () => {
    frame = null;
    if (!board || (!speedX && !speedY)) return;
    const movedX = speedX ? (scrollTarget(board, speedX) || scrollPageX(speedX)) : false;
    const movedY = speedY ? scrollPageY(speedY) : false;
    const moved = movedX || movedY;
    if (moved) onScroll?.();
    if (!moved) {
      speedX = 0;
      speedY = 0;
      board.classList.remove("edge-scrolling");
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const update = (clientX, clientY) => {
    if (!board) return;
    const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    const viewportLeft = window.visualViewport?.offsetLeft || 0;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportTop = window.visualViewport?.offsetTop || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    const horizontalZone = Math.min(EDGE_SCROLL_ZONE, viewportWidth / 3);
    const verticalZone = Math.min(EDGE_SCROLL_ZONE, viewportHeight / 4);
    const leftDistance = clientX - viewportLeft;
    const rightDistance = viewportRight - clientX;
    const topDistance = clientY - viewportTop;
    const bottomDistance = viewportBottom - clientY;
    if (leftDistance < horizontalZone) {
      const ratio = Math.max(0, Math.min(1, (horizontalZone - leftDistance) / horizontalZone)) ** 1.35;
      speedX = -Math.ceil(ratio * EDGE_SCROLL_MAX_SPEED);
    } else if (rightDistance < horizontalZone) {
      const ratio = Math.max(0, Math.min(1, (horizontalZone - rightDistance) / horizontalZone)) ** 1.35;
      speedX = Math.ceil(ratio * EDGE_SCROLL_MAX_SPEED);
    } else {
      speedX = 0;
    }
    if (topDistance < verticalZone) {
      const ratio = Math.max(0, Math.min(1, (verticalZone - topDistance) / verticalZone)) ** 1.35;
      speedY = -Math.ceil(ratio * EDGE_SCROLL_MAX_SPEED);
    } else if (bottomDistance < verticalZone) {
      const ratio = Math.max(0, Math.min(1, (verticalZone - bottomDistance) / verticalZone)) ** 1.35;
      speedY = Math.ceil(ratio * EDGE_SCROLL_MAX_SPEED);
    } else {
      speedY = 0;
    }
    const page = document.scrollingElement || document.documentElement;
    const pageMaxScroll = Math.max(0, page.scrollWidth - page.clientWidth);
    const pageMaxScrollY = Math.max(0, page.scrollHeight - page.clientHeight);
    const pageScrollLeft = window.scrollX || page.scrollLeft;
    const pageScrollTop = window.scrollY || page.scrollTop;
    const canScrollLeft = board.scrollLeft > 0 || pageScrollLeft > 0;
    const canScrollRight = board.scrollLeft < maxScroll || pageScrollLeft < pageMaxScroll;
    const canScrollUp = pageScrollTop > 0;
    const canScrollDown = pageScrollTop < pageMaxScrollY;
    if (speedX < 0 && !canScrollLeft) speedX = 0;
    if (speedX > 0 && !canScrollRight) speedX = 0;
    if (speedY < 0 && !canScrollUp) speedY = 0;
    if (speedY > 0 && !canScrollDown) speedY = 0;
    board.classList.toggle("edge-scrolling", Boolean(speedX || speedY));
    if ((speedX || speedY) && !frame) frame = requestAnimationFrame(tick);
  };

  const stop = () => {
    speedX = 0;
    speedY = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    if (!board) return;
    const lockedLeft = board.scrollLeft;
    board.scrollTo({ left: lockedLeft, behavior: "auto" });
    window.setTimeout(() => {
      board.scrollTo({ left: lockedLeft, behavior: "auto" });
      board.classList.remove("edge-scrolling");
    }, 180);
  };

  return { update, stop };
}

function bindRootColumnDrag(root) {
  const board = root.querySelector(".board");
  if (!board) return;

  root.querySelectorAll(".container-card > .container-header").forEach((header) => {
    header.addEventListener("contextmenu", preventDragContextMenu);
    const startColumnDrag = (event, inputType = "pointer") => {
      const point = inputType === "touch" ? getTouchPoint(event) : event;
      if (!point) return;
      if (inputType !== "touch" && event.button !== 0) return;
      if (event.target.closest("button")) return;
      const source = header.closest(".container-card");
      const containerId = source?.dataset.rootContainerId;
      if (!source || !containerId) return;

      const holdInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
      const needsHold = isHoldDragInput(holdInput);
      if (needsHold) {
        if (inputType !== "touch") markDragPending(source);
        if (inputType !== "touch") {
          event.preventDefault();
          header.setPointerCapture?.(event.pointerId);
        }
      }
      let started = false;
      let canceled = false;
      let finished = false;
      let preScrollGesture = false;
      const startX = point.clientX;
      const startY = point.clientY;
      let latestX = startX;
      let latestY = startY;
      let ghost = null;
      let ghostFrame = null;
      let ghostX = startX;
      let ghostY = startY;
      let ghostTargetX = startX;
      let ghostTargetY = startY;
      let currentIndex = -1;
      let holdTimer = null;
      let blockingTouchMove = false;
      const preDragScroller = createPreDragScroller(board, startX, startY);
      const edgeScroller = createBoardEdgeScroller(board, () => {
        if (started) place(latestX);
      });
      const rect = source.getBoundingClientRect();
      const placeholder = document.createElement("div");
      placeholder.className = "column-placeholder";
      placeholder.style.width = `${rect.width}px`;

      const begin = () => {
        if (started) return;
        started = true;
        if (inputType === "touch" && !blockingTouchMove) {
          document.removeEventListener("touchmove", onMove);
          document.addEventListener("touchmove", onMove, { passive: false });
          blockingTouchMove = true;
        } else {
          event.preventDefault();
        }
        clearDragPending(source);
        document.body.classList.add("dragging-ui");
        vibrateDragStart(holdInput);
        source.classList.add("dragging");
        ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost", "column-ghost");
        ghost.style.width = `${rect.width}px`;
        document.body.appendChild(ghost);
        board.insertBefore(placeholder, source);
        source.classList.add("drag-source-collapsed");
        moveGhost(latestX, latestY, true);
        edgeScroller.update(latestX, latestY);
      };

      const moveGhost = (clientX, clientY, immediate = false) => {
        if (!ghost) return;
        ghostTargetX = clientX;
        ghostTargetY = clientY;
        if (immediate) {
          ghostX = clientX;
          ghostY = clientY;
          ghost.style.left = `${ghostX}px`;
          ghost.style.top = `${ghostY}px`;
          return;
        }
        if (ghostFrame) return;
        const tick = () => {
          ghostX += (ghostTargetX - ghostX) * 0.45;
          ghostY += (ghostTargetY - ghostY) * 0.45;
          ghost.style.left = `${ghostX}px`;
          ghost.style.top = `${ghostY}px`;
          if (Math.abs(ghostTargetX - ghostX) < 0.5 && Math.abs(ghostTargetY - ghostY) < 0.5) {
            ghost.style.left = `${ghostTargetX}px`;
            ghost.style.top = `${ghostTargetY}px`;
            ghostFrame = null;
            return;
          }
          ghostFrame = requestAnimationFrame(tick);
        };
        ghostFrame = requestAnimationFrame(tick);
      };

      const place = (clientX) => {
        const cards = [...board.children].filter((child) =>
          child.classList?.contains("container-card") && child !== source && !child.classList.contains("dragging")
        );
        const after = cards.reduce(
          (closest, card) => {
            const box = card.getBoundingClientRect();
            const offset = clientX - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) return { offset, card };
            return closest;
          },
          { offset: Number.NEGATIVE_INFINITY, card: null }
        ).card;
        placePlaceholder(board, placeholder, after);
        currentIndex = getColumnPlaceholderIndex(board, placeholder);
        placeholder.classList.remove("hidden");
      };

      const onMove = (moveEvent) => {
        const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
        if (!movePoint) return;
        latestX = movePoint.clientX;
        latestY = movePoint.clientY;
        const dx = movePoint.clientX - startX;
        const dy = movePoint.clientY - startY;
        if (!started) {
          if (needsHold) {
            const distance = Math.hypot(dx, dy);
            const cancelDistance = inputType === "touch" ? TOUCH_SCROLL_CANCEL_DISTANCE : TOUCH_DRAG_CANCEL_DISTANCE;
            if (distance > cancelDistance && !preScrollGesture) {
              if (holdTimer) {
                window.clearTimeout(holdTimer);
                holdTimer = null;
              }
              canceled = true;
              clearDragPending(source);
              preScrollGesture = true;
            }
            if (!started && preScrollGesture && inputType !== "touch") {
              moveEvent.preventDefault();
              preDragScroller.update(movePoint.clientX, movePoint.clientY);
            }
            if (!started) return;
          }
          if (Math.hypot(dx, dy) < POINTER_DRAG_START_DISTANCE) return;
          begin();
      }
      moveEvent.preventDefault();
      begin();
        moveGhost(movePoint.clientX, movePoint.clientY);
        edgeScroller.update(movePoint.clientX, movePoint.clientY);
        place(movePoint.clientX);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        if (holdTimer) window.clearTimeout(holdTimer);
        preDragScroller.stop();
        if (started) edgeScroller.stop();
        if (inputType !== "touch" && header.hasPointerCapture?.(event.pointerId)) {
          header.releasePointerCapture(event.pointerId);
        }
        if (!canceled && started && currentIndex >= 0 && !isOriginalRootColumnPosition(containerId, currentIndex)) {
          moveRootColumn(containerId, currentIndex);
        }
        if (ghostFrame) cancelAnimationFrame(ghostFrame);
        ghost?.remove();
        placeholder.remove();
        clearDragPending(source);
        source.classList.remove("dragging");
        source.classList.remove("drag-source-collapsed");
        document.body.classList.remove("dragging-ui");
        if (inputType === "touch") {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", finish);
          document.removeEventListener("touchcancel", finish);
        } else {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", finish);
          document.removeEventListener("pointercancel", finish);
        }
        document.removeEventListener("keydown", onKeyDown);
      };

      const onKeyDown = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        canceled = true;
        finish();
      };

      if (needsHold) {
        holdTimer = window.setTimeout(begin, TOUCH_DRAG_DELAY_MS);
      }
      if (inputType === "touch") {
        document.addEventListener("touchmove", onMove, { passive: true });
        document.addEventListener("touchend", finish, { passive: false });
        document.addEventListener("touchcancel", finish, { passive: false });
      } else {
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", finish);
        document.addEventListener("pointercancel", finish);
      }
      document.addEventListener("keydown", onKeyDown);
    };

    header.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      startColumnDrag(event);
    });
    header.addEventListener("touchstart", (event) => startColumnDrag(event, "touch"), { passive: true });
  });
}

function bindPointerPackingDrag(root, placeholder) {
  const startDrag = ({ kind, id, handle, source, event, inputType = "pointer" }) => {
    const point = inputType === "touch" ? getTouchPoint(event) : event;
    if (!point) return;
    if (inputType !== "touch" && event.button !== 0) return;

    const holdInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
    const needsHold = isHoldDragInput(holdInput);
    if (needsHold) {
      if (inputType !== "touch") markDragPending(source);
      if (inputType !== "touch") {
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
      }
    }
    let started = false;
    let canceled = false;
    let finished = false;
    let preScrollGesture = false;
    let currentZone = null;
    let groupTargetItemId = null;
    let packageTargetContainerId = null;
    let packageTargetUsesPointer = false;
    let itemIntoDraggedContainerId = null;
    let nestedGroupCandidateItemId = null;
    let nestedGroupCandidateStartedAt = 0;
    let nestedGroupCandidateTimer = null;
    const startX = point.clientX;
    const startY = point.clientY;
    let latestX = startX;
    let latestY = startY;
    let ghost = null;
    let ghostFrame = null;
    let ghostX = startX;
    let ghostY = startY;
    let ghostTargetX = startX;
    let ghostTargetY = startY;
    let holdTimer = null;
    let blockingTouchMove = false;
    const board = root.querySelector(".board");
    const preDragScroller = createPreDragScroller(board, startX, startY);
    const edgeScroller = createBoardEdgeScroller(board, () => {
      if (!started) return;
      place(latestX, latestY);
    });
    const sourceRect = source.getBoundingClientRect();
    const dragOffsetX = startX - sourceRect.left;
    const dragOffsetY = startY - sourceRect.top;

    const resetNestedGroupCandidate = () => {
      nestedGroupCandidateItemId = null;
      nestedGroupCandidateStartedAt = 0;
      if (nestedGroupCandidateTimer) window.clearTimeout(nestedGroupCandidateTimer);
      nestedGroupCandidateTimer = null;
    };

    const canActivateGroupTarget = (targetCard, targetItemId, clientX, clientY) => {
      if (!isInsideGroupDropZone(targetCard, clientX, clientY)) {
        resetNestedGroupCandidate();
        return false;
      }
      if (!isCardInsideOpenSubcontainer(targetCard)) {
        resetNestedGroupCandidate();
        return true;
      }
      const now = performance.now();
      if (nestedGroupCandidateItemId !== targetItemId) {
        resetNestedGroupCandidate();
        nestedGroupCandidateItemId = targetItemId;
        nestedGroupCandidateStartedAt = now;
        nestedGroupCandidateTimer = window.setTimeout(() => {
          nestedGroupCandidateTimer = null;
          if (started && !finished) place(latestX, latestY);
        }, NESTED_GROUP_HOVER_DELAY_MS);
        return false;
      }
      return now - nestedGroupCandidateStartedAt >= NESTED_GROUP_HOVER_DELAY_MS;
    };

    const begin = () => {
      if (started) return;
      started = true;
      if (inputType === "touch" && !blockingTouchMove) {
        document.removeEventListener("touchmove", onMove);
        document.addEventListener("touchmove", onMove, { passive: false });
        blockingTouchMove = true;
      } else {
        event.preventDefault();
      }
      clearDragPending(source);
      document.body.classList.add("dragging-ui");
      vibrateDragStart(holdInput);
      draggingItemId = kind === "item" ? id : null;
      draggingContainerId = kind === "container" ? id : null;
      source.classList.add("dragging");
      ghost = source.cloneNode(true);
      ghost.classList.add("drag-ghost");
      if (kind === "item") ghost.classList.add("item-ghost");
      ghost.style.width = `${sourceRect.width}px`;
      ghost.style.transform = "none";
      placeholder.style.height = `${sourceRect.height}px`;
      placeholder.style.width = `${sourceRect.width}px`;
      placeholder.style.maxWidth = "100%";
      document.body.appendChild(ghost);
      placePlaceholder(source.parentElement, placeholder, source);
      source.classList.add("drag-source-collapsed");
      moveGhost(latestX, latestY, true);
      edgeScroller.update(latestX, latestY);
    };

    const moveGhost = (clientX, clientY, immediate = false) => {
      if (!ghost) return;
      const targetLeft = clientX - dragOffsetX;
      const targetTop = clientY - dragOffsetY;
      ghostTargetX = targetLeft;
      ghostTargetY = targetTop;
      if (immediate) {
        ghostX = targetLeft;
        ghostY = targetTop;
        ghost.style.left = `${ghostX}px`;
        ghost.style.top = `${ghostY}px`;
        return;
      }
      if (ghostFrame) return;
      const tick = () => {
        const easing = kind === "item" ? 0.28 : 0.38;
        ghostX += (ghostTargetX - ghostX) * easing;
        ghostY += (ghostTargetY - ghostY) * easing;
        ghost.style.left = `${ghostX}px`;
        ghost.style.top = `${ghostY}px`;
        if (Math.abs(ghostTargetX - ghostX) < 0.5 && Math.abs(ghostTargetY - ghostY) < 0.5) {
          ghost.style.left = `${ghostTargetX}px`;
          ghost.style.top = `${ghostTargetY}px`;
          ghostFrame = null;
          return;
        }
        ghostFrame = requestAnimationFrame(tick);
      };
      ghostFrame = requestAnimationFrame(tick);
    };

    const clearZones = () => {
      clearDropzoneDragOvers(root);
      root.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
      root.querySelectorAll(".item-card.move-into-target").forEach((card) => card.classList.remove("move-into-target"));
      placeholder.remove();
      currentZone = null;
      groupTargetItemId = null;
      packageTargetContainerId = null;
      packageTargetUsesPointer = false;
      itemIntoDraggedContainerId = null;
      resetNestedGroupCandidate();
    };

    const place = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);

      if (kind === "container") {
        const targetCard = target?.closest?.(".item-card");
        const targetItemId = targetCard?.dataset.itemId;
        if (
          targetCard &&
          targetItemId &&
          !targetCard.classList.contains("dragging") &&
          !isItemInsideContainer(targetItemId, id) &&
          isInsideGroupDropZone(targetCard, clientX, clientY)
        ) {
          clearDropzoneDragOvers(root);
          root.querySelectorAll(".item-card.move-into-target").forEach((card) => {
            if (card !== targetCard) card.classList.remove("move-into-target");
          });
          placeholder.remove();
          targetCard.classList.add("move-into-target");
          currentZone = null;
          groupTargetItemId = null;
          packageTargetContainerId = null;
          packageTargetUsesPointer = false;
          itemIntoDraggedContainerId = targetItemId;
          return;
        }
      }

      const packageTarget = getPackageDropTarget(target, kind, id, root);
      if (packageTarget) {
        root.querySelectorAll(".item-card.group-target, .item-card.move-into-target").forEach((card) => card.classList.remove("group-target", "move-into-target"));
        markDropzoneDragOver(root, packageTarget.zone);
        currentZone = packageTarget.zone;
        groupTargetItemId = null;
        itemIntoDraggedContainerId = null;
        packageTargetContainerId = packageTarget.containerId;
        packageTargetUsesPointer = packageTarget.insertByPointer;
        resetNestedGroupCandidate();
        const insertBefore = packageTarget.insertByPointer
          ? getEntryAfterPointer(packageTarget.zone, clientY)
          : getFirstEntry(packageTarget.zone);
        placePlaceholder(packageTarget.zone, placeholder, insertBefore);
        return;
      }

      const zone = target?.closest?.(".dropzone");
      if (!zone || !root.contains(zone) || isBlockedDropzone(zone)) {
        clearZones();
        return;
      }

      if (kind === "item") {
        const targetCard = target?.closest?.(".item-card");
        const targetItemId = targetCard?.dataset.itemId;
        const canGroupWithTarget = targetCard &&
          targetItemId &&
          targetItemId !== id &&
          !targetCard.classList.contains("dragging");
        if (canGroupWithTarget) {
          if (canActivateGroupTarget(targetCard, targetItemId, clientX, clientY)) {
            clearDropzoneDragOvers(root);
            root.querySelectorAll(".item-card.group-target").forEach((card) => {
              if (card !== targetCard) card.classList.remove("group-target");
            });
            placeholder.remove();
            targetCard.classList.add("group-target");
            currentZone = zone;
            groupTargetItemId = targetItemId;
            return;
          }
        } else {
          resetNestedGroupCandidate();
        }
      }

      root.querySelectorAll(".item-card.group-target, .item-card.move-into-target").forEach((card) => card.classList.remove("group-target", "move-into-target"));
      groupTargetItemId = null;
      itemIntoDraggedContainerId = null;
      packageTargetContainerId = null;
      packageTargetUsesPointer = false;
      markDropzoneDragOver(root, zone);
      currentZone = zone;

      if (kind === "container") {
        const afterEntry = getEntryAfterPointer(zone, clientY);
        placePlaceholder(zone, placeholder, afterEntry);
        return;
      }

      const afterEntry = getEntryAfterPointer(zone, clientY);
      placePlaceholder(zone, placeholder, afterEntry);
    };

    const onMove = (moveEvent) => {
      const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
      if (!movePoint) return;
      latestX = movePoint.clientX;
      latestY = movePoint.clientY;
      const dx = movePoint.clientX - startX;
      const dy = movePoint.clientY - startY;
      if (!started) {
        if (needsHold) {
          const distance = Math.hypot(dx, dy);
          const cancelDistance = inputType === "touch" ? TOUCH_SCROLL_CANCEL_DISTANCE : TOUCH_DRAG_CANCEL_DISTANCE;
          if (distance > cancelDistance && !preScrollGesture) {
            if (holdTimer) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
            canceled = true;
            clearDragPending(source);
            preScrollGesture = true;
          }
          if (!started && preScrollGesture && inputType !== "touch") {
            moveEvent.preventDefault();
            preDragScroller.update(movePoint.clientX, movePoint.clientY);
          }
          if (!started) return;
        }
        if (Math.hypot(dx, dy) < POINTER_DRAG_START_DISTANCE) return;
        begin();
      }
      moveEvent.preventDefault();
      begin();
      moveGhost(movePoint.clientX, movePoint.clientY);
      edgeScroller.update(movePoint.clientX, movePoint.clientY);
      place(movePoint.clientX, movePoint.clientY);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      resetNestedGroupCandidate();
      if (holdTimer) window.clearTimeout(holdTimer);
      preDragScroller.stop();
      if (started) edgeScroller.stop();
      if (inputType !== "touch" && handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      if (!canceled && started && kind === "container" && itemIntoDraggedContainerId) {
        moveItemIntoContainerTop(itemIntoDraggedContainerId, id);
      } else if (!canceled && started && kind === "item" && groupTargetItemId) {
        createGroupFromItems(id, groupTargetItemId);
      } else if (!canceled && started && currentZone && packageTargetContainerId && placeholder.parentElement === currentZone) {
        if (kind === "container") {
          if (!isOriginalContainerPosition(currentZone, placeholder)) {
            if (packageTargetUsesPointer) {
              moveContainer(id, packageTargetContainerId, getPlaceholderContainerIndex(currentZone, placeholder));
            } else {
              moveContainerIntoContainerTop(id, packageTargetContainerId);
            }
          }
        } else if (!isOriginalItemPosition(currentZone, placeholder)) {
          if (packageTargetUsesPointer) {
            moveItem(id, packageTargetContainerId, getPlaceholderItemIndex(currentZone, placeholder));
          } else {
            moveItemIntoContainerTop(id, packageTargetContainerId);
          }
        }
      } else if (!canceled && started && currentZone && placeholder.parentElement === currentZone) {
        if (kind === "container") {
          const index = getPlaceholderContainerIndex(currentZone, placeholder);
          if (!isOriginalContainerPosition(currentZone, placeholder)) {
            moveContainer(id, currentZone.dataset.containerId, index);
          }
        } else {
          const index = getPlaceholderItemIndex(currentZone, placeholder);
          if (!isOriginalItemPosition(currentZone, placeholder)) {
            moveItem(id, currentZone.dataset.containerId, index);
          }
        }
      }
      if (ghostFrame) cancelAnimationFrame(ghostFrame);
      ghost?.remove();
      clearDragPending(source);
      source.classList.remove("drag-source-collapsed");
      source.classList.remove("dragging");
      if (started) {
        source.dataset.justDragged = "true";
        window.setTimeout(() => {
          delete source.dataset.justDragged;
        }, 250);
      }
      placeholder.removeAttribute("style");
      draggingItemId = null;
      draggingContainerId = null;
      document.body.classList.remove("dragging-ui");
      root.querySelectorAll(".item-card.group-target").forEach((card) => card.classList.remove("group-target"));
      clearZones();
      if (inputType === "touch") {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", finish);
        document.removeEventListener("touchcancel", finish);
      } else {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
      }
      document.removeEventListener("keydown", onKeyDown);
    };

    const onKeyDown = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      canceled = true;
      finish();
    };

    if (needsHold) {
      holdTimer = window.setTimeout(begin, TOUCH_DRAG_DELAY_MS);
    }
    if (inputType === "touch") {
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", finish, { passive: false });
      document.addEventListener("touchcancel", finish, { passive: false });
    } else {
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
    }
    document.addEventListener("keydown", onKeyDown);
  };

  root.querySelectorAll("[data-item-drag]").forEach((handle) => {
    handle.addEventListener("contextmenu", preventDragContextMenu);
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      const source = handle.closest(".item-card");
      if (!source) return;
      startDrag({ kind: "item", id: handle.dataset.itemDrag, handle, source, event });
    });
    handle.addEventListener("touchstart", (event) => {
      const source = handle.closest(".item-card");
      if (!source) return;
      startDrag({ kind: "item", id: handle.dataset.itemDrag, handle, source, event, inputType: "touch" });
    }, { passive: true });
  });

  root.querySelectorAll(".subcontainer-title").forEach((title) => {
    title.addEventListener("contextmenu", preventDragContextMenu);
    title.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (event.target.closest("button, input")) return;
      const source = title.closest(".subcontainer");
      const id = source?.dataset.subcontainerId;
      if (!source || !id) return;
      startDrag({ kind: "container", id, handle: title, source, event });
    });
    title.addEventListener("touchstart", (event) => {
      if (event.target.closest("button, input")) return;
      const source = title.closest(".subcontainer");
      const id = source?.dataset.subcontainerId;
      if (!source || !id) return;
      startDrag({ kind: "container", id, handle: title, source, event, inputType: "touch" });
    }, { passive: true });
  });
}

function isBlockedDropzone(zone) {
  const item = draggingItemId ? state.items[draggingItemId] : null;
  if (item) return false;
  if (!draggingContainerId) return false;
  const targetContainerId = zone.dataset.containerId;
  if (targetContainerId === draggingContainerId) return true;
  return getDescendantContainerIds(draggingContainerId).includes(targetContainerId);
}

function getPackageDropTarget(target, kind, draggedId, root) {
  const container = target?.closest?.(".subcontainer");
  if (!container || !root.contains(container) || container.classList.contains("dragging")) return null;
  const containerId = container.dataset.subcontainerId;
  if (!containerId || !state.containers[containerId]) return null;
  if (kind === "container") {
    if (containerId === draggedId) return null;
    if (getDescendantContainerIds(draggedId).includes(containerId)) return null;
  }
  const zone = getDirectDropzone(container);
  if (!zone || isBlockedDropzone(zone)) return null;
  const title = target.closest(".subcontainer-title");
  const directZone = target.closest(".dropzone");
  const closestEntry = target.closest(".item-card, .subcontainer");
  const directEmptySpace = directZone === zone && (!closestEntry || closestEntry === container);
  if (!title && !container.classList.contains("collapsed") && !directEmptySpace) return null;
  return { container, containerId, zone, insertByPointer: directEmptySpace && !container.classList.contains("collapsed") };
}

function isCardInsideOpenSubcontainer(card) {
  const container = card?.closest?.(".subcontainer");
  return Boolean(container && !container.classList.contains("collapsed"));
}

function getDirectDropzone(containerElement) {
  return [...containerElement.children].find((child) => child.classList?.contains("dropzone")) || null;
}

function getFirstEntry(zone) {
  return [...zone.children].find((child) =>
    (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
    !child.classList.contains("dragging")
  ) || null;
}

function isItemInsideContainer(itemId, containerId) {
  if (!state.items[itemId] || !state.containers[containerId]) return false;
  return getContainerItemIdsDeep(containerId).includes(itemId);
}

function moveItemIntoContainerTop(itemId, containerId) {
  if (!state.items[itemId] || !state.containers[containerId]) return;
  state.collapsedContainers[containerId] = false;
  saveLocalUiState();
  moveItem(itemId, containerId, 0);
}

function moveContainerIntoContainerTop(containerId, targetContainerId) {
  if (!state.containers[containerId] || !state.containers[targetContainerId]) return;
  state.collapsedContainers[targetContainerId] = false;
  saveLocalUiState();
  moveContainer(containerId, targetContainerId, 0);
}

function isOriginalItemPosition(zone, placeholder) {
  if (!draggingItemId) return false;
  const item = state.items[draggingItemId];
  if (!item || item.containerId !== zone.dataset.containerId) return false;
  const order = state.containers[item.containerId].order || [];
  const originalIndex = order.findIndex((entry) => entry.type === "item" && entry.id === draggingItemId);
  const targetIndex = getPlaceholderItemIndex(zone, placeholder);
  return targetIndex === originalIndex;
}

function isOriginalContainerPosition(zone, placeholder) {
  if (!draggingContainerId) return false;
  const container = state.containers[draggingContainerId];
  if (!container || container.parentId !== zone.dataset.containerId) return false;
  const order = state.containers[container.parentId].order || [];
  const originalIndex = order.findIndex((entry) => entry.type === "container" && entry.id === draggingContainerId);
  const targetIndex = getPlaceholderContainerIndex(zone, placeholder);
  return targetIndex === originalIndex;
}

function getCardAfterPointer(zone, pointerY) {
  const cards = [...zone.children].filter((child) =>
    child.classList?.contains("item-card") && !child.classList.contains("dragging")
  );
  return cards.reduce(
    (closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, card };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, card: null }
  ).card;
}

function getSubcontainerAfterPointer(zone, pointerY) {
  const containers = [...zone.children].filter((child) =>
    child.classList?.contains("subcontainer") && !child.classList.contains("dragging")
  );
  return containers.reduce(
    (closest, container) => {
      const box = container.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, container };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, container: null }
  ).container;
}

function getEntryAfterPointer(zone, pointerY) {
  const entries = [...zone.children].filter((child) =>
    (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
    !child.classList.contains("dragging")
  );
  return entries.reduce(
    (closest, entry) => {
      const box = entry.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, entry };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, entry: null }
  ).entry;
}

function isInsideGroupDropZone(card, pointerX, pointerY) {
  const box = card.getBoundingClientRect();
  const insideSubcontainer = Boolean(card.closest(".subcontainer"));
  const horizontalInsetRatio = insideSubcontainer ? 0.22 : 0.14;
  const bandRatio = insideSubcontainer ? 0.26 : 0.34;
  const horizontalInset = Math.min(box.width * 0.3, Math.max(28, box.width * horizontalInsetRatio));
  const bandHeight = Math.max(20, Math.min(42, box.height * bandRatio));
  const bandTop = box.top + (box.height - bandHeight) / 2;
  const bandBottom = bandTop + bandHeight;
  return pointerX >= box.left + horizontalInset &&
    pointerX <= box.right - horizontalInset &&
    pointerY >= bandTop &&
    pointerY <= bandBottom;
}

function insertPlaceholderBeforeSubcontainers(zone, placeholder) {
  const firstSubcontainer = [...zone.children].find((child) => child.classList?.contains("subcontainer"));
  placePlaceholder(zone, placeholder, firstSubcontainer);
}

function placePlaceholder(parent, placeholder, beforeNode = null) {
  if (!parent) return;
  const targetNext = beforeNode || null;
  if (placeholder.parentElement === parent && placeholder.nextElementSibling === targetNext) return;
  if (targetNext) parent.insertBefore(placeholder, targetNext);
  else if (placeholder.parentElement !== parent || placeholder.nextElementSibling) parent.appendChild(placeholder);
}

function getPlaceholderItemIndex(zone, placeholder) {
  return getPlaceholderOrderIndex(zone, placeholder);
}

function getPlaceholderContainerIndex(zone, placeholder) {
  return getPlaceholderOrderIndex(zone, placeholder);
}

function getPlaceholderOrderIndex(zone, placeholder) {
  const directEntries = [...zone.children].filter((child) =>
    child === placeholder ||
    (
      (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
      !child.classList.contains("dragging")
    )
  );
  const index = directEntries.indexOf(placeholder);
  return index >= 0 ? index : directEntries.length;
}

function cleanupDropState(root, placeholder) {
  placeholder.remove();
  clearDropzoneDragOvers(root);
}

function getDropzoneSubcontainer(zone) {
  const container = zone?.parentElement;
  return container?.classList?.contains("subcontainer") ? container : null;
}

function removeDropzoneDragOver(zone) {
  zone?.classList?.remove("drag-over");
  getDropzoneSubcontainer(zone)?.classList.remove("container-drop-target");
}

function clearDropzoneDragOvers(root, exceptZone = null) {
  root.querySelectorAll(".dropzone.drag-over").forEach((zone) => {
    if (zone !== exceptZone) removeDropzoneDragOver(zone);
  });
  const exceptContainer = getDropzoneSubcontainer(exceptZone);
  root.querySelectorAll(".subcontainer.container-drop-target").forEach((container) => {
    if (container !== exceptContainer) container.classList.remove("container-drop-target");
  });
}

function markDropzoneDragOver(root, zone) {
  if (!zone) return;
  clearDropzoneDragOvers(root, zone);
  zone.classList.add("drag-over");
  getDropzoneSubcontainer(zone)?.classList.add("container-drop-target");
}

function bindBoardScroll(board) {
  if (!board) return;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  const isInteractiveTarget = (target) =>
    target.closest(".item-card, .subcontainer-title, .container-header, button, input, select, textarea, label, dialog, .drag-handle, .subcontainer-drag-handle");

  board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    isDown = true;
    startX = event.clientX;
    scrollLeft = board.scrollLeft;
    board.classList.add("drag-scroll");
    board.setPointerCapture(event.pointerId);
  });

  board.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const walk = event.clientX - startX;
    board.scrollLeft = scrollLeft - walk;
  });

  const stop = (event) => {
    if (!isDown) return;
    isDown = false;
    board.classList.remove("drag-scroll");
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  };

  board.addEventListener("pointerup", stop);
  board.addEventListener("pointercancel", stop);
  board.addEventListener("pointerleave", () => {
    isDown = false;
    board.classList.remove("drag-scroll");
  });
}

function bindFixedScrollbar(board) {
  const bar = document.querySelector("#kanbanScrollbar");
  const track = document.querySelector("#kanbanScrollTrack");
  const thumb = document.querySelector("#kanbanScrollThumb");
  if (!board || !bar || !track || !thumb) return;

  let isDragging = false;
  let startX = 0;
  let startLeft = 0;
  let thumbFrame = null;

  const getGeometry = () => {
    const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    const trackWidth = track.clientWidth;
    const ratio = board.scrollWidth ? board.clientWidth / board.scrollWidth : 1;
    const thumbWidth = Math.max(48, Math.min(trackWidth, trackWidth * ratio));
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    return { maxScroll, trackWidth, thumbWidth, maxThumbLeft };
  };

  const updateThumb = () => {
    thumbFrame = null;
    const { maxScroll, thumbWidth, maxThumbLeft } = getGeometry();
    const progress = maxScroll ? board.scrollLeft / maxScroll : 0;
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translate3d(${progress * maxThumbLeft}px, 0, 0)`;
  };

  const requestThumbUpdate = () => {
    if (thumbFrame) return;
    thumbFrame = requestAnimationFrame(updateThumb);
  };

  const updateWidth = () => {
    updateThumb();
  };

  board.addEventListener("scroll", requestThumbUpdate, { passive: true });

  thumb.addEventListener("pointerdown", (event) => {
    isDragging = true;
    startX = event.clientX;
    startLeft = board.scrollLeft;
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  thumb.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const { maxScroll, maxThumbLeft } = getGeometry();
    const dx = event.clientX - startX;
    const scrollDx = maxThumbLeft ? (dx / maxThumbLeft) * maxScroll : 0;
    board.scrollLeft = startLeft + scrollDx;
  });

  const stopDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
  };

  thumb.addEventListener("pointerup", stopDrag);
  thumb.addEventListener("pointercancel", stopDrag);

  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const { maxScroll, maxThumbLeft, thumbWidth } = getGeometry();
    const rect = track.getBoundingClientRect();
    const thumbLeft = Math.max(0, Math.min(event.clientX - rect.left - thumbWidth / 2, maxThumbLeft));
    board.scrollTo({
      left: maxThumbLeft ? (thumbLeft / maxThumbLeft) * maxScroll : 0,
      behavior: "smooth"
    });
  });

  updateWidth();
  window.addEventListener("resize", updateWidth, { passive: true });
}

function syncFixedScrollbarVisibility() {
  const bar = document.querySelector("#kanbanScrollbar");
  const board = refs.packingView.querySelector(".board");
  const isPacking = !refs.packingView.classList.contains("hidden");
  const needsScroll = board && board.scrollWidth > board.clientWidth + 1;
  const show = Boolean(isPacking && needsScroll);
  bar?.classList.toggle("hidden", !show);
  document.body.classList.toggle("has-fixed-kanban-scroll", show);
  if (show) updateFixedScrollbarThumb(board);
}

function updateFixedScrollbarThumb(board = refs.packingView.querySelector(".board")) {
  const track = document.querySelector("#kanbanScrollTrack");
  const thumb = document.querySelector("#kanbanScrollThumb");
  if (!board || !track || !thumb) return;
  const maxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
  const trackWidth = track.clientWidth;
  if (!trackWidth) return;
  const ratio = board.scrollWidth ? board.clientWidth / board.scrollWidth : 1;
  const thumbWidth = Math.max(48, Math.min(trackWidth, trackWidth * ratio));
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  const progress = maxScroll ? board.scrollLeft / maxScroll : 0;
  thumb.style.width = `${thumbWidth}px`;
  thumb.style.transform = `translate3d(${progress * maxThumbLeft}px, 0, 0)`;
}

function scheduleFixedScrollbarRefresh() {
  if (fixedScrollbarRefreshFrame) return;
  fixedScrollbarRefreshFrame = requestAnimationFrame(() => {
    fixedScrollbarRefreshFrame = null;
    syncFixedScrollbarVisibility();
    requestAnimationFrame(syncFixedScrollbarVisibility);
  });
  window.setTimeout(syncFixedScrollbarVisibility, 120);
}

function renderItems() {
  if (isSharedLayoutView()) {
    renderSharedItemsView();
    return;
  }
  const items = getItemsForItemsView();
  const counts = getItemsUsageCounts();
  const sortLabel = itemSortMode === "asc" ? "А-Я" : itemSortMode === "desc" ? "Я-А" : "Без";
  const sortTitle = itemSortMode === "asc" ? "Сортировка А-Я. Нажмите для Я-А" :
    itemSortMode === "desc" ? "Сортировка Я-А. Нажмите, чтобы сбросить" :
      "Без сортировки. Нажмите для А-Я";
  refs.itemsView.innerHTML = `
    <section class="items-panel">
      <div class="items-toolbar">
        <button id="addItemBtn">Добавить вещь</button>
        <div class="items-filter-row">
          <label>
            Участие в укладке
            <select id="itemUsageFilter">
              <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>Все вещи (${counts.all})</option>
              <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
              <option value="away"${itemUsageFilter === "away" ? " selected" : ""}>Не дома и не на веле (${counts.away})</option>
              <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>Без веса (${counts.noWeight})</option>
              <option value="unused"${itemUsageFilter === "unused" ? " selected" : ""}>Вне текущей укладки (${counts.unused})</option>
            </select>
          </label>
          <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button" title="${sortTitle}" aria-label="${sortTitle}">
            ${sortLabel}
          </button>
        </div>
      </div>
      <div class="items-list">${items.map(renderListItem).join("") || `<div class="empty">Ничего не найдено</div>`}</div>
    </section>
  `;
  refs.itemsView.querySelector("#addItemBtn").addEventListener("click", () => openItemDialog());
  refs.itemsView.querySelector("#itemUsageFilter").addEventListener("change", (event) => {
    itemUsageFilter = event.target.value;
    renderItems();
  });
  refs.itemsView.querySelector("#itemSortBtn").addEventListener("click", () => {
    itemSortMode = itemSortMode === "none" ? "asc" : itemSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    renderItems();
  });
  refs.itemsView.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => openItemDialog(button.dataset.editItem));
  });
  refs.itemsView.querySelectorAll("[data-copy-item]").forEach((button) => {
    button.addEventListener("click", () => copyItem(button.dataset.copyItem, { keepPlacement: false }));
  });
  refs.itemsView.querySelectorAll("[data-delete-item]").forEach((button) => {
    button.addEventListener("click", () => confirmDeleteItem(button.dataset.deleteItem));
  });
}

function renderSharedItemsView() {
  withSharedVirtualState(() => {
    const items = getItemsForItemsView();
    const counts = getItemsUsageCounts();
    const sortLabel = itemSortMode === "asc" ? "А-Я" : itemSortMode === "desc" ? "Я-А" : "Без";
    refs.itemsView.innerHTML = `
      <section class="items-panel">
        ${renderSharedModeBanner(currentSharedLayout(), { compact: true })}
        <div class="items-toolbar">
          <button type="button" data-copy-shared-layout="${escapeHtml(activeReadOnlyLayoutId())}">${escapeHtml(activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))}</button>
          <div class="items-filter-row">
            <label>
              Участие в укладке
              <select id="itemUsageFilter">
                <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>Все вещи (${counts.all})</option>
                <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
                <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>Без веса (${counts.noWeight})</option>
              </select>
            </label>
            <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button">${sortLabel}</button>
          </div>
        </div>
        <div class="items-list">${items.map(renderListItem).join("") || `<div class="empty">Ничего не найдено</div>`}</div>
      </section>
    `;
  });
  refs.itemsView.querySelector("#itemUsageFilter")?.addEventListener("change", (event) => {
    itemUsageFilter = event.target.value;
    renderItems();
  });
  refs.itemsView.querySelector("#itemSortBtn")?.addEventListener("click", () => {
    itemSortMode = itemSortMode === "none" ? "asc" : itemSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    renderItems();
  });
  bindSharedVirtualEvents(refs.itemsView);
  return;
  const layout = currentSharedLayout();
  const items = getFilteredSharedItems(layout);
  refs.itemsView.innerHTML = `
    <section class="items-panel shared-tab-panel">
      ${renderSharedModeBanner(layout)}
      <div class="shared-gear-grid shared-tab-grid">
        ${items.map((item) => renderSharedItemCard(layout, { id: item.rootId, name: item.rootName }, item)).join("") || `<div class="empty">Ничего не найдено</div>`}
      </div>
    </section>
  `;
  bindSharedLayoutEvents(refs.itemsView);
}

function renderListItem(item) {
  const filterMatch = isFilterContextActive() && matchesItemsViewFilters(item);
  return `
    <article class="item-card ${filterMatch ? "filter-match" : ""}" data-list-item-id="${item.id}" ${filterMatch ? `data-filter-match-id="${item.id}"` : ""}>
      <div class="item-card-top">
        <strong>${highlight(item.name)}${renderItemQuantityText(item)}</strong>
        <button class="copy-item-button" data-copy-item="${item.id}" aria-label="Скопировать" title="Скопировать">
          <span aria-hidden="true">⧉</span>
        </button>
        <button class="edit-button" data-edit-item="${item.id}" aria-label="Редактировать" title="Редактировать">
          <span aria-hidden="true">&#9998;</span>
        </button>
        <button class="delete-item-button" data-delete-item="${item.id}" aria-label="Удалить навсегда" title="Удалить навсегда">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="meta ${state.showItemMeta ? "" : "meta-hidden"}">
        <span class="pill">${formatItemWeight(item)}</span>
        ${itemCategories(item).map((category) => `<span class="pill">${highlight(category)}</span>`).join("")}
        <span class="pill">${highlight(item.location)}</span>
      </div>
      <small>${highlight(item.containerId ? containerPath(item.containerId) : "Вне укладки")}</small>
      ${renderItemPhoto(item)}
    </article>
  `;
}

function renderBags() {
  if (isSharedLayoutView()) {
    renderSharedBagsView();
    return;
  }
  refs.bagsView.innerHTML = `
    <div class="settings-grid">
      ${renderRootContainersEditor()}
      ${renderLayoutEditor()}
    </div>
  `;
  bindLayoutEditor();
  bindRootContainersEditor();
  bindSettingsPointerDrag();
}

function renderSharedBagsView() {
  withSharedVirtualState(() => {
    refs.bagsView.innerHTML = `
      <div class="settings-grid">
        ${renderRootContainersEditor()}
        ${renderLayoutEditor()}
      </div>
    `;
  });
  document.querySelector("#rootContainerUsageFilter")?.addEventListener("change", (event) => {
    rootContainerUsageFilter = event.target.value;
    render();
  });
  document.querySelector("#rootContainerSortBtn")?.addEventListener("click", () => {
    rootContainerSortMode = rootContainerSortMode === "none" ? "asc" : rootContainerSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    render();
  });
  bindSharedVirtualEvents(refs.bagsView);
  return;
  const layout = currentSharedLayout();
  const roots = getFilteredSharedRootEntries(layout);
  refs.bagsView.innerHTML = `
    <section class="settings-panel shared-tab-panel">
      ${renderSharedModeBanner(layout, { compact: true })}
      <div class="shared-root-list">
        ${roots.map((root) => renderSharedRootColumn(layout, root)).join("") || `<div class="empty">Ничего не найдено</div>`}
      </div>
    </section>
  `;
  bindSharedLayoutEvents(refs.bagsView);
}

function renderSettings() {
  if (isSharedLayoutView()) {
    renderSharedSettingsView();
    return;
  }
  refs.settingsView.innerHTML = `
    <div class="settings-grid">
      ${renderDictionary("Места хранения", "location", state.locations)}
      ${renderDictionary("Категории", "category", state.categories)}
    </div>
  `;
  bindDictionary("location");
  bindDictionary("category");
}

function renderSharedSettingsView() {
  withSharedVirtualState(() => {
    refs.settingsView.innerHTML = `
      <div class="settings-grid">
        ${renderDictionary("Места хранения", "location", state.locations)}
        ${renderDictionary("Категории", "category", state.categories)}
      </div>
    `;
  });
  bindSharedVirtualEvents(refs.settingsView);
  return;
  const layout = currentSharedLayout();
  const roots = sharedLayoutRoots(layout);
  const items = getSharedItems(layout);
  const totalWeight = roots.reduce((sum, root) => sum + sharedRootWeight(root), 0);
  refs.settingsView.innerHTML = `
    <section class="settings-panel shared-tab-panel">
      ${renderSharedModeBanner(layout, { compact: true })}
      <div class="shared-settings-card">
        <h2>${escapeHtml(layout?.name || "Shared укладка")}</h2>
        <p>${escapeHtml(layout?.subtitle || "Общая укладка доступна всем пользователям.")}</p>
        <div class="shared-settings-metrics">
          <span>${roots.length} сумок</span>
          <span>${items.length} вещей</span>
          <span>${formatWeight(totalWeight)}</span>
        </div>
      </div>
    </section>
  `;
  bindSharedLayoutEvents(refs.settingsView);
}

function renderLayoutEditor() {
  const layout = state.layouts[state.activeLayoutId];
  const roots = getRootContainers();
  return `
    <section class="settings-panel layout-editor">
      <h2>Текущая укладка</h2>
      <div class="layout-name-row">
        <label>
          Название
          <input id="activeLayoutName" value="${escapeHtml(layout.name)}" />
        </label>
        <button id="renameLayoutBtn">Сохранить</button>
      </div>
      <div class="layout-section-heading">
        <h3>Сумки в этой укладке</h3>
        <button id="addLayoutRootBtn" class="add-inline-button" type="button" aria-label="Добавить сумку или место" title="Добавить сумку или место">+</button>
      </div>
      <div class="check-list layout-drop-list" id="layoutDropList">
        ${layout.rootContainerIds.map((containerId) => state.containers[containerId]).filter(Boolean).map((container) => `
          <div class="layout-member-row" data-layout-member-id="${container.id}" data-layout-member-row-drag="${container.id}">
            <div class="layout-member-title">
              <strong>${escapeHtml(container.name)}</strong>
              ${container.color ? `<span>${escapeHtml(container.color)}</span>` : ""}
            </div>
            <span class="layout-member-weight" title="Вес сумки вместе с содержимым">${formatWeight(containerWeight(container.id))}</span>
            <button class="chip-remove" data-remove-layout-root="${container.id}" aria-label="Удалить">×</button>
          </div>
        `).join("") || `<div class="empty">Перетащите сюда сумку или место из соседнего списка</div>`}
      </div>
    </section>
  `;
}

function bindLayoutEditor() {
  const nameInput = document.querySelector("#activeLayoutName");
  const layoutPlaceholder = document.createElement("div");
  layoutPlaceholder.className = "drop-placeholder";

  document.querySelector("#renameLayoutBtn").addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    state.layouts[state.activeLayoutId].name = name;
    touchActiveLayout();
    saveState();
    render();
  });

  document.querySelector("#addLayoutRootBtn")?.addEventListener("click", openLayoutRootDialog);

  document.querySelectorAll("[data-remove-layout-root]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerId = button.dataset.removeLayoutRoot;
      const container = state.containers[containerId];
      const itemCount = getContainerItemIdsDeep(containerId).length;
      openConfirmDialog({
        title: "Удалить из укладки?",
        text: `«${container.name}» будет убран из текущей укладки и останется в списке сумок и мест как пустая заготовка.`,
        highlightText: itemCount
          ? `${formatThingCount(itemCount)} из этой сумки/места будут вынуты из укладки и станут вне укладки. Вложенные пакеты внутри этой сумки/места будут удалены.`
          : "Эта сумка/место уже пустая, поэтому из текущей укладки уйдёт только пустая заготовка.",
        tone: itemCount ? "danger" : "safe",
        okText: "Удалить",
        onConfirm: () => removeRootContainerFromActiveLayout(containerId)
      });
    });
  });

  const dropList = document.querySelector("#layoutDropList");
  document.querySelectorAll("[data-layout-member-drag]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      const row = handle.closest(".layout-member-row");
      row?.classList.add("dragging");
      event.dataTransfer.setData("text/layout-container-id", handle.dataset.layoutMemberDrag);
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      handle.closest(".layout-member-row")?.classList.remove("dragging");
      cleanupLayoutDropState(dropList, layoutPlaceholder);
    });
  });

  dropList.addEventListener("dragover", (event) => {
    if (!isLayoutDrag(event)) return;
    event.preventDefault();
    dropList.classList.add("drag-over");
    const afterRow = getLayoutRowAfterPointer(dropList, event.clientY);
    if (afterRow) dropList.insertBefore(layoutPlaceholder, afterRow);
    else dropList.appendChild(layoutPlaceholder);
  });
  dropList.addEventListener("dragleave", (event) => {
    if (dropList.contains(event.relatedTarget)) return;
    cleanupLayoutDropState(dropList, layoutPlaceholder);
  });
  dropList.addEventListener("drop", (event) => {
    if (!isLayoutDrag(event)) return;
    const containerId =
      event.dataTransfer.getData("text/layout-container-id") ||
      event.dataTransfer.getData("text/root-container-id");
    if (!containerId || !state.containers[containerId]) return;
    event.preventDefault();
    const targetIndex = getLayoutPlaceholderIndex(dropList, layoutPlaceholder);
    cleanupLayoutDropState(dropList, layoutPlaceholder);
    addRootContainerToActiveLayout(containerId, targetIndex);
  });
}

function isLayoutDrag(event) {
  return event.dataTransfer.types.includes("text/root-container-id") ||
    event.dataTransfer.types.includes("text/layout-container-id");
}

function getLayoutRowAfterPointer(list, pointerY) {
  const rows = [...list.children].filter((child) =>
    child.classList?.contains("layout-member-row") && !child.classList.contains("dragging")
  );
  return rows.reduce(
    (closest, row) => {
      const box = row.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, row };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, row: null }
  ).row;
}

function getLayoutPlaceholderIndex(list, placeholder) {
  const rows = [...list.children].filter((child) =>
    child === placeholder ||
    (child.classList?.contains("layout-member-row") && !child.classList.contains("dragging"))
  );
  const index = rows.indexOf(placeholder);
  return index >= 0 ? index : rows.length;
}

function cleanupLayoutDropState(list, placeholder) {
  placeholder.remove();
  list?.classList.remove("drag-over");
}

function bindSettingsPointerDrag() {
  const dropList = document.querySelector("#layoutDropList");
  if (!dropList) return;

  const startDrag = ({ handle, event, inputType = "pointer" }) => {
    const point = inputType === "touch" ? getTouchPoint(event) : event;
    if (!point) return;
    if (inputType !== "touch" && event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, label")) return;
    const containerId = handle.dataset.layoutMemberRowDrag || handle.dataset.rootDrag;
    const sourceRow = handle.closest(".layout-member-row, .root-container-card");
    if (!containerId || !sourceRow || !state.containers[containerId]) return;

    const placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
    const ghost = sourceRow.cloneNode(true);
    ghost.classList.add("settings-drag-ghost");
    const startX = point.clientX;
    const startY = point.clientY;
    let latestX = startX;
    let latestY = startY;
    let started = false;
    let dropped = false;
    let canceled = false;
    let finished = false;
    let blockingTouchMove = false;
    const sourceIsLayoutMember = Boolean(handle.dataset.layoutMemberRowDrag);
    const originalLayoutIndex = sourceIsLayoutMember
      ? (state.layouts[state.activeLayoutId]?.rootContainerIds || []).indexOf(containerId)
      : -1;
    const dragInput = inputType === "touch" ? "touch" : event.pointerType || "mouse";
    const needsHold = isHoldDragInput(dragInput);
    let holdTimer = null;

    if (needsHold) {
      markDragPending(sourceRow);
      if (inputType !== "touch") {
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
      }
    }

    const cleanup = () => {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (inputType !== "touch" && handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      clearDragPending(sourceRow);
      sourceRow.classList.remove("dragging");
      sourceRow.classList.remove("drag-origin");
      sourceRow.classList.remove("drag-source-collapsed");
      ghost.remove();
      cleanupLayoutDropState(dropList, placeholder);
      document.body.classList.remove("dragging-ui");
      if (inputType === "touch") {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
        document.removeEventListener("touchcancel", onEnd);
      } else {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onEnd);
      }
      document.removeEventListener("keydown", onKeyDown);
    };

    const start = () => {
      if (started || canceled) return;
      started = true;
      if (inputType === "touch" && !blockingTouchMove) {
        document.removeEventListener("touchmove", onMove);
        document.addEventListener("touchmove", onMove, { passive: false });
        blockingTouchMove = true;
      } else {
        event.preventDefault();
      }
      clearDragPending(sourceRow);
      const box = sourceRow.getBoundingClientRect();
      ghost.style.width = `${box.width}px`;
      ghost.style.left = `${box.left}px`;
      ghost.style.top = `${box.top}px`;
      placeholder.style.height = `${box.height}px`;
      placeholder.style.width = `${box.width}px`;
      placeholder.style.maxWidth = "100%";
      document.body.appendChild(ghost);
      sourceRow.classList.add("dragging", "drag-origin");
      if (sourceIsLayoutMember) {
        dropList.insertBefore(placeholder, sourceRow);
        sourceRow.classList.add("drag-source-collapsed");
      }
      document.body.classList.add("dragging-ui");
      vibrateDragStart(dragInput);
      moveGhost(latestX, latestY);
      place(latestX, latestY);
    };

    const moveGhost = (clientX, clientY) => {
      ghost.style.transform = `translate(${clientX - startX}px, ${clientY - startY}px)`;
    };

    const place = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!target || !dropList.contains(target)) {
        cleanupLayoutDropState(dropList, placeholder);
        return;
      }
      dropList.classList.add("drag-over");
      const afterRow = getLayoutRowAfterPointer(dropList, clientY);
      if (afterRow) dropList.insertBefore(placeholder, afterRow);
      else dropList.appendChild(placeholder);
    };

    const onMove = (moveEvent) => {
      const movePoint = inputType === "touch" ? getTouchPoint(moveEvent) : moveEvent;
      if (!movePoint || canceled) return;
      latestX = movePoint.clientX;
      latestY = movePoint.clientY;
      const dx = latestX - startX;
      const dy = latestY - startY;
      if (!started) {
        if (needsHold) {
          const distance = Math.hypot(dx, dy);
          const cancelDistance = inputType === "touch" ? TOUCH_SCROLL_CANCEL_DISTANCE : TOUCH_DRAG_CANCEL_DISTANCE;
          if (distance > cancelDistance) {
            if (holdTimer) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
            canceled = true;
            clearDragPending(sourceRow);
          }
          return;
        }
        if (Math.hypot(dx, dy) < POINTER_DRAG_START_DISTANCE) return;
        start();
      }
      moveEvent.preventDefault();
      start();
      moveGhost(latestX, latestY);
      place(latestX, latestY);
    };

    const onEnd = (endEvent) => {
      if (finished) return;
      finished = true;
      if (holdTimer) window.clearTimeout(holdTimer);
      if (!canceled && started && placeholder.parentElement === dropList) {
        endEvent.preventDefault();
        dropped = true;
        const targetIndex = getLayoutPlaceholderIndex(dropList, placeholder);
        addRootContainerToActiveLayout(containerId, targetIndex, { closeDialog: false, renderAfter: false });
      }
      if (started) {
        sourceRow.dataset.justDragged = "true";
        window.setTimeout(() => {
          delete sourceRow.dataset.justDragged;
        }, 250);
      }
      cleanup();
      if (dropped) render();
    };

    const onKeyDown = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      canceled = true;
      onEnd(keyEvent);
    };

    if (needsHold) {
      holdTimer = window.setTimeout(start, TOUCH_DRAG_DELAY_MS);
    }
    if (inputType === "touch") {
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", onEnd, { passive: false });
      document.addEventListener("touchcancel", onEnd, { passive: false });
    } else {
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd, { passive: false });
      document.addEventListener("pointercancel", onEnd, { passive: false });
    }
    document.addEventListener("keydown", onKeyDown);
  };

  document.querySelectorAll("[data-layout-member-row-drag], [data-root-drag]").forEach((handle) => {
    handle.draggable = false;
    handle.addEventListener("contextmenu", preventDragContextMenu);
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      startDrag({ handle, event });
    });
    handle.addEventListener("touchstart", (event) => {
      startDrag({ handle, event, inputType: "touch" });
    }, { passive: true });
  });
}

function askConfirmDialog({ title, text, okText, cancelText = "Отмена", highlightText = "", highlightCount = "", tone = "" }) {
  const isDestructiveAction = tone === "danger" || /удал|сброс|разобрать|выйти/i.test(okText);
  refs.confirmTitle.textContent = title;
  refs.confirmText.innerHTML = highlightText
    ? `${escapeHtml(text)}<span class="confirm-highlight confirm-${tone || "safe"}">${highlightCount ? `<strong class="confirm-highlight-count">${escapeHtml(highlightCount)}</strong>` : ""}${escapeHtml(highlightText)}</span>`
    : escapeHtml(text);
  refs.confirmCancelBtn.textContent = cancelText;
  refs.confirmOkBtn.textContent = okText;
  refs.confirmCancelBtn.classList.remove("danger-action");
  refs.confirmOkBtn.classList.toggle("danger-action", isDestructiveAction);
  refs.confirmDialog.classList.toggle("danger-confirm-dialog", isDestructiveAction);
  refs.confirmDialog.returnValue = "";
  return new Promise((resolve) => {
    const cleanup = () => {
      refs.confirmDialog.removeEventListener("close", handleClose);
      refs.confirmCancelBtn.onclick = null;
      refs.confirmOkBtn.onclick = null;
      refs.confirmCancelBtn.classList.remove("danger-action");
      refs.confirmOkBtn.classList.remove("danger-action");
      refs.confirmDialog.classList.remove("danger-confirm-dialog");
    };
    const handleClose = () => {
      const confirmed = refs.confirmDialog.returnValue === "default";
      cleanup();
      resolve(confirmed);
    };
    refs.confirmCancelBtn.onclick = (event) => {
      event.preventDefault();
      refs.confirmDialog.close("cancel");
    };
    refs.confirmOkBtn.onclick = (event) => {
      event.preventDefault();
      refs.confirmDialog.close("default");
    };
    refs.confirmDialog.addEventListener("close", handleClose);
    openModalDialog(refs.confirmDialog);
  });
}

function askUnsavedChangesDialog() {
  refs.confirmTitle.textContent = "Есть несохранённые изменения";
  refs.confirmText.textContent = "Сохранить изменения перед закрытием?";
  refs.confirmCancelBtn.textContent = "Закрыть без сохранения";
  refs.confirmOkBtn.textContent = "Сохранить";
  refs.confirmCancelBtn.classList.add("danger-action");
  refs.confirmOkBtn.classList.remove("danger-action");
  refs.confirmDialog.classList.remove("danger-confirm-dialog");
  refs.confirmDialog.returnValue = "";

  return new Promise((resolve) => {
    const closeBtn = refs.confirmCloseBtn || refs.confirmDialog.querySelector("header .icon-button");
    const cleanup = () => {
      refs.confirmDialog.removeEventListener("close", handleClose);
      refs.confirmCancelBtn.onclick = null;
      refs.confirmOkBtn.onclick = null;
      closeBtn?.removeEventListener("click", keepEditing);
      refs.confirmCancelBtn.classList.remove("danger-action");
      refs.confirmOkBtn.classList.remove("danger-action");
      refs.confirmDialog.classList.remove("danger-confirm-dialog");
    };
    const handleClose = () => {
      const value = refs.confirmDialog.returnValue;
      cleanup();
      if (value === "save") {
        resolve("save");
      } else if (value === "discard") {
        resolve("discard");
      } else {
        resolve("keep");
      }
    };
    const keepEditing = (event) => {
      event.preventDefault();
      refs.confirmDialog.close("keep");
    };
    refs.confirmCancelBtn.onclick = (event) => {
      event.preventDefault();
      refs.confirmDialog.close("discard");
    };
    refs.confirmOkBtn.onclick = (event) => {
      event.preventDefault();
      refs.confirmDialog.close("save");
    };
    closeBtn?.addEventListener("click", keepEditing);
    refs.confirmDialog.addEventListener("close", handleClose);
    openModalDialog(refs.confirmDialog);
  });
}

function showToast(message, type = "") {
  if (!refs.toastRegion) return;
  const signature = `${type}:${message}`;
  const now = Date.now();
  if (signature === lastToastSignature && now - lastToastAt < 2500) return;
  lastToastSignature = signature;
  lastToastAt = now;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  refs.toastRegion.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}

function openConfirmDialog({ title, text, okText, highlightText = "", highlightCount = "", tone = "", onConfirm }) {
  askConfirmDialog({ title, text, okText, highlightText, highlightCount, tone }).then((confirmed) => {
    if (!confirmed) return;
    onConfirm();
  });
}

function formatThingCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} вещи`;
  return `${count} вещей`;
}

function renderRootContainersEditor() {
  const roots = getRootContainersForSettings();
  const counts = getRootContainerUsageCounts();
  const sortLabel = rootContainerSortMode === "asc" ? "А-Я" : rootContainerSortMode === "desc" ? "Я-А" : "Без";
  const sortTitle = rootContainerSortMode === "asc" ? "Сортировка А-Я. Нажмите для Я-А" :
    rootContainerSortMode === "desc" ? "Сортировка Я-А. Нажмите, чтобы сбросить" :
      "Без сортировки. Нажмите для А-Я";
  return `
    <section class="settings-panel layout-editor">
      <div class="items-toolbar root-containers-toolbar">
        <button id="addRootContainerBtn">Добавить сумку или место</button>
        <div class="items-filter-row">
          <label>
            Участие в укладке
            <select id="rootContainerUsageFilter">
              <option value="all"${rootContainerUsageFilter === "all" ? " selected" : ""}>Все сумки и места (${counts.all})</option>
              <option value="current"${rootContainerUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
              <option value="unused"${rootContainerUsageFilter === "unused" ? " selected" : ""}>Вне текущей укладки (${counts.unused})</option>
            </select>
          </label>
          <button id="rootContainerSortBtn" class="ghost item-sort-button ${rootContainerSortMode !== "none" ? "active" : ""}" type="button" title="${sortTitle}" aria-label="${sortTitle}">
            ${sortLabel}
          </button>
        </div>
      </div>
      <div class="root-container-list">
        ${roots.map(renderRootContainerCard).join("") || `<div class="empty">Ничего не найдено</div>`}
      </div>
    </section>
  `;
}

function renderRootContainerCard(container) {
  const filterMatch = isFilterContextActive() && matchesRootContainerFieldsFilter(container);
  const meta = [
    container.color ? `Цвет: ${container.color}` : "",
    Number(container.weight || 0) ? `Вес: ${formatWeight(container.weight)}` : "",
    Number(container.volume || 0) ? `Объём: ${formatVolume(container.volume)}` : ""
  ].filter(Boolean).join(" · ");
  if (false && editingRootContainerId === container.id) {
    return `
      <article class="item-card root-container-card editing" data-root-card="${container.id}">
        <div class="root-container-edit-grid">
          <label>
            Название
            <input data-root-name="${container.id}" value="${escapeHtml(container.name)}" />
          </label>
          <label class="compact-field">
            Вес, г
            <input data-root-weight="${container.id}" type="number" min="0" step="1" inputmode="numeric" value="${Number(container.weight || 0)}" />
          </label>
          <button data-save-root="${container.id}">Сохранить</button>
        </div>
      </article>
    `;
  }
  return `
    <article class="item-card root-container-card ${filterMatch ? "filter-match" : ""}" data-root-card="${container.id}" data-root-drag="${container.id}" ${filterMatch ? `data-filter-match-id="root-${container.id}"` : ""} title="Удерживайте и перетащите в укладку">
      <div class="item-card-top root-container-card-top">
        <div class="root-container-title-block">
          <strong class="item-title root-container-title" data-root-title="${container.id}">${highlight(container.name)}</strong>
          ${state.showItemMeta && meta ? `<span class="root-container-meta">${highlight(meta)}</span>` : ""}
        </div>
        <button class="copy-item-button" data-copy-root="${container.id}" aria-label="Скопировать" title="Скопировать">
          <span aria-hidden="true">⧉</span>
        </button>
        <button class="edit-button" data-edit-root="${container.id}" aria-label="Редактировать" title="Редактировать">
          <span aria-hidden="true">&#9998;</span>
        </button>
        <button class="delete-item-button" data-delete-root="${container.id}" aria-label="Удалить" title="Удалить">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      ${renderItemPhoto(container)}
    </article>
  `;
}

function bindRootContainersEditor() {
  document.querySelector("#rootContainerUsageFilter")?.addEventListener("change", (event) => {
    rootContainerUsageFilter = event.target.value;
    render();
  });

  document.querySelector("#rootContainerSortBtn")?.addEventListener("click", () => {
    rootContainerSortMode = rootContainerSortMode === "none" ? "asc" : rootContainerSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    render();
  });

  document.querySelectorAll("[data-save-root]").forEach((button) => {
    button.addEventListener("click", () => {
      const containerId = button.dataset.saveRoot;
      const input = document.querySelector(`[data-root-name="${containerId}"]`);
      const weightInput = document.querySelector(`[data-root-weight="${containerId}"]`);
      const name = input.value.trim();
      if (!name) return;
      state.containers[containerId].name = name;
      state.containers[containerId].weight = parseWeightInput(weightInput.value);
      touchContainer(containerId);
      editingRootContainerId = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-copy-root]").forEach((button) => {
    button.addEventListener("click", () => copyRootContainer(button.dataset.copyRoot));
  });

  document.querySelectorAll("[data-edit-root]").forEach((button) => {
    button.addEventListener("click", () => {
      openRootContainerDialog(button.dataset.editRoot);
    });
  });

  document.querySelectorAll("[data-delete-root]").forEach((button) => {
    button.addEventListener("click", () => confirmDeleteRootContainer(button.dataset.deleteRoot));
  });

  document.querySelectorAll("[data-root-title]").forEach((title) => {
    const edit = (event) => {
      if (event.target.closest("button, input")) return;
      if (document.body.classList.contains("dragging-ui")) return;
      const card = title.closest(".root-container-card");
      if (card?.dataset.justDragged === "true") return;
      event.preventDefault();
      openRootContainerDialog(title.dataset.rootTitle);
    };
    title.addEventListener("click", (event) => {
      const containerId = title.dataset.rootTitle;
      const now = Date.now();
      const isDoubleTap = event.detail === 2 || (lastRootContainerTitleTap.id === containerId && now - lastRootContainerTitleTap.time < 360);
      if (isDoubleTap) {
        lastRootContainerTitleTap = { id: "", time: 0 };
        edit(event);
        return;
      }
      lastRootContainerTitleTap = { id: containerId, time: now };
    });
    title.addEventListener("dblclick", edit);
  });

  document.querySelectorAll(".root-container-card.editing input").forEach((input) => {
    if (input.matches("[data-root-name]")) {
      input.focus({ preventScroll: true });
      input.select();
    }
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.closest(".root-container-card")?.querySelector("[data-save-root]")?.click();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editingRootContainerId = null;
        render();
      }
    });
  });

  document.querySelector("#addRootContainerBtn")?.addEventListener("click", () => openRootContainerDialog());
}

function renderDictionary(title, type, values) {
  return `
    <section class="settings-panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="chips dictionary-list">
        ${values.map((value) => renderDictionaryEntry(type, value)).join("")}
      </div>
      <div class="add-row">
        <input id="${type}Input" placeholder="Новое значение" />
        <button id="${type}Add">Добавить</button>
      </div>
    </section>
  `;
}

function renderDictionaryEntry(type, value) {
  const editing = editingDictionaryEntry?.type === type && editingDictionaryEntry?.value === value;
  if (editing) {
    return `
      <span class="chip dictionary-chip dictionary-chip-editing">
        <input data-dictionary-edit-input="${type}" value="${escapeHtml(value)}" />
        <button class="edit-button dictionary-save-button" data-save-${type}="${escapeHtml(value)}" aria-label="Сохранить" title="Сохранить">
          <span aria-hidden="true">✓</span>
        </button>
        <button class="delete-item-button dictionary-cancel-button" data-cancel-${type}="${escapeHtml(value)}" aria-label="Отмена" title="Отмена">
          <span aria-hidden="true">&times;</span>
        </button>
      </span>
    `;
  }
  return `
    <span class="chip dictionary-chip">
      <span class="dictionary-chip-title">${escapeHtml(value)}</span>
      <button class="edit-button" data-edit-${type}="${escapeHtml(value)}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-remove-${type}="${escapeHtml(value)}" aria-label="Удалить" title="Удалить">
        <span aria-hidden="true">&times;</span>
      </button>
    </span>
  `;
}

function bindDictionary(type) {
  const listName = type === "location" ? "locations" : "categories";
  const input = document.querySelector(`#${type}Input`);
  document.querySelector(`#${type}Add`).addEventListener("click", () => {
    const value = input.value.trim();
    if (!value || state[listName].includes(value)) return;
    state[listName].push(value);
    editingDictionaryEntry = null;
    input.value = "";
    saveState();
    render();
  });
  document.querySelectorAll(`[data-edit-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      editingDictionaryEntry = { type, value: button.dataset[`edit${capitalize(type)}`] };
      render();
    });
  });
  document.querySelectorAll(`[data-cancel-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      editingDictionaryEntry = null;
      render();
    });
  });
  document.querySelectorAll(`[data-save-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      const oldValue = button.dataset[`save${capitalize(type)}`];
      const editInput = button.closest(".dictionary-chip")?.querySelector(`[data-dictionary-edit-input="${type}"]`);
      renameDictionaryEntry(type, oldValue, editInput?.value || "");
    });
  });
  document.querySelectorAll(`[data-dictionary-edit-input="${type}"]`).forEach((editInput) => {
    editInput.focus({ preventScroll: true });
    editInput.select();
    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameDictionaryEntry(type, editingDictionaryEntry?.value || "", editInput.value);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editingDictionaryEntry = null;
        render();
      }
    });
  });
  document.querySelectorAll(`[data-remove-${type}]`).forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset[`remove${capitalize(type)}`];
      if (state[listName].length <= 1) return;
      const affectedCount = Object.values(state.items).filter((item) => {
        if (type === "location") return item.location === value;
        return itemCategories(item).includes(value);
      }).length;
      const fallback = state[listName].find((item) => item !== value);
      const title = type === "location" ? "Удалить место хранения?" : "Удалить категорию?";
      const subject = type === "location" ? "место хранения" : "категорию";
      openConfirmDialog({
        title,
        text: `Если удалить ${subject} «${value}», связанные вещи будут перенесены в «${fallback}».`,
        highlightText: affectedCount
          ? `Сейчас применяется к ${formatThingCount(affectedCount)}.`
          : "Сейчас не применяется ни к одной вещи.",
        okText: "Удалить",
        tone: affectedCount ? "danger" : "safe",
        onConfirm: () => {
          const changedAt = nowIso();
          state[listName] = state[listName].filter((item) => item !== value);
          Object.values(state.items).forEach((item) => {
            if (type === "location" && item.location === value) {
              item.location = fallback;
              markEdited(item, changedAt);
            }
            if (type === "category" && itemCategories(item).includes(value)) {
              item.categories = itemCategories(item).map((category) => category === value ? fallback : category)
                .filter((category, index, list) => list.indexOf(category) === index);
              item.category = item.categories[0];
              markEdited(item, changedAt);
            }
          });
          saveState();
          render();
        }
      });
    });
  });
}

function renameDictionaryEntry(type, oldValue, rawNewValue) {
  const listName = type === "location" ? "locations" : "categories";
  const newValue = String(rawNewValue || "").trim();
  if (!oldValue || !newValue) return;
  if (newValue === oldValue) {
    editingDictionaryEntry = null;
    render();
    return;
  }
  if (state[listName].includes(newValue)) {
    showToast("Такое значение уже есть.", "warning");
    return;
  }
  const changedAt = nowIso();
  state[listName] = state[listName].map((value) => value === oldValue ? newValue : value);
  if (type === "location") {
    Object.values(state.items).forEach((item) => {
      if (item.location !== oldValue) return;
      item.location = newValue;
      markEdited(item, changedAt);
    });
    Object.values(state.containers).forEach((container) => {
      if (container.location !== oldValue) return;
      container.location = newValue;
      touchContainer(container.id, changedAt);
    });
    if (refs.locationFilter.value === oldValue) refs.locationFilter.value = newValue;
  } else {
    Object.values(state.items).forEach((item) => {
      if (!itemCategories(item).includes(oldValue)) return;
      item.categories = itemCategories(item).map((category) => category === oldValue ? newValue : category)
        .filter((category, index, list) => list.indexOf(category) === index);
      item.category = item.categories[0];
      markEdited(item, changedAt);
    });
    selectedCategoryFilters = selectedCategoryFilters.map((category) => category === oldValue ? newValue : category)
      .filter((category, index, list) => list.indexOf(category) === index);
  }
  editingDictionaryEntry = null;
  saveState();
  render();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function moveItem(itemId, targetContainerId, targetIndex = null, options = {}) {
  const item = state.items[itemId];
  if (!item || !state.containers[targetContainerId]) return;
  if (options.captureScroll !== false) capturePackingScroll();
  const changedAt = nowIso();
  const oldContainerId = item.containerId;
  const oldContainer = oldContainerId ? state.containers[oldContainerId] : null;
  if (oldContainer) {
    oldContainer.itemIds = oldContainer.itemIds.filter((id) => id !== itemId);
    oldContainer.order = (oldContainer.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
  }
  const targetItems = state.containers[targetContainerId].itemIds;
  if (!targetItems.includes(itemId)) targetItems.push(itemId);
  const targetOrder = state.containers[targetContainerId].order || [];
  state.containers[targetContainerId].order = targetOrder;
  const index = targetIndex === null ? targetOrder.length : Math.max(0, Math.min(targetIndex, targetOrder.length));
  targetOrder.splice(index, 0, { type: "item", id: itemId });
  item.containerId = targetContainerId;
  touchItem(itemId, changedAt);
  touchContainer(targetContainerId, changedAt);
  if (oldContainerId && oldContainerId !== targetContainerId) touchContainer(oldContainerId, changedAt);
  touchActiveLayout(changedAt);
  if (oldContainerId && oldContainerId !== targetContainerId) cleanupEmptyContainers(oldContainerId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function moveContainer(containerId, targetParentId, targetIndex = null) {
  const container = state.containers[containerId];
  const targetParent = state.containers[targetParentId];
  if (!container || !targetParent) return;
  if (containerId === targetParentId) return;
  if (getDescendantContainerIds(containerId).includes(targetParentId)) return;
  capturePackingScroll();
  const changedAt = nowIso();

  const oldParentId = container.parentId;
  if (oldParentId) {
    const oldParent = state.containers[container.parentId];
    oldParent.childIds = oldParent.childIds.filter((id) => id !== containerId);
    oldParent.order = (oldParent.order || []).filter((entry) => !(entry.type === "container" && entry.id === containerId));
  }

  targetParent.childIds.push(containerId);
  const targetOrder = targetParent.order || [];
  targetParent.order = targetOrder;
  const index = targetIndex === null
    ? targetOrder.length
    : Math.max(0, Math.min(targetIndex, targetOrder.length));
  targetOrder.splice(index, 0, { type: "container", id: containerId });
  container.parentId = targetParentId;
  touchContainer(containerId, changedAt);
  touchContainer(targetParentId, changedAt);
  if (oldParentId && oldParentId !== targetParentId) touchContainer(oldParentId, changedAt);
  touchActiveLayout(changedAt);
  if (oldParentId && oldParentId !== targetParentId) cleanupEmptyContainers(oldParentId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function createGroupFromItems(itemId, targetItemId) {
  if (itemId === targetItemId) return;
  const item = state.items[itemId];
  const targetItem = state.items[targetItemId];
  if (!item || !targetItem) return;

  const sourceParent = state.containers[item.containerId];
  const targetParent = state.containers[targetItem.containerId];
  if (!sourceParent || !targetParent) return;
  capturePackingScroll();
  const changedAt = nowIso();

  const targetIndex = (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === targetItemId);
  const sourceIndexInTarget = sourceParent.id === targetParent.id
    ? (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === itemId)
    : -1;
  const insertIndex = Math.max(0, targetIndex - (sourceIndexInTarget >= 0 && sourceIndexInTarget < targetIndex ? 1 : 0));
  const groupId = `container-${Date.now()}`;

  const removeItemRef = (container, removedId) => {
    container.itemIds = container.itemIds.filter((id) => id !== removedId);
    container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === removedId));
  };

  removeItemRef(sourceParent, itemId);
  removeItemRef(targetParent, targetItemId);
  if (sourceParent.id !== targetParent.id) removeItemRef(targetParent, itemId);

  state.containers[groupId] = {
    id: groupId,
    name: "Новый пакет",
    parentId: targetParent.id,
    childIds: [],
    itemIds: [targetItemId, itemId],
    order: [
      { type: "item", id: targetItemId },
      { type: "item", id: itemId }
    ],
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.containers[groupId]);

  targetParent.childIds.push(groupId);
  targetParent.order = targetParent.order || [];
  targetParent.order.splice(Math.min(insertIndex, targetParent.order.length), 0, { type: "container", id: groupId });
  targetItem.containerId = groupId;
  item.containerId = groupId;
  touchItem(itemId, changedAt);
  touchItem(targetItemId, changedAt);
  touchContainer(targetParent.id, changedAt);
  if (sourceParent.id !== targetParent.id) touchContainer(sourceParent.id, changedAt);
  touchActiveLayout(changedAt);
  state.collapsedContainers[groupId] = false;
  editingContainerId = groupId;
  if (sourceParent.id !== targetParent.id) cleanupEmptyContainers(sourceParent.id);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeItemFromActiveLayout(itemId) {
  const item = state.items[itemId];
  if (!item || !item.containerId) return;
  detachItemFromContainer(itemId, item.containerId);
  render();
}

function detachItemFromContainer(itemId, containerId, options = {}) {
  const item = state.items[itemId];
  const container = containerId ? state.containers[containerId] : null;
  if (!item || !container) return;
  if (options.captureScroll !== false) capturePackingScroll();
  const changedAt = options.changedAt || nowIso();
  container.itemIds = container.itemIds.filter((id) => id !== itemId);
  container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
  item.containerId = null;
  touchItem(itemId, changedAt);
  touchContainer(containerId, changedAt);
  touchActiveLayout(changedAt);
  cleanupEmptyContainers(containerId);
  saveState();
  scheduleActivePublishedEditSave();
}

function confirmRemoveItemFromActiveLayout(itemId) {
  const item = state.items[itemId];
  if (!item || !item.containerId) return;
  openConfirmDialog({
    title: "Убрать вещь из укладки?",
    text: `«${item.name}» исчезнет из текущей укладки, но останется во вкладке «Вещи» как незадействованная.`,
    highlightText: "Вещь сейчас участвует в текущей укладке.",
    okText: "Убрать",
    tone: "danger",
    onConfirm: () => removeItemFromActiveLayout(itemId)
  });
}

function confirmDeleteItem(itemId) {
  const item = state.items[itemId];
  if (!item) return;
  const placements = describeItemLayoutPlacements(item);
  const placementText = placements.length
    ? `Сейчас используется:\n${placements.map((placement) => `- ${placement}`).join("\n")}`
    : "Сейчас вещь вне укладок.";
  openConfirmDialog({
    title: "Удалить вещь навсегда?",
    text: `«${item.name}» будет удалена из списка вещей и из всех укладок. Это действие нельзя отменить.`,
    highlightText: placementText,
    okText: "Удалить",
    tone: placements.length ? "danger" : "safe",
    onConfirm: () => deleteItemForever(itemId)
  });
}

function describeItemLayoutPlacements(item) {
  if (!item?.containerId || !state.containers[item.containerId]) return [];
  const path = containerPath(item.containerId);
  return Object.values(state.layouts).flatMap((layout) => {
    const rootId = (layout.rootContainerIds || []).find((id) =>
      id === item.containerId || getDescendantContainerIds(id).includes(item.containerId)
    );
    const root = rootId ? state.containers[rootId] : null;
    if (!root) return [];
    const place = rootId === item.containerId ? "" : `, место «${path}»`;
    return [`${layout.name}: столбец «${root.name}»${place}`];
  });
}

function deleteItemForever(itemId) {
  const item = state.items[itemId];
  const oldContainerId = item?.containerId;
  const changedAt = nowIso();
  normalizeItemPhotos(item).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(itemId, photo);
  });
  Object.values(state.containers).forEach((container) => {
    const hadItem = (container.itemIds || []).includes(itemId) ||
      (container.order || []).some((entry) => entry.type === "item" && entry.id === itemId);
    container.itemIds = (container.itemIds || []).filter((id) => id !== itemId);
    container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
    if (hadItem) markEdited(container, changedAt);
  });
  touchLayoutsReferencingItem(itemId, changedAt);
  delete state.items[itemId];
  delete state.packedItems?.[itemId];
  if (oldContainerId) cleanupEmptyContainers(oldContainerId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function copyItem(itemId, options = {}) {
  const item = state.items[itemId];
  if (!item) return;
  const keepPlacement = Boolean(options.keepPlacement);
  const changedAt = nowIso();
  const id = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const container = keepPlacement && item.containerId ? state.containers[item.containerId] : null;
  state.items[id] = {
    ...item,
    id,
    name: makeItemCopyName(item.name),
    containerId: container ? item.containerId : "",
    photos: [],
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.items[id]);
  if (!container) {
    state.items[id].containerId = "";
  } else {
    const itemIndex = (container.itemIds || []).indexOf(itemId);
    container.itemIds = container.itemIds || [];
    container.itemIds.splice(itemIndex >= 0 ? itemIndex + 1 : container.itemIds.length, 0, id);
    container.order = container.order || [];
    const orderIndex = container.order.findIndex((entry) => entry.type === "item" && entry.id === itemId);
    container.order.splice(orderIndex >= 0 ? orderIndex + 1 : container.order.length, 0, { type: "item", id });
    touchContainer(container.id, changedAt);
  }
  delete state.packedItems?.[id];
  saveState();
  scheduleActivePublishedEditSave();
  render();
  showToast(container ? "Вещь скопирована рядом с исходной." : "Вещь скопирована вне укладки.", "success");
}

async function copyRootContainer(containerId) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  if (layout && !isAdminEditablePublishedLayout(layoutId)) {
    const sourceSnapshot = snapshotContainerTree(containerId, { excludeLayoutId: layoutId });
    if (!(layout.rootContainerIds || []).includes(containerId)) {
      if (sourceSnapshot && linkExistingContainerTreeToLayout(sourceSnapshot, layoutId, "")) return;
      addRootContainerToActiveLayout(containerId);
      showToast("Сумка добавлена в текущую укладку без создания дубля.", "success");
      return;
    }
    const duplicate = await askConfirmDialog({
      title: "Сумка уже есть в этой укладке",
      text: `«${container.name || "Сумка"}» уже участвует в укладке «${layout.name || "Укладка"}». Создать отдельную копию верхнего уровня?`,
      okText: "Дублировать",
      cancelText: "Отмена",
      tone: "safe"
    });
    if (!duplicate) return;
    duplicateContainerTreeToLayout(containerId, layout.id, "");
    return;
  }
  duplicateRootContainer(containerId, { addToLayoutId: layout?.id || "" });
}

function duplicateRootContainer(containerId, { addToLayoutId = "" } = {}) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  const changedAt = nowIso();
  const copyId = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.containers[copyId] = {
    ...container,
    id: copyId,
    name: makeContainerCopyName(container.name),
    parentId: null,
    childIds: [],
    itemIds: [],
    order: [],
    color: normalizeContainerColor(container.color),
    photos: [],
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.containers[copyId]);
  const targetLayout = state.layouts?.[addToLayoutId];
  if (targetLayout && !(targetLayout.rootContainerIds || []).includes(copyId)) {
    targetLayout.rootContainerIds = [...(targetLayout.rootContainerIds || []), copyId];
    touchLayout(addToLayoutId, changedAt);
  }
  saveState();
  scheduleActivePublishedEditSave();
  render();
  showToast(targetLayout
    ? "Сумка или место продублированы в текущей укладке."
    : "Сумка или место скопированы пустыми вне укладки.", "success");
}

function makeContainerCopyName(name) {
  const baseName = `${name} копия`;
  const names = new Set(Object.values(state.containers).filter((container) => !container.parentId).map((container) => container.name));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

function confirmDeleteRootContainer(containerId) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  const itemCount = getContainerItemIdsDeep(containerId).length;
  const layoutNames = Object.values(state.layouts)
    .filter((layout) => (layout.rootContainerIds || []).includes(containerId))
    .map((layout) => layout.name);
  const layoutText = layoutNames.length
    ? `Используется в укладках:\n${layoutNames.map((name) => `- ${name}`).join("\n")}`
    : "Сейчас не используется ни в одной укладке.";
  const itemsText = itemCount
    ? `\n${formatThingCount(itemCount)} из этой сумки/места останутся во вкладке «Вещи» как вне укладки.`
    : "";
  openConfirmDialog({
    title: "Удалить сумку или место?",
    text: `«${container.name}» будет удалено из списка сумок и мест и из всех укладок.`,
    highlightText: `${layoutText}${itemsText}`,
    okText: "Удалить",
    tone: layoutNames.length || itemCount ? "danger" : "safe",
    onConfirm: () => deleteRootContainer(containerId)
  });
}

function deleteRootContainer(containerId) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  const changedAt = nowIso();
  getContainerItemIdsDeep(containerId).forEach((itemId) => {
    if (!state.items[itemId]) return;
    state.items[itemId].containerId = "";
    markEdited(state.items[itemId], changedAt);
    delete state.packedItems?.[itemId];
  });
  Object.values(state.layouts).forEach((layout) => {
    if (!(layout.rootContainerIds || []).includes(containerId)) return;
    layout.rootContainerIds = layout.rootContainerIds.filter((id) => id !== containerId);
    markEdited(layout, changedAt);
  });
  removeContainerTree(containerId);
  if (editingRootContainerId === containerId) editingRootContainerId = null;
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeRootContainerFromActiveLayout(containerId) {
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  const container = state.containers[containerId];
  if (!layout || !container || container.parentId) return;
  const changedAt = nowIso();
  markRecordActivePublicCatalog(container);
  clearRootContainerContents(containerId, changedAt);
  layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => id !== containerId);
  touchLayout(layoutId, changedAt);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function clearRootContainerContents(containerId, changedAt = nowIso()) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  getContainerItemIdsDeep(containerId).forEach((itemId) => {
    if (!state.items[itemId]) return;
    markRecordActivePublicCatalog(state.items[itemId]);
    state.items[itemId].containerId = "";
    markEdited(state.items[itemId], changedAt);
    delete state.packedItems?.[itemId];
  });
  [...(container.childIds || [])].forEach(removeContainerTree);
  container.childIds = [];
  container.itemIds = [];
  container.order = [];
  delete state.collapsedContainers?.[containerId];
  markEdited(container, changedAt);
}

function removeContainerTree(containerId) {
  const container = state.containers[containerId];
  if (!container) return;
  [...(container.childIds || [])].forEach(removeContainerTree);
  normalizeItemPhotos(container).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(containerId, photo, "container");
  });
  delete state.collapsedContainers?.[containerId];
  delete state.containers[containerId];
}

function makeItemCopyName(name) {
  const baseName = `${name} копия`;
  const names = new Set(Object.values(state.items).map((item) => item.name));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

function touchLayoutsReferencingItem(itemId, changedAt = nowIso()) {
  Object.values(state.layouts || {}).forEach((layout) => {
    const arrangement = layout?.arrangement;
    const hasItem = Boolean(
      arrangement?.items?.[itemId] ||
      Object.values(arrangement?.containers || {}).some((placement) => {
        if (!placement || typeof placement !== "object") return false;
        if ((placement.itemIds || []).includes(itemId)) return true;
        return (placement.order || []).some((entry) => entry?.type === "item" && entry.id === itemId);
      })
    );
    if (hasItem) markEdited(layout, changedAt);
  });
}

function cleanupEmptyContainers(containerId) {
  let currentId = containerId;
  while (currentId) {
    const container = state.containers[currentId];
    if (!container || !container.parentId) return;
    if ((container.itemIds || []).length || (container.childIds || []).length) return;
    const parent = state.containers[container.parentId];
    if (!parent) return;
    parent.childIds = (parent.childIds || []).filter((id) => id !== currentId);
    parent.order = (parent.order || []).filter((entry) => !(entry.type === "container" && entry.id === currentId));
    markEdited(parent);
    delete state.collapsedContainers[currentId];
    delete state.containers[currentId];
    currentId = parent.id;
  }
}

function getColumnPlaceholderIndex(board, placeholder) {
  const cards = [...board.children].filter((child) =>
    child.classList?.contains("container-card") && !child.classList.contains("dragging")
  );
  const index = cards.findIndex((card) => card === placeholder.nextElementSibling);
  if (index >= 0) return index;
  return cards.length;
}

function isOriginalRootColumnPosition(containerId, targetIndex) {
  const layout = getPublishedWorkLayout();
  const originalIndex = layout.rootContainerIds.indexOf(containerId);
  return targetIndex === originalIndex;
}

function moveRootColumn(containerId, targetIndex) {
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  if (!layout.rootContainerIds.includes(containerId)) return;
  capturePackingScroll();
  layout.rootContainerIds = layout.rootContainerIds.filter((id) => id !== containerId);
  const index = Math.max(0, Math.min(targetIndex, layout.rootContainerIds.length));
  layout.rootContainerIds.splice(index, 0, containerId);
  touchLayout(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function openRootContainerDialog(containerId = null) {
  const container = containerId ? state.containers[containerId] : null;
  if (containerId && !container) return;
  editingRootContainerId = containerId || null;
  rootContainerDialogPendingRootIds = null;
  rootContainerDialogPendingParentId = undefined;
  rootContainerDialogPendingParentIndex = null;
  refs.rootContainerDialogTitle.textContent = containerId ? "Редактировать сумку или место" : "Добавить сумку или место";
  refs.rootContainerName.value = container?.name || "";
  refs.rootContainerWeight.value = Number(container?.weight || 0);
  refs.rootContainerVolume.value = container?.volume ? String(container.volume).replace(".", ",") : "";
  if (refs.rootContainerColor) refs.rootContainerColor.value = container?.color || "";
  fillRootContainerLocationSelect(container?.location || defaultRootContainerLocation(state));
  updateRootContainerPlacementButton();
  if (refs.rootContainerCopyToContainerBtn) refs.rootContainerCopyToContainerBtn.hidden = !containerId;
  refs.rootContainerNote.value = container?.note || "";
  rootContainerDialogPhotoDraft = null;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview(primaryItemPhoto(container || { photos: [] }));
  rootContainerDialogInitialSnapshot = getRootContainerDialogSnapshot();
  updateRootContainerDialogSaveState();
  openModalDialog(refs.rootContainerDialog);
}

function fillRootContainerLocationSelect(selected = "") {
  const fallback = defaultRootContainerLocation(state);
  const options = state.locations.map((location) => [location, location]);
  fillSelect(refs.rootContainerLocation, options, selected || fallback);
}

function openItemDialog(itemId = null) {
  resetSharedReadonlyItemDialog();
  editingItemId = itemId;
  itemDialogTargetLayoutId = getPublishedEditLayoutId();
  const item = itemId ? state.items[itemId] : {
    name: "",
    weight: 0,
    quantity: 1,
    location: state.locations[0],
    category: "Прочее",
    categories: ["Прочее"],
    containerId: "",
    note: "",
    photos: []
  };
  refs.dialogTitle.textContent = itemId ? "Редактировать вещь" : "Добавить вещь";
  refs.itemName.value = item.name;
  refs.itemWeight.value = item.weight || 0;
  refs.itemQuantity.value = itemQuantity(item);
  updateItemQuantityUi();
  refs.itemLocation.value = item.location;
  renderItemCategoryPicker(itemId ? itemCategories(item) : [], { fallbackDefault: Boolean(itemId) });
  refs.itemContainer.value = item.containerId || "";
  updateItemContainerPickerButton();
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = !itemId;
  refs.itemNote.value = item.note || "";
  itemDialogPhotoDraft = null;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(primaryItemPhoto(item));
  itemDialogInitialSnapshot = getItemDialogSnapshot();
  updateItemDialogSaveState();
  openModalDialog(refs.dialog);
}

function openSharedReadonlyItemDialog(sourceItemId) {
  const match = findSharedItem(sourceItemId);
  if (!match) return;
  sharedDialogCopyItemId = sourceItemId;
  editingItemId = null;
  const item = match.item;
  refs.dialogTitle.textContent = "Просмотр вещи";
  refs.itemName.value = item.name || "";
  refs.itemWeight.value = Number(item.weightGrams || 0);
  refs.itemQuantity.value = 1;
  updateItemQuantityUi();
  refs.itemLocation.value = defaultRootContainerLocation(state);
  renderItemCategoryPicker(["Прочее"], { fallbackDefault: true });
  refs.itemContainer.value = "";
  updateItemContainerPickerButton();
  refs.itemNote.value = item.description || "";
  itemDialogPhotoDraft = null;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(primaryItemPhoto({ photos: sharedGearPhotos(item) }));
  setSharedReadonlyItemDialog(true);
  openModalDialog(refs.dialog);
}

function setSharedReadonlyItemDialog(readonly) {
  refs.copySharedItemDialogBtn.hidden = !readonly;
  refs.saveItemBtn.hidden = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = readonly;
  refs.dialog.querySelectorAll("input, textarea, select").forEach((element) => {
    element.disabled = readonly;
  });
  refs.itemContainerPickerBtn.disabled = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.disabled = readonly;
  refs.itemPhotoRemoveBtn.disabled = readonly;
  refs.itemPhotoInput.disabled = readonly;
  refs.dialog.querySelectorAll(".item-photo-pick").forEach((label) => {
    label.classList.toggle("disabled", readonly);
  });
}

function resetSharedReadonlyItemDialog() {
  sharedDialogCopyItemId = "";
  if (!refs.copySharedItemDialogBtn || !refs.saveItemBtn) return;
  setSharedReadonlyItemDialog(false);
}

function copySharedItemFromReadonlyDialog() {
  const itemId = sharedDialogCopyItemId;
  if (!itemId) return;
  refs.dialog.close();
  copySharedItem(itemId);
}

function uniqueLayoutName(baseName = "Новая укладка") {
  const base = String(baseName || "Новая укладка").trim() || "Новая укладка";
  const existing = new Set(Object.values(state.layouts || {}).map((layout) =>
    String(layout?.name || "").trim().toLowerCase()
  ));
  if (!existing.has(base.toLowerCase())) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}`;
}

function openLayoutDialog() {
  refs.layoutName.value = uniqueLayoutName("Новая укладка");
  refs.layoutCreateMode.value = "empty";
  refs.layoutCopyFrom.value = state.activeLayoutId;
  updateLayoutCopyVisibility();
  openModalDialog(refs.layoutDialog);
}

function updateLayoutCopyVisibility() {
  const shouldCopy = refs.layoutCreateMode.value === "copy";
  refs.layoutCopyLabel.hidden = !shouldCopy;
  refs.layoutCopyLabel.setAttribute("aria-hidden", String(!shouldCopy));
  refs.layoutCopyFrom.disabled = !shouldCopy;
}

function saveNewLayout(event) {
  event.preventDefault();
  captureActiveLayoutArrangement();
  const shouldCopy = refs.layoutCreateMode.value === "copy";
  const source = state.layouts[refs.layoutCopyFrom.value] || state.layouts[state.activeLayoutId];
  const name = refs.layoutName.value.trim();
  if (!name) return;
  const id = `layout-${Date.now()}`;
  const arrangement = shouldCopy
    ? clone(source.arrangement || createLayoutArrangementFromCurrentState(state, source.rootContainerIds || []))
    : createEmptyLayoutArrangement();
  state.layouts[id] = {
    id,
    name,
    rootContainerIds: [...arrangement.rootContainerIds],
    arrangement,
    ...(!canUsePrivateState() ? { [GUEST_DEMO_COPY_FLAG]: true } : {}),
    ...currentEditMeta()
  };
  saveState();
  if (!canUsePrivateState()) setActiveLocalEditableScope(id);
  switchActiveLayout(id);
  refs.layoutDialog.close();
  switchView("bags");
  render();
}

function handleRootContainerFormSubmit(event) {
  event.preventDefault();
  if (event.submitter === refs.saveRootContainerBtn) {
    saveRootContainerDialog(event);
    return;
  }
  if (event.submitter?.value === "cancel") {
    requestCloseRootContainerDialog();
    return;
  }
  if (isEditableElement(document.activeElement)) {
    document.activeElement.blur();
  }
}

function handleItemFormSubmit(event) {
  event.preventDefault();
  if (event.submitter === refs.saveItemBtn) {
    saveDialogItem(event);
    return;
  }
  if (event.submitter?.value === "cancel") {
    requestCloseItemDialog();
    return;
  }
  if (isEditableElement(document.activeElement)) {
    document.activeElement.blur();
  }
}

async function requestCloseItemDialog() {
  if (!hasSavableItemDialogChanges()) {
    refs.dialog.close("cancel");
    return;
  }
  const action = await askUnsavedChangesDialog();
  if (action === "save") {
    saveDialogItem();
    return;
  }
  if (action === "discard") refs.dialog.close("cancel");
}

async function requestCloseRootContainerDialog() {
  if (!hasSavableRootContainerDialogChanges()) {
    refs.rootContainerDialog.close("cancel");
    return;
  }
  const action = await askUnsavedChangesDialog();
  if (action === "save") {
    saveRootContainerDialog();
    return;
  }
  if (action === "discard") refs.rootContainerDialog.close("cancel");
}

function getItemDialogSnapshot() {
  return {
    name: refs.itemName.value.trim(),
    weight: parseWeightInput(refs.itemWeight.value),
    quantity: readItemDialogQuantity(),
    location: refs.itemLocation.value,
    categories: getDialogCheckedCategories().join("\u0000"),
    containerId: refs.itemContainer.value || "",
    note: refs.itemNote.value.trim(),
    photo: getItemDialogPhotoSnapshot()
  };
}

function getItemDialogPhotoSnapshot() {
  if (itemDialogPhotoDraft?.remove) return "remove";
  if (itemDialogPhotoDraft?.photo) return `draft:${itemPhotoMetaSignature(itemDialogPhotoDraft.photo)}`;
  return editingItemId ? itemPhotoSignature(state.items[editingItemId]) : "";
}

function itemPhotoMetaSignature(photo) {
  if (!photo) return "";
  return [photo.id, photo.localId, photo.status, photo.url, photo.thumbUrl, photo.updatedAt].join("|");
}

async function handleItemPhotoInputChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setItemDialogPhotoStatus("Готовлю фото...");
    const photo = await createItemPhotoFromFile(file);
    itemDialogPhotoDraft = { photo, remove: false };
    updateItemDialogPhotoPreview(photo);
    updateItemDialogSaveState();
  } catch (error) {
    setItemDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  }
}

function removeItemDialogPhoto() {
  itemDialogPhotoDraft = { photo: null, remove: true };
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(null);
  updateItemDialogSaveState();
}

function resetItemDialogPhotoDraft() {
  itemDialogPhotoDraft = null;
  if (itemDialogPhotoObjectUrl) URL.revokeObjectURL(itemDialogPhotoObjectUrl);
  itemDialogPhotoObjectUrl = "";
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(null);
}

async function updateItemDialogPhotoPreview(photo) {
  if (!refs.itemPhotoPreview) return;
  if (itemDialogPhotoObjectUrl) URL.revokeObjectURL(itemDialogPhotoObjectUrl);
  itemDialogPhotoObjectUrl = "";
  if (!photo) {
    refs.itemPhotoPreview.innerHTML = "";
    refs.itemPhotoPreview.classList.add("empty");
    refs.itemPhotoRemoveBtn.hidden = true;
    setItemDialogPhotoStatus("");
    return;
  }
  const src = photoRemoteSrc(photo) || await getLocalPhotoPreviewUrl(photo);
  refs.itemPhotoPreview.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="" />` : "";
  refs.itemPhotoPreview.classList.toggle("empty", !src);
  refs.itemPhotoRemoveBtn.hidden = false;
  setItemDialogPhotoStatus(photo.status === "synced" ? "Фото загружено" : "Фото сохранено локально и ждёт синхронизации");
}

async function getLocalPhotoPreviewUrl(photo) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  if (!blob) return "";
  itemDialogPhotoObjectUrl = URL.createObjectURL(blob);
  return itemDialogPhotoObjectUrl;
}

function setItemDialogPhotoStatus(message) {
  if (refs.itemPhotoStatus) refs.itemPhotoStatus.textContent = message || "";
}

function getRootContainerDialogPhotoSnapshot() {
  if (rootContainerDialogPhotoDraft?.remove) return "remove";
  if (rootContainerDialogPhotoDraft?.photo) return `draft:${itemPhotoMetaSignature(rootContainerDialogPhotoDraft.photo)}`;
  return editingRootContainerId ? itemPhotoSignature(state.containers[editingRootContainerId]) : "";
}

async function handleRootContainerPhotoInputChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setRootContainerDialogPhotoStatus("Готовлю фото...");
    const photo = await createItemPhotoFromFile(file);
    rootContainerDialogPhotoDraft = { photo, remove: false };
    updateRootContainerDialogPhotoPreview(photo);
    updateRootContainerDialogSaveState();
  } catch (error) {
    setRootContainerDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  }
}

function removeRootContainerDialogPhoto() {
  rootContainerDialogPhotoDraft = { photo: null, remove: true };
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview(null);
  updateRootContainerDialogSaveState();
}

function resetRootContainerDialogPhotoDraft() {
  rootContainerDialogPhotoDraft = null;
  if (rootContainerDialogPhotoObjectUrl) URL.revokeObjectURL(rootContainerDialogPhotoObjectUrl);
  rootContainerDialogPhotoObjectUrl = "";
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview(null);
}

async function updateRootContainerDialogPhotoPreview(photo) {
  if (!refs.rootContainerPhotoPreview) return;
  if (rootContainerDialogPhotoObjectUrl) URL.revokeObjectURL(rootContainerDialogPhotoObjectUrl);
  rootContainerDialogPhotoObjectUrl = "";
  if (!photo) {
    refs.rootContainerPhotoPreview.innerHTML = "";
    refs.rootContainerPhotoPreview.classList.add("empty");
    refs.rootContainerPhotoRemoveBtn.hidden = true;
    setRootContainerDialogPhotoStatus("");
    return;
  }
  const src = photoRemoteSrc(photo) || await getLocalRootContainerPhotoPreviewUrl(photo);
  refs.rootContainerPhotoPreview.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="" />` : "";
  refs.rootContainerPhotoPreview.classList.toggle("empty", !src);
  refs.rootContainerPhotoRemoveBtn.hidden = false;
  setRootContainerDialogPhotoStatus(photo.status === "synced" ? "Фото загружено" : "Фото сохранено локально и ждёт синхронизации");
}

async function getLocalRootContainerPhotoPreviewUrl(photo) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  if (!blob) return "";
  rootContainerDialogPhotoObjectUrl = URL.createObjectURL(blob);
  return rootContainerDialogPhotoObjectUrl;
}

function setRootContainerDialogPhotoStatus(message) {
  if (refs.rootContainerPhotoStatus) refs.rootContainerPhotoStatus.textContent = message || "";
}

function readItemDialogQuantity() {
  return normalizeItemQuantity(refs.itemQuantity?.value);
}

function normalizeItemQuantity(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.round(number);
}

function normalizeItemQuantityInput() {
  refs.itemQuantity.value = readItemDialogQuantity();
  updateItemQuantityUi();
}

function changeItemDialogQuantity(delta) {
  refs.itemQuantity.value = Math.max(1, readItemDialogQuantity() + delta);
  updateItemQuantityUi();
}

function updateItemQuantityUi() {
  const quantity = readItemDialogQuantity();
  refs.itemQuantityMinus.classList.toggle("quantity-button-hidden", quantity <= 1);
  refs.itemQuantityMinus.tabIndex = quantity <= 1 ? -1 : 0;
  refs.itemQuantityMinus.setAttribute("aria-hidden", String(quantity <= 1));
  refs.itemTotalWeight.textContent = formatWeight(parseWeightInput(refs.itemWeight.value) * quantity);
  updateItemDialogSaveState();
}

function getRootContainerDialogSnapshot() {
  return {
    name: refs.rootContainerName.value.trim(),
    weight: parseWeightInput(refs.rootContainerWeight.value),
    volume: parseVolumeInput(refs.rootContainerVolume.value),
    color: normalizeContainerColor(refs.rootContainerColor?.value),
    location: refs.rootContainerLocation.value || defaultRootContainerLocation(state),
    note: refs.rootContainerNote.value.trim(),
    photo: getRootContainerDialogPhotoSnapshot(),
    parentId: editingRootContainerId && state.containers[editingRootContainerId]?.parentId
      ? getRootContainerDialogParentId()
      : "",
    parentIndex: editingRootContainerId && state.containers[editingRootContainerId]?.parentId
      ? getRootContainerDialogParentIndex()
      : "",
    layoutRootIds: editingRootContainerId && !state.containers[editingRootContainerId]?.parentId
      ? getRootContainerDialogLayoutRootIds().join("\u0000")
      : ""
  };
}

function getDialogCheckedCategories() {
  return [...refs.itemCategoryList.querySelectorAll("input:checked")].map((input) => input.value);
}

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateItemDialogSaveState() {
  if (!refs.saveItemBtn) return;
  const snapshot = getItemDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !itemDialogInitialSnapshot || !snapshotsEqual(snapshot, itemDialogInitialSnapshot);
  refs.saveItemBtn.disabled = !hasName || !changed;
  refs.saveItemBtn.classList.toggle("muted-save", refs.saveItemBtn.disabled);
}

function hasSavableItemDialogChanges() {
  updateItemDialogSaveState();
  return refs.dialog?.open && refs.saveItemBtn && !refs.saveItemBtn.disabled;
}

function updateRootContainerDialogSaveState() {
  if (!refs.saveRootContainerBtn) return;
  const snapshot = getRootContainerDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !rootContainerDialogInitialSnapshot || !snapshotsEqual(snapshot, rootContainerDialogInitialSnapshot);
  refs.saveRootContainerBtn.disabled = !hasName || !changed;
  refs.saveRootContainerBtn.classList.toggle("muted-save", refs.saveRootContainerBtn.disabled);
}

function hasSavableRootContainerDialogChanges() {
  updateRootContainerDialogSaveState();
  return refs.rootContainerDialog?.open && refs.saveRootContainerBtn && !refs.saveRootContainerBtn.disabled;
}

function saveRootContainerDialog(event) {
  event?.preventDefault();
  if (refs.saveRootContainerBtn.disabled) return;
  const name = refs.rootContainerName.value.trim();
  if (!name) return;
  const changedAt = nowIso();
  const container = editingRootContainerId ? state.containers[editingRootContainerId] : null;
  if (editingRootContainerId && !container) return;
  if (!container) {
    const id = `container-${Date.now()}`;
    state.containers[id] = {
      id,
      name,
      parentId: null,
      childIds: [],
      itemIds: [],
      order: [],
      weight: parseWeightInput(refs.rootContainerWeight.value),
      volume: parseVolumeInput(refs.rootContainerVolume.value),
      color: normalizeContainerColor(refs.rootContainerColor?.value),
      location: refs.rootContainerLocation.value || defaultRootContainerLocation(state),
      note: refs.rootContainerNote.value.trim(),
      photos: rootContainerDialogPhotoDraft?.photo ? [rootContainerDialogPhotoDraft.photo] : [],
      ...currentCreateMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.containers[id]);
    refs.rootContainerDialog.close();
    saveState();
    scheduleActivePublishedEditSave();
    render();
    return;
  }
  container.name = name;
  container.weight = parseWeightInput(refs.rootContainerWeight.value);
  container.volume = parseVolumeInput(refs.rootContainerVolume.value);
  container.color = normalizeContainerColor(refs.rootContainerColor?.value);
  container.location = refs.rootContainerLocation.value || defaultRootContainerLocation(state);
  container.note = refs.rootContainerNote.value.trim();
  applyRootContainerDialogPhotoDraft(container, changedAt);
  markRecordActivePublicCatalog(container);
  touchContainer(container.id, changedAt);
  applyRootContainerDialogParent(changedAt);
  applyRootContainerDialogPlacement();
  refs.rootContainerDialog.close();
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function saveDialogItem(event) {
  event?.preventDefault();
  if (refs.saveItemBtn.disabled) return;
  const name = refs.itemName.value.trim();
  if (!name) return;
  const containerId = refs.itemContainer.value;
  capturePackingScroll();
  const changedAt = nowIso();
  const selectedCategories = getDialogSelectedCategories();

  if (editingItemId) {
    const item = state.items[editingItemId];
    const previousContainerId = item.containerId || "";
    item.name = name;
    item.weight = parseWeightInput(refs.itemWeight.value);
    item.quantity = readItemDialogQuantity();
    item.location = refs.itemLocation.value;
    item.categories = selectedCategories;
    item.category = selectedCategories[0];
    item.note = refs.itemNote.value.trim();
    applyItemDialogPhotoDraft(item, changedAt);
    markRecordActivePublicCatalog(item);
    touchItem(editingItemId, changedAt);
    if (previousContainerId !== containerId) {
      refs.dialog.close();
      if (containerId) {
        moveItem(editingItemId, containerId, null, { captureScroll: false });
        scheduleActivePublishedEditSave();
        return;
      }
      detachItemFromContainer(editingItemId, previousContainerId, { captureScroll: false, changedAt });
      scheduleActivePublishedEditSave();
      render();
      return;
    }
  } else {
    const id = `item-${Date.now()}`;
    state.items[id] = {
      id,
      name,
      weight: parseWeightInput(refs.itemWeight.value),
      quantity: readItemDialogQuantity(),
      location: refs.itemLocation.value,
      category: selectedCategories[0],
      categories: selectedCategories,
      containerId,
      note: refs.itemNote.value.trim(),
      photos: itemDialogPhotoDraft?.photo ? [itemDialogPhotoDraft.photo] : [],
      ...currentEditMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.items[id]);
    if (containerId && state.containers[containerId]) {
      state.containers[containerId].itemIds.push(id);
      state.containers[containerId].order = state.containers[containerId].order || [];
      state.containers[containerId].order.push({ type: "item", id });
      touchContainer(containerId, changedAt);
    }
  }

  saveState();
  scheduleActivePublishedEditSave();
  refs.dialog.close();
  render();
}

function applyItemDialogPhotoDraft(item, changedAt = nowIso()) {
  if (!itemDialogPhotoDraft) return;
  const oldPhoto = primaryItemPhoto(item);
  if (itemDialogPhotoDraft.remove) {
    item.photos = [];
    if (oldPhoto?.localId || oldPhoto?.id) deleteCachedPhoto(oldPhoto.localId || oldPhoto.id);
    if (oldPhoto?.url || oldPhoto?.thumbUrl) deleteRemotePhotoIfPossible(item.id, oldPhoto);
    markEdited(item, changedAt);
    return;
  }
  if (itemDialogPhotoDraft.photo) {
    item.photos = [itemDialogPhotoDraft.photo];
    if (oldPhoto && oldPhoto.id !== itemDialogPhotoDraft.photo.id) {
      if (oldPhoto.localId || oldPhoto.id) deleteCachedPhoto(oldPhoto.localId || oldPhoto.id);
      if (oldPhoto.url || oldPhoto.thumbUrl) deleteRemotePhotoIfPossible(item.id, oldPhoto);
    }
    markEdited(item, changedAt);
  }
}

function applyRootContainerDialogPhotoDraft(container, changedAt = nowIso()) {
  if (!rootContainerDialogPhotoDraft) return;
  const oldPhoto = primaryItemPhoto(container);
  if (rootContainerDialogPhotoDraft.remove) {
    container.photos = [];
    if (oldPhoto?.localId || oldPhoto?.id) deleteCachedPhoto(oldPhoto.localId || oldPhoto.id);
    if (oldPhoto?.url || oldPhoto?.thumbUrl) deleteRemotePhotoIfPossible(container.id, oldPhoto, "container");
    markEdited(container, changedAt);
    return;
  }
  if (rootContainerDialogPhotoDraft.photo) {
    container.photos = [rootContainerDialogPhotoDraft.photo];
    if (oldPhoto && oldPhoto.id !== rootContainerDialogPhotoDraft.photo.id) {
      if (oldPhoto.localId || oldPhoto.id) deleteCachedPhoto(oldPhoto.localId || oldPhoto.id);
      if (oldPhoto.url || oldPhoto.thumbUrl) deleteRemotePhotoIfPossible(container.id, oldPhoto, "container");
    }
    markEdited(container, changedAt);
  }
}

function applyRootContainerDialogParent(changedAt = nowIso()) {
  if (rootContainerDialogPendingParentId === undefined || !editingRootContainerId) return false;
  const container = state.containers[editingRootContainerId];
  const targetParent = state.containers[rootContainerDialogPendingParentId];
  if (!container || !container.parentId || !targetParent) return false;
  if (container.id === targetParent.id) return false;
  if (getDescendantContainerIds(container.id).includes(targetParent.id)) return false;
  const oldParentId = container.parentId;
  const requestedIndex = rootContainerDialogPendingParentIndex;
  if (oldParentId === targetParent.id && requestedIndex === null) return false;
  const oldParent = state.containers[oldParentId];
  const insertIndex = normalizeContainerParentInsertIndex(container.id, targetParent.id, requestedIndex);
  if (oldParent) {
    oldParent.childIds = (oldParent.childIds || []).filter((id) => id !== container.id);
    oldParent.order = (oldParent.order || []).filter((entry) => !(entry.type === "container" && entry.id === container.id));
    touchContainer(oldParent.id, changedAt);
  }
  targetParent.childIds = targetParent.childIds || [];
  if (!targetParent.childIds.includes(container.id)) targetParent.childIds.push(container.id);
  targetParent.order = (targetParent.order || []).filter((entry) => !(entry.type === "container" && entry.id === container.id));
  const index = insertIndex === null ? targetParent.order.length : Math.max(0, Math.min(insertIndex, targetParent.order.length));
  targetParent.order.splice(index, 0, { type: "container", id: container.id });
  container.parentId = targetParent.id;
  state.collapsedContainers[targetParent.id] = false;
  touchContainer(container.id, changedAt);
  touchContainer(targetParent.id, changedAt);
  if (oldParentId && oldParentId !== targetParent.id) cleanupEmptyContainers(oldParentId);
  return true;
}

function normalizeContainerParentInsertIndex(containerId, targetParentId, requestedIndex) {
  if (!Number.isFinite(requestedIndex)) return null;
  const container = state.containers[containerId];
  const targetParent = state.containers[targetParentId];
  if (!container || !targetParent) return requestedIndex;
  const currentIndex = (targetParent.order || []).findIndex((entry) => entry.type === "container" && entry.id === containerId);
  if (container.parentId === targetParentId && currentIndex >= 0 && currentIndex < requestedIndex) return requestedIndex - 1;
  return requestedIndex;
}

function getFilteredItems() {
  return Object.values(state.items).filter(matchesFilters);
}

function getActiveLayoutItems() {
  return Object.values(state.items).filter((item) => !isItemRemovedFromActiveLayout(item) && isItemInActiveLayout(item));
}

function getItemsForItemsView() {
  const items = getItemsForActiveCatalog().filter((item) => {
    if (!isFilterContextActive() && !matchesItemsViewFilters(item)) return false;
    if (itemUsageFilter === "current") return isItemInActiveLayout(item);
    if (itemUsageFilter === "away") return isItemAwayFromHomeAndBike(item);
    if (itemUsageFilter === "no-weight") return isItemWithoutWeight(item);
    if (itemUsageFilter === "unused") return !isItemInActiveLayout(item);
    return true;
  });
  if (itemSortMode === "asc") {
    return items.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  if (itemSortMode === "desc") {
    return items.sort((a, b) => b.name.localeCompare(a.name, "ru"));
  }
  return items.sort((a, b) => itemCreatedTime(b) - itemCreatedTime(a));
}

function getItemsForActiveCatalog() {
  return Object.entries(state.items)
    .filter(([itemId, item]) => isScopedCatalogLayout() || !isPublicSyncItem(itemId, item))
    .map(([, item]) => item)
    .filter((item) => isItemInActiveCatalog(item));
}

function itemCreatedTime(item) {
  const created = timeValue(item?.createdAt || item?.created_at);
  if (created) return created;
  const idTime = Number(String(item?.id || "").match(/^item-(\d+)/)?.[1] || 0);
  if (idTime) return idTime;
  return timeValue(item?.updatedAt || item?.updated_at);
}

function getItemsUsageCounts() {
  return getItemsForActiveCatalog().filter(matchesItemsViewFilters).reduce(
    (counts, item) => {
      counts.all += 1;
      if (isItemAwayFromHomeAndBike(item)) counts.away += 1;
      if (isItemWithoutWeight(item)) counts.noWeight += 1;
      if (isItemInActiveLayout(item)) {
        counts.current += 1;
      } else {
        counts.unused += 1;
      }
      return counts;
    },
    { all: 0, current: 0, away: 0, noWeight: 0, unused: 0 }
  );
}

function isScopedCatalogLayout(layoutId = getPublishedEditLayoutId()) {
  return isAdminEditablePublishedLayout(layoutId);
}

function getActiveCatalogContainerIdSet() {
  return getActiveLayoutContainerIdSet(getPublishedWorkLayout());
}

function isItemInActiveCatalog(item) {
  if (!isScopedCatalogLayout()) return true;
  if (!item) return false;
  const layoutId = getPublishedEditLayoutId();
  if (item.publicCatalogLayoutId === layoutId) return true;
  if (item.containerId && getActiveCatalogContainerIdSet().has(item.containerId)) return true;
  return Boolean(item.containerId && state.containers[item.containerId]?.publicCatalogLayoutId === layoutId);
}

function markRecordActivePublicCatalog(record) {
  if (!record || !isScopedCatalogLayout()) return;
  record.publicCatalogLayoutId = getPublishedEditLayoutId();
}

function isItemAwayFromHomeAndBike(item) {
  return item.location !== "Дом" && item.location !== "Уже на велосипеде";
}

function isItemWithoutWeight(item) {
  return !Number(item?.weight || 0);
}

function isItemInActiveLayout(item) {
  if (!item?.containerId) return false;
  const layout = getPublishedWorkLayout();
  if (!layout) return false;
  return getActiveLayoutContainerIdSet(layout).has(item.containerId);
}

function getActiveLayoutContainerIdSet(layout = state.layouts[state.activeLayoutId]) {
  const ids = new Set();
  getVisibleLayoutRootIds(layout).forEach((rootId) => {
    ids.add(rootId);
    getDescendantContainerIds(rootId).forEach((id) => ids.add(id));
  });
  return ids;
}

function getVisibleLayoutRootIds(layout = getPublishedWorkLayout()) {
  const rootIds = Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : [];
  if (!layout || isReadOnlyStateScope() || isAdminEditablePublishedLayout(layout.id)) return rootIds;
  return rootIds.filter((containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return false;
    return !isGeneratedCatalogContainerSyncArtifact(containerId, container) &&
      !isGeneratedCatalogContainerStateArtifact(containerId, container, state);
  });
}

function matchesFilters(item) {
  if (!matchesBaseFilters(item)) return false;
  return matchesCollectionFilter(item);
}

function matchesItemsViewFilters(item) {
  if (!matchesItemFieldsFilter(item, { includeContainerPath: true })) return false;
  return matchesCollectionFilter(item);
}

function matchesBaseFilters(item) {
  return matchesItemFieldsFilter(item);
}

function matchesCollectionFilter(item) {
  if (state.collectionMode && state.showOnlyUnpacked && isItemPacked(item.id)) return false;
  return true;
}

function matchesItemFieldsFilter(item, { includeContainerPath = false, ignoreLocation = false, ignoreCategories = false } = {}) {
  const query = refs.searchInput.value.trim().toLowerCase();
  const location = refs.locationFilter.value;
  const categories = selectedCategoryFilters;
  if (!ignoreLocation && location && item.location !== location) return false;
  if (!ignoreCategories && categories.length && !categories.some((category) => itemCategories(item).includes(category))) return false;
  if (!query) return true;
  return [
    item.name,
    itemCategories(item).join(" "),
    item.location,
    item.note || "",
    includeContainerPath && item.containerId ? containerPath(item.containerId) : ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function getAllContainers() {
  return Object.values(state.containers).sort((a, b) => containerPath(a.id).localeCompare(containerPath(b.id), "ru"));
}

function getDescendantContainerIds(containerId) {
  const container = state.containers[containerId];
  if (!container) return [];
  return container.childIds.flatMap((childId) => [childId, ...getDescendantContainerIds(childId)]);
}

function getRootContainers() {
  return Object.values(state.containers)
    .filter((container) => isScopedCatalogLayout() || !isPublicSyncContainer(container.id, container))
    .filter(isRootContainerForEditor)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function getRootContainersForSettings() {
  const roots = Object.values(state.containers).filter((container) => {
    if (!isScopedCatalogLayout() && isPublicSyncContainer(container.id, container)) return false;
    if (!isRootContainerForEditor(container)) return false;
    if (!isRootContainerInActiveCatalog(container)) return false;
    if (rootContainerUsageFilter === "current" && !isRootContainerInActiveLayout(container.id)) return false;
    if (rootContainerUsageFilter === "unused" && isRootContainerInActiveLayout(container.id)) return false;
    if (!matchesRootContainerFieldsFilter(container)) return false;
    return true;
  });
  if (rootContainerSortMode === "asc") {
    return roots.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  if (rootContainerSortMode === "desc") {
    return roots.sort((a, b) => b.name.localeCompare(a.name, "ru"));
  }
  return roots.sort((a, b) => containerCreatedTime(b) - containerCreatedTime(a));
}

function matchesRootContainerFieldsFilter(container, { ignoreLocation = false } = {}) {
  const query = refs.searchInput.value.trim().toLowerCase();
  const location = refs.locationFilter.value;
  const containerLocation = container.location || defaultRootContainerLocation(state);
  if (!ignoreLocation && location && containerLocation !== location) return false;
  if (!query) return true;
  return [
    container.name,
    container.color || "",
    containerLocation,
    container.note || ""
  ].join(" ").toLowerCase().includes(query);
}

function getRootContainerUsageCounts() {
  return Object.values(state.containers).filter((container) =>
    (isScopedCatalogLayout() || !isPublicSyncContainer(container.id, container)) &&
    isRootContainerForEditor(container) && isRootContainerInActiveCatalog(container)
  ).reduce(
    (counts, container) => {
      counts.all += 1;
      if (isRootContainerInActiveLayout(container.id)) counts.current += 1;
      else counts.unused += 1;
      return counts;
    },
    { all: 0, current: 0, unused: 0 }
  );
}

function isRootContainerInActiveLayout(containerId) {
  const layout = getPublishedWorkLayout();
  return Boolean(layout?.rootContainerIds?.includes(containerId));
}

function isRootContainerForEditor(container) {
  if (!container?.id) return false;
  if (isRootContainerInActiveLayout(container.id)) return true;
  if (isNestedContainerInAnyLayoutArrangement(container.id)) return false;
  return !container.parentId;
}

function isNestedContainerInAnyLayoutArrangement(containerId) {
  return Object.values(state.layouts || {}).some((layout) => {
    const placement = layout?.arrangement?.containers?.[containerId];
    if (placement?.parentId && state.containers?.[placement.parentId]) return true;
    return Object.values(layout?.arrangement?.containers || {}).some((parentPlacement) => {
      if (!parentPlacement || typeof parentPlacement !== "object") return false;
      if ((parentPlacement.childIds || []).includes(containerId)) return true;
      return (parentPlacement.order || []).some((entry) => entry?.type === "container" && entry.id === containerId);
    });
  });
}

function isRootContainerInActiveCatalog(container) {
  if (!isScopedCatalogLayout()) return true;
  if (!container) return false;
  return isRootContainerInActiveLayout(container.id) || container.publicCatalogLayoutId === getPublishedEditLayoutId();
}

function containerCreatedTime(container) {
  const created = timeValue(container?.createdAt || container?.created_at);
  if (created) return created;
  const idTime = Number(String(container?.id || "").match(/^container-(\d+)/)?.[1] || 0);
  if (idTime) return idTime;
  return timeValue(container?.updatedAt || container?.updated_at);
}

function containerPath(containerId) {
  const names = [];
  let current = state.containers[containerId];
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? state.containers[current.parentId] : null;
  }
  return names.join(" / ");
}

function containerWeight(containerId) {
  const container = state.containers[containerId];
  const ownContainerWeight = Number(container.weight || 0);
  const own = container.itemIds.reduce((sum, id) => sum + itemTotalWeight(state.items[id]), 0);
  const children = container.childIds.reduce((sum, id) => sum + containerWeight(id), 0);
  return ownContainerWeight + own + children;
}

function rootContainerOwnWeight(containerId) {
  const container = state.containers[containerId];
  return container && !container.parentId ? Number(container.weight || 0) : 0;
}

function itemQuantity(item) {
  return normalizeItemQuantity(item?.quantity);
}

function itemTotalWeight(item) {
  return Number(item?.weight || 0) * itemQuantity(item);
}

function formatItemWeight(item) {
  const quantity = itemQuantity(item);
  const total = itemTotalWeight(item);
  return quantity > 1 ? `${formatWeight(total)} (${quantity} шт.)` : formatWeight(total);
}

function renderItemQuantityText(item) {
  const quantity = itemQuantity(item);
  return quantity > 1 ? `<span class="quantity-inline">${quantity} шт.</span>` : "";
}

function exportData() {
  const html = buildPrintableDocument();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bike-packing-print.html";
  a.target = "_blank";
  a.click();
  URL.revokeObjectURL(url);
}

function buildPrintableDocument() {
  migrateContainerOrder(state);
  const layout = state.layouts[state.activeLayoutId];
  const rootContainerIds = getVisibleLayoutRootIds(layout);
  const generatedAt = new Date().toLocaleString("ru-RU");
  const totalWeight = rootContainerIds.reduce((sum, id) => sum + containerWeight(id), 0);
  const itemCount = rootContainerIds.reduce((sum, id) => sum + countItemsInContainer(id), 0);
  const missingCount = rootContainerIds.reduce((sum, id) => sum + countItemsByLocation(id, ["Надо купить", "Не знаю где"]), 0);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(layout.name)} — велопоход</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1d2522;
      background: #f6f4ee;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1f6f5b; padding-bottom: 18px; margin-bottom: 18px; }
    h1 { margin: 0 0 6px; font-size: 30px; }
    h2 { margin: 0; font-size: 20px; }
    h3 { margin: 0; font-size: 15px; }
    .muted { color: #62706b; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
    .metric { background: #fff; border: 1px solid #d8ddd7; border-radius: 8px; padding: 10px; }
    .metric strong { display: block; font-size: 22px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .bag { break-inside: avoid; background: #fff; border: 1px solid #cfd8d2; border-radius: 8px; overflow: hidden; }
    .bag-title { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #e3f1ec; border-bottom: 1px solid #c7ddd5; }
    .content { padding: 10px 12px; }
    .item, .box { break-inside: avoid; margin: 0 0 8px; }
    .item { border: 1px solid #d8ddd7; border-radius: 8px; padding: 8px; background: #fff; }
    .box { border: 1px solid #b9d3ca; border-left: 5px solid #1f6f5b; border-radius: 8px; background: #eef7f3; }
    .box-title { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; background: #e3f1ec; border-bottom: 1px solid #c7ddd5; font-weight: 800; }
    .box-content { padding: 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .pill { display: inline-block; border-radius: 999px; padding: 2px 7px; background: #dcece6; color: #1f6f5b; font-weight: 700; font-size: 11px; }
    .warn { background: #fde9dd; color: #b75d2a; }
    .print-note { margin-top: 18px; color: #62706b; font-size: 12px; }
    @media print {
      body { background: #fff; }
      main { max-width: none; padding: 0; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bag, .item, .box, .metric { box-shadow: none; }
    }
    @page { margin: 14mm; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Сборы в велопоход</h1>
        <div class="muted">Укладка: ${escapeHtml(layout.name)}</div>
      </div>
      <div class="muted">Сформировано: ${escapeHtml(generatedAt)}</div>
    </header>
    <section class="metrics">
      <div class="metric"><strong>${escapeHtml(formatWeight(totalWeight))}</strong><span>общий вес</span></div>
      <div class="metric"><strong>${itemCount}</strong><span>вещей в укладке</span></div>
      <div class="metric"><strong>${missingCount}</strong><span>надо купить / не знаю где</span></div>
    </section>
    <section class="grid">
      ${rootContainerIds.map((id) => renderPrintableContainer(id, true)).join("")}
    </section>
    <p class="print-note">Подсказка: в окне печати можно выбрать «Сохранить как PDF».</p>
  </main>
</body>
</html>`;
}

function renderPrintableContainer(containerId, root = false) {
  const container = state.containers[containerId];
  if (!container) return "";
  const entries = (container.order || []).map((entry) => {
    if (entry.type === "item") return renderPrintableItem(entry.id);
    if (entry.type === "container") return renderPrintableContainer(entry.id, false);
    return "";
  }).join("");
  const tag = root ? "article" : "section";
  const className = root ? "bag" : "box";
  const titleClass = root ? "bag-title" : "box-title";
  const contentClass = root ? "content" : "box-content";
  return `<${tag} class="${className}">
    <div class="${titleClass}">
      <h2>${escapeHtml(container.name)}</h2>
      <strong>${escapeHtml(formatWeight(containerWeight(containerId)))}</strong>
    </div>
    <div class="${contentClass}">${entries}</div>
  </${tag}>`;
}

function renderPrintableItem(itemId) {
  const item = state.items[itemId];
  if (!item) return "";
  const warn = item.location === "Надо купить" || item.location === "Не знаю где";
  return `<div class="item">
    <h3>${escapeHtml(item.name)}</h3>
    <div class="meta">
      <span class="pill">${escapeHtml(formatItemWeight(item))}</span>
      ${itemCategories(item).map((category) => `<span class="pill">${escapeHtml(category)}</span>`).join("")}
      <span class="pill ${warn ? "warn" : ""}">${escapeHtml(item.location)}</span>
    </div>
    ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ""}
  </div>`;
}

function countItemsInContainer(containerId) {
  const container = state.containers[containerId];
  if (!container) return 0;
  return container.itemIds.length + container.childIds.reduce((sum, id) => sum + countItemsInContainer(id), 0);
}

function countItemsByLocation(containerId, locations) {
  const container = state.containers[containerId];
  if (!container) return 0;
  const own = container.itemIds.filter((id) => locations.includes(state.items[id]?.location)).length;
  return own + container.childIds.reduce((sum, id) => sum + countItemsByLocation(id, locations), 0);
}

function resetData() {
  const message = "Сбросить демо-укладку к начальному примеру?";
  openConfirmDialog({
    title: "Сбросить данные?",
    text: message,
    okText: "Сбросить",
    onConfirm: () => {
      saveRecoverySnapshot("before-reset", state);
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, createEmptyUserState());
      normalizeItemFields(state);
      repairContainerMembershipFromItemLinks(state);
      normalizeLayoutFields(state);
      normalizeItemCategories(state);
      saveState();
      render();
    }
  });
}

function highlight(value) {
  const text = String(value);
  const query = refs.searchInput.value.trim();
  if (!query) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let index = 0;
  let html = "";

  while (index < text.length) {
    const found = lowerText.indexOf(lowerQuery, index);
    if (found === -1) {
      html += escapeHtml(text.slice(index));
      break;
    }
    html += escapeHtml(text.slice(index, found));
    html += `<mark>${escapeHtml(text.slice(found, found + query.length))}</mark>`;
    index = found + query.length;
  }

  return html;
}
