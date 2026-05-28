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
  categories,
  locations,
  demoSharedLayout
} from "./src/data/demo-data.js";
import { createDefaultUserState } from "./src/data/default-user-state.js";
import { guessCategory, guessLocation } from "./src/data/guess.js";
import {
  appendCopiedFromTemplateNote,
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
  summarizeLayoutTreeIdDuplicates,
  summarizePublicCopyDuplicates
} from "./src/public/copy-duplicates.js";
import { createDeletedSharedLayoutStore } from "./src/public/deleted-shared-layouts.js";
import {
  linkExistingContainerTreeToLayoutState,
  markCopiedItemForPublicLayout,
  writeContainerTreeToLayoutArrangement
} from "./src/public/copy-public-layout-target.js";
import {
  copyPublishedContainerToState as copyPublishedContainerToStateValue
} from "./src/public/copy-published-container.js";
import {
  cleanPublishedEntityId,
  exportLayoutAsPublishedState
} from "./src/public/published-state-export.js";
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
  guestDemoCopyLayoutName as guestDemoCopyLayoutNameValue,
  guestDemoStartupAction,
  isStartupGuestDemoPreview as isStartupGuestDemoPreviewState,
  readableGuestDemoLayoutName,
  shouldKeepReadonlyDemoAfterAuthCheck,
  shouldImportGuestLayoutBeforeRemote,
  shouldRenderGuestDemoPreviewDuringAuthCheck
} from "./src/public/guest-demo-startup.js";
import {
  importDemoStateAsEditableLayout as importDemoStateAsEditableLayoutValue,
  repairAdminDemoLayout as repairAdminDemoLayoutValue
} from "./src/public/admin-demo-layout.js";
import {
  importGuestLocalLayoutsToState,
  validateGuestImportSyncState
} from "./src/public/guest-login-import.js";
import {
  publishedTemplateBlockReason,
  readonlyPublicTemplateOptionLabel
} from "./src/public/public-template-availability.js";
import { savePublishedLayoutRecordFlow } from "./src/public/published-layout-save-flow.js";
import {
  publicTemplateDeleteBlockReason,
  shouldDeletePublishedTemplateForLayout as shouldDeletePublishedTemplateForLayoutValue
} from "./src/public/public-template-delete-guard.js";
import {
  applyPublicTemplateMetadataToPayload,
  normalizePublicTemplateMetadataResponse,
  publicTemplateDeletePath,
  publicTemplateMetadataPath,
  publicTemplateMetadataRequest,
  publicTemplateMetadataTarget
} from "./src/public/public-template-metadata.js";
import {
  buildAdminDemoTemplateOptions,
  compareDemoTemplateOrder,
  createDemoTemplateListId,
  demoTemplateEntryForLanguage,
  demoTemplateForLanguage,
  demoTemplatesForLanguage,
  findDemoTemplateForLanguage,
  isPublicDemoTemplateRecord,
  mergeServerDemoTemplateCatalog,
  mergeDemoTemplateEntriesForAdmin,
  localDemoTemplateEntriesFromLayouts,
  publicDemoTemplateEntryFromRecord,
  publicDemoTemplatePayloadTarget,
  publicTemplateChoice,
  removePublicTemplateCatalogEntry,
  upsertDemoTemplateCatalogEntry as mergeDemoTemplateCatalogEntry
} from "./src/public/public-template-catalog.js";
import {
  demoLanguageFromLayoutChoice as demoLanguageFromLayoutChoiceValue,
  demoLayoutChoiceForLanguage as demoLayoutChoiceForLanguageValue,
  demoLayoutChoiceForTemplate as demoLayoutChoiceForTemplateValue,
  demoTemplateIdFromLayoutChoice as demoTemplateIdFromLayoutChoiceValue,
  isDemoLayoutChoice as isDemoLayoutChoiceValue,
  languageOptionLabel as languageOptionLabelValue
} from "./src/public/demo-layout-choice.js";
import {
  applyGuestLocalDisplayPreferences,
  guestDemoCopyCleanupPlan,
  guestDemoCopyRecordWasEdited,
  guestLocalDisplayPreferences,
  guestLocalDisplayPreferencesWereChanged,
  guestLocalLayoutImportPlan,
  isAutomaticGuestDemoCopyLayout,
  isGuestLocalPersonalLayout,
  normalizeDemoTemplateName,
  normalizePublishedDemoTemplatePayload
} from "./src/public/demo-template-state.js";
import {
  createSharedLayoutCatalogDiagnostics,
  shouldWarnAboutSharedLayoutCatalog
} from "./src/public/shared-layout-catalog-diagnostics.js";
import {
  mergeBuiltInSharedEntriesIntoAdminLayout as mergeBuiltInSharedEntriesIntoAdminLayoutValue,
  mergePublishedSharedStateIntoAdminLayout as mergePublishedSharedStateIntoAdminLayoutValue,
  syncPublishedEntityPhotos as syncPublishedEntityPhotosValue
} from "./src/public/shared-admin-merge.js";
import { materializeSharedLayoutForAdminState } from "./src/public/shared-admin-materialize.js";
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
  isPublicSharedTemplatePayload,
  isTemplateCopySharedLayoutId,
  localSharedLayoutCatalogEntriesFromLayouts,
  mergeSharedLayoutCatalogEntries,
  normalizeSharedGearName,
  pruneRuntimeSharedLayouts,
  serverConfirmedSharedLayoutsFromPublicRecords,
  sharedLayoutIdFromPublicListRecord,
  sharedLayoutLanguageFromPayload,
  sharedGearPhotos,
  updateSharedLayoutCatalogEntryMetadata,
  upsertRuntimeSharedLayout,
  visibleSharedLayoutsForLanguage
} from "./src/public/shared-layouts.js";
import { refreshPublicSharedLayoutCatalogFlow } from "./src/public/shared-catalog-refresh-flow.js";
import { applyPublishedPayloadPhotosToLayoutState } from "./src/public/published-payload-photos.js";
import {
  deletePublishedSharedTemplate as deletePublishedSharedTemplateRecord,
  purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState
} from "./src/public/shared-layout-admin.js";
import {
  buildSharedListUrlFromHref,
  sharedLayoutIdFromUrl,
  sharedListIdFromUrl
} from "./src/public/shared-link-url.js";
import {
  createSharedVirtualState as createSharedVirtualStateForPublic
} from "./src/public/shared-virtual-state.js";
import {
  reconcilePublishedTemplateCopyDraft,
  repairEmptyTemplateCopyDraftFromPublishedLayout
} from "./src/public/template-copy-admin-repair.js";
import {
  SHARED_CONTAINER_COPY_PICKER_MODE,
  SHARED_ITEM_COPY_PICKER_MODE,
  assertPublishedTemplateCopyConfirmed,
  collapsedDefaultsForTemplateContainers,
  createNewPublicTemplateDraftRecord as createNewPublicTemplateDraftRecordValue,
  isContainerPickerContainerCopyMode as isContainerPickerContainerCopyModeValue,
  isContainerPickerCopyMode as isContainerPickerCopyModeValue,
  isContainerPickerItemCopyMode as isContainerPickerItemCopyModeValue,
  createTemplateCopyLayoutRecord as createTemplateCopyLayoutRecordValue,
  createPrivateLayoutFromTemplateSourceRecord,
  loadPublishedTemplateCopySource as loadPublishedTemplateCopySourceValue,
  resolveLayoutCreateTemplateCopyLayout as resolveLayoutCreateTemplateCopyLayoutValue,
  resolveLayoutCreateTemplateCopySource as resolveLayoutCreateTemplateCopySourceValue,
  templateCopyRootSnapshots as getTemplateCopyRootSnapshots,
  templateCopySourceScore as getTemplateCopySourceScore
} from "./src/public/template-copy.js";
import { createTemplateCopyFromSourceFlow } from "./src/public/template-copy-flow.js";
import {
  activeReadOnlyLayoutIdFromScope,
  createReadOnlyBikePackingError,
  demoAdminPathForPublicListId as demoAdminPathForPublicListIdFromScope,
  demoAdminStatePathForPublicListId as demoAdminStatePathForPublicListIdFromScope,
  demoPublicListIdForLanguage as demoPublicListIdForLanguageFromScope,
  hasGuestDemoCopyLayoutRecord,
  isGuestDemoCopyLayoutRecord,
  isPublishedLayoutEditable,
  isReadOnlyBikePackingError,
  isReadOnlyBikePackingRecord,
  isReadOnlyItemKey,
  isReadOnlyScope,
  sharedLayoutItemKey as sharedLayoutItemKeyFromScope,
  shouldClearPackingListContextForPrivateMutation
} from "./src/public/scope.js";
import {
  hasContainerDimensions,
  normalizeContainerColor,
  normalizeContainerDimensions,
  parseContainerDimensionInput
} from "./src/state/container-fields.js";
import {
  cleanupEmptyContainersInState,
  deleteRootContainerFromState,
  deleteUnusedLayoutContainerEntityFromState,
  duplicateRootContainerInState,
  duplicateContainerSnapshotRecords,
  getContainerItemIdsDeepForState,
  placeDuplicatedContainerSnapshotInLayoutState
} from "./src/state/container-ops.js";
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
import { repairPlacementRegressionFromReference } from "./src/state/regression-repair.js";
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
  setPrimaryPhotoInDraft,
  primaryItemPhoto
} from "./src/state/item-photos.js";
import {
  applyLayoutArrangementToState,
  createEmptyLayoutArrangement,
  createLayoutArrangementFromCurrentState,
  uniqueLayoutIds
} from "./src/state/layout-arrangement.js";
import {
  bestMeaningfulLayoutId,
  layoutArrangementContentScore,
  resolvePreferredLayoutId
} from "./src/state/layout-choice.js";
import { installRuntimeActiveLayoutId } from "./src/state/active-layout-runtime.js";
import {
  removeLayoutTreeFromState,
  removeManagedDemoTemplateTreesFromState,
  removeManagedSharedTemplateTreesFromState
} from "./src/state/layout-delete.js";
import {
  solidifyManagedTemplateDrafts as solidifyManagedTemplateDraftsForState,
  solidifyTemplateDraftLayout as solidifyTemplateDraftLayoutForState
} from "./src/state/layout-draft-solidify.js";
import {
  applyLayoutEditFields,
  adminTemplateDraftChoice,
  collectManagedPublicDraftRecords,
  createEmptyPublicTemplateDraftRecord,
  createDemoTemplateCopyRecord,
  createLayoutCopyRecordFromSource,
  createManagedLayoutCopyRecord,
  createTemplateCopyRecord,
  editedLayoutName,
  isDisposableManagedPublicDraft,
  isManagedDemoTemplateLayout,
  isManagedPublicTemplateDraft,
  layoutManageLanguage,
  managedSharedDraftLanguage,
  mergeManagedPublicDraftRecords,
  publicLayoutChoiceValue,
  shouldCopyPublicTemplatePhotoReferencesOnServer,
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
  containerTreeSnapshotScore,
  snapshotContainerTreeFromLiveState as snapshotContainerTreeFromLiveStateValue
} from "./src/state/container-tree-snapshot.js";
import {
  addItemToLayoutArrangement as addItemToLayoutArrangementForState,
  cleanupEmptyContainersInLayoutArrangement,
  createGroupFromItemsInState,
  ensureLayoutContainerPlacement as ensureLayoutContainerPlacementForState,
  getItemContainerIdInLayout as getItemContainerIdInLayoutForState,
  getLayoutDescendantContainerIds as getLayoutDescendantContainerIdsForState,
  getLayoutContainerIdSet as getLayoutContainerIdSetForState,
  getLayoutItemIdSet as getLayoutItemIdSetForState,
  moveContainerInLayoutArrangement as moveContainerInLayoutArrangementForState,
  moveItemInLayoutArrangement as moveItemInLayoutArrangementForState,
  moveRootColumnInState,
  placeExistingItemInLayoutInState,
  removeContainerFromLayoutOnlyInState,
  removeItemFromLayoutArrangement,
  removeItemFromLayoutInState,
  touchLayoutsReferencingItemInState
} from "./src/state/layout-ops.js";
import {
  activeEditableLayoutId as activeEditableLayoutIdForState,
  getDescendantContainerIds as getDescendantContainerIdsForState,
  getVisibleLayoutRootIds as getVisibleLayoutRootIdsForState,
  isItemInCatalog as isItemInCatalogForState,
  isItemInLayout as isItemInLayoutForState,
  isRootContainerForEditor as isRootContainerForEditorForState,
  isRootContainerInCatalog as isRootContainerInCatalogForState,
  isRootContainerInLayout as isRootContainerInLayoutForState,
  layoutContainerPath as layoutContainerPathForState,
  visibleItemLayoutPlacementLabels,
  userEditableLayouts as userEditableLayoutsForState,
  canDeleteActiveLayout as canDeleteActiveLayoutForState
} from "./src/state/layout-selectors.js";
import {
  itemUsageCountsForCatalog,
  itemsForActiveCatalog as itemsForActiveCatalogForState,
  itemsForItemsView as itemsForItemsViewForState,
  rootContainerUsageCountsForCatalog,
  rootContainersForEditor as rootContainersForEditorForState,
  rootContainersForSettings as rootContainersForSettingsForState
} from "./src/state/catalog-lists.js";
import {
  catalogActionTargetIds,
  normalizeCatalogSelection,
  updateCatalogSelection
} from "./src/state/catalog-selection.js";
import {
  isItemAwayFromHomeAndBike as isItemAwayFromHomeAndBikeValue,
  isItemWithoutWeight as isItemWithoutWeightValue,
  matchesCollectionFilter as matchesCollectionFilterValue
} from "./src/state/catalog-filters.js";
import {
  matchesItemFieldsFilter as matchesItemFieldsFilterValue,
  matchesRootContainerFieldsFilter as matchesRootContainerFieldsFilterValue
} from "./src/state/catalog-search.js";
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
import {
  copyItemInState,
  deleteItemFromState,
  duplicateItemToContainerInLayoutState
} from "./src/state/item-ops.js";
import {
  makeContainerCopyName as makeContainerCopyNameForState,
  makeItemCopyName as makeItemCopyNameForState,
  repairMojibakeLayoutNames,
  uniqueName
} from "./src/state/names.js";
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
import { assertEntitySyncConfirmed } from "./src/sync/entity-sync-confirmation.js";
import { isConflictMetaField } from "./src/sync/conflict-meta.js";
import {
  comparableValueForMerge,
  filterAutoResolvedMergeConflicts,
  isOwnLayoutEchoConflict as isOwnLayoutEchoConflictValue
} from "./src/sync/conflict-merge.js";
import {
  applyConflictChoices as applyConflictChoicesToState,
  mergeStateFromBase as mergeStateFromBaseValue
} from "./src/sync/state-merge.js";
import {
  apiErrorMessage,
  apiFetchRequest,
  apiUploadFormDataRequest,
  isNetworkError,
  isTemporaryServerStorageError,
  isTimeoutError
} from "./src/sync/api-client.js";
import { adminApiWarningFromCapabilities as adminApiWarningFromCapabilitiesValue } from "./src/sync/admin-api-compat.js";
import { fetchAdminReports } from "./src/sync/admin-reports.js";
import { checkAuthAndLoadFlow } from "./src/sync/auth-load-flow.js";
import {
  canUseCachedStartupState,
  listFreshnessChanged,
  normalizeListFreshness
} from "./src/sync/list-freshness.js";
import { loadRemoteStateFlow } from "./src/sync/load-remote-state-flow.js";
import { createRemoteListRecordSelector } from "./src/sync/list-records.js";
import { runSyncNowFlow } from "./src/sync/run-sync-now-flow.js";
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
  isPhotoUsableFromServer,
  isPhotoStoredForList,
  keepRemoteOnlyPhotoReference,
  normalizeUploadedPhotoAssetUrls,
  photoCopyApiPath,
  photoRemoteSrc,
  photoShouldBeCopiedToCurrentList,
  putCachedPhoto,
  remotePhotoSourceFromRecord
} from "./src/sync/photos.js";
import {
  getUnsyncedPhotoEntries as getUnsyncedPhotoEntriesForSync,
  getUploadablePhotoEntries as getUploadablePhotoEntriesForSync,
  markLayoutPhotosForCurrentListCopy as markLayoutPhotosForCurrentListCopyForSync,
  markRecordPhotosForCurrentListCopy
} from "./src/sync/photo-upload-scope.js";
import {
  prepareBackupPhotosForState as prepareBackupPhotosForStateValue,
  resolveExistingBackupPhotos as resolveExistingBackupPhotosValue
} from "./src/sync/backup-photos.js";
import {
  cloneStateForSyncPayload,
  remoteUpdatedAt
} from "./src/sync/serialize.js";
import {
  buildListSaveBody as buildListSaveBodyForSync,
  buildRemoteSaveBody as buildRemoteSaveBodyForSync,
  pruneAdminPublishedDraftsForSync as pruneAdminPublishedDraftsForSyncValue,
  rememberConflictRemoteMeta as rememberConflictRemoteMetaForSync
} from "./src/sync/save-body.js";
import {
  handleRemoteSaveConflictFlow,
  saveRemoteStateFlow
} from "./src/sync/save-remote-state-flow.js";
import { registerAppServiceWorker } from "./src/sync/service-worker.js";
import {
  backupDownloadName,
  buildCurrentBackupManifest as buildCurrentBackupManifestValue,
  buildBackupPhotoEntries,
  createBackupZip,
  readBackupArchiveFile
} from "./src/backup/archive.js";
import {
  addBackupDictionaryValues,
  backupLayoutRows as buildBackupLayoutRows,
  normalizeRestoredBackupState,
  restoreSelectedBackupLayoutsToState,
  summarizeBackupLayouts
} from "./src/backup/restore.js";
import {
  readBackupImportFile,
  restoreFullBackupFlow,
  restoreSelectedBackupLayoutsFlow
} from "./src/backup/restore-flow.js";
import {
  renderBackupAnalysis as renderBackupAnalysisUi,
  renderBackupRules,
  renderBackupSelectionSummary,
  resetBackupImportUi,
  selectedBackupLayoutIds as selectedBackupLayoutIdsFromUi,
  selectedBackupRestoreConfirm,
  fullBackupRestoreConfirm
} from "./src/ui/backup-dialog.js";
import { createAdminReportsDialogController } from "./src/ui/admin-reports-dialog.js";
import {
  bindDictionaryControls,
  renameDictionaryEntry as renameDictionaryEntryValue
} from "./src/ui/dictionary-bindings.js";
import {
  bindLayoutEditorControls,
  bindRootContainersEditorControls
} from "./src/ui/settings-editor-bindings.js";
import { openHelpLimitsDialogUi } from "./src/ui/help-limits-dialog.js";
import { bindHorizontalTouchScroll } from "./src/ui/horizontal-touch-scroll.js";
import { renderEmptyState } from "./src/ui/empty-state.js";
import {
  renderFilterControls,
  updateViewScopedControlsUi
} from "./src/ui/filter-controls.js";
import {
  renderCatalogCard,
  renderCatalogPills
} from "./src/ui/catalog-card.js";
import {
  renderDictionaryHtml,
  renderLayoutEditorHtml,
  renderRootContainerCardHtml,
  renderRootContainersEditorHtml
} from "./src/ui/settings-render.js";
import { bindSettingsPointerDrag as bindSettingsPointerDragUi } from "./src/ui/settings-pointer-drag.js";
import {
  renderSharedLayoutsHtml
} from "./src/ui/shared-layout-render.js";
import { bindSharedVirtualEvents as bindSharedVirtualEventsUi } from "./src/ui/shared-virtual-events.js";
import {
  renderItemsViewHtml,
  renderListItemHtml,
  renderSharedItemsViewHtml
} from "./src/ui/items-view-render.js";
import {
  saveItemDialogAction,
  saveRootContainerDialogAction
} from "./src/ui/item-dialog-save.js";
import {
  renderFilteredRootContainerColumnHtml,
  renderPackingItemCardHtml,
  renderRootContainerColumnHtml,
  renderSubcontainerSectionHtml,
  subcontainerTitleHtml
} from "./src/ui/packing-board-render.js";
import { createPackingDragController } from "./src/ui/packing-drag.js";
import { bindPackingEvents as bindPackingEventsUi } from "./src/ui/packing-events.js";
import {
  bindBoardScroll,
  bindFixedScrollbar
} from "./src/ui/packing-scroll.js";
import { applyStaticTranslationsUi } from "./src/ui/static-translations.js";
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
  resolveStoredPrivateLayoutChoice,
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
  bindPhotoGalleries,
  hydrateItemPhotos,
  photoStatusText,
  renderPhotoGalleryHtml,
  renderItemPhotoHtml
} from "./src/ui/photo-gallery.js";
import {
  formatItemWeight,
  renderItemQuantityText
} from "./src/ui/item-format.js";
import {
  formatFullDateTime
} from "./src/ui/date-format.js";
import {
  conflictVersionStamp,
  createConflictValueFormatter,
  formatMergeConflicts
} from "./src/ui/conflict-format.js";
import {
  renderHistoryRecordArticle as renderHistoryRecordArticleHtml
} from "./src/ui/history-diff.js";
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
import { updateSyncUiControls } from "./src/ui/sync-ui.js";
import {
  canReplaceLayoutCreateNameSuggestion as canReplaceLayoutCreateNameSuggestionValue,
  isLayoutCreateTemplateLayoutMode as isLayoutCreateTemplateLayoutModeValue,
  layoutCreateCopySourceOptions as getLayoutCreateCopySourceOptions,
  layoutCreateModeState,
  layoutEditTitle,
  layoutSourceNameFromOptionLabel,
  privateLayoutDeleteConfirm,
  publicLayoutDeleteConfirm,
  publicTemplateOptionLabel,
  suggestedLayoutCreateName
} from "./src/ui/layout-manage-dialog.js";
import {
  countPrivateLayouts,
  createLayoutLoadStatusController
} from "./src/ui/layout-load-status.js";
import {
  itemDeleteConfirm,
  itemCopyConfirm,
  rootContainerDeleteConfirm,
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
let serverConfirmedDemoTemplates = [];
let serverConfirmedSharedLayouts = [];
let activeDemoTemplateListId = "";
const REQUIRED_ADMIN_API_CAPABILITIES = [
  "entitySyncListUpdatedAt",
  "lightweightListFreshness",
  "publicTemplatePhotoReferenceCopy",
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
  "publicTemplateUnifiedCatalog",
  "publicTemplateLanguageColumn",
  "publicTemplateMetadataPatch",
  "publicTemplateDelete",
  "templateCopyRequiresPublicSharedRow",
  "publicListLightweightCatalog",
  "templateCopyMetadataSidecar",
  "adminUsageReports",
  "collectionModeStateSync"
];
const REQUIRED_ADMIN_API_VERSION = "2026-05-27.lightweight-list-freshness-v1";
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
hydrateLocalSharedTemplateCatalogFromState(state);
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
let packingDragController = null;
let itemUsageFilter = "all";
let itemSortMode = normalizeSortMode(uiSettings.itemSortMode);
let rootContainerUsageFilter = "all";
let rootContainerSortMode = normalizeSortMode(uiSettings.rootContainerSortMode);
let selectedCatalogItemIds = new Set();
let selectedCatalogItemAnchorId = "";
let selectedCatalogRootIds = new Set();
let selectedCatalogRootAnchorId = "";
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
const conflictFormatter = createConflictValueFormatter({
  getItemName: (id) => state.items?.[id]?.name || id,
  getContainerName: (id) => state.containers?.[id]?.name || id,
  itemCategories,
  comparableValueForMerge,
  isMetaField: isConflictMetaField,
  settingLabel,
  valuesEqual: sameJson
});
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
let sharedDialogCopyItemId = "";
let backupImportState = null;
let pendingGuestLocalLayoutCandidate = null;
let storedGuestLocalLayoutCandidateOffered = false;
let localDemoCopyInFlight = null;
let sharedPickerSourceItemId = "";
let sharedPickerSourceContainerId = "";
const photoObjectUrls = new Map();
let photoUploadInFlight = false;
let photoUploadProgressRenderFrame = null;
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
  installRuntimeActiveLayoutId(state, nextState?.activeLayoutId || state.activeLayoutId);
  normalizeContainerFields(state);
  normalizeItemFields(state);
  cleanupGeneratedCatalogArtifacts(state);
  repairContainerMembershipFromItemLinks(state);
  normalizeLayoutFields(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  applyLayoutArrangement(state.activeLayoutId, state);
  applyDefaultCollapsedContainers(state);
  hydrateLocalSharedTemplateCatalogFromState(state);
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

function hydrateLocalSharedTemplateCatalogFromState(targetState = state) {
  const entries = localSharedLayoutCatalogEntriesFromLayouts(targetState.layouts, {
    fallbackLanguage: uiLanguage
  });
  entries.forEach((entry) => {
    upsertRuntimeSharedLayout(sharedLayoutsByLanguage, entry);
  });
  serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(serverConfirmedSharedLayouts, entries);
  return entries.length;
}

function demoTemplateFallbackName(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  return I18N[normalized]?.["demo.layoutName"] ||
    I18N[DEFAULT_LANGUAGE]?.["demo.layoutName"] ||
    "Demo layout";
}

function fallbackDemoTemplateEntry(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  return demoTemplateEntryForLanguage(normalized, {
    listId: demoPublicListIdForLanguage(normalized),
    name: demoTemplateFallbackName(normalized),
    serverConfirmed: false,
    missing: isDemoPublicTemplateMissing(normalized)
  });
}

function demoTemplatesForUiLanguage(language = uiLanguage) {
  const normalized = normalizeUiLanguage(language);
  return demoTemplatesForLanguage(serverConfirmedDemoTemplates, normalized, {
    fallbackEntry: fallbackDemoTemplateEntry(normalized)
  });
}

function adminDemoTemplateCatalogEntries() {
  const localEntries = canOpenAdminPublishedEdit()
    ? localDemoTemplateEntriesFromLayouts(state.layouts, { fallbackLanguage: uiLanguage })
    : [];
  return mergeDemoTemplateEntriesForAdmin(serverConfirmedDemoTemplates, localEntries);
}

function currentDemoTemplate(language = uiLanguage, listId = "") {
  const normalized = normalizeUiLanguage(language);
  return demoTemplateForLanguage(serverConfirmedDemoTemplates, normalized, {
    fallbackEntry: fallbackDemoTemplateEntry(normalized),
    listId
  });
}

function selectDemoTemplateForLanguage(language = uiLanguage, listId = "") {
  const template = currentDemoTemplate(language, listId);
  activeDemoTemplateListId = template?.listId || template?.id || demoPublicListIdForLanguage(language);
  return template;
}

function demoTemplateNameFromPayload(payload, language = uiLanguage) {
  const activeLayout = payload?.layouts?.[payload?.activeLayoutId] ||
    Object.values(payload?.layouts || {})[0] ||
    null;
  return String(activeLayout?.name || "").trim() || demoTemplateFallbackName(language);
}

function upsertDemoTemplateCatalogEntry(language, {
  listId = "",
  name = "",
  updatedAt = "",
  serverConfirmed = true,
  missing = false
} = {}) {
  const normalized = normalizeUiLanguage(language);
  serverConfirmedDemoTemplates = mergeDemoTemplateCatalogEntry(serverConfirmedDemoTemplates, normalized, {
    listId,
    name,
    updatedAt,
    serverConfirmed,
    missing,
    fallbackListId: demoPublicListIdForLanguage(normalized),
    fallbackName: demoTemplateFallbackName(normalized)
  });
}

function demoTemplateChoiceForEntry(entry) {
  return publicTemplateChoice(entry, {
    demoChoiceForLanguage: demoLayoutChoiceForLanguage,
    demoChoiceForTemplate: demoLayoutChoiceForTemplate
  }) || demoLayoutChoiceForLanguage(entry?.language || uiLanguage);
}

function demoTemplateChoiceForLanguage(language = uiLanguage, listId = "") {
  const normalizedLanguage = normalizeUiLanguage(language);
  const templateId = String(listId || "").trim();
  if (templateId) {
    return demoLayoutChoiceForTemplate({
      id: templateId,
      listId: templateId,
      language: normalizedLanguage
    });
  }
  return demoTemplateChoiceForEntry(currentDemoTemplate(normalizedLanguage)) || demoLayoutChoiceForLanguage(normalizedLanguage);
}

function demoLayoutChoiceForLanguage(language = uiLanguage) {
  return demoLayoutChoiceForLanguageValue(language, {
    currentLanguage: uiLanguage,
    defaultLanguage: DEFAULT_LANGUAGE,
    demoSelectValue: DEMO_LAYOUT_SELECT_VALUE,
    normalizeLanguage: normalizeUiLanguage
  });
}

function demoLayoutChoiceForTemplate(entry) {
  return demoLayoutChoiceForTemplateValue(entry, {
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

function demoTemplateIdFromLayoutChoice(choice) {
  return demoTemplateIdFromLayoutChoiceValue(choice);
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

function markPublicTemplateOptionsState(options, { disabled = false, readonly = false } = {}) {
  if (!disabled && !readonly) return options;
  return options.map(([value, label, kind = ""]) => [
    value,
    readonlyPublicTemplateOptionLabel(label, { readonly }),
    kind,
    disabled
  ]);
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

function nextDemoTemplateAfter(listId, language = uiLanguage) {
  const id = String(listId || "").trim();
  const templates = demoTemplatesForUiLanguage(language).filter((entry) => entry?.serverConfirmed);
  if (!templates.length) return null;
  const index = templates.findIndex((entry) => String(entry?.listId || entry?.id || "").trim() === id);
  if (index < 0) return templates[0] || null;
  return templates[index + 1] || templates[index - 1] || null;
}

function adminDemoTemplateOptionsForLanguage(language, { disabled = false } = {}) {
  const normalized = normalizeUiLanguage(language);
  const localLayouts = canEditPublishedTemplatesNow()
    ? Object.values(state.layouts || {}).filter((layout) =>
      layout?.adminDemo &&
      layout.adminTemplateCopy &&
      layout.id &&
      normalizeUiLanguage(layout.adminDemoLanguage || layout.language || uiLanguage) === normalized
    )
    : [];
  return buildAdminDemoTemplateOptions({
    canOpen: canViewAdminPublishedCatalog(),
    localLayouts,
    serverTemplates: demoTemplatesForLanguage(serverConfirmedDemoTemplates, normalized, {
      fallbackEntry: fallbackDemoTemplateEntry(normalized)
    }),
    fallbackLanguage: normalized,
    isLayoutMeaningful,
    draftChoice: adminTemplateDraftChoice,
    demoChoiceForTemplate: demoTemplateChoiceForEntry,
    normalizeDemoName: normalizeDemoLayoutName,
    compareEntries: compareDemoTemplateOrder,
    labels: {
      templatePrefix: t("template.prefix"),
      defaultName: demoTemplateFallbackName(normalized),
      languageOptionLabel,
      publicTemplateOptionLabel
    }
  }).map(([value, label, kind = "demo"]) => [value, label, kind, disabled]);
}

function adminPublicLayoutOptions({ disabled = false, readonly = false, canView = canOpenAdminPublishedEdit() } = {}) {
  const languageOrder = [
    normalizeUiLanguage(uiLanguage),
    ...SUPPORTED_LANGUAGES.map(normalizeUiLanguage).filter((language) => language !== normalizeUiLanguage(uiLanguage))
  ];
  const demoOptions = languageOrder.flatMap((language) =>
    markPublicTemplateOptionsState(adminDemoTemplateOptionsForLanguage(language, { disabled }), { readonly })
  );
  return [
    ...demoOptions,
    ...markPublicTemplateOptionsState(adminSharedTemplateOptions({
      canView,
      includeDrafts: canEditPublishedTemplatesNow()
    }), { disabled, readonly })
  ];
}

function adminSharedTemplateOptions({
  canView = canOpenAdminPublishedEdit(),
  includeDrafts = canOpenAdminPublishedEdit()
} = {}) {
  const options = buildAdminSharedTemplateOptions({
    canOpen: canView,
    localLayouts: includeDrafts ? localAdminTemplateCopyLayouts() : [],
    linkedSharedListLayout,
    sharedLayouts: serverConfirmedSharedLayoutsByAdminOrder(),
    serverConfirmedSharedLayouts: serverConfirmedSharedLayoutsByAdminOrder(),
    requireServerConfirmationForSharedTemplates: true,
    allowUnconfirmedLocalLayouts: includeDrafts,
    isDeletedSharedLayoutId,
    fallbackLanguage: uiLanguage,
    isLayoutMeaningful,
    templateCopySourceScore: (layout, sourceState = state) => templateCopySourceScore(layout, sourceState),
    sharedLayoutStatePayload,
    sharedPayloadActiveLayout,
    compareLayouts: compareSharedLayoutAdminOrder,
    labels: {
      templatePrefix: t("template.prefix"),
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
    name: layout.adminDemo
      ? normalizeDemoLayoutName(
        layout.name || currentDemoTemplate(layout.adminDemoLanguage || uiLanguage, layout.adminDemoListId)?.name || t("demo.layoutName"),
        layout.adminDemoLanguage || uiLanguage
      )
      : layout.name || t("template.prefix"),
    languageLabel: languageOptionLabel(layout.adminDemo
      ? layout.adminDemoLanguage || uiLanguage
      : managedSharedDraftLanguage(layout, sharedSource, uiLanguage)),
    demo: Boolean(layout.adminDemo)
  });
}

function publicLayoutChoiceForLayout(layout) {
  return publicLayoutChoiceValue(layout, {
    demoChoiceForLanguage: demoTemplateChoiceForLanguage,
    demoChoiceForLayout: demoTemplateChoiceForLayout,
    fallbackLanguage: uiLanguage
  });
}

function demoTemplateChoiceForLayout(layout) {
  if (!layout?.adminDemo) return "";
  return demoTemplateChoiceForLanguage(layout.adminDemoLanguage || uiLanguage, layout.adminDemoListId || "");
}

function copyPickerLayoutLabel(layout) {
  if (!layout) return "Укладка";
  if (layout.adminDemo) {
    const language = layout.adminDemoLanguage || uiLanguage;
    return `${normalizeDemoLayoutName(layout.name || currentDemoTemplate(language, layout.adminDemoListId)?.name || t("demo.layoutName"), language)} (${languageOptionLabel(language)})`;
  }
  if (layout.adminSharedSourceId) {
    const sharedLayout = findSharedLayout(layout.adminSharedSourceId);
    const language = layout.adminTemplateCopy ? layout.language || uiLanguage : sharedLayout?.language || layout.language || uiLanguage;
    return `${layout.name || sharedLayout?.name || t("template.prefix")} (${languageOptionLabel(language)})`;
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

function activeDictionaryList(type) {
  return dictionaryListForOwner(activeDictionaryOwner(), type === "location" ? "location" : "category");
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

function demoStatePayloadForLanguage(language = uiLanguage, listId = "") {
  const normalized = normalizeUiLanguage(language);
  const templateId = String(listId || (normalized === normalizeUiLanguage(uiLanguage) ? activeDemoTemplateListId : "") || "").trim();
  if (templateId && demoSharedLayout.statePayloadByTemplateId?.[templateId]) {
    return demoSharedLayout.statePayloadByTemplateId[templateId];
  }
  return demoSharedLayout.statePayloadByLanguage?.[normalized] || null;
}

function setDemoStatePayloadForLanguage(language, payload, { listId = "" } = {}) {
  const normalized = normalizeUiLanguage(language);
  const nextPayload = payload ? normalizeDemoPayloadForLanguage(payload, normalized) : null;
  const templateId = String(listId || (normalized === normalizeUiLanguage(uiLanguage) ? activeDemoTemplateListId : "") || "").trim();
  demoSharedLayout.statePayloadByLanguage = demoSharedLayout.statePayloadByLanguage || {};
  demoSharedLayout.statePayloadByTemplateId = demoSharedLayout.statePayloadByTemplateId || {};
  demoSharedLayout.statePayloadByLanguage[normalized] = nextPayload;
  if (templateId) demoSharedLayout.statePayloadByTemplateId[templateId] = nextPayload;
  if ((templateId && templateId === activeDemoTemplateListId) || (!templateId && normalized === normalizeUiLanguage(uiLanguage))) {
    demoSharedLayout.statePayload = nextPayload;
  }
}

function setDemoPublicTemplateMissing(language, missing, { updateCatalog = true, listId = "" } = {}) {
  const normalized = normalizeUiLanguage(language);
  missingDemoPublicTemplates[normalized] = Boolean(missing);
  if (!updateCatalog) return;
  upsertDemoTemplateCatalogEntry(normalized, {
    listId,
    serverConfirmed: !missing,
    missing
  });
}

function confirmLoadedDemoPublicTemplate(language, payload) {
  const normalized = normalizeUiLanguage(language);
  const listId = activeDemoTemplateListId || currentDemoTemplate(normalized)?.listId || demoPublicListIdForLanguage(normalized);
  const existing = demoTemplateForLanguage(serverConfirmedDemoTemplates, normalized, { listId });
  setDemoPublicTemplateMissing(normalized, false, { updateCatalog: false });
  upsertDemoTemplateCatalogEntry(normalized, {
    listId,
    name: existing?.serverConfirmed && existing.name
      ? existing.name
      : demoTemplateNameFromPayload(payload, normalized),
    serverConfirmed: true,
    missing: false
  });
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
  const previousLanguage = uiLanguage;
  const previousReadOnlyLayoutId = activeReadOnlyLayoutId();
  const wasDemoView = previousReadOnlyLayoutId === DEMO_SHARED_LAYOUT_ID;
  const previousDemoTemplateId = wasDemoView
    ? activeDemoTemplateListId || currentDemoTemplate(previousLanguage)?.listId || ""
    : "";
  const wasSharedView = !canOpenAdminPublishedEdit() &&
    isReadOnlyStateScope() &&
    previousReadOnlyLayoutId &&
    previousReadOnlyLayoutId !== DEMO_SHARED_LAYOUT_ID;
  const sharedLanguageTarget = wasSharedView
    ? findSharedLayoutForLanguage(sharedLayoutsByLanguage, previousReadOnlyLayoutId, nextLanguage, {
      sourceLanguage: previousLanguage,
      serverConfirmedSharedLayouts
    })
    : null;
  const previousAdminDemoLayout = state.layouts?.[state.activeLayoutId]?.adminDemo
    ? state.layouts[state.activeLayoutId]
    : null;
  const wasAdminDemoEdit = Boolean(previousAdminDemoLayout);
  const adminDemoLanguageTarget = wasAdminDemoEdit
    ? findDemoTemplateForLanguage(
      serverConfirmedDemoTemplates,
      previousAdminDemoLayout.adminDemoListId || currentDemoTemplate(previousAdminDemoLayout.adminDemoLanguage || previousLanguage)?.listId || "",
      nextLanguage,
      { sourceLanguage: previousAdminDemoLayout.adminDemoLanguage || previousLanguage }
    )
    : null;
  const readonlyDemoLanguageTarget = wasDemoView
    ? findDemoTemplateForLanguage(serverConfirmedDemoTemplates, previousDemoTemplateId, nextLanguage, {
      sourceLanguage: previousLanguage
    })
    : null;
  uiLanguage = nextLanguage;
  saveUiLanguage(uiLanguage);
  applyPublicTemplateLanguage();
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  if (sharedLanguageTarget && sharedLanguageTarget.id !== previousReadOnlyLayoutId) {
    applyStaticTranslations();
    await openSharedLayoutViewer(sharedLanguageTarget.id, { remember: true });
    updateSyncUi();
    return;
  }
  if (wasSharedView && !sharedLanguageTarget) {
    applyStaticTranslations();
    await openDemoLayoutFromSelect({ language: uiLanguage, remember: true });
    updateSyncUi();
    return;
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
      await openAdminDemoLayout({
        language: uiLanguage,
        templateId: adminDemoLanguageTarget?.listId || adminDemoLanguageTarget?.id || ""
      });
    } catch (error) {
      updateSyncUi(`Demo load failed: ${error.message}`);
    }
    return;
  }
  if (wasDemoView && activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID) {
    try {
      updateSyncUi(`${t("demo.layoutName")} · loading`);
      if (canOpenAdminPublishedEdit()) {
        await openAdminDemoLayout({
          language: uiLanguage,
          templateId: readonlyDemoLanguageTarget?.listId || readonlyDemoLanguageTarget?.id || ""
        });
      } else {
        const templateId = readonlyDemoLanguageTarget?.listId || readonlyDemoLanguageTarget?.id || "";
        selectDemoTemplateForLanguage(uiLanguage, templateId);
        setDemoStatePayloadForLanguage(uiLanguage, await defaultDemoState(uiLanguage, templateId), { listId: activeDemoTemplateListId });
        render();
        updateSyncUi();
      }
    } catch (error) {
      updateSyncUi(`Demo load failed: ${error.message}`);
    }
  }
}

function applyStaticTranslations() {
  applyStaticTranslationsUi({
    activeReadOnlyLayoutId,
    canOpenAdminPublishedEdit,
    demoCopyActionText,
    demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID,
    documentRef: document,
    isSharedLayoutView,
    refs,
    t,
    uiLanguage
  });
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
      const openReadonly = canViewAdminPublishedCatalog() && !canEditPublishedTemplatesNow();
      if (!openReadonly && !requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      const language = demoLanguageFromLayoutChoice(value);
      const templateId = demoTemplateIdFromLayoutChoice(value);
      if (await confirmPublicLayoutTransition("demo")) {
        if (canEditPublishedTemplatesNow()) await openAdminDemoLayout({ language, templateId });
        else await openDemoLayoutFromSelect({ language, templateId, allowOfflineCache: openReadonly });
      } else {
        renderFilters();
      }
      return;
    }
    if (value.startsWith("shared:")) {
      const openReadonly = canViewAdminPublishedCatalog() && !canEditPublishedTemplatesNow();
      if (!openReadonly && !requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      const layoutId = value.slice("shared:".length);
      if (await confirmPublicLayoutTransition("shared", findSharedLayout(layoutId))) {
        if (canEditPublishedTemplatesNow()) await openSharedLayoutForAdmin(layoutId);
        else await openSharedLayoutViewer(layoutId, { allowOfflineCache: openReadonly });
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
      if (canOpenAdminPublishedEdit() && isManagedPublicTemplateDraft(layout)) {
        const transitionKind = layout.adminDemo ? "demo" : "shared";
        const transitionTarget = layout.adminDemo
          ? layout
          : findSharedLayout(layout.adminSharedSourceId) || layout;
        if (!(await confirmPublicLayoutTransition(transitionKind, transitionTarget))) {
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
  refs.rootContainerDeleteForeverBtn?.addEventListener("click", confirmDeleteEditingRootContainerForever);
  refs.itemContainerPickerBtn.addEventListener("click", openItemContainerPickerDialog);
  refs.itemCopyToContainerBtn?.addEventListener("click", openItemCopyContainerPickerDialog);
  refs.itemRemoveFromLayoutBtn?.addEventListener("click", confirmRemoveEditingItemFromActiveLayout);
  refs.itemDeleteForeverBtn?.addEventListener("click", confirmDeleteEditingItemForever);
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
  refs.itemPhotoCameraInput?.addEventListener("change", handleItemPhotoInputChange);
  refs.itemPhotoRemoveBtn?.addEventListener("click", removeItemDialogPhoto);
  refs.itemPhotoPrimaryBtn?.addEventListener("click", setItemDialogPhotoPrimary);
  refs.copySharedItemDialogBtn?.addEventListener("click", copySharedItemFromReadonlyDialog);
  refs.rootContainerPhotoInput?.addEventListener("change", handleRootContainerPhotoInputChange);
  refs.rootContainerPhotoCameraInput?.addEventListener("change", handleRootContainerPhotoInputChange);
  refs.rootContainerPhotoRemoveBtn?.addEventListener("click", removeRootContainerDialogPhoto);
  refs.rootContainerPhotoPrimaryBtn?.addEventListener("click", setRootContainerDialogPhotoPrimary);
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
  refs.layoutEditLanguage?.addEventListener("change", () => {
    updateLayoutEditDeleteButton(state.layouts?.[layoutEditTargetId]);
  });
  refs.saveEditedLayoutBtn?.addEventListener("click", saveEditedLayout);
  refs.deleteEditedLayoutBtn?.addEventListener("click", confirmDeleteEditedLayout);
  refs.layoutCreateMode.addEventListener("change", updateLayoutCopyVisibility);
  refs.layoutTemplateKind?.addEventListener("change", updateLayoutCreateNameSuggestion);
  refs.layoutTemplateLanguage?.addEventListener("change", updateLayoutCreateNameSuggestion);
  refs.saveLayoutBtn.addEventListener("click", saveNewLayout);
  refs.layoutCopyFrom?.addEventListener("change", () => updateLayoutCreateNameSuggestion({ force: true }));
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
    resetCatalogSelectionOnPlainClick(event);
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
  return createDefaultUserState();
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
    installRuntimeActiveLayoutId(initial, initial.activeLayoutId);
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
      installRuntimeActiveLayoutId(recovered, recovered.activeLayoutId);
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
      installRuntimeActiveLayoutId(fallback, fallback.activeLayoutId);
      return fallback;
    }
    installRuntimeActiveLayoutId(parsed, parsed.activeLayoutId);
    persistStateSnapshot(parsed);
    return parsed;
  } catch {
    const fallback = createEmptyUserState();
    installRuntimeActiveLayoutId(fallback, fallback.activeLayoutId);
    return fallback;
  }
}

function loadStateForScope(scopeKey) {
  const previousScope = localStorageScopeKey;
  try {
    localStorageScopeKey = scopeKey || GUEST_STORAGE_SCOPE;
    return loadState();
  } finally {
    localStorageScopeKey = previousScope;
  }
}

function hasLocalSavedState() {
  return Boolean(localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY)));
}

function hasStoredLocalValue(key, scope = localStorageScopeKey) {
  try {
    return Boolean(localStorage.getItem(scopedLocalStorageKey(key, scope)));
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
      if (!isManagedPublicTemplateDraft(layout) || state.layouts?.[layoutId] || restored.layouts[layoutId]) return;
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
    demoLayoutChoiceForLanguage: demoTemplateChoiceForLanguage,
    demoLanguageFromLayoutChoice,
    templateDraftLayoutId,
    isAdminTemplateCopyChoice: (layoutId) => isManagedPublicTemplateDraft(state.layouts?.[layoutId])
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
    return readonlyId === DEMO_SHARED_LAYOUT_ID ? demoTemplateChoiceForLanguage(uiLanguage, activeDemoTemplateListId) : `shared:${readonlyId}`;
  }
  const layout = state.layouts?.[state.activeLayoutId];
  if (layout?.adminDemo) return demoTemplateChoiceForLayout(layout);
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
  const storedPrivateLayoutId = preferStored ? loadActivePrivateLayoutChoice() : "";
  const storedLayoutId = preferStored ? loadActiveLayoutChoice() : "";
  const activeLayoutId = state.layouts?.[state.activeLayoutId]
    ? state.activeLayoutId
    : Object.values(state.layouts || {})[0]?.id || "";
  const layoutId = resolveStoredPrivateLayoutChoice({
    activeLayoutId,
    storedChoice: storedLayoutId,
    storedPrivateChoice: storedPrivateLayoutId,
    normalizeChoice: normalizeActiveLayoutChoice,
    isPrivateChoice: isPrivateLayoutChoice,
    isPrivateUserLayoutId
  });
  if (!layoutId || !isPrivateUserLayoutId(layoutId)) return;
  if (state.activeLayoutId !== layoutId) {
    state.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
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
  const storedChoice = loadActiveLayoutChoice();
  const privateChoice = !publicOnly
    ? resolveStoredPrivateLayoutChoice({
      activeLayoutId: activePrivateChoice,
      storedChoice,
      storedPrivateChoice: loadActivePrivateLayoutChoice(),
      normalizeChoice: normalizeActiveLayoutChoice,
      isPrivateChoice: isPrivateLayoutChoice,
      isPrivateUserLayoutId
    })
    : "";
  let choice = storedChoice;
  const adminPublicChoice = !publicOnly && canOpenAdminPublishedEdit() && (
    isDemoLayoutChoice(choice) ||
    String(choice || "").startsWith("shared:") ||
    Boolean(templateDraftLayoutId(choice))
  );
  if (privateOnly) choice = privateChoice;
  if (!privateOnly && !adminPublicChoice && !publicOnly && isDemoLayoutChoice(choice) && !explicitChoice && privateChoice) choice = privateChoice;
  if (!publicOnly && isPrivateLayoutChoice(choice) && !isPrivateUserLayoutId(choice) && privateChoice) choice = privateChoice;
  if (!choice) choice = privateChoice;
  if (!choice) return false;
  if (isDemoLayoutChoice(choice)) {
    const language = demoLanguageFromLayoutChoice(choice);
    const templateId = demoTemplateIdFromLayoutChoice(choice);
    if (privateOnly) return false;
    if (canOpenAdminPublishedEdit() && !publicOnly) await openAdminDemoLayout({ remember: false, language, templateId });
    else await openDemoLayoutFromSelect({ remember: false, language, templateId });
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
    if (!isManagedPublicTemplateDraft(state.layouts?.[layoutId])) return false;
    activateAdminPublishedLayout(layoutId, { remember: false });
    return true;
  }
  const savedLayout = state.layouts?.[choice];
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminDemo) {
    if (savedLayout.adminTemplateCopy) activateAdminPublishedLayout(savedLayout.id, { remember: false });
    else await openAdminDemoLayout({ remember: false, language: savedLayout.adminDemoLanguage || uiLanguage, templateId: savedLayout.adminDemoListId || "" });
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
    currentPackingListMeta = null;
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
  applyingLayoutArrangement = true;
  try {
    applyLayoutArrangementToState(targetState, layoutId, {
      migrateContainerOrder,
      normalizeLayoutArrangement,
      repairContainerMembershipFromItemLinks
    });
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
  if (!restoreAdminPublishedLayoutContext(layoutId)) return false;
  if (remember) {
    const layout = state.layouts?.[layoutId];
    if (layout?.adminDemo) rememberActiveLayoutChoice(demoTemplateChoiceForLayout(layout));
    else if (layout?.adminTemplateCopy) rememberActiveLayoutChoice(adminTemplateDraftChoice(layout.id));
    else if (layout?.adminSharedSourceId) rememberActiveLayoutChoice(`shared:${layout.adminSharedSourceId}`);
  }
  saveState({ sync: false });
  switchView("packing");
  render();
  return true;
}

function restoreAdminPublishedLayoutContext(layoutId) {
  if (!layoutId || !isAdminEditablePublishedLayout(layoutId)) return false;
  if (state.activeLayoutId && state.activeLayoutId !== layoutId && state.layouts?.[state.activeLayoutId]) {
    captureActiveLayoutArrangement();
  }
  if (!setViewScope(VIEW_SCOPE_ADMIN_PUBLIC_EDIT, { adminLayoutId: layoutId })) return false;
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  return true;
}

function rememberRemoteIntegrityMeta(...sources) {
  const meta = sources.length === 1 && sources[0]?.payloadHash !== undefined
    ? sources[0]
    : stateIntegrityMetaFromResponse(...sources);
  const listId = sources
    .map((source) => source?.listId || source?.id || source?.record?.listId || source?.record?.id || source?.list?.listId || source?.list?.id)
    .find(Boolean);
  if (listId) syncMeta.listId = String(listId);
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

const GUEST_LAYOUT_FALLBACK_NAME = "\u0413\u043e\u0441\u0442\u0435\u0432\u0430\u044f \u0443\u043a\u043b\u0430\u0434\u043a\u0430";

function guestLayoutImportFallbackName(layout) {
  const language = normalizeUiLanguage(layout?.demoSourceLanguage || layout?.language || uiLanguage);
  const listId = String(layout?.demoSourceListId || "").trim();
  return demoCopyPreferredTemplateName(language, listId) ||
    demoTemplateFallbackName(language) ||
    GUEST_LAYOUT_FALLBACK_NAME;
}

function privateMojibakeLayoutFallbackName(layout) {
  const language = normalizeUiLanguage(layout?.demoSourceLanguage || layout?.language || uiLanguage);
  const listId = String(layout?.demoSourceListId || "").trim();
  return demoCopyPreferredTemplateName(language, listId) ||
    demoTemplateFallbackName(language);
}

function repairPrivateMojibakeLayoutNames({ sync = true } = {}) {
  const changed = repairMojibakeLayoutNames(state, {
    fallbackNameForLayout: privateMojibakeLayoutFallbackName
  });
  if (changed) saveState({ sync });
  return changed;
}

function guestLayoutHasUserContentEdits(sourceState, layout) {
  if (!layout) return false;
  if (!isGuestDemoCopyLayoutRecord(layout)) return false;
  if (guestDemoCopyRecordWasEdited(layout, layout)) return true;
  const containerIds = getLayoutContainerIdSetForState(sourceState, layout);
  const itemIds = getLayoutItemIdSetForState(sourceState, layout);
  for (const containerId of containerIds) {
    if (guestDemoCopyRecordWasEdited(sourceState.containers?.[containerId], layout)) return true;
  }
  for (const itemId of itemIds) {
    if (guestDemoCopyRecordWasEdited(sourceState.items?.[itemId], layout)) return true;
  }
  return false;
}

function guestLocalLayoutCandidate(sourceState = state) {
  if (!Object.values(sourceState.layouts || {}).some(isGuestLocalPersonalLayout)) return null;
  try {
    if (sameJson(cloneStateForSync(sourceState, { forSync: true }), cloneStateForSync(createEmptyUserState(), { forSync: true }))) {
      return null;
    }
  } catch {
    // If normalization fails, continue with the shape checks below.
  }
  const plan = guestLocalLayoutImportPlan({
    layouts: sourceState.layouts,
    activeLayoutId: sourceState.activeLayoutId,
    isGuestDemoCopy: isGuestDemoCopyLayoutRecord,
    isGuestPersonalLayout: isGuestLocalPersonalLayout,
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: (layout) => guestLayoutHasUserContentEdits(sourceState, layout)
  });
  if (!plan.layoutIds.length) return null;
  const layouts = plan.layoutIds
    .map((layoutId) => sourceState.layouts?.[layoutId])
    .filter(Boolean)
    .map((layout) => {
      const fallbackName = guestLayoutImportFallbackName(layout);
      return {
        layoutId: layout.id,
        layoutName: readableGuestDemoLayoutName(layout.name, fallbackName),
        fallbackName
      };
    });
  const primary = layouts.find((entry) => entry.layoutId === plan.primaryLayoutId) || layouts[0];
  return {
    sourceState: clone(sourceState),
    displayPreferences: guestLocalDisplayPreferences(sourceState),
    layouts,
    layoutId: primary?.layoutId || "",
    layoutName: primary?.layoutName || GUEST_LAYOUT_FALLBACK_NAME
  };
}

function shouldCaptureGuestLocalLayoutCandidate(previousScope, nextScope, sourceState = state) {
  if (isAdminSession()) return false;
  if (previousScope !== GUEST_STORAGE_SCOPE || nextScope === GUEST_STORAGE_SCOPE) return false;
  if (isSharedListLinkRoute() || syncMetaAccountKey(syncMeta)) return false;
  if (currentViewScope() !== VIEW_SCOPE_GUEST_LOCAL && !hasGuestDemoCopyLayoutRecord(sourceState.layouts)) return false;
  return Boolean(guestLocalLayoutCandidate(sourceState));
}

function guestCandidateLayouts(candidate) {
  const entries = Array.isArray(candidate?.layouts) && candidate.layouts.length
    ? candidate.layouts
    : (candidate?.layoutId ? [{ layoutId: candidate.layoutId, layoutName: candidate.layoutName }] : []);
  return entries
    .map((entry) => ({
      layoutId: String(entry?.layoutId || "").trim(),
      layoutName: readableGuestDemoLayoutName(entry?.layoutName, entry?.fallbackName || GUEST_LAYOUT_FALLBACK_NAME),
      fallbackName: String(entry?.fallbackName || GUEST_LAYOUT_FALLBACK_NAME).trim() || GUEST_LAYOUT_FALLBACK_NAME
    }))
    .filter((entry) => entry.layoutId);
}

function consumeGuestLocalLayoutCandidate() {
  const candidate = pendingGuestLocalLayoutCandidate;
  pendingGuestLocalLayoutCandidate = null;
  if (candidate) {
    candidate.layouts = guestCandidateLayouts(candidate);
    candidate.layoutId = candidate.layouts[0]?.layoutId || candidate.layoutId || "";
    candidate.layoutName = candidate.layouts[0]?.layoutName || readableGuestDemoLayoutName(candidate.layoutName, GUEST_LAYOUT_FALLBACK_NAME);
  }
  return candidate;
}

function storedGuestLocalLayoutCandidate() {
  if (isAdminSession()) return null;
  if (storedGuestLocalLayoutCandidateOffered || localStorageScopeKey === GUEST_STORAGE_SCOPE) return null;
  if (!hasStoredLocalValue(STORAGE_KEY, GUEST_STORAGE_SCOPE)) return null;
  const candidate = guestLocalLayoutCandidate(loadStateForScope(GUEST_STORAGE_SCOPE));
  if (candidate) storedGuestLocalLayoutCandidateOffered = true;
  return candidate;
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

function clearReadOnlyPackingListContextForPrivateMutation() {
  if (shouldClearPackingListContextForPrivateMutation({
    listId: currentPackingListId,
    record: currentPackingListMeta,
    isPublicTemplateListId
  })) {
    saveActivePackingListId("");
    currentPackingListMeta = null;
  }
}

function setActivePrivateScope() {
  if (canUsePrivateState()) {
    clearReadOnlyPackingListContextForPrivateMutation();
    return setViewScope(VIEW_SCOPE_PRIVATE);
  }
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
      createEmptyPublicTemplateState(uiLanguage)
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
    createPayload: createEmptyPublicTemplateState
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

function demoPublicListIdForLanguage(language = uiLanguage) {
  return demoPublicListIdForLanguageFromScope(language);
}

function demoAdminPathForPublicListId(suffix = "", listId = "", language = uiLanguage) {
  return demoAdminPathForPublicListIdFromScope(suffix, listId, language);
}

function demoAdminStatePathForPublicListId(listId = "", language = uiLanguage) {
  return demoAdminStatePathForPublicListIdFromScope(listId, language);
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

function getActiveEditableLayoutId() {
  return activeEditableLayoutIdForState(state, {
    adminLayoutId: currentViewScope() === VIEW_SCOPE_ADMIN_PUBLIC_EDIT ? getPublishedEditLayoutId() : "",
    isAdminEditableLayout: isPublishedLayoutEditable
  });
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
    const language = layout.adminDemoLanguage || layout.language || uiLanguage;
    const demoTemplate = currentDemoTemplate(language, layout.adminDemoListId || "");
    return {
      type: "demo",
      sharedId: "",
      language,
      demoListId: layout.adminDemoListId || demoTemplate?.listId || demoPublicListIdForLanguage(language)
    };
  }
  if (layout.adminSharedSourceId) {
    return { type: "shared", sharedId: layout.adminSharedSourceId };
  }
  return defaultToDemo
    ? { type: "demo", sharedId: "", language: uiLanguage, demoListId: currentDemoTemplate(uiLanguage)?.listId || demoPublicListIdForLanguage(uiLanguage) }
    : null;
}

function publicListIdForPublishedTarget(target) {
  if (!target) return "";
  return target.type === "demo"
    ? target.demoListId || demoPublicListIdForLanguage(target.language || uiLanguage)
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

async function syncCreatedPrivateLayoutEntities(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout) throw new Error("Created layout was not found locally");
  saveState({ sync: false });
  if (!currentUser || !canUsePrivateState()) return;
  if (isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  await assertEntitySyncListFreshnessApi();

  const baseState = loadBaseState();
  const expectedItemIds = [...getLayoutItemIdSet(layout)];
  const expectedContainerIds = [...getLayoutContainerIdSet(layout)];
  let listId = currentPackingListId || "";
  try {
    const item = await syncChangedEntityType("item", { baseState, listId });
    if (!listId && currentPackingListId) listId = currentPackingListId;
    const container = await syncChangedEntityType("container", { baseState, listId });
    if (!listId && currentPackingListId) listId = currentPackingListId;
    const layoutResult = await syncChangedEntityType("layout", { baseState, listId });
    assertEntitySyncConfirmed(item, "items", expectedItemIds);
    assertEntitySyncConfirmed(container, "containers", expectedContainerIds);
    assertEntitySyncConfirmed(layoutResult, "layouts", [layoutId]);
    const integrityMeta = layoutResult.integrityMeta || container.integrityMeta || item.integrityMeta || null;
    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = layoutResult.serverUpdatedAt || container.serverUpdatedAt || item.serverUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt || nowIso();
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(integrityMeta);
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    updateSyncUi();
  } catch (error) {
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
    saveSyncMeta();
    updateSyncUi(`Не удалось сохранить копию укладки: ${error.message}`);
    throw error;
  }
}

function pruneAdminPublishedDraftsForSync(cloned) {
  return pruneAdminPublishedDraftsForSyncValue(cloned, {
    getPublicLayoutRecordIds: getPublicLayoutRecordIdsForState,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    isPublicSyncContainer,
    isPublicSyncItem
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
  installRuntimeActiveLayoutId(state, nextState?.activeLayoutId || state.activeLayoutId);
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
  repairPrivateMojibakeLayoutNames();
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
  return mergeStateFromBaseValue(baseState, localState, remoteState, {
    cloneValue: clone,
    conflictLabel,
    normalizeItemDisplayMode,
    settingLabel,
    valuesEqual: sameJson,
    afterMerge: (merged) => {
      migrateContainerOrder(merged);
      applyLayoutArrangement(merged.activeLayoutId, merged);
      applyDefaultCollapsedContainers(merged);
    }
  });
}

function isOwnLayoutEchoConflict(conflicts) {
  return isOwnLayoutEchoConflictValue(conflicts, syncDevice, { valuesEqual: sameJson });
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
    activeLayoutId: "Какая укладка открыта",
    showItemMeta: "Показ меток",
    itemDisplayMode: "Режим меток и фото",
    collapseDefaultsVersion: "Состояние сворачивания"
  };
  return labels[key] || key;
}

function applyConflictChoices(mergedState, conflicts, choices) {
  applyConflictChoicesToState(mergedState, conflicts, choices, {
    cloneValue: clone,
    afterApply: (targetState) => {
      migrateContainerOrder(targetState);
      applyDefaultCollapsedContainers(targetState);
    }
  });
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
  if (conflict.type === "item") {
    return "Вещь";
  }
  if (conflict.type === "container") {
    return "Сумка/контейнер";
  }
  if (conflict.type === "layout") return "Укладка";
  if (conflict.type === "packed") return "Собранность вещи";
  if (conflict.type === "setting" && conflict.id === "activeLayoutId") return "Выбор открытой укладки";
  if (conflict.type === "setting") return "Настройка";
  return "Конфликт";
}

function conflictTimestamp(value) {
  return timeValue(value?.updatedAt || value?.updated_at || value?.clientUpdatedAt || "");
}

function renderConflictDetails(conflict) {
  const rows = conflictFormatter.conflictDetailRows(conflict);
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

function conflictSummary(conflict) {
  if (conflict.type === "setting" && conflict.id === "activeLayoutId") {
    const localText = conflictFormatter.conflictValueSummary(conflict, conflict.localValue, conflict.localHas, "нет локально");
    const remoteText = conflictFormatter.conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas, "нет в серверной укладке");
    return `Это не содержимое укладки: отличается только то, какую укладку приложение откроет активной. Моё: ${localText}. Сервер: ${remoteText}.`;
  }
  const localText = conflictFormatter.conflictValueSummary(conflict, conflict.localValue, conflict.localHas, "нет локально");
  const remoteText = conflictFormatter.conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas, "нет в серверной укладке");
  const localStamp = conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name, "нет локально");
  const remoteStamp = conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, "сервер", "нет в серверной укладке");
  const difference = conflictFormatter.conflictDifferenceSummary(conflict);
  return `Моё: ${localText} (${localStamp}). Сервер: ${remoteText} (${remoteStamp}).${difference ? ` Разница: ${difference}.` : ""}`;
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

function isAdminIdentity(user = null) {
  const email = String(user?.email || user?.mail || user?.login || "").trim().toLowerCase();
  const userId = String(user?.id || user?.userId || user?.user_id || user?.sub || "").trim().toLowerCase();
  return ADMIN_EMAILS.includes(email) || ADMIN_USER_IDS.includes(userId);
}

function isAdminUser() {
  if (!currentUser) return false;
  return isAdminIdentity({
    id: currentUserId(),
    email: currentUserEmail()
  });
}

function canOpenAdminPublishedEdit() {
  return isAdminSession();
}

function isOfflineRememberedAdminSession() {
  return Boolean(!currentUser && offlineRememberedUser && isAdminIdentity(offlineRememberedUser));
}

function canViewAdminPublishedCatalog() {
  return canOpenAdminPublishedEdit() || isOfflineRememberedAdminSession();
}

function canEditPublishedTemplatesNow() {
  return canOpenAdminPublishedEdit() && !arePublishedTemplatesBlocked();
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
  openHelpLimitsDialogUi({
    closeText: uiLanguage === "en" ? "Close" : "Закрыть",
    content: refs.helpLimitsContent,
    dialog: refs.helpLimitsDialog,
    isAdmin: canOpenAdminPublishedEdit(),
    language: uiLanguage,
    openModalDialog,
    photoLimit: currentUsageLimit("photosPerRecord"),
    title: t("menu.help")
  });
}
function adminApiWarningFromCapabilities(data) {
  return adminApiWarningFromCapabilitiesValue(data, {
    appVersion: APP_VERSION,
    requiredVersion: REQUIRED_ADMIN_API_VERSION,
    requiredCapabilities: REQUIRED_ADMIN_API_CAPABILITIES
  });
}

function apiCapabilitySet(capabilities = []) {
  return new Set((Array.isArray(capabilities) ? capabilities : [])
    .map((capability) => String(capability || "").trim())
    .filter(Boolean));
}

async function fetchBikePackingApiCapabilities({ timeoutMs = 7000, silentErrors = true } = {}) {
  const data = await apiFetch("/bike-packing/capabilities", {
    timeoutMs,
    silentErrors
  });
  const capabilities = Array.isArray(data?.capabilities) ? data.capabilities : [];
  const warning = adminApiWarningFromCapabilities(data);
  adminApiCompatibility = {
    checkedAt: Date.now(),
    checking: false,
    ok: !warning,
    warning,
    version: String(data?.apiCompatibilityVersion || data?.bikePackingApiCompatibilityVersion || "").trim(),
    capabilities
  };
  updateSyncUi();
  return adminApiCompatibility;
}

async function assertEntitySyncListFreshnessApi() {
  if (apiCapabilitySet(adminApiCompatibility.capabilities).has("entitySyncListUpdatedAt")) return true;
  const capabilities = await fetchBikePackingApiCapabilities({ timeoutMs: 7000, silentErrors: true });
  if (apiCapabilitySet(capabilities.capabilities).has("entitySyncListUpdatedAt")) return true;
  throw new Error("API не обновлен: нет entitySyncListUpdatedAt");
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
    await fetchBikePackingApiCapabilities({ timeoutMs: 7000, silentErrors: true });
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
  updateSyncUiControls({
    adminReportsDialogController,
    appUnlocked,
    canOpenAdminPublishedEdit,
    canUseLocalEditableState,
    currentAdminApiWarning,
    currentPublicTemplateStatusMessage,
    currentUser,
    currentUserEmail,
    disablePackingVisualStylePanel: () => {
      packingVisualStylePanelVisible = false;
    },
    document,
    ensureGuestPublicScope,
    initialRemoteLoadPending,
    isForcedOffline,
    isOfflineRememberedSession,
    isReadOnlyStateScope,
    isReadonlyTemplateView,
    message,
    refs,
    state,
    syncMeta,
    syncPackingVisualStyleControls,
    t
  });
}

async function apiFetch(path, options = {}) {
  return apiFetchRequest(path, options, { isForcedOffline });
}

async function apiUploadFormData(path, options = {}) {
  return apiUploadFormDataRequest(path, options, { isForcedOffline });
}

function getUploadablePhotoEntries({ layoutId = null, listId = "", allowRemoteOnlyReferences = true } = {}) {
  return getUploadablePhotoEntriesForSync(state, {
    layoutId,
    listId,
    allowRemoteOnlyReferences
  });
}

function markLayoutPhotosForCurrentListCopy(layoutId) {
  markLayoutPhotosForCurrentListCopyForSync(state, layoutId);
}

function getUnsyncedPhotoEntries({ layoutId = null, listId = "" } = {}) {
  return getUnsyncedPhotoEntriesForSync(state, {
    layoutId,
    listId
  });
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

async function savePublishedTemplateMetadata(layout, previousLayout = null) {
  const target = publicTemplateMetadataTarget(publishedLayoutTarget(layout), {
    previousTarget: previousLayout ? publishedLayoutTarget(previousLayout) : null
  });
  const path = publicTemplateMetadataPath(target, { demoAdminPathForPublicListId });
  if (!target || !path) return false;
  await assertAdminApiCompatibility({ force: true });
  cancelPublishedLayoutSave(layout.id);
  const previousRuntime = target.type === "shared" ? findSharedLayout(target.sharedId) : null;
  const previousRuntimeSnapshot = previousRuntime ? clone(previousRuntime) : null;
  const previousDemoTemplate = target.type === "demo"
    ? currentDemoTemplate(target.language || layout.adminDemoLanguage || uiLanguage, target.demoListId || "")
    : null;
  const payload = previousRuntime?.statePayload || null;
  const requestBody = publicTemplateMetadataRequest(layout, target, {
    demoTemplate: previousDemoTemplate,
    sharedLayout: previousRuntime,
    uiLanguage,
    normalizeLanguage: normalizeUiLanguage,
    normalizeDemoName: normalizeDemoLayoutName,
    demoFallbackName: demoTemplateFallbackName
  });
  try {
    const data = await apiFetch(path, {
      method: "POST",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify(requestBody)
    });
    const confirmed = normalizePublicTemplateMetadataResponse(data, requestBody, {
      normalizeLanguage: normalizeUiLanguage
    });
    const confirmedName = confirmed.name;
    const confirmedLanguage = confirmed.language;
    layout.name = confirmedName;
    layout.language = confirmedLanguage;
    if (target.type === "demo") {
      layout.adminDemo = true;
      layout.adminDemoLanguage = confirmedLanguage;
      layout.adminDemoListId = data?.listId || target.demoListId || layout.adminDemoListId || demoPublicListIdForLanguage(confirmedLanguage);
      activeDemoTemplateListId = layout.adminDemoListId;
      const existingPayload = demoStatePayloadForLanguage(confirmedLanguage, layout.adminDemoListId);
      if (existingPayload) {
        setDemoStatePayloadForLanguage(confirmedLanguage, publishedPayloadWithTemplateMetadata(existingPayload, confirmed), {
          listId: layout.adminDemoListId
        });
      }
      upsertDemoTemplateCatalogEntry(confirmedLanguage, {
        listId: layout.adminDemoListId,
        name: confirmedName,
        updatedAt: nowIso(),
        serverConfirmed: true,
        missing: false
      });
    } else {
      const sharedLayout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
        id: target.sharedId,
        name: confirmedName,
        language: confirmedLanguage,
        statePayload: payload ? publishedPayloadWithTemplateMetadata(payload, confirmed) : null,
        runtimeSharedTemplate: true
      });
      if (sharedLayout) sharedLayout.updatedAt = nowIso();
      serverConfirmedSharedLayouts = updateSharedLayoutCatalogEntryMetadata(serverConfirmedSharedLayouts, target.sharedId, {
        name: confirmedName,
        language: confirmedLanguage,
        updatedAt: sharedLayout?.updatedAt || nowIso()
      });
    }
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
    ? demoAdminPathForPublicListId("/photos", target.demoListId || "", target.language || uiLanguage)
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
  const sourcePhoto = photo;
  let activePhoto = photo;
  const resolvePhoto = () => {
    activePhoto = findEntityPhotoForUpload(entity, sourcePhoto) || activePhoto;
    return activePhoto;
  };
  const localId = photo.localId || photo.id;
  const copiedOnServer = await copyRemotePhotoToList(listId, entity, photo, entityType, { uploadPath: path });
  if (copiedOnServer) return true;
  setPhotoUploadProgress(resolvePhoto(), 0);
  schedulePhotoUploadProgressRender();
  const uploadSource = await getPhotoUploadSource(photo, localId);
  if (!uploadSource?.blob) {
    const targetPhoto = resolvePhoto();
    targetPhoto.status = "missing-local-file";
    targetPhoto.error = "Локальный файл фото не найден.";
    targetPhoto.updatedAt = nowIso();
    clearPhotoUploadProgress(targetPhoto);
    return true;
  }

  const uploadPhoto = resolvePhoto();
  uploadPhoto.status = "uploading";
  uploadPhoto.error = "";
  uploadPhoto.updatedAt = nowIso();
  persistStateSnapshot(state);
  schedulePhotoUploadProgressRender();

  try {
    const formData = new FormData();
    formData.append("entityType", entityType);
    formData.append("entityId", entity.id);
    if (entityType === "item") formData.append("itemId", entity.id);
    formData.append("photoId", photo.id);
    formData.append("file", uploadSource.blob, uploadSource.fileName || photo.fileName || `${photo.id}.jpg`);
    if (uploadSource.thumbBlob) formData.append("thumb", uploadSource.thumbBlob, `thumb-${photo.id}.jpg`);
    const data = await apiUploadFormData(path, {
      method: "POST",
      body: formData,
      timeoutMs: 30000,
      onUploadProgress: (progress) => {
        setPhotoUploadProgress(resolvePhoto(), progress);
        schedulePhotoUploadProgressRender();
      }
    });
    const serverPhoto = normalizeUploadedPhotoAssetUrls(data.photo || data, listId, path, photo.id);
    const targetPhoto = resolvePhoto();
    setPhotoUploadProgress(targetPhoto, 100);
    Object.assign(targetPhoto, {
      ...targetPhoto,
      ...serverPhoto,
      id: serverPhoto.id || targetPhoto.id,
      localId,
      listId: String(serverPhoto.listId || serverPhoto.list_id || listId || ""),
      status: "synced",
      error: "",
      updatedAt: serverPhoto.updatedAt || nowIso()
    });
    clearPhotoUploadProgress(targetPhoto);
    delete targetPhoto._copyToCurrentList;
    delete targetPhoto.copyToCurrentList;
    if (entityType === "container") touchContainer(entity.id, targetPhoto.updatedAt);
    else touchItem(entity.id, targetPhoto.updatedAt);
    return true;
  } catch (error) {
    const targetPhoto = resolvePhoto();
    targetPhoto.status = "error";
    targetPhoto.error = error.message || "Не удалось загрузить фото.";
    targetPhoto.updatedAt = nowIso();
    clearPhotoUploadProgress(targetPhoto);
    return true;
  }
}

function findEntityPhotoForUpload(entity, sourcePhoto) {
  const photos = Array.isArray(entity?.photos) ? entity.photos : [];
  const sourceId = String(sourcePhoto?.id || "");
  const sourceLocalId = String(sourcePhoto?.localId || "");
  return photos.find((photo) =>
    (sourceId && String(photo?.id || "") === sourceId) ||
    (sourceLocalId && String(photo?.localId || "") === sourceLocalId)
  ) || null;
}

function setPhotoUploadProgress(photo, progress) {
  if (!photo) return;
  Object.defineProperty(photo, "uploadProgress", {
    value: Math.max(0, Math.min(100, Number(progress) || 0)),
    writable: true,
    configurable: true,
    enumerable: false
  });
}

function clearPhotoUploadProgress(photo) {
  if (!photo || !Object.prototype.hasOwnProperty.call(photo, "uploadProgress")) return;
  delete photo.uploadProgress;
}

function schedulePhotoUploadProgressRender() {
  if (photoUploadProgressRenderFrame) return;
  photoUploadProgressRenderFrame = requestAnimationFrame(() => {
    photoUploadProgressRenderFrame = null;
    renderPreservingPackingScroll();
  });
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

async function checkAuthAndLoad(options = {}) {
  return checkAuthAndLoadFlow({
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get currentUser() { return currentUser; },
      set currentUser(value) { currentUser = value; },
      get syncMeta() { return syncMeta; }
    },
    dependencies: {
      activateLocalStorageScope,
      activateLocalStorageScopeForCurrentUser,
      activateOfflineRememberedSession,
      apiFetch,
      checkAdminApiCompatibility,
      clearOfflineRememberedSession,
      currentPublicTemplateStatusMessage,
      enterSignedOutPublicMode,
      hasLocalSavedState,
      isAdminUser,
      isExplicitlySignedOut,
      isForcedOffline,
      isNetworkError,
      isSharedListLinkRoute,
      loadGuestPublishedDemoOnStartup,
      loadRemoteState,
      rememberAuthenticatedUser,
      renderCachedPrivateStateDuringRemoteLoad,
      renderInitialLocalFallbackIfNeeded,
      restoreSavedLayoutChoice,
      restoreTemplateCopyDraftsFromRecovery,
      setExplicitlySignedOut,
      setLayoutLoadStatus,
      setPersonalLayoutsLoadedStatus,
      shouldKeepCurrentReadonlyDemoAfterAuthCheck,
      unlockOfflineState,
      updateSyncUi,
      GUEST_STORAGE_SCOPE
    }
  }, options);
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

async function runSyncNow(options = {}) {
  return runSyncNowFlow({
    runtime: {
      get activeDemoTemplateListId() { return activeDemoTemplateListId; },
      get appUnlocked() { return appUnlocked; },
      get currentUser() { return currentUser; },
      get publishedLayoutSaveLayoutId() { return publishedLayoutSaveLayoutId; },
      set publishedLayoutSaveLayoutId(value) { publishedLayoutSaveLayoutId = value; },
      get publishedLayoutSaveTimer() { return publishedLayoutSaveTimer; },
      set publishedLayoutSaveTimer(value) { publishedLayoutSaveTimer = value; },
      get state() { return state; },
      get syncMeta() { return syncMeta; },
      get syncTimer() { return syncTimer; },
      set syncTimer(value) { syncTimer = value; },
      get uiLanguage() { return uiLanguage; }
    },
    dependencies: {
      activeReadOnlyLayoutId,
      canOpenAdminPublishedEdit,
      checkAdminApiCompatibility,
      checkAuthAndLoad,
      clearStaleDirtyFlagIfNoLocalChanges,
      currentPublicTemplateStatusMessage,
      flushActivePublishedEditSave,
      getPublishedEditLayoutId,
      handleAuthButton,
      isAdminEditablePublishedLayout,
      isAdminUser,
      isDemoPublicTemplateMissing,
      isForcedOffline,
      isOfflineRememberedSession,
      isReadOnlyBikePackingContext,
      isReadOnlyStateScope,
      loadRemoteState,
      nowIso,
      offerLoadServerForTruncatedLocalState,
      openAdminDemoLayout,
      openSharedLayoutForAdmin,
      preferredCurrentLayoutRef,
      refreshActiveReadOnlyPublicTemplate,
      savePublishedLayoutRecord,
      saveRemoteState,
      saveSyncMeta,
      showToast,
      uploadPendingPhotos,
      updateSyncUi,
      DEMO_SHARED_LAYOUT_ID
    }
  }, options);
}

async function refreshActiveReadOnlyPublicTemplate({ notify = false } = {}) {
  const readonlyId = activeReadOnlyLayoutId();
  if (!readonlyId) return;
  try {
    updateSyncUi(readonlyId === DEMO_SHARED_LAYOUT_ID
      ? "Обновляю demo с сервера..."
      : "Обновляю shared с сервера...");
    if (readonlyId === DEMO_SHARED_LAYOUT_ID) {
      const demoState = await defaultDemoState(uiLanguage, activeDemoTemplateListId);
      setDemoStatePayloadForLanguage(uiLanguage, demoState, { listId: activeDemoTemplateListId });
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
      ? `Шаблон обновлен с сервера${layout?.name ? ` · ${layout.name}` : ""}`
      : `Шаблон открыт из локальной заготовки${layout?.name ? ` · ${layout.name}` : ""}`;
    updateSyncUi(message);
    if (notify) showToast(message, loaded ? "success" : "warning");
  } catch (error) {
    const message = `Не удалось обновить public-укладку: ${error.message}`;
    updateSyncUi(message);
    if (notify) showToast(message, "error");
  }
}

function buildRemoteSaveBody({ forceOverwrite = false } = {}) {
  return buildRemoteSaveBodyForSync({
    dataItemKey: DATA_ITEM_KEY,
    dataScopeKey: DATA_SCOPE_KEY,
    forceOverwrite,
    nowIso,
    serializeState,
    syncDevice,
    syncMeta
  });
}

function buildListSaveBody({ forceOverwrite = false } = {}) {
  return buildListSaveBodyForSync({
    forceOverwrite,
    nowIso,
    serializeState,
    syncDevice,
    syncMeta
  });
}

function rememberConflictRemoteMeta(record, meta, updatedAt = "") {
  rememberConflictRemoteMetaForSync(record, meta, updatedAt, {
    rememberRemoteIntegrityMeta,
    saveSyncMeta,
    syncMeta
  });
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

async function fetchRemoteListFreshnessRecord(listId) {
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/freshness`, {
    timeoutMs: API_TIMEOUT_MS,
    silentErrors: true
  });
  return normalizeListFreshness(data);
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
      name: record.title || "Общий список",
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
    updateSyncUi(`Общий список · ${linkedSharedListLayout.name}`);
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

async function fetchPublishedListStateById(listId) {
  const record = await fetchRemoteListStateSnapshot(listId);
  const payload = normalizePublishedStatePayload(record?.payload || null);
  assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record?.payload || null);
  return payload;
}

function publishedPayloadWithTemplateMetadata(payload, metadata = {}) {
  return normalizePublishedStatePayload(applyPublicTemplateMetadataToPayload(payload, metadata));
}

async function refreshPublicSharedLayoutIndex({ renderAfter = false } = {}) {
  void renderAfter;
  return 0;
}

async function refreshPublicSharedLayoutCatalog(options = {}) {
  return refreshPublicSharedLayoutCatalogFlow({
    runtime: {
      get serverConfirmedDemoTemplates() { return serverConfirmedDemoTemplates; },
      set serverConfirmedDemoTemplates(value) { serverConfirmedDemoTemplates = value; },
      get serverConfirmedSharedLayouts() { return serverConfirmedSharedLayouts; },
      set serverConfirmedSharedLayouts(value) { serverConfirmedSharedLayouts = value; },
      get sharedLayoutCatalogDiagnostics() { return sharedLayoutCatalogDiagnostics; },
      set sharedLayoutCatalogDiagnostics(value) { sharedLayoutCatalogDiagnostics = value; },
      get sharedLayoutsByLanguage() { return sharedLayoutsByLanguage; },
      get state() { return state; },
      get uiLanguage() { return uiLanguage; }
    },
    dependencies: {
      canOpenAdminPublishedEdit,
      copyPublishedContainerToState,
      createLayoutArrangementFromCurrentState,
      createSharedLayoutCatalogDiagnostics,
      currentEditMeta,
      demoTemplateFallbackName,
      ensureLayoutDictionaries,
      fetchPublicSharedLayoutCatalog,
      fetchPublishedDemoTemplateState,
      fetchStateRecordByItemKey,
      forgetDeletedSharedLayoutId,
      isConcretePublicSharedLayoutListRecord,
      isLayoutMeaningful,
      isPublicDemoTemplateRecord,
      isPublicSharedLayoutListRecord,
      isPublicSharedTemplatePayload,
      mergeServerDemoTemplateCatalog,
      mergeSharedLayoutCatalogEntries,
      normalizeLayoutArrangement,
      normalizeUiLanguage,
      nowIso,
      pruneRuntimeSharedLayouts,
      publicDemoTemplateEntryFromRecord,
      publishedPayloadWithTemplateMetadata,
      purgeUnconfirmedSharedTemplatesFromFrontendState,
      reconcilePublishedTemplateCopyDraft,
      removeLayoutTree,
      render,
      saveState,
      serverConfirmedSharedLayoutsByAdminOrder,
      serverConfirmedSharedLayoutsFromPublicRecords,
      setDemoPublicTemplateMissing,
      setDemoStatePayloadForLanguage,
      sharedLayoutIdFromPublicListRecord,
      sharedLayoutItemKey,
      sharedLayoutStatePayload,
      sharedPayloadActiveLayout,
      templateCopySourceScore,
      upsertRuntimeSharedLayout
    }
  }, options);
}

async function fetchPublicSharedLayoutCatalog() {
  try {
    const data = await apiFetch("/bike-packing/public-templates", {
      timeoutMs: LIST_API_TIMEOUT_MS,
      silentErrors: true
    });
    const records = Array.isArray(data?.lists) ? data.lists : [];
    if (records.length || data?.canonical) return { ...data, lists: records, unified: true };
  } catch {
    // Fall through to the shared-only catalog. Public template language still
    // comes only from server metadata, not from legacy ids.
  }
  try {
    const data = await apiFetch("/bike-packing/public-shared-layouts", {
      timeoutMs: LIST_API_TIMEOUT_MS,
      silentErrors: true
    });
    const records = Array.isArray(data?.lists) ? data.lists : [];
    if (records.length || data?.canonical) return { ...data, lists: records, unified: false };
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

async function loadPublishedDemoState(language = uiLanguage, listId = "") {
  const normalized = normalizeUiLanguage(language);
  const demoTemplate = selectDemoTemplateForLanguage(normalized, listId);
  const demoListId = demoTemplate?.listId || demoTemplate?.id || demoPublicListIdForLanguage(normalized);
  try {
    const loaded = await fetchPublishedDemoTemplateState(demoTemplate, { fallbackLanguage: normalized });
    const demoState = loaded?.payload || null;
    if (isSafePublishedDemoState(demoState)) {
      confirmLoadedDemoPublicTemplate(normalized, demoState);
      return demoState;
    }
  } catch {
    // Missing localized demo is a normal isolated state until admin publishes it.
  }
  setDemoPublicTemplateMissing(normalized, true, { listId: demoListId });
  return null;
}

async function fetchPublishedDemoTemplateState(demoTemplate, { fallbackLanguage = uiLanguage } = {}) {
  const target = publicDemoTemplatePayloadTarget(demoTemplate, {
    fallbackLanguage,
    demoListIdForLanguage: demoPublicListIdForLanguage
  });
  if (!target) return null;
  const normalized = normalizeUiLanguage(target.language);
  const demoState = normalizeDemoPayloadForLanguage(
    publishedPayloadWithTemplateMetadata(await fetchPublishedListStateById(target.listId), {
      name: target.name,
      language: normalized
    }),
    normalized
  );
  if (!isSafePublishedDemoState(demoState)) return null;
  return {
    language: normalized,
    demoListId: target.listId,
    payload: demoState
  };
}

function isSafePublishedDemoState(demoState) {
  if (!isPackingStateShape(demoState)) return false;
  const stats = stateStats(demoState);
  if (stats.layouts < 1) return false;
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

async function defaultDemoState(language = uiLanguage, listId = "") {
  const normalized = normalizeUiLanguage(language);
  const published = await loadPublishedDemoState(normalized, listId);
  if (published) {
    setDemoStatePayloadForLanguage(normalized, published, { listId: activeDemoTemplateListId });
    return published;
  }
  const fallback = createEmptyPublicTemplateState(normalized);
  setDemoStatePayloadForLanguage(normalized, fallback, { listId: activeDemoTemplateListId });
  return fallback;
}

async function loadGuestPublishedDemoOnStartup({
  forcePublicScope = false,
  preferLocalCopy = false,
  allowAutomaticLocalCopy = false,
  remember = false
} = {}) {
  const demoState = await defaultDemoState();
  setDemoStatePayloadForLanguage(uiLanguage, demoState, { listId: activeDemoTemplateListId });
  const action = guestDemoStartupAction({
    forcePublicScope,
    preferLocalCopy,
    allowAutomaticLocalCopy,
    canUsePrivateState: canUsePrivateState(),
    syncDirty: syncMeta.dirty,
    hadAuthoritativeLocalStateAtStartup,
    suspiciousEmptyState: isSuspiciousEmptyPackingState(state)
  });
  if (action === "copy") {
    await createLocalDemoCopy({ forceNew: false, remember, exactTemplateName: true });
    initialRemoteLoadPending = false;
    renderPreservingPackingScroll();
    return true;
  }
  if (action === "readonly") {
    setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
    initialRemoteLoadPending = false;
    renderPreservingPackingScroll();
    return true;
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
  await loadGuestPublishedDemoOnStartup({
    preferLocalCopy: true,
    allowAutomaticLocalCopy: true,
    remember: true
  });
  switchView("packing");
  render();
  updateSyncUi(message || currentPublicTemplateStatusMessage());
}

async function saveRemoteState(options = {}) {
  return saveRemoteStateFlow({
    runtime: {
      get currentUser() { return currentUser; },
      get state() { return state; },
      get syncMeta() { return syncMeta; },
      get uiLanguage() { return uiLanguage; }
    },
    dependencies: {
      blockDestructiveLocalSave,
      canLocalStateOverrideRemote,
      clearStaleDirtyFlagIfNoLocalChanges,
      currentPublicTemplateStatusMessage,
      handleRemoteSaveConflict,
      hasLegacyPayloadChanges,
      isDemoPublicTemplateMissing,
      isNetworkError,
      isReadOnlyBikePackingContext,
      isReadOnlyBikePackingError,
      isSuspiciousEmptyPackingState,
      isTemporaryServerStorageError,
      isTimeoutError,
      loadBaseState,
      nowIso,
      remoteUpdatedAt,
      rememberConflictRemoteMeta,
      rememberCurrentSyncAccount,
      rememberRemoteIntegrityMeta,
      repairCollapsedActiveLayoutBeforeSave,
      saveBaseState,
      saveRemoteState,
      saveRemoteStateRecord,
      saveSyncMeta,
      serializeState,
      showToast,
      stateIntegrityMetaFromResponse,
      syncChangedBikePackingEntities,
      updateSyncUi,
      uploadPendingPhotos
    }
  }, options);
}

async function handleRemoteSaveConflict(error, options = {}) {
  return handleRemoteSaveConflictFlow(error, {
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get state() { return state; },
      get syncMeta() { return syncMeta; }
    },
    dependencies: {
      applyConflictChoices,
      applyRemoteState,
      askConflictResolution,
      blockRemoteIntegrityFailureIfNeeded,
      canLocalStateOverrideRemote,
      consumeGuestLocalLayoutCandidate,
      filterAutoResolvedMergeConflicts,
      isOwnLayoutEchoConflict,
      loadBaseState,
      mergeStateFromBase,
      normalizeRemoteState,
      nowIso,
      offerSaveGuestLocalLayouts,
      remoteUpdatedAt,
      rememberConflictRemoteMeta,
      rememberCurrentSyncAccount,
      rememberRemoteIntegrityMeta,
      renderPreservingPackingScroll,
      replaceState,
      sameJson,
      saveBaseState,
      saveRemoteState,
      saveSyncMeta,
      serializeState,
      showToast,
      stateIntegrityMetaFromResponse,
      updateSyncUi
    }
  }, options);
}

async function confirmGuestImportRemoteState(importedLayoutIds) {
  try {
    const data = await fetchRemoteStateRecord();
    const remoteState = normalizeRemoteState(data.record?.payload || data.payload || data.state);
    return validateGuestImportSyncState(remoteState, importedLayoutIds);
  } catch (error) {
    return {
      ok: false,
      reason: "remote-read-failed",
      error,
      stats: null
    };
  }
}

async function saveGuestImportToRemote(importedLayoutIds = []) {
  const localValidation = validateGuestImportSyncState(state, importedLayoutIds);
  if (!localValidation.ok) {
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    updateSyncUi("Гостевые укладки перенесены локально, но не отправлены: импорт не содержит вещей или сумок");
    return false;
  }
  await saveRemoteState({ notify: false, forceOverwrite: true });
  if (syncMeta.dirty) {
    updateSyncUi("Сервер попросил повторную синхронизацию · сохраняю гостевую укладку ещё раз...");
    await saveRemoteState({ notify: false, forceOverwrite: false });
  }
  const remoteValidation = await confirmGuestImportRemoteState(importedLayoutIds);
  if (remoteValidation.ok) return true;
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  updateSyncUi("Гостевые укладки перенесены локально, но сервер пока не вернул их после сохранения");
  return false;
}

async function offerPendingGuestLocalLayoutsAfterRemoteLoad() {
  if (isAdminSession()) {
    pendingGuestLocalLayoutCandidate = null;
    return false;
  }
  const guestCandidate = consumeGuestLocalLayoutCandidate() || storedGuestLocalLayoutCandidate();
  if (!guestCandidate) return false;
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  updateSyncUi("Личные укладки загружены · переношу гостевые укладки в аккаунт...");
  await offerSaveGuestLocalLayouts(guestCandidate);
  return true;
}

async function offerSaveGuestLocalLayouts(candidate) {
  if (isAdminSession()) return false;
  const layouts = guestCandidateLayouts(candidate);
  if (!candidate?.sourceState || !layouts.length || !currentUser) return false;
  const importedLayoutIds = importGuestLocalLayouts({ ...candidate, layouts }, { renameConflicts: true });
  if (!importedLayoutIds.length) {
    updateSyncUi("Гостевые укладки уже были перенесены или в них нет данных для импорта");
    return false;
  }
  renderPreservingPackingScroll();
  updateSyncUi(importedLayoutIds.length > 1
    ? "Гостевые укладки добавлены в аккаунт · сохраняю на сервер..."
    : "Гостевая укладка добавлена в аккаунт · сохраняю на сервер...");
  const saved = await saveGuestImportToRemote(importedLayoutIds);
  if (!saved) {
    updateSyncUi("Гостевые укладки перенесены в аккаунт · сохраню на сервер автоматически при следующей проверке");
    showToast("Гостевые укладки перенесены в аккаунт. Локальная версия не потеряна, синхронизация повторится автоматически.", "warning");
    scheduleRemoteSave();
    return false;
  }
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
  showToast(importedLayoutIds.length > 1
    ? "Гостевые укладки сохранены в аккаунт."
    : "Гостевая укладка сохранена в аккаунт.", "success");
  return true;
}

function importGuestLocalLayouts(candidate, { renameConflicts = true } = {}) {
  return importGuestLocalLayoutsToState(state, candidate, {
    addBackupDictionaryValues,
    applyGuestLocalDisplayPreferences,
    applyLayoutArrangement,
    cloneValue: clone,
    copyPublishedContainerToState,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    guestCandidateLayouts,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    guestLayoutFallbackName: GUEST_LAYOUT_FALLBACK_NAME,
    guestLocalDisplayPreferences,
    layoutDictionaryValues,
    migrateContainerOrder,
    normalizeContainerFields,
    normalizeDictionaryValues,
    normalizeItemCategories,
    normalizeItemFields,
    normalizeLayoutFields,
    nowIso,
    readableGuestDemoLayoutName,
    rememberActiveLayoutChoice,
    renameConflicts,
    repairContainerMembershipFromItemLinks,
    saveRecoverySnapshot,
    saveState,
    setActivePrivateScope,
    uniqueLayoutName
  });
}
async function loadRemoteState(options = {}) {
  return loadRemoteStateFlow({
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get currentUser() { return currentUser; },
      get initialRemoteLoadPending() { return initialRemoteLoadPending; },
      set initialRemoteLoadPending(value) { initialRemoteLoadPending = value; },
      get pendingGuestLocalLayoutCandidate() { return pendingGuestLocalLayoutCandidate; },
      get remoteRefreshInFlight() { return remoteRefreshInFlight; },
      get state() { return state; },
      get syncMeta() { return syncMeta; }
    },
    dependencies: {
      applyConflictChoices,
      applyRemoteState,
      askConfirmDialog,
      askConflictResolution,
      blockRemoteIntegrityFailureIfNeeded,
      canLocalStateOverrideRemote,
      canSeedEmptyRemoteFromLocal,
      clearStaleDirtyFlagIfNoLocalChanges,
      cloneStateForSync,
      consumeGuestLocalLayoutCandidate,
      createBlankBikePackingState,
      createEmptyUserState,
      canUseCachedStartupState,
      currentPackingListId: () => currentPackingListId || remoteRecordId(currentPackingListMeta),
      fetchRemoteListFreshnessRecord,
      fetchRemoteStateRecord,
      filterAutoResolvedMergeConflicts,
      formatMergeConflicts,
      hasLocalSavedState,
      isForeignLocalSyncState,
      isMeaningfulPackingState,
      isNetworkError,
      isPublicLayoutContext,
      isSharedListLinkRoute,
      isSuspiciousEmptyPackingState,
      isTemporaryServerStorageError,
      isTimeoutError,
      loadBaseState,
      mergeStateFromBase,
      normalizeRemoteState,
      nowIso,
      offerPendingGuestLocalLayoutsAfterRemoteLoad,
      offerSaveGuestLocalLayouts,
      remoteUpdatedAt,
      rememberCurrentSyncAccount,
      rememberRemoteIntegrityMeta,
      renderInitialLocalFallbackIfNeeded,
      renderPreservingPackingScroll,
      repairPrivateMojibakeLayoutNames,
      replaceState,
      sameJson,
      saveActivePackingListId,
      saveBaseState,
      saveRemoteState,
      saveSyncMeta,
      serializeState,
      serverChangedSinceLastSync,
      setLayoutLoadProgress,
      setLayoutLoadStatus,
      setPersonalLayoutsLoadedStatus,
      shouldImportGuestLayoutBeforeRemote,
      showToast,
      stateIntegrityMetaFromResponse,
      statePrivateLayoutCount,
      timeValue,
      updateSyncUi
    }
  }, options);
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
    const listId = currentPackingListId || remoteRecordId(currentPackingListMeta);
    if (listId) {
      try {
        const freshness = await fetchRemoteListFreshnessRecord(listId);
        if (!listFreshnessChanged(syncMeta, freshness)) {
          updateSyncUi();
          return;
        }
      } catch {
        // Older API processes do not have the lightweight endpoint; fall back
        // to the full refresh path so compatibility stays intact during deploys.
      }
    }
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

async function openAdminDemoLayout({ remember = true, language = uiLanguage, templateId = "" } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  if (!canOpenAdminPublishedEdit()) {
    showToast("Демо может редактировать только админ.", "error");
    return;
  }
  const normalizedLanguage = normalizeUiLanguage(language);
  const requestedTemplateId = String(templateId || "").trim();
  const demoTemplate = requestedTemplateId
    ? demoTemplateForLanguage(adminDemoTemplateCatalogEntries(), normalizedLanguage, {
      fallbackEntry: fallbackDemoTemplateEntry(normalizedLanguage),
      listId: requestedTemplateId
    })
    : selectDemoTemplateForLanguage(normalizedLanguage, "");
  const demoListId = requestedTemplateId || demoTemplate?.listId || demoTemplate?.id || demoPublicListIdForLanguage(normalizedLanguage);
  activeDemoTemplateListId = demoListId;
  const demoListConfirmedByServer = Boolean(demoTemplate?.serverConfirmed);
  const layoutChoice = demoTemplateChoiceForLanguage(normalizedLanguage, demoListId);
  const existing = Object.values(state.layouts || {}).find((layout) =>
    layout.adminDemo &&
    (
      String(layout.adminDemoListId || "").trim() === demoListId ||
      (!layout.adminDemoListId && demoListId === demoPublicListIdForLanguage(normalizedLanguage) && normalizeUiLanguage(layout.adminDemoLanguage || DEFAULT_LANGUAGE) === normalizedLanguage)
    )
  );
  if (existing) {
    existing.adminDemoListId = existing.adminDemoListId || demoListId;
    repairAdminDemoLayout(existing);
    if (demoListConfirmedByServer && !isLayoutMeaningful(existing.id)) {
      removeLayoutTree(existing.id);
      const demoState = await defaultDemoState(normalizedLanguage, demoListId);
      importDemoStateAsEditableLayout(demoState, { language: normalizedLanguage, listId: demoListId });
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
    const demoState = await defaultDemoState(normalizedLanguage, demoListId);
    importDemoStateAsEditableLayout(demoState, { language: normalizedLanguage, listId: demoListId });
    activateAdminPublishedLayout(state.activeLayoutId, { remember: false });
    if (remember) rememberActiveLayoutChoice(layoutChoice);
    updateSyncUi();
    showToast("Демо-укладка добавлена как обычная укладка. Правьте её и опубликуйте из меню.", "success");
  } catch (error) {
    updateSyncUi();
    showToast(`Не удалось открыть демо: ${error.message}`, "error");
  }
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

async function openDemoLayoutFromSelect({ remember = true, language = uiLanguage, templateId = "", allowOfflineCache = false } = {}) {
  if (!allowOfflineCache && !requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  if (canEditPublishedTemplatesNow()) {
    await openAdminDemoLayout({ remember, language, templateId });
    return;
  }
  const normalizedLanguage = normalizeUiLanguage(language);
  const demoTemplate = selectDemoTemplateForLanguage(normalizedLanguage, templateId);
  const demoListId = demoTemplate?.listId || demoTemplate?.id || demoPublicListIdForLanguage(normalizedLanguage);
  setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
  if (remember) rememberActiveLayoutChoice(demoTemplateChoiceForLanguage(normalizedLanguage, demoListId));
  switchView("packing");
  render();
  try {
    if (allowOfflineCache && arePublishedTemplatesBlocked()) {
      const cachedDemoState = demoStatePayloadForLanguage(normalizedLanguage, demoListId);
      if (!isMeaningfulPackingState(cachedDemoState)) {
        updateSyncUi("Демо-укладка · офлайн, локальная копия не найдена");
        showToast("Для этого demo-шаблона нет локальной копии. Откройте его один раз онлайн.", "warning");
        return;
      }
      setDemoStatePayloadForLanguage(normalizedLanguage, cachedDemoState, { listId: demoListId });
      render();
      updateSyncUi("Демо-укладка · офлайн-просмотр");
      return;
    }
    setDemoStatePayloadForLanguage(normalizedLanguage, await defaultDemoState(normalizedLanguage, demoListId), { listId: demoListId });
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
  const admin = canEditPublishedTemplatesNow();
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
    title: admin ? "Открыть шаблон для правки?" : "Открыть шаблон?",
    text: admin
      ? `Это публичный шаблон${layout?.name ? ` «${layout.name}»` : ""}. Изменения будут сохраняться отдельно от вашей личной укладки и после синхронизации станут видны другим пользователям.`
      : `Вы открываете шаблон${layout?.name ? ` «${layout.name}»` : ""}. Редактирование заблокировано, доступно только копирование в свои укладки.`,
    okText: admin ? "Открыть для правки" : "Смотреть шаблон",
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
  const language = normalizeUiLanguage(layout.adminDemoLanguage || layout.language || uiLanguage);
  const listId = String(layout.adminDemoListId || "").trim() || demoPublicListIdForLanguage(language);
  const confirmedTemplate = demoTemplateForLanguage(serverConfirmedDemoTemplates, language, { listId });
  if (!confirmedTemplate?.serverConfirmed) return false;
  removeLayoutTree(layout.id);
  importDemoStateAsEditableLayout(createBlankBikePackingState(), { language, listId });
  return true;
}

function importDemoStateAsEditableLayout(demoState, { language = uiLanguage, listId = "", activate = true, renderAfter = true } = {}) {
  return importDemoStateAsEditableLayoutValue(state, demoState, {
    activate,
    applyLayoutArrangement,
    categories,
    clone,
    createBlankBikePackingState,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    currentDemoTemplate,
    demoPublicListIdForLanguage,
    language,
    listId,
    locations,
    normalizeDemoLayoutName,
    normalizeDemoPayloadForLanguage,
    normalizeDictionaryValues,
    normalizePublishedStatePayload,
    normalizeUiLanguage,
    nowIso,
    render,
    renderAfter,
    saveState,
    setActivePrivateScope,
    switchView
  });
}

function repairAdminDemoLayout(layout) {
  return repairAdminDemoLayoutValue(layout, {
    normalizeDemoLayoutName,
    normalizeLayoutArrangement,
    state,
    uiLanguage,
    uniqueLayoutIds
  });
}
async function savePublishedLayoutRecord(layoutId = state.activeLayoutId, options = {}) {
  return savePublishedLayoutRecordFlow({
    runtime: {
      get activeDemoTemplateListId() { return activeDemoTemplateListId; },
      set activeDemoTemplateListId(value) { activeDemoTemplateListId = value; },
      get currentUser() { return currentUser; },
      get serverConfirmedDemoTemplates() { return serverConfirmedDemoTemplates; },
      get sharedLayoutsByLanguage() { return sharedLayoutsByLanguage; },
      get state() { return state; },
      get syncMeta() { return syncMeta; },
      get uiLanguage() { return uiLanguage; }
    },
    dependencies: {
      apiFetch,
      applyPublishedPayloadPhotosToLayoutState,
      canOpenAdminPublishedEdit,
      checkAdminApiCompatibility,
      cleanPublishedEntityId,
      clone,
      demoAdminStatePathForPublicListId,
      demoPublicListIdForLanguage,
      demoTemplateForLanguage,
      demoTemplateNameFromPayload,
      exportLayoutAsDemoState,
      findSharedLayout,
      getLayoutContainerIdSetForState,
      getLayoutItemIdSetForState,
      getUnsyncedPhotoEntries,
      getUploadablePhotoEntries,
      normalizeDemoLayoutName,
      normalizeDemoPayloadForLanguage,
      normalizeUiLanguage,
      nowIso,
      persistStateSnapshot,
      publicListIdForPublishedTarget,
      publishedLayoutTarget,
      publishedPayloadWithTemplateMetadata,
      refreshPublishedLayoutView,
      refreshPublicSharedLayoutCatalog,
      saveSyncMeta,
      setDemoPublicTemplateMissing,
      setDemoStatePayloadForLanguage,
      shouldCopyPublicTemplatePhotoReferencesOnServer,
      shouldCreatePublishedTemplateBeforePhotos,
      showToast,
      updateSyncUi,
      uploadPublishedLayoutPhotos,
      upsertDemoTemplateCatalogEntry,
      upsertRuntimeSharedLayout,
      withLayoutArrangementAppliedAsync,
      withoutPhotoReferences,
      LIST_SAVE_API_TIMEOUT_MS
    }
  }, layoutId, options);
}

function exportLayoutAsDemoState(layoutId = state.activeLayoutId) {
  captureActiveLayoutArrangement();
  return exportLayoutAsPublishedState(state, layoutId, {
    categories,
    clone,
    createLayoutArrangementFromCurrentState,
    cssSafeId,
    ensureLayoutDictionaries,
    fallbackName: "Демо-укладка",
    locations,
    normalizePublishedStatePayload,
    stripPublishedPublicOriginMarkers
  });
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

async function openSharedLayoutViewer(layoutId, { remember = true, allowOfflineCache = false } = {}) {
  if (!allowOfflineCache && !requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  if (canEditPublishedTemplatesNow()) {
    await openSharedLayoutForAdmin(layoutId, { remember });
    return;
  }
  setActiveReadOnlyScope(layoutId);
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  switchView("packing");
  render();
  updateSyncUi(`Шаблон · просмотр ${layout.name || ""}`);
  try {
    const loaded = await loadSharedLayoutPayload(layoutId);
    if (activeReadOnlyLayoutId() !== layoutId) return;
    if (loaded) {
      render();
      updateSyncUi(`Шаблон · загружен с сервера ${layout.name || ""}`);
    }
  } catch {
    if (activeReadOnlyLayoutId() !== layoutId) return;
    updateSyncUi(`Шаблон · локальная версия ${layout.name || ""}`);
  }
}

async function openSharedLayoutForAdmin(layoutId, { remember = true } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  const layout = findSharedLayout(layoutId);
  if (!layout || !canOpenAdminPublishedEdit()) return;
  updateSyncUi(`Шаблон · загружаю для правки ${layout.name || ""}`);
  try {
    await loadSharedLayoutPayload(layoutId);
  } catch {
    // Built-in shared templates remain editable if the public endpoint is unavailable.
  }
  const editableLayout = materializeSharedLayoutForAdmin(layoutId);
  if (!editableLayout) return;
  activateAdminPublishedLayout(editableLayout.id, { remember: false });
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  updateSyncUi(`Шаблон · админ-редактирование ${layout.name || ""}`);
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
      layout.statePayload = publishedPayloadWithTemplateMetadata(payload, {
        name: record.title || layout.name,
        language: layout.language
      });
      layout.listRecord = record;
      layout.name = record.title || layout.name || sharedPayloadActiveLayout(layout.statePayload)?.name;
      return true;
    } catch {
      return fallback;
    }
  }
  const remoteState = publishedPayloadWithTemplateMetadata(await fetchStateRecordByItemKey(sharedLayoutItemKey(layoutId)), {
    name: layout.name,
    language: layout.language
  });
  if (!isPublicSharedTemplatePayload(remoteState)) return false;
  layout.statePayload = remoteState;
  return true;
}

function renderSharedLayouts() {
  fillSelect(
    refs.sharedCopyLayoutSelect,
    Object.values(state.layouts).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId).map((layout) => [layout.id, layout.name]),
    state.activeLayoutId
  );
  refs.sharedLayoutsList.innerHTML = renderSharedLayoutsHtml(currentSharedLayouts(), {
    bagLabel: t("summary.bags"),
    itemLabel: t("tabs.items").toLowerCase(),
    rootsForLayout: sharedLayoutRoots,
    showPhotos: shouldShowItemPhotos()
  });
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

function readonlyTemplateMessage() {
  return activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID
    ? "Это демо-шаблон. Чтобы добавлять, редактировать и удалять, создайте свою укладку на основе шаблона."
    : "Это публичный шаблон. Чтобы добавлять, редактировать и удалять, создайте свою укладку на основе шаблона.";
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

function bindSharedVirtualEvents(root = document) {
  bindSharedVirtualEventsUi(root, {
    activeReadOnlyLayoutId,
    bindSharedLayoutEvents,
    canOpenAdminPublishedEdit,
    capturePackingScroll,
    confirmCreateLayoutFromReadonlyTemplate,
    copySharedItem,
    copySharedLayout,
    copySharedRoot,
    demoCopyActionText,
    editSharedSourceAsAdmin,
    getDescendantContainerIds,
    getSharedVirtualCollapsedContainers: () => sharedVirtualCollapsedContainers,
    getState: () => state,
    isReadonlyTemplateView,
    openSharedContainerCopyPicker,
    openSharedItemCopyPicker,
    openSharedReadonlyItemDialog,
    render,
    withSharedVirtualState
  });
}

function sharedLayoutRoots(layout) {
  return Array.isArray(layout?.roots) ? layout.roots : [];
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

function copyPublishedContainerToState(sourceState, containerId, { targetLayoutId = "", parentId = null, changedAt = nowIso(), idMap = null, preserveSource = false, sourceLayoutId = "", sourceSnapshot: providedSnapshot = null, copiedFromTemplateName = "" } = {}) {
  return copyPublishedContainerToStateValue(state, sourceState, containerId, {
    changedAt,
    copiedFromTemplateName,
    idMap,
    parentId,
    preserveSource,
    sourceLayoutId,
    sourceSnapshot: providedSnapshot,
    targetLayoutId
  }, {
    appendCopiedFromTemplateNote,
    cloneIsolatedPublicEntity,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    markLocalPublicCopyOrigin,
    publicCopySourceIdFromRecord,
    snapshotContainerTree,
    stripPublicOriginForPrivateCopy,
    touchLayout
  });
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

function demoCopyPreferredTemplateName(language = uiLanguage, listId = activeDemoTemplateListId) {
  const template = currentDemoTemplate(language, listId);
  return template?.serverConfirmed ? String(template.name || "").trim() : "";
}

function demoCopyTemplateListId(language = uiLanguage, listId = activeDemoTemplateListId) {
  const template = currentDemoTemplate(language, listId);
  return String(template?.listId || template?.id || listId || demoPublicListIdForLanguage(language)).trim();
}

function demoCopyLayoutName(sourceName = "", { exactTemplateName = false, preferredName = "" } = {}) {
  const fallback = uiLanguage === "en" ? "Demo copy" : "\u041c\u043e\u044f \u0434\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430";
  return guestDemoCopyLayoutNameValue(sourceName, {
    fallbackName: fallback,
    preferredName,
    normalizeName: (name) => normalizeDemoLayoutName(name, uiLanguage),
    uniqueName: uniqueLayoutName,
    exactTemplateName
  });
}

function copyPublishedDemoStateToLocalLayout(demoState, { activate = true, remember = true, exactTemplateName = false } = {}) {
  const source = normalizeDemoPayloadForLanguage(normalizePublishedStatePayload(demoState), uiLanguage) || createBlankBikePackingState();
  const sourceLayout = source.layouts?.[source.activeLayoutId] || Object.values(source.layouts || {})[0];
  if (!sourceLayout) return "";
  const stamp = Date.now();
  const changedAt = nowIso();
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = templateCopySourceRootIds(sourceLayout)
    .map((id) => copyPublishedContainerToState(source, id, {
      targetLayoutId: "",
      changedAt,
      idMap,
      sourceLayoutId: sourceLayout.id
    }))
    .filter(Boolean);

  const layoutId = `layout-guest-demo-${stamp}`;
  const demoListId = demoCopyTemplateListId(uiLanguage, activeDemoTemplateListId);
  const preferredName = demoCopyPreferredTemplateName(uiLanguage, demoListId);
  state.layouts[layoutId] = {
    id: layoutId,
    name: demoCopyLayoutName(sourceLayout.name, { exactTemplateName, preferredName }),
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    [GUEST_DEMO_COPY_FLAG]: !canUsePrivateState(),
    demoSourceLanguage: uiLanguage,
    demoSourceListId: demoListId,
    guestDemoCopyCreatedAt: changedAt,
    locations: normalizeDictionaryValues(source.locations, layoutDictionaryValues(sourceLayout, "location", source)),
    categories: normalizeDictionaryValues(source.categories, layoutDictionaryValues(sourceLayout, "category", source)),
    ...currentCreateMeta(changedAt)
  };
  if (!canUsePrivateState()) {
    state.itemDisplayMode = ITEM_DISPLAY_MODE_PUBLIC_DEFAULT;
    state.showItemMeta = true;
  }
  if (activate) {
    if (canUsePrivateState()) setActivePrivateScope();
    else setActiveLocalEditableScope(layoutId);
    state.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
    if (remember) rememberActiveLayoutChoice(layoutId);
    switchView("packing");
  }
  saveState({ sync: false });
  render();
  return layoutId;
}

function pruneUneditedGuestDemoCopies() {
  const plan = guestDemoCopyCleanupPlan({
    layouts: state.layouts,
    activeLayoutId: state.activeLayoutId,
    isGuestDemoCopy: isGuestDemoCopyLayoutRecord,
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
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

function reusableGuestDemoCopyLayout() {
  const layouts = Object.values(state.layouts || {}).filter((layout) => layout?.[GUEST_DEMO_COPY_FLAG]);
  return layouts.find((layout) => layout.id === state.activeLayoutId) ||
    layouts.find((layout) => isAutomaticGuestDemoCopyLayout(layout)) ||
    layouts[0] ||
    null;
}

function renameReusableGuestDemoCopy(existing, demoState, { exactTemplateName = false } = {}) {
  if (!existing || !exactTemplateName || guestLayoutHasUserContentEdits(state, existing)) return false;
  const sourceLayout = demoState?.layouts?.[demoState.activeLayoutId] || Object.values(demoState?.layouts || {})[0];
  const language = existing.demoSourceLanguage || uiLanguage;
  const listId = existing.demoSourceListId || activeDemoTemplateListId;
  const preferredName = demoCopyPreferredTemplateName(language, listId);
  const nextName = demoCopyLayoutName(sourceLayout?.name, { exactTemplateName: true, preferredName });
  if (!nextName || existing.name === nextName) return false;
  existing.name = nextName;
  existing.demoSourceListId = demoCopyTemplateListId(language, listId);
  saveState();
  return true;
}

async function createLocalDemoCopy({ forceNew = false, remember = true, exactTemplateName = false } = {}) {
  if (!forceNew && localDemoCopyInFlight) return localDemoCopyInFlight;
  const task = (async () => {
    if (!forceNew) pruneUneditedGuestDemoCopies();
    let existing = !forceNew ? reusableGuestDemoCopyLayout() : null;
    if (existing && !exactTemplateName) {
      openPrivateLayout(existing.id, { remember });
      return existing.id;
    }
    const demoState = await defaultDemoState(uiLanguage, activeDemoTemplateListId);
    if (existing) {
      renameReusableGuestDemoCopy(existing, demoState, { exactTemplateName });
      openPrivateLayout(existing.id, { remember });
      return existing.id;
    }
    if (!forceNew) {
      pruneUneditedGuestDemoCopies();
      existing = reusableGuestDemoCopyLayout();
      if (existing) {
        renameReusableGuestDemoCopy(existing, demoState, { exactTemplateName });
        openPrivateLayout(existing.id, { remember });
        return existing.id;
      }
    }
    const layoutId = copyPublishedDemoStateToLocalLayout(demoState, { remember, exactTemplateName });
    await syncCreatedPrivateLayoutEntities(layoutId);
    updateSyncUi(currentUser ? "" : t("sync.localUnlocked"));
    return layoutId;
  })();
  if (forceNew) return task;
  localDemoCopyInFlight = task;
  try {
    return await task;
  } finally {
    if (localDemoCopyInFlight === task) localDemoCopyInFlight = null;
  }
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
    await createLocalDemoCopy({ forceNew: true }).catch((error) => {
      updateSyncUi(`Demo copy failed: ${error.message}`);
      showToast(`Не удалось сохранить демо-копию: ${error.message}`, "error");
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
  saveState({ sync: false });
  if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
  switchView("packing");
  render();
  try {
    await syncCreatedPrivateLayoutEntities(nextLayoutId);
    showToast(`Укладка «${layout.name}» скопирована.`, "success");
  } catch (error) {
    showToast(`Укладка создана локально, но не сохранена на сервере: ${error.message}`, "error");
  }
}

function materializeSharedLayoutForAdmin(layoutId = activeReadOnlyLayoutId()) {
  return materializeSharedLayoutForAdminState(layoutId, {
    canOpenAdminPublishedEdit,
    copyPublishedContainerToState,
    copySharedRootToState,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    currentEditMeta,
    ensureLayoutDictionaries,
    findSharedLayout,
    isLayoutMeaningful,
    locations,
    categories,
    mergeBuiltInSharedEntriesIntoAdminLayout,
    mergePublishedSharedStateIntoAdminLayout,
    normalizeDictionaryValues,
    normalizeLayoutArrangement,
    normalizeUiLanguage,
    nowIso,
    removeLayoutTree,
    repairEmptyTemplateCopyDraftFromPublishedLayout,
    saveState,
    sharedLayoutRoots,
    sharedLayoutStatePayload,
    sharedPayloadActiveLayout,
    state,
    templateCopySourceScore,
    uiLanguage
  });
}

async function materializeDemoLayoutForAdminCopy(language = uiLanguage, templateId = "") {
  if (!canOpenAdminPublishedEdit()) return null;
  const normalizedLanguage = normalizeUiLanguage(language);
  const requestedTemplateId = String(templateId || "").trim();
  const demoTemplate = requestedTemplateId
    ? demoTemplateForLanguage(adminDemoTemplateCatalogEntries(), normalizedLanguage, {
      fallbackEntry: fallbackDemoTemplateEntry(normalizedLanguage),
      listId: requestedTemplateId
    })
    : currentDemoTemplate(normalizedLanguage);
  const demoListId = requestedTemplateId || demoTemplate?.listId || demoTemplate?.id || demoPublicListIdForLanguage(normalizedLanguage);
  const existing = Object.values(state.layouts || {}).find((layout) =>
    layout?.adminDemo &&
    (
      String(layout.adminDemoListId || "").trim() === demoListId ||
      (!layout.adminDemoListId && demoListId === demoPublicListIdForLanguage(normalizedLanguage) && normalizeUiLanguage(layout.adminDemoLanguage || DEFAULT_LANGUAGE) === normalizedLanguage)
    )
  );
  if (existing && isLayoutMeaningful(existing.id)) {
    existing.adminDemoListId = existing.adminDemoListId || demoListId;
    repairAdminDemoLayout(existing);
    return existing;
  }
  if (existing) removeLayoutTree(existing.id);
  const demoState = await defaultDemoState(normalizedLanguage, demoListId);
  return importDemoStateAsEditableLayout(demoState, {
    language: normalizedLanguage,
    listId: demoListId,
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
  return mergePublishedSharedStateIntoAdminLayoutValue(layout, editableLayout, {
    changedAt: nowIso(),
    clone,
    ensureLayoutDictionaries,
    hasRemotePhotoUrl,
    normalizeLayoutArrangement,
    normalizePhotoUrlFields,
    normalizeSharedGearName,
    sameJson,
    sourceState: sharedLayoutStatePayload(layout),
    state,
    touchLayout
  });
}

function syncPublishedEntityPhotos(target, source) {
  return syncPublishedEntityPhotosValue(target, source, {
    clone,
    hasRemotePhotoUrl,
    normalizePhotoUrlFields,
    sameJson
  });
}

function mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout) {
  return mergeBuiltInSharedEntriesIntoAdminLayoutValue(layout, editableLayout, {
    addItemToLayoutArrangement,
    changedAt: nowIso(),
    copySharedItemToState,
    copySharedRootToState,
    ensureLayoutDictionaries,
    normalizeLayoutArrangement,
    normalizeSharedGearName,
    state,
    touchLayout,
    writeContainerTreeToLayoutArrangement
  });
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
    const payload = await fetchPublishedListStateById(activeDemoTemplateListId || currentDemoTemplate(uiLanguage)?.listId || demoPublicListIdForLanguage());
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
    path = demoAdminPathForPublicListId(
      "/history",
      activeDemoTemplateListId || currentDemoTemplate(uiLanguage)?.listId || demoPublicListIdForLanguage(uiLanguage),
      uiLanguage
    );
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
          ${group.records.map((record, index) => renderHistoryRecordArticleHtml(record, index, group.records, {
            activeSource: activeHistorySource,
            currentComparisonState: currentHistoryComparisonState,
            expandedRecordId: expandedHistoryRecordId,
            formatDateTime: formatHistoryDateTime,
            recordKey: historyRecordKey,
            recordState: historyRecordState,
            summarizePayload: summarizeHistoryPayload
          })).join("")}
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

function historyRecordState(record, source = activeHistorySource) {
  return historyRecordStateForSync(record, source, {
    normalizePublishedStatePayload,
    normalizeRemoteState
  });
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

function historySourceLabel(source = activeHistorySource) {
  if (source === "demo") return "Демо";
  if (source === "shared") {
    const layout = findSharedLayout(refs.historySharedSelect?.value);
    return layout?.name ? `Шаблон · ${layout.name}` : "Шаблон";
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
  if (activeHistorySource === "demo") {
    return {
      type: "demo",
      sharedId: "",
      language: uiLanguage,
      demoListId: activeDemoTemplateListId || currentDemoTemplate(uiLanguage)?.listId || demoPublicListIdForLanguage(uiLanguage)
    };
  }
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
    ? demoAdminStatePathForPublicListId(target.demoListId || "", target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
  const targetLanguage = target.type === "demo"
    ? target.language || uiLanguage
    : findSharedLayout(target.sharedId)?.language || uiLanguage;
  refs.historyDialog.close();
  updateSyncUi(target.type === "demo" ? "Публикую demo-версию из истории..." : "Публикую shared-версию из истории...");
  await apiFetch(path, {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      title: record.title || record.listTitle || historyPayloadTitle(payload, historySourceLabel()),
      description: record.description || "",
      language: targetLanguage,
      payload
    })
  });
  if (target.type === "demo") {
    setDemoStatePayloadForLanguage(target.language || uiLanguage, payload, { listId: target.demoListId || "" });
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
  hydrateItemPhotos(document, { photoObjectUrls }).finally(() => bindPhotoGalleries(document, photoGalleryBindingOptions()));
}

function getCurrentView() {
  return document.querySelector(".tab.active")?.dataset.view || "packing";
}

function updateViewScopedControls(view = getCurrentView()) {
  updateViewScopedControlsUi({
    document,
    isFilterContextActive,
    isSharedLayoutView,
    refs,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    state,
    updateCompactStickyControls,
    updateLayoutCollapseAllToggle,
    updatePackingViewModeControl,
    view
  });
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

function renderPreservingPackingScroll() {
  const board = getPackingScrollHost();
  if (board && !refs.packingView.classList.contains("hidden")) {
    capturePackingScroll();
  }
  render();
  refreshOpenPhotoDialogPreviews();
}

function refreshOpenPhotoDialogPreviews() {
  if (refs.dialog?.open) {
    const itemPhotos = itemDialogPhotoDraft?.photos ||
      (editingItemId && state.items?.[editingItemId] ? normalizeItemPhotos(state.items[editingItemId]) : null);
    if (itemPhotos) updateItemDialogPhotoPreview(itemPhotos).catch(() => null);
  }
  if (refs.rootContainerDialog?.open) {
    const containerPhotos = rootContainerDialogPhotoDraft?.photos ||
      (editingRootContainerId && state.containers?.[editingRootContainerId] ? normalizeItemPhotos(state.containers[editingRootContainerId]) : null);
    if (containerPhotos) updateRootContainerDialogPhotoPreview(containerPhotos).catch(() => null);
  }
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
  const result = renderFilterControls({
    activeAdminDraftOptionLabel,
    activeDemoTemplateListId,
    activeReadOnlyLayoutId,
    adminPublicLayoutOptions,
    arePublishedTemplatesBlocked,
    canEditPublishedTemplatesNow,
    canManageActiveLayout,
    canOpenAdminPublishedEdit,
    canUsePrivateState,
    canViewAdminPublishedCatalog,
    currentSharedLayouts,
    demoCopyActionText,
    demoTemplateChoiceForEntry,
    demoTemplateChoiceForLanguage,
    demoTemplateFallbackName,
    demoTemplatesForUiLanguage,
    dictionaryOptionsForUi,
    fillSelect,
    getActiveEditableLayoutId,
    isDemoLayoutChoice,
    isReadOnlyStateScope,
    isSharedLayoutView,
    linkedSharedListLayout,
    publicLayoutChoiceForLayout,
    readonlyPublicTemplateOptionLabel,
    refs,
    renderItemCategoryPicker,
    selectedCategoryFilters,
    state,
    t,
    templateDraftLayoutId,
    uiLanguage,
    updateCategoryFilterButton,
    updateFilterContextToggle,
    updateFilterHighlights,
    updateLayoutCollapseAllToggle,
    updateLayoutLoadStatusUi,
    updateMetaToggle
  });
  selectedCategoryFilters = result.selectedCategoryFilters;
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
  const viewport = hasActiveContentFilter() ? captureViewportSnapshot() : null;
  const anchor = viewport
    ? (isFilterContextActive() ? captureCurrentFilterMatchAnchor() : null) || captureVisibleContentAnchor()
    : null;
  keepAnchorContainersOpen(anchor);
  state.itemDisplayMode = nextItemDisplayModeValue(itemDisplayMode());
  ensureItemDisplayModeState(state);
  saveLocalUiState();
  render();
  if (viewport) restoreViewportSnapshot(viewport, null, anchor);
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
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  if (!containerId || !container) {
    refs.rootContainerPlacementField.hidden = true;
    return;
  }
  const isPackage = Boolean(container.parentId);
  const active = isPackage || getRootContainerDialogLayoutRootIds().includes(containerId);
  const currentText = isPackage
    ? layoutContainerPath(layout, getRootContainerDialogParentId())
    : (active ? "Текущая укладка" : "Вне текущей укладки");
  refs.rootContainerPlacementField.hidden = false;
  if (refs.rootContainerPlacementLabel) refs.rootContainerPlacementLabel.textContent = "Находится в";
  if (refs.rootContainerPlacementCurrent) {
    refs.rootContainerPlacementCurrent.hidden = false;
    refs.rootContainerPlacementCurrent.textContent = currentText || "Вне укладки";
    refs.rootContainerPlacementCurrent.classList.toggle("active", active);
  }
  refs.rootContainerPlacementBtn.textContent = "Переложить в пределах укладки";
  refs.rootContainerPlacementBtn.classList.remove("active");
  refs.rootContainerPlacementBtn.classList.add("repack-button");
  refs.rootContainerPlacementBtn.setAttribute("aria-label", isPackage
    ? `Переложить из ${currentText || "текущего места"}`
    : `Переставить: ${currentText}`);
}

function updateRootContainerRemoveFromLayoutButton() {
  if (!refs.rootContainerRemoveFromLayoutBtn) return;
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  const isNested = Boolean(layout && editingRootContainerId && !getLayoutContainerRootStatus(layout, editingRootContainerId));
  const canRemove = canRemoveContainerFromActiveLayout(editingRootContainerId);
  refs.rootContainerRemoveFromLayoutBtn.textContent = isNested ? "Удалить навсегда" : "Удалить из укладки";
  refs.rootContainerRemoveFromLayoutBtn.setAttribute(
    "aria-label",
    isNested ? "Удалить вложенную сумку или место навсегда" : "Удалить сумку или место из укладки"
  );
  refs.rootContainerRemoveFromLayoutBtn.title = isNested ? "Удалить навсегда" : "Удалить из укладки";
  refs.rootContainerRemoveFromLayoutBtn.hidden = !canRemove;
  refs.rootContainerRemoveFromLayoutBtn.disabled = !canRemove;
}

function updateRootContainerDeleteForeverButton() {
  if (!refs.rootContainerDeleteForeverBtn) return;
  const container = state.containers?.[editingRootContainerId];
  const canDelete = Boolean(
    editingRootContainerId &&
    container &&
    !container.parentId &&
    !isReadOnlyStateScope() &&
    !isSharedLayoutView()
  );
  refs.rootContainerDeleteForeverBtn.hidden = !canDelete;
  refs.rootContainerDeleteForeverBtn.disabled = !canDelete;
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
  const nestedSubject = "Этот вложенный пакет будет удалён навсегда.";
  const confirmed = await askConfirmDialog({
    title: isRoot ? "Удалить из укладки?" : "Удалить навсегда?",
    text: isRoot
      ? `«${container.name}» будет убран из текущей укладки.`
      : `«${container.name}» будет удалён навсегда как вложенная сумка/место.`,
    highlightText: itemCount
      ? `${isRoot ? "" : `${nestedSubject}\n`}${formatThingCount(itemCount)} из ${isRoot ? "этой сумки/места" : "этого пакета"} будут вынуты из укладки и станут вне укладки. Вложенные пакеты внутри будут удалены.`
      : isRoot
        ? "Эта сумка/место уже пустая, поэтому из текущей укладки уйдёт только пустая заготовка."
        : nestedSubject,
    tone: itemCount || !isRoot ? "danger" : "safe",
    okText: isRoot ? "Удалить" : "Удалить навсегда"
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
  updateItemRemoveFromLayoutButton();
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
  const copied = await duplicateItemToContainerInLayoutState(state, itemId, targetContainerId, targetLayoutId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    cloneEntity: cloneIsolatedPublicEntity,
    copyName: makeItemCopyName,
    copyPhotos: copyRecordPhotosForLocalDuplicate,
    currentEditMeta,
    id: copyId,
    mapRecordToTarget: (record) => {
      if (targetIsPublic) {
        record.publicCatalogLayoutId = targetLayoutId;
      } else {
        markRecordPhotosForCurrentListCopy(record);
        stripPublicOriginForPrivateCopy(record);
      }
    },
    markRecordOrigin: markPrivateCopyOriginFromSource,
    preserveName: sourceIsPublicCopy
  });
  if (!copied) {
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

function snapshotContainerTreeFromLiveState(containerId, targetState = state) {
  return snapshotContainerTreeFromLiveStateValue(containerId, targetState);
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
  return summarizeLayoutTreeIdDuplicates({
    sourceSnapshot,
    targetLayout: state.layouts[layoutId],
    getLayoutContainerIdSet,
    getLayoutItemIdSet
  });
}

function linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "") {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return false;
  ensureWritableTargetLayoutContext(targetLayoutId);
  const changedAt = nowIso();
  let linkedRootId = "";
  withLayoutArrangementApplied(targetLayoutId, () => {
    linkedRootId = linkExistingContainerTreeToLayoutState(state, sourceSnapshot, targetLayoutId, targetParentId, {
      changedAt,
      normalizeLayoutArrangement,
      targetContainerIds: [...getLayoutContainerIdSet(targetLayout)],
      touchLayout
    });
  });
  if (!linkedRootId) return false;
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
  const targetContainerSet = getLayoutContainerIdSet(targetLayout);
  if (targetParentId && (!state.containers[targetParentId] || !targetContainerSet.has(targetParentId))) return "";

  const {
    rootId: nextRootId,
    copiedPlacements,
    copiedItemContainers
  } = await duplicateContainerSnapshotRecords(sourceSnapshot, {
    changedAt,
    cloneEntity: cloneIsolatedPublicEntity,
    copyContainerName: makeContainerCopyName,
    copyPhotos: copyRecordPhotosForLocalDuplicate,
    currentEditMeta,
    mapPublicOrigin,
    mapRecordToTarget,
    normalizeContainerColor,
    sourceIsPublicCopy,
    targetParentId: targetParentId || null,
    targetState: state
  });
  if (!nextRootId) return "";

  const placed = placeDuplicatedContainerSnapshotInLayoutState(state, targetLayoutId, nextRootId, {
    changedAt,
    copiedItemContainers,
    copiedPlacements,
    normalizeLayoutArrangement,
    targetParentId,
    touchContainer,
    touchLayout
  });
  if (!placed) return "";
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
  const layout = state.layouts?.[itemDialogTargetLayoutId || getPublishedEditLayoutId()];
  const hasContainer = Boolean(containerId && state.containers[containerId]);
  const path = hasContainer ? layoutContainerPath(layout, containerId) : "Вне укладки";
  if (refs.itemContainerLabel) refs.itemContainerLabel.textContent = hasContainer ? "Лежит в" : "Положить в";
  if (refs.itemContainerCurrent) {
    refs.itemContainerCurrent.hidden = false;
    refs.itemContainerCurrent.textContent = path;
    refs.itemContainerCurrent.classList.toggle("active", hasContainer);
  }
  refs.itemContainerPickerBtn.textContent = "Переложить в пределах укладки";
  refs.itemContainerPickerBtn.classList.remove("active");
  refs.itemContainerPickerBtn.classList.add("repack-button");
  refs.itemContainerPickerBtn.setAttribute("aria-label", hasContainer
    ? `Переложить из ${path}`
    : "Положить в укладку");
}

function updateItemRemoveFromLayoutButton() {
  if (!refs.itemRemoveFromLayoutBtn) return;
  const layout = state.layouts?.[itemDialogTargetLayoutId || getPublishedEditLayoutId()];
  const canRemove = Boolean(
    editingItemId &&
    refs.itemContainer.value &&
    getItemContainerIdInLayout(layout, editingItemId)
  );
  refs.itemRemoveFromLayoutBtn.hidden = !canRemove;
  refs.itemRemoveFromLayoutBtn.disabled = !canRemove;
}

function updateItemDeleteForeverButton() {
  if (!refs.itemDeleteForeverBtn) return;
  const canDelete = Boolean(editingItemId && state.items?.[editingItemId]);
  refs.itemDeleteForeverBtn.hidden = !canDelete;
  refs.itemDeleteForeverBtn.disabled = !canDelete;
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

function createSharedVirtualState(layout = currentSharedLayout()) {
  return createSharedVirtualStateForPublic(layout, {
    cloneValue: clone,
    collapsedDefaultsForTemplateContainers,
    createLayoutArrangementFromCurrentState,
    demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID,
    locations,
    normalizePublishedStatePayload,
    publicReadonlyItemDisplayMode,
    sharedGearPhotos,
    sharedVirtualCollapsedContainers,
    shouldShowItemLabelsForMode,
    uiLanguage
  });
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
  const filteredEmpty = hasActiveContentFilter();
  const emptyText = t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound");
  refs.packingView.innerHTML = `<div class="board">${columns.join("") || renderEmptyState(emptyText, { extraClass: "board-empty", filtered: filteredEmpty })}</div>`;
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

function renderSharedModeBanner(layout = currentSharedLayout(), { compact = false, showCopyButton = true } = {}) {
  const demoSource = layout?.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  const buttonText = demoSource ? demoCopyActionText() : t("buttons.copyAll");
  const viewerText = demoSource
    ? (uiLanguage === "en"
      ? "Original demo template is read-only."
      : "\u0418\u0441\u0445\u043e\u0434\u043d\u044b\u0439 \u0434\u0435\u043c\u043e-\u0448\u0430\u0431\u043b\u043e\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430.")
    : t("shared.viewerText");
  return `
    <div class="shared-mode-banner ${compact ? "shared-mode-banner-compact" : ""}">
      <div class="shared-mode-banner-text">
        <strong>${escapeHtml(layout?.name || t("shared.layout"))}</strong>
        <span>${escapeHtml(viewerText)}</span>
      </div>
      ${showCopyButton ? `<button type="button" class="ghost" data-copy-shared-layout="${escapeHtml(layout?.id || "")}">${escapeHtml(buttonText)}</button>` : ""}
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
    const filteredEmpty = hasActiveContentFilter();
    const emptyText = t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound");
    refs.packingView.innerHTML = `
      ${renderSharedModeBanner(currentSharedLayout())}
      <div class="board">${columns.join("") || renderEmptyState(emptyText, { extraClass: "board-empty", filtered: filteredEmpty })}</div>
    `;
  });
  bindSharedVirtualEvents(refs.packingView);
  const sharedBoard = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(sharedBoard);
  bindBoardScroll(sharedBoard);
  bindFixedScrollbar(sharedBoard);
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
  const root = view === "items"
    ? refs.itemsView
    : view === "bags"
      ? refs.bagsView
      : view === "packing"
        ? refs.packingView
        : null;
  if (!root || root.classList.contains("hidden")) return null;
  const top = stickyViewportBottom() + 1;
  const topContext = view === "packing" ? getTopPackingContextAnchor(root, top) : null;
  if (topContext) return buildVisibleContentAnchor(topContext);
  const itemCandidates = getVisibleAnchorCandidates(
    root,
    view === "bags" ? "[data-root-card]" : "[data-item-id], [data-list-item-id]",
    top
  );
  const candidates = itemCandidates.length
    ? itemCandidates
    : getVisibleAnchorCandidates(root, "[data-subcontainer-id], [data-root-container-id]", top);
  const first = candidates[0];
  return first ? buildVisibleContentAnchor(first) : null;
}

function captureCurrentFilterMatchAnchor() {
  if (!isFilterContextActive()) return null;
  const target = getFilterMatchElements()[filterMatchIndex];
  if (!target || target.offsetParent === null) return null;
  return buildVisibleContentAnchor({
    element: target,
    rect: target.getBoundingClientRect()
  });
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
  if (element.dataset.rootCard) return `root:${element.dataset.rootCard}`;
  return "";
}

function findAnchorElement(anchor) {
  const [type, id] = String(anchor.key || "").split(":");
  if (!type || !id) return null;
  const escapedId = cssEscape(id);
  if (type === "item") return refs.packingView.querySelector(`[data-item-id="${escapedId}"]`);
  if (type === "list-item") return refs.itemsView.querySelector(`[data-list-item-id="${escapedId}"]`);
  if (type === "container") return refs.packingView.querySelector(`[data-subcontainer-id="${escapedId}"]`);
  if (type === "root") {
    const view = getCurrentView();
    if (view === "bags") {
      return refs.bagsView.querySelector(`[data-root-card="${escapedId}"]`) ||
        refs.packingView.querySelector(`[data-root-container-id="${escapedId}"]`);
    }
    return refs.packingView.querySelector(`[data-root-container-id="${escapedId}"]`) ||
      refs.bagsView.querySelector(`[data-root-card="${escapedId}"]`);
  }
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
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  return renderRootContainerColumnHtml({
    allNestedCollapsed,
    container,
    contentsHtml: rootCollapsed ? "" : renderContainerContents(container.id),
    hasNestedContainers,
    justAdded,
    packed,
    photoHtml: rootCollapsed ? "" : renderItemPhoto(container),
    readonly: isReadOnlyStateScope(),
    readonlyTemplate: isReadonlyTemplateView(),
    rootCollapsed,
    titleHtml: `${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}`,
    totalWeightHtml: renderContainerWeightText(total)
  });
}

function renderFilteredContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  return renderFilteredRootContainerColumnHtml({
    container,
    contentsHtml: rootCollapsed ? "" : renderFilteredContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: rootCollapsed ? "" : renderItemPhoto(container),
    readonly: isReadOnlyStateScope(),
    readonlyTemplate: isReadonlyTemplateView(),
    rootCollapsed,
    titleHtml: `${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${highlight(container.name)}`,
    totalWeightHtml: renderContainerWeightText(total)
  });
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
  return renderSubcontainerSectionHtml({
    collapsed,
    container,
    contentsHtml: renderContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: renderItemPhoto(container),
    titleHtml: subcontainerTitleHtml({
      container,
      editing: editingContainerId === container.id,
      packed,
      titleTextHtml: isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)
    }),
    weightHtml: renderContainerWeightText(containerWeight(containerId))
  });
}

function renderFilteredSubcontainer(containerId) {
  const container = state.containers[containerId];
  const result = getContainerFilterResult(containerId);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = recentlyAddedContainerId === container.id && (!recentlyAddedLayoutId || recentlyAddedLayoutId === state.activeLayoutId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const collapsed = getFilterViewCollapsed(containerId, defaultCollapsed);
  return renderSubcontainerSectionHtml({
    collapsed,
    container,
    contentsHtml: collapsed ? "" : renderFilteredContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: renderItemPhoto(container),
    titleHtml: subcontainerTitleHtml({
      container,
      editing: editingContainerId === container.id,
      packed,
      titleTextHtml: highlight(container.name)
    }),
    weightHtml: renderContainerWeightText(containerWeight(containerId))
  });
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
  return getContainerItemIdsDeepForState(state, containerId, {
    includeItem: (item) => !isItemRemovedFromActiveLayout(item)
  });
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
  return renderPackingItemCardHtml({
    categoriesHtml: itemCategories(item).map((category) => `<span class="pill">${highlight(category)}</span>`).join(""),
    collection,
    filterMatch,
    item,
    justAdded,
    labelsVisible: shouldShowItemLabels(),
    locationHtml: highlight(item.location),
    packed,
    packedVisible,
    photoHtml: renderItemPhoto(item),
    titleDragAttr,
    titleHtml: title,
    weightHtml: formatItemWeight(item)
  });
}

function renderItemPhoto(item, { force = false } = {}) {
  return renderItemPhotoHtml(item, {
    force,
    photoObjectUrls,
    showPhotos: shouldShowItemPhotos()
  });
}

function photoGalleryBindingOptions() {
  return {
    onItemPreviewActive(index) {
      itemDialogPhotoActiveIndex = index;
      updateItemDialogPhotoPrimaryButton();
    },
    onRootContainerPreviewActive(index) {
      rootContainerDialogPhotoActiveIndex = index;
      updateRootContainerDialogPhotoPrimaryButton();
    }
  };
}

function bindPackingEvents(root) {
  bindPackingEventsUi(root, {
    bindPointerPackingDrag,
    bindRootColumnDrag,
    capturePackingScroll,
    cleanupDropState,
    confirmRemoveItemFromActiveLayout,
    copyItem,
    getDescendantContainerIds,
    getEditingContainerId: () => editingContainerId,
    getLastItemTitleTap: () => lastItemTitleTap,
    getState: () => state,
    getDraggingContainerId: () => draggingContainerId,
    hasActiveContentFilter,
    isBlockedDropzone,
    isCoarsePointerInteraction,
    isOriginalContainerPosition,
    isOriginalItemPosition,
    getEntryAfterPointer,
    getPlaceholderContainerIndex,
    getPlaceholderItemIndex,
    markDropzoneDragOver,
    moveContainer,
    moveItem,
    openAddToContainerDialog,
    openItemDialog,
    openRootContainerDialog,
    placePlaceholder,
    removeDropzoneDragOver,
    render,
    renderPreservingPackingScroll,
    saveLocalUiState,
    saveState,
    setDraggingContainerId: (value) => {
      draggingContainerId = value;
    },
    setDraggingItemId: (value) => {
      draggingItemId = value;
    },
    setEditingContainerId: (value) => {
      editingContainerId = value;
    },
    setEditingItemTitleId: (value) => {
      editingItemTitleId = value;
    },
    setLastItemTitleTap: (value) => {
      lastItemTitleTap = value;
    },
    startInlineItemTitleEdit,
    toggleFilterViewCollapsed,
    togglePacked,
    touchContainer,
    touchItem
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

function getPackingDragController() {
  if (!packingDragController) {
    packingDragController = createPackingDragController({
      edgeScrollMaxSpeed: EDGE_SCROLL_MAX_SPEED,
      edgeScrollZone: EDGE_SCROLL_ZONE,
      getContainerItemIdsDeep,
      getDescendantContainerIds,
      getDraggingContainerId: () => draggingContainerId,
      getDraggingItemId: () => draggingItemId,
      getItemContainerIdInLayout,
      getState: () => state,
      isOriginalRootColumnPosition,
      moveContainer,
      moveContainerIntoContainerTop,
      moveItem,
      moveItemIntoContainerTop,
      moveRootColumn,
      nestedGroupHoverDelayMs: NESTED_GROUP_HOVER_DELAY_MS,
      pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
      setDraggingContainerId: (value) => {
        draggingContainerId = value;
      },
      setDraggingItemId: (value) => {
        draggingItemId = value;
      },
      touchDragCancelDistance: TOUCH_DRAG_CANCEL_DISTANCE,
      touchDragDelayMs: TOUCH_DRAG_DELAY_MS,
      touchScrollCancelDistance: TOUCH_SCROLL_CANCEL_DISTANCE,
      createGroupFromItems
    });
  }
  return packingDragController;
}

function bindRootColumnDrag(root) {
  getPackingDragController().bindRootColumnDrag(root);
}

function bindPointerPackingDrag(root, placeholder) {
  getPackingDragController().bindPointerPackingDrag(root, placeholder);
}

function preventDragContextMenu(event) {
  getPackingDragController().preventDragContextMenu(event);
}

function getTouchPoint(event) {
  return getPackingDragController().getTouchPoint(event);
}

function isHoldDragInput(inputType) {
  return getPackingDragController().isHoldDragInput(inputType);
}

function markDragPending(source) {
  getPackingDragController().markDragPending(source);
}

function clearDragPending(source) {
  getPackingDragController().clearDragPending(source);
}

function vibrateDragStart(input) {
  getPackingDragController().vibrateDragStart(input);
}

function isBlockedDropzone(zone) {
  return getPackingDragController().isBlockedDropzone(zone);
}

function getEntryAfterPointer(zone, pointerY) {
  return getPackingDragController().getEntryAfterPointer(zone, pointerY);
}

function placePlaceholder(parent, placeholder, beforeNode = null) {
  getPackingDragController().placePlaceholder(parent, placeholder, beforeNode);
}

function getPlaceholderItemIndex(zone, placeholder) {
  return getPackingDragController().getPlaceholderItemIndex(zone, placeholder);
}

function getPlaceholderContainerIndex(zone, placeholder) {
  return getPackingDragController().getPlaceholderContainerIndex(zone, placeholder);
}

function isOriginalItemPosition(zone, placeholder) {
  return getPackingDragController().isOriginalItemPosition(zone, placeholder);
}

function isOriginalContainerPosition(zone, placeholder) {
  return getPackingDragController().isOriginalContainerPosition(zone, placeholder);
}

function cleanupDropState(root, placeholder) {
  getPackingDragController().cleanupDropState(root, placeholder);
}

function removeDropzoneDragOver(zone) {
  getPackingDragController().removeDropzoneDragOver(zone);
}

function markDropzoneDragOver(root, zone) {
  getPackingDragController().markDropzoneDragOver(root, zone);
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
    selectedCatalogItemIds = new Set();
    selectedCatalogItemAnchorId = "";
    renderSharedItemsView();
    return;
  }
  const items = getItemsForItemsView();
  selectedCatalogItemIds = normalizeCatalogSelection(selectedCatalogItemIds, items.map((item) => item.id));
  if (selectedCatalogItemAnchorId && !items.some((item) => item.id === selectedCatalogItemAnchorId)) selectedCatalogItemAnchorId = "";
  const counts = getItemsUsageCounts();
  const filteredEmpty = hasActiveContentFilter();
  refs.itemsView.innerHTML = renderItemsViewHtml({
    counts,
    emptyFiltered: filteredEmpty,
    emptyText: t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound"),
    itemSortMode,
    itemUsageFilter,
    items,
    renderListItem,
    showLabels: shouldShowItemLabels(),
    showPhotos: shouldShowItemPhotos()
  });
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
    button.addEventListener("click", () => copyCatalogItems(catalogItemActionIds(button.dataset.copyItem)));
  });
  refs.itemsView.querySelectorAll("[data-delete-item]").forEach((button) => {
    button.addEventListener("click", () => confirmDeleteCatalogItems(catalogItemActionIds(button.dataset.deleteItem)));
  });
  bindItemCatalogSelection();
}

function renderSharedItemsView() {
  withSharedVirtualState(() => {
    const items = getItemsForItemsView();
    const counts = getItemsUsageCounts();
    const filteredEmpty = hasActiveContentFilter();
    refs.itemsView.innerHTML = renderSharedItemsViewHtml({
      bannerHtml: renderSharedModeBanner(currentSharedLayout(), { compact: true }),
      copyAllButtonHtml: "",
      counts,
      emptyFiltered: filteredEmpty,
      emptyText: t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound"),
      itemSortMode,
      itemUsageFilter,
      items,
      renderListItem,
      showLabels: shouldShowItemLabels(),
      showPhotos: shouldShowItemPhotos()
    });
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
}

function renderListItem(item) {
  const filterMatch = isFilterContextActive() && matchesItemsViewFilters(item);
  const inCurrentLayout = isItemInActiveLayout(item);
  const placementText = item.containerId ? containerPath(item.containerId) : "Вне укладки";
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(item)
      ? renderItemPhoto(item)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">Без фото</div>`
    : "";
  return renderListItemHtml({
    categories: itemCategories(item),
    filterMatch,
    highlightText: highlight,
    inCurrentLayout,
    item,
    selected: selectedCatalogItemIds.has(item.id),
    photoHtml: photoSlot,
    placementText,
    quantityText: itemQuantity(item) > 1 ? `${itemQuantity(item)} шт.` : "",
    showLabels: shouldShowItemLabels()
  });
}

function isCatalogSelectionClick(event) {
  return Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey);
}

function isCatalogActionTarget(target) {
  return Boolean(target?.closest?.("button, input, select, textarea, label, a, [data-photo-open]"));
}

function hasCatalogSelection() {
  return selectedCatalogItemIds.size > 0 || selectedCatalogRootIds.size > 0;
}

function clearCatalogSelection() {
  selectedCatalogItemIds = new Set();
  selectedCatalogItemAnchorId = "";
  selectedCatalogRootIds = new Set();
  selectedCatalogRootAnchorId = "";
}

function resetCatalogSelectionOnPlainClick(event) {
  if (!hasCatalogSelection()) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (target.closest?.("dialog")) return;
  if (target.closest?.("[data-copy-item], [data-delete-item], [data-copy-root], [data-delete-root]")) return;
  const view = getCurrentView();
  clearCatalogSelection();
  if (view === "items") renderItems();
  else if (view === "bags") renderBags();
}

function bindItemCatalogSelection() {
  const list = refs.itemsView.querySelector(".items-list");
  if (!list) return;
  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-list-item-id]");
    if (!card || !list.contains(card) || isCatalogActionTarget(event.target) || !isCatalogSelectionClick(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const result = updateCatalogSelection({
      anchorId: selectedCatalogItemAnchorId,
      range: event.shiftKey,
      selectedIds: selectedCatalogItemIds,
      targetId: card.dataset.listItemId,
      toggle: event.ctrlKey || event.metaKey,
      visibleIds: getItemsForItemsView().map((item) => item.id)
    });
    selectedCatalogItemIds = result.selectedIds;
    selectedCatalogItemAnchorId = result.anchorId;
    renderItems();
  }, { capture: true });
}

function bindRootCatalogSelection() {
  const list = refs.bagsView.querySelector(".root-container-list");
  if (!list) return;
  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-root-card]");
    if (!card || !list.contains(card) || isCatalogActionTarget(event.target) || !isCatalogSelectionClick(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const result = updateCatalogSelection({
      anchorId: selectedCatalogRootAnchorId,
      range: event.shiftKey,
      selectedIds: selectedCatalogRootIds,
      targetId: card.dataset.rootCard,
      toggle: event.ctrlKey || event.metaKey,
      visibleIds: getRootContainersForSettings().map((container) => container.id)
    });
    selectedCatalogRootIds = result.selectedIds;
    selectedCatalogRootAnchorId = result.anchorId;
    renderBags();
  }, { capture: true });
}

function catalogItemActionIds(itemId) {
  return catalogActionTargetIds(selectedCatalogItemIds, itemId).filter((id) => state.items?.[id]);
}

function catalogRootActionIds(containerId) {
  return catalogActionTargetIds(selectedCatalogRootIds, containerId).filter((id) => {
    const container = state.containers?.[id];
    return container && !container.parentId;
  });
}

function selectionNames(records, limit = 8) {
  const names = records.map((record) => record?.name).filter(Boolean);
  const visible = names.slice(0, limit).map((name) => `- ${name}`).join("\n");
  return names.length > limit ? `${visible}\n- ещё ${names.length - limit}` : visible;
}

function formatRootContainerCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} сумка/место`;
  return `${count} сумок/мест`;
}

async function copyCatalogItems(itemIds) {
  const ids = [...new Set(itemIds)].filter((id) => state.items?.[id]);
  if (ids.length <= 1) {
    if (ids[0]) copyItem(ids[0], { keepPlacement: false });
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Скопировать выбранные вещи?",
    text: `Будет создано ${formatThingCount(ids.length)} во вкладке «Вещи».`,
    highlightText: selectionNames(ids.map((id) => state.items[id])),
    okText: "Скопировать",
    tone: "safe"
  });
  if (!confirmed) return;
  for (const id of ids) await copyItem(id, { keepPlacement: false, confirm: false });
  selectedCatalogItemIds = new Set();
  selectedCatalogItemAnchorId = "";
  renderItems();
}

async function confirmDeleteCatalogItems(itemIds) {
  const ids = [...new Set(itemIds)].filter((id) => state.items?.[id]);
  if (ids.length <= 1) {
    if (ids[0]) confirmDeleteItem(ids[0]);
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Удалить выбранные вещи навсегда?",
    text: `${formatThingCount(ids.length)} будут удалены из списка вещей и из всех укладок. Сумки и места останутся. Это действие нельзя отменить.`,
    highlightText: selectionNames(ids.map((id) => state.items[id])),
    okText: "Удалить",
    tone: "danger"
  });
  if (!confirmed) return;
  ids.forEach((id) => deleteItemForever(id, { cleanupContainers: false, renderAfter: false }));
  selectedCatalogItemIds = new Set();
  selectedCatalogItemAnchorId = "";
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

async function copyCatalogRootContainers(containerIds) {
  const ids = [...new Set(containerIds)].filter((id) => state.containers?.[id] && !state.containers[id].parentId);
  if (ids.length <= 1) {
    if (ids[0]) copyRootContainer(ids[0]);
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Скопировать выбранные сумки и места?",
    text: `Будет создано ${formatRootContainerCount(ids.length)} без вещей внутри.`,
    highlightText: selectionNames(ids.map((id) => state.containers[id])),
    okText: "Скопировать",
    tone: "safe"
  });
  if (!confirmed) return;
  for (const id of ids) await duplicateRootContainer(id);
  selectedCatalogRootIds = new Set();
  selectedCatalogRootAnchorId = "";
  renderBags();
}

async function confirmDeleteCatalogRootContainers(containerIds) {
  const ids = [...new Set(containerIds)].filter((id) => state.containers?.[id] && !state.containers[id].parentId);
  if (ids.length <= 1) {
    if (ids[0]) confirmDeleteRootContainer(ids[0]);
    return;
  }
  const confirmed = await askConfirmDialog({
    title: "Удалить выбранные сумки и места?",
    text: `${formatRootContainerCount(ids.length)} будут удалены из списка сумок и мест и из всех укладок.`,
    highlightText: selectionNames(ids.map((id) => state.containers[id])),
    okText: "Удалить",
    tone: "danger"
  });
  if (!confirmed) return;
  ids.forEach((id) => deleteRootContainer(id));
  selectedCatalogRootIds = new Set();
  selectedCatalogRootAnchorId = "";
  renderBags();
}

function renderBags() {
  if (isSharedLayoutView()) {
    selectedCatalogRootIds = new Set();
    selectedCatalogRootAnchorId = "";
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
      ${renderSharedModeBanner(currentSharedLayout(), { compact: true })}
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
      ${renderSharedModeBanner(currentSharedLayout(), { compact: true })}
      <div class="settings-grid">
        ${renderDictionary("Места хранения", "location", dictionaryOptionsForUi("location"))}
        ${renderDictionary("Категории", "category", dictionaryOptionsForUi("category"))}
      </div>
    `;
  });
  bindSharedVirtualEvents(refs.settingsView);
}

function renderLayoutEditor() {
  const layoutId = getActiveEditableLayoutId();
  return renderLayoutEditorHtml({
    containerWeight,
    containers: state.containers,
    layout: state.layouts[layoutId]
  });
}

function bindLayoutEditor() {
  bindLayoutEditorControls({
    addRootContainerToActiveLayout,
    cleanupLayoutDropState,
    formatThingCount,
    getContainerItemIdsDeep,
    getLayoutPlaceholderIndex,
    getLayoutRowAfterPointer,
    isLayoutDrag,
    openConfirmDialog,
    openLayoutRootDialog,
    removeRootContainerFromActiveLayout,
    state
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
  bindSettingsPointerDragUi({
    addRootContainerToActiveLayout,
    cleanupLayoutDropState,
    dropList: document.querySelector("#layoutDropList"),
    getLayoutPlaceholderIndex,
    getLayoutRowAfterPointer,
    getState: () => state,
    getTouchPoint,
    isHoldDragInput,
    markDragPending,
    pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
    preventDragContextMenu,
    render,
    touchDragCancelDistance: TOUCH_DRAG_CANCEL_DISTANCE,
    touchDragDelayMs: TOUCH_DRAG_DELAY_MS,
    touchScrollCancelDistance: TOUCH_SCROLL_CANCEL_DISTANCE,
    vibrateDragStart,
    clearDragPending
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
  selectedCatalogRootIds = normalizeCatalogSelection(selectedCatalogRootIds, roots.map((container) => container.id));
  if (selectedCatalogRootAnchorId && !roots.some((container) => container.id === selectedCatalogRootAnchorId)) selectedCatalogRootAnchorId = "";
  const counts = rootContainerUsageCountsForCatalog(state, {
    isPrivateCatalogContainerRecord,
    isRootContainerForEditor,
    isRootContainerInActiveCatalog,
    isRootContainerInActiveLayout
  });
  return renderRootContainersEditorHtml({
    counts,
    emptyFiltered: hasActiveContentFilter(),
    emptyText: t(hasActiveContentFilter() ? "empty.notFoundByFilter" : "empty.notFound"),
    renderRootContainerCard,
    rootContainerSortMode,
    rootContainerUsageFilter,
    roots,
    showLabels: shouldShowItemLabels(),
    showPhotos: shouldShowItemPhotos()
  });
}

function renderRootContainerCard(container) {
  const filterMatch = isFilterContextActive() && matchesRootContainerFieldsFilter(container);
  const inCurrentLayout = isRootContainerInActiveLayout(container.id);
  const location = container.location || defaultRootContainerLocation(state);
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(container)
      ? renderItemPhoto(container)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">Без фото</div>`
    : "";
  return renderRootContainerCardHtml({
    container,
    filterMatch,
    highlightText: highlight,
    inCurrentLayout,
    location,
    selected: selectedCatalogRootIds.has(container.id),
    photoHtml: photoSlot,
    showLabels: shouldShowItemLabels()
  });
}

function bindRootContainersEditor() {
  bindRootContainersEditorControls({
    bindRootCatalogSelection,
    catalogRootActionIds,
    confirmDeleteCatalogRootContainers,
    copyCatalogRootContainers,
    getLastRootContainerTitleTap: () => lastRootContainerTitleTap,
    getRootContainerSortMode: () => rootContainerSortMode,
    openRootContainerDialog,
    parseWeightInput,
    render,
    saveState,
    saveUiSettings,
    setEditingRootContainerId: (value) => {
      editingRootContainerId = value;
    },
    setLastRootContainerTitleTap: (value) => {
      lastRootContainerTitleTap = value;
    },
    setRootContainerSortMode: (value) => {
      rootContainerSortMode = value;
    },
    setRootContainerUsageFilter: (value) => {
      rootContainerUsageFilter = value;
    },
    state,
    touchContainer
  });
}
function renderDictionary(title, type, values) {
  return renderDictionaryHtml(title, type, values, { editingEntry: editingDictionaryEntry });
}

function dictionaryRenameSideEffects(type, oldValue, newValue) {
  if (type === "location") {
    if (refs.locationFilter.value === oldValue) refs.locationFilter.value = newValue;
    return;
  }
  selectedCategoryFilters = selectedCategoryFilters.map((category) => category === oldValue ? newValue : category)
    .filter((category, index, list) => list.indexOf(category) === index);
}

function bindDictionary(type, owner = activeDictionaryOwner()) {
  bindDictionaryControls(type, {
    activeDictionaryOwner,
    addCustomDictionaryValue,
    capitalize,
    dictionaryEditScope,
    dictionaryOptionsForOwner,
    editingDictionaryEntry,
    formatThingCount,
    itemCategories,
    markEdited,
    nowIso,
    onRenamed: dictionaryRenameSideEffects,
    openConfirmDialog,
    owner,
    removeCustomDictionaryValue,
    renameCustomDictionaryValue,
    render,
    requireUsageCapacity,
    saveDictionaryOwner,
    setEditingDictionaryEntry: (value) => {
      editingDictionaryEntry = value;
    },
    showToast,
    touchContainer
  });
}

function renameDictionaryEntry(type, oldValue, rawNewValue, owner = activeDictionaryOwner()) {
  return renameDictionaryEntryValue(type, oldValue, rawNewValue, {
    dictionaryEditScope,
    dictionaryOptionsForOwner,
    itemCategories,
    markEdited,
    nowIso,
    onRenamed: dictionaryRenameSideEffects,
    owner,
    renameCustomDictionaryValue,
    render,
    saveDictionaryOwner,
    setEditingDictionaryEntry: (value) => {
      editingDictionaryEntry = value;
    },
    showToast,
    touchContainer
  });
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

function createGroupFromItems(itemId, targetItemId) {
  if (itemId === targetItemId) return;
  if (!requireUsageCapacity("containers")) return;
  const layoutId = state.activeLayoutId;
  if (!state.layouts?.[layoutId] || !state.items[itemId] || !state.items[targetItemId]) return;
  capturePackingScroll();
  const changedAt = nowIso();
  const groupId = `container-${Date.now()}`;
  const created = createGroupFromItemsInState(state, layoutId, itemId, targetItemId, {
    changedAt,
    currentEditMeta,
    groupId,
    markRecordActivePublicCatalog,
    touchLayout
  });
  if (!created) return;
  editingContainerId = groupId;
  applyLayoutArrangement(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeItemFromActiveLayout(itemId, layoutId = state.activeLayoutId) {
  capturePackingScroll();
  const changedAt = nowIso();
  if (!removeItemFromLayoutInState(state, layoutId, itemId, { changedAt, touchLayout })) return;
  if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
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
  return placeExistingItemInLayoutInState(state, itemId, containerId, layoutId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    targetIndex,
    touchLayout
  });
}

function moveItemInLayoutArrangement(layout, itemId, targetContainerId, targetIndex = null) {
  return moveItemInLayoutArrangementForState(state, layout, itemId, targetContainerId, targetIndex);
}

function moveContainerInLayoutArrangement(layout, containerId, targetParentId, targetIndex = null) {
  return moveContainerInLayoutArrangementForState(state, layout, containerId, targetParentId, targetIndex);
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

async function confirmRemoveEditingItemFromActiveLayout(event) {
  event?.preventDefault();
  const itemId = editingItemId;
  const item = state.items?.[itemId];
  const layoutId = itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  if (!item || !layout || !getItemContainerIdInLayout(layout, itemId)) return;
  const confirmed = await askConfirmDialog({
    title: "Убрать вещь из укладки?",
    text: `«${item.name}» исчезнет из текущей укладки, но останется во вкладке «Вещи».`,
    highlightText: "Вещь сейчас участвует в текущей укладке.",
    okText: "Убрать",
    tone: "danger"
  });
  if (!confirmed) return;
  refs.dialog?.close("remove-from-layout");
  removeItemFromActiveLayout(itemId, layoutId);
}

function confirmDeleteEditingItemForever(event) {
  event?.preventDefault();
  const itemId = editingItemId;
  if (!itemId || !state.items?.[itemId]) return;
  confirmDeleteItem(itemId, {
    afterConfirm: () => refs.dialog?.close("delete-item")
  });
}

function confirmDeleteItem(itemId, { afterConfirm = null } = {}) {
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
    ...itemDeleteConfirm({ item, placementText, hasPlacements: Boolean(placements.length) }),
    onConfirm: () => {
      deleteItemForever(itemId);
      afterConfirm?.();
    }
  });
}

function describeVisibleItemLayoutPlacements(item) {
  return visibleItemLayoutPlacementLabels(state, item, { containerPath });
}

function deleteItemPhotos(item, itemId) {
  normalizeItemPhotos(item).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(itemId, photo);
  });
}

function deleteItemForever(itemId, { cleanupContainers = true, renderAfter = true } = {}) {
  const changedAt = nowIso();
  const deleted = deleteItemFromState(state, itemId, {
    beforeDeleteItem: deleteItemPhotos,
    changedAt,
    cleanupEmptyContainers: cleanupContainers ? cleanupEmptyContainers : () => {},
    markEdited,
    removeItemFromLayoutArrangement,
    touchLayoutsReferencingItem
  });
  if (!deleted) return;
  saveState();
  scheduleActivePublishedEditSave();
  if (renderAfter) render();
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
  const id = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const copied = await copyItemInState(state, itemId, {
    activeLayoutId: state.activeLayoutId,
    changedAt,
    copyName: makeItemCopyName,
    copyPhotos: copyRecordPhotosForLocalDuplicate,
    currentEditMeta,
    id,
    keepPlacement,
    markRecordActivePublicCatalog,
    touchLayout
  });
  if (!copied) return;
  if (copied.placed) applyLayoutArrangement(state.activeLayoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
  const container = copied.placed;
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
  const copied = await duplicateRootContainerInState(state, containerId, {
    addToLayoutId,
    changedAt,
    copyName: makeContainerCopyName,
    copyPhotos: copyRecordPhotosForLocalDuplicate,
    currentEditMeta,
    id: copyId,
    markRecordActivePublicCatalog,
    normalizeContainerColor,
    touchLayout
  });
  if (!copied) return;
  saveState();
  scheduleActivePublishedEditSave();
  render();
  showToast(copied.addedToLayout
    ? "Сумка или место продублированы в текущей укладке."
    : "Сумка или место скопированы пустыми вне укладки.", "success");
}

function makeContainerCopyName(name) {
  return makeContainerCopyNameForState(name, state.containers);
}

function confirmDeleteEditingRootContainerForever(event) {
  event?.preventDefault();
  const containerId = editingRootContainerId;
  if (!containerId || !state.containers?.[containerId]) return;
  confirmDeleteRootContainer(containerId, {
    afterConfirm: () => refs.rootContainerDialog?.close("delete-container")
  });
}

function confirmDeleteRootContainer(containerId, { afterConfirm = null } = {}) {
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
    ...rootContainerDeleteConfirm({
      container,
      layoutText,
      itemsText,
      risky: Boolean(layoutNames.length || itemCount)
    }),
    onConfirm: () => {
      deleteRootContainer(containerId);
      afterConfirm?.();
    }
  });
}

function deleteRootContainer(containerId) {
  const changedAt = nowIso();
  const deleted = deleteRootContainerFromState(state, containerId, {
    beforeDeleteContainer: deleteContainerPhotos,
    changedAt,
    markEdited
  });
  if (!deleted) return;
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
  return removeContainerFromLayoutOnlyInState(state, layout, containerId, {
    changedAt,
    deleteUnusedLayoutContainerEntity,
    markEdited,
    markRecordActivePublicCatalog
  });
}

function deleteUnusedLayoutContainerEntity(containerId, removedFromLayoutId = "") {
  deleteUnusedLayoutContainerEntityFromState(state, containerId, removedFromLayoutId, {
    beforeDeleteContainer: deleteContainerPhotos
  });
}

function deleteContainerPhotos(container, containerId) {
  if (!container) return;
  normalizeItemPhotos(container).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(containerId, photo, "container");
  });
}

function makeItemCopyName(name) {
  return makeItemCopyNameForState(name, state.items);
}

function touchLayoutsReferencingItem(itemId, changedAt = nowIso()) {
  touchLayoutsReferencingItemInState(state, itemId, {
    changedAt,
    markEdited
  });
}

function cleanupEmptyContainers(containerId) {
  cleanupEmptyContainersInState(state, containerId, { markEdited });
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
  if (!state.layouts[layoutId]?.rootContainerIds?.includes(containerId)) return;
  capturePackingScroll();
  moveRootColumnInState(state, layoutId, containerId, targetIndex, { touchLayout });
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
  updateRootContainerDeleteForeverButton();
  if (refs.rootContainerCopyToContainerBtn) refs.rootContainerCopyToContainerBtn.hidden = !containerId;
  refs.rootContainerNote.value = container?.note || "";
  rootContainerDialogPhotoDraft = null;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
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
  updateItemRemoveFromLayoutButton();
  updateItemDeleteForeverButton();
  refs.itemNote.value = item.note || "";
  itemDialogPhotoDraft = null;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
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
  updateItemDeleteForeverButton();
  refs.itemNote.value = item.description || "";
  itemDialogPhotoDraft = null;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview(sharedGearPhotos(item));
  setSharedReadonlyItemDialog(true);
  openModalDialog(refs.dialog);
}

function setSharedReadonlyItemDialog(readonly) {
  refs.copySharedItemDialogBtn.hidden = !readonly;
  refs.saveItemBtn.hidden = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = readonly;
  if (refs.itemRemoveFromLayoutBtn) refs.itemRemoveFromLayoutBtn.hidden = readonly || refs.itemRemoveFromLayoutBtn.hidden;
  if (refs.itemDeleteForeverBtn) refs.itemDeleteForeverBtn.hidden = readonly || refs.itemDeleteForeverBtn.hidden;
  refs.dialog.querySelectorAll("input, textarea, select").forEach((element) => {
    element.disabled = readonly;
  });
  refs.itemContainerPickerBtn.disabled = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.disabled = readonly;
  if (refs.itemRemoveFromLayoutBtn) refs.itemRemoveFromLayoutBtn.disabled = readonly || refs.itemRemoveFromLayoutBtn.disabled;
  if (refs.itemDeleteForeverBtn) refs.itemDeleteForeverBtn.disabled = readonly || refs.itemDeleteForeverBtn.disabled;
  refs.itemPhotoRemoveBtn.disabled = readonly;
  if (refs.itemPhotoPrimaryBtn) refs.itemPhotoPrimaryBtn.disabled = readonly || refs.itemPhotoPrimaryBtn.disabled;
  refs.itemPhotoInput.disabled = readonly;
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.disabled = readonly;
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
    ...serverConfirmedDemoTemplates.map((layout) => layout?.name),
    ...(linkedSharedListLayout && !isDeletedSharedLayoutId(linkedSharedListLayout.id) ? [linkedSharedListLayout.name] : []),
    ...allSharedLayoutsByAdminOrder().map((layout) => layout?.name),
    ...Object.values(state.layouts || {})
      .filter((layout) => layout?.id !== exceptLayoutId && layout?.adminDemo)
      .map((layout) => layout?.name),
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
  return canManageLayout(getActiveEditableLayoutId());
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
  const layout = createLayoutCopyRecordFromSource({
    id,
    requestedName,
    sourceLayout,
    state,
    changedAt,
    canUsePrivateState,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    ensureLayoutDictionaries,
    ensurePrivateDictionaries,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    uniqueLayoutName,
    language,
    publicTemplate
  });
  if (!layout) return "";
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
  return getTemplateCopyRootSnapshots(sourceLayout, sourceState, {
    snapshotContainerTree,
    templateCopySourceRootIds
  });
}

function templateCopySourceScore(sourceLayout, sourceState = state) {
  return getTemplateCopySourceScore(sourceLayout, sourceState, {
    snapshotContainerTree,
    templateCopySourceRootIds,
    snapshotScore: containerTreeSnapshotScore
  });
}

async function loadPublishedTemplateCopySource(sourceLayout) {
  return loadPublishedTemplateCopySourceValue(sourceLayout, {
    demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID,
    fetchStateRecordByItemKey,
    findSharedLayout,
    isManagedDemoTemplateLayout,
    loadPublishedDemoState,
    loadSharedLayoutPayload,
    normalizeUiLanguage,
    publishedPayloadWithTemplateMetadata,
    sharedLayoutItemKey,
    sharedLayoutLanguageFromPayload,
    sharedLayoutStatePayload,
    sharedLayoutsByLanguage,
    sharedPayloadActiveLayout,
    templateCopySourceScore,
    uiLanguage,
    upsertRuntimeSharedLayout
  });
}

async function createTemplateCopyFromSource(sourceLayout, requestedName, options = {}) {
  return createTemplateCopyFromSourceFlow({
    runtime: {
      get serverConfirmedDemoTemplates() { return serverConfirmedDemoTemplates; },
      get state() { return state; },
      get uiLanguage() { return uiLanguage; }
    },
    dependencies: {
      activateAdminPublishedLayout,
      captureActiveLayoutArrangement,
      containerTreeSnapshotScore,
      copyPublishedContainerToState,
      createDemoTemplateCopyRecord,
      createDemoTemplateListId,
      createEmptyLayoutArrangement,
      createEmptyPublicTemplateDraftRecord,
      createLayoutArrangementFromCurrentState,
      createTemplateCopyLayoutRecordValue,
      createTemplateCopyRecord,
      currentCreateMeta,
      ensureLayoutDictionaries,
      ensurePrivateDictionaries,
      isAdminEditablePublishedLayout,
      loadPublishedTemplateCopySource,
      markLayoutPhotosForCurrentListCopy,
      normalizeLayoutArrangement,
      normalizeUiLanguage,
      nowIso,
      render,
      saveLayoutMutation,
      solidifyTemplateDraftLayout,
      templateCopyRootSnapshots,
      uniquePublishedTemplateName,
      withLayoutArrangementApplied
    }
  }, sourceLayout, requestedName, options);
}

function layoutCreateCopySourceOptions({ templates = false, includeTemplates = false } = {}) {
  const publicOptions = canViewAdminPublishedCatalog()
    ? adminPublicLayoutOptions({
      disabled: false,
      readonly: !canEditPublishedTemplatesNow(),
      canView: true
    })
    : [];
  return getLayoutCreateCopySourceOptions({
    adminPublicLayoutOptions: publicOptions,
    canUsePrivateState: canUsePrivateState(),
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    includeTemplates,
    layouts: state.layouts,
    templates
  });
}

function isLayoutCreateTemplateLayoutMode(mode) {
  return isLayoutCreateTemplateLayoutModeValue(mode);
}

async function resolveLayoutCreateCopySource(choice) {
  const value = String(choice || "").trim();
  return state.layouts?.[value] || null;
}

async function resolveLayoutCreateTemplateCopySource(choice) {
  return resolveLayoutCreateTemplateCopySourceValue(choice, {
    canOpenAdminPublishedEdit,
    demoLanguageFromLayoutChoice,
    demoPublicListIdForLanguage,
    demoTemplateFallbackName,
    demoTemplateForLanguage,
    demoTemplateIdFromLayoutChoice,
    findSharedLayout,
    isDemoLayoutChoice,
    loadPublishedDemoState,
    loadSharedLayoutPayload,
    normalizeDemoPayloadForLanguage,
    normalizePublishedStatePayload,
    serverConfirmedDemoTemplates,
    sharedLayoutStatePayload,
    sharedPayloadActiveLayout,
    state,
    templateDraftLayoutId
  });
}

async function resolveLayoutCreateTemplateCopyLayout(choice) {
  return resolveLayoutCreateTemplateCopyLayoutValue(choice, {
    canOpenAdminPublishedEdit,
    demoLanguageFromLayoutChoice,
    demoTemplateIdFromLayoutChoice,
    isAdminEditablePublishedLayout,
    isDemoLayoutChoice,
    loadSharedLayoutPayload,
    materializeDemoLayoutForAdminCopy,
    materializeSharedLayoutForAdmin,
    state,
    templateDraftLayoutId
  });
}

function createPrivateLayoutFromTemplateSource(source, requestedName, { activate = true } = {}) {
  if (!source?.sourceLayout || !source?.sourceState || !requestedName) return "";
  captureActiveLayoutArrangement();
  const changedAt = nowIso();
  const id = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceLayout = source.sourceLayout;
  const sourceState = source.sourceState;
  const templateName = source.templateName || sourceLayout.name || "";
  const rootContainerIds = templateCopySourceRootIds(sourceLayout)
    .map((rootId) => copyPublishedContainerToState(sourceState, rootId, {
      targetLayoutId: "",
      changedAt,
      sourceLayoutId: sourceLayout.id,
      copiedFromTemplateName: templateName
    }))
    .filter(Boolean);
  const arrangement = createLayoutArrangementFromCurrentState(state, rootContainerIds);
  const layout = createPrivateLayoutFromTemplateSourceRecord({
    id,
    requestedName,
    source,
    rootContainerIds,
    arrangement,
    changedAt,
    currentState: state,
    createManagedLayoutCopyRecord,
    currentCreateMeta,
    ensureLayoutDictionaries,
    ensurePrivateDictionaries,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    canUsePrivateState,
    uniqueLayoutName
  });
  if (!layout) return "";
  state.layouts[id] = layout;
  markLayoutPhotosForCurrentListCopy(id);
  if (activate) {
    if (!canUsePrivateState()) setActiveLocalEditableScope(id);
    else setActivePrivateScope();
    switchActiveLayout(id);
  }
  saveState({ sync: false });
  render();
  return id;
}

async function createAndPublishTemplateCopy(sourceLayout, requestedName) {
  if (!sourceLayout || !requestedName || !isAdminEditablePublishedLayout(sourceLayout.id)) return "";
  const language = normalizeUiLanguage(sourceLayout.adminDemoLanguage || sourceLayout.language || uiLanguage);
  const createdId = await createTemplateCopyFromSource(sourceLayout, requestedName, {
    language,
    activate: false,
    renderAfter: false
  });
  if (!createdId) return "";
  try {
    updateSyncUi("Сохраняю копию шаблона на сервере...");
    await savePublishedLayoutRecord(createdId);
    assertPublishedTemplateCopyConfirmed(state.layouts?.[createdId], {
      serverConfirmedDemoTemplates,
      serverConfirmedSharedLayouts
    });
    activateAdminPublishedLayout(createdId);
    return createdId;
  } catch (error) {
    removeLayoutTree(createdId, state, { save: false });
    saveState({ sync: false });
    render();
    throw error;
  } finally {
    updateSyncUi();
  }
}

function openLayoutDialog() {
  if (refs.layoutCreateTitle) {
    refs.layoutCreateTitle.textContent = canOpenAdminPublishedEdit() ? "Новая укладка/шаблон" : "Новая укладка";
  }
  const activePublicChoice = publicLayoutChoiceForLayout(state.layouts?.[state.activeLayoutId]);
  const shouldSuggestActiveTemplateCopy = Boolean(canOpenAdminPublishedEdit() && activePublicChoice);
  refs.layoutName.value = uniqueLayoutName("Новая укладка");
  refs.layoutCreateMode.value = shouldSuggestActiveTemplateCopy ? "template-copy" : "empty";
  fillSelect(
    refs.layoutCopyFrom,
    layoutCreateCopySourceOptions({ templates: shouldSuggestActiveTemplateCopy }),
    shouldSuggestActiveTemplateCopy ? activePublicChoice : state.activeLayoutId
  );
  if (refs.layoutTemplateKind) refs.layoutTemplateKind.value = "demo";
  if (refs.layoutTemplateLanguage) fillSelect(refs.layoutTemplateLanguage, languageSelectEntries(), normalizeUiLanguage(uiLanguage));
  updateLayoutCopyVisibility();
  if (shouldSuggestActiveTemplateCopy) updateLayoutCreateNameSuggestion({ force: true });
  openModalDialog(refs.layoutDialog);
}

function updateLayoutCopyVisibility() {
  const canCreateTemplates = canOpenAdminPublishedEdit();
  refs.layoutCreateMode.querySelectorAll("option[value='from-template-layout'], option[value='template'], option[value='template-copy']").forEach((option) => {
    option.hidden = !canCreateTemplates;
    option.disabled = !canCreateTemplates;
  });
  refs.layoutCreateMode.querySelectorAll("option[value$='-template']").forEach((option) => {
    option.hidden = true;
    option.disabled = true;
  });
  const modeState = layoutCreateModeState(refs.layoutCreateMode.value, { canCreateTemplates });
  refs.layoutCreateMode.value = modeState.mode;
  const { shouldCopyTemplate, shouldCreateFromTemplate, shouldPickSource, shouldPickTemplate } = modeState;
  refs.layoutCopyLabel.hidden = !shouldPickSource;
  refs.layoutCopyLabel.setAttribute("aria-hidden", String(!shouldPickSource));
  refs.layoutCopyFrom.disabled = !shouldPickSource;
  if (refs.layoutCopySourceLabel) {
    refs.layoutCopySourceLabel.textContent = shouldCopyTemplate
      ? "Скопировать шаблон из"
      : shouldCreateFromTemplate
        ? "Создать укладку из шаблона"
        : "Скопировать укладку из";
  }
  if (shouldPickSource) {
    const entries = layoutCreateCopySourceOptions({
      templates: shouldCreateFromTemplate || shouldCopyTemplate,
      includeTemplates: false
    });
    const activePublicChoice = publicLayoutChoiceForLayout(state.layouts?.[state.activeLayoutId]);
    const selected = shouldCreateFromTemplate || shouldCopyTemplate
      ? activePublicChoice || refs.layoutCopyFrom.value
      : refs.layoutCopyFrom.value || state.activeLayoutId;
    fillSelect(refs.layoutCopyFrom, entries, selected);
  }
  if (refs.layoutTemplateKindLabel && refs.layoutTemplateKind) {
    refs.layoutTemplateKindLabel.hidden = !shouldPickTemplate;
    refs.layoutTemplateKindLabel.setAttribute("aria-hidden", String(!shouldPickTemplate));
    refs.layoutTemplateKind.disabled = !shouldPickTemplate;
  }
  if (refs.layoutTemplateLanguageLabel && refs.layoutTemplateLanguage) {
    refs.layoutTemplateLanguageLabel.hidden = !shouldPickTemplate;
    refs.layoutTemplateLanguageLabel.setAttribute("aria-hidden", String(!shouldPickTemplate));
    refs.layoutTemplateLanguage.disabled = !shouldPickTemplate;
  }
  updateLayoutCreateNameSuggestion();
}

function layoutCreateSelectedSourceName() {
  return layoutSourceNameFromOptionLabel(refs.layoutCopyFrom?.selectedOptions?.[0]?.textContent || "");
}

function canReplaceLayoutCreateNameSuggestion({ force = false } = {}) {
  return canReplaceLayoutCreateNameSuggestionValue(refs.layoutName?.value, { force });
}

function updateLayoutCreateNameSuggestion({ force = false } = {}) {
  if (!refs.layoutName || !refs.layoutCreateMode) return;
  const mode = refs.layoutCreateMode.value;
  const language = normalizeUiLanguage(refs.layoutTemplateLanguage?.value || uiLanguage);
  const kind = mode === "shared-template" || refs.layoutTemplateKind?.value === "shared" ? "shared" : "demo";
  if (canReplaceLayoutCreateNameSuggestion({ force })) {
    const suggestion = suggestedLayoutCreateName({
      demoTemplateFallbackName,
      kind,
      language,
      mode,
      selectedSourceName: layoutCreateSelectedSourceName(),
      uniqueLayoutName,
      uniquePublishedTemplateName
    });
    if (suggestion) refs.layoutName.value = suggestion;
  }
}

function createNewPublicTemplateLayout(requestedName, kind, language) {
  if (!canOpenAdminPublishedEdit()) {
    showToast("Шаблоны может создавать только админ.", "error");
    return "";
  }
  const normalizedLanguage = normalizeUiLanguage(language || uiLanguage);
  const id = `layout-admin-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const layout = createNewPublicTemplateDraftRecordValue({
    id,
    requestedName,
    kind,
    language: normalizedLanguage,
    dictionaries: ensurePrivateDictionaries(state),
    state,
    timestamp: nowIso(),
    createDemoTemplateListId,
    createEmptyLayoutArrangement,
    createEmptyPublicTemplateDraftRecord,
    currentCreateMeta,
    normalizeDemoLayoutName,
    uniquePublishedTemplateName,
    serverConfirmedDemoTemplates
  });
  if (!layout) return "";
  state.layouts[id] = layout;
  activateAdminPublishedLayout(id);
  saveLayoutMutation(id);
  return id;
}

async function saveNewLayout(event) {
  event.preventDefault();
  captureActiveLayoutArrangement();
  const mode = refs.layoutCreateMode.value;
  const shouldCopy = mode === "copy";
  const shouldCreateFromTemplate = isLayoutCreateTemplateLayoutMode(mode);
  const shouldCopyTemplate = mode === "template-copy";
  const requestedName = refs.layoutName.value.trim();
  if (!requestedName) return;
  if (mode === "template" || mode === "demo-template" || mode === "shared-template") {
    const kind = mode === "shared-template" || refs.layoutTemplateKind?.value === "shared" ? "shared" : "demo";
    const createdId = createNewPublicTemplateLayout(
      requestedName,
      kind,
      refs.layoutTemplateLanguage?.value || uiLanguage
    );
    if (!createdId) return;
    refs.layoutDialog.close();
    switchView("bags");
    showToast(kind === "demo" ? "Demo-template created." : "Shared-template created.", "success");
    return;
  }
  if (shouldCopyTemplate) {
    const sourceLayout = await resolveLayoutCreateTemplateCopyLayout(refs.layoutCopyFrom.value);
    if (!sourceLayout) {
      showToast("Источник шаблона не найден.", "error");
      return;
    }
    try {
      const createdId = await createAndPublishTemplateCopy(sourceLayout, requestedName);
      if (!createdId) return;
      refs.layoutDialog.close();
      switchView("packing");
      showToast("Шаблон скопирован.", "success");
    } catch (error) {
      showToast(`Не удалось скопировать шаблон: ${error.message}`, "error");
    }
    return;
  }
  if (shouldCreateFromTemplate) {
    const templateSource = await resolveLayoutCreateTemplateCopySource(refs.layoutCopyFrom.value);
    if (!templateSource) {
      showToast("Источник шаблона не найден.", "error");
      return;
    }
    const createdId = createPrivateLayoutFromTemplateSource(templateSource, requestedName);
    if (!createdId) return;
    refs.layoutDialog.close();
    switchView("packing");
    try {
      await syncCreatedPrivateLayoutEntities(createdId);
      showToast("Укладка создана из шаблона.", "success");
    } catch (error) {
      showToast(`Укладка создана локально, но не сохранена на сервере: ${error.message}`, "error");
    }
    return;
  }
  const source = shouldCopy
    ? await resolveLayoutCreateCopySource(refs.layoutCopyFrom.value)
    : { arrangement: createEmptyLayoutArrangement(), rootContainerIds: [] };
  if (shouldCopy && !source) {
    showToast("Copy source was not found.", "error");
    return;
  }
  createLayoutCopyFromSource(source, requestedName);
  refs.layoutDialog.close();
  switchView("bags");
}

function openLayoutEditDialog() {
  const layoutId = getActiveEditableLayoutId();
  const layout = state.layouts?.[layoutId];
  if (!layout || !canManageActiveLayout()) {
    showToast("Эту укладку нельзя редактировать.", "error");
    return;
  }
  if (isAdminEditablePublishedLayout(layout.id) && state.activeLayoutId !== layout.id) {
    restoreAdminPublishedLayoutContext(layout.id);
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
  updateLayoutEditDeleteButton(layout);
  openModalDialog(refs.layoutEditDialog);
}

function publicTemplateDeleteBlockReasonForLayout(layout) {
  if (!layout || !isAdminEditablePublishedLayout(layout.id)) return "";
  const target = publishedLayoutTarget(layout);
  return publicTemplateDeleteBlockReason({
    target,
    layout,
    deletePublished: shouldDeletePublishedTemplateForLayout(layout),
    demoTemplates: serverConfirmedDemoTemplates,
    sharedTemplates: serverConfirmedSharedLayouts,
    languageLabel: languageOptionLabel
  });
}

function updateLayoutEditDeleteButton(layout) {
  if (!refs.deleteEditedLayoutBtn) return;
  const reason = publicTemplateDeleteBlockReasonForLayout(layout);
  refs.deleteEditedLayoutBtn.textContent = reason || t("buttons.deleteLayout");
  refs.deleteEditedLayoutBtn.title = reason;
  refs.deleteEditedLayoutBtn.classList.toggle("delete-blocked", Boolean(reason));
  refs.deleteEditedLayoutBtn.classList.toggle("danger", !reason);
  refs.deleteEditedLayoutBtn.disabled = Boolean(reason) || !canDeleteManagedLayout(layout?.id);
}

function canDeleteManagedLayout(layoutId = layoutEditTargetId || state.activeLayoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout) return false;
  if (publicTemplateDeleteBlockReasonForLayout(layout)) return false;
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
  const previousLayout = adminPublished ? clone(layout) : null;
  const changed = applyLayoutEditFields(layout, {
    adminPublished,
    editedLayoutName,
    language: refs.layoutEditLanguage.value,
    normalizeDemoLayoutName,
    normalizeUiLanguage,
    requestedName: nextName,
    uiLanguage,
    uniqueLayoutName
  });
  if (!changed) {
    refs.layoutEditDialog.close();
    return;
  }
  touchLayout(layout.id, changedAt);
  if (adminPublished) {
    refs.saveEditedLayoutBtn.disabled = true;
    try {
      await savePublishedTemplateMetadata(layout, previousLayout);
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

async function confirmDeleteEditedLayout() {
  const layout = state.layouts?.[layoutEditTargetId];
  const blockReason = publicTemplateDeleteBlockReasonForLayout(layout);
  if (blockReason) {
    showToast(blockReason, "warning");
    updateLayoutEditDeleteButton(layout);
    return;
  }
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
  const blockReason = publicTemplateDeleteBlockReasonForLayout(layout);
  if (blockReason) {
    showToast(blockReason, "warning");
    updateLayoutEditDeleteButton(layout);
    return;
  }
  const containerCount = getLayoutContainerIdSet(layout).size;
  const itemCount = getLayoutItemIdSet(layout).size;
  const shouldDeletePublishedTemplate = shouldDeletePublishedTemplateForLayout(layout);
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

async function deletePublishedDemoTemplate(target, sourceLayout = null) {
  const path = publicTemplateDeletePath(target, { demoAdminPathForPublicListId });
  if (!path) return false;
  await apiFetch(path, {
    method: "DELETE",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS
  });
  const listId = target.demoListId || sourceLayout?.adminDemoListId || demoPublicListIdForLanguage(target.language || uiLanguage);
  const language = normalizeUiLanguage(target.language || sourceLayout?.adminDemoLanguage || sourceLayout?.language || uiLanguage);
  serverConfirmedDemoTemplates = removePublicTemplateCatalogEntry(serverConfirmedDemoTemplates, {
    listId,
    publicTemplateKind: "demo"
  });
  if (demoSharedLayout.statePayloadByTemplateId) delete demoSharedLayout.statePayloadByTemplateId[listId];
  if (activeDemoTemplateListId === listId) activeDemoTemplateListId = nextDemoTemplateAfter(listId, language)?.listId || "";
  if (!demoTemplatesForUiLanguage(language).some((entry) => entry?.serverConfirmed)) {
    setDemoPublicTemplateMissing(language, true, { updateCatalog: false });
    if (demoSharedLayout.statePayloadByLanguage) demoSharedLayout.statePayloadByLanguage[language] = null;
    if (normalizeUiLanguage(uiLanguage) === language) demoSharedLayout.statePayload = null;
  }
  return true;
}

async function deletePublishedTemplate(target, sourceLayout = null) {
  if (target?.type === "demo") return await deletePublishedDemoTemplate(target, sourceLayout);
  if (target?.type === "shared" && target.sharedId) return await deletePublishedSharedTemplate(target.sharedId, sourceLayout);
  return false;
}

function shouldDeletePublishedTemplateForLayout(layout) {
  const target = publishedLayoutTarget(layout);
  return shouldDeletePublishedTemplateForLayoutValue({
    layout,
    target,
    sharedLayout: target?.type === "shared" ? findSharedLayout(target.sharedId) : null
  });
}

async function deleteManagedPublicLayout(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || !isAdminEditablePublishedLayout(layoutId)) return;
  const blockReason = publicTemplateDeleteBlockReasonForLayout(layout);
  if (blockReason) {
    showToast(blockReason, "warning");
    return;
  }
  const target = publishedLayoutTarget(layout);
  const shouldDeletePublishedTemplate = shouldDeletePublishedTemplateForLayout(layout);
  const nextSharedLayout = shouldDeletePublishedTemplate && target?.type === "shared"
    ? nextServerConfirmedSharedLayoutAfter(target.sharedId)
    : null;
  const nextDemoTemplate = shouldDeletePublishedTemplate && target?.type === "demo"
    ? nextDemoTemplateAfter(target.demoListId, target.language || layout.language || uiLanguage)
    : null;
  if (shouldDeletePublishedTemplate) {
    try {
      await assertAdminApiCompatibility({ force: true });
      updateSyncUi("Удаляю шаблон...");
      await deletePublishedTemplate(target, layout);
      updateSyncUi();
    } catch (error) {
      updateSyncUi();
      showToast(`Не удалось удалить шаблон: ${error.message}`, "error");
      return;
    }
  }
  if (shouldDeletePublishedTemplate && target?.type === "demo") {
    removeManagedDemoTemplateTreesFromState(state, {
      listId: target.demoListId,
      language: target.language || layout.language || uiLanguage
    });
  } else if (shouldDeletePublishedTemplate && target?.type === "shared") {
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
    if (target?.type === "demo") {
      await openAdminDemoLayout({
        language: target.language || layout.language || uiLanguage,
        templateId: nextDemoTemplate?.listId || nextDemoTemplate?.id || ""
      });
    } else if (nextSharedLayout?.id) await openSharedLayoutForAdmin(nextSharedLayout.id);
    else await openAdminDemoLayout({ language: layout.language || uiLanguage });
  } else if (target?.type === "shared" && target.sharedId) {
    await openSharedLayoutForAdmin(target.sharedId);
  } else {
    await openAdminDemoLayout({ language: layout.language || uiLanguage });
  }
  showToast(shouldDeletePublishedTemplate ? "Шаблон удален с сервера." : "Шаблон удален из локальных правок.", "success");
}

function userEditableLayouts() {
  return userEditableLayoutsForState(state, { canUseLocalEditableState });
}

function canDeleteActiveLayout() {
  return canDeleteActiveLayoutForState(state, {
    canUseLocalEditableState,
    isReadOnlyStateScope,
    isSharedLayoutView
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
    uploadItemDialogDraftPhotos(result.accepted).catch(() => null);
  } catch (error) {
    setItemDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  } finally {
    if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
    if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  }
}

async function removeItemDialogPhoto() {
  const source = editingItemId ? state.items[editingItemId] : { photos: [] };
  const draft = itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
  if (!draft.photos.length) return;
  const confirmed = await confirmDialogPhotoDelete("item");
  if (!confirmed) return;
  const result = removePhotoFromDraft(draft, itemDialogPhotoActiveIndex);
  itemDialogPhotoDraft = result.draft;
  itemDialogPhotoActiveIndex = result.nextIndex;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview(itemDialogPhotoDraft.photos);
  updateItemDialogSaveState();
}

function setItemDialogPhotoPrimary(event) {
  event?.preventDefault();
  const source = editingItemId ? state.items[editingItemId] : { photos: [] };
  const draft = itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = setPrimaryPhotoInDraft(draft, itemDialogPhotoActiveIndex);
  itemDialogPhotoDraft = result.draft;
  itemDialogPhotoActiveIndex = result.nextIndex;
  updateItemDialogPhotoPreview(itemDialogPhotoDraft.photos);
  if (result.changed) updateItemDialogSaveState();
}

function resetItemDialogPhotoDraft() {
  cleanupUnsavedItemDialogPhotoDraft();
  itemDialogPhotoDraft = null;
  revokeObjectUrls(itemDialogPhotoObjectUrls);
  itemDialogPhotoObjectUrls = [];
  itemDialogPhotoActiveIndex = 0;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview([]);
}

function cleanupUnsavedItemDialogPhotoDraft() {
  if (!itemDialogPhotoDraft || !editingItemId) return;
  const sourcePhotoIds = photoIdentitySet(normalizeItemPhotos(state.items?.[editingItemId] || { photos: [] }));
  itemDialogPhotoDraft.photos.forEach((photo) => {
    if (photoIdentityMatches(sourcePhotoIds, photo)) return;
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(editingItemId, photo);
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
  });
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
    if (refs.itemPhotoPrimaryBtn) refs.itemPhotoPrimaryBtn.hidden = true;
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
  updateItemDialogPhotoPrimaryButton();
  bindPhotoGalleries(refs.itemPhotoPreview, photoGalleryBindingOptions());
  setItemDialogPhotoStatus(photoStatusText(list));
}

function updateItemDialogPhotoPrimaryButton() {
  updatePhotoPrimaryButton(refs.itemPhotoPrimaryBtn, itemDialogPhotoActiveIndex);
}

function setItemDialogPhotoStatus(message) {
  if (refs.itemPhotoStatus) refs.itemPhotoStatus.textContent = message || "";
}

function revokeObjectUrls(urls) {
  (Array.isArray(urls) ? urls : [urls]).filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
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
    uploadRootContainerDialogDraftPhotos(result.accepted).catch(() => null);
  } catch (error) {
    setRootContainerDialogPhotoStatus(error.message || "Не удалось подготовить фото.");
    showToast(error.message || "Не удалось подготовить фото.", "error");
  } finally {
    if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
    if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  }
}

async function removeRootContainerDialogPhoto() {
  const source = editingRootContainerId ? state.containers[editingRootContainerId] : { photos: [] };
  const draft = rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
  if (!draft.photos.length) return;
  const confirmed = await confirmDialogPhotoDelete("container");
  if (!confirmed) return;
  const result = removePhotoFromDraft(draft, rootContainerDialogPhotoActiveIndex);
  rootContainerDialogPhotoDraft = result.draft;
  rootContainerDialogPhotoActiveIndex = result.nextIndex;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  updateRootContainerDialogPhotoPreview(rootContainerDialogPhotoDraft.photos);
  updateRootContainerDialogSaveState();
}

function confirmDialogPhotoDelete(kind = "item") {
  const targetText = kind === "container" ? "этой сумки или места" : "этой вещи";
  return askConfirmDialog({
    title: "Удалить фото?",
    text: `Фото будет удалено из ${targetText} после сохранения изменений.`,
    okText: "Удалить фото",
    cancelText: "Оставить",
    tone: "danger"
  });
}

async function uploadItemDialogDraftPhotos(photos = []) {
  const item = editingItemId ? state.items?.[editingItemId] : null;
  await uploadDialogDraftPhotos({
    entity: item,
    entityType: "item",
    photos,
    onAfterUpload: () => {
      updateItemDialogPhotoPreview(itemDialogPhotoDraft?.photos || normalizeItemPhotos(item)).catch(() => null);
      updateItemDialogSaveState();
    }
  });
}

async function uploadRootContainerDialogDraftPhotos(photos = []) {
  const container = editingRootContainerId ? state.containers?.[editingRootContainerId] : null;
  await uploadDialogDraftPhotos({
    entity: container,
    entityType: "container",
    photos,
    onAfterUpload: () => {
      updateRootContainerDialogPhotoPreview(rootContainerDialogPhotoDraft?.photos || normalizeItemPhotos(container)).catch(() => null);
      updateRootContainerDialogSaveState();
    }
  });
}

async function uploadDialogDraftPhotos({ entity = null, entityType = "item", photos = [], onAfterUpload = () => {} } = {}) {
  const uploadPhotos = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  if (!entity?.id || !uploadPhotos.length || photoUploadInFlight || !currentUser || isForcedOffline()) return;
  if (isReadOnlyBikePackingContext()) return;
  photoUploadInFlight = true;
  let uploaded = false;
  try {
    const targetListId = await ensureCurrentPackingListId();
    if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
    if (isReadOnlyBikePackingContext()) return;
    for (const photo of uploadPhotos) {
      uploaded = await uploadEntityPhoto(targetListId, entity, photo, entityType) || uploaded;
    }
  } finally {
    photoUploadInFlight = false;
    onAfterUpload();
  }
  if (uploaded && uploadPhotos.some((photo) => entityHasPhoto(entity, photo))) saveState();
}

function entityHasPhoto(entity, photo) {
  return photoIdentityMatches(photoIdentitySet(normalizeItemPhotos(entity)), photo);
}

function photoIdentitySet(photos = []) {
  const ids = new Set();
  (Array.isArray(photos) ? photos : []).forEach((photo) => {
    if (photo?.id) ids.add(String(photo.id));
    if (photo?.localId) ids.add(String(photo.localId));
  });
  return ids;
}

function photoIdentityMatches(ids, photo) {
  return Boolean(
    (photo?.id && ids.has(String(photo.id))) ||
    (photo?.localId && ids.has(String(photo.localId)))
  );
}

function setRootContainerDialogPhotoPrimary(event) {
  event?.preventDefault();
  const source = editingRootContainerId ? state.containers[editingRootContainerId] : { photos: [] };
  const draft = rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = setPrimaryPhotoInDraft(draft, rootContainerDialogPhotoActiveIndex);
  rootContainerDialogPhotoDraft = result.draft;
  rootContainerDialogPhotoActiveIndex = result.nextIndex;
  updateRootContainerDialogPhotoPreview(rootContainerDialogPhotoDraft.photos);
  if (result.changed) updateRootContainerDialogSaveState();
}

function resetRootContainerDialogPhotoDraft() {
  cleanupUnsavedRootContainerDialogPhotoDraft();
  rootContainerDialogPhotoDraft = null;
  revokeObjectUrls(rootContainerDialogPhotoObjectUrls);
  rootContainerDialogPhotoObjectUrls = [];
  rootContainerDialogPhotoActiveIndex = 0;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  updateRootContainerDialogPhotoPreview([]);
}

function cleanupUnsavedRootContainerDialogPhotoDraft() {
  if (!rootContainerDialogPhotoDraft || !editingRootContainerId) return;
  const sourcePhotoIds = photoIdentitySet(normalizeItemPhotos(state.containers?.[editingRootContainerId] || { photos: [] }));
  rootContainerDialogPhotoDraft.photos.forEach((photo) => {
    if (photoIdentityMatches(sourcePhotoIds, photo)) return;
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(editingRootContainerId, photo, "container");
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
  });
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
    if (refs.rootContainerPhotoPrimaryBtn) refs.rootContainerPhotoPrimaryBtn.hidden = true;
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
  updateRootContainerDialogPhotoPrimaryButton();
  bindPhotoGalleries(refs.rootContainerPhotoPreview, photoGalleryBindingOptions());
  setRootContainerDialogPhotoStatus(photoStatusText(list));
}

function updateRootContainerDialogPhotoPrimaryButton() {
  updatePhotoPrimaryButton(refs.rootContainerPhotoPrimaryBtn, rootContainerDialogPhotoActiveIndex);
}

function updatePhotoPrimaryButton(button, activeIndex = 0) {
  if (!button) return;
  button.hidden = false;
  const isPrimary = Number(activeIndex) <= 0;
  button.disabled = isPrimary;
  button.textContent = isPrimary ? "Фото уже главное" : "Сделать главным";
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
  saveRootContainerDialogAction({
    applyRootContainerDialogParent,
    applyRootContainerDialogPhotoDraft,
    applyRootContainerDialogPlacement,
    applyRootContainerDimensions,
    changedAt: nowIso(),
    closeDialogWithoutRestoringFocus,
    currentCreateMeta,
    defaultRootContainerLocation,
    editingRootContainerId,
    getPublishedEditLayoutId,
    hasContainerDimensions,
    markRecordActivePublicCatalog,
    normalizeContainerColor,
    parseVolumeInput,
    parseWeightInput,
    readRootContainerDialogDimensions,
    refs,
    render,
    requireUsageCapacity,
    restoreAdminPublishedLayoutContext,
    rootContainerDialogPhotoDraft,
    saveLayoutMutation,
    state,
    touchContainer
  });
}

function saveDialogItem(event) {
  event?.preventDefault();
  capturePackingScroll();
  saveItemDialogAction({
    applyItemDialogPhotoDraft,
    applyLayoutArrangement,
    changedAt: nowIso(),
    cleanupEmptyContainersInLayoutArrangement,
    closeDialogWithoutRestoringFocus,
    currentEditMeta,
    editingItemId,
    getDialogSelectedCategories,
    getItemContainerIdInLayout,
    getPublishedEditLayoutId,
    itemDialogPhotoDraft,
    itemDialogTargetLayoutId,
    markRecordActivePublicCatalog,
    parseWeightInput,
    placeExistingItemInLayout,
    readItemDialogQuantity,
    refs,
    removeItemFromLayoutArrangement,
    render,
    requireUsageCapacity,
    restoreAdminPublishedLayoutContext,
    saveLayoutMutation,
    showToast,
    state,
    touchItem,
    touchLayout
  });
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

function getActiveLayoutItems() {
  return Object.values(state.items).filter((item) => !isItemRemovedFromActiveLayout(item) && isItemInActiveLayout(item));
}

function getItemsForItemsView() {
  return itemsForItemsViewForState(getItemsForActiveCatalog(), {
    isFilterContextActive,
    isItemAwayFromHomeAndBike,
    isItemInActiveLayout,
    isItemWithoutWeight,
    itemCreatedTime,
    itemSortMode,
    itemUsageFilter,
    matchesItemsViewFilters
  });
}

function getItemsForActiveCatalog() {
  return itemsForActiveCatalogForState(state, {
    isItemInActiveCatalog,
    isPrivateCatalogItemRecord
  });
}

function itemCreatedTime(item) {
  return itemCreatedTimeForState(item);
}

function getItemsUsageCounts() {
  return itemUsageCountsForCatalog(getItemsForActiveCatalog(), {
    isItemAwayFromHomeAndBike,
    isItemInActiveLayout,
    isItemWithoutWeight,
    matchesItemsViewFilters
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

function getDescendantContainerIds(containerId) {
  return getDescendantContainerIdsForState(state, containerId);
}

function getRootContainers() {
  return rootContainersForEditorForState(state, {
    isPrivateCatalogContainerRecord,
    isRootContainerForEditor
  });
}

function getRootContainersForSettings() {
  return rootContainersForSettingsForState(state, {
    containerCreatedTime,
    isPrivateCatalogContainerRecord,
    isRootContainerForEditor,
    isRootContainerInActiveCatalog,
    isRootContainerInActiveLayout,
    matchesRootContainerFieldsFilter,
    rootContainerSortMode,
    rootContainerUsageFilter
  });
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

function isRootContainerInActiveLayout(containerId) {
  return isRootContainerInLayoutForState(getPublishedWorkLayout(), containerId);
}

function isRootContainerForEditor(container) {
  return isRootContainerForEditorForState(state, getPublishedWorkLayout(), container);
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

function layoutContainerPath(layout, containerId) {
  return layoutContainerPathForState(state, layout, containerId);
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
  return buildCurrentBackupManifestValue({
    appVersion: APP_VERSION,
    canIncludeAdmin: canOpenAdminPublishedEdit(),
    cloneValue: clone,
    currentSharedLayouts,
    demoStatePayloadForLanguage,
    language: uiLanguage,
    languages: SUPPORTED_LANGUAGES,
    now: nowIso(),
    photos,
    snapshot
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
  const nextImportState = await readBackupImportFile(event, {
    normalizeRemoteState,
    readBackupArchiveFile,
    refs,
    resetBackupImportUi,
    setBackupStatus
  });
  if (nextImportState === undefined) return;
  backupImportState = nextImportState;
  if (backupImportState) renderBackupAnalysis();
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
  return resolveExistingBackupPhotosValue(photoFiles, {
    apiFetch,
    currentUser,
    ensureCurrentPackingListId,
    isForcedOffline,
    listApiTimeoutMs: LIST_API_TIMEOUT_MS
  });
}

async function prepareBackupPhotosForState(targetState, photoIds = null) {
  return prepareBackupPhotosForStateValue(targetState, {
    currentPackingListId,
    nowIso,
    normalizePhotos: normalizeItemPhotos,
    photoFiles: backupImportState?.photoFiles,
    photoIds,
    putCachedPhoto,
    resolveExistingPhotos: resolveExistingBackupPhotos
  });
}

async function restoreSelectedBackupLayouts() {
  await restoreSelectedBackupLayoutsFlow({
    askConfirmDialog,
    backupImportState,
    backupLayoutRows,
    cloneValue: clone,
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    markEdited,
    normalizePhotos: normalizeItemPhotos,
    normalizeRestoredBackupState: (targetState) => normalizeRestoredBackupState(targetState, {
      applyLayoutArrangement,
      migrateContainerOrder,
      normalizeContainerFields,
      normalizeItemCategories,
      normalizeItemFields,
      normalizeLayoutFields,
      repairContainerMembershipFromItemLinks
    }),
    nowIso,
    prepareBackupPhotosForState,
    render,
    restoreSelectedBackupLayoutsToState,
    saveRecoverySnapshot,
    saveRemoteState,
    saveState,
    selectedBackupLayoutIds,
    selectedBackupRestoreConfirm,
    setBackupStatus,
    showToast,
    state,
    summarizeSelectedBackupLayouts,
    uploadPendingPhotos,
    uniqueLayoutId: () => `layout-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
  });
}
async function restoreFullBackup() {
  await restoreFullBackupFlow({
    askConfirmDialog,
    backupImportState,
    fullBackupRestoreConfirm,
    normalizeRemoteState,
    nowIso,
    prepareBackupPhotosForState,
    render,
    replaceState,
    saveRemoteState,
    saveSyncMeta,
    setBackupStatus,
    showToast,
    stateStats,
    syncMeta,
    uploadPendingPhotos
  });
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
