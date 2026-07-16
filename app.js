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
import { demoSharedLayout } from "./src/data/demo-data.js";
import { createAppTailControllers } from "./src/app/app-tail-controllers.js";
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
  planLayoutTreeMissingItems,
  planPublicCopyMissingItems,
  publicCopyComparableText,
  publicCopyRecordContentHash,
  summarizeLayoutTreeIdDuplicates,
  summarizePublicCopyDuplicates
} from "./src/public/copy-duplicates.js";
import { createDeletedSharedLayoutStore } from "./src/public/deleted-shared-layouts.js";
import {
  linkExistingContainerTreeToLayoutState,
  linkMissingContainerTreeToLayoutState,
  markCopiedItemForPublicLayout,
  isSharedCopyTargetLayout,
  publicCopyTargetLayouts,
  sharedCopyTargetLayouts,
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
import { replaceActivePublishedHistoryDraft } from "./src/public/history-restore-view.js";
import {
  canImportGuestLayoutsForAuthenticatedUser,
  guestLayoutHasUserContentEdits,
  guestLocalLayoutCandidateFromState,
  importGuestLocalLayoutsToState,
  persistGuestImportBeforeCleanup,
  removeLegacyGuestImportPlaceholders,
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
  canonicalCatalogConfirmsDemoTemplateAbsent,
  normalizePublicTemplateMetadataResponse,
  publicDemoTemplateExactDeletePath,
  publicTemplateDeletePath,
  publicTemplateDeleteResponseMatches,
  publicTemplateMetadataPath,
  publicTemplateMetadataRequest,
  publicTemplateMetadataTarget
} from "./src/public/public-template-metadata.js";
import {
  PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY,
  publicTemplatePayloadPath
} from "./src/public/public-template-payload-api.js";
import { createPublicTemplatePayloadCache } from "./src/public/template-payload-cache.js";
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
import { publishedPhotoUploadRequest } from "./src/public/published-photo-upload.js";
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
import { shouldPreserveLinkedSharedListOnLanguageChange } from "./src/public/shared-link-language.js";
import { readSharedListPublishOptions, sharedListLinkResultHtml, sharedListPublishDialogHtml } from "./src/public/shared-list-publish.js";
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
  containerCopyExcludedLayoutIds,
  createNewPublicTemplateDraftRecord as createNewPublicTemplateDraftRecordValue,
  isContainerPickerContainerCopyMode as isContainerPickerContainerCopyModeValue,
  isContainerPickerCopyMode as isContainerPickerCopyModeValue,
  isContainerPickerItemCopyMode as isContainerPickerItemCopyModeValue,
  createTemplateCopyLayoutRecord as createTemplateCopyLayoutRecordValue,
  createPrivateLayoutFromTemplateSourceRecord,
  loadPublishedTemplateCopySource as loadPublishedTemplateCopySourceValue,
  resolveLayoutCreateTemplateCopyLayout as resolveLayoutCreateTemplateCopyLayoutValue,
  resolveLayoutCreateTemplateCopySource as resolveLayoutCreateTemplateCopySourceValue,
  templateCopySourceKindFromChoice,
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
  isAdminPublicEditScope,
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
  createSubcontainerInLayoutState,
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
  isolateLinkedLayoutEntities,
  layoutEntityRepairBaseState,
  rememberLayoutEntityRepairBaseState
} from "./src/state/layout-entity-isolation.js";
import {
  addCustomDictionaryValue,
  dictionaryOptionsForUi as dictionaryOptionsForUiValues,
  ensureLayoutDictionaries as ensureLayoutDictionariesForState,
  ensurePrivateDictionaries as ensurePrivateDictionariesForState,
  layoutDictionaryValues,
  normalizePrivateDictionariesForSync as normalizePrivateDictionariesForSyncState,
  normalizeDictionaryValues,
  pruneUnusedLayoutCustomDictionaries,
  readOnlyLayoutDictionaries as readOnlyLayoutDictionariesForState,
  removeCustomDictionaryValue,
  renameCustomDictionaryValue,
  sortDictionaryValues
} from "./src/state/dictionaries.js";
import { createBlankBikePackingState } from "./src/state/empty-state.js";
import {
  itemPhotoSignature,
  addPhotosToDraft,
  createPhotoDraftFromRecord,
  draftPhotosToCleanup,
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
  applyLayoutOrderToSources,
  layoutOrderIdsFromSections,
  layoutOrderSectionsFromSources,
  moveLayoutBeforeInSections,
  moveLayoutWithinSections,
  sortLayoutSectionByDate,
  sortLayoutSectionByName
} from "./src/state/layout-order.js";
import {
  applyItemAvailabilityStatus,
  applyLayoutLocked,
  containerPlacementSnapshotChanged,
  itemAvailabilityBlocksPlacement,
  itemPlacementSnapshotChanged,
  isItemUnavailableForPacking,
  isLayoutLocked,
  lockedLayoutMutationBlocked,
  lockedLayoutsContainingContainer,
  lockedLayoutsContainingItem,
  lockedLayoutsContainingNestedContainer,
  normalizeItemAvailabilityStatus,
  selectUnlockedLayoutTargetId,
  unavailableSnapshotItems
} from "./src/state/layout-locks.js";
import {
  layoutDisplayNameForLanguage,
  normalizeLayoutArrangement,
  normalizeLayoutFields,
  repairPublishedLayoutArrangement,
  snapshotContainerTreeFromLayoutArrangement
} from "./src/state/layout-normalize.js";
import {
  containerWeight as containerWeightForState,
  itemQuantity as itemQuantityForState,
  itemTotalWeight as itemTotalWeightForState,
  layoutContainersOwnWeight as layoutContainersOwnWeightForState
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
  addRootContainerToLayoutInState,
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
  placeExistingContainerInLayoutInState,
  placeExistingItemInLayoutInState,
  removeContainerFromLayoutOnlyInState,
  removeItemFromLayoutArrangement,
  removeItemFromLayoutInState,
  rootColumnInsertIndexFromVisibleNeighbors,
  touchLayoutsReferencingItemInState
} from "./src/state/layout-ops.js";
import {
  copyCrossesPublicNamespaceBoundary,
  photoDuplicateOptionsForLayoutCopy,
  privateContainerTreeCopyRoute,
  shouldCopyPhotosToCurrentListForLayoutCopy
} from "./src/state/layout-copy-policy.js";
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
  visibleItemLayoutPlacements as visibleItemLayoutPlacementsForState,
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
  containerCategories,
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
  duplicateSnapshotItemToContainerInLayoutState,
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
  legacyComparableTopLevelDiffKeys as legacyComparableTopLevelDiffKeysForSync,
  rememberEntitySyncResultMeta,
  splitEntitySyncEntries as splitEntitySyncEntriesForSync,
  syncEntityBatchWithRevisionRetry,
  syncEntityBatchesSequentially
} from "./src/sync/entity-sync.js";
import {
  createdLayoutSyncErrorText,
  syncCreatedLayoutEntityTypes
} from "./src/sync/created-layout-entity-sync.js";
import {
  applyEntityChangesToState,
  canRequestEntityChanges
} from "./src/sync/entity-changes.js";
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
  hasListFreshnessSignal,
  listFreshnessChanged,
  normalizeListFreshness,
  STARTUP_CACHE_INTEGRITY_VERSION
} from "./src/sync/list-freshness.js";
import { shouldRecoverUnsyncedLocalChanges } from "./src/sync/local-dirty.js";
import {
  createLegacyPersonalSyncWriteBlockedError,
  shouldBlockLegacyPersonalSyncWriteFallback
} from "./src/sync/legacy-personal-sync.js";
import { loadRemoteStateFlow } from "./src/sync/load-remote-state-flow.js";
import { createRemoteListRecordSelector } from "./src/sync/list-records.js";
import { ensurePersonalListId } from "./src/sync/personal-list-bootstrap.js";
import { runSyncNowFlow } from "./src/sync/run-sync-now-flow.js";
import {
  formatHistoryDateTime,
  historySharedTemplateOptions,
  historyPayloadTitle,
  historyRollbackImpact,
  historyRecordKey,
  historyRecordRestoreLayoutIds,
  historyRecordState as historyRecordStateForSync,
  historyRecordTitle,
  historySummaryRequestPath,
  normalizeHistorySummaryPage,
  restorableHistoryRecords,
  restorableHistorySummaryRecords,
  sortHistoryRecords,
  summarizeHistoryPayload
} from "./src/sync/history.js";
import { buildHistoryActionContext } from "./src/sync/history-action.js";
import {
  cacheRecordRemotePhotosForUploadFallback,
  copyRecordPhotosForLocalDuplicate,
  createItemPhotoFromFile,
  deleteCachedPhoto,
  getCachedPhoto,
  hasRemotePhotoUrl,
  inspectRecordRemotePhotoSources,
  isPhotoUsableFromServer,
  isPhotoStoredForList,
  keepRemoteOnlyPhotoReference,
  photoRecordIdMatchesRemoteSource,
  photoRemoteSrc,
  photoShouldBeCopiedToCurrentList,
  putCachedPhoto
} from "./src/sync/photos.js";
import {
  markPhotoUploadStarted,
  uploadPhotoToPath
} from "./src/sync/photo-upload-flow.js";
import {
  cacheLayoutRemotePhotosForUploadFallback,
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
  pruneAdminPublishedDraftsForSync as pruneAdminPublishedDraftsForSyncValue,
  rememberConflictRemoteMeta as rememberConflictRemoteMetaForSync
} from "./src/sync/save-body.js";
import {
  handleRemoteSaveConflictFlow,
  saveRemoteStateFlow
} from "./src/sync/save-remote-state-flow.js";
import { preflightRemoteSaveConflictFlow } from "./src/sync/save-preflight.js";
import { createQueuedRemoteSave } from "./src/sync/save-queue.js";
import { registerAppServiceWorker } from "./src/sync/service-worker.js";
import {
  adminBackupPayloads,
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
  backupAdminTemplateRows,
  restoreBackupAdminTemplates,
  selectedBackupAdminTemplateKeys
} from "./src/backup/admin-restore.js";
import {
  applyBackupRestoreMode as applyBackupRestoreModeUi,
  renderBackupAnalysis as renderBackupAnalysisUi,
  renderBackupProgress,
  renderBackupRules,
  renderBackupSelectionSummary,
  resetBackupImportUi,
  selectedBackupLayoutIds as selectedBackupLayoutIdsFromUi,
  selectedBackupRestoreMode as selectedBackupRestoreModeFromUi,
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
import { bindLayoutOrderPointerDrag } from "./src/ui/layout-order-drag.js";
import { bindLongPressTooltips } from "./src/ui/long-press-tooltip.js";
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
  isNewItemPlacementPickerMode,
  itemDialogContainerPickerMode,
  itemDialogTargetLayoutFromPicker,
  saveItemDialogAction,
  saveRootContainerDialogAction
} from "./src/ui/item-dialog-save.js";
import {
  renderFilteredRootContainerColumnHtml,
  renderPackingItemCardHtml,
  renderPackingRootHeaderCellHtml,
  renderRootContainerColumnHtml,
  renderSubcontainerSectionHtml,
  subcontainerTitleHtml
} from "./src/ui/packing-board-render.js";
import { createPackingDragController } from "./src/ui/packing-drag.js";
import { bindPackingEvents as bindPackingEventsUi } from "./src/ui/packing-events.js";
import {
  bindBoardScroll,
  bindFixedScrollbar,
  bindStickyRootHeaderRow
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
  resolveStoredPrivateLayoutChoiceForState,
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
  photoDialogStatusText,
  photoStatusText,
  renderPhotoGalleryHtml,
  renderItemPhotoHtml,
  updatePhotoGalleryUploadProgress
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
  hasHistoryStateChanges,
  historyActionDescription,
  historyRecordAction,
  historyUndoConfirmation,
  renderHistoryRecordArticle as renderHistoryRecordArticleHtml,
  renderHistoryRecordDetails as renderHistoryRecordDetailsHtml,
  syncHistoryActionButtonTooltips
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
  createLayoutLoadStatusController,
  formatLayoutLoadProgress,
  formatPersonalLayoutsLoadedStatus
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
import {
  bindDialogBackdropClickGuard,
  bindFilePickerDialogDismissGuard
} from "./src/ui/modal-close-policy.js";
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
  captureBike3dDetailViewport,
  getBike3dPackingScrollHost,
  isBike3dPackingView,
  normalizeBike3dViewState,
  normalizeBike3dTransform,
  normalizeBike3dTransforms,
  restoreBike3dDetailViewport,
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
const locations = [];
const categories = [];
let serverConfirmedDemoTemplates = [];
let serverConfirmedSharedLayouts = [];
let activeDemoTemplateListId = "";
const publishedListStateCache = createPublicTemplatePayloadCache({
  cloneValue: clone,
  normalizePayload: normalizePublishedStatePayload
});
const publishedItemKeyStateCache = createPublicTemplatePayloadCache({
  cloneValue: clone,
  normalizePayload: normalizePublishedStatePayload
});
const REQUIRED_ADMIN_API_CAPABILITIES = [
  "dictionaryPhysicalEntityRows",
  "dictionaryCustomEntityRows",
  "dictionaryHiddenDefaultRows",
  "assembledConflictPayload",
  "assembledStatePayloadResponses",
  "rawListPayloadContractGuard",
  "dictionaryStateEntitySync",
  "entitySyncListUpdatedAt",
  "lightweightListFreshness",
  "listFreshnessIntegrityCounts",
  "entityChangesFeed",
  "entityChangesFeedRevisionBump",
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
  PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY,
  "publicTemplateLanguageColumn",
  "publicTemplateMetadataPatch",
  "publicTemplateDelete",
  "publicDemoTemplateExactDelete",
  "templateCopyRequiresPublicSharedRow",
  "publicListLightweightCatalog",
  "templateCopyMetadataSidecar",
  "adminUsageReports",
  "collectionModeStateSync",
  "publicTemplateDetachedCatalogItems",
  "listSaveNoopHistoryGuard",
  "historyPreviousSnapshots",
  "historyActionJournal",
  "historyMeaningfulActions",
  "historyTechnicalMetadataGuard",
  "historySummaryPagination",
  "historySnapshotDetail",
  "historyDailyCheckpoints",
  "historyLayoutScopedRestore",
  "historyPhotoTrashRetention",
  "sharedListSnapshots",
  "sharedListOptionalAuthor",
  "userDisplayName"
];
const REQUIRED_ADMIN_API_VERSION = "2026-07-17.history-summary-pagination-v1";
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
let dictionaryLocationSortMode = normalizeSortMode(uiSettings.dictionaryLocationSortMode);
let dictionaryCategorySortMode = normalizeSortMode(uiSettings.dictionaryCategorySortMode);
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
let remoteStateLoadPromise = null;
let personalListApiUnavailable = false;
let itemEntitySyncUnavailable = false;
let containerEntitySyncUnavailable = false;
let layoutEntitySyncUnavailable = false;
let dictionaryEntitySyncUnavailable = false;
let historyRecords = [];
let historyComparisonState = null;
let historyPageState = null;
let historyLoadMoreInFlight = false;
const historyDetailCache = new Map();
let activeHistorySource = "private";
let selectedHistoryDetailRecordKey = "";
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

const appTailRuntime = {
  get activeDemoTemplateListId() { return activeDemoTemplateListId; },
  set activeDemoTemplateListId(value) { activeDemoTemplateListId = value; },
  get addToContainerTargetId() { return addToContainerTargetId; },
  set addToContainerTargetId(value) { addToContainerTargetId = value; },
  get addToContainerTargetLayoutId() { return addToContainerTargetLayoutId; },
  set addToContainerTargetLayoutId(value) { addToContainerTargetLayoutId = value; },
  get adjustingBike3dContainerId() { return adjustingBike3dContainerId; },
  set adjustingBike3dContainerId(value) { adjustingBike3dContainerId = value; },
  get backupImportState() { return backupImportState; },
  set backupImportState(value) { backupImportState = value; },
  get bike3dTransforms() { return bike3dTransforms; },
  set bike3dTransforms(value) { bike3dTransforms = value; },
  get bike3dViewState() { return bike3dViewState; },
  set bike3dViewState(value) { bike3dViewState = value; },
  get containerPickerLayoutId() { return containerPickerLayoutId; },
  set containerPickerLayoutId(value) { containerPickerLayoutId = value; },
  get containerPickerMode() { return containerPickerMode; },
  set containerPickerMode(value) { containerPickerMode = value; },
  get containerPickerSourceLayoutId() { return containerPickerSourceLayoutId; },
  set containerPickerSourceLayoutId(value) { containerPickerSourceLayoutId = value; },
  get containerPickerTargetContainerId() { return containerPickerTargetContainerId; },
  set containerPickerTargetContainerId(value) { containerPickerTargetContainerId = value; },
  get currentUser() { return currentUser; },
  set currentUser(value) { currentUser = value; },
  get draggingContainerId() { return draggingContainerId; },
  set draggingContainerId(value) { draggingContainerId = value; },
  get draggingItemId() { return draggingItemId; },
  set draggingItemId(value) { draggingItemId = value; },
  get editingContainerId() { return editingContainerId; },
  set editingContainerId(value) { editingContainerId = value; },
  get editingDictionaryEntry() { return editingDictionaryEntry; },
  set editingDictionaryEntry(value) { editingDictionaryEntry = value; },
  get editingItemId() { return editingItemId; },
  set editingItemId(value) { editingItemId = value; },
  get editingRootContainerId() { return editingRootContainerId; },
  set editingRootContainerId(value) { editingRootContainerId = value; },
  get editingItemTitleId() { return editingItemTitleId; },
  set editingItemTitleId(value) { editingItemTitleId = value; },
  get filterMatchIndex() { return filterMatchIndex; },
  set filterMatchIndex(value) { filterMatchIndex = value; },
  get filterMatchSignature() { return filterMatchSignature; },
  set filterMatchSignature(value) { filterMatchSignature = value; },
  get filterNavRefreshFrame() { return filterNavRefreshFrame; },
  set filterNavRefreshFrame(value) { filterNavRefreshFrame = value; },
  get filterViewCollapseSignature() { return filterViewCollapseSignature; },
  set filterViewCollapseSignature(value) { filterViewCollapseSignature = value; },
  get filterViewCollapsedContainers() { return filterViewCollapsedContainers; },
  set filterViewCollapsedContainers(value) { filterViewCollapsedContainers = value; },
  get fixedScrollbarRefreshFrame() { return fixedScrollbarRefreshFrame; },
  set fixedScrollbarRefreshFrame(value) { fixedScrollbarRefreshFrame = value; },
  get searchContextCommitTimer() { return searchContextCommitTimer; },
  set searchContextCommitTimer(value) { searchContextCommitTimer = value; },
  get searchRenderTimer() { return searchRenderTimer; },
  set searchRenderTimer(value) { searchRenderTimer = value; },
  get itemDialogInitialSnapshot() { return itemDialogInitialSnapshot; },
  set itemDialogInitialSnapshot(value) { itemDialogInitialSnapshot = value; },
  get itemDialogPhotoActiveIndex() { return itemDialogPhotoActiveIndex; },
  set itemDialogPhotoActiveIndex(value) { itemDialogPhotoActiveIndex = value; },
  get itemDialogPhotoDraft() { return itemDialogPhotoDraft; },
  set itemDialogPhotoDraft(value) { itemDialogPhotoDraft = value; },
  get itemDialogPhotoObjectUrls() { return itemDialogPhotoObjectUrls; },
  set itemDialogPhotoObjectUrls(value) { itemDialogPhotoObjectUrls = value; },
  get itemDialogTargetLayoutId() { return itemDialogTargetLayoutId; },
  set itemDialogTargetLayoutId(value) { itemDialogTargetLayoutId = value; },
  get itemUsageFilter() { return itemUsageFilter; },
  set itemUsageFilter(value) { itemUsageFilter = value; },
  get itemSortMode() { return itemSortMode; },
  set itemSortMode(value) { itemSortMode = value; },
  get lastItemTitleTap() { return lastItemTitleTap; },
  set lastItemTitleTap(value) { lastItemTitleTap = value; },
  get lastPackingScrollSnapshot() { return lastPackingScrollSnapshot; },
  set lastPackingScrollSnapshot(value) { lastPackingScrollSnapshot = value; },
  get lastRootContainerTitleTap() { return lastRootContainerTitleTap; },
  set lastRootContainerTitleTap(value) { lastRootContainerTitleTap = value; },
  get lastToastAt() { return lastToastAt; },
  set lastToastAt(value) { lastToastAt = value; },
  get lastToastSignature() { return lastToastSignature; },
  set lastToastSignature(value) { lastToastSignature = value; },
  get layoutEditTargetId() { return layoutEditTargetId; },
  set layoutEditTargetId(value) { layoutEditTargetId = value; },
  get packingDragController() { return packingDragController; },
  set packingDragController(value) { packingDragController = value; },
  get packingViewMode() { return packingViewMode; },
  set packingViewMode(value) { packingViewMode = value; },
  get pendingFilterJump() { return pendingFilterJump; },
  set pendingFilterJump(value) { pendingFilterJump = value; },
  get pendingPackingScroll() { return pendingPackingScroll; },
  set pendingPackingScroll(value) { pendingPackingScroll = value; },
  get photoUploadInFlight() { return photoUploadInFlight; },
  set photoUploadInFlight(value) { photoUploadInFlight = value; },
  get recentlyAddedContainerId() { return recentlyAddedContainerId; },
  set recentlyAddedContainerId(value) { recentlyAddedContainerId = value; },
  get recentlyAddedItemId() { return recentlyAddedItemId; },
  set recentlyAddedItemId(value) { recentlyAddedItemId = value; },
  get recentlyAddedLayoutId() { return recentlyAddedLayoutId; },
  set recentlyAddedLayoutId(value) { recentlyAddedLayoutId = value; },
  get rootContainerDialogInitialSnapshot() { return rootContainerDialogInitialSnapshot; },
  set rootContainerDialogInitialSnapshot(value) { rootContainerDialogInitialSnapshot = value; },
  get rootContainerDialogPendingParentId() { return rootContainerDialogPendingParentId; },
  set rootContainerDialogPendingParentId(value) { rootContainerDialogPendingParentId = value; },
  get rootContainerDialogPendingParentIndex() { return rootContainerDialogPendingParentIndex; },
  set rootContainerDialogPendingParentIndex(value) { rootContainerDialogPendingParentIndex = value; },
  get rootContainerDialogPendingRootIds() { return rootContainerDialogPendingRootIds; },
  set rootContainerDialogPendingRootIds(value) { rootContainerDialogPendingRootIds = value; },
  get rootContainerDialogPhotoActiveIndex() { return rootContainerDialogPhotoActiveIndex; },
  set rootContainerDialogPhotoActiveIndex(value) { rootContainerDialogPhotoActiveIndex = value; },
  get rootContainerDialogPhotoDraft() { return rootContainerDialogPhotoDraft; },
  set rootContainerDialogPhotoDraft(value) { rootContainerDialogPhotoDraft = value; },
  get rootContainerDialogPhotoObjectUrls() { return rootContainerDialogPhotoObjectUrls; },
  set rootContainerDialogPhotoObjectUrls(value) { rootContainerDialogPhotoObjectUrls = value; },
  get rootContainerUsageFilter() { return rootContainerUsageFilter; },
  set rootContainerUsageFilter(value) { rootContainerUsageFilter = value; },
  get rootContainerSortMode() { return rootContainerSortMode; },
  set rootContainerSortMode(value) { rootContainerSortMode = value; },
  get selectedBike3dContainerId() { return selectedBike3dContainerId; },
  set selectedBike3dContainerId(value) { selectedBike3dContainerId = value; },
  get selectedCatalogItemAnchorId() { return selectedCatalogItemAnchorId; },
  set selectedCatalogItemAnchorId(value) { selectedCatalogItemAnchorId = value; },
  get selectedCatalogItemIds() { return selectedCatalogItemIds; },
  set selectedCatalogItemIds(value) { selectedCatalogItemIds = value; },
  get selectedCatalogRootAnchorId() { return selectedCatalogRootAnchorId; },
  set selectedCatalogRootAnchorId(value) { selectedCatalogRootAnchorId = value; },
  get selectedCatalogRootIds() { return selectedCatalogRootIds; },
  set selectedCatalogRootIds(value) { selectedCatalogRootIds = value; },
  get selectedCategoryFilters() { return selectedCategoryFilters; },
  set selectedCategoryFilters(value) { selectedCategoryFilters = value; },
  get serverConfirmedDemoTemplates() { return serverConfirmedDemoTemplates; },
  set serverConfirmedDemoTemplates(value) { serverConfirmedDemoTemplates = value; },
  get serverConfirmedSharedLayouts() { return serverConfirmedSharedLayouts; },
  set serverConfirmedSharedLayouts(value) { serverConfirmedSharedLayouts = value; },
  get sharedDialogCopyItemId() { return sharedDialogCopyItemId; },
  set sharedDialogCopyItemId(value) { sharedDialogCopyItemId = value; },
  get sharedPickerSourceContainerId() { return sharedPickerSourceContainerId; },
  set sharedPickerSourceContainerId(value) { sharedPickerSourceContainerId = value; },
  get sharedPickerSourceItemId() { return sharedPickerSourceItemId; },
  set sharedPickerSourceItemId(value) { sharedPickerSourceItemId = value; },
  get sharedVirtualCollapsedContainers() { return sharedVirtualCollapsedContainers; },
  set sharedVirtualCollapsedContainers(value) { sharedVirtualCollapsedContainers = value; },
  get suppressNextFilterJump() { return suppressNextFilterJump; },
  set suppressNextFilterJump(value) { suppressNextFilterJump = value; }
};
const appTailControllerDeps = {
  runtime: appTailRuntime,
  ACTIVE_LAYOUT_CHOICE_KEY, ACTIVE_LAYOUT_CHOICE_SOURCE_KEY, ACTIVE_LIST_ID_KEY, ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY, ADMIN_EMAILS,
  ADMIN_USER_IDS, API_TIMEOUT_MS, APP_VERSION, AUTH_SIGNED_OUT_KEY, BASE_STATE_KEY,
  DATA_ITEM_KEY, DATA_SCOPE_KEY, DEFAULT_LANGUAGE, DEMO_LAYOUT_SELECT_VALUE, DEMO_SHARED_LAYOUT_ID,
  EDGE_SCROLL_MAX_SPEED, EDGE_SCROLL_ZONE, ENTITY_SYNC_CONFIG, FORCE_OFFLINE_KEY, GUEST_DEMO_COPY_FLAG,
  GUEST_STORAGE_SCOPE, I18N, ITEM_DISPLAY_MODE_DEFAULT, ITEM_DISPLAY_MODE_PUBLIC_DEFAULT, LIST_API_TIMEOUT_MS,
  LIST_SAVE_API_TIMEOUT_MS, NESTED_GROUP_HOVER_DELAY_MS, PACKING_VISUAL_STYLE_OPTIONS, PACKING_VISUAL_STYLE_PRIMARY, PACKING_VISUAL_STYLE_SETTINGS_VERSION,
  POINTER_DRAG_START_DISTANCE, PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY, RECOVERY_STATE_KEY, RECOVERY_STATE_MAX, REMOTE_REFRESH_INTERVAL_MS,
  REQUIRED_ADMIN_API_CAPABILITIES, REQUIRED_ADMIN_API_VERSION, SEARCH_RENDER_DEBOUNCE_MS, SESSION_MODE_ADMIN, SESSION_MODE_GUEST,
  SESSION_MODE_USER, SHARED_CONTAINER_COPY_PICKER_MODE, SHARED_ITEM_COPY_PICKER_MODE, SHARED_LAYOUTS_STORAGE_KEY, SHARED_LAYOUT_QUERY_PARAM,
  SHARED_LIST_QUERY_PARAM, STATE_SCOPE_DEMO, STATE_SCOPE_PRIVATE, STATE_SCOPE_SHARED, STORAGE_KEY,
  SUPPORTED_LANGUAGES, SYNC_META_KEY, TOUCH_DRAG_CANCEL_DISTANCE, TOUCH_DRAG_DELAY_MS, TOUCH_SCROLL_CANCEL_DISTANCE,
  UI_SETTINGS_KEY, VIEW_SCOPE_ADMIN_PUBLIC_EDIT, VIEW_SCOPE_DEMO, VIEW_SCOPE_GUEST_LOCAL, VIEW_SCOPE_PRIVATE,
  VIEW_SCOPE_SHARED, activateAdminPublishedLayout, activateLocalStorageScope, activateLocalStorageScopeForCurrentUser, activateOfflineRememberedSession,
  activateSharedPayloadLayout, activeAdminDraftOptionLabel, activeDemoTemplateListId, activeDictionaryList, activeDictionaryOwner,
  activeEditableLayoutIdForState, activeHistorySource, activeLayoutNestedContainerIdsForState, activeReadOnlyDictionaryOwner, activeReadOnlyLayoutId,
  activeReadOnlyLayoutIdFromScope, addBackupDictionaryValues, addCustomDictionaryValue, addItemToLayoutArrangementForState, addPhotosToDraft,
  adminApiCompatibility, adminApiWarningFromCapabilities, adminApiWarningFromCapabilitiesValue, adminDemoTemplateCatalogEntries, adminDemoTemplateOptionsForLanguage,
  adminPublicLayoutOptions, adminReportsDialogController, adminSharedTemplateOptions, adminTemplateDraftChoice, allActiveLayoutNestedContainersCollapsedForState,
  allSharedLayoutsByAdminOrder, annotatePayloadError, apiCapabilitySet, apiErrorMessage, apiFetch,
  apiFetchRequest, apiUploadFormData, apiUploadFormDataRequest, appUnlocked, appendCopiedFromTemplateNote,
  applyBackupRestoreModeUi, applyCategoryFilterDialog, applyCollectionModeFromSource, applyConflictChoices, applyConflictChoicesToState, applyDefaultCollapsedContainers,
  applyEditMeta, applyEntityChangesToState, applyGuestLocalDisplayPreferences, applyItemAvailabilityStatus, applyLayoutArrangement, applyLayoutArrangementToState,
  applyLayoutEditFields, applyLayoutLocked, applyLoadedStateToCurrentScope, applyPackingVisualStyle, applyPackingVisualStyleClass, applyPreferredPrivateLayoutChoice,
  applyPublicTemplateLanguage, applyPublicTemplateMetadataToPayload, applyPublishedPayloadPhotosToLayoutState, applyRemoteState, applySearchInputNow,
  applyStaticTranslations, applyStaticTranslationsUi, applyingLayoutArrangement, applyingRemoteState, arePublishedTemplatesBlocked,
  askConfirmDialog, askConflictResolution, askPrintLabelsChoice, askUnsavedChangesDialog, assertAdminApiCompatibility,
  adminBackupPayloads, assertEntitySyncConfirmed, assertEntitySyncListFreshnessApi, assertPublishedTemplateCopyConfirmed, assertRemoteStateIntegrity, backupDownloadName,
  bestCatalogListRecord, bestMeaningfulLayoutId, bindBoardScroll, bindDictionaryControls, bindFixedScrollbar, bindStickyRootHeaderRow,
  bindHorizontalTouchScroll, bindLayoutEditorControls, bindLayoutOrderPointerDrag, bindLongPressTooltips, bindPackingEventsUi, bindPhotoGalleries, bindRootContainersEditorControls,
  bindSettingsPointerDragUi, bindSharedLayoutEvents, bindSharedVirtualEvents, bindSharedVirtualEventsUi, blockDestructiveLocalSave,
  blockDestructiveRemoteState, blockRemoteIntegrityFailureIfNeeded, blurActiveEditableBeforeButtonAction, buildAdminDemoTemplateOptions, buildAdminSharedTemplateOptions,
  backupAdminTemplateRows, buildBackupLayoutRows, buildBackupPhotoEntries, buildChangedEntitySyncEntries, buildChangedEntitySyncEntriesForSync, buildCurrentBackupManifestValue,
  buildEntitySyncBody, buildEntitySyncBodyForSync, buildListSaveBody, buildListSaveBodyForSync, buildPrintableDocument,
  buildRememberedOfflineUser, buildSharedListUrl, buildSharedListUrlFromHref, canAddUsageEntries, canDeleteActiveLayoutForState,
  canEditPublishedTemplatesNow, canLocalStateOverrideRemote, canOpenAdminPublishedEdit, canReplaceLayoutCreateNameSuggestionValue, canRequestEntityChanges,
  canSeedEmptyRemoteFromLocal, canUseCachedStartupState, canUseLocalEditableState, canUsePrivateState, canViewAdminPublishedCatalog,
  cancelPublishedLayoutSave, capitalize, captureActiveLayoutArrangement, captureBike3dDetailViewport, captureSearchBlurViewportLock,
  catalogActionTargetIds, categories, checkAdminApiCompatibility, checkAuthAndLoad, checkAuthAndLoadFlow,
  checkRemoteStateFreshness, chooseContainerTreeCopyToLayoutAction, chooseDefaultPackingList, chooseSharedCopyTargetLayoutId, cleanPublishedEntityId,
  cleanupEmptyContainersInLayoutArrangement, cleanupEmptyContainersInState, cleanupGeneratedCatalogArtifacts, clearActiveAdminDemoStateOnStartup, clearCategoryFilter,
  clearLocalStorageScope, clearOfflineRememberedSession, clearReadOnlyPackingListContextForPrivateMutation, clearSearch,
  clearSelectFilter, clearStaleDirtyFlagIfNoLocalChanges, clone, cloneIsolatedPublicEntity, clonePlain,
  cloneStateForSync, cloneStateForSyncPayload, closeDialogWithoutRestoringFocus, closeTopMenu, collapsedDefaultsForTemplateContainers, containerCopyExcludedLayoutIds,
  collectManagedPublicDraftRecords, collectPublicLayoutRecordIds, commitSearchInputForNavigation, comparableValueForMerge, compareDemoTemplateOrder,
  compareSharedLayoutAdminOrder, compareSharedLayoutIndexEntries, compareSharedTemplateAdminOrder, confirmContainerTreeCopyToLayout, confirmCreateLayoutFromReadonlyTemplate,
  confirmGuestImportRemoteState, confirmLoadedDemoPublicTemplate, confirmPublicCopyDuplicates, confirmPublicLayoutTransition, confirmRepeatedSharedLayoutCopy,
  conflictDefaultChoice, conflictFormatter, conflictKindLabel, conflictLabel, conflictSummary,
  conflictTimestamp, conflictVersionStamp, consumeGuestLocalLayoutCandidate, containerCategories, containerCreatedTimeForState,
  containerEntitySyncUnavailable, containerPathForState, containerTreeSnapshotScore, containerWeightForState, copyItemInState,
  copyMissingLayoutSnapshotItemsToLayout, copyMissingPublicSnapshotItemsToLayout, copyPickerLayoutLabel, copyPublishedContainerToState, copyPublishedContainerToStateValue,
  copyPublishedDemoStateToLocalLayout, copyPublishedItemToState, copyRecordPhotosForLocalDuplicate, copySharedItem,
  copySharedItemToLayoutContainer, copySharedItemToState, copySharedLayout, copySharedListLink, copySharedRoot,
  copySharedRootToLayoutContainer, copySharedRootToState, countPrivateLayouts, createAdminReportsDialogController,
  createBackupZip, createBlankBikePackingState, createConfirmDialogController, createConflictValueFormatter, createDeletedSharedLayoutStore,
  createDemoTemplateCopyRecord, createDemoTemplateListId, createEmptyLayoutArrangement, createEmptyPublicTemplateDraftRecord, createEmptyPublicTemplateState,
  createEmptyUserState, createGroupFromItemsInState, createItemPhotoFromFile, createLayoutArrangementFromCurrentState, createLayoutCopyRecordFromSource,
  createLayoutLoadStatusController, createLegacyPersonalSyncWriteBlockedError, createLocalDemoCopy, createManagedLayoutCopyRecord, createMetaForDevice,
  createModalScrollLockController, createNewPublicTemplateDraftRecordValue, createPackingDragController, createPhotoDraftFromRecord, createPrintWindowTarget,
  createPrivateLayoutFromTemplateSourceRecord, createPublicTemplatePayloadCache, createReadOnlyBikePackingError, createRefs, createRemoteListRecordSelector,
  createSharedLayoutCatalogDiagnostics, createSharedLayoutsByLanguage, createSharedVirtualStateForPublic, createSkippedPersonalListApiError, createTemplateCopyFromSourceFlow,
  createTemplateCopyLayoutRecordValue, createTemplateCopyRecord, currentAdminApiWarning, currentCreateMeta, currentDemoTemplate,
  currentEditMeta, currentHistoryComparisonState, currentLayoutChoice, currentPackingListId, currentPackingListMeta,
  currentPageScrollPosition, currentPublicTemplateStatusMessage, currentPublishedTemplateBlockReason, currentSessionMode, currentSharedLayouts,
  currentUsageLimit, currentUser, currentUserEmail, currentUserId, currentUserIdFromStorage,
  currentUserSyncKey, currentViewScope, cycleDictionarySortMode, defaultBike3dViewState, defaultDemoState,
  defaultRootContainerLocation, deleteCachedPhoto, deleteItemFromState, deletePublishedSharedTemplateRecord, deleteRemotePhotoIfPossible,
  deleteRootContainerFromState, deleteUnusedLayoutContainerEntityFromState, demoAdminPathForPublicListId, demoAdminPathForPublicListIdFromScope, demoAdminStatePathForPublicListId,
  demoAdminStatePathForPublicListIdFromScope, demoCopyActionText, demoCopyLayoutName, demoCopyPreferredTemplateName, demoCopyTemplateListId,
  demoLanguageFromLayoutChoice, demoLanguageFromLayoutChoiceValue, demoLayoutChoiceForLanguage, demoLayoutChoiceForLanguageValue, demoLayoutChoiceForTemplate,
  demoLayoutChoiceForTemplateValue, demoPublicListIdForLanguage, demoPublicListIdForLanguageFromScope, demoSharedLayout, demoStatePayloadForLanguage,
  demoTemplateChoiceForEntry, demoTemplateChoiceForLanguage, demoTemplateChoiceForLayout, demoTemplateEntryForLanguage, demoTemplateFallbackName,
  demoTemplateForLanguage, demoTemplateIdFromLayoutChoice, demoTemplateIdFromLayoutChoiceValue, demoTemplateNameCandidates, demoTemplateNameFromPayload,
  demoTemplatesForLanguage, demoTemplatesForUiLanguage, dictionaryCategorySortMode, dictionaryEditScope, dictionaryEntitySyncUnavailable,
  dictionaryListForOwner, dictionaryLocationSortMode, dictionaryOptionsForOwner, dictionaryOptionsForUi, dictionaryOptionsForUiValues,
  dictionarySelectEntry, dictionarySortModeForType, dictionaryValueLabel, draftPhotosToCleanup, createSubcontainerInLayoutState, duplicateContainerSnapshotRecords, duplicateItemToContainerInLayoutState,
  duplicateRootContainerInState, duplicateSnapshotItemToContainerInLayoutState, editMetaForDevice, editSharedSourceAsAdmin, editedLayoutName,
  editingItemTitleId, ensureAdminPublicCopyTargetsAvailable, ensureCurrentPackingListId, ensureGuestDemoPreviewPayload, ensureGuestPublicScope,
  ensureItemDisplayModeState, ensureLayoutContainerPlacementForState, ensureLayoutDictionaries, ensureLayoutDictionariesForState, ensurePrivateDictionaries,
  ensurePrivateDictionariesForState, ensurePrivateStateForSharedCopy, ensureSharedCopyTargetLayoutId, enterSignedOutPublicMode, entitySyncBodyContext,
  entitySyncStateDeps, escapeHtml, explicitLayoutChoice,
  exportLayoutAsDemoState, exportLayoutAsPublishedState, fallbackDemoTemplateEntry, fetchAdminReports, fetchBikePackingApiCapabilities,
  fetchPublicSharedLayoutCatalog, fetchPublicTemplatePayloadRecordByItemKey, fetchPublishedDemoTemplateState, fetchPublishedListStateById, fetchRemoteListChangesRecord,
  fetchRemoteListDetailRecord, fetchRemoteListFreshnessRecord, fetchRemoteListStateRecord, fetchRemoteListStateSnapshot,
  fetchRemoteStateRecord, fetchSharedListLinkRecord, fetchStateRecordByItemKey, fetchStateRecordMetaByItemKey, fetchStateRecordPayloadByItemKey,
  filterAutoResolvedMergeConflicts, findCopiedSharedLayout, findDemoTemplateForLanguage, findMaterializedSharedContainerId,
  findMaterializedSharedItemId, findSharedItem, findSharedLayout, findSharedLayoutForLanguage, findSharedPublishedContainer,
  findSharedPublishedItem, findSharedRoot, fixedScrollbarRefreshFrame, flushActivePublishedEditSave, forgetDeletedSharedLayoutId,
  formatFullDateTime, formatHistoryDateTime, formatItemWeight, formatMergeConflicts, formatThingCount,
  formatVolume, formatWeight, fullBackupRestoreConfirm, generatedCatalogString, getActiveEditableLayoutId,
  getBike3dPackingScrollHost, getCachedPhoto, getContainerItemIdsDeepForState, getCurrentView, getDescendantContainerIdsForState,
  getItemContainerIdInLayoutForState, getLayoutContainerIdSetForState, getLayoutCreateCopySourceOptions, getLayoutDescendantContainerIdsForState, getLayoutItemIdSetForState,
  getPublishedEditLayoutId, getPublishedWorkLayout, getSavedAuthEmail, getSavedAuthEmailFromStorage,
  getTemplateCopyRootSnapshots, getTemplateCopySourceScore, getUnsyncedPhotoEntries, getUnsyncedPhotoEntriesForSync, getUploadablePhotoEntries,
  getUploadablePhotoEntriesForSync, getVisibleLayoutRootIdsForState, guestCandidateLayouts,
  guestDemoCopyCleanupPlan, guestDemoCopyLayoutNameValue, guestDemoCopyRecordWasEdited, guestDemoStartupAction, guestLayoutHasUserContentEdits,
  guestLayoutImportFallbackName, guestLocalDisplayPreferences, guestLocalDisplayPreferencesWereChanged, guestLocalLayoutCandidate, guestLocalLayoutImportPlan,
  hadAuthoritativeLocalStateAtStartup, hadLocalStateAtStartup, hadRemoteBaselineAtStartup, handleAuthButton, handlePackingTabTouchEnd,
  handleRemoteSaveConflict, handleRemoteSaveConflictFlow, handleSearchInput, handleWindowReturn, hasContainerDimensions,
  hasGeneratedPublicArtifacts, hasGuestDemoCopyLayoutRecord, hasLegacyPayloadChanges, hasLegacyPayloadChangesForSync, hasListFreshnessSignal,
  hasLocalSavedState, hasLocalSyncChanges, hasPrivateSyncBlockedPublicOrigin, hasPublicOriginMarker, hasRemotePhotoUrl, inspectRecordRemotePhotoSources,
  hasStateIntegrityMeta, hasStoredLocalValue, highlight, highlightSearchText, historyComparisonState,
  historyPayloadTitle, historyRecordKey, historyRecordState, historyRecordStateForSync, historyRecords,
  historySourceLabel, hydrateItemPhotos, hydrateLocalSharedTemplateCatalogFromState, importDemoStateAsEditableLayout, importDemoStateAsEditableLayoutValue,
  importGuestLocalLayouts, importGuestLocalLayoutsToState, init, initialRemoteLoadPending, installRuntimeActiveLayoutId,
  isActiveLayoutChoiceExplicit, isAdminEditablePublishedLayout, isAdminIdentity, isAdminPublicEditScope, isAdminSession,
  isAdminUser, isAutomaticGuestDemoCopyLayout, isBike3dPackingView, isCollectionPackedVisible, isConcretePublicSharedLayoutListRecord,
  isConflictMetaField, isContainerPickerContainerCopyModeValue, isContainerPickerCopyModeValue, isContainerPickerItemCopyModeValue, isCurrentLocalStateDestructiveRegression,
  isDefaultDemoSeedLayoutRecord, isDeletedSharedLayoutId, isDemoLayoutChoice, isDemoLayoutChoiceValue, isDemoPublicTemplateMissing,
  isDestructiveStateRegression, isDisposableManagedPublicDraft, isEditableElement, isEntitySyncTypeUnavailable, isEntitySyncUnavailableError,
  isExplicitlySignedOut, isForcedOffline, isForeignLocalSyncState, isGeneratedCatalogContainerStateArtifact, isGeneratedCatalogContainerSyncArtifact,
  isGeneratedCatalogStateArtifact, isGeneratedCatalogSyncArtifact, isGeneratedStartupFallbackState, isGuestDemoCopyLayout, isGuestDemoCopyLayoutRecord,
  isGuestLocalPersonalLayout, isGuestSession, isItemAwayFromHomeAndBikeValue, isItemInCatalogForState, isItemInLayoutForState,
  itemAvailabilityBlocksPlacement, itemPlacementSnapshotChanged, isItemUnavailableForPacking, isItemWithoutWeightValue, isLayoutCreateTemplateLayoutModeValue, isLayoutLocked, isLayoutMeaningful, isLocalDevOrigin, isManagedDemoTemplateLayout,
  isManagedPublicTemplateDraft, isMeaningfulPackingState, isNetworkError, isOfflineRememberedAdminSession, isOfflineRememberedSession,
  isOwnLayoutEchoConflict, isOwnLayoutEchoConflictValue, isPackingStateShape, isPhotoStoredForList, isPhotoUsableFromServer,
  isPrivateCatalogRecord, isPrivateLayoutChoice, isPrivateLayoutChoiceForStateRestore, isPrivateLayoutChoiceValue, isPrivateUserLayoutId,
  isPublicCatalogContainerRecordForState, isPublicCatalogItemRecordForState, isPublicDemoTemplateRecord, isPublicLayoutContext, isPublicSharedLayoutListRecord,
  isPublicSharedTemplatePayload, isPublicSyncContainer, isPublicSyncItem, isPublicTemplateListId, isPublishedLayoutEditable,
  isReadOnlyBikePackingContext, isReadOnlyBikePackingError, isReadOnlyBikePackingRecord, isReadOnlyItemKey, isReadOnlyScope,
  isReadOnlyStateScope, isReadonlyTemplateView, isRecentExplicitLayoutChoice, isRootContainerForEditorForState, isRootContainerInCatalogForState,
  isRootContainerInLayoutForState, isSafePublishedDemoState, isSearchInputEditing, isSharedListLinkRoute, isStartupGuestDemoPreview,
  isStartupGuestDemoPreviewState, isStoredActiveLayoutChoiceExplicit, isSuspiciousEmptyPackingState, isTemplateCopySharedLayoutId, isTemporaryServerStorageError,
  isTimeoutError, isViewingPublishedTarget, itemCategories, itemCopyConfirm, itemCreatedTimeForState,
  itemDeleteConfirm, itemDisplayMode, itemDisplayModeFromFlags, itemDisplayModeLabel, itemEntitySyncUnavailable,
  itemPhotoSignature, itemQuantityForState, itemSortMode, itemTotalWeightForState, itemUsageCountsForCatalog,
  itemsForActiveCatalogForState, itemsForItemsViewForState, keepRemoteOnlyPhotoReference, languageOptionLabel, languageOptionLabelValue,
  lastItemTitleTap, lastPackingTabTapTime, lastPackingTouchToggleAt, lastRootContainerTitleTap, lastToastAt,
  lastToastSignature, layoutArrangementContentScore, layoutContainerPathForState, layoutContainersOwnWeightForState, layoutCreateModeState,
    layoutDictionaryValues, layoutEditTitle, layoutEntitySyncUnavailable, layoutLoadStatus, layoutManageLanguage, layoutOrderIdsFromSections, layoutOrderSectionsFromSources, applyLayoutOrderToSources,
  layoutSourceNameFromOptionLabel, legacyComparableStateForSync, legacyComparableStateForSyncPayload, legacyComparableTopLevelDiffKeys, legacyComparableTopLevelDiffKeysForSync,
  legacySharedRootSnapshot, linkExistingContainerTreeToLayoutState, linkMissingContainerTreeToLayoutState, linkedSharedListLayout, listFreshnessChanged, listRecordVisibility,
  loadActiveLayoutChoice, loadActivePackingListId, loadActivePrivateLayoutChoice, loadBaseState, loadCurrentHistoryComparisonState,
  loadCurrentServerStateDirectly, loadGuestPublishedDemoOnStartup, loadPublishedDemoState, loadPublishedTemplateCopySourceValue, loadRecoverySnapshots,
  loadRemoteHistory, loadRemoteState, loadRemoteStateFlow, loadSharedLayoutPayload, loadState,
  loadStateForScope, loadStoredActiveLayoutChoice, loadStoredActivePackingListId, loadStoredActivePrivateLayoutChoice, loadStoredSyncMeta,
  loadStoredUiSettings, loadSyncDevice, loadSyncMeta, loadUiLanguage, loadUiSettings,
  localAdminTemplateCopyLayouts, localDemoCopyInFlight, localDemoTemplateEntriesFromLayouts, localSharedLayoutCatalogEntriesFromLayouts, localStorageScopeKey,
  locations, makeContainerCopyNameForState, makeItemCopyNameForState, managedSharedDraftLanguage, markCopiedItemForPublicLayout,
  markEdited, markEntitySyncTypeUnavailable, markLayoutPhotosForCurrentListCopy, markLayoutPhotosForCurrentListCopyForSync, markLocalPublicCopyOrigin,
  markPhotoUploadStarted,
  markPrivateCopyOriginFromSource, markPublicTemplateOptionsState, markRecordPhotosForCurrentListCopy, matchesCollectionFilterValue, matchesItemFieldsFilterValue,
  matchesRootContainerFieldsFilterValue, materializeDemoLayoutForAdminCopy, materializeSharedLayoutForAdmin, materializeSharedLayoutForAdminState, mergeBuiltInSharedEntriesIntoAdminLayout,
  mergeBuiltInSharedEntriesIntoAdminLayoutValue, mergeDemoTemplateCatalogEntry, mergeDemoTemplateEntriesForAdmin, mergeLocalCollapsedContainers, mergeManagedPublicDraftRecords,
  mergePublishedSharedStateIntoAdminLayout, mergePublishedSharedStateIntoAdminLayoutValue, mergeServerDemoTemplateCatalog, mergeSharedLayoutCatalogEntries, mergeStateFromBase,
  mergeStateFromBaseValue, migrateContainerOrder, missingDemoPublicTemplates, modeState, moveContainerInLayoutArrangementForState,
  moveItemInLayoutArrangementForState, moveLayoutBeforeInSections, moveLayoutWithinSections, moveRootColumnInState, addRootContainerToLayoutInState, rootColumnInsertIndexFromVisibleNeighbors, nextDemoTemplateAfter, nextItemDisplayModeValue, nextServerConfirmedSharedLayoutAfter,
  normalizeActiveLayoutChoice, normalizeActiveLayoutChoiceValue, normalizeBike3dTransform, normalizeBike3dTransforms, normalizeBike3dViewState,
  normalizeCatalogSelection, normalizeCollectionModeState, normalizeContainerColor, normalizeContainerDimensions, normalizeContainerFields,
  normalizeDemoLayoutName, normalizeDemoPayloadForLanguage, normalizeDemoTemplateName, normalizeDictionaryValues, normalizeIntegrityCount,
  lockedLayoutMutationBlocked, lockedLayoutsContainingContainer, lockedLayoutsContainingItem, lockedLayoutsContainingNestedContainer, normalizeItemAvailabilityStatus,
  normalizeItemCategories, normalizeItemDisplayMode, normalizeItemFields, normalizeItemPhotos, normalizeItemQuantity,
  normalizeLayoutArrangement, normalizeLayoutFields, normalizeListFreshness, normalizePackingListsResponse, normalizePackingViewMode,
  normalizePackingVisualStyle, normalizePhotoUrlFields, normalizePrivateDictionariesForSyncState, normalizePrivateLayoutChoiceForStateRestore, normalizePublicTemplateMetadataResponse,
  normalizePublishedDemoTemplatePayload, normalizePublishedStatePayload, normalizeRemoteListRecord, normalizeRemoteState,
  normalizeRestoredBackupState, normalizeSharedGearName, normalizeSortMode, normalizeStateRevision, normalizeUiLanguage,
  nowIso, offerLoadServerForTruncatedLocalState, offerPendingGuestLocalLayoutsAfterRemoteLoad, offerSaveGuestLocalLayouts,
  offlineRememberedUser, openAdminDemoLayout, openAuthDialog, openCategoryFilterDialog, openConfirmDialog,
  openDemoLayoutFromSelect, openHelpLimitsDialog, openHelpLimitsDialogUi, openHistoryDialog, openModalDialog,
  openPrivateLayout, openSharedLayoutForAdmin, openSharedLayoutViewer, openSharedLayoutsDialog, openSharedListFromLink,
  orderAdminPublicDraftsLikeMainSelect, packingVisualStyle, packingVisualStyleButtonLabel, packingVisualStylePanelVisible, parseContainerDimensionInput,
  parseVolumeInput, parseWeightInput, pendingGuestLocalLayoutCandidate, persistActiveLayoutSelection, persistStateSnapshot,
  personalListApiUnavailable, photoDialogStatusText, photoDraftChanged, photoObjectUrls, photoRecordIdMatchesRemoteSource, photoRemoteSrc,
  photoShouldBeCopiedToCurrentList, photoStatusText, photoUploadInFlight, photoUploadProgressRenderFrame, pickRicherRemoteListRecord,
  placeDuplicatedContainerSnapshotInLayoutState, placeExistingContainerInLayoutInState, placeExistingItemInLayoutInState, planLayoutTreeMissingItems, planPublicCopyMissingItems,
  preferredCurrentLayoutRef, prepareBackupPhotosForStateValue, preserveSearchBlurViewport, preventDoubleTapZoom, primaryItemPhoto,
  printHtmlDocument, copyCrossesPublicNamespaceBoundary, privateContainerTreeCopyRoute, photoDuplicateOptionsForLayoutCopy, shouldCopyPhotosToCurrentListForLayoutCopy, privateLayoutCount, privateLayoutDeleteConfirm, privateMojibakeLayoutFallbackName, pruneAdminPublishedDraftsForSync,
  containerPlacementSnapshotChanged, pruneAdminPublishedDraftsForSyncValue, pruneRuntimeSharedLayouts, pruneUneditedGuestDemoCopies, pruneUnusedLayoutCustomDictionaries, publicCopyComparableText,
  publicCopyDuplicateSummaryForSnapshot, publicCopyMissingItemPlanForSnapshot, publicCopyRecordContentHash, publicCopySnapshotFromSourceSnapshot, publicCopySourceIdFromRecord,
  isSharedCopyTargetLayout, publicCopyTargetLayouts, sharedCopyTargetLayouts,
  publicDemoTemplateEntryFromRecord, publicDemoTemplatePayloadTarget, publicLayoutChoiceForLayout, publicLayoutChoiceValue, publicLayoutDeleteConfirm,
  publicListIdForPublishedTarget, publicReadonlyItemDisplayMode, publicSharedLayouts, publicTemplateChoice, publicTemplateDeleteBlockReason,
  publicDemoTemplateExactDeletePath, publicTemplateDeletePath, publicTemplateDeleteResponseMatches, canonicalCatalogConfirmsDemoTemplateAbsent, publicTemplateMetadataPath, publicTemplateMetadataRequest, publicTemplateMetadataTarget, publicTemplateOptionLabel,
  publicTemplatePayloadPath, publishPublicHistoryRecord, publishedItemKeyStateCache, publishedLayoutSaveLayoutId, publishedLayoutSaveTimer,
  publishedPhotoUploadRequest,
  publishedLayoutTarget, publishedListStateCache, publishedPayloadWithTemplateMetadata, publishedTemplateBlockReason, purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState, putCachedPhoto, readBackupArchiveFile, readBackupImportFile, readOnlyLayoutDictionariesForState,
  readableGuestDemoLayoutName, readonlyPublicTemplateOptionLabel, readonlyTemplateMessage, reconcilePublishedTemplateCopyDraft,
  recoverUnsyncedLocalChanges, refreshActiveReadOnlyPublicTemplate, refreshHistoryDialog, refreshOpenPhotoDialogPreviews, refreshPublicSharedLayoutCatalog,
  refreshPublicSharedLayoutCatalogFlow, refreshPublicSharedLayoutIndex, refreshPublicSharedTemplates, refreshPublishedLayoutView, refs,
  registerAppServiceWorker, rememberActiveLayoutChoice, rememberAuthenticatedUser, rememberAuthenticatedUserInStorage, rememberConflictRemoteMeta,
  rememberConflictRemoteMetaForSync, rememberCurrentPackingListRecord, rememberCurrentSyncAccount, rememberDeletedSharedLayoutId, rememberEntitySyncResultMeta,
  rememberPrivateServerLayoutChoice, rememberRemoteIntegrityMeta, rememberedOfflineUser, remoteListRecords,
  remoteRecordId, remoteRecordPrivateLayoutCount, remoteRecordStateInfo, remoteRefreshInFlight, remoteRefreshTimer,
  remoteStateIntegrityError, remoteStateLoadPromise, remoteUpdatedAt, removeContainerFromLayoutOnlyInState, removeCustomDictionaryValue,
  removeItemFromLayoutArrangement, removeItemFromLayoutInState, removeLayoutTree, removeLayoutTreeFromState, removeManagedDemoTemplateTreesFromState,
  removeManagedSharedTemplateTreesFromState, removePhotoFromDraft, removePublicLayoutDrafts, removePublicTemplateCatalogEntry, removeScopedLocalValue,
  renameCustomDictionaryValue, renameDictionaryEntryValue, renameReusableGuestDemoCopy, render, renderAndScrollToTop,
  renderBackupAnalysisUi, renderBackupProgress, renderBackupRules, renderBackupSelectionSummary, renderBike3dPackingView, renderCachedPrivateStateDuringRemoteLoad,
  renderCatalogCard, renderCatalogPills, renderConflictDetails, renderConflictSyncContext, renderContainerWeightText,
  renderDictionaryHtml, renderEmptyState, renderFilterControls, renderFilteredRootContainerColumnHtml, renderFilters,
  renderGuestPublicDemoPreviewDuringAuthCheck, renderHistoryRecordArticleHtml, renderHistoryRecords, renderHistorySourceControls, renderInitialLocalFallbackIfNeeded,
  renderItemPhotoHtml, renderItemQuantityText, renderItemsViewHtml, renderLayoutEditorHtml, renderListItemHtml,
  renderPackingItemCardHtml, renderPackingRootHeaderCellHtml, renderPhotoGalleryHtml, renderPreservingPackingScroll, renderRootContainerCardHtml, renderRootContainerColumnHtml,
  updatePhotoGalleryUploadProgress,
  renderRootContainersEditorHtml, renderSharedItemsViewHtml, renderSharedLayouts, renderSharedLayoutsHtml, renderSubcontainerSectionHtml,
  repairActiveEmptyAdminDemoDraft, repairAdminDemoLayout, repairAdminDemoLayoutValue, repairCollapsedActiveLayoutBeforeSave, repairContainerMembershipFromItemLinks,
  repairEmptyTemplateCopyDraftFromPublishedLayout, repairMojibakeLayoutNames, repairPlacementRegressionFromReference, repairPrivateMojibakeLayoutNames, repairPublishedLayoutArrangement,
  repairRemoteStateFromLocalReferences, replaceState, requirePublishedTemplatesAvailable, requireUsageCapacity, resetBackupImportUi,
  resetData, resetGuestDemoScopeToCanonical, resolveExistingBackupPhotosValue, resolveLayoutCreateTemplateCopyLayoutValue, resolveLayoutCreateTemplateCopySourceValue,
  resolvePreferredLayoutId, resolveStoredPrivateLayoutChoice, resolveStoredPrivateLayoutChoiceForState, restorableStoredPrivateLayoutChoiceId, restoreAdminPublishedLayoutContext,
  restoreBike3dDetailViewport, restoreFullBackupFlow, restoreHistoryRecord, restoreModeState, restorePrivateHistoryRecordOnServer,
  restoreBackupAdminTemplates, restorePrivateLayoutChoiceInState, restoreSavedLayoutChoice, restoreSearchBlurViewportLock, restoreSelectedBackupLayoutsFlow, restoreSelectedBackupLayoutsToState,
  reusableGuestDemoCopyLayout, rootContainerCopyConfirm, rootContainerDeleteConfirm, rootContainerSortMode,
  rootContainerUsageCountsForCatalog, rootContainersForEditorForState, rootContainersForSettingsForState, runSyncNow, runSyncNowFlow,
  safeSetLocalStorage, sameJson, sanitizePrivateCopiedPublicOrigins, saveActiveLayoutChoice, saveActivePackingListId,
  saveAuthEmail, saveAuthEmailToStorage, saveBaseState, saveDictionaryOwner, saveGuestImportToRemote,
  isNewItemPlacementPickerMode, itemDialogContainerPickerMode, itemDialogTargetLayoutFromPicker,
  saveItemDialogAction, saveLayoutMutation, saveLocalUiState, savePublishedLayoutRecord, savePublishedLayoutRecordFlow,
  savePublishedTemplateMetadata, saveRecoverySnapshot, saveRemoteListStateRecord, saveRemoteState, saveRemoteStateFlow,
  saveRemoteStateRecord, saveRootContainerDialogAction, saveState, saveStoredActiveLayoutChoice, saveStoredActivePackingListId,
  saveStoredSyncMeta, saveStoredUiSettings, saveSyncMeta, saveUiLanguage, saveUiSettings,
  scheduleActivePublishedEditSave, schedulePhotoUploadProgressRender, schedulePublishedLayoutSave, scheduleRemoteSave, scheduleSearchContextCommit,
  scopedLocalStorageKey, scopedStorageKey, searchContextCommitTimer, selectDemoTemplateForLanguage, selectLocalAdminTemplateCopyLayouts,
  selectedBackupAdminTemplateKeys, selectedBackupLayoutIdsFromUi, selectedBackupRestoreModeFromUi, selectedBackupRestoreConfirm, selectedHistoryPublishedTarget, selectedSharedTargetLayoutId, serializeState,
  serverChangedSinceLastSync, serverConfirmedDemoTemplates, serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsByAdminOrder, serverConfirmedSharedLayoutsFromPublicRecords,
  setActiveLocalEditableScope, setActivePrivateScope, setActiveReadOnlyScope, setDemoPublicTemplateMissing, setDemoStatePayloadForLanguage,
  setDictionarySortModeForType, setExplicitlySignedOut, setForcedOffline, setLayoutLoadProgress, setLayoutLoadStatus,
  setLoadedRemoteListProgress, setPackingVisualStyle, setPackingVisualStylePanelVisible, setPersonalLayoutsLoadedStatus,
  setPrimaryPhotoInDraft, setTemporaryAdminEditLayout, setUiLanguage, setViewScope, settingLabel,
  setupDialogKeyboardScrollGuard, setupModalScrollLock, setupPackingVisualStyleQuickControl, setupTouchActionButtonFeedback, shareCurrentPackingListByLink,
  sharedGearPhotos, sharedItemFromPublishedItem, sharedLayoutCatalogDiagnostics, sharedLayoutIdFromLocation, sharedLayoutIdFromPublicListRecord,
  sharedLayoutIdFromUrl, sharedLayoutItemKey, sharedLayoutItemKeyFromScope, sharedLayoutLanguageFromPayload, sharedLayoutPublicSourceId,
  sharedLayoutRoots, sharedLayoutsByLanguage, sharedListIdFromLocation, sharedListIdFromUrl, sharedPayloadActiveLayout,
  sharedRootFromPublishedContainer, shouldBlockLegacyPersonalSyncWrite, shouldBlockLegacyPersonalSyncWriteFallback, shouldCaptureGuestLocalLayoutCandidate, shouldClearPackingListContextForPrivateMutation,
  shouldCopyPublicTemplatePhotoReferencesOnServer, shouldCreatePublishedTemplateBeforePhotos, shouldDeletePublishedTemplateForLayoutValue, shouldImportGuestLayoutBeforeRemote, shouldKeepCurrentReadonlyDemoAfterAuthCheck,
  shouldKeepReadonlyDemoAfterAuthCheck, shouldKeepScopedControlsStable, shouldRecoverUnsyncedLocalChanges, shouldRenderGuestDemoPreviewDuringAuthCheck, shouldShowItemLabels,
  shouldShowItemLabelsForMode, shouldShowItemPhotos, shouldShowItemPhotosForMode, shouldUseStickyFilterControls, shouldWarnAboutSharedLayoutCatalog,
  snapshotContainerTreeFromLayoutArrangement, snapshotContainerTreeFromLiveStateValue, snapshotHasLocalPublicCopyOrigin, snapshotHasPrivateSyncBlockedPublicOrigin, snapshotModeState,
  selectUnlockedLayoutTargetId, snapshotsEqual, solidifyManagedTemplateDrafts, solidifyManagedTemplateDraftsForState, solidifyTemplateDraftLayout, solidifyTemplateDraftLayoutForState,
  sortDictionaryValues, sortHistoryRecords, sortLayoutSectionByDate, sortLayoutSectionByName, sortedDictionaryValues, splitEntitySyncEntries, splitEntitySyncEntriesForSync,
  startRemoteStateWatcher, startupLocalStateWasFallback, startupSyncMeta, state, stateIntegrityMetaFromResponse,
  statePrivateLayoutCount, stateStats, stateStatsForDestructiveComparison, storedGuestLocalLayoutCandidate, storedGuestLocalLayoutCandidateOffered,
  storedPrivateLayoutChoiceRef, stripPublicOriginForPrivateCopy, stripPublishedPublicOriginMarkers, subcontainerTitleHtml, submitAuthDialog,
  suggestedLayoutCreateName, summarizeBackupLayouts, summarizeHistoryPayload, summarizeLayoutTreeIdDuplicates, summarizePublicCopyDuplicates,
  switchActiveLayout, switchView, syncChangedBikePackingEntities, syncChangedEntityType, syncCreatedPrivateLayoutEntities,
  syncDemoStatePayloadForLanguage, syncDevice, syncInFlight, syncMeta, syncMetaAccountKey,
  syncMetaBelongsToCurrentUser, syncNow, syncPackingVisualStyleControls, syncPayloadSizeReport, syncPublishedEntityPhotos,
  syncPublishedEntityPhotosValue, syncQueued, syncQueuedForce, syncTimer, t,
  templateCopySourceKindFromChoice, templateCopySourceRootIds, templateDraftLayoutId, timeValue, toggleActiveLayoutNestedContainers, toggleActiveLayoutNestedContainersCollapsedForState,
  toggleCollectionMode, toggleCollectionModeEnabled, toggleFilterContext, toggleForcedOfflineMode, toggleItemDisplayMode,
  togglePackingViewMode, togglePackingVisualStylePanel, toggleShowOnlyUnpacked, toggleTopMenu, touchContainer,
  touchItem, touchLayout, touchLayoutsReferencingItemInState, tryApplyRemoteEntityChanges, uiLanguage,
  uiSettings, uniqueLayoutIds, uniqueName, unlockOfflineState, updateCatalogSelection,
  updateCategoryFilterButton, updateCompactStickyControls, updateFilterContextToggle, updateFilterHighlights, updateLayoutCollapseAllToggle,
  updateLayoutLoadStatusUi, updateMetaToggle, updatePackingViewModeControl, updateSearchFocusState, updateSharedLayoutCatalogEntryMetadata,
  updateStickyControlsHeight, updateSyncUi, updateSyncUiControls, updateViewScopedControls, updateViewScopedControlsUi,
  uploadEntityPhoto, uploadEntityPhotoToPath, uploadPendingPhotos, uploadPhotoToPath, uploadPublishedEntityPhoto, uploadPublishedLayoutPhotos, upsertDemoTemplateCatalogEntry,
  unavailableSnapshotItems, upsertRuntimeSharedLayout, usageLimitExceededMessage, usageLimitForRole, userEditableLayoutsForState, userStorageScopeKey,
  validateGuestImportSyncState, visibleItemLayoutPlacementsForState, visibleSharedLayoutsForLanguage, withLayoutArrangementApplied, withLayoutArrangementAppliedAsync,
  withoutPhotoReferences, writeContainerTreeToLayoutArrangement, writeLargeScopedLocalValue
};
const {
  openAddToContainerDialog, resolveEditableLayoutIdForContainer, renderAddToContainerResults, matchesAddToContainerSearch,
  clearAddToContainerSearch, openLayoutRootDialog, renderLayoutRootResults, matchesLayoutRootSearch,
  clearLayoutRootSearch, updateRootContainerPlacementButton, updateRootContainerRemoveFromLayoutButton, updateRootContainerDeleteForeverButton,
  canRemoveContainerFromActiveLayout, confirmRemoveEditingContainerFromActiveLayout, removeContainerFromLayoutWithAnimation, findContainerElementInPacking,
  getLayoutContainerRootStatus, getLayoutSubtreeItemCount, getRootContainerDialogParentId, getRootContainerDialogParentIndex,
  openRootContainerPlacementAction, openRootPlacementDialog, renderRootPlacementBoard, renderRootPlacementSlot,
  renderRootPlacementColumn, placeRootContainerInActiveLayout, normalizeRootPlacementIndex, getRootContainerDialogLayoutRootIds,
  applyRootContainerDialogPlacement, addRootContainerToActiveLayout, addExistingItemToContainer, markRecentlyAddedItem,
  markRecentlyAddedContainer, createSubcontainerFromAddDialog, focusRecentlyAddedItem, focusRecentlyAddedContainer,
  fillSelect, renderCategoryPicker, renderItemCategoryPicker, renderRootContainerCategoryPicker,
  getCheckedCategoriesFromList, getSelectedCategoriesFromPicker, getDialogSelectedCategories, getRootContainerDialogSelectedCategories,
  isContainerPickerCopyMode, isContainerPickerItemCopyMode, isContainerPickerContainerCopyMode, openItemContainerPickerDialog,
  openItemCopyContainerPickerDialog, openContainerParentPickerDialog, openRootContainerCopyPickerDialog, firstPrivateLayoutId,
  openSharedItemCopyPicker, openSharedContainerCopyPicker, renderContainerPicker, getContainerPickerLayoutOptions,
  renderContainerPickerLayoutSelect, updateContainerPickerTitle, renderContainerPickerColumn, renderContainerPickerChildren,
  renderContainerPickerCurrentSlot, isContainerPickerCurrentTarget, shouldShowContainerPickerSlotsForParent, renderContainerPickerSlot,
  isContainerPickerCurrentPositionSlot, getContainerPickerSelectedId, getContainerPickerSelectedIndex, isContainerPickerTargetAllowed,
  selectContainerPickerTarget, selectItemContainer, closeSourceEditorAfterCopy, hydrateAuthForSharedLink,
  copyItemToContainerInLayout, layoutContainsItem, ensureWritableTargetLayoutContext, openCopiedTargetLayout,
  linkExistingItemToContainerInLayout, duplicateItemToContainerInLayout, snapshotContainerTree, snapshotContainerTreeFromLiveState,
  copyContainerTreeToLayout, layoutDuplicateSummaryForContainerTree, layoutMissingItemPlanForContainerTree, linkExistingContainerTreeToLayout,
  duplicateContainerSnapshotToLayout, selectRootContainerParent, updateItemContainerPickerButton, updateItemRemoveFromLayoutButton,
  updateItemDeleteForeverButton, cssSafeId, getFilterMatchElements, filterNavigationSignature,
  updateFilterNavigationUi, scheduleFilterNavigationRefresh, moveFilterMatch, scrollToFilterMatch,
  expandFilterMatchAncestors, renderSummary, getSummaryItems, getSummaryWeight,
  getItemsViewSummaryItems, getSummaryRootContainers, isSummaryFiltered, filteredLabel,
  metric, isSharedLayoutView, currentSharedLayout, sharedLayoutStatePayload,
  createSharedVirtualState, withSharedVirtualState, renderSharedSummary, renderPacking,
  renderCurrentPackingBike3d, renderSharedPackingBike3d, selectBike3dContainer, closeBike3dDetail,
  toggleBike3dAdjusting, getBike3dTransform, adjustBike3dTransform, setBike3dColor,
  setBike3dViewState, resetBike3dViewState, renderSharedModeBanner, renderSharedPacking,
  capturePackingScroll, captureViewportSnapshot, restoreViewportSnapshot, stickyViewportBottom,
  captureVisibleContentAnchor, captureCurrentFilterMatchAnchor, buildVisibleContentAnchor, getTopPackingContextAnchor,
  getVisibleAnchorCandidates, anchorKey, findAnchorElement, cssEscape,
  getOpenAncestorContainerIds, uniqueIds, keepAnchorContainersOpen, restorePendingPackingScroll,
  renderContainer, renderFilteredContainer, renderSubcontainer, renderFilteredSubcontainer,
  renderContainerContents, renderFilteredContainerContents, hasActiveContentFilter, isFilterContextActive,
  shouldExpandContainerForActiveFilter, contentFilterSignature, ensureFilterViewCollapseState, getFilterViewCollapsed,
  toggleFilterViewCollapsed, containerTitleMatchesSearch, containerHasVisibleFilterResult, getContainerFilterResult,
  isItemRemovedFromActiveLayout, isItemPacked, getContainerItemIdsDeep, isContainerPacked,
  startInlineItemTitleEdit, togglePacked, unpackAllItems, renderItemCard,
  renderItemPhoto, photoGalleryBindingOptions, bindPackingEvents, isCoarsePointerInteraction,
  needsHoldToDrag, getPackingDragController, bindRootColumnDrag, bindPointerPackingDrag,
  preventDragContextMenu, getTouchPoint, isHoldDragInput, markDragPending,
  clearDragPending, vibrateDragStart, isBlockedDropzone, getEntryAfterPointer,
  placePlaceholder, getPlaceholderItemIndex, getPlaceholderContainerIndex, isOriginalItemPosition,
  isOriginalContainerPosition, cleanupDropState, removeDropzoneDragOver, markDropzoneDragOver,
  getPackingScrollHost, syncFixedScrollbarVisibility, updateFixedScrollbarThumb, scheduleFixedScrollbarRefresh,
  renderItems, renderSharedItemsView, renderListItem, isCatalogSelectionClick,
  isCatalogActionTarget, hasCatalogSelection, clearCatalogSelection, resetCatalogSelectionOnPlainClick,
  bindItemCatalogSelection, bindRootCatalogSelection, catalogItemActionIds, catalogRootActionIds,
  selectionNames, formatRootContainerCount, copyCatalogItems, confirmDeleteCatalogItems,
  copyCatalogRootContainers, confirmDeleteCatalogRootContainers, renderBags, renderSharedBagsView,
  renderSettings, renderSharedSettingsView, renderLayoutEditor, bindLayoutEditor,
  isLayoutDrag, getLayoutRowAfterPointer, getLayoutPlaceholderIndex, cleanupLayoutDropState,
  bindSettingsPointerDrag, showToast, renderRootContainersEditor, renderRootContainerCard,
  bindRootContainersEditor, renderDictionary, dictionaryRenameSideEffects, bindDictionary,
  renameDictionaryEntry, moveItem, moveContainer, moveItemIntoContainerTop,
  moveContainerIntoContainerTop, createGroupFromItems, removeItemFromActiveLayout, getItemContainerIdInLayout,
  getLayoutContainerIdSet, getLayoutItemIdSet, ensureLayoutContainerPlacement, addItemToLayoutArrangement,
  placeExistingItemInLayout, moveItemInLayoutArrangement, moveContainerInLayoutArrangement, confirmRemoveItemFromActiveLayout,
  confirmRemoveEditingItemFromActiveLayout, confirmDeleteEditingItemForever, confirmDeleteItem, describeVisibleItemLayoutPlacements,
  deleteItemPhotos, deleteItemForever, copyItem, copyRootContainer,
  duplicateRootContainer, makeContainerCopyName, confirmDeleteEditingRootContainerForever, confirmDeleteRootContainer,
  deleteRootContainer, removeRootContainerFromActiveLayout, removeContainerFromLayoutOnly, deleteUnusedLayoutContainerEntity,
  deleteContainerPhotos, makeItemCopyName, touchLayoutsReferencingItem, cleanupEmptyContainers,
  getColumnPlaceholderIndex, isOriginalRootColumnPosition, moveRootColumn, openRootContainerDialog,
  fillRootContainerLocationSelect, openItemDialog, openSharedReadonlyItemDialog, setSharedReadonlyItemDialog,
  resetSharedReadonlyItemDialog, copySharedItemFromReadonlyDialog, uniqueLayoutName, uniquePublishedTemplateName,
  canManageLayout, canManageActiveLayout, languageSelectEntries, createLayoutCopyFromSource,
  templateCopyRootSnapshots, templateCopySourceScore, loadPublishedTemplateCopySource, createTemplateCopyFromSource,
  layoutCreateCopySourceOptions, isLayoutCreateTemplateLayoutMode, resolveLayoutCreateCopySource, resolveLayoutCreateTemplateCopySource,
  resolveLayoutCreateTemplateCopyLayout, createPrivateLayoutFromTemplateSource, createAndPublishTemplateCopy, openLayoutDialog,
  updateLayoutCopyVisibility, layoutCreateSelectedSourceName, canReplaceLayoutCreateNameSuggestion, updateLayoutCreateNameSuggestion,
  createNewPublicTemplateLayout, saveNewLayout, openLayoutEditDialog, publicTemplateDeleteBlockReasonForLayout,
  updateLayoutEditDeleteButton, updateLayoutEditSaveState, handleLayoutEditFormSubmit, requestCloseLayoutEditDialog, handleLayoutEditDialogClose,
  toggleLayoutOrderPanel, handleLayoutOrderFormSubmit, requestCloseLayoutOrderDialog, handleLayoutOrderListClick, handleLayoutOrderDragStart,
  handleLayoutOrderDragOver, handleLayoutOrderDragLeave, handleLayoutOrderDrop, handleLayoutOrderDragEnd,
  handleLayoutOrderDialogClose, bindLayoutOrderDragControls,
  canDeleteManagedLayout, saveEditedLayout, confirmDeleteEditedLayout,
  confirmDeleteEditableLayout, confirmDeleteManagedPublicLayout, deletePublishedSharedTemplate, deletePublishedDemoTemplate,
  deletePublishedTemplate, shouldDeletePublishedTemplateForLayout, deleteManagedPublicLayout, userEditableLayouts,
  canDeleteActiveLayout, deleteActiveLayout, handleRootContainerFormSubmit, handleItemFormSubmit,
  requestCloseItemDialog, requestCloseRootContainerDialog, getItemDialogSnapshot, getItemDialogPhotoSnapshot,
  handleItemPhotoInputChange, removeItemDialogPhoto, setItemDialogPhotoPrimary, bindPhotoOrderDialogControls, bindPhotoClipboardControls, resetItemDialogPhotoDraft,
  cleanupUnsavedItemDialogPhotoDraft, updateItemDialogPhotoPreview, updateItemDialogPhotoPrimaryButton, setItemDialogPhotoStatus,
  revokeObjectUrls, getRootContainerDialogPhotoSnapshot, handleRootContainerPhotoInputChange, removeRootContainerDialogPhoto,
  confirmDialogPhotoDelete, uploadItemDialogDraftPhotos, uploadRootContainerDialogDraftPhotos, uploadDialogDraftPhotos,
  entityHasPhoto, photoIdentitySet, photoIdentityMatches, setRootContainerDialogPhotoPrimary,
  resetRootContainerDialogPhotoDraft, cleanupUnsavedRootContainerDialogPhotoDraft, updateRootContainerDialogPhotoPreview, updateRootContainerDialogPhotoPrimaryButton,
  updatePhotoPrimaryButton, setRootContainerDialogPhotoStatus, readItemDialogQuantity, normalizeItemQuantityInput,
  changeItemDialogQuantity, updateItemQuantityUi, getRootContainerDialogSnapshot, updateItemDialogSaveState,
  hasSavableItemDialogChanges, updateRootContainerDialogSaveState, updateModalSaveButton, hasSavableRootContainerDialogChanges,
  saveRootContainerDialog, saveDialogItem, applyItemDialogPhotoDraft, applyRootContainerDialogPhotoDraft,
  applyRootContainerDialogParent, normalizeContainerParentInsertIndex, getActiveLayoutItems, getItemsForItemsView,
  getItemsForActiveCatalog, itemCreatedTime, getItemsUsageCounts, isScopedCatalogLayout,
  getPublicLayoutRecordIdsForState, isPublicCatalogItemRecord, isPublicCatalogContainerRecord, isPrivateCatalogItemRecord,
  isPrivateCatalogContainerRecord, isItemInActiveCatalog, markRecordActivePublicCatalog, isItemAwayFromHomeAndBike,
  isItemWithoutWeight, isItemInActiveLayout, getVisibleLayoutRootIds, matchesFilters,
  matchesItemsViewFilters, matchesBaseFilters, matchesCollectionFilter, matchesItemFieldsFilter,
  getDescendantContainerIds, getRootContainers, getRootContainersForSettings, matchesRootContainerFieldsFilter,
  matchesContainerFieldsFilter, isRootContainerInActiveLayout, isRootContainerForEditor, isRootContainerInActiveCatalog,
  containerCreatedTime, containerPath, layoutContainerPath, containerWeight,
  itemQuantity, itemTotalWeight, openBackupDialog, setBackupStatus,
  fetchBackupPhotoBlob, buildCurrentBackupManifest, createBackupArchive, handleBackupFileSelected,
  backupLayoutRows, selectedBackupLayoutIds, summarizeSelectedBackupLayouts, renderBackupAnalysis,
  handleBackupSelectionChange, updateBackupSelectionSummary, resolveExistingBackupPhotos, prepareBackupPhotosForState,
  restoreSelectedBackupLayouts, restoreSelectedBackupAdminTemplates, restoreFullBackup, exportData, buildPrintableHtmlFromChoice,
  readRootContainerDialogDimensions, applyRootContainerDimensions
} = createAppTailControllers(appTailControllerDeps);

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
  isolateLinkedLayoutEntities(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  restorePrivateLayoutChoiceInState(state);
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

function isEnglishUi() {
  return normalizeUiLanguage(uiLanguage) === "en";
}

function localText(en, ru) {
  return isEnglishUi() ? en : ru;
}

function dictionaryValueLabel(value) {
  return value;
}

function dictionarySelectEntry(value) {
  return [value, dictionaryValueLabel(value)];
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
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    isPublicSyncContainer,
    isPublicSyncItem
  });
}

