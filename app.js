import { createPersonalPendingServerFormSession } from "./src/sync/personal-pending-server-form.js";
import { personalPendingServerUpdateSource, isPersonalPendingServerUpdate } from "./src/sync/personal-pending-server-update.js";
import { PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED } from "./src/sync/personal-photo-container-form-context.js";
import { PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED } from "./src/sync/personal-archive-photo-protocol.js";
import { PERSONAL_ARCHIVE_IMPORT_ENABLED } from "./src/sync/personal-archive-import-protocol.js";
import { preparePersonalArchivePhotoImport } from "./src/sync/personal-archive-photo-import.js";
import { assertPersonalArchivePhotoRecord } from "./src/sync/personal-archive-photo-outbox-record.js";
import { PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED } from "./src/sync/personal-photo-history-protocol.js";
import { preparePersonalArchiveImport } from "./src/sync/personal-archive-import.js";
import {
  STORAGE_KEY,
  APP_VERSION,
  SYNC_META_KEY,
  BASE_STATE_KEY,
  RECOVERY_STATE_KEY,
  RECOVERY_STATE_MAX,
  GUEST_WORKSPACE_MANIFEST_KEY,
  GUEST_LOGIN_HANDOFF_KEY,
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
  PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY,
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
import { prepareAdminTemplateTreeCopy } from "./src/sync/admin-template-tree-copy.js";
import { prepareAdminTemplateItemCopy } from "./src/sync/admin-template-item-copy.js";
import { prepareAdminTemplateItemReplacement } from "./src/sync/admin-template-item-replace.js";
import { prepareAdminTemplateContainerReplacement } from "./src/sync/admin-template-container-replace.js";
import { prepareAdminTemplatePlacementMove } from "./src/sync/admin-template-placement-move.js";
import { prepareAdminTemplatePlacementGroup } from "./src/sync/admin-template-placement-group.js";
import { prepareAdminTemplatePlacementRemoval } from "./src/sync/admin-template-placement-remove.js";
import { prepareAdminTemplateCatalogDeletion } from "./src/sync/admin-template-catalog-delete.js";
import { prepareAdminTemplateMissingItems } from "./src/sync/admin-template-missing-items.js";
import {
  bindCategoryFilterResetVisibility,
  bindCategorySearch,
  categorySearchEmptyHtml,
  renderCategorySearchOption,
  resetCategorySearch,
  syncCategoryFilterResetVisibility
} from "./src/ui/category-search.js";
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
import { ensureAdminPublicCopyTargets } from "./src/public/admin-public-copy-targets.js";
import {
  containerCopySnapshotForContext,
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
  shouldRenderGuestDemoPreviewDuringAuthCheck
} from "./src/public/guest-demo-startup.js";
import { handleGuestLanguageLayoutSwitch } from "./src/public/guest-language-layout.js";
import {
  ensureGuestSharedLinkCopyTargetLayout,
  recordGuestSharedLinkDetachedItem
} from "./src/public/guest-shared-link-target.js";
import {
  importDemoStateAsEditableLayout as importDemoStateAsEditableLayoutValue,
  repairAdminDemoLayout as repairAdminDemoLayoutValue
} from "./src/public/admin-demo-layout.js";
import { replaceActivePublishedHistoryDraft } from "./src/public/history-restore-view.js";
import {
  captureHistoryNavigationContext,
  preferredHistoryLayout,
  retargetMissingHistoryLayout,
  restoreHistoryActiveLayout,
  restoreHistoryNavigationContext
} from "./src/ui/history-navigation.js";
import {
  renderHistoryTemplateSourceSelect,
  toggleHistoryDeletedSources
} from "./src/ui/history-template-source-select.js";
import {
  canImportGuestLayoutsForAuthenticatedUser,
  guestCandidateLayouts as guestCandidateLayoutsValue,
  guestLayoutHasUserContentEdits,
  guestLocalLayoutCandidateFromState,
  importGuestLocalLayoutsToState,
  persistGuestImportBeforeCleanup,
  removeLegacyGuestImportPlaceholders,
  validateGuestImportSyncState
} from "./src/public/guest-login-import.js";
import {
  consumeStoredGuestLoginHandoff,
  createGuestWorkspaceSessionTracker,
  recordGuestWorkspaceSessionChanges,
  resolveStoredGuestLoginHandoffCandidate,
  storeGuestLoginHandoff
} from "./src/public/guest-login-handoff.js";
import {
  createGuestLoginHandoffCoordinator,
  runGuestLoginHandoffImport
} from "./src/public/guest-login-import-flow.js";
import {
  NEW_ACCOUNT_DEFAULT_DEMO_FLAG,
  createNewAccountDemoSeedCoordinator,
  isLayoutFreeNewAccountState,
  isNewAccountDefaultDemoAccount,
  markNewAccountDefaultDemoLayout,
  shouldSeedNewAccountDemoLayout
} from "./src/public/new-account-demo-seed.js";
import {
  canEditLocalUnpublishedTemplate as canEditLocalUnpublishedTemplateValue,
  canEditManagedTemplate as canEditManagedTemplateValue,
  publishedTemplateBlockReason,
  readonlyPublicTemplateOptionLabel,
  shouldUseReadonlyTemplateCache
} from "./src/public/public-template-availability.js";
import {
  createPublicTemplateOfflineCache,
  hydratePublicTemplateOfflineCache,
  loadPublicTemplateOfflineCache,
  savePublicTemplateOfflineCache
} from "./src/public/public-template-offline-cache.js";
import { savePublishedLayoutRecordFlow } from "./src/public/published-layout-save-flow.js";
import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson } from "./src/sync/admin-template-protocol.js";
import { createAdminTemplateClient } from "./src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans, adminTemplateCopyPlan, adminTemplateSavePlan, adminTemplateSourceSavePlan } from "./src/sync/admin-template-save-plan.js";
import { pendingAdminTemplateCopySource } from "./src/sync/admin-template-copy-source.js";
import { createAdminTemplateSourceBaseline } from "./src/sync/admin-template-source-baseline.js";
import { adminTemplateCopyPayloadDigest } from "./src/sync/admin-template-copy-projection.js";
import { createAdminTemplateOrderBatch } from "./src/public/admin-template-order-batch.js";
import { initializeNewAdminTemplateDraft } from "./src/public/admin-template-new-draft.js";
import { createAdminTemplateLegacyChoice } from "./src/public/admin-template-legacy-choice.js";
import { createAdminTemplateStopChoice } from "./src/public/admin-template-stop-choice.js";
import { createAdminTemplateRecovery } from "./src/public/admin-template-recovery.js";
import { createAdminTemplateRecoveryDialog } from "./src/ui/admin-template-recovery-dialog.js";
import { adminTemplateComparisonHtml } from "./src/ui/admin-template-comparison.js";
import { projectAdminTemplateServerVariant, applyAdminTemplateServerVariant, adminTemplateCopiedLayoutId, isCausalCopyLayoutId } from "./src/public/admin-template-server-variant.js";
import { createAdminTemplateSaveFlow, adminTemplateEditorSource, stripAdminTemplateEditorMetadata } from "./src/public/admin-template-causal-save-flow.js";
import {
  markManagedTemplateDraftSyncPending,
  isManagedTemplateUnpublished,
  managedTemplatePublicationAction,
  shouldAutoPublishManagedTemplate,
  shouldConfirmManagedTemplateTransition
} from "./src/public/template-publication.js";
import { unpublishManagedTemplateFlow } from "./src/public/template-unpublish-flow.js";
import {
  deletePublishedDemoTemplateRecord,
  unpublishPublishedDemoTemplateRecord
} from "./src/public/public-demo-template-admin.js";
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
  PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY,
  publicTemplatePayloadPath
} from "./src/public/public-template-payload-api.js";
import {
  REQUIRED_ADMIN_API_CAPABILITIES,
  REQUIRED_ADMIN_API_VERSION
} from "./src/config/api-contract.js";
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
  adminDemoHistoryEntries,
  adminSharedHistoryEntries,
  isAdminTemplateHistoryListId,
  privateHistoryListRecords,
  normalizeAdminTemplateHistoryRecords
} from "./src/public/admin-template-history-catalog.js";
import {
  hydrateAdminTemplateDraftsFlow,
  pendingAdminTemplateDraftLayouts
} from "./src/public/admin-template-draft-sync.js";
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
import { hydrateCausalAdminTemplateDrafts } from "./src/public/admin-template-causal-hydration.js";
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
  removeRuntimeSharedLayout,
  serverConfirmedSharedLayoutsFromPublicRecords,
  sharedLayoutIdFromPublicListRecord,
  sharedLayoutLanguageFromPayload,
  sharedGearPhotos,
  updateSharedLayoutCatalogEntryMetadata,
  upsertRuntimeSharedLayout,
  visibleSharedLayoutsForLanguage
} from "./src/public/shared-layouts.js";
import { refreshPublicSharedLayoutCatalogFlow } from "./src/public/shared-catalog-refresh-flow.js";
import { copySharedLayoutFlow } from "./src/public/shared-layout-copy-flow.js";
import { applyPublishedPayloadPhotosToLayoutState } from "./src/public/published-payload-photos.js";
import { publishedPhotoUploadRequest } from "./src/public/published-photo-upload.js";
import {
  deletePublishedSharedTemplate as deletePublishedSharedTemplateRecord,
  purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState,
  unpublishPublishedSharedTemplate
} from "./src/public/shared-layout-admin.js";
import {
  buildSharedListUrlFromHref,
  personalCopyUrlFromSharedLink,
  sharedLayoutIdFromUrl,
  sharedListIdFromUrl
} from "./src/public/shared-link-url.js";
import { shouldPreserveLinkedSharedListOnLanguageChange } from "./src/public/shared-link-language.js";
import { readSharedListPublishOptions, sharedListLinkResultHtml, sharedListPublishDialogHtml } from "./src/public/shared-list-publish.js";
import { FRONTEND_PERMISSION_ACTIONS, can as canPermission } from "./src/auth/permissions.js";
import {
  magicLinkErrorI18nKey,
  magicLinkTokenFromInput
} from "./src/auth/magic-link-confirmation.js";
import {
  createSharedVirtualState as createSharedVirtualStateForPublic,
  sharedVirtualContainerId
} from "./src/public/shared-virtual-state.js";
import {
  sharedEntityAncestorContainerIds,
  sharedEntityTargetFromUrl
} from "./src/public/shared-entity-link.js";
import { focusSharedEntityTarget } from "./src/ui/shared-entity-focus.js";
import {
  PUBLIC_CATALOG_STARTUP_TIMEOUT_MS,
  renderBeforeFinishingAppStartup,
  resolveAppStartupLanguage,
  waitForStartupTask
} from "./src/ui/app-startup.js";
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
  isReadOnlyBikePackingMutationContext,
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
  markPhotoUploadBatch,
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
  changedPersonalLayoutOrderIds,
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
  layoutItemQuantityMigrationRecovered,
  layoutDisplayNameForLanguage,
  normalizeLayoutArrangement,
  normalizeLayoutFields,
  repairPublishedLayoutArrangement,
  snapshotContainerTreeFromLayoutArrangement
} from "./src/state/layout-normalize.js";
import {
  getLayoutItemQuantity as getLayoutItemQuantityForState,
  itemWithLayoutQuantity as itemWithLayoutQuantityForState,
  setLayoutItemQuantity as setLayoutItemQuantityForState
} from "./src/state/layout-item-quantity.js";
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
  itemCopyNamespacePolicy,
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
  makeContainerCopyNameForLayout,
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
import {
  fetchManufacturerCatalogScans,
  saveManufacturerCatalogDecision
} from "./src/sync/manufacturer-catalog-review.js";
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
import { experimentTransport, transportPhotoFetch } from "./src/sync/experiment-transport.js";
import { preparePersonalShareLink, PERSONAL_SHARE_LINK_ENABLED } from "./src/sync/personal-share-link.js";
import { createPersonalSaveOutbox, recoverPersonalSaveListId, PERSONAL_SAVE_OUTBOX_ENABLED } from "./src/sync/personal-save-outbox.js";
import { PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED, personalPendingArchiveUpdateSource, isPersonalPendingArchiveUpdate } from "./src/sync/personal-pending-archive-update.js";
import { PERSONAL_PENDING_GUEST_UPDATE_ENABLED, personalPendingGuestUpdateSource, isPersonalPendingGuestUpdate } from "./src/sync/personal-pending-guest-update.js";
import { createPersonalPendingGuestFormSession } from "./src/sync/personal-pending-guest-form.js";
import { PERSONAL_PENDING_PUBLIC_UPDATE_ENABLED, personalPendingPublicUpdateSource, isPersonalPendingPublicUpdate } from "./src/sync/personal-pending-public-update.js";
import { createPersonalPendingPublicFormSession } from "./src/sync/personal-pending-public-form.js";
import { PERSONAL_PENDING_FORM_UPDATE_ENABLED, personalPendingFormUpdateSource, isPersonalPendingFormUpdate } from "./src/sync/personal-pending-form-update.js";
import { createPersonalPendingFormSession } from "./src/sync/personal-pending-form-session.js";
import { createPersonalPendingPhotoFormSession } from "./src/sync/personal-pending-photo-form-session.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./src/sync/personal-photo-form-owner-result.js";
import { PERSONAL_SERVER_PHOTO_FORM_ENABLED, PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED } from "./src/sync/personal-server-photo-form-result.js";
import { PERSONAL_PUBLIC_PHOTO_FORM_ENABLED, PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED } from "./src/sync/personal-public-photo-form-result.js";
import { personalPendingPhotoFormChain } from "./src/sync/personal-pending-photo-form-chain.js";
import { PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED } from "./src/sync/personal-photo-item-form-context.js";
import { createPersonalPendingArchiveFormSession } from "./src/sync/personal-pending-archive-form.js";
import { PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, isPersonalPendingPhotoOwnerDeletion,
  personalPendingPhotoOwnerDeletionForm } from "./src/sync/personal-pending-photo-owner-deletion.js";
import { PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED, personalPendingPhotoCopyDeletionForm,
  isPersonalPendingPhotoCopyDeletion } from "./src/sync/personal-pending-photo-copy-deletion.js";
import { isKnownEmptyPersonalSave } from "./src/sync/personal-empty-save.js";
import { createPersonalSaveRecovery } from "./src/sync/personal-save-recovery.js";
import { createPersonalSaveRecoveryDialog } from "./src/ui/personal-save-recovery-dialog.js";
import { createPersonalPhotoActionStore } from "./src/sync/personal-photo-action-store.js";
import { PERSONAL_GUEST_IMPORT_ENABLED } from "./src/sync/personal-guest-import-protocol.js";
import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED, personalPublicMissingPreview } from "./src/sync/personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED } from "./src/sync/personal-public-import-protocol.js";
import { PERSONAL_SERVER_IMPORT_ENABLED, personalServerImportSource } from "./src/sync/personal-server-import-source.js";
import { preparePersonalServerImportSelection, preparePersonalServerEntitySelection } from "./src/sync/personal-server-import-selection.js";
import { createPersonalServerImportSelectionStore } from "./src/sync/personal-server-import-selection-store.js";
import { preparePersonalServerImport } from "./src/sync/personal-server-import.js";
import { personalServerPendingPreparations, recoverPersonalServerImportPreparation, choosePersonalServerPreparation } from "./src/sync/personal-server-import-preparation-recovery.js";
import { preparePersonalPublicImportSelection, preparePersonalPublicEntitySelection } from "./src/sync/personal-public-import-selection.js";
import { createPersonalPublicImportSelectionStore, PERSONAL_PUBLIC_PREPARATION_CHOICE_ENABLED } from "./src/sync/personal-public-import-selection-store.js";
import { preparePersonalPublicImport } from "./src/sync/personal-public-import.js";
import { personalPublicImportSnapshot } from "./src/sync/personal-public-import-snapshot.js";
import { PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED, personalAdminTemplateImportSource } from "./src/sync/personal-admin-template-source.js";
import { personalPublicPendingPreparations, recoverPersonalPublicImportPreparation, choosePersonalPublicPreparation } from "./src/sync/personal-public-import-preparation-recovery.js";
import { resolvePersonalServerPreparation, personalServerRecoverablePreparations } from "./src/sync/personal-server-preparation-resolution.js";
import { resolvePersonalPublicPreparation, personalPublicRecoverablePreparations } from "./src/sync/personal-public-preparation-resolution.js";
import { PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED } from "./src/sync/personal-public-preparation-resolution-protocol.js";
import { PERSONAL_IMPORT_PHOTO_FORM_ENABLED, PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED } from "./src/sync/personal-import-photo-form-result.js";
import { PERSONAL_PENDING_IMPORT_CREATE_ENABLED, PERSONAL_PENDING_PUBLIC_CREATE_ENABLED, createPersonalPendingImportCreateSession } from "./src/sync/personal-pending-import-create.js";
import { preparePersonalGuestImportSelection } from "./src/sync/personal-guest-import-selection.js";
import { createPersonalGuestImportSelectionStore } from "./src/sync/personal-guest-import-selection-store.js";
import { preparePersonalGuestImport } from "./src/sync/personal-guest-import.js";
import { personalGuestSelectionBody } from "./src/sync/personal-guest-import-completion.js";
import { loadPersonalGuestImportPhoto } from "./src/sync/personal-guest-import-photo-loader.js";
import { personalGuestBaseNeedsPreparation } from "./src/sync/personal-guest-import-base.js";
import { recoverPersonalGuestImportLink } from "./src/sync/personal-guest-import-link-recovery.js";
import { inspectPersonalPhotoRecovery } from "./src/sync/personal-photo-recovery-inventory.js";
import { readPersonalPhotoRecoveryInCurrentContext } from "./src/sync/personal-photo-recovery-read.js";
import { createPersonalPhotoRecoveryArchive } from "./src/sync/personal-photo-recovery-archive.js";
import { checkPersonalPhotoRecoveryResult } from "./src/sync/personal-photo-recovery-check.js";
import { cancelPersonalPhotoRecovery, personalPhotoRecoveryCancellationEnabled,
  personalPhotoRecoveryCancellationHead } from "./src/sync/personal-photo-recovery-cancel.js";
import { PERSONAL_PHOTO_OUTBOX_ENABLED } from "./src/sync/personal-photo-outbox-record.js";
import { personalPhotoFormGatesEnabled } from "./src/sync/personal-photo-form-gates.js";
import { createPersonalPhotoFormSession } from "./src/sync/personal-photo-form-session.js";
import { drainPersonalPhotoForm } from "./src/sync/personal-photo-form-drain.js";
import { createPersonalPhotoStaging } from "./src/sync/personal-photo-staging.js";
import { assertPersonalPhotoFormRecord } from "./src/sync/personal-photo-form-outbox-record.js";
import { createPersonalPhotoEditFormSession } from "./src/sync/personal-photo-edit-form.js";
import { createPersonalPhotoCopyFormSession } from "./src/sync/personal-photo-copy-form.js";
import { createPersonalPhotoCopyBatchSession } from "./src/sync/personal-photo-copy-batch.js";
import { createPersonalPhotoTreeCopySession } from "./src/sync/personal-photo-tree-copy.js";
import { PERSONAL_PHOTO_TREE_COPY_ENABLED } from "./src/sync/personal-photo-copy-batch-protocol.js";
import { PERSONAL_PHOTO_TREE_LINK_ENABLED } from "./src/sync/personal-photo-tree-source.js";
import { PERSONAL_PHOTO_COPY_BATCH_ENABLED, assertPersonalPhotoCopyBatchRecord } from "./src/sync/personal-photo-copy-batch-protocol.js";
import { PERSONAL_PHOTO_COPY_FORM_ENABLED } from "./src/sync/personal-photo-copy-source.js";
import { PERSONAL_PHOTO_EDIT_FORM_ENABLED } from "./src/sync/personal-photo-form-protocol.js";
import { preservesConfirmedPersonalPhotoChain, preservesConfirmedPersonalPhotos, PERSONAL_PHOTO_OWNER_DELETION_ENABLED } from "./src/sync/personal-confirmed-photos.js";
import { personalSnapshotWithUiPreferences } from "./src/sync/personal-snapshot-codec.js";
import { drainPersonalSaveWithReconciliation } from "./src/sync/personal-save-drain.js";
import { ensureCausalPersonalListId, initialPersonalListId } from "./src/sync/causal-personal-list-bootstrap.js";
import { personalDeletionIntent, personalDeletionReference, preservesUndeletedEntities, preparePersonalDeletionBatch } from "./src/sync/personal-deletion-intent.js";
import { personalCopyIntent, preparePersonalCopyBatch } from "./src/sync/personal-copy-intent.js";
import { preparePersonalLayoutDeletion } from "./src/sync/personal-layout-deletion.js";
import { preparePersonalDictionaryMutation } from "./src/sync/personal-dictionary-mutation.js";
import { preparePersonalPlacementMutation, personalPlacementIntent } from "./src/sync/personal-placement-mutation.js";
import { preparePersonalHistoryRestore } from "./src/sync/personal-history-restore.js";
import { preparePersonalListMigration, PERSONAL_LIST_MIGRATION_ENABLED } from "./src/sync/personal-list-migration.js";
import { preparePersonalContainerTreeCopy, personalContainerTreeIntent } from "./src/sync/personal-container-tree-copy.js";
import { preparePersonalLayoutCopy, personalLayoutCopyIntent, PERSONAL_PHOTO_LAYOUT_COPY_ENABLED } from "./src/sync/personal-layout-copy.js";
import { preparePersonalItemCopyPlacement, personalItemCopyPlacementIntent, createPersonalPhotoItemCopyPlacementSession } from "./src/sync/personal-item-copy-placement.js";
import { PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED } from "./src/sync/personal-photo-copy-batch-protocol.js";
import { personalBusinessPayload } from "./src/sync/personal-server-payload.js";
import { createListOperationQueue } from "./src/sync/list-operation-queue.js";
import { bindExperimentTransportMenu } from "./src/ui/experiment-transport-settings.js";
import { installExperimentBanner } from "./src/ui/experiment-banner.js";
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
  getPhotoCacheScope,
  hasRemotePhotoUrl,
  inspectRecordRemotePhotoSources,
  isPhotoUsableFromServer,
  isPhotoStoredForList,
  keepRemoteOnlyPhotoReference,
  listCachedPhotos,
  photoRecordIdMatchesRemoteSource,
  photoRemoteSrc,
  photoShouldBeCopiedToCurrentList,
  putCachedPhoto,
  setPhotoCacheScope
} from "./src/sync/photos.js";
import {
  markPhotoUploadStarted,
  uploadPhotoToPath
} from "./src/sync/photo-upload-flow.js";
import {
  collectOfflinePhotoCacheTasks,
  createOfflinePhotoCacheController,
  createOfflinePhotoRenderCoordinator
} from "./src/sync/offline-photo-cache.js";
import {
  OFFLINE_LAYOUT_SELECTION_KEY,
  offlineLayoutPhotoCount,
  offlinePhotoCacheUsage,
  offlinePhotoStateForLayouts,
  pruneOfflineRemotePhotoCache,
  readOfflineLayoutIds,
  writeOfflineLayoutIds
} from "./src/sync/offline-layout-selection.js";
import {
  browserStorageEstimate,
  cacheManufacturerCatalogPreviews,
  clearManufacturerCatalogOffline,
  manufacturerCatalogOfflineUsage
} from "./src/sync/manufacturer-catalog-offline.js";
import {
  createPhotoDownloadCoordinator,
  PHOTO_DOWNLOAD_PRIORITY
} from "./src/sync/photo-download-coordinator.js";
import { acquirePhotoUploadSlot } from "./src/sync/photo-upload-lock.js";
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
  backupCopyLayoutName,
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
import { createManufacturerCatalogReviewDialogController } from "./src/ui/manufacturer-catalog-review-dialog.js";
import { createConnectionStatusController } from "./src/ui/connection-status.js";
import { shouldReportConnectionFailure } from "./src/sync/connection-failure-policy.js";
import { createNetworkTransitionController } from "./src/sync/network-transition.js";
import {
  bindDictionaryControls,
  renameDictionaryEntry as renameDictionaryEntryValue
} from "./src/ui/dictionary-bindings.js";
import {
  bindLayoutEditorControls,
  bindRootContainersEditorControls
} from "./src/ui/settings-editor-bindings.js";
import { openHelpLimitsDialogUi } from "./src/ui/help-limits-dialog.js";
import {
  bindHorizontalTouchScroll,
  resetHorizontalTouchScroll
} from "./src/ui/horizontal-touch-scroll.js";
import {
  renderEmptyState,
  renderPackingAddRootCard,
  renderPackingEmptyState
} from "./src/ui/empty-state.js";
import {
  applyContentFilterHighlight,
  contentFilterHasNoResults,
  renderFilterControls,
  resetContentFilterControls,
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
import { beginSharedLayoutCopyProgress } from "./src/ui/shared-layout-copy-progress.js";
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
  getSavedAuthScopeKeyFromStorage,
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
  createDemandDrivenPhotoPreviewLoader,
  hydrateItemPhotos,
  photoDialogStatusText,
  photoStatusText,
  renderPhotoGalleryHtml,
  renderItemPhotoHtml,
  updatePhotoGalleryUploadProgress
} from "./src/ui/photo-gallery.js";
import { createPhotoObjectUrlRegistry } from "./src/ui/photo-object-url-registry.js";
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
  historyQuantityStorageScope,
  historyRecordAction,
  historyRestoreScopeText,
  historyRestoreActionText,
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
import {
  createStableSyncStatusMessageController,
  isTransientSyncProgressMessage,
  OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE,
  offlineRememberedStatusMessages,
  updateSyncUiControls
} from "./src/ui/sync-ui.js";
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
  setupTouchActionButtonFeedback
} from "./src/ui/touch-actions.js";
import { bindMainTabTouchNavigation } from "./src/ui/main-tab-touch-navigation.js";
import {
  bindExplicitViewportScrollIntent,
  hasExplicitViewportScrollIntent
} from "./src/ui/viewport-scroll-intent.js";
import { createDesktopInputLayoutController } from "./src/ui/desktop-input-layout.js";
import { createMobileDialogFieldControls } from "./src/ui/mobile-dialog-field-controls.js";
import {
  DEFAULT_INTERFACE_COLOR_BRIGHTNESS,
  DEFAULT_INTERFACE_COLOR_THEME,
  applyInterfaceColorTheme,
  createInterfaceColorThemeController,
  normalizeInterfaceColorBrightness,
  normalizeInterfaceColorTheme
} from "./src/ui/interface-color-theme.js";
import {
  scrollViewportTo,
  viewportScrollLeft,
  viewportScrollTop
} from "./src/ui/viewport-scroll-host.js";
import { syncMainViewScrollHost } from "./src/ui/main-view-scroll-host.js";
import { createStickyFilterControlsController } from "./src/ui/sticky-filter-controls.js";

const sharedLayoutsByLanguage = createSharedLayoutsByLanguage([], { languages: SUPPORTED_LANGUAGES });
const locations = [];
const categories = [];
let serverConfirmedDemoTemplates = [];
let serverConfirmedSharedLayouts = [];
let adminTemplateHistoryRecords = [];
let activeDemoTemplateListId = "";
const publishedListStateCache = createPublicTemplatePayloadCache({
  cloneValue: clone,
  normalizePayload: normalizePublishedStatePayload
});
const publishedItemKeyStateCache = createPublicTemplatePayloadCache({
  cloneValue: clone,
  normalizePayload: normalizePublishedStatePayload
});
const {
  forget: forgetDeletedSharedLayoutId,
  has: isDeletedSharedLayoutId,
  remember: rememberDeletedSharedLayoutId
} = createDeletedSharedLayoutStore({ demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID });
let uiLanguage = loadUiLanguage();
const missingDemoPublicTemplates = {};
applyPublicTemplateLanguage();

let localStorageScopeKey = GUEST_STORAGE_SCOPE;
const personalSaveOutboxes = new Map();
let personalInitialSaveOutbox = null;
let personalPhotoRecoveryCheck = null, personalPhotoRecoverySource = null;
let personalPhotoFormPreparing = 0, personalPhotoFormLiveSource = null;
const personalSaveRecovery = createPersonalSaveRecovery({
  isCurrentScope: scopeKey => scopeKey === localStorageScopeKey && scopeKey?.startsWith("id:"),
  onBlocked: failure => {
    personalSaveRecoveryDialog?.show();
    personalSaveRecoveryDialog?.setReason(failure.error.code);
    queueMicrotask(() => updateSyncUi());
  }
});
const personalSaveRecoveryDialog = personalSavePilotEnabled() ? createPersonalSaveRecoveryDialog({
  getLanguage: () => uiLanguage,
  getRecoveryCopy: () => personalSaveRecovery.recoveryCopy(localStorage),
  ownsError: error => personalSaveRecovery.owns(error),
  canRecoverDraft: () => personalSaveRecovery.canRecoverDraft(),
  recoverDraft: () => recoverStalePersonalDraft(),
  canExportPhotos: () => Boolean(personalPhotoRecoverySource && personalPhotoRecoverySource.store.binding.scopeKey === localStorageScopeKey),
  canCheckPhotos: () => Boolean(personalPhotoRecoverySource && currentUser && !isForcedOffline()
    && personalPhotoRecoverySource.store.binding.scopeKey === localStorageScopeKey),
  checkPhotoResult: () => checkRetainedPersonalPhotoResult(),
  canCancelPhotos: () => canCancelRetainedPersonalPhoto(),
  cancelPhotoUpload: () => cancelRetainedPersonalPhoto(),
  canResumePhotos: () => canResumeRetainedPersonalPhotoForm(),
  resumePhotoUpload: () => drainLivePersonalPhotoForm({ recovery: true }),
  getPreparationChoices: () => retainedPersonalPublicPreparationChoices(),
  choosePreparation: operationId => chooseRetainedPersonalPublicPreparation(operationId),
  getPublicPreparations: () => retainedPersonalPublicPreparations(),
  resolvePublicPreparation: (operationId, cancel) => resolveRetainedPersonalPublicPreparation(operationId, cancel),
  getPhotoRecoveryArchive: () => createPersonalPhotoRecoveryArchive({ ...personalPhotoRecoverySource,
    guestSelectionStore: personalPhotoRecoverySource?.store && personalGuestSelectionStore(personalPhotoRecoverySource.store.binding),
    publicSelectionStore: personalPhotoRecoverySource?.store && personalPublicSelectionStore(personalPhotoRecoverySource.store.binding),
    serverSelectionStore: personalPhotoRecoverySource?.store && personalServerSelectionStore(personalPhotoRecoverySource.store.binding),
    getContext: personalPhotoRecoveryReadContext, getRecoveryCopy: () => personalSaveRecovery.recoveryCopy(localStorage) })
}) : null;
let applyingLayoutArrangement = false;
let hadLocalStateAtStartup = hasLocalSavedState();
const startupSyncMeta = loadSyncMeta();
let hadRemoteBaselineAtStartup = hasStoredLocalValue(BASE_STATE_KEY) ||
  Boolean(startupSyncMeta.serverUpdatedAt || startupSyncMeta.stateRevision || startupSyncMeta.payloadHash);
const state = loadState();
hydrateLocalSharedTemplateCatalogFromState(state);
const hydratedPublicTemplateCache = hydratePublicTemplateOfflineCache(
  loadPublicTemplateOfflineCache(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY),
  {
    demoTemplates: serverConfirmedDemoTemplates,
    sharedTemplates: serverConfirmedSharedLayouts,
    mergeDemoTemplates: mergeServerDemoTemplateCatalog,
    mergeSharedTemplates: mergeSharedLayoutCatalogEntries,
    setDemoPayload: setDemoStatePayloadForLanguage,
    upsertSharedTemplate: (entry) => upsertRuntimeSharedLayout(sharedLayoutsByLanguage, entry)
  }
);
serverConfirmedDemoTemplates = hydratedPublicTemplateCache.demoTemplates;
serverConfirmedSharedLayouts = hydratedPublicTemplateCache.sharedTemplates;
let startupLocalStateWasFallback = hadLocalStateAtStartup && !hadRemoteBaselineAtStartup && isGeneratedStartupFallbackState(state);
let hadAuthoritativeLocalStateAtStartup = hadLocalStateAtStartup && !startupLocalStateWasFallback;
const guestWorkspaceSessionTracker = createGuestWorkspaceSessionTracker(state);
const uiSettings = loadUiSettings();
let interfaceColorBrightness = normalizeInterfaceColorBrightness(uiSettings.interfaceColorBrightness);
let interfaceColorTheme = normalizeInterfaceColorTheme(uiSettings.interfaceColorTheme);
applyInterfaceColorTheme({
  brightness: interfaceColorBrightness,
  documentRef: document,
  value: interfaceColorTheme
});
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
let pickerListPhotos = uiSettings.pickerListPhotos === true;
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
let syncMeta = startupSyncMeta;
let syncDevice = loadSyncDevice();
const conflictFormatter = createConflictValueFormatter({
  getItemName: (id) => state.items?.[id]?.name || id,
  getContainerName: (id) => state.containers?.[id]?.name || id,
  itemCategories,
  comparableValueForMerge,
  isMetaField: isConflictMetaField,
  localText,
  settingLabel,
  valuesEqual: sameJson
});
let currentUser = null;
let currentAuthorization = null;
let offlineRememberedUser = null;
let offlineRememberedSessionReason = "";
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
let historyNavigationContext = null;
let adminReportsDialogController = null;
let manufacturerCatalogReviewDialogController = null;
let stableSyncStatusMessageController = null;
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
let localDemoCopyInFlight = null;
let sharedPickerSourceItemId = "";
let sharedPickerSourceContainerId = "";
const photoObjectUrls = createPhotoObjectUrlRegistry();
setPhotoCacheScope(localStorageScopeKey);
photoObjectUrls.activateScope(localStorageScopeKey);
const photoDownloadCoordinator = createPhotoDownloadCoordinator();
const photoPreviewLoader = createDemandDrivenPhotoPreviewLoader({
  photoObjectUrls,
  downloadCoordinator: photoDownloadCoordinator,
  getCachedPhotoForPreview: (id, scopeKey) => getCachedPhoto(id, scopeKey),
  putCachedPhotoForPreview: (record, scopeKey) => putCachedPhoto(record, scopeKey),
  shouldPersistPreview: (task) => (
    !isReadOnlyStateScope() && selectedOfflinePhotoKeySet().has(String(task?.key || ""))
  ),
  getPreparedPreviewKeys: () => isReadOnlyStateScope() ? new Set() : selectedOfflinePhotoKeySet(),
  getScopeKey: () => isReadOnlyStateScope()
    ? `${localStorageScopeKey}|readonly:${activeReadOnlyLayoutId()}:${uiLanguage}`
    : localStorageScopeKey,
  activateScope: (scopeKey) => offlinePhotoRenderCoordinator.activateScope(scopeKey)
});
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
const stickyFilterControlsController = createStickyFilterControlsController({
  documentRef: document,
  isSearchEditing: () => isSearchInputEditing(),
  refs,
  shouldKeepStable: () => shouldKeepScopedControlsStable(),
  shouldUseSticky: () => shouldUseStickyFilterControls(),
  windowRef: window
});
const desktopInputLayoutController = createDesktopInputLayoutController({
  documentRef: document,
  getLanguage: () => uiLanguage,
  translate: t,
  windowRef: window
});
createMobileDialogFieldControls({ refs, windowRef: window });
const connectionStatusController = createConnectionStatusController({
  getElement: () => refs.connectionStatus,
  getMessage: (kind) => t(kind === "timeout" ? "sync.serverTimeoutLocal" : "sync.noConnectionLocal"),
  onChange: () => updateSyncUi()
});
const offlinePhotoRenderCoordinator = createOfflinePhotoRenderCoordinator({
  getState: () => isReadOnlyStateScope() ? createSharedVirtualState() : state,
  getScopeKey: () => isReadOnlyStateScope()
    ? `${localStorageScopeKey}|readonly:${activeReadOnlyLayoutId()}:${uiLanguage}`
    : localStorageScopeKey,
  getCachedPhoto,
  putCachedPhoto,
  listCachedPhotos,
  deleteCachedPhoto,
  onScopeChange: setPhotoCacheScope,
  objectUrls: photoObjectUrls
});
const offlinePhotoCacheController = createOfflinePhotoCacheController({
  getState: () => isReadOnlyStateScope() ? createSharedVirtualState() : selectedOfflinePhotoState(),
  isEnabled: () => (
    !isForcedOffline() &&
    !initialRemoteLoadPending
  ),
  getProgressMessage: () => t("sync.cachingPhotosOffline"),
  getFailureMessage: () => t("sync.photoOfflineCacheIncomplete"),
  onChange: () => {
    updateSyncUi();
    if (!offlinePhotoCacheController.isRunning()) photoPreviewLoader.observe(document);
  },
  getCacheOptions: () => {
    const scopeKey = getPhotoCacheScope();
    return {
      fetchImpl: transportPhotoFetch,
      getCachedPhoto: (id) => getCachedPhoto(id, scopeKey),
      putCachedPhoto: (record) => putCachedPhoto(record, scopeKey),
      getMemoryRecord: (task) => photoObjectUrls.getRecord(task),
      concurrency: 1,
      downloadCoordinator: photoDownloadCoordinator,
      downloadPriority: PHOTO_DOWNLOAD_PRIORITY.OFFLINE,
      background: true,
      onRecord: (task, record) => {
        if (scopeKey !== localStorageScopeKey) return;
        photoObjectUrls.setRecord(task, record);
      }
    };
  }
});
const layoutLoadStatus = createLayoutLoadStatusController({
  getElement: () => refs.layoutLoadStatus
});
const {
  openModalDialog,
  setupModalScrollLock
} = createModalScrollLockController();
const interfaceColorThemeController = createInterfaceColorThemeController({
  brightnessInput: refs.interfaceColorBrightness,
  brightnessOutput: refs.interfaceColorBrightnessValue,
  defaultButton: refs.interfaceColorDefaultBtn,
  documentRef: document,
  dialog: refs.interfaceColorDialog,
  getLanguage: () => uiLanguage,
  initialBrightness: interfaceColorBrightness,
  initialValue: interfaceColorTheme,
  menuButton: refs.interfaceColorMenuBtn,
  onBrightnessChange: (value) => {
    interfaceColorBrightness = value;
    saveUiSettings();
  },
  onChange: (value) => {
    interfaceColorTheme = value;
    saveUiSettings();
  },
  openDialog: openModalDialog,
  optionsRoot: refs.interfaceColorOptions,
  translate: t
});
const {
  askConfirmDialog,
  askUnsavedChangesDialog,
  openConfirmDialog
} = createConfirmDialogController({ refs, openModalDialog });
const guestLoginHandoffCoordinator = createGuestLoginHandoffCoordinator({
  getCandidate: storedGuestLoginHandoffCandidate,
  runImport: runGuestLoginHandoffCandidate
});
const newAccountDemoSeedCoordinator = createNewAccountDemoSeedCoordinator({
  getState: () => state,
  getDisplayPreferences: () => {
    const guestStateText = localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY, GUEST_STORAGE_SCOPE));
    return guestStateText ? guestLocalDisplayPreferences(JSON.parse(guestStateText)) : null;
  },
  applyDisplayPreferences: (preferences) => {
    return applyGuestLocalDisplayPreferences(state, preferences);
  },
  createDefaultLayout: () => createLocalDemoCopy({
    forceNew: true,
    remember: true,
    exactTemplateName: true,
    activate: true
  }),
  persistDefaultLayout: async () => {
    saveState({ sync: false });
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    await saveRemoteState({ notify: false, forceOverwrite: true });
    if (syncMeta.dirty) scheduleRemoteSave();
    return !syncMeta.dirty;
  },
  onError: (error) => {
    console.warn("[bike-packing] Default demo layout could not be seeded for the new account", error);
  }
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
  get adminTemplateHistoryRecords() { return adminTemplateHistoryRecords; },
  set adminTemplateHistoryRecords(value) { adminTemplateHistoryRecords = value; },
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
  get currentPackingListId() { return currentPackingListId; },
  set currentUser(value) { currentUser = value; },
  get currentAuthorization() { return currentAuthorization; },
  set currentAuthorization(value) { currentAuthorization = value; },
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
  get pickerListPhotos() { return pickerListPhotos; },
  set pickerListPhotos(value) { pickerListPhotos = value === true; },
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
  adminTemplateUiEnabled,
  runCausalAdminTemplateCommand,
  prepareCausalAdminCatalogCopy,
  prepareCausalAdminPlacementCopy,
  prepareCausalAdminToPersonalCopy,
  openCausalAdminTemplateOrder, saveCausalAdminTemplateOrder, finishCausalAdminTemplateOrder,
  newCausalAdminTemplateDraft, persistNewCausalAdminTemplateDraft, createCausalAdminTemplateCopy, openCausalAdminTemplate,
  ACTIVE_LAYOUT_CHOICE_KEY, ACTIVE_LAYOUT_CHOICE_SOURCE_KEY, ACTIVE_LIST_ID_KEY, ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
  API_TIMEOUT_MS, APP_VERSION, AUTH_SIGNED_OUT_KEY, BASE_STATE_KEY,
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
  applyEditMeta, applyEntityChangesToState, applyItemAvailabilityStatus, applyLayoutArrangement, applyLayoutArrangementToState,
  applyLayoutEditFields, applyLayoutLocked, applyLoadedStateToCurrentScope, applyPackingVisualStyle, applyPackingVisualStyleClass, applyPreferredPrivateLayoutChoice,
  applyPublicTemplateLanguage, applyPublicTemplateMetadataToPayload, applyPublishedPayloadPhotosToLayoutState, applyRemoteState, applySearchInputNow,
  applyStaticTranslations, applyStaticTranslationsUi, applyingLayoutArrangement, applyingRemoteState, arePublishedTemplatesBlocked,
  askConfirmDialog, askConflictResolution, askPrintLabelsChoice, askUnsavedChangesDialog, assertAdminApiCompatibility,
  adminBackupPayloads, assertEntitySyncConfirmed, assertEntitySyncListFreshnessApi, assertPublishedTemplateCopyConfirmed, assertRemoteStateIntegrity, backupDownloadName,
  bestCatalogListRecord, bestMeaningfulLayoutId, bindBoardScroll, bindDictionaryControls, bindFixedScrollbar, bindStickyRootHeaderRow,
  bindHorizontalTouchScroll, resetHorizontalTouchScroll, bindLayoutEditorControls, bindLayoutOrderPointerDrag, bindLongPressTooltips, bindPackingEventsUi, bindPhotoGalleries, bindRootContainersEditorControls,
  bindSettingsPointerDragUi, bindSharedLayoutEvents, bindSharedVirtualEvents, bindSharedVirtualEventsUi, blockDestructiveLocalSave,
  blockDestructiveRemoteState, blockRemoteIntegrityFailureIfNeeded, blurActiveEditableBeforeButtonAction, buildAdminDemoTemplateOptions, buildAdminSharedTemplateOptions,
  backupAdminTemplateRows, buildBackupLayoutRows, buildBackupPhotoEntries, buildChangedEntitySyncEntries, buildChangedEntitySyncEntriesForSync, buildCurrentBackupManifestValue,
  buildEntitySyncBody, buildEntitySyncBodyForSync, buildListSaveBody, buildListSaveBodyForSync, buildPrintableDocument,
  buildRememberedOfflineUser, buildSharedListUrl, buildSharedListUrlFromHref, canAddUsageEntries, canDeleteActiveLayoutForState,
  canEditManagedAdminTemplateNow, canEditPublishedTemplatesNow, canLocalStateOverrideRemote, canOpenAdminPublishedEdit, canReplaceLayoutCreateNameSuggestionValue, canRequestEntityChanges,
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
  confirmLoadedDemoPublicTemplate, confirmPublicCopyDuplicates, confirmPublicLayoutTransition, confirmRepeatedSharedLayoutCopy,
  conflictDefaultChoice, conflictFormatter, conflictKindLabel, conflictLabel, conflictSummary,
  conflictTimestamp, conflictVersionStamp, containerCategories, containerCreatedTimeForState,
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
  defaultRootContainerLocation, deleteCachedPhoto, deleteItemFromState, deletePublishedDemoTemplateRecord, deletePublishedSharedTemplateRecord, deleteRemotePhotoIfPossible,
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
  ensurePrivateDictionariesForState, preparePersonalPublicPickerSource, ensurePrivateStateForSharedCopy, ensureSharedCopyTargetLayoutId, enterSignedOutPublicMode, entitySyncBodyContext,
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
  hadAuthoritativeLocalStateAtStartup, hadLocalStateAtStartup, hadRemoteBaselineAtStartup, handleAuthButton,
  handleRemoteSaveConflict, handleRemoteSaveConflictFlow, handleSearchInput, handleWindowReturn, hasContainerDimensions,
  hasGeneratedPublicArtifacts, hasGuestDemoCopyLayoutRecord, hasLegacyPayloadChanges, hasLegacyPayloadChangesForSync, hasListFreshnessSignal,
  hasLocalSavedState, hasLocalSyncChanges, hasPrivateSyncBlockedPublicOrigin, hasPublicOriginMarker, hasRemotePhotoUrl, inspectRecordRemotePhotoSources,
  hasStateIntegrityMeta, hasStoredLocalValue, highlight, highlightSearchText, historyComparisonState,
  historyPayloadTitle, historyRecordKey, historyRecordState, historyRecordStateForSync, historyRecords,
  historySourceLabel, hydrateItemPhotos, hydrateLocalSharedTemplateCatalogFromState, importDemoStateAsEditableLayout, importDemoStateAsEditableLayoutValue,
  init, initialRemoteLoadPending, installRuntimeActiveLayoutId,
  isActiveLayoutChoiceExplicit, isAdminEditablePublishedLayout, isAdminPublicEditScope, isAdminSession,
  isAdminUser, isAutomaticGuestDemoCopyLayout, isBike3dPackingView, isCollectionPackedVisible, isConcretePublicSharedLayoutListRecord,
  isConflictMetaField, isContainerPickerContainerCopyModeValue, isContainerPickerCopyModeValue, isContainerPickerItemCopyModeValue, isCurrentLocalStateDestructiveRegression,
  isDefaultDemoSeedLayoutRecord, isDeletedSharedLayoutId, isDemoLayoutChoice, isDemoLayoutChoiceValue, isDemoPublicTemplateMissing,
  isDestructiveStateRegression, isDisposableManagedPublicDraft, isEditableElement, isEntitySyncTypeUnavailable, isEntitySyncUnavailableError,
  isExplicitlySignedOut, isForcedOffline, isForeignLocalSyncState, isGeneratedCatalogContainerStateArtifact, isGeneratedCatalogContainerSyncArtifact,
  isGeneratedCatalogStateArtifact, isGeneratedCatalogSyncArtifact, isGeneratedStartupFallbackState, isGuestDemoCopyLayout, isGuestDemoCopyLayoutRecord,
  isGuestSession, isItemAwayFromHomeAndBikeValue, isItemInCatalogForState, isItemInLayoutForState,
  itemAvailabilityBlocksPlacement, itemPlacementSnapshotChanged, isItemUnavailableForPacking, isItemWithoutWeightValue, isLayoutCreateTemplateLayoutModeValue, isLayoutLocked, isLayoutMeaningful, isLocalDevOrigin, isManagedDemoTemplateLayout,
  isManagedPublicTemplateDraft, isManagedTemplateUnpublished, managedTemplatePublicationAction, isMeaningfulPackingState, isNetworkError, isOfflineRememberedAdminSession, isOfflineRememberedSession,
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
  itemPhotoSignature, getLayoutItemQuantityForState, itemQuantityForState, itemSortMode, itemTotalWeightForState, itemUsageCountsForCatalog, itemWithLayoutQuantityForState,
  itemsForActiveCatalogForState, itemsForItemsViewForState, keepRemoteOnlyPhotoReference, languageOptionLabel, languageOptionLabelValue,
  lastItemTitleTap, lastRootContainerTitleTap, lastToastAt,
  lastToastSignature, layoutArrangementContentScore, layoutContainerPathForState, layoutContainersOwnWeightForState, layoutCreateModeState,
    layoutDictionaryValues, layoutEditTitle, layoutEntitySyncUnavailable, layoutLoadStatus, layoutManageLanguage, layoutOrderIdsFromSections, layoutOrderSectionsFromSources, applyLayoutOrderToSources, changedPersonalLayoutOrderIds,
  layoutSourceNameFromOptionLabel, legacyComparableStateForSync, legacyComparableStateForSyncPayload, legacyComparableTopLevelDiffKeys, legacyComparableTopLevelDiffKeysForSync,
  legacySharedRootSnapshot, linkExistingContainerTreeToLayoutState, linkMissingContainerTreeToLayoutState, linkedSharedListLayout, listFreshnessChanged, listRecordVisibility,
  loadActiveLayoutChoice, loadActivePackingListId, loadActivePrivateLayoutChoice, loadBaseState, loadCurrentHistoryComparisonState,
  loadCurrentServerStateDirectly, loadGuestPublishedDemoOnStartup, loadPublishedDemoState, loadPublishedTemplateCopySourceValue, loadRecoverySnapshots,
  loadRemoteHistory, loadRemoteState, loadRemoteStateFlow, loadSharedLayoutPayload, loadState,
  loadStateForScope, loadStoredActiveLayoutChoice, loadStoredActivePackingListId, loadStoredActivePrivateLayoutChoice, loadStoredSyncMeta,
  loadStoredUiSettings, loadSyncDevice, loadSyncMeta, loadUiLanguage, loadUiSettings,
  localAdminTemplateCopyLayouts, localDemoCopyInFlight, localDemoTemplateEntriesFromLayouts, localSharedLayoutCatalogEntriesFromLayouts, localStorageScopeKey,
  locations, makeContainerCopyNameForLayout, makeContainerCopyNameForState, makeItemCopyNameForState, managedSharedDraftLanguage, markCopiedItemForPublicLayout,
  markEdited, markEntitySyncTypeUnavailable, markLayoutPhotosForCurrentListCopy, markLayoutPhotosForCurrentListCopyForSync, markLocalPublicCopyOrigin,
  markPhotoUploadStarted,
  markPrivateCopyOriginFromSource, markPublicTemplateOptionsState, markRecordPhotosForCurrentListCopy, matchesCollectionFilterValue, matchesItemFieldsFilterValue,
  matchesRootContainerFieldsFilterValue, materializeDemoLayoutForAdminCopy, materializeSharedLayoutForAdmin, materializeSharedLayoutForAdminState, mergeBuiltInSharedEntriesIntoAdminLayout,
  mergeBuiltInSharedEntriesIntoAdminLayoutValue, mergeDemoTemplateCatalogEntry, mergeDemoTemplateEntriesForAdmin, mergeLocalCollapsedContainers, mergeManagedPublicDraftRecords,
  mergePublishedSharedStateIntoAdminLayout, mergePublishedSharedStateIntoAdminLayoutValue, mergeServerDemoTemplateCatalog, mergeSharedLayoutCatalogEntries, mergeStateFromBase,
  mergeStateFromBaseValue, migrateContainerOrder, missingDemoPublicTemplates, modeState, moveContainerInLayoutArrangementForState,
  moveItemInLayoutArrangementForState, moveLayoutBeforeInSections, moveLayoutWithinSections, moveRootColumnInState, addRootContainerToLayoutInState, rootColumnInsertIndexFromVisibleNeighbors, nextDemoTemplateAfter, nextItemDisplayModeValue, nextServerConfirmedSharedLayoutAfter,
  normalizeActiveLayoutChoice, normalizeActiveLayoutChoiceValue, normalizeBike3dTransform, normalizeBike3dTransforms, normalizeBike3dViewState,
  normalizeCatalogSelection, normalizeCollectionModeState, normalizeContainerColor, normalizeContainerDimensions, normalizeContainerFields, setLayoutItemQuantityForState,
  normalizeDemoLayoutName, normalizeDemoPayloadForLanguage, normalizeDemoTemplateName, normalizeDictionaryValues, normalizeIntegrityCount,
  lockedLayoutMutationBlocked, lockedLayoutsContainingContainer, lockedLayoutsContainingItem, lockedLayoutsContainingNestedContainer, normalizeItemAvailabilityStatus,
  normalizeItemCategories, normalizeItemDisplayMode, normalizeItemFields, normalizeItemPhotos, normalizeItemQuantity,
  normalizeLayoutArrangement, normalizeLayoutFields, normalizeListFreshness, normalizePackingListsResponse, normalizePackingViewMode,
  normalizePackingVisualStyle, normalizePhotoUrlFields, normalizePrivateDictionariesForSyncState, normalizePrivateLayoutChoiceForStateRestore, normalizePublicTemplateMetadataResponse,
  normalizePublishedDemoTemplatePayload, normalizePublishedStatePayload, normalizeRemoteListRecord, normalizeRemoteState,
  normalizeRestoredBackupState, normalizeSharedGearName, normalizeSortMode, normalizeStateRevision, normalizeUiLanguage,
  nowIso, offerLoadServerForTruncatedLocalState,
  offlineRememberedUser, openAdminDemoLayout, openAuthDialog, openCategoryFilterDialog, openConfirmDialog,
  openDemoLayoutFromSelect, openHelpLimitsDialog, openHelpLimitsDialogUi, openHistoryDialog, openModalDialog,
  openPrivateLayout, openSharedLayoutForAdmin, openSharedLayoutViewer, openSharedLayoutsDialog, openSharedListFromLink,
  orderAdminPublicDraftsLikeMainSelect, packingVisualStyle, packingVisualStyleButtonLabel, packingVisualStylePanelVisible, parseContainerDimensionInput,
  parseVolumeInput, parseWeightInput, persistActiveLayoutSelection, persistStateSnapshot,
  personalListApiUnavailable, photoDialogStatusText, photoDraftChanged, photoDownloadCoordinator, photoObjectUrls, photoPreviewLoader, offlinePhotoRenderCoordinator, photoRecordIdMatchesRemoteSource, photoRemoteSrc,
  photoShouldBeCopiedToCurrentList, photoStatusText, photoUploadInFlight, photoUploadProgressRenderFrame, pickRicherRemoteListRecord,
  placeDuplicatedContainerSnapshotInLayoutState, placeExistingContainerInLayoutInState, placeExistingItemInLayoutInState, planLayoutTreeMissingItems, planPublicCopyMissingItems,
  preferredCurrentLayoutRef, prepareBackupPhotosForStateValue, preserveSearchBlurViewport, primaryItemPhoto,
  printHtmlDocument, copyCrossesPublicNamespaceBoundary, itemCopyNamespacePolicy, privateContainerTreeCopyRoute, photoDuplicateOptionsForLayoutCopy, shouldCopyPhotosToCurrentListForLayoutCopy, privateLayoutCount, privateLayoutDeleteConfirm, privateMojibakeLayoutFallbackName, pruneAdminPublishedDraftsForSync,
  containerPlacementSnapshotChanged, pruneAdminPublishedDraftsForSyncValue, pruneRuntimeSharedLayouts, pruneUneditedGuestDemoCopies, pruneUnusedLayoutCustomDictionaries, publicCopyComparableText,
  publicCopyDuplicateSummaryForSnapshot, publicCopyMissingItemPlanForSnapshot, publicCopyRecordContentHash, publicCopySnapshotFromSourceSnapshot, publicCopySourceIdFromRecord,
  isSharedCopyTargetLayout, publicCopyTargetLayouts, sharedCopyTargetLayouts,
  publicDemoTemplateEntryFromRecord, publicDemoTemplatePayloadTarget, publicLayoutChoiceForLayout, publicLayoutChoiceValue, publicLayoutDeleteConfirm,
  publicListIdForPublishedTarget, publicReadonlyItemDisplayMode, publicSharedLayouts, publicTemplateChoice, publicTemplateDeleteBlockReason,
  publicTemplateDeletePath, publicTemplateMetadataPath, publicTemplateMetadataRequest, publicTemplateMetadataTarget, publicTemplateOptionLabel,
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
  renderDictionaryHtml, renderEmptyState, renderPackingAddRootCard, renderPackingEmptyState,
  renderFilterControls, renderFilteredRootContainerColumnHtml, renderFilters,
  renderGuestPublicDemoPreviewDuringAuthCheck, renderHistoryRecordArticleHtml, renderHistoryRecords, renderHistorySourceControls, renderInitialLocalFallbackIfNeeded,
  renderItemPhotoHtml, renderItemQuantityText, renderItemsViewHtml, renderLayoutEditorHtml, renderListItemHtml, renderOfflineLayoutSettingsHtml, bindOfflineLayoutSettingsControls,
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
  saveAuthEmail, saveAuthEmailToStorage, saveBaseState, saveDictionaryOwner,
  isNewItemPlacementPickerMode, itemDialogContainerPickerMode, itemDialogTargetLayoutFromPicker,
  saveItemDialogAction, saveLayoutMutation, saveLocalUiState, savePublishedLayoutRecord, savePublishedLayoutRecordFlow,
  savePublishedTemplateMetadata, saveRecoverySnapshot, saveRemoteListStateRecord, saveRemoteState, saveRemoteStateFlow,
  saveRemoteStateRecord, saveRootContainerDialogAction, saveState, preparePersonalCatalogDeletion, preparePersonalCatalogCopy, preparePersonalContainerTreeAction, preparePersonalLayoutCopyAction, preparePersonalItemCopyPlacementAction,
  personalPhotoFormUiEnabled, personalPhotoEditFormUiEnabled, personalPhotoItemContextUiEnabled, personalPhotoContainerContextUiEnabled, personalPendingImportFormEnabled, personalPendingPhotoFormEnabled, personalPendingImportCreateEnabled, personalSaveContext, personalPhotoFormRequest, personalPhotoFormSession, reportPersonalPhotoFormError,
  runCausalPersonalShareLink, personalSavePilotEnabled, PERSONAL_SHARE_LINK_ENABLED,
  preparePersonalLayoutDeletionAction, preparePersonalDictionaryAction, preparePersonalPlacementAction, preparePersonalArchiveImportAction, saveStoredActiveLayoutChoice, saveStoredActivePackingListId,
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
  sharedRootFromPublishedContainer, shouldBlockLegacyPersonalSyncWrite, shouldBlockLegacyPersonalSyncWriteFallback, shouldClearPackingListContextForPrivateMutation,
  shouldAutoPublishManagedTemplate, shouldConfirmManagedTemplateTransition, shouldCopyPublicTemplatePhotoReferencesOnServer,
  shouldCreatePublishedTemplateBeforePhotos, shouldDeletePublishedTemplateForLayoutValue, shouldKeepCurrentReadonlyDemoAfterAuthCheck,
  shouldKeepReadonlyDemoAfterAuthCheck, shouldKeepScopedControlsStable, shouldRecoverUnsyncedLocalChanges, shouldRenderGuestDemoPreviewDuringAuthCheck, shouldShowItemLabels,
  shouldShowItemLabelsForMode, shouldShowItemPhotos, shouldShowItemPhotosForMode, shouldUseStickyFilterControls, shouldWarnAboutSharedLayoutCatalog,
  snapshotContainerTreeFromLayoutArrangement, snapshotContainerTreeFromLiveStateValue, snapshotHasLocalPublicCopyOrigin, snapshotHasPrivateSyncBlockedPublicOrigin, snapshotModeState,
  selectUnlockedLayoutTargetId, snapshotsEqual, solidifyManagedTemplateDrafts, solidifyManagedTemplateDraftsForState, solidifyTemplateDraftLayout, solidifyTemplateDraftLayoutForState,
  sortDictionaryValues, sortHistoryRecords, sortLayoutSectionByDate, sortLayoutSectionByName, sortedDictionaryValues, splitEntitySyncEntries, splitEntitySyncEntriesForSync,
  startRemoteStateWatcher, startupLocalStateWasFallback, startupSyncMeta, state, stateIntegrityMetaFromResponse,
  statePrivateLayoutCount, stateStats, stateStatsForDestructiveComparison,
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
  unavailableSnapshotItems, unpublishManagedTemplateFlow, unpublishPublishedDemoTemplateRecord, unpublishPublishedSharedTemplate, upsertRuntimeSharedLayout, usageLimitExceededMessage, usageLimitForRole, userEditableLayoutsForState, userStorageScopeKey,
  visibleItemLayoutPlacementsForState, visibleSharedLayoutsForLanguage, withLayoutArrangementApplied, withLayoutArrangementAppliedAsync,
  withoutPhotoReferences, writeContainerTreeToLayoutArrangement, writeLargeScopedLocalValue
};
const {
  warnLockedLayoutMutation, openAddToContainerDialog, openNewItemForAddTarget, openPackingItemReplacementDialog, openContainerReplacementDialog, resolveEditableLayoutIdForContainer, renderAddToContainerResults, matchesAddToContainerSearch,
  clearAddToContainerSearch, togglePickerListPhotos, openLayoutRootDialog, openCreateRootContainerForCurrentLayout, renderLayoutRootResults, matchesLayoutRootSearch,
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
  metric, bindLayoutComparisonControls, isSharedLayoutView, currentSharedLayout, sharedLayoutStatePayload,
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
  flushOpenEntityFormDrafts, syncNewEntityFormDraftCatalogCards,
  fillRootContainerLocationSelect, openItemDialog, openSharedReadonlyItemDialog, setSharedReadonlyItemDialog,
  resetSharedReadonlyItemDialog, copySharedItemFromReadonlyDialog, openSharedReadonlyContainerDialog,
  setSharedReadonlyRootContainerDialog, resetSharedReadonlyRootContainerDialog, uniqueLayoutName, uniquePublishedTemplateName,
  canManageLayout, canManageActiveLayout, languageSelectEntries, createLayoutCopyFromSource,
  templateCopyRootSnapshots, templateCopySourceScore, loadPublishedTemplateCopySource, createTemplateCopyFromSource,
  layoutCreateCopySourceOptions, isLayoutCreateTemplateLayoutMode, resolveLayoutCreateCopySource, resolveLayoutCreateTemplateCopySource,
  resolveLayoutCreateTemplateCopyLayout, createPrivateLayoutFromTemplateSource, createTemplateCopyDraft, openLayoutDialog,
  updateLayoutCopyVisibility, layoutCreateSelectedSourceName, canReplaceLayoutCreateNameSuggestion, updateLayoutCreateNameSuggestion,
  createNewPublicTemplateLayout, saveNewLayout, openLayoutEditDialog, publicTemplateDeleteBlockReasonForLayout,
  updateLayoutEditDeleteButton, updateLayoutEditPublishButton, updateLayoutEditSaveState, handleLayoutEditFormSubmit, requestCloseLayoutEditDialog, handleLayoutEditDialogClose,
  toggleLayoutOrderPanel, handleLayoutOrderFormSubmit, requestCloseLayoutOrderDialog, handleLayoutOrderListClick, handleLayoutOrderDragStart,
  handleLayoutOrderDragOver, handleLayoutOrderDragLeave, handleLayoutOrderDrop, handleLayoutOrderDragEnd,
  handleLayoutOrderDialogClose, bindLayoutOrderDragControls,
  canDeleteManagedLayout, saveEditedLayout, publishEditedTemplate, unpublishEditedTemplate, handleEditedTemplatePublication, confirmDeleteEditedLayout,
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
  saveRootContainerDialog, saveDialogItem, shareEditingItemByLink, shareEditingContainerByLink,
  applyItemDialogPhotoDraft, applyRootContainerDialogPhotoDraft,
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

adminReportsDialogController = createAdminReportsDialogController({
  refs,
  fetchReports: () => fetchAdminReports(apiFetch, { timeoutMs: LIST_API_TIMEOUT_MS }),
  canOpenAdmin: canOpenAdminPublishedEdit,
  isForcedOffline,
  openModalDialog,
  showToast,
  apiErrorMessage
});

manufacturerCatalogReviewDialogController = createManufacturerCatalogReviewDialogController({
  refs,
  fetchScans: () => fetchManufacturerCatalogScans(apiFetch, { timeoutMs: LIST_API_TIMEOUT_MS }),
  saveDecision: (decision) => saveManufacturerCatalogDecision(apiFetch, {
    ...decision,
    timeoutMs: LIST_API_TIMEOUT_MS,
  }),
  canOpen: canReviewManufacturerCatalog,
  isForcedOffline,
  openModalDialog,
  showToast,
  apiErrorMessage
});

init();

function scopedLocalStorageKey(key, scope = localStorageScopeKey) {
  return scopedStorageKey(key, scope);
}

function offlineLayoutSelectionStorageKey() {
  return scopedLocalStorageKey(OFFLINE_LAYOUT_SELECTION_KEY);
}

function selectedOfflineLayoutIds(targetState = state) {
  return readOfflineLayoutIds(
    localStorage,
    offlineLayoutSelectionStorageKey(),
    targetState
  );
}

function selectedOfflinePhotoState(targetState = state) {
  return offlinePhotoStateForLayouts(targetState, selectedOfflineLayoutIds(targetState), {
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState
  });
}

function selectedOfflinePhotoKeySet(targetState = state) {
  return new Set(collectOfflinePhotoCacheTasks(selectedOfflinePhotoState(targetState)).map((task) => task.key));
}

function formatOfflineStorageBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function offlineLayoutSettingsLayouts() {
  const editable = userEditableLayoutsForState(state, { canUseLocalEditableState });
  return editable.length ? editable : Object.values(state.layouts || {}).filter(Boolean);
}

function renderOfflineLayoutSettingsHtml() {
  const layouts = offlineLayoutSettingsLayouts();
  const visibleIds = new Set(layouts.map((layout) => layout.id));
  const selected = new Set(selectedOfflineLayoutIds().filter((id) => visibleIds.has(id)));
  const en = normalizeUiLanguage(uiLanguage) === "en";
  const rows = layouts.map((layout) => {
    const photoCount = offlineLayoutPhotoCount(state, layout.id, {
      getLayoutContainerIdSet: getLayoutContainerIdSetForState,
      getLayoutItemIdSet: getLayoutItemIdSetForState
    });
    const photoLabel = en
      ? `${photoCount} photo${photoCount === 1 ? "" : "s"} in layout`
      : `${photoCount} фото в укладке`;
    return `
      <label class="offline-layout-option">
        <input type="checkbox" data-offline-layout-id="${escapeHtml(layout.id)}" ${selected.has(layout.id) ? "checked" : ""}>
        <span><strong>${escapeHtml(layout.name || (en ? "Untitled layout" : "Укладка без названия"))}</strong><small>${photoLabel}</small></span>
      </label>`;
  }).join("");
  return `
    <section class="settings-panel offline-layout-settings-panel">
      <div class="offline-layout-settings-heading">
        <div>
          <h2>${en ? "Available offline" : "Доступно офлайн"}</h2>
          <p>${en
            ? "Layout data stays on this device. Photos are downloaded in full only for selected layouts."
            : "Данные укладок остаются на этом устройстве. Полностью скачиваются только фотографии отмеченных укладок."}</p>
        </div>
        <span class="offline-layout-selected-count">${selected.size}/${layouts.length}</span>
      </div>
      ${layouts.length ? `
        <div class="offline-layout-options">${rows}</div>
        <div class="offline-layout-actions">
          <button type="button" class="ghost" id="offlineSelectCurrentLayout">${en ? "Current layout" : "Текущая укладка"}</button>
          <button type="button" class="ghost" id="offlineClearLayouts">${en ? "Clear all" : "Снять все"}</button>
        </div>` : ""}
      <small class="offline-layout-storage-estimate">${en ? "Checking local Bike Packing photo copies in IndexedDB…" : "Проверяем локальные копии фотографий Bike Packing в IndexedDB…"}</small>
      <small>${en
        ? "Clearing a selection removes only the offline copies from this browser. Server photos remain intact."
        : "Снятие отметки удаляет только офлайн-копии из этого браузера. Фотографии на сервере остаются без изменений."}</small>
      <div class="offline-catalog-settings">
        <div>
          <h3>${en ? "Global bag catalog" : "Глобальный каталог сумок"}</h3>
          <p>${en
            ? "Catalog data loads only when opened. Save all model cards and their main previews for offline browsing; extra gallery photos continue to load only as viewed."
            : "Данные каталога загружаются только при открытии. Можно сохранить карточки всех моделей и основные превью для офлайн-просмотра; дополнительные фото галерей по-прежнему загружаются только по мере просмотра."}</p>
        </div>
        <div class="offline-layout-actions">
          <button type="button" id="offlineSaveManufacturerCatalog">${en ? "Save catalog offline" : "Сохранить каталог офлайн"}</button>
          <button type="button" class="ghost" id="offlineClearManufacturerCatalog">${en ? "Remove offline catalog" : "Удалить офлайн-каталог"}</button>
        </div>
        <small class="offline-catalog-status">${en ? "Checking offline catalog…" : "Проверяем офлайн-каталог…"}</small>
      </div>
      <div class="offline-storage-capacity" role="status">${en ? "Checking browser storage…" : "Проверяем хранилище браузера…"}</div>
    </section>`;
}

function bindOfflineLayoutSettingsControls() {
  const root = refs.settingsView?.querySelector?.(".offline-layout-settings-panel");
  if (!root) return;
  const en = normalizeUiLanguage(uiLanguage) === "en";
  const inputs = () => [...root.querySelectorAll("[data-offline-layout-id]")];
  const updateCount = () => {
    const count = inputs().filter((input) => input.checked).length;
    const total = inputs().length;
    const target = root.querySelector(".offline-layout-selected-count");
    if (target) target.textContent = `${count}/${total}`;
  };
  const updateStorageEstimate = async () => {
    const target = root.querySelector(".offline-layout-storage-estimate");
    const catalogTarget = root.querySelector(".offline-catalog-status");
    const capacityTarget = root.querySelector(".offline-storage-capacity");
    try {
      const [records, catalogUsage, storage] = await Promise.all([
        listCachedPhotos(localStorageScopeKey),
        manufacturerCatalogOfflineUsage(),
        browserStorageEstimate()
      ]);
      const offlineUsage = offlinePhotoCacheUsage(records, { purpose: "offline-remote" });
      const totalUsage = offlinePhotoCacheUsage(records);
      const offlineBytes = formatOfflineStorageBytes(offlineUsage.bytes);
      const totalBytes = formatOfflineStorageBytes(totalUsage.bytes);
      if (target) target.textContent = en
          ? `Selected-layout offline copies: ${offlineBytes}, ${offlineUsage.photos} photos. Total Bike Packing photos on this device: ${totalBytes}, ${totalUsage.photos} photos.`
          : `Офлайн-копии выбранных укладок: ${offlineBytes}, фото: ${offlineUsage.photos}. Всего фотографий Bike Packing на этом устройстве: ${totalBytes}, фото: ${totalUsage.photos}.`;
      if (catalogTarget) catalogTarget.textContent = catalogUsage.available
        ? (en
          ? `Offline catalog: ${catalogUsage.files} previews, ${formatOfflineStorageBytes(catalogUsage.bytes)}.`
          : `Офлайн-каталог: ${catalogUsage.files} превью, ${formatOfflineStorageBytes(catalogUsage.bytes)}.`)
        : (en ? "The global catalog is not saved offline." : "Глобальный каталог не сохранён офлайн.");
      if (capacityTarget) capacityTarget.textContent = storage.quota
        ? (en
          ? `Browser storage: ${formatOfflineStorageBytes(storage.available)} available of ${formatOfflineStorageBytes(storage.quota)}; ${formatOfflineStorageBytes(storage.usage)} used${storage.persisted ? ". Storage is protected from automatic cleanup." : "."}`
          : `Хранилище браузера: доступно ${formatOfflineStorageBytes(storage.available)} из ${formatOfflineStorageBytes(storage.quota)}; занято ${formatOfflineStorageBytes(storage.usage)}${storage.persisted ? ". Данные защищены от автоматической очистки." : "."}`)
        : (en ? "The browser did not report an offline storage limit." : "Браузер не сообщил лимит офлайн-хранилища.");
    } catch {
      if (target) target.textContent = en
        ? "The size of local Bike Packing photo copies in IndexedDB is unavailable."
        : "Не удалось определить размер локальных копий фотографий Bike Packing в IndexedDB.";
      if (catalogTarget) catalogTarget.textContent = en
        ? "Could not inspect the offline catalog."
        : "Не удалось проверить офлайн-каталог.";
      if (capacityTarget) capacityTarget.textContent = en
        ? "The browser did not report offline storage capacity."
        : "Браузер не сообщил доступный объём офлайн-хранилища.";
    }
  };
  const applySelection = async (ids) => {
    const normalized = writeOfflineLayoutIds(localStorage, offlineLayoutSelectionStorageKey(), ids, state);
    const selected = new Set(normalized);
    inputs().forEach((input) => { input.checked = selected.has(input.dataset.offlineLayoutId); });
    updateCount();
    const scopeKey = localStorageScopeKey;
    const targetState = selectedOfflinePhotoState();
    const result = await pruneOfflineRemotePhotoCache(targetState, {
      listCachedPhotos: () => listCachedPhotos(scopeKey),
      deleteCachedPhoto: (id) => deleteCachedPhoto(id, scopeKey)
    });
    await offlinePhotoCacheController.schedule({ force: true });
    await updateStorageEstimate();
    showToast(en
      ? `Offline layouts updated${result.removedBytes ? `; ${formatOfflineStorageBytes(result.removedBytes)} of old copies outside selected layouts freed.` : "."}`
      : `Офлайн-укладки обновлены${result.removedBytes ? `; освобождено ${formatOfflineStorageBytes(result.removedBytes)} старых копий вне выбранных укладок.` : "."}`, "success");
  };
  const confirmRemoval = async (layoutIds, { clearAll = false } = {}) => {
    const layoutsById = new Map(offlineLayoutSettingsLayouts().map((layout) => [layout.id, layout]));
    const names = layoutIds.map((id) => layoutsById.get(id)?.name).filter(Boolean);
    const records = await listCachedPhotos(localStorageScopeKey).catch(() => []);
    const usage = offlinePhotoCacheUsage(records, { purpose: "offline-remote" });
    const offlineNow = isForcedOffline() || Boolean(connectionStatusController.currentProblem());
    const subject = clearAll
      ? (en ? "all selected layouts" : "всех отмеченных укладок")
      : (names.length ? names.join(", ") : (en ? "this layout" : "этой укладки"));
    const warning = offlineNow
      ? (en
        ? " You are offline: removed photos can be restored only after reconnecting to the internet."
        : " Сейчас нет подключения: вернуть удалённые фотографии получится только после выхода в интернет.")
      : "";
    return askConfirmDialog({
      title: en ? "Remove local offline copies?" : "Удалить локальные офлайн-копии?",
      text: en
        ? `Local IndexedDB copies for ${subject} will be removed when they are no longer needed by another selected layout. Server photos will remain.${warning}`
        : `Локальные копии в IndexedDB для ${subject} будут удалены, если они не нужны другой отмеченной укладке. Фотографии на сервере останутся.${warning}`,
      highlightText: en
        ? `${usage.photos} offline photos currently use ${formatOfflineStorageBytes(usage.bytes)}`
        : `Сейчас сохранено офлайн: ${usage.photos} фото, ${formatOfflineStorageBytes(usage.bytes)}`,
      okText: en ? "Remove local copies" : "Удалить локальные копии",
      tone: "danger"
    });
  };
  inputs().forEach((input) => input.addEventListener("change", async () => {
    const previous = new Set(selectedOfflineLayoutIds());
    const layoutId = input.dataset.offlineLayoutId;
    if (!input.checked && previous.has(layoutId)) {
      const confirmed = await confirmRemoval([layoutId]);
      if (!confirmed) {
        input.checked = true;
        updateCount();
        return;
      }
    }
    await applySelection(inputs().filter((entry) => entry.checked).map((entry) => entry.dataset.offlineLayoutId));
  }));
  root.querySelector("#offlineSelectCurrentLayout")?.addEventListener("click", () => applySelection([
    ...selectedOfflineLayoutIds(),
    state.activeLayoutId
  ]));
  root.querySelector("#offlineClearLayouts")?.addEventListener("click", async () => {
    const selected = selectedOfflineLayoutIds();
    const records = await listCachedPhotos(localStorageScopeKey).catch(() => []);
    const usage = offlinePhotoCacheUsage(records, { purpose: "offline-remote" });
    if (!selected.length && !usage.photos) return;
    const confirmed = await confirmRemoval(selected, { clearAll: true });
    if (confirmed) await applySelection([]);
  });
  root.querySelector("#offlineSaveManufacturerCatalog")?.addEventListener("click", async () => {
    const button = root.querySelector("#offlineSaveManufacturerCatalog");
    const status = root.querySelector(".offline-catalog-status");
    button.disabled = true;
    try {
      status.textContent = en ? "Loading catalog data…" : "Загружаем данные каталога…";
      const catalogModule = await import("./src/data/manufacturer-bag-catalog-runtime.js");
      const MANUFACTURER_BAG_CATALOG = await catalogModule.loadManufacturerBagCatalog();
      const result = await cacheManufacturerCatalogPreviews(MANUFACTURER_BAG_CATALOG, {
        onProgress: ({ completed, total }) => {
          status.textContent = en
            ? `Saving previews: ${completed}/${total}`
            : `Сохраняем превью: ${completed}/${total}`;
        }
      });
      if (result.failed) throw new Error(`catalog-offline-failed-${result.failed}`);
      showToast(en ? "Global catalog is available offline." : "Глобальный каталог доступен офлайн.", "success");
    } catch {
      showToast(en
        ? "Could not save the complete catalog. Check the connection and available storage."
        : "Не удалось сохранить каталог полностью. Проверьте подключение и свободное место.", "error");
    } finally {
      button.disabled = false;
      await updateStorageEstimate();
    }
  });
  root.querySelector("#offlineClearManufacturerCatalog")?.addEventListener("click", async () => {
    const usage = await manufacturerCatalogOfflineUsage().catch(() => ({ available: false, bytes: 0, files: 0 }));
    if (!usage.available) return;
    const confirmed = await askConfirmDialog({
      title: en ? "Remove offline catalog?" : "Удалить офлайн-каталог?",
      text: en
        ? "Saved model previews will be removed from this browser. The catalog will still load from the network as you browse."
        : "Сохранённые превью моделей будут удалены из этого браузера. При просмотре каталог продолжит загружаться из сети.",
      highlightText: `${usage.files} · ${formatOfflineStorageBytes(usage.bytes)}`,
      okText: en ? "Remove offline catalog" : "Удалить офлайн-каталог",
      tone: "danger"
    });
    if (!confirmed) return;
    await clearManufacturerCatalogOffline();
    await updateStorageEstimate();
    showToast(en ? "Offline catalog removed." : "Офлайн-каталог удалён.", "success");
  });
  updateCount();
  updateStorageEstimate();
}

function applyLoadedStateToCurrentScope(nextState, { createFallbackLayout = true } = {}) {
  const exactPublic = personalSavePilotEnabled() && personalSaveOutboxForScope()?.list().some(record => record.action.body.publicImport || record.action.body.serverImport)
    ? clone(nextState) : null;
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
  installRuntimeActiveLayoutId(state, nextState?.activeLayoutId || state.activeLayoutId);
  normalizeContainerFields(state);
  normalizeItemFields(state);
  cleanupGeneratedCatalogArtifacts(state);
  repairContainerMembershipFromItemLinks(state);
  normalizeLayoutFields(state, { createFallbackLayout });
  isolateLinkedLayoutEntities(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  restorePrivateLayoutChoiceInState(state);
  applyLayoutArrangement(state.activeLayoutId, state);
  applyDefaultCollapsedContainers(state);
  if (exactPublic) restorePublicCopyBusinessView(exactPublic);
  hydrateLocalSharedTemplateCatalogFromState(state);
}

function restorePublicCopyBusinessView(payload) {
  const exact = personalPublicImportSnapshot(payload, state);
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, exact);
  installRuntimeActiveLayoutId(state, exact.activeLayoutId);
}

function activateLocalStorageScope(scopeKey) {
  const nextScope = scopeKey || GUEST_STORAGE_SCOPE;
  if (nextScope === localStorageScopeKey) return false;
  const previousScope = localStorageScopeKey;
  personalInitialSaveOutbox = null;
  localStorageScopeKey = nextScope;
  setPhotoCacheScope(nextScope);
  offlinePhotoRenderCoordinator.activateScope(nextScope);
  const scopedSyncMeta = loadSyncMeta();
  const scopedHadLocalState = hasLocalSavedState();
  const scopedHadRemoteBaseline = hasStoredLocalValue(BASE_STATE_KEY) ||
    Boolean(scopedSyncMeta.serverUpdatedAt || scopedSyncMeta.stateRevision || scopedSyncMeta.payloadHash);
  const createFallbackLayout = nextScope === GUEST_STORAGE_SCOPE || scopedHadLocalState;
  const nextState = loadState({ createFallbackLayout });
  hadLocalStateAtStartup = scopedHadLocalState;
  hadRemoteBaselineAtStartup = scopedHadRemoteBaseline;
  startupLocalStateWasFallback = scopedHadLocalState && !scopedHadRemoteBaseline && isGeneratedStartupFallbackState(nextState);
  hadAuthoritativeLocalStateAtStartup = scopedHadLocalState && !startupLocalStateWasFallback;
  syncMeta = scopedSyncMeta;
  currentPackingListId = loadActivePackingListId();
  currentPackingListMeta = null;
  applyLoadedStateToCurrentScope(nextState, { createFallbackLayout });
  if (nextScope === GUEST_STORAGE_SCOPE) guestWorkspaceSessionTracker.reset(state);
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
  setPhotoCacheScope(GUEST_STORAGE_SCOPE);
  offlinePhotoRenderCoordinator.activateScope(GUEST_STORAGE_SCOPE);
  hadLocalStateAtStartup = false;
  hadRemoteBaselineAtStartup = false;
  startupLocalStateWasFallback = false;
  hadAuthoritativeLocalStateAtStartup = false;
  syncMeta = loadSyncMeta();
  currentPackingListId = "";
  currentPackingListMeta = null;
  explicitLayoutChoice = { id: "", at: 0 };
  applyLoadedStateToCurrentScope(createEmptyUserState());
  guestWorkspaceSessionTracker.reset(state);
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

function personalSavePilotEnabled() {
  return PERSONAL_SAVE_OUTBOX_ENABLED && experimentTransport.experiment;
}

function personalPhotoFormUiEnabled() {
  return personalPhotoFormGatesEnabled() && experimentTransport.experiment && Boolean(currentUser)
    && localStorageScopeKey === `id:${currentUser.id}` && !isReadOnlyBikePackingContext() && !isAdminPublicEditScope(modeState);
}

function personalPhotoEditFormUiEnabled() {
  return PERSONAL_PHOTO_EDIT_FORM_ENABLED && personalPhotoFormUiEnabled();
}

function personalPhotoItemContextUiEnabled() {
  return PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED && personalPhotoFormUiEnabled();
}

function personalPhotoContainerContextUiEnabled() {
  return PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED && personalPhotoFormUiEnabled();
}

function personalPendingImportSource(outbox, includeSource = false, { allowDisabledPublic = false } = {}) {
  if (!outbox) return null;
  const options = { records: outbox.list(), operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId, includeSource };
  return (allowDisabledPublic || PERSONAL_SERVER_IMPORT_ENABLED) && personalPendingServerUpdateSource(options)
    || PERSONAL_PENDING_FORM_UPDATE_ENABLED && personalPendingFormUpdateSource(options)
    || (allowDisabledPublic || PERSONAL_PENDING_PUBLIC_UPDATE_ENABLED && PERSONAL_PUBLIC_IMPORT_ENABLED) && personalPendingPublicUpdateSource(options)
    || PERSONAL_PENDING_GUEST_UPDATE_ENABLED && PERSONAL_GUEST_IMPORT_ENABLED && personalPendingGuestUpdateSource(options)
    || PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED && PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED && personalPendingArchiveUpdateSource(options)
    || null;
}

function personalPendingImportFormEnabled() {
  if (!personalPhotoFormUiEnabled()) return false;
  const outbox = personalSaveOutboxForScope();
  return Boolean(outbox?.hasPending() && personalPendingImportSource(outbox, true, { allowDisabledPublic: true }));
}

function personalPendingPhotoFormEnabled(type) {
  if (!PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED || !personalPhotoFormUiEnabled()) return false;
  const outbox = personalSaveOutboxForScope();
  if (!outbox?.hasPending()) return false;
  const entityId = type === "item" ? editingItemId : editingRootContainerId;
  const creating = !entityId;
  const options = { records: outbox.list(), operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId };
  const chain = creating ? personalPendingPhotoFormChain(options)
    : personalPendingPhotoFormChain({ ...options, entityType: type, entityId });
  if (chain?.serverOperationId && (!PERSONAL_SERVER_PHOTO_FORM_ENABLED || !PERSONAL_SERVER_IMPORT_ENABLED)) return false;
  if (chain?.publicOperationId && (!PERSONAL_PUBLIC_PHOTO_FORM_ENABLED || !PERSONAL_PUBLIC_IMPORT_ENABLED)) return false;
  if (creating && !(chain?.serverOperationId && PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED || chain?.publicOperationId && PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED
    || chain?.importOperationId && PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED)) return false;
  if (chain?.importOperationId && (!PERSONAL_IMPORT_PHOTO_FORM_ENABLED || (chain.importKind === "guest"
    ? !PERSONAL_GUEST_IMPORT_ENABLED : !PERSONAL_ARCHIVE_IMPORT_ENABLED || !PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED))) return false;
  return Boolean(chain && (creating || chain.entityType === type && chain.entityId === entityId));
}

function personalPendingImportCreateEnabled() {
  if (!(PERSONAL_PENDING_IMPORT_CREATE_ENABLED || PERSONAL_PENDING_PUBLIC_CREATE_ENABLED || PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED) || !personalPhotoFormUiEnabled()) return false;
  const outbox = personalSaveOutboxForScope();
  if (!outbox?.hasPending()) return false;
  const chain = personalPendingPhotoFormChain({ records: outbox.list(),
    operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId });
  return Boolean(chain?.serverOperationId && PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED && PERSONAL_SERVER_PHOTO_FORM_ENABLED && PERSONAL_SERVER_IMPORT_ENABLED || chain?.importOperationId && PERSONAL_PENDING_IMPORT_CREATE_ENABLED || chain?.publicOperationId && PERSONAL_PENDING_PUBLIC_CREATE_ENABLED);
}

function personalPhotoFormRequest(values, { pendingImport = false, pendingFiles = false, pendingCreate = false } = {}) {
  personalSaveRecovery.assertRunning();
  const outbox = personalSaveOutboxForScope(), head = pendingImport && personalPendingImportFormEnabled()
    || pendingFiles && personalPendingPhotoFormEnabled(values.entityType)
    || pendingCreate && personalPendingImportCreateEnabled() ? outbox.recover() : null;
  const baseline = head ? { payload: head.photoState?.payload || head.action.body.payload, stateRevision: head.action.body.baseStateRevision } : outbox?.confirmedBase();
  if (!personalPhotoFormUiEnabled() || !baseline || !currentPackingListId) {
    throw Error("Сначала подтвердите личный список. Поля и фото остались в форме.");
  }
  return { ...values, ...(head ? { parentOperationId: head.action.operationId } : {}), binding: outbox.binding, snapshot: JSON.parse(JSON.stringify(state)),
    basePayload: baseline.payload, baseStateRevision: baseline.stateRevision };
}

function personalPhotoFormSession(options) {
  personalSaveRecovery.assertRunning();
  if (!personalPhotoFormUiEnabled()) throw Error("Сохранение формы с фото не включено.");
  const outbox = personalSaveOutboxForScope();
  const store = createPersonalPhotoActionStore({ ...outbox.binding, getContext: options.getContext });
  const source = { outbox, store, inventory: null };
  personalPhotoRecoverySource = source;
  const pendingSource = options.pendingImport ? personalPendingImportSource(outbox, true, { allowDisabledPublic: true }) : null;
  const createSession = options.pendingCreate ? createPersonalPendingImportCreateSession : options.pendingFiles ? createPersonalPendingPhotoFormSession : options.pendingImport ? (pendingSource?.action.kind === "photos.mutate" ? createPersonalPendingFormSession : pendingSource?.action.body.serverImport ? createPersonalPendingServerFormSession : pendingSource?.action.body.publicImport ? createPersonalPendingPublicFormSession : pendingSource?.action.body.guestImport ? createPersonalPendingGuestFormSession : createPersonalPendingArchiveFormSession) : options.copyPlacement ? createPersonalPhotoItemCopyPlacementSession : options.copyTree ? createPersonalPhotoTreeCopySession : options.copyBatch ? createPersonalPhotoCopyBatchSession : options.copyOwner ? createPersonalPhotoCopyFormSession
    : options.editExistingPhotos ? createPersonalPhotoEditFormSession : createPersonalPhotoFormSession;
  const session = createSession({ ...options, outbox, store,
    ...(options.pendingFiles ? { publicEnabled: PERSONAL_PUBLIC_PHOTO_FORM_ENABLED, serverEnabled: PERSONAL_SERVER_PHOTO_FORM_ENABLED } : {}),
    ...(options.pendingCreate ? { enabled: PERSONAL_PENDING_IMPORT_CREATE_ENABLED, publicEnabled: PERSONAL_PENDING_PUBLIC_CREATE_ENABLED, serverEnabled: PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED,
      itemContextEnabled: PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED,
      containerContextEnabled: PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED } : {}),
    snapshotToPayload: snapshot => cloneStateForSync(snapshot, { forSync: true }),
    readEntities: path => apiFetch(path, { timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true }),
    readOwner: path => apiFetch(path, { timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true }),
    onDurable(record) {
      personalSaveRecovery.assertRunning();
      // The journal owns this exact form; any new bytes were committed first.
      if (options.pendingImport || options.pendingCreate) {
        if (!personalPendingImportSource(outbox)) throw Error("Не подтверждена связь формы с исходным переносом.");
      } else if (record.action.body.action === "copy-batch") assertPersonalPhotoCopyBatchRecord(record);
      else assertPersonalPhotoFormRecord(record);
      const payload = options.pendingImport || options.pendingCreate ? record.action.body.payload : record.photoState.payload;
      const publicCopyForm = pendingSource?.action.body.serverImport || pendingSource?.action.body.publicImport || [2, 5, 6, 7].includes(record.action.body.ownerResult?.version)
        || [7, 8, 11, 12, 13, 14].includes(record.action.body.photoResults?.version);
      if (publicCopyForm) personalPublicCopySnapshot(payload, record.snapshot, record.snapshot.activeLayoutId);
      else personalReconciledSnapshot(payload, record.snapshot);
      replaceState(record.snapshot, { personalOperationId: record.action.operationId });
      if (!sameJson(serializeState({ forSync: true }), payload)) {
        throw Error("Отображение формы изменило её данные. Исходная форма и все файлы сохранены для проверки.");
      }
      persistStateSnapshot(state, { recordAction: false });
      syncMeta.localUpdatedAt = nowIso(); syncMeta.dirty = true;
      saveSyncMeta();
      personalPhotoFormLiveSource = source;
      options.onDurable(record);
    } });
  let completion;
  return { ...session, submit(input) {
    if (!completion) {
      personalPhotoFormPreparing++;
      completion = session.submit(input).finally(() => { personalPhotoFormPreparing--; });
    }
    return completion;
  } };
}

function reportPersonalPhotoFormError(error, { recovery } = {}) {
  // The still-open form retains preflight failures. Once bytes/queue might be
  // durable, keep a blocking recovery screen rather than permit another action.
  if (recovery) {
    if (personalPhotoRecoverySource) {
      personalPhotoRecoverySource.memoryForm = recovery;
      // Recovery reads/explicit continuation must remain available after the
      // normal editor's outbox wrapper has latched a storage failure.
      try {
        personalPhotoRecoverySource.outbox = createPersonalSaveOutbox({
          ...personalPhotoRecoverySource.store.binding, storage: localStorage });
      } catch {
        // A corrupt queue still permits a raw recovery export. Never let its
        // failed reader hide the frozen form/bytes behind a second exception.
        personalPhotoRecoverySource.outbox = null;
      }
    }
    const blocked = personalSaveRecovery.owns(error) ? error : Object.assign(new Error(error.message || "Форма с фото требует проверки."), {
      cause: error, code: "photo-recovery", isPersonalSaveBlocked: true,
      unconfirmedMemoryDraft: error.unconfirmedMemoryDraft || recovery.preview
    });
    personalSaveRecovery.report(blocked, { scopeKey: localStorageScopeKey, snapshot: error.unconfirmedMemoryDraft || recovery.preview });
  }
  showToast(error.message || "Поля и фото сохранены в открытой форме.", "warning");
}

function preparePersonalCatalogDeletion(value) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  const intent = personalDeletionIntent(value), initial = JSON.stringify(personalSaveContext());
  let used = false;
  // Bind the confirmation to the visible version, not just the selected IDs.
  return () => {
    if (used || initial !== JSON.stringify(personalSaveContext())) {
      showToast(localText("The list changed. Select the records again.", "Список изменился. Выберите записи заново."), "error");
      return false;
    }
    personalSaveRecovery.assertRunning();
    let prepared;
    try {
      const allowPhotoOwners = personalPhotoFormUiEnabled() && PERSONAL_PHOTO_OWNER_DELETION_ENABLED;
      const operationId = crypto.randomUUID();
      prepared = preparePersonalDeletionBatch(state, intent, {
        changedAt: nowIso(), markEdited,
        hasPhotos: record => !allowPhotoOwners && normalizeItemPhotos(record).length > 0
      });
      if (allowPhotoOwners && !preservesConfirmedPersonalPhotos(state, prepared.snapshot, currentPackingListId,
        { userDeletion: prepared.intent })) {
        const outbox = personalSaveOutboxForScope(), parent = outbox?.recover(), currentPayload = serializeState({ forSync: true });
        const copy = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED && PERSONAL_PHOTO_COPY_FORM_ENABLED
          && sameJson(parent?.photoState?.payload || parent?.action.body.payload, currentPayload)
          && personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: parent?.action.operationId, listId: currentPackingListId, includeForm: true });
        const copyDeletion = copy && (copy.action.body.action !== "copy-batch" || PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED)
          && isPersonalPendingPhotoCopyDeletion({ form: copy, basePayload: currentPayload,
          payload: cloneStateForSync(prepared.snapshot, { forSync: true }), userDeletion: prepared.intent, listId: currentPackingListId });
        const formDeletion = PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED && sameJson(parent?.photoState?.payload, currentPayload)
          && isPersonalPendingPhotoOwnerDeletion({ parent, payload: cloneStateForSync(prepared.snapshot, { forSync: true }),
            userDeletion: prepared.intent, listId: currentPackingListId });
        const archive = sameJson(parent?.photoState?.payload || parent?.action.body.payload, currentPayload) && personalPendingImportSource(outbox, true);
        const archiveDeletion = archive && (archive.action.kind === "photos.mutate" ? isPersonalPendingFormUpdate : archive.action.body.serverImport ? isPersonalPendingServerUpdate : archive.action.body.publicImport ? isPersonalPendingPublicUpdate : archive.action.body.guestImport ? isPersonalPendingGuestUpdate : isPersonalPendingArchiveUpdate)({ source: archive, basePayload: currentPayload,
          payload: cloneStateForSync(prepared.snapshot, { forSync: true }), userDeletion: prepared.intent, listId: currentPackingListId });
        if (!copyDeletion && !formDeletion && !archiveDeletion) {
          throw Error("Удаление требует подтверждённых фото либо точно сохранённой формы этого владельца. Исходные данные сохранены.");
        }
      }
      // Publish the complete intent before replacing live state. A storage
      // failure leaves the visible owner and its photos in their original place.
      used = true;
      persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId });
    } catch (error) { showToast(error.message, "error"); return false; }
    // Keep the runtime active-layout accessor/UI state; one complete business
    // candidate and one durable action, before rendering or file cleanup.
    for (const key of ["items", "containers", "layouts", "packedItems", "collapsedContainers", "showOnlyUnpacked"]) {
      if (Object.hasOwn(prepared.snapshot, key)) state[key] = prepared.snapshot[key];
    }
    saveState({ captureArrangement: false, recordAction: false });
    if (editingRootContainerId && !state.containers[editingRootContainerId]) editingRootContainerId = null;
    return true;
  };
}

function preparePersonalCatalogCopy(type, sourceIds, { keepPlacement = false, addToLayoutId = "" } = {}) {
  if (adminTemplateUiEnabled() && isAdminPublicEditScope(modeState)) {
    return prepareCausalAdminCatalogCopy(type, sourceIds, { keepPlacement, addToLayoutId });
  }
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  if (addToLayoutId) {
    showToast(localText("Copying a bag into a layout needs a separate queue adapter.", "Для копирования сумки в укладку ещё нужен отдельный обработчик очереди."), "error");
    return false;
  }
  if (!requireUsageCapacity(type === "item" ? "items" : "containers", sourceIds.length)) return false;
  const collection = type === "item" ? "items" : "containers";
  if (sourceIds.some(id => normalizeItemPhotos(state[collection]?.[id]).length > 0)) {
    if (!PERSONAL_PHOTO_COPY_FORM_ENABLED || !personalPhotoFormUiEnabled() || sourceIds.length > 1 && !PERSONAL_PHOTO_COPY_BATCH_ENABLED || keepPlacement) {
      showToast("Этот вариант копирования с фото пока недоступен. Выбранные записи сохранены.", "error"); return false;
    }
    let session;
    try {
      const sourceId = sourceIds[0], source = state[collection][sourceId], changedAt = nowIso();
      const request = personalPhotoFormRequest(sourceIds.length > 1
        ? { entityType: type, sourceIds, changedAt, editMeta: currentEditMeta(changedAt) }
        : { entityType: type, sourceId, fields: {
        name: type === "item" ? makeItemCopyName(source.name, state.items) : makeContainerCopyName(source.name, state.containers),
        createdAt: changedAt, ...currentEditMeta(changedAt) } });
      session = personalPhotoFormSession({ copyOwner: true, copyBatch: sourceIds.length > 1, getContext: personalSaveContext, onDurable: () => {} });
      session.prepare(request);
    } catch (error) { showToast(error.message, "error"); return false; }
    return async () => {
      try {
        personalSaveRecovery.assertRunning();
        if (!requireUsageCapacity(collection, sourceIds.length)) return false;
        await session.submit(); scheduleRemoteSave(); return true;
      } catch (error) { reportPersonalPhotoFormError(error, { recovery: session.recoveryCopy() }); return false; }
    };
  }
  const operationId = crypto.randomUUID(), initial = JSON.stringify(personalSaveContext());
  let prepared, used = false;
  try {
    prepared = preparePersonalCopyBatch(state, { type: "copy", version: 1, keepPlacement,
      layoutId: keepPlacement ? state.activeLayoutId : "",
      entries: sourceIds.map(sourceId => ({ type, sourceId, targetId: `${type}-${crypto.randomUUID()}` }))
    }, { changedAt: nowIso(), currentEditMeta, normalizeContainerColor, markEdited,
      hasPhotos: record => normalizeItemPhotos(record).length > 0 });
  } catch (error) { showToast(error.message, "error"); return false; }
  return () => {
    if (used || initial !== JSON.stringify(personalSaveContext())) {
      showToast(localText("The list changed. Select the copy sources again.", "Список изменился. Выберите источники копирования заново."), "error");
      return false;
    }
    personalSaveRecovery.assertRunning();
    if (!requireUsageCapacity(type === "item" ? "items" : "containers", sourceIds.length)) return false;
    used = true;
    try { persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    for (const key of ["items", "containers", "layouts", "packedItems"]) state[key] = prepared.snapshot[key];
    if (keepPlacement) applyLayoutArrangement(state.activeLayoutId);
    saveState({ captureArrangement: false, recordAction: false });
    return true;
  };
}

async function preparePersonalContainerTreeAction(request) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  const operationId = crypto.randomUUID(), initial = JSON.stringify(personalSaveContext());
  let prepared, photoSession, photoCopyError, used = false;
  try {
    const changedAt = nowIso(), photoTree = ["containers", "items"].some(collection =>
      Object.values(request.sourceSnapshot?.[collection] || {}).some(owner => normalizeItemPhotos(owner).length > 0));
    if (photoTree && PERSONAL_PHOTO_TREE_COPY_ENABLED && personalPhotoFormUiEnabled() && PERSONAL_PHOTO_COPY_BATCH_ENABLED) {
      const rootName = makeContainerCopyNameForLayout(request.sourceSnapshot.containers[request.sourceSnapshot.rootId].name,
        state.layouts[request.targetLayoutId], state.containers, uiLanguage === "en" ? "copy" : "копия");
      try {
        photoSession = personalPhotoFormSession({ copyTree: true, getContext: personalSaveContext, onDurable: () => {} });
        photoSession.prepare(personalPhotoFormRequest({ request, rootName, changedAt, editMeta: currentEditMeta(changedAt) }));
      } catch (error) { photoCopyError = error; photoSession = null; }
    }
    prepared = photoTree && photoSession && !PERSONAL_PHOTO_TREE_LINK_ENABLED ? { copy: null, link: null, missing: null }
      : await preparePersonalContainerTreeCopy(state, request, { changedAt, currentEditMeta, markEdited,
      listId: personalSaveContext().listId,
      normalizeContainerColor, hasPhotos: record => normalizeItemPhotos(record).length > 0,
      copyContainerName: (name, layout, containers) => makeContainerCopyNameForLayout(name, layout, containers, uiLanguage === "en" ? "copy" : "копия")
    });
    if (initial !== JSON.stringify(personalSaveContext())) throw Error("Список изменился во время подготовки копии. Выберите сумку заново.");
  } catch (error) { showToast(error.message, "error"); return false; }
  return mode => {
    if (used || initial !== JSON.stringify(personalSaveContext())) {
      showToast("Список изменился. Выберите источники копирования заново.", "error"); return false;
    }
    personalSaveRecovery.assertRunning();
    if (mode === "copy" && photoCopyError) { showToast(photoCopyError.message, "error"); return false; }
    if (mode === "copy" && photoSession) {
      const frozen = photoSession.recoveryCopy().request.request.sourceSnapshot;
      if (!requireUsageCapacity("containers", Object.keys(frozen.containers).length)
        || !requireUsageCapacity("items", Object.keys(frozen.items).length)) return false;
      used = true;
      return photoSession.submit().then(({ record }) => {
        scheduleRemoteSave();
        return record.action.body.owners.find(owner => owner.entityType === "container" && owner.copySource.entityId === frozen.rootId).entityId;
      }).catch(error => { reportPersonalPhotoFormError(error, { recovery: photoSession.recoveryCopy() }); return false; });
    }
    const selected = mode === "copy" ? prepared.copy : mode === "link" ? prepared.link : mode === "missing" ? prepared.missing : null;
    if (!selected) { showToast("Для этого варианта копирования ещё нужен отдельный обработчик очереди.", "error"); return false; }
    if (mode === "copy" && (!requireUsageCapacity("containers", selected.intent.containers.length)
      || !requireUsageCapacity("items", selected.intent.items.length))) return false;
    used = true;
    try { persistStateSnapshot(selected.snapshot, { personalMutation: selected.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    for (const key of ["items", "containers", "layouts", "packedItems", "collapsedContainers"]) state[key] = selected.snapshot[key];
    applyLayoutArrangement(state.activeLayoutId);
    saveState({ captureArrangement: false, recordAction: false });
    return selected.rootId;
  };
}

function preparePersonalItemCopyPlacementAction({ sourceId, targetContainerId, targetLayoutId }) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  if (!requireUsageCapacity("items")) return false;
  const initial = JSON.stringify(personalSaveContext()), changedAt = nowIso();
  let prepared, session, operationId, used = false;
  try {
    if (normalizeItemPhotos(state.items[sourceId]).length) {
      if (!PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED || !personalPhotoFormUiEnabled() || !PERSONAL_PHOTO_COPY_BATCH_ENABLED) {
        throw Error("Копирование вещи с фото в сумку ещё не включено. Источник сохранён.");
      }
      session = personalPhotoFormSession({ copyPlacement: true, getContext: personalSaveContext, onDurable: () => {} });
      session.prepare(personalPhotoFormRequest({ request: { sourceId, targetContainerId, targetLayoutId }, changedAt, editMeta: currentEditMeta(changedAt) }));
    } else {
      operationId = crypto.randomUUID();
      prepared = preparePersonalItemCopyPlacement(state, { type: "item-copy-placement", version: 1, sourceId,
        targetId: `item-${crypto.randomUUID()}`, targetContainerId, targetLayoutId }, {
        listId: personalSaveContext().listId, changedAt, currentEditMeta,
        snapshotToPayload: snapshot => cloneStateForSync(snapshot, { forSync: true })
      });
    }
  } catch (error) { showToast(error.message, "error"); return false; }
  return async () => {
    if (used || initial !== JSON.stringify(personalSaveContext())) {
      showToast("Список изменился. Выберите вещь и сумку заново.", "error"); return false;
    }
    personalSaveRecovery.assertRunning();
    if (!requireUsageCapacity("items")) return false;
    used = true;
    try {
      if (session) {
        const { record } = await session.submit(); scheduleRemoteSave();
        return record.action.body.owners[0].entityId;
      }
      persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId });
      for (const key of ["items", "layouts", "packedItems"]) if (Object.hasOwn(prepared.snapshot, key)) state[key] = prepared.snapshot[key];
      applyLayoutArrangement(state.activeLayoutId);
      saveState({ captureArrangement: false, recordAction: false }); scheduleRemoteSave(); return prepared.itemId;
    } catch (error) {
      if (session) reportPersonalPhotoFormError(error, { recovery: session.recoveryCopy() });
      else showToast(error.message, "error");
      return false;
    }
  };
}

function preparePersonalLayoutCopyAction({ sourceLayoutId = "", requestedName, activate = true }) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  const context = personalSaveContext(), initial = JSON.stringify(context), operationId = crypto.randomUUID();
  const targetLayoutId = `layout-${crypto.randomUUID()}`;
  let prepared, used = false;
  try {
    prepared = preparePersonalLayoutCopy(state, { sourceLayoutId, targetLayoutId, requestedName, activate,
      listId: context.listId || personalInitialSaveOutbox?.binding.listId }, {
      changedAt: nowIso(), currentCreateMeta, uniqueLayoutName, dictionaryDefaults: { locations, categories },
      photoEnabled: personalPhotoFormUiEnabled() && PERSONAL_PHOTO_LAYOUT_COPY_ENABLED
    });
  } catch (error) { showToast(error.message, "error"); return false; }
  return () => {
    if (used || initial !== JSON.stringify(personalSaveContext())) {
      showToast("Список изменился. Выберите исходную укладку заново.", "error"); return false;
    }
    personalSaveRecovery.assertRunning(); used = true;
    try { persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    // The full candidate is durable before active-layout preferences or view.
    state.layouts = prepared.snapshot.layouts;
    if (activate) {
      state.activeLayoutId = prepared.layoutId; state.packedItems = prepared.snapshot.packedItems;
      setActivePrivateScope(); applyLayoutArrangement(prepared.layoutId);
    }
    saveState({ captureArrangement: false, recordAction: false });
    if (activate) rememberActiveLayoutChoice(prepared.layoutId);
    render(); return prepared.layoutId;
  };
}

function preparePersonalLayoutDeletionAction(layoutId) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  if (layoutId !== state.activeLayoutId || !canDeleteActiveLayout()) return false;
  const operationId = crypto.randomUUID(), initial = JSON.stringify(personalSaveContext()), eligible = userEditableLayouts().map(layout => layout.id);
  const nextLayoutId = eligible.find(id => id !== layoutId) || `layout-${crypto.randomUUID()}`;
  let prepared, used = false;
  try {
    let replacement = null;
    if (!eligible.some(id => id !== layoutId)) {
      const dictionaries = ensureLayoutDictionaries(JSON.parse(JSON.stringify(state.layouts[layoutId])));
      replacement = { id: nextLayoutId, name: uniqueLayoutName(), rootContainerIds: [],
        arrangement: createEmptyLayoutArrangement(), locations: [...(dictionaries?.locations || locations)],
        categories: [...(dictionaries?.categories || categories)], ...currentCreateMeta(nowIso()) };
    }
    prepared = preparePersonalLayoutDeletion(state, { layoutId, eligibleLayoutIds: eligible, nextLayoutId, replacement });
  } catch (error) { showToast(error.message, "error"); return false; }
  return () => {
    if (used || state.activeLayoutId !== layoutId || initial !== JSON.stringify(personalSaveContext()) || !canDeleteActiveLayout()) {
      showToast(localText("The layout changed. Confirm deletion again.", "Укладка изменилась. Подтвердите удаление заново."), "error");
      return false;
    }
    personalSaveRecovery.assertRunning(); used = true;
    try { persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    for (const key of ["items", "containers", "layouts", "packedItems"]) state[key] = prepared.snapshot[key];
    state.activeLayoutId = prepared.nextLayoutId;
    setActivePrivateScope(); applyLayoutArrangement(prepared.nextLayoutId);
    saveState({ captureArrangement: false, recordAction: false });
    rememberActiveLayoutChoice(prepared.nextLayoutId);
    return true;
  };
}

function preparePersonalDictionaryAction(request, owner = activeDictionaryOwner()) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  if (owner !== state) return false;
  request = JSON.parse(JSON.stringify(request));
  const operationId = crypto.randomUUID(), initial = JSON.stringify(personalSaveContext()), scope = dictionaryEditScope(owner);
  let prepared, used = false;
  try {
    prepared = preparePersonalDictionaryMutation(state, { ...request, values: dictionaryOptionsForOwner(request.type, owner),
      itemIds: scope.items.map(record => record.id), containerIds: scope.containers.map(record => record.id) }, { changedAt: nowIso(), markEdited });
  } catch (error) { showToast(error.message, "error"); return false; }
  return () => {
    if (used || initial !== JSON.stringify(personalSaveContext()) || owner !== state || activeDictionaryOwner() !== owner) {
      showToast(localText("The dictionary changed. Confirm the action again.", "Справочник изменился. Подтвердите действие заново."), "error");
      return false;
    }
    personalSaveRecovery.assertRunning();
    if (request.action === "add" && !requireUsageCapacity(request.type === "location" ? "locations" : "categories")) return false;
    used = true;
    try { persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    for (const key of ["items", "containers", "locations", "categories", "customLocations", "customCategories", "locationDictionary", "categoryDictionary"]) {
      if (Object.hasOwn(prepared.snapshot, key)) state[key] = prepared.snapshot[key];
      else delete state[key];
    }
    saveState({ captureArrangement: false, recordAction: false });
    return true;
  };
}

function preparePersonalPlacementAction(request) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  request = JSON.parse(JSON.stringify(request));
  if (request.layoutId !== state.activeLayoutId && request.action !== "link-item" || warnLockedLayoutMutation(request.layoutId)) return false;
  const operationId = crypto.randomUUID(), initial = JSON.stringify(personalSaveContext());
  let prepared, used = false;
  try {
    prepared = preparePersonalPlacementMutation(state, request, { changedAt: nowIso(), markEdited,
      hasPhotos: record => normalizeItemPhotos(record).length > 0 });
  } catch (error) { showToast(error.message, "error"); return false; }
  return () => {
    if (used || request.layoutId !== state.activeLayoutId && request.action !== "link-item" || initial !== JSON.stringify(personalSaveContext())
      || warnLockedLayoutMutation(request.layoutId)) {
      showToast(localText("The layout changed. Confirm the action again.", "Укладка изменилась. Подтвердите действие заново."), "error");
      return false;
    }
    personalSaveRecovery.assertRunning(); used = true;
    try { persistStateSnapshot(prepared.snapshot, { personalMutation: prepared.intent, operationId }); }
    catch (error) { showToast(error.message, "error"); return false; }
    for (const key of ["items", "containers", "layouts", "packedItems", "collapsedContainers", "showOnlyUnpacked"]) {
      if (Object.hasOwn(prepared.snapshot, key)) state[key] = prepared.snapshot[key];
    }
    applyLayoutArrangement(state.activeLayoutId);
    saveState({ captureArrangement: false, recordAction: false });
    return true;
  };
}

function personalSaveOutboxForScope({ reload = false } = {}) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")) return null;
  personalSaveRecovery.assertRunning();
  const listId = loadActivePackingListId();
  if (!listId) return null;
  const actorId = localStorageScopeKey.slice(3);
  const key = JSON.stringify([actorId, listId, localStorageScopeKey]);
  if (reload) personalSaveOutboxes.delete(key);
  if (!personalSaveOutboxes.has(key)) personalSaveOutboxes.set(key, personalSaveRecovery.outbox(() => createPersonalSaveOutbox({
    storage: localStorage, actorId, listId, scopeKey: localStorageScopeKey
  }), localStorageScopeKey));
  return personalSaveOutboxes.get(key);
}

function hasPendingPersonalSave() {
  return Boolean(personalSaveOutboxForScope()?.hasPending());
}

function capturePersonalSaveIntent(snapshot, personalMutation = null, operationId) {
  if (!personalSavePilotEnabled() || localStorageScopeKey === GUEST_STORAGE_SCOPE
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  let outbox = personalSaveOutboxForScope();
  const body = buildListSaveBodyForSync({
    historyAction: currentHistoryActionContext(), nowIso, syncDevice, syncMeta,
    serializeState: () => cloneStateForSync(snapshot, { forSync: true })
  });
  if (personalMutation?.type === "placement") body.userPlacement = personalPlacementIntent(personalMutation);
  else if (personalMutation?.type === "container-tree") body.userContainerTree = personalContainerTreeIntent(personalMutation);
  else if (personalMutation?.type === "layout-copy") body.userLayoutCopy = personalLayoutCopyIntent(personalMutation);
  else if (personalMutation?.type === "item-copy-placement") body.userItemCopyPlacement = personalItemCopyPlacementIntent(personalMutation);
  else if (personalMutation?.type === "dictionary") body.userDictionary = JSON.parse(JSON.stringify(personalMutation));
  else if (personalMutation?.type === "copy") body.userCopy = personalCopyIntent(personalMutation);
  else if (personalMutation) body.userDeletion = personalDeletionIntent(personalMutation);
  if (!outbox && !currentPackingListId && personalInitialSaveOutbox
    && String(currentUser?.id || "") === personalInitialSaveOutbox.binding.actorId
    && userStorageScopeKey(currentUser) === localStorageScopeKey
    && personalInitialSaveOutbox.binding.scopeKey === localStorageScopeKey) {
    // Prepared after an authenticated empty inventory. This first UI save is
    // synchronous too: durable snapshot/action before the active-list mirror.
    outbox = personalInitialSaveOutbox;
    const intent = outbox.capture({ snapshot, create: true, operationId,
      body: { ...body, title: localText("My packing lists", "Мои укладки") } });
    personalSaveOutboxes.set(JSON.stringify([outbox.binding.actorId, outbox.binding.listId, localStorageScopeKey]), outbox);
    saveActivePackingListId(outbox.binding.listId);
    personalInitialSaveOutbox = null;
    return intent;
  }
  if (!outbox || !currentUser?.id || String(currentUser.id) !== outbox.binding.actorId
    || userStorageScopeKey(currentUser) !== localStorageScopeKey || outbox.binding.listId !== currentPackingListId) {
    throw new Error("Для причинного сохранения сначала нужен подтверждённый личный список и аккаунт.");
  }
  const latest = outbox.recover?.();
  if (!personalMutation && ["list.restore", "list.import", "list.migrate", "photos.mutate"].includes(latest?.action.kind)
    && sameJson(cloneStateForSync(outbox.recoverSnapshot(), { forSync: true }), body.payload)) return latest;
  return outbox.capture({ snapshot, body, operationId });
}

async function prepareInitialPersonalSave() {
  if (!personalSavePilotEnabled() || currentPackingListId || !currentUser
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return;
  const initial = personalSaveContext();
  if (initial.scopeKey !== `id:${initial.actorId}`) throw new Error("Аккаунт локального списка не подтверждён.");
  const listId = await initialPersonalListId(initial.actorId);
  const current = personalSaveContext();
  if (["actorId", "scopeKey", "scope", "generation"].some(key => initial[key] !== current[key]) || currentPackingListId) {
    throw new Error("Локальная версия изменилась при подготовке списка. Требуется повторная проверка.");
  }
  const outbox = personalSaveRecovery.outbox(() => createPersonalSaveOutbox({
    storage: localStorage, actorId: initial.actorId, scopeKey: initial.scopeKey, listId
  }), initial.scopeKey);
  if (outbox.recover()) throw new Error("Найдено сохранённое действие. Сначала восстановите локальный список.");
  // Retain this editor's empty head. Do not create a fresh outbox on its first
  // click, which could silently observe another tab's intervening creation.
  personalInitialSaveOutbox = outbox;
}

function persistStateSnapshot(snapshot = state, { recordAction = true, personalMutation = null, operationId } = {}) {
  if (personalSavePilotEnabled()) personalSaveRecovery.assertRunning();
  const intent = recordAction && personalSavePilotEnabled() && !applyingRemoteState
    ? capturePersonalSaveIntent(snapshot, personalMutation, operationId) : null;
  if (intent || personalSavePilotEnabled() && hasPendingPersonalSave()) {
    // The action already owns a durable snapshot. Never evict another recovery
    // record to make space for this optional legacy/UI mirror.
    safeSetLocalStorage(scopedLocalStorageKey(STORAGE_KEY), JSON.stringify(snapshot), { silent: true });
    return true;
  }
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

function normalizeDemoPayloadForLanguage(payload, language = uiLanguage, { preserveCatalog = false } = {}) {
  const normalizedLanguage = normalizeUiLanguage(language);
  return normalizePublishedDemoTemplatePayload(payload, {
    fallbackName: I18N[normalizedLanguage]?.["demo.layoutName"] || t("demo.layoutName"),
    demoNames: demoTemplateNameCandidates(), preserveCatalog
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
  return options.map(([value, label, kind = ""]) => {
    const draftLayoutId = templateDraftLayoutId(value);
    const editableDraft = Boolean(
      draftLayoutId && canEditLocalUnpublishedAdminTemplate(state.layouts?.[draftLayoutId])
    );
    return [
      value,
      readonlyPublicTemplateOptionLabel(label, { readonly: readonly && !editableDraft }),
      kind,
      disabled && !editableDraft
    ];
  });
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
  const localLayouts = canViewAdminPublishedCatalog()
    ? Object.values(state.layouts || {}).filter((layout) =>
      layout?.adminDemo &&
      layout.adminTemplateCopy &&
      layout.id &&
      (canEditPublishedTemplatesNow() || canEditLocalUnpublishedAdminTemplate(layout)) &&
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
      draftMarker: t("template.draftMarker"),
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
      includeDrafts: canViewAdminPublishedCatalog()
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
      defaultName: localText("Template", "Шаблон"),
      draftMarker: t("template.draftMarker"),
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
  const eligibleLayouts = Object.fromEntries(Object.entries(state.layouts || {}).filter(([, layout]) =>
    canEditPublishedTemplatesNow() || canEditLocalUnpublishedAdminTemplate(layout)
  ));
  return selectLocalAdminTemplateCopyLayouts({
    layouts: eligibleLayouts,
    canOpen: canViewAdminPublishedCatalog(),
    isDeletedSharedLayoutId,
    fallbackLanguage: uiLanguage,
    isLayoutMeaningful,
    templateCopySourceScore: (layout) => templateCopySourceScore(layout, state),
    compareEntries: compareSharedLayoutIndexEntries
  });
}
function activeAdminDraftOptionLabel(layout) {
  if (!canViewAdminPublishedCatalog() || !isPublishedLayoutEditable(layout)) return "";
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
    demo: Boolean(layout.adminDemo),
    unpublished: layout.templatePublished === false,
    draftMarker: t("template.draftMarker")
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
  if (!layout) return localText("Layout", "Укладка");
  if (layout.adminDemo) {
    const language = layout.adminDemoLanguage || uiLanguage;
    return `${normalizeDemoLayoutName(layout.name || currentDemoTemplate(language, layout.adminDemoListId)?.name || t("demo.layoutName"), language)} (${languageOptionLabel(language)})`;
  }
  if (layout.adminSharedSourceId) {
    const sharedLayout = findSharedLayout(layout.adminSharedSourceId);
    const language = layout.adminTemplateCopy ? layout.language || uiLanguage : sharedLayout?.language || layout.language || uiLanguage;
    return `${layout.name || sharedLayout?.name || t("template.prefix")} (${languageOptionLabel(language)})`;
  }
  return layout.name || localText("Layout", "Укладка");
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
  const wasNewAccountDefaultDemoAccount = Boolean(
    currentUser && isNewAccountDefaultDemoAccount(state)
  );
  uiLanguage = nextLanguage;
  saveUiLanguage(uiLanguage);
  applyPublicTemplateLanguage();
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  applyStaticTranslations();
  updateLayoutLoadStatusUi();
  try {
    const result = await handleGuestLanguageLayoutSwitch({
      guestSession: isGuestSession(),
      accountDefaultDemo: wasNewAccountDefaultDemoAccount,
      accountDefaultDemoFlag: NEW_ACCOUNT_DEFAULT_DEMO_FLAG,
      readOnlyStateScope: wasDemoView || wasSharedView,
      sharedListRoute: isSharedListLinkRoute(),
      layouts: state.layouts,
      activeLayoutId: state.activeLayoutId,
      previousLanguage,
      nextLanguage: uiLanguage,
      sourceTemplateId: wasDemoView ? previousDemoTemplateId : "",
      sourceLanguage: previousLanguage,
      templateCatalog: serverConfirmedDemoTemplates,
      findTemplateForLanguage: findDemoTemplateForLanguage,
      defaultTemplateListId: demoPublicListIdForLanguage,
      guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
      createLayout: async ({ templateId }) => {
        const layoutId = await createLocalDemoCopy({
          forceNew: true,
          remember: false,
          exactTemplateName: true,
          activate: false,
          templateId,
          prepareCreatedLayoutForSync: (createdLayoutId) => {
            if (wasNewAccountDefaultDemoAccount) {
              markNewAccountDefaultDemoLayout(state, createdLayoutId);
            }
          }
        });
        return layoutId;
      },
      confirmOpen: ({ layout }) => askConfirmDialog({
        title: t("guest.languageLayoutCreatedTitle", {
          language: t(`language.name.${uiLanguage}`)
        }),
        text: t("guest.languageLayoutCreatedText", {
          language: t(`language.name.${uiLanguage}`),
          name: layout.name || t("demo.layoutName")
        }),
        okText: t("guest.languageLayoutOpen"),
        cancelText: t("guest.languageLayoutStay"),
        tone: "warning"
      }),
      openLayout: (layoutId) => openPrivateLayout(layoutId, { remember: true })
    });
    if (result.status === "created" && result.offerOpen === false) {
      const createdLayout = state.layouts?.[result.layoutId];
      showToast(t("guest.languageLayoutCreatedFromTemplateToast", {
        language: t(`language.name.${uiLanguage}`),
        name: createdLayout?.name || t("demo.layoutName")
      }), "success");
    } else if (result.status === "failed") {
      showToast(t("guest.languageLayoutCreateFailed"), "warning");
    }
  } catch (error) {
    showToast(t("guest.languageLayoutCreateFailedWithReason", { message: error.message }), "warning");
  }
  if (sharedLanguageTarget && sharedLanguageTarget.id !== previousReadOnlyLayoutId) {
    await openSharedLayoutViewer(sharedLanguageTarget.id, { remember: true });
    updateSyncUi();
    return;
  }
  if (wasSharedView && !preserveLinkedSharedList && !sharedLanguageTarget) {
    await openDemoLayoutFromSelect({ language: uiLanguage, remember: true });
    updateSyncUi();
    return;
  }
  render();
  if (isOfflineRememberedSession()) setOfflineRememberedLayoutLoadStatus();
  updateSyncUi();
  if (wasAdminDemoEdit) {
    try {
      if (!currentUser) {
        updateSyncUi(localText("Demo/admin: sign in as an administrator to edit the selected language version", "Demo/admin: войдите админом, чтобы редактировать версию выбранного языка"));
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
  const startupLanguage = resolveAppStartupLanguage({
    uiLanguage,
    authenticated: Boolean(currentUser),
    rememberedSession: !isExplicitlySignedOut() && Boolean(getSavedAuthScopeKeyFromStorage(localStorage)),
    defaultLanguage: DEFAULT_LANGUAGE
  });
  const startupDictionary = I18N[startupLanguage] || I18N[DEFAULT_LANGUAGE] || {};
  applyStaticTranslationsUi({
    activeReadOnlyLayoutId,
    canOpenAdminPublishedEdit,
    demoCopyActionText,
    demoSharedLayoutId: DEMO_SHARED_LAYOUT_ID,
    documentRef: document,
    isSharedLayoutView,
    refs,
    startupLanguage,
    startupText: startupDictionary["startup.loading"] || "Loading...",
    startupTitle: startupDictionary["startup.title"] || "Opening bikepacking list",
    t,
    uiLanguage
  });
  syncNewEntityFormDraftCatalogCards();
  desktopInputLayoutController.refresh();
  interfaceColorThemeController.refresh();
}

async function init() {
  installExperimentBanner();
  syncMainViewScrollHost(getCurrentView(), {
    documentRef: document,
    navigatorRef: navigator,
    windowRef: window
  });
  registerAppServiceWorker({ isLocalDevOrigin });
  if (refs.appVersion) refs.appVersion.textContent = APP_VERSION;
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;
  setupPackingVisualStyleQuickControl();
  applyPackingVisualStyle();
  applyStaticTranslations();
  setupModalScrollLock();
  setupDialogKeyboardScrollGuard([refs.dialog, refs.rootContainerDialog]);
  setupTouchActionButtonFeedback();
  bindExplicitViewportScrollIntent({
    documentRef: document,
    windowRef: window
  });
  window.addEventListener("pagehide", flushOpenEntityFormDrafts);
  document.addEventListener("pointerdown", (event) => {
    blurActiveEditableBeforeButtonAction(event, { ignoredButton: refs.saveRootContainerBtn });
  }, true);

  bindMainTabTouchNavigation(document.querySelectorAll(".tab"), {
    documentRef: document,
    onPackingDoubleTap: togglePackingViewMode,
    onSelect: switchView,
    requestFrame: window.requestAnimationFrame.bind(window)
  });

  refs.layoutSelect.addEventListener("change", async (event) => {
    event.currentTarget?.blur?.();
    await flushActivePublishedEditSave();
    const value = event.target.value;
    if (isDemoLayoutChoice(value)) {
      const language = demoLanguageFromLayoutChoice(value);
      const templateId = demoTemplateIdFromLayoutChoice(value);
      if (await confirmPublicLayoutTransition("demo")) {
        if (canEditPublishedTemplatesNow()) await openAdminDemoLayout({ language, templateId });
        else await openDemoLayoutFromSelect({ language, templateId });
      } else {
        renderFilters();
      }
      return;
    }
    if (value.startsWith("shared:")) {
      const layoutId = value.slice("shared:".length);
      if (await confirmPublicLayoutTransition("shared", findSharedLayout(layoutId))) {
        if (canEditPublishedTemplatesNow()) await openSharedLayoutForAdmin(layoutId);
        else await openSharedLayoutViewer(layoutId);
      } else {
        renderFilters();
      }
      return;
    }
    const templateDraftId = templateDraftLayoutId(value);
    if (templateDraftId) {
      const layoutId = templateDraftId;
      const layout = state.layouts?.[layoutId];
      if (!isManagedTemplateUnpublished(layout) && !requirePublishedTemplatesAvailable()) {
        renderFilters();
        return;
      }
      if (
        isManagedPublicTemplateDraft(layout) &&
        (canEditPublishedTemplatesNow() || canEditLocalUnpublishedAdminTemplate(layout))
      ) {
        if (shouldConfirmManagedTemplateTransition(layout)) {
          const transitionKind = layout.adminDemo ? "demo" : "shared";
          const transitionTarget = layout.adminDemo
            ? layout
            : findSharedLayout(layout.adminSharedSourceId) || layout;
          if (!(await confirmPublicLayoutTransition(transitionKind, transitionTarget))) {
            renderFilters();
            return;
          }
        }
        if (adminTemplateUiEnabled()) await openCausalAdminTemplate(publishedLayoutTarget(layout));
        else activateAdminPublishedLayout(layoutId);
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
  bindCategorySearch(refs.categoryFilterSearch, refs.categoryFilterList, {
    emptyText: () => t("categories.searchEmpty")
  });
  bindCategorySearch(refs.itemCategorySearch, refs.itemCategoryList, {
    emptyText: () => t("categories.searchEmpty")
  });
  bindCategorySearch(refs.rootContainerCategorySearch, refs.rootContainerCategoryList, {
    emptyText: () => t("categories.searchEmpty")
  });
  bindCategoryFilterResetVisibility(refs.categoryFilterList, refs.resetCategoryFilterBtn);
  refs.applyCategoryFilterBtn.addEventListener("click", applyCategoryFilterDialog);
  refs.addToContainerSearch.addEventListener("input", renderAddToContainerResults);
  refs.clearAddToContainerSearchBtn.addEventListener("pointerdown", (event) => event.preventDefault());
  refs.clearAddToContainerSearchBtn.addEventListener("click", clearAddToContainerSearch);
  refs.addToContainerPhotoToggleBtn?.addEventListener("click", togglePickerListPhotos);
  refs.createSubcontainerBtn.addEventListener("click", createSubcontainerFromAddDialog);
  refs.createItemForContainerBtn?.addEventListener("click", openNewItemForAddTarget);
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
  refs.layoutRootPhotoToggleBtn?.addEventListener("click", togglePickerListPhotos);
  refs.createRootForLayoutBtn?.addEventListener("click", openCreateRootContainerForCurrentLayout);
  refs.layoutRootDialog.addEventListener("close", () => {
    refs.layoutRootSearch.value = "";
  });
  refs.rootContainerPlacementBtn.addEventListener("click", openRootContainerPlacementAction);
  refs.rootContainerReplaceBtn?.addEventListener("click", openContainerReplacementDialog);
  refs.rootContainerCopyToContainerBtn?.addEventListener("click", openRootContainerCopyPickerDialog);
  refs.rootContainerRemoveFromLayoutBtn?.addEventListener("click", confirmRemoveEditingContainerFromActiveLayout);
  refs.rootContainerDeleteForeverBtn?.addEventListener("click", confirmDeleteEditingRootContainerForever);
  refs.itemContainerPickerBtn.addEventListener("click", openItemContainerPickerDialog);
  refs.itemCopyToContainerBtn?.addEventListener("click", openItemCopyContainerPickerDialog);
  refs.itemReplaceBtn?.addEventListener("click", () => openPackingItemReplacementDialog());
  refs.itemRemoveFromLayoutBtn?.addEventListener("click", confirmRemoveEditingItemFromActiveLayout);
  refs.itemDeleteForeverBtn?.addEventListener("click", confirmDeleteEditingItemForever);
  refs.containerPickerLayoutSelect?.addEventListener("change", () => {
    containerPickerLayoutId = refs.containerPickerLayoutSelect.value || getPublishedEditLayoutId();
    renderContainerPicker();
  });
  refs.containerPickerNoneBtn.addEventListener("click", () => {
    if (containerPickerMode === "container" || isContainerPickerContainerCopyMode()) {
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
  bindLayoutComparisonControls();
  refs.unpackedOnlyBtn.addEventListener("click", () => {
    toggleShowOnlyUnpacked(state);
    saveState();
    render();
  });
  refs.unpackAllBtn.addEventListener("click", unpackAllItems);
  refs.saveItemBtn.addEventListener("click", saveDialogItem);
  refs.shareItemLinkBtn?.addEventListener("click", shareEditingItemByLink);
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
  refs.shareRootContainerLinkBtn?.addEventListener("click", shareEditingContainerByLink);
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
    resetSharedReadonlyRootContainerDialog();
    resetRootContainerDialogPhotoDraft();
  });
  refs.dialog.addEventListener("close", () => {
    itemDialogInitialSnapshot = null;
    resetSharedReadonlyItemDialog();
    resetItemDialogPhotoDraft();
  });
  bindDialogBackdropClickGuard(refs.dialog, () => Boolean(
    itemDialogPhotoDraft &&
    photoDraftChanged(itemDialogPhotoDraft, editingItemId ? state.items?.[editingItemId] : { photos: [] })
  ));
  bindFilePickerDialogDismissGuard(refs.dialog, [refs.itemPhotoInput, refs.itemPhotoCameraInput]);
  bindDialogBackdropClickGuard(refs.rootContainerDialog, () => Boolean(
    rootContainerDialogPhotoDraft &&
    photoDraftChanged(rootContainerDialogPhotoDraft, editingRootContainerId ? state.containers?.[editingRootContainerId] : { photos: [] })
  ));
  bindFilePickerDialogDismissGuard(refs.rootContainerDialog, [refs.rootContainerPhotoInput, refs.rootContainerPhotoCameraInput]);
  refs.newLayoutBtn.addEventListener("click", (event) => {
    if (isSharedLayoutView()) {
      copySharedLayout(activeReadOnlyLayoutId(), { triggerButton: event.currentTarget });
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
  refs.publishEditedTemplateBtn?.addEventListener("click", handleEditedTemplatePublication);
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
  refs.languageSelect?.addEventListener("change", async (event) => {
    const select = event.currentTarget;
    select.disabled = true;
    try {
      await setUiLanguage(select.value);
    } catch (error) {
      updateSyncUi(t("language.switchFailed", { message: error.message }));
    } finally {
      select.disabled = false;
    }
  });
  refs.copySharedLayoutBtn.addEventListener("click", (event) => copySharedLayout(currentSharedLayouts()[0]?.id, {
    triggerButton: event.currentTarget
  }));
  refs.forceOfflineBtn.addEventListener("click", toggleForcedOfflineMode);
  bindExperimentTransportMenu({ button: refs.apiRouteMenuBtn, dialog: refs.apiRouteDialog,
    getLanguage: () => uiLanguage, openModalDialog });
  refs.authForm.addEventListener("submit", submitAuthDialog);
  refs.authConfirmTitle?.addEventListener("click", () => revealAuthMagicLinkConfirmation());
  refs.authConfirmBtn?.addEventListener("click", confirmAuthMagicLink);
  refs.authMagicLink?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    confirmAuthMagicLink();
  });
  refs.syncBtn.addEventListener("click", () => syncNow({ force: true }));
  refs.menuBtn.addEventListener("click", toggleTopMenu);
  refs.visualStyleMenuBtn?.addEventListener("click", togglePackingVisualStylePanel);
  refs.topMenu.addEventListener("click", (event) => {
    if (event.target.closest("button")) closeTopMenu();
  });
  refs.historyBtn.addEventListener("click", openHistoryDialog);
  refs.adminReportsBtn?.addEventListener("click", () => adminReportsDialogController?.open());
  refs.catalogUpdatesBtn?.addEventListener("click", () => manufacturerCatalogReviewDialogController?.open());
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
  refs.historyDemoDeletedToggle?.addEventListener("click", () => {
    const previousValue = refs.historyDemoSelect?.value || "";
    toggleHistoryDeletedSources(refs.historyDemoDeletedToggle);
    renderHistorySourceControls();
    if (refs.historyDemoSelect?.value !== previousValue) {
      refs.historyDemoSelect?.dispatchEvent(new Event("change"));
    }
  });
  refs.historySharedSelect?.addEventListener("change", () => {
    historyComparisonState = null;
    historyPageState = null;
    historyDetailCache.clear();
    selectedHistoryDetailRecordKey = "";
    refs.historyDetailDialog?.close();
    refreshHistoryDialog();
  });
  refs.historySharedDeletedToggle?.addEventListener("click", () => {
    const previousValue = refs.historySharedSelect?.value || "";
    toggleHistoryDeletedSources(refs.historySharedDeletedToggle);
    renderHistorySourceControls();
    if (refs.historySharedSelect?.value !== previousValue) {
      refs.historySharedSelect?.dispatchEvent(new Event("change"));
    }
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
  const networkTransitionController = createNetworkTransitionController({
    onOnline: () => {
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
    },
    onOffline: () => {
      // Safari may report `offline` while LTE can still reach the API.
      // Authentication scope changes only after a real request fails.
      updateSyncUi();
    }
  });
  window.addEventListener("online", networkTransitionController.reportOnline);
  window.addEventListener("offline", networkTransitionController.reportOffline);
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
    scheduleFilterNavigationRefresh();
  }, { passive: true });
  document.querySelector("#exportBtn")?.addEventListener("click", exportData);
  document.querySelector("#resetBtn")?.addEventListener("click", resetData);

  appUnlocked = true;
  const sharedListId = sharedListIdFromLocation();
  const signedOut = isExplicitlySignedOut();
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
  let resolvePublicCatalogReady;
  const publicCatalogReady = new Promise((resolve) => { resolvePublicCatalogReady = resolve; });
  const publicIndexRefresh = refreshPublicSharedTemplates({
    renderAfter: false,
    onCatalogReady: resolvePublicCatalogReady
  }).catch(() => null).finally(resolvePublicCatalogReady);
  if (sharedListId) {
    openSharedListFromLink(sharedListId, sharedLayoutIdFromLocation());
    return;
  }
  try {
    if (isForcedOffline()) {
      if (signedOut) await enterSignedOutPublicMode(localText("Signed out · personal lists are hidden, local demo copy is open", "Вы вышли · личные списки скрыты, открыта локальная демо-копия"));
      else unlockOfflineState(localText("Forced offline · local layout is available", "Принудительный офлайн · локальная укладка доступна"));
    } else {
      await checkAuthAndLoad({ deferAdminTemplates: true });
    }
    const publicIndexStartupStatus = await waitForStartupTask(publicCatalogReady, {
      timeoutMs: PUBLIC_CATALOG_STARTUP_TIMEOUT_MS
    });
    if (publicIndexStartupStatus === "timeout") {
      publicIndexRefresh.then(() => {
        if (!document.body.classList.contains("app-starting")) render();
      }).catch(() => null);
    }
  } finally {
    applyStaticTranslations();
    renderBeforeFinishingAppStartup({ documentRef: document, render });
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

function loadState({ createFallbackLayout = true } = {}) {
  const outbox = personalSaveOutboxForScope({ reload: true });
  // Resolve before the legacy parser's fallback catch: corrupt/forked intent
  // must not silently turn into an empty editable list.
  const recovered = outbox?.recoverSnapshot();
  const mirror = localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY));
  const saved = recovered ? JSON.stringify(personalSnapshotWithUiPreferences(recovered, mirror)) : mirror;
  if (!saved) {
    const initial = createEmptyUserState();
    ensureItemDisplayModeState(initial);
    normalizeContainerFields(initial);
    normalizeItemFields(initial);
    repairContainerMembershipFromItemLinks(initial);
    normalizeLayoutFields(initial, { createFallbackLayout });
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
    let parsed = JSON.parse(saved);
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
    normalizeLayoutFields(parsed, { createFallbackLayout });
    isolateLinkedLayoutEntities(parsed);
    normalizeItemCategories(parsed);
    migrateContainerOrder(parsed);
    restorePrivateLayoutChoiceInState(parsed);
    applyLayoutArrangement(parsed.activeLayoutId, parsed);
    applyDefaultCollapsedContainers(parsed);
    if (!recovered && isSuspiciousEmptyPackingState(parsed)) {
      const fallback = createEmptyUserState();
      ensureItemDisplayModeState(fallback);
      normalizeContainerFields(fallback);
      normalizeItemFields(fallback);
      repairContainerMembershipFromItemLinks(fallback);
      normalizeLayoutFields(fallback, { createFallbackLayout });
      isolateLinkedLayoutEntities(fallback);
      normalizeItemCategories(fallback);
      migrateContainerOrder(fallback);
      restorePrivateLayoutChoiceInState(fallback);
      applyLayoutArrangement(fallback.activeLayoutId, fallback);
      applyDefaultCollapsedContainers(fallback);
      installRuntimeActiveLayoutId(fallback, fallback.activeLayoutId);
      return fallback;
    }
    if (recovered && outbox.list().some(record => record.action.body.publicImport || record.action.body.serverImport)) parsed = personalPublicImportSnapshot(recovered, parsed);
    installRuntimeActiveLayoutId(parsed, parsed.activeLayoutId);
    persistStateSnapshot(parsed, { recordAction: false });
    return parsed;
  } catch (error) {
    if (error.isPersonalSaveBlocked) throw error;
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
  return hasPendingPersonalSave() || Boolean(localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY)));
}

function hasStoredLocalValue(key, scope = localStorageScopeKey) {
  try {
    return Boolean(localStorage.getItem(scopedLocalStorageKey(key, scope)));
  } catch {
    return false;
  }
}

function loadBaseState() {
  // The immutable adopted baseline survives a crash before the legacy mirror.
  // Read it outside the fallback catch: a broken journal must not become null.
  const baseline = personalSaveOutboxForScope()?.baseline();
  if (baseline) return normalizeRemoteState(baseline.payload, { repairCatalog: false });
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
  const meta = loadStoredSyncMeta(scopedLocalStorageKey(SYNC_META_KEY), {
    normalizeStateRevision,
    normalizeIntegrityCount
  });
  const baseline = personalSaveOutboxForScope()?.baseline();
  if (baseline) Object.assign(meta, baseline.meta, { stateRevision: baseline.stateRevision });
  if (hasPendingPersonalSave()) meta.dirty = true;
  return meta;
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
    normalizeInterfaceColorBrightness,
    normalizeInterfaceColorTheme,
    packingVisualStyleVersion: PACKING_VISUAL_STYLE_SETTINGS_VERSION,
    defaultPackingVisualStyle: PACKING_VISUAL_STYLE_PRIMARY,
    defaultInterfaceColorBrightness: DEFAULT_INTERFACE_COLOR_BRIGHTNESS,
    defaultInterfaceColorTheme: DEFAULT_INTERFACE_COLOR_THEME
  });
}

function saveUiSettings() {
  saveStoredUiSettings({
    itemSortMode,
    rootContainerSortMode,
    dictionaryLocationSortMode,
    dictionaryCategorySortMode,
    interfaceColorBrightness,
    interfaceColorTheme,
    packingVisualStyle,
    packingViewMode,
    pickerListPhotos,
    bike3dTransforms,
    bike3dViewState
  }, {
    storageKey: UI_SETTINGS_KEY,
    normalizeSortMode,
    normalizePackingVisualStyle,
    normalizePackingViewMode,
    normalizeBike3dTransforms,
    normalizeBike3dViewState,
    normalizeInterfaceColorBrightness,
    normalizeInterfaceColorTheme,
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
  showToast(isBike3dPackingView(packingViewMode)
    ? localText("3D packing view enabled.", "3D-укладка включена.")
    : localText("Standard packing view enabled.", "Обычная укладка включена."), "success");
}

function updatePackingViewModeControl(view = getCurrentView()) {
  document.body.classList.toggle("packing-bike3d-view", view === "packing" && isBike3dPackingView(packingViewMode));
}

function setLayoutLoadStatus(tone = "idle", text = "") {
  layoutLoadStatus.setStatus(tone, text);
}

function setOfflineRememberedLayoutLoadStatus(message = "") {
  const rememberedStatus = offlineRememberedStatusMessages(offlineRememberedSessionReason);
  setLayoutLoadStatus("warning", message || rememberedStatus.layout || localText(
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
  const storedId = loadStoredActivePackingListId({
    storageKey: ACTIVE_LIST_ID_KEY,
    scopedKey: scopedLocalStorageKey
  });
  if (storedId || !personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")) return storedId;
  return personalSaveRecovery.run(() => recoverPersonalSaveListId({
    storage: localStorage, actorId: localStorageScopeKey.slice(3), scopeKey: localStorageScopeKey
  }), { scopeKey: localStorageScopeKey });
}

function saveActivePackingListId(listId) {
  if (personalSavePilotEnabled() && localStorageScopeKey.startsWith("id:")) {
    const previousId = loadActivePackingListId();
    if (previousId && previousId !== listId && personalSaveOutboxForScope()?.hasPending()) {
      throw new Error("У текущего списка есть неподтверждённые действия. Смена списка или повторное создание остановлены.");
    }
  }
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
    if (adminTemplateUiEnabled()) return Boolean(await openCausalAdminTemplate(publishedLayoutTarget(state.layouts[layoutId]), { remember: false }));
    activateAdminPublishedLayout(layoutId, { remember: false });
    return true;
  }
  const savedLayout = state.layouts?.[choice];
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminDemo) {
    if (adminTemplateUiEnabled()) return Boolean(await openCausalAdminTemplate(publishedLayoutTarget(savedLayout), { remember: false }));
    if (savedLayout.adminTemplateCopy) activateAdminPublishedLayout(savedLayout.id, { remember: false });
    else await openAdminDemoLayout({ remember: false, language: savedLayout.adminDemoLanguage || uiLanguage, templateId: savedLayout.adminDemoListId || "" });
    return true;
  }
  if (!publicOnly && canOpenAdminPublishedEdit() && savedLayout?.adminSharedSourceId) {
    if (adminTemplateUiEnabled()) return Boolean(await openCausalAdminTemplate(publishedLayoutTarget(savedLayout), { remember: false }));
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
  layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || [], {
    itemQuantities: layout.arrangement?.itemQuantities
  });
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

function persistActiveLayoutSelection({ sync = false, recordAction = true } = {}) {
  if (!state.layouts?.[state.activeLayoutId]) return;
  if (isReadOnlyStateScope() || isAdminEditablePublishedLayout(state.activeLayoutId)) return;
  if (!canUseLocalEditableState(state.activeLayoutId)) return;
  saveState({ sync: false, recordAction });
  if (sync && syncMeta.dirty) updateSyncUi();
}

function applyLayoutArrangement(layoutId = state.activeLayoutId, targetState = state, { preserveCatalog = false } = {}) {
  applyingLayoutArrangement = true;
  try {
    applyLayoutArrangementToState(targetState, layoutId, {
      migrateContainerOrder,
      normalizeLayoutArrangement,
      repairContainerMembershipFromItemLinks,
      preserveCatalog
    });
  } finally {
    applyingLayoutArrangement = false;
  }
}

function switchActiveLayout(layoutId, { remember = true, recordAction = remember, renderAfter = true } = {}) {
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
      persistActiveLayoutSelection({ sync: remember, recordAction });
    }
    if (renderAfter) render();
    return;
  }
  if (canUsePrivateState()) setActivePrivateScope();
  else setActiveLocalEditableScope(layoutId);
  captureActiveLayoutArrangement();
  state.activeLayoutId = layoutId;
  applyLayoutArrangement(layoutId);
  explicitLayoutChoice = { id: layoutId, at: Date.now() };
  if (remember) rememberActiveLayoutChoice(layoutId);
  persistActiveLayoutSelection({ sync: remember, recordAction });
  if (!(state.layouts[layoutId]?.rootContainerIds || []).length) {
    rootContainerUsageFilter = "all";
  }
  if (renderAfter) render();
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
  const message = localText(
    `The server version failed the integrity check: ${error.message}. The local version was kept.`,
    `Серверная версия не прошла проверку целостности: ${error.message}. Локальная версия оставлена.`
  );
  updateSyncUi(message);
  showToast(message, "error");
  return true;
}

function assertRemoteStateIntegrity(remoteState, meta, rawPayload = null) {
  const error = remoteStateIntegrityError(remoteState, meta, rawPayload);
  if (!error) return;
  throw new Error(localText(
    `The server version failed the integrity check: ${error.message}`,
    `Серверная версия не прошла проверку целостности: ${error.message}`
  ));
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

function saveState({ captureArrangement = true, sync = true, personalMutation = null, recordAction = true } = {}) {
  if (captureArrangement) captureActiveLayoutArrangement();
  solidifyManagedTemplateDrafts();
  sanitizePrivateCopiedPublicOrigins(state, { guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG });
  const activeManagedDraft = state.layouts?.[getPublishedEditLayoutId()];
  if (
    sync &&
    !applyingRemoteState &&
    isAdminPublicEditScope(modeState) &&
    isAdminEditablePublishedLayout(activeManagedDraft?.id) &&
    isManagedTemplateUnpublished(activeManagedDraft)
  ) {
    markManagedTemplateDraftSyncPending(activeManagedDraft);
  }
  const privateStateCanPersist = canUseLocalEditableState() && !isReadOnlyStateScope();
  if (privateStateCanPersist) {
    if (sync && !applyingRemoteState) markCurrentGuestWorkspaceForLoginHandoff();
    persistStateSnapshot(state, { personalMutation, recordAction });
  } else if (!isAdminEditablePublishedLayout()) {
    if (sync && !applyingRemoteState) {
      syncMeta.dirty = false;
      saveSyncMeta();
      updateSyncUi(currentPublicTemplateStatusMessage());
    }
    return;
  }
  if (sync && !applyingRemoteState && isAdminPublicEditScope(modeState) && isAdminEditablePublishedLayout()) {
    if (isManagedTemplateUnpublished(state.layouts?.[getPublishedEditLayoutId()])) {
      scheduleActivePublishedEditSave();
      updateSyncUi(t("template.draftStatus"));
      return;
    }
    scheduleActivePublishedEditSave();
    updateSyncUi(localText("Public layout changed · publishing...", "Public-укладка изменена · публикую..."));
    return;
  }
  if (sync && !applyingRemoteState && isReadOnlyBikePackingContext()) {
    syncMeta.dirty = false;
    saveSyncMeta();
    updateSyncUi(currentPublicTemplateStatusMessage());
    return;
  }
  if (sync && !applyingRemoteState) {
    if (!hasPendingPersonalSave() && !hasLocalSyncChanges()) {
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
  const shouldPublishTarget = targetIsPublic && shouldAutoPublishManagedTemplate(state.layouts?.[layoutId]);
  saveState({ sync: !targetIsPublic });
  if (targetIsPublic && !shouldPublishTarget) updateSyncUi(t("template.draftStatus"));
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

function guestCandidateLayouts(candidate) {
  return guestCandidateLayoutsValue(candidate, {
    fallbackName: GUEST_LAYOUT_FALLBACK_NAME
  });
}

function markCurrentGuestWorkspaceForLoginHandoff() {
  const enabled = !currentUser &&
    localStorageScopeKey === GUEST_STORAGE_SCOPE &&
    currentViewScope() === VIEW_SCOPE_GUEST_LOCAL;
  return recordGuestWorkspaceSessionChanges({
    enabled,
    layoutIds: enabled ? guestWorkspaceSessionTracker.changedLayoutIds(state) : [],
    manifestKey: GUEST_WORKSPACE_MANIFEST_KEY,
    sessionId: guestWorkspaceSessionTracker.sessionId,
    storage: localStorage
  });
}

function clearGuestLoginHandoff() {
  consumeStoredGuestLoginHandoff(localStorage, GUEST_LOGIN_HANDOFF_KEY);
}

function prepareGuestLoginHandoff(email) {
  return storeGuestLoginHandoff({
    candidate: guestLocalLayoutCandidate(state),
    email,
    enabled: !currentUser &&
      localStorageScopeKey === GUEST_STORAGE_SCOPE &&
      currentViewScope() === VIEW_SCOPE_GUEST_LOCAL,
    guestSessionId: guestWorkspaceSessionTracker.sessionId,
    handoffKey: GUEST_LOGIN_HANDOFF_KEY,
    manifestKey: GUEST_WORKSPACE_MANIFEST_KEY,
    storage: localStorage
  });
}

function storedGuestLoginHandoffCandidate() {
  if (!canImportGuestLayoutsForAuthenticatedUser(currentUser)) return null;
  return resolveStoredGuestLoginHandoffCandidate({
    candidateFromState: guestLocalLayoutCandidate,
    guestStateKey: STORAGE_KEY,
    handoffKey: GUEST_LOGIN_HANDOFF_KEY,
    storage: localStorage,
    user: currentUser
  });
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

function isReadOnlyBikePackingContext(record = null, { allowReadOnlyView = false } = {}) {
  return isReadOnlyBikePackingMutationContext({
    allowReadOnlyView,
    readOnlyView: isPublicLayoutContext(),
    listId: currentPackingListId,
    records: [record, currentPackingListMeta],
    isPublicTemplateListId
  });
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
  const layout = state.layouts?.[layoutId];
  if (!canOpenAdminPublishedEdit() || !isAdminEditablePublishedLayout(layoutId) || !layout) return;
  if (adminTemplateUiEnabled()) {
    // Capture at the edit, before debounce, route changes or asynchronous checks.
    adminTemplateSaveCoordinator().capture(layoutId, { published: shouldAutoPublishManagedTemplate(layout) }).then(() => {
      if (publishedLayoutSaveTimer) window.clearTimeout(publishedLayoutSaveTimer);
      publishedLayoutSaveLayoutId = layoutId;
      publishedLayoutSaveTimer = window.setTimeout(() => {
        publishedLayoutSaveTimer = null; publishedLayoutSaveLayoutId = "";
        adminTemplateSaveCoordinator().flush(layoutId).catch(reportAdminTemplateSaveError);
      }, delay);
    }).catch(reportAdminTemplateSaveError);
    return;
  }
  if (publishedLayoutSaveTimer && publishedLayoutSaveLayoutId && publishedLayoutSaveLayoutId !== layoutId) {
    const previousLayoutId = publishedLayoutSaveLayoutId;
    window.clearTimeout(publishedLayoutSaveTimer);
    publishedLayoutSaveTimer = null;
    publishedLayoutSaveLayoutId = "";
    savePublishedLayoutRecord(previousLayoutId).catch((error) => {
      updateSyncUi(localText(`Could not save the public layout: ${error.message}`, `Не удалось сохранить public-укладку: ${error.message}`));
    });
  }
  if (publishedLayoutSaveTimer) window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveLayoutId = layoutId;
  publishedLayoutSaveTimer = window.setTimeout(() => {
    const targetLayoutId = publishedLayoutSaveLayoutId || layoutId;
    publishedLayoutSaveTimer = null;
    publishedLayoutSaveLayoutId = "";
    savePublishedLayoutRecord(targetLayoutId).catch((error) => {
      updateSyncUi(localText(`Could not save the public layout: ${error.message}`, `Не удалось сохранить public-укладку: ${error.message}`));
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
  if (adminTemplateUiEnabled()) {
    if (publishedLayoutSaveTimer) window.clearTimeout(publishedLayoutSaveTimer);
    publishedLayoutSaveTimer = null; publishedLayoutSaveLayoutId = "";
    if (state.layouts?.[layoutId]?.adminCausalSource) await adminTemplateSaveCoordinator().flush(layoutId).catch(reportAdminTemplateSaveError);
    return;
  }
  if (!publishedLayoutSaveTimer || !isAdminEditablePublishedLayout(layoutId) || !canOpenAdminPublishedEdit()) return;
  window.clearTimeout(publishedLayoutSaveTimer);
  publishedLayoutSaveTimer = null;
  publishedLayoutSaveLayoutId = "";
  try {
    await savePublishedLayoutRecord(layoutId);
  } catch (error) {
    updateSyncUi(localText(`Could not save the public layout: ${error.message}`, `Не удалось сохранить public-укладку: ${error.message}`));
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

async function syncChangedEntityType(type, {
  allowReadOnlyViewForPrivateMutation = false,
  baseState = null,
  forceOverwrite = false,
  listId = ""
} = {}) {
  const config = ENTITY_SYNC_CONFIG[type];
  if (!config) return { type, attempted: false, skipped: true, safeForLegacyCompare: true };
  if (isReadOnlyBikePackingContext(null, {
    allowReadOnlyView: allowReadOnlyViewForPrivateMutation
  })) return { attempted: false, skipped: true, readOnly: true };
  const entries = buildChangedEntitySyncEntries(type, baseState, state, { forceOverwrite });
  const changedIds = entries.filter((entry) => !entry.deleted).map((entry) => entry.id);
  const deletedIds = entries.filter((entry) => entry.deleted).map((entry) => entry.id);
  if (!entries.length) return { type, attempted: false, skipped: false, entryCount: 0, changedIds, deletedIds, safeForLegacyCompare: true };
  if (isEntitySyncTypeUnavailable(type) || personalListApiUnavailable) {
    return { type, attempted: false, skipped: true, unavailable: true, entryCount: entries.length, changedIds, deletedIds, safeForLegacyCompare: false };
  }
  const targetListId = listId || await ensureCurrentPackingListId();
  if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
  if (isReadOnlyBikePackingContext(null, {
    allowReadOnlyView: allowReadOnlyViewForPrivateMutation
  })) return { attempted: false, skipped: true, readOnly: true, changedIds, deletedIds };
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
  if (!isGuestLocalPersonalLayout(layout)) throw createReadOnlyBikePackingError();
  persistStateSnapshot(state);
  if (!currentUser || !canUsePrivateState()) return;
  if (isGuestDemoCopyLayoutRecord(layout)) throw createReadOnlyBikePackingError();
  clearReadOnlyPackingListContextForPrivateMutation();
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
      syncEntityType: (type, options) => syncChangedEntityType(type, {
        ...options,
        allowReadOnlyViewForPrivateMutation: true
      })
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
  normalizeLayoutFields(normalized, {
    createFallbackLayout: !isLayoutFreeNewAccountState(normalized)
  });
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

function normalizePublishedStatePayload(payload, { preserveCatalog = false } = {}) {
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
  normalizeLayoutFields(normalized, { preserveCatalog });
  normalizeItemCategories(normalized);
  migrateContainerOrder(normalized);
  if (!preserveCatalog) repairPublishedLayoutArrangement(normalized);
  isolateLinkedLayoutEntities(normalized);
  applyLayoutArrangement(normalized.activeLayoutId, normalized, { preserveCatalog });
  applyDefaultCollapsedContainers(normalized);
  return normalized;
}

function replaceState(nextState, { preserveLocalUi = true, personalOperationId = null } = {}) {
  if (personalSavePilotEnabled() && !isReadOnlyBikePackingContext() && !isAdminPublicEditScope(modeState)
    && hasPendingPersonalSave()) {
    const pending = personalSaveOutboxForScope()?.recover();
    const durableForm = personalPhotoFormUiEnabled() && pending?.action.kind === "photos.mutate"
      && (pending.action.body.action === "form" || PERSONAL_PHOTO_COPY_BATCH_ENABLED && pending.action.body.action === "copy-batch");
    if (durableForm) {
      if (pending.action.body.action === "copy-batch") assertPersonalPhotoCopyBatchRecord(pending);
      else assertPersonalPhotoFormRecord(pending);
    }
    const durableArchiveUpdate = personalPendingImportSource(personalSaveOutboxForScope());
    if (!personalOperationId || !(durableForm || durableArchiveUpdate || pending?.reconciliation || pending?.localReconciliation || ["list.restore", "list.import", "list.migrate"].includes(pending?.action.kind)) || pending.action.operationId !== personalOperationId
      || !sameJson(nextState, pending.snapshot)) {
      throw new Error("Замена локального состояния остановлена: сначала нужно подтвердить или разрешить сохранённые действия.");
    }
  }
  const exactPublic = personalSavePilotEnabled() && personalSaveOutboxForScope()?.list().some(record => record.action.body.publicImport || record.action.body.serverImport)
    ? clone(nextState) : null;
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
  normalizeLayoutFields(state, {
    createFallbackLayout: !isLayoutFreeNewAccountState(nextState)
  });
  isolateLinkedLayoutEntities(state);
  normalizeItemCategories(state);
  migrateContainerOrder(state);
  applyLayoutArrangement(state.activeLayoutId, state);
  applyCollectionModeFromSource(state, nextState);
  if (exactPublic) restorePublicCopyBusinessView(exactPublic);
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
  const message = localText(
    `The server version looks incomplete: items changed from ${localStats.items} to ${remoteStats.items}, containers from ${localStats.containers} to ${remoteStats.containers}. The local version was kept.`,
    `Серверная версия выглядит усечённой: было items ${localStats.items}, containers ${localStats.containers}; стало items ${remoteStats.items}, containers ${remoteStats.containers}. Локальная версия оставлена.`
  );
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
  updateSyncUi(localText(
    `The local version looks incomplete: base items ${baseStats.items}, containers ${baseStats.containers}, placements ${basePlaced}, nested containers ${baseStats.nestedContainers}; current items ${localStats.items}, containers ${localStats.containers}, placements ${localPlaced}, nested containers ${localStats.nestedContainers}. Nothing was sent to the server.`,
    `Локальная версия выглядит усечённой: база items ${baseStats.items}, containers ${baseStats.containers}, связей ${basePlaced}, вложенных контейнеров ${baseStats.nestedContainers}; сейчас items ${localStats.items}, containers ${localStats.containers}, связей ${localPlaced}, вложенных контейнеров ${localStats.nestedContainers}. На сервер не отправлено.`
  ));
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
  updateSyncUi(localText("The active layout was empty · switched to a non-empty layout before saving.", "Активная укладка была пустой · переключил на непустую укладку перед сохранением."));
  return true;
}

function isCurrentLocalStateDestructiveRegression() {
  return isDestructiveStateRegression(state, loadBaseState());
}

async function loadCurrentServerStateDirectly({ notify = false, preferredLayout = null } = {}) {
  updateSyncUi(localText("Loading the current server version...", "Загружаю текущую серверную версию..."));
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
  if (applied && notify) showToast(localText("Current server version loaded.", "Загружена текущая серверная версия."), "success");
  return applied;
}

async function offerLoadServerForTruncatedLocalState({ notify = false, preferredLayout = null } = {}) {
  if (!isCurrentLocalStateDestructiveRegression()) return false;
  blockDestructiveLocalSave();
  const confirmed = await askConfirmDialog({
    title: localText("The local layout appears damaged", "Локальная раскладка выглядит повреждённой"),
    text: localText("Item-to-bag placements or nested containers are missing on this device. This version cannot be sent to the server. Load the current server version without using History?", "На этом устройстве потеряны связи вещей с сумками или вложенность контейнеров. Эту версию нельзя отправлять на сервер. Загрузить текущую серверную версию без обращения к истории?"),
    okText: localText("Use server version", "Взять с сервера"),
    cancelText: localText("Keep local version", "Оставить локальную"),
    tone: "danger"
  });
  if (!confirmed) return true;
  await loadCurrentServerStateDirectly({ notify, preferredLayout });
  return true;
}

function applyRemoteState(remoteState, updatedAt, integrityMeta = null, rawPayload = null, {
  allowDestructive = false,
  deferRender = false,
  preferredLayout = null,
  preservePublicDraftId = ""
} = {}) {
  if (hasPendingPersonalSave()) {
    updateSyncUi("Есть неподтверждённые локальные действия. Серверная версия пока не заменяет их.");
    return false;
  }
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
  if (personalSavePilotEnabled() && !isReadOnlyBikePackingContext() && !isAdminPublicEditScope(modeState)) {
    personalSaveOutboxForScope()?.adoptRemoteBaseline({ snapshot: remoteState,
      payload: catalogRepairBase || cloneStateForSync(remoteState, { forSync: true }),
      stateRevision: integrityMeta?.stateRevision,
      meta: { ...integrityMeta, serverUpdatedAt: updatedAt || null, localUpdatedAt: updatedAt || null,
        lastSyncedLocalUpdatedAt: updatedAt || null, dirty: false } });
  }
  replaceState(remoteState);
  removePublicLayoutDrafts({ exceptLayoutId: preservePublicDraftId });
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
  if (!deferRender) renderPreservingPackingScroll();
  setPersonalLayoutsLoadedStatus();
  if (catalogRepairBase && syncMeta.dirty) {
    updateSyncUi(localText("Technical catalog duplicates removed · syncing...", "Каталог очищен от технических дублей · синхронизирую..."));
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
  if (type === "item") return value.name || localText(`Item ${id}`, `Вещь ${id}`);
  if (type === "container") return value.name || localText(`Container ${id}`, `Контейнер ${id}`);
  if (type === "layout") return value.name || localText(`Layout ${id}`, `Укладка ${id}`);
  if (type === "packed") return localText(`Packing status: ${state.items[id]?.name || id}`, `Собранность: ${state.items[id]?.name || id}`);
  if (type === "collapsed") return localText(`Collapse state: ${state.containers[id]?.name || id}`, `Сворачивание: ${state.containers[id]?.name || id}`);
  return id;
}

function settingLabel(key) {
  const labels = {
    activeLayoutId: localText("Active layout", "Какая укладка открыта"),
    showItemMeta: localText("Show labels", "Показ меток"),
    itemDisplayMode: localText("Labels and photos mode", "Режим меток и фото"),
    collapseDefaultsVersion: localText("Collapse state", "Состояние сворачивания")
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

function askConflictResolution(conflicts, { stateRevision, localComparison = false } = {}) {
  if (refs.conflictDialog.open) return Promise.resolve("cancel");
  const explicit = localComparison || Number.isSafeInteger(stateRevision) && stateRevision > 0;
  const otherLabel = localComparison ? localText("Other tab", "Другая вкладка") : localText("Server", "С сервера");
  const context = localComparison
    ? `<p class="dialog-note">${escapeHtml(localText("Compare with the saved version from the other tab. Choose each conflicting record; device clocks do not decide.",
      "Сравнение с сохранённой версией другой вкладки. Выберите вариант для каждого спорного элемента; время на устройствах не определяет результат."))}</p>`
    : explicit
    ? `<p class="dialog-note">${escapeHtml(localText(`Comparing with server version ${stateRevision}. Choose each version explicitly. Restoring a deleted record needs your choice; device clocks do not decide.`,
      `Сравнение с серверной версией ${stateRevision}. Выберите вариант для каждого элемента. Возврат удалённого элемента требует вашего выбора; время на устройствах не определяет результат.`))}</p>`
    : renderConflictSyncContext();
  refs.conflictList.innerHTML = `${context}${conflicts.map((conflict, index) => {
    const defaultChoice = explicit ? "" : conflictDefaultChoice(conflict);
    return `
    <section class="conflict-card">
      <h3>${escapeHtml(conflict.label)}</h3>
      <div class="conflict-kind">${escapeHtml(conflictKindLabel(conflict))}</div>
      <p>${escapeHtml(conflictSummary(conflict))}</p>
      ${renderConflictDetails(conflict, { remoteLabel: otherLabel })}
      <div class="conflict-choice">
        <label>
          <input type="radio" name="conflict-${index}" value="local"${defaultChoice === "local" ? " checked" : ""} />
          <span>${escapeHtml(localText("Mine", "Моё"))}</span>
          <small>${escapeHtml(explicit ? (conflict.localHas ? localText("Local version", "Локальная версия") : localText("Deleted", "Удалено")) : conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name, localText("not available locally", "нет локально")))}</small>
        </label>
        <label>
          <input type="radio" name="conflict-${index}" value="remote"${defaultChoice === "remote" ? " checked" : ""} />
          <span>${escapeHtml(otherLabel)}</span>
          <small>${escapeHtml(explicit ? (conflict.remoteHas ? otherLabel : localText("Deleted", "Удалено")) : conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, localText("server", "сервер"), localText("not in the server layout", "нет в серверной укладке")))}</small>
        </label>
      </div>
    </section>
  `;
  }).join("")}`;
  refs.conflictDialog.returnValue = "";
  const serverButtonText = refs.conflictServerBtn.textContent;
  if (localComparison) refs.conflictServerBtn.textContent = localText("Use the other tab's whole version", "Принять всю версию другой вкладки");
  return new Promise((resolve) => {
    const cleanup = () => {
      refs.conflictDialog.removeEventListener("close", handleClose);
      refs.conflictServerBtn.onclick = null;
      refs.conflictServerBtn.textContent = serverButtonText;
      refs.conflictApplyBtn.onclick = null;
      refs.conflictApplyBtn.disabled = false;
      refs.conflictList.onchange = null;
    };
    const readChoices = () => Object.fromEntries(conflicts.map((conflict, index) => {
      const selected = refs.conflictList.querySelector(`input[name="conflict-${index}"]:checked`);
      return [index, selected?.value || (explicit ? undefined : conflictDefaultChoice(conflict))];
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
      if (explicit && Object.values(readChoices()).some(value => !["local", "remote"].includes(value))) return;
      refs.conflictDialog.close("default");
    };
    refs.conflictApplyBtn.disabled = explicit;
    refs.conflictList.onchange = () => {
      refs.conflictApplyBtn.disabled = explicit && Object.values(readChoices()).some(value => !["local", "remote"].includes(value));
    };
    refs.conflictDialog.addEventListener("close", handleClose);
    openModalDialog(refs.conflictDialog);
  });
}

function renderConflictSyncContext() {
  const rows = [
    [localText("Current browser time", "Время браузера сейчас"), formatFullDateTime(new Date())],
    [localText("Local version", "Локальная версия"), formatFullDateTime(syncMeta.localUpdatedAt) || localText("none", "нет")],
    [localText("Known server version", "Известная серверная версия"), formatFullDateTime(syncMeta.serverUpdatedAt) || localText("none", "нет")],
    [localText("Last successful sync", "Последняя успешная синхронизация"), formatFullDateTime(syncMeta.lastSyncedLocalUpdatedAt) || localText("none", "нет")],
    [localText("Device", "Устройство"), syncDevice?.name || localText("this device", "это устройство")]
  ];
  const contextLabel = localText("Sync context", "Контекст синхронизации");
  return `
    <section class="conflict-card conflict-context">
      <h3>${escapeHtml(contextLabel)}</h3>
      <div class="conflict-diff" aria-label="${escapeHtml(contextLabel)}">
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
    return localText("Item", "Вещь");
  }
  if (conflict.type === "container") {
    return localText("Bag/container", "Сумка/контейнер");
  }
  if (conflict.type === "layout") return localText("Layout", "Укладка");
  if (conflict.type === "packed") return localText("Item packed state", "Собранность вещи");
  if (conflict.type === "setting" && conflict.id === "activeLayoutId") return localText("Open layout choice", "Выбор открытой укладки");
  if (conflict.type === "setting") return localText("Setting", "Настройка");
  return localText("Conflict", "Конфликт");
}

function conflictTimestamp(value) {
  return timeValue(value?.updatedAt || value?.updated_at || value?.clientUpdatedAt || "");
}

function renderConflictDetails(conflict, { remoteLabel = localText("Server", "С сервера") } = {}) {
  const rows = conflictFormatter.conflictDetailRows(conflict);
  if (!rows.length) return "";
  const changesLabel = localText("What changed", "Что изменилось");
  return `
    <div class="conflict-diff" aria-label="${escapeHtml(changesLabel)}">
      <div class="conflict-diff-head">
        <span>${escapeHtml(localText("Field", "Поле"))}</span>
        <span>${escapeHtml(localText("Mine", "Моё"))}</span>
        <span>${escapeHtml(remoteLabel)}</span>
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
    const localValueText = conflictFormatter.conflictValueSummary(conflict, conflict.localValue, conflict.localHas, localText("not available locally", "нет локально"));
    const remoteValueText = conflictFormatter.conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas, localText("not in the server layout", "нет в серверной укладке"));
    return localText(
      `The layout contents are the same; only the layout that opens as active differs. Mine: ${localValueText}. Server: ${remoteValueText}.`,
      `Это не содержимое укладки: отличается только то, какую укладку приложение откроет активной. Моё: ${localValueText}. Сервер: ${remoteValueText}.`
    );
  }
  const localValueText = conflictFormatter.conflictValueSummary(conflict, conflict.localValue, conflict.localHas, localText("not available locally", "нет локально"));
  const remoteValueText = conflictFormatter.conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas, localText("not in the server layout", "нет в серверной укладке"));
  const localStamp = conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name, localText("not available locally", "нет локально"));
  const remoteStamp = conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, localText("server", "сервер"), localText("not in the server layout", "нет в серверной укладке"));
  const difference = conflictFormatter.conflictDifferenceSummary(conflict);
  return localText(
    `Mine: ${localValueText} (${localStamp}). Server: ${remoteValueText} (${remoteStamp}).${difference ? ` Difference: ${difference}.` : ""}`,
    `Моё: ${localValueText} (${localStamp}). Сервер: ${remoteValueText} (${remoteStamp}).${difference ? ` Разница: ${difference}.` : ""}`
  );
}

function unlockOfflineState(message = localText("Local · you can work here; sign in to save to your account", "Локально · можно работать, войдите для сохранения в аккаунт")) {
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
  offlineRememberedSessionReason = "";
}

function activateOfflineRememberedSession(
  message = localText("Local copy of personal layouts · sign in to sync", "Локальная копия личных укладок · войдите для синхронизации"),
  layoutStatusMessage = "",
  reason = ""
) {
  const rememberedUser = rememberedOfflineUser(offlineRememberedUser);
  if (!rememberedUser) return false;
  currentUser = null;
  offlineRememberedUser = rememberedUser;
  offlineRememberedSessionReason = reason === OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE
    ? reason
    : "";
  const rememberedStatus = offlineRememberedStatusMessages(offlineRememberedSessionReason);
  appUnlocked = true;
  activateLocalStorageScope(rememberedUser.scopeKey || userStorageScopeKey(rememberedUser));
  setActivePrivateScope();
  // Starts the blocking read-only dialog synchronously; no network is needed.
  checkPersonalPhotoRecoveryBeforeLoad().catch(error => {
    if (!personalSaveRecovery.owns(error)) console.warn("Local photo recovery check stopped", error.code || "context");
  });
  setOfflineRememberedLayoutLoadStatus(layoutStatusMessage || rememberedStatus.layout);
  const renderedFallback = renderInitialLocalFallbackIfNeeded();
  if (!renderedFallback) renderPreservingPackingScroll();
  updateSyncUi(message || rememberedStatus.sync);
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

function isAdminUser() {
  if (!currentUser) return false;
  return canPermission(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization: currentAuthorization,
    serverSessionConfirmed: true
  });
}

function canOpenAdminPublishedEdit() {
  return isAdminSession();
}

function canReviewManufacturerCatalog() {
  return Boolean(
    currentUser &&
    canPermission(FRONTEND_PERMISSION_ACTIONS.CATALOG_REVIEW, {
      authorization: currentAuthorization,
      serverSessionConfirmed: true
    })
  );
}

function isOfflineRememberedAdminSession() {
  return Boolean(
    !currentUser &&
    offlineRememberedUser &&
    canPermission(FRONTEND_PERMISSION_ACTIONS.TEMPLATES_CATALOG_VIEW, {
      authorization: offlineRememberedUser.authorization,
      serverSessionConfirmed: false
    })
  );
}

function canViewAdminPublishedCatalog() {
  return canOpenAdminPublishedEdit() || isOfflineRememberedAdminSession();
}

function canEditPublishedTemplatesNow() {
  return canOpenAdminPublishedEdit() && !arePublishedTemplatesBlocked();
}

function canEditLocalUnpublishedAdminTemplate(layout) {
  return canEditLocalUnpublishedTemplateValue({
    layout,
    liveAdminSession: canOpenAdminPublishedEdit(),
    rememberedAdminSession: isOfflineRememberedAdminSession()
  });
}

function canEditManagedAdminTemplateNow(layout) {
  return canEditManagedTemplateValue({
    layout,
    liveAdminSession: canOpenAdminPublishedEdit(),
    rememberedAdminSession: isOfflineRememberedAdminSession(),
    templatesBlocked: arePublishedTemplatesBlocked()
  });
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
    requiredCapabilities: REQUIRED_ADMIN_API_CAPABILITIES,
    localText
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
  throw new Error(localText("The API is outdated: entitySyncListUpdatedAt is missing", "API не обновлен: нет entitySyncListUpdatedAt"));
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
      warning: localText(
        `Admin: could not check the API version (${apiErrorMessage(error)}). Check the backend before publishing templates.`,
        `Админка: не удалось проверить версию API (${apiErrorMessage(error)}). Перед публикацией шаблонов проверьте backend.`
      ),
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

function renderSyncUi(effectiveMessage = "") {
  updateSyncUiControls({
    saveBlocked: Boolean(personalSaveRecovery.message()),
    adminReportsDialogController,
    manufacturerCatalogReviewDialogController,
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
    message: effectiveMessage,
    refs,
    state,
    syncMeta,
    syncPackingVisualStyleControls,
    t
  });
}

function updateSyncUi(message = "") {
  stableSyncStatusMessageController ||= createStableSyncStatusMessageController({
    render: renderSyncUi
  });
  connectionStatusController.refresh();
  const rememberedStatus = isOfflineRememberedSession()
    ? offlineRememberedStatusMessages(offlineRememberedSessionReason)
    : { sync: "" };
  const recoveryMessage = personalSaveRecovery.message();
  const effectiveMessage = (recoveryMessage ? localText("Saving is paused. Download a recovery copy before reloading.",
    "Сохранение приостановлено. Перед перезагрузкой скачайте копию для восстановления.") : "") || connectionStatusController.currentMessage() ||
    offlinePhotoCacheController.currentMessage() ||
    message ||
    rememberedStatus.sync;
  stableSyncStatusMessageController.update(effectiveMessage, {
    transient: isTransientSyncProgressMessage(effectiveMessage)
  });
}

async function apiFetch(path, options = {}) {
  if (personalSavePilotEnabled() && currentUser && !isReadOnlyBikePackingContext()
    && !isAdminPublicEditScope(modeState) && path.startsWith("/bike-packing/")
    && !["GET", "HEAD"].includes(String(options.method || "GET").toUpperCase())) {
    throw new Error("Этот путь записи ещё не подключён к причинной очереди. Прямой обход остановлен.");
  }
  const { connectionFailureMode = "auto", ...requestOptions } = options;
  try {
    const response = await apiFetchRequest(path, requestOptions, { isForcedOffline,
      getOperationContext: () => ({
        actorId: String(currentUser?.id || ""),
        scope: isReadOnlyBikePackingContext() ? "readonly" : "personal",
        generation: JSON.stringify([syncMeta.localUpdatedAt, currentPackingListMeta?.id || "", serializeState({ forSync: true })])
      })
    });
    connectionStatusController.reportSuccess();
    return response;
  } catch (error) {
    if (!isForcedOffline() && isNetworkError(error) && shouldReportConnectionFailure({
      mode: connectionFailureMode,
      method: requestOptions.method
    })) {
      connectionStatusController.reportFailure(isTimeoutError(error) ? "timeout" : "offline");
    }
    throw error;
  }
}

async function apiUploadFormData(path, options = {}) {
  if (personalSavePilotEnabled() && currentUser && !isReadOnlyBikePackingContext()
    && !isAdminPublicEditScope(modeState) && path.startsWith("/bike-packing/")) {
    throw new Error("Составные действия с фотографиями ещё не подключены к причинной очереди.");
  }
  try {
    const response = await apiUploadFormDataRequest(path, options, { isForcedOffline });
    connectionStatusController.reportSuccess();
    return response;
  } catch (error) {
    if (!isForcedOffline() && isNetworkError(error)) {
      connectionStatusController.reportFailure(isTimeoutError(error) ? "timeout" : "offline");
    }
    throw error;
  }
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
  if (!adminTemplateUiEnabled()) await assertAdminApiCompatibility({ force: true });
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
    let data;
    if (adminTemplateUiEnabled()) {
      const coordinator = adminTemplateSaveCoordinator();
      await coordinator.captureCommand(layout.id, { kind: "template.metadata",
        metadata: { title: requestBody.title, language: requestBody.language } });
      const result = await coordinator.flush(layout.id);
      if (result.state !== "committed" || !result.applied) throw Error("Подтверждение изменения параметров ещё не получено.");
      data = { ...requestBody, listId: layout.adminCausalSource.binding.listId };
      if (layout.adminCausalSource.visibility === "private") {
        saveState({ sync: false }); refreshPublishedLayoutView(target); return true;
      }
    } else data = await apiFetch(path, {
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
    if (adminTemplateUiEnabled()) throw Object.assign(error, { isAdminTemplateBlocked: true });
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
  if (!currentUser || isForcedOffline()) return false;
  if (isReadOnlyBikePackingContext()) return false;
  const slotAvailable = await acquirePhotoUploadSlot({
    isBusy: () => photoUploadInFlight,
    setBusy: (value) => { photoUploadInFlight = value; },
    shouldContinue: () => Boolean(currentUser) && !isForcedOffline() && !isReadOnlyBikePackingContext()
  });
  if (!slotAvailable) return false;
  let changed = false;
  try {
    const entries = getUploadablePhotoEntries({ layoutId, listId });
    if (!entries.length) return false;
    markPhotoUploadBatch(entries.map((entry) => entry.photo));
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
  markPhotoUploadBatch(uploadEntries.map((entry) => entry.photo));
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
  retryTemporaryUploadFailure = true,
  scheduleProgressRender = schedulePhotoUploadProgressRender
} = {}) {
  const uploadPhotoCacheScopeKey = localStorageScopeKey;
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
    getCachedPhoto: (id) => getCachedPhoto(id, uploadPhotoCacheScopeKey),
    putCachedPhoto: (record) => putCachedPhoto(record, uploadPhotoCacheScopeKey),
    registerCachedPhotoRecord: (task, record) => {
      if (photoObjectUrls.currentScope() !== uploadPhotoCacheScopeKey) return;
      photoObjectUrls.setRecord(task, record);
    },
    markEntityChanged: (targetEntity, targetType, updatedAt) => {
      if (targetType === "container") touchContainer(targetEntity.id, updatedAt);
      else touchItem(targetEntity.id, updatedAt);
    },
    persistStateSnapshot: () => persistStateSnapshot(state),
    scheduleProgressRender
  });
}

function schedulePhotoUploadProgressRender({ refreshPhotoDialogs = true } = {}) {
  if (photoUploadProgressRenderFrame) return;
  photoUploadProgressRenderFrame = requestAnimationFrame(() => {
    photoUploadProgressRenderFrame = null;
    renderPreservingPackingScroll({ refreshPhotoDialogs });
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
  if (personalSavePilotEnabled() && currentUser && !isReadOnlyBikePackingContext()
    && !isAdminPublicEditScope(modeState)) {
    if (isPublicTemplateListId(currentPackingListId)) throw new Error("Для сохранения нужен личный список, не публичный шаблон.");
    return personalSaveRecovery.run(() => ensureCausalPersonalListId({
      storage: localStorage, getContext: personalSaveContext, getCurrentListId: () => currentPackingListId,
      snapshot: state, body: { ...buildListSaveBody(), title: localText("My packing lists", "Мои укладки") },
      fetchLists: async () => {
        const data = await apiFetch("/bike-packing/lists", { timeoutMs: LIST_API_TIMEOUT_MS });
        if (data?.ok === false || ![data, data?.lists, data?.items, data?.records].some(Array.isArray)) {
          throw new Error("Не получен подтверждённый список личных данных. Новое создание остановлено.");
        }
        return normalizePackingListsResponse(data);
      },
      chooseDefaultList: chooseDefaultPackingList, recordId: remoteRecordId,
      // Do not install a revision from a summary as authority to save a draft.
      onExisting: () => {},
      onRegistered: listId => saveActivePackingListId(listId)
    }), { scopeKey: localStorageScopeKey, snapshot: clone(state) });
  }
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
  const { deferAdminTemplates = false, ...flowOptions } = options;
  const result = await checkAuthAndLoadFlow({
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get currentUser() { return currentUser; },
      set currentUser(value) { currentUser = value; },
      get currentAuthorization() { return currentAuthorization; },
      set currentAuthorization(value) { currentAuthorization = value; },
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
      setActivePrivateScope,
      setExplicitlySignedOut,
      setLayoutLoadStatus,
      setPersonalLayoutsLoadedStatus,
      shouldKeepCurrentReadonlyDemoAfterAuthCheck,
      storedPrivateLayoutChoiceRef,
      unlockOfflineState,
      updateSyncUi,
      GUEST_STORAGE_SCOPE
    }
  }, flowOptions);
  if (currentUser && canOpenAdminPublishedEdit() && !isForcedOffline()) {
    const adminDraftRefresh = refreshAdminTemplateDrafts({ renderAfter: true });
    if (deferAdminTemplates) {
      adminDraftRefresh.catch(() => null);
    } else {
      await adminDraftRefresh.catch(() => null);
    }
  }
  return result;
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
    showToast(localText("Turn off offline mode in the menu first.", "Сначала выключите офлайн-режим в меню."), "error");
    return;
  }
  openAuthDialog();
}

async function handleSignOutButton() {
  if (isForcedOffline()) {
    showToast(localText("Turn off offline mode in the menu first.", "Сначала выключите офлайн-режим в меню."), "error");
    return;
  }
  if (!currentUser && !isOfflineRememberedSession()) {
    openAuthDialog();
    return;
  }
  const confirmed = await askConfirmDialog({
    title: localText("Sign out?", "Выйти из аккаунта?"),
    text: localText("After signing out, the list will stay hidden on this device until you sign in again. The local copy will not be deleted, but offline access will be disabled after an explicit sign-out.", "После выхода список будет скрыт на этом устройстве до нового входа. Локальная копия не удалится, но офлайн-доступ после явного выхода будет отключён."),
    okText: localText("Sign out", "Выйти"),
    cancelText: localText("Stay signed in", "Остаться")
  });
  if (!confirmed) return;
  let remoteSignOutConfirmed = !currentUser;
  if (currentUser) {
    try {
      updateSyncUi(localText("Signing out...", "Выходим..."));
      await apiFetch("/auth/logout", { method: "POST" });
      remoteSignOutConfirmed = true;
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
  if (experimentTransport.experiment && !remoteSignOutConfirmed) {
    showToast(localText("Signed out on this device only. Server session revocation is not confirmed; local data was retained.", "Выход выполнен только на этом устройстве. Отзыв серверной сессии не подтверждён; локальные данные сохранены."), "warning");
  } else {
    showToast(localText("You signed out. Personal lists are hidden; sign in again to open them.", "Вы вышли. Личные списки скрыты; войдите снова, чтобы открыть их."), "success");
  }
}

function getSavedAuthEmail() {
  return getSavedAuthEmailFromStorage(localStorage);
}

function saveAuthEmail(email) {
  saveAuthEmailToStorage(email, localStorage);
}

function rememberAuthenticatedUser(user = currentUser) {
  rememberAuthenticatedUserInStorage(user, localStorage, currentAuthorization);
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
    connectionStatusController.clear();
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
  refs.authMagicLink.value = "";
  refs.authDialogStatus.textContent = "";
  refs.authDialogStatus.className = "dialog-status";
  const authTitle = refs.authDialog?.querySelector("h2");
  if (authTitle) authTitle.textContent = t("auth.dialogTitle");
  refs.authRequestNote.textContent = t("auth.requestNote");
  refs.authEmailLabel.textContent = t("auth.emailLabel");
  refs.authConfirmTitle.textContent = t("auth.confirmTitle");
  refs.authConfirmTitle.hidden = false;
  refs.authConfirmSection.hidden = true;
  refs.authMagicLinkLabel.textContent = t("auth.magicLinkLabel");
  refs.authMagicLink.placeholder = t("auth.magicLinkPlaceholder");
  refs.authMagicLinkHint.textContent = t("auth.magicLinkHint");
  const authCloseBtn = refs.authDialog?.querySelector("footer .ghost");
  if (authCloseBtn) authCloseBtn.textContent = t("buttons.close");
  const authIconCloseBtn = refs.authDialog?.querySelector(".icon-button");
  if (authIconCloseBtn) authIconCloseBtn.setAttribute("aria-label", t("buttons.close"));
  refs.authSubmitBtn.disabled = false;
  refs.authSubmitBtn.classList.remove("ghost");
  refs.authSubmitBtn.textContent = t("auth.sendLink");
  refs.authConfirmBtn.disabled = false;
  refs.authConfirmBtn.classList.remove("ghost");
  refs.authConfirmBtn.textContent = t("auth.confirmButton");
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
        language: uiLanguage,
        redirectUrl: location.origin === "https://vniipo-help.ru"
          ? "https://vniipo-help.ru/bike-packing/"
          : location.href
      })
    });
    prepareGuestLoginHandoff(email);
    saveAuthEmail(email);
    refs.authDialogStatus.className = "dialog-status success";
    refs.authDialogStatus.textContent = t("auth.linkSent");
    refs.authSubmitBtn.textContent = t("auth.sendAgain");
    revealAuthMagicLinkConfirmation();
    updateSyncUi(t("auth.linkSentSync"));
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

function revealAuthMagicLinkConfirmation({ focus = true } = {}) {
  refs.authConfirmTitle.hidden = true;
  refs.authConfirmSection.hidden = false;
  refs.authSubmitBtn.classList.add("ghost");
  refs.authConfirmBtn.classList.remove("ghost");
  if (focus) refs.authMagicLink.focus();
}

async function confirmAuthMagicLink() {
  if (isForcedOffline()) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = localText(
      "Offline mode is on. Turn it off in the menu to sign in.",
      "Включён офлайн-режим. Отключите его в меню, чтобы войти."
    );
    return;
  }
  const token = magicLinkTokenFromInput(refs.authMagicLink.value, { baseUrl: location.href });
  if (!token) {
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = t("auth.magicLinkRequired");
    refs.authMagicLink.focus();
    return;
  }
  try {
    refs.authSubmitBtn.disabled = true;
    refs.authConfirmBtn.disabled = true;
    refs.authDialogStatus.className = "dialog-status";
    refs.authDialogStatus.textContent = t("auth.confirming");
    updateSyncUi(t("auth.confirming"));
    const authData = await apiFetch("/auth/verify-magic-link", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    if (authData?.user?.email) saveAuthEmail(authData.user.email);
    refs.authMagicLink.value = "";
    refs.authDialogStatus.className = "dialog-status success";
    refs.authDialogStatus.textContent = t("auth.confirmSuccess");
    updateSyncUi(t("auth.confirmSuccess"));
    refs.authDialog.close();
    await checkAuthAndLoad();
  } catch (error) {
    const messageKey = magicLinkErrorI18nKey(error?.data?.code);
    refs.authDialogStatus.className = "dialog-status error";
    refs.authDialogStatus.textContent = t(messageKey);
    updateSyncUi(t(messageKey));
  } finally {
    refs.authSubmitBtn.disabled = false;
    refs.authConfirmBtn.disabled = false;
  }
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
  const adminLayoutId = getPublishedEditLayoutId();
  if (options.force && adminTemplateUiEnabled() && isAdminPublicEditScope(modeState)
    && (state.layouts?.[adminLayoutId]?.adminCausalSource?.planId || administrativeSaveCoordinator?.hasPendingCapture(adminLayoutId))) {
    return showAdminTemplateRecovery(adminLayoutId);
  }
  if (personalSavePilotEnabled() && currentUser && !isReadOnlyBikePackingContext()
    && !isAdminPublicEditScope(modeState)) return saveRemoteState({ notify: Boolean(options.force) });
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
      ? localText("Refreshing the demo from the server...", "Обновляю demo с сервера...")
      : localText("Refreshing the shared template from the server...", "Обновляю shared с сервера..."));
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
      ? localText(`Template refreshed from the server${layout?.name ? ` · ${layout.name}` : ""}`, `Шаблон обновлен с сервера${layout?.name ? ` · ${layout.name}` : ""}`)
      : localText(`Template opened from the local fallback${layout?.name ? ` · ${layout.name}` : ""}`, `Шаблон открыт из локальной заготовки${layout?.name ? ` · ${layout.name}` : ""}`);
    updateSyncUi(message);
    if (notify) showToast(message, loaded ? "success" : "warning");
  } catch (error) {
    const message = localText(`Could not refresh the public layout: ${error.message}`, `Не удалось обновить public-укладку: ${error.message}`);
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
    updateSyncUi(localText(`Could not load personal data before copying: ${error.message}`, `Не удалось загрузить личное состояние перед копированием: ${error.message}`));
  }
  return true;
}

function normalizeRemoteListRecord(data) {
  const list = data?.list || data?.entityLink || data?.record || data;
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
  const initial = personalSavePilotEnabled() ? personalSaveContext() : null;
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}`, {
    timeoutMs: LIST_API_TIMEOUT_MS
  });
  if (initial) {
    const current = personalSaveContext();
    if (["actorId", "scopeKey", "scope", "generation", "listId"].some(key => initial[key] !== current[key])) {
      throw new Error("Аккаунт или список изменились. Устаревшие сведения не применены.");
    }
  }
  const record = normalizeRemoteListRecord(data);
  if (remoteRecordId(record) === String(listId || "")) currentPackingListMeta = record;
  return record;
}

async function fetchRemoteListFreshnessRecord(listId) {
  const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/freshness`, {
    timeoutMs: API_TIMEOUT_MS,
    silentErrors: true,
    connectionFailureMode: "background"
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
  const initial = personalSavePilotEnabled() ? personalSaveContext() : null;
  if (initial && hasPendingPersonalSave()) return { applied: false, fallbackRequired: false, reason: "pending-personal-action" };
  const request = canRequestEntityChanges({ syncMeta, freshness, listId });
  if (!request.ok) return { applied: false, fallbackRequired: true, reason: request.reason };
  const data = await fetchRemoteListChangesRecord(listId, request.sinceRevision);
  if (initial) {
    const current = personalSaveContext();
    if (["actorId", "scopeKey", "scope", "generation", "listId"].some(key => initial[key] !== current[key]) || hasPendingPersonalSave()) {
      return { applied: false, fallbackRequired: false, reason: "personal-context-changed" };
    }
  }
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

function leaveSharedLinkAfterPersonalCopy() {
  const href = personalCopyUrlFromSharedLink(location.href, { listParam: SHARED_LIST_QUERY_PARAM, layoutParam: SHARED_LAYOUT_QUERY_PARAM });
  if (href) window.history.replaceState(window.history.state, "", href);
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
  const entityTarget = sharedEntityTargetFromUrl(location.href);
  const path = entityTarget
    ? `/bike-packing/entity-links/${encodeURIComponent(listId)}`
    : `/bike-packing/lists/${encodeURIComponent(listId)}`;
  const data = await apiFetch(path, {
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
  updateSyncUi(localText("Opening the shared list from the link...", "Открываю shared-список по ссылке..."));
  try {
    const record = await fetchSharedListLinkRecord(normalizedListId);
    const entityTarget = sharedEntityTargetFromUrl(location.href);
    const payload = activateSharedPayloadLayout(record.payload, layoutId);
    assertRemoteStateIntegrity(payload, stateIntegrityMetaFromResponse(record), record.payload);
    if (!payload) throw new Error("Сервер вернул пустую или повреждённую укладку.");
    const entityFocusTarget = entityTarget ? {
      ...entityTarget,
      scope: payload.sharedEntityTarget?.scope === "layout" ? "layout" : "entity"
    } : null;
    if (entityTarget) {
      const targetExists = entityTarget.type === "item"
        ? Boolean(payload.items?.[entityTarget.id])
        : Boolean(payload.containers?.[entityTarget.id]);
      if (!targetExists) throw new Error(t("shareEntity.targetMissing"));
      sharedEntityAncestorContainerIds(payload, entityTarget).forEach((containerId) => {
        sharedVirtualCollapsedContainers[sharedVirtualContainerId(containerId)] = false;
      });
    }
    const recordId = remoteRecordId(record, normalizedListId);
    const activeLayout = sharedPayloadActiveLayout(payload);
    const activeLayoutId = activeLayout?.id || payload.activeLayoutId || "";
    linkedSharedListLayout = {
      id: `linked-list-${recordId}${activeLayoutId ? `-${activeLayoutId}` : ""}`,
      listId: recordId,
      requestedLayoutId: activeLayoutId,
      name: record.title || "Общий список",
      subtitle: localText("Link access", "Доступ по ссылке"),
      roots: [],
      statePayload: payload,
      listRecord: record,
      linkedSharedList: true,
      sharedEntityTarget: entityFocusTarget
    };
    linkedSharedListLayout.name = activeLayout?.name || linkedSharedListLayout.name;
    await hydrateAuthForSharedLink();
    if (!currentUser) {
      const guestTarget = ensureGuestSharedLinkCopyTargetLayout(state, {
        changedAt: nowIso(),
        createEmptyLayoutArrangement,
        createMeta: currentCreateMeta,
        defaultName: localText("New layout", "Новая укладка"),
        dictionaries: ensurePrivateDictionaries(state),
        guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
        isCopyTargetLayout: (layout) => isSharedCopyTargetLayout(layout, { excludeEmptySystemDefault: true }),
        uniqueLayoutName
      });
      if (guestTarget.created) {
        rememberActiveLayoutChoice(guestTarget.layoutId);
        saveState({ sync: false });
      }
    }
    setActiveReadOnlyScope(linkedSharedListLayout.id);
    switchView("packing");
    applyStaticTranslations();
    renderBeforeFinishingAppStartup({
      documentRef: document,
      render: () => {
        render();
        if (entityFocusTarget) focusSharedEntityTarget(refs.packingView, entityFocusTarget);
      }
    });
    updateSyncUi(localText(`Shared list · ${linkedSharedListLayout.name}`, `Общий список · ${linkedSharedListLayout.name}`));
    return true;
  } catch (error) {
    await hydrateAuthForSharedLink();
    setActivePrivateScope();
    applyStaticTranslations();
    renderBeforeFinishingAppStartup({ documentRef: document, render });
    updateSyncUi(localText(`Could not open the shared list: ${error.message}`, `Не удалось открыть shared-список: ${error.message}`));
    return false;
  }
}

async function runCausalPersonalShareLink(selection) {
  if (!personalSavePilotEnabled()) return null;
  if (!PERSONAL_SHARE_LINK_ENABLED) throw Error("Создание ссылки через очередь ещё не включено. Ваши данные сохранены.");
  personalSaveRecovery.assertRunning();
  const initial = personalSaveContext(), layoutId = state.activeLayoutId;
  if (initial.scope !== "personal" || !initial.actorId || initial.scopeKey !== `id:${initial.actorId}` || !initial.listId) throw Error("Сначала подтвердите личный список.");
  const assertCurrent = () => {
    const current = personalSaveContext();
    if (["environment", "actorId", "listId", "scopeKey", "scope"].some(key => current[key] !== initial[key]) || state.activeLayoutId !== layoutId) {
      throw Error("Аккаунт или выбранная укладка изменились. Ссылка остаётся связана с сохранённым выбором.");
    }
  };
  selection = JSON.parse(JSON.stringify(selection));
  const outbox = personalSaveOutboxForScope();
  const records = outbox.list(), boundaryId = outbox.confirmedBoundary()?.operationId;
  const boundaryGeneration = records.find(record => record.action.operationId === boundaryId)?.action.generation || 0;
  const pending = outbox.hasPending() && records.filter(record => record.action.generation > boundaryGeneration && record.action.body.shareLink)
    .sort((a, b) => b.action.generation - a.action.generation)[0];
  const latest = outbox.recover(), latestChoice = latest?.action.body.shareLink;
  const completedChoice = latestChoice && !outbox.hasPending() && sameJson(cloneStateForSync(outbox.recoverSnapshot(), { forSync: true }), serializeState({ forSync: true }))
    && sameJson(Object.fromEntries(Object.entries(latestChoice).filter(([key]) => !["id", "version"].includes(key))), selection) ? latest : null;
  let record;
  if (pending || completedChoice) {
    const saved = pending || completedChoice;
    const { version, id, ...savedSelection } = saved.action.body.shareLink;
    if (!sameJson(savedSelection, selection)) throw Error("В очереди уже сохранён другой выбор ссылки. Сначала проверьте его подтверждение.");
    record = saved;
  } else {
    // First persist any field/placement edits. The share is a separate action
    // even when its payload equals the last saved business snapshot.
    capturePersonalSaveIntent(state);
    const snapshot = JSON.parse(JSON.stringify(state));
    const prepared = preparePersonalShareLink({ binding: outbox.binding, snapshot, basePayload: cloneStateForSync(snapshot, { forSync: true }),
      baseStateRevision: Number(syncMeta.stateRevision), selection }, { snapshotToPayload: value => cloneStateForSync(value, { forSync: true }) });
    record = outbox.capture(prepared);
    syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
  }
  await queuedPersonalSave({ notify: false }); assertCurrent();
  const queue = createListOperationQueue({ transport: experimentTransport, getContext: personalSaveContext, readOnly: true });
  const proof = await queue.inspect({ path: `/bike-packing/lists/${encodeURIComponent(initial.listId)}`, method: "PUT",
    body: JSON.stringify(record.action.body), operationId: record.action.operationId });
  assertCurrent();
  if (proof.operation.state !== "committed") throw Error("Ссылка ещё не подтверждена. Выбранные данные сохранены на устройстве.");
  return JSON.parse(JSON.stringify(record.action.body.shareLink));
}

async function shareCurrentPackingListByLink() {
  if (!currentUser) {
    showToast(localText("Sign in to create a list link.", "Войдите, чтобы создать ссылку на список."), "error");
    handleAuthButton();
    return;
  }
  if (isPublicLayoutContext()) {
    showToast(localText("Create a personal copy before sharing a demo/template view.", "Для demo/shared просмотра сначала создайте личную копию."), "error");
    return;
  }
  try {
    const chosenContext = personalSaveContext(), chosenLayoutId = state.activeLayoutId;
    const chosenTitle = state.layouts?.[chosenLayoutId]?.name || currentPackingListMeta?.title || "Велоукладка";
    const chosenDescription = currentPackingListMeta?.description || "";
    const authorLabel = String(currentUser.displayName || currentUser.email || "").trim();
    let publishOptions = { mode: "live", includeAuthor: false };
    const confirmed = await askConfirmDialog({
      title: uiLanguage === "en" ? "Create list link" : "Создать ссылку на список",
      text: uiLanguage === "en" ? "Choose how the link should work." : "Выберите, как должна работать ссылка.",
      highlightHtml: sharedListPublishDialogHtml({ authorLabel, language: uiLanguage, chooseScope: personalSavePilotEnabled() }),
      okText: uiLanguage === "en" ? "Create link" : "Создать ссылку",
      hideCancel: true,
      keepOpenOnOk: true,
      onOk: () => { publishOptions = readSharedListPublishOptions(refs.confirmDialog, { chooseScope: personalSavePilotEnabled() }); }
    });
    if (!confirmed) return;
    if (["actorId", "listId", "scopeKey", "scope"].some(key => personalSaveContext()[key] !== chosenContext[key]) || state.activeLayoutId !== chosenLayoutId) throw Error("Аккаунт или укладка изменились во время выбора ссылки.");
    const causalLink = await runCausalPersonalShareLink({ ...publishOptions, scope: publishOptions.scope || "layout", entityType: "", entityId: "", layoutId: chosenLayoutId,
      title: chosenTitle, description: chosenDescription, authorName: publishOptions.includeAuthor ? authorLabel : "" });
    let link;
    if (causalLink) link = buildSharedListUrl(causalLink.id, causalLink.layoutId);
    else {
    updateSyncUi(localText("Preparing the list for link sharing...", "Готовлю список к публикации по ссылке..."));
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
    link = buildSharedListUrl(sharedListId, sharedLayoutId);
    }
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
    updateSyncUi(localText(`Could not create the shared link: ${error.message}`, `Не удалось создать shared-ссылку: ${error.message}`));
    showToast(localText(`Could not create the link: ${error.message}`, `Не удалось создать ссылку: ${error.message}`), "error");
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
    if (personalSavePilotEnabled() && stateError?.data?.code === "causal_read_migration_required") throw stateError;
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
  const initialPersonalContext = personalSavePilotEnabled() ? personalSaveContext() : null;
  const assertPersonalContext = () => {
    if (!initialPersonalContext) return;
    const current = personalSaveContext();
    if (["actorId", "scopeKey", "scope", "generation"].some(key => initialPersonalContext[key] !== current[key])) {
      throw new Error("Аккаунт или локальная версия изменились. Полученный список не применён.");
    }
  };
  if (personalSavePilotEnabled() && hasPendingPersonalSave()) {
    throw new Error("Сначала нужно сверить сохранённые действия текущего списка. Замена локальной версии остановлена.");
  }
  if (personalListApiUnavailable) throw createSkippedPersonalListApiError();
  if (isPublicTemplateListId(currentPackingListId)) saveActivePackingListId("");
  let savedRecord = null;
  if (currentPackingListId) {
    try {
      setLayoutLoadStatus("loading", localText("Loading the saved personal layout...", "Загружаю сохранённую личную укладку..."));
      savedRecord = await fetchRemoteListStateSnapshot(currentPackingListId);
      assertPersonalContext();
    } catch (error) {
      assertPersonalContext();
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
    assertPersonalContext();
  } catch (error) {
    assertPersonalContext();
    if (savedRecord?.payload) {
      rememberCurrentPackingListRecord(savedRecord);
      return savedRecord;
    }
    throw error;
  }
  const lists = normalizePackingListsResponse(data);
  if (personalSavePilotEnabled() && data?.ok === false) throw new Error("Список личных данных не подтверждён сервером.");
  const catalogBestRecord = bestCatalogListRecord(lists);
  const catalogBestId = remoteRecordId(catalogBestRecord);
  const list = (catalogBestId && lists.find((entry) => remoteRecordId(entry) === catalogBestId)) ||
    chooseDefaultPackingList(lists);
  if (!list) {
    if (personalSavePilotEnabled() && ![data, data?.lists, data?.items, data?.records].some(Array.isArray)) {
      throw new Error("Не удалось проверить наличие личного списка. Создание остановлено.");
    }
    await prepareInitialPersonalSave();
    return null;
  }
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
      assertPersonalContext();
    } catch (error) {
      assertPersonalContext();
      if (personalSavePilotEnabled() && error?.data?.code === "causal_read_migration_required") {
        saveActivePackingListId(listId);
        throw error; // The catalog's legacy payload is not a protected read.
      }
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
    if (error.isOperationReceiptError) throw annotatePayloadError(error, report);
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
      persistPublicTemplateOfflineCache: ({ demoTemplateIds, sharedLayoutIds }) => savePublicTemplateOfflineCache(
        PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY,
        createPublicTemplateOfflineCache({
          demoTemplates: serverConfirmedDemoTemplates,
          demoPayloadsByLanguage: demoSharedLayout.statePayloadByLanguage,
          demoPayloadsByTemplateId: demoSharedLayout.statePayloadByTemplateId,
          sharedLayoutsByLanguage,
          demoTemplateIds,
          sharedLayoutIds
        })
      ),
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
      syncPublishedTemplateCopyDraft: (layout, draft) => mergePublishedSharedStateIntoAdminLayout(layout, draft),
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

async function refreshPublicSharedTemplates(options = {}) {
  const { renderAfter = false } = options;
  const indexMerged = await refreshPublicSharedLayoutIndex();
  const catalogMerged = await refreshPublicSharedLayoutCatalog(options);
  if (renderAfter && (indexMerged || catalogMerged)) render();
  return indexMerged + catalogMerged;
}

async function refreshAdminTemplateDrafts({ renderAfter = false } = {}) {
  if (!currentUser || !canOpenAdminPublishedEdit() || isForcedOffline()) return 0;
  if (adminTemplateUiEnabled()) {
    const targetForRecord = record => record.publicTemplateKind === "shared-layout"
      ? { type: "shared", sharedId: record.sharedId || record.id, language: record.language }
      : { type: "demo", demoListId: record.demoListId || record.listId || record.id, language: record.language };
    const result = await hydrateCausalAdminTemplateDrafts({
      getContext: () => adminTemplateOperationContext({}, "", true), getLayouts: () => state.layouts,
      getBinding: record => adminTemplateBinding(targetForRecord(record)),
      readCatalog: () => apiFetch("/bike-packing/admin/template-records", { timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true }),
      normalizeRecords: normalizeAdminTemplateHistoryRecords,
      readTemplate: binding => adminTemplateClient(binding, "", true).prepare(),
      materialize: (record, prepared) => materializeCausalAdminTemplate(targetForRecord(record), prepared),
      rememberSource: rememberAdminTemplateSourceBaseline,
      acceptRecords: records => { adminTemplateHistoryRecords = records; }, persist: () => persistStateSnapshot(state, { recordAction: false }),
    });
    if (renderAfter && result.restored) render();
    return result.restored;
  }
  const result = await hydrateAdminTemplateDraftsFlow({
    runtime: {
      get adminTemplateHistoryRecords() { return adminTemplateHistoryRecords; },
      set adminTemplateHistoryRecords(value) { adminTemplateHistoryRecords = value; },
      get state() { return state; }
    },
    dependencies: {
      fetchAdminTemplateCatalog: () => apiFetch("/bike-packing/admin/template-records", {
        timeoutMs: LIST_API_TIMEOUT_MS,
        silentErrors: true
      }),
      fetchAdminTemplatePayload: (endpoint) => apiFetch(endpoint, {
        timeoutMs: LIST_API_TIMEOUT_MS,
        silentErrors: true
      }),
      clearDeletedSharedDraftMarker: (record) => {
        forgetDeletedSharedLayoutId(record.sharedId || record.id);
      },
      materializeDemoDraft: (record, payload) => importDemoStateAsEditableLayout(payload, {
        activate: false,
        language: record.language || uiLanguage,
        listId: record.demoListId || record.listId,
        renderAfter: false
      }),
      materializeSharedDraft: (record, payload) => {
        const sharedId = String(record.sharedId || record.id || "").trim();
        if (!sharedId) return null;
        const normalizedPayload = publishedPayloadWithTemplateMetadata(payload, {
          name: record.name || "",
          language: record.language || uiLanguage
        });
        const runtimeLayout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
          id: sharedId,
          name: record.name || sharedId,
          language: record.language || uiLanguage,
          statePayload: normalizedPayload,
          runtimeSharedTemplate: true,
          updatedAt: record.updatedAt || ""
        });
        const layout = materializeSharedLayoutForAdmin(sharedId, { sourceLayout: runtimeLayout });
        removeRuntimeSharedLayout(sharedLayoutsByLanguage, sharedId);
        return layout;
      },
      normalizeAdminTemplateHistoryRecords,
      render,
      saveState
    }
  }, { renderAfter });
  for (const layout of pendingAdminTemplateDraftLayouts(state.layouts)) {
    cancelPublishedLayoutSave(layout.id);
    await savePublishedLayoutRecord(layout.id, { published: false }).catch(() => null);
  }
  return result.restored;
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
  resetContentFilterControls({
    refs,
    runtime: appTailRuntime,
    clearTimeout: (timerId) => window.clearTimeout(timerId)
  });
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

const queuedPersonalSave = createQueuedRemoteSave(savePersonalStateFromOutbox);

function personalSaveContext() {
  return {
    environment: "bike-packing-experiment", actorId: String(currentUser?.id || ""),
    listId: currentPackingListId, scopeKey: localStorageScopeKey,
    scope: isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState) ? "readonly" : "personal",
    generation: JSON.stringify([syncMeta.localUpdatedAt, serializeState({ forSync: true })])
  };
}

function personalPhotoRecoveryReadContext() {
  const context = personalSaveContext();
  // Local recovery is also available for the explicitly remembered offline
  // account. This read context is NEVER passed to a server writer.
  if (!context.actorId && isOfflineRememberedSession()) context.actorId = String(offlineRememberedUser.id || "");
  return context;
}

async function checkPersonalPhotoRecoveryBeforeLoad() {
  if (!personalSavePilotEnabled()) return;
  personalSaveRecovery.assertRunning();
  const initial = personalPhotoRecoveryReadContext();
  if (!initial.actorId || !initial.listId || initial.scopeKey !== `id:${initial.actorId}` || initial.scope !== "personal") return;
  const binding = { environment: initial.environment, actorId: initial.actorId, listId: initial.listId, scopeKey: initial.scopeKey };
  const key = JSON.stringify(binding);
  if (personalPhotoRecoveryCheck?.key === key) return personalPhotoRecoveryCheck.promise;
  const source = { store: createPersonalPhotoActionStore({ ...binding, getContext: personalPhotoRecoveryReadContext }), inventory: null };
  personalPhotoRecoverySource = source;
  personalSaveRecoveryDialog?.showChecking();
  const pending = { key, promise: null };
  personalPhotoRecoveryCheck = pending;
  pending.promise = (async () => {
    try {
      // Reader works with every photo writer gate off, including rollback.
      await readPersonalPhotoRecoveryInCurrentContext({ binding, getContext: personalPhotoRecoveryReadContext, read: async () => {
        source.guestPreparation = null;
        const outbox = createPersonalSaveOutbox({ ...binding, storage: localStorage, photoEnabled: PERSONAL_PHOTO_OUTBOX_ENABLED });
        source.outbox = outbox; // Preserve the observed head while the dialog is open.
        source.inventory = await inspectPersonalPhotoRecovery({ outbox, store: source.store, getContext: personalPhotoRecoveryReadContext });
        const publicEntries = await personalPublicSelectionStore(binding).entries();
        const publicPending = personalPublicPendingPreparations(publicEntries, outbox);
        assignPersonalPublicPreparations(source, publicEntries);
        const serverEntries = await personalServerSelectionStore(binding).entries();
        assignPersonalServerPreparations(source, serverEntries);
        if (source.serverPreparations.length) throw Error("Prepared server copy needs explicit recovery");
        if (publicPending.length) throw Error("Prepared public copy needs explicit recovery");
        const unlinkedGuest = source.inventory.entries.filter(entry => entry.state === "unlinked");
        if (!outbox.hasPending() && unlinkedGuest.length === 1 && source.inventory.entries.every(entry => ["unlinked", "settled-retained"].includes(entry.state))) {
          const entries = await personalGuestSelectionStore(binding).entries();
          source.guestPreparation = entries.find(entry => entry.intent && !entry.completion && entry.selection.operationId === unlinkedGuest[0].operationId) || null;
        }
      } });
      personalSaveRecovery.assertRunning();
      // Only an exact retained terminal receipt, bound to the immutable action,
      // clears this startup fence. It never permits byte cleanup or re-upload.
      if (source.inventory.entries.some(entry => entry.state !== "settled-retained")) throw Error("Retained photo actions need explicit recovery");
      await completePersonalGuestImportSelections(source);
      await completePersonalPublicImportSelections(source);
      if (personalPhotoRecoveryCheck === pending) {
        personalPhotoRecoverySource = null;
        personalSaveRecoveryDialog?.finishChecking();
      }
    } catch (cause) {
      // A concurrent storage failure owns its existing dialog and draft.
      if (personalSaveRecovery.owns(cause)) throw cause;
      const current = personalPhotoRecoveryReadContext();
      if (cause.code === "photo-recovery-superseded"
        || Object.keys(binding).some(name => current[name] !== binding[name]) || current.scope !== "personal") {
        if (personalPhotoRecoveryCheck === pending) {
          personalPhotoRecoverySource = null;
          personalSaveRecoveryDialog?.finishChecking();
        }
        throw cause; // Never expose/adopt a previous account's recovery result.
      }
      const error = Object.assign(new Error("Сохранённые фотографии требуют проверки. Данные не удалены и не отправлены повторно."),
        { cause, code: "photo-recovery", isPersonalSaveBlocked: true });
      personalSaveRecovery.report(error, { scopeKey: initial.scopeKey });
      throw error;
    } finally {
      if (personalPhotoRecoveryCheck === pending) personalPhotoRecoveryCheck = null;
    }
  })();
  return pending.promise;
}

function personalPhotoRecoveryOptions() {
  const source = personalPhotoRecoverySource;
  if (!source?.outbox || !currentUser || isForcedOffline()) throw Error("Для проверки нужен вход в тот же аккаунт и доступ к серверу. Файлы сохранены.");
  const publicCopy = source.publicPreparation || source.serverPreparation || source.outbox.list().some(record => record.action.body.publicImport || record.action.body.serverImport);
  return { outbox: source.outbox, store: source.store, transport: experimentTransport,
    getContext: personalSaveContext, makeSnapshot: publicCopy
      ? (payload, previous) => personalPublicCopySnapshot(payload, previous, previous.activeLayoutId) : personalReconciledSnapshot,
    async readRemote() {
      const initial = personalSaveContext();
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(source.outbox.binding.listId)}/state`, {
        timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true
      });
      const current = personalSaveContext();
      if (source !== personalPhotoRecoverySource || Object.keys(initial).some(key => initial[key] !== current[key])) throw Error("Редактор изменился. Проверка остановлена.");
      if (data?.ok !== true) throw Error("Не удалось прочитать актуальную серверную версию.");
      const record = normalizeRemoteListRecord(data);
      if (blockRemoteIntegrityFailureIfNeeded(normalizeRemoteState(record.payload, { repairCatalog: false }),
        stateIntegrityMetaFromResponse(record, data), record.payload)) throw Error("Серверная версия требует проверки целостности.");
      return { ...record, payload: personalBusinessPayload(record.payload) };
    },
    makeBaselineMeta: record => ({ ...syncMeta, ...stateIntegrityMetaFromResponse(record), stateRevision: record.stateRevision,
      serverUpdatedAt: remoteUpdatedAt(record), lastSyncedLocalUpdatedAt: syncMeta.localUpdatedAt, dirty: false })
  };
}

async function checkRetainedPersonalPhotoResult() {
  const source = personalPhotoRecoverySource;
  if (source?.outbox && personalServerPendingPreparations(await personalServerSelectionStore(source.outbox.binding).entries(), source.outbox).length)
    throw Error("Сначала продолжите сохранённую копию списка по ссылке. Её отправка ещё не подтверждена.");
  if (source?.outbox && personalPublicPendingPreparations(await personalPublicSelectionStore(source.outbox.binding).entries(), source.outbox).length)
    throw Error("Сначала выберите или продолжите сохранённую копию шаблона. Её отправка ещё не подтверждена.");
  const result = await checkPersonalPhotoRecoveryResult(personalPhotoRecoveryOptions());
  await completePersonalGuestImportSelections(personalPhotoRecoverySource);
  await completePersonalPublicImportSelections(personalPhotoRecoverySource);
  return result;
}

function canCancelRetainedPersonalPhoto() {
  if (!personalPhotoRecoveryCancellationEnabled() || !currentUser || isForcedOffline()) return false;
  try {
    const source = personalPhotoRecoverySource;
    return source?.outbox?.binding.scopeKey === localStorageScopeKey && personalPhotoRecoveryCancellationHead(source.outbox.recover(),
      { records: source.outbox.list() });
  } catch { return false; }
}

async function cancelRetainedPersonalPhoto() {
  if (!canCancelRetainedPersonalPhoto()) throw Error("Явная отмена этого фотодействия недоступна. Файл сохранён.");
  return cancelPersonalPhotoRecovery({ ...personalPhotoRecoveryOptions(), chooseCurrent: async ({ discardedOperationCount, photoOperationId }) => {
    const original = personalPhotoRecoverySource.outbox.list().find(record => record.action.operationId === photoOperationId);
    const imported = original?.action?.kind === "list.import", guest = imported && original.action.body.guestImport?.version === 1;
    const publicCopy = imported && [1, 2].includes(original.action.body.publicImport?.version);
    const serverCopy = imported && [1, 2].includes(original.action.body.serverImport?.version);
    const archive = imported && !guest && !publicCopy && !serverCopy;
    const fileless = (imported || ["form", "copy-batch"].includes(original?.action?.body?.action)) && original.photoState?.fileIntentHash === null;
    const photoCount = imported ? (serverCopy ? original.action.body.serverImport : publicCopy ? original.action.body.publicImport : guest ? original.action.body.guestImport : original.action.body.archiveImport).files.length : original?.photoState?.fileInventoryVersion === 2 ? original.action.body.changes.length : 1;
    const confirmed = await askConfirmDialog({
      title: serverCopy ? localText("Shared list was not copied", "Список по ссылке не скопирован") : publicCopy ? localText("Template was not copied", "Шаблон не скопирован") : guest ? localText("Guest work was not imported", "Гостевая работа не перенесена") : archive ? localText("Archive was not restored", "Архив не восстановлен") : fileless ? localText("Photo changes were not applied", "Изменения фото не применены")
        : photoCount > 1 ? localText("Photos were not added", "Фото не добавлены") : localText("Photo was not added", "Фото не добавлено"),
      text: serverCopy ? localText(
        `The server did not apply this shared copy. Keep its current version? Rejected actions: ${discardedOperationCount}. The selected source and all files remain available for recovery.`,
        `Сервер не применил копию списка по ссылке. Оставить актуальную серверную версию? Отклонённых действий: ${discardedOperationCount}. Выбранный источник и все фотографии останутся для восстановления.`) : publicCopy ? localText(
        `The server did not apply this template copy. Keep its current version? Rejected actions: ${discardedOperationCount}. The chosen source and all files remain available for recovery.`,
        `Сервер не применил копию шаблона. Оставить актуальную серверную версию? Отклонённых действий: ${discardedOperationCount}. Выбранный источник и все фотографии останутся для восстановления.`) : guest ? localText(
        `The server did not apply this guest import. Keep its current version? Rejected actions: ${discardedOperationCount}. The original guest work and all files remain available for recovery.`,
        `Сервер не применил гостевой перенос. Оставить актуальную серверную версию? Отклонённых действий: ${discardedOperationCount}. Исходная гостевая работа и все фотографии останутся для восстановления.`) : archive ? localText(
        `The server did not apply this archive. Keep its current version? Rejected actions: ${discardedOperationCount}. The complete source, files and receipts remain available for recovery.`,
        `Сервер не применил этот архив. Оставить актуальную серверную версию? Отклонённых действий: ${discardedOperationCount}. Полный источник, файлы и подтверждения останутся для восстановления.`) : fileless ? localText(
        `The server did not apply the fields and photo changes from this form. Keep the current server version? ${discardedOperationCount} rejected local actions will not be replayed. The original form and receipts remain available for recovery.`,
        `Сервер не применил поля и изменения фото из этой формы. Оставить актуальную серверную версию? Отклонённых локальных действий: ${discardedOperationCount}; они не будут отправлены заново. Исходная форма и подтверждения останутся для восстановления.`)
        : photoCount > 1 ? localText(
        `The server did not add ${photoCount} photos. Keep the current server version? ${discardedOperationCount} rejected local actions will not be replayed. All original files remain available for recovery.`,
        `Сервер не добавил ${photoCount} фото. Оставить актуальную серверную версию? Отклонённых локальных действий: ${discardedOperationCount}; они не будут отправлены заново. Все исходные файлы останутся для восстановления.`) : localText(
        `The server did not apply the photo action. Keep the current server version? ${discardedOperationCount} rejected local actions will not be replayed. The original file remains available for recovery.`,
        `Сервер не применил фотодействие. Оставить актуальную серверную версию? Отклонённых локальных действий: ${discardedOperationCount}; они не будут отправлены заново. Исходный файл останется для восстановления.`),
      okText: localText("Keep server version", "Оставить серверную версию"),
      cancelText: localText("Decide later", "Решить позже"), tone: "danger"
    });
    return confirmed === true ? "keep-server" : "cancel";
  } });
}

function personalReconciledSnapshot(payload, previous) {
  // Restore only UI preferences/selection, never old business relationships.
  const business = personalBusinessPayload(payload);
  const snapshot = normalizeRemoteState({ ...business, activeLayoutId: previous.activeLayoutId }, { repairCatalog: false });
  if (!snapshot || !sameJson(cloneStateForSync(snapshot, { forSync: true }), business)) {
    throw new Error("Объединённая версия требует проверки структуры. Автоматическая отправка остановлена.");
  }
  return personalSnapshotWithUiPreferences(snapshot, JSON.stringify(previous));
}

async function recoverStalePersonalDraft() {
  const record = await personalSaveRecovery.recoverDraft({
    getContext: personalSaveContext, makeSnapshot: personalReconciledSnapshot,
    resolveConflicts: (conflicts, details) => askConflictResolution(conflicts, details)
  });
  // The new local successor is already durable. Replace the stale adapter
  // before UI adoption; neither its old draft nor old forms may save again.
  personalSaveOutboxes.clear();
  replaceState(record.snapshot, { personalOperationId: record.action.operationId });
  syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso();
  persistStateSnapshot(state, { recordAction: false });
  saveSyncMeta();
  document.querySelectorAll("dialog[open]").forEach(dialog => {
    if (dialog.id !== "personalSaveRecoveryDialog") closeDialogWithoutRestoringFocus(dialog, "cancel");
  });
  renderPreservingPackingScroll();
  updateSyncUi("Черновик согласован с другой вкладкой и сохранён. Ожидает подтверждения сервера.");
  scheduleRemoteSave();
}

function retainedPersonalPublicPreparationChoices() {
  try {
    const source = personalPhotoRecoverySource;
    const serverCopy = Boolean(source?.serverPreparations?.length), entries = serverCopy ? source.serverPreparations : source?.publicPreparations;
    if (!(serverCopy ? PERSONAL_SERVER_IMPORT_ENABLED && !source.publicPreparations?.length
        : PERSONAL_PUBLIC_PREPARATION_CHOICE_ENABLED && PERSONAL_PUBLIC_IMPORT_ENABLED) || !personalPhotoFormUiEnabled()
      || !source?.outbox || source.outbox.hasPending() || source.store.binding.scopeKey !== localStorageScopeKey
      || source.store.binding.listId !== currentPackingListId || entries?.length < 2
      || !entries || entries.some(entry => entry.action || entry.completion || entry.retainedAlternative
        || !serverCopy && entry.selection.version === 2 && !PERSONAL_PUBLIC_ENTITY_COPY_ENABLED)
      || source.inventory?.entries.some(entry => entry.state !== "settled-retained")) return [];
    return entries.map(({ selection }, index) => ({ operationId: selection.operationId,
      label: `${index + 1}. ${selection.layoutTargets?.map(value => value.name).filter(Boolean).join(", ")
        || selection.copy?.entries?.map(value => selection.sourcePayload[value.entityType === "item" ? "items" : "containers"]?.[value.sourceId]?.name).filter(Boolean).join(", ")
        || localText("Template copy", "Копия шаблона")} · ${selection.photoTargets.length} ${localText("photos", "фото")}` }));
  } catch { return []; }
}

function assignPersonalPublicPreparations(source, entries) {
  const pending = personalPublicPendingPreparations(entries, source.outbox);
  source.publicPreparations = personalPublicRecoverablePreparations(entries, source.outbox, source.inventory);
  source.publicPreparation = !source.outbox.hasPending() && pending.length === 1 && source.publicPreparations.length === 1 ? pending[0] : null;
}

function assignPersonalServerPreparations(source, entries) {
  const pending = personalServerPendingPreparations(entries, source.outbox);
  source.serverPreparations = personalServerRecoverablePreparations(entries, source.outbox, source.inventory);
  source.serverPreparation = !source.outbox.hasPending() && pending.length === 1 && source.serverPreparations.length === 1 ? pending[0] : null;
}

function retainedPersonalPublicPreparations() {
  try {
    const source = personalPhotoRecoverySource;
    if (!source?.outbox || source.outbox.hasPending() || !currentUser || isForcedOffline()
      || Object.keys(source.outbox.binding).some(key => personalSaveContext()[key] !== source.outbox.binding[key])) return [];
    const entries = [...(source.publicPreparations || []).map(entry => ({ ...entry, serverCopy: false })),
      ...(source.serverPreparations || []).map(entry => ({ ...entry, serverCopy: true }))];
    if (new Set(entries.map(entry => entry.selection.operationId)).size !== entries.length) return [];
    return entries.map(({ selection, action, completion, serverCopy }, index) => ({ operationId: selection.operationId, serverCopy,
      label: `${index + 1}. ${selection.layoutTargets?.map(value => value.name).filter(Boolean).join(", ")
        || selection.copy?.entries?.map(value => selection.sourcePayload[value.entityType === "item" ? "items" : "containers"]?.[value.sourceId]?.name).filter(Boolean).join(", ")
        || localText("Template copy", "Копия шаблона")} · ${selection.photoTargets.length} ${localText("photos", "фото")}`,
      state: completion?.operation.state === "committed" ? localText("Copy accepted; files need review", "Копия принята; файлы требуют проверки")
        : completion ? localText("Action rejected; files need review", "Действие отклонено; файлы требуют проверки")
        : action ? localText("Action prepared; result needs review", "Действие подготовлено; результат требует проверки") : localText("Selection retained; action not prepared", "Выбор сохранён; действие ещё не подготовлено"),
      canStop: serverCopy ? PERSONAL_SERVER_IMPORT_ENABLED : PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED && PERSONAL_PUBLIC_IMPORT_ENABLED
        && (selection.version === 1 || PERSONAL_PUBLIC_ENTITY_COPY_ENABLED) }));
  } catch { return []; }
}

async function resolveRetainedPersonalPublicPreparation(operationId, cancel) {
  const option = retainedPersonalPublicPreparations().find(value => value.operationId === operationId);
  if (!option || cancel && !option.canStop) throw Error("Решение для этой подготовки недоступно. Исходные данные сохранены.");
  const source = personalPhotoRecoverySource, getContext = personalSaveContext;
  const entry = (option.serverCopy ? source.serverPreparations : source.publicPreparations).find(value => value.selection.operationId === operationId);
  try {
    const result = await (option.serverCopy ? resolvePersonalServerPreparation : resolvePersonalPublicPreparation)({ entry, cancel, outbox: source.outbox, store: source.store,
      selectionStore: (option.serverCopy ? personalServerSelectionStore : personalPublicSelectionStore)(source.outbox.binding), getContext,
      queue: createListOperationQueue({ transport: experimentTransport, getContext, readOnly: !cancel }),
      staging: createPersonalPhotoStaging({ store: source.store, transport: experimentTransport, getContext }) });
    return result;
  } finally {
    if (source === personalPhotoRecoverySource && Object.keys(source.outbox.binding).every(key => getContext()[key] === source.outbox.binding[key])) {
      source.inventory = await inspectPersonalPhotoRecovery({ outbox: source.outbox, store: source.store, getContext });
      assignPersonalPublicPreparations(source, await personalPublicSelectionStore(source.outbox.binding).entries());
      assignPersonalServerPreparations(source, await personalServerSelectionStore(source.outbox.binding).entries());
    }
  }
}

async function chooseRetainedPersonalPublicPreparation(operationId) {
  if (!retainedPersonalPublicPreparationChoices().some(value => value.operationId === operationId)) throw Error("Выбор изменился. Данные сохранены; перезагрузите страницу для проверки.");
  const source = personalPhotoRecoverySource;
  const serverCopy = Boolean(source.serverPreparations?.length);
  const entry = await (serverCopy ? choosePersonalServerPreparation : choosePersonalPublicPreparation)({ entries: serverCopy ? source.serverPreparations : source.publicPreparations, operationId,
    selectionStore: (serverCopy ? personalServerSelectionStore : personalPublicSelectionStore)(source.outbox.binding), outbox: source.outbox, store: source.store, getContext: personalSaveContext });
  if (source !== personalPhotoRecoverySource) throw Error("Редактор изменился. Сохранённый выбор будет проверен после перезагрузки.");
  if (serverCopy) { source.serverPreparation = entry; source.serverPreparations = [entry]; }
  else { source.publicPreparation = entry; source.publicPreparations = [entry]; }
  return { selected: true, alternativesRetained: true };
}

function canResumeRetainedPersonalPhotoForm() {
  if (!personalPhotoFormUiEnabled() || isForcedOffline()) return false;
  try {
    if (PERSONAL_SERVER_IMPORT_ENABLED && personalPhotoRecoverySource?.serverPreparation
      && !personalPhotoRecoverySource.publicPreparations?.length
      && personalPhotoRecoverySource.store.binding.scopeKey === localStorageScopeKey
      && personalPhotoRecoverySource.store.binding.listId === currentPackingListId) return true;
    if (PERSONAL_PUBLIC_IMPORT_ENABLED && personalPhotoRecoverySource?.publicPreparation
      && !personalPhotoRecoverySource.serverPreparations?.length
      && (personalPhotoRecoverySource.publicPreparation.selection.version === 1 || PERSONAL_PUBLIC_ENTITY_COPY_ENABLED)
      && personalPhotoRecoverySource.store.binding.scopeKey === localStorageScopeKey
      && personalPhotoRecoverySource.store.binding.listId === currentPackingListId) return true;
    if (PERSONAL_GUEST_IMPORT_ENABLED && personalPhotoRecoverySource?.guestPreparation
      && personalPhotoRecoverySource.store.binding.scopeKey === localStorageScopeKey
      && personalPhotoRecoverySource.store.binding.listId === currentPackingListId) return true;
    const outbox = personalPhotoRecoverySource?.outbox;
    const publicVersion = outbox && (personalPendingImportSource(outbox, true) || outbox.recover())?.action.body.publicImport?.version;
    if (publicVersion === 2 && !PERSONAL_PUBLIC_ENTITY_COPY_ENABLED) return false;
    return Boolean(outbox && outbox.binding.scopeKey === localStorageScopeKey && outbox.binding.listId === currentPackingListId
      && outbox.hasPending() && (PERSONAL_SERVER_IMPORT_ENABLED && [1, 2].includes(outbox.recover()?.action.body.serverImport?.version)
        || PERSONAL_PUBLIC_IMPORT_ENABLED && [1, 2].includes(outbox.recover()?.action.body.publicImport?.version)
        || PERSONAL_GUEST_IMPORT_ENABLED && outbox.recover()?.action.body.guestImport?.version === 1
        || PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED && outbox.recover()?.action.body.archiveImport?.version === 2
        || personalPendingImportSource(outbox)
        || outbox.recover()?.action.body.action === "form"
        || PERSONAL_PHOTO_COPY_BATCH_ENABLED && outbox.recover()?.action.body.action === "copy-batch"
        || PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(),
          operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId })
        || PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED && personalPendingPhotoCopyDeletionForm({ records: outbox.list(),
          operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId })));
  } catch { return false; }
}

async function drainLivePersonalPhotoForm({ notify = false, recovery = false } = {}) {
  const source = recovery ? personalPhotoRecoverySource : personalPhotoFormLiveSource;
  if (!personalPhotoFormUiEnabled() || !source?.outbox || isForcedOffline()
    || Object.keys(source.outbox.binding).some(key => personalSaveContext()[key] !== source.outbox.binding[key])) {
    throw Error("Продолжение этой формы недоступно. Поля, файлы и прежние номера сохранены.");
  }
  const getContext = personalSaveContext;
  if (recovery && source.serverPreparation) {
    if (source.publicPreparations?.length) throw Error("Есть несколько сохранённых подготовок. Исходные выборы требуют проверки.");
    await recoverPersonalServerImportPreparation({ entry: source.serverPreparation, selectionStore: personalServerSelectionStore(source.outbox.binding),
      outbox: source.outbox, store: source.store, getContext, makeSnapshot: personalPublicCopySnapshot, loadFile: loadPersonalServerCopyFile });
    source.serverPreparation = null;
  }
  if (recovery && source.publicPreparation) {
    if (source.serverPreparations?.length) throw Error("Есть несколько сохранённых подготовок. Исходные выборы требуют проверки.");
    await recoverPersonalPublicImportPreparation({ entry: source.publicPreparation, selectionStore: personalPublicSelectionStore(source.outbox.binding),
      outbox: source.outbox, store: source.store, getContext, makeSnapshot: personalPublicCopySnapshot, loadFile: loadPersonalPublicCopyFile });
    source.publicPreparation = null;
  }
  if (recovery && source.guestPreparation) {
    await recoverPersonalGuestImportLink({ entry: source.guestPreparation, outbox: source.outbox, store: source.store, getContext });
    source.guestPreparation = null;
  }
  const queue = createListOperationQueue({ transport: experimentTransport, getContext });
  const staging = createPersonalPhotoStaging({ store: source.store, transport: experimentTransport, getContext });
  const archive = source.outbox.recover()?.action.kind === "list.import" || personalPendingImportSource(source.outbox)?.action.kind === "list.import";
  const guest = (personalPendingImportSource(source.outbox, true) || source.outbox.recover())?.action.body.guestImport?.version === 1;
  const publicCopy = [1, 2].includes((personalPendingImportSource(source.outbox, true) || source.outbox.recover())?.action.body.publicImport?.version);
  const serverCopy = [1, 2].includes((personalPendingImportSource(source.outbox, true) || source.outbox.recover())?.action.body.serverImport?.version);
  updateSyncUi(serverCopy ? "Сохраняю копию списка по ссылке и проверяю фотографии…" : publicCopy ? "Сохраняю личную копию шаблона и проверяю фотографии…" : guest ? "Переношу сохранённую гостевую работу и проверяю фотографии…" : archive ? "Восстанавливаю сохранённый архив и проверяю фотографии…" : "Отправляю сохранённую форму и проверяю подтверждения фото…");
  const result = await drainPersonalPhotoForm({ ...personalPhotoRecoveryOptions(), ...source,
    queue, staging, getContext,
    ...(publicCopy || serverCopy ? { makeSnapshot: (payload, previous) => personalPublicCopySnapshot(payload, previous, previous.activeLayoutId) } : {}),
    beforeAdopted: async () => { await completePersonalGuestImportSelections(source); await completePersonalPublicImportSelections(source); },
    onAdopted(record) {
      if (recovery) return; // Journal is complete; the blocked editor reloads explicitly.
      personalSaveRecovery.assertRunning();
      replaceState(record.snapshot);
      const writeRequired = (key, value) => {
        if (!safeSetLocalStorage(scopedLocalStorageKey(key), JSON.stringify(value), { silent: true })) {
          throw Object.assign(new Error("Подтверждение сохранено в очереди, но локальное зеркало недоступно. Не очищайте данные сайта."),
            { code: "storage", isPersonalSaveBlocked: true });
        }
      };
      writeRequired(STORAGE_KEY, state);
      writeRequired(BASE_STATE_KEY, record.baseline.payload);
      Object.assign(syncMeta, record.baseline.meta);
      rememberRemoteIntegrityMeta(record.serverRecord); rememberCurrentSyncAccount();
      writeRequired(SYNC_META_KEY, syncMeta);
      // Byte retirement/cleanup is a separate acknowledged action, not a side
      // effect of successful saving. Keep the native files and their receipts.
      personalPhotoFormLiveSource = null;
      personalPhotoRecoverySource = null;
      renderPreservingPackingScroll(); updateSyncUi();
      if (notify) showToast(serverCopy ? "Копия списка по ссылке и фотографии сохранены в аккаунте." : publicCopy ? "Личная копия шаблона и фотографии сохранены в аккаунте." : guest ? "Гостевая работа и фотографии сохранены в аккаунте." : archive ? "Архив и фотографии подтверждены сервером." : "Карточка и фотографии подтверждены сервером.", "success");
    }
  });
  return recovery ? { ...result, verified: true, reloadRequired: true } : result;
}

async function savePersonalStateFromOutbox({ notify = false, forceOverwrite = false } = {}) {
  const owner = { actorId: String(currentUser?.id || ""), scopeKey: localStorageScopeKey, listId: currentPackingListId };
  try {
    personalSaveRecovery.assertRunning();
    // Do not mistake this form's file-commit -> queue-link interval for an
    // abandoned startup record. Its own session guards every awaited step.
    if (personalPhotoFormPreparing) return;
    if (personalPhotoFormLiveSource && personalPhotoFormUiEnabled()) {
      if (isForcedOffline()) { updateSyncUi("Офлайн · форма и фото сохранены на устройстве."); return; }
      if (forceOverwrite) throw Error("Принудительная перезапись формы с фото запрещена.");
      return await drainLivePersonalPhotoForm({ notify });
    }
    await checkPersonalPhotoRecoveryBeforeLoad();
    if (isForcedOffline()) {
      updateSyncUi("Офлайн · действия сохранены на устройстве и ждут отправки.");
      return;
    }
    if (forceOverwrite) throw new Error("Принудительное восстановление требует отдельного причинного действия. Старый обход отключён.");
    if (!currentUser || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) {
      throw new Error("Сохранение доступно только в текущем личном аккаунте.");
    }
    if (!currentPackingListId) {
      const beforeBootstrap = personalSaveContext();
      await ensureCurrentPackingListId();
      const afterBootstrap = personalSaveContext();
      if (["actorId", "scopeKey", "scope", "generation"].some(key => beforeBootstrap[key] !== afterBootstrap[key])) {
        throw new Error("Аккаунт или локальная версия изменились во время создания списка. Отправка остановлена.");
      }
      owner.listId = currentPackingListId;
    }
    persistStateSnapshot(state);
    const outbox = personalSaveOutboxForScope();
    if (!outbox) throw new Error("Сначала нужно подтвердить создание личного списка.");
    if (!outbox.hasPending()) return;
    const confirmedBoundary = outbox.confirmedBoundary();
    const deletionReference = personalDeletionReference(confirmedBoundary?.payload || loadBaseState(), outbox.list(), { confirmedBoundary });
    const knownDeletion = deletionReference && preservesUndeletedEntities(state, deletionReference)
      && !isDestructiveStateRegression(state, deletionReference)
      && (!isSuspiciousEmptyPackingState(state) || isSuspiciousEmptyPackingState(deletionReference));
    const initialEmptyCreate = outbox.recover()?.action.kind === "list.create" && !loadBaseState();
    const initialMigration = outbox.recover()?.action.kind === "list.migrate"
      && sameJson(cloneStateForSync(outbox.recoverSnapshot(), { forSync: true }), serializeState({ forSync: true }));
    const knownEmptyEdit = isKnownEmptyPersonalSave({ records: outbox.list(), operationId: outbox.recover()?.action.operationId,
      payload: serializeState({ forSync: true }) });
    if (!knownDeletion && !initialEmptyCreate && !initialMigration
      && (isSuspiciousEmptyPackingState(state) && !knownEmptyEdit || blockDestructiveLocalSave())) {
      throw new Error("Неполная локальная версия не отправлена на сервер.");
    }
    // Plain field/placement edits may retain confirmed photos exactly. Every
    // queued step is checked, so an intermediate file mutation cannot hide
    // behind a final snapshot which happens to restore the old references.
    const containsPhotos = value => value && typeof value === "object" && Object.entries(value)
      .some(([key, child]) => key === "photos" && Array.isArray(child) && child.length > 0 || containsPhotos(child));
    const beforeDrain = () => {
      const records = outbox.list();
      if ((containsPhotos(loadBaseState()) || records.some(record => containsPhotos(record.action.body.payload)))
        && !(personalPhotoFormUiEnabled() && preservesConfirmedPersonalPhotoChain({ records,
          confirmedBoundary: outbox.confirmedBoundary(),
          operationId: outbox.recover()?.action.operationId, listId: outbox.binding.listId,
          allowOwnerDeletion: PERSONAL_PHOTO_OWNER_DELETION_ENABLED, allowHistoryRestore: PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED }))) {
        throw new Error("Изменение самих фотографий требует отдельного действия с файлами. Поля и исходная очередь сохранены.");
      }
    };
    const getContext = () => {
      personalSaveRecovery.assertRunning();
      return personalSaveContext();
    };
    const queue = createListOperationQueue({ transport: experimentTransport, getContext });
    updateSyncUi("Отправляю сохранённые действия и проверяю подтверждения…");
    await drainPersonalSaveWithReconciliation({ outbox, queue, getContext, beforeDrain,
      async readRemote() {
        const initial = personalSaveContext();
        const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(outbox.binding.listId)}/state`, {
          timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true
        });
        const current = personalSaveContext();
        if (Object.keys(initial).some(key => initial[key] !== current[key])) throw new Error("Редактор изменился. Сверка остановлена.");
        if (data?.ok !== true) throw new Error("Не удалось получить актуальную версию для сравнения.");
        const record = normalizeRemoteListRecord(data);
        if (blockRemoteIntegrityFailureIfNeeded(normalizeRemoteState(record.payload, { repairCatalog: false }),
          stateIntegrityMetaFromResponse(record, data), record.payload)) throw new Error("Серверная версия не прошла проверку целостности.");
        // Compare the business representation, not the assembled API's display
        // mirrors. Receipt bytes/IDs remain untouched in the durable journal.
        return { ...record, payload: personalBusinessPayload(record.payload) };
      },
      makeSnapshot: personalReconciledSnapshot,
      makeBaselineMeta(record) {
        return { ...syncMeta, ...stateIntegrityMetaFromResponse(record), stateRevision: record.stateRevision,
          serverUpdatedAt: remoteUpdatedAt(record), lastSyncedLocalUpdatedAt: syncMeta.localUpdatedAt, dirty: false };
      },
      // Autosave pauses without stealing focus. The explicit sync button opens
      // the decision UI; server CAS still checks the version after that choice.
      resolveConflicts: notify ? (conflicts, details) => askConflictResolution(conflicts, details) : undefined,
      resolveRejectedShare: notify ? async ({ discardedOperationCount }) => {
        const confirmed = await askConfirmDialog({
          title: localText("Link was not created", "Ссылка не создана"),
          text: localText(
            `Keep the current server version and discard the rejected link choice and unconfirmed local changes (${discardedOperationCount} actions)? Then select the data for a new link again. Cancel keeps the original data, files and queue.`,
            `Оставить актуальную серверную версию и отменить отклонённый выбор ссылки вместе с неподтверждёнными локальными изменениями (действий: ${discardedOperationCount})? После этого данные для новой ссылки нужно выбрать заново. Отмена сохраняет исходные данные, файлы и очередь.`),
          okText: localText("Keep server version", "Оставить серверную версию"), tone: "danger"
        });
        return confirmed === true ? "keep-server" : "cancel";
      } : undefined,
      resolveRejectedRestore: notify ? async ({ discardedOperationCount, source }) => {
        const confirmed = await askConfirmDialog({
          title: localText("Restore was not applied", "Восстановление не применено"),
          text: localText(
            `The server rejected the restore. Keep its current version and discard this restore and the later unconfirmed local changes (${discardedOperationCount} actions)? You can then choose ${source === "archive" ? "the archive" : "a history point"} again. Cancel keeps both versions and the queue.`,
            `Сервер отклонил восстановление. Оставить актуальную серверную версию и отменить это восстановление вместе с последующими неподтверждёнными локальными изменениями (действий: ${discardedOperationCount})? После этого можно заново выбрать ${source === "archive" ? "архив" : "точку истории"}. Отмена сохраняет обе версии и очередь.`),
          okText: localText("Keep server version", "Оставить серверную версию"), tone: "danger"
        });
        return confirmed === true ? "keep-server" : "cancel";
      } : undefined,
      onReconciled(record) {
        personalSaveRecovery.assertRunning();
        replaceState(record.snapshot, { personalOperationId: record.action.operationId });
        syncMeta.dirty = true;
        renderPreservingPackingScroll();
        updateSyncUi("Изменения согласованы. Проверяю подтверждение нового действия…");
      },
      onAdopted(record) {
        personalSaveRecovery.assertRunning();
        // The journal atomically owns BOTH the historical confirmation and this
        // newer snapshot. Never install the payload of the old write receipt.
        replaceState(record.snapshot);
        const writeRequired = (key, value) => {
          if (!safeSetLocalStorage(scopedLocalStorageKey(key), JSON.stringify(value), { silent: true })) {
            throw Object.assign(new Error("Актуальная версия сохранена в очереди, но её локальное зеркало недоступно. Не очищайте данные сайта."), {
              code: "storage", isPersonalSaveBlocked: true, isOperationReceiptError: true
            });
          }
        };
        writeRequired(STORAGE_KEY, state);
        writeRequired(BASE_STATE_KEY, record.baseline.payload);
        Object.assign(syncMeta, record.baseline.meta);
        rememberRemoteIntegrityMeta(record.serverRecord);
        rememberCurrentSyncAccount();
        writeRequired(SYNC_META_KEY, syncMeta);
        outbox.compact();
        renderPreservingPackingScroll();
        updateSyncUi();
        if (notify) showToast("Сохранение подтверждено. Более свежие данные загружены.", "success");
      },
      onConfirmed(data, record) {
      personalSaveRecovery.assertRunning();
      const writeRequired = (key, value) => {
        if (!safeSetLocalStorage(scopedLocalStorageKey(key), JSON.stringify(value), { silent: true })) {
          throw Object.assign(new Error("Сервер подтвердил действие, но локальное подтверждение не сохранено. Сверка будет повторена."), {
            code: "storage", isPersonalSaveBlocked: true, isOperationReceiptError: true
          });
        }
      };
      writeRequired(STORAGE_KEY, state);
      writeRequired(BASE_STATE_KEY, record.action.body.payload);
      const serverRecord = data.record || data.list || data;
      rememberRemoteIntegrityMeta(serverRecord, data);
      rememberCurrentSyncAccount();
      syncMeta.serverUpdatedAt = remoteUpdatedAt(serverRecord) || syncMeta.serverUpdatedAt;
      syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
      syncMeta.dirty = false;
      writeRequired(SYNC_META_KEY, syncMeta);
      outbox.markApplied({ operationId: record.action.operationId, stateRevision: data.list?.stateRevision ?? data.stateRevision });
      outbox.compact();
      updateSyncUi();
      if (notify) showToast("Синхронизация подтверждена.", "success");
    } });
  } catch (error) {
    if (String(currentUser?.id || "") !== owner.actorId || localStorageScopeKey !== owner.scopeKey
      || currentPackingListId !== owner.listId) return;
    if (["photo-form-superseded", "photo-recovery-superseded"].includes(error.code)) {
      scheduleRemoteSave();
      return;
    }
    personalSaveRecovery.report(error, { scopeKey: owner.scopeKey });
    syncMeta.dirty = true;
    saveSyncMeta();
    updateSyncUi(error.message || "Сохранение приостановлено до подтверждения.");
    if (notify) showToast(error.message, "warning");
  }
}

async function saveRemoteState(options = {}) {
  if (personalSavePilotEnabled() && currentUser && !isReadOnlyBikePackingContext()
    && !isAdminPublicEditScope(modeState)) return queuedPersonalSave(options);
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
      filterAutoResolvedMergeConflicts,
      isOwnLayoutEchoConflict,
      loadBaseState,
      mergeStateFromBase,
      normalizeRemoteState,
      nowIso,
      offerPendingGuestLoginHandoffAfterRemoteLoad,
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
      "Guest work was imported locally but not uploaded: the import has no items or bags",
      "Гостевая работа перенесена локально, но не отправлена: импорт не содержит вещей или сумок"
    ));
    return false;
  }
  await saveRemoteState({ notify: false, forceOverwrite: true });
  if (syncMeta.dirty) {
    updateSyncUi(localText(
      "The server requested another sync · saving the imported guest work again...",
      "Сервер попросил повторную синхронизацию · сохраняю перенесённую гостевую работу ещё раз..."
    ));
    await saveRemoteState({ notify: false, forceOverwrite: false });
  }
  const remoteValidation = await confirmGuestImportRemoteState(importedLayoutIds);
  if (remoteValidation.ok) return true;
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  updateSyncUi(localText(
    "Guest work was imported locally, but the server has not returned it after saving yet",
    "Гостевая работа перенесена локально, но сервер пока не вернул её после сохранения"
  ));
  return false;
}

function personalGuestSelectionStore(binding) {
  return createPersonalGuestImportSelectionStore({ binding, getContext: personalPhotoRecoveryReadContext });
}

function personalPublicSelectionStore(binding) {
  return createPersonalPublicImportSelectionStore({ binding, getContext: personalPhotoRecoveryReadContext });
}

function personalServerSelectionStore(binding) {
  return createPersonalServerImportSelectionStore({ binding, getContext: personalPhotoRecoveryReadContext });
}

async function loadPersonalServerCopyFile({ photo }) {
  const read = async url => {
    if (!url) throw Error("Не найден выбранный файл фотографии по ссылке.");
    const response = await transportPhotoFetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw Error("Выбранная фотография по ссылке недоступна.");
    return response.blob();
  };
  const file = await read(photo.url), thumb = await read(photo.thumbUrl);
  if (!photo.fileName) throw Error("Не подтверждено имя исходной фотографии.");
  return { file, thumb, fileName: photo.fileName };
}

async function retainPersonalServerPreparationForRecovery(source) {
  try {
    source.outbox = createPersonalSaveOutbox({ ...source.store.binding, storage: localStorage });
    source.inventory = await inspectPersonalPhotoRecovery({ outbox: source.outbox, store: source.store, getContext: personalPhotoRecoveryReadContext });
    assignPersonalServerPreparations(source, await personalServerSelectionStore(source.outbox.binding).entries());
  } catch { /* Original failure and partial files remain available for export. */ }
}

async function loadPersonalPublicCopyFile({ photo }) {
  if (!photo.url) throw Error("Не найден исходный файл фотографии шаблона.");
  const response = await transportPhotoFetch(photo.url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw Error("Не удалось прочитать исходную фотографию шаблона.");
  const file = await response.blob();
  return { file, thumb: null, fileName: photo.fileName || `${photo.id}.${file.type.split("/")[1] || "jpg"}` };
}

async function retainPersonalPublicPreparationForRecovery(source) {
  try {
    // The normal editor wrapper may have latched the quota failure. Inspect a
    // fresh reader, as the recovery dialog does, without releasing that fence.
    const outbox = createPersonalSaveOutbox({ ...source.store.binding, storage: localStorage });
    source.outbox = outbox;
    source.inventory = await inspectPersonalPhotoRecovery({ outbox, store: source.store, getContext: personalPhotoRecoveryReadContext });
    assignPersonalPublicPreparations(source, await personalPublicSelectionStore(outbox.binding).entries());
  } catch { /* Preserve the original storage error and its in-memory recovery archive. */ }
}

async function completePersonalPublicImportSelections(source) {
  if (!source?.outbox || source.outbox.hasPending()) return;
  const outbox = source.outbox, boundary = outbox.confirmedBoundary();
  if (!boundary) return;
  const references = outbox.photoRecoveryReferences();
  for (const journal of [personalPublicSelectionStore(outbox.binding), personalServerSelectionStore(outbox.binding)]) for (const entry of await journal.entries()) {
    if (!entry.action || entry.completion) continue;
    const proof = references.photoReceipts.find(proof => proof.operation.id === entry.selection.operationId);
    if (!proof || proof.operation.state === "committed" && boundary.stateRevision < proof.stateRevision) continue;
    await journal.confirm({ operationId: entry.selection.operationId, proof });
  }
}

function personalPublicCopySnapshot(payload, previous, activeLayoutId) {
  const snapshot = normalizeRemoteState({ ...payload, activeLayoutId }, { repairCatalog: false });
  if (!snapshot) throw Error("Не удалось прочитать подготовленную копию шаблона.");
  applyLayoutArrangement(activeLayoutId, snapshot);
  return personalPublicImportSnapshot(payload, personalSnapshotWithUiPreferences(snapshot, JSON.stringify(previous)));
}

function personalPublicSourceTarget(layout) {
  if (!layout) throw Error("Не найден выбранный источник копирования.");
  if (layout.linkedSharedList) return { serverListId: layout.listId, requestedLayoutId: layout.requestedLayoutId };
  // Every demo shares the same display-layout ID. Freeze the actual selected
  // catalog entry before loading the private editor or awaiting any response.
  const demoEntry = layout.id === DEMO_SHARED_LAYOUT_ID
    ? serverConfirmedDemoTemplates.find(entry => (entry.listId || entry.id) === activeDemoTemplateListId) : null;
  const demoTarget = demoEntry ? publicDemoTemplatePayloadTarget(demoEntry, { fallbackLanguage: uiLanguage,
    demoListIdForLanguage: demoPublicListIdForLanguage }) : null;
  if (layout.id === DEMO_SHARED_LAYOUT_ID && (!demoTarget || demoTarget.listId !== activeDemoTemplateListId)) {
    throw Error("Выбранный demo-шаблон не найден в опубликованном каталоге. Копирование остановлено.");
  }
  const sourceLanguage = demoTarget?.language || layout.language || uiLanguage;
  return { demoTarget, sourceLanguage, itemKey: demoTarget?.itemKey || sharedLayoutItemKey(layout.id, sourceLanguage) };
}

async function readPersonalRemoteCopySource(target) {
  target = clone(target);
  if (target.serverListId) {
    const record = await fetchSharedListLinkRecord(target.serverListId), source = personalServerImportSource(record.serverCopySource);
    const sourcePayload = record.payload, sourceLayout = sourcePayload?.layouts?.[target.requestedLayoutId];
    if (source.listId !== target.serverListId || !sourceLayout || sourceLayout.id !== target.requestedLayoutId) throw Error("Выбранная укладка по ссылке недоступна. Копирование остановлено.");
    return { sourcePayload: clone(sourcePayload), sourceLayout: clone(sourceLayout), source };
  }
  const loaded = await apiFetch(publicTemplatePayloadPath(target.itemKey), { timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true });
  const sourcePayload = loaded?.payload, sourceLayout = sourcePayload?.layouts?.[sourcePayload.activeLayoutId] || Object.values(sourcePayload?.layouts || {})[0];
  if (!sourceLayout || loaded.ok !== true || !loaded.publicTemplatePayload || target.demoTarget && loaded.listId !== target.demoTarget.listId
    || loaded.record?.language && loaded.record.language !== target.sourceLanguage) throw Error("Не удалось прочитать полную выбранную версию шаблона.");
  return { sourcePayload, sourceLayout, source: { kind: "public-template", itemKey: target.itemKey, listId: loaded.listId,
    stateRevision: loaded.stateRevision, language: target.sourceLanguage } };
}

let personalPublicPickerSource = null, personalPublicPickerGeneration = 0;
async function preparePersonalPublicPickerSource(viewLayoutId, entityType, sourceId, includeContents = false) {
  personalPublicPickerSource = null; const generation = ++personalPublicPickerGeneration;
  if (!personalSavePilotEnabled() || !currentUser || canOpenAdminPublishedEdit()) return;
  personalSaveRecovery.assertRunning();
  if (hasPendingPersonalSave() || syncMeta.dirty) throw Error("Сначала нужно подтвердить текущие личные изменения.");
  const actorId = String(currentUser.id), layout = findSharedLayout(viewLayoutId), target = personalPublicSourceTarget(layout);
  if (target.serverListId ? !PERSONAL_SERVER_IMPORT_ENABLED : !PERSONAL_PUBLIC_IMPORT_ENABLED || !PERSONAL_PUBLIC_ENTITY_COPY_ENABLED) throw Error(target.serverListId ? "Копирование списка по ссылке через очередь ещё не включено." : "Копирование отдельных записей шаблона через очередь ещё не включено.");
  const { sourcePayload, sourceLayout, source } = await readPersonalRemoteCopySource(target);
  if (generation !== personalPublicPickerGeneration || String(currentUser?.id) !== actorId || activeReadOnlyLayoutId() !== viewLayoutId
    || !sameJson(target, personalPublicSourceTarget(findSharedLayout(viewLayoutId)))) throw Error("Выбранный шаблон или аккаунт изменился. Копирование остановлено.");
  const owner = sourcePayload?.[entityType === "item" ? "items" : "containers"]?.[sourceId];
  if (owner?.id !== sourceId) throw Error("Выбранная запись отсутствует в исходной версии.");
  personalPublicPickerSource = clone({ actorId, viewLayoutId, entityType, sourceId, includeContents, sourcePayload, sourceLayoutId: sourceLayout.id,
    sourceName: owner.name || "", source });
  return { sourceIsNestedContainer: entityType === "container" && Boolean(sourceLayout.arrangement
    ? sourceLayout.arrangement.containers?.[sourceId]?.parentId : owner.parentId) };
}

async function runCausalPublicEntityCopy(entityType, sourceId, targetContainerId, targetLayoutId, { includeContents = false, targetIndex = null, catalog = false } = {}) {
  if (!personalSavePilotEnabled() || !currentUser || canOpenAdminPublishedEdit() || isAdminEditablePublishedLayout(targetLayoutId)) return null;
  const serverCopy = ["shared-link", "legacy-link"].includes(personalPublicPickerSource?.source?.kind);
  if (serverCopy ? !PERSONAL_SERVER_IMPORT_ENABLED : !PERSONAL_PUBLIC_IMPORT_ENABLED || !PERSONAL_PUBLIC_ENTITY_COPY_ENABLED) throw Error(serverCopy ? "Копирование списка по ссылке через очередь ещё не включено." : "Копирование отдельных записей шаблона через очередь ещё не включено.");
  const prepareSelection = serverCopy ? preparePersonalServerEntitySelection : preparePersonalPublicEntitySelection;
  personalSaveRecovery.assertRunning();
  const chosen = personalPublicPickerSource && clone(personalPublicPickerSource);
  if (!chosen || chosen.actorId !== String(currentUser.id) || chosen.entityType !== entityType || chosen.sourceId !== sourceId
    || chosen.includeContents !== includeContents) throw Error("Исходный выбор изменился. Откройте копирование нужной записи из шаблона снова.");
  await ensurePrivateStateForSharedCopy(); setActivePrivateScope();
  if (String(currentUser?.id) !== chosen.actorId || !personalPhotoFormUiEnabled()) throw Error("Личная очередь копирования ещё недоступна.");
  const outbox = personalSaveOutboxForScope(), initial = clone(personalSaveContext());
  if (!outbox || outbox.hasPending() || syncMeta.dirty || !outbox.confirmedBase()) throw Error("Личный список ещё не подтверждён.");
  if (personalGuestBaseNeedsPreparation(outbox.confirmedBase().payload, personalBusinessPayload(state))) {
    capturePersonalSaveIntent(state); syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta(); await queuedPersonalSave();
    if (outbox.hasPending() || !sameJson(initial, personalSaveContext())) throw Error("Подготовка личного списка ещё не подтверждена.");
  }
  const selectionInput = { binding: outbox.binding, basePayload: personalBusinessPayload(state),
    baseStateRevision: Number(syncMeta.stateRevision), source: chosen.source, sourcePayload: chosen.sourcePayload, editMeta: currentCreateMeta() };
  const missingPreview = entityType === "container" && includeContents ? personalPublicMissingPreview({ currentPayload: selectionInput.basePayload,
    sourcePayload: chosen.sourcePayload, sourceLayoutId: chosen.sourceLayoutId, sourceId, targetLayoutId }) : null;
  let independentSelection, missingSelection, independentFailure, missingFailure;
  try { independentSelection = prepareSelection({ ...selectionInput,
    copy: { version: catalog ? 3 : 1, mode: catalog ? "catalog" : "independent", sourceLayoutId: chosen.sourceLayoutId,
      entries: [{ entityType, sourceId, includeContents }], destination: { layoutId: targetLayoutId, containerId: targetContainerId || "", index: targetIndex } } }); }
  catch (error) { independentFailure = error; }
  if (missingPreview?.canCopyMissingItems) {
    try { missingSelection = prepareSelection({ ...selectionInput, copy: missingPreview.copy }); }
    catch (error) { missingFailure = error; }
  }
  if (!independentSelection && !missingSelection) throw independentFailure || missingFailure;
  const previous = clone(state), revision = Number(syncMeta.stateRevision), selectedSnapshot = missingPreview?.sourceSnapshot
    || { rootId: entityType === "container" ? sourceId : "", containers: {}, items: {} };
  if (!missingPreview) for (const row of independentSelection.ownerTargets) {
    const field = row.entityType === "item" ? "items" : "containers"; selectedSnapshot[field][row.sourceId] = clone(chosen.sourcePayload[field][row.sourceId]);
  }
  const choice = entityType === "item" ? await confirmPublicCopyDuplicates(targetLayoutId, selectedSnapshot, chosen.sourceName) ? "copy-all" : "cancel"
    : await chooseContainerTreeCopyToLayoutAction(targetLayoutId, selectedSnapshot, chosen.sourceName, { publicSource: true, publicCopyPreview: missingPreview });
  if (choice === "cancel") return { cancelled: true };
  const selection = choice === "copy-all" ? independentSelection : choice === "copy-missing" ? missingSelection : null;
  if (!selection) throw (choice === "copy-all" ? independentFailure : missingFailure) || Error("Выбранный состав копии недоступен. Исходный выбор сохранён.");
  if (!sameJson(initial, personalSaveContext()) || !sameJson(previous, state) || revision !== Number(syncMeta.stateRevision)
    || !sameJson(chosen, personalPublicPickerSource)) throw Error("Личный список или выбор изменился во время подтверждения. Копирование остановлено.");
  const source = { outbox, store: createPersonalPhotoActionStore({ ...outbox.binding, getContext: personalSaveContext }), inventory: null };
  personalPhotoFormPreparing++; personalPhotoRecoverySource = source;
  let commit;
  try {
    commit = await (serverCopy ? preparePersonalServerImport : preparePersonalPublicImport)({ selection, selectionStore: (serverCopy ? personalServerSelectionStore : personalPublicSelectionStore)(outbox.binding), outbox, store: source.store,
      getContext: personalSaveContext, getState: () => state, getRevision: () => Number(syncMeta.stateRevision), makeSnapshot: personalPublicCopySnapshot,
      loadFile: serverCopy ? loadPersonalServerCopyFile : loadPersonalPublicCopyFile,
      onCaptured(saved) {
        personalSaveRecovery.assertRunning(); replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
        if (serverCopy) leaveSharedLinkAfterPersonalCopy();
        personalPhotoFormLiveSource = source; personalPhotoRecoverySource = source; personalPublicPickerSource = null;
        rememberActiveLayoutChoice(targetLayoutId); syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
        refs.containerPickerDialog.close(); if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
        if (catalog && refs.dialog.open) refs.dialog.close();
        switchView(catalog ? "items" : "packing"); renderPreservingPackingScroll();
        updateSyncUi("Выбранная копия сохранена на устройстве и ждёт подтверждения сервера.");
      }
    });
    await commit();
  } catch (error) {
    await (serverCopy ? retainPersonalServerPreparationForRecovery : retainPersonalPublicPreparationForRecovery)(source);
    reportPersonalPhotoFormError(error, { recovery: error.serverImportRecovery || error.publicImportRecovery || commit?.recoveryCopy() }); throw error;
  }
  finally { personalPhotoFormPreparing--; }
  scheduleRemoteSave(); return { layoutId: targetLayoutId, operationId: selection.operationId, copiedItemId: catalog ? selection.ownerTargets[0].targetId : "" };
}

async function runCausalPublicLayoutCopy(layout, progress) {
  if (!personalSavePilotEnabled() || !currentUser || canOpenAdminPublishedEdit()) return null;
  const serverCopy = Boolean(layout.linkedSharedList);
  if (serverCopy ? !PERSONAL_SERVER_IMPORT_ENABLED : !PERSONAL_PUBLIC_IMPORT_ENABLED) throw Error(serverCopy ? "Копирование списка по ссылке через очередь ещё не включено." : "Копирование публичных шаблонов через очередь ещё не включено.");
  personalSaveRecovery.assertRunning();
  if (hasPendingPersonalSave() || syncMeta.dirty) throw Error("Сначала нужно подтвердить текущие личные изменения.");
  const target = personalPublicSourceTarget(layout);
  const actorId = String(currentUser.id);
  progress.update(15, "shared.copyStageLoadingPersonal");
  await ensurePrivateStateForSharedCopy();
  if (String(currentUser?.id) !== actorId) throw Error("Аккаунт изменился. Копирование остановлено.");
  setActivePrivateScope();
  if (!personalPhotoFormUiEnabled()) throw Error("Личная очередь копирования ещё недоступна.");
  const outbox = personalSaveOutboxForScope(), initial = clone(personalSaveContext());
  if (!outbox || outbox.hasPending() || syncMeta.dirty || !outbox.confirmedBase()) throw Error("Личный список ещё не подтверждён.");
  if (personalGuestBaseNeedsPreparation(outbox.confirmedBase().payload, personalBusinessPayload(state))) {
    capturePersonalSaveIntent(state); syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
    await queuedPersonalSave();
    if (outbox.hasPending() || !sameJson(initial, personalSaveContext())) throw Error("Подготовка личного списка ещё не подтверждена.");
  }
  progress.update(30, "shared.copyStageLoading");
  // Read a fresh complete API record. Display metadata/offline previews cannot
  // establish a source version for a private causal copy.
  const { sourcePayload, sourceLayout, source: selectedSource } = await readPersonalRemoteCopySource(target);
  if (!sameJson(initial, personalSaveContext())) throw Error("Редактор изменился. Копирование остановлено.");
  const selection = (serverCopy ? preparePersonalServerImportSelection : preparePersonalPublicImportSelection)({ binding: outbox.binding,
    basePayload: personalBusinessPayload(state), baseStateRevision: Number(syncMeta.stateRevision), sourcePayload, layoutIds: [sourceLayout.id],
    layoutNames: [uniqueLayoutName(sourceLayout.name || layout.name)], editMeta: currentCreateMeta(), source: selectedSource });
  const previous = clone(state), revision = Number(syncMeta.stateRevision);
  const repeated = findCopiedSharedLayout(layout, sourceLayout);
  if (!(await confirmRepeatedSharedLayoutCopy(repeated, sourceLayout.name || layout.name))) return { cancelled: true };
  if (!sameJson(initial, personalSaveContext()) || !sameJson(previous, state) || revision !== Number(syncMeta.stateRevision)) {
    throw Error("Личный список изменился во время подтверждения. Копирование остановлено.");
  }
  const source = { outbox, store: createPersonalPhotoActionStore({ ...outbox.binding, getContext: personalSaveContext }), inventory: null };
  personalPhotoFormPreparing++; personalPhotoRecoverySource = source;
  let commit;
  try {
    progress.update(45, "shared.copyStageEntities");
    commit = await (serverCopy ? preparePersonalServerImport : preparePersonalPublicImport)({ selection, selectionStore: (serverCopy ? personalServerSelectionStore : personalPublicSelectionStore)(outbox.binding), outbox, store: source.store,
      getContext: personalSaveContext, getState: () => state, getRevision: () => Number(syncMeta.stateRevision), makeSnapshot: personalPublicCopySnapshot,
      loadFile: serverCopy ? loadPersonalServerCopyFile : loadPersonalPublicCopyFile,
      onCaptured(saved) {
        personalSaveRecovery.assertRunning();
        replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
        if (serverCopy) leaveSharedLinkAfterPersonalCopy();
        personalPhotoFormLiveSource = source; personalPhotoRecoverySource = source;
        rememberActiveLayoutChoice(saved.snapshot.activeLayoutId);
        syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
        if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
        switchView("packing"); renderPreservingPackingScroll();
        updateSyncUi("Личная копия сохранена на устройстве и ждёт подтверждения сервера.");
      }
    });
    await commit();
  } catch (error) {
    await (serverCopy ? retainPersonalServerPreparationForRecovery : retainPersonalPublicPreparationForRecovery)(source);
    reportPersonalPhotoFormError(error, { recovery: error.serverImportRecovery || error.publicImportRecovery || commit?.recoveryCopy() }); throw error;
  } finally { personalPhotoFormPreparing--; }
  scheduleRemoteSave();
  return { layoutId: selection.layoutTargets[0].targetId };
}

async function completePersonalGuestImportSelections(source) {
  if (!source?.outbox || source.outbox.hasPending()) return;
  const outbox = source.outbox, references = outbox.photoRecoveryReferences(), boundary = outbox.confirmedBoundary();
  if (!boundary) return;
  const store = personalGuestSelectionStore(outbox.binding), entries = await store.entries();
  for (const entry of entries) {
    if (entry.completion || !entry.intent) continue;
    const proof = references.photoReceipts.find(proof => proof.operation.id === entry.selection.operationId && proof.operation.state === "committed");
    if (!proof || boundary.stateRevision < proof.stateRevision) continue;
    const body = await personalGuestSelectionBody(entry.selection, entry.intent);
    await store.confirm({ selection: entry.selection, proof,
      action: { ...outbox.binding, kind: "list.import", operationId: entry.selection.operationId, body } });
  }
}

function currentGuestLoginHandoff() {
  const text = localStorage.getItem(GUEST_LOGIN_HANDOFF_KEY);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { throw Error("Сохранённый гостевой вход повреждён. Исходная работа сохранена."); }
}

async function storedPersonalGuestImportEntry() {
  if (!experimentTransport.experiment || !currentUser || !currentPackingListId || localStorageScopeKey !== `id:${currentUser.id}`
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  const binding = { environment: "bike-packing-experiment", actorId: String(currentUser.id), listId: currentPackingListId, scopeKey: localStorageScopeKey };
  const handoff = currentGuestLoginHandoff(); if (!handoff) return null;
  // Run this reader even after a writer rollback. A completed selection must
  // never reach the legacy import merely because its release gate is now off.
  try { return (await personalGuestSelectionStore(binding).entries()).find(entry => sameJson(entry.selection.handoff, handoff)) || null; }
  catch (error) {
    personalPhotoRecoverySource ||= { outbox: null, store: createPersonalPhotoActionStore({ ...binding, getContext: personalPhotoRecoveryReadContext }), inventory: null };
    reportPersonalPhotoFormError(error, { recovery: { request: { binding }, files: [], automaticImportAllowed: false } });
    throw error;
  }
}

async function runCausalGuestLoginImport(candidate, selected = null) {
  if (!PERSONAL_GUEST_IMPORT_ENABLED || !personalPhotoFormUiEnabled()) throw Error("Гостевой перенос через очередь ещё не включён. Исходная работа сохранена.");
  personalSaveRecovery.assertRunning();
  const outbox = personalSaveOutboxForScope();
  if (!outbox || outbox.hasPending() || syncMeta.dirty) throw Error("Сначала нужно подтвердить личный список. Гостевая работа сохранена.");
  candidate = clone(candidate);
  const handoff = clone(currentGuestLoginHandoff()), initialBinding = outbox.binding;
  const baseline = outbox.confirmedBase();
  if (!baseline) throw Error("Не подтверждена исходная личная версия. Гостевая работа сохранена.");
  if (!selected && personalGuestBaseNeedsPreparation(baseline.payload, personalBusinessPayload(state))) {
    capturePersonalSaveIntent(state); syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
    await queuedPersonalSave();
    if (outbox.hasPending() || Object.keys(initialBinding).some(key => personalSaveContext()[key] !== initialBinding[key])
      || !sameJson(handoff, currentGuestLoginHandoff())) throw Error("Подготовка личного списка ещё не подтверждена. Гостевой перенос сохранён.");
  }
  const getContext = personalSaveContext, selectionStore = personalGuestSelectionStore(outbox.binding);
  const names = Object.values(state.layouts).map(layout => layout.name);
  const layoutNames = candidate.layouts.map(entry => {
    const name = uniqueName(readableGuestDemoLayoutName(candidate.sourceState.layouts[entry.layoutId]?.name || entry.layoutName,
      entry.fallbackName || GUEST_LAYOUT_FALLBACK_NAME), names, { fallback: GUEST_LAYOUT_FALLBACK_NAME });
    names.push(name); return name;
  });
  const selection = selected || preparePersonalGuestImportSelection({ binding: outbox.binding, user: currentUser, handoff,
    candidate, basePayload: personalBusinessPayload(state), baseStateRevision: Number(syncMeta.stateRevision), layoutNames, editMeta: currentCreateMeta() });
  const source = { outbox, store: createPersonalPhotoActionStore({ ...outbox.binding, getContext }), inventory: null };
  personalPhotoFormPreparing++; personalPhotoRecoverySource = source;
  let commit;
  try {
    commit = await preparePersonalGuestImport({ selection, selectionStore, outbox, store: source.store, getContext,
      getHandoff: currentGuestLoginHandoff, getState: () => state, getRevision: () => Number(syncMeta.stateRevision),
      loadFile: input => loadPersonalGuestImportPhoto(input, { getCachedPhoto, fetchPhoto: transportPhotoFetch, guestScope: GUEST_STORAGE_SCOPE }),
      makeSnapshot(payload, previous, activeLayoutId, preferences) {
        const snapshot = normalizeRemoteState({ ...payload, activeLayoutId }, { repairCatalog: false });
        if (!snapshot) throw Error("Не удалось прочитать подготовленную гостевую работу.");
        applyLayoutArrangement(activeLayoutId, snapshot);
        const result = personalSnapshotWithUiPreferences(snapshot, JSON.stringify(previous));
        applyGuestLocalDisplayPreferences(result, preferences); return result;
      },
      onCaptured(saved) {
        personalSaveRecovery.assertRunning();
        replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
        personalPhotoFormLiveSource = source; personalPhotoRecoverySource = source;
        rememberActiveLayoutChoice(saved.snapshot.activeLayoutId);
        syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
        renderPreservingPackingScroll(); updateSyncUi("Гостевая работа сохранена на устройстве и ждёт подтверждения сервера.");
      }
    });
    await commit();
  } catch (error) {
    reportPersonalPhotoFormError(error, { recovery: error.guestImportRecovery || commit?.recoveryCopy() }); throw error;
  } finally { personalPhotoFormPreparing--; }
  scheduleRemoteSave();
  return { handled: true, status: "pending-save", importedLayoutIds: selection.layoutTargets.map(target => target.targetId) };
}

async function runGuestLoginHandoffCandidate(candidate) {
  if (personalSavePilotEnabled()) return runCausalGuestLoginImport(candidate);
  updateSyncUi(localText(
    "Personal layouts loaded · importing the guest work from this sign-in...",
    "Личные укладки загружены · переношу гостевую работу из этого входа..."
  ));
  return runGuestLoginHandoffImport(candidate, {
    importLayouts: (confirmedCandidate) => importGuestLocalLayouts(confirmedCandidate, { renameConflicts: true }),
    consumeHandoff: clearGuestLoginHandoff,
    persistImportBeforeCleanup: persistGuestImportBeforeCleanup,
    persistImport: saveGuestImportToRemote,
    clearGuestStorage: () => clearLocalStorageScope(GUEST_STORAGE_SCOPE, [
      STORAGE_KEY,
      BASE_STATE_KEY,
      SYNC_META_KEY,
      RECOVERY_STATE_KEY,
      ACTIVE_LIST_ID_KEY,
      ACTIVE_LAYOUT_CHOICE_KEY,
      ACTIVE_LAYOUT_CHOICE_SOURCE_KEY,
      ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
      GUEST_WORKSPACE_MANIFEST_KEY
    ]),
    onImportEmpty: () => updateSyncUi(localText(
      "The prepared guest work no longer contains data to import",
      "В подготовленной гостевой работе больше нет данных для переноса"
    )),
    onImported: (importedLayoutIds) => {
      renderPreservingPackingScroll();
      updateSyncUi(importedLayoutIds.length > 1
        ? localText("Guest layouts added to the account · saving to the server...", "Гостевые укладки добавлены в аккаунт · сохраняю на сервер...")
        : localText("Guest layout added to the account · saving to the server...", "Гостевая укладка добавлена в аккаунт · сохраняю на сервер..."));
    },
    onImportPending: () => {
      updateSyncUi(localText(
        "Guest work was imported into the account · it will be saved automatically during the next check",
        "Гостевая работа перенесена в аккаунт · сохраню её автоматически при следующей проверке"
      ));
      showToast(localText(
        "Guest work was imported into the account. The local version is safe; sync will retry automatically.",
        "Гостевая работа перенесена в аккаунт. Локальная версия не потеряна, синхронизация повторится автоматически."
      ), "warning");
      scheduleRemoteSave();
    },
    onImportSucceeded: (importedLayoutIds) => {
      showToast(importedLayoutIds.length > 1
        ? localText("Guest layouts were saved to the account.", "Гостевые укладки сохранены в аккаунт.")
        : localText("Guest layout was saved to the account.", "Гостевая укладка сохранена в аккаунт."), "success");
    }
  });
}

async function offerPendingGuestLoginHandoffAfterRemoteLoad() {
  const stored = await storedPersonalGuestImportEntry();
  if (stored) {
    if (stored.completion) return true;
    const outbox = personalSaveOutboxForScope();
    const proof = outbox?.photoRecoveryReferences().photoReceipts.find(proof => proof.operation.id === stored.selection.operationId);
    if (proof?.operation.state === "rejected") {
      updateSyncUi("Гостевой перенос не применён. Исходная работа и подтверждение отмены сохранены."); return true;
    }
    if (outbox?.hasPending()) return true;
    await runCausalGuestLoginImport(stored.selection.candidate, stored.selection); return true;
  }
  const handoffResult = await guestLoginHandoffCoordinator.offer();
  if (handoffResult.handled) {
    return Boolean(handoffResult.importedLayoutIds?.length);
  }
  const seedResult = await newAccountDemoSeedCoordinator.offer();
  return Boolean(seedResult.layoutId);
}

function importGuestLocalLayouts(candidate, { renameConflicts = true } = {}) {
  return importGuestLocalLayoutsToState(state, candidate, {
    addBackupDictionaryValues,
    applyGuestLocalDisplayPreferences,
    applyLayoutArrangement,
    cloneValue: clone,
    copyPublishedContainerToState,
    copyPublishedItemToState,
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

async function handleInitialListMigrationRequired(error) {
  if (!PERSONAL_LIST_MIGRATION_ENABLED || !personalSavePilotEnabled() || error?.data?.code !== "causal_read_migration_required"
    || !currentPackingListId || !currentUser || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return false;
  // A failed read never starts a mutation. The candidate is SELECT-only and
  // requires a fresh, explicit decision before entering the durable outbox.
  try {
    personalSaveRecovery.assertRunning();
    const outbox = personalSaveOutboxForScope(), listId = currentPackingListId;
    const confirm = await preparePersonalListMigration({ outbox,
      getContext: () => { personalSaveRecovery.assertRunning(); return personalSaveContext(); },
      getState: () => state,
      hasLocalChanges: () => Boolean(syncMeta.dirty || isForeignLocalSyncState()),
      readPreview: () => apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/migration`, {
        timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true
      }),
      makeSnapshot: personalReconciledSnapshot,
      onCaptured(saved) {
        replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
        syncMeta.stateRevision = saved.action.body.baseStateRevision;
        syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso();
        persistStateSnapshot(state, { recordAction: false });
        saveSyncMeta();
        appUnlocked = true; initialRemoteLoadPending = false;
        renderPreservingPackingScroll();
        updateSyncUi("Подготовка списка сохранена на устройстве и ждёт подтверждения сервера.");
      }
    });
    const approved = await askConfirmDialog({
      title: localText("Prepare the saved list", "Подготовить сохранённый список"),
      text: localText(
        "This list uses the older storage format. Prepare its existing server data for confirmed saves? This does not upload local edits or add another list. If the source changed, preparation will stop. Nothing is changed until you confirm.",
        "Этот список сохранён в прежнем формате. Подготовить уже имеющиеся серверные данные к сохранению с подтверждениями? Локальные правки не отправляются, второй список не создаётся. Если источник изменился, подготовка остановится. До вашего согласия ничего не меняется."),
      okText: localText("Prepare list", "Подготовить список"), cancelText: localText("Later", "Позже")
    });
    if (approved !== true) {
      setLayoutLoadStatus("warning", "Подготовка списка отложена. Данные не изменены; повторить можно после обновления страницы.");
      updateSyncUi("Старый список ждёт подготовки. Серверные данные не изменены.");
      return true;
    }
    confirm();
    await saveRemoteState({ notify: true });
  } catch (failure) {
    setLayoutLoadStatus("error", `Подготовка списка остановлена: ${failure.message}`);
    updateSyncUi(failure.message);
  }
  return true;
}

async function loadRemoteState(options = {}) {
  await checkPersonalPhotoRecoveryBeforeLoad();
  if (remoteStateLoadPromise) return remoteStateLoadPromise;
  remoteStateLoadPromise = loadRemoteStateFlow({
    runtime: {
      get appUnlocked() { return appUnlocked; },
      set appUnlocked(value) { appUnlocked = value; },
      get currentUser() { return currentUser; },
      get initialRemoteLoadPending() { return initialRemoteLoadPending; },
      set initialRemoteLoadPending(value) { initialRemoteLoadPending = value; },
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
      createEmptyUserState,
      canUseCachedStartupState,
      currentPackingListId: () => currentPackingListId || remoteRecordId(currentPackingListMeta),
      fetchRemoteListFreshnessRecord,
      fetchRemoteStateRecord,
      handleInitialListMigrationRequired,
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
      layoutItemQuantityMigrationRecovered,
      localText,
      loadBaseState,
      mergeStateFromBase,
      normalizeRemoteState,
      nowIso,
      offerPendingGuestLoginHandoffAfterRemoteLoad,
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
      showToast,
      stateIntegrityMetaFromResponse,
      statePrivateLayoutCount,
      shouldSeedNewAccountDemoLayout,
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
      showToast(localText("Latest server changes loaded.", "Подтянуты свежие изменения с сервера."), "success");
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
    showToast(localText("Only an administrator can edit the demo.", "Демо может редактировать только админ."), "error");
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
  if (adminTemplateUiEnabled()) return openCausalAdminTemplate({ type: "demo", demoListId, language: normalizedLanguage }, { remember });
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
      showToast(localText("The empty local demo layout was rebuilt.", "Пустая локальная демо-укладка пересобрана."), "success");
      return;
    }
    activateAdminPublishedLayout(existing.id, { remember: false });
    if (remember) rememberActiveLayoutChoice(layoutChoice);
    showToast(localText("Local demo layout opened for editing.", "Открыта локальная демо-укладка для правки."), "success");
    return;
  }
  try {
    updateSyncUi(localText("Loading the demo layout for editing...", "Загружаю демо-укладку для правки..."));
    const demoState = await defaultDemoState(normalizedLanguage, demoListId);
    importDemoStateAsEditableLayout(demoState, { language: normalizedLanguage, listId: demoListId });
    activateAdminPublishedLayout(state.activeLayoutId, { remember: false });
    if (remember) rememberActiveLayoutChoice(layoutChoice);
    updateSyncUi();
    showToast(localText("The demo layout was added as a regular layout. Edit it and publish it from the menu.", "Демо-укладка добавлена как обычная укладка. Правьте её и опубликуйте из меню."), "success");
  } catch (error) {
    updateSyncUi();
    showToast(localText(`Could not open the demo: ${error.message}`, `Не удалось открыть демо: ${error.message}`), "error");
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
  const useReadonlyCache = shouldUseReadonlyTemplateCache({
    allowOfflineCache,
    templatesBlocked: arePublishedTemplatesBlocked()
  });
  if (!useReadonlyCache && !requirePublishedTemplatesAvailable()) {
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
    if (useReadonlyCache) {
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
      cancelText: localText("Cancel", "Отмена"),
      hideClose: true,
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
    cancelText: localText("Cancel", "Отмена"),
    hideClose: true,
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

function importDemoStateAsEditableLayout(demoState, { language = uiLanguage, listId = "", activate = true, renderAfter = true, preserveCatalog = false, recordAction = true } = {}) {
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
    preserveCatalog,
    saveState: options => saveState({ ...options, recordAction }),
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
function adminTemplateUiEnabled() {
  return ADMIN_TEMPLATE_OPERATIONS_ENABLED && experimentTransport.experiment;
}

let administrativeSaveCoordinator = null;
const administrativeObjectIds = new WeakMap();
let administrativeObjectCounter = 0;
function administrativeObjectId(value) {
  if (!value || typeof value !== "object") return "none";
  if (!administrativeObjectIds.has(value)) administrativeObjectIds.set(value, ++administrativeObjectCounter);
  return administrativeObjectIds.get(value);
}
function adminTemplateBinding(target) {
  const listId = publicListIdForPublishedTarget(target);
  const itemKey = target.type === "demo"
    ? listId === "public-demo-state" ? "demo-state" : "demo-state:" + listId.slice("public-demo-state-".length)
    : "shared-layout:" + listId.slice("public-shared-layout-".length);
  return { actorId: String(currentUser?.id || ""), environment: "bike-packing-experiment", listId, itemKey };
}
function adminTemplateOperationContext(binding, layoutId = "", preparing = false) {
  return { ...binding, actorId: String(currentUser?.id || ""), scope: "admin-template",
    admin: canOpenAdminPublishedEdit() && (preparing || isAdminPublicEditScope(modeState) && getPublishedEditLayoutId() === layoutId),
    generation: JSON.stringify([administrativeObjectId(currentUser), administrativeObjectId(state), currentViewScope(), state.activeLayoutId,
      modeState.adminPublishedEditLayoutId || "", location.pathname, location.search, location.hash]) };
}
function adminTemplateClient(binding, layoutId = "", preparing = false) {
  return createAdminTemplateClient({ binding, transport: experimentTransport, enabled: adminTemplateUiEnabled(),
    getContext: () => adminTemplateOperationContext(binding, layoutId, preparing) });
}
function reportAdminTemplateSaveError(error) {
  updateSyncUi(`Сохранение шаблона приостановлено: ${error.message}`);
}
function newCausalAdminTemplateDraft(layout, kind) {
  if (!adminTemplateUiEnabled() || !canOpenAdminPublishedEdit()) throw Error("Создание шаблонов доступно администратору.");
  return initializeNewAdminTemplateDraft(layout, { actorId: String(currentUser?.id || ""), kind });
}
function persistNewCausalAdminTemplateDraft(layout) {
  if (!adminTemplateUiEnabled() || !canOpenAdminPublishedEdit() || state.layouts?.[layout.id] !== layout
    || layout.adminCausalSource?.binding?.actorId !== String(currentUser?.id || "")) throw Error("Контекст создания шаблона изменился.");
  // This mirror is mandatory for discovering the new target after reload, even
  // before its save-plan capture. Do not evict another journal to make room.
  const key = scopedLocalStorageKey(STORAGE_KEY), encoded = JSON.stringify(state);
  localStorage.setItem(key, encoded);
  if (localStorage.getItem(key) !== encoded) throw Error("Не удалось сохранить новый черновик на устройстве.");
}
async function resumeCausalAdminTemplateCopy(layout) {
  const pending = layout.adminCausalCopyPlan;
  if (!pending) return;
  const original = layout.adminCausalSource, binding = original?.binding, wasPending = layout.templateDraftSyncPending;
  const catalog = [1, 4].includes(pending.version), sourceChecked = pending.version === 4, operation = pending.operations?.[0];
  const pendingCatalog = catalog && Boolean(original?.planId && original.base?.operationId);
  if (!binding || original.planId && !pendingCatalog || canonicalTemplateJson(binding) !== canonicalTemplateJson(pending.binding)
    || (catalog ? !original.exists || original.deleted || !original.base?.stateRevision && !pendingCatalog || operation?.kind !== "template.save"
      || canonicalTemplateJson(original.base) !== canonicalTemplateJson(operation.body.base)
      : layout.id !== "layout-" + pending.id || original.exists || original.base !== null)) throw Error("Подготовленная копия требует сверки.");
  const input = sourceChecked ? { binding, operationId: pending.id, body: operation.body, sourceSnapshot: pending.sourceSnapshot }
    : catalog ? { binding, operationId: pending.id, exists: true, visibility: original.visibility,
    base: operation.body.base, payload: operation.body.payload, metadata: operation.body.metadata }
    : { binding, operationId: pending.id, body: operation?.body, sourceSnapshot: pending.sourceSnapshot, editorSnapshot: pending.editorSnapshot };
  const expected = sourceChecked ? adminTemplateSourceSavePlan(input) : catalog ? adminTemplateSavePlan(input) : adminTemplateCopyPlan(input);
  if (canonicalTemplateJson(expected) !== canonicalTemplateJson(pending)) throw Error("Сохранённая подготовка копии повреждена.");
  const initial = canonicalTemplateJson(adminTemplateOperationContext(binding, layout.id));
  const plans = adminTemplatePlansFor(binding, layout.id);
  if (pendingCatalog) {
    const parent = await plans.read(original.planId);
    if (parent?.cancelRequested !== false || parent.plan.operations.at(-1).id !== original.base.operationId) throw Error("Исходное действие копии требует сверки.");
    await adminTemplateRecoveryFor(binding, layout.id).assertCanAppend(original.planId);
    if (state.layouts[layout.id] !== layout || layout.adminCausalSource !== original || layout.adminCausalCopyPlan !== pending
      || canonicalTemplateJson(adminTemplateOperationContext(binding, layout.id)) !== initial) throw Error("Контекст копирования изменился.");
  }
  if (sourceChecked) await plans.captureSourceSave(input); else if (catalog) await plans.capture(input); else await plans.captureCopy(input);
  if (pendingCatalog) await adminTemplateSaveCoordinator().releasePredecessorCapture(layout.id, original.planId);
  if (state.layouts[layout.id] !== layout || layout.adminCausalSource !== original || layout.adminCausalCopyPlan !== pending
    || canonicalTemplateJson(adminTemplateOperationContext(binding, layout.id)) !== initial) throw Error("Контекст копирования изменился.");
  layout.adminCausalSource = { ...original, exists: true, visibility: catalog ? original.visibility : "private", base: { operationId: pending.id }, planId: pending.id };
  delete layout.adminCausalCopyPlan; layout.templateDraftSyncPending = true;
  if (persistStateSnapshot(state, { recordAction: false }) === false) {
    layout.adminCausalSource = original; layout.adminCausalCopyPlan = pending;
    if (wasPending === undefined) delete layout.templateDraftSyncPending; else layout.templateDraftSyncPending = wasPending;
    throw Error("Копия сохранена и ожидает восстановления редактора.");
  }
}
function prepareCausalAdminCatalogCopy(type, sourceIds, { keepPlacement = false, addToLayoutId = "", targetContainerId = "" } = {}) {
  let layout, original, snapshot, initial, prepared, operationId, changedAt, pendingSource = false;
  sourceIds = [...sourceIds];
  const collection = type === "item" ? "items" : "containers", coordinator = adminTemplateSaveCoordinator();
  const fail = message => { throw Error(message); };
  const guard = () => {
    if (!canOpenAdminPublishedEdit() || state.layouts[layout.id] !== layout
      || !pendingSource && (coordinator.hasPendingCapture(layout.id) || layout.templateDraftSyncPending)
      || layout.adminCausalCopyPlan
      || canonicalTemplateJson(layout.adminCausalSource) !== canonicalTemplateJson(original)
      || canonicalTemplateJson(adminTemplateOperationContext(original.binding, layout.id)) !== initial
      || canonicalTemplateJson(adminTemplateEditorSnapshot(layout.id)) !== snapshot) fail("Шаблон изменился. Выберите записи для копирования заново.");
  };
  try {
    layout = state.layouts[getPublishedEditLayoutId()]; original = clone(layout?.adminCausalSource || null);
    pendingSource = Boolean(original?.planId && original.base?.operationId);
    if (!layout || !original?.exists || original.deleted || !pendingSource && (original.planId || !original.base?.stateRevision
      || layout.templateDraftSyncPending || coordinator.hasPendingCapture(layout.id)) || layout.adminCausalCopyPlan) fail("Сначала дождитесь подтверждения исходного шаблона.");
    if (keepPlacement || addToLayoutId && !targetContainerId) fail("Этот способ размещения копии ещё требует отдельной подготовки. Исходные записи сохранены.");
    if (targetContainerId && (type !== "item" || addToLayoutId !== layout.id || layout.locked
      || state.containers[targetContainerId]?.publicCatalogLayoutId !== layout.id
      || !layout.arrangement?.containers?.[targetContainerId])) fail("Выберите сумку в открытом шаблоне. Между разными шаблонами копирование ещё не подготовлено.");
    if (!["item", "container"].includes(type) || !sourceIds.length
      || sourceIds.some(id => state[collection]?.[id]?.publicCatalogLayoutId !== layout.id)) fail("Источник копии не принадлежит открытому шаблону.");
    if (!requireUsageCapacity(collection, sourceIds.length)) return false;
    initial = canonicalTemplateJson(adminTemplateOperationContext(original.binding, layout.id));
    snapshot = canonicalTemplateJson(adminTemplateEditorSnapshot(layout.id)); guard();
    operationId = crypto.randomUUID(); changedAt = nowIso();
    // A placed item's quantity belongs to the arrangement. Its catalog record
    // is normalized to one; detached catalog quantities remain independent.
    const copySource = { ...state, items: { ...state.items } };
    if (type === "item") for (const id of sourceIds) copySource.items[id] = { ...state.items[id],
      quantity: Object.hasOwn(layout.arrangement?.items || {}, id) ? 1 : normalizeItemQuantity(state.items[id].quantity) };
    prepared = preparePersonalCopyBatch(copySource, { type: "copy", version: 1, keepPlacement: false, layoutId: "",
      entries: sourceIds.map(sourceId => ({ type, sourceId, targetId: `${type}-${crypto.randomUUID()}` })) },
      { changedAt, currentEditMeta, normalizeContainerColor, markEdited,
        hasPhotos: row => normalizeItemPhotos(row).length > 0 });
    if (targetContainerId) for (const entry of prepared.intent.entries) {
      if (!addItemToLayoutArrangementForState(prepared.snapshot, prepared.snapshot.layouts[layout.id], entry.targetId, targetContainerId)) {
        fail("Не удалось подготовить место копии.");
      }
      prepared.snapshot.items[entry.targetId].containerId = targetContainerId;
    }
  } catch (error) { reportAdminTemplateSaveError(error); return false; }
  let used = false;
  return async () => {
    const added = prepared.intent.entries.map(entry => entry.targetId), wasPending = layout.templateDraftSyncPending;
    const priorLayout = { ...layout }, priorContainer = targetContainerId ? { ...state.containers[targetContainerId] } : null;
    try {
      if (used) return false; guard();
      if (!requireUsageCapacity(collection, sourceIds.length)) return false;
      if (pendingSource) {
        const plans = adminTemplatePlansFor(original.binding, layout.id);
        await adminTemplateRecoveryFor(original.binding, layout.id).assertCanAppend(original.planId); guard();
        const saved = await plans.read(original.planId); guard();
        const records = saved?.plan.version === 2 ? await plans.list() : []; guard();
        const baseline = saved?.plan.version === 2 ? await adminTemplateSourceBaseline(original.binding, layout.id).read() : null; guard();
        const receipts = saved?.plan.version === 2 ? await adminTemplateClient(original.binding, layout.id, true).list() : []; guard();
        const observed = JSON.parse(snapshot); observed.payload = stripAdminTemplateEditorMetadata(observed.payload);
        await pendingAdminTemplateCopySource(original, saved, observed, records, { baseline, receipts }); guard();
      }
      if (added.some(id => state.items[id] || state.containers[id] || state.layouts[id])) fail("Идентификатор копии уже занят.");
      used = true;
      for (const id of added) state[collection][id] = { ...cloneIsolatedPublicEntity(prepared.snapshot[collection][id]),
        publicCatalogLayoutId: layout.id, adminDemo: Boolean(layout.adminDemo) };
      try {
        if (targetContainerId) {
          layout.arrangement = clone(prepared.snapshot.layouts[layout.id].arrangement);
          const placement = layout.arrangement.containers[targetContainerId];
          Object.assign(state.containers[targetContainerId], { itemIds: [...placement.itemIds], order: clone(placement.order) });
          markEdited(layout, changedAt);
        }
        const candidate = adminTemplateEditorSnapshot(layout.id);
        layout.adminCausalCopyPlan = adminTemplateSavePlan({ binding: original.binding, operationId, exists: true,
          visibility: original.visibility, base: original.base, payload: stripAdminTemplateEditorMetadata(candidate.payload), metadata: candidate.metadata });
        layout.templateDraftSyncPending = true;
        persistNewCausalAdminTemplateDraft(layout);
      } catch (error) {
        for (const id of added) delete state[collection][id]; delete layout.adminCausalCopyPlan;
        if (targetContainerId) {
          for (const key of Object.keys(layout)) if (!Object.hasOwn(priorLayout, key)) delete layout[key];
          Object.assign(layout, priorLayout); Object.assign(state.containers[targetContainerId], priorContainer);
        }
        if (wasPending === undefined) delete layout.templateDraftSyncPending; else layout.templateDraftSyncPending = wasPending;
        throw error;
      }
      try { await resumeCausalAdminTemplateCopy(layout); await coordinator.flush(layout.id); }
      catch (error) { reportAdminTemplateSaveError(error); }
      return targetContainerId ? added[0] : true;
    } catch (error) { reportAdminTemplateSaveError(error); return false; }
  };
}
async function prepareCausalAdminToPersonalCopy(request) {
  request = clone(request);
  let sourceLayout, original, sourceSnapshot, privateInitial, privateSnapshot, outbox, selection, missingSelection, sourcePrepared, sourceId;
  const fail = (reason = "selection") => { throw Object.assign(Error("Шаблон или личный список изменился. Повторите выбор копии."), { adminCopyGuard: reason }); };
  const privateState = () => ({ ...serializeState({ forSync: true }), activeLayoutId: request.targetLayoutId });
  const coordinator = adminTemplateSaveCoordinator();
  const restoreSourceView = () => {
    if (!personalSaveRecovery.message() && original?.binding.actorId === String(currentUser?.id || "") && canOpenAdminPublishedEdit()
      && state.layouts[sourceLayout?.id] === sourceLayout && state.activeLayoutId === request.targetLayoutId) {
      activateAdminPublishedLayout(sourceLayout.id, { remember: false });
    }
  };
  const guard = (capturedId = "") => {
    const pending = outbox?.recover();
    const checks = { authority: !canOpenAdminPublishedEdit(), sourceObject: state.layouts[sourceLayout.id] !== sourceLayout,
      sourcePending: coordinator.hasPendingCapture(sourceLayout.id) || sourceLayout.templateDraftSyncPending || sourceLayout.adminCausalCopyPlan,
      sourceIdentity: canonicalTemplateJson(sourceLayout.adminCausalSource) !== canonicalTemplateJson(original),
      sourceSnapshot: canonicalTemplateJson(adminTemplateEditorSnapshot(sourceLayout.id)) !== sourceSnapshot,
      privatePending: capturedId ? pending?.action.operationId !== capturedId : hasPendingPersonalSave(),
      privateDirty: syncMeta.dirty, actor: original.binding.actorId !== String(currentUser?.id || ""),
      privateContext: privateInitial && canonicalTemplateJson(personalSaveContext()) !== privateInitial,
      privateSnapshot: privateInitial && canonicalTemplateJson(privateState()) !== privateSnapshot };
    const invalid = Object.keys(checks).filter(key => checks[key]); if (invalid.length) fail(invalid.join(","));
  };
  try {
    if (!PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED || !personalSavePilotEnabled() || !PERSONAL_PUBLIC_IMPORT_ENABLED || !PERSONAL_PUBLIC_ENTITY_COPY_ENABLED) {
      throw Error("Копирование административного шаблона в личный список через очередь ещё не включено.");
    }
    sourceLayout = state.layouts[request.sourceLayoutId]; original = clone(sourceLayout?.adminCausalSource || null);
    if (!original?.exists || original.planId || !original.base?.stateRevision || getPublishedEditLayoutId() !== sourceLayout.id
      || !state.layouts[request.targetLayoutId] || isAdminEditablePublishedLayout(request.targetLayoutId)) fail();
    const ids = { items: {}, containers: {} }, observed = adminTemplateEditorSnapshot(sourceLayout.id, {
      onMappedEntity: ({ type, sourceId, targetId }) => { ids[type][sourceId] = targetId; }
    });
    sourceSnapshot = canonicalTemplateJson(observed); guard();
    sourcePrepared = await adminTemplateClient(original.binding, sourceLayout.id, true).prepare(); guard();
    const verified = adminTemplateEditorSource(original.binding, sourcePrepared);
    if (!verified.exists || canonicalTemplateJson(verified.base) !== canonicalTemplateJson(original.base)
      || canonicalTemplateJson(personalBusinessPayload(stripAdminTemplateEditorMetadata(observed.payload))) !== canonicalTemplateJson(personalBusinessPayload(sourcePrepared.payload))) {
      throw Error("Шаблон отличается от подтверждённой серверной версии. Сначала сверьте его изменения.");
    }
    sourceId = request.type === "layout" ? Object.keys(sourcePrepared.payload.layouts)[0]
      : ids[request.type === "item" ? "items" : "containers"][request.sourceId || request.rootId];
    if (!sourceId) fail();
    const source = personalAdminTemplateImportSource({ kind: "admin-template", listId: original.binding.listId, itemKey: original.binding.itemKey,
      stateRevision: sourcePrepared.stateRevision, language: sourcePrepared.metadata.language, payloadDigest: await adminTemplateCopyPayloadDigest(sourcePrepared.payload) });
    // Keep the submitted creation form intact while preparing its private
    // context; rendering here would replace its template-source selector.
    guard(); switchActiveLayout(request.targetLayoutId, { remember: false, recordAction: false, renderAfter: request.type !== "layout" });
    if (!personalPhotoFormUiEnabled()) fail();
    personalSaveRecovery.assertRunning(); outbox = personalSaveOutboxForScope();
    if (!outbox || outbox.hasPending() || syncMeta.dirty || !outbox.confirmedBase()) fail();
    privateInitial = canonicalTemplateJson(personalSaveContext()); privateSnapshot = canonicalTemplateJson(privateState()); guard();
    const basePayload = personalBusinessPayload(privateState());
    if (personalGuestBaseNeedsPreparation(outbox.confirmedBase().payload, basePayload)) throw Error("Сначала подтвердите текущую личную укладку.");
    const input = { binding: outbox.binding, basePayload, baseStateRevision: Number(syncMeta.stateRevision), source, sourcePayload: sourcePrepared.payload, editMeta: currentCreateMeta() };
    const sourceLayoutId = Object.keys(sourcePrepared.payload.layouts)[0];
    selection = request.type === "layout" ? preparePersonalPublicImportSelection({ ...input,
      layoutIds: [sourceLayoutId], layoutNames: [uniqueLayoutName(request.requestedName)] })
      : preparePersonalPublicEntitySelection({ ...input, copy: { version: request.catalog ? 3 : 1, mode: request.catalog ? "catalog" : "independent", sourceLayoutId,
      entries: [{ entityType: request.type === "item" ? "item" : "container", sourceId, includeContents: request.includeContents === true }],
      destination: { layoutId: request.targetLayoutId, containerId: request.targetParentId || "", index: request.targetIndex ?? null } } });
    if (request.includeContents) {
      const preview = personalPublicMissingPreview({ currentPayload: basePayload, sourcePayload: sourcePrepared.payload, sourceLayoutId, sourceId, targetLayoutId: request.targetLayoutId });
      if (preview.canCopyMissingItems) missingSelection = preparePersonalPublicEntitySelection({ ...input, copy: preview.copy });
    }
    if ([selection, missingSelection].some(value => value?.photoTargets.length)) throw Error("Для этой копии требуется отдельный перенос фотографий. Исходный шаблон сохранён.");
    guard();
  } catch (error) { restoreSourceView(); reportAdminTemplateSaveError(error); return false; }
  let used = false;
  return Object.assign(async (mode = "copy") => {
    let source, commit;
    try {
      if (used) return false; guard();
      const chosen = mode === "copy" ? selection : mode === "missing" ? missingSelection : null;
      if (!chosen) return false;
      for (const [type, entityType] of [["items", "item"], ["containers", "container"]]) {
        const count = chosen.ownerTargets.filter(row => row.entityType === entityType).length;
        if (count && !requireUsageCapacity(type, count)) { restoreSourceView(); return false; }
      }
      used = true; source = { outbox, store: createPersonalPhotoActionStore({ ...outbox.binding, getContext: personalSaveContext }), inventory: null };
      personalPhotoFormPreparing++; personalPhotoRecoverySource = source;
      commit = await preparePersonalPublicImport({ selection: chosen, selectionStore: personalPublicSelectionStore(outbox.binding), outbox, store: source.store,
        getContext: personalSaveContext, getState: privateState, getRevision: () => Number(syncMeta.stateRevision),
        makeSnapshot: (payload, previous, activeLayoutId) => personalPublicCopySnapshot(payload, previous, activeLayoutId),
        loadFile: () => { throw Error("Для файлов нужен отдельный план."); },
        onCaptured(saved) {
          guard(chosen.operationId); personalSaveRecovery.assertRunning(); replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
          personalPhotoFormLiveSource = source; personalPhotoRecoverySource = source;
          rememberActiveLayoutChoice(chosen.layoutTargets?.[0]?.targetId || request.targetLayoutId); syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
          updateSyncUi("Личная копия шаблона сохранена и ждёт подтверждения сервера.");
        }
      });
      await commit(); scheduleRemoteSave();
      return chosen.layoutTargets?.[0]?.targetId || chosen.ownerTargets.find(row => row.sourceId === sourceId)?.targetId
        || request.targetParentId || state.layouts[request.targetLayoutId].rootContainerIds[0];
    } catch (error) {
      if (source) await retainPersonalPublicPreparationForRecovery(source);
      else restoreSourceView();
      reportPersonalPhotoFormError(error, { recovery: error.publicImportRecovery || commit?.recoveryCopy() }); return false;
    } finally { if (source) personalPhotoFormPreparing--; }
  }, { cancel() { if (!used) { used = true; restoreSourceView(); } },
    canLink: false, canMissing: Boolean(missingSelection), missingItemCount: missingSelection?.ownerTargets.length || 0 });
}
function adminTemplateSourceBaseline(binding, layoutId) {
  return createAdminTemplateSourceBaseline({ binding, layoutId, getContext: () => adminTemplateOperationContext(binding, layoutId, true) });
}
async function rememberAdminTemplateSourceBaseline(layout, prepared) {
  const snapshot = adminTemplateEditorSnapshot(layout.id); snapshot.payload = stripAdminTemplateEditorMetadata(snapshot.payload);
  return adminTemplateSourceBaseline(layout.adminCausalSource.binding, layout.id).capture(prepared, snapshot);
}

async function prepareCausalAdminPlacementCopy(request) {
  request = clone(request);
  let layout, original, snapshot, initial, prepared, copyPrepared, linked, missingPrepared, operationId, changedAt;
  let sourceLayout, sourceOriginal, sourceSnapshot, sourcePrepared, sourceProof, personalSource, personalInitial, planningState, pendingSource = false, pendingTarget = false;
  const privateSnapshot = () => canonicalTemplateJson(personalBusinessPayload(serializeState({ forSync: true })));
  const coordinator = adminTemplateSaveCoordinator();
  const guard = () => {
    if (!canOpenAdminPublishedEdit() || state.layouts[layout.id] !== layout
      || !pendingTarget && (coordinator.hasPendingCapture(layout.id) || layout.templateDraftSyncPending)
      || layout.adminCausalCopyPlan
      || canonicalTemplateJson(layout.adminCausalSource) !== canonicalTemplateJson(original)
      || canonicalTemplateJson(adminTemplateOperationContext(original.binding, layout.id, true)) !== initial
      || state.layouts[sourceLayout.id] !== sourceLayout
      || (personalSource ? hasPendingPersonalSave() || syncMeta.dirty || canonicalTemplateJson(personalSaveContext()) !== personalInitial || privateSnapshot() !== sourceSnapshot
        : sourceLayout.adminCausalCopyPlan || !pendingSource && (sourceLayout.templateDraftSyncPending || coordinator.hasPendingCapture(sourceLayout.id))
          || canonicalTemplateJson(sourceLayout.adminCausalSource) !== canonicalTemplateJson(sourceOriginal)
          || canonicalTemplateJson(adminTemplateEditorSnapshot(sourceLayout.id)) !== sourceSnapshot)
      || canonicalTemplateJson(adminTemplateEditorSnapshot(layout.id)) !== snapshot) throw Error(personalSource ? "Шаблон или исходный список изменился. Повторите действие." : "Шаблон изменился. Повторите действие.");
  };
  const capacity = () => ["items", "containers"].every(type => {
    const count = prepared.entries.filter(entry => entry.type === type).length;
    return !count || requireUsageCapacity(type, count);
  });
  const verifyPendingTarget = async () => {
    if (!pendingTarget) return;
    const plans = adminTemplatePlansFor(original.binding, layout.id, true);
    await adminTemplateRecoveryFor(original.binding, layout.id, true).assertCanAppend(original.planId); guard();
    const saved = await plans.read(original.planId); guard();
    const records = saved?.plan.version === 2 ? await plans.list() : []; guard();
    const baseline = saved?.plan.version === 2 ? await adminTemplateSourceBaseline(original.binding, layout.id).read() : null; guard();
    const receipts = saved?.plan.version === 2 ? await adminTemplateClient(original.binding, layout.id, true).list() : []; guard();
    const observed = JSON.parse(snapshot); observed.payload = stripAdminTemplateEditorMetadata(observed.payload);
    const captured = await pendingAdminTemplateCopySource(original, saved, observed, records, { baseline, receipts }); guard();
    if (saved.plan.version === 3 && (observed.payload.activeLayoutId !== captured.payload.activeLayoutId
      || ["items", "containers"].some(type => canonicalTemplateJson(Object.keys(observed.payload[type]).sort()) !== canonicalTemplateJson(Object.keys(captured.payload[type]).sort())))) {
      throw Error("Новая копия использует прежние идентификаторы редактора. Сначала подтвердите её создание и сверьте серверный вариант.");
    }
  };
  try {
    layout = state.layouts[request.targetLayoutId]; original = clone(layout?.adminCausalSource || null);
    sourceLayout = state.layouts[request.sourceLayoutId]; sourceOriginal = clone(sourceLayout?.adminCausalSource || null);
    personalSource = Boolean(sourceLayout && !isAdminEditablePublishedLayout(sourceLayout.id));
    pendingTarget = Boolean(original?.planId && original.base?.operationId);
    if (!layout || !original?.exists || original.deleted || !pendingTarget && (original.planId || !original.base?.stateRevision
      || layout.templateDraftSyncPending || coordinator.hasPendingCapture(layout.id)) || layout.adminCausalCopyPlan || !isAdminEditablePublishedLayout(layout.id)
      || original.binding.actorId !== String(currentUser?.id || "") || !sourceLayout) throw Error("Сначала дождитесь подтверждения целевого шаблона.");
    if (personalSource) {
      if (sourceOriginal || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState) || state.activeLayoutId !== sourceLayout.id
        || localStorageScopeKey !== `id:${currentUser.id}` || !currentPackingListId || hasPendingPersonalSave() || syncMeta.dirty
        || !Number.isSafeInteger(Number(syncMeta.stateRevision)) || Number(syncMeta.stateRevision) < 1
        || ![undefined, "item"].includes(request.type) || request.mode && request.mode !== "copy") throw Error("Сначала подтвердите исходную личную укладку.");
      personalInitial = canonicalTemplateJson(personalSaveContext()); sourceSnapshot = privateSnapshot();
    } else {
      pendingSource = Boolean(sourceOriginal?.planId && sourceOriginal.base?.operationId);
      if (!sourceOriginal?.exists || !pendingSource && (sourceOriginal.planId || !sourceOriginal.base?.stateRevision) || getPublishedEditLayoutId() !== sourceLayout.id
        || sourceOriginal.binding.actorId !== String(currentUser?.id || "")
        || sourceLayout !== layout && sourceOriginal.binding.listId === original.binding.listId) throw Error("Сначала дождитесь подтверждения исходного шаблона.");
      sourceSnapshot = canonicalTemplateJson(adminTemplateEditorSnapshot(sourceLayout.id));
    }
    initial = canonicalTemplateJson(adminTemplateOperationContext(original.binding, layout.id, true));
    snapshot = canonicalTemplateJson(adminTemplateEditorSnapshot(layout.id)); guard();
    await verifyPendingTarget();
    planningState = state;
    if (personalSource) {
      sourcePrepared = await apiFetch("/bike-packing/admin/template-operations/prepare", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ personalListId: currentPackingListId }), timeoutMs: LIST_API_TIMEOUT_MS }); guard();
      const digest = await adminTemplateCopyPayloadDigest(sourcePrepared.payload); guard();
      if (sourcePrepared.ok !== true || sourcePrepared.actorId !== String(currentUser.id) || sourcePrepared.environment !== "bike-packing-experiment"
        || sourcePrepared.listId !== currentPackingListId || sourcePrepared.stateRevision !== Number(syncMeta.stateRevision)
        || sourcePrepared.payloadDigest !== digest || canonicalTemplateJson(personalBusinessPayload(sourcePrepared.payload)) !== sourceSnapshot) {
        throw Error("Личная укладка отличается от подтверждённой серверной версии. Сначала сверьте список.");
      }
      sourceProof = { kind: "personal-list", listId: sourcePrepared.listId, base: { stateRevision: sourcePrepared.stateRevision }, payloadDigest: digest };
      planningState = clone(state);
      for (const type of ["items", "containers", "layouts"]) for (const [id, row] of Object.entries(sourcePrepared.payload[type])) {
        if (planningState[type][id] && (type === "layouts" ? isAdminEditablePublishedLayout(id) : hasPrivateSyncBlockedPublicOrigin(planningState[type][id], id))) {
          throw Error("Идентификаторы личного источника пересекаются с шаблоном.");
        }
        planningState[type][id] = clone(row);
      }
    } else if (pendingSource && sourceLayout !== layout) {
      const plans = adminTemplatePlansFor(sourceOriginal.binding, sourceLayout.id);
      const saved = await plans.read(sourceOriginal.planId); guard();
      const records = saved?.plan.version === 2 ? await plans.list() : []; guard();
      const baseline = saved?.plan.version === 2 ? await adminTemplateSourceBaseline(sourceOriginal.binding, sourceLayout.id).read() : null; guard();
      const receipts = saved?.plan.version === 2 ? await adminTemplateClient(sourceOriginal.binding, sourceLayout.id, true).list() : []; guard();
      const observed = JSON.parse(sourceSnapshot); observed.payload = stripAdminTemplateEditorMetadata(observed.payload);
      const captured = await pendingAdminTemplateCopySource(sourceOriginal, saved, observed, records, { baseline, receipts }); guard();
      sourcePrepared = { payload: captured.payload }; sourceProof = captured.source;
    } else if (sourceLayout !== layout) {
      sourcePrepared = await adminTemplateClient(sourceOriginal.binding, sourceLayout.id, true).prepare(); guard();
      const verified = adminTemplateEditorSource(sourceOriginal.binding, sourcePrepared);
      if (!verified.exists || canonicalTemplateJson(verified.base) !== canonicalTemplateJson(sourceOriginal.base)) throw Error("Серверная версия источника изменилась. Сначала сверьте исходный шаблон.");
      sourceProof = { itemKey: sourceOriginal.binding.itemKey, listId: sourceOriginal.binding.listId, base: sourceOriginal.base,
        payloadDigest: await adminTemplateCopyPayloadDigest(sourcePrepared.payload) }; guard();
    }
    operationId = crypto.randomUUID(); changedAt = nowIso();
    const prepareCopy = request.type === "item" ? prepareAdminTemplateItemCopy
      : request.type === "item-replace" ? prepareAdminTemplateItemReplacement
      : request.type === "container-replace" ? prepareAdminTemplateContainerReplacement
      : request.type === "placement-move" ? prepareAdminTemplatePlacementMove
      : request.type === "placement-group" ? prepareAdminTemplatePlacementGroup
      : request.type === "placement-remove" ? prepareAdminTemplatePlacementRemoval
      : request.type === "catalog-delete" ? prepareAdminTemplateCatalogDeletion : prepareAdminTemplateTreeCopy;
    prepared = await prepareCopy(planningState, request, { operationId, changedAt, currentEditMeta, markEdited, sourceKind: personalSource ? "personal" : "template",
      normalizeContainerColor, hasPhotos: row => normalizeItemPhotos(row).length > 0,
      copyContainerName: name => makeContainerCopyNameForLayout(name, layout, state.containers, uiLanguage === "en" ? "copy" : "копия") });
    copyPrepared = prepared;
    try { linked = personalSource || ["item", "item-replace", "container-replace", "placement-move", "placement-group", "placement-remove", "catalog-delete"].includes(request.type) ? null : await prepareAdminTemplateTreeCopy(state, { ...request, mode: "link" }, { operationId, changedAt, markEdited,
      hasPhotos: row => normalizeItemPhotos(row).length > 0 }); } catch { linked = null; }
    try { missingPrepared = request.includeContents === true ? await prepareAdminTemplateMissingItems(planningState, request, {
      operationId, changedAt, currentEditMeta, markEdited, normalizeContainerColor, sourceKind: personalSource ? "personal" : "template",
      hasPhotos: row => normalizeItemPhotos(row).length > 0
    }) : null; } catch { missingPrepared = null; }
    guard(); if (!linked && !missingPrepared && !capacity()) return false;
  } catch (error) { reportAdminTemplateSaveError(error); return false; }
  let used = false;
  return Object.assign(async (mode = "copy") => {
    const priorLayout = { ...layout }, parentId = request.targetParentId || "", priorParent = state.containers[parentId];
    const priorUpdates = [];
    try {
      if (used) return false; guard();
      await verifyPendingTarget();
      prepared = mode === "copy" ? copyPrepared : mode === "link" ? linked : mode === "missing" ? missingPrepared : null;
      if (!prepared || !capacity()) return false;
      if (prepared.entries.some(({ targetId }) => state.items[targetId] || state.containers[targetId] || state.layouts[targetId])) throw Error("Идентификатор копии уже занят.");
      used = true;
      for (const { type, targetId } of prepared.entries) state[type][targetId] = clone(prepared.snapshot[type][targetId]);
      try {
        for (const { type, id } of prepared.updates || []) {
          if (!["items", "containers"].includes(type) || !state[type][id] || state[type][id].publicCatalogLayoutId !== layout.id) throw Error("Исходная запись размещения изменилась.");
          priorUpdates.push({ type, id, value: state[type][id] });
          state[type][id] = clone(prepared.snapshot[type][id]);
        }
        for (const { type, id } of prepared.removals || []) {
          if (!["items", "containers"].includes(type) || !state[type][id] || state[type][id].publicCatalogLayoutId !== layout.id
            || Object.hasOwn(prepared.snapshot[type], id)) throw Error("Исходная запись удаления изменилась.");
          priorUpdates.push({ type, id, value: state[type][id] }); delete state[type][id];
        }
        layout.arrangement = clone(prepared.snapshot.layouts[layout.id].arrangement);
        layout.rootContainerIds = [...prepared.snapshot.layouts[layout.id].rootContainerIds]; markEdited(layout, changedAt);
        if (parentId) state.containers[parentId] = clone(prepared.snapshot.containers[parentId]);
        const candidate = adminTemplateEditorSnapshot(layout.id);
        layout.adminCausalCopyPlan = sourceProof ? adminTemplateSourceSavePlan({ binding: original.binding, operationId,
          body: { version: 1, base: original.base, payload: stripAdminTemplateEditorMetadata(candidate.payload), metadata: candidate.metadata, source: sourceProof },
          sourceSnapshot: sourcePrepared.payload }) : adminTemplateSavePlan({ binding: original.binding, operationId, exists: true,
          visibility: original.visibility, base: original.base, payload: stripAdminTemplateEditorMetadata(candidate.payload), metadata: candidate.metadata });
        layout.templateDraftSyncPending = true; persistNewCausalAdminTemplateDraft(layout);
      } catch (error) {
        for (const { type, targetId } of prepared.entries) delete state[type][targetId];
        for (const { type, id, value } of priorUpdates) state[type][id] = value;
        for (const key of Object.keys(layout)) if (!Object.hasOwn(priorLayout, key)) delete layout[key];
        Object.assign(layout, priorLayout); if (parentId) state.containers[parentId] = priorParent;
        throw error;
      }
      if (sourceLayout !== layout && !activateAdminPublishedLayout(layout.id)) throw Error("Копия сохранена. Откройте целевой шаблон для продолжения.");
      try { await resumeCausalAdminTemplateCopy(layout); await coordinator.flush(layout.id); }
      catch (error) { reportAdminTemplateSaveError(error); }
      return prepared.itemId || prepared.rootId;
    } catch (error) { reportAdminTemplateSaveError(error); return false; }
  }, { canLink: Boolean(linked), canMissing: Boolean(missingPrepared), missingItemCount: missingPrepared?.missingItemCount || 0 });
}
async function createCausalAdminTemplateCopy(sourceLayout, requestedName, { sourceKind = "", validateSelection = null } = {}) {
  const observed = clone(sourceLayout?.adminCausalSource || null), coordinator = adminTemplateSaveCoordinator();
  const pendingSource = Boolean(observed?.planId && observed.base?.operationId);
  if (!adminTemplateUiEnabled() || !observed?.exists || sourceLayout.adminCausalCopyPlan
    || !pendingSource && (observed.planId || !observed.base?.stateRevision || sourceLayout.templateDraftSyncPending || coordinator.hasPendingCapture(sourceLayout.id))) {
    throw Error("Сначала дождитесь подтверждения изменений исходного шаблона и откройте его для копирования.");
  }
  const initial = canonicalTemplateJson(adminTemplateOperationContext(observed.binding, sourceLayout.id, true));
  const snapshot = canonicalTemplateJson(adminTemplateEditorSnapshot(sourceLayout.id));
  const guard = () => {
    if (validateSelection?.() === false) throw Error("Выбор шаблона или название изменились. Повторите создание.");
    if (!canOpenAdminPublishedEdit() || state.layouts[sourceLayout.id] !== sourceLayout
      || sourceLayout.adminCausalCopyPlan || !pendingSource && (coordinator.hasPendingCapture(sourceLayout.id) || sourceLayout.templateDraftSyncPending)
      || canonicalTemplateJson(sourceLayout.adminCausalSource) !== canonicalTemplateJson(observed)
      || canonicalTemplateJson(adminTemplateOperationContext(observed.binding, sourceLayout.id, true)) !== initial
      || canonicalTemplateJson(adminTemplateEditorSnapshot(sourceLayout.id)) !== snapshot) throw Error("Источник копии изменился. Откройте копирование заново.");
  };
  guard();
  let prepared, sourceProof;
  if (pendingSource) {
    // Read the chosen draft without activating it or dispatching its writes.
    const plans = createAdminTemplateSavePlans({ binding: observed.binding, enabled: adminTemplateUiEnabled(),
      client: adminTemplateClient(observed.binding, sourceLayout.id, true),
      getContext: () => adminTemplateOperationContext(observed.binding, sourceLayout.id, true) });
    const saved = await plans.read(observed.planId); guard();
    const records = saved?.plan.version === 2 ? await plans.list() : []; guard();
    const baseline = saved?.plan.version === 2 ? await adminTemplateSourceBaseline(observed.binding, sourceLayout.id).read() : null; guard();
    const receipts = saved?.plan.version === 2 ? await adminTemplateClient(observed.binding, sourceLayout.id, true).list() : []; guard();
    const current = JSON.parse(snapshot); current.payload = stripAdminTemplateEditorMetadata(current.payload);
    const captured = await pendingAdminTemplateCopySource(observed, saved, current, records, { baseline, receipts }); guard();
    prepared = { payload: captured.payload, metadata: current.metadata }; sourceProof = captured.source;
  } else {
    prepared = await adminTemplateClient(observed.binding, sourceLayout.id, true).prepare(); guard();
    const verified = adminTemplateEditorSource(observed.binding, prepared);
    if (!verified.exists || canonicalTemplateJson(verified.base) !== canonicalTemplateJson(observed.base)) throw Error("Серверная версия источника изменилась. Сначала сверьте исходный шаблон.");
    sourceProof = { itemKey: observed.binding.itemKey, listId: observed.binding.listId,
      base: observed.base, payloadDigest: await adminTemplateCopyPayloadDigest(prepared.payload) }; guard();
  }
  const operationId = crypto.randomUUID(), targetId = crypto.randomUUID();
  const kind = sourceKind || (sourceLayout.adminSharedSourceId ? "shared" : "demo");
  if (!["demo", "shared"].includes(kind)) throw Error("Выберите тип копии шаблона.");
  const binding = { actorId: observed.binding.actorId, environment: observed.binding.environment,
    listId: (kind === "demo" ? "public-demo-state-" : "public-shared-layout-") + targetId,
    itemKey: (kind === "demo" ? "demo-state:" : "shared-layout:") + targetId };
  const body = { version: 1, base: null, source: sourceProof,
    metadata: { ...prepared.metadata, title: requestedName.trim() } }; guard();
  const plan = adminTemplateCopyPlan({ binding, operationId, body, sourceSnapshot: prepared.payload });
  const payload = plan.editorSnapshot.payload, id = payload.activeLayoutId;
  if (state.layouts[id] || Object.keys(payload.items).some(key => state.items[key]) || Object.keys(payload.containers).some(key => state.containers[key])) throw Error("Идентификатор копии уже используется.");
  const layout = { ...clone(payload.layouts[id]), locations: clone(payload.locations || []), categories: clone(payload.categories || []),
    adminTemplateCopy: true, sharedSourceId: id, templatePublished: false, adminCausalCopyPlan: plan,
    ...(kind === "demo" ? { adminDemo: true, adminDemoLanguage: body.metadata.language, adminDemoListId: binding.listId } : { adminSharedSourceId: targetId }),
    adminCausalSource: { version: 1, binding, exists: false, visibility: null, base: null, indexes: [], planId: null } };
  state.layouts[id] = layout;
  for (const type of ["items", "containers"]) for (const [key, row] of Object.entries(payload[type])) {
    state[type][key] = { ...clone(row), sharedSourceId: key, publicCatalogLayoutId: id, adminDemo: kind === "demo" };
  }
  try {
    const editorSnapshot = adminTemplateEditorSnapshot(id); editorSnapshot.payload = stripAdminTemplateEditorMetadata(editorSnapshot.payload);
    layout.adminCausalCopyPlan = adminTemplateCopyPlan({ binding, operationId, body, sourceSnapshot: prepared.payload, editorSnapshot });
    persistNewCausalAdminTemplateDraft(layout);
  }
  catch (error) {
    delete state.layouts[id]; for (const type of ["items", "containers"]) Object.keys(payload[type]).forEach(key => delete state[type][key]);
    throw error;
  }
  activateAdminPublishedLayout(id);
  try { await resumeCausalAdminTemplateCopy(layout); await coordinator.flush(id); }
  catch (error) { reportAdminTemplateSaveError(error); }
  render(); return id;
}
async function openCausalAdminTemplateOrder(sections) {
  const actorId = String(currentUser?.id || "");
  const batch = createAdminTemplateOrderBatch({ actorId, enabled: adminTemplateUiEnabled(),
    getContext: () => ({ ...adminTemplateOperationContext({}, "", true), environment: "bike-packing-experiment", scope: "admin-template-order" }),
    clientFor: binding => adminTemplateClient(binding, "", true),
    assertNoPending: async binding => {
      const layout = Object.values(state.layouts || {}).find(row => row.adminCausalSource?.binding?.listId === binding.listId);
      if (layout && (layout.adminCausalCopyPlan || layout.adminCausalSource.planId || layout.templateDraftSyncPending || administrativeSaveCoordinator?.hasPendingCapture(layout.id))) {
        throw Error("Сначала завершите сохранение изменённого шаблона.");
      }
      const client = adminTemplateClient(binding, "", true);
      const plans = createAdminTemplateSavePlans({ binding, enabled: adminTemplateUiEnabled(), client,
        getContext: () => adminTemplateOperationContext(binding, "", true) });
      for (const { plan } of await plans.list()) for (const intent of plan.operations) {
        const saved = await client.read(intent.id);
        if (saved?.receipt?.operation?.state !== "committed") throw Error("Сначала завершите сохранённое действие шаблона.");
      }
    },
  });
  const targets = sections.filter(section => section.id !== "personal").flatMap(section => section.layouts.map(layout => ({
    layoutId: layout.id, layoutOrder: layout.layoutOrder == null ? null : Number(layout.layoutOrder),
    binding: adminTemplateBinding(section.id === "demo"
      ? { type: "demo", demoListId: layout.adminDemoListId || layout.demoListId, language: layout.adminDemoLanguage || layout.language || uiLanguage }
      : { type: "shared", sharedId: layout.adminSharedSourceId }),
  })));
  const opened = await batch.open(targets);
  return { batch, ...opened };
}
async function saveCausalAdminTemplateOrder(work, sections) {
  const chosen = sections.map(section => ({ id: section.id, layouts: section.layouts.map(layout => layout.id) }));
  if (!work.pending) work.pending = await work.batch.capture(work.session, chosen);
  if (!work.pending) return;
  if (canonicalTemplateJson(work.pending.selection) !== canonicalTemplateJson(chosen)) throw Error("Продолжите ранее сохранённый порядок.");
  const result = await work.batch.run(work.pending.id);
  if (result.state !== "committed") throw Error("Часть порядка ожидает сверки. Исходный выбор сохранён; подтверждённая часть не отправляется заново.");
  // Advance only unchanged editor sources; a concurrently captured edit retains
  // its own dependency and must resolve the server revision conflict explicitly.
  for (const entry of work.pending.entries) {
    const receipt = result.receipts.find(value => value.operation.id === entry.intent.id);
    for (const layout of Object.values(state.layouts || {})) {
      const source = layout.adminCausalSource;
      if (source?.binding?.listId === entry.intent.listId && source.binding.actorId === entry.intent.actorId
        && !source.planId && !administrativeSaveCoordinator?.hasPendingCapture(layout.id)
        && source.base?.stateRevision === entry.intent.body.base.stateRevision) {
        layout.adminCausalSource = { ...source, base: { stateRevision: receipt.result.payload.stateRevision },
          lastConfirmedOperation: { id: receipt.operation.id, kind: receipt.operation.kind } };
        layout.layoutOrder = entry.intent.body.metadata.layoutOrder;
      }
    }
  }
}
async function finishCausalAdminTemplateOrder(work) {
  if (work.pending) {
    // Generic local ordering also numbers editor-only rows. Restore the order
    // confirmed for the public source before persisting that editor's mirror.
    for (const { intent } of work.pending.entries) for (const layout of Object.values(state.layouts || {})) {
      const source = layout.adminCausalSource;
      if (source?.binding?.actorId === String(currentUser?.id || "") && source.binding.listId === intent.listId
        && source.lastConfirmedOperation?.id === intent.id && !source.planId
        && !administrativeSaveCoordinator?.hasPendingCapture(layout.id)) layout.layoutOrder = intent.body.metadata.layoutOrder;
    }
    if (!persistStateSnapshot(state)) throw Error("Не удалось сохранить результат порядка на устройстве. Исходное действие сохранено для продолжения.");
    await work.batch.acknowledge(work.pending.id);
  }
}
function adminTemplateEditorSnapshot(layoutId, options = {}) {
  return withLayoutArrangementApplied(layoutId, () => {
    const layout = state.layouts[layoutId], target = publishedLayoutTarget(layout, { defaultToDemo: true });
    const language = normalizeUiLanguage(target.language || layout.language || uiLanguage);
    const originalLayoutId = layout.adminCausalSource && layout.adminTemplateCopy && isCausalCopyLayoutId(layout.sharedSourceId) ? layout.sharedSourceId : null;
    let payload = exportLayoutAsDemoState(layoutId, { ...options, preserveEntityIds: Boolean(originalLayoutId) });
    if (target.type === "demo") payload = normalizeDemoPayloadForLanguage(payload, language, { preserveCatalog: true }) || payload;
    if (originalLayoutId) {
      const exported = Object.values(payload.layouts)[0]; exported.id = originalLayoutId;
      payload.layouts = { [originalLayoutId]: exported }; payload.activeLayoutId = originalLayoutId;
    }
    return { payload, metadata: { title: target.type === "demo" ? normalizeDemoLayoutName(layout.name || "", language) : String(layout.name || "").trim(),
      description: String(layout.note || "").trim(), language } };
  });
}
function adminTemplatePlansFor(binding, layoutId, preparing = false) {
  return createAdminTemplateSavePlans({ binding, enabled: adminTemplateUiEnabled(), client: adminTemplateClient(binding, layoutId, preparing),
    getContext: () => adminTemplateOperationContext(binding, layoutId, preparing),
    shouldCancel: id => adminTemplateRecoveryFor(binding, layoutId, preparing).requiresCancellation(id) });
}
function adminTemplateRecoveryFor(binding, layoutId, preparing = false) {
  return createAdminTemplateRecovery({ binding, enabled: adminTemplateUiEnabled(), plans: adminTemplatePlansFor(binding, layoutId, preparing),
    client: adminTemplateClient(binding, layoutId, preparing), getContext: () => adminTemplateOperationContext(binding, layoutId, preparing) });
}
function adminTemplateStopChoiceFor(binding, layoutId, priorPlanId) {
  return createAdminTemplateStopChoice({ binding, layoutId, priorPlanId, enabled: adminTemplateUiEnabled(),
    projectServer: (server, id) => projectAdminTemplateServerVariant(state.layouts[layoutId], server, id),
    getContext: () => adminTemplateOperationContext(binding, layoutId), getSource: () => state.layouts?.[layoutId]?.adminCausalSource,
    snapshot: () => adminTemplateEditorSnapshot(layoutId), client: adminTemplateClient(binding, layoutId),
    plans: adminTemplatePlansFor(binding, layoutId), recovery: adminTemplateRecoveryFor(binding, layoutId) });
}
let administrativeRecoveryDialog = null;
function showAdminTemplateRecovery(layoutId) {
  if (!administrativeRecoveryDialog) administrativeRecoveryDialog = createAdminTemplateRecoveryDialog({
    getLanguage: () => uiLanguage, openModalDialog, prepare: prepareAdminTemplateRecovery,
    confirmStop: () => askConfirmDialog({ title: "Остановить отправку шаблона?", tone: "warning",
      text: "Остановим ещё не принятые действия. Часть отправки могла уже завершиться на сервере. Местный черновик останется на устройстве для сверки.",
      okText: "Остановить отправку", cancelText: "Продолжать сохранение", hideClose: true }),
  });
  return administrativeRecoveryDialog.show(layoutId);
}
async function prepareAdminTemplateRecovery(layoutId) {
  const layout = state.layouts?.[layoutId], binding = layout?.adminCausalSource?.binding;
  if (!binding || !adminTemplateUiEnabled()) throw Error("Откройте административный черновик для проверки сохранения.");
  const initial = canonicalTemplateJson(adminTemplateOperationContext(binding, layoutId));
  const assertEditor = () => {
    if (state.layouts?.[layoutId] !== layout || !adminTemplateOperationContext(binding, layoutId).admin
      || canonicalTemplateJson(adminTemplateOperationContext(binding, layoutId)) !== initial) throw Error("Контекст редактирования изменился. Откройте сохранение шаблона заново.");
  };
  assertEditor(); await resumeCausalAdminTemplateCopy(layout); assertEditor();
  const coordinator = adminTemplateSaveCoordinator(); await coordinator.prepareRecovery(layoutId); assertEditor();
  const recovery = adminTemplateRecoveryFor(binding, layoutId);
  let shownSource, shownSnapshot;
  const snapshot = () => { const value = adminTemplateEditorSnapshot(layoutId); return { ...value, payload: stripAdminTemplateEditorMetadata(value.payload) }; };
  const assertShown = () => {
    assertEditor();
    if (canonicalTemplateJson(layout.adminCausalSource) !== canonicalTemplateJson(shownSource)
      || canonicalTemplateJson(snapshot()) !== canonicalTemplateJson(shownSnapshot)) throw Error("Черновик изменился. Сначала проверьте сохранённые действия заново.");
  };
  const inspect = async refresh => {
    assertEditor(); shownSource = clone(layout.adminCausalSource); shownSnapshot = clone(snapshot());
    const result = shownSource.planId ? await recovery.inspect(shownSource.planId, { refresh }) : { operations: [], stopped: false, stopRequested: false };
    assertShown(); return result;
  };
  const resume = async () => { assertShown(); await coordinator.flush(layoutId); assertEditor(); return inspect(false); };
  return { inspect, resume, compare: async () => {
    assertShown();
    const choice = adminTemplateStopChoiceFor(binding, layoutId, shownSource.planId), opened = await choice.open(); assertShown();
    if (!opened.saved) {
      const describe = value => `«${value.metadata.title}»: вещей ${Object.keys(value.payload.items || {}).length}, сумок ${Object.keys(value.payload.containers || {}).length}`;
      const approved = await askConfirmDialog({ title: "Сверить остановленный черновик", tone: "warning",
        highlightHtml: adminTemplateComparisonHtml(opened.local, opened.server),
        text: `На устройстве: ${describe(opened.local)}. На сервере: ${describe(opened.server)}. Выберите вариант для продолжения. Серверный вариант заменит только текущий редактор; отправки не будет. Обе версии сохранятся на устройстве. Сохранение местного варианта заменит просмотренную серверную версию и остановится при новом конфликте.${opened.server.visibility === "public" ? " Шаблон опубликован: сохранённые местные изменения будут видны другим пользователям." : " Шаблон останется личным черновиком администратора."}`,
        okText: "Сохранить местный вариант", alternateText: "Использовать серверный вариант", cancelText: "Пока оставить черновик", hideClose: true });
      assertShown(); if (!approved) return inspect(false); await choice.choose(opened, { variant: approved === "alternate" ? "server" : "local" }); assertShown();
    }
    await coordinator.flush(layoutId); assertEditor(); return inspect(false);
  }, stop: async () => {
    assertShown(); if (!shownSource.planId) return inspect(false);
    await recovery.captureStop(shownSource.planId, shownSnapshot); assertShown();
    await recovery.resumeStop(shownSource.planId); assertEditor(); return inspect(false);
  } };
}
function adminTemplateSaveCoordinator() {
  if (!administrativeSaveCoordinator) administrativeSaveCoordinator = createAdminTemplateSaveFlow({
    enabled: adminTemplateUiEnabled(), getLayout: id => state.layouts?.[id],
    getContext: binding => {
      const layout = Object.values(state.layouts || {}).find(value => value.adminCausalSource?.binding?.listId === binding.listId
        && value.adminCausalSource?.binding?.actorId === binding.actorId);
      return adminTemplateOperationContext(binding, layout?.id || "");
    },
    snapshot: adminTemplateEditorSnapshot,
    plansFor: adminTemplatePlansFor, recoveryFor: adminTemplateRecoveryFor, resolutionFor: adminTemplateStopChoiceFor,
    applyServerVariant: (layoutId, { projection, source }) => {
      const result = applyAdminTemplateServerVariant(state, layoutId, projection, source, {
        persist: () => persistStateSnapshot(state, { recordAction: false }), applyArrangement: applyLayoutArrangement });
      render(); return result;
    },
    persist: () => persistStateSnapshot(state),
    notify: status => updateSyncUi(status === "committed" ? "Изменения шаблона подтверждены сервером."
      : status === "adopted" ? "Серверный вариант открыт. Новые изменения не отправлялись."
      : status === "pending" ? "Изменения шаблона сохранены локально и ожидают отправки." : "Изменения шаблона ожидают сверки."),
  });
  return administrativeSaveCoordinator;
}
function materializeCausalAdminTemplate(target, prepared) {
  const binding = adminTemplateBinding(target);
  if (target.type === "shared") {
    // The legacy public-copy path normalizes away detached quantities and
    // rebuilds placement. Open the exact prepared catalog with its own IDs.
    const id = `layout-admin-shared-${target.sharedId}-${crypto.randomUUID()}`;
    const projection = projectAdminTemplateServerVariant({ id, adminSharedSourceId: target.sharedId }, prepared, crypto.randomUUID());
    if (state.layouts[id] || ["items", "containers"].some(kind => Object.keys(projection[kind]).some(key => state.items[key] || state.containers[key] || state.layouts[key]))) {
      throw Error("Идентификатор редактора уже используется.");
    }
    state.layouts[id] = projection.layout;
    Object.assign(state.items, projection.items); Object.assign(state.containers, projection.containers);
    return projection.layout;
  }
  const before = { items: new Set(Object.keys(state.items || {})), containers: new Set(Object.keys(state.containers || {})) };
  const copiedLayoutId = adminTemplateCopiedLayoutId(prepared.payload), payload = clone(prepared.payload);
  if (copiedLayoutId) for (const type of ["items", "containers"]) for (const row of Object.values(payload[type])) row.sharedSourceId = row.id;
  const layout = importDemoStateAsEditableLayout(payload, { language: prepared.metadata.language, listId: binding.listId, activate: false, renderAfter: false, preserveCatalog: true, recordAction: false });
  if (layout && copiedLayoutId) { layout.adminTemplateCopy = true; layout.sharedSourceId = copiedLayoutId; }
  if (layout) for (const kind of ["items", "containers"]) for (const [id, record] of Object.entries(state[kind] || {})) {
    if (!before[kind].has(id)) record.publicCatalogLayoutId = layout.id;
  }
  return layout;
}
async function runCausalAdminTemplateCommand(target, layout, kind) {
  const binding = adminTemplateBinding(target), source = layout?.adminCausalSource;
  if (!adminTemplateUiEnabled() || !source || state.layouts?.[layout.id] !== layout
    || !adminTemplateOperationContext(binding, layout.id).admin
    || Object.keys(binding).some(key => binding[key] !== source.binding?.[key])) {
    throw Error("Откройте актуальный административный шаблон перед продолжением действия.");
  }
  const coordinator = adminTemplateSaveCoordinator();
  // Finish interrupted UI cleanup only against the validated, retained receipt.
  // A local visibility flag alone cannot stand in for that confirmation.
  if (!source.planId && !coordinator.hasPendingCapture(layout.id) && source.lastConfirmedOperation?.kind === kind
    && (kind !== "template.publication" || source.visibility === "private")) {
    const saved = await adminTemplateClient(binding, layout.id).read(source.lastConfirmedOperation.id);
    if (layout.adminCausalSource !== source || coordinator.hasPendingCapture(layout.id)
      || saved?.intent?.kind !== kind || saved?.receipt?.operation?.state !== "committed"
      || saved.receipt.result.payload.stateRevision !== source.base.stateRevision
      || kind === "template.publication" && saved.intent.body.published !== false) {
      throw Error("Сохранённое подтверждение требует проверки. Действие не отправлено повторно.");
    }
    return true;
  }
  await coordinator.captureCommand(layout.id, { kind, ...(kind === "template.publication" ? { published: false } : {}) });
  const result = await coordinator.flush(layout.id);
  if (result.state !== "committed" || !result.applied) throw Error("Подтверждение действия ещё не получено. Исходное действие сохранено для продолжения.");
  return true;
}
async function reconcileLegacyAdminTemplate(layout, binding) {
  const getContext = () => ({ ...adminTemplateOperationContext(binding, layout.id, true),
    admin: canOpenAdminPublishedEdit() && state.layouts?.[layout.id] === layout && !layout.adminCausalSource });
  const client = createAdminTemplateClient({ binding, transport: experimentTransport, enabled: adminTemplateUiEnabled(), getContext });
  const plans = createAdminTemplateSavePlans({ binding, enabled: adminTemplateUiEnabled(), client, getContext });
  const choice = createAdminTemplateLegacyChoice({ binding, layoutId: layout.id, enabled: adminTemplateUiEnabled(),
    getContext, snapshot: () => adminTemplateEditorSnapshot(layout.id), client, plans,
    projectServer: (server, id) => projectAdminTemplateServerVariant(layout, server, id) });
  const opened = await choice.open();
  if (!opened.saved) {
    const describe = value => `«${value.metadata.title}»: вещей ${Object.keys(value.payload.items || {}).length}, сумок ${Object.keys(value.payload.containers || {}).length}`;
    const approved = await askConfirmDialog({ title: "Сверить старый черновик", tone: "warning",
      highlightHtml: adminTemplateComparisonHtml(opened.local, opened.server),
      text: `На устройстве: ${describe(opened.local)}. На сервере: ${describe(opened.server)}. Выберите вариант для продолжения. Серверный вариант заменит только текущий редактор; отправки не будет. Обе версии сохранятся на устройстве. Перенос местного варианта заменит просмотренную серверную версию и остановится при новом конфликте.${opened.server.visibility === "public" ? " Шаблон опубликован: перенесённые местные изменения будут видны другим пользователям." : " Шаблон останется личным черновиком администратора."}`,
      okText: "Перенести местный вариант", alternateText: "Использовать серверный вариант", cancelText: "Пока оставить черновик", hideClose: true });
    if (!approved) return false;
    await choice.choose(opened, { variant: approved === "alternate" ? "server" : "local" });
  }
  // Both snapshots and either the original save plan or the server projection
  // are durable before changing the editor. A lost mirror finds the same choice.
  const next = await choice.resume();
  if (next.serverAdoption) {
    const { projection, source } = next.serverAdoption;
    return applyAdminTemplateServerVariant(state, layout.id, projection, source, {
      persist: () => persistStateSnapshot(state, { recordAction: false }), applyArrangement: applyLayoutArrangement });
  }
  layout.adminCausalSource = next;
  persistStateSnapshot(state);
  return true;
}
async function openCausalAdminTemplate(target, { remember = true } = {}) {
  try {
    const binding = adminTemplateBinding(target);
    const matching = Object.values(state.layouts || {}).filter(layout => target.type === "demo" ? layout.adminDemoListId === binding.listId
      : layout.adminSharedSourceId === target.sharedId);
    if (matching.length > 1) throw Error("Найдено несколько местных черновиков этого шаблона. Сохранение остановлено для сверки; все варианты сохранены.");
    const existing = matching[0];
    if (existing) {
      if (!existing.adminCausalSource && !await reconcileLegacyAdminTemplate(existing, binding)) return null;
      if (!existing.adminCausalSource || Object.keys(binding).some(key => existing.adminCausalSource.binding?.[key] !== binding[key])) {
        throw Error("Этот локальный черновик нужно сверить с серверной версией перед продолжением.");
      }
      activateAdminPublishedLayout(existing.id, { remember });
      await resumeCausalAdminTemplateCopy(existing);
      await adminTemplateSaveCoordinator().recover(existing.id);
      if (!existing.adminCausalSource.exists && !existing.adminCausalSource.planId) {
        await adminTemplateSaveCoordinator().capture(existing.id, { published: false });
      }
      if (existing.adminCausalSource.planId) await adminTemplateSaveCoordinator().flush(existing.id);
      return existing;
    }
    const prepared = await adminTemplateClient(binding, "", true).prepare();
    if (Object.values(state.layouts || {}).some(layout => target.type === "demo" ? layout.adminDemoListId === binding.listId
      : layout.adminSharedSourceId === target.sharedId)) return openCausalAdminTemplate(target, { remember });
    if (!prepared.exists || prepared.deleted || !prepared.payload) throw Error("Шаблон недоступен для редактирования.");
    if (Object.keys(prepared.payload.layouts || {}).length !== 1) throw Error("Этот шаблон содержит несколько укладок и требует отдельной подготовки к редактированию.");
    const editorSource = adminTemplateEditorSource(binding, prepared);
    const layout = materializeCausalAdminTemplate(target, prepared);
    if (!layout) throw Error("Не удалось открыть шаблон.");
    layout.adminCausalSource = editorSource; layout.name = prepared.metadata.title; layout.note = prepared.metadata.description;
    layout.language = prepared.metadata.language; layout.templatePublished = prepared.visibility === "public";
    layout.templateDraftServerHydrated = true; delete layout.templateDraftSyncPending;
    await rememberAdminTemplateSourceBaseline(layout, prepared);
    persistStateSnapshot(state, { recordAction: false }); activateAdminPublishedLayout(layout.id, { remember });
    return layout;
  } catch (error) { reportAdminTemplateSaveError(error); showToast(error.message, "error"); return null; }
}
async function savePublishedLayoutRecord(layoutId = state.activeLayoutId, options = {}) {
  const layout = state.layouts?.[layoutId];
  const published = typeof options?.published === "boolean"
    ? options.published
    : shouldAutoPublishManagedTemplate(layout);
  if (adminTemplateUiEnabled()) {
    const coordinator = adminTemplateSaveCoordinator(), source = layout?.adminCausalSource;
    if (!source) throw Error("Откройте шаблон с проверенной серверной версией перед сохранением.");
    if (!source.planId && !coordinator.hasPendingCapture(layoutId) || published !== (source.visibility === "public")) {
      await coordinator.capture(layoutId, { published });
    }
    const result = await coordinator.flush(layoutId);
    if (result.state !== "committed" || result.applied === false) throw Error("Сохранённое действие требует сверки перед продолжением.");
    if (options.notify) showToast("Шаблон сохранён.", "success");
    return { layoutId, published: layout.templatePublished, target: publishedLayoutTarget(layout) };
  }
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
  }, layoutId, {
    ...options,
    published
  });
}

function exportLayoutAsDemoState(layoutId = state.activeLayoutId, { onMappedEntity, preserveEntityIds = false } = {}) {
  captureActiveLayoutArrangement();
  return exportLayoutAsPublishedState(state, layoutId, {
    onMappedEntity,
    preserveEntityIds,
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
  const useReadonlyCache = shouldUseReadonlyTemplateCache({
    allowOfflineCache,
    templatesBlocked: arePublishedTemplatesBlocked()
  });
  if (!useReadonlyCache && !requirePublishedTemplatesAvailable()) {
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
  if (adminTemplateUiEnabled()) return openCausalAdminTemplate({ type: "shared", sharedId: layoutId }, { remember });
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
    excludeEmptySystemDefault: !canOpenAdminPublishedEdit() && isReadonlyTemplateView(),
    excludeRedundantEmptySystemDefault: !canOpenAdminPublishedEdit(),
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
  fillSelect(
    refs.sharedCopyLayoutSelect,
    copyTargetLayouts.map((layout) => [layout.id, layout.name]),
    state.activeLayoutId
  );
  refs.sharedLayoutsList.innerHTML = renderSharedLayoutsHtml(currentSharedLayouts(), {
    bagLabel: t("summary.bags"),
    copyBagLabel: t("shared.copyBag"),
    copyItemLabel: t("shared.copyItem"),
    emptyBagText: t("shared.emptyBag"),
    itemLabel: t("tabs.items").toLowerCase(),
    rootsForLayout: sharedLayoutRoots,
    showPhotos: shouldShowItemPhotos(),
    weightLabel: t("shared.weightLabel")
  });
  photoPreviewLoader.observe(refs.sharedLayoutsList);
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-root]").forEach((button) => {
    button.addEventListener("click", () => openSharedContainerCopyPicker(button.dataset.copySharedRoot));
  });
  refs.sharedLayoutsList.querySelectorAll("[data-copy-shared-item]").forEach((button) => {
    button.addEventListener("click", () => openSharedItemCopyPicker(button.dataset.copySharedItem));
  });
}

function bindSharedLayoutEvents(root = document) {
  root.querySelectorAll("[data-copy-shared-layout]").forEach((button) => {
    button.addEventListener("click", (event) => copySharedLayout(button.dataset.copySharedLayout, {
      triggerButton: event.currentTarget
    }));
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
    openSharedReadonlyContainerDialog,
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

function findSharedPublishedItem(itemId, sourceLayoutId = "") {
  for (const layout of sourceLayoutId ? [findSharedLayout(sourceLayoutId)].filter(Boolean) : publicSharedLayouts()) {
    const sourceState = sharedLayoutStatePayload(layout);
    if (sourceState?.items?.[itemId]) return { layout, sourceState, item: sourceState.items[itemId] };
  }
  return null;
}

function findSharedRoot(rootId) {
  const published = findSharedPublishedContainer(rootId);
  if (published) return {
    ...sharedRootFromPublishedContainer(published.container),
    sourceRecord: published.container,
    sourceState: published.sourceState
  };
  for (const layout of publicSharedLayouts()) {
    const root = sharedLayoutRoots(layout).find((item) => item.id === rootId);
    if (root) return root;
  }
  return null;
}

function findSharedItem(itemId, sourceLayoutId = "") {
  const published = findSharedPublishedItem(itemId, sourceLayoutId);
  if (published) return {
    item: sharedItemFromPublishedItem(published.item),
    root: null,
    layout: published.layout,
    sourceRecord: published.item,
    sourceState: published.sourceState
  };
  for (const layout of sourceLayoutId ? [findSharedLayout(sourceLayoutId)].filter(Boolean) : publicSharedLayouts()) {
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
  const layouts = sharedCopyTargetLayouts(state.layouts, {
    excludeEmptySystemDefault: !canOpenAdminPublishedEdit() && isReadonlyTemplateView(),
    excludeRedundantEmptySystemDefault: !canOpenAdminPublishedEdit(),
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
  return layouts.some((layout) => layout.id === selected) ? selected : "";
}

function chooseSharedCopyTargetLayoutId() {
  const layouts = sharedCopyTargetLayouts(state.layouts, {
    excludeEmptySystemDefault: !canOpenAdminPublishedEdit() && isReadonlyTemplateView(),
    excludeRedundantEmptySystemDefault: !canOpenAdminPublishedEdit(),
    readonlySourceLayoutId: isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
  if (!layouts.length) return "";
  if (layouts.length === 1) return layouts[0].id;
  const list = layouts.map((layout, index) => `${index + 1}. ${layout.name}`).join("\n");
  const answer = window.prompt(localText(`Which of your layouts should receive the copy?\n${list}`, `В какую вашу укладку скопировать?\n${list}`), "1");
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
    showToast(localText(`“${rootName}” was copied to the selected layout.`, `«${rootName}» скопировано в выбранную укладку.`), "success");
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
  showToast(localText(`“${root.name}” was copied to the selected layout.`, `«${root.name}» скопировано в выбранную укладку.`), "success");
}

async function copySharedItem(itemId, { sourceLayoutId = activeReadOnlyLayoutId(), resumeSelection = false } = {}) {
  if (personalSavePilotEnabled() && currentUser && !canOpenAdminPublishedEdit()) {
    if (resumeSelection) {
      if (personalPublicPickerSource?.viewLayoutId !== sourceLayoutId) throw Error("Исходный выбор изменился. Откройте карточку шаблона снова.");
    } else await preparePersonalPublicPickerSource(sourceLayoutId, "item", itemId, false);
    await ensurePrivateStateForSharedCopy();
    const targetLayoutId = ensureSharedCopyTargetLayoutId();
    if (!targetLayoutId) return;
    const result = await runCausalPublicEntityCopy("item", itemId, "", targetLayoutId, { catalog: true });
    if (result?.copiedItemId) await openItemDialog(result.copiedItemId);
    return result;
  }
  if (refs.dialog.open) refs.dialog.close();
  const published = findSharedPublishedItem(itemId);
  if (published) {
    await ensurePrivateStateForSharedCopy();
    const targetLayoutId = ensureSharedCopyTargetLayoutId();
    if (!targetLayoutId) return;
    const sourceSnapshot = { rootId: "", containers: {}, items: { [itemId]: published.item } };
    if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, published.item.name))) return;
    const changedAt = nowIso();
    const copiedItemId = copyPublishedItemToState(published.sourceState, itemId, { containerId: "", changedAt });
    if (!canUsePrivateState() && recordGuestSharedLinkDetachedItem(state, targetLayoutId, copiedItemId)) touchLayout(targetLayoutId, changedAt);
    await cacheGuestRecordPhotoFallbacks(state.items?.[copiedItemId]);
    setActivePrivateScope();
    saveState();
    switchActiveLayout(targetLayoutId);
    render();
    renderSharedLayouts();
    openItemDialog(copiedItemId);
    showToast(localText(`“${published.item.name}” was copied to Items.`, `«${published.item.name}» скопировано в вещи.`), "success");
    return;
  }
  const match = findSharedItem(itemId);
  if (!match) return;
  await ensurePrivateStateForSharedCopy();
  const targetLayoutId = ensureSharedCopyTargetLayoutId();
  if (!targetLayoutId) return;
  const sourceSnapshot = { rootId: "", containers: {}, items: { [itemId]: match.item } };
  if (!(await confirmPublicCopyDuplicates(targetLayoutId, sourceSnapshot, match.item.name))) return;
  const changedAt = nowIso();
  const copiedItemId = copySharedItemToState(match.item, { containerId: "", changedAt });
  if (!canUsePrivateState() && recordGuestSharedLinkDetachedItem(state, targetLayoutId, copiedItemId)) touchLayout(targetLayoutId, changedAt);
  await cacheGuestRecordPhotoFallbacks(state.items?.[copiedItemId]);
  setActivePrivateScope();
  saveState();
  switchActiveLayout(targetLayoutId);
  render();
  renderSharedLayouts();
  openItemDialog(copiedItemId);
  showToast(localText(`“${match.item.name}” was copied to Items.`, `«${match.item.name}» скопировано в вещи.`), "success");
}

async function copySharedItemToLayoutContainer(itemId, targetContainerId, targetLayoutId) {
  if (!itemId || !targetContainerId || !targetLayoutId || !state.layouts?.[targetLayoutId]) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic && personalSavePilotEnabled() && currentUser && !canOpenAdminPublishedEdit()) {
    try { await runCausalPublicEntityCopy("item", itemId, targetContainerId, targetLayoutId); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
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
  showToast(localText(
    `“${sourceName}” was copied to the selected bag.`,
    `«${sourceName}» скопировано в выбранную сумку.`
  ), "success");
}

async function copySharedRootToLayoutContainer(rootId, targetParentId, targetLayoutId, {
  includeContents = true,
  targetIndex = null
} = {}) {
  if (!rootId || !targetLayoutId || !state.layouts?.[targetLayoutId]) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic && personalSavePilotEnabled() && currentUser && !canOpenAdminPublishedEdit()) {
    try { await runCausalPublicEntityCopy("container", rootId, targetParentId, targetLayoutId, { includeContents, targetIndex }); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
  if (!targetIsPublic) await ensurePrivateStateForSharedCopy();
  if (!state.layouts?.[targetLayoutId]) return;
  const published = findSharedPublishedContainer(rootId);
  const root = published ? null : findSharedRoot(rootId);
  const sourceName = published?.container?.name || root?.name || "";
  const fullSourceSnapshot = published
    ? snapshotContainerTree(rootId, { targetState: published.sourceState })
    : root ? legacySharedRootSnapshot(root) : null;
  const sourceSnapshot = containerCopySnapshotForContext(fullSourceSnapshot, { includeContents });
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
    title: localText("Already copied to this layout", "Уже скопировано в эту укладку"),
    text: localText(`“${sourceName || "Element"}” is already in “${targetLayout.name || "Layout"}” as a demo/template copy. Create another separate copy?`, `«${sourceName || "Элемент"}» уже есть в укладке «${targetLayout.name || "Укладка"}» как копия из demo/shared. Создать ещё одну отдельную копию?`),
    okText: localText("Duplicate", "Дублировать"),
    cancelText: localText("Do not copy", "Не копировать"),
    highlightText: localText(
      `${duplicates.containerIds.length} bags/containers and ${duplicates.itemIds.length} items were found by source ID`,
      `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже найдены по исходным ID`
    ),
    tone: "safe"
  });
  if (duplicate) return true;
  showToast(localText("Copy skipped: this demo/template copy is already in the target layout.", "Копирование пропущено: такая demo/shared копия уже есть в целевой укладке."), "success");
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
    hasUserEdits: (layout) => guestLayoutHasUserContentEdits(state, layout),
    automaticCopyGroupKey: (layout) => layout.demoSourceLanguage || "other"
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

async function createLocalDemoCopy({
  forceNew = false,
  remember = true,
  exactTemplateName = false,
  activate = true,
  templateId = "",
  prepareCreatedLayoutForSync = () => {}
} = {}) {
  if (!forceNew && localDemoCopyInFlight) return localDemoCopyInFlight;
  const task = (async () => {
    if (!forceNew) pruneUneditedGuestDemoCopies();
    let existing = !forceNew ? reusableGuestDemoCopyLayout() : null;
    if (existing && !exactTemplateName) {
      openPrivateLayout(existing.id, { remember });
      return existing.id;
    }
    if (templateId) selectDemoTemplateForLanguage(uiLanguage, templateId);
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
    const layoutId = copyPublishedDemoStateToLocalLayout(demoState, { activate, remember, exactTemplateName });
    prepareCreatedLayoutForSync(layoutId);
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
    title: localText("Layout already copied", "Укладка уже скопирована"),
    text: localText(`“${sourceName || existingLayout.name || "Layout"}” is already in your layouts as “${existingLayout.name || "Layout"}”. Open the existing layout instead of creating another copy?`, `«${sourceName || existingLayout.name || "Укладка"}» уже есть в ваших укладках как «${existingLayout.name || "Укладка"}». Открыть существующую вместо создания ещё одной копии?`),
    okText: localText("Open existing", "Открыть существующую"),
    cancelText: localText("Create a copy", "Создать копию"),
    tone: "safe"
  });
  if (!openExisting) return true;
  openPrivateLayout(existingLayout.id, { remember: true });
  if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
  switchView("packing");
  render();
  showToast(localText("Opened the existing copied layout.", "Открыта уже скопированная укладка."), "success");
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
    title: localText("Some elements are already in the layout", "Такие элементы уже есть в укладке"),
    text: localText(`“${targetLayout.name || "Layout"}” already contains part of this bag/branch. Create separate copies instead of adding them again?`, `В укладке «${targetLayout.name || "Укладка"}» уже есть часть этой сумки/ветки. Создать отдельные копии вместо повторного добавления?`),
    okText: localText("Duplicate", "Дублировать"),
    cancelText: localText("Do not copy", "Не копировать"),
    highlightText: localText(
      `${duplicates.containerIds.length} bags/containers and ${duplicates.itemIds.length} items are already in the target layout`,
      `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже есть в целевой укладке`
    ),
    tone: "safe"
  });
  if (duplicate) return true;
  refs.containerPickerDialog.close();
  showToast(localText("Copy skipped: the elements are already in the target layout.", "Копирование пропущено: элементы уже есть в целевой укладке."), "success");
  return false;
}

async function chooseContainerTreeCopyToLayoutAction(targetLayoutId, sourceSnapshot, sourceName = "", { publicSource = false, publicCopyPreview = null } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!targetLayout || !sourceSnapshot) return "cancel";
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const publicSourceSnapshot = publicCopyPreview?.sourceSnapshot || publicCopySnapshotFromSourceSnapshot(sourceSnapshot);
  const sourceIsPublicCopy = publicSource ||
    snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) ||
    snapshotHasLocalPublicCopyOrigin(sourceSnapshot);
  if (!(targetIsPublic || sourceIsPublicCopy) || !publicSourceSnapshot) {
    if (targetIsPublic) return "copy-all";
    const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
    if (!duplicates.containerIds.length && !duplicates.itemIds.length) return "copy-all";
    const missingPlan = layoutMissingItemPlanForContainerTree(targetLayoutId, sourceSnapshot);
    const duplicate = await askConfirmDialog({
      title: localText("Some elements are already in the layout", "Такие элементы уже есть в укладке"),
      text: localText(`“${targetLayout.name || "Layout"}” already contains part of this bag/branch. Create separate copies instead of adding them again?`, `В укладке «${targetLayout.name || "Укладка"}» уже есть часть этой сумки/ветки. Создать отдельные копии вместо повторного добавления?`),
      okText: localText("Duplicate", "Дублировать"),
      alternateText: missingPlan.canCopyMissingItems ? localText("Missing only", "Только недостающие") : "",
      cancelText: localText("Do not copy", "Не копировать"),
      highlightText: localText(
        `${duplicates.containerIds.length} bags/containers and ${duplicates.itemIds.length} items are already in the target layout${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingContainers.length} containers/pouches and ${missingPlan.missingItems.length} items can be added without duplicates` : ""}`,
        `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже есть в целевой укладке${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingContainers.length} контейнеров/пакетов и ${missingPlan.missingItems.length} вещей можно добавить без дублей` : ""}`
      ),
      tone: "safe"
    });
    if (duplicate === "alternate" && missingPlan.canCopyMissingItems) return "copy-missing-local";
    if (duplicate) return "copy-all";
    refs.containerPickerDialog.close();
    showToast(localText("Copy skipped: the elements are already in the target layout.", "Копирование пропущено: элементы уже есть в целевой укладке."), "success");
    return "cancel";
  }
  const duplicates = publicCopyPreview?.duplicates || publicCopyDuplicateSummaryForSnapshot(targetLayoutId, publicSourceSnapshot);
  if (!duplicates.containerIds.length && !duplicates.itemIds.length) return "copy-all";
  const missingPlan = publicCopyPreview || publicCopyMissingItemPlanForSnapshot(targetLayoutId, publicSourceSnapshot);
  const duplicate = await askConfirmDialog({
    title: localText("Already copied to this layout", "Уже скопировано в эту укладку"),
    text: localText(`“${sourceName || "Element"}” is already in “${targetLayout.name || "Layout"}” as a demo/template copy. Create another separate copy?`, `«${sourceName || "Элемент"}» уже есть в укладке «${targetLayout.name || "Укладка"}» как копия из demo/shared. Создать ещё одну отдельную копию?`),
    okText: localText("Duplicate all", "Дублировать всё"),
    alternateText: missingPlan.canCopyMissingItems ? localText("Missing only", "Только недостающие") : "",
    cancelText: localText("Do not copy", "Не копировать"),
    highlightText: localText(
      `${duplicates.containerIds.length} bags/containers and ${duplicates.itemIds.length} items were found by source ID${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingItems.length} items can be added without duplicates` : ""}`,
      `${duplicates.containerIds.length} сумок/контейнеров, ${duplicates.itemIds.length} вещей уже найдены по исходным ID${missingPlan.canCopyMissingItems ? `\n${missingPlan.missingItems.length} вещей можно добавить без дублей` : ""}`
    ),
    tone: "safe"
  });
  if (duplicate === "alternate" && missingPlan.canCopyMissingItems) return "copy-missing";
  if (duplicate) return "copy-all";
  showToast(localText("Copy skipped: this demo/template copy is already in the target layout.", "Копирование пропущено: такая demo/shared копия уже есть в целевой укладке."), "success");
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
  showToast(localText(`${copiedCount} items added without duplicates.`, `${copiedCount} вещей добавлено без дублей.`), "success");
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
  showToast(localText(`${changedCount} elements added without duplicates.`, `${changedCount} элементов добавлено без дублей.`), "success");
  return changedCount;
}

async function copySharedLayout(layoutId, options = {}) {
  return copySharedLayoutFlow({
    runtime: {
      get state() { return state; },
      get uiLanguage() { return uiLanguage; },
      render
    },
    dependencies: {
      applyLayoutArrangement,
      beginCopyProgress: (progressOptions) => beginSharedLayoutCopyProgress({
        ...progressOptions,
        toastRegion: refs.toastRegion,
        documentRef: document
      }),
      cacheGuestTemplatePhotoFallbacks,
      canOpenAdminPublishedEdit,
      closeSharedLayoutsDialog: () => {
        if (refs.sharedLayoutsDialog?.open) refs.sharedLayoutsDialog.close();
      },
      confirmRepeatedSharedLayoutCopy,
      copyPublishedContainerToState,
      copyPersonalPublicLayout: runCausalPublicLayoutCopy,
      copySharedRootToState,
      createLayoutArrangementFromCurrentState,
      createLayoutId: () => `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createLocalDemoCopy,
      createdLayoutSyncErrorText,
      currentCreateMeta,
      ensurePrivateStateForSharedCopy,
      findCopiedSharedLayout,
      findSharedLayout,
      guestLayoutFlags: () => (!canUsePrivateState() ? { [GUEST_DEMO_COPY_FLAG]: true } : {}),
      isServerBackedCopy: () => Boolean(currentUser && canUsePrivateState()),
      loadSharedLayoutPayload,
      markLocalPublicCopyOrigin,
      nowIso,
      rememberActiveLayoutChoice,
      saveState,
      setActivePrivateScope,
      sharedLayoutPublicSourceId,
      sharedLayoutRoots,
      sharedLayoutStatePayload,
      showToast,
      switchView,
      syncCreatedPrivateLayoutEntities,
      t,
      uniqueLayoutName,
      updateSyncUi,
      DEMO_SHARED_LAYOUT_ID
    }
  }, layoutId, options);
}

function materializeSharedLayoutForAdmin(layoutId = activeReadOnlyLayoutId(), { sourceLayout = null } = {}) {
  return materializeSharedLayoutForAdminState(layoutId, {
    canOpenAdminPublishedEdit,
    copyPublishedContainerToState,
    copyPublishedItemToState,
    copySharedRootToState,
    createLayoutArrangementFromCurrentState,
    currentCreateMeta,
    currentEditMeta,
    ensureLayoutDictionaries,
    findSharedLayout: (requestedLayoutId) => (
      sourceLayout?.id === requestedLayoutId ? sourceLayout : findSharedLayout(requestedLayoutId)
    ),
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
  await ensureAdminPublicCopyTargets({
    canOpen: canOpenAdminPublishedEdit(),
    languages: SUPPORTED_LANGUAGES,
    templatesForLanguage: demoTemplatesForUiLanguage,
    materializeDemoTemplate: (language, templateId) => materializeDemoLayoutForAdminCopy(language, templateId),
    linkedSharedLayout: linkedSharedListLayout,
    sharedLayouts: allSharedLayoutsByAdminOrder(),
    loadSharedLayoutPayload,
    materializeSharedLayout: materializeSharedLayoutForAdmin
  });
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
function findMaterializedSharedItemId(sourceId, layout = null) {
  const included = layout ? getLayoutItemIdSet(layout) : null;
  return Object.values(state.items || {}).find(item => item.sharedSourceId === sourceId
    && (!layout || item.publicCatalogLayoutId === layout.id || included.has(item.id)))?.id || "";
}

function findMaterializedSharedContainerId(sourceId, layout = null) {
  const included = layout ? getLayoutContainerIdSet(layout) : null;
  return Object.values(state.containers || {}).find(container => container.sharedSourceId === sourceId
    && (!layout || container.publicCatalogLayoutId === layout.id || included.has(container.id)))?.id || "";
}

function editSharedSourceAsAdmin(type, sourceId, action = "edit", { copyIncludesContents = true } = {}) {
  if (!canOpenAdminPublishedEdit()) return false;
  if (adminTemplateUiEnabled()) {
    const sharedId = activeReadOnlyLayoutId();
    if (!sharedId) return false;
    openCausalAdminTemplate({ type: "shared", sharedId }).then(layout => {
      if (layout && canOpenAdminPublishedEdit() && getPublishedEditLayoutId() === layout.id) openMaterializedSharedEditor(layout, type, sourceId, action, copyIncludesContents);
    }).catch(reportAdminTemplateSaveError);
    return true;
  }
  const layout = materializeSharedLayoutForAdmin();
  if (!layout) return false;
  activateAdminPublishedLayout(layout.id);
  return openMaterializedSharedEditor(layout, type, sourceId, action, copyIncludesContents);
}
function openMaterializedSharedEditor(layout, type, sourceId, action, copyIncludesContents) {
  if (type === "item") {
    const itemId = findMaterializedSharedItemId(sourceId, layout);
    if (itemId) {
      if (action === "delete") confirmDeleteItem(itemId);
      else openItemDialog(itemId);
    }
    return true;
  }
  const containerId = findMaterializedSharedContainerId(sourceId, layout);
  if (containerId) {
    if (action === "add") openAddToContainerDialog(containerId);
    else if (action === "delete") confirmDeleteRootContainer(containerId);
    else openRootContainerDialog(containerId, { copyIncludesContents });
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
    layout.arrangement = createLayoutArrangementFromCurrentState(state, layout.rootContainerIds, {
      itemQuantities: layout.arrangement?.itemQuantities
    });
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
  historyNavigationContext = captureHistoryNavigationContext({
    scope: snapshotModeState(),
    state,
    view: getCurrentView(),
    viewport: captureViewportSnapshot()
  });
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
    ...adminDemoHistoryEntries(adminTemplateHistoryRecords),
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
      label: `${name} · ${languageOptionLabel(language)}`,
      published: entry?.published !== false,
      historyOnly: entry?.historyOnly === true,
      visibility: String(entry?.visibility || "").trim(),
      createdAt: String(entry?.createdAt || "").trim(),
      updatedAt: String(entry?.updatedAt || "").trim()
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
  return historySharedTemplateOptions([
    ...adminSharedHistoryEntries(adminTemplateHistoryRecords),
    ...allSharedLayoutsByAdminOrder()
  ], {
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
    renderHistoryTemplateSourceSelect({
      language: normalizeUiLanguage(uiLanguage),
      options: demoOptions,
      select: refs.historyDemoSelect,
      selectedValue: selected,
      showDeleted: refs.historyDemoDeletedToggle?.dataset.showDeleted === "true",
      t,
      toggleButton: refs.historyDemoDeletedToggle
    });
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
    renderHistoryTemplateSourceSelect({
      language: normalizeUiLanguage(uiLanguage),
      options: sharedOptions,
      select: refs.historySharedSelect,
      selectedValue: selected,
      showDeleted: refs.historySharedDeletedToggle?.dataset.showDeleted === "true",
      t,
      toggleButton: refs.historySharedDeletedToggle
    });
  }
}

async function refreshHistoryDialog() {
  if (canOpenAdminPublishedEdit()) {
    try {
      const catalog = await apiFetch("/bike-packing/admin/template-records", { silentErrors: true });
      adminTemplateHistoryRecords = normalizeAdminTemplateHistoryRecords(catalog?.lists);
    } catch {
      // The already loaded local/public catalogs still keep history usable on older APIs.
    }
  }
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
    lists = privateHistoryListRecords(normalizePackingListsResponse(catalog)
      .map((list) => normalizeRemoteListRecord(list))
      .filter((list) => remoteRecordId(list) && !isReadOnlyBikePackingRecord(list)), adminTemplateHistoryRecords);
  } catch {
    lists = [];
  }

  const currentListId = await ensureCurrentPackingListId();
  if (!isAdminTemplateHistoryListId(currentListId, adminTemplateHistoryRecords)
    && !lists.some((list) => remoteRecordId(list) === currentListId)) {
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

function historyUndoActionText(record, index = historyRecords.indexOf(record), records = historyRecords) {
  return historyRestoreActionText(record, index, records, {
    restoreBeforeChangeText: t("history.restoreBeforeChange"),
    restoreCheckpointText: t("history.restoreBeforeCheckpoint"),
    undoText: t("history.undoShort")
  });
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
        restoreScopeText: historyRestoreScopeText(record, index, records, {
          forceFull: activeHistorySource !== "private",
          localText
        }),
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
    const sharedId = refs.historySharedSelect?.value || "";
    const layout = historySharedTemplateSelectOptions().find((entry) => entry.id === sharedId);
    return layout?.name ? `${t("history.sourceTemplate")} · ${layout.name}` : t("history.sourceTemplate");
  }
  return t("history.sourceMine");
}

async function preparePersonalArchiveImportAction({ backupImportState, mode, selectedIds = new Set(), rows = [] }) {
  if (!personalSavePilotEnabled() || !localStorageScopeKey.startsWith("id:")
    || isReadOnlyBikePackingContext() || isAdminPublicEditScope(modeState)) return null;
  personalSaveRecovery.assertRunning();
  const outbox = personalSaveOutboxForScope();
  if (!outbox) throw Error("Сначала подтвердите личный список.");
  const source = clone(backupImportState.state), names = clone(state.layouts), layoutTargets = [];
  for (const { layout, existing } of mode === "full" ? [] : rows.filter(row => selectedIds.has(row.layout.id))) {
    const targetId = mode === "copy" ? crypto.randomUUID()
      : existing?.id || (!state.layouts[layout.id] ? layout.id : crypto.randomUUID());
    const name = mode === "copy" ? backupCopyLayoutName(layout.name, backupImportState.manifest?.createdAt, names,
      backupImportState.manifest?.language || "ru") : layout.name;
    layoutTargets.push({ sourceId: layout.id, targetId, name }); names[targetId] = { id: targetId, name };
  }
  const editMeta = {}; markEdited(editMeta);
  const hasPhotos = value => ["items", "containers"].some(collection => Object.values(value[collection] || {}).some(owner => owner.photos?.length));
  const withPhotos = hasPhotos(source) || hasPhotos(state);
  const usePhotoProtocol = withPhotos || PERSONAL_IMPORT_PHOTO_FORM_ENABLED && PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED && personalPhotoFormUiEnabled();
  const getContext = () => ({ ...personalSaveContext(), activeLayoutId: state.activeLayoutId });
  // Recovery must still read the native bytes after the editor's error latch.
  // Capture/adoption check the editing latch separately; the store independently
  // verifies account/list/generation without requiring an editable screen.
  const archiveSource = usePhotoProtocol ? { outbox, store: createPersonalPhotoActionStore({ ...outbox.binding, getContext }), inventory: null } : null;
  if (withPhotos && (!PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED || !personalPhotoFormUiEnabled())) throw Error("Импорт архива с фотографиями ещё не включён.");
  const options = { source, mode, layoutTargets, sourceActiveLayoutId: source.activeLayoutId || "", editMeta, outbox,
    getContext,
    getState: () => ({ ...state, activeLayoutId: state.activeLayoutId }), getRevision: () => Number(syncMeta.stateRevision),
    makeSnapshot(payload, previous, activeLayoutId) {
      const snapshot = normalizeRemoteState({ ...payload, activeLayoutId }, { repairCatalog: false });
      if (!snapshot) throw Error("Не удалось прочитать подготовленное состояние архива.");
      applyLayoutArrangement(activeLayoutId, snapshot);
      return personalSnapshotWithUiPreferences(snapshot, JSON.stringify(previous));
    },
    onCaptured(saved) {
      personalSaveRecovery.assertRunning();
      if (usePhotoProtocol) assertPersonalArchivePhotoRecord(saved);
      replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
      if (usePhotoProtocol) { personalPhotoFormLiveSource = archiveSource; personalPhotoRecoverySource = archiveSource; }
      rememberActiveLayoutChoice(saved.snapshot.activeLayoutId);
      syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso(); saveSyncMeta();
      renderPreservingPackingScroll();
      updateSyncUi("Архив сохранён на устройстве и ждёт подтверждения сервера."); scheduleRemoteSave();
    }
  };
  if (!usePhotoProtocol) return preparePersonalArchiveImport(options);
  const commit = await preparePersonalArchivePhotoImport({ ...options, store: archiveSource.store, photoFiles: backupImportState.photoFiles });
  return async () => {
    personalPhotoFormPreparing++; personalPhotoRecoverySource = archiveSource;
    try { personalSaveRecovery.assertRunning(); return await commit(); }
    catch (error) { reportPersonalPhotoFormError(error, { recovery: error.archivePhotoRecovery || commit.recoveryCopy() }); throw error; }
    finally { personalPhotoFormPreparing--; }
  };
}

async function preparePersonalHistoryRestoreAction(record, layoutIds) {
  personalSaveRecovery.assertRunning();
  const listId = String(record?.listId || record?.list_id || "");
  if (activeHistorySource !== "private" || record?.source !== "bike_packing_list_history"
    || listId !== currentPackingListId || isAdminPublicEditScope(modeState) || isReadOnlyBikePackingContext()) {
    throw Error("Восстановление доступно только для истории текущего личного списка.");
  }
  const outbox = personalSaveOutboxForScope();
  if (!outbox) throw Error("Сначала подтвердите личный список.");
  return preparePersonalHistoryRestore({ historyId: Number(record.id), layoutIds, outbox,
    photoRestoreEnabled: PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED,
    getContext: () => { personalSaveRecovery.assertRunning(); return { ...personalSaveContext(), activeLayoutId: state.activeLayoutId, historySource: activeHistorySource }; },
    getState: () => ({ ...state, activeLayoutId: state.activeLayoutId }), getRevision: () => Number(syncMeta.stateRevision),
    readPreview(historyId, selected) {
      const params = new URLSearchParams(); selected.forEach(id => params.append("layoutId", id));
      if (PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED) params.set("photos", "1");
      return apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/history/${historyId}/restore?${params}`, {
        timeoutMs: LIST_API_TIMEOUT_MS, silentErrors: true
      });
    },
    makeSnapshot(payload, previous) {
      const activeLayoutId = payload.layouts?.[previous.activeLayoutId] ? previous.activeLayoutId : payload.activeLayoutId;
      const snapshot = normalizeRemoteState({ ...payload, activeLayoutId }, { repairCatalog: false });
      if (!snapshot) throw Error("Не удалось прочитать подготовленную версию истории.");
      applyLayoutArrangement(activeLayoutId, snapshot);
      return personalSnapshotWithUiPreferences(snapshot, JSON.stringify(previous));
    },
    onCaptured(saved) {
      replaceState(saved.snapshot, { personalOperationId: saved.action.operationId });
      syncMeta.dirty = true; syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      renderPreservingPackingScroll();
      updateSyncUi("Восстановление сохранено на устройстве и ждёт подтверждения сервера.");
      scheduleRemoteSave();
    }
  });
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
      await publishPublicHistoryRecord(detail.record, restoredState, {
        index,
        records,
        navigationContext: historyNavigationContext
      });
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
  let commitPersonalRestore = null;
  if (personalSavePilotEnabled()) {
    try { commitPersonalRestore = await preparePersonalHistoryRestoreAction(record, restoreLayoutIds); }
    catch (error) { showToast(error.message, "error"); return; }
  }
  const confirmed = await askConfirmDialog(historyUndoConfirmation({
    actionText: historyUndoActionText(record, index, records),
    ...impact,
    layoutName: restoredLayoutName,
    localText,
    quantityStorageScope: historyQuantityStorageScope(record)
  }));
  if (!confirmed) return;
  if (commitPersonalRestore) {
    try {
      if (!commitPersonalRestore()) return;
      refs.historyDialog.close(); refs.historyDetailDialog?.close();
      showToast("Восстановление записано в очередь. Проверяем подтверждение сервера.", "success");
    } catch (error) { showToast(error.message, "error"); }
    return;
  }
  refs.historyDialog.close();
  refs.historyDetailDialog?.close();
  updateSyncUi(localText("Undoing the action on the server...", "Отменяю действие на сервере..."));
  try {
    const navigationContext = historyNavigationContext || captureHistoryNavigationContext({
      state,
      view: getCurrentView(),
      viewport: captureViewportSnapshot()
    });
    await restorePrivateHistoryRecordOnServer(record, {
      layoutScoped: !impact.isDeepRollback,
      preferredLayout: preferredHistoryLayout(navigationContext),
      preservePublicDraftId: navigationContext?.scope?.adminPublishedEditLayoutId || ""
    });
    restoreHistoryNavigationContext(navigationContext, {
      currentView: getCurrentView,
      restoreLayout: (layout) => restoreHistoryActiveLayout(state, layout, { applyLayoutArrangement }),
      restoreScope: restoreModeState,
      restoreViewport: restoreViewportSnapshot,
      switchView
    });
    renderPreservingPackingScroll();
    showToast(localText("Action undone.", "Действие отменено."), "success");
  } catch (error) {
    updateSyncUi(localText(`Could not undo the action: ${error.message}`, `Не удалось отменить действие: ${error.message}`));
    showToast(localText(`Could not undo the action: ${error.message}`, `Не удалось отменить действие: ${error.message}`), "error");
  }
}

async function restorePrivateHistoryRecordOnServer(record, {
  layoutScoped = true,
  preferredLayout = null,
  preservePublicDraftId = ""
} = {}) {
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
  if (!applyRemoteState(restoredState, updatedAt, integrityMeta, recordData.payload, {
    allowDestructive: true,
    preferredLayout,
    preservePublicDraftId
  })) {
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
  const selected = historySharedTemplateSelectOptions().find((entry) => entry.id === sharedId);
  return sharedId ? {
    type: "shared",
    sharedId,
    language: selected?.language || uiLanguage,
    name: selected?.name || sharedId
  } : null;
}

async function publishPublicHistoryRecord(record, payload, {
  index = 0,
  records = historyRecords,
  navigationContext = null
} = {}) {
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
  const restoringDeletedTemplate = record?.action?.entityType === "templates" && record.action.operation === "removed";
  const impact = historyRollbackImpact(record, index, records);
  const confirmed = await askConfirmDialog(restoringDeletedTemplate
    ? {
      title: t("history.restoreDeletedTemplateQuestion"),
      text: t("history.restoreDeletedTemplateText"),
      okText: t("history.restoreDeletedTemplate"),
      cancelText: localText("Cancel", "Отмена")
    }
    : historyUndoConfirmation({
      actionText: historyUndoActionText(record, index, records),
      ...impact,
      localText,
      quantityStorageScope: historyQuantityStorageScope(record)
    }));
  if (!confirmed) return;
  await assertAdminApiCompatibility({ force: true });
  const path = target.type === "demo"
    ? demoAdminStatePathForPublicListId(target.demoListId || "", target.language || uiLanguage)
    : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
  const targetLanguage = target.type === "demo"
    ? target.language || uiLanguage
    : target.language || findSharedLayout(target.sharedId)?.language || uiLanguage;
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
      historyRestore: true,
      restoreHistoryId: Number(record.id || 0),
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
    upsertDemoTemplateCatalogEntry(target.language || uiLanguage, {
      listId: target.demoListId || "",
      name: historyPayloadTitle(publishedPayload, record.title || demoTemplateFallbackName(target.language || uiLanguage)),
      updatedAt: publishedUpdatedAt,
      serverConfirmed: true,
      missing: false
    });
  } else {
    const sharedLayout = upsertRuntimeSharedLayout(sharedLayoutsByLanguage, {
      id: target.sharedId,
      name: target.name || historyPayloadTitle(publishedPayload, target.sharedId),
      language: targetLanguage,
      statePayload: publishedPayload,
      runtimeSharedTemplate: true,
      updatedAt: publishedUpdatedAt
    });
    forgetDeletedSharedLayoutId(target.sharedId);
    serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(serverConfirmedSharedLayouts, [sharedLayout]);
    publishedItemKeyStateCache.set(sharedLayoutItemKey(target.sharedId), publishedPayload, {
      updatedAt: publishedUpdatedAt
    });
  }
  const replacement = replaceActivePublishedHistoryDraft({
    activateLayout: (layoutId, options) => activateAdminPublishedLayout(layoutId, options),
    createWhenMissing: true,
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
  const restoredNavigationContext = retargetMissingHistoryLayout(navigationContext, {
    layouts: state.layouts,
    replacement
  });
  restoreHistoryNavigationContext(restoredNavigationContext, {
    currentView: getCurrentView,
    restoreLayout: (layout) => restoreHistoryActiveLayout(state, layout, { applyLayoutArrangement }),
    restoreScope: restoreModeState,
    restoreViewport: restoreViewportSnapshot,
    switchView
  });
  renderPreservingPackingScroll();
  updateSyncUi();
  const droppedPhotoCount = Number(data?.droppedMissingPhotoCount || 0);
  showToast(
    droppedPhotoCount
      ? t("history.restoredWithoutMissingPhotos", { count: droppedPhotoCount })
      : localText("Action undone.", "Действие отменено."),
    droppedPhotoCount ? "warning" : "success"
  );
}

function switchView(view) {
  const previousView = getCurrentView();
  const viewChanged = previousView !== view;
  if (previousView === "packing" && viewChanged) {
    capturePackingScroll();
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  refs.packingView.classList.toggle("hidden", view !== "packing");
  refs.itemsView.classList.toggle("hidden", view !== "items");
  refs.bagsView.classList.toggle("hidden", view !== "bags");
  refs.settingsView.classList.toggle("hidden", view !== "settings");
  if (viewChanged) {
    syncMainViewScrollHost(view, {
      documentRef: document,
      navigatorRef: navigator,
      windowRef: window
    });
  }
  renderSummary();
  updateViewScopedControls(view);
  updateFilterNavigationUi();
  if (view === "packing") {
    requestAnimationFrame(() => restorePendingPackingScroll(getPackingScrollHost()));
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
  const currentView = getCurrentView();
  const currentFilterRoot = currentView === "packing"
    ? refs.packingView
    : currentView === "items"
      ? refs.itemsView
      : currentView === "bags"
        ? refs.bagsView
        : null;
  updateFilterHighlights({
    noResults: contentFilterHasNoResults({
      active: hasActiveContentFilter(),
      context: isFilterContextActive(),
      contextHasMatches: currentView === "packing"
        ? getVisibleLayoutRootIds().some(containerHasVisibleFilterResult)
        : null,
      root: currentFilterRoot
    })
  });
  updateViewScopedControls();
  updateFilterNavigationUi();
  scheduleFixedScrollbarRefresh();
  bindPhotoGalleries(document, photoGalleryBindingOptions());
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
  stickyFilterControlsController.updateHeights();
}

function updateCompactStickyControls() {
  stickyFilterControlsController.update();
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
  if (hasExplicitViewportScrollIntent()) {
    updateSearchFocusState();
    return;
  }
  const lock = captureSearchBlurViewportLock();
  if (!lock) {
    updateSearchFocusState();
    return;
  }
  const restore = () => {
    if (hasExplicitViewportScrollIntent()) return;
    restoreSearchBlurViewportLock(lock);
  };
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
    windowX: viewportScrollLeft()
  };
}

function restoreSearchBlurViewportLock(lock) {
  updateCompactStickyControls();
  if (!lock.element?.isConnected) return;
  const board = lock.view === "packing" ? getPackingScrollHost() : null;
  if (board) board.scrollLeft = lock.boardLeft;
  const rect = lock.element.getBoundingClientRect();
  scrollViewportTo({
    left: lock.windowX,
    top: Math.max(0, viewportScrollTop() + rect.top - lock.top),
    behavior: "auto"
  });
  syncFixedScrollbarVisibility();
}

function renderContainerWeightText(weight) {
  return shouldShowItemLabels() ? `<span class="container-weight">${formatWeight(weight)}</span>` : "";
}

function renderPreservingPackingScroll({ refreshPhotoDialogs = true } = {}) {
  const board = getPackingScrollHost();
  if (board && !refs.packingView.classList.contains("hidden")) {
    capturePackingScroll();
  }
  render();
  if (refreshPhotoDialogs) refreshOpenPhotoDialogPreviews();
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
    canEditLocalUnpublishedAdminTemplate,
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
  const label = localText(
    `Card mode: ${itemDisplayModeLabel(mode, localText)}`,
    `Режим карточек: ${itemDisplayModeLabel(mode, localText)}`
  );
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

function updateFilterHighlights({ noResults = false } = {}) {
  const searchActive = Boolean(refs.searchInput.value.trim());
  const locationActive = Boolean(refs.locationFilter.value);
  const categoryActive = selectedCategoryFilters.length > 0;
  applyContentFilterHighlight({
    refs,
    searchActive,
    locationActive,
    categoryActive,
    noResults,
    activeBadgeText: t("filters.activeBadge"),
    noResultsBadgeText: t("filters.noResultsBadge")
  });
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
    scrollViewportTo({ left: 0, top: 0, behavior: "auto" });
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
  const categoryOptionsHtml = categoriesToShow.map((category) => {
    const id = `filter-category-${cssSafeId(category)}`;
    return renderCategorySearchOption({
      category,
      label: dictionaryValueLabel(category),
      id,
      checked: selectedSet.has(category),
      className: "category-option category-filter-option"
    });
  }).join("");
  refs.categoryFilterList.innerHTML = categoryOptionsHtml
    ? categoryOptionsHtml + categorySearchEmptyHtml(t("categories.searchEmpty"))
    : `<div class="empty">${escapeHtml(t("empty.noCategoriesForSearch"))}</div>`;
  resetCategorySearch(refs.categoryFilterSearch, refs.categoryFilterList, {
    emptyText: t("categories.searchEmpty")
  });
  syncCategoryFilterResetVisibility(refs.categoryFilterList, refs.resetCategoryFilterBtn);
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
  const message = localText("Reset the demo layout to the original example?", "Сбросить демо-укладку к начальному примеру?");
  openConfirmDialog({
    title: localText("Reset data?", "Сбросить данные?"),
    text: message,
    okText: localText("Reset", "Сбросить"),
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
