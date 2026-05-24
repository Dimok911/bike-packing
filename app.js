import {
  STORAGE_KEY,
  APP_VERSION,
  SYNC_META_KEY,
  BASE_STATE_KEY,
  RECOVERY_STATE_KEY,
  RECOVERY_STATE_MAX,
  AUTH_SIGNED_OUT_KEY,
  FORCE_OFFLINE_KEY,
  UI_SETTINGS_KEY,
  ACTIVE_LIST_ID_KEY,
  ACTIVE_LAYOUT_CHOICE_KEY,
  ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
  ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
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
  SHARED_LAYOUT_QUERY_PARAM,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  ADMIN_EMAILS,
  ADMIN_USER_IDS,
  COLLAPSE_DEFAULTS_VERSION,
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
  demoSharedLayout
} from "./src/data/demo-data.js";
import { guessCategory, guessLocation } from "./src/data/guess.js";
import {
  cloneIsolatedPublicEntity,
  hasPrivateSyncBlockedPublicOrigin,
  legacySharedRootSnapshot,
  markLocalPublicCopyOrigin,
  markPrivateCopyOriginFromSource,
  publicCopySnapshotFromSourceSnapshot,
  publicCopySourceIdFromRecord,
  sanitizePrivateCopiedPublicOrigins,
  snapshotHasLocalPublicCopyOrigin,
  snapshotHasPrivateSyncBlockedPublicOrigin,
  stripPublishedPublicOriginMarkers,
  stripPublicOriginForPrivateCopy
} from "./src/public/copy-public-to-private.js";
import {
  publicCopyComparableText,
  summarizeLayoutIdDuplicates,
  summarizePublicCopyDuplicates
} from "./src/public/copy-duplicates.js";
import { createDeletedSharedLayoutStore } from "./src/public/deleted-shared-layouts.js";
import {
  markCopiedItemForPublicLayout,
  writeContainerTreeToLayoutArrangement
} from "./src/public/copy-public-layout-target.js";
import {
  generatedCatalogString,
  hasPublicOriginMarker,
  isGeneratedCatalogContainerStateArtifact,
  isGeneratedCatalogContainerSyncArtifact,
  isGeneratedCatalogStateArtifact,
  isGeneratedCatalogSyncArtifact,
  isPublicSyncContainer,
  isPublicSyncItem
} from "./src/public/generated-artifacts.js";
import {
  ensureGuestDemoPreviewPayload,
  isStartupGuestDemoPreview as isStartupGuestDemoPreviewState,
  readableGuestDemoLayoutName,
  shouldKeepReadonlyDemoAfterAuthCheck,
  shouldImportGuestLayoutBeforeRemote,
  shouldRenderGuestDemoPreviewDuringAuthCheck
} from "./src/public/guest-demo-startup.js";
import { publishedTemplateBlockReason } from "./src/public/public-template-availability.js";
import {
  demoLanguageFromLayoutChoice as demoLanguageFromLayoutChoiceValue,
  demoLayoutChoiceForLanguage as demoLayoutChoiceForLanguageValue,
  isDemoLayoutChoice as isDemoLayoutChoiceValue,
  languageOptionLabel as languageOptionLabelValue
} from "./src/public/demo-layout-choice.js";
import {
  guestDemoCopyCleanupPlan,
  normalizeDemoTemplateName,
  normalizePublishedDemoTemplatePayload
} from "./src/public/demo-template-state.js";
import {
  createSharedLayoutCatalogDiagnostics,
  shouldWarnAboutSharedLayoutCatalog
} from "./src/public/shared-layout-catalog-diagnostics.js";
import {
  buildAdminSharedTemplateOptions,
  compareSharedTemplateAdminOrder,
  selectLocalAdminTemplateCopyLayouts
} from "./src/public/admin-shared-template-options.js";
import {
  compareSharedLayoutIndexEntries,
  createSharedLayoutsByLanguage,
  findSharedLayoutForLanguage,
  isConcretePublicSharedLayoutListRecord,
  isPublicSharedLayoutListRecord,
  isTemplateCopySharedLayoutId,
  mergeSharedLayoutCatalogEntries,
  mergeSharedLayoutIndexPayload,
  normalizeSharedGearName,
  pruneRuntimeSharedLayouts,
  serverConfirmedSharedLayoutsFromPublicRecords,
  sharedLayoutIndexEntry,
  sharedLayoutIdFromPublicListRecord,
  sharedLayoutLanguageFromPayload,
  sharedGearPhotos,
  updateSharedLayoutCatalogEntryMetadata,
  upsertRuntimeSharedLayout,
  upsertSharedLayoutIndexEntry,
  visibleSharedLayoutsForLanguage,
  withRuntimeSharedLayoutIndex
} from "./src/public/shared-layouts.js";
import { applyPublishedPayloadPhotosToLayoutState } from "./src/public/published-payload-photos.js";
import {
  deletePublishedSharedTemplate as deletePublishedSharedTemplateRecord,
  purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState,
  removePublicSharedLayoutIndexEntry as removePublicSharedLayoutIndexEntryRecord
} from "./src/public/shared-layout-admin.js";
import {
  buildSharedListUrlFromHref,
  sharedLayoutIdFromUrl,
  sharedListIdFromUrl
} from "./src/public/shared-link-url.js";
import {
  originalSharedId,
  publicVirtualLayoutMarkers as publicVirtualLayoutMarkersForSharedState,
  sharedVirtualContainerId,
  sharedVirtualItemId,
  sharedVirtualLayoutId
} from "./src/public/shared-virtual-state.js";
import {
  reconcilePublishedTemplateCopyDraft,
  repairEmptyTemplateCopyDraftFromPublishedLayout
} from "./src/public/template-copy-admin-repair.js";
import {
  SHARED_CONTAINER_COPY_PICKER_MODE,
  SHARED_ITEM_COPY_PICKER_MODE,
  TEMPLATE_COPY_ICON_HTML,
  TEMPLATE_COPY_TITLE,
  collapsedDefaultsForTemplateContainers,
  isContainerPickerContainerCopyMode as isContainerPickerContainerCopyModeValue,
  isContainerPickerCopyMode as isContainerPickerCopyModeValue,
  isContainerPickerItemCopyMode as isContainerPickerItemCopyModeValue,
  shouldShowTemplateAddButton
} from "./src/public/template-copy.js";
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
import {
  hasContainerDimensions,
  normalizeContainerColor,
  normalizeContainerDimensions,
  parseContainerDimensionInput
} from "./src/state/container-fields.js";
import { cleanupGeneratedCatalogArtifacts } from "./src/state/cleanup.js";
import {
  applyCollectionModeFromSource,
  isCollectionPackedVisible,
  normalizeCollectionModeState,
  toggleCollectionModeEnabled,
  toggleShowOnlyUnpacked
} from "./src/state/collection-mode.js";
import {
  hasStateIntegrityMeta,
  isMeaningfulPackingState,
  isPackingStateShape,
  isSuspiciousEmptyPackingState,
  normalizeIntegrityCount,
  normalizeStateRevision,
  remoteStateIntegrityError,
  stateIntegrityMetaFromResponse,
  stateStats
} from "./src/state/diagnostics.js";
import {
  addCustomDictionaryValue,
  dictionaryOptionsForUi as dictionaryOptionsForUiValues,
  ensureLayoutDictionaries as ensureLayoutDictionariesForState,
  ensurePrivateDictionaries as ensurePrivateDictionariesForState,
  layoutDictionaryValues,
  normalizeDictionaryValues,
  readOnlyLayoutDictionaries as readOnlyLayoutDictionariesForState,
  removeCustomDictionaryValue,
  renameCustomDictionaryValue
} from "./src/state/dictionaries.js";
import { createBlankBikePackingState } from "./src/state/empty-state.js";
import {
  itemPhotoSignature,
  addPhotosToDraft,
  createPhotoDraftFromRecord,
  normalizeItemPhotos,
  normalizePhotoUrlFields,
  photoDraftChanged,
  removePhotoFromDraft,
  primaryItemPhoto
} from "./src/state/item-photos.js";
import {
  createEmptyLayoutArrangement,
  createLayoutArrangementFromCurrentState,
  uniqueLayoutIds
} from "./src/state/layout-arrangement.js";
import {
  bestMeaningfulLayoutId,
  layoutArrangementContentScore,
  resolvePreferredLayoutId
} from "./src/state/layout-choice.js";
import {
  removeLayoutTreeFromState,
  removeManagedSharedTemplateTreesFromState
} from "./src/state/layout-delete.js";
import {
  solidifyManagedTemplateDrafts as solidifyManagedTemplateDraftsForState,
  solidifyTemplateDraftLayout as solidifyTemplateDraftLayoutForState
} from "./src/state/layout-draft-solidify.js";
import {
  applyLayoutManageLanguage,
  adminTemplateDraftChoice,
  collectManagedPublicDraftRecords,
  createManagedLayoutCopyRecord,
  createTemplateCopyRecord,
  editedLayoutName,
  isDisposableManagedPublicDraft,
  layoutManageLanguage,
  managedSharedDraftLanguage,
  mergeManagedPublicDraftRecords,
  publicLayoutChoiceValue,
  shouldCreatePublishedTemplateBeforePhotos,
  templateCopySourceRootIds,
  templateDraftLayoutId,
  withoutPhotoReferences
} from "./src/state/layout-manage.js";
import {
  normalizeLayoutArrangement,
  normalizeLayoutFields,
  repairPublishedLayoutArrangement,
  snapshotContainerTreeFromLayoutArrangement
} from "./src/state/layout-normalize.js";
import {
  containerWeight as containerWeightForState,
  itemQuantity as itemQuantityForState,
  itemTotalWeight as itemTotalWeightForState,
  rootContainerOwnWeight as rootContainerOwnWeightForState
} from "./src/state/metrics.js";
import {
  containerCreatedTime as containerCreatedTimeForState,
  containerPath as containerPathForState,
  itemCreatedTime as itemCreatedTimeForState
} from "./src/state/record-derived.js";
import {
  applyEditMeta,
  createMetaForDevice,
  editMetaForDevice
} from "./src/state/record-meta.js";
import {
  canAddUsageEntries,
  usageLimitExceededMessage,
  usageLimitForRole
} from "./src/state/usage-limits.js";
import {
  collectPublicLayoutRecordIds,
  isPrivateCatalogRecord,
  isPublicCatalogContainerRecord as isPublicCatalogContainerRecordForState,
  isPublicCatalogItemRecord as isPublicCatalogItemRecordForState
} from "./src/state/public-layout-scope.js";
import {
  addItemToLayoutArrangement as addItemToLayoutArrangementForState,
  cleanupEmptyContainersInLayoutArrangement,
  ensureLayoutContainerPlacement as ensureLayoutContainerPlacementForState,
  getItemContainerIdInLayout as getItemContainerIdInLayoutForState,
  getLayoutDescendantContainerIds as getLayoutDescendantContainerIdsForState,
  getLayoutContainerIdSet as getLayoutContainerIdSetForState,
  getLayoutItemIdSet as getLayoutItemIdSetForState,
  moveContainerInLayoutArrangement as moveContainerInLayoutArrangementForState,
  moveItemInLayoutArrangement as moveItemInLayoutArrangementForState,
  removeItemFromLayoutArrangement
} from "./src/state/layout-ops.js";
import {
  getDescendantContainerIds as getDescendantContainerIdsForState,
  getVisibleLayoutRootIds as getVisibleLayoutRootIdsForState,
  isItemInCatalog as isItemInCatalogForState,
  isItemInLayout as isItemInLayoutForState,
  isNestedContainerInAnyLayoutArrangement as isNestedContainerInAnyLayoutArrangementForState,
  isRootContainerForEditor as isRootContainerForEditorForState,
  isRootContainerInCatalog as isRootContainerInCatalogForState,
  isRootContainerInLayout as isRootContainerInLayoutForState
} from "./src/state/layout-selectors.js";
import {
  createItemUsageCounts,
  createRootContainerUsageCounts
} from "./src/state/catalog-usage.js";
import {
  isItemAwayFromHomeAndBike as isItemAwayFromHomeAndBikeValue,
  isItemWithoutWeight as isItemWithoutWeightValue,
  matchesCollectionFilter as matchesCollectionFilterValue
} from "./src/state/catalog-filters.js";
import {
  matchesItemFieldsFilter as matchesItemFieldsFilterValue,
  matchesRootContainerFieldsFilter as matchesRootContainerFieldsFilterValue
} from "./src/state/catalog-search.js";
import { sortCatalogRecords } from "./src/state/catalog-sort.js";
import {
  activeLayoutNestedContainerIds as activeLayoutNestedContainerIdsForState,
  allActiveLayoutNestedContainersCollapsed as allActiveLayoutNestedContainersCollapsedForState,
  toggleActiveLayoutNestedContainersCollapsed as toggleActiveLayoutNestedContainersCollapsedForState
} from "./src/state/layout-collapse.js";
import {
  applyDefaultCollapsedContainers,
  defaultRootContainerLocation,
  itemCategories,
  migrateContainerOrder,
  normalizeContainerFields,
  normalizeItemFields,
  normalizeItemQuantity,
  normalizeItemCategories
} from "./src/state/normalize.js";
import { makeCopyName, uniqueName } from "./src/state/names.js";
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
import { isConflictMetaField } from "./src/sync/conflict-meta.js";
import {
  apiErrorMessage,
  apiFetchRequest,
  isNetworkError,
  isTemporaryServerStorageError,
  isTimeoutError
} from "./src/sync/api-client.js";
import { adminApiWarningFromCapabilities as adminApiWarningFromCapabilitiesValue } from "./src/sync/admin-api-compat.js";
import { fetchAdminReports } from "./src/sync/admin-reports.js";
import { createRemoteListRecordSelector } from "./src/sync/list-records.js";
import {
  formatHistoryDateTime,
  groupHistoryRecords as groupHistoryRecordsForSync,
  historyPayloadTitle,
  historyRecordKey,
  historyRecordState as historyRecordStateForSync,
  pluralRu,
  sortHistoryRecords,
  summarizeHistoryPayload
} from "./src/sync/history.js";
import {
  copyRecordPhotosForLocalDuplicate,
  createItemPhotoFromFile,
  deleteCachedPhoto,
  getCachedPhoto,
  hasRemotePhotoUrl,
  isPhotoStoredForList,
  normalizeRemotePhotoUrl,
  normalizeUploadedPhotoAssetUrls,
  photoCopyApiPath,
  photoRemoteSrc,
  putCachedPhoto,
  versionedPhotoUrl
} from "./src/sync/photos.js";
import {
  cloneStateForSyncPayload,
  remoteUpdatedAt,
  stripContainerArrangementFields,
  stripItemPlacementFields
} from "./src/sync/serialize.js";
import { registerAppServiceWorker } from "./src/sync/service-worker.js";
import {
  backupDownloadName,
  buildBackupManifest,
  buildBackupPhotoEntries,
  createBackupZip,
  readBackupArchiveFile
} from "./src/backup/archive.js";
import {
  addBackupDictionaryValues,
  backupLayoutRows as buildBackupLayoutRows,
  mergeBackupRecordWithExisting,
  summarizeBackupLayouts
} from "./src/backup/restore.js";
import {
  renderBackupAnalysis as renderBackupAnalysisUi,
  renderBackupRules,
  renderBackupSelectionSummary,
  resetBackupImportUi,
  selectedBackupLayoutIds as selectedBackupLayoutIdsFromUi
} from "./src/ui/backup-dialog.js";
import { createAdminReportsDialogController } from "./src/ui/admin-reports-dialog.js";
import {
  renderCatalogCard,
  renderCatalogPills
} from "./src/ui/catalog-card.js";
import {
  GUEST_STORAGE_SCOPE,
  scopedLocalStorageKey as scopedStorageKey,
  userStorageScopeKey
} from "./src/storage/scope.js";
import {
  isPrivateLayoutChoice as isPrivateLayoutChoiceValue,
  isPublicTemplateListId,
  isStoredActiveLayoutChoiceExplicit,
  loadStoredActiveLayoutChoice,
  loadStoredActivePackingListId,
  loadStoredActivePrivateLayoutChoice,
  normalizeActiveLayoutChoice as normalizeActiveLayoutChoiceValue,
  saveStoredActiveLayoutChoice,
  saveStoredActivePackingListId
} from "./src/storage/active-choice.js";
import {
  loadStoredUiSettings,
  saveStoredUiSettings
} from "./src/storage/ui-settings.js";
import {
  loadStoredSyncMeta,
  saveStoredSyncMeta
} from "./src/storage/sync-meta.js";
import {
  loadUiLanguage,
  saveUiLanguage
} from "./src/storage/ui-language.js";
import { loadSyncDevice } from "./src/storage/sync-device.js";
import {
  buildRememberedOfflineUser,
  currentUserIdFromStorage,
  getSavedAuthEmailFromStorage,
  rememberAuthenticatedUserInStorage,
  saveAuthEmailToStorage
} from "./src/storage/auth-scope.js";
import { escapeHtml } from "./src/utils/html.js";
import {
  clonePlain,
  formatCompactJson as formatCompactJsonValue,
  snapshotsEqual
} from "./src/utils/json.js";
import { normalizeUiLanguage } from "./src/utils/language.js";
import { isLocalDevOrigin } from "./src/utils/origin.js";
import { safeSetLocalStorage } from "./src/utils/storage.js";
import { capitalize, formatThingCount } from "./src/utils/text.js";
import { nowIso, timeValue } from "./src/utils/time.js";
import {
  formatVolume,
  formatWeight,
  parseVolumeInput,
  parseWeightInput
} from "./src/utils/weight.js";
import { createRefs } from "./src/ui/refs.js";
import { highlightSearchText } from "./src/ui/search-highlight.js";
import {
  formatItemWeight,
  renderItemQuantityText
} from "./src/ui/item-format.js";
import {
  formatFullDateTime
} from "./src/ui/date-format.js";
import {
  conflictVersionStamp as conflictVersionStampValue,
  describeChangedFields as describeChangedFieldsValue,
  formatArrangementConflictValue as formatArrangementConflictValueText
} from "./src/ui/conflict-format.js";
import {
  ITEM_DISPLAY_MODE_DEFAULT,
  ITEM_DISPLAY_MODE_PUBLIC_DEFAULT,
  ensureItemDisplayModeState,
  itemDisplayModeFromFlags,
  itemDisplayModeLabel,
  nextItemDisplayMode as nextItemDisplayModeValue,
  normalizeItemDisplayMode,
  publicReadonlyItemDisplayMode,
  shouldShowItemLabelsForMode,
  shouldShowItemPhotosForMode
} from "./src/ui/item-display-mode.js";
import {
  applySyncVisualState,
  resolveSyncVisualState
} from "./src/ui/sync-visual-state.js";
import {
  layoutCopyTitle,
  layoutEditTitle,
  privateLayoutDeleteConfirm,
  publicLayoutDeleteConfirm,
  publicTemplateOptionLabel
} from "./src/ui/layout-manage-dialog.js";
import {
  countPrivateLayouts,
  createLayoutLoadStatusController
} from "./src/ui/layout-load-status.js";
import {
  itemCopyConfirm,
  rootContainerCopyConfirm
} from "./src/ui/copy-confirm-dialog.js";
import {
  closeDialogWithoutRestoringFocus,
  currentPageScrollPosition,
  setupDialogKeyboardScrollGuard
} from "./src/ui/modal-focus.js";
import { createModalScrollLockController } from "./src/ui/modal-scroll-lock.js";
import {
  askPrintLabelsChoice,
  buildPrintableDocument,
  createPrintWindowTarget,
  printHtmlDocument
} from "./src/ui/print.js";
import { createConfirmDialogController } from "./src/ui/confirm-dialog.js";
import { normalizeSortMode } from "./src/ui/sort-mode.js";
import {
  defaultBike3dViewState,
  getBike3dPackingScrollHost,
  isBike3dPackingView,
  normalizeBike3dViewState,
  normalizeBike3dTransform,
  normalizeBike3dTransforms,
  normalizePackingViewMode,
  renderBike3dPackingView
} from "./src/ui/packing-bike3d.js";
import {
  PACKING_VISUAL_STYLE_OPTIONS,
  PACKING_VISUAL_STYLE_PRIMARY,
  PACKING_VISUAL_STYLE_SETTINGS_VERSION,
  applyPackingVisualStyleClass,
  normalizePackingVisualStyle,
  packingVisualStyleButtonLabel
} from "./src/ui/packing-visual-style.js";
import {
  blurActiveEditableBeforeButtonAction,
  isEditableElement,
  preventDoubleTapZoom,
  setupTouchActionButtonFeedback
} from "./src/ui/touch-actions.js";

const sharedLayoutsByLanguage = createSharedLayoutsByLanguage([], { languages: SUPPORTED_LANGUAGES });
let serverConfirmedSharedLayouts = [];
const REQUIRED_ADMIN_API_CAPABILITIES = [
  "sharedTemplatePhotoReferenceCopy",
  "sharedTemplateDeleteLegacyCleanup",
  "sharedTemplatePhotoFileValidation",
  "sharedTemplateMetadataPatch",
  "sharedTemplateMetadataPost",
  "sharedTemplateEntityTreeFilter",
  "sharedTemplateEntityRowsPublicScope",
  "sharedTemplateCanonicalCatalog",
  "sharedTemplateCatalogMetadataLanguage",
  "sharedTemplateIndexCatalog",
  "publicTemplateCatalogResilientSelect",
  "templateCopyRequiresPublicSharedRow",
  "publicListLightweightCatalog",
  "templateCopyMetadataSidecar",
  "adminUsageReports",
  "collectionModeStateSync"
];
const REQUIRED_ADMIN_API_VERSION = "2026-05-24.github-pages-cors-origin-v1";
const {
  forget: forgetDeletedSharedLayoutId,
  has: isDeletedSharedLayoutId,
  remember: rememberDeletedSharedLayoutId
} = createDeletedSharedLayoutStore({ demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID });
let uiLanguage = loadUiLanguage();
const missingDemoPublicTemplates = {};
applyPublicTemplateLanguage();

let localStorageScopeKey = GUEST_STORAGE_SCOPE;
let applyingLayoutArrangement = false;
let hadLocalStateAtStartup = hasLocalSavedState();
const startupSyncMeta = loadSyncMeta();
let hadRemoteBaselineAtStartup = hasStoredLocalValue(BASE_STATE_KEY) ||
  Boolean(startupSyncMeta.serverUpdatedAt || startupSyncMeta.stateRevision || startupSyncMeta.payloadHash);
const state = loadState();
let startupLocalStateWasFallback = hadLocalStateAtStartup && !hadRemoteBaselineAtStartup && isGeneratedStartupFallbackState(state);
let hadAuthoritativeLocalStateAtStartup = hadLocalStateAtStartup && !startupLocalStateWasFallback;
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
let packingVisualStyle = normalizePackingVisualStyle(uiSettings.packingVisualStyle);
let packingVisualStylePanelVisible = false;
let packingViewMode = normalizePackingViewMode(uiSettings.packingViewMode);
let selectedBike3dContainerId = "";
let adjustingBike3dContainerId = "";
let bike3dTransforms = normalizeBike3dTransforms(uiSettings.bike3dTransforms);
let bike3dViewState = normalizeBike3dViewState(uiSettings.bike3dViewState);
let selectedCategoryFilters = [];
let addToContainerTargetId = null;
let addToContainerTargetLayoutId = "";
let recentlyAddedItemId = null;
let recentlyAddedContainerId = "";
let recentlyAddedLayoutId = "";
let pendingPackingScroll = null;
let lastPackingScrollSnapshot = null;
let lastItemTitleTap = { id: "", time: 0 };
let lastRootContainerTitleTap = { id: "", time: 0 };
let lastPackingTabTapTime = 0;
let lastPackingTouchToggleAt = 0;
let syncMeta = startupSyncMeta;
let syncDevice = loadSyncDevice();
let currentUser = null;
let offlineRememberedUser = null;
let syncTimer = null;
let syncInFlight = false;
let syncQueued = false;
let syncQueuedForce = false;
let publishedLayoutSaveTimer = null;
let publishedLayoutSaveLayoutId = "";
let applyingRemoteState = false;
let appUnlocked = true;
let initialRemoteLoadPending = false;
let syncVisualState = "local";
let sharedLayoutCatalogDiagnostics = null;
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
let adminReportsDialogController = null;
let filterViewCollapseSignature = "";
let filterViewCollapsedContainers = {};
let filterMatchIndex = 0;
let filterMatchSignature = "";
let pendingFilterJump = false;
let searchContextCommitTimer = null;
let filterNavRefreshFrame = null;
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
let containerPickerSourceLayoutId = "";
let itemDialogTargetLayoutId = "";
let layoutEditTargetId = "";
let layoutCopyTargetId = "";
let editingDictionaryEntry = null;
let fixedScrollbarRefreshFrame = null;
let searchRenderTimer = null;
let suppressNextFilterJump = false;
let itemDialogPhotoDraft = null;
let itemDialogPhotoObjectUrls = [];
let itemDialogPhotoActiveIndex = 0;
let rootContainerDialogPhotoDraft = null;
let rootContainerDialogPhotoObjectUrls = [];
let rootContainerDialogPhotoActiveIndex = 0;
let lightboxObjectUrl = "";
let sharedDialogCopyItemId = "";
let backupImportState = null;
let pendingGuestLocalLayoutCandidate = null;
let sharedPickerSourceItemId = "";
let sharedPickerSourceContainerId = "";
const photoObjectUrls = new Map();
let photoUploadInFlight = false;
let adminApiCompatibility = {
  checkedAt: 0,
  checking: false,
  ok: false,
  warning: "",
  version: "",
  capabilities: []
};
let currentPackingListId = loadActivePackingListId();
let currentPackingListMeta = null;
let explicitLayoutChoice = { id: "", at: 0 };

const refs = createRefs();
const layoutLoadStatus = createLayoutLoadStatusController({
  getElement: () => refs.layoutLoadStatus
});
const {
  openModalDialog,
  setupModalScrollLock
} = createModalScrollLockController();
const {
  askConfirmDialog,
  askUnsavedChangesDialog,
  openConfirmDialog
} = createConfirmDialogController({ refs, openModalDialog });
adminReportsDialogController = createAdminReportsDialogController({
  refs,
  fetchReports: () => fetchAdminReports(apiFetch, { timeoutMs: LIST_API_TIMEOUT_MS }),
  canOpenAdmin: canOpenAdminPublishedEdit,
  isForcedOffline,
  openModalDialog,
  showToast,
  apiErrorMessage
});
const remoteListRecords = createRemoteListRecordSelector({
  normalizeRemoteListRecord,
  normalizeRemoteState,
  countPrivateLayouts: statePrivateLayoutCount,
  isMeaningfulPackingState,
  remoteUpdatedAt,
  timeValue,
  isReadOnlyRecord: isReadOnlyBikePackingRecord
});

init();

function scopedLocalStorageKey(key, scope = localStorageScopeKey) {
  return scopedStorageKey(key, scope);
}

function applyLoadedStateToCurrentScope(nextState) {
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
  applyDefaultCollapsedContainers(state);
}

function activateLocalStorageScope(scopeKey) {
  const nextScope = scopeKey || GUEST_STORAGE_SCOPE;
  if (nextScope === localStorageScopeKey) return false;
  const previousScope = localStorageScopeKey;
  if (shouldCaptureGuestLocalLayoutCandidate(previousScope, nextScope) && !pendingGuestLocalLayoutCandidate) {
    pendingGuestLocalLayoutCandidate = guestLocalLayoutCandidate(state);
  }
  localStorageScopeKey = nextScope;
  const scopedSyncMeta = loadSyncMeta();
  const scopedHadLocalState = hasLocalSavedState();
  const scopedHadRemoteBaseline = hasStoredLocalValue(BASE_STATE_KEY) ||
    Boolean(scopedSyncMeta.serverUpdatedAt || scopedSyncMeta.stateRevision || scopedSyncMeta.payloadHash);
  const nextState = loadState();
  hadLocalStateAtStartup = scopedHadLocalState;
  hadRemoteBaselineAtStartup = scopedHadRemoteBaseline;
  startupLocalStateWasFallback = scopedHadLocalState && !scopedHadRemoteBaseline && isGeneratedStartupFallbackState(nextState);
  hadAuthoritativeLocalStateAtStartup = scopedHadLocalState && !startupLocalStateWasFallback;
  syncMeta = scopedSyncMeta;
  currentPackingListId = loadActivePackingListId();
  currentPackingListMeta = null;
  applyLoadedStateToCurrentScope(nextState);
  explicitLayoutChoice = { id: "", at: 0 };
  return true;
}

function activateLocalStorageScopeForCurrentUser() {
  return activateLocalStorageScope(currentUser ? userStorageScopeKey(currentUser) : GUEST_STORAGE_SCOPE);
}

function clearLocalStorageScope(scopeKey, keys = []) {
  keys.forEach((key) => {
    try {
      localStorage.removeItem(scopedLocalStorageKey(key, scopeKey));
    } catch {
      // Scoped storage cleanup is best-effort.
    }
  });
}

function resetGuestDemoScopeToCanonical() {
  clearLocalStorageScope(GUEST_STORAGE_SCOPE, [
    STORAGE_KEY,
    BASE_STATE_KEY,
    SYNC_META_KEY,
    RECOVERY_STATE_KEY,
    ACTIVE_LIST_ID_KEY,
    ACTIVE_LAYOUT_CHOICE_KEY,
    ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
    ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY
  ]);
  localStorageScopeKey = GUEST_STORAGE_SCOPE;
  hadLocalStateAtStartup = false;
  hadRemoteBaselineAtStartup = false;
  startupLocalStateWasFallback = false;
  hadAuthoritativeLocalStateAtStartup = false;
  syncMeta = loadSyncMeta();
  currentPackingListId = "";
  currentPackingListMeta = null;
  pendingGuestLocalLayoutCandidate = null;
  explicitLayoutChoice = { id: "", at: 0 };
  applyLoadedStateToCurrentScope(createEmptyUserState());
  setActivePrivateScope();
}

function removeScopedLocalValue(key) {
  try {
    localStorage.removeItem(scopedLocalStorageKey(key));
  } catch {
    // Local cleanup is best-effort.
  }
}

function writeLargeScopedLocalValue(key, value, { clearBase = false, clearRecovery = true } = {}) {
  const scopedKey = scopedLocalStorageKey(key);
  if (safeSetLocalStorage(scopedKey, value, { silent: true })) return true;
  if (clearRecovery && key !== RECOVERY_STATE_KEY) removeScopedLocalValue(RECOVERY_STATE_KEY);
  if (clearBase && key !== BASE_STATE_KEY) removeScopedLocalValue(BASE_STATE_KEY);
  return safeSetLocalStorage(scopedKey, value, { silent: true });
}

function persistStateSnapshot(snapshot = state) {
  return writeLargeScopedLocalValue(STORAGE_KEY, JSON.stringify(snapshot), { clearBase: true });
}

function t(key, values = {}) {
  const dictionary = I18N[uiLanguage] || I18N[DEFAULT_LANGUAGE] || {};
  const fallback = I18N[DEFAULT_LANGUAGE]?.[key] || key;
  return String(dictionary[key] || fallback).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function currentSharedLayouts(language = uiLanguage) {
  return visibleSharedLayoutsForLanguage(sharedLayoutsByLanguage, language, {
    defaultLanguage: DEFAULT_LANGUAGE,
    serverConfirmedSharedLayouts
  });
}

function demoLayoutChoiceForLanguage(language = uiLanguage) {
  return demoLayoutChoiceForLanguageValue(language, {
    currentLanguage: uiLanguage,
    defaultLanguage: DEFAULT_LANGUAGE,
    demoSelectValue: DEMO_LAYOUT_SELECT_VALUE,
    normalizeLanguage: normalizeUiLanguage
  });
}

function isDemoLayoutChoice(choice) {
  return isDemoLayoutChoiceValue(choice, {
    demoSelectValue: DEMO_LAYOUT_SELECT_VALUE,
    supportedLanguages: SUPPORTED_LANGUAGES,
    normalizeLanguage: normalizeUiLanguage
  });
}

function demoLanguageFromLayoutChoice(choice) {
  return demoLanguageFromLayoutChoiceValue(choice, {
    defaultLanguage: DEFAULT_LANGUAGE,
    normalizeLanguage: normalizeUiLanguage
  });
}

function languageOptionLabel(language) {
  return languageOptionLabelValue(language, {
    normalizeLanguage: normalizeUiLanguage
  });
}

function demoTemplateNameCandidates() {
  return SUPPORTED_LANGUAGES
    .map((language) => I18N[normalizeUiLanguage(language)]?.["demo.layoutName"])
    .filter(Boolean);
}

function normalizeDemoLayoutName(name = "", language = uiLanguage) {
  const normalizedLanguage = normalizeUiLanguage(language);
  return normalizeDemoTemplateName(name, {
    fallbackName: I18N[normalizedLanguage]?.["demo.layoutName"] || t("demo.layoutName"),
    demoNames: demoTemplateNameCandidates()
  });
}

function normalizeDemoPayloadForLanguage(payload, language = uiLanguage) {
  const normalizedLanguage = normalizeUiLanguage(language);
  return normalizePublishedDemoTemplatePayload(payload, {
    fallbackName: I18N[normalizedLanguage]?.["demo.layoutName"] || t("demo.layoutName"),
    demoNames: demoTemplateNameCandidates()
  });
}

function allSharedLayoutsByAdminOrder() {
  const result = [];
  const seen = new Set();
  const languageOrder = [
    normalizeUiLanguage(uiLanguage),
    ...SUPPORTED_LANGUAGES.map(normalizeUiLanguage).filter((language) => language !== normalizeUiLanguage(uiLanguage))
  ];
  languageOrder.forEach((language) => {
    currentSharedLayouts(language).forEach((layout) => {
      if (!layout?.id || seen.has(layout.id)) return;
      if (isDeletedSharedLayoutId(layout.id)) return;
      seen.add(layout.id);
      if (!layout.language) layout.language = language;
      result.push(layout);
    });
  });
  return result;
}

function currentPublishedTemplateBlockReason() {
  return publishedTemplateBlockReason({
    forcedOffline: isForcedOffline(),
    hasNavigatorOnline: typeof navigator !== "undefined" && "onLine" in navigator,
    navigatorOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    language: uiLanguage
  });
}

function arePublishedTemplatesBlocked() {
  return Boolean(currentPublishedTemplateBlockReason());
}

function requirePublishedTemplatesAvailable() {
  const reason = currentPublishedTemplateBlockReason();
  if (!reason) return true;
  updateSyncUi(reason);
  showToast(reason, "error");
  return false;
}

function markLayoutOptionsDisabled(options, disabled) {
  if (!disabled) return options;
  return options.map(([value, label, kind = ""]) => [value, label, kind, true]);
}

function serverConfirmedSharedLayoutsByAdminOrder() {
  return [...serverConfirmedSharedLayouts]
    .filter((layout) => layout?.id && !isDeletedSharedLayoutId(layout.id))
    .sort(compareSharedLayoutAdminOrder);
}

function nextServerConfirmedSharedLayoutAfter(sharedId) {
  const id = String(sharedId || "").trim();
  const layouts = serverConfirmedSharedLayoutsByAdminOrder();
  if (!layouts.length) return null;
  const index = layouts.findIndex((layout) => layout.id === id);
  if (index < 0) return layouts[0] || null;
  return layouts[index + 1] || layouts[index - 1] || null;
}

function adminPublicLayoutOptions({ disabled = false } = {}) {
  return [
    ...SUPPORTED_LANGUAGES.map((language) => [
      demoLayoutChoiceForLanguage(language),
      `${t("template.prefix")}: ${t("demo.layoutName")} (${languageOptionLabel(language)})`,
      "demo",
      disabled
    ]),
    ...markLayoutOptionsDisabled(adminSharedTemplateOptions(), disabled)
  ];
}

function adminSharedTemplateOptions() {
  const options = buildAdminSharedTemplateOptions({
    canOpen: canOpenAdminPublishedEdit(),
    localLayouts: localAdminTemplateCopyLayouts(),
    linkedSharedListLayout,
    sharedLayouts: serverConfirmedSharedLayoutsByAdminOrder(),
    serverConfirmedSharedLayouts: serverConfirmedSharedLayoutsByAdminOrder(),
    requireServerConfirmationForSharedTemplates: true,
    isDeletedSharedLayoutId,
    fallbackLanguage: uiLanguage,
    isLayoutMeaningful,
    templateCopySourceScore: (layout, sourceState = state) => templateCopySourceScore(layout, sourceState),
    sharedLayoutStatePayload,
    sharedPayloadActiveLayout,
    compareLayouts: compareSharedLayoutAdminOrder,
    labels: {
      templatePrefix: t("template.prefix"),
      sharedPrefix: t("shared.prefix"),
      defaultName: "Шаблон",
      languageOptionLabel,
      publicTemplateOptionLabel
    }
  });
  if (sharedLayoutCatalogDiagnostics) {
    sharedLayoutCatalogDiagnostics.visibleSharedOptionCount = options
      .filter((option) => String(option?.[0] || "").startsWith("shared:") || Boolean(templateDraftLayoutId(option?.[0])))
      .length;
    sharedLayoutCatalogDiagnostics.sampleVisibleOptions = options
      .map((option) => String(option?.[0] || ""))
      .filter((value) => value.startsWith("shared:") || value.startsWith("template:"))
      .slice(0, 8);
    if (shouldWarnAboutSharedLayoutCatalog(sharedLayoutCatalogDiagnostics) && typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] Shared template catalog was confirmed by API but produced no admin options.", sharedLayoutCatalogDiagnostics);
    }
  }
  return options;
}

function compareSharedLayoutAdminOrder(a, b) {
  return compareSharedTemplateAdminOrder(a, b, {
    supportedLanguages: SUPPORTED_LANGUAGES,
    normalizeLanguage: normalizeUiLanguage,
    fallbackLanguage: uiLanguage,
    locale: "ru"
  });
}

function localAdminTemplateCopyLayouts() {
  return selectLocalAdminTemplateCopyLayouts({
    layouts: state.layouts,
    canOpen: canOpenAdminPublishedEdit(),
    isDeletedSharedLayoutId,
    fallbackLanguage: uiLanguage,
    isLayoutMeaningful,
    templateCopySourceScore: (layout) => templateCopySourceScore(layout, state),
    compareEntries: compareSharedLayoutIndexEntries
  });
}
function activeAdminDraftOptionLabel(layout) {
  if (!canOpenAdminPublishedEdit() || !isPublishedLayoutEditable(layout)) return "";
  const sharedSource = layout?.adminSharedSourceId ? findSharedLayout(layout.adminSharedSourceId) : null;
  return publicTemplateOptionLabel({
    prefix: t("template.prefix"),
    sharedPrefix: t("shared.prefix"),
    name: layout.adminDemo
      ? normalizeDemoLayoutName(layout.name || t("demo.layoutName"), layout.adminDemoLanguage || uiLanguage)
      : layout.name || t("shared.prefix"),
    languageLabel: languageOptionLabel(layout.adminDemo
      ? layout.adminDemoLanguage || uiLanguage
      : managedSharedDraftLanguage(layout, sharedSource, uiLanguage)),
    demo: Boolean(layout.adminDemo)
  });
}

function publicLayoutChoiceForLayout(layout) {
  return publicLayoutChoiceValue(layout, {
    demoChoiceForLanguage: demoLayoutChoiceForLanguage,
    fallbackLanguage: uiLanguage
  });
}

function copyPickerLayoutLabel(layout) {
  if (!layout) return "Укладка";
  if (layout.adminDemo) {
    return `${normalizeDemoLayoutName(layout.name || t("demo.layoutName"), layout.adminDemoLanguage || uiLanguage)} (${languageOptionLabel(layout.adminDemoLanguage || uiLanguage)})`;
  }
  if (layout.adminSharedSourceId) {
    const sharedLayout = findSharedLayout(layout.adminSharedSourceId);
    const language = layout.adminTemplateCopy ? layout.language || uiLanguage : sharedLayout?.language || layout.language || uiLanguage;
    return `${layout.name || sharedLayout?.name || t("shared.prefix")} (${languageOptionLabel(language)})`;
  }
  return layout.name || "Укладка";
}

function orderAdminPublicDraftsLikeMainSelect(layouts) {
  const optionOrder = new Map();
  adminPublicLayoutOptions().forEach(([value], index) => optionOrder.set(value, index));
  return [...layouts].sort((a, b) => {
    const aOrder = optionOrder.get(publicLayoutChoiceForLayout(a)) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = optionOrder.get(publicLayoutChoiceForLayout(b)) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
}

function ensurePrivateDictionaries(sourceState = state) {
  return ensurePrivateDictionariesForState(sourceState, {
    locations,
    categories,
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState
  });
}

function ensureLayoutDictionaries(layout, sourceState = null) {
  if (!layout) return null;
  const source = sourceState || state;
  return ensureLayoutDictionariesForState(layout, {
    sourceState: source,
    defaults: { locations, categories },
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState
  });
}

function activeReadOnlyDictionaryOwner() {
  const virtualState = createSharedVirtualState();
  const layout = virtualState.layouts?.[virtualState.activeLayoutId];
  return layout ? readOnlyLayoutDictionariesForState(layout, {
    sourceState: virtualState,
    defaults: { locations, categories },
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState
  }) : null;
}

function activeDictionaryOwner() {
  if (isSharedLayoutView()) return activeReadOnlyDictionaryOwner() || ensurePrivateDictionaries(state);
  const layout = state.layouts?.[getPublishedEditLayoutId()] || state.layouts?.[state.activeLayoutId];
  if (layout && (isPublishedLayoutEditable(layout) || isGuestDemoCopyLayoutRecord(layout))) {
    return ensureLayoutDictionaries(layout);
  }
  return ensurePrivateDictionaries(state);
}

function dictionaryListForOwner(owner, type) {
  const fallbackValues = type === "location" ? locations : categories;
  const ownerValues = normalizeDictionaryValues(owner?.[type === "location" ? "locations" : "categories"]);
  return ownerValues.length ? ownerValues : normalizeDictionaryValues(fallbackValues);
}

function activeLocations() {
  return dictionaryListForOwner(activeDictionaryOwner(), "location");
}

function activeCategories() {
  return dictionaryListForOwner(activeDictionaryOwner(), "category");
}

function activeDictionaryList(type) {
  return type === "location" ? activeLocations() : activeCategories();
}

function dictionaryOptionsForOwner(type, owner, { selected = [] } = {}) {
  return dictionaryOptionsForUiValues(type, dictionaryListForOwner(owner, type), { selected });
}

function dictionaryOptionsForUi(type, { selected = [] } = {}) {
  return dictionaryOptionsForUiValues(type, activeDictionaryList(type), { selected });
}

function dictionaryEditScope(owner = activeDictionaryOwner()) {
  const layout = owner !== state ? owner : null;
  if (!layout) {
    const publicRecordIds = getPublicLayoutRecordIdsForState(state);
    return {
      owner: state,
      items: Object.entries(state.items || {})
        .filter(([itemId, item]) => !publicRecordIds.itemIds.has(itemId) && !isPublicSyncItem(itemId, item))
        .map(([, item]) => item),
      containers: Object.entries(state.containers || {})
        .filter(([containerId, container]) => !publicRecordIds.containerIds.has(containerId) && !isPublicSyncContainer(containerId, container))
        .map(([, container]) => container)
    };
  }
  const itemIds = getLayoutItemIdSetForState(state, layout);
  const containerIds = getLayoutContainerIdSetForState(state, layout);
  return {
    owner,
    layout,
    items: [...itemIds].map((id) => state.items?.[id]).filter(Boolean),
    containers: [...containerIds].map((id) => state.containers?.[id]).filter(Boolean)
  };
}

function saveDictionaryOwner(owner = activeDictionaryOwner()) {
  editingDictionaryEntry = null;
  if (owner !== state && isPublishedLayoutEditable(owner)) touchLayout(owner.id);
  if (owner !== state && isPublishedLayoutEditable(owner)) saveLayoutMutation(owner.id, { publishDelay: 0 });
  else saveState();
  render();
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
  const nextPayload = payload ? normalizeDemoPayloadForLanguage(payload, normalized) : null;
  demoSharedLayout.statePayloadByLanguage = demoSharedLayout.statePayloadByLanguage || {};
  demoSharedLayout.statePayloadByLanguage[normalized] = nextPayload;
  if (normalized === normalizeUiLanguage(uiLanguage)) demoSharedLayout.statePayload = nextPayload;
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
  const previousReadOnlyLayoutId = activeReadOnlyLayoutId();
  const wasDemoView = previousReadOnlyLayoutId === DEMO_SHARED_LAYOUT_ID;
  const sharedLanguagePair = !canOpenAdminPublishedEdit() &&
    isReadOnlyStateScope() &&
    previousReadOnlyLayoutId &&
    previousReadOnlyLayoutId !== DEMO_SHARED_LAYOUT_ID
    ? findSharedLayoutForLanguage(sharedLayoutsByLanguage, previousReadOnlyLayoutId, nextLanguage)
    : null;
  const wasAdminDemoEdit = Boolean(state.layouts?.[state.activeLayoutId]?.adminDemo);
  uiLanguage = nextLanguage;
  saveUiLanguage(uiLanguage);
  applyPublicTemplateLanguage();
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  if (sharedLanguagePair && sharedLanguagePair.id !== previousReadOnlyLayoutId) {
    applyStaticTranslations();
    await openSharedLayoutViewer(sharedLanguagePair.id, { remember: true });
    updateSyncUi();
    return;
  }
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
  const layoutLabel = document.querySelector(".layout-select-control");
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
  if (refs.adminReportsBtn) refs.adminReportsBtn.textContent = t("menu.adminReports");
  if (refs.helpLimitsBtn) refs.helpLimitsBtn.textContent = t("menu.help");
  document.querySelector("#exportBtn")?.replaceChildren(document.createTextNode(t("menu.print")));
  if (languageLabel) languageLabel.textContent = t("menu.language");
  if (layoutLabel?.firstChild) layoutLabel.firstChild.textContent = `${t("labels.layout")}\n          `;
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  if (refs.editLayoutBtn) refs.editLayoutBtn.textContent = uiLanguage === "en" ? "Edit" : "Редактировать";
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

async function init() {
  registerAppServiceWorker({ isLocalDevOrigin });
  if (refs.appVersion) refs.appVersion.textContent = APP_VERSION;
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  setupPackingVisualStyleQuickControl();
  applyPackingVisualStyle();
  applyStaticTranslations();
  preventDoubleTapZoom();
  setupModalScrollLock();
  setupDialogKeyboardScrollGuard([refs.dialog, refs.rootContainerDialog]);
  setupTouchActionButtonFeedback();
  document.addEventListener("pointerdown", (event) => {
    blurActiveEditableBeforeButtonAction(event, { ignoredButton: refs.saveRootContainerBtn });
  }, true);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
    if (tab.dataset.view === "packing") {
      tab.addEventListener("dblclick", (event) => {
        if (Date.now() - lastPackingTouchToggleAt < 900) return;
        event.preventDefault();
        switchView("packing");
        togglePackingViewMode();
      });
      tab.addEventListener("touchend", handlePackingTabTouchEnd, { passive: false });
    }
  });

  refs.layoutSelect.addEventListener("change", async (event) => {
    event.currentTarget?.blur?.();
    await flushActivePublishedEditSave();
    const value = event.target.value;
    if (isDemoLayoutChoice(value)) {
      if (!requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      const language = demoLanguageFromLayoutChoice(value);
      if (await confirmPublicLayoutTransition("demo")) {
        if (canOpenAdminPublishedEdit()) await openAdminDemoLayout({ language });
        else await openDemoLayoutFromSelect({ language });
      } else {
        renderFilters();
      }
      return;
    }
    if (value.startsWith("shared:")) {
      if (!requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      const layoutId = value.slice("shared:".length);
      if (await confirmPublicLayoutTransition("shared", findSharedLayout(layoutId))) {
        if (canOpenAdminPublishedEdit()) await openSharedLayoutForAdmin(layoutId);
        else await openSharedLayoutViewer(layoutId);
      } else {
        renderFilters();
      }
      return;
    }
    const templateDraftId = templateDraftLayoutId(value);
    if (templateDraftId) {
      if (!requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      const layoutId = templateDraftId;
      const layout = state.layouts?.[layoutId];
      if (canOpenAdminPublishedEdit() && layout?.adminTemplateCopy) {
        if (!(await confirmPublicLayoutTransition("shared", findSharedLayout(layout.adminSharedSourceId) || layout))) {
          renderFilters();
          return;
        }
        activateAdminPublishedLayout(layoutId);
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
    addToContainerTargetLayoutId = "";
    refs.addToContainerSearch.value = "";
    refs.newSubcontainerName.value = "";
  });
  refs.containerPickerDialog?.addEventListener("close", () => {
    containerPickerSourceLayoutId = "";
  });
  refs.layoutRootSearch.addEventListener("input", renderLayoutRootResults);
  refs.clearLayoutRootSearchBtn.addEventListener("pointerdown", (event) => event.preventDefault());
  refs.clearLayoutRootSearchBtn.addEventListener("click", clearLayoutRootSearch);
  refs.layoutRootDialog.addEventListener("close", () => {
    refs.layoutRootSearch.value = "";
  });
  refs.rootContainerPlacementBtn.addEventListener("click", openRootContainerPlacementAction);
  refs.rootContainerCopyToContainerBtn?.addEventListener("click", openRootContainerCopyPickerDialog);
  refs.rootContainerRemoveFromLayoutBtn?.addEventListener("click", confirmRemoveEditingContainerFromActiveLayout);
  refs.itemContainerPickerBtn.addEventListener("click", openItemContainerPickerDialog);
  refs.itemCopyToContainerBtn?.addEventListener("click", openItemCopyContainerPickerDialog);
  refs.containerPickerLayoutSelect?.addEventListener("change", () => {
    containerPickerLayoutId = refs.containerPickerLayoutSelect.value || getPublishedEditLayoutId();
    renderContainerPicker();
  });
  refs.containerPickerNoneBtn.addEventListener("click", () => {
    if (isContainerPickerContainerCopyMode()) {
      selectContainerPickerTarget("");
      return;
    }
    selectItemContainer("");
  });
  refs.metaToggleBtn.addEventListener("click", toggleItemDisplayMode);
  refs.layoutCollapseAllBtn?.addEventListener("click", toggleActiveLayoutNestedContainers);
  refs.filterPrevBtn.addEventListener("pointerdown", commitSearchInputForNavigation);
  refs.filterNextBtn.addEventListener("pointerdown", commitSearchInputForNavigation);
  refs.filterPrevBtn.addEventListener("click", () => moveFilterMatch(-1));
  refs.filterNextBtn.addEventListener("click", () => moveFilterMatch(1));
  refs.collectionModeBtn.addEventListener("click", toggleCollectionMode);
  refs.collectionMenuBtn.addEventListener("click", toggleCollectionMode);
  refs.unpackedOnlyBtn.addEventListener("click", () => {
    toggleShowOnlyUnpacked(state);
    saveState();
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
  refs.editLayoutBtn?.addEventListener("click", openLayoutEditDialog);
  refs.saveEditedLayoutBtn?.addEventListener("click", saveEditedLayout);
  refs.copyEditedLayoutBtn?.addEventListener("click", openLayoutCopyDialog);
  refs.deleteEditedLayoutBtn?.addEventListener("click", confirmDeleteEditedLayout);
  refs.saveLayoutCopyBtn?.addEventListener("click", saveLayoutCopy);
  refs.layoutCreateMode.addEventListener("change", updateLayoutCopyVisibility);
  refs.saveLayoutBtn.addEventListener("click", saveNewLayout);
  refs.authBtn.addEventListener("click", handleAuthButton);
  document.querySelector("#signOutBtn")?.addEventListener("click", handleAuthButton);
  refs.authGateBtn.addEventListener("click", handleAuthButton);
  refs.sharedLayoutsBtn?.addEventListener("click", openSharedLayoutsDialog);
  refs.shareListBtn?.addEventListener("click", shareCurrentPackingListByLink);
  refs.languageSelect?.addEventListener("change", (event) => {
    setUiLanguage(event.target.value).catch((error) => updateSyncUi(`Language switch failed: ${error.message}`));
  });
  refs.copySharedLayoutBtn.addEventListener("click", () => copySharedLayout(currentSharedLayouts()[0]?.id));
  refs.forceOfflineBtn.addEventListener("click", toggleForcedOfflineMode);
  refs.authForm.addEventListener("submit", submitAuthDialog);
  refs.syncBtn.addEventListener("click", () => syncNow({ force: true }));
  refs.menuBtn.addEventListener("click", toggleTopMenu);
  refs.visualStyleMenuBtn?.addEventListener("click", togglePackingVisualStylePanel);
  refs.topMenu.addEventListener("click", (event) => {
    if (event.target.closest("button")) closeTopMenu();
  });
  refs.historyBtn.addEventListener("click", openHistoryDialog);
  refs.adminReportsBtn?.addEventListener("click", () => adminReportsDialogController?.open());
  refs.backupBtn?.addEventListener("click", openBackupDialog);
  refs.helpLimitsBtn?.addEventListener("click", openHelpLimitsDialog);
  refs.backupCreateBtn?.addEventListener("click", createBackupArchive);
  refs.backupFileInput?.addEventListener("change", handleBackupFileSelected);
  refs.backupAnalysis?.addEventListener("change", handleBackupSelectionChange);
  refs.backupRestoreSelectedBtn?.addEventListener("click", restoreSelectedBackupLayouts);
  refs.backupRestoreFullBtn?.addEventListener("click", restoreFullBackup);
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
    } else if (isOfflineRememberedSession()) {
      checkAuthAndLoad({
        restoreLayoutChoice: false,
        preferredLayout: preferredCurrentLayoutRef()
      });
    } else if (appUnlocked) {
      updateSyncUi("Интернет появился · нажмите «Синхр.» для проверки входа");
    }
  });
  window.addEventListener("offline", () => {
    const rememberedUser = rememberedOfflineUser(currentUser);
    currentUser = null;
    offlineRememberedUser = rememberedUser;
    appUnlocked = true;
    if (isExplicitlySignedOut() || !rememberedUser) {
      enterSignedOutPublicMode("Офлайн · личные списки скрыты, открыта локальная копия демо").catch(() => {
        setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
        render();
        updateSyncUi("Офлайн · личные списки скрыты, открыт demo/public шаблон");
      });
      return;
    }
    activateLocalStorageScope(userStorageScopeKey(rememberedUser));
    setActivePrivateScope();
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
  document.querySelector("#exportBtn")?.addEventListener("click", exportData);
  document.querySelector("#resetBtn")?.addEventListener("click", resetData);

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
    setLayoutLoadStatus("loading", "Проверяю вход и личные укладки...");
    renderGuestPublicDemoPreviewDuringAuthCheck();
    updateSyncUi("Проверяю вход...");
  }
  startRemoteStateWatcher();
  const publicIndexRefresh = refreshPublicSharedTemplates({ renderAfter: true }).catch(() => null);
  if (sharedListId) {
    await publicIndexRefresh;
    openSharedListFromLink(sharedListId, sharedLayoutIdFromLocation());
  } else if (isForcedOffline()) {
    publicIndexRefresh.catch(() => null);
    if (signedOut) enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыта локальная копия демо");
    else unlockOfflineState("Принудительно офлайн · локальная укладка доступна");
  } else if (offlineNow) {
    publicIndexRefresh.catch(() => null);
    if (!activateOfflineRememberedSession("Офлайн · открыта локальная копия личных укладок")) {
      enterSignedOutPublicMode("Офлайн · вход не подтверждён, открыта локальная копия демо");
    }
  } else {
    publicIndexRefresh.catch(() => null);
    checkAuthAndLoad();
  }
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
    itemDisplayMode: ITEM_DISPLAY_MODE_DEFAULT,
    showItemMeta: false,
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
  template.itemDisplayMode = ITEM_DISPLAY_MODE_PUBLIC_DEFAULT;
  template.showItemMeta = true;
  return template;
}

function createDemoSeedState() {
  return createEmptyUserState();
}

function loadState() {
  const saved = localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY));
  if (!saved) {
    const initial = createEmptyUserState();
    ensureItemDisplayModeState(initial);
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
    ensureItemDisplayModeState(parsed);
    if (typeof parsed.showFilterContext !== "boolean") parsed.showFilterContext = false;
    normalizeCollectionModeState(parsed);
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
      ensureItemDisplayModeState(fallback);
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
  return Boolean(localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY)));
}

function hasStoredLocalValue(key) {
  try {
    return Boolean(localStorage.getItem(scopedLocalStorageKey(key)));
  } catch {
    return false;
  }
}

function loadBaseState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedLocalStorageKey(BASE_STATE_KEY)));
    return normalizeRemoteState(parsed);
  } catch {
    return null;
  }
}

function saveBaseState(nextState = state) {
  writeLargeScopedLocalValue(BASE_STATE_KEY, JSON.stringify(nextState), { clearRecovery: true });
}

function loadRecoverySnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedLocalStorageKey(RECOVERY_STATE_KEY)));
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
    if (writeLargeScopedLocalValue(RECOVERY_STATE_KEY, JSON.stringify(snapshots.slice(0, Math.min(RECOVERY_STATE_MAX, 3))), {
      clearRecovery: false
    })) return;
    removeScopedLocalValue(RECOVERY_STATE_KEY);
    writeLargeScopedLocalValue(RECOVERY_STATE_KEY, JSON.stringify([entry]), { clearRecovery: false });
  } catch {
    // Recovery snapshots are best-effort and must never interrupt the app.
  }
}

function restoreTemplateCopyDraftsFromRecovery() {
  if (!canOpenAdminPublishedEdit()) return false;
  const restored = { layouts: {}, containers: {}, items: {} };
  loadRecoverySnapshots().forEach((entry) => {
    const draftRecords = collectManagedPublicDraftRecords(entry?.payload);
    Object.entries(draftRecords?.layouts || {}).forEach(([layoutId, layout]) => {
      if (!layout?.adminTemplateCopy || state.layouts?.[layoutId] || restored.layouts[layoutId]) return;
      restored.layouts[layoutId] = layout;
      Object.entries(draftRecords.containers || {}).forEach(([containerId, container]) => {
        if (!restored.containers[containerId]) restored.containers[containerId] = container;
      });
      Object.entries(draftRecords.items || {}).forEach(([itemId, item]) => {
        if (!restored.items[itemId]) restored.items[itemId] = item;
      });
    });
  });
  if (!mergeManagedPublicDraftRecords(state, restored)) return false;
  persistStateSnapshot(state);
  return true;
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

function loadSyncMeta() {
  return loadStoredSyncMeta(scopedLocalStorageKey(SYNC_META_KEY), {
    normalizeStateRevision,
    normalizeIntegrityCount
  });
}

function saveSyncMeta() {
  saveStoredSyncMeta(scopedLocalStorageKey(SYNC_META_KEY), syncMeta);
}

function loadUiSettings() {
  return loadStoredUiSettings({
    storageKey: UI_SETTINGS_KEY,
    normalizeSortMode,
    normalizePackingVisualStyle,
    normalizePackingViewMode,
    normalizeBike3dTransforms,
    normalizeBike3dViewState,
    packingVisualStyleVersion: PACKING_VISUAL_STYLE_SETTINGS_VERSION,
    defaultPackingVisualStyle: PACKING_VISUAL_STYLE_PRIMARY
  });
}

function saveUiSettings() {
  saveStoredUiSettings({
    itemSortMode,
    rootContainerSortMode,
    packingVisualStyle,
    packingViewMode,
    bike3dTransforms,
    bike3dViewState
  }, {
    storageKey: UI_SETTINGS_KEY,
    normalizeSortMode,
    normalizePackingVisualStyle,
    normalizePackingViewMode,
    normalizeBike3dTransforms,
    normalizeBike3dViewState,
    packingVisualStyleVersion: PACKING_VISUAL_STYLE_SETTINGS_VERSION
  });
}

function applyPackingVisualStyle() {
  packingVisualStyle = applyPackingVisualStyleClass(document.body, packingVisualStyle);
  syncPackingVisualStyleControls();
}

function setPackingVisualStyle(value) {
  packingVisualStyle = normalizePackingVisualStyle(value);
  applyPackingVisualStyle();
  saveUiSettings();
}

function setupPackingVisualStyleQuickControl() {
  const control = document.querySelector("#packingVisualStyleControl");
  if (!control) return;
  control.innerHTML = PACKING_VISUAL_STYLE_OPTIONS.map((option) => `
    <button
      type="button"
      class="admin-visual-option"
      data-packing-visual-style="${escapeHtml(option.value)}"
      title="${escapeHtml(option.label)}"
      aria-label="${escapeHtml(option.label)}"
      aria-pressed="${normalizePackingVisualStyle(packingVisualStyle) === option.value ? "true" : "false"}"
    >${escapeHtml(packingVisualStyleButtonLabel(option))}</button>
  `).join("");
  control.addEventListener("click", (event) => {
    const button = event.target.closest("[data-packing-visual-style]");
    if (!button) return;
    setPackingVisualStyle(button.dataset.packingVisualStyle);
  });
}

function syncPackingVisualStyleControls() {
  document.querySelectorAll("[data-packing-visual-style]").forEach((button) => {
    const active = button.dataset.packingVisualStyle === packingVisualStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const control = document.querySelector("#packingVisualStyleControl");
  control?.classList.toggle("is-visible", canOpenAdminPublishedEdit() && packingVisualStylePanelVisible);
  if (refs.visualStyleMenuBtn) {
    refs.visualStyleMenuBtn.hidden = !canOpenAdminPublishedEdit();
    refs.visualStyleMenuBtn.classList.toggle("active", packingVisualStylePanelVisible);
    refs.visualStyleMenuBtn.textContent = packingVisualStylePanelVisible ? "Скрыть варианты вида" : "Варианты вида";
  }
}

function togglePackingVisualStylePanel() {
  setPackingVisualStylePanelVisible(!packingVisualStylePanelVisible);
}

function setPackingVisualStylePanelVisible(visible) {
  packingVisualStylePanelVisible = Boolean(visible && canOpenAdminPublishedEdit());
  syncPackingVisualStyleControls();
}

function togglePackingViewMode() {
  packingViewMode = isBike3dPackingView(packingViewMode) ? "columns" : "bike3d";
  if (!isBike3dPackingView(packingViewMode)) {
    selectedBike3dContainerId = "";
    adjustingBike3dContainerId = "";
  }
  saveUiSettings();
  renderPacking();
  updatePackingViewModeControl();
  updateFilterNavigationUi();
  syncFixedScrollbarVisibility();
  showToast(isBike3dPackingView(packingViewMode) ? "3D-укладка включена." : "Обычная укладка включена.", "success");
}

function updatePackingViewModeControl(view = getCurrentView()) {
  document.body.classList.toggle("packing-bike3d-view", view === "packing" && isBike3dPackingView(packingViewMode));
}

function setLayoutLoadStatus(tone = "idle", text = "") {
  layoutLoadStatus.setStatus(tone, text);
}

function setLayoutLoadProgress({ loaded = 0, total = null, prefix = "Загружаю личные укладки" } = {}) {
  const knownTotal = Number.isFinite(total) && total >= 0;
  const safeLoaded = Math.max(0, Number(loaded) || 0);
  const safeTotal = knownTotal ? Math.max(safeLoaded, Number(total) || 0) : null;
  const countText = knownTotal
    ? `${safeLoaded} из ${safeTotal}`
    : `${safeLoaded} загружено · уточняю полный список`;
  setLayoutLoadStatus("loading", `${prefix}: ${countText}`);
}

function statePrivateLayoutCount(targetState) {
  return countPrivateLayouts(targetState, { guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG });
}

function remoteRecordStateInfo(record) {
  return remoteListRecords.remoteRecordStateInfo(record);
}

function remoteRecordPrivateLayoutCount(record) {
  return remoteListRecords.remoteRecordPrivateLayoutCount(record);
}

function pickRicherRemoteListRecord(currentRecord, nextRecord) {
  return remoteListRecords.pickRicherRemoteListRecord(currentRecord, nextRecord);
}

function bestCatalogListRecord(lists) {
  return remoteListRecords.bestCatalogListRecord(lists);
}

function setLoadedRemoteListProgress(record, prefix = "Личные укладки получены", { final = false } = {}) {
  const count = remoteRecordPrivateLayoutCount(record);
  setLayoutLoadProgress({ loaded: count, total: final || count > 1 ? count : null, prefix });
}

function itemDisplayMode() {
  return ensureItemDisplayModeState(state);
}

function shouldShowItemLabels() {
  return shouldShowItemLabelsForMode(itemDisplayMode());
}

function shouldShowItemPhotos() {
  return shouldShowItemPhotosForMode(itemDisplayMode());
}

function privateLayoutCount() {
  return statePrivateLayoutCount(state);
}

function setPersonalLayoutsLoadedStatus() {
  const count = privateLayoutCount();
  setLayoutLoadStatus("success", count ? `Личные укладки загружены: ${count} из ${count}` : "Личные укладки загружены: 0 из 0 · список пока пустой");
}

function updateLayoutLoadStatusUi() {
  layoutLoadStatus.render();
}

function loadActivePackingListId() {
  return loadStoredActivePackingListId({
    storageKey: ACTIVE_LIST_ID_KEY,
    scopedKey: scopedLocalStorageKey
  });
}

function saveActivePackingListId(listId) {
  currentPackingListId = saveStoredActivePackingListId(listId, {
    storageKey: ACTIVE_LIST_ID_KEY,
    scopedKey: scopedLocalStorageKey
  });
  if (!currentPackingListId) currentPackingListMeta = null;
}

function normalizeActiveLayoutChoice(choice) {
  return normalizeActiveLayoutChoiceValue(choice, {
    isDemoLayoutChoice,
    demoLayoutChoiceForLanguage,
    demoLanguageFromLayoutChoice,
    templateDraftLayoutId,
    isAdminTemplateCopyChoice: (layoutId) => Boolean(state.layouts?.[layoutId]?.adminTemplateCopy)
  });
}

function isPrivateLayoutChoice(choice) {
  return isPrivateLayoutChoiceValue(choice, {
    normalizeChoice: normalizeActiveLayoutChoice,
    isDemoLayoutChoice,
    templateDraftLayoutId
  });
}

function isPrivateUserLayoutId(layoutId) {
  const layout = state.layouts?.[layoutId];
  return Boolean(layout && !layout.adminDemo && !layout.adminSharedSourceId && !layout?.[GUEST_DEMO_COPY_FLAG]);
}

function loadActiveLayoutChoice() {
  return loadStoredActiveLayoutChoice({
    storageKey: ACTIVE_LAYOUT_CHOICE_KEY,
    scopedKey: scopedLocalStorageKey,
    normalizeChoice: normalizeActiveLayoutChoice
  });
}

function loadActivePrivateLayoutChoice() {
  return loadStoredActivePrivateLayoutChoice({
    storageKey: ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
    scopedKey: scopedLocalStorageKey,
    normalizeChoice: normalizeActiveLayoutChoice,
    isPrivateChoice: isPrivateLayoutChoice,
    isPrivateUserLayoutId
  });
}

function isActiveLayoutChoiceExplicit() {
  return isStoredActiveLayoutChoiceExplicit({
    storageKey: ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
    scopedKey: scopedLocalStorageKey
  });
}

function saveActiveLayoutChoice(choice) {
  saveStoredActiveLayoutChoice(choice, {
    choiceStorageKey: ACTIVE_LAYOUT_CHOICE_KEY,
    sourceStorageKey: ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
    privateChoiceStorageKey: ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
    scopedKey: scopedLocalStorageKey,
    normalizeChoice: normalizeActiveLayoutChoice,
    isPrivateChoice: isPrivateLayoutChoice,
    isPrivateUserLayoutId
  });
}

function currentLayoutChoice() {
  const readonlyId = activeReadOnlyLayoutId();
  if (isReadOnlyStateScope()) {
    return readonlyId === DEMO_SHARED_LAYOUT_ID ? DEMO_LAYOUT_SELECT_VALUE : `shared:${readonlyId}`;
  }
  const layout = state.layouts?.[state.activeLayoutId];
  if (layout?.adminDemo) return demoLayoutChoiceForLanguage(layout.adminDemoLanguage || uiLanguage);
  if (layout?.adminTemplateCopy) return adminTemplateDraftChoice(layout.id);
  if (layout?.adminSharedSourceId) return `shared:${layout.adminSharedSourceId}`;
  return state.activeLayoutId || "";
}

function rememberActiveLayoutChoice(choice = currentLayoutChoice()) {
  saveActiveLayoutChoice(choice);
  if (isPrivateLayoutChoice(choice)) {
    explicitLayoutChoice = { id: choice, at: Date.now() };
  }
}

function rememberPrivateServerLayoutChoice({ preferStored = true } = {}) {
  const storedLayoutId = preferStored ? loadActivePrivateLayoutChoice() : "";
  const layoutId = storedLayoutId ||
    (state.layouts?.[state.activeLayoutId] ? state.activeLayoutId : Object.values(state.layouts || {})[0]?.id || "");
  if (!layoutId || !isPrivateUserLayoutId(layoutId)) return;
  if (storedLayoutId && state.activeLayoutId !== storedLayoutId) {
    state.activeLayoutId = storedLayoutId;
    applyLayoutArrangement(storedLayoutId);
  }
  saveActiveLayoutChoice(layoutId);
}

function isRecentExplicitLayoutChoice(layoutId, maxAgeMs = 30000) {
  return Boolean(layoutId && explicitLayoutChoice.id === layoutId && Date.now() - explicitLayoutChoice.at <= maxAgeMs);
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
    isDemoLayoutChoice(choice) ||
    String(choice || "").startsWith("shared:") ||
    Boolean(templateDraftLayoutId(choice))
  );
  if (privateOnly && adminPublicChoice) choice = privateChoice;
  if (!privateOnly && !adminPublicChoice && !publicOnly && isDemoLayoutChoice(choice) && !explicitChoice && privateChoice) choice = privateChoice;
  if (!publicOnly && isPrivateLayoutChoice(choice) && !isPrivateUserLayoutId(choice) && privateChoice) choice = privateChoice;
  if (!choice) choice = privateChoice;
  if (!choice) return false;
  if (isDemoLayoutChoice(choice)) {
    const language = demoLanguageFromLayoutChoice(choice);
    if (privateOnly) return false;
    if (canOpenAdminPublishedEdit() && !publicOnly) await openAdminDemoLayout({ remember: false, language });
    else await openDemoLayoutFromSelect({ remember: false, language });
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
  const templateDraftId = templateDraftLayoutId(choice);
  if (templateDraftId) {
    if (privateOnly || publicOnly || !canOpenAdminPublishedEdit()) return false;
    const layoutId = templateDraftId;
    if (!state.layouts?.[layoutId]?.adminTemplateCopy) return false;
    activateAdminPublishedLayout(layoutId, { remember: false });
    return true;
  }
  const savedLayout = state.layouts?.[choice];
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminDemo) {
    await openAdminDemoLayout({ remember: false, language: savedLayout.adminDemoLanguage || uiLanguage });
    return true;
  }
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminSharedSourceId) {
    if (savedLayout.adminTemplateCopy) activateAdminPublishedLayout(savedLayout.id, { remember: false });
    else await openSharedLayoutForAdmin(savedLayout.adminSharedSourceId, { remember: false });
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

function persistActiveLayoutSelection({ sync = false } = {}) {
  if (!state.layouts?.[state.activeLayoutId]) return;
  if (isReadOnlyStateScope() || isAdminEditablePublishedLayout(state.activeLayoutId)) return;
  if (!canUseLocalEditableState(state.activeLayoutId)) return;
  saveState({ sync: false });
  if (sync && syncMeta.dirty) updateSyncUi();
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
    if (layoutId && state.layouts?.[layoutId]) {
      if (remember) rememberActiveLayoutChoice(layoutId);
      persistActiveLayoutSelection({ sync: remember });
    }
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
  persistActiveLayoutSelection({ sync: remember });
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
  if (state.activeLayoutId && state.activeLayoutId !== layoutId && state.layouts?.[state.activeLayoutId]) {
    captureActiveLayoutArrangement();
  }
  if (!setViewScope(VIEW_SCOPE_ADMIN_PUBLIC_EDIT, { adminLayoutId: layoutId })) return false;
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  if (remember) {
    const layout = state.layouts?.[layoutId];
    if (layout?.adminDemo) rememberActiveLayoutChoice(demoLayoutChoiceForLanguage(layout.adminDemoLanguage || uiLanguage));
    else if (layout?.adminTemplateCopy) rememberActiveLayoutChoice(adminTemplateDraftChoice(layout.id));
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

function solidifyTemplateDraftLayout(layoutId) {
  return solidifyTemplateDraftLayoutForState(state, layoutId, {
    liveSnapshotForRoot: (rootId) => snapshotContainerTreeFromLiveState(rootId, state)
  });
}

function solidifyManagedTemplateDrafts() {
  return solidifyManagedTemplateDraftsForState(state, {
    liveSnapshotForRoot: (rootId) => snapshotContainerTreeFromLiveState(rootId, state)
  });
}

function saveState({ sync = true } = {}) {
  captureActiveLayoutArrangement();
  solidifyManagedTemplateDrafts();
  sanitizePrivateCopiedPublicOrigins(state, { guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG });
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

function saveLayoutMutation(layoutId = state.activeLayoutId, { publishDelay = 900 } = {}) {
  solidifyTemplateDraftLayout(layoutId);
  const targetIsPublic = isAdminEditablePublishedLayout(layoutId);
  saveState({ sync: !targetIsPublic });
  if (targetIsPublic) schedulePublishedLayoutSave(layoutId, publishDelay);
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

function isDefaultDemoSeedLayoutRecord(layout) {
  if (!layout || layout.adminDemo || layout.adminSharedSourceId || layout?.[GUEST_DEMO_COPY_FLAG]) return false;
  const rootIds = layout.rootContainerIds || [];
  return layout.id === "layout-main" &&
    rootIds.length > 0 &&
    rootIds.every((id) => String(id || "").startsWith("demo-"));
}

function isGeneratedStartupFallbackState(targetState = state) {
  const personalLayouts = Object.values(targetState?.layouts || {}).filter((layout) =>
    layout && !layout.adminDemo && !layout.adminSharedSourceId
  );
  if (personalLayouts.length > 0 &&
    personalLayouts.every((layout) => isGuestDemoCopyLayoutRecord(layout) || isDefaultDemoSeedLayoutRecord(layout))) {
    return true;
  }
  const items = Object.entries(targetState?.items || {});
  const containers = Object.entries(targetState?.containers || {});
  if (!items.length && !containers.length) return false;
  const generatedItems = items.filter(([itemId, item]) => isGeneratedCatalogSyncArtifact(itemId, item)).length;
  const generatedContainers = containers.filter(([containerId, container]) => isGeneratedCatalogContainerSyncArtifact(containerId, container)).length;
  const generatedCount = generatedItems + generatedContainers;
  const totalCount = items.length + containers.length;
  return totalCount > 0 && generatedCount / totalCount >= 0.8;
}

function canLocalStateOverrideRemote() {
  return hasLocalSavedState() &&
    hadAuthoritativeLocalStateAtStartup &&
    !isForeignLocalSyncState() &&
    !isGeneratedStartupFallbackState(state);
}

function canSeedEmptyRemoteFromLocal() {
  return hasLocalSavedState() && !isForeignLocalSyncState() && isMeaningfulPackingState(state);
}

function recordWasEditedAfterCreate(record) {
  if (!record || typeof record !== "object") return false;
  const created = timeValue(record.createdAt);
  const updated = timeValue(record.updatedAt);
  return Boolean(created && updated && updated > created);
}

function guestLayoutHasUserContentEdits(sourceState, layout) {
  if (!layout) return false;
  if (!isGuestDemoCopyLayoutRecord(layout)) return false;
  if (recordWasEditedAfterCreate(layout)) return true;
  const containerIds = getLayoutContainerIdSetForState(sourceState, layout);
  const itemIds = getLayoutItemIdSetForState(sourceState, layout);
  for (const containerId of containerIds) {
    if (recordWasEditedAfterCreate(sourceState.containers?.[containerId])) return true;
  }
  for (const itemId of itemIds) {
    if (recordWasEditedAfterCreate(sourceState.items?.[itemId])) return true;
  }
  return false;
}

function guestLocalLayoutCandidate(sourceState = state) {
  if (!isMeaningfulPackingState(sourceState)) return null;
  try {
    if (sameJson(cloneStateForSync(sourceState, { forSync: true }), cloneStateForSync(createEmptyUserState(), { forSync: true }))) {
      return null;
    }
  } catch {
    // If normalization fails, continue with the shape checks below.
  }
  const personalLayouts = Object.values(sourceState.layouts || {}).filter((layout) =>
    layout && isGuestDemoCopyLayoutRecord(layout) && !layout.adminDemo && !layout.adminSharedSourceId
  );
  if (!personalLayouts.length) return null;
  const editedLayouts = personalLayouts.filter((layout) => guestLayoutHasUserContentEdits(sourceState, layout));
  if (!editedLayouts.length) return null;
  const activeLayout = editedLayouts.find((layout) => layout.id === sourceState.activeLayoutId);
  const meaningfulLayout = editedLayouts.find((layout) => (layout.rootContainerIds || []).some((id) => sourceState.containers?.[id]));
  const layout = activeLayout || meaningfulLayout || editedLayouts[0];
  if (!layout || !(layout.rootContainerIds || []).some((id) => sourceState.containers?.[id])) return null;
  return {
    sourceState: clone(sourceState),
    layoutId: layout.id,
    layoutName: String(layout.name || "Гостевая укладка").trim() || "Гостевая укладка"
  };
}

function shouldCaptureGuestLocalLayoutCandidate(previousScope, nextScope, sourceState = state) {
  if (previousScope !== GUEST_STORAGE_SCOPE || nextScope === GUEST_STORAGE_SCOPE) return false;
  if (isSharedListLinkRoute() || syncMetaAccountKey(syncMeta)) return false;
  if (currentViewScope() !== VIEW_SCOPE_GUEST_LOCAL && !hasGuestDemoCopyLayoutRecord(sourceState.layouts)) return false;
  return Boolean(guestLocalLayoutCandidate(sourceState));
}

function consumeGuestLocalLayoutCandidate() {
  const candidate = pendingGuestLocalLayoutCandidate;
  pendingGuestLocalLayoutCandidate = null;
  if (candidate) {
    candidate.layoutName = readableGuestDemoLayoutName(candidate.layoutName, "Гостевая укладка");
  }
  return candidate;
}

function hasGuestDemoCopyLayout() {
  return hasGuestDemoCopyLayoutRecord(state.layouts);
}

function currentSessionMode() {
  if (isAdminUser()) return SESSION_MODE_ADMIN;
  if (currentUser || offlineRememberedUser || isForcedOffline()) return SESSION_MODE_USER;
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
    setDemoStatePayloadForLanguage(
      uiLanguage,
      normalizeUiLanguage(uiLanguage) === DEFAULT_LANGUAGE
        ? createDemoSeedState()
        : createEmptyPublicTemplateState(uiLanguage)
    );
  }
  return setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
}

function renderGuestPublicDemoPreviewDuringAuthCheck(message = "") {
  if (!shouldRenderGuestDemoPreviewDuringAuthCheck({
    currentUser,
    forcedOffline: isForcedOffline(),
    sharedListRoute: isSharedListLinkRoute(),
    hadAuthoritativeLocalStateAtStartup
  })) return false;
  ensureGuestDemoPreviewPayload({
    language: uiLanguage,
    getPayload: demoStatePayloadForLanguage,
    setPayload: setDemoStatePayloadForLanguage,
    createPayload: createDemoSeedState
  });
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  renderPreservingPackingScroll();
  updateSyncUi(message || currentPublicTemplateStatusMessage());
  return true;
}

function isStartupGuestDemoPreview() {
  return isStartupGuestDemoPreviewState({
    initialRemoteLoadPending,
    currentUser,
    readOnlyStateScope: isReadOnlyStateScope(),
    activeReadOnlyLayoutId: activeReadOnlyLayoutId()
  });
}

function shouldKeepCurrentReadonlyDemoAfterAuthCheck() {
  return shouldKeepReadonlyDemoAfterAuthCheck({
    initialRemoteLoadPending,
    currentUser,
    readOnlyStateScope: isReadOnlyStateScope(),
    activeReadOnlyLayoutId: activeReadOnlyLayoutId()
  });
}

function readOnlyDemoPayloadNeedsLoad(language = uiLanguage) {
  return activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID &&
    !isMeaningfulPackingState(demoStatePayloadForLanguage(language));
}

async function ensureReadOnlyDemoPayloadLoaded({ renderAfter = false } = {}) {
  if (!readOnlyDemoPayloadNeedsLoad()) return false;
  await defaultDemoState(uiLanguage);
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  if (renderAfter) renderPreservingPackingScroll();
  return true;
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
  if (publishedLayoutSaveTimer && publishedLayoutSaveLayoutId && publishedLayoutSaveLayoutId !== layoutId) {
    const previousLayoutId = publishedLayoutSaveLayoutId;
    window.clearTimeout(publishedLayoutSaveTimer);
    publishedLayoutSaveTimer = null;
    publishedLayoutSaveLayoutId = "";
    savePublishedLayoutRecord(previousLayoutId).catch((error) => {
      updateSyncUi(`Не удалось сохранить public-укладку: ${error.message}`);
    });
  }
  if (publishedLayoutSaveTimer) window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveLayoutId = layoutId;
  publishedLayoutSaveTimer = window.setTimeout(() => {
    const targetLayoutId = publishedLayoutSaveLayoutId || layoutId;
    publishedLayoutSaveTimer = null;
    publishedLayoutSaveLayoutId = "";
    savePublishedLayoutRecord(targetLayoutId).catch((error) => {
      updateSyncUi(`Не удалось сохранить public-укладку: ${error.message}`);
    });
  }, delay);
}

function cancelPublishedLayoutSave(layoutId = "") {
  if (!publishedLayoutSaveTimer) return false;
  if (layoutId && publishedLayoutSaveLayoutId && publishedLayoutSaveLayoutId !== layoutId) return false;
  window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveTimer = null;
  publishedLayoutSaveLayoutId = "";
  return true;
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
  const layoutId = publishedLayoutSaveLayoutId || getPublishedEditLayoutId();
  if (!publishedLayoutSaveTimer || !isAdminEditablePublishedLayout(layoutId) || !canOpenAdminPublishedEdit()) return;
  window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveTimer = null;
  publishedLayoutSaveLayoutId = "";
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
  return editMetaForDevice(syncDevice, when);
}

function currentCreateMeta(when = nowIso()) {
  return createMetaForDevice(syncDevice, when);
}

function markEdited(record, when = nowIso()) {
  return applyEditMeta(record, currentEditMeta(when), when);
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
  const publicRecordIds = getPublicLayoutRecordIdsForState(cloned);
  const draftLayoutIds = Object.values(layouts)
    .filter((layout) => layout?.adminDemo || layout?.adminSharedSourceId || layout?.publicCatalogLayoutId || layout?.[GUEST_DEMO_COPY_FLAG])
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
    if (publicRecordIds.containerIds.has(containerId) || isPublicSyncContainer(containerId, container)) {
      collectContainerTreeForDrop(cloned, containerId, containersToDrop);
    }
  });
  containersToDrop.forEach((containerId) => {
    delete cloned.containers[containerId];
  });
  Object.entries(cloned.items || {}).forEach(([itemId, item]) => {
    if (
      publicRecordIds.itemIds.has(itemId) ||
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

function normalizeRemoteState(payload) {
  if (!payload || typeof payload !== "object") return null;
  const normalized = JSON.parse(JSON.stringify(payload));
  if (!normalized.locations || !normalized.categories || !normalized.containers || !normalized.items || !normalized.layouts) {
    return null;
  }
  if (!normalized.collapsedContainers) normalized.collapsedContainers = {};
  if (typeof normalized.showItemMeta !== "boolean") normalized.showItemMeta = false;
  ensureItemDisplayModeState(normalized);
  if (typeof normalized.showFilterContext !== "boolean") normalized.showFilterContext = false;
  normalizeCollectionModeState(normalized);
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
  ensureItemDisplayModeState(normalized);
  if (typeof normalized.showFilterContext !== "boolean") normalized.showFilterContext = false;
  normalizeCollectionModeState(normalized);
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

function replaceState(nextState, { preserveLocalUi = true } = {}) {
  saveRecoverySnapshot("before-replace", state);
  captureActiveLayoutArrangement();
  solidifyManagedTemplateDrafts();
  const managedPublicDrafts = collectManagedPublicDraftRecords(state);
  const previousCollapsedContainers = preserveLocalUi ? state.collapsedContainers : null;
  const previousItemDisplayMode = preserveLocalUi ? normalizeItemDisplayMode(state.itemDisplayMode) : null;
  const previousShowItemMeta = preserveLocalUi ? state.showItemMeta : null;
  const previousShowFilterContext = preserveLocalUi ? state.showFilterContext : null;
  applyingRemoteState = true;
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
  mergeManagedPublicDraftRecords(state, managedPublicDrafts);
  normalizeContainerFields(state);
  normalizeItemFields(state);
  cleanupGeneratedCatalogArtifacts(state);
  repairContainerMembershipFromItemLinks(state);
  normalizeLayoutFields(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  applyLayoutArrangement(state.activeLayoutId, state);
  applyCollectionModeFromSource(state, nextState);
  if (previousCollapsedContainers) {
    state.collapsedContainers = mergeLocalCollapsedContainers(state.collapsedContainers || {}, previousCollapsedContainers);
  }
  if (preserveLocalUi) {
    state.itemDisplayMode = previousItemDisplayMode || itemDisplayModeFromFlags({
      showMeta: typeof previousShowItemMeta === "boolean" ? previousShowItemMeta : Boolean(state.showItemMeta)
    });
    ensureItemDisplayModeState(state);
    state.showFilterContext = typeof previousShowFilterContext === "boolean" ? previousShowFilterContext : Boolean(state.showFilterContext);
  } else {
    ensureItemDisplayModeState(state);
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
  rememberPrivateServerLayoutChoice({ preferStored: !preferredLayoutId });
  saveBaseState(serializeState({ forSync: true }));
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = updatedAt || null;
  syncMeta.localUpdatedAt = updatedAt || null;
  syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
  rememberRemoteIntegrityMeta(integrityMeta);
  rememberCurrentSyncAccount();
  saveSyncMeta();
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  setPersonalLayoutsLoadedStatus();
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
  merged.itemDisplayMode = normalizeItemDisplayMode(localState.itemDisplayMode);
  merged.showItemMeta = merged.itemDisplayMode === "meta" || merged.itemDisplayMode === "meta-photos";
  merged.showFilterContext = Boolean(localState.showFilterContext);
  merged.collectionMode = Boolean(mergeScalarField(
    "collectionMode",
    Boolean(baseState.collectionMode),
    Boolean(localState.collectionMode),
    Boolean(remoteState.collectionMode),
    conflicts
  ));
  merged.showOnlyUnpacked = Boolean(mergeScalarField(
    "showOnlyUnpacked",
    Boolean(baseState.showOnlyUnpacked && baseState.collectionMode),
    Boolean(localState.showOnlyUnpacked && localState.collectionMode),
    Boolean(remoteState.showOnlyUnpacked && remoteState.collectionMode),
    conflicts
  ) && merged.collectionMode);

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
    itemDisplayMode: "Режим меток и фото",
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
  refs.conflictList.innerHTML = `${renderConflictSyncContext()}${conflicts.map((conflict, index) => {
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
  }).join("")}`;
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

function renderConflictSyncContext() {
  const rows = [
    ["Время браузера сейчас", formatFullDateTime(new Date())],
    ["Локальная версия", formatFullDateTime(syncMeta.localUpdatedAt) || "нет"],
    ["Известная серверная версия", formatFullDateTime(syncMeta.serverUpdatedAt) || "нет"],
    ["Последняя успешная синхронизация", formatFullDateTime(syncMeta.lastSyncedLocalUpdatedAt) || "нет"],
    ["Устройство", syncDevice?.name || "это устройство"]
  ];
  return `
    <section class="conflict-card conflict-context">
      <h3>Контекст синхронизации</h3>
      <div class="conflict-diff" aria-label="Контекст синхронизации">
        ${rows.map(([label, value]) => `
          <div class="conflict-diff-row">
            <span>${escapeHtml(label)}</span>
            <span>${escapeHtml(value)}</span>
            <span></span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
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
  return formatArrangementConflictValueText(value);
}

function formatCompactJson(value) {
  return formatCompactJsonValue(value);
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
  return conflictVersionStampValue(value, exists, fallbackDevice, missingText);
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
  return describeChangedFieldsValue(localValue, remoteValue, fields);
}

function unlockOfflineState(message = "Локально · можно работать, войдите для сохранения в аккаунт") {
  currentUser = null;
  appUnlocked = true;
  if (activateOfflineRememberedSession(message)) return;
  if (!isForcedOffline()) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
    renderPreservingPackingScroll();
    updateSyncUi(currentPublicTemplateStatusMessage());
    return;
  }
  renderInitialLocalFallbackIfNeeded();
  updateSyncUi(message);
}

function rememberedOfflineUser(user = null) {
  return buildRememberedOfflineUser({
    user,
    storage: localStorage,
    signedOut: isExplicitlySignedOut()
  });
}

function isOfflineRememberedSession() {
  return Boolean(!currentUser && offlineRememberedUser);
}

function clearOfflineRememberedSession() {
  offlineRememberedUser = null;
}

function activateOfflineRememberedSession(message = "Офлайн · открыта локальная копия личных укладок") {
  const rememberedUser = rememberedOfflineUser(offlineRememberedUser);
  if (!rememberedUser) return false;
  currentUser = null;
  offlineRememberedUser = rememberedUser;
  appUnlocked = true;
  activateLocalStorageScope(rememberedUser.scopeKey || userStorageScopeKey(rememberedUser));
  setActivePrivateScope();
  setLayoutLoadStatus("warning", "Офлайн: показана локальная копия личных укладок");
  const renderedFallback = renderInitialLocalFallbackIfNeeded();
  if (!renderedFallback) renderPreservingPackingScroll();
  updateSyncUi(message);
  return true;
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
  return getSavedAuthEmailFromStorage(localStorage);
}

function currentUserId() {
  return currentUserIdFromStorage(currentUser, localStorage);
}

function currentUserSyncKey() {
  const userId = currentUserId();
  const email = currentUserEmail();
  return userId ? `id:${userId}` : (email ? `email:${email}` : "");
}

function syncMetaAccountKey(meta = syncMeta) {
  const key = String(meta?.accountKey || "").trim().toLowerCase();
  if (key) return key;
  const userId = String(meta?.accountId || "").trim().toLowerCase();
  const email = String(meta?.accountEmail || "").trim().toLowerCase();
  return userId ? `id:${userId}` : (email ? `email:${email}` : "");
}

function syncMetaBelongsToCurrentUser(meta = syncMeta) {
  const currentKey = currentUserSyncKey();
  if (!currentKey) return true;
  const metaKey = syncMetaAccountKey(meta);
  if (!metaKey) return false;
  return metaKey === currentKey;
}

function isForeignLocalSyncState() {
  return syncMetaBelongsToCurrentUser(syncMeta) === false;
}

function rememberCurrentSyncAccount() {
  if (!currentUser) return;
  syncMeta.accountKey = currentUserSyncKey() || null;
  syncMeta.accountEmail = currentUserEmail() || null;
  syncMeta.accountId = currentUserId() || null;
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

function currentUsageLimit(name) {
  return usageLimitForRole(name, canOpenAdminPublishedEdit());
}

function requireUsageCapacity(name, add = 1) {
  const current = {
    items: Object.keys(state.items || {}).length,
    containers: Object.keys(state.containers || {}).length,
    categories: dictionaryOptionsForOwner("category", activeDictionaryOwner()).length,
    locations: dictionaryOptionsForOwner("location", activeDictionaryOwner()).length
  }[name] || 0;
  const limit = currentUsageLimit(name);
  if (canAddUsageEntries({ current, add, limit })) return true;
  showToast(usageLimitExceededMessage(name, limit), "warning");
  return false;
}

function openHelpLimitsDialog() {
  const isAdmin = canOpenAdminPublishedEdit();
  const photoLimit = currentUsageLimit("photosPerRecord");
  const en = uiLanguage === "en";
  const limitText = Number.isFinite(photoLimit) ? String(photoLimit) : (en ? "unlimited" : "без ограничений");
  refs.helpLimitsDialog?.querySelector("h2")?.replaceChildren(document.createTextNode(t("menu.help")));
  refs.helpLimitsDialog?.querySelector("footer button")?.replaceChildren(document.createTextNode(en ? "Close" : "Закрыть"));
  refs.helpLimitsContent.innerHTML = en ? `
    <section class="help-limits-section">
      <h3>Photos</h3>
      <p>${isAdmin ? "You can add up to 50 photos to one item or bag." : "You can add up to 3 photos to one item or bag."}</p>
      <p>Current limit: ${limitText} photos.</p>
    </section>
    <section class="help-limits-section">
      <h3>Catalog</h3>
      ${isAdmin ? `
        <p>Your catalog limits are unlimited.</p>
      ` : `
        <ul>
          <li>Items: up to 500.</li>
          <li>Bags and storage places: up to 50.</li>
          <li>Categories: up to 50.</li>
          <li>Storage places: up to 10.</li>
        </ul>
      `}
    </section>
    <section class="help-limits-section">
      <h3>Photo Viewer</h3>
      <p>Swipe to switch photos. On desktop, dots below the photo show the current slide. Click a photo to open it fullscreen; drag to pan, use the mouse wheel or pinch to zoom, and click the photo again to close.</p>
    </section>
  ` : `
    <section class="help-limits-section">
      <h3>Фото</h3>
      <p>${isAdmin ? "Можно добавить до 50 фото на одну вещь или сумку." : "Можно добавить до 3 фото на одну вещь или сумку."}</p>
      <p>Текущий лимит: ${limitText} фото.</p>
    </section>
    <section class="help-limits-section">
      <h3>Каталог</h3>
      ${isAdmin ? `
        <p>Для вашего каталога лимиты не ограничены.</p>
      ` : `
        <ul>
          <li>Вещи: до 500 шт.</li>
          <li>Сумки и места хранения: до 50 шт.</li>
          <li>Категории: до 50 шт.</li>
          <li>Места хранения: до 10 шт.</li>
        </ul>
      `}
    </section>
    <section class="help-limits-section">
      <h3>Просмотр фото</h3>
      <p>Фото можно листать свайпом. На десктопе точки под фото показывают текущий слайд. Клик по фото открывает полноэкранный просмотр; фото можно двигать, масштаб менять колесом мыши или pinch-жестом, следующий клик по фото закрывает просмотр.</p>
    </section>
  `;
  openModalDialog(refs.helpLimitsDialog);
}

function adminApiWarningFromCapabilities(data) {
  return adminApiWarningFromCapabilitiesValue(data, {
    appVersion: APP_VERSION,
    requiredVersion: REQUIRED_ADMIN_API_VERSION,
    requiredCapabilities: REQUIRED_ADMIN_API_CAPABILITIES
  });
}

async function checkAdminApiCompatibility({ force = false } = {}) {
  if (!canOpenAdminPublishedEdit() || isForcedOffline()) return;
  if (adminApiCompatibility.checking) {
    const startedAt = Date.now();
    while (adminApiCompatibility.checking && Date.now() - startedAt < 7500) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return adminApiCompatibility;
  }
  if (!force && adminApiCompatibility.checkedAt && Date.now() - adminApiCompatibility.checkedAt < 5 * 60 * 1000) return;
  adminApiCompatibility.checking = true;
  try {
    const data = await apiFetch("/bike-packing/capabilities", {
      timeoutMs: 7000,
      silentErrors: true
    });
    const warning = adminApiWarningFromCapabilities(data);
    adminApiCompatibility = {
      checkedAt: Date.now(),
      checking: false,
      ok: !warning,
      warning,
      version: String(data?.apiCompatibilityVersion || data?.bikePackingApiCompatibilityVersion || "").trim(),
      capabilities: Array.isArray(data?.capabilities) ? data.capabilities : []
    };
  } catch (error) {
    adminApiCompatibility = {
      checkedAt: Date.now(),
      checking: false,
      ok: false,
      warning: `Админка: не удалось проверить версию API (${apiErrorMessage(error)}). Перед публикацией шаблонов проверьте backend.`,
      version: "",
      capabilities: []
    };
  }
  updateSyncUi();
  return adminApiCompatibility;
}

function currentAdminApiWarning() {
  return canOpenAdminPublishedEdit() ? String(adminApiCompatibility.warning || "") : "";
}

async function assertAdminApiCompatibility({ force = false } = {}) {
  await checkAdminApiCompatibility({ force });
  const warning = currentAdminApiWarning();
  if (!warning) return true;
  const error = new Error(warning);
  error.isAdminApiCompatibilityError = true;
  throw error;
}

function updateSyncUi(message = "") {
  const rememberedOffline = isOfflineRememberedSession();
  const loggedIn = Boolean(currentUser || rememberedOffline);
  const unlocked = loggedIn || appUnlocked;
  const forcedOffline = isForcedOffline();
  const privateStateAvailable = canUseLocalEditableState() && !isReadOnlyStateScope();
  if (!privateStateAvailable && unlocked && !initialRemoteLoadPending) ensureGuestPublicScope();
  document.body.classList.toggle("auth-gated", !unlocked);
  document.body.classList.toggle("admin-session", canOpenAdminPublishedEdit());
  document.body.classList.toggle("readonly-template", isReadonlyTemplateView());
  if (!canOpenAdminPublishedEdit()) packingVisualStylePanelVisible = false;
  syncPackingVisualStyleControls();
  adminReportsDialogController?.syncVisibility();
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
  updateSyncVisualState({ loggedIn, unlocked, message, adminApiWarning: showAdminApiWarning });
  if (adminApiWarning) {
    refs.syncStatus.textContent = adminApiWarning;
    return;
  }
  if (message) {
    refs.syncStatus.textContent = message;
    return;
  }
  if (forcedOffline && appUnlocked) {
    refs.syncStatus.textContent = t("sync.forcedOffline");
    return;
  }
  if (rememberedOffline && appUnlocked && !message) {
    refs.syncStatus.textContent = syncMeta.dirty
      ? "Офлайн · локальные изменения сохранены на устройстве"
      : "Офлайн · локальная копия личных укладок";
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

function updateSyncVisualState({ loggedIn, unlocked, message = "", adminApiWarning = false }) {
  syncVisualState = resolveSyncVisualState({
    loggedIn,
    unlocked,
    message,
    adminApiWarning,
    forcedOffline: isForcedOffline(),
    readOnlyScope: isReadOnlyStateScope(),
    dirty: syncMeta.dirty
  });
  applySyncVisualState({ syncButton: refs.syncBtn, stateName: syncVisualState });
}

async function apiFetch(path, options = {}) {
  return apiFetchRequest(path, options, { isForcedOffline });
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

function keepRemoteOnlyPhotoReference(photo) {
  if (!hasRemotePhotoUrl(photo) || photo.localId) return false;
  photo.status = "synced";
  photo.error = "";
  return true;
}

function getUploadablePhotoEntries({ layoutId = null, listId = "", allowRemoteOnlyReferences = true } = {}) {
  const scope = getPhotoUploadScope(layoutId);
  const entries = [];
  Object.values(state.items || {}).forEach((item) => {
    if (!isEntityInPhotoUploadScope(item, "item", scope)) return;
    normalizeItemPhotos(item).forEach((photo) => {
      if (!photoShouldBeCopiedToCurrentList(photo) && isPhotoUsableFromServer(photo, listId)) return;
      const needsListReupload = listId && hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId);
      if (needsListReupload && allowRemoteOnlyReferences && !photoShouldBeCopiedToCurrentList(photo) && keepRemoteOnlyPhotoReference(photo)) return;
      if (needsListReupload && allowRemoteOnlyReferences && photo.status === "missing-local-file") return;
      if (!needsListReupload && !["pending", "error", "uploading"].includes(photo.status)) return;
      if (!needsListReupload && photo.url && photo.thumbUrl && photo.status === "synced") return;
      entries.push({ entity: item, entityType: "item", photo });
    });
  });
  Object.values(state.containers || {}).forEach((container) => {
    if (!isEntityInPhotoUploadScope(container, "container", scope)) return;
    normalizeItemPhotos(container).forEach((photo) => {
      if (!photoShouldBeCopiedToCurrentList(photo) && isPhotoUsableFromServer(photo, listId)) return;
      const needsListReupload = listId && hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId);
      if (needsListReupload && allowRemoteOnlyReferences && !photoShouldBeCopiedToCurrentList(photo) && keepRemoteOnlyPhotoReference(photo)) return;
      if (needsListReupload && allowRemoteOnlyReferences && photo.status === "missing-local-file") return;
      if (!needsListReupload && !["pending", "error", "uploading"].includes(photo.status)) return;
      if (!needsListReupload && photo.url && photo.thumbUrl && photo.status === "synced") return;
      entries.push({ entity: container, entityType: "container", photo });
    });
  });
  return entries;
}

function photoShouldBeCopiedToCurrentList(photo) {
  return Boolean(photo?._copyToCurrentList || photo?.copyToCurrentList || photo?.publicCopySourceId || photo?.sharedSourceId);
}

function markRecordPhotosForCurrentListCopy(record) {
  if (!record || !Array.isArray(record.photos)) return;
  normalizeItemPhotos(record).forEach((photo) => {
    if (!hasRemotePhotoUrl(photo)) return;
    photo._copyToCurrentList = true;
  });
}

function markLayoutPhotosForCurrentListCopy(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout) return;
  getLayoutContainerIdSetForState(state, layout).forEach((containerId) => {
    markRecordPhotosForCurrentListCopy(state.containers?.[containerId]);
  });
  getLayoutItemIdSetForState(state, layout).forEach((itemId) => {
    markRecordPhotosForCurrentListCopy(state.items?.[itemId]);
  });
}

function getUnsyncedPhotoEntries({ layoutId = null, listId = "" } = {}) {
  const scope = getPhotoUploadScope(layoutId);
  const entries = [];
  Object.values(state.items || {}).forEach((item) => {
    if (!isEntityInPhotoUploadScope(item, "item", scope)) return;
    normalizeItemPhotos(item).forEach((photo) => {
      if (hasRemotePhotoUrl(photo)) {
        if (listId && !isPhotoStoredForList(photo, listId)) {
          photo.error = photo.error || "Фото не загружено в public-укладку.";
          entries.push({ entity: item, entityType: "item", photo });
        }
        return;
      }
      if (photo.localId || photo.status !== "synced") entries.push({ entity: item, entityType: "item", photo });
    });
  });
  Object.values(state.containers || {}).forEach((container) => {
    if (!isEntityInPhotoUploadScope(container, "container", scope)) return;
    normalizeItemPhotos(container).forEach((photo) => {
      if (hasRemotePhotoUrl(photo)) {
        if (listId && !isPhotoStoredForList(photo, listId)) {
          photo.error = photo.error || "Фото не загружено в public-укладку.";
          entries.push({ entity: container, entityType: "container", photo });
        }
        return;
      }
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

async function savePublishedSharedLayoutMetadata(layout, previousLayout = null) {
  const target = publishedLayoutTarget(layout);
  if (target?.type !== "shared" || !target.sharedId) return false;
  await assertAdminApiCompatibility({ force: true });
  cancelPublishedLayoutSave(layout.id);
  const previousRuntime = findSharedLayout(target.sharedId);
  const previousRuntimeSnapshot = previousRuntime ? clone(previousRuntime) : null;
  const payload = previousRuntime?.statePayload || null;
  const nextLanguage = layout.language || previousRuntime?.language || uiLanguage;
  try {
    const data = await apiFetch(`/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/metadata`, {
      method: "POST",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify({
        title: layout.name || previousRuntime?.name || target.sharedId,
        name: layout.name || previousRuntime?.name || target.sharedId,
        language: nextLanguage
      })
    });
    const confirmedName = data?.name || layout.name || previousRuntime?.name || target.sharedId;
    const confirmedLanguage = data?.language || nextLanguage;
    const sharedLayout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
      id: target.sharedId,
      name: confirmedName,
      language: confirmedLanguage,
      statePayload: payload,
      runtimeSharedTemplate: true
    });
    if (sharedLayout) sharedLayout.updatedAt = nowIso();
    serverConfirmedSharedLayouts = updateSharedLayoutCatalogEntryMetadata(serverConfirmedSharedLayouts, target.sharedId, {
      name: confirmedName,
      language: confirmedLanguage,
      updatedAt: sharedLayout?.updatedAt || nowIso()
    });
    saveState({ sync: false });
    refreshPublishedLayoutView(target);
    return true;
  } catch (error) {
    if (previousLayout?.id) state.layouts[previousLayout.id] = previousLayout;
    if (previousRuntimeSnapshot) {
      upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
        ...previousRuntimeSnapshot,
        runtimeSharedTemplate: Boolean(previousRuntimeSnapshot.runtimeSharedTemplate)
      });
    }
    throw error;
  }
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
  const uploadEntries = entries || getUploadablePhotoEntries({
    layoutId,
    listId: publicListIdForPublishedTarget(target),
    allowRemoteOnlyReferences: false
  });
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
  const copiedOnServer = await copyRemotePhotoToList(listId, entity, photo, entityType, { uploadPath: path });
  if (copiedOnServer) return true;
  const uploadSource = await getPhotoUploadSource(photo, localId);
  if (!uploadSource?.blob) {
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
    formData.append("file", uploadSource.blob, uploadSource.fileName || photo.fileName || `${photo.id}.jpg`);
    if (uploadSource.thumbBlob) formData.append("thumb", uploadSource.thumbBlob, `thumb-${photo.id}.jpg`);
    const data = await apiFetch(path, {
      method: "POST",
      body: formData,
      timeoutMs: 30000
    });
    const serverPhoto = normalizeUploadedPhotoAssetUrls(data.photo || data, listId, path, photo.id);
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
    delete photo._copyToCurrentList;
    delete photo.copyToCurrentList;
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

async function getPhotoUploadSource(photo, localId) {
  const cached = await getCachedPhoto(localId);
  if (cached?.blob) return cached;
  if (!hasRemotePhotoUrl(photo)) return null;
  const blob = await fetchRemotePhotoBlobForUpload(photo, "file");
  if (!blob) return null;
  const thumbBlob = await fetchRemotePhotoBlobForUpload(photo, "thumb").catch(() => null);
  return {
    blob,
    thumbBlob,
    fileName: photo.fileName || `${photo.id || localId || "photo"}.jpg`
  };
}

async function copyRemotePhotoToList(listId, entity, photo, entityType = "item", { uploadPath = "" } = {}) {
  if (!listId || !entity?.id || !hasRemotePhotoUrl(photo)) return false;
  const source = remotePhotoSourceFromRecord(photo);
  if (!source.sourceListId || !source.sourcePhotoId) return false;
  const copyPath = photoCopyApiPath({ uploadPath, listId });
  if (!copyPath) return false;
  try {
    const data = await apiFetch(copyPath, {
      method: "POST",
      silentErrors: true,
      timeoutMs: 30000,
      body: JSON.stringify({
        sourceListId: source.sourceListId,
        sourcePhotoId: source.sourcePhotoId,
        photoId: photo.id || source.sourcePhotoId,
        entityType,
        entityId: entity.id
      })
    });
    const serverPhoto = normalizeUploadedPhotoAssetUrls(data.photo || data, listId, copyPath, photo.id || source.sourcePhotoId);
    Object.assign(photo, {
      ...photo,
      ...serverPhoto,
      id: serverPhoto.id || photo.id || source.sourcePhotoId,
      localId: photo.localId || photo.id || source.sourcePhotoId,
      listId: String(serverPhoto.listId || serverPhoto.list_id || listId || ""),
      status: "synced",
      error: "",
      updatedAt: serverPhoto.updatedAt || nowIso()
    });
    delete photo._copyToCurrentList;
    delete photo.copyToCurrentList;
    if (entityType === "container") touchContainer(entity.id, photo.updatedAt);
    else touchItem(entity.id, photo.updatedAt);
    return true;
  } catch (error) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] Failed to copy remote photo through API; falling back to download/upload.", {
        copyPath,
        source,
        targetListId: listId,
        entityType,
        entityId: entity.id,
        error
      });
    }
    return false;
  }
}

function remotePhotoSourceFromRecord(photo) {
  const fromUrl = remotePhotoSourceFromUrl(photo?.url) || remotePhotoSourceFromUrl(photo?.thumbUrl);
  return {
    sourceListId: String(fromUrl?.sourceListId || photo?.listId || "").trim(),
    sourcePhotoId: String(fromUrl?.sourcePhotoId || photo?.id || photo?.photoId || "").trim()
  };
}

function remotePhotoSourceFromUrl(src) {
  if (!src) return null;
  try {
    const url = new URL(src, location.href);
    const parts = url.pathname.split("/").map((part) => decodeURIComponent(part));
    const listsIndex = parts.indexOf("lists");
    const photosIndex = parts.indexOf("photos");
    if (listsIndex < 0 || photosIndex < 0 || photosIndex <= listsIndex + 1) return null;
    const sourceListId = parts[listsIndex + 1] || "";
    const sourcePhotoId = parts[photosIndex + 1] || "";
    return sourceListId && sourcePhotoId ? { sourceListId, sourcePhotoId } : null;
  } catch {
    return null;
  }
}

async function fetchRemotePhotoBlobForUpload(photo, variant = "file") {
  normalizePhotoUrlFields(photo);
  const src = variant === "thumb"
    ? (photo.thumbUrl || photo.url || "")
    : (photo.url || photo.thumbUrl || "");
  if (!src) return null;
  const response = await fetch(src, { credentials: "include", cache: "no-store" });
  if (!response.ok) return null;
  return response.blob();
}

async function deleteRemotePhotoIfPossible(entityId, photo, entityType = "item") {
  if (!currentUser || isForcedOffline() || !photo?.id) return;
  if (isAdminEditablePublishedLayout(getPublishedEditLayoutId())) return;
  if (isReadOnlyBikePackingContext()) return;
  try {
    const listId = await ensureCurrentPackingListId();
    if (hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId)) return;
    if (!currentPackingListMeta && listId) await fetchRemoteListDetailRecord(listId).catch(() => null);
    if (isReadOnlyBikePackingContext()) return;
    await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photo.id)}`, {
      method: "DELETE",
      silentErrors: true
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

async function checkAuthAndLoad({ syncDirtyNotify = false, restoreLayoutChoice = true, preferredLayout = null } = {}) {
  if (isSharedListLinkRoute()) return;
  if (isForcedOffline()) {
    setLayoutLoadStatus("warning", "Офлайн: показана локальная укладка");
    if (isExplicitlySignedOut()) {
      await enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыта локальная копия демо");
      return;
    }
    unlockOfflineState("Принудительно офлайн · локальная укладка доступна");
    return;
  }
  let authData = null;
  try {
    setLayoutLoadStatus("loading", "Проверяю вход и личные укладки...");
    updateSyncUi("Проверяю вход...");
    authData = await apiFetch("/auth/me");
  } catch (error) {
    currentUser = null;
    setLayoutLoadStatus("warning", "Вход не подтверждён, личные укладки скрыты");
    if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
      appUnlocked = true;
      await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
      updateSyncUi(currentPublicTemplateStatusMessage());
      return;
    }
    if (isNetworkError(error)) {
      if (activateOfflineRememberedSession("Сервер недоступен · открыта локальная копия личных укладок")) return;
      await enterSignedOutPublicMode("Вход не подтверждён · личные списки скрыты, открыта локальная копия демо");
      return;
    }
    appUnlocked = true;
    await loadGuestPublishedDemoOnStartup({ preferLocalCopy: true, remember: true });
    updateSyncUi();
    return;
  }

  currentUser = authData.user || authData.me || authData.account || null;
  if (!currentUser && (authData.id || authData.email)) currentUser = { id: authData.id, email: authData.email };
  if (!currentUser) {
    clearOfflineRememberedSession();
    appUnlocked = true;
    activateLocalStorageScope(GUEST_STORAGE_SCOPE);
    setLayoutLoadStatus("warning", "Вход не подтверждён, личные укладки скрыты");
    if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
      await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
      updateSyncUi(currentPublicTemplateStatusMessage());
      return;
    }
    await loadGuestPublishedDemoOnStartup({ preferLocalCopy: true, remember: true });
    updateSyncUi();
    return;
  }

  setExplicitlySignedOut(false);
  clearOfflineRememberedSession();
  appUnlocked = true;
  activateLocalStorageScopeForCurrentUser();
  rememberAuthenticatedUser();
  restoreTemplateCopyDraftsFromRecovery();
  if (isAdminUser()) checkAdminApiCompatibility({ force: true }).catch(() => null);
  setLayoutLoadStatus("loading", "Загружаю личные укладки...");
  updateSyncUi("Вход выполнен · загружаю данные...");
  await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice });

  try {
    if (syncMeta.dirty && hasLocalSavedState()) {
      updateSyncUi("Есть локальные изменения · проверяю даты...");
      await loadRemoteState({ notifyDirtySave: syncDirtyNotify, preferredLayout });
      if (restoreLayoutChoice) await restoreSavedLayoutChoice({ privateOnly: true });
      setPersonalLayoutsLoadedStatus();
      return;
    }
    await loadRemoteState({ preferredLayout });
    if (restoreLayoutChoice) await restoreSavedLayoutChoice({ privateOnly: true });
    setPersonalLayoutsLoadedStatus();
  } catch (error) {
    if (isNetworkError(error)) {
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Сервер недоступен, показана локальная укладка");
      updateSyncUi("Вход выполнен · офлайн, локальная укладка доступна");
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", `Не удалось загрузить личные укладки: ${error.message}`);
    updateSyncUi(`Вход выполнен · не удалось загрузить данные: ${error.message}`);
  }
}

function handleWindowReturn() {
  if (isSharedListLinkRoute()) {
    if (currentUser) updateSyncUi();
    return;
  }
  if (!currentUser && !isForcedOffline()) {
    checkAuthAndLoad({
      restoreLayoutChoice: false,
      preferredLayout: preferredCurrentLayoutRef()
    });
    return;
  }
  checkRemoteStateFreshness({ notify: true, preferredLayout: preferredCurrentLayoutRef() });
}

async function handleAuthButton() {
  if (isForcedOffline()) {
    showToast("Сначала выключите офлайн-режим в меню.", "error");
    return;
  }
  if (currentUser || isOfflineRememberedSession()) {
    const confirmed = await askConfirmDialog({
      title: "Выйти из аккаунта?",
      text: "После выхода список будет скрыт на этом устройстве до нового входа. Локальная копия не удалится, но офлайн-доступ после явного выхода будет отключён.",
      okText: "Выйти",
      cancelText: "Остаться"
    });
    if (!confirmed) return;
    if (currentUser) {
      try {
        updateSyncUi("Выходим...");
        await apiFetch("/auth/logout", { method: "POST" });
      } catch {
        // Even if the network fails, clear only the local UI state. The HttpOnly cookie remains server-owned.
      }
    }
    currentUser = null;
    clearOfflineRememberedSession();
    appUnlocked = true;
    setExplicitlySignedOut(true);
    activateLocalStorageScope(GUEST_STORAGE_SCOPE);
    resetGuestDemoScopeToCanonical();
    await enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыта локальная копия демо");
    showToast("Вы вышли. Личные списки скрыты; войдите снова, чтобы открыть их.", "success");
    return;
  }

  openAuthDialog();
}

function getSavedAuthEmail() {
  return getSavedAuthEmailFromStorage(localStorage);
}

function saveAuthEmail(email) {
  saveAuthEmailToStorage(email, localStorage);
}

function rememberAuthenticatedUser(user = currentUser) {
  rememberAuthenticatedUserInStorage(user, localStorage);
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
    offlineRememberedUser = rememberedOfflineUser(currentUser);
    currentUser = null;
    appUnlocked = true;
    activateOfflineRememberedSession("Принудительно офлайн · локальная укладка доступна");
    updateSyncUi("Принудительно офлайн · локальная укладка доступна");
    showToast("Офлайн-режим включён. API не будет использоваться.", "success");
    return;
  }
  clearOfflineRememberedSession();
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

function scheduleRemoteSave(delay = 0) {
  if (isForcedOffline() || !currentUser || applyingRemoteState) return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncNow(), delay);
}

async function syncNow(options = {}) {
  const force = Boolean(options.force);
  if (syncInFlight) {
    syncQueued = true;
    syncQueuedForce = syncQueuedForce || force;
    return;
  }
  syncInFlight = true;
  try {
    await runSyncNow({ force });
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      const nextForce = syncQueuedForce;
      syncQueued = false;
      syncQueuedForce = false;
      await syncNow({ force: nextForce });
    }
  }
}

async function runSyncNow({ force = false } = {}) {
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
      if (force) {
        showToast(
          isOfflineRememberedSession()
            ? "Сервер недоступен. Локальная копия сохранена на устройстве."
            : (appUnlocked ? "Офлайн: войдите, когда появится интернет." : "Нужно войти для синхронизации."),
          isOfflineRememberedSession() ? "warning" : "error"
        );
      }
      return;
    }
    if (force && hadLocalChanges && !syncMeta.dirty) return;
  }
  if (canOpenAdminPublishedEdit()) {
    await checkAdminApiCompatibility({ force }).catch(() => null);
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
  if (publishedLayoutSaveTimer && isAdminEditablePublishedLayout(publishedLayoutSaveLayoutId || getPublishedEditLayoutId())) {
    await flushActivePublishedEditSave();
    if (force) showToast("Public-укладка опубликована.", "success");
    return;
  }
  if (publishedLayoutSaveTimer) {
    window.clearTimeout(publishedLayoutSaveTimer);
    publishedLayoutSaveTimer = null;
    publishedLayoutSaveLayoutId = "";
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

function rememberConflictRemoteMeta(record, meta, updatedAt = "") {
  rememberRemoteIntegrityMeta(record || meta || {});
  if (updatedAt) syncMeta.serverUpdatedAt = updatedAt;
  saveSyncMeta();
}

async function ensurePrivateStateForSharedCopy() {
  if (!currentUser || isForcedOffline() || canLocalStateOverrideRemote()) return true;
  try {
    const data = await fetchRemoteStateRecord();
    const record = data?.record || data?.list || data || null;
    const remoteState = normalizeRemoteState(record?.payload || data?.payload || data?.serverPayload || data?.state);
    const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
    const rawPayload = record?.payload || data?.payload || data?.serverPayload || data?.state || null;
    if (remoteState && isMeaningfulPackingState(remoteState)) {
      applyRemoteState(remoteState, remoteUpdatedAt(record) || data?.serverUpdatedAt || null, remoteIntegrityMeta, rawPayload, {
        allowDestructive: true
      });
    } else {
      rememberRemoteIntegrityMeta(record || remoteIntegrityMeta || {}, data);
      rememberCurrentSyncAccount();
      saveSyncMeta();
    }
  } catch (error) {
    updateSyncUi(`Не удалось загрузить личное состояние перед копированием: ${error.message}`);
  }
  return true;
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
  return sharedListIdFromUrl(location.href, { listParam: SHARED_LIST_QUERY_PARAM });
}

function sharedLayoutIdFromLocation() {
  return sharedLayoutIdFromUrl(location.href, { layoutParam: SHARED_LAYOUT_QUERY_PARAM });
}

function isSharedListLinkRoute() {
  return Boolean(sharedListIdFromLocation());
}

function buildSharedListUrl(listId, layoutId = "") {
  return buildSharedListUrlFromHref(location.href, {
    listParam: SHARED_LIST_QUERY_PARAM,
    layoutParam: SHARED_LAYOUT_QUERY_PARAM,
    listId,
    layoutId
  });
}

function activateSharedPayloadLayout(payload, layoutId = "") {
  const normalized = normalizePublishedStatePayload(payload);
  if (!normalized) return null;
  const requestedLayoutId = String(layoutId || "").trim();
  if (!requestedLayoutId) return normalized;
  if (!normalized.layouts?.[requestedLayoutId]) {
    throw new Error("Укладка из ссылки не найдена в shared-списке.");
  }
  normalized.activeLayoutId = requestedLayoutId;
  applyLayoutArrangement(requestedLayoutId, normalized);
  return normalized;
}

function sharedPayloadActiveLayout(payload) {
  return payload?.layouts?.[payload.activeLayoutId] || Object.values(payload?.layouts || {})[0] || null;
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

async function openSharedListFromLink(listId, layoutId = "") {
  const normalizedListId = String(listId || "").trim();
  if (!normalizedListId) return false;
  appUnlocked = true;
  updateSyncUi("Открываю shared-список по ссылке...");
  try {
    const record = await fetchSharedListLinkRecord(normalizedListId);
    const payload = activateSharedPayloadLayout(record.payload, layoutId);
    assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record.payload);
    if (!payload) throw new Error("Сервер вернул пустую или повреждённую укладку.");
    const recordId = remoteRecordId(record, normalizedListId);
    const activeLayout = sharedPayloadActiveLayout(payload);
    const activeLayoutId = activeLayout?.id || payload.activeLayoutId || "";
    linkedSharedListLayout = {
      id: `linked-list-${recordId}${activeLayoutId ? `-${activeLayoutId}` : ""}`,
      listId: recordId,
      requestedLayoutId: activeLayoutId,
      name: record.title || "Shared список",
      subtitle: "Доступ по ссылке",
      roots: [],
      statePayload: payload,
      listRecord: record,
      linkedSharedList: true
    };
    linkedSharedListLayout.name = activeLayout?.name || linkedSharedListLayout.name;
    await hydrateAuthForSharedLink();
    setActiveReadOnlyScope(linkedSharedListLayout.id);
    switchView("packing");
    render();
    updateSyncUi(`Shared список · ${linkedSharedListLayout.name}`);
    return true;
  } catch (error) {
    await hydrateAuthForSharedLink();
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
    body.title = state.layouts?.[state.activeLayoutId]?.name || currentPackingListMeta?.title || "Bikepacking layout";
    body.title = currentPackingListMeta?.title || state.layouts?.[state.activeLayoutId]?.name || "Велоукладка";
    body.description = currentPackingListMeta?.description || "";
    body.title = state.layouts?.[state.activeLayoutId]?.name || currentPackingListMeta?.title || body.title || "Bikepacking layout";
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
      method: "PUT",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify(body)
    });
    rememberCurrentPackingListRecord(data);
    const sharedLayoutId = state.activeLayoutId;
    const link = buildSharedListUrl(listId, sharedLayoutId);
    await copySharedListLink(link);
    updateSyncUi("Ссылка на список создана и скопирована");
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
  let stateRecord = null;
  try {
    setLayoutLoadProgress({ loaded: 0, total: null, prefix: "Получаю данные укладок" });
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/state`, {
      timeoutMs: LIST_API_TIMEOUT_MS
    });
    stateRecord = normalizeRemoteListRecord(data);
  } catch (stateError) {
    try {
      const detailRecord = await fetchRemoteListDetailRecord(listId);
      const bestRecord = pickRicherRemoteListRecord(stateRecord, detailRecord);
      setLoadedRemoteListProgress(bestRecord, "Данные укладок получены");
      return bestRecord;
    } catch {
      throw stateError;
    }
  }
  const stateCount = remoteRecordPrivateLayoutCount(stateRecord);
  if (stateRecord?.payload && stateCount > 1) {
    setLoadedRemoteListProgress(stateRecord, "Данные укладок получены");
    return stateRecord;
  }
  try {
    const detailRecord = await fetchRemoteListDetailRecord(listId);
    const bestRecord = pickRicherRemoteListRecord(stateRecord, detailRecord);
    setLoadedRemoteListProgress(bestRecord, "Данные укладок получены");
    return bestRecord;
  } catch {
    setLoadedRemoteListProgress(stateRecord, "Данные укладок получены");
    return stateRecord;
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
  let savedRecord = null;
  if (currentPackingListId) {
    try {
      setLayoutLoadStatus("loading", "Загружаю сохранённую личную укладку...");
      savedRecord = await fetchRemoteListStateSnapshot(currentPackingListId);
    } catch (error) {
      if (error.status === 404) saveActivePackingListId("");
      else throw error;
    }
  }
  const savedCount = remoteRecordPrivateLayoutCount(savedRecord);
  const shouldCheckCatalog = !savedRecord?.payload || savedCount <= 1;
  if (savedRecord?.payload && !shouldCheckCatalog) {
    rememberCurrentPackingListRecord(savedRecord);
    return savedRecord;
  }

  setLayoutLoadStatus(
    "loading",
    savedRecord?.payload ? "Проверяю, нет ли полного списка личных укладок..." : "Получаю список личных укладок..."
  );
  let data = null;
  try {
    data = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
  } catch (error) {
    if (savedRecord?.payload) {
      rememberCurrentPackingListRecord(savedRecord);
      return savedRecord;
    }
    throw error;
  }
  const lists = normalizePackingListsResponse(data);
  const catalogBestRecord = bestCatalogListRecord(lists);
  const catalogBestId = remoteRecordId(catalogBestRecord);
  const list = (catalogBestId && lists.find((entry) => remoteRecordId(entry) === catalogBestId)) ||
    chooseDefaultPackingList(lists);
  if (!list) return null;
  setLayoutLoadProgress({
    loaded: 0,
    total: null,
    prefix: "Найден список, загружаю укладки"
  });
  const catalogRecord = normalizeRemoteListRecord(list);
  const listId = remoteRecordId(catalogRecord);
  let snapshotRecord = catalogRecord;
  if (listId) {
    try {
      snapshotRecord = pickRicherRemoteListRecord(snapshotRecord, await fetchRemoteListStateSnapshot(listId));
    } catch (error) {
      if (!snapshotRecord?.payload && !savedRecord?.payload) throw error;
    }
  }
  const bestRecord = pickRicherRemoteListRecord(savedRecord, snapshotRecord);
  if (bestRecord) {
    rememberCurrentPackingListRecord(bestRecord);
    setLoadedRemoteListProgress(bestRecord, "Личные укладки выбраны", { final: true });
  }
  return bestRecord;
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

async function refreshPublicSharedLayoutIndex({ renderAfter = false } = {}) {
  void renderAfter;
  return 0;
}

async function refreshPublicSharedLayoutCatalog({ renderAfter = false } = {}) {
  let merged = 0;
  let localDraftReconciled = false;
  let data = null;
  try {
    data = await fetchPublicSharedLayoutCatalog();
  } catch {
    const confirmedSharedLayouts = serverConfirmedSharedLayoutsByAdminOrder();
    const purgedUnconfirmed = purgeUnconfirmedSharedTemplatesFromFrontendState({
      targetState: state,
      layoutsByLanguage: sharedLayoutsByLanguage,
      confirmedSharedLayouts,
      fallbackLanguage: uiLanguage
    });
    if (purgedUnconfirmed.removedLayoutIds.length) saveState({ sync: false });
    if (renderAfter && (purgedUnconfirmed.removedRuntimeCount || purgedUnconfirmed.removedLayoutIds.length)) render();
    return 0;
  }
  const records = Array.isArray(data?.lists) ? data.lists : [];
  const concreteRecords = records.filter(isConcretePublicSharedLayoutListRecord);
  serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsFromPublicRecords(concreteRecords, {
    layoutsByLanguage: sharedLayoutsByLanguage,
    fallbackLanguage: uiLanguage
  }));
  sharedLayoutCatalogDiagnostics = createSharedLayoutCatalogDiagnostics({
    source: data?.fallback || "/bike-packing/public-shared-layouts",
    records: concreteRecords,
    sharedLayoutIdFromRecord: sharedLayoutIdFromPublicListRecord,
    confirmedLayouts: serverConfirmedSharedLayouts,
    visibleOptions: []
  });
  if (
    concreteRecords.length &&
    sharedLayoutCatalogDiagnostics.confirmedCount === 0 &&
    typeof console !== "undefined" &&
    console.warn
  ) {
    console.warn("[bike-packing] Shared template API returned rows, but none became confirmed shared layouts.", sharedLayoutCatalogDiagnostics);
  }
  const publicSharedIds = new Set(concreteRecords
    .map(sharedLayoutIdFromPublicListRecord)
    .filter(Boolean));
  const prunedMissingRuntime = pruneRuntimeSharedLayouts(sharedLayoutsByLanguage, (layout) =>
    layout?.runtimeSharedTemplate &&
    !publicSharedIds.has(layout.id)
  );
  await Promise.all(concreteRecords
    .map(async (record) => {
      const sharedId = sharedLayoutIdFromPublicListRecord(record);
      if (!sharedId) return;
      forgetDeletedSharedLayoutId(sharedId);
      let payload = null;
      try {
        payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId));
      } catch {
        return;
      }
      if (!isMeaningfulPackingState(payload)) return;
      const activeLayout = sharedPayloadActiveLayout(payload);
      const fallbackLanguage = sharedId.endsWith("-en") ? "en" : uiLanguage;
      const layout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
        id: sharedId,
        name: activeLayout?.name || record.title || sharedId,
        language: record.language || sharedLayoutLanguageFromPayload(payload, fallbackLanguage),
        statePayload: payload,
        runtimeSharedTemplate: true,
        updatedAt: record.updatedAt || record.updated_at || ""
      });
      if (layout) {
        merged += 1;
        if (reconcilePublishedTemplateCopyDraft({
          state,
          sharedLayout: layout,
          fallbackLanguage: uiLanguage,
          canRepair: canOpenAdminPublishedEdit(),
          isLayoutMeaningful,
          sharedLayoutStatePayload,
          sharedPayloadActiveLayout,
          templateCopySourceScore,
          removeLayoutTree,
          copyPublishedContainerToState,
          createLayoutArrangementFromCurrentState,
          normalizeLayoutArrangement,
          ensureLayoutDictionaries,
          currentMeta: currentEditMeta(),
          nowIso
        })) {
          localDraftReconciled = true;
        }
      }
    }));
  serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsFromPublicRecords(concreteRecords, {
    layoutsByLanguage: sharedLayoutsByLanguage,
    fallbackLanguage: uiLanguage
  }));
  const purgedUnconfirmed = purgeUnconfirmedSharedTemplatesFromFrontendState({
    targetState: state,
    layoutsByLanguage: sharedLayoutsByLanguage,
    confirmedSharedLayouts: serverConfirmedSharedLayouts,
    fallbackLanguage: uiLanguage
  });
  if (localDraftReconciled || purgedUnconfirmed.removedLayoutIds.length) saveState({ sync: false });
  if (renderAfter && (merged || prunedMissingRuntime || purgedUnconfirmed.removedRuntimeCount || purgedUnconfirmed.removedLayoutIds.length)) render();
  return merged;
}

async function fetchPublicSharedLayoutCatalog() {
  try {
    const data = await apiFetch("/bike-packing/public-shared-layouts", {
      timeoutMs: LIST_API_TIMEOUT_MS,
      silentErrors: true
    });
    const records = Array.isArray(data?.lists) ? data.lists : [];
    if (records.length || data?.canonical) return { ...data, lists: records };
  } catch {
    // Fall through to the legacy public-lists catalog. It is still server-confirmed.
  }
  const fallback = await apiFetch("/bike-packing/public-lists", {
    timeoutMs: LIST_API_TIMEOUT_MS,
    silentErrors: true
  });
  const records = (Array.isArray(fallback?.lists) ? fallback.lists : []).filter(isPublicSharedLayoutListRecord);
  return {
    ok: Boolean(fallback?.ok),
    canonical: false,
    fallback: "public-lists",
    lists: records
  };
}

async function refreshPublicSharedTemplates({ renderAfter = false } = {}) {
  const indexMerged = await refreshPublicSharedLayoutIndex();
  const catalogMerged = await refreshPublicSharedLayoutCatalog();
  if (renderAfter && (indexMerged || catalogMerged)) render();
  return indexMerged + catalogMerged;
}

async function savePublicSharedLayoutIndexEntry(layout) {
  if (isTemplateCopySharedLayoutId(layout?.id)) return false;
  const entry = sharedLayoutIndexEntry({
    id: layout?.id,
    name: layout?.name || layout?.id || "",
    language: layout?.language || uiLanguage,
    statePayload: layout?.statePayload || null,
    updatedAt: layout?.updatedAt || nowIso()
  });
  if (!entry?.id || !entry.statePayload) return false;
  const language = normalizeUiLanguage(entry.language || uiLanguage);
  let demoPayload = null;
  try {
    demoPayload = await fetchPublishedListStateById(demoPublicListIdForLanguage(language));
  } catch {
    demoPayload = demoStatePayloadForLanguage(language) || null;
  }
  if (!demoPayload) demoPayload = await defaultDemoState(language);
  const indexedPayload = upsertSharedLayoutIndexEntry(
    withRuntimeSharedLayoutIndex(demoPayload, sharedLayoutsByLanguage),
    entry
  );
  const title = indexedPayload.layouts?.[indexedPayload.activeLayoutId]?.name || t("demo.layoutName");
  await apiFetch(demoAdminStatePathForLanguage(language), {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      title,
      description: "",
      visibility: "public",
      listVisibility: "public",
      payload: indexedPayload
    })
  });
  setDemoStatePayloadForLanguage(language, indexedPayload);
  mergeSharedLayoutIndexPayload(sharedLayoutsByLanguage, indexedPayload);
  return true;
}

async function removePublicSharedLayoutIndexEntry(sharedId) {
  return removePublicSharedLayoutIndexEntryRecord({
    sharedId,
    languages: SUPPORTED_LANGUAGES,
    layoutsByLanguage: sharedLayoutsByLanguage,
    fetchPublishedPayload: (language) => fetchPublishedListStateById(demoPublicListIdForLanguage(language)),
    fallbackPayload: (language) => demoStatePayloadForLanguage(language) || null,
    saveDemoPayload: async (language, payload, title) => {
      await apiFetch(demoAdminStatePathForLanguage(language), {
        method: "POST",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify({
          title,
          description: "",
          visibility: "public",
          listVisibility: "public",
          payload
        })
      });
      setDemoStatePayloadForLanguage(language, payload);
    },
    demoTitle: (payload) => payload.layouts?.[payload.activeLayoutId]?.name || t("demo.layoutName"),
    warn: (...args) => {
      if (typeof console !== "undefined" && console.warn) console.warn(...args);
    }
  });
}

async function loadPublishedDemoState(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  try {
    const demoState = normalizeDemoPayloadForLanguage(
      await fetchPublishedListStateById(demoPublicListIdForLanguage(normalized)),
      normalized
    );
    if (isSafePublishedDemoState(demoState)) {
      setDemoPublicTemplateMissing(normalized, false);
      return demoState;
    }
  } catch {
    // Missing localized demo is a normal isolated state until admin publishes it.
  }
  try {
    const demoState = normalizeDemoPayloadForLanguage(
      await fetchStateRecordByItemKey(demoItemKeyForLanguage(normalized)),
      normalized
    );
    if (isSafePublishedDemoState(demoState)) {
      setDemoPublicTemplateMissing(normalized, false);
      return demoState;
    }
  } catch {
    // Missing localized demo is a normal isolated state until admin publishes it.
  }
  setDemoPublicTemplateMissing(normalized, true);
  return null;
}

function isSafePublishedDemoState(demoState) {
  if (!isPackingStateShape(demoState)) return false;
  if (!isMeaningfulPackingState(demoState)) return false;
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

async function loadGuestPublishedDemoOnStartup({ forcePublicScope = false, preferLocalCopy = false, remember = false } = {}) {
  const demoState = await defaultDemoState();
  setDemoStatePayloadForLanguage(uiLanguage, demoState);
  if (preferLocalCopy && !canUsePrivateState()) {
    await createLocalDemoCopy({ forceNew: false, remember });
    initialRemoteLoadPending = false;
    renderPreservingPackingScroll();
    return true;
  }
  if (forcePublicScope) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
    initialRemoteLoadPending = false;
    renderPreservingPackingScroll();
    return true;
  }
  if (forcePublicScope || !syncMeta.dirty || !hadAuthoritativeLocalStateAtStartup || isSuspiciousEmptyPackingState(state)) {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  }
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  return true;
}

async function enterSignedOutPublicMode(message = "") {
  currentUser = null;
  appUnlocked = true;
  activateLocalStorageScope(GUEST_STORAGE_SCOPE);
  saveActivePackingListId("");
  currentPackingListMeta = null;
  await loadGuestPublishedDemoOnStartup({ preferLocalCopy: true, remember: true });
  switchView("packing");
  render();
  updateSyncUi(message || currentPublicTemplateStatusMessage());
}

function localPersonalStateForDemoFallback() {
  return null;
}

async function saveRemoteState({ notify = false, forceOverwrite = false, preferredLayout = null, preferServerOnConflict = false, retryForceConflict = true } = {}) {
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
    if (isSuspiciousEmptyPackingState(state)) {
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
      rememberCurrentSyncAccount();
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
    rememberCurrentSyncAccount();
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
        if (retryForceConflict) {
          const conflictRecord = error.data?.record || error.data?.currentRecord || error.data || null;
          const conflictMeta = stateIntegrityMetaFromResponse(conflictRecord, error.data);
          const conflictUpdatedAt = remoteUpdatedAt(conflictRecord) || error.data?.serverUpdatedAt || "";
          if (conflictMeta?.stateRevision != null || conflictUpdatedAt) {
            rememberConflictRemoteMeta(conflictRecord, conflictMeta, conflictUpdatedAt);
            await saveRemoteState({
              notify,
              forceOverwrite: true,
              preferredLayout,
              preferServerOnConflict,
              retryForceConflict: false
            });
            return;
          }
        }
        updateSyncUi("Сервер всё ещё отклоняет принудительное сохранение · локальная версия оставлена");
        if (notify) showToast("Сервер не принял принудительное сохранение. Локальная версия не потеряна.", "error");
        return;
      }
      await handleRemoteSaveConflict(error, {
        notify,
        preferredLayout,
        preferServerWithoutPrompt: preferServerOnConflict || !canLocalStateOverrideRemote()
      });
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

async function handleRemoteSaveConflict(error, { notify = false, preferredLayout = null, preferServerWithoutPrompt = false } = {}) {
  const record = error.data?.record || error.data?.currentRecord || null;
  const remoteState = normalizeRemoteState(record?.payload || error.data?.payload || error.data?.serverPayload);
  const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, error.data);
  const updatedAt = remoteUpdatedAt(record) || error.data?.serverUpdatedAt || null;
  rememberConflictRemoteMeta(record, remoteIntegrityMeta, updatedAt);
  appUnlocked = true;
  updateSyncUi("Сервер изменился · нужно выбрать версию...");
  const remoteRawPayload = record?.payload || error.data?.payload || error.data?.serverPayload || null;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
  if (!remoteState) {
    if (notify) showToast("Сервер сообщил о конфликте. Локальные изменения не отправлены.", "error");
    return;
  }
  if (preferServerWithoutPrompt || !canLocalStateOverrideRemote()) {
    const guestCandidate = consumeGuestLocalLayoutCandidate();
    if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout })) {
      const message = "Загружена серверная версия · временная локальная копия не отправлена";
      updateSyncUi(message);
      if (notify) showToast(message, "warning");
      if (guestCandidate) await offerSaveGuestLocalLayout(guestCandidate);
    }
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

function findLayoutByNormalizedName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return Object.values(state.layouts || {}).find((layout) =>
    layout && !layout.adminDemo && !layout.adminSharedSourceId &&
    String(layout.name || "").trim().toLowerCase() === normalized
  ) || null;
}

async function offerSaveGuestLocalLayout(candidate, { confirm = true } = {}) {
  if (!candidate?.sourceState || !candidate.layoutId || !currentUser) return false;
  const confirmed = !confirm || await askConfirmDialog({
    title: "Сохранить гостевую укладку?",
    text: `Вы вошли в аккаунт, где уже есть данные. Сохранить укладку «${candidate.layoutName}», которую вы редактировали до входа?`,
    okText: "Сохранить",
    cancelText: "Не сохранять"
  });
  if (!confirmed) return false;

  const existing = findLayoutByNormalizedName(candidate.layoutName);
  let replaceLayoutId = "";
  if (existing) {
    const replace = await askConfirmDialog({
      title: "Такая укладка уже есть",
      text: `В аккаунте уже есть укладка «${existing.name}». Заменить её гостевой версией или создать отдельную новую укладку?`,
      okText: "Заменить",
      cancelText: "Создать новую",
      tone: "warning"
    });
    if (replace) replaceLayoutId = existing.id;
  }

  const importedLayoutId = importGuestLocalLayout(candidate, { replaceLayoutId });
  if (!importedLayoutId) {
    updateSyncUi("Гостевая укладка уже была перенесена или в ней нет данных для импорта");
    return false;
  }
  renderPreservingPackingScroll();
  updateSyncUi("Гостевая укладка добавлена в аккаунт · сохраняю на сервер...");
  const saved = await saveGuestImportToRemote();
  if (!saved) {
    updateSyncUi("Гостевая укладка перенесена в аккаунт · сохраню на сервер автоматически при следующей проверке");
    showToast("Гостевая укладка перенесена в аккаунт. Локальная версия не потеряна, синхронизация повторится автоматически.", "warning");
    scheduleRemoteSave();
    return false;
  }
  showToast(replaceLayoutId ? "Гостевая укладка заменила существующую." : "Гостевая укладка сохранена в аккаунт.", "success");
  return true;
}

async function saveGuestImportToRemote() {
  await saveRemoteState({ notify: false, forceOverwrite: true });
  if (!syncMeta.dirty) return true;
  updateSyncUi("Сервер попросил повторную синхронизацию · сохраняю гостевую укладку ещё раз...");
  await saveRemoteState({ notify: false, forceOverwrite: false });
  return !syncMeta.dirty;
}

function importGuestLocalLayout(candidate, { replaceLayoutId = "" } = {}) {
  const source = candidate.sourceState;
  const sourceLayout = source.layouts?.[candidate.layoutId];
  if (!sourceLayout) return "";
  saveRecoverySnapshot("before-guest-layout-import", state);
  const changedAt = nowIso();
  addBackupDictionaryValues(state, source);
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = (sourceLayout.rootContainerIds || [])
    .map((id) => copyPublishedContainerToState(source, id, { targetLayoutId: "", changedAt, idMap }))
    .filter(Boolean);
  if (!rootContainerIds.length) return "";
  const layoutId = replaceLayoutId || `layout-guest-import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const name = replaceLayoutId
    ? (state.layouts?.[replaceLayoutId]?.name || readableGuestDemoLayoutName(candidate.layoutName, "Гостевая укладка"))
    : uniqueLayoutName(candidate.layoutName || "Гостевая укладка");
  const safeName = readableGuestDemoLayoutName(name, "Гостевая укладка");
  delete state.layouts[layoutId];
  state.layouts[layoutId] = {
    ...clone(sourceLayout),
    id: layoutId,
    name: safeName,
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    locations: normalizeDictionaryValues(sourceLayout.locations || source.locations, layoutDictionaryValues(sourceLayout, "location", source)),
    categories: normalizeDictionaryValues(sourceLayout.categories || source.categories, layoutDictionaryValues(sourceLayout, "category", source)),
    ...currentCreateMeta(changedAt)
  };
  delete state.layouts[layoutId][GUEST_DEMO_COPY_FLAG];
  delete state.layouts[layoutId].demoSourceLanguage;
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  setActivePrivateScope();
  rememberActiveLayoutChoice(layoutId);
  normalizeContainerFields(state);
  normalizeItemFields(state);
  repairContainerMembershipFromItemLinks(state);
  normalizeLayoutFields(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  saveState();
  return layoutId;
}

async function loadRemoteState({ notifyDirtySave = false, preferredLayout = null } = {}) {
  if (!currentUser) return;
  if (isSharedListLinkRoute()) return;
  if (isPublicLayoutContext()) {
    appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi();
    return;
  }
  if (initialRemoteLoadPending || !remoteRefreshInFlight) {
    setLayoutLoadStatus("loading", initialRemoteLoadPending ? "Загружаю личные укладки..." : "Проверяю личные укладки...");
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  try {
    let data = await fetchRemoteStateRecord();
    let record = data.record;
    let remoteState = normalizeRemoteState(record?.payload);
    if (!remoteState && data.source === "list") {
      saveActivePackingListId("");
      setLayoutLoadProgress({ loaded: 0, total: null, prefix: "Повторно запрашиваю личные укладки" });
      data = await fetchRemoteStateRecord();
      record = data.record;
      remoteState = normalizeRemoteState(record?.payload);
    }
    const remoteLayoutCount = statePrivateLayoutCount(remoteState);
    if (remoteState) {
      setLayoutLoadProgress({
        loaded: remoteLayoutCount,
        total: remoteLayoutCount,
        prefix: "Личные укладки получены"
      });
    }
    const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
    const remoteRawPayload = record?.payload || data?.payload || data?.state || null;
    if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
    const serverTimeText = remoteUpdatedAt(record);
    const serverTime = timeValue(serverTimeText);
    const localTime = timeValue(syncMeta.localUpdatedAt);
    const isInitialRemotePull = initialRemoteLoadPending;
    const hasSavedLocalStateNow = hasLocalSavedState();
    const localStateCanOverrideRemote = canLocalStateOverrideRemote();
    const localStateIsNonAuthoritative = hasSavedLocalStateNow && !localStateCanOverrideRemote;
    const hasFreshLocalDirtyState = syncMeta.dirty && localStateCanOverrideRemote && Boolean(localTime) && (!serverTime || localTime > serverTime);
    const shouldPreferLocalDirtyState = syncMeta.dirty && localStateCanOverrideRemote && (
      hasFreshLocalDirtyState ||
      isInitialRemotePull ||
      (!isInitialRemotePull && !syncMeta.serverUpdatedAt)
    );
    if (!remoteState) {
      if (pendingGuestLocalLayoutCandidate && !localStateCanOverrideRemote) {
        const guestCandidate = consumeGuestLocalLayoutCandidate();
        replaceState(createBlankBikePackingState(), { preserveLocalUi: false });
        syncMeta.dirty = false;
        saveSyncMeta();
        initialRemoteLoadPending = false;
        appUnlocked = true;
        renderPreservingPackingScroll();
        updateSyncUi("Новый аккаунт · переношу гостевую укладку...");
        await offerSaveGuestLocalLayout(guestCandidate, { confirm: false });
        return;
      }
      if (canSeedEmptyRemoteFromLocal()) {
        if (isSuspiciousEmptyPackingState(state)) {
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
        await saveRemoteState({ notify: notifyDirtySave, preferServerOnConflict: !localStateCanOverrideRemote });
        return;
      }
      const guestCandidate = consumeGuestLocalLayoutCandidate();
      if (guestCandidate) {
        replaceState(createEmptyUserState());
        syncMeta.dirty = false;
        saveSyncMeta();
        initialRemoteLoadPending = false;
        appUnlocked = true;
        renderPreservingPackingScroll();
        updateSyncUi("На сервере пока пусто · можно сохранить гостевую укладку в аккаунт");
        await offerSaveGuestLocalLayout(guestCandidate, { confirm: false });
        return;
      }
      replaceState(createEmptyUserState());
      syncMeta.dirty = true;
      saveSyncMeta();
      initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      appUnlocked = true;
      updateSyncUi("На сервере пока пусто · отправляю локальные данные...");
      await saveRemoteState({ preferServerOnConflict: true });
      return;
    }

    const remoteStateMeaningful = isMeaningfulPackingState(remoteState);
    if (shouldImportGuestLayoutBeforeRemote({
      candidate: pendingGuestLocalLayoutCandidate,
      remoteStateMeaningful,
      localStateCanOverrideRemote
    })) {
      const guestCandidate = consumeGuestLocalLayoutCandidate();
      replaceState(createBlankBikePackingState(), { preserveLocalUi: false });
      syncMeta.dirty = false;
      saveSyncMeta();
      initialRemoteLoadPending = false;
      appUnlocked = true;
      renderPreservingPackingScroll();
      updateSyncUi("Новый аккаунт · переношу гостевую укладку...");
      await offerSaveGuestLocalLayout(guestCandidate, { confirm: false });
      return;
    }

    const localJson = JSON.stringify(serializeState({ forSync: true }));
    const remoteJson = JSON.stringify(cloneStateForSync(remoteState, { forSync: true }));
    if (localJson !== remoteJson) {
      if (isSuspiciousEmptyPackingState(state) && isMeaningfulPackingState(remoteState)) {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
        if (notifyDirtySave) showToast("Загружена восстановленная версия с сервера.", "success");
        return;
      }
      if ((isInitialRemotePull || localStateIsNonAuthoritative) && !localStateCanOverrideRemote && isMeaningfulPackingState(remoteState)) {
        const guestCandidate = consumeGuestLocalLayoutCandidate();
        if (applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && guestCandidate) {
          await offerSaveGuestLocalLayout(guestCandidate);
        }
        return;
      }
      if (!syncMeta.dirty) {
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
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    appUnlocked = true;
    if (initialRemoteLoadPending) {
      initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
    }
    setPersonalLayoutsLoadedStatus();
    updateSyncUi();
  } catch (error) {
    if (isTemporaryServerStorageError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Синхронизация временно недоступна, показана локальная укладка");
      updateSyncUi("Серверная синхронизация временно недоступна · локальная укладка доступна");
      return;
    }
    if (isTimeoutError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Сервер долго отвечает, показана локальная укладка");
      updateSyncUi("Сервер долго отвечает · локальная укладка доступна");
      return;
    }
    if (isNetworkError(error)) {
      appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Офлайн: показана локальная укладка");
      updateSyncUi("Офлайн · локальная укладка доступна");
      return;
    }
    appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", `Не удалось загрузить личные укладки: ${error.message}`);
    updateSyncUi(`Сервер недоступен: ${error.message}`);
  }
}

function startRemoteStateWatcher() {
  if (remoteRefreshTimer) window.clearInterval(remoteRefreshTimer);
  remoteRefreshTimer = window.setInterval(() => {
    if (isSharedListLinkRoute()) return;
    checkRemoteStateFreshness({ preferredLayout: preferredCurrentLayoutRef() });
  }, REMOTE_REFRESH_INTERVAL_MS);
}

async function checkRemoteStateFreshness({ notify = false, preferredLayout = null } = {}) {
  if (isForcedOffline()) return;
  if (isSharedListLinkRoute()) return;
  if (isPublicLayoutContext()) return;
  if (!currentUser || syncMeta.dirty || remoteRefreshInFlight) return;
  if (document.hidden) return;
  if ("onLine" in navigator && !navigator.onLine) return;
  const previousServerUpdatedAt = syncMeta.serverUpdatedAt;
  try {
    remoteRefreshInFlight = true;
    await loadRemoteState({ preferredLayout: preferredLayout || preferredCurrentLayoutRef() });
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

async function openAdminDemoLayout({ remember = true, language = uiLanguage } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  if (!canOpenAdminPublishedEdit()) {
    showToast("Демо может редактировать только админ.", "error");
    return;
  }
  const normalizedLanguage = normalizeUiLanguage(language);
  const layoutChoice = demoLayoutChoiceForLanguage(normalizedLanguage);
  const existing = Object.values(state.layouts || {}).find((layout) =>
    layout.adminDemo && normalizeUiLanguage(layout.adminDemoLanguage || DEFAULT_LANGUAGE) === normalizedLanguage
  );
  if (existing) {
    repairAdminDemoLayout(existing);
    if (!isLayoutMeaningful(existing.id)) {
      removeLayoutTree(existing.id);
      const demoState = await defaultDemoState(normalizedLanguage);
      importDemoStateAsEditableLayout(demoState, { language: normalizedLanguage });
      activateAdminPublishedLayout(state.activeLayoutId, { remember: false });
      if (remember) rememberActiveLayoutChoice(layoutChoice);
      updateSyncUi();
      showToast("Пустая локальная демо-укладка пересобрана.", "success");
      return;
    }
    activateAdminPublishedLayout(existing.id, { remember: false });
    if (remember) rememberActiveLayoutChoice(layoutChoice);
    showToast("Открыта локальная демо-укладка для правки.", "success");
    return;
  }
  try {
    updateSyncUi("Загружаю демо-укладку для правки...");
    const demoState = await defaultDemoState(normalizedLanguage);
    importDemoStateAsEditableLayout(demoState, { language: normalizedLanguage });
    activateAdminPublishedLayout(state.activeLayoutId, { remember: false });
    if (remember) rememberActiveLayoutChoice(layoutChoice);
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
    .filter((layout) => isDisposableManagedPublicDraft(layout) && layout.id !== exceptLayoutId);
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
  const activeDraftIsDisposable = isDisposableManagedPublicDraft(activePublicDraft);
  const readonlyLayoutId = activeDraftIsDisposable
    ? activePublicDraft?.adminSharedSourceId || (activePublicDraft?.adminDemo ? DEMO_SHARED_LAYOUT_ID : "")
    : "";
  const removed = removePublicLayoutDrafts();
  if (readonlyLayoutId) setActiveReadOnlyScope(readonlyLayoutId);
  return removed;
}

async function openDemoLayoutFromSelect({ remember = true, language = uiLanguage } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  if (canOpenAdminPublishedEdit()) {
    await openAdminDemoLayout({ remember, language });
    return;
  }
  const normalizedLanguage = normalizeUiLanguage(language);
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  if (remember) rememberActiveLayoutChoice(demoLayoutChoiceForLanguage(normalizedLanguage));
  switchView("packing");
  render();
  try {
    setDemoStatePayloadForLanguage(normalizedLanguage, await defaultDemoState(normalizedLanguage));
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
  if (getLayoutItemIdSetForState(targetState, layout).size > 0) return true;
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

function removeLayoutTree(layoutId, targetState = state, { save = true } = {}) {
  const removed = removeLayoutTreeFromState(targetState, layoutId);
  if (removed && save && targetState === state) saveState({ sync: false });
  return removed;
}

function repairActiveEmptyAdminDemoDraft() {
  const layout = state.layouts?.[state.activeLayoutId];
  if (!layout?.adminDemo || isLayoutMeaningful(layout.id)) return false;
  removeLayoutTree(layout.id);
  importDemoStateAsEditableLayout(createBlankBikePackingState());
  return true;
}

function importDemoStateAsEditableLayout(demoState, { language = uiLanguage, activate = true, renderAfter = true } = {}) {
  const source = normalizeDemoPayloadForLanguage(normalizePublishedStatePayload(demoState), language) || createBlankBikePackingState();
  const sourceLayout = source.layouts?.[source.activeLayoutId] || Object.values(source.layouts || {})[0];
  if (!sourceLayout) throw new Error("В демо нет укладки.");
  const normalizedLanguage = normalizeUiLanguage(language);
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
    name: normalizeDemoLayoutName(sourceLayout.name, normalizedLanguage),
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    adminDemo: true,
    adminDemoLanguage: normalizedLanguage,
    locations: normalizeDictionaryValues(source.locations, locations),
    categories: normalizeDictionaryValues(source.categories, categories),
    ...currentCreateMeta(changedAt)
  };
  saveState({ sync: false });
  if (activate) {
    state.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
    setActivePrivateScope();
    switchView("packing");
    if (renderAfter) render();
  }
  return state.layouts[layoutId];
}

function repairAdminDemoLayout(layout) {
  if (!layout?.adminDemo) return false;
  let changed = false;
  const normalizedName = normalizeDemoLayoutName(layout.name, layout.adminDemoLanguage || uiLanguage);
  if (layout.name !== normalizedName) {
    layout.name = normalizedName;
    changed = true;
  }
  const stamp = String(layout.id || "").match(/^layout-admin-demo-(\d+)/)?.[1] || "";
  const prefix = stamp ? `admin-demo-container-${stamp}-` : "admin-demo-container-";
  const arrangement = normalizeLayoutArrangement(layout, state);
  const arrangedChildIds = new Set();
  Object.values(arrangement.containers || {}).forEach((placement) => {
    (placement?.childIds || []).forEach((childId) => arrangedChildIds.add(childId));
  });
  const arrangedRootIds = uniqueLayoutIds([
    ...(arrangement.rootContainerIds || []),
    ...(layout.rootContainerIds || [])
  ]).filter((containerId) => state.containers?.[containerId]);
  const prefixedRootIds = Object.values(state.containers || {})
    .filter((container) =>
      String(container.id || "").startsWith(prefix) &&
      !arrangedChildIds.has(container.id) &&
      (!arrangement.containers?.[container.id] || !arrangement.containers[container.id].parentId)
    )
    .map((container) => container.id);
  const rootContainerIds = uniqueLayoutIds([...arrangedRootIds, ...prefixedRootIds]);
  if (!rootContainerIds.length) return changed;
  const itemPrefix = stamp ? `admin-demo-item-${stamp}-` : "admin-demo-item-";
  Object.values(state.items || {})
    .filter((item) => String(item.id || "").startsWith(itemPrefix))
    .forEach((item) => {
      const arrangedContainerId = arrangement.items?.[item.id] || "";
      if (arrangedContainerId && state.containers[arrangedContainerId]) {
        item.containerId = arrangedContainerId;
        return;
      }
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
  arrangement.rootContainerIds = rootContainerIds;
  normalizeLayoutArrangement(layout, state);
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
    layout.adminDemoLanguage = layout.adminDemoLanguage || uiLanguage;
    layout.name = normalizeDemoLayoutName(layout.name, layout.adminDemoLanguage);
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
  await checkAdminApiCompatibility({ force: true }).catch(() => null);
  const target = publishedLayoutTarget(layout, { defaultToDemo: true });
  if (!target) return;
  updateSyncUi(target.type === "demo" ? "Сохраняю демо-укладку..." : "Сохраняю shared-укладку...");
  const publicListId = publicListIdForPublishedTarget(target);
  const publishTitle = target.type === "demo"
    ? normalizeDemoLayoutName(layout.name || "", target.language || uiLanguage)
    : layout.name || "";
  const publishPayload = async (payload, extraBody = {}) => {
    const path = target.type === "demo"
      ? demoAdminStatePathForLanguage(target.language || uiLanguage)
      : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
    try {
      return await apiFetch(path, {
        method: "POST",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify({
          title: publishTitle,
          description: layout.note || "",
          visibility: "public",
          listVisibility: "public",
          ...extraBody,
          payload
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
  };
  let publishedPayload = null;
  let publishedByServerPhotoCopy = false;
  if (target.type === "shared" && layout.adminTemplateCopy) {
    try {
      publishedPayload = await withLayoutArrangementAppliedAsync(layoutId, async () => {
        updateSyncUi("Сохраняю shared-шаблон и копирую фото на сервере...");
        const localPayload = exportLayoutAsDemoState(layoutId);
        const result = await publishPayload(localPayload, { copyPhotoReferences: true });
        const serverPayload = result?.record?.payload || result?.payload || localPayload;
        if (applyPublishedPayloadPhotosToLayoutState(state, layoutId, serverPayload, {
          clone,
          getLayoutContainerIdSet: getLayoutContainerIdSetForState,
          getLayoutItemIdSet: getLayoutItemIdSetForState,
          publishedEntityId: cleanPublishedEntityId
        })) {
          persistStateSnapshot(state);
        }
        return serverPayload;
      });
      publishedByServerPhotoCopy = true;
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[bike-packing] Server-side shared photo copy failed; falling back to legacy publish flow.", error);
      }
    }
  }
  if (!publishedByServerPhotoCopy) {
    publishedPayload = await withLayoutArrangementAppliedAsync(layoutId, async () => {
      const existingPublishedLayout = target.type === "shared" ? findSharedLayout(target.sharedId) : null;
      const shouldPrimeTemplate = target.type === "shared" && shouldCreatePublishedTemplateBeforePhotos(layout, existingPublishedLayout);
      if (shouldPrimeTemplate) {
        updateSyncUi("Создаю shared-шаблон перед копированием фото...");
        await publishPayload(withoutPhotoReferences(exportLayoutAsDemoState(layoutId)));
      }
      const uploadablePhotos = getUploadablePhotoEntries({
        layoutId,
        listId: publicListId,
        allowRemoteOnlyReferences: false
      });
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
    if (target.type === "demo") {
      publishedPayload = normalizeDemoPayloadForLanguage(publishedPayload, target.language || uiLanguage) || publishedPayload;
      publishedPayload = withRuntimeSharedLayoutIndex(publishedPayload, sharedLayoutsByLanguage);
    }
    await publishPayload(publishedPayload);
  }
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = nowIso();
  saveSyncMeta();
  if (target.type === "demo") {
    setDemoStatePayloadForLanguage(target.language || uiLanguage, publishedPayload);
  } else {
    const sharedLayout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
      id: target.sharedId,
      name: layout.name || "",
      language: layout.language || uiLanguage,
      statePayload: publishedPayload,
      runtimeSharedTemplate: true
    }) || findSharedLayout(target.sharedId);
    if (sharedLayout) sharedLayout.statePayload = publishedPayload;
    await savePublicSharedLayoutIndexEntry(sharedLayout || {
      id: target.sharedId,
      name: layout.name || "",
      language: layout.language || uiLanguage,
      statePayload: publishedPayload
    });
    await refreshPublicSharedLayoutCatalog().catch(() => null);
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
    delete containers[nextContainerId].publicCatalogLayoutId;
    (container.itemIds || []).forEach((itemId) => {
      if (state.items?.[itemId]) {
        const nextItemId = mapItemId(itemId);
        items[nextItemId] = clone(state.items[itemId]);
        items[nextItemId].id = nextItemId;
        items[nextItemId].containerId = nextContainerId;
        stripPublishedPublicOriginMarkers(items[nextItemId]);
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
    stripPublishedPublicOriginMarkers(containers[nextContainerId]);
    return nextContainerId;
  };
  const rootContainerIds = (layout.rootContainerIds || []).map(walk).filter(Boolean);
  const dictionaryOwner = ensureLayoutDictionaries(layout);
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
  stripPublishedPublicOriginMarkers(demoLayout);
  const demoState = {
    locations: [...(dictionaryOwner?.locations || locations)],
    categories: [...(dictionaryOwner?.categories || categories)],
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
  if (!requirePublishedTemplatesAvailable()) return;
  const layoutId = currentSharedLayouts()[0]?.id;
  if (canOpenAdminPublishedEdit()) {
    openSharedLayoutForAdmin(layoutId);
    return;
  }
  openSharedLayoutViewer(layoutId);
}

async function openSharedLayoutViewer(layoutId, { remember = true } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
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
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  const layout = findSharedLayout(layoutId);
  if (!layout || !canOpenAdminPublishedEdit()) return;
  updateSyncUi(`Shared укладка · загружаю для правки ${layout.name || ""}`);
  try {
    await loadSharedLayoutPayload(layoutId);
  } catch {
    // Built-in shared templates remain editable if the public endpoint is unavailable.
  }
  const editableLayout = materializeSharedLayoutForAdmin(layoutId);
  if (!editableLayout) return;
  activateAdminPublishedLayout(editableLayout.id, { remember: false });
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  updateSyncUi(`Shared укладка · админ-редактирование ${layout.name || ""}`);
}

async function loadSharedLayoutPayload(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return false;
  if (layout.linkedSharedList) {
    const fallback = Boolean(sharedLayoutStatePayload(layout));
    if (!layout.listId) return fallback;
    try {
      const record = await fetchSharedListLinkRecord(layout.listId);
      const payload = activateSharedPayloadLayout(record.payload, layout.requestedLayoutId);
      assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record.payload);
      if (!payload) return fallback;
      layout.statePayload = payload;
      layout.listRecord = record;
      layout.name = sharedPayloadActiveLayout(payload)?.name || record.title || layout.name;
      return true;
    } catch {
      return fallback;
    }
  }
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

function uniquePublishedRecordId(records, preferredId) {
  if (!records?.[preferredId]) return preferredId;
  let index = 2;
  while (records[`${preferredId}-${index}`]) index += 1;
  return `${preferredId}-${index}`;
}

function sharedRootToPublishedContainer(root, id, changedAt) {
  const fallbackLocation = locations[0] || "";
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
    location: fallbackLocation,
    note: root.description || "",
    photos: [],
    sharedSourceId: root.id,
    ...currentCreateMeta(changedAt)
  };
}

function sharedItemToPublishedItem(item, id, containerId, changedAt) {
  const fallbackLocation = locations[0] || "";
  return {
    id,
    name: item.name,
    weight: Number(item.weightGrams || 0),
    quantity: 1,
    location: fallbackLocation,
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

function isReadonlyTemplateView() {
  return Boolean(isSharedLayoutView() && !canOpenAdminPublishedEdit());
}

function canRenderAddButtonInCurrentTemplate() {
  return shouldShowTemplateAddButton(isReadonlyTemplateView());
}

function readonlyTemplateMessage() {
  return activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID
    ? "Это демо-шаблон. Чтобы добавлять, редактировать и удалять, создайте свою укладку на основе шаблона."
    : "Это shared-шаблон. Чтобы добавлять, редактировать и удалять, создайте свою укладку на основе шаблона.";
}

async function confirmCreateLayoutFromReadonlyTemplate() {
  const layout = currentSharedLayout();
  const confirmed = await askConfirmDialog({
    title: "Это шаблон",
    text: readonlyTemplateMessage(),
    highlightText: layout?.name ? `Будет создана отдельная укладка «${layout.name}». Исходный шаблон не изменится.` : "",
    okText: "Создать укладку"
  });
  if (confirmed) copySharedLayout(activeReadOnlyLayoutId());
}

function handleReadonlyTemplateAction(event) {
  event?.preventDefault();
  event?.stopPropagation();
  confirmCreateLayoutFromReadonlyTemplate();
}

function markReadonlyTemplateActionButtons(root = document) {
  root.querySelectorAll("[data-add-to-container], [data-delete-root], [data-remove-from-layout], [data-delete-item]").forEach((button) => {
    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
  });
  root.querySelectorAll("[data-edit-item], [data-copy-layout-item], [data-copy-item], [data-edit-root], [data-edit-container], [data-copy-root]").forEach((button) => {
    button.classList.remove("template-action-disabled");
    button.removeAttribute("aria-disabled");
    button.title = TEMPLATE_COPY_TITLE;
    button.setAttribute("aria-label", TEMPLATE_COPY_TITLE);
    button.innerHTML = TEMPLATE_COPY_ICON_HTML;
  });
  return;
  const selector = [
    "[data-edit-item]",
    "[data-edit-root]",
    "[data-delete-root]",
    "[data-add-to-container]",
    "[data-edit-container]",
    "[data-remove-from-layout]",
    "[data-delete-item]"
  ].join(",");
  root.querySelectorAll(selector).forEach((button) => {
    button.classList.add("template-action-disabled");
    button.setAttribute("aria-disabled", "true");
    button.title = "Это шаблон. Создайте свою укладку на основе шаблона.";
  });
}

function bindSharedVirtualEvents(root = document) {
  const demoSource = activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  const readonlyTemplate = isReadonlyTemplateView();
  if (!canOpenAdminPublishedEdit() && !readonlyTemplate) addSharedReadOnlyCopyButtons(root);
  bindSharedLayoutEvents(root);
  root.querySelectorAll("[data-copy-layout-item], [data-copy-item], [data-edit-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const virtualId = button.dataset.copyLayoutItem || button.dataset.copyItem || button.dataset.editItem;
      const sourceId = originalSharedId(virtualId, "shared-virtual-item-");
      if (!sourceId) return;
      if (readonlyTemplate) {
        openSharedItemCopyPicker(sourceId);
        return;
      }
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
      if (readonlyTemplate) {
        openSharedContainerCopyPicker(sourceId);
        return;
      }
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
      if (readonlyTemplate) {
        confirmCreateLayoutFromReadonlyTemplate();
        return;
      }
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
    if (readonlyTemplate) markReadonlyTemplateActionButtons(root);
    root.querySelectorAll("[data-edit-item]").forEach((button) => {
      if (readonlyTemplate) {
        button.setAttribute("aria-label", "Создать укладку на основе шаблона");
      } else {
        button.title = "Открыть и скопировать";
        button.setAttribute("aria-label", "Открыть и скопировать");
      }
    });
    if (!readonlyTemplate) {
      root.querySelectorAll("[data-edit-root], [data-edit-container], [data-add-to-container], [data-remove-from-layout], [data-delete-item], [data-delete-root]").forEach((button) => {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
      });
    }
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
  if (!shouldShowItemPhotos()) return "";
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
  if (isDeletedSharedLayoutId(layoutId)) return null;
  if (linkedSharedListLayout?.id === layoutId) return linkedSharedListLayout;
  return allSharedLayoutsByAdminOrder().find((layout) => layout.id === layoutId) || null;
}

function publicSharedLayouts() {
  return [
    demoSharedLayout,
    ...(linkedSharedListLayout && !isDeletedSharedLayoutId(linkedSharedListLayout.id) ? [linkedSharedListLayout] : []),
    ...allSharedLayoutsByAdminOrder()
  ];
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

function ensureSharedCopyTargetLayoutId() {
  const existing = chooseSharedCopyTargetLayoutId() || selectedSharedTargetLayoutId();
  if (existing) return existing;
  const changedAt = nowIso();
  const layoutId = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const arrangement = createEmptyLayoutArrangement();
  const activeLayoutDictionaries = ensurePrivateDictionaries(state);
  state.layouts[layoutId] = {
    id: layoutId,
    name: uniqueLayoutName("Новая укладка"),
    rootContainerIds: [],
    arrangement,
    locations: [...(activeLayoutDictionaries?.locations || locations)],
    categories: [...(activeLayoutDictionaries?.categories || categories)],
    ...(!canUsePrivateState() ? { [GUEST_DEMO_COPY_FLAG]: true } : {}),
    ...currentCreateMeta(changedAt)
  };
  state.activeLayoutId = layoutId;
  rememberActiveLayoutChoice(layoutId);
  return layoutId;
}

async function copySharedRoot(rootId) {
  const published = findSharedPublishedContainer(rootId);
  if (published) {
    await ensurePrivateStateForSharedCopy();
    const targetLayoutId = ensureSharedCopyTargetLayoutId();
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
  await ensurePrivateStateForSharedCopy();
  const targetLayoutId = ensureSharedCopyTargetLayoutId();
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
    await ensurePrivateStateForSharedCopy();
    const targetLayoutId = ensureSharedCopyTargetLayoutId();
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
  await ensurePrivateStateForSharedCopy();
  const targetLayoutId = ensureSharedCopyTargetLayoutId();
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

async function copySharedItemToLayoutContainer(itemId, targetContainerId, targetLayoutId) {
  if (!itemId || !targetContainerId || !targetLayoutId || !state.layouts?.[targetLayoutId]) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) await ensurePrivateStateForSharedCopy();
  if (!state.layouts?.[targetLayoutId]) return;
  const published = findSharedPublishedItem(itemId);
  const match = published ? null : findSharedItem(itemId);
  const sourceName = published?.item?.name || match?.item?.name || "";
  const sourceSnapshot = published
    ? { rootId: "", containers: {}, items: { [itemId]: published.item } }
    : { rootId: "", containers: {}, items: { [itemId]: match?.item } };
  if (!sourceName || !(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, sourceName))) return;
  const changedAt = nowIso();
  const copiedItemId = published
    ? copyPublishedItemToState(published.sourceState, itemId, { containerId: "", changedAt, preserveSource: targetIsPublic })
    : copySharedItemToState(match.item, { containerId: "", changedAt, preserveSource: targetIsPublic });
  if (!copiedItemId) return;
  if (targetIsPublic) markCopiedItemForPublicLayout(state, copiedItemId, targetLayoutId, { changedAt, touch: markEdited });
  if (!placeExistingItemInLayout(copiedItemId, targetContainerId, targetLayoutId, { changedAt })) {
    delete state.items[copiedItemId];
    return;
  }
  markRecentlyAddedItem(copiedItemId, targetLayoutId);
  saveLayoutMutation(targetLayoutId);
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  render();
  renderSharedLayouts();
  requestAnimationFrame(() => focusRecentlyAddedItem(copiedItemId));
  showToast(`"${sourceName}" \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u0443\u044e \u0441\u0443\u043c\u043a\u0443.`, "success");
}

async function copySharedRootToLayoutContainer(rootId, targetParentId, targetLayoutId) {
  if (!rootId || !targetLayoutId || !state.layouts?.[targetLayoutId]) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) await ensurePrivateStateForSharedCopy();
  if (!state.layouts?.[targetLayoutId]) return;
  const published = findSharedPublishedContainer(rootId);
  const root = published ? null : findSharedRoot(rootId);
  const sourceName = published?.container?.name || root?.name || "";
  const sourceSnapshot = published
    ? snapshotContainerTree(rootId, { targetState: published.sourceState })
    : root ? legacySharedRootSnapshot(root) : null;
  if (!sourceName || !(await confirmContainerTreeCopyToLayout(targetLayoutId, sourceSnapshot, sourceName, { publicSource: true }))) return;
  await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
    sourceContainerId: rootId,
    publicSource: true
  });
}

function copyPublishedContainerToState(sourceState, containerId, { targetLayoutId = "", parentId = null, changedAt = nowIso(), idMap = null, preserveSource = false, sourceLayoutId = "", sourceSnapshot: providedSnapshot = null } = {}) {
  const sourceSnapshot = providedSnapshot || snapshotContainerTree(containerId, { sourceLayoutId, targetState: sourceState });
  if (!sourceSnapshot) return "";
  const publicSourceLayoutId = sourceLayoutId || sourceState?.activeLayoutId || Object.values(sourceState?.layouts || {})[0]?.id || "";
  const containerMap = idMap?.containers || new Map();
  const itemMap = idMap?.items || new Map();
  const makeContainerId = (sourceId) => preserveSource
    ? `container-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const makeItemId = (sourceId) => preserveSource
    ? `item-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceIdForPublicCopy = (record, kind, fallbackId) =>
    publicCopySourceIdFromRecord(record, kind, fallbackId) || fallbackId;

  const copyItem = (sourceItemId, nextContainerId) => {
    const sourceItem = sourceSnapshot.items[sourceItemId] || sourceState.items?.[sourceItemId];
    if (!sourceItem) return "";
    if (itemMap.has(sourceItemId)) return itemMap.get(sourceItemId);
    const publicSourceId = sourceIdForPublicCopy(sourceItem, "item", sourceItemId);
    const nextId = makeItemId(publicSourceId);
    itemMap.set(sourceItemId, nextId);
    if (idMap?.items) idMap.items.set(sourceItemId, nextId);
    state.items[nextId] = {
      ...cloneIsolatedPublicEntity(sourceItem),
      id: nextId,
      containerId: nextContainerId,
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(
      state.items[nextId],
      "item",
      publicSourceId,
      sourceItem._publicCopySourceLayoutId || publicSourceLayoutId
    );
    if (preserveSource) state.items[nextId].sharedSourceId = publicSourceId;
    else stripPublicOriginForPrivateCopy(state.items[nextId]);
    return nextId;
  };

  const copyContainer = (sourceContainerId, nextParentId = null) => {
    const sourceContainer = sourceSnapshot.containers[sourceContainerId] || sourceState.containers?.[sourceContainerId];
    if (!sourceContainer) return "";
    if (containerMap.has(sourceContainerId)) return containerMap.get(sourceContainerId);
    const publicSourceId = sourceIdForPublicCopy(sourceContainer, "container", sourceContainerId);
    const nextId = makeContainerId(publicSourceId);
    containerMap.set(sourceContainerId, nextId);
    if (idMap?.containers) idMap.containers.set(sourceContainerId, nextId);
    state.containers[nextId] = {
      ...cloneIsolatedPublicEntity(sourceContainer),
      id: nextId,
      parentId: nextParentId,
      childIds: [],
      itemIds: [],
      order: [],
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(
      state.containers[nextId],
      "container",
      publicSourceId,
      sourceContainer._publicCopySourceLayoutId || publicSourceLayoutId
    );
    if (preserveSource) state.containers[nextId].sharedSourceId = publicSourceId;
    else stripPublicOriginForPrivateCopy(state.containers[nextId]);
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

function copyPublishedItemToState(sourceState, itemId, { containerId = "", changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const source = sourceState.items?.[itemId];
  if (!source) return "";
  const sourceLayoutId = sourceState?.activeLayoutId || Object.values(sourceState?.layouts || {})[0]?.id || "";
  const publicSourceId = publicCopySourceIdFromRecord(source, "item", itemId) || itemId;
  const id = preserveSource
    ? `item-shared-${publicSourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  idMap?.items?.set(itemId, id);
  state.items[id] = {
    ...cloneIsolatedPublicEntity(source),
    id,
    containerId,
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.items[id], "item", publicSourceId, source._publicCopySourceLayoutId || sourceLayoutId);
  if (preserveSource) state.items[id].sharedSourceId = publicSourceId;
  else stripPublicOriginForPrivateCopy(state.items[id]);
  if (containerId && state.containers[containerId]) {
    const container = state.containers[containerId];
    container.itemIds.push(id);
    container.order.push({ type: "item", id });
    touchContainer(containerId, changedAt);
  }
  return id;
}

function publicCopyDuplicateSummaryForSnapshot(targetLayoutId, sourceSnapshot) {
  let result = { containerIds: [], itemIds: [] };
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout) return result;
  const targetContainerIds = [...getLayoutContainerIdSet(targetLayout)];
  const targetContainerSet = new Set(targetContainerIds);
  const targetItemIds = new Set(getLayoutItemIdSet(targetLayout));
  Object.entries(state.items || {}).forEach(([itemId, item]) => {
    if (!item) return;
    if (item.publicCatalogLayoutId === targetLayoutId) {
      targetItemIds.add(itemId);
      return;
    }
    const arrangedContainerId = targetLayout.arrangement?.items?.[itemId] || "";
    if (arrangedContainerId && targetContainerSet.has(arrangedContainerId)) {
      targetItemIds.add(itemId);
      return;
    }
    if (item.containerId && targetContainerSet.has(item.containerId)) {
      targetItemIds.add(itemId);
      return;
    }
    const container = item.containerId ? state.containers?.[item.containerId] : null;
    if (container?.publicCatalogLayoutId === targetLayoutId) targetItemIds.add(itemId);
  });
  result = summarizePublicCopyDuplicates({
    sourceSnapshot,
    targetContainerIds,
    targetItemIds: [...targetItemIds],
    containers: state.containers,
    items: state.items,
    itemCategories,
    itemQuantity,
    hasPrivateSyncBlockedPublicOrigin
  });
  return result;
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
    cancelText: "Не копировать",
    highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже найдены по исходным ID`,
    tone: "safe"
  });
  if (duplicate) return true;
  showToast("Копирование пропущено: такая demo/shared копия уже есть в целевой укладке.", "success");
  return false;
}

function demoCopyActionText() {
  return uiLanguage === "en" ? "Use as new layout" : "\u0412\u0437\u044f\u0442\u044c \u043a\u0430\u043a \u043d\u043e\u0432\u0443\u044e \u0443\u043a\u043b\u0430\u0434\u043a\u0443";
}

function demoCopyLayoutName(sourceName = "") {
  const fallback = uiLanguage === "en" ? "Demo copy" : "\u041c\u043e\u044f \u0434\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430";
  const baseName = normalizeDemoLayoutName(readableGuestDemoLayoutName(sourceName, fallback), uiLanguage);
  return uniqueLayoutName(baseName || fallback);
}

function copyPublishedDemoStateToLocalLayout(demoState, { activate = true, remember = true } = {}) {
  const source = normalizeDemoPayloadForLanguage(normalizePublishedStatePayload(demoState), uiLanguage) || createBlankBikePackingState();
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
    locations: normalizeDictionaryValues(source.locations, layoutDictionaryValues(sourceLayout, "location", source)),
    categories: normalizeDictionaryValues(source.categories, layoutDictionaryValues(sourceLayout, "category", source)),
    ...currentCreateMeta(changedAt)
  };
  if (!canUsePrivateState()) {
    state.itemDisplayMode = ITEM_DISPLAY_MODE_PUBLIC_DEFAULT;
    state.showItemMeta = true;
  }
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

function pruneUneditedGuestDemoCopies() {
  const plan = guestDemoCopyCleanupPlan({
    layouts: state.layouts,
    activeLayoutId: state.activeLayoutId,
    isGuestDemoCopy: isGuestDemoCopyLayoutRecord,
    hasUserEdits: (layout) => guestLayoutHasUserContentEdits(state, layout)
  });
  if (!plan.removeLayoutIds.length) return false;
  plan.removeLayoutIds.forEach((layoutId) => removeLayoutTree(layoutId, state, { save: false }));
  if (!state.layouts?.[state.activeLayoutId] && plan.keepLayoutId && state.layouts?.[plan.keepLayoutId]) {
    state.activeLayoutId = plan.keepLayoutId;
    applyLayoutArrangement(plan.keepLayoutId);
  }
  persistStateSnapshot(state);
  return true;
}

async function createLocalDemoCopy({ forceNew = false, remember = true } = {}) {
  if (!forceNew) pruneUneditedGuestDemoCopies();
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

function sharedLayoutPublicSourceId(layout, sourceLayout = null) {
  return String(sourceLayout?.id || layout?.requestedLayoutId || layout?.id || "").trim();
}

function findCopiedSharedLayout(layout, sourceLayout = null) {
  const sourceId = sharedLayoutPublicSourceId(layout, sourceLayout);
  if (!sourceId) return null;
  return Object.values(state.layouts || {}).find((entry) =>
    entry &&
    !entry.adminDemo &&
    !entry.adminSharedSourceId &&
    entry._publicCopySourceKind === "layout" &&
    String(entry._publicCopySourceId || "") === sourceId
  ) || null;
}

async function confirmRepeatedSharedLayoutCopy(existingLayout, sourceName = "") {
  if (!existingLayout) return true;
  const openExisting = await askConfirmDialog({
    title: "Укладка уже скопирована",
    text: `«${sourceName || existingLayout.name || "Укладка"}» уже есть в ваших укладках как «${existingLayout.name || "Укладка"}». Открыть существующую вместо создания ещё одной копии?`,
    okText: "Открыть существующую",
    cancelText: "Создать копию",
    tone: "safe"
  });
  if (!openExisting) return true;
  openPrivateLayout(existingLayout.id, { remember: true });
  if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
  switchView("packing");
  render();
  showToast("Открыта уже скопированная укладка.", "success");
  return false;
}

async function confirmContainerTreeCopyToLayout(targetLayoutId, sourceSnapshot, sourceName = "", { publicSource = false } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout || !sourceSnapshot) return false;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const publicSourceSnapshot = publicCopySnapshotFromSourceSnapshot(sourceSnapshot);
  const sourceIsPublicCopy = publicSource ||
    snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) ||
    snapshotHasLocalPublicCopyOrigin(sourceSnapshot);
  if ((targetIsPublic || sourceIsPublicCopy) && publicSourceSnapshot) {
    return confirmPublicCopyDuplicates(targetLayoutId, publicSourceSnapshot, sourceName);
  }
  if (targetIsPublic) return true;
  const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
  if (!duplicates.containerIds.length && !duplicates.itemIds.length) return true;
  const duplicate = await askConfirmDialog({
    title: "Такие элементы уже есть в укладке",
    text: `В укладке «${targetLayout.name || "Укладка"}» уже есть часть этой сумки/ветки. Создать отдельные копии вместо повторного добавления?`,
    okText: "Дублировать",
    cancelText: "Не копировать",
    highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже есть в целевой укладке`,
    tone: "safe"
  });
  if (duplicate) return true;
  refs.containerPickerDialog.close();
  showToast("Копирование пропущено: элементы уже есть в целевой укладке.", "success");
  return false;
}

async function copySharedLayout(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  if (layout.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit()) {
    createLocalDemoCopy({ forceNew: true }).catch((error) => {
      updateSyncUi(`Demo copy failed: ${error.message}`);
    });
    return;
  }
  await ensurePrivateStateForSharedCopy();
  const changedAt = nowIso();
  const sourceState = sharedLayoutStatePayload(layout);
  const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
  if (!(await confirmRepeatedSharedLayoutCopy(findCopiedSharedLayout(layout, sourceLayout), sourceLayout?.name || layout.name))) return;
  const rootIds = sourceState
    ? (sourceLayout?.rootContainerIds || []).map((id) => copyPublishedContainerToState(sourceState, id, { targetLayoutId: "", changedAt }))
    : sharedLayoutRoots(layout).map((root) => copySharedRootToState(root, { targetLayoutId: "", changedAt }));
  const nextLayoutId = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.layouts[nextLayoutId] = {
    id: nextLayoutId,
    name: uniqueLayoutName(sourceLayout?.name || layout.name),
    rootContainerIds: rootIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootIds),
    ...(!canUsePrivateState() ? { [GUEST_DEMO_COPY_FLAG]: true } : {}),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.layouts[nextLayoutId], "layout", sharedLayoutPublicSourceId(layout, sourceLayout), sourceState?.activeLayoutId || layout.id);
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
      language: layout.language || uiLanguage,
      locations: normalizeDictionaryValues(sourceState?.locations, locations),
      categories: normalizeDictionaryValues(sourceState?.categories, categories),
      ...currentCreateMeta(changedAt)
    };
    state.layouts[nextLayoutId] = editableLayout;
    saveState({ sync: false });
  } else {
    const repaired = repairEmptyTemplateCopyDraftFromPublishedLayout({
      state,
      sharedLayout: layout,
      editableLayout,
      fallbackLanguage: uiLanguage,
      canRepair: canOpenAdminPublishedEdit(),
      isLayoutMeaningful,
      sharedLayoutStatePayload,
      sharedPayloadActiveLayout,
      templateCopySourceScore,
      removeLayoutTree,
      copyPublishedContainerToState,
      createLayoutArrangementFromCurrentState,
      normalizeLayoutArrangement,
      ensureLayoutDictionaries,
      currentMeta: currentEditMeta(),
      nowIso
    });
    if (repaired) {
      saveState({ sync: false });
      return repaired;
    }
    const sourceLanguage = normalizeUiLanguage(layout.language || uiLanguage);
    let languageChanged = false;
    if (!editableLayout.adminTemplateCopy && editableLayout.language !== sourceLanguage) {
      editableLayout.language = sourceLanguage;
      languageChanged = true;
    }
    const syncedPublished = mergePublishedSharedStateIntoAdminLayout(layout, editableLayout);
    const syncedBuiltIn = sharedLayoutStatePayload(layout) ? false : mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout);
    if (syncedPublished || syncedBuiltIn || languageChanged) saveState({ sync: false });
  }
  return editableLayout;
}

async function materializeDemoLayoutForAdminCopy(language = uiLanguage) {
  if (!canOpenAdminPublishedEdit()) return null;
  const normalizedLanguage = normalizeUiLanguage(language);
  const existing = Object.values(state.layouts || {}).find((layout) =>
    layout?.adminDemo && normalizeUiLanguage(layout.adminDemoLanguage || DEFAULT_LANGUAGE) === normalizedLanguage
  );
  if (existing && isLayoutMeaningful(existing.id)) {
    repairAdminDemoLayout(existing);
    return existing;
  }
  if (existing) removeLayoutTree(existing.id);
  const demoState = await defaultDemoState(normalizedLanguage);
  return importDemoStateAsEditableLayout(demoState, {
    language: normalizedLanguage,
    activate: false,
    renderAfter: false
  });
}

async function ensureAdminPublicCopyTargetsAvailable() {
  if (!canOpenAdminPublishedEdit()) return;
  for (const language of SUPPORTED_LANGUAGES) {
    await materializeDemoLayoutForAdminCopy(language);
  }
  const sharedLayoutsToMaterialize = [
    ...(linkedSharedListLayout ? [linkedSharedListLayout] : []),
    ...allSharedLayoutsByAdminOrder()
  ];
  const seen = new Set();
  for (const layout of sharedLayoutsToMaterialize) {
    if (!layout?.id || seen.has(layout.id)) continue;
    seen.add(layout.id);
    try {
      await loadSharedLayoutPayload(layout.id);
    } catch {
      // Built-in shared templates remain available without the public endpoint.
    }
    materializeSharedLayoutForAdmin(layout.id);
  }
}

function mergePublishedSharedStateIntoAdminLayout(layout, editableLayout) {
  const sourceState = sharedLayoutStatePayload(layout);
  const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
  if (!sourceState || !sourceLayout || !editableLayout) return false;
  ensureLayoutDictionaries(editableLayout, sourceState);
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
    normalizeLayoutArrangement(editableLayout, state);
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
  ensureLayoutDictionaries(editableLayout);
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
      writeContainerTreeToLayoutArrangement(state, editableLayout.id, containerId);
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
      const copiedItemId = copySharedItemToState(item, { containerId, changedAt, preserveSource: true });
      if (copiedItemId) addItemToLayoutArrangement(editableLayout, copiedItemId, containerId);
      itemKeys.add(sourceKey);
      itemKeys.add(publishedSourceKey);
      itemKeys.add(nameKey);
      changed = true;
    });
  });

  if (changed) {
    normalizeLayoutArrangement(editableLayout, state);
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

function copySharedRootToState(root, { targetLayoutId = selectedSharedTargetLayoutId(), parentId = null, changedAt = nowIso(), idMap = null, preserveSource = false } = {}) {
  const id = preserveSource
    ? `container-shared-${root.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fallbackLocation = preserveSource ? (locations[0] || "") : defaultRootContainerLocation(state);
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
    location: fallbackLocation,
    note: root.description || "",
    photos: sharedGearPhotos(root, changedAt),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.containers[id], "container", root.id, "legacy-shared");
  if (preserveSource) state.containers[id].sharedSourceId = root.id;
  else {
    markRecordPhotosForCurrentListCopy(state.containers[id]);
    stripPublicOriginForPrivateCopy(state.containers[id]);
  }
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
  const fallbackLocation = preserveSource ? (locations[0] || "") : defaultRootContainerLocation(state);
  idMap?.items?.set(item.id, id);
  state.items[id] = {
    id,
    name: item.name,
    weight: Number(item.weightGrams || 0),
    quantity: 1,
    location: fallbackLocation,
    category: "Прочее",
    categories: ["Прочее"],
    containerId,
    note: item.description || "",
    photos: sharedGearPhotos(item, changedAt),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.items[id], "item", item.id, "legacy-shared");
  if (preserveSource) state.items[id].sharedSourceId = item.id;
  else {
    markRecordPhotosForCurrentListCopy(state.items[id]);
    stripPublicOriginForPrivateCopy(state.items[id]);
  }
  if (containerId && state.containers[containerId]) {
    const container = state.containers[containerId];
    container.itemIds.push(id);
    container.order.push({ type: "item", id });
    touchContainer(containerId, changedAt);
  }
  return id;
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
  return groupHistoryRecordsForSync(records, {
    source: activeHistorySource,
    normalizePublishedStatePayload,
    normalizeRemoteState,
    fallbackTitle: "Без названия"
  });
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
  return historyRecordStateForSync(record, source, {
    normalizePublishedStatePayload,
    normalizeRemoteState
  });
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
    requestAnimationFrame(() => restorePendingPackingScroll(getPackingScrollHost()));
  }
  syncFixedScrollbarVisibility();
}

function handlePackingTabTouchEnd(event) {
  const now = Date.now();
  if (now - lastPackingTouchToggleAt < 700) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (now - lastPackingTabTapTime <= 360) {
    event.preventDefault();
    event.stopPropagation();
    lastPackingTabTapTime = 0;
    lastPackingTouchToggleAt = now;
    switchView("packing");
    togglePackingViewMode();
    return;
  }
  lastPackingTabTapTime = now;
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
  hydrateItemPhotos(document).finally(() => bindPhotoGalleries(document));
}

function getCurrentView() {
  return document.querySelector(".tab.active")?.dataset.view || "packing";
}

function updateViewScopedControls(view = getCurrentView()) {
  const sharedView = isSharedLayoutView();
  const filtersVisible = view === "packing" || view === "items" || view === "bags";
  const categoryVisible = view === "packing" || view === "items";
  document.querySelectorAll("[data-main-filter-control]").forEach((element) => {
    const isCollectionActions = element === refs.collectionActions;
    const isCategoryFilter = element === refs.categoryFilterLabel;
    const visible = isCollectionActions
      ? !sharedView && view === "packing" && state.collectionMode
      : isCategoryFilter
        ? categoryVisible
        : filtersVisible;
    const keepSpace = isCollectionActions
      ? !sharedView && state.collectionMode
      : true;
    setScopedControlState(element, visible, keepSpace);
  });
  setScopedControlState(refs.metaToggleBtn, view === "packing" || view === "items" || view === "bags", true);
  updatePackingViewModeControl(view);
  updateLayoutCollapseAllToggle();
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
  const board = view === "packing" ? getPackingScrollHost() : null;
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
  const board = lock.view === "packing" ? getPackingScrollHost() : null;
  if (board) board.scrollLeft = lock.boardLeft;
  const rect = lock.element.getBoundingClientRect();
  window.scrollTo({
    left: lock.windowX,
    top: Math.max(0, window.scrollY + rect.top - lock.top),
    behavior: "auto"
  });
  syncFixedScrollbarVisibility();
}

function renderContainerWeightText(weight) {
  return shouldShowItemLabels() ? `<span class="container-weight">${formatWeight(weight)}</span>` : "";
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
  const board = getPackingScrollHost();
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

async function renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice = true } = {}) {
  if (!initialRemoteLoadPending || !currentUser || !hasLocalSavedState() || !isMeaningfulPackingState(state)) return false;
  setActivePrivateScope();
  if (restoreLayoutChoice) await restoreSavedLayoutChoice({ privateOnly: true });
  renderPreservingPackingScroll();
  const count = privateLayoutCount();
  setLayoutLoadStatus(
    "loading",
    count
      ? `Показана локальная копия: ${count} загружено · проверяю сервер`
      : "Показана локальная копия · проверяю сервер"
  );
  updateSyncUi("Показана локальная копия · проверяю сервер...");
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
    : publicLayoutChoiceForLayout(activeLayout) || state.activeLayoutId;
  const publicTemplatesBlocked = arePublishedTemplatesBlocked();
  let publicOptions = canOpenAdminPublishedEdit()
    ? adminPublicLayoutOptions({ disabled: publicTemplatesBlocked })
    : [
      [DEMO_LAYOUT_SELECT_VALUE, `${t("template.prefix")}: ${t("demo.layoutName")}`, "demo", publicTemplatesBlocked],
      ...(linkedSharedListLayout ? [[`shared:${linkedSharedListLayout.id}`, `${t("template.prefix")}: ${t("shared.prefix")}: ${linkedSharedListLayout.name}`, "shared", publicTemplatesBlocked]] : []),
      ...currentSharedLayouts().map((layout) => [`shared:${layout.id}`, `${t("template.prefix")}: ${t("shared.prefix")}: ${layout.name}`, "shared", publicTemplatesBlocked])
    ];
  const activeAdminLabel = activeAdminDraftOptionLabel(activeLayout);
  if (activeAdminLabel) {
    publicOptions = publicOptions.map((option) =>
      option[0] === selectedLayoutValue ? [option[0], activeAdminLabel, option[2]] : option
    );
  }
  const layoutOptions = [
    ...publicOptions,
    ...personalLayouts.map((layout) => [layout.id, layout.name, "personal"])
  ];
  fillSelect(refs.layoutSelect, layoutOptions, selectedLayoutValue);
  updateLayoutLoadStatusUi();
  refs.layoutSelect.classList.toggle("layout-select-demo", isDemoLayoutChoice(selectedLayoutValue));
  refs.layoutSelect.classList.toggle("layout-select-shared", String(selectedLayoutValue).startsWith("shared:") || Boolean(templateDraftLayoutId(selectedLayoutValue)));
  refs.newLayoutBtn.textContent = isSharedLayoutView()
    ? (activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
    : t("buttons.newLayout");
  if (refs.editLayoutBtn) {
    const canManageLayout = canManageActiveLayout();
    const hideManageLayout = isReadOnlyStateScope() || isSharedLayoutView() || !state.layouts?.[state.activeLayoutId];
    refs.editLayoutBtn.hidden = hideManageLayout;
    refs.editLayoutBtn.disabled = !canManageLayout;
    refs.editLayoutBtn.closest(".layout-actions")?.classList.toggle("layout-actions-single", hideManageLayout);
  }
  fillSelect(refs.layoutCopyFrom, personalLayouts.map((layout) => [layout.id, layout.name]), state.activeLayoutId);
  selectedCategoryFilters = selectedCategoryFilters.filter((category) => dictionaryOptionsForUi("category").includes(category));
  const locationOptions = dictionaryOptionsForUi("location");
  fillSelect(refs.locationFilter, [["", t("filters.allPlaces")], ...locationOptions.map((loc) => [loc, loc])], refs.locationFilter.value);
  updateCategoryFilterButton();
  fillSelect(refs.itemLocation, dictionaryOptionsForUi("location").map((loc) => [loc, loc]));
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
  updateLayoutCollapseAllToggle();
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
  toggleCollectionModeEnabled(state);
  saveState();
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

function toggleItemDisplayMode() {
  state.itemDisplayMode = nextItemDisplayModeValue(itemDisplayMode());
  ensureItemDisplayModeState(state);
  saveLocalUiState();
  render();
}

function toggleActiveLayoutNestedContainers() {
  const { count } = toggleActiveLayoutNestedContainersCollapsedForState(state);
  if (!count) return;
  capturePackingScroll();
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
  const mode = itemDisplayMode();
  const label = `Режим карточек: ${itemDisplayModeLabel(mode)}`;
  refs.metaToggleBtn.classList.toggle("active", mode !== ITEM_DISPLAY_MODE_DEFAULT);
  refs.metaToggleBtn.dataset.displayMode = mode;
  refs.metaToggleBtn.setAttribute("aria-label", label);
  refs.metaToggleBtn.setAttribute("aria-pressed", String(mode !== ITEM_DISPLAY_MODE_DEFAULT));
  refs.metaToggleBtn.title = label;
}

function updateLayoutCollapseAllToggle() {
  const button = refs.layoutCollapseAllBtn;
  if (!button) return;
  const isPackingView = getCurrentView() === "packing";
  const hasNested = activeLayoutNestedContainerIdsForState(state).length > 0;
  const available = isPackingView && hasNested;
  const allCollapsed = allActiveLayoutNestedContainersCollapsedForState(state);
  button.hidden = false;
  button.disabled = !available;
  button.tabIndex = available ? 0 : -1;
  button.setAttribute("aria-hidden", String(!available));
  button.classList.toggle("layout-collapse-all-button-placeholder", !available);
  button.classList.toggle("active", allCollapsed);
  button.setAttribute("aria-label", allCollapsed ? "Развернуть все вложенные списки" : "Свернуть все вложенные списки");
  button.title = allCollapsed ? "Развернуть все вложенные списки" : "Свернуть все вложенные списки";
  button.innerHTML = `
    <span class="stack-icon ${allCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
      <span class="stack-chevron stack-chevron-up"></span>
      <span class="stack-chevron stack-chevron-down"></span>
    </span>
  `;
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
  const categoriesToShow = dictionaryOptionsForUi("category", {
    selected: [...selectedSet]
  });
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
  addToContainerTargetLayoutId = resolveEditableLayoutIdForContainer(containerId);
  refs.addToContainerTitle.textContent = "Добавить";
  refs.addToContainerPath.textContent = containerPath(containerId);
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  refs.newSubcontainerName.value = "";
  renderAddToContainerResults();
  openModalDialog(refs.addToContainerDialog);
  requestAnimationFrame(() => refs.addToContainerSearch.focus({ preventScroll: true }));
}

function resolveEditableLayoutIdForContainer(containerId) {
  const candidateIds = uniqueLayoutIds([
    getPublishedEditLayoutId(),
    state.activeLayoutId
  ]);
  return candidateIds.find((layoutId) => {
    const layout = state.layouts?.[layoutId];
    return layout && getLayoutContainerIdSet(layout).has(containerId);
  }) || getPublishedEditLayoutId() || state.activeLayoutId;
}

function renderAddToContainerResults() {
  const containerId = addToContainerTargetId;
  const layout = state.layouts?.[addToContainerTargetLayoutId || state.activeLayoutId];
  if (!containerId || !layout || !state.containers[containerId]) {
    refs.addToContainerResults.innerHTML = "";
    return;
  }
  const query = refs.addToContainerSearch.value.trim().toLowerCase();
  refs.clearAddToContainerSearchBtn.hidden = !query;
  const items = getItemsForActiveCatalog()
    .filter((item) => !getItemContainerIdInLayout(layout, item.id))
    .filter((item) => matchesAddToContainerSearch(item, query))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .slice(0, 60);
  refs.addToContainerResults.innerHTML = items.map((item) => {
    const alreadyHere = getItemContainerIdInLayout(layout, item.id) === containerId;
    return `
      <button
        class="add-item-result ${alreadyHere ? "already-here" : ""}"
        type="button"
        data-add-existing-item="${item.id}"
        ${alreadyHere ? "disabled" : ""}
      >
        <strong>${highlightSearchText(item.name, query)}</strong>
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
      <strong>${highlightSearchText(container.name, query)}</strong>
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
  refs.rootContainerPlacementBtn.textContent = isPackage ? "Перелож." : "Перестав.";
  refs.rootContainerPlacementBtn.classList.remove("active");
  refs.rootContainerPlacementBtn.classList.add("repack-button");
  refs.rootContainerPlacementBtn.setAttribute("aria-label", isPackage
    ? `Переложить из ${currentText || "текущего места"}`
    : `Переставить: ${currentText}`);
}

function updateRootContainerRemoveFromLayoutButton() {
  if (!refs.rootContainerRemoveFromLayoutBtn) return;
  const canRemove = canRemoveContainerFromActiveLayout(editingRootContainerId);
  refs.rootContainerRemoveFromLayoutBtn.hidden = !canRemove;
  refs.rootContainerRemoveFromLayoutBtn.disabled = !canRemove;
}

function canRemoveContainerFromActiveLayout(containerId) {
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  return Boolean(
    containerId &&
    layout &&
    !isReadOnlyStateScope() &&
    !isSharedLayoutView() &&
    getLayoutContainerIdSet(layout).has(containerId)
  );
}

async function confirmRemoveEditingContainerFromActiveLayout(event) {
  event?.preventDefault();
  const containerId = editingRootContainerId;
  const container = state.containers?.[containerId];
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  if (!container || !layout || !canRemoveContainerFromActiveLayout(containerId)) return;
  const itemCount = getLayoutSubtreeItemCount(layout, containerId);
  const isRoot = getLayoutContainerRootStatus(layout, containerId);
  const confirmed = await askConfirmDialog({
    title: "Удалить из укладки?",
    text: `«${container.name}» будет убран из текущей укладки.`,
    highlightText: itemCount
      ? `${formatThingCount(itemCount)} из ${isRoot ? "этой сумки/места" : "этого пакета"} будут вынуты из укладки и станут вне укладки. Вложенные пакеты внутри будут удалены.`
      : isRoot
        ? "Эта сумка/место уже пустая, поэтому из текущей укладки уйдёт только пустая заготовка."
        : "Этот пакет уже пустой, поэтому из текущей укладки уйдёт только пустой пакет.",
    tone: itemCount ? "danger" : "safe",
    okText: "Удалить"
  });
  if (confirmed) removeContainerFromLayoutWithAnimation(containerId);
}

function removeContainerFromLayoutWithAnimation(containerId) {
  const element = findContainerElementInPacking(containerId);
  refs.rootContainerDialog?.close("cancel");
  if (!element) {
    removeRootContainerFromActiveLayout(containerId);
    return;
  }
  element.classList.add("removing-from-layout");
  window.setTimeout(() => removeRootContainerFromActiveLayout(containerId), 260);
}

function findContainerElementInPacking(containerId) {
  const escapedId = cssEscape(containerId);
  return refs.packingView?.querySelector(`[data-subcontainer-id="${escapedId}"]`) ||
    refs.packingView?.querySelector(`[data-root-container-id="${escapedId}"]`);
}

function getLayoutContainerRootStatus(layout, containerId) {
  const arrangement = normalizeLayoutArrangement(layout, state);
  return (arrangement.rootContainerIds || []).includes(containerId);
}

function getLayoutSubtreeItemCount(layout, containerId) {
  const arrangement = normalizeLayoutArrangement(layout, state);
  const visited = new Set();
  const count = (id) => {
    if (!id || visited.has(id)) return 0;
    visited.add(id);
    const placement = arrangement.containers?.[id];
    if (!placement) return 0;
    const own = (placement.itemIds || []).filter((itemId) => state.items?.[itemId]).length;
    return own + (placement.childIds || []).reduce((sum, childId) => sum + count(childId), 0);
  };
  return count(containerId);
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
  updateRootContainerRemoveFromLayoutButton();
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
  saveLayoutMutation(layoutId, { publishDelay: 500 });
  if (closeDialog && refs.layoutRootDialog.open) refs.layoutRootDialog.close();
  if (renderAfter) render();
}

function addExistingItemToContainer(itemId) {
  const containerId = addToContainerTargetId;
  const layoutId = addToContainerTargetLayoutId || state.activeLayoutId;
  const changedAt = nowIso();
  if (!placeExistingItemInLayout(itemId, containerId, layoutId, { changedAt })) {
    showToast("Не удалось добавить вещь в эту укладку.", "error");
    return;
  }
  state.collapsedContainers[containerId] = false;
  saveLocalUiState();
  markRecentlyAddedItem(itemId, layoutId);
  saveLayoutMutation(layoutId);
  refs.addToContainerDialog.close();
  render();
  requestAnimationFrame(() => focusRecentlyAddedItem(itemId));
}

function markRecentlyAddedItem(itemId, layoutId = state.activeLayoutId) {
  recentlyAddedItemId = itemId || null;
  recentlyAddedContainerId = "";
  recentlyAddedLayoutId = layoutId || "";
}

function markRecentlyAddedContainer(containerId, layoutId = state.activeLayoutId) {
  recentlyAddedContainerId = containerId || "";
  recentlyAddedItemId = null;
  recentlyAddedLayoutId = layoutId || "";
}

function createSubcontainerFromAddDialog(event) {
  event.preventDefault();
  const parentId = addToContainerTargetId;
  const layoutId = addToContainerTargetLayoutId || state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  const parent = state.containers[parentId];
  const parentPlacement = ensureLayoutContainerPlacement(layout, parentId);
  const name = refs.newSubcontainerName.value.trim();
  if (!parent || !layout || !parentPlacement || !name) return;
  if (!requireUsageCapacity("containers")) return;
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
  layout.arrangement.containers[id] = {
    parentId,
    itemIds: [],
    childIds: [],
    order: []
  };
  parentPlacement.childIds = parentPlacement.childIds || [];
  if (!parentPlacement.childIds.includes(id)) parentPlacement.childIds.push(id);
  parentPlacement.order = parentPlacement.order || [];
  parentPlacement.order.push({ type: "container", id });
  normalizeLayoutArrangement(layout, state);
  state.collapsedContainers[parentId] = false;
  state.collapsedContainers[id] = false;
  touchLayout(layoutId, changedAt);
  saveLocalUiState();
  if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
  saveLayoutMutation(layoutId);
  refs.addToContainerDialog.close();
  render();
  requestAnimationFrame(() => {
    refs.packingView.querySelector(`[data-subcontainer-id="${cssEscape(id)}"]`)
      ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  });
}

function focusRecentlyAddedItem(itemId) {
  if (recentlyAddedLayoutId && recentlyAddedLayoutId !== state.activeLayoutId) return;
  const card = refs.packingView.querySelector(`[data-item-id="${cssEscape(itemId)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => {
    if (recentlyAddedItemId === itemId) {
      recentlyAddedItemId = null;
      recentlyAddedLayoutId = "";
      card.classList.remove("just-added");
    }
  }, 1700);
}

function focusRecentlyAddedContainer(containerId) {
  if (recentlyAddedLayoutId && recentlyAddedLayoutId !== state.activeLayoutId) return;
  const card = refs.packingView.querySelector(`[data-root-container-id="${cssEscape(containerId)}"], [data-subcontainer-id="${cssEscape(containerId)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => {
    if (recentlyAddedContainerId === containerId) {
      recentlyAddedContainerId = "";
      recentlyAddedLayoutId = "";
      card.classList.remove("just-added");
    }
  }, 1700);
}

function fillSelect(select, entries, selected = "") {
  const current = selected || select.value;
  select.innerHTML = entries.map(([value, label, kind = "", disabled = false]) => {
    const className = kind ? ` class="select-option-${escapeHtml(kind)}"` : "";
    const disabledAttribute = disabled ? " disabled" : "";
    return `<option value="${escapeHtml(value)}"${className}${disabledAttribute}>${escapeHtml(label)}</option>`;
  }).join("");
  if (entries.some(([value]) => value === current)) select.value = current;
}

function renderItemCategoryPicker(selected = null, { fallbackDefault = true } = {}) {
  const selectedSet = new Set(selected || getDialogSelectedCategories());
  const categoryOptions = dictionaryOptionsForUi("category", { selected: [...selectedSet] });
  if (fallbackDefault && !selectedSet.size && categoryOptions[0]) selectedSet.add(categoryOptions[0]);
  refs.itemCategoryList.innerHTML = categoryOptions.map((category) => {
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
  return checked.length ? checked : [dictionaryOptionsForUi("category")[0] || "Прочее"];
}

function isContainerPickerCopyMode() {
  return isContainerPickerCopyModeValue(containerPickerMode);
}

function isContainerPickerItemCopyMode() {
  return isContainerPickerItemCopyModeValue(containerPickerMode);
}

function isContainerPickerContainerCopyMode() {
  return isContainerPickerContainerCopyModeValue(containerPickerMode);
}

function openItemContainerPickerDialog(event) {
  event?.preventDefault();
  containerPickerMode = "item";
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  containerPickerSourceLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openItemCopyContainerPickerDialog(event) {
  event?.preventDefault();
  if (!editingItemId || !state.items[editingItemId]) return;
  containerPickerMode = "item-copy";
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = getPublishedEditLayoutId();
  containerPickerSourceLayoutId = getPublishedEditLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function openContainerParentPickerDialog(event) {
  event?.preventDefault();
  if (!editingRootContainerId || !state.containers[editingRootContainerId]?.parentId) return;
  containerPickerMode = "container";
  containerPickerTargetContainerId = editingRootContainerId;
  containerPickerLayoutId = getPublishedEditLayoutId();
  containerPickerSourceLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openRootContainerCopyPickerDialog(event) {
  event?.preventDefault();
  if (!editingRootContainerId || !state.containers[editingRootContainerId]) return;
  containerPickerMode = "container-copy";
  containerPickerTargetContainerId = editingRootContainerId;
  containerPickerLayoutId = getPublishedEditLayoutId();
  containerPickerSourceLayoutId = getPublishedEditLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function firstPrivateLayoutId() {
  return Object.values(state.layouts || {}).find((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId)?.id || "";
}

async function openSharedItemCopyPicker(sourceId) {
  if (!sourceId) return;
  await ensurePrivateStateForSharedCopy();
  sharedPickerSourceItemId = sourceId;
  sharedPickerSourceContainerId = "";
  containerPickerMode = SHARED_ITEM_COPY_PICKER_MODE;
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = selectedSharedTargetLayoutId() || firstPrivateLayoutId() || ensureSharedCopyTargetLayoutId();
  containerPickerSourceLayoutId = "";
  await ensureAdminPublicCopyTargetsAvailable();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openSharedContainerCopyPicker(sourceId) {
  if (!sourceId) return;
  await ensurePrivateStateForSharedCopy();
  sharedPickerSourceItemId = "";
  sharedPickerSourceContainerId = sourceId;
  containerPickerMode = SHARED_CONTAINER_COPY_PICKER_MODE;
  containerPickerTargetContainerId = "";
  containerPickerLayoutId = selectedSharedTargetLayoutId() || firstPrivateLayoutId() || ensureSharedCopyTargetLayoutId();
  containerPickerSourceLayoutId = "";
  await ensureAdminPublicCopyTargetsAvailable();
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
  refs.containerPickerNoneBtn.hidden = containerPickerMode === "container" || isContainerPickerItemCopyMode();
  refs.containerPickerNoneBtn.classList.toggle("active", containerPickerMode === "item" && !refs.itemContainer.value);
  refs.containerPickerNoneBtn.textContent = isContainerPickerContainerCopyMode()
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
  const copyMode = isContainerPickerCopyMode();
  if (!copyMode) {
    return currentLayout ? [currentLayout] : [];
  }
  const allLayouts = Object.values(state.layouts || {});
  const personalLayouts = allLayouts.filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId);
  if (!canOpenAdminPublishedEdit()) return personalLayouts;
  const publicDrafts = orderAdminPublicDraftsLikeMainSelect(allLayouts.filter((layout) => isPublishedLayoutEditable(layout)));
  return [...publicDrafts, ...personalLayouts];
}

function renderContainerPickerLayoutSelect(layoutOptions) {
  if (!refs.containerPickerLayoutField || !refs.containerPickerLayoutSelect) return;
  const visible = isContainerPickerCopyMode() && layoutOptions.length > 1;
  refs.containerPickerLayoutField.hidden = !visible;
  if (!visible) return;
  fillSelect(
    refs.containerPickerLayoutSelect,
    layoutOptions.map((layout) => [layout.id, copyPickerLayoutLabel(layout)]),
    containerPickerLayoutId
  );
}

function updateContainerPickerTitle() {
  if (!refs.containerPickerTitle) return;
  if (containerPickerMode === SHARED_ITEM_COPY_PICKER_MODE) {
    refs.containerPickerTitle.textContent = "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0432\u0435\u0449\u044c \u0438\u0437 \u0448\u0430\u0431\u043b\u043e\u043d\u0430";
    return;
  }
  if (containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    refs.containerPickerTitle.textContent = "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0443\u043c\u043a\u0443 \u0438\u0437 \u0448\u0430\u0431\u043b\u043e\u043d\u0430";
    return;
  }
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
  return (containerPickerMode === "container" || isContainerPickerContainerCopyMode()) &&
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
  if (isContainerPickerCopyMode()) return "";
  return containerPickerMode === "container" ? getRootContainerDialogParentId() : refs.itemContainer.value;
}

function getContainerPickerSelectedIndex() {
  return containerPickerMode === "container" ? rootContainerDialogPendingParentIndex : null;
}

function isContainerPickerTargetAllowed(containerId) {
  if (containerPickerMode !== "container" && !isContainerPickerContainerCopyMode()) return true;
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
    await copyContainerTreeToLayout(editingRootContainerId, containerPickerLayoutId, containerId, {
      sourceLayoutId: containerPickerSourceLayoutId
    });
    return;
  }
  if (containerPickerMode === SHARED_ITEM_COPY_PICKER_MODE) {
    await copySharedItemToLayoutContainer(sharedPickerSourceItemId, containerId, containerPickerLayoutId);
    return;
  }
  if (containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    await copySharedRootToLayoutContainer(sharedPickerSourceContainerId, containerId, containerPickerLayoutId);
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

function closeSourceEditorAfterCopy(kind, sourceId) {
  if (kind === "item" && editingItemId === sourceId && refs.dialog?.open) {
    refs.dialog.close("copy");
  }
  if (kind === "container" && editingRootContainerId === sourceId && refs.rootContainerDialog?.open) {
    refs.rootContainerDialog.close("copy");
  }
}

async function hydrateAuthForSharedLink() {
  if (currentUser || isForcedOffline()) return;
  try {
    const authData = await apiFetch("/auth/me", { silentErrors: true });
    currentUser = authData.user || authData.me || authData.account || null;
    if (!currentUser && (authData.id || authData.email)) currentUser = { id: authData.id, email: authData.email };
    if (currentUser) {
      clearOfflineRememberedSession();
      setExplicitlySignedOut(false);
      activateLocalStorageScopeForCurrentUser();
      rememberAuthenticatedUser();
    }
  } catch {
    currentUser = null;
  }
}

async function copyItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const publicSourceSnapshot = publicCopySnapshotFromSourceSnapshot({ rootId: "", containers: {}, items: { [itemId]: source } });
  const sourceIsPublicCopy = hasPrivateSyncBlockedPublicOrigin(source, itemId) || Boolean(publicCopySourceIdFromRecord(source, "item", itemId));
  if ((targetIsPublic || sourceIsPublicCopy) && publicSourceSnapshot) {
    if (!(await confirmPublicCopyDuplicates(targetLayoutId, publicSourceSnapshot, source.name))) return;
  }
  if (!targetIsPublic && layoutContainsItem(targetLayoutId, itemId)) {
    const duplicate = await askConfirmDialog({
      title: "Вещь уже есть в этой укладке",
      text: `«${source.name || "Вещь"}» уже участвует в укладке «${targetLayout.name || "Укладка"}». Создать отдельную копию этой вещи?`,
      okText: "Дублировать",
      cancelText: "Не копировать",
      tone: "safe"
    });
    if (!duplicate) {
      refs.containerPickerDialog.close();
      showToast("Копирование пропущено: вещь уже есть в целевой укладке.", "success");
      return;
    }
    await duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId);
    return;
  }
  if (
    !targetIsPublic &&
    !hasPrivateSyncBlockedPublicOrigin(source, itemId) &&
    linkExistingItemToContainerInLayout(itemId, targetContainerId, targetLayoutId)
  ) return;
  await duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId);
}

function layoutContainsItem(layoutId, itemId) {
  return getLayoutItemIdSet(state.layouts?.[layoutId]).has(itemId);
}

function ensureWritableTargetLayoutContext(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || isAdminEditablePublishedLayout(layoutId)) return false;
  if (state.activeLayoutId !== layoutId || isPublicLayoutContext()) {
    switchActiveLayout(layoutId);
    return true;
  }
  if (canUsePrivateState()) setActivePrivateScope();
  else setActiveLocalEditableScope(layoutId);
  return true;
}

function openCopiedTargetLayout(layoutId) {
  if (!state.layouts?.[layoutId]) return false;
  if (isAdminEditablePublishedLayout(layoutId)) {
    activateAdminPublishedLayout(layoutId, { remember: true });
    return true;
  }
  ensureWritableTargetLayoutContext(layoutId);
  switchView("packing");
  return true;
}

function currentAppliedLayoutItemIds(layout = state.layouts[state.activeLayoutId]) {
  const arrangement = layout?.arrangement;
  if (arrangement && typeof arrangement === "object") {
    return new Set(Object.keys(arrangement.items || {}).filter((itemId) =>
      state.items?.[itemId] && state.containers?.[arrangement.items[itemId]]
    ));
  }
  const ids = new Set();
  getVisibleLayoutRootIds(layout).forEach((containerId) => {
    getContainerItemIdsDeep(containerId).forEach((itemId) => ids.add(itemId));
  });
  return ids;
}

function linkExistingItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!state.items[itemId] || !targetLayout) return false;
  ensureWritableTargetLayoutContext(targetLayoutId);
  const changedAt = nowIso();
  if (getLayoutItemIdSet(targetLayout).has(itemId)) return false;
  if (!placeExistingItemInLayout(itemId, targetContainerId, targetLayoutId, { changedAt })) return false;
  markRecentlyAddedItem(itemId, targetLayoutId);
  saveLayoutMutation(targetLayoutId);
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("item", itemId);
  render();
  requestAnimationFrame(() => focusRecentlyAddedItem(itemId));
  showToast("Вещь добавлена в выбранную укладку без создания дубля.", "success");
  return true;
}

async function duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  if (!requireUsageCapacity("items")) return;
  const sourceSnapshot = clone(source);
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  const sourceIsPublicCopy = hasPrivateSyncBlockedPublicOrigin(sourceSnapshot, itemId) ||
    Boolean(publicCopySourceIdFromRecord(sourceSnapshot, "item", itemId));
  const copyId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.items[copyId] = {
    ...cloneIsolatedPublicEntity(sourceSnapshot),
    id: copyId,
    name: sourceIsPublicCopy ? sourceSnapshot.name : makeItemCopyName(sourceSnapshot.name),
    containerId: "",
    photos: await copyRecordPhotosForLocalDuplicate(sourceSnapshot, { changedAt }),
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
  markPrivateCopyOriginFromSource(state.items[copyId], sourceSnapshot, "item", itemId);
  if (targetIsPublic) {
    state.items[copyId].publicCatalogLayoutId = targetLayoutId;
  } else {
    markRecordPhotosForCurrentListCopy(state.items[copyId]);
    stripPublicOriginForPrivateCopy(state.items[copyId]);
  }
  if (!placeExistingItemInLayout(copyId, targetContainerId, targetLayoutId, { changedAt })) {
    delete state.items[copyId];
    return;
  }
  markRecentlyAddedItem(copyId, targetLayoutId);
  saveLayoutMutation(targetLayoutId);
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("item", itemId);
  render();
  requestAnimationFrame(() => focusRecentlyAddedItem(copyId));
  showToast("Вещь скопирована в выбранную укладку.", "success");
}

function snapshotContainerTree(containerId, { sourceLayoutId = "", excludeLayoutId = "", targetState = state } = {}) {
  const arrangementSnapshot = snapshotContainerTreeFromLayoutArrangement(containerId, { sourceLayoutId, excludeLayoutId, targetState });
  const liveSnapshot = snapshotContainerTreeFromLiveState(containerId, targetState);
  if (sourceLayoutId && arrangementSnapshot) return arrangementSnapshot;
  if (!arrangementSnapshot) return liveSnapshot;
  if (!liveSnapshot) return arrangementSnapshot;
  return containerTreeSnapshotScore(liveSnapshot) > containerTreeSnapshotScore(arrangementSnapshot)
    ? liveSnapshot
    : arrangementSnapshot;
}

function containerTreeSnapshotScore(snapshot) {
  if (!snapshot) return 0;
  return Object.keys(snapshot.containers || {}).length + Object.keys(snapshot.items || {}).length * 2;
}

function snapshotContainerTreeFromLiveState(containerId, targetState = state) {
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

async function copyContainerTreeToLayout(containerId, targetLayoutId = state.activeLayoutId, targetParentId = "", { sourceLayoutId = "" } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  const sourceSnapshot = snapshotContainerTree(containerId, { sourceLayoutId, excludeLayoutId: targetLayoutId });
  if (!sourceSnapshot || !targetLayout) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!(await confirmContainerTreeCopyToLayout(targetLayoutId, sourceSnapshot, state.containers?.[containerId]?.name || ""))) return;
  if (!targetIsPublic) {
    const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
    if (duplicates.containerIds.length || duplicates.itemIds.length) {
      await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
        sourceContainerId: containerId
      });
      return;
    }
    if (!snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) && linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId, targetParentId)) return;
  }
  await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
    sourceContainerId: containerId
  });
}

function layoutDuplicateSummaryForContainerTree(layoutId, sourceSnapshot) {
  const targetLayout = state.layouts[layoutId];
  if (!targetLayout) return { containerIds: [], itemIds: [] };
  const targetContainerIds = getLayoutContainerIdSet(targetLayout);
  const targetItemIds = getLayoutItemIdSet(targetLayout);
  return summarizeLayoutIdDuplicates({
    sourceSnapshot,
    targetContainerIds: [...targetContainerIds],
    targetItemIds: [...targetItemIds]
  });
}

function linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "") {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return false;
  ensureWritableTargetLayoutContext(targetLayoutId);
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
    writeContainerTreeToLayoutArrangement(state, targetLayoutId, rootId);
    normalizeLayoutArrangement(targetLayout, state);
    touchLayout(targetLayoutId, changedAt);
    linked = true;
  });
  if (!linked) return false;
  markRecentlyAddedContainer(sourceSnapshot.rootId, targetLayoutId);
  saveLayoutMutation(targetLayoutId);
  openCopiedTargetLayout(targetLayoutId);
  if (refs.containerPickerDialog.open) refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("container", sourceSnapshot.rootId);
  render();
  requestAnimationFrame(() => focusRecentlyAddedContainer(sourceSnapshot.rootId));
  showToast("Сумка или пакет добавлены в выбранную укладку без создания дублей.", "success");
  return true;
}

async function duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "", {
  sourceContainerId = sourceSnapshot?.rootId || "",
  publicSource = false
} = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return "";
  if (!requireUsageCapacity("containers", Object.keys(sourceSnapshot.containers || {}).length)) return "";
  if (!requireUsageCapacity("items", Object.keys(sourceSnapshot.items || {}).length)) return "";
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  const sourceIsPublicCopy = publicSource ||
    snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) ||
    snapshotHasLocalPublicCopyOrigin(sourceSnapshot);
  const mapPublicOrigin = (record, sourceRecord, kind, sourceId) => {
    const publicSourceId = publicCopySourceIdFromRecord(sourceRecord, kind, sourceId) || sourceId;
    const marked = markPrivateCopyOriginFromSource(record, sourceRecord, kind, sourceId);
    if (!marked && publicSource) markLocalPublicCopyOrigin(record, kind, publicSourceId, sourceRecord?._publicCopySourceLayoutId || "");
    if (targetIsPublic && publicSource && !record.sharedSourceId) record.sharedSourceId = publicSourceId;
  };
  const mapRecordToTarget = (record) => {
    if (!record) return;
    if (targetIsPublic) {
      record.publicCatalogLayoutId = targetLayoutId;
    } else {
      markRecordPhotosForCurrentListCopy(record);
      stripPublicOriginForPrivateCopy(record);
    }
  };
  let nextRootId = "";
  const targetContainerSet = getLayoutContainerIdSet(targetLayout);
  if (targetParentId && (!state.containers[targetParentId] || !targetContainerSet.has(targetParentId))) return "";

  const copiedPlacements = {};
  const copiedItemContainers = {};
  const copyItemTree = async (itemId, parentId) => {
    const item = sourceSnapshot.items[itemId];
    if (!item) return "";
    const nextId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.items[nextId] = {
      ...cloneIsolatedPublicEntity(item),
      id: nextId,
      containerId: parentId,
      photos: await copyRecordPhotosForLocalDuplicate(item, { changedAt }),
      createdAt: changedAt,
      ...currentEditMeta(changedAt)
    };
    mapPublicOrigin(state.items[nextId], item, "item", itemId);
    mapRecordToTarget(state.items[nextId]);
    copiedItemContainers[nextId] = parentId;
    delete state.packedItems?.[nextId];
    return nextId;
  };
  const copyContainerTree = async (sourceId, parentId, isTop = false) => {
    const container = sourceSnapshot.containers[sourceId];
    if (!container) return "";
    const nextId = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.containers[nextId] = {
      ...cloneIsolatedPublicEntity(container),
      id: nextId,
      name: isTop && !sourceIsPublicCopy ? makeContainerCopyName(container.name) : container.name,
      parentId: parentId || null,
      childIds: [],
      itemIds: [],
      order: [],
      color: normalizeContainerColor(container.color),
      photos: await copyRecordPhotosForLocalDuplicate(container, { changedAt }),
      createdAt: changedAt,
      ...currentEditMeta(changedAt)
    };
    mapPublicOrigin(state.containers[nextId], container, "container", sourceId);
    mapRecordToTarget(state.containers[nextId]);
    state.collapsedContainers[nextId] = false;
    const copiedItems = new Map();
    const copiedContainers = new Map();
    const copyChildContainer = async (childId) => {
      const id = await copyContainerTree(childId, nextId);
      if (id) copiedContainers.set(childId, id);
      return id;
    };
    const copyChildItem = async (childItemId) => {
      const id = await copyItemTree(childItemId, nextId);
      if (id) copiedItems.set(childItemId, id);
      return id;
    };
    state.containers[nextId].childIds = (await Promise.all((container.childIds || []).map(copyChildContainer))).filter(Boolean);
    state.containers[nextId].itemIds = (await Promise.all((container.itemIds || []).map(copyChildItem))).filter(Boolean);
    state.containers[nextId].order = (container.order || []).map((entry) => {
      if (entry?.type === "container") {
        const id = copiedContainers.get(entry.id);
        return id ? { type: "container", id } : null;
      }
      if (entry?.type === "item") {
        const id = copiedItems.get(entry.id);
        return id ? { type: "item", id } : null;
      }
      return null;
    }).filter(Boolean);
    if (!state.containers[nextId].order.length) {
      state.containers[nextId].order = [
        ...state.containers[nextId].itemIds.map((id) => ({ type: "item", id })),
        ...state.containers[nextId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    copiedPlacements[nextId] = {
      parentId: parentId || "",
      itemIds: [...state.containers[nextId].itemIds],
      childIds: [...state.containers[nextId].childIds],
      order: state.containers[nextId].order.map((entry) => ({ type: entry.type, id: entry.id }))
    };
    return nextId;
  };

  nextRootId = await copyContainerTree(sourceSnapshot.rootId, targetParentId || null, true);
  if (!nextRootId) return "";

  targetLayout.arrangement = targetLayout.arrangement && typeof targetLayout.arrangement === "object"
    ? targetLayout.arrangement
    : createEmptyLayoutArrangement();
  const arrangement = targetLayout.arrangement;
  arrangement.rootContainerIds = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  Object.assign(arrangement.containers, copiedPlacements);
  Object.assign(arrangement.items, copiedItemContainers);
  if (targetParentId) {
    const parent = state.containers[targetParentId];
    const parentPlacement = ensureLayoutContainerPlacement(targetLayout, targetParentId);
    if (!parent || !parentPlacement) return "";
    parent.childIds = Array.isArray(parent.childIds) ? parent.childIds.filter((id) => id !== nextRootId) : [];
    parent.order = Array.isArray(parent.order)
      ? parent.order.filter((entry) => !(entry?.type === "container" && entry.id === nextRootId))
      : [];
    parent.childIds.push(nextRootId);
    parent.order.push({ type: "container", id: nextRootId });
    parentPlacement.childIds = Array.isArray(parentPlacement.childIds) ? parentPlacement.childIds.filter((id) => id !== nextRootId) : [];
    parentPlacement.order = Array.isArray(parentPlacement.order)
      ? parentPlacement.order.filter((entry) => !(entry?.type === "container" && entry.id === nextRootId))
      : [];
    parentPlacement.childIds.push(nextRootId);
    parentPlacement.order.push({ type: "container", id: nextRootId });
    arrangement.rootContainerIds = arrangement.rootContainerIds.filter((id) => id !== nextRootId);
    copiedPlacements[nextRootId].parentId = targetParentId;
    state.collapsedContainers[targetParentId] = false;
    touchContainer(targetParentId, changedAt);
  } else {
    copiedPlacements[nextRootId].parentId = "";
    state.containers[nextRootId].parentId = null;
    arrangement.rootContainerIds = uniqueLayoutIds([
      ...(arrangement.rootContainerIds || []),
      ...(targetLayout.rootContainerIds || []),
      nextRootId
    ]);
  }
  targetLayout.rootContainerIds = [...arrangement.rootContainerIds];
  normalizeLayoutArrangement(targetLayout, state);
  touchLayout(targetLayoutId, changedAt);
  if (targetLayoutId === state.activeLayoutId) applyLayoutArrangement(targetLayoutId);
  markRecentlyAddedContainer(nextRootId, targetLayoutId);
  saveLayoutMutation(targetLayoutId);
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("container", sourceContainerId || sourceSnapshot.rootId);
  render();
  renderSharedLayouts();
  requestAnimationFrame(() => focusRecentlyAddedContainer(nextRootId));
  showToast("Сумка или пакет скопированы в выбранную укладку.", "success");
  return nextRootId;
}

async function duplicateContainerTreeToLayout(containerId, targetLayoutId = state.activeLayoutId, targetParentId = "", { sourceLayoutId = "" } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  const sourceSnapshot = snapshotContainerTree(containerId, { sourceLayoutId });
  if (!sourceSnapshot || !targetLayout) return;
  await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
    sourceContainerId: containerId
  });
}
function selectRootContainerParent(parentId, targetIndex = null) {
  const containerId = containerPickerTargetContainerId || editingRootContainerId;
  if (!containerId || !state.containers[containerId] || !state.containers[parentId]) return;
  if (!isContainerPickerTargetAllowed(parentId)) return;
  rootContainerDialogPendingParentId = parentId;
  rootContainerDialogPendingParentIndex = Number.isFinite(targetIndex) ? targetIndex : null;
  updateRootContainerPlacementButton();
  updateRootContainerRemoveFromLayoutButton();
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

function sharedVirtualCollapsedState(layout, containers, rootContainerIds = []) {
  if (layout?.id === DEMO_SHARED_LAYOUT_ID) return {};
  if (!layout?.linkedSharedList) return { ...sharedVirtualCollapsedContainers };
  return collapsedDefaultsForTemplateContainers(containers, sharedVirtualCollapsedContainers, rootContainerIds);
}

function publicVirtualLayoutMarkers(layout, virtualLayoutId) {
  return publicVirtualLayoutMarkersForSharedState(layout, virtualLayoutId, {
    demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID,
    uiLanguage
  });
}

function createSharedVirtualState(layout = currentSharedLayout()) {
  const publishedState = sharedLayoutStatePayload(layout);
  if (publishedState) return createSharedVirtualStateFromPublishedState(layout, publishedState);

  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || "shared");
  const containers = {};
  const items = {};
  const rootContainerIds = [];
  const changedAt = "1970-01-01T00:00:00.000Z";
  const publicMarkers = publicVirtualLayoutMarkers(layout, virtualLayoutId);
  const fallbackLocation = locations[0] || "";
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
      location: fallbackLocation,
      note: root.description || "",
      photos: sharedGearPhotos(root, changedAt),
      createdAt: changedAt,
      updatedAt: changedAt,
      sharedSourceId: root.id,
      ...publicMarkers
    };
    (root.items || []).forEach((item) => {
      const itemId = sharedVirtualItemId(item.id);
      items[itemId] = {
        id: itemId,
        name: item.name,
        weight: Number(item.weightGrams || 0),
        quantity: 1,
        location: fallbackLocation,
        category: "Прочее",
        categories: ["Прочее"],
        containerId,
        note: item.description || "",
        photos: sharedGearPhotos(item, changedAt),
        createdAt: changedAt,
        updatedAt: changedAt,
        sharedSourceId: item.id,
        ...publicMarkers
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
        updatedAt: changedAt,
        ...publicMarkers
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: sharedVirtualCollapsedState(layout, containers, rootContainerIds),
    packedItems: {},
    locations: [fallbackLocation],
    itemDisplayMode: "meta-photos",
    showItemMeta: true,
    categories: ["Прочее"]
  };
}

function createSharedVirtualStateFromPublishedState(layout, sourceState) {
  const sourceLayout = sourceState.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState.layouts || {})[0];
  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || sourceLayout?.id || "shared");
  const publicMarkers = publicVirtualLayoutMarkers(layout, virtualLayoutId);
  const displayMode = publicReadonlyItemDisplayMode(sourceState.itemDisplayMode);
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
      updatedAt: item.updatedAt || changedAt,
      ...publicMarkers
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
      updatedAt: container.updatedAt || changedAt,
      ...publicMarkers
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
        updatedAt: sourceLayout?.updatedAt || changedAt,
        ...publicMarkers
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: sharedVirtualCollapsedState(layout, containers, rootContainerIds),
    packedItems: {},
    locations: [...(sourceState.locations || [locations[0] || ""])],
    itemDisplayMode: displayMode,
    showItemMeta: shouldShowItemLabelsForMode(displayMode),
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
    itemDisplayMode: state.itemDisplayMode,
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
  state.itemDisplayMode = normalizeItemDisplayMode(virtualState.itemDisplayMode);
  ensureItemDisplayModeState(state);
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
    state.itemDisplayMode = previous.itemDisplayMode;
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
    if (isBike3dPackingView(packingViewMode)) {
      renderSharedPackingBike3d();
      return;
    }
    renderSharedPacking();
    return;
  }
  if (isBike3dPackingView(packingViewMode)) {
    renderCurrentPackingBike3d();
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

function renderCurrentPackingBike3d({ beforeHtml = "", shared = false } = {}) {
  const layout = state.layouts[state.activeLayoutId] || Object.values(state.layouts || {})[0] || { rootContainerIds: [] };
  const rootIds = getVisibleLayoutRootIds(layout).filter((id) => state.containers[id]);
  if (selectedBike3dContainerId && !rootIds.includes(selectedBike3dContainerId)) {
    selectedBike3dContainerId = "";
    adjustingBike3dContainerId = "";
  }
  renderBike3dPackingView({
    target: refs.packingView,
    beforeHtml,
    rootIds,
    containers: state.containers,
    selectedContainerId: selectedBike3dContainerId,
    adjustingContainerId: adjustingBike3dContainerId,
    transforms: bike3dTransforms,
    viewState: bike3dViewState,
    renderContainer,
    containerWeight,
    formatWeight,
    escapeHtml,
    onSelect: selectBike3dContainer,
    onClose: closeBike3dDetail,
    onToggleAdjust: toggleBike3dAdjusting,
    onAdjust: adjustBike3dTransform,
    onColor: setBike3dColor,
    onViewStateChange: setBike3dViewState,
    onResetView: resetBike3dViewState
  });
  if (shared) bindSharedVirtualEvents(refs.packingView);
  else bindPackingEvents(refs.packingView.querySelector(".bike3d-detail") || refs.packingView);
  const scrollHost = getPackingScrollHost();
  restorePendingPackingScroll(scrollHost);
  bindFixedScrollbar(scrollHost);
  syncFixedScrollbarVisibility();
}

function renderSharedPackingBike3d() {
  withSharedVirtualState(() => {
    renderCurrentPackingBike3d({
      beforeHtml: renderSharedModeBanner(currentSharedLayout()),
      shared: true
    });
  });
}

function selectBike3dContainer(containerId) {
  if (!containerId || selectedBike3dContainerId === containerId) return;
  capturePackingScroll();
  const keepAdjusting = Boolean(adjustingBike3dContainerId);
  selectedBike3dContainerId = containerId;
  if (keepAdjusting) adjustingBike3dContainerId = containerId;
  renderPacking();
}

function closeBike3dDetail() {
  selectedBike3dContainerId = "";
  adjustingBike3dContainerId = "";
  renderPacking();
}

function toggleBike3dAdjusting(containerId) {
  if (!containerId) return;
  adjustingBike3dContainerId = adjustingBike3dContainerId === containerId ? "" : containerId;
  selectedBike3dContainerId = containerId;
  renderPacking();
}

function getBike3dTransform(containerId) {
  return normalizeBike3dTransform(bike3dTransforms[containerId]);
}

function adjustBike3dTransform(action) {
  if (!selectedBike3dContainerId) return;
  const current = getBike3dTransform(selectedBike3dContainerId);
  const next = { ...current };
  const moveStep = 0.12;
  const scaleStep = 0.08;
  if (action === "move-left") next.x -= moveStep;
  if (action === "move-right") next.x += moveStep;
  if (action === "move-up") next.y += moveStep;
  if (action === "move-down") next.y -= moveStep;
  if (action === "move-forward") next.z += moveStep;
  if (action === "move-back") next.z -= moveStep;
  if (action === "scale-x-up") next.sx += scaleStep;
  if (action === "scale-x-down") next.sx -= scaleStep;
  if (action === "scale-y-up") next.sy += scaleStep;
  if (action === "scale-y-down") next.sy -= scaleStep;
  if (action === "scale-z-up") next.sz += scaleStep;
  if (action === "scale-z-down") next.sz -= scaleStep;
  if (action === "rotate-x-up") next.rx += 5;
  if (action === "rotate-x-down") next.rx -= 5;
  if (action === "rotate-y-up") next.ry += 5;
  if (action === "rotate-y-down") next.ry -= 5;
  if (action === "rotate-z-up") next.rz += 5;
  if (action === "rotate-z-down") next.rz -= 5;
  if (action === "reset") delete bike3dTransforms[selectedBike3dContainerId];
  else bike3dTransforms[selectedBike3dContainerId] = normalizeBike3dTransform(next);
  saveUiSettings();
  renderPacking();
}

function setBike3dColor(color) {
  if (!selectedBike3dContainerId || !/^#[0-9a-f]{6}$/i.test(String(color || ""))) return;
  bike3dTransforms[selectedBike3dContainerId] = normalizeBike3dTransform({
    ...getBike3dTransform(selectedBike3dContainerId),
    color
  });
  saveUiSettings();
  renderPacking();
}

function setBike3dViewState(nextViewState) {
  bike3dViewState = normalizeBike3dViewState(nextViewState);
  saveUiSettings();
}

function resetBike3dViewState() {
  bike3dViewState = defaultBike3dViewState();
  saveUiSettings();
  renderPacking();
}

function renderSharedModeBanner(layout = currentSharedLayout(), { compact = false } = {}) {
  const demoSource = layout?.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  const buttonText = demoSource ? demoCopyActionText() : t("buttons.copyAll");
  const viewerText = demoSource
    ? (uiLanguage === "en"
      ? "Original demo template is read-only."
      : "\u0418\u0441\u0445\u043e\u0434\u043d\u044b\u0439 \u0434\u0435\u043c\u043e-\u0448\u0430\u0431\u043b\u043e\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430.")
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
  const board = getPackingScrollHost();
  const packingHidden = refs.packingView.classList.contains("hidden");
  const pageScroll = currentPageScrollPosition();
  if (packingHidden && lastPackingScrollSnapshot) {
    pendingPackingScroll = { ...lastPackingScrollSnapshot };
    return;
  }
  pendingPackingScroll = {
    boardLeft: board?.scrollLeft || 0,
    windowX: pageScroll.x,
    windowY: pageScroll.y
  };
  if (!packingHidden) {
    lastPackingScrollSnapshot = { ...pendingPackingScroll };
  }
}

function captureViewportSnapshot() {
  const board = getPackingScrollHost();
  const pageScroll = currentPageScrollPosition();
  return {
    boardLeft: board?.scrollLeft || 0,
    windowX: pageScroll.x,
    windowY: pageScroll.y
  };
}

function restoreViewportSnapshot(snapshot, focusTarget = null, anchor = null) {
  const apply = () => {
    const board = getPackingScrollHost();
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
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${isReadOnlyStateScope() ? `
            <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${rootCollapsed ? "\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c" : "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c"}">
              <span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span>
            </button>
          ` : ""}
          <h2>${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}</h2>
        </div>
        <div class="container-tools">
          ${isReadonlyTemplateView() ? "" : `
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          `}
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
          ${renderContainerWeightText(total)}
        </div>
      </header>
      ${rootCollapsed ? "" : renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${rootCollapsed ? "" : renderContainerContents(container.id)}
      </div>
    </article>
  `;
}

function renderFilteredContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  const rootCollapseButton = isReadOnlyStateScope()
    ? `<button class="collapse-button" data-toggle-container="${container.id}" aria-label="${rootCollapsed ? "\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c" : "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c"}"><span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span></button>`
    : "";
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${rootCollapseButton}
          <h2>${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${highlight(container.name)}</h2>
        </div>
        <div class="container-tools">
          ${isReadonlyTemplateView() ? "" : `
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          `}
          <button
            class="header-icon-button"
            data-edit-container="${container.id}"
            aria-label="Редактировать"
            title="Редактировать"
          >&#9998;</button>
          ${renderContainerWeightText(total)}
        </div>
      </header>
      ${rootCollapsed ? "" : renderItemPhoto(container)}
      <div class="dropzone" data-container-id="${container.id}">
        ${rootCollapsed ? "" : renderFilteredContainerContents(container.id)}
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
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  const title = editingContainerId === container.id
    ? `<input class="container-title-input" data-container-title-input="${container.id}" value="${escapeHtml(container.name)}" />`
    : `<strong data-container-title-text="${container.id}">${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}</strong>`;
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-subcontainer-id="${container.id}">
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
          ${renderContainerWeightText(containerWeight(containerId))}
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
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const collapsed = getFilterViewCollapsed(containerId, defaultCollapsed);
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  const title = editingContainerId === container.id
    ? `<input class="container-title-input" data-container-title-input="${container.id}" value="${escapeHtml(container.name)}" />`
    : `<strong data-container-title-text="${container.id}">${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${highlight(container.name)}</strong>`;
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-subcontainer-id="${container.id}">
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
          ${renderContainerWeightText(containerWeight(containerId))}
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
  return !item?.id || !getItemContainerIdInLayout(getPublishedWorkLayout(), item.id);
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
  const packedVisible = isCollectionPackedVisible(state, packed);
  const collection = Boolean(state.collectionMode);
  const filterMatch = isFilterContextActive() && matchesFilters(item);
  const justAdded = recentlyAddedItemId === item.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  const isEditingTitle = editingItemTitleId === item.id;
  const title = isEditingTitle
    ? `<input class="item-title-input" data-item-title-input="${item.id}" value="${escapeHtml(item.name)}" />`
    : `<strong class="item-title">${highlight(item.name)}${renderItemQuantityText(item)}</strong>`;
  const titleDragAttr = isEditingTitle ? "" : ` data-item-drag="${item.id}"`;
  return `
    <article class="item-card ${packedVisible ? "packed-item" : ""} ${filterMatch ? "filter-match" : ""} ${justAdded ? "just-added" : ""}" data-item-id="${item.id}" ${filterMatch ? `data-filter-match-id="${item.id}"` : ""}>
      <div class="item-card-top ${collection ? "with-pack-toggle" : ""}">
        ${collection ? `
          <button
            class="pack-toggle ${packedVisible ? "packed" : ""}"
            data-toggle-packed="${item.id}"
            aria-label="${packed ? "Отметить как не собранное" : "Отметить как собранное"}"
            title="${packed ? "Собрано" : "Не собрано"}"
          >${packedVisible ? "✓" : ""}</button>
        ` : ""}
        <div class="item-title-hitarea"${titleDragAttr}>${title}</div>
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
      <div class="meta ${shouldShowItemLabels() ? "" : "meta-hidden"}">
        <span class="pill">${formatItemWeight(item)}</span>
        ${itemCategories(item).map((category) => `<span class="pill">${highlight(category)}</span>`).join("")}
        <span class="pill ${item.location === "Не знаю где" || item.location === "Надо купить" ? "warn" : ""}">${highlight(item.location)}</span>
      </div>
      ${renderItemPhoto(item)}
    </article>
  `;
}

function renderItemPhoto(item, { force = false } = {}) {
  if (!force && !shouldShowItemPhotos()) return "";
  const photos = normalizeItemPhotos(item);
  if (!photos.length) return "";
  const slides = photos.map((photo) => renderPhotoSlide(photo)).join("");
  const dots = renderPhotoDots(photos.length);
  const pending = photos.some((photo) => !photoRemoteSrc(photo) && ["pending", "uploading", "error", "missing-local-file"].includes(photo.status));
  const statusText = pending ? photoStatusText(photos) : "";
  return `
    <div class="item-photo ${pending ? "item-photo-pending" : ""}" data-photo-gallery>
      <div class="photo-gallery-track">
        ${slides}
      </div>
      ${dots}
      ${statusText ? `<span>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

function renderPhotoSlide(photo) {
  const localId = photo.localId || photo.id;
  const localSrc = localId ? photoObjectUrls.get(localId) : "";
  const remoteSrc = photoRemoteSrc(photo);
  const src = localSrc || remoteSrc || "";
  const fullSrc = photo.url ? versionedPhotoUrl(normalizeRemotePhotoUrl(photo.url), photo.updatedAt || photo.id || "") : remoteSrc;
  const localHydrateAttr = localId ? ` data-photo-local-id="${escapeHtml(localId)}" data-photo-local-source-id="${escapeHtml(localId)}"` : "";
  const fullAttr = fullSrc ? ` data-photo-full-src="${escapeHtml(fullSrc)}"` : "";
  return `
    <button class="photo-gallery-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${localHydrateAttr}
        ${fullAttr}
        alt=""
        loading="lazy"
      />
    </button>
  `;
}

function renderPhotoDots(count, activeIndex = 0) {
  if (count <= 1) return "";
  return `
    <div class="photo-gallery-dots" aria-hidden="true">
      ${Array.from({ length: count }, (_, index) => `<button class="photo-gallery-dot ${index === activeIndex ? "active" : ""}" type="button" data-photo-index="${index}" tabindex="-1"></button>`).join("")}
    </div>
  `;
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

function bindPhotoGalleries(root = document) {
  root.querySelectorAll("[data-photo-gallery]").forEach((gallery) => {
    if (gallery.dataset.photoGalleryBound === "true") return;
    gallery.dataset.photoGalleryBound = "true";
    const track = gallery.querySelector(".photo-gallery-track");
    const dots = [...gallery.querySelectorAll(".photo-gallery-dot")];
    if (!track) return;
    const setActive = (index) => {
      dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
      if (gallery.closest("#itemPhotoPreview")) itemDialogPhotoActiveIndex = index;
      if (gallery.closest("#rootContainerPhotoPreview")) rootContainerDialogPhotoActiveIndex = index;
    };
    const syncActive = () => {
      const width = track.clientWidth || 1;
      const index = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / width)));
      setActive(index);
    };
    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
        setActive(index);
      });
    });
    track.addEventListener("scroll", () => requestAnimationFrame(syncActive), { passive: true });
    gallery.querySelectorAll("[data-photo-open]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const image = button.querySelector("img");
        if (image) openPhotoLightbox(image);
      });
    });
    const initialIndex = Math.max(0, Math.min(Math.max(0, dots.length - 1), Number(gallery.dataset.photoInitialIndex || 0) || 0));
    if (initialIndex) requestAnimationFrame(() => track.scrollLeft = track.clientWidth * initialIndex);
    setActive(initialIndex);
  });
}

async function openPhotoLightbox(sourceImage) {
  const localId = sourceImage.dataset.photoLocalSourceId || sourceImage.dataset.photoLocalId || "";
  let src = sourceImage.dataset.photoFullSrc || sourceImage.currentSrc || sourceImage.src;
  closePhotoLightbox();
  if (localId) {
    const cached = await getCachedPhoto(localId);
    if (cached?.blob) {
      lightboxObjectUrl = URL.createObjectURL(cached.blob);
      src = lightboxObjectUrl;
    }
  }
  if (!src) return;
  const overlay = document.createElement("div");
  overlay.className = "photo-lightbox";
  overlay.innerHTML = `
    <button class="photo-lightbox-close" type="button" aria-label="Закрыть">×</button>
    <img class="photo-lightbox-image" src="${escapeHtml(src)}" alt="" />
  `;
  document.body.append(overlay);
  document.body.classList.add("photo-lightbox-open");
  const image = overlay.querySelector(".photo-lightbox-image");
  const close = () => closePhotoLightbox();
  overlay.querySelector(".photo-lightbox-close")?.addEventListener("click", close);
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let moved = false;
  const apply = () => {
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  };
  image.addEventListener("click", (event) => {
    if (moved) {
      moved = false;
      return;
    }
    event.preventDefault();
    close();
  });
  image.addEventListener("pointerdown", (event) => {
    image.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    moved = false;
  });
  image.addEventListener("pointermove", (event) => {
    if (!image.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    panX = startPanX + dx;
    panY = startPanY + dy;
    apply();
  });
  image.addEventListener("pointerup", (event) => {
    if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
  });
  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.18 : -0.18;
    scale = Math.max(1, Math.min(4, scale + delta));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    apply();
  }, { passive: false });
  let pinchDistance = 0;
  let pinchScale = 1;
  overlay.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    pinchDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchScale = scale;
  }, { passive: true });
  overlay.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchDistance) return;
    event.preventDefault();
    const nextDistance = touchDistance(event.touches[0], event.touches[1]);
    scale = Math.max(1, Math.min(4, pinchScale * (nextDistance / pinchDistance)));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    apply();
  }, { passive: false });
  document.addEventListener("keydown", closePhotoLightboxOnEscape);
}

function touchDistance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function closePhotoLightboxOnEscape(event) {
  if (event.key === "Escape") closePhotoLightbox();
}

function closePhotoLightbox() {
  document.querySelector(".photo-lightbox")?.remove();
  document.body.classList.remove("photo-lightbox-open");
  if (lightboxObjectUrl) URL.revokeObjectURL(lightboxObjectUrl);
  lightboxObjectUrl = "";
  document.removeEventListener("keydown", closePhotoLightboxOnEscape);
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
      if (isCoarsePointerInteraction(event)) {
        event.preventDefault();
        capturePackingScroll();
        state.collapsedContainers[containerId] = !state.collapsedContainers[containerId];
        saveLocalUiState();
        render();
        return;
      }
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

function isCoarsePointerInteraction(event = null) {
  if (event?.pointerType === "touch" || event?.pointerType === "pen") return true;
  try {
    return window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches === true;
  } catch {
    return false;
  }
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
  const layout = state.layouts?.[state.activeLayoutId];
  const containerId = getItemContainerIdInLayout(layout, draggingItemId);
  if (!state.items[draggingItemId] || containerId !== zone.dataset.containerId) return false;
  const order = layout?.arrangement?.containers?.[containerId]?.order || [];
  const originalIndex = order.findIndex((entry) => entry.type === "item" && entry.id === draggingItemId);
  const targetIndex = getPlaceholderItemIndex(zone, placeholder);
  return targetIndex === originalIndex;
}

function isOriginalContainerPosition(zone, placeholder) {
  if (!draggingContainerId) return false;
  const layout = state.layouts?.[state.activeLayoutId];
  const placement = layout?.arrangement?.containers?.[draggingContainerId];
  if (!state.containers[draggingContainerId] || placement?.parentId !== zone.dataset.containerId) return false;
  const order = layout?.arrangement?.containers?.[placement.parentId]?.order || [];
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

function getPackingScrollHost() {
  return refs.packingView.querySelector(".board") || getBike3dPackingScrollHost(refs.packingView);
}

function syncFixedScrollbarVisibility() {
  const bar = document.querySelector("#kanbanScrollbar");
  const board = getPackingScrollHost();
  const isPacking = !refs.packingView.classList.contains("hidden");
  const needsScroll = board && board.scrollWidth > board.clientWidth + 1;
  const show = Boolean(isPacking && needsScroll);
  bar?.classList.toggle("hidden", !show);
  document.body.classList.toggle("has-fixed-kanban-scroll", show);
  if (show) updateFixedScrollbarThumb(board);
}

function updateFixedScrollbarThumb(board = getPackingScrollHost()) {
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
  const inCurrentLayout = isItemInActiveLayout(item);
  const placementText = item.containerId ? containerPath(item.containerId) : "Вне укладки";
  const quantityText = itemQuantity(item) > 1 ? `${itemQuantity(item)} шт.` : "";
  const cardTitle = [
    item.name,
    quantityText,
    formatItemWeight(item),
    itemCategories(item).join(", "),
    item.location,
    placementText
  ].filter(Boolean).join("\n");
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(item)
      ? renderItemPhoto(item)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">Без фото</div>`
    : "";
  return renderCatalogCard({
    classes: [
      inCurrentLayout ? "in-current-layout" : "",
      filterMatch ? "filter-match" : ""
    ],
    attributes: {
      "data-list-item-id": item.id,
      ...(filterMatch ? { "data-filter-match-id": item.id } : {})
    },
    title: cardTitle,
    titleHtml: `${highlight(item.name)}${renderItemQuantityText(item)}`,
    metaHtml: renderCatalogPills([
      formatItemWeight(item),
      ...itemCategories(item).map((category) => highlight(category)),
      highlight(item.location)
    ], { hidden: !shouldShowItemLabels() }),
    statusHtml: highlight(placementText),
    photoHtml: photoSlot,
    actionsHtml: `
      <button class="copy-item-button" data-copy-item="${item.id}" aria-label="Скопировать" title="Скопировать">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="edit-button" data-edit-item="${item.id}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-delete-item="${item.id}" aria-label="Удалить навсегда" title="Удалить навсегда">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
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
  const dictionaryOwner = activeDictionaryOwner();
  refs.settingsView.innerHTML = `
    <div class="settings-grid">
      ${renderDictionary("Места хранения", "location", dictionaryOptionsForOwner("location", dictionaryOwner))}
      ${renderDictionary("Категории", "category", dictionaryOptionsForOwner("category", dictionaryOwner))}
    </div>
  `;
  bindDictionary("location", dictionaryOwner);
  bindDictionary("category", dictionaryOwner);
}

function renderSharedSettingsView() {
  withSharedVirtualState(() => {
    refs.settingsView.innerHTML = `
      <div class="settings-grid">
        ${renderDictionary("Места хранения", "location", dictionaryOptionsForUi("location"))}
        ${renderDictionary("Категории", "category", dictionaryOptionsForUi("category"))}
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
  const layoutPlaceholder = document.createElement("div");
  layoutPlaceholder.className = "drop-placeholder";

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
      <div class="root-container-list ${shouldShowItemPhotos() ? "with-photo-slots" : ""} ${shouldShowItemLabels() ? "with-meta-slots" : ""}">
        ${roots.map(renderRootContainerCard).join("") || `<div class="empty">Ничего не найдено</div>`}
      </div>
    </section>
  `;
}

function renderRootContainerCard(container) {
  const filterMatch = isFilterContextActive() && matchesRootContainerFieldsFilter(container);
  const inCurrentLayout = isRootContainerInActiveLayout(container.id);
  const placementText = inCurrentLayout ? "В текущей укладке" : "Вне текущей укладки";
  const location = container.location || defaultRootContainerLocation(state);
  const metaTags = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    highlight(location)
  ].filter(Boolean);
  const metaTitle = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    location
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
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(container)
      ? renderItemPhoto(container)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">Без фото</div>`
    : "";
  return renderCatalogCard({
    classes: [
      "root-container-card",
      inCurrentLayout ? "in-current-layout" : "",
      filterMatch ? "filter-match" : ""
    ],
    attributes: {
      "data-root-card": container.id,
      "data-root-drag": container.id,
      ...(filterMatch ? { "data-filter-match-id": `root-${container.id}` } : {})
    },
    title: [
      "Удерживайте и перетащите в укладку",
      metaTitle,
      placementText
    ].filter(Boolean).join("\n"),
    titleHtml: highlight(container.name),
    titleClass: "root-container-title",
    titleAttributes: {
      "data-root-title": container.id,
      title: container.name
    },
    metaHtml: renderCatalogPills(metaTags, { hidden: !shouldShowItemLabels() }),
    statusHtml: placementText,
    photoHtml: photoSlot,
    actionsHtml: `
      <button class="copy-item-button" data-copy-root="${container.id}" aria-label="Скопировать" title="Скопировать">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="edit-button" data-edit-root="${container.id}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-delete-root="${container.id}" aria-label="Удалить" title="Удалить">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
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
        <button class="edit-button dictionary-save-button" type="button" data-save-${type}="${escapeHtml(value)}" aria-label="Сохранить" title="Сохранить">
          <span aria-hidden="true">✓</span>
        </button>
        <button class="delete-item-button dictionary-cancel-button" type="button" data-cancel-${type}="${escapeHtml(value)}" aria-label="Отмена" title="Отмена">
          <span aria-hidden="true">&times;</span>
        </button>
      </span>
    `;
  }
  return `
    <span class="chip dictionary-chip">
      <span class="dictionary-chip-title">${escapeHtml(value)}</span>
      <button class="edit-button" type="button" data-edit-${type}="${escapeHtml(value)}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" type="button" data-remove-${type}="${escapeHtml(value)}" aria-label="Удалить" title="Удалить">
        <span aria-hidden="true">&times;</span>
      </button>
    </span>
  `;
}

function bindDictionary(type, owner = activeDictionaryOwner()) {
  const scope = dictionaryEditScope(owner);
  const input = document.querySelector(`#${type}Input`);
  document.querySelector(`#${type}Add`).addEventListener("click", () => {
    const value = input.value.trim();
    if (!value || dictionaryOptionsForOwner(type, owner).includes(value)) return;
    if (!requireUsageCapacity(type === "location" ? "locations" : "categories")) return;
    addCustomDictionaryValue(owner, type, value);
    editingDictionaryEntry = null;
    input.value = "";
    saveDictionaryOwner(owner);
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
      renameDictionaryEntry(type, oldValue, editInput?.value || "", owner);
    });
  });
  document.querySelectorAll(`[data-dictionary-edit-input="${type}"]`).forEach((editInput) => {
    editInput.focus({ preventScroll: true });
    editInput.select();
    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameDictionaryEntry(type, editingDictionaryEntry?.value || "", editInput.value, owner);
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
      const dictionaryValues = dictionaryOptionsForOwner(type, owner);
      if (dictionaryValues.length <= 1) return;
      const affectedCount = scope.items.filter((item) => {
        if (type === "location") return item.location === value;
        return itemCategories(item).includes(value);
      }).length;
      const fallback = dictionaryValues.find((item) => item !== value);
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
          removeCustomDictionaryValue(owner, type, value);
          scope.items.forEach((item) => {
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
          if (type === "location") {
            scope.containers.forEach((container) => {
              if (container.location !== value) return;
              container.location = fallback;
              touchContainer(container.id, changedAt);
            });
          }
          saveDictionaryOwner(owner);
        }
      });
    });
  });
}

function renameDictionaryEntry(type, oldValue, rawNewValue, owner = activeDictionaryOwner()) {
  const scope = dictionaryEditScope(owner);
  const newValue = String(rawNewValue || "").trim();
  if (!oldValue || !newValue) return;
  if (newValue === oldValue) {
    editingDictionaryEntry = null;
    render();
    return;
  }
  if (dictionaryOptionsForOwner(type, owner).includes(newValue)) {
    showToast("Такое значение уже есть.", "warning");
    return;
  }
  const changedAt = nowIso();
  renameCustomDictionaryValue(owner, type, oldValue, newValue);
  if (type === "location") {
    scope.items.forEach((item) => {
      if (item.location !== oldValue) return;
      item.location = newValue;
      markEdited(item, changedAt);
    });
    scope.containers.forEach((container) => {
      if (container.location !== oldValue) return;
      container.location = newValue;
      touchContainer(container.id, changedAt);
    });
    if (refs.locationFilter.value === oldValue) refs.locationFilter.value = newValue;
  } else {
    scope.items.forEach((item) => {
      if (!itemCategories(item).includes(oldValue)) return;
      item.categories = itemCategories(item).map((category) => category === oldValue ? newValue : category)
        .filter((category, index, list) => list.indexOf(category) === index);
      item.category = item.categories[0];
      markEdited(item, changedAt);
    });
    selectedCategoryFilters = selectedCategoryFilters.map((category) => category === oldValue ? newValue : category)
      .filter((category, index, list) => list.indexOf(category) === index);
  }
  saveDictionaryOwner(owner);
}

function moveItem(itemId, targetContainerId, targetIndex = null, options = {}) {
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  if (!state.items[itemId] || !layout || !state.containers[targetContainerId]) return;
  if (options.captureScroll !== false) capturePackingScroll();
  const changedAt = nowIso();
  if (!moveItemInLayoutArrangement(layout, itemId, targetContainerId, targetIndex)) return;
  touchLayout(layoutId, changedAt);
  applyLayoutArrangement(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function moveContainer(containerId, targetParentId, targetIndex = null) {
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  if (!layout || !state.containers[containerId] || !state.containers[targetParentId]) return;
  capturePackingScroll();
  const changedAt = nowIso();
  if (!moveContainerInLayoutArrangement(layout, containerId, targetParentId, targetIndex)) return;
  touchLayout(layoutId, changedAt);
  applyLayoutArrangement(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function createGroupFromItems(itemId, targetItemId) {
  if (itemId === targetItemId) return;
  if (!requireUsageCapacity("containers")) return;
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  const item = state.items[itemId];
  const targetItem = state.items[targetItemId];
  const sourceContainerId = getItemContainerIdInLayout(layout, itemId);
  const targetContainerId = getItemContainerIdInLayout(layout, targetItemId);
  const targetParent = ensureLayoutContainerPlacement(layout, targetContainerId);
  if (!layout || !item || !targetItem || !sourceContainerId || !targetContainerId || !targetParent) return;
  capturePackingScroll();
  const changedAt = nowIso();

  const targetIndex = (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === targetItemId);
  const sourceIndexInTarget = sourceContainerId === targetContainerId
    ? (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === itemId)
    : -1;
  const insertIndex = Math.max(0, targetIndex - (sourceIndexInTarget >= 0 && sourceIndexInTarget < targetIndex ? 1 : 0));
  const groupId = `container-${Date.now()}`;

  state.containers[groupId] = {
    id: groupId,
    name: "Новый пакет",
    parentId: null,
    childIds: [],
    itemIds: [targetItemId, itemId],
    order: [
      { type: "item", id: targetItemId },
      { type: "item", id: itemId }
    ],
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.containers[groupId]);

  removeItemFromLayoutArrangement(layout, itemId);
  removeItemFromLayoutArrangement(layout, targetItemId);
  layout.arrangement.containers[groupId] = {
    parentId: targetContainerId,
    itemIds: [targetItemId, itemId],
    childIds: [],
    order: [
      { type: "item", id: targetItemId },
      { type: "item", id: itemId }
    ]
  };
  layout.arrangement.items[targetItemId] = groupId;
  layout.arrangement.items[itemId] = groupId;
  targetParent.childIds = Array.isArray(targetParent.childIds) ? targetParent.childIds.filter((id) => id !== groupId) : [];
  targetParent.childIds.push(groupId);
  targetParent.order = Array.isArray(targetParent.order)
    ? targetParent.order.filter((entry) => !(entry?.type === "container" && entry.id === groupId))
    : [];
  targetParent.order.splice(Math.min(insertIndex, targetParent.order.length), 0, { type: "container", id: groupId });
  touchLayout(layoutId, changedAt);
  state.collapsedContainers[groupId] = false;
  editingContainerId = groupId;
  if (sourceContainerId !== targetContainerId) cleanupEmptyContainersInLayoutArrangement(layout, sourceContainerId);
  applyLayoutArrangement(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeItemFromActiveLayout(itemId) {
  const item = state.items[itemId];
  const layout = state.layouts?.[state.activeLayoutId];
  const containerId = getItemContainerIdInLayout(layout, itemId);
  if (!item || !layout || !containerId) return;
  capturePackingScroll();
  const changedAt = nowIso();
  if (!removeItemFromLayoutArrangement(layout, itemId)) return;
  cleanupEmptyContainersInLayoutArrangement(layout, containerId);
  touchActiveLayout(changedAt);
  applyLayoutArrangement(state.activeLayoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function getItemContainerIdInLayout(layout, itemId) {
  return getItemContainerIdInLayoutForState(state, layout, itemId);
}

function getLayoutContainerIdSet(layout = state.layouts?.[state.activeLayoutId]) {
  return getLayoutContainerIdSetForState(state, layout);
}

function getLayoutItemIdSet(layout = state.layouts?.[state.activeLayoutId]) {
  return getLayoutItemIdSetForState(state, layout);
}

function ensureLayoutContainerPlacement(layout, containerId) {
  return ensureLayoutContainerPlacementForState(state, layout, containerId);
}

function addItemToLayoutArrangement(layout, itemId, containerId, targetIndex = null) {
  return addItemToLayoutArrangementForState(state, layout, itemId, containerId, targetIndex);
}

function placeExistingItemInLayout(itemId, containerId, layoutId = state.activeLayoutId, { changedAt = nowIso(), targetIndex = null } = {}) {
  const layout = state.layouts?.[layoutId];
  if (!state.items?.[itemId] || !layout || !state.containers?.[containerId]) return false;
  const previousArrangement = clone(layout.arrangement || createEmptyLayoutArrangement());
  const previousRootContainerIds = [...(layout.rootContainerIds || [])];
  const rollback = () => {
    layout.arrangement = previousArrangement;
    layout.rootContainerIds = previousRootContainerIds;
    if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
    return false;
  };
  if (!addItemToLayoutArrangement(layout, itemId, containerId, targetIndex)) return rollback();
  normalizeLayoutArrangement(layout, state);
  if (getItemContainerIdInLayout(layout, itemId) !== containerId) return rollback();
  touchLayout(layoutId, changedAt);
  if (layoutId === state.activeLayoutId) {
    applyLayoutArrangement(layoutId);
    const activeItemContainerId = state.items?.[itemId]?.containerId || "";
    const activeContainerHasItem = Boolean(state.containers?.[containerId]?.itemIds?.includes(itemId));
    if (activeItemContainerId !== containerId || !activeContainerHasItem) return rollback();
  }
  return true;
}

function placeExistingContainerInLayout(containerId, parentId, layoutId = state.activeLayoutId, { changedAt = nowIso(), targetIndex = null } = {}) {
  const layout = state.layouts?.[layoutId];
  if (!state.containers?.[containerId] || !layout) return false;
  if (parentId && !state.containers?.[parentId]) return false;
  const previousArrangement = clone(layout.arrangement || createEmptyLayoutArrangement());
  const previousRootContainerIds = [...(layout.rootContainerIds || [])];
  const previousParentId = state.containers[containerId].parentId || null;
  const rollback = () => {
    layout.arrangement = previousArrangement;
    layout.rootContainerIds = previousRootContainerIds;
    state.containers[containerId].parentId = previousParentId;
    if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
    return false;
  };
  state.containers[containerId].parentId = parentId || null;
  if (!ensureLayoutContainerPlacement(layout, containerId)) return rollback();
  if (parentId) {
    if (!moveContainerInLayoutArrangement(layout, containerId, parentId, targetIndex)) return rollback();
    state.collapsedContainers[parentId] = false;
  } else {
    const arrangement = layout.arrangement || createEmptyLayoutArrangement();
    arrangement.rootContainerIds = (arrangement.rootContainerIds || []).filter((id) => id !== containerId);
    arrangement.rootContainerIds.push(containerId);
    if (arrangement.containers?.[containerId]) arrangement.containers[containerId].parentId = "";
    layout.rootContainerIds = [...arrangement.rootContainerIds];
  }
  normalizeLayoutArrangement(layout, state);
  touchLayout(layoutId, changedAt);
  if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
  markRecentlyAddedContainer(containerId, layoutId);
  return true;
}

function moveItemInLayoutArrangement(layout, itemId, targetContainerId, targetIndex = null) {
  return moveItemInLayoutArrangementForState(state, layout, itemId, targetContainerId, targetIndex);
}

function moveContainerInLayoutArrangement(layout, containerId, targetParentId, targetIndex = null) {
  return moveContainerInLayoutArrangementForState(state, layout, containerId, targetParentId, targetIndex);
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
  removeItemFromLayoutArrangement(state.layouts?.[state.activeLayoutId], itemId);
  delete state.packedItems?.[itemId];
  cleanupEmptyContainers(containerId);
  saveState();
  scheduleActivePublishedEditSave();
}

function confirmRemoveItemFromActiveLayout(itemId) {
  const item = state.items[itemId];
  const layout = state.layouts?.[state.activeLayoutId];
  if (!item || !getItemContainerIdInLayout(layout, itemId)) return;
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
  const placements = describeVisibleItemLayoutPlacements(item);
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

function describeVisibleItemLayoutPlacements(item) {
  if (!item?.id) return [];
  return Object.values(state.layouts).flatMap((layout) => {
    normalizeLayoutArrangement(layout, state);
    const containerId = getItemContainerIdInLayout(layout, item.id);
    if (!containerId || !state.containers[containerId]) return [];
    const rootId = getVisibleLayoutRootIds(layout).find((id) =>
      id === containerId || getLayoutDescendantContainerIdsForState(layout, id).includes(containerId)
    );
    const root = rootId ? state.containers[rootId] : null;
    if (!root) return [];
    const path = containerPath(containerId);
    const place = rootId === containerId ? "" : `, \u043c\u0435\u0441\u0442\u043e \u00ab${path}\u00bb`;
    return [`${layout.name}: \u0441\u0442\u043e\u043b\u0431\u0435\u0446 \u00ab${root.name}\u00bb${place}`];
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
  Object.values(state.layouts || {}).forEach((layout) => {
    removeItemFromLayoutArrangement(layout, itemId);
  });
  delete state.items[itemId];
  delete state.packedItems?.[itemId];
  if (oldContainerId) cleanupEmptyContainers(oldContainerId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

async function copyItem(itemId, options = {}) {
  const item = state.items[itemId];
  if (!item) return;
  if (!requireUsageCapacity("items")) return;
  const keepPlacement = Boolean(options.keepPlacement);
  if (options.confirm !== false) {
    const confirmed = await askConfirmDialog(itemCopyConfirm({ item, keepPlacement }));
    if (!confirmed) return;
  }
  const changedAt = nowIso();
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  const containerId = keepPlacement ? getItemContainerIdInLayout(layout, itemId) : "";
  const placement = containerId ? ensureLayoutContainerPlacement(layout, containerId) : null;
  const container = placement;
  const id = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.items[id] = {
    ...item,
    id,
    name: makeItemCopyName(item.name),
    containerId: "",
    photos: await copyRecordPhotosForLocalDuplicate(item, { changedAt }),
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(state.items[id]);
  if (placement) {
    const orderIndex = (placement.order || []).findIndex((entry) => entry.type === "item" && entry.id === itemId);
    addItemToLayoutArrangement(layout, id, containerId, orderIndex >= 0 ? orderIndex + 1 : null);
    touchLayout(layoutId, changedAt);
    applyLayoutArrangement(layoutId);
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
  const confirmed = await askConfirmDialog(rootContainerCopyConfirm({ container, inLayout: false }));
  if (!confirmed) return;
  await duplicateRootContainer(containerId);
}

async function duplicateRootContainer(containerId, { addToLayoutId = "" } = {}) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  if (!requireUsageCapacity("containers")) return;
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
    photos: await copyRecordPhotosForLocalDuplicate(container, { changedAt }),
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
  const names = Object.values(state.containers)
    .filter((container) => !container.parentId)
    .map((container) => container.name);
  return makeCopyName(name, names);
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
  if (!layout || !container) return;
  const changedAt = nowIso();
  if (!removeContainerFromLayoutOnly(layout, containerId, changedAt)) return;
  touchLayout(layoutId, changedAt);
  applyLayoutArrangement(layoutId);
  if (editingRootContainerId === containerId) refs.rootContainerDialog.close("cancel");
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeContainerFromLayoutOnly(layout, containerId, changedAt = nowIso()) {
  if (!layout || !state.containers?.[containerId]) return false;
  const arrangement = normalizeLayoutArrangement(layout, state);
  const placement = arrangement.containers?.[containerId];
  if (!placement && !(arrangement.rootContainerIds || []).includes(containerId)) return false;
  const removedContainerIds = new Set();
  const collect = (id) => {
    if (!id || removedContainerIds.has(id)) return;
    removedContainerIds.add(id);
    (arrangement.containers?.[id]?.childIds || []).forEach(collect);
  };
  collect(containerId);
  const isRoot = (arrangement.rootContainerIds || []).includes(containerId);
  const parentId = placement?.parentId || "";
  if (isRoot) {
    arrangement.rootContainerIds = (arrangement.rootContainerIds || []).filter((id) => id !== containerId);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
    markRecordActivePublicCatalog(state.containers[containerId]);
    markEdited(state.containers[containerId], changedAt);
  } else if (parentId && arrangement.containers?.[parentId]) {
    const parent = arrangement.containers[parentId];
    parent.childIds = (parent.childIds || []).filter((id) => id !== containerId);
    parent.order = (parent.order || []).filter((entry) => !(entry?.type === "container" && entry.id === containerId));
  }
  Object.entries(arrangement.items || {}).forEach(([itemId, itemContainerId]) => {
    if (!removedContainerIds.has(itemContainerId)) return;
    delete arrangement.items[itemId];
    delete arrangement.packedItems?.[itemId];
    if (state.items?.[itemId]) {
      markRecordActivePublicCatalog(state.items[itemId]);
      markEdited(state.items[itemId], changedAt);
    }
  });
  removedContainerIds.forEach((id) => {
    delete arrangement.containers[id];
    delete state.collapsedContainers?.[id];
    if (id === containerId && isRoot) return;
    deleteUnusedLayoutContainerEntity(id, layout.id);
  });
  if (parentId) cleanupEmptyContainersInLayoutArrangement(layout, parentId);
  return true;
}

function deleteUnusedLayoutContainerEntity(containerId, removedFromLayoutId = "") {
  if (!containerId || !state.containers?.[containerId]) return;
  const usedElsewhere = Object.values(state.layouts || {}).some((layout) => {
    if (!layout || layout.id === removedFromLayoutId) return false;
    const arrangement = layout.arrangement;
    if (!arrangement || typeof arrangement !== "object") return false;
    if ((arrangement.rootContainerIds || layout.rootContainerIds || []).includes(containerId)) return true;
    return Boolean(arrangement.containers?.[containerId]);
  });
  if (!usedElsewhere) deleteContainerEntityRecord(containerId);
}

function deleteContainerEntityRecord(containerId) {
  const container = state.containers?.[containerId];
  if (!container) return;
  normalizeItemPhotos(container).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(containerId, photo, "container");
  });
  delete state.collapsedContainers?.[containerId];
  delete state.containers[containerId];
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
  return makeCopyName(name, Object.values(state.items).map((item) => item.name));
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
  const dimensions = normalizeContainerDimensions(container?.dimensions);
  if (refs.rootContainerWidth) refs.rootContainerWidth.value = dimensions.width ? String(dimensions.width).replace(".", ",") : "";
  if (refs.rootContainerHeight) refs.rootContainerHeight.value = dimensions.height ? String(dimensions.height).replace(".", ",") : "";
  if (refs.rootContainerDepth) refs.rootContainerDepth.value = dimensions.depth ? String(dimensions.depth).replace(".", ",") : "";
  fillRootContainerLocationSelect(container?.location || defaultRootContainerLocation(state));
  updateRootContainerPlacementButton();
  updateRootContainerRemoveFromLayoutButton();
  if (refs.rootContainerCopyToContainerBtn) refs.rootContainerCopyToContainerBtn.hidden = !containerId;
  refs.rootContainerNote.value = container?.note || "";
  rootContainerDialogPhotoDraft = null;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview(normalizeItemPhotos(container || { photos: [] }));
  rootContainerDialogInitialSnapshot = getRootContainerDialogSnapshot();
  updateRootContainerDialogSaveState();
  openModalDialog(refs.rootContainerDialog);
}

function fillRootContainerLocationSelect(selected = "") {
  const options = dictionaryOptionsForUi("location", { selected: selected ? [selected] : [] });
  const fallback = options[0] || defaultRootContainerLocation(state);
  const entries = options.map((location) => [location, location]);
  fillSelect(refs.rootContainerLocation, entries, selected || fallback);
}

function openItemDialog(itemId = null) {
  resetSharedReadonlyItemDialog();
  editingItemId = itemId;
  itemDialogTargetLayoutId = getPublishedEditLayoutId();
  const item = itemId ? state.items[itemId] : {
    name: "",
    weight: 0,
    quantity: 1,
    location: dictionaryOptionsForUi("location")[0] || defaultRootContainerLocation(state),
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
  fillSelect(refs.itemLocation, dictionaryOptionsForUi("location", { selected: item.location ? [item.location] : [] }).map((location) => [location, location]), item.location);
  renderItemCategoryPicker(itemId ? itemCategories(item) : [], { fallbackDefault: Boolean(itemId) });
  refs.itemContainer.value = itemId
    ? getItemContainerIdInLayout(state.layouts?.[itemDialogTargetLayoutId], itemId)
    : "";
  updateItemContainerPickerButton();
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = !itemId;
  refs.itemNote.value = item.note || "";
  itemDialogPhotoDraft = null;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(normalizeItemPhotos(item));
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
  updateItemDialogPhotoPreview(sharedGearPhotos(item));
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

function uniqueLayoutName(baseName = "Новая укладка", { exceptLayoutId = "" } = {}) {
  const existingNames = Object.values(state.layouts || [])
    .filter((layout) => layout?.id !== exceptLayoutId)
    .map((layout) => layout?.name);
  return uniqueName(baseName, existingNames, { fallback: "Новая укладка" });
}

function uniquePublishedTemplateName(baseName = "Шаблон", { exceptLayoutId = "" } = {}) {
  const existingNames = [
    ...(linkedSharedListLayout && !isDeletedSharedLayoutId(linkedSharedListLayout.id) ? [linkedSharedListLayout.name] : []),
    ...allSharedLayoutsByAdminOrder().map((layout) => layout?.name),
    ...localAdminTemplateCopyLayouts()
      .filter((layout) => layout?.id !== exceptLayoutId)
      .map((layout) => layout?.name)
  ];
  return uniqueName(baseName, existingNames, { fallback: "Шаблон" });
}

function canManageLayout(layoutId = state.activeLayoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || isReadOnlyStateScope() || isSharedLayoutView()) return false;
  return isAdminEditablePublishedLayout(layout.id) || canUseLocalEditableState(layout.id);
}

function canManageActiveLayout() {
  return canManageLayout(state.activeLayoutId);
}

function languageSelectEntries() {
  return SUPPORTED_LANGUAGES.map((language) => [normalizeUiLanguage(language), languageOptionLabel(language)]);
}

function createLayoutCopyFromSource(sourceLayout, requestedName, {
  activate = true,
  publicTemplate = false,
  language = ""
} = {}) {
  if (!sourceLayout || !requestedName) return "";
  captureActiveLayoutArrangement();
  const changedAt = nowIso();
  const id = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const arrangement = clone(sourceLayout.arrangement || createLayoutArrangementFromCurrentState(state, sourceLayout.rootContainerIds || []));
  const dictionaries = ensureLayoutDictionaries(sourceLayout) || ensurePrivateDictionaries(state);
  const layout = createManagedLayoutCopyRecord({
    id,
    name: uniqueLayoutName(requestedName),
    sourceLayout,
    arrangement,
    dictionaries,
    meta: currentCreateMeta(changedAt),
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    guestDemoCopy: !canUsePrivateState(),
    language,
    publicTemplate
  });
  state.layouts[id] = layout;
  if (activate) {
    if (isPublishedLayoutEditable(layout)) activateAdminPublishedLayout(id);
    else {
      if (!canUsePrivateState()) setActiveLocalEditableScope(id);
      switchActiveLayout(id);
    }
  }
  saveLayoutMutation(id);
  render();
  return id;
}

function templateCopyRootSnapshots(sourceLayout, sourceState = state) {
  if (!sourceLayout || !sourceState) return [];
  return templateCopySourceRootIds(sourceLayout)
    .map((rootId) => snapshotContainerTree(rootId, { sourceLayoutId: sourceLayout.id, targetState: sourceState }))
    .filter(Boolean);
}

function templateCopySourceScore(sourceLayout, sourceState = state) {
  return templateCopyRootSnapshots(sourceLayout, sourceState)
    .reduce((sum, snapshot) => sum + containerTreeSnapshotScore(snapshot), 0);
}

async function loadPublishedTemplateCopySource(sourceLayout) {
  if (!sourceLayout) return null;
  if (sourceLayout.adminSharedSourceId) {
    const sharedId = sourceLayout.adminSharedSourceId;
    let payload = null;
    const sharedLayout = findSharedLayout(sharedId);
    if (sharedLayout) {
      await loadSharedLayoutPayload(sharedId).catch(() => false);
      payload = sharedLayoutStatePayload(findSharedLayout(sharedId) || sharedLayout);
    }
    if (!payload) {
      payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId)).catch(() => null);
    }
    const layout = sharedPayloadActiveLayout(payload);
    if (!payload || !layout) return null;
    upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
      id: sharedId,
      name: layout.name || sharedLayout?.name || sharedId,
      language: sharedLayoutLanguageFromPayload(payload, sourceLayout.language || uiLanguage),
      statePayload: payload,
      runtimeSharedTemplate: true
    });
    return { state: payload, layout, score: templateCopySourceScore(layout, payload) };
  }
  if (sourceLayout.adminDemo) {
    const demoLanguage = normalizeUiLanguage(sourceLayout.adminDemoLanguage || sourceLayout.language || uiLanguage);
    const payload = await loadPublishedDemoState(demoLanguage).catch(() => null);
    const layout = sharedPayloadActiveLayout(payload);
    if (!payload || !layout) return null;
    return { state: payload, layout, score: templateCopySourceScore(layout, payload) };
  }
  return null;
}

async function createTemplateCopyFromSource(sourceLayout, requestedName, {
  language = "",
  activate = true,
  renderAfter = true
} = {}) {
  if (!sourceLayout || !requestedName || !isAdminEditablePublishedLayout(sourceLayout.id)) return "";
  captureActiveLayoutArrangement();
  normalizeLayoutArrangement(sourceLayout, state);
  let sourceState = state;
  let copySourceLayout = sourceLayout;
  let rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
  if (!rootSnapshots.length || rootSnapshots.every((snapshot) => containerTreeSnapshotScore(snapshot) <= 1)) {
    withLayoutArrangementApplied(sourceLayout.id, () => {
      captureActiveLayoutArrangement();
      normalizeLayoutArrangement(sourceLayout, state);
      rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
    });
  }
  const localScore = rootSnapshots.reduce((sum, snapshot) => sum + containerTreeSnapshotScore(snapshot), 0);
  const publishedSource = await loadPublishedTemplateCopySource(sourceLayout);
  if (publishedSource?.score > localScore) {
    sourceState = publishedSource.state;
    copySourceLayout = publishedSource.layout;
    rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
  }
  if (!rootSnapshots.length) {
    throw new Error("источник шаблона пустой или не загрузился");
  }
  const changedAt = nowIso();
  const id = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = rootSnapshots
    .map((snapshot) => copyPublishedContainerToState(sourceState, snapshot.rootId, {
      targetLayoutId: "",
      changedAt,
      idMap,
      preserveSource: true,
      sourceLayoutId: copySourceLayout.id,
      sourceSnapshot: snapshot
    }))
    .filter(Boolean);
  const arrangement = createLayoutArrangementFromCurrentState(state, rootContainerIds);
  const dictionaries = sourceState === state
    ? ensureLayoutDictionaries(copySourceLayout)
    : ensureLayoutDictionaries(copySourceLayout, sourceState);
  const layout = createTemplateCopyRecord({
    id,
    name: uniquePublishedTemplateName(requestedName),
    sourceLayout: copySourceLayout,
    arrangement,
    dictionaries: dictionaries || ensurePrivateDictionaries(state),
    meta: currentCreateMeta(changedAt),
    language: language || copySourceLayout.language || sourceLayout.language || uiLanguage
  });
  state.layouts[id] = layout;
  solidifyTemplateDraftLayout(id);
  markLayoutPhotosForCurrentListCopy(id);
  if (activate) activateAdminPublishedLayout(id);
  saveLayoutMutation(id);
  if (renderAfter) render();
  return id;
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
  const requestedName = refs.layoutName.value.trim();
  if (!requestedName) return;
  const sourceLayout = shouldCopy ? source : { arrangement: createEmptyLayoutArrangement(), rootContainerIds: [] };
  createLayoutCopyFromSource(sourceLayout, requestedName);
  refs.layoutDialog.close();
  switchView("bags");
}

function openLayoutEditDialog() {
  const layout = state.layouts?.[state.activeLayoutId];
  if (!layout || !canManageActiveLayout()) {
    showToast("Эту укладку нельзя редактировать.", "error");
    return;
  }
  layoutEditTargetId = layout.id;
  refs.layoutEditTitle.textContent = layoutEditTitle(layout);
  refs.layoutEditName.value = layout.name || "";
  const showLanguage = isAdminEditablePublishedLayout(layout.id);
  refs.layoutEditLanguageLabel.hidden = !showLanguage;
  refs.layoutEditLanguageLabel.setAttribute("aria-hidden", String(!showLanguage));
  if (showLanguage) {
    fillSelect(refs.layoutEditLanguage, languageSelectEntries(), normalizeUiLanguage(layoutManageLanguage(layout, uiLanguage)));
  }
  refs.deleteEditedLayoutBtn.disabled = !canDeleteManagedLayout(layout.id);
  refs.copyEditedLayoutBtn.disabled = false;
  openModalDialog(refs.layoutEditDialog);
}

function canDeleteManagedLayout(layoutId = layoutEditTargetId || state.activeLayoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout) return false;
  if (isAdminEditablePublishedLayout(layoutId)) return canOpenAdminPublishedEdit();
  return canDeleteActiveLayout() && layoutId === state.activeLayoutId;
}

async function saveEditedLayout(event) {
  event.preventDefault();
  const layout = state.layouts?.[layoutEditTargetId];
  if (!layout || !canManageLayout(layout.id)) return;
  const adminPublished = isAdminEditablePublishedLayout(layout.id);
  const changedAt = nowIso();
  const nextName = refs.layoutEditName.value.trim();
  if (!nextName) return;
  let changed = false;
  const previousLayout = adminPublished ? clone(layout) : null;
  const requestedName = layout.adminDemo
    ? normalizeDemoLayoutName(nextName, refs.layoutEditLanguage.value || layoutManageLanguage(layout, uiLanguage))
    : nextName;
  const savedName = editedLayoutName(layout, requestedName, (name) => uniqueLayoutName(name, { exceptLayoutId: layout.id }));
  if (layout.name !== savedName) {
    layout.name = savedName;
    changed = true;
  }
  if (adminPublished) {
    const language = normalizeUiLanguage(refs.layoutEditLanguage.value || layoutManageLanguage(layout, uiLanguage));
    if (layout.adminDemo) {
      const duplicateLanguageDemo = Object.values(state.layouts || {}).find((entry) =>
        entry?.id !== layout.id &&
        entry?.adminDemo &&
        normalizeUiLanguage(entry.adminDemoLanguage || DEFAULT_LANGUAGE) === language
      );
      if (duplicateLanguageDemo) {
        showToast("Демо-шаблон для этого языка уже открыт.", "error");
        return;
      }
    }
    changed = applyLayoutManageLanguage(layout, language) || changed;
  }
  if (!changed) {
    refs.layoutEditDialog.close();
    return;
  }
  touchLayout(layout.id, changedAt);
  if (adminPublished && !layout.adminDemo) {
    refs.saveEditedLayoutBtn.disabled = true;
    try {
      await savePublishedSharedLayoutMetadata(layout, previousLayout);
      refs.layoutEditDialog.close();
      render();
      showToast("Метка шаблона обновлена.", "success");
    } catch (error) {
      if (previousLayout?.id) state.layouts[previousLayout.id] = previousLayout;
      saveState({ sync: false });
      render();
      if (error?.isAdminApiCompatibilityError) {
        updateSyncUi();
        showToast(error.message, "error");
      } else {
        updateSyncUi(`Не удалось сохранить метку шаблона: ${error.message}`);
        showToast(`Не удалось сохранить метку шаблона: ${error.message}`, "error");
      }
    } finally {
      refs.saveEditedLayoutBtn.disabled = false;
    }
    return;
  }
  saveLayoutMutation(layout.id);
  refs.layoutEditDialog.close();
  render();
  showToast("Укладка обновлена.", "success");
}

function openLayoutCopyDialog() {
  const layout = state.layouts?.[layoutEditTargetId];
  if (!layout || !canManageLayout(layout.id)) return;
  layoutCopyTargetId = layout.id;
  refs.layoutCopyTitle.textContent = layoutCopyTitle(layout);
  refs.layoutCopyName.value = isAdminEditablePublishedLayout(layout.id)
    ? uniquePublishedTemplateName(layout.name || "Шаблон", { exceptLayoutId: layout.id })
    : uniqueLayoutName(layout.name || "Новая укладка");
  openModalDialog(refs.layoutCopyDialog);
}

function setLayoutCopySaving(saving) {
  const active = Boolean(saving);
  if (!refs.saveLayoutCopyBtn) return;
  refs.saveLayoutCopyBtn.disabled = active;
  refs.saveLayoutCopyBtn.classList.toggle("button-loading", active);
  refs.saveLayoutCopyBtn.setAttribute("aria-busy", active ? "true" : "false");
}

async function saveLayoutCopy(event) {
  event.preventDefault();
  const layout = state.layouts?.[layoutCopyTargetId || layoutEditTargetId];
  if (!layout || !canManageLayout(layout.id)) return;
  const requestedName = refs.layoutCopyName.value.trim();
  if (!requestedName) return;
  const language = isAdminEditablePublishedLayout(layout.id)
    ? normalizeUiLanguage(refs.layoutEditLanguage.value || layoutManageLanguage(layout, uiLanguage))
    : "";
  setLayoutCopySaving(true);
  try {
    const copyingAdminTemplate = isAdminEditablePublishedLayout(layout.id);
    const createdId = copyingAdminTemplate
      ? await createTemplateCopyFromSource(layout, requestedName, { language, activate: false, renderAfter: false })
      : createLayoutCopyFromSource(layout, requestedName, { language });
    if (!createdId) return;
    if (copyingAdminTemplate) {
      try {
        updateSyncUi("Сохраняю копию шаблона на сервере...");
        await savePublishedLayoutRecord(createdId);
        const confirmedCopy = state.layouts?.[createdId];
        const confirmedSharedId = confirmedCopy?.adminSharedSourceId || "";
        if (!confirmedSharedId || !serverConfirmedSharedLayouts.some((entry) => entry?.id === confirmedSharedId)) {
          throw new Error("Сервер не подтвердил копию шаблона.");
        }
        activateAdminPublishedLayout(createdId);
      } catch (error) {
        removeLayoutTree(createdId, state, { save: false });
        saveState({ sync: false });
        render();
        throw error;
      } finally {
        updateSyncUi();
      }
    }
    refs.layoutCopyDialog.close();
    refs.layoutEditDialog.close();
    if (!copyingAdminTemplate) switchView("bags");
    showToast(copyingAdminTemplate ? "Шаблон скопирован." : "Укладка скопирована.", "success");
  } catch (error) {
    showToast(`Не удалось скопировать шаблон: ${error.message}`, "error");
  } finally {
    setLayoutCopySaving(false);
  }
}

async function confirmDeleteEditedLayout() {
  const layout = state.layouts?.[layoutEditTargetId];
  if (!layout || !canDeleteManagedLayout(layout.id)) {
    showToast("Эту укладку нельзя удалить.", "error");
    return;
  }
  if (isAdminEditablePublishedLayout(layout.id)) {
    await confirmDeleteManagedPublicLayout(layout.id);
    return;
  }
  await confirmDeleteEditableLayout(layout.id);
}

async function confirmDeleteEditableLayout(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || layoutId !== state.activeLayoutId || !canDeleteActiveLayout()) return;
  const containerCount = getLayoutContainerIdSet(layout).size;
  const itemCount = getLayoutItemIdSet(layout).size;
  const isLastLayout = userEditableLayouts().length <= 1;
  const confirmed = await askConfirmDialog(privateLayoutDeleteConfirm({
    layout,
    containerCount,
    itemText: formatThingCount(itemCount),
    isLastLayout
  }));
  if (!confirmed) return;
  refs.layoutEditDialog.close();
  deleteActiveLayout();
}

async function confirmDeleteManagedPublicLayout(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || !isAdminEditablePublishedLayout(layoutId)) return;
  const containerCount = getLayoutContainerIdSet(layout).size;
  const itemCount = getLayoutItemIdSet(layout).size;
  const shouldDeletePublishedTemplate = shouldDeletePublishedSharedTemplateForLayout(layout);
  const confirmed = await askConfirmDialog(publicLayoutDeleteConfirm({
    layout,
    containerCount,
    itemText: formatThingCount(itemCount),
    deletePublished: shouldDeletePublishedTemplate
  }));
  if (!confirmed) return;
  refs.layoutEditDialog.close();
  await deleteManagedPublicLayout(layoutId);
}

async function deletePublishedSharedTemplate(sharedId, sourceLayout = null) {
  const runtimeLayout = findSharedLayout(sharedId);
  const deletedName = runtimeLayout?.name || sourceLayout?.name || sharedId;
  const deletedLanguage = runtimeLayout?.language || sourceLayout?.language || uiLanguage;
  const deleted = await deletePublishedSharedTemplateRecord({
    sharedId,
    apiFetch,
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    layoutsByLanguage: sharedLayoutsByLanguage,
    removePublicIndexEntry: removePublicSharedLayoutIndexEntry,
    warn: (...args) => {
      if (typeof console !== "undefined" && console.warn) console.warn(...args);
    }
  });
  if (deleted) {
    rememberDeletedSharedLayoutId(sharedId);
    serverConfirmedSharedLayouts = serverConfirmedSharedLayouts.filter((layout) => layout?.id !== sharedId);
    purgeDeletedSharedTemplateFromFrontendState({
      targetState: state,
      layoutsByLanguage: sharedLayoutsByLanguage,
      sharedId,
      name: deletedName,
      language: deletedLanguage
    });
  }
  return deleted;
}

function shouldDeletePublishedSharedTemplateForLayout(layout) {
  const target = publishedLayoutTarget(layout);
  if (target?.type !== "shared" || !target.sharedId) return false;
  if (layout?.adminTemplateCopy) return true;
  const sharedLayout = findSharedLayout(target.sharedId);
  return Boolean(sharedLayout?.runtimeSharedTemplate);
}

async function deleteManagedPublicLayout(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || !isAdminEditablePublishedLayout(layoutId)) return;
  const target = publishedLayoutTarget(layout);
  const shouldDeletePublishedTemplate = shouldDeletePublishedSharedTemplateForLayout(layout);
  const nextSharedLayout = shouldDeletePublishedTemplate && target?.type === "shared"
    ? nextServerConfirmedSharedLayoutAfter(target.sharedId)
    : null;
  if (shouldDeletePublishedTemplate) {
    try {
      await assertAdminApiCompatibility({ force: true });
      updateSyncUi("Удаляю shared-шаблон...");
      await deletePublishedSharedTemplate(target.sharedId, layout);
      updateSyncUi();
    } catch (error) {
      updateSyncUi();
      showToast(`Не удалось удалить shared-шаблон: ${error.message}`, "error");
      return;
    }
  }
  if (shouldDeletePublishedTemplate && target?.type === "shared") {
    removeManagedSharedTemplateTreesFromState(state, {
      sharedId: target.sharedId,
      name: layout.name,
      language: layout.language || uiLanguage
    });
  } else {
    removeLayoutTree(layoutId, state, { save: false });
  }
  saveState({ sync: false });
  if (shouldDeletePublishedTemplate) {
    if (nextSharedLayout?.id) await openSharedLayoutForAdmin(nextSharedLayout.id);
    else await openAdminDemoLayout({ language: layout.language || uiLanguage });
  } else if (target?.type === "shared" && target.sharedId) {
    await openSharedLayoutForAdmin(target.sharedId);
  } else {
    await openAdminDemoLayout({ language: layout.language || uiLanguage });
  }
  showToast(shouldDeletePublishedTemplate ? "Shared-шаблон удален с сервера." : "Шаблон удален из локальных правок.", "success");
}

function userEditableLayouts() {
  return Object.values(state.layouts || {}).filter((layout) =>
    layout &&
    canUseLocalEditableState(layout.id) &&
    !layout.adminDemo &&
    !layout.adminSharedSourceId
  );
}

function canDeleteActiveLayout() {
  const layout = state.layouts?.[state.activeLayoutId];
  return Boolean(
    layout &&
    userEditableLayouts().some((entry) => entry.id === layout.id) &&
    !isReadOnlyStateScope() &&
    !isSharedLayoutView()
  );
}

function confirmDeleteActiveLayout() {
  const layout = state.layouts?.[state.activeLayoutId];
  if (!canDeleteActiveLayout() || !layout) {
    showToast("Эту укладку нельзя удалить.", "error");
    return;
  }
  const containerCount = getLayoutContainerIdSet(layout).size;
  const itemCount = getLayoutItemIdSet(layout).size;
  const isLastLayout = userEditableLayouts().length <= 1;
  openConfirmDialog({
    ...privateLayoutDeleteConfirm({
      layout,
      containerCount,
      itemText: formatThingCount(itemCount),
      isLastLayout
    }),
    onConfirm: () => deleteActiveLayout()
  });
}

function deleteActiveLayout() {
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  if (!canDeleteActiveLayout() || !layout) return;
  captureActiveLayoutArrangement();
  const remainingLayouts = userEditableLayouts().filter((entry) => entry.id !== layoutId);
  let nextLayoutId = remainingLayouts[0]?.id || "";
  if (!nextLayoutId) {
    const changedAt = nowIso();
    nextLayoutId = `layout-${Date.now()}`;
    const arrangement = createEmptyLayoutArrangement();
    const activeLayoutDictionaries = ensureLayoutDictionaries(state.layouts?.[state.activeLayoutId]);
    state.layouts[nextLayoutId] = {
      id: nextLayoutId,
      name: uniqueLayoutName("Новая укладка"),
      rootContainerIds: [],
      arrangement,
      locations: [...(activeLayoutDictionaries?.locations || locations)],
      categories: [...(activeLayoutDictionaries?.categories || categories)],
      ...(!canUsePrivateState() ? { [GUEST_DEMO_COPY_FLAG]: true } : {}),
      ...currentCreateMeta(changedAt)
    };
  }
  delete state.layouts[layoutId];
  state.activeLayoutId = nextLayoutId;
  if (canUsePrivateState()) setActivePrivateScope();
  else setActiveLocalEditableScope(nextLayoutId);
  applyLayoutArrangement(nextLayoutId);
  rememberActiveLayoutChoice(nextLayoutId);
  saveState();
  render();
  showToast("Укладка удалена.", "success");
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
  if (itemDialogPhotoDraft) return `draft:${itemPhotoSignature({ photos: itemDialogPhotoDraft.photos })}:${itemDialogPhotoDraft.deletedPhotos.length}`;
  return editingItemId ? itemPhotoSignature(state.items[editingItemId]) : "";
}

async function handleItemPhotoInputChange(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    setItemDialogPhotoStatus("Готовлю фото...");
    const photos = [];
    for (const file of files) {
      photos.push(await createItemPhotoFromFile(file));
    }
    const limit = usageLimitForRole("photosPerRecord", canOpenAdminPublishedEdit());
    const source = editingItemId ? state.items[editingItemId] : { photos: [] };
    const draft = itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
    const result = addPhotosToDraft(draft, photos, limit);
    itemDialogPhotoDraft = result.draft;
    if (result.rejected.length) showToast(usageLimitExceededMessage("photosPerRecord", limit), "warning");
    itemDialogPhotoActiveIndex = Math.max(0, itemDialogPhotoDraft.photos.length - result.accepted.length);
    updateItemDialogPhotoPreview(itemDialogPhotoDraft.photos);
    updateItemDialogSaveState();
  } catch (error) {
    setItemDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  } finally {
    if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  }
}

function removeItemDialogPhoto() {
  const source = editingItemId ? state.items[editingItemId] : { photos: [] };
  const draft = itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = removePhotoFromDraft(draft, itemDialogPhotoActiveIndex);
  itemDialogPhotoDraft = result.draft;
  itemDialogPhotoActiveIndex = result.nextIndex;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview(itemDialogPhotoDraft.photos);
  updateItemDialogSaveState();
}

function resetItemDialogPhotoDraft() {
  itemDialogPhotoDraft = null;
  revokeObjectUrls(itemDialogPhotoObjectUrls);
  itemDialogPhotoObjectUrls = [];
  itemDialogPhotoActiveIndex = 0;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  updateItemDialogPhotoPreview([]);
}

async function updateItemDialogPhotoPreview(photos) {
  if (!refs.itemPhotoPreview) return;
  revokeObjectUrls(itemDialogPhotoObjectUrls);
  itemDialogPhotoObjectUrls = [];
  const list = Array.isArray(photos) ? photos : (photos ? [photos] : []);
  if (!list.length) {
    refs.itemPhotoPreview.innerHTML = "";
    refs.itemPhotoPreview.classList.add("empty");
    refs.itemPhotoRemoveBtn.hidden = true;
    setItemDialogPhotoStatus("");
    return;
  }
  const rendered = await renderPhotoGalleryHtml(list, {
    objectUrls: itemDialogPhotoObjectUrls,
    activeIndex: itemDialogPhotoActiveIndex,
    className: "dialog-photo-gallery"
  });
  refs.itemPhotoPreview.innerHTML = rendered;
  refs.itemPhotoPreview.classList.toggle("empty", !rendered);
  refs.itemPhotoRemoveBtn.hidden = false;
  bindPhotoGalleries(refs.itemPhotoPreview);
  setItemDialogPhotoStatus(photoStatusText(list));
}

async function getLocalPhotoPreviewUrl(photo) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  itemDialogPhotoObjectUrls.push(url);
  return url;
}

function setItemDialogPhotoStatus(message) {
  if (refs.itemPhotoStatus) refs.itemPhotoStatus.textContent = message || "";
}

function revokeObjectUrls(urls) {
  (Array.isArray(urls) ? urls : [urls]).filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
}

async function renderPhotoGalleryHtml(photos, { objectUrls = [], activeIndex = 0, className = "" } = {}) {
  const slides = [];
  for (const photo of photos) {
    slides.push(await renderPhotoPreviewSlide(photo, objectUrls));
  }
  return `
    <div class="item-photo ${className}" data-photo-gallery data-photo-initial-index="${Math.max(0, Number(activeIndex) || 0)}">
      <div class="photo-gallery-track">
        ${slides.join("")}
      </div>
      ${renderPhotoDots(photos.length, activeIndex)}
    </div>
  `;
}

async function renderPhotoPreviewSlide(photo, objectUrls = []) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  const fullBlob = cached?.blob || cached?.thumbBlob;
  const localSrc = blob ? URL.createObjectURL(blob) : "";
  const fullLocalSrc = fullBlob && fullBlob !== blob ? URL.createObjectURL(fullBlob) : localSrc;
  if (localSrc) objectUrls.push(localSrc);
  if (fullLocalSrc && fullLocalSrc !== localSrc) objectUrls.push(fullLocalSrc);
  const remoteSrc = photoRemoteSrc(photo);
  const fullSrc = fullLocalSrc || (photo.url ? versionedPhotoUrl(normalizeRemotePhotoUrl(photo.url), photo.updatedAt || photo.id || "") : remoteSrc);
  const src = localSrc || remoteSrc || "";
  const localId = photo.localId || photo.id || "";
  return `
    <button class="photo-gallery-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${fullSrc ? `data-photo-full-src="${escapeHtml(fullSrc)}"` : ""}
        ${localId ? `data-photo-local-source-id="${escapeHtml(localId)}"` : ""}
        alt=""
      />
    </button>
  `;
}

function photoStatusText(photos) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) return "";
  if (list.some((photo) => photo.status === "error")) return "Ошибка загрузки фото";
  if (list.some((photo) => photo.status === "missing-local-file")) return "Нет локального файла фото";
  if (list.some((photo) => photo.status === "uploading")) return "Фото загружается";
  if (list.some((photo) => photo.status === "pending")) return "Фото сохранено локально и ждёт синхронизации";
  return list.length > 1 ? `${list.length} фото загружено` : "Фото загружено";
}

function getRootContainerDialogPhotoSnapshot() {
  if (rootContainerDialogPhotoDraft) return `draft:${itemPhotoSignature({ photos: rootContainerDialogPhotoDraft.photos })}:${rootContainerDialogPhotoDraft.deletedPhotos.length}`;
  return editingRootContainerId ? itemPhotoSignature(state.containers[editingRootContainerId]) : "";
}

async function handleRootContainerPhotoInputChange(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    setRootContainerDialogPhotoStatus("Готовлю фото...");
    const photos = [];
    for (const file of files) {
      photos.push(await createItemPhotoFromFile(file));
    }
    const limit = usageLimitForRole("photosPerRecord", canOpenAdminPublishedEdit());
    const source = editingRootContainerId ? state.containers[editingRootContainerId] : { photos: [] };
    const draft = rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
    const result = addPhotosToDraft(draft, photos, limit);
    rootContainerDialogPhotoDraft = result.draft;
    if (result.rejected.length) showToast(usageLimitExceededMessage("photosPerRecord", limit), "warning");
    rootContainerDialogPhotoActiveIndex = Math.max(0, rootContainerDialogPhotoDraft.photos.length - result.accepted.length);
    updateRootContainerDialogPhotoPreview(rootContainerDialogPhotoDraft.photos);
    updateRootContainerDialogSaveState();
  } catch (error) {
    setRootContainerDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  } finally {
    if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  }
}

function removeRootContainerDialogPhoto() {
  const source = editingRootContainerId ? state.containers[editingRootContainerId] : { photos: [] };
  const draft = rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = removePhotoFromDraft(draft, rootContainerDialogPhotoActiveIndex);
  rootContainerDialogPhotoDraft = result.draft;
  rootContainerDialogPhotoActiveIndex = result.nextIndex;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview(rootContainerDialogPhotoDraft.photos);
  updateRootContainerDialogSaveState();
}

function resetRootContainerDialogPhotoDraft() {
  rootContainerDialogPhotoDraft = null;
  revokeObjectUrls(rootContainerDialogPhotoObjectUrls);
  rootContainerDialogPhotoObjectUrls = [];
  rootContainerDialogPhotoActiveIndex = 0;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  updateRootContainerDialogPhotoPreview([]);
}

async function updateRootContainerDialogPhotoPreview(photos) {
  if (!refs.rootContainerPhotoPreview) return;
  revokeObjectUrls(rootContainerDialogPhotoObjectUrls);
  rootContainerDialogPhotoObjectUrls = [];
  const list = Array.isArray(photos) ? photos : (photos ? [photos] : []);
  if (!list.length) {
    refs.rootContainerPhotoPreview.innerHTML = "";
    refs.rootContainerPhotoPreview.classList.add("empty");
    refs.rootContainerPhotoRemoveBtn.hidden = true;
    setRootContainerDialogPhotoStatus("");
    return;
  }
  const rendered = await renderPhotoGalleryHtml(list, {
    objectUrls: rootContainerDialogPhotoObjectUrls,
    activeIndex: rootContainerDialogPhotoActiveIndex,
    className: "dialog-photo-gallery"
  });
  refs.rootContainerPhotoPreview.innerHTML = rendered;
  refs.rootContainerPhotoPreview.classList.toggle("empty", !rendered);
  refs.rootContainerPhotoRemoveBtn.hidden = false;
  bindPhotoGalleries(refs.rootContainerPhotoPreview);
  setRootContainerDialogPhotoStatus(photoStatusText(list));
}

async function getLocalRootContainerPhotoPreviewUrl(photo) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  rootContainerDialogPhotoObjectUrls.push(url);
  return url;
}

function setRootContainerDialogPhotoStatus(message) {
  if (refs.rootContainerPhotoStatus) refs.rootContainerPhotoStatus.textContent = message || "";
}

function readItemDialogQuantity() {
  return normalizeItemQuantity(refs.itemQuantity?.value);
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
  const dimensions = readRootContainerDialogDimensions();
  return {
    name: refs.rootContainerName.value.trim(),
    weight: parseWeightInput(refs.rootContainerWeight.value),
    volume: parseVolumeInput(refs.rootContainerVolume.value),
    color: normalizeContainerColor(refs.rootContainerColor?.value),
    width: dimensions.width,
    height: dimensions.height,
    depth: dimensions.depth,
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

function updateItemDialogSaveState() {
  if (!refs.saveItemBtn) return;
  const snapshot = getItemDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !itemDialogInitialSnapshot || !snapshotsEqual(snapshot, itemDialogInitialSnapshot);
  updateModalSaveButton(refs.saveItemBtn, { hasName, changed });
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
  updateModalSaveButton(refs.saveRootContainerBtn, { hasName, changed });
}

function updateModalSaveButton(button, { hasName, changed }) {
  button.disabled = !hasName || !changed;
  button.classList.toggle("muted-save", button.disabled);
  if (!changed) {
    button.textContent = "Изменений нет";
    button.title = "Изменений нет, всё сохранено";
    button.setAttribute("aria-label", "Изменений нет, всё сохранено");
    return;
  }
  if (!hasName) {
    button.textContent = "Введите название";
    button.title = "Введите название, чтобы сохранить";
    button.setAttribute("aria-label", "Введите название, чтобы сохранить");
    return;
  }
  button.textContent = "Сохранить";
  button.removeAttribute("title");
  button.removeAttribute("aria-label");
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
  if (!container && !requireUsageCapacity("containers")) return;
  const dimensions = readRootContainerDialogDimensions();
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
      ...(hasContainerDimensions(dimensions) ? { dimensions } : {}),
      location: refs.rootContainerLocation.value || defaultRootContainerLocation(state),
      note: refs.rootContainerNote.value.trim(),
      photos: rootContainerDialogPhotoDraft?.photos ? [...rootContainerDialogPhotoDraft.photos] : [],
      ...currentCreateMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.containers[id]);
    closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
    saveLayoutMutation(getPublishedEditLayoutId(), { publishDelay: 500 });
    render();
    return;
  }
  container.name = name;
  container.weight = parseWeightInput(refs.rootContainerWeight.value);
  container.volume = parseVolumeInput(refs.rootContainerVolume.value);
  container.color = normalizeContainerColor(refs.rootContainerColor?.value);
  applyRootContainerDimensions(container, dimensions);
  container.location = refs.rootContainerLocation.value || defaultRootContainerLocation(state);
  container.note = refs.rootContainerNote.value.trim();
  applyRootContainerDialogPhotoDraft(container, changedAt);
  markRecordActivePublicCatalog(container);
  touchContainer(container.id, changedAt);
  applyRootContainerDialogParent(changedAt);
  applyRootContainerDialogPlacement();
  closeDialogWithoutRestoringFocus(refs.rootContainerDialog);
  saveLayoutMutation(getPublishedEditLayoutId(), { publishDelay: 500 });
  render();
}

function saveDialogItem(event) {
  event?.preventDefault();
  if (refs.saveItemBtn.disabled) return;
  const name = refs.itemName.value.trim();
  if (!name) return;
  const containerId = refs.itemContainer.value;
  const layoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  capturePackingScroll();
  const changedAt = nowIso();
  const selectedCategories = getDialogSelectedCategories();

  if (editingItemId) {
    const item = state.items[editingItemId];
    const previousContainerId = getItemContainerIdInLayout(layout, editingItemId);
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
      closeDialogWithoutRestoringFocus(refs.dialog);
      if (containerId) {
        if (!placeExistingItemInLayout(editingItemId, containerId, layoutId, { changedAt })) {
          showToast("Не удалось добавить вещь в эту укладку.", "error");
          return;
        }
        saveLayoutMutation(layoutId);
        render();
        return;
      }
      removeItemFromLayoutArrangement(layout, editingItemId);
      cleanupEmptyContainersInLayoutArrangement(layout, previousContainerId);
      touchLayout(layoutId, changedAt);
      if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
      saveLayoutMutation(layoutId);
      render();
      return;
    }
  } else {
    if (!requireUsageCapacity("items")) return;
    const id = `item-${Date.now()}`;
    state.items[id] = {
      id,
      name,
      weight: parseWeightInput(refs.itemWeight.value),
      quantity: readItemDialogQuantity(),
      location: refs.itemLocation.value,
      category: selectedCategories[0],
      categories: selectedCategories,
      containerId: "",
      note: refs.itemNote.value.trim(),
      photos: itemDialogPhotoDraft?.photos ? [...itemDialogPhotoDraft.photos] : [],
      ...currentEditMeta(changedAt)
    };
    markRecordActivePublicCatalog(state.items[id]);
    if (containerId && state.containers[containerId] && layout) {
      if (!placeExistingItemInLayout(id, containerId, layoutId, { changedAt })) {
        delete state.items[id];
        showToast("Не удалось добавить вещь в эту укладку.", "error");
        return;
      }
    }
  }

  saveLayoutMutation(layoutId);
  closeDialogWithoutRestoringFocus(refs.dialog);
  render();
}

function applyItemDialogPhotoDraft(item, changedAt = nowIso()) {
  if (!itemDialogPhotoDraft || !photoDraftChanged(itemDialogPhotoDraft, item)) return;
  item.photos = [...itemDialogPhotoDraft.photos];
  itemDialogPhotoDraft.deletedPhotos.forEach((photo) => {
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(item.id, photo);
  });
  markEdited(item, changedAt);
}

function applyRootContainerDialogPhotoDraft(container, changedAt = nowIso()) {
  if (!rootContainerDialogPhotoDraft || !photoDraftChanged(rootContainerDialogPhotoDraft, container)) return;
  container.photos = [...rootContainerDialogPhotoDraft.photos];
  rootContainerDialogPhotoDraft.deletedPhotos.forEach((photo) => {
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(container.id, photo, "container");
  });
  markEdited(container, changedAt);
}

function applyRootContainerDialogParent(changedAt = nowIso()) {
  if (rootContainerDialogPendingParentId === undefined || !editingRootContainerId) return false;
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  const container = state.containers[editingRootContainerId];
  const targetParent = state.containers[rootContainerDialogPendingParentId];
  const placement = layout?.arrangement?.containers?.[editingRootContainerId];
  if (!layout || !container || !placement?.parentId || !targetParent) return false;
  if (container.id === targetParent.id) return false;
  const requestedIndex = rootContainerDialogPendingParentIndex;
  if (placement.parentId === targetParent.id && requestedIndex === null) return false;
  const insertIndex = normalizeContainerParentInsertIndex(container.id, targetParent.id, requestedIndex);
  if (!moveContainerInLayoutArrangement(layout, container.id, targetParent.id, insertIndex)) return false;
  state.collapsedContainers[targetParent.id] = false;
  touchLayout(layoutId, changedAt);
  applyLayoutArrangement(layoutId);
  return true;
}

function normalizeContainerParentInsertIndex(containerId, targetParentId, requestedIndex) {
  if (!Number.isFinite(requestedIndex)) return null;
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  const placement = layout?.arrangement?.containers?.[containerId];
  const targetPlacement = layout?.arrangement?.containers?.[targetParentId];
  if (!placement || !targetPlacement) return requestedIndex;
  const currentIndex = (targetPlacement.order || []).findIndex((entry) => entry.type === "container" && entry.id === containerId);
  if (placement.parentId === targetParentId && currentIndex >= 0 && currentIndex < requestedIndex) return requestedIndex - 1;
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
  return sortCatalogRecords(items, itemSortMode, { createdTime: itemCreatedTime });
}

function getItemsForActiveCatalog() {
  return Object.entries(state.items)
    .filter(([itemId, item]) => isPrivateCatalogItemRecord(itemId, item))
    .map(([, item]) => item)
    .filter((item) => isItemInActiveCatalog(item));
}

function itemCreatedTime(item) {
  return itemCreatedTimeForState(item);
}

function getItemsUsageCounts() {
  return createItemUsageCounts(getItemsForActiveCatalog(), {
    matchesItem: matchesItemsViewFilters,
    isAwayFromHomeAndBike: isItemAwayFromHomeAndBike,
    isWithoutWeight: isItemWithoutWeight,
    isInCurrentLayout: isItemInActiveLayout
  });
}

function isScopedCatalogLayout(layoutId = getPublishedEditLayoutId()) {
  return isAdminEditablePublishedLayout(layoutId);
}

function getPublicLayoutRecordIdsForState(targetState = state) {
  return collectPublicLayoutRecordIds(targetState, {
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState
  });
}

function isPublicCatalogItemRecord(itemId, item) {
  return isPublicCatalogItemRecordForState(itemId, item, {
    publicRecordIds: getPublicLayoutRecordIdsForState(),
    isPublicSyncItem
  });
}

function isPublicCatalogContainerRecord(containerId, container) {
  return isPublicCatalogContainerRecordForState(containerId, container, {
    publicRecordIds: getPublicLayoutRecordIdsForState(),
    isPublicSyncContainer
  });
}

function isPrivateCatalogItemRecord(itemId, item) {
  return isPrivateCatalogRecord({
    scoped: isScopedCatalogLayout(),
    isPublic: isPublicCatalogItemRecord(itemId, item)
  });
}

function isPrivateCatalogContainerRecord(containerId, container) {
  return isPrivateCatalogRecord({
    scoped: isScopedCatalogLayout(),
    isPublic: isPublicCatalogContainerRecord(containerId, container)
  });
}

function isItemInActiveCatalog(item) {
  const layoutId = getPublishedEditLayoutId();
  return isItemInCatalogForState(state, getPublishedWorkLayout(layoutId), item, {
    scoped: isScopedCatalogLayout(layoutId),
    catalogLayoutId: layoutId
  });
}

function markRecordActivePublicCatalog(record) {
  if (!record || !isScopedCatalogLayout()) return;
  record.publicCatalogLayoutId = getPublishedEditLayoutId();
}

function isItemAwayFromHomeAndBike(item) {
  return isItemAwayFromHomeAndBikeValue(item);
}

function isItemWithoutWeight(item) {
  return isItemWithoutWeightValue(item);
}

function isItemInActiveLayout(item) {
  return isItemInLayoutForState(state, getPublishedWorkLayout(), item);
}

function getActiveLayoutContainerIdSet(layout = state.layouts[state.activeLayoutId]) {
  return getLayoutContainerIdSet(layout);
}

function getVisibleLayoutRootIds(layout = getPublishedWorkLayout()) {
  return getVisibleLayoutRootIdsForState(state, layout, {
    includeGenerated: isReadOnlyStateScope() || isAdminEditablePublishedLayout(layout?.id)
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
  return matchesCollectionFilterValue(item, {
    collectionMode: state.collectionMode,
    showOnlyUnpacked: state.showOnlyUnpacked,
    isPacked: isItemPacked
  });
}

function matchesItemFieldsFilter(item, { includeContainerPath = false, ignoreLocation = false, ignoreCategories = false } = {}) {
  return matchesItemFieldsFilterValue(item, {
    query: refs.searchInput.value,
    location: refs.locationFilter.value,
    categories: selectedCategoryFilters,
    includeContainerPath,
    ignoreLocation,
    ignoreCategories,
    itemCategories,
    containerPath
  });
}

function getAllContainers() {
  return sortCatalogRecords(Object.values(state.containers), "asc", {
    createdTime: containerCreatedTime,
    name: (container) => containerPath(container.id)
  });
}

function getDescendantContainerIds(containerId) {
  return getDescendantContainerIdsForState(state, containerId);
}

function getRootContainers() {
  const roots = Object.values(state.containers)
    .filter((container) => isPrivateCatalogContainerRecord(container.id, container))
    .filter(isRootContainerForEditor);
  return sortCatalogRecords(roots, "asc");
}

function getRootContainersForSettings() {
  const roots = Object.values(state.containers).filter((container) => {
    if (!isPrivateCatalogContainerRecord(container.id, container)) return false;
    if (!isRootContainerForEditor(container)) return false;
    if (!isRootContainerInActiveCatalog(container)) return false;
    if (rootContainerUsageFilter === "current" && !isRootContainerInActiveLayout(container.id)) return false;
    if (rootContainerUsageFilter === "unused" && isRootContainerInActiveLayout(container.id)) return false;
    if (!matchesRootContainerFieldsFilter(container)) return false;
    return true;
  });
  return sortCatalogRecords(roots, rootContainerSortMode, { createdTime: containerCreatedTime });
}

function matchesRootContainerFieldsFilter(container, { ignoreLocation = false } = {}) {
  const containerLocation = container.location || defaultRootContainerLocation(state);
  return matchesRootContainerFieldsFilterValue(container, {
    query: refs.searchInput.value,
    location: refs.locationFilter.value,
    containerLocation,
    ignoreLocation
  });
}

function getRootContainerUsageCounts() {
  return createRootContainerUsageCounts(Object.values(state.containers), {
    isEligible: (container) =>
      isPrivateCatalogContainerRecord(container.id, container) &&
      isRootContainerForEditor(container) &&
      isRootContainerInActiveCatalog(container),
    isInCurrentLayout: isRootContainerInActiveLayout
  });
}

function isRootContainerInActiveLayout(containerId) {
  return isRootContainerInLayoutForState(getPublishedWorkLayout(), containerId);
}

function isRootContainerForEditor(container) {
  return isRootContainerForEditorForState(state, getPublishedWorkLayout(), container);
}

function isNestedContainerInAnyLayoutArrangement(containerId) {
  return isNestedContainerInAnyLayoutArrangementForState(state, containerId);
}

function isRootContainerInActiveCatalog(container) {
  const layoutId = getPublishedEditLayoutId();
  return isRootContainerInCatalogForState(state, getPublishedWorkLayout(layoutId), container, {
    scoped: isScopedCatalogLayout(layoutId),
    catalogLayoutId: layoutId
  });
}

function containerCreatedTime(container) {
  return containerCreatedTimeForState(container);
}

function containerPath(containerId) {
  return containerPathForState(state, containerId);
}

function containerWeight(containerId) {
  return containerWeightForState(state, containerId);
}

function rootContainerOwnWeight(containerId) {
  return rootContainerOwnWeightForState(state, containerId);
}

function itemQuantity(item) {
  return itemQuantityForState(item);
}

function itemTotalWeight(item) {
  return itemTotalWeightForState(item);
}

function openBackupDialog() {
  backupImportState = null;
  if (refs.backupFileInput) refs.backupFileInput.value = "";
  renderBackupRules(refs.backupRules);
  setBackupStatus("");
  resetBackupImportUi(refs);
  openModalDialog(refs.backupDialog);
}

function setBackupStatus(message, type = "") {
  if (!refs.backupStatus) return;
  refs.backupStatus.className = `dialog-status ${type}`.trim();
  refs.backupStatus.textContent = message || "";
}

async function fetchBackupPhotoBlob(photo, variant = "file") {
  const localId = photo.localId || photo.id;
  const cached = localId ? await getCachedPhoto(localId) : null;
  if (cached) {
    if (variant === "thumb" && cached.thumbBlob) return cached.thumbBlob;
    if (cached.blob) return cached.blob;
  }
  const src = variant === "thumb" ? (photo.thumbUrl || photo.url) : (photo.url || photo.thumbUrl);
  if (!src) return null;
  const response = await fetch(src, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`Фото ${photo.id || ""}: HTTP ${response.status}`);
  return await response.blob();
}

function buildCurrentBackupManifest(snapshot, photos) {
  const admin = canOpenAdminPublishedEdit()
    ? {
        demoStates: SUPPORTED_LANGUAGES.map((language) => ({
          language,
          payload: demoStatePayloadForLanguage(language)
        })).filter((entry) => entry.payload),
        sharedLayouts: SUPPORTED_LANGUAGES.map((language) => ({
          language,
          layouts: clone(currentSharedLayouts(language))
        }))
      }
    : null;
  return buildBackupManifest({
    state: snapshot,
    photos,
    appVersion: APP_VERSION,
    language: uiLanguage,
    admin,
    now: nowIso()
  });
}

async function createBackupArchive() {
  try {
    setBackupStatus("Собираю данные и подтягиваю фото...");
    captureActiveLayoutArrangement();
    const snapshot = clone(state);
    const adminPhotoSnapshots = canOpenAdminPublishedEdit()
      ? SUPPORTED_LANGUAGES.map((language) => demoStatePayloadForLanguage(language)).filter(Boolean)
      : [];
    const { entries: photoEntries, photos, missing } = await buildBackupPhotoEntries(snapshot, {
      extraSnapshots: adminPhotoSnapshots,
      normalizePhotos: normalizeItemPhotos,
      fetchPhotoBlob: fetchBackupPhotoBlob
    });
    const manifest = buildCurrentBackupManifest(snapshot, photos);
    const zip = await createBackupZip(manifest, photoEntries);
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupDownloadName();
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatus(
      missing.length
        ? `Архив создан, но ${missing.length} фото не удалось подтянуть. Проверьте старые/недоступные фото.`
        : `Архив создан: ${Object.keys(snapshot.layouts || {}).length} укладок, ${photos.length} фото.`,
      missing.length ? "error" : "success"
    );
  } catch (error) {
    setBackupStatus(`Не удалось создать архив: ${error.message}`, "error");
  }
}

async function handleBackupFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setBackupStatus("Читаю архив...");
    const { manifest, photoFiles } = await readBackupArchiveFile(file);
    const backupState = normalizeRemoteState(manifest.data?.state || manifest.state);
    if (!backupState) throw new Error("В архиве нет корректного состояния.");
    backupImportState = { manifest, state: backupState, photoFiles, selectedLayoutIds: new Set() };
    renderBackupAnalysis();
    setBackupStatus(`Архив прочитан: ${Object.keys(backupState.layouts || {}).length} укладок, ${photoFiles.size} фото.`, "success");
  } catch (error) {
    backupImportState = null;
    resetBackupImportUi(refs);
    setBackupStatus(`Не удалось прочитать архив: ${error.message}`, "error");
  }
}

function backupLayoutRows() {
  return backupImportState ? buildBackupLayoutRows(backupImportState.state, state) : [];
}

function selectedBackupLayoutIds() {
  return selectedBackupLayoutIdsFromUi(refs.backupAnalysis);
}

function summarizeSelectedBackupLayouts(layoutIds = new Set()) {
  if (!backupImportState) return { replace: 0, create: 0, newItems: [], newContainers: [], photos: [] };
  return summarizeBackupLayouts({
    backupState: backupImportState.state,
    currentState: state,
    photoFiles: backupImportState.photoFiles,
    layoutIds,
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    normalizePhotos: normalizeItemPhotos
  });
}

function renderBackupAnalysis() {
  if (!backupImportState || !refs.backupAnalysis) return;
  const rows = backupLayoutRows();
  backupImportState.selectedLayoutIds = new Set(rows.map((row) => row.layout.id));
  renderBackupAnalysisUi(refs, {
    backupState: backupImportState.state,
    rows,
    photoCount: backupImportState.photoFiles.size
  });
  updateBackupSelectionSummary();
}

function handleBackupSelectionChange(event) {
  if (!event.target.closest("[data-backup-layout-id]")) return;
  updateBackupSelectionSummary();
}

function updateBackupSelectionSummary() {
  if (!backupImportState) return;
  backupImportState.selectedLayoutIds = selectedBackupLayoutIds();
  const summary = summarizeSelectedBackupLayouts(backupImportState.selectedLayoutIds);
  renderBackupSelectionSummary(refs, {
    selectedCount: backupImportState.selectedLayoutIds.size,
    summary
  });
}

async function resolveExistingBackupPhotos(photoFiles) {
  if (!photoFiles?.size || !currentUser || isForcedOffline()) return new Map();
  try {
    const listId = await ensureCurrentPackingListId();
    const hashes = [...photoFiles.values()].map((entry) => entry.meta?.sha256).filter(Boolean);
    if (!hashes.length) return new Map();
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/resolve`, {
      method: "POST",
      timeoutMs: LIST_API_TIMEOUT_MS,
      body: JSON.stringify({ hashes })
    });
    const result = new Map();
    Object.entries(data.photosByHash || {}).forEach(([hash, photo]) => {
      if (hash && photo?.id) result.set(hash, photo);
    });
    return result;
  } catch {
    return new Map();
  }
}

async function prepareBackupPhotosForState(targetState, photoIds = null) {
  if (!backupImportState?.photoFiles?.size) return { reused: 0, queued: 0, missing: 0 };
  const wanted = photoIds ? new Set([...photoIds].filter(Boolean)) : null;
  const relevantFiles = new Map([...backupImportState.photoFiles.entries()].filter(([id]) => !wanted || wanted.has(id)));
  const resolved = await resolveExistingBackupPhotos(relevantFiles);
  let reused = 0;
  let queued = 0;
  let missing = 0;
  const rewrite = async (photo) => {
    const originalId = String(photo.id || photo.localId || "").trim();
    if (!originalId || (wanted && !wanted.has(originalId))) return;
    const file = backupImportState.photoFiles.get(originalId);
    if (!file) {
      missing += 1;
      return;
    }
    const existing = file.meta?.sha256 ? resolved.get(file.meta.sha256) : null;
    if (existing?.id) {
      Object.assign(photo, {
        id: existing.id,
        localId: "",
        status: "synced",
        url: existing.url || "",
        thumbUrl: existing.thumbUrl || "",
        listId: currentPackingListId || existing.listId || "",
        updatedAt: existing.updatedAt || nowIso(),
        error: ""
      });
      reused += 1;
      return;
    }
    await putCachedPhoto({
      id: originalId,
      blob: file.blob,
      thumbBlob: file.thumbBlob || file.blob,
      fileName: file.meta?.fileName || `${originalId}.jpg`,
      type: file.blob.type || file.meta?.type || "image/jpeg",
      size: file.blob.size,
      width: file.meta?.width || photo.width || 0,
      height: file.meta?.height || photo.height || 0,
      createdAt: photo.createdAt || nowIso(),
      updatedAt: nowIso()
    });
    Object.assign(photo, {
      id: originalId,
      localId: originalId,
      status: "pending",
      url: "",
      thumbUrl: "",
      error: ""
    });
    queued += 1;
  };
  for (const entity of [...Object.values(targetState.items || {}), ...Object.values(targetState.containers || {})]) {
    for (const photo of normalizeItemPhotos(entity)) {
      await rewrite(photo);
    }
  }
  return { reused, queued, missing };
}

async function restoreSelectedBackupLayouts() {
  if (!backupImportState) return;
  const selectedIds = selectedBackupLayoutIds();
  if (!selectedIds.size) return;
  const summary = summarizeSelectedBackupLayouts(selectedIds);
  const confirmed = await askConfirmDialog({
    title: "Восстановить выбранные укладки?",
    text: "При восстановлении отдельных укладок заменяются только укладки с совпадающим именем, новые создаются, недостающие вещи/сумки/фото добавляются.",
    highlightText: `Будет заменено: ${summary.replace}; создано: ${summary.create}; новые вещи: ${summary.newItems.length}; новые сумки/места: ${summary.newContainers.length}; фото к проверке: ${summary.photos.length}.`,
    okText: "Восстановить выбранные",
    tone: "warning"
  });
  if (!confirmed) return;
  try {
    setBackupStatus("Восстанавливаю выбранные укладки...");
    saveRecoverySnapshot("before-backup-layout-restore", state);
    const source = backupImportState.state;
    const selectedRows = backupLayoutRows().filter((row) => selectedIds.has(row.layout.id));
    const importedPhotoIds = new Set();
    const changedAt = nowIso();
    addBackupDictionaryValues(state, source);
    selectedRows.forEach(({ layout, existing }) => {
      const targetLayoutId = existing?.id || (!state.layouts?.[layout.id] ? layout.id : `layout-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      if (existing?.id) delete state.layouts[existing.id];
      getLayoutContainerIdSetForState(source, layout).forEach((containerId) => {
        const result = mergeBackupRecordWithExisting(state.containers, source.containers?.[containerId], { normalizePhotos: normalizeItemPhotos });
        result.photoIds.forEach((id) => importedPhotoIds.add(id));
        if (result.created) markEdited(state.containers[containerId], changedAt);
      });
      getLayoutItemIdSetForState(source, layout).forEach((itemId) => {
        const result = mergeBackupRecordWithExisting(state.items, source.items?.[itemId], { normalizePhotos: normalizeItemPhotos });
        result.photoIds.forEach((id) => importedPhotoIds.add(id));
        if (result.created) markEdited(state.items[itemId], changedAt);
      });
      state.layouts[targetLayoutId] = {
        ...clone(layout),
        id: targetLayoutId,
        updatedAt: changedAt
      };
      state.activeLayoutId = targetLayoutId;
    });
    await prepareBackupPhotosForState(state, importedPhotoIds);
    normalizeContainerFields(state);
    normalizeItemFields(state);
    repairContainerMembershipFromItemLinks(state);
    normalizeLayoutFields(state);
    normalizeItemCategories(state);
    migrateContainerOrder(state);
    applyLayoutArrangement(state.activeLayoutId, state);
    saveState();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus("Выбранные укладки восстановлены.", "success");
    showToast("Выбранные укладки восстановлены.", "success");
  } catch (error) {
    setBackupStatus(`Не удалось восстановить укладки: ${error.message}`, "error");
  }
}

async function restoreFullBackup() {
  if (!backupImportState) return;
  const stats = stateStats(backupImportState.state);
  const confirmed = await askConfirmDialog({
    title: "Восстановить всё из архива?",
    text: "При полном восстановлении всё текущее состояние пользователя будет потеряно и заменено данными из архива.",
    highlightText: `Будет восстановлено: ${stats.layouts} укладок, ${stats.items} вещей, ${stats.containers} сумок/мест. Текущее состояние будет потеряно.`,
    okText: "Восстановить всё",
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    setBackupStatus("Восстанавливаю полное состояние...");
    const nextState = normalizeRemoteState(backupImportState.state);
    if (!nextState) throw new Error("Состояние из архива повреждено.");
    await prepareBackupPhotosForState(nextState);
    replaceState(nextState, { preserveLocalUi: false });
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus("Полное состояние восстановлено.", "success");
    showToast("Полное состояние восстановлено.", "success");
  } catch (error) {
    setBackupStatus(`Не удалось восстановить состояние: ${error.message}`, "error");
  }
}

async function exportData() {
  const { html, printTarget } = await buildPrintableHtmlFromChoice();
  printHtmlDocument(html, { printTarget });
}

async function buildPrintableHtmlFromChoice() {
  const layout = state.layouts[state.activeLayoutId];
  const { includeLabels, printTarget } = await askPrintLabelsChoice(askConfirmDialog, {
    createPrintTarget: createPrintWindowTarget
  });
  return {
    html: buildPrintableDocument(state, {
      layoutId: state.activeLayoutId,
      includeGeneratedRoots: isReadOnlyStateScope() || isAdminEditablePublishedLayout(layout?.id),
      includeLabels
    }),
    printTarget
  };
}

function readRootContainerDialogDimensions() {
  return normalizeContainerDimensions({
    width: parseContainerDimensionInput(refs.rootContainerWidth?.value),
    height: parseContainerDimensionInput(refs.rootContainerHeight?.value),
    depth: parseContainerDimensionInput(refs.rootContainerDepth?.value)
  });
}

function applyRootContainerDimensions(container, dimensions = readRootContainerDialogDimensions()) {
  const normalized = normalizeContainerDimensions(dimensions);
  if (hasContainerDimensions(normalized)) container.dimensions = normalized;
  else delete container.dimensions;
}

function resetData() {
  const message = "Сбросить демо-укладку к начальному примеру?";
  openConfirmDialog({
    title: "Сбросить данные?",
    text: message,
    okText: "Сбросить",
    onConfirm: () => {
      saveRecoverySnapshot("before-reset", state);
      localStorage.removeItem(scopedLocalStorageKey(STORAGE_KEY));
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
  return highlightSearchText(value, refs.searchInput.value);
}