function ensureLayoutDictionaries(layout, sourceState = null) {
  if (!layout) return null;
  const source = sourceState || state;
  const pruneUnusedCustomDictionaries = isGuestDemoCopyLayoutRecord(layout) && !guestLayoutHasUserContentEdits(source, layout);
  return ensureLayoutDictionariesForState(layout, {
    sourceState: source,
    defaults: { locations, categories },
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    pruneUnusedCustomDictionaries
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
  const ownerValues = normalizeDictionaryValues(owner?.[type === "location" ? "locations" : "categories"]);
  return ownerValues;
}

function activeDictionaryList(type) {
  return dictionaryListForOwner(activeDictionaryOwner(), type === "location" ? "location" : "category");
}

function dictionaryOptionsForOwner(type, owner, { selected = [] } = {}) {
  return sortedDictionaryValues(
    dictionaryOptionsForUiValues(type, dictionaryListForOwner(owner, type), { selected }),
    dictionarySortModeForType(type)
  );
}

function dictionaryOptionsForUi(type, { selected = [] } = {}) {
  return sortedDictionaryValues(
    dictionaryOptionsForUiValues(type, activeDictionaryList(type), { selected }),
    dictionarySortModeForType(type)
  );
}

function dictionarySortModeForType(type) {
  return type === "location" ? dictionaryLocationSortMode : dictionaryCategorySortMode;
}

function setDictionarySortModeForType(type, value) {
  if (type === "location") dictionaryLocationSortMode = normalizeSortMode(value);
  else dictionaryCategorySortMode = normalizeSortMode(value);
}

function cycleDictionarySortMode(type) {
  const current = dictionarySortModeForType(type);
  setDictionarySortModeForType(type, current === "none" ? "asc" : current === "asc" ? "desc" : "none");
  saveUiSettings();
  render();
}

function sortedDictionaryValues(values, sortMode = "none") {
  return sortDictionaryValues(values, sortMode, uiLanguage || "ru");
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
  const layoutOwner = owner !== state && (isPublishedLayoutEditable(owner) || isGuestDemoCopyLayoutRecord(owner));
  if (layoutOwner) touchLayout(owner.id);
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
    : "Демо/публичная укладка только для чтения · создайте личную копию, чтобы сохранять изменения";
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
  const preserveLinkedSharedList = wasSharedView && shouldPreserveLinkedSharedListOnLanguageChange({
    isSharedListRoute: isSharedListLinkRoute(),
    linkedLayoutId: linkedSharedListLayout?.id,
    activeReadOnlyLayoutId: previousReadOnlyLayoutId
  });
  const sharedLanguageTarget = wasSharedView && !preserveLinkedSharedList
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
  if (wasSharedView && !preserveLinkedSharedList && !sharedLanguageTarget) {
    applyStaticTranslations();
    await openDemoLayoutFromSelect({ language: uiLanguage, remember: true });
    updateSyncUi();
    return;
  }
  applyStaticTranslations();
  render();
  if (isOfflineRememberedSession()) setOfflineRememberedLayoutLoadStatus();
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
  bindPhotoOrderDialogControls();
  bindPhotoClipboardControls();
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
  bindDialogBackdropClickGuard(refs.dialog, () => Boolean(
    runtime.itemDialogPhotoDraft &&
    photoDraftChanged(runtime.itemDialogPhotoDraft, runtime.editingItemId ? state.items?.[runtime.editingItemId] : { photos: [] })
  ));
  bindFilePickerDialogDismissGuard(refs.dialog, [refs.itemPhotoInput, refs.itemPhotoCameraInput]);
  bindDialogBackdropClickGuard(refs.rootContainerDialog, () => Boolean(
    runtime.rootContainerDialogPhotoDraft &&
    photoDraftChanged(runtime.rootContainerDialogPhotoDraft, runtime.editingRootContainerId ? state.containers?.[runtime.editingRootContainerId] : { photos: [] })
  ));
  bindFilePickerDialogDismissGuard(refs.rootContainerDialog, [refs.rootContainerPhotoInput, refs.rootContainerPhotoCameraInput]);
  refs.newLayoutBtn.addEventListener("click", () => {
    if (isSharedLayoutView()) {
      copySharedLayout(activeReadOnlyLayoutId());
      return;
    }
    openLayoutDialog();
  });
  refs.editLayoutBtn?.addEventListener("click", openLayoutEditDialog);
  refs.layoutEditDialog?.querySelector("form")?.addEventListener("input", updateLayoutEditSaveState);
  refs.layoutEditDialog?.querySelector("form")?.addEventListener("change", () => {
    updateLayoutEditDeleteButton(state.layouts?.[layoutEditTargetId]);
    updateLayoutEditSaveState();
  });
  refs.layoutEditDialog?.querySelector("form")?.addEventListener("submit", handleLayoutEditFormSubmit);
  refs.layoutEditDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestCloseLayoutEditDialog();
  });
  refs.layoutEditDialog?.addEventListener("close", handleLayoutEditDialogClose);
  refs.saveEditedLayoutBtn?.addEventListener("click", saveEditedLayout);
  refs.deleteEditedLayoutBtn?.addEventListener("click", confirmDeleteEditedLayout);
  refs.layoutOrderToggleBtn?.addEventListener("click", toggleLayoutOrderPanel);
  refs.layoutOrderDialog?.querySelector("form")?.addEventListener("submit", handleLayoutOrderFormSubmit);
  refs.layoutOrderList?.addEventListener("click", handleLayoutOrderListClick);
  refs.layoutOrderDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestCloseLayoutOrderDialog();
  });
  refs.layoutOrderDialog?.addEventListener("close", handleLayoutOrderDialogClose);
  bindLayoutOrderDragControls();
  refs.layoutCreateMode.addEventListener("change", updateLayoutCopyVisibility);
  refs.layoutTemplateKind?.addEventListener("change", updateLayoutCreateNameSuggestion);
  refs.layoutTemplateLanguage?.addEventListener("change", updateLayoutCreateNameSuggestion);
  refs.saveLayoutBtn.addEventListener("click", saveNewLayout);
  refs.layoutCopyFrom?.addEventListener("change", () => updateLayoutCreateNameSuggestion({ force: true }));
  refs.authBtn.addEventListener("click", handleAuthButton);
  document.querySelector("#signOutBtn")?.addEventListener("click", handleSignOutButton);
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
  refs.backupRestoreAdminBtn?.addEventListener("click", restoreSelectedBackupAdminTemplates);
  refs.backupRestoreFullBtn?.addEventListener("click", restoreFullBackup);
  refs.historySourceTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-source]");
    if (!button) return;
    activeHistorySource = button.dataset.historySource || "private";
    historyComparisonState = null;
    historyPageState = null;
    historyDetailCache.clear();
    selectedHistoryDetailRecordKey = "";
    refs.historyDetailDialog?.close();
    refreshHistoryDialog();
  });
  refs.historyDemoSelect?.addEventListener("change", () => {
    const target = selectedHistoryDemoTarget();
    if (target?.demoListId) activeDemoTemplateListId = target.demoListId;
    historyComparisonState = null;
    historyPageState = null;
    historyDetailCache.clear();
    selectedHistoryDetailRecordKey = "";
    refs.historyDetailDialog?.close();
    refreshHistoryDialog();
  });
  refs.historySharedSelect?.addEventListener("change", () => {
    historyComparisonState = null;
    historyPageState = null;
    historyDetailCache.clear();
    selectedHistoryDetailRecordKey = "";
    refs.historyDetailDialog?.close();
    refreshHistoryDialog();
  });
  refs.historyDetailRestoreBtn?.addEventListener("click", () => {
    if (selectedHistoryDetailRecordKey) restoreHistoryRecord(selectedHistoryDetailRecordKey);
  });
  bindLongPressTooltips({ root: refs.historyList });
  bindLongPressTooltips({ root: refs.historyDetailDialog });
  refs.historyList?.addEventListener("scroll", () => {
    const remaining = refs.historyList.scrollHeight - refs.historyList.scrollTop - refs.historyList.clientHeight;
    if (remaining < 160) loadMoreHistoryRecords();
  }, { passive: true });
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
      updateSyncUi("Connection restored · click “Sync” to check sign-in");
    }
  });
  window.addEventListener("offline", () => {
    const rememberedUser = rememberedOfflineUser(currentUser);
    currentUser = null;
    offlineRememberedUser = rememberedUser;
    appUnlocked = true;
    if (isExplicitlySignedOut() || !rememberedUser) {
      enterSignedOutPublicMode(localText("Offline · personal lists are hidden, local demo copy is open", "Офлайн · личные списки скрыты, открыта локальная демо-копия")).catch(() => {
        setActiveReadOnlyScope(DEMO_SHARED_LAYOUT_ID);
        render();
        updateSyncUi(localText("Offline · personal lists are hidden, demo/public template is open", "Офлайн · личные списки скрыты, открыт демо/публичный шаблон"));
      });
      return;
    }
    activateLocalStorageScope(userStorageScopeKey(rememberedUser));
    setActivePrivateScope();
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi(localText("Offline · local layout is available", "Офлайн · локальная укладка доступна"));
  });
  window.addEventListener("focus", handleWindowReturn);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) handleWindowReturn();
  });
  window.addEventListener("resize", () => {
    updateViewScopedControls();
    updateCompactStickyControls();
    scheduleFixedScrollbarRefresh();
    syncHistoryActionButtonTooltips(refs.historyDialog);
    syncHistoryActionButtonTooltips(refs.historyDetailDialog);
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
    setLayoutLoadStatus("loading", localText("Checking sign-in and personal layouts...", "Проверяем вход и личные укладки..."));
    renderGuestPublicDemoPreviewDuringAuthCheck();
    updateSyncUi(localText("Checking sign-in...", "Проверяем вход..."));
  }
  startRemoteStateWatcher();
  const publicIndexRefresh = refreshPublicSharedTemplates({ renderAfter: true }).catch(() => null);
  if (sharedListId) {
    await publicIndexRefresh;
    openSharedListFromLink(sharedListId, sharedLayoutIdFromLocation());
  } else if (isForcedOffline()) {
    publicIndexRefresh.catch(() => null);
    if (signedOut) enterSignedOutPublicMode(localText("Signed out · personal lists are hidden, local demo copy is open", "Вы вышли · личные списки скрыты, открыта локальная демо-копия"));
    else unlockOfflineState(localText("Forced offline · local layout is available", "Принудительный офлайн · локальная укладка доступна"));
  } else if (offlineNow) {
    publicIndexRefresh.catch(() => null);
    if (!activateOfflineRememberedSession(localText("Offline · local copy of personal layouts is open", "Офлайн · открыта локальная копия личных укладок"))) {
      enterSignedOutPublicMode(localText("Offline · sign-in is not confirmed, local demo copy is open", "Офлайн · вход не подтверждён, открыта локальная демо-копия"));
    }
  } else {
    publicIndexRefresh.catch(() => null);
    checkAuthAndLoad();
  }
}

function createEmptyUserState() {
  return createBlankBikePackingState();
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
    isolateLinkedLayoutEntities(initial);
    normalizeItemCategories(initial);
    migrateContainerOrder(initial);
    restorePrivateLayoutChoiceInState(initial);
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
    isolateLinkedLayoutEntities(parsed);
    normalizeItemCategories(parsed);
    migrateContainerOrder(parsed);
    restorePrivateLayoutChoiceInState(parsed);
    applyLayoutArrangement(parsed.activeLayoutId, parsed);
    applyDefaultCollapsedContainers(parsed);
    if (isSuspiciousEmptyPackingState(parsed)) {
      const fallback = createEmptyUserState();
      ensureItemDisplayModeState(fallback);
      normalizeContainerFields(fallback);
      normalizeItemFields(fallback);
      repairContainerMembershipFromItemLinks(fallback);
      normalizeLayoutFields(fallback);
      isolateLinkedLayoutEntities(fallback);
      normalizeItemCategories(fallback);
      migrateContainerOrder(fallback);
      restorePrivateLayoutChoiceInState(fallback);
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
    return normalizeRemoteState(parsed, { repairCatalog: false });
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
    dictionaryLocationSortMode,
    dictionaryCategorySortMode,
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
    refs.visualStyleMenuBtn.textContent = packingVisualStylePanelVisible ? t("menu.hideViewOptions") : t("menu.viewOptions");
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

function setOfflineRememberedLayoutLoadStatus() {
  setLayoutLoadStatus("warning", localText(
    "Local copy: server sign-in is not confirmed",
    "Локальная копия: вход на сервере не подтверждён"
  ));
}

function setLayoutLoadProgress({ loaded = 0, total = null, prefix = localText("Loading personal layouts", "Загружаем личные укладки") } = {}) {
  setLayoutLoadStatus("loading", formatLayoutLoadProgress({ loaded, total, prefix, language: uiLanguage }));
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

function setLoadedRemoteListProgress(record, prefix = localText("Personal layouts received", "Личные укладки получены"), { final = false } = {}) {
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
  setLayoutLoadStatus("success", () => formatPersonalLayoutsLoadedStatus(privateLayoutCount(), uiLanguage));
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

function normalizePrivateLayoutChoiceForStateRestore(choice) {
  return String(choice || "").trim();
}

function isPrivateLayoutChoiceForStateRestore(choice) {
  return isPrivateLayoutChoiceValue(choice, {
    normalizeChoice: normalizePrivateLayoutChoiceForStateRestore,
    isDemoLayoutChoice,
    templateDraftLayoutId
  });
}

function restorePrivateLayoutChoiceInState(targetState) {
  const isPrivateUserLayoutIdForTarget = (choice) => {
    const layout = targetState?.layouts?.[choice];
    return Boolean(layout && !layout.adminDemo && !layout.adminSharedSourceId && !layout?.[GUEST_DEMO_COPY_FLAG]);
  };
  const storedChoice = loadStoredActiveLayoutChoice({
    storageKey: ACTIVE_LAYOUT_CHOICE_KEY,
    scopedKey: scopedLocalStorageKey,
    normalizeChoice: normalizePrivateLayoutChoiceForStateRestore
  });
  const storedPrivateChoice = loadStoredActivePrivateLayoutChoice({
    storageKey: ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
    scopedKey: scopedLocalStorageKey,
    normalizeChoice: normalizePrivateLayoutChoiceForStateRestore,
    isPrivateChoice: isPrivateLayoutChoiceForStateRestore,
    isPrivateUserLayoutId: isPrivateUserLayoutIdForTarget
  });
  const layoutId = resolveStoredPrivateLayoutChoiceForState(targetState, {
    storedChoice,
    storedPrivateChoice,
    normalizeChoice: normalizePrivateLayoutChoiceForStateRestore,
    isPrivateChoice: isPrivateLayoutChoiceForStateRestore,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG
  });
  if (!layoutId || targetState.activeLayoutId === layoutId) return false;
  targetState.activeLayoutId = layoutId;
  return true;
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

function restorableStoredPrivateLayoutChoiceId() {
  return resolveStoredPrivateLayoutChoice({
    activeLayoutId: "",
    storedChoice: loadActiveLayoutChoice(),
    storedPrivateChoice: loadActivePrivateLayoutChoice(),
    normalizeChoice: normalizeActiveLayoutChoice,
    isPrivateChoice: isPrivateLayoutChoice,
    isPrivateUserLayoutId
  });
}

function storedPrivateLayoutChoiceRef() {
  const layoutId = restorableStoredPrivateLayoutChoiceId();
  const layout = state.layouts?.[layoutId];
  if (!layout) return null;
  return {
    id: layoutId,
    name: layout.name || "",
    allowEmpty: true
  };
}

function applyPreferredPrivateLayoutChoice(preferredLayout = null, { remember = true } = {}) {
  const layoutId = resolvePreferredLayoutId(state, preferredLayout?.id, preferredLayout?.name, {
    allowEmptyPreferred: Boolean(preferredLayout?.allowEmpty)
  });
  if (!layoutId || !isPrivateUserLayoutId(layoutId)) return false;
  if (state.activeLayoutId !== layoutId) {
    state.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
  }
  if (remember) saveActiveLayoutChoice(layoutId);
  return true;
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
  if (meta.itemCount != null) syncMeta.itemCount = meta.itemCount;
  if (meta.containerCount != null) syncMeta.containerCount = meta.containerCount;
  if (meta.layoutCount != null) syncMeta.layoutCount = meta.layoutCount;
  if (meta.payloadSize != null) syncMeta.payloadSize = meta.payloadSize;
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

function saveState({ captureArrangement = true, sync = true } = {}) {
  if (captureArrangement) captureActiveLayoutArrangement();
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
  if (sync && !applyingRemoteState && isAdminPublicEditScope(modeState) && isAdminEditablePublishedLayout()) {
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

function saveLayoutMutation(layoutId = state.activeLayoutId, { publishDelay = 900, publishNow = false, forcePublic = false } = {}) {
  solidifyTemplateDraftLayout(layoutId);
  const targetIsPublic = (forcePublic || isAdminPublicEditScope(modeState)) && isAdminEditablePublishedLayout(layoutId);
  saveState({ sync: !targetIsPublic });
  if (targetIsPublic) {
    if (publishNow) {
      cancelPublishedLayoutSave(layoutId);
      return savePublishedLayoutRecord(layoutId);
    }
    schedulePublishedLayoutSave(layoutId, publishDelay);
  }
  return null;
}

function hasLocalSyncChanges(baseState = loadBaseState()) {
  if (!baseState) return true;
  return !sameJson(serializeState({ forSync: true }), cloneStateForSync(baseState, { forSync: true }));
}

function recoverUnsyncedLocalChanges(reason = "local-dirty-recovery") {
  if (!shouldRecoverUnsyncedLocalChanges({
    applyingRemoteState,
    currentUser,
    canUsePrivateState: canUsePrivateState(),
    readOnlyStateScope: isReadOnlyStateScope(),
    adminPublicEditScope: isAdminPublicEditScope(modeState),
    syncMeta,
    hasLocalSyncChanges
  })) {
    return false;
  }
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  updateSyncUi();
  console.info("[bike-packing] Recovered unsynced local changes", { reason });
  scheduleRemoteSave();
  return true;
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
  const stateBeforePlaceholderRepair = clone(state);
  const removedPlaceholderIds = removeLegacyGuestImportPlaceholders(state);
  if (removedPlaceholderIds.length) {
    saveRecoverySnapshot("before-guest-placeholder-repair", stateBeforePlaceholderRepair);
  }
  const changed = repairMojibakeLayoutNames(state, {
    fallbackNameForLayout: privateMojibakeLayoutFallbackName
  }) || removedPlaceholderIds.length > 0;
  if (changed) saveState({ sync });
  return changed;
}

function guestLocalLayoutCandidate(sourceState = state) {
  return guestLocalLayoutCandidateFromState(sourceState, {
    cloneStateForSync,
    cloneValue: clone,
    createEmptyUserState,
    fallbackName: GUEST_LAYOUT_FALLBACK_NAME,
    fallbackNameForLayout: guestLayoutImportFallbackName,
    snapshotsEqual: sameJson
  });
}

function shouldCaptureGuestLocalLayoutCandidate(previousScope, nextScope, sourceState = state) {
  if (!canImportGuestLayoutsForAuthenticatedUser(currentUser)) return false;
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
  if (!canImportGuestLayoutsForAuthenticatedUser(currentUser)) return null;
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
  return isReadOnlyStateScope() || isAdminPublicEditScope(modeState);
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
    normalizeDictionariesForSync: (targetState) => normalizePrivateDictionariesForSyncState(targetState, {
      locations,
      categories,
      getLayoutContainerIdSet: getLayoutContainerIdSetForState,
      getLayoutItemIdSet: getLayoutItemIdSetForState
    }),
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

function legacyComparableTopLevelDiffKeys(baseState, localState, entitySync = null) {
  return legacyComparableTopLevelDiffKeysForSync(baseState, localState, entitySync, entitySyncStateDeps());
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
    historyAction: currentHistoryActionContext(),
    syncDevice,
    syncMeta
  };
}

function currentHistoryActionContext() {
  const afterState = serializeState({ forSync: true });
  return buildHistoryActionContext({
    beforeState: loadBaseState() || createEmptyUserState(),
    afterState,
    changedAt: syncMeta.localUpdatedAt,
    deviceId: syncDevice.id,
    getLayoutContainerIds: getLayoutContainerIdSetForState,
    getLayoutItemIds: getLayoutItemIdSetForState
  });
}

async function syncChangedEntityType(type, { baseState = null, forceOverwrite = false, listId = "" } = {}) {
  const config = ENTITY_SYNC_CONFIG[type];
  if (!config) return { type, attempted: false, skipped: true, safeForLegacyCompare: true };
  if (isReadOnlyBikePackingContext()) return { attempted: false, skipped: true, readOnly: true };
  const entries = buildChangedEntitySyncEntries(type, baseState, state, { forceOverwrite });
  const changedIds = entries.filter((entry) => !entry.deleted).map((entry) => entry.id);
  const deletedIds = entries.filter((entry) => entry.deleted).map((entry) => entry.id);
  if (!entries.length) return { type, attempted: false, skipped: false, entryCount: 0, changedIds, deletedIds, safeForLegacyCompare: true };
  if (isEntitySyncTypeUnavailable(type) || personalListApiUnavailable) {
    return { type, attempted: false, skipped: true, unavailable: true, entryCount: entries.length, changedIds, deletedIds, safeForLegacyCompare: false };
  }
  const targetListId = listId || await ensureCurrentPackingListId();
  if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
  if (isReadOnlyBikePackingContext()) return { attempted: false, skipped: true, readOnly: true, changedIds, deletedIds };
  try {
    const results = await syncEntityBatchesSequentially(splitEntitySyncEntries(type, entries), {
      sendBatch: (batch) => syncEntityBatchWithRevisionRetry(batch, {
        sendBatch: (currentBatch) => apiFetch(`/bike-packing/lists/${encodeURIComponent(targetListId)}/${config.endpoint}/sync`, {
          method: "POST",
          timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
          body: JSON.stringify(buildEntitySyncBody(type, currentBatch, { forceOverwrite }))
        }),
        refreshRevision: (error) => {
          const conflictRecord = error.data?.record || error.data?.currentRecord || error.data || null;
          const conflictMeta = stateIntegrityMetaFromResponse(conflictRecord, error.data);
          const conflictUpdatedAt = remoteUpdatedAt(conflictRecord) || error.data?.serverUpdatedAt || "";
          if (conflictMeta?.stateRevision == null && !conflictUpdatedAt) return false;
          rememberConflictRemoteMeta(conflictRecord, conflictMeta, conflictUpdatedAt);
          return true;
        }
      }),
      onBatchResult: (data) => {
        const batchMeta = stateIntegrityMetaFromResponse(data);
        if (data?.serverUpdatedAt) syncMeta.serverUpdatedAt = data.serverUpdatedAt;
        rememberRemoteIntegrityMeta(batchMeta);
        saveSyncMeta();
      }
    });
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
      changedIds,
      deletedIds,
      safeForLegacyCompare: true,
      serverUpdatedAt: [...results].reverse().find((data) => data?.serverUpdatedAt)?.serverUpdatedAt || integrityMeta?.updatedAt || nowIso(),
      integrityMeta,
      upserted: results.flatMap((data) => Array.isArray(data?.upserted) ? data.upserted : []),
      deleted: results.flatMap((data) => Array.isArray(data?.deleted) ? data.deleted : [])
    };
  } catch (error) {
    if (isEntitySyncUnavailableError(error, type) || isNetworkError(error)) {
      markEntitySyncTypeUnavailable(type);
      return { type, attempted: false, skipped: true, unavailable: true, entryCount: entries.length, changedIds, deletedIds, safeForLegacyCompare: false };
    }
    throw error;
  }
}

function isEntitySyncTypeUnavailable(type) {
  if (type === "item") return itemEntitySyncUnavailable;
  if (type === "container") return containerEntitySyncUnavailable;
  if (type === "layout") return layoutEntitySyncUnavailable;
  if (type === "dictionary") return dictionaryEntitySyncUnavailable;
  return true;
}

function markEntitySyncTypeUnavailable(type) {
  if (type === "item") itemEntitySyncUnavailable = true;
  else if (type === "container") containerEntitySyncUnavailable = true;
  else if (type === "layout") layoutEntitySyncUnavailable = true;
  else if (type === "dictionary") dictionaryEntitySyncUnavailable = true;
}

async function syncChangedBikePackingEntities({ baseState = null, forceOverwrite = false } = {}) {
  let listId = currentPackingListId || "";
  const item = await syncChangedEntityType("item", { baseState, forceOverwrite, listId });
  rememberEntitySyncResultMeta(item, { rememberRemoteIntegrityMeta, syncMeta });
  if (!listId && currentPackingListId) listId = currentPackingListId;
  const container = await syncChangedEntityType("container", { baseState, forceOverwrite, listId });
  rememberEntitySyncResultMeta(container, { rememberRemoteIntegrityMeta, syncMeta });
  if (!listId && currentPackingListId) listId = currentPackingListId;
  const layout = await syncChangedEntityType("layout", { baseState, forceOverwrite, listId });
  rememberEntitySyncResultMeta(layout, { rememberRemoteIntegrityMeta, syncMeta });
  if (!listId && currentPackingListId) listId = currentPackingListId;
  const dictionary = await syncChangedEntityType("dictionary", { baseState, forceOverwrite, listId });
  rememberEntitySyncResultMeta(dictionary, { rememberRemoteIntegrityMeta, syncMeta });
  const results = [item, container, layout, dictionary];
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
    dictionary,
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
  try {
    const result = await syncCreatedLayoutEntityTypes({
      assertConfirmed: assertEntitySyncConfirmed,
      baseState,
      expectedContainerIds,
      expectedItemIds,
      getCurrentListId: () => currentPackingListId,
      layoutId,
      listId: currentPackingListId || "",
      refreshRevisionFromConflict: async (error) => {
        const conflictRecord = error.data?.record || error.data?.currentRecord || error.data || null;
        const conflictMeta = stateIntegrityMetaFromResponse(conflictRecord, error.data);
        const conflictUpdatedAt = remoteUpdatedAt(conflictRecord) || error.data?.serverUpdatedAt || "";
        if (conflictMeta?.stateRevision == null && !conflictUpdatedAt) return false;
        rememberConflictRemoteMeta(conflictRecord, conflictMeta, conflictUpdatedAt);
        return true;
      },
      rememberResult: (entityResult) => rememberEntitySyncResultMeta(entityResult, { rememberRemoteIntegrityMeta, syncMeta }),
      syncEntityType: syncChangedEntityType
    });
    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = result.serverUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt || nowIso();
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(result.integrityMeta);
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    updateSyncUi();
  } catch (error) {
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
    saveSyncMeta();
    updateSyncUi(localText(
      `Could not finish saving the layout copy: ${createdLayoutSyncErrorText(error, "en")} · sync will retry automatically`,
      `Не удалось завершить сохранение копии укладки: ${createdLayoutSyncErrorText(error, "ru")} · синхронизация повторится автоматически`
    ));
    scheduleRemoteSave();
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
function normalizeRemoteState(payload, { repairCatalog = true } = {}) {
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
  const baseBeforeCatalogRepair = repairCatalog ? JSON.parse(JSON.stringify(normalized)) : null;
  const catalogRepairReport = repairCatalog
    ? isolateLinkedLayoutEntities(normalized)
    : { mergedContainers: 0, mergedItems: 0 };
  rememberLayoutEntityRepairBaseState(normalized, baseBeforeCatalogRepair, catalogRepairReport);
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
  isolateLinkedLayoutEntities(normalized);
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
  isolateLinkedLayoutEntities(state);
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
  const catalogRepairBase = layoutEntityRepairBaseState(remoteState);
  replaceState(remoteState);
  removePublicLayoutDrafts();
  setActivePrivateScope();
  rememberPrivateServerLayoutChoice({ preferStored: !preferredLayoutId });
  saveBaseState(catalogRepairBase || serializeState({ forSync: true }));
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = updatedAt || null;
  syncMeta.localUpdatedAt = updatedAt || null;
  syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
  if (catalogRepairBase && hasLocalSyncChanges(catalogRepairBase)) {
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
  }
  rememberRemoteIntegrityMeta(integrityMeta);
  syncMeta.cacheIntegrityVersion = STARTUP_CACHE_INTEGRITY_VERSION;
  rememberCurrentSyncAccount();
  saveSyncMeta();
  repairPrivateMojibakeLayoutNames();
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  setPersonalLayoutsLoadedStatus();
  if (catalogRepairBase && syncMeta.dirty) {
    updateSyncUi("Каталог очищен от технических дублей · синхронизирую...");
    scheduleRemoteSave();
  }
  updateSyncUi();
  return true;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(a, b) {
  return snapshotsEqual(a ?? null, b ?? null);
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

function activateOfflineRememberedSession(message = localText("Local copy of personal layouts · sign in to sync", "Локальная копия личных укладок · войдите для синхронизации")) {
  const rememberedUser = rememberedOfflineUser(offlineRememberedUser);
  if (!rememberedUser) return false;
  currentUser = null;
  offlineRememberedUser = rememberedUser;
  appUnlocked = true;
  activateLocalStorageScope(rememberedUser.scopeKey || userStorageScopeKey(rememberedUser));
  setActivePrivateScope();
  setOfflineRememberedLayoutLoadStatus();
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
  if (!metaKey && localStorageScopeKey === userStorageScopeKey(currentUser)) return true;
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
    isCurrentPrivateLayout: () => isPrivateUserLayoutId(state.activeLayoutId),
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

async function uploadEntityPhoto(listId, entity, photo, entityType = "item", options = {}) {
  return uploadEntityPhotoToPath(`/bike-packing/lists/${encodeURIComponent(listId)}/photos`, listId, entity, photo, entityType, options);
}

async function uploadPublishedEntityPhoto(layoutId, entity, photo, entityType = "item", options = {}) {
  const request = publishedPhotoUploadRequest(state.layouts?.[layoutId], {
    demoAdminPathForPublicListId,
    publicListIdForPublishedTarget,
    publishedLayoutTarget,
    uiLanguage
  });
  if (!request) return false;
  return uploadEntityPhotoToPath(request.path, request.listId, entity, photo, entityType, options);
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
      const uploaded = await uploadEntityPhotoToPath(path, listId, entry.entity, entry.photo, entry.entityType, {
        dropMissingRemotePhoto: true
      });
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

async function uploadEntityPhotoToPath(path, listId, entity, photo, entityType = "item", {
  dropMissingRemotePhoto = false,
  onPhotoProgress = null,
  retryTemporaryUploadFailure = true
} = {}) {
  return uploadPhotoToPath({
    path,
    listId,
    entity,
    photo,
    entityType,
    dropMissingRemotePhoto,
    onPhotoProgress,
    retryTemporaryUploadFailure,
    apiFetch,
    apiUploadFormData,
    getCachedPhoto,
    markEntityChanged: (targetEntity, targetType, updatedAt) => {
      if (targetType === "container") touchContainer(targetEntity.id, updatedAt);
      else touchItem(targetEntity.id, updatedAt);
    },
    persistStateSnapshot: () => persistStateSnapshot(state),
    scheduleProgressRender: schedulePhotoUploadProgressRender
  });
}

function schedulePhotoUploadProgressRender() {
  if (photoUploadProgressRenderFrame) return;
  photoUploadProgressRenderFrame = requestAnimationFrame(() => {
    photoUploadProgressRenderFrame = null;
    renderPreservingPackingScroll();
  });
}

async function deleteRemotePhotoIfPossible(entityId, photo, entityType = "item") {
  if (!currentUser || isForcedOffline() || !photo?.id) return;
  if (isAdminEditablePublishedLayout(getPublishedEditLayoutId())) return;
  if (isReadOnlyBikePackingContext()) return;
  if (hasRemotePhotoUrl(photo) && !photoRecordIdMatchesRemoteSource(photo)) return;
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
  return ensurePersonalListId({
    chooseDefaultList: chooseDefaultPackingList,
    clearCurrentListId: () => saveActivePackingListId(""),
    createList: () => apiFetch("/bike-packing/lists", {
      method: "POST",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify({
        ...buildListSaveBody({ forceOverwrite: true }),
        title: localText("My packing lists", "Мои укладки")
      })
    }),
    fetchLists: () => apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS }),
    getCurrentListId: () => currentPackingListId,
    isPublicTemplateListId,
    missingListMessage: localText("Personal list could not be created.", "Не удалось создать личный список укладок."),
    normalizeLists: normalizePackingListsResponse,
    recordId: remoteRecordId,
    rememberRecord: rememberCurrentPackingListRecord,
    onResolved: (record, data) => {
      const updatedAt = remoteUpdatedAt(record);
      rememberRemoteIntegrityMeta(record, data);
      syncMeta.serverUpdatedAt = updatedAt || syncMeta.serverUpdatedAt;
      saveSyncMeta();
    }
  });
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
      applyPreferredPrivateLayoutChoice,
      checkAdminApiCompatibility,
      clearOfflineRememberedSession,
      currentPrivateLayoutRef: preferredCurrentLayoutRef,
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
      setExplicitlySignedOut,
      setLayoutLoadStatus,
      setPersonalLayoutsLoadedStatus,
      shouldKeepCurrentReadonlyDemoAfterAuthCheck,
      storedPrivateLayoutChoiceRef,
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
  openAuthDialog();
}

async function handleSignOutButton() {
  if (isForcedOffline()) {
    showToast("Сначала выключите офлайн-режим в меню.", "error");
    return;
  }
  if (!currentUser && !isOfflineRememberedSession()) {
    openAuthDialog();
    return;
  }
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
  await enterSignedOutPublicMode("Signed out · personal lists are hidden, local demo copy is open");
  showToast("Вы вышли. Личные списки скрыты; войдите снова, чтобы открыть их.", "success");
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
    activateOfflineRememberedSession(localText("Forced offline · local layout is available", "Принудительный офлайн · локальная укладка доступна"));
    updateSyncUi(localText("Forced offline · local layout is available", "Принудительный офлайн · локальная укладка доступна"));
    showToast(localText("Offline mode is on. The API will not be used.", "Офлайн-режим включён. API не будет использоваться."), "success");
    return;
  }
  clearOfflineRememberedSession();
  updateSyncUi(localText("Offline mode is off · checking sign-in...", "Офлайн-режим выключен · проверяем вход..."));
  showToast(localText("Offline mode is off. Sync is available.", "Офлайн-режим выключен. Синхронизация доступна."), "success");
  await checkAuthAndLoad();
}

function openAuthDialog() {
  refs.authEmail.value = getSavedAuthEmail();
  refs.authDialogStatus.textContent = "";
  refs.authDialogStatus.className = "dialog-status";
  const authTitle = refs.authDialog?.querySelector("h2");
  if (authTitle) authTitle.textContent = localText("Sign in by link", "Вход по ссылке");
  const authCloseBtn = refs.authDialog?.querySelector(".ghost");
  if (authCloseBtn) authCloseBtn.textContent = localText("Close", "Закрыть");
  const authIconCloseBtn = refs.authDialog?.querySelector(".icon-button");
  if (authIconCloseBtn) authIconCloseBtn.setAttribute("aria-label", localText("Close", "Закрыть"));
  refs.authSubmitBtn.disabled = false;
  refs.authSubmitBtn.textContent = localText("Send link", "Отправить ссылку");
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
    refs.authDialogStatus.textContent = localText(
      "Offline mode is on. Turn it off in the menu to sign in.",
      "Включён офлайн-режим. Отключите его в меню, чтобы войти."
    );
    updateSyncUi(localText("Forced offline · sign-in is disabled", "Принудительный офлайн · вход отключён"));
    return;
  }
  const email = refs.authEmail.value.trim();
  if (!email) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = localText(
      "Enter the email address to send the link to.",
      "Введите email, на который отправить ссылку."
    );
    refs.authEmail.focus();
    return;
  }
  try {
    refs.authSubmitBtn.disabled = true;
    refs.authDialogStatus.className = "dialog-status";
    refs.authDialogStatus.textContent = localText("Sending link...", "Отправляем ссылку...");
    updateSyncUi(localText("Sending sign-in link...", "Отправляем ссылку для входа..."));
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
    refs.authDialogStatus.textContent = localText(
      "Link sent. Open the email on this device, then return here.",
      "Ссылка отправлена. Откройте письмо на этом устройстве, затем вернитесь сюда."
    );
    refs.authSubmitBtn.textContent = localText("Send again", "Отправить ещё раз");
    updateSyncUi(localText(
      "Link sent · open the email and follow the magic link",
      "Ссылка отправлена · откройте письмо и перейдите по ссылке"
    ));
  } catch (error) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = localText(
      `Could not send link: ${error.message}`,
      `Не удалось отправить ссылку: ${error.message}`
    );
    updateSyncUi(localText(
      `Could not send link: ${error.message}`,
      `Не удалось отправить ссылку: ${error.message}`
    ));
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
      checkRemoteStateFreshness,
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

function buildListSaveBody({ forceOverwrite = false } = {}) {
  return buildListSaveBodyForSync({
    forceOverwrite,
    historyAction: currentHistoryActionContext(),
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
  const listRecord = await fetchRemoteListStateRecord();
  return { record: listRecord, source: "list" };
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

async function fetchRemoteListChangesRecord(listId, sinceRevision) {
  const params = new URLSearchParams({ sinceRevision: String(sinceRevision) });
  return apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/changes?${params.toString()}`, {
    timeoutMs: API_TIMEOUT_MS,
    silentErrors: true
  });
}

async function tryApplyRemoteEntityChanges(listId, freshness, { preferredLayout = null } = {}) {
  const request = canRequestEntityChanges({ syncMeta, freshness, listId });
  if (!request.ok) return { applied: false, fallbackRequired: true, reason: request.reason };
  const data = await fetchRemoteListChangesRecord(listId, request.sinceRevision);
  const result = applyEntityChangesToState(serializeState({ forSync: true }), data);
  if (!result.applied || !result.state) return result;
  const meta = {
    ...freshness,
    ...result.meta,
    stateRevision: result.meta.stateRevision ?? freshness.stateRevision ?? null,
    updatedAt: result.meta.updatedAt || freshness.updatedAt || freshness.serverUpdatedAt || null,
    serverUpdatedAt: result.meta.serverUpdatedAt || freshness.serverUpdatedAt || freshness.updatedAt || null
  };
  const applied = applyRemoteState(result.state, meta.serverUpdatedAt || meta.updatedAt, meta, result.state, {
    preferredLayout
  });
  return {
    ...result,
    applied,
    fallbackRequired: !applied,
    reason: applied ? "applied" : "apply-failed"
  };
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
    const authorLabel = String(currentUser.displayName || currentUser.email || "").trim();
    let publishOptions = { mode: "live", includeAuthor: false };
    const confirmed = await askConfirmDialog({
      title: uiLanguage === "en" ? "Create list link" : "Создать ссылку на список",
      text: uiLanguage === "en" ? "Choose how the link should work." : "Выберите, как должна работать ссылка.",
      highlightHtml: sharedListPublishDialogHtml({ authorLabel, language: uiLanguage }),
      okText: uiLanguage === "en" ? "Create link" : "Создать ссылку",
      hideCancel: true,
      keepOpenOnOk: true,
      onOk: () => { publishOptions = readSharedListPublishOptions(refs.confirmDialog); }
    });
    if (!confirmed) return;
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
    const sharedLayoutId = state.activeLayoutId;
    const authorName = publishOptions.includeAuthor ? authorLabel : "";
    let sharedListId = listId;
    if (publishOptions.mode === "snapshot") {
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/snapshots`, {
        method: "POST",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify({ ...body, layoutId: sharedLayoutId, includeAuthor: publishOptions.includeAuthor, authorName })
      });
      sharedListId = data?.snapshot?.id || data?.list?.id || "";
      if (!sharedListId) throw new Error("Snapshot id is missing");
    } else {
      body.authorName = authorName;
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
        method: "PUT",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify(body)
      });
      rememberCurrentPackingListRecord(data);
    }
    const link = buildSharedListUrl(sharedListId, sharedLayoutId);
    refs.confirmTitle.textContent = uiLanguage === "en" ? "List link" : "Ссылка на список";
    refs.confirmText.innerHTML = sharedListLinkResultHtml(link, { language: uiLanguage });
    refs.confirmOkBtn.textContent = uiLanguage === "en" ? "Copy link" : "Скопировать ссылку";
    refs.confirmOkBtn.disabled = false;
    refs.confirmOkBtn.onclick = async (event) => {
      event.preventDefault();
      await copySharedListLink(link);
      showToast(uiLanguage === "en" ? "Link copied." : "Ссылка скопирована.", "success");
    };
    refs.confirmText.querySelector("input")?.select();
    updateSyncUi(uiLanguage === "en" ? "List link created" : "Ссылка на список создана");
  } catch (error) {
    if (refs.confirmDialog.open) refs.confirmDialog.close("close");
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
    setLayoutLoadProgress({ loaded: 0, total: null, prefix: localText("Loading layout data", "Получаю данные укладок") });
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/state`, {
      timeoutMs: LIST_API_TIMEOUT_MS
    });
    stateRecord = normalizeRemoteListRecord(data);
  } catch (stateError) {
    try {
      const detailRecord = await fetchRemoteListDetailRecord(listId);
      const bestRecord = pickRicherRemoteListRecord(stateRecord, detailRecord);
      setLoadedRemoteListProgress(bestRecord, localText("Layout data received", "Данные укладок получены"), { final: true });
      return bestRecord;
    } catch {
      throw stateError;
    }
  }
  const stateCount = remoteRecordPrivateLayoutCount(stateRecord);
  if (stateRecord?.payload && stateCount > 1) {
    setLoadedRemoteListProgress(stateRecord, localText("Layout data received", "Данные укладок получены"));
    return stateRecord;
  }
  try {
    const detailRecord = await fetchRemoteListDetailRecord(listId);
    const bestRecord = pickRicherRemoteListRecord(stateRecord, detailRecord);
    setLoadedRemoteListProgress(bestRecord, localText("Layout data received", "Данные укладок получены"), { final: true });
    return bestRecord;
  } catch {
    setLoadedRemoteListProgress(stateRecord, localText("Layout data received", "Данные укладок получены"), { final: true });
    return stateRecord;
  }
}

async function saveRemoteStateRecord({ forceOverwrite = false } = {}) {
  if (isReadOnlyBikePackingContext()) throw createReadOnlyBikePackingError();
  const listData = await saveRemoteListStateRecord({ forceOverwrite }).catch((error) => {
    if (!shouldBlockLegacyPersonalSyncWrite(error)) throw error;
    throw createLegacyPersonalSyncWriteBlockedError(error);
  });
  if (listData) return { ...listData, source: "list" };
  throw createLegacyPersonalSyncWriteBlockedError();
}

function shouldBlockLegacyPersonalSyncWrite(error) {
  if (error?.path?.includes("/bike-packing/lists")) personalListApiUnavailable = true;
  return shouldBlockLegacyPersonalSyncWriteFallback(error);
}

async function fetchRemoteListStateRecord() {
  if (personalListApiUnavailable) throw createSkippedPersonalListApiError();
  if (isPublicTemplateListId(currentPackingListId)) saveActivePackingListId("");
  let savedRecord = null;
  if (currentPackingListId) {
    try {
      setLayoutLoadStatus("loading", localText("Loading the saved personal layout...", "Загружаю сохранённую личную укладку..."));
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
    savedRecord?.payload
      ? localText("Checking for the full list of personal layouts...", "Проверяю, нет ли полного списка личных укладок...")
      : localText("Loading the list of personal layouts...", "Получаю список личных укладок...")
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
    prefix: localText("List found, loading layouts", "Найден список, загружаю укладки")
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
    setLoadedRemoteListProgress(bestRecord, localText("Personal layouts selected", "Личные укладки выбраны"), { final: true });
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

async function fetchStateRecordByItemKey(itemKey, options = {}) {
  return fetchStateRecordPayloadByItemKey(itemKey, options);
}

async function fetchPublicTemplatePayloadRecordByItemKey(itemKey) {
  const path = publicTemplatePayloadPath(itemKey);
  if (!path) throw new Error("public template itemKey is required");
  const data = await apiFetch(path, {
    timeoutMs: LIST_API_TIMEOUT_MS,
    silentErrors: true
  });
  return normalizeRemoteListRecord(data);
}

async function fetchStateRecordMetaByItemKey(itemKey) {
  return fetchPublicTemplatePayloadRecordByItemKey(itemKey);
}

async function fetchStateRecordPayloadByItemKey(itemKey, { cacheKey = "", updatedAt = "" } = {}) {
  const key = cacheKey || itemKey;
  const cached = publishedItemKeyStateCache.get(key, { updatedAt });
  if (cached) return cached;
  const record = await fetchStateRecordMetaByItemKey(itemKey);
  return publishedItemKeyStateCache.set(key, record?.payload || null, {
    updatedAt: updatedAt || remoteUpdatedAt(record)
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

async function fetchPublishedListStateById(listId, { updatedAt = "" } = {}) {
  const cached = publishedListStateCache.get(listId, { updatedAt });
  if (cached) return cached;
  const record = await fetchRemoteListStateSnapshot(listId);
  const payload = normalizePublishedStatePayload(record?.payload || null);
  assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record?.payload || null);
  return publishedListStateCache.set(listId, payload, {
    updatedAt: updatedAt || remoteUpdatedAt(record)
  });
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
      copyPublishedItemToState,
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
  const payload = await fetchStateRecordByItemKey(target.itemKey, {
    cacheKey: target.listId,
    updatedAt: target.updatedAt
  });
  const demoState = normalizeDemoPayloadForLanguage(
    publishedPayloadWithTemplateMetadata(payload, {
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

const queuedSaveRemoteState = createQueuedRemoteSave((options = {}) => saveRemoteStateFlow({
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
      legacyComparableTopLevelDiffKeys,
      preflightRemoteSaveConflict,
      isDemoPublicTemplateMissing,
      isNetworkError,
      isReadOnlyBikePackingContext,
      isReadOnlyBikePackingError,
      isSuspiciousEmptyPackingState,
      isTemporaryServerStorageError,
      isTimeoutError,
      localText,
      loadBaseState,
      nowIso,
      remoteUpdatedAt,
      rememberConflictRemoteMeta,
      rememberCurrentSyncAccount,
      rememberRemoteIntegrityMeta,
      repairCollapsedActiveLayoutBeforeSave,
      saveBaseState,
      saveRemoteState: (nextOptions = {}) => saveRemoteState({ ...nextOptions, _reentrant: true }),
      saveRemoteStateRecord,
      saveSyncMeta,
      serializeState,
      showToast,
      stateIntegrityMetaFromResponse,
      syncChangedBikePackingEntities,
      updateSyncUi,
      uploadPendingPhotos
    }
  }, options));

async function saveRemoteState(options = {}) {
  return queuedSaveRemoteState(options);
}

async function preflightRemoteSaveConflict({ notify = false, preferredLayout = null } = {}) {
  return preflightRemoteSaveConflictFlow({
    currentUser,
    fetchRemoteListFreshnessRecord,
    fetchRemoteListStateSnapshot,
    handleRemoteSaveConflict,
    isForcedOffline,
    isPublicLayoutContext,
    isSharedListLinkRoute,
    listId: currentPackingListId || remoteRecordId(currentPackingListMeta) || syncMeta.listId,
    notify,
    preferredLayout,
    remoteUpdatedAt,
    syncMeta
  });
}

async function handleRemoteSaveConflict(error, options = {}) {
  return handleRemoteSaveConflictFlow(error, {
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get state() { return state; },
      get syncMeta() { return syncMeta; },
      get uiLanguage() { return uiLanguage; }
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
    updateSyncUi(localText(
      "Guest layouts were imported locally but not uploaded: the import has no items or bags",
      "Гостевые укладки перенесены локально, но не отправлены: импорт не содержит вещей или сумок"
    ));
    return false;
  }
  await saveRemoteState({ notify: false, forceOverwrite: true });
  if (syncMeta.dirty) {
    updateSyncUi(localText(
      "The server requested another sync · saving the guest layout again...",
      "Сервер попросил повторную синхронизацию · сохраняю гостевую укладку ещё раз..."
    ));
    await saveRemoteState({ notify: false, forceOverwrite: false });
  }
  const remoteValidation = await confirmGuestImportRemoteState(importedLayoutIds);
  if (remoteValidation.ok) return true;
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  updateSyncUi(localText(
    "Guest layouts were imported locally, but the server has not returned them after saving yet",
    "Гостевые укладки перенесены локально, но сервер пока не вернул их после сохранения"
  ));
  return false;
}

async function offerPendingGuestLocalLayoutsAfterRemoteLoad() {
  if (!canImportGuestLayoutsForAuthenticatedUser(currentUser)) {
    pendingGuestLocalLayoutCandidate = null;
    return false;
  }
  const guestCandidate = consumeGuestLocalLayoutCandidate() || storedGuestLocalLayoutCandidate();
  if (!guestCandidate) return false;
  appUnlocked = true;
  initialRemoteLoadPending = false;
  renderPreservingPackingScroll();
  updateSyncUi(localText(
    "Personal layouts loaded · importing guest layouts into the account...",
    "Личные укладки загружены · переношу гостевые укладки в аккаунт..."
  ));
  await offerSaveGuestLocalLayouts(guestCandidate);
  return true;
}

async function offerSaveGuestLocalLayouts(candidate) {
  if (!canImportGuestLayoutsForAuthenticatedUser(currentUser)) return false;
  const layouts = guestCandidateLayouts(candidate);
  if (!candidate?.sourceState || !layouts.length || !currentUser) return false;
  const importedLayoutIds = importGuestLocalLayouts({ ...candidate, layouts }, { renameConflicts: true });
  if (!importedLayoutIds.length) {
    updateSyncUi(localText(
      "Guest layouts were already imported or contain no data to import",
      "Гостевые укладки уже были перенесены или в них нет данных для импорта"
    ));
    return false;
  }
  renderPreservingPackingScroll();
  updateSyncUi(importedLayoutIds.length > 1
    ? localText("Guest layouts added to the account · saving to the server...", "Гостевые укладки добавлены в аккаунт · сохраняю на сервер...")
    : localText("Guest layout added to the account · saving to the server...", "Гостевая укладка добавлена в аккаунт · сохраняю на сервер..."));
  const saved = await persistGuestImportBeforeCleanup(importedLayoutIds, {
    persistImport: saveGuestImportToRemote,
    clearGuestStorage: () => clearLocalStorageScope(GUEST_STORAGE_SCOPE, [
      STORAGE_KEY,
      BASE_STATE_KEY,
      SYNC_META_KEY,
      RECOVERY_STATE_KEY,
      ACTIVE_LIST_ID_KEY,
      ACTIVE_LAYOUT_CHOICE_KEY,
      ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
      ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY
    ])
  });
  if (!saved) {
    updateSyncUi(localText(
      "Guest layouts were imported into the account · they will be saved to the server automatically during the next check",
      "Гостевые укладки перенесены в аккаунт · сохраню на сервер автоматически при следующей проверке"
    ));
    showToast(localText(
      "Guest layouts were imported into the account. The local version is safe; sync will retry automatically.",
      "Гостевые укладки перенесены в аккаунт. Локальная версия не потеряна, синхронизация повторится автоматически."
    ), "warning");
    scheduleRemoteSave();
    return false;
  }
  showToast(importedLayoutIds.length > 1
    ? localText("Guest layouts were saved to the account.", "Гостевые укладки сохранены в аккаунт.")
    : localText("Guest layout was saved to the account.", "Гостевая укладка сохранена в аккаунт."), "success");
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
  if (remoteStateLoadPromise) return remoteStateLoadPromise;
  remoteStateLoadPromise = loadRemoteStateFlow({
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
      localText,
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
      tryApplyRemoteEntityChanges,
      updateSyncUi
    }
  }, options);
  try {
    return await remoteStateLoadPromise;
  } finally {
    remoteStateLoadPromise = null;
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
  if (!currentUser || remoteRefreshInFlight) return;
  if (recoverUnsyncedLocalChanges("remote-freshness")) return;
  if (syncMeta.dirty) return;
  if (document.hidden) return;
  if ("onLine" in navigator && !navigator.onLine) return;
  const previousServerUpdatedAt = syncMeta.serverUpdatedAt;
  try {
    remoteRefreshInFlight = true;
    const listId = currentPackingListId || remoteRecordId(currentPackingListMeta) || syncMeta.listId;
    if (!listId) return;
    let freshness = null;
    try {
      freshness = await fetchRemoteListFreshnessRecord(listId);
    } catch (error) {
      console.info("[bike-packing] Remote freshness check skipped full state polling", {
        status: error?.status || null,
        message: error?.message || String(error || "")
      });
      updateSyncUi();
      return;
    }
    if (!hasListFreshnessSignal(freshness)) {
      console.info("[bike-packing] Remote freshness check returned no revision/hash; skipped full state polling", {
        listId
      });
      updateSyncUi();
      return;
    }
    if (!listFreshnessChanged(syncMeta, freshness)) {
      updateSyncUi();
      return;
    }
    const preferred = preferredLayout || preferredCurrentLayoutRef();
    let entityChangesApplied = false;
    try {
      const changesResult = await tryApplyRemoteEntityChanges(listId, freshness, { preferredLayout: preferred });
      entityChangesApplied = Boolean(changesResult?.applied);
      if (!entityChangesApplied) {
        console.info("[bike-packing] Entity changes feed fell back to full state refresh", {
          listId,
          reason: changesResult?.reason || "not-applied"
        });
      }
    } catch (error) {
      console.info("[bike-packing] Entity changes feed failed; falling back to full state refresh", {
        listId,
        status: error?.status || null,
        message: error?.message || String(error || "")
      });
    }
    if (!entityChangesApplied) await loadRemoteState({ preferredLayout: preferred });
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
        updateSyncUi(t("demo.statusOfflineMissing"));
        showToast(t("demo.toastOfflineMissing"), "warning");
        return;
      }
      setDemoStatePayloadForLanguage(normalizedLanguage, cachedDemoState, { listId: demoListId });
      render();
      updateSyncUi(t("demo.statusOfflineViewing"));
      return;
    }
    setDemoStatePayloadForLanguage(normalizedLanguage, await defaultDemoState(normalizedLanguage, demoListId), { listId: demoListId });
    render();
    updateSyncUi(t("demo.statusViewing"));
  } catch (error) {
    setActivePrivateScope();
    render();
    updateSyncUi();
    showToast(localText(`Could not open demo: ${error.message}`, `Не удалось открыть демо: ${error.message}`), "error");
  }
}

async function confirmPublicLayoutTransition(kind, layout = null) {
  const admin = canEditPublishedTemplatesNow();
  if (kind === "demo") {
    return askConfirmDialog({
      title: admin
        ? localText("Open demo layout for editing?", "Открыть демо-укладку для редактирования?")
        : localText("Open demo layout?", "Открыть демо-укладку?"),
      text: admin
        ? localText(
          "This is a public demo layout. Changes will be saved separately from your personal layout and will become visible to other users after sync.",
          "Это публичная демо-укладка. Изменения будут сохранены отдельно от личной укладки и станут видны другим пользователям после синхронизации."
        )
        : localText(
          "This is a demo layout. It cannot be edited directly, but you can copy items and bags into your own layouts.",
          "Это демо-укладка. Её нельзя редактировать напрямую, но можно копировать вещи и сумки в свои укладки."
        ),
      okText: admin ? localText("Open demo", "Открыть демо") : localText("View demo", "Смотреть демо"),
      cancelText: localText("Stay here", "Остаться здесь"),
      tone: "warning"
    });
  }
  return askConfirmDialog({
    title: admin
      ? localText("Open template for editing?", "Открыть шаблон для редактирования?")
      : localText("Open template?", "Открыть шаблон?"),
    text: admin
      ? localText(
        `This is a public template${layout?.name ? ` “${layout.name}”` : ""}. Changes will be saved separately from your personal layout and will become visible to other users after sync.`,
        `Это публичный шаблон${layout?.name ? ` «${layout.name}»` : ""}. Изменения будут сохранены отдельно от личной укладки и станут видны другим пользователям после синхронизации.`
      )
      : localText(
        `You are opening the template${layout?.name ? ` “${layout.name}”` : ""}. Editing is locked; you can only copy it into your own layouts.`,
        `Вы открываете шаблон${layout?.name ? ` «${layout.name}»` : ""}. Редактирование заблокировано, доступно только копирование в свои укладки.`
      ),
    okText: admin ? localText("Open for editing", "Открыть для редактирования") : localText("View template", "Смотреть шаблон"),
    cancelText: localText("Stay here", "Остаться здесь"),
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

function removeLayoutTree(layoutId, targetState = state, {
  deleteUnreferencedEntities = null,
  save = true
} = {}) {
  const layout = targetState?.layouts?.[layoutId] || null;
  const removed = removeLayoutTreeFromState(targetState, layoutId, {
    deleteUnreferencedEntities: deleteUnreferencedEntities ?? isDisposableManagedPublicDraft(layout)
  });
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
  updateSyncUi(t("shared.statusViewing", { name: layout.name || "" }));
  try {
    const loaded = await loadSharedLayoutPayload(layoutId);
    if (activeReadOnlyLayoutId() !== layoutId) return;
    if (loaded) {
      render();
      updateSyncUi(t("shared.statusLoaded", { name: layout.name || "" }));
    }
  } catch {
    if (activeReadOnlyLayoutId() !== layoutId) return;
    updateSyncUi(t("shared.statusLocal", { name: layout.name || "" }));
  }
}

async function openSharedLayoutForAdmin(layoutId, { remember = true } = {}) {
  if (!requirePublishedTemplatesAvailable()) {
    renderFilters();
    return;
  }
  const layout = findSharedLayout(layoutId);
  if (!layout || !canOpenAdminPublishedEdit()) return;
  updateSyncUi(t("shared.statusLoadingEdit", { name: layout.name || "" }));
  try {
    await loadSharedLayoutPayload(layoutId);
  } catch {
    // Built-in shared templates remain editable if the public endpoint is unavailable.
  }
  const editableLayout = materializeSharedLayoutForAdmin(layoutId);
  if (!editableLayout) return;
  activateAdminPublishedLayout(editableLayout.id, { remember: false });
  if (remember) rememberActiveLayoutChoice(`shared:${layoutId}`);
  updateSyncUi(t("shared.statusAdminEdit", { name: layout.name || "" }));
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
  const copyTargetLayouts = sharedCopyTargetLayouts(state.layouts, {
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
  fillSelect(
    refs.sharedCopyLayoutSelect,
    copyTargetLayouts.map((layout) => [layout.id, layout.name]),
    state.activeLayoutId
  );
  refs.sharedLayoutsList.innerHTML = renderSharedLayoutsHtml(currentSharedLayouts(), {
    bagLabel: t("summary.bags"),
    itemLabel: t("tabs.items").toLowerCase(),
    rootsForLayout: sharedLayoutRoots,
    showPhotos: shouldShowItemPhotos()
  });
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-root]").forEach((button) => {
    button.addEventListener("click", () => openSharedContainerCopyPicker(button.dataset.copySharedRoot));
  });
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-item]").forEach((button) => {
    button.addEventListener("click", () => openSharedItemCopyPicker(button.dataset.copySharedItem));
  });
}

function bindSharedLayoutEvents(root = document) {
  root.querySelectorAll("[data-copy-shared-layout]").forEach((button) => {
    button.addEventListener("click", () => copySharedLayout(button.dataset.copySharedLayout));
  });
  root.querySelectorAll("[data-copy-shared-root]").forEach((button) => {
    button.addEventListener("click", () => openSharedContainerCopyPicker(button.dataset.copySharedRoot));
  });
  root.querySelectorAll("[data-copy-shared-item]").forEach((button) => {
    button.addEventListener("click", () => openSharedItemCopyPicker(button.dataset.copySharedItem));
  });
}

function isReadonlyTemplateView() {
  return Boolean(isSharedLayoutView() && !canOpenAdminPublishedEdit());
}

function readonlyTemplateMessage() {
  return activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID
    ? "This is a demo template. To add, edit, and delete, create your own layout from the template."
    : "This is a public template. To add, edit, and delete, create your own layout from the template.";
}

async function confirmCreateLayoutFromReadonlyTemplate() {
  const layout = currentSharedLayout();
  const confirmed = await askConfirmDialog({
    title: "This is a template",
    text: readonlyTemplateMessage(),
    highlightText: layout?.name ? `A separate layout “${layout.name}” will be created. The original template will not change.` : "",
    okText: "Create layout"
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
    t,
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
  return isSharedCopyTargetLayout(layout, {
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  })
    ? selected
    : "";
}

function chooseSharedCopyTargetLayoutId() {
  const layouts = sharedCopyTargetLayouts(state.layouts, {
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
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
    name: uniqueLayoutName(localText("New layout", "Новая укладка")),
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

async function cacheGuestTemplatePhotoFallbacks(layoutId, { changedAt = "" } = {}) {
  if (!layoutId || canUsePrivateState()) return 0;
  return cacheLayoutRemotePhotosForUploadFallback(state, { layoutId, changedAt });
}

async function cacheGuestRecordPhotoFallbacks(record, { changedAt = "" } = {}) {
  if (!record || canUsePrivateState()) return 0;
  return cacheRecordRemotePhotosForUploadFallback(record, changedAt ? { changedAt } : {});
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
    await cacheGuestTemplatePhotoFallbacks(targetLayoutId);
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
  await cacheGuestTemplatePhotoFallbacks(targetLayoutId);
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
    await cacheGuestRecordPhotoFallbacks(state.items?.[copiedItemId]);
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
  await cacheGuestRecordPhotoFallbacks(state.items?.[copiedItemId]);
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
  await cacheGuestRecordPhotoFallbacks(state.items?.[copiedItemId], { changedAt });
  await saveLayoutMutation(targetLayoutId, { publishNow: targetIsPublic, forcePublic: targetIsPublic });
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  render();
  renderSharedLayouts();
  requestAnimationFrame(() => focusRecentlyAddedItem(copiedItemId));
  showToast(`"${sourceName}" \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u0443\u044e \u0441\u0443\u043c\u043a\u0443.`, "success");
}

async function copySharedRootToLayoutContainer(rootId, targetParentId, targetLayoutId, { targetIndex = null } = {}) {
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
  if (!sourceName) return;
  const copyAction = await chooseContainerTreeCopyToLayoutAction(targetLayoutId, sourceSnapshot, sourceName, { publicSource: true });
  if (copyAction === "cancel") return;
  if (copyAction === "copy-missing" || copyAction === "copy-missing-local") {
    await copyMissingPublicSnapshotItemsToLayout(sourceSnapshot, targetLayoutId);
    return;
  }
  const copiedRootId = await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
    sourceContainerId: rootId,
    publicSource: true,
    targetIndex
  });
  if (!copiedRootId) return;
  if (await cacheGuestTemplatePhotoFallbacks(targetLayoutId)) saveState();
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
    publicCopyRecordContentHash,
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
  markLocalPublicCopyOrigin(
    state.items[id],
    "item",
    publicSourceId,
    source._publicCopySourceLayoutId || sourceLayoutId,
    publicCopyRecordContentHash(source, "item")
  );
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

function publicCopyMissingItemPlanForSnapshot(targetLayoutId, sourceSnapshot) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout) return { missingItems: [], targetContainerIds: [], canCopyMissingItems: false };
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
  return planPublicCopyMissingItems({
    sourceSnapshot,
    targetContainerIds,
    targetItemIds: [...targetItemIds],
    containers: state.containers,
    items: state.items,
    itemCategories,
    itemQuantity,
    hasPrivateSyncBlockedPublicOrigin
  });
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
  const sourceDictionaries = ensureLayoutDictionaries(sourceLayout, source) || {};
  state.layouts[layoutId] = {
    id: layoutId,
    name: demoCopyLayoutName(sourceLayout.name, { exactTemplateName, preferredName }),
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    [GUEST_DEMO_COPY_FLAG]: !canUsePrivateState(),
    demoSourceLanguage: uiLanguage,
    demoSourceListId: demoListId,
    guestDemoCopyCreatedAt: changedAt,
    locations: normalizeDictionaryValues(sourceDictionaries.locations, layoutDictionaryValues(sourceLayout, "location", source)),
    categories: normalizeDictionaryValues(sourceDictionaries.categories, layoutDictionaryValues(sourceLayout, "category", source)),
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
  let dictionaryChanged = false;
  Object.values(state.layouts || {}).forEach((layout) => {
    if (!isGuestDemoCopyLayoutRecord(layout) || guestLayoutHasUserContentEdits(state, layout)) return;
    dictionaryChanged = pruneUnusedLayoutCustomDictionaries(layout, {
      sourceState: state,
      defaults: { locations, categories },
      getLayoutContainerIdSet: getLayoutContainerIdSetForState,
      getLayoutItemIdSet: getLayoutItemIdSetForState
    }) || dictionaryChanged;
  });
  if (!plan.removeLayoutIds.length && !dictionaryChanged) return false;
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
    await cacheGuestTemplatePhotoFallbacks(layoutId);
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

async function chooseContainerTreeCopyToLayoutAction(targetLayoutId, sourceSnapshot, sourceName = "", { publicSource = false } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout || !sourceSnapshot) return "cancel";
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const publicSourceSnapshot = publicCopySnapshotFromSourceSnapshot(sourceSnapshot);
  const sourceIsPublicCopy = publicSource ||
    snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) ||
    snapshotHasLocalPublicCopyOrigin(sourceSnapshot);
  if (!(targetIsPublic || sourceIsPublicCopy) || !publicSourceSnapshot) {
    if (targetIsPublic) return "copy-all";
    const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
    if (!duplicates.containerIds.length && !duplicates.itemIds.length) return "copy-all";
    const missingPlan = layoutMissingItemPlanForContainerTree(targetLayoutId, sourceSnapshot);
    const duplicate = await askConfirmDialog({
      title: "Такие элементы уже есть в укладке",
      text: `В укладке «${targetLayout.name || "Укладка"}» уже есть часть этой сумки/ветки. Создать отдельные копии вместо повторного добавления?`,
      okText: "Дублировать",
      alternateText: missingPlan.canCopyMissingItems ? "Только недостающие" : "",
      cancelText: "Не копировать",
      highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже есть в целевой укладке${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingContainers.length} контейнеров/пакетов и ${missingPlan.missingItems.length} вещей можно добавить без дублей` : ""}`,
      tone: "safe"
    });
    if (duplicate === "alternate" && missingPlan.canCopyMissingItems) return "copy-missing-local";
    if (duplicate) return "copy-all";
    refs.containerPickerDialog.close();
    showToast("Копирование пропущено: элементы уже есть в целевой укладке.", "success");
    return "cancel";
  }
  const duplicates = publicCopyDuplicateSummaryForSnapshot(targetLayoutId, publicSourceSnapshot);
  if (!duplicates.containerIds.length && !duplicates.itemIds.length) return "copy-all";
  const missingPlan = publicCopyMissingItemPlanForSnapshot(targetLayoutId, publicSourceSnapshot);
  const duplicate = await askConfirmDialog({
    title: "Уже скопировано в эту укладку",
    text: `«${sourceName || "Элемент"}» уже есть в укладке «${targetLayout.name || "Укладка"}» как копия из demo/shared. Создать ещё одну отдельную копию?`,
    okText: "Дублировать всё",
    alternateText: missingPlan.canCopyMissingItems ? "Только недостающие" : "",
    cancelText: "Не копировать",
    highlightText: `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже найдены по исходным ID${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingItems.length} вещей можно добавить без дублей` : ""}`,
    tone: "safe"
  });
  if (duplicate === "alternate" && missingPlan.canCopyMissingItems) return "copy-missing";
  if (duplicate) return "copy-all";
  showToast("Копирование пропущено: такая demo/shared копия уже есть в целевой укладке.", "success");
  return "cancel";
}

async function copyMissingPublicSnapshotItemsToLayout(sourceSnapshot, targetLayoutId) {
  const targetLayout = state.layouts[targetLayoutId];
  const publicSourceSnapshot = publicCopySnapshotFromSourceSnapshot(sourceSnapshot);
  const plan = publicCopyMissingItemPlanForSnapshot(targetLayoutId, publicSourceSnapshot);
  if (!targetLayout || !plan.canCopyMissingItems) return 0;
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const photoDuplicateOptions = photoDuplicateOptionsForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy: true
  });
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  let copiedCount = 0;
  let firstCopiedItemId = "";
  for (const entry of plan.missingItems) {
    const sourceItem = publicSourceSnapshot.items?.[entry.sourceItemId] || sourceSnapshot.items?.[entry.sourceItemId];
    if (!sourceItem || !state.containers?.[entry.targetContainerId]) continue;
    const copyId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const copied = await duplicateSnapshotItemToContainerInLayoutState(state, sourceItem, entry.sourceItemId, entry.targetContainerId, targetLayoutId, {
      activeLayoutId: state.activeLayoutId,
      applyLayoutArrangement,
      changedAt,
      cloneEntity: cloneIsolatedPublicEntity,
      copyPhotos: (record, options) => copyRecordPhotosForLocalDuplicate(record, { ...options, ...photoDuplicateOptions }),
      currentEditMeta,
      id: copyId,
      mapRecordToTarget: (record) => {
        if (targetIsPublic) {
          record.publicCatalogLayoutId = targetLayoutId;
          markRecordPhotosForCurrentListCopy(record);
        } else {
          markRecordPhotosForCurrentListCopy(record);
          stripPublicOriginForPrivateCopy(record);
        }
      },
      markRecordOrigin: markPrivateCopyOriginFromSource,
      touchLayout
    });
    if (!copied) {
      delete state.items[copyId];
      continue;
    }
    markRecentlyAddedItem(copyId, targetLayoutId);
    if (!firstCopiedItemId) firstCopiedItemId = copyId;
    copiedCount += 1;
  }
  if (!copiedCount) return 0;
  await saveLayoutMutation(targetLayoutId, { publishNow: targetIsPublic, forcePublic: targetIsPublic });
  openCopiedTargetLayout(targetLayoutId);
  pendingPackingScroll = null;
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("container", sourceSnapshot.rootId);
  render();
  renderSharedLayouts();
  if (firstCopiedItemId) requestAnimationFrame(() => focusRecentlyAddedItem(firstCopiedItemId));
  showToast(`${copiedCount} вещей добавлено без дублей.`, "success");
  return copiedCount;
}

async function copyMissingLayoutSnapshotItemsToLayout(sourceSnapshot, targetLayoutId) {
  const targetLayout = state.layouts[targetLayoutId];
  const plan = layoutMissingItemPlanForContainerTree(targetLayoutId, sourceSnapshot);
  if (!targetLayout || !plan.canCopyMissingItems) return 0;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  const changedAt = nowIso();
  let firstAddedItemId = "";
  const firstRestoredContainerId = plan.missingContainers.find((entry) =>
    state.containers?.[entry?.sourceContainerId]
  )?.sourceContainerId || "";
  const restored = linkMissingContainerTreeToLayoutState(state, sourceSnapshot, targetLayoutId, {
    changedAt,
    missingContainers: plan.missingContainers,
    missingItems: plan.missingItems,
    normalizeLayoutArrangement,
    touchLayout
  });
  if (targetLayoutId === state.activeLayoutId && restored.containerCount) applyLayoutArrangement(targetLayoutId);
  let copiedCount = 0;
  plan.missingItems.forEach((entry) => {
    if (getLayoutItemIdSet(targetLayout).has(entry.sourceItemId)) return;
    if (!state.items?.[entry.sourceItemId] || !state.containers?.[entry.targetContainerId]) return;
    if (!placeExistingItemInLayout(entry.sourceItemId, entry.targetContainerId, targetLayoutId, { changedAt })) return;
    markRecentlyAddedItem(entry.sourceItemId, targetLayoutId);
    if (!firstAddedItemId) firstAddedItemId = entry.sourceItemId;
    copiedCount += 1;
  });
  if (!firstAddedItemId && restored.itemCount) {
    const layoutItemIds = getLayoutItemIdSet(targetLayout);
    firstAddedItemId = plan.missingItems.find((entry) =>
      state.items?.[entry.sourceItemId] && layoutItemIds.has(entry.sourceItemId)
    )?.sourceItemId || "";
    if (firstAddedItemId) markRecentlyAddedItem(firstAddedItemId, targetLayoutId);
  }
  const changedCount = copiedCount + restored.containerCount + restored.itemCount;
  if (!changedCount) return 0;
  if (firstRestoredContainerId && restored.containerCount) markRecentlyAddedContainer(firstRestoredContainerId, targetLayoutId);
  await saveLayoutMutation(targetLayoutId, { publishNow: targetIsPublic, forcePublic: targetIsPublic });
  openCopiedTargetLayout(targetLayoutId);
  pendingPackingScroll = null;
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("container", sourceSnapshot.rootId);
  render();
  renderSharedLayouts();
  if (firstRestoredContainerId && restored.containerCount) {
    requestAnimationFrame(() => focusRecentlyAddedContainer(firstRestoredContainerId));
  } else if (firstAddedItemId) {
    requestAnimationFrame(() => focusRecentlyAddedItem(firstAddedItemId));
  }
  showToast(`${changedCount} элементов добавлено без дублей.`, "success");
  return changedCount;
}

async function copySharedLayout(layoutId) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return;
  if (layout.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit()) {
    await createLocalDemoCopy({ forceNew: true }).catch((error) => {
      const errorText = createdLayoutSyncErrorText(error, uiLanguage);
      updateSyncUi(localText(`Could not save the demo copy: ${errorText}`, `Не удалось сохранить демо-копию: ${errorText}`));
      showToast(localText(`Could not save the demo copy: ${errorText}`, `Не удалось сохранить демо-копию: ${errorText}`), "error");
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
  await cacheGuestTemplatePhotoFallbacks(nextLayoutId, { changedAt });
  saveState({ sync: false });
  if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
  switchView("packing");
  render();
  try {
    await syncCreatedPrivateLayoutEntities(nextLayoutId);
    showToast(localText(
      `Layout “${layout.name}” copied and saved to the server.`,
      `Укладка «${layout.name}» скопирована и сохранена на сервере.`
    ), "success");
  } catch (error) {
    const errorText = createdLayoutSyncErrorText(error, uiLanguage);
    showToast(localText(
      `The layout was created locally but was not saved to the server: ${errorText}`,
      `Укладка создана локально, но не сохранена на сервере: ${errorText}`
    ), "error");
  }
}

function materializeSharedLayoutForAdmin(layoutId = activeReadOnlyLayoutId()) {
  return materializeSharedLayoutForAdminState(layoutId, {
    canOpenAdminPublishedEdit,
    copyPublishedContainerToState,
    copyPublishedItemToState,
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
    copyPublishedContainerToState,
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
  markLocalPublicCopyOrigin(state.containers[id], "container", root.id, "legacy-shared", publicCopyRecordContentHash(state.containers[id], "container"));
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
    category: "",
    categories: [],
    containerId,
    note: item.description || "",
    photos: sharedGearPhotos(item, changedAt),
    ...currentCreateMeta(changedAt)
  };
  markLocalPublicCopyOrigin(state.items[id], "item", item.id, "legacy-shared", publicCopyRecordContentHash(state.items[id], "item"));
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
    showToast(localText("History is unavailable in offline mode.", "История недоступна в офлайн-режиме."), "error");
    return;
  }
  if (!currentUser) {
    showToast(localText("History is available after sign-in.", "История доступна после входа."), "error");
    return;
  }
  if (!canOpenAdminPublishedEdit()) activeHistorySource = "private";
  historyComparisonState = null;
  historyPageState = null;
  historyDetailCache.clear();
  selectedHistoryDetailRecordKey = "";
  renderHistorySourceControls();
  openModalDialog(refs.historyDialog);
  refreshHistoryDialog();
}

function historyDemoTemplateOptions() {
  const languageOrder = [
    normalizeUiLanguage(uiLanguage),
    ...SUPPORTED_LANGUAGES.map(normalizeUiLanguage).filter((language) => language !== normalizeUiLanguage(uiLanguage))
  ];
  const entries = [
    ...adminDemoTemplateCatalogEntries(),
    ...languageOrder.map((language) => fallbackDemoTemplateEntry(language))
  ];
  const seen = new Set();
  const options = [];
  entries.forEach((entry) => {
    const language = normalizeUiLanguage(entry?.language || uiLanguage);
    const listId = String(entry?.listId || entry?.id || demoPublicListIdForLanguage(language) || "").trim();
    if (!listId || seen.has(listId)) return;
    seen.add(listId);
    const name = String(entry?.name || "").trim() || demoTemplateFallbackName(language);
    options.push({
      type: "demo",
      demoListId: listId,
      listId,
      language,
      name,
      label: `${name} · ${languageOptionLabel(language)}`
    });
  });
  return options;
}

function selectedHistoryDemoTarget() {
  const options = historyDemoTemplateOptions();
  const selectedListId = String(refs.historyDemoSelect?.value || activeDemoTemplateListId || "").trim();
  const selected = options.find((option) => option.listId === selectedListId);
  if (selected) return selected;
  const language = normalizeUiLanguage(uiLanguage);
  const template = currentDemoTemplate(language, selectedListId);
  const demoListId = selectedListId || template?.listId || demoPublicListIdForLanguage(language);
  return {
    type: "demo",
    demoListId,
    listId: demoListId,
    language,
    name: template?.name || demoTemplateFallbackName(language),
    label: `${template?.name || demoTemplateFallbackName(language)} · ${languageOptionLabel(language)}`
  };
}

function historySharedTemplateSelectOptions() {
  return historySharedTemplateOptions(allSharedLayoutsByAdminOrder(), {
    languageLabel: languageOptionLabel
  });
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
  if (refs.historyDemoField) refs.historyDemoField.hidden = activeHistorySource !== "demo";
  if (refs.historyDemoSelect) {
    const demoOptions = historyDemoTemplateOptions();
    const selected = selectedHistoryDemoTarget().listId || demoOptions[0]?.listId || "";
    fillSelect(refs.historyDemoSelect, demoOptions.map((option) => [option.listId, option.label]), selected);
    if (activeHistorySource === "demo" && refs.historyDemoSelect.value) {
      activeDemoTemplateListId = refs.historyDemoSelect.value;
    }
  }
  if (refs.historySharedField) refs.historySharedField.hidden = activeHistorySource !== "shared";
  if (refs.historySharedSelect) {
    const sharedOptions = historySharedTemplateSelectOptions();
    const selected = refs.historySharedSelect.value ||
      (activeReadOnlyLayoutId() !== DEMO_SHARED_LAYOUT_ID ? activeReadOnlyLayoutId() : "") ||
      sharedOptions[0]?.id ||
      "";
    fillSelect(refs.historySharedSelect, sharedOptions.map((layout) => [layout.id, layout.label]), selected);
  }
}

async function refreshHistoryDialog() {
  renderHistorySourceControls();
  refs.historyStatus.className = "dialog-status";
  refs.historyStatus.textContent = t("history.loading");
  refs.historyList.innerHTML = "";
  try {
    const source = activeHistorySource;
    const result = await loadRemoteHistory(source);
    if (source !== activeHistorySource) return;
    historyRecords = restorableHistorySummaryRecords(result.records);
    historyPageState = result.pageState;
    historyComparisonState = null;
    renderHistoryRecords(historyRecords);
  } catch (error) {
    refs.historyStatus.className = "dialog-status error";
    refs.historyStatus.textContent = `${t("history.loadFailed")} ${error.message}`;
  }
}

async function loadCurrentHistoryComparisonState(source = activeHistorySource) {
  if (source === "demo") {
    const target = selectedHistoryDemoTarget();
    const payload = await fetchPublishedListStateById(target.demoListId);
    return normalizePublishedStatePayload(payload);
  }
  if (source === "shared") {
    const sharedId = refs.historySharedSelect?.value || historySharedTemplateSelectOptions()[0]?.id || "";
    if (!sharedId) return null;
    const payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId));
    return normalizePublishedStatePayload(payload);
  }
  return normalizeRemoteState(serializeState({ forSync: true }));
}

function historyPageHasMore(pageState = historyPageState) {
  if (!pageState) return false;
  if (pageState.type === "private") {
    return pageState.targets.some((target) => target.hasMore);
  }
  return Boolean(pageState.hasMore);
}

async function loadRemoteHistory(source = "private", pageState = null) {
  let path = "";
  if (source === "demo") {
    const target = selectedHistoryDemoTarget();
    path = demoAdminPathForPublicListId(
      "/history",
      target.demoListId,
      target.language
    );
  } else if (source === "shared") {
    const sharedId = refs.historySharedSelect?.value || historySharedTemplateSelectOptions()[0]?.id || "";
    if (!sharedId) throw new Error("Нет shared-укладок для истории.");
    path = `/bike-packing/admin/shared-layouts/${encodeURIComponent(sharedId)}/history`;
  } else {
    return loadPrivateRemoteHistory(pageState);

  }
  const cursor = pageState?.type === "single" ? pageState.cursor : "";
  const data = await apiFetch(historySummaryRequestPath(path, { cursor, limit: 25 }));
  const page = normalizeHistorySummaryPage(data);
  return {
    records: page.records.map((record) => ({
      ...record,
      historyPath: path,
      source: record.source || "bike_packing_list_history"
    })),
    pageState: {
      type: "single",
      path,
      cursor: page.nextCursor,
      hasMore: page.hasMore
    }
  };
}

async function loadPrivateRemoteHistory(pageState = null) {
  if (pageState?.type === "private") {
    const pendingTargets = pageState.targets.filter((target) => target.hasMore);
    const results = await Promise.allSettled(pendingTargets.map(async (target) => {
      const data = await apiFetch(historySummaryRequestPath(target.path, {
        cursor: target.cursor,
        limit: 25
      }), { timeoutMs: LIST_API_TIMEOUT_MS });
      return { target, page: normalizeHistorySummaryPage(data) };
    }));
    const updates = new Map();
    const records = [];
    results.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const { target, page } = result.value;
      updates.set(target.listId, {
        ...target,
        cursor: page.nextCursor,
        hasMore: page.hasMore
      });
      page.records.forEach((record) => records.push({
        ...record,
        listId: record.listId || record.list_id || target.listId,
        listTitle: record.listTitle || record.list_title || target.listTitle,
        historyPath: target.path,
        source: record.source || "bike_packing_list_history"
      }));
    });
    if (!results.some((result) => result.status === "fulfilled")) {
      const firstError = results.find((result) => result.status === "rejected")?.reason;
      throw new Error(`History is unavailable: ${apiErrorMessage(firstError)}`);
    }
    return {
      records: sortHistoryRecords(records),
      pageState: {
        type: "private",
        targets: pageState.targets.map((target) => updates.get(target.listId) || {
          ...target,
          hasMore: false
        })
      }
    };
  }

  let lists = [];
  try {
    const catalog = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
    lists = normalizePackingListsResponse(catalog)
      .map((list) => normalizeRemoteListRecord(list))
      .filter((list) => remoteRecordId(list) && !isReadOnlyBikePackingRecord(list));
  } catch {
    lists = [];
  }

  const currentListId = await ensureCurrentPackingListId();
  if (!lists.some((list) => remoteRecordId(list) === currentListId)) {
    lists.push({ id: currentListId, title: currentPackingListMeta?.title || "" });
  }

  const uniqueLists = [];
  const seen = new Set();
  lists.forEach((list) => {
    const listId = remoteRecordId(list);
    if (!listId || seen.has(listId)) return;
    seen.add(listId);
    uniqueLists.push(list);
  });

  const targets = uniqueLists.map((list) => {
    const listId = remoteRecordId(list);
    return {
      listId,
      listTitle: String(list.title || list.name || list.listTitle || "").trim(),
      path: `/bike-packing/lists/${encodeURIComponent(listId)}/history`,
      cursor: "",
      hasMore: true
    };
  });
  const results = await Promise.allSettled(targets.map(async (target) => {
    const data = await apiFetch(historySummaryRequestPath(target.path, { limit: 25 }), {
      timeoutMs: LIST_API_TIMEOUT_MS
    });
    return { target, page: normalizeHistorySummaryPage(data) };
  }));

  const records = [];
  const loadedTargets = new Map();
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { target, page } = result.value;
    loadedTargets.set(target.listId, {
      ...target,
      cursor: page.nextCursor,
      hasMore: page.hasMore
    });
    page.records.forEach((record) => records.push({
      ...record,
      listId: record.listId || record.list_id || target.listId,
      listTitle: record.listTitle || record.list_title || target.listTitle,
      historyPath: target.path,
      source: record.source || "bike_packing_list_history"
    }));
  });
  if (records.length || results.some((result) => result.status === "fulfilled")) {
    return {
      records: sortHistoryRecords(records),
      pageState: {
        type: "private",
        targets: targets.map((target) => loadedTargets.get(target.listId) || {
          ...target,
          hasMore: false
        })
      }
    };
  }
  const firstError = results.find((result) => result.status === "rejected")?.reason;
  throw new Error(`History is unavailable: ${apiErrorMessage(firstError)}`);
}

async function loadMoreHistoryRecords() {
  if (historyLoadMoreInFlight || !historyPageHasMore()) return;
  historyLoadMoreInFlight = true;
  renderHistoryRecords(historyRecords);
  const source = activeHistorySource;
  let loadError = null;
  try {
    const result = await loadRemoteHistory(source, historyPageState);
    if (source !== activeHistorySource) return;
    historyPageState = result.pageState;
    historyRecords = restorableHistorySummaryRecords([...historyRecords, ...result.records]);
  } catch (error) {
    loadError = error;
  } finally {
    historyLoadMoreInFlight = false;
    if (source === activeHistorySource) {
      renderHistoryRecords(historyRecords);
      if (loadError) {
        refs.historyStatus.className = "dialog-status error";
        refs.historyStatus.textContent = `${t("history.loadFailed")} ${loadError.message}`;
      }
    }
  }
}

function renderHistoryRecords(records) {
  const loadMoreButton = historyPageHasMore()
    ? `<button type="button" class="ghost history-load-more" data-history-load-more${historyLoadMoreInFlight ? " disabled" : ""}>${escapeHtml(historyLoadMoreInFlight
      ? localText("Loading...", "Загрузка...")
      : localText("Load more", "Загрузить ещё"))}</button>`
    : "";
  if (!records.length) {
    refs.historyStatus.className = "dialog-status";
    refs.historyStatus.textContent = t("history.empty", { source: historySourceLabel() });
    refs.historyList.innerHTML = loadMoreButton;
    refs.historyList.querySelector("[data-history-load-more]")?.addEventListener("click", loadMoreHistoryRecords);
    return;
  }
  refs.historyStatus.className = "dialog-status success";
  refs.historyStatus.textContent = t("history.found", { source: historySourceLabel(), count: records.length });
  refs.historyList.innerHTML = records.map((record, index) => renderHistoryRecordArticleHtml(record, index, records, {
    activeSource: activeHistorySource,
    formatDateTime: (value) => formatHistoryDateTime(value, { language: uiLanguage }),
    localText,
    latestRestoreText: t("history.undoLatest"),
    publishText: t("history.publishVersion"),
    recordKey: historyRecordKey,
    recordMetaText: (record, _payload, recordIndex, recordList) =>
      String(record?.snapshotKind || record?.snapshot_kind || "undo") === "daily"
        ? t("history.dailyCheckpoint")
        : historyActionDescription(historyRecordAction(record, recordIndex, recordList, {
          currentComparisonState: currentHistoryComparisonState,
          recordState: historyRecordState
        }), { localText }),
    recordState: historyRecordState,
    recordTitle: historyRecordTitle,
    restoreTextForRecord: historyUndoActionText,
    restoreText: t("history.undoChanges"),
    showTitle: false,
    summarizePayload: summarizeHistoryPayload
  })).join("") + loadMoreButton;
  syncHistoryActionButtonTooltips(refs.historyList);
  refs.historyList.querySelectorAll("[data-history-record]").forEach((recordElement) => {
    recordElement.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const key = recordElement.dataset.historyRecord || "";
      openHistoryRecordDetails(key);
    });
    recordElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openHistoryRecordDetails(recordElement.dataset.historyRecord || "");
    });
  });
  refs.historyList.querySelectorAll("[data-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryRecordDetails(button.dataset.historyDetail));
  });
  refs.historyList.querySelectorAll("[data-restore-history]").forEach((button) => {
    button.addEventListener("click", () => restoreHistoryRecord(button.dataset.restoreHistory));
  });
  refs.historyList.querySelector("[data-history-load-more]")?.addEventListener("click", loadMoreHistoryRecords);
}

function historyUndoActionText(record, index, records = historyRecords) {
  if (String(record?.snapshotKind || record?.snapshot_kind || "undo") === "daily") {
    return t("history.undoAfterCheckpoint");
  }
  const action = historyRecordAction(record, index, records, {
    currentComparisonState: currentHistoryComparisonState,
    recordState: historyRecordState
  });
  if (!action) return t("history.undoMixed");
  if (action.operation === "mixed" || !action.title) return t("history.undoMixed");
  const key = action.operation === "added"
    ? "history.undoAdded"
    : action.operation === "removed"
      ? "history.undoRemoved"
      : "history.undoChanged";
  return t(key, { name: action.title });
}

function findHistoryRecordByKey(recordKey) {
  const key = String(recordKey || "");
  const index = historyRecords.findIndex((item, itemIndex) => historyRecordKey(item, itemIndex) === key);
  return {
    record: index >= 0 ? historyRecords[index] : null,
    index,
    records: historyRecords
  };
}

async function loadHistoryRecordDetail(record, index = 0) {
  const cacheKey = historyRecordKey(record, index);
  if (historyDetailCache.has(cacheKey)) return historyDetailCache.get(cacheKey);
  const historyPath = String(record?.historyPath || "").trim();
  const historyId = Number(record?.id || 0);
  if (!historyPath || !Number.isFinite(historyId) || historyId <= 0) {
    throw new Error(localText("The history entry has no detail address.", "У записи истории нет адреса деталей."));
  }
  const data = await apiFetch(`${historyPath}/${encodeURIComponent(historyId)}`, {
    timeoutMs: LIST_API_TIMEOUT_MS
  });
  const detailRecord = {
    ...record,
    ...(data?.record || {}),
    action: data?.action || record?.action || null,
    historyPath
  };
  const comparisonState = activeHistorySource === "private"
    ? normalizeRemoteState(data?.comparisonPayload)
    : normalizePublishedStatePayload(data?.comparisonPayload);
  const detail = { record: detailRecord, comparisonState };
  historyDetailCache.set(cacheKey, detail);
  return detail;
}

async function openHistoryRecordDetails(recordKey) {
  const { record, index, records } = findHistoryRecordByKey(recordKey);
  if (!record || index < 0) return;
  selectedHistoryDetailRecordKey = historyRecordKey(record, index);
  const createdAt = formatHistoryDateTime(record.createdAt || record.created_at, { language: uiLanguage });
  const undoActionText = historyUndoActionText(record, index, records);
  if (refs.historyDetailTitle) {
    refs.historyDetailTitle.textContent = undoActionText
      ? undoActionText
      : createdAt
        ? localText(`Version ${createdAt}`, `Версия ${createdAt}`)
        : localText("Version details", "Детали версии");
  }
  if (refs.historyDetailContent) {
    refs.historyDetailContent.textContent = localText("Loading version details...", "Загружаю детали версии...");
  }
  if (refs.historyDetailRestoreBtn) {
    refs.historyDetailRestoreBtn.textContent = historyUndoActionText(record, index, records);
  }
  openModalDialog(refs.historyDetailDialog);
  syncHistoryActionButtonTooltips(refs.historyDetailDialog);
  try {
    const selectedKey = selectedHistoryDetailRecordKey;
    const detail = await loadHistoryRecordDetail(record, index);
    if (selectedKey !== selectedHistoryDetailRecordKey || !refs.historyDetailDialog?.open) return;
    if (refs.historyDetailContent) {
      refs.historyDetailContent.innerHTML = renderHistoryRecordDetailsHtml(detail.record, 0, [detail.record], {
        activeSource: activeHistorySource,
        currentComparisonState: () => detail.comparisonState,
        formatDateTime: (value) => formatHistoryDateTime(value, { language: uiLanguage }),
        localText,
        recordState: historyRecordState,
        recordTitle: historyRecordTitle,
        restoreComparisonTitle: t(
          String(detail.record?.snapshotKind || detail.record?.snapshot_kind || "undo") === "daily"
            ? "history.checkpointChangesTitle"
            : "history.restoreChangesTitle"
        ),
        summarizePayload: summarizeHistoryPayload
      });
    }
  } catch (error) {
    if (refs.historyDetailContent) {
      refs.historyDetailContent.textContent = localText(
        `Could not load version details: ${error.message}`,
        `Не удалось загрузить детали версии: ${error.message}`
      );
    }
  }
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
  if (source === "demo") {
    const target = selectedHistoryDemoTarget();
    return target?.name ? `${t("history.sourceDemo")} · ${target.name} · ${languageOptionLabel(target.language)}` : t("history.sourceDemo");
  }
  if (source === "shared") {
    const layout = findSharedLayout(refs.historySharedSelect?.value);
    return layout?.name ? `${t("history.sourceTemplate")} · ${layout.name}` : t("history.sourceTemplate");
  }
  return t("history.sourceMine");
}

async function restoreHistoryRecord(recordKey) {
  const { record, index, records } = findHistoryRecordByKey(recordKey);
  if (!record) {
    showToast(localText("Could not read the selected version.", "Не удалось прочитать выбранную версию."), "error");
    return;
  }
  if (activeHistorySource === "demo" || activeHistorySource === "shared") {
    try {
      const detail = await loadHistoryRecordDetail(record, index);
      const restoredState = historyRecordState(detail.record);
      if (!restoredState) throw new Error(localText("Version data is empty.", "Данные версии пусты."));
      await publishPublicHistoryRecord(detail.record, restoredState, { index, records });
    } catch (error) {
      showToast(localText(
        `Could not load the selected version: ${error.message}`,
        `Не удалось загрузить выбранную версию: ${error.message}`
      ), "error");
    }
    return;
  }
  const impact = historyRollbackImpact(record, index, records);
  const restoreLayoutIds = impact.isDeepRollback ? [] : historyRecordRestoreLayoutIds(record);
  const affectedLayout = (Array.isArray(record?.affectedLayouts) ? record.affectedLayouts : [])
    .find((layout) => String(layout?.id || "") === restoreLayoutIds[0]);
  const restoredLayoutName = restoreLayoutIds.length
    ? String(affectedLayout?.name || state.layouts?.[restoreLayoutIds[0]]?.name || restoreLayoutIds[0])
    : "";
  const confirmed = await askConfirmDialog(historyUndoConfirmation({
    actionText: historyUndoActionText(record, index, records),
    ...impact,
    layoutName: restoredLayoutName,
    localText
  }));
  if (!confirmed) return;
  refs.historyDialog.close();
  refs.historyDetailDialog?.close();
  updateSyncUi(localText("Undoing the action on the server...", "Отменяю действие на сервере..."));
  try {
    await restorePrivateHistoryRecordOnServer(record, { layoutScoped: !impact.isDeepRollback });
    showToast(localText("Action undone.", "Действие отменено."), "success");
  } catch (error) {
    updateSyncUi(localText(`Could not undo the action: ${error.message}`, `Не удалось отменить действие: ${error.message}`));
    showToast(localText(`Could not undo the action: ${error.message}`, `Не удалось отменить действие: ${error.message}`), "error");
  }
}

async function restorePrivateHistoryRecordOnServer(record, { layoutScoped = true } = {}) {
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
  const currentRecord = await fetchRemoteListDetailRecord(listId);
  const currentMeta = stateIntegrityMetaFromResponse(currentRecord);
  const baseStateRevision = currentMeta.stateRevision ?? currentRecord?.stateRevision ?? currentRecord?.state_revision ?? null;
  rememberRemoteIntegrityMeta(currentRecord);
  saveSyncMeta();
  const layoutIds = layoutScoped ? historyRecordRestoreLayoutIds(record) : [];
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/history/${encodeURIComponent(historyId)}/restore`, {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      baseStateRevision,
      stateRevision: baseStateRevision,
      ...(layoutIds.length ? { layoutIds } : {})
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
    const target = selectedHistoryDemoTarget();
    return {
      type: "demo",
      sharedId: "",
      language: target.language,
      demoListId: target.demoListId
    };
  }
  if (activeHistorySource !== "shared") return null;
  const sharedId = refs.historySharedSelect?.value || historySharedTemplateSelectOptions()[0]?.id || "";
  return sharedId ? { type: "shared", sharedId } : null;
}

async function publishPublicHistoryRecord(record, payload, { index = 0, records = historyRecords } = {}) {
  if (!canOpenAdminPublishedEdit()) {
    showToast(localText(
      "Only an admin can undo demo/template actions.",
      "Отменять действия в демо и шаблонах может только администратор."
    ), "error");
    return;
  }
  const target = selectedHistoryPublishedTarget();
  if (!target) {
    showToast(localText(
      "Could not identify the public layout for history.",
      "Не удалось определить public-укладку для истории."
    ), "error");
    return;
  }
  const impact = historyRollbackImpact(record, index, records);
  const confirmed = await askConfirmDialog(historyUndoConfirmation({
    actionText: historyUndoActionText(record, index, records),
    ...impact,
    localText
  }));
  if (!confirmed) return;
  const path = target.type === "demo"
    ? demoAdminStatePathForPublicListId(target.demoListId || "", target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
  const targetLanguage = target.type === "demo"
    ? target.language || uiLanguage
    : findSharedLayout(target.sharedId)?.language || uiLanguage;
  refs.historyDialog.close();
  refs.historyDetailDialog?.close();
  updateSyncUi(target.type === "demo"
    ? localText("Undoing the demo action...", "Отменяю действие в демо...")
    : localText("Undoing the template action...", "Отменяю действие в шаблоне..."));
  const data = await apiFetch(path, {
    method: "POST",
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
    body: JSON.stringify({
      title: record.title || record.listTitle || historyPayloadTitle(payload, historySourceLabel()),
      description: record.description || "",
      language: targetLanguage,
      payload
    })
  });
  const responseRecord = normalizeRemoteListRecord(data);
  const publishedPayload = normalizePublishedStatePayload(responseRecord?.payload) || payload;
  const publishedUpdatedAt = remoteUpdatedAt(responseRecord) || data?.updatedAt || data?.serverUpdatedAt || nowIso();
  if (target.type === "demo") {
    setDemoStatePayloadForLanguage(target.language || uiLanguage, publishedPayload, { listId: target.demoListId || "" });
    publishedListStateCache.set(target.demoListId || demoPublicListIdForLanguage(target.language || uiLanguage), publishedPayload, {
      updatedAt: publishedUpdatedAt
    });
  } else {
    const sharedLayout = findSharedLayout(target.sharedId);
    if (sharedLayout) sharedLayout.statePayload = publishedPayload;
    publishedItemKeyStateCache.set(sharedLayoutItemKey(target.sharedId), publishedPayload, {
      updatedAt: publishedUpdatedAt
    });
  }
  replaceActivePublishedHistoryDraft({
    activateLayout: activateAdminPublishedLayout,
    demoPublicListIdForLanguage,
    importDemoState: importDemoStateAsEditableLayout,
    materializeSharedLayout: materializeSharedLayoutForAdmin,
    normalizeLanguage: normalizeUiLanguage,
    payload: publishedPayload,
    removeLayoutTree,
    state,
    target
  });
  refreshPublishedLayoutView(target);
  updateSyncUi();
  showToast(localText("Action undone.", "Действие отменено."), "success");
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
  const controlsHeight = shouldUseStickyFilterControls() && refs.controls && !refs.controls.hidden
    ? Math.ceil(refs.controls.getBoundingClientRect().height)
    : 0;
  const tabsRow = document.querySelector(".tabs-row");
  const tabsHeight = tabsRow && tabsRow.offsetParent !== null
    ? Math.ceil(tabsRow.getBoundingClientRect().height)
    : 0;
  document.documentElement.style.setProperty("--sticky-controls-height", `${controlsHeight}px`);
  document.documentElement.style.setProperty("--sticky-tabs-height", `${tabsHeight}px`);
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
      ? localText(
        `Local copy shown: ${count} loaded · checking the server`,
        `Показана локальная копия: ${count} загружено · проверяю сервер`
      )
      : localText("Local copy shown · checking the server", "Показана локальная копия · проверяю сервер")
  );
  updateSyncUi(localText("Local copy shown · checking the server...", "Показана локальная копия · проверяю сервер..."));
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
    dictionaryValueLabel,
    fillSelect,
    getActiveEditableLayoutId,
    isDemoLayoutChoice,
    isLayoutLocked,
    isReadOnlyStateScope,
    isSharedLayoutView,
    layoutDisplayNameForLanguage,
    linkedSharedListLayout,
    publicLayoutChoiceForLayout,
    readonlyPublicTemplateOptionLabel,
    refs,
    renderItemCategoryPicker,
    selectedCategoryFilters,
    state,
    t,
    normalizeDemoName: normalizeDemoLayoutName,
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
  let count = 0;
  if (isSharedLayoutView()) {
    withSharedVirtualState(() => {
      ({ count } = toggleActiveLayoutNestedContainersCollapsedForState(state));
    });
  } else {
    ({ count } = toggleActiveLayoutNestedContainersCollapsedForState(state));
  }
  if (!count) return;
  capturePackingScroll();
  if (!isSharedLayoutView()) saveLocalUiState();
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
  let nestedCount = 0;
  let allCollapsed = false;
  if (isSharedLayoutView()) {
    withSharedVirtualState(() => {
      nestedCount = activeLayoutNestedContainerIdsForState(state).length;
      allCollapsed = allActiveLayoutNestedContainersCollapsedForState(state);
    });
  } else {
    nestedCount = activeLayoutNestedContainerIdsForState(state).length;
    allCollapsed = allActiveLayoutNestedContainersCollapsedForState(state);
  }
  const hasNested = nestedCount > 0;
  const available = isPackingView && hasNested;
  button.hidden = false;
  button.disabled = !available;
  button.tabIndex = available ? 0 : -1;
  button.setAttribute("aria-hidden", String(!available));
  button.classList.toggle("layout-collapse-all-button-placeholder", !available);
  button.classList.toggle("active", allCollapsed);
  const label = allCollapsed ? t("tooltips.expandAllInLayout") : t("tooltips.collapseAllInLayout");
  button.setAttribute("aria-label", label);
  button.title = label;
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
    refs.categoryFilter.textContent = dictionaryValueLabel(selectedCategoryFilters[0]);
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
        <span>${escapeHtml(dictionaryValueLabel(category))}</span>
      </label>
    `;
  }).join("") || `<div class="empty">${escapeHtml(t("empty.noCategoriesForSearch"))}</div>`;
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
      isolateLinkedLayoutEntities(state);
      normalizeItemCategories(state);
      saveState();
      render();
    }
  });
}

function highlight(value) {
  return highlightSearchText(value, refs.searchInput.value);
}
