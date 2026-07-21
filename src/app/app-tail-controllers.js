import {
  applyPhotoPrimaryButtonState,
  photoPrimaryButtonState,
  resolvePhotoPrimaryButtonPhotoCount
} from "../ui/photo-primary-button.js";
import {
  applyLayoutNotes,
  normalizeLayoutNotes
} from "../state/layout-notes.js";
import {
  isLayoutNotesCollapsed,
  LAYOUT_NOTES_COLLAPSE_STORAGE_KEY,
  setLayoutNotesCollapsed
} from "../ui/layout-notes-collapse.js";
import { profileDisplayNameRequest, renderProfileSettingsHtml } from "../ui/profile-settings.js";
import { moveOrderedPhoto, photoOrderIdentity, renderPhotoOrderRows } from "../ui/photo-order-dialog.js";
import {
  clipboardImageFiles,
  readClipboardImageFiles,
  shouldHandlePhotoPasteTarget
} from "../ui/photo-clipboard.js";
import {
  isContainerReplacementCandidateInLayoutState,
  isTemporaryContainerInLayoutState,
  replaceContainerInLayoutState,
  replaceItemInLayoutState
} from "../state/layout-replace.js";
import { orderedLayouts } from "../state/layout-order.js";
import { itemRecordIsPublicNamespaceSource } from "../state/layout-copy-policy.js";
import {
  persistPublicTemplateOrderUpdates,
  publicTemplateOrderUpdates
} from "../public/public-template-order-sync.js";
import {
  capturePackingPhotoRenderState,
  restorePackingPhotoRenderState
} from "../ui/packing-photo-preservation.js";
import {
  buildSharedEntityUrlFromHref,
  readSharedEntityPublishOptions,
  sharedEntityBelongsToLayout,
  sharedEntityLinkResultHtml,
  sharedEntityPublishDialogHtml,
  shouldShowSharedEntityPlacement
} from "../public/shared-entity-link.js";
import { dialogHasSavableChanges } from "../ui/dialog-save-guard.js";
import { normalizeAuthAuthorization } from "../auth/permissions.js";
import { focusCreatedCatalogCard } from "../ui/catalog-created-focus.js";
import { shouldShowContainerPickerLayoutSelect } from "../ui/container-picker-layout-select.js";
import { resetDialogScrollPosition } from "../ui/modal-focus.js";
import {
  bindEmptyCategoryPicker,
  renderEmptyCategoryPicker
} from "../ui/category-picker-empty.js";
import {
  categorySearchEmptyHtml,
  renderCategorySearchOption,
  syncCategorySearchAvailability
} from "../ui/category-search.js";
import { acquirePhotoUploadSlot } from "../sync/photo-upload-lock.js";
import { containerCopySnapshotForContext } from "../public/copy-published-container.js";
import { resetContentFilterControls } from "../ui/filter-controls.js";

export function createAppTailControllers(ctx) {
  const runtime = ctx.runtime;
  let itemDialogPhotoPreviewRenderToken = 0;
  let rootContainerDialogPhotoPreviewRenderToken = 0;
  let itemDialogPhotoPreviewPhotoCount = 0;
  let rootContainerDialogPhotoPreviewPhotoCount = 0;
  let containerPickerSourceIsNestedContainer = false;
  let containerPickerCopyIncludesContents = true;
  let rootContainerDialogCopyIncludesContents = true;
  let sharedPickerCopyIncludesContents = true;
  let layoutOrderDragId = "";
  let layoutEditInitialSnapshot = null;
  let layoutOrderDraftSections = null;
  let layoutOrderInitialSignature = "";
  let photoOrderContext = null;
  let photoOrderInitialSignature = "";
  let replacingPackingItemId = "";
  let replacingPackingContainerId = "";
  let placeNewRootInCurrentLayout = false;
  let rootContainerPlacementTargetLayoutId = "";
  let layoutRootTargetLayoutId = "";
  let pendingCopyTargetLayoutCreation = null;
  let pendingCopyTargetContainerSetup = null;
  const {
    ACTIVE_LAYOUT_CHOICE_KEY, ACTIVE_LAYOUT_CHOICE_SOURCE_KEY, ACTIVE_LIST_ID_KEY, ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY,
    API_TIMEOUT_MS, APP_VERSION, AUTH_SIGNED_OUT_KEY, BASE_STATE_KEY,
    DATA_ITEM_KEY, DATA_SCOPE_KEY, DEFAULT_LANGUAGE, DEMO_LAYOUT_SELECT_VALUE, DEMO_SHARED_LAYOUT_ID,
    EDGE_SCROLL_MAX_SPEED, EDGE_SCROLL_ZONE, ENTITY_SYNC_CONFIG, FORCE_OFFLINE_KEY, GUEST_DEMO_COPY_FLAG,
    GUEST_LAYOUT_FALLBACK_NAME, GUEST_STORAGE_SCOPE, I18N, ITEM_DISPLAY_MODE_DEFAULT, ITEM_DISPLAY_MODE_PUBLIC_DEFAULT,
    LIST_API_TIMEOUT_MS, LIST_SAVE_API_TIMEOUT_MS, NESTED_GROUP_HOVER_DELAY_MS, PACKING_VISUAL_STYLE_OPTIONS, PACKING_VISUAL_STYLE_PRIMARY,
    PACKING_VISUAL_STYLE_SETTINGS_VERSION, POINTER_DRAG_START_DISTANCE, PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY, RECOVERY_STATE_KEY, RECOVERY_STATE_MAX,
    REMOTE_REFRESH_INTERVAL_MS, REQUIRED_ADMIN_API_CAPABILITIES, REQUIRED_ADMIN_API_VERSION, SEARCH_RENDER_DEBOUNCE_MS, SESSION_MODE_ADMIN,
    SESSION_MODE_GUEST, SESSION_MODE_USER, SHARED_CONTAINER_COPY_PICKER_MODE, SHARED_ITEM_COPY_PICKER_MODE, SHARED_LAYOUTS_STORAGE_KEY,
    SHARED_LAYOUT_QUERY_PARAM, SHARED_LIST_QUERY_PARAM, STATE_SCOPE_DEMO, STATE_SCOPE_PRIVATE, STATE_SCOPE_SHARED,
    STORAGE_KEY, SUPPORTED_LANGUAGES, SYNC_META_KEY, TOUCH_DRAG_CANCEL_DISTANCE, TOUCH_DRAG_DELAY_MS,
    TOUCH_SCROLL_CANCEL_DISTANCE, UI_SETTINGS_KEY, VIEW_SCOPE_ADMIN_PUBLIC_EDIT, VIEW_SCOPE_DEMO, VIEW_SCOPE_GUEST_LOCAL,
    VIEW_SCOPE_PRIVATE, VIEW_SCOPE_SHARED, activateAdminPublishedLayout, activateLocalStorageScope, activateLocalStorageScopeForCurrentUser,
    activateOfflineRememberedSession, activateSharedPayloadLayout, activeAdminDraftOptionLabel, activeDemoTemplateListId, activeDictionaryList,
    activeDictionaryOwner, activeEditableLayoutIdForState, activeHistorySource, activeLayoutNestedContainerIdsForState, activeReadOnlyDictionaryOwner,
    activeReadOnlyLayoutId, activeReadOnlyLayoutIdFromScope, addBackupDictionaryValues, addCustomDictionaryValue, addItemToLayoutArrangementForState, addRootContainerToLayoutInState,
    addPhotosToDraft, adminApiCompatibility, adminApiWarningFromCapabilities, adminApiWarningFromCapabilitiesValue, adminDemoTemplateCatalogEntries,
    adminDemoTemplateOptionsForLanguage, adminPublicLayoutOptions, adminReportsDialogController, adminSharedTemplateOptions, adminTemplateDraftChoice,
    allActiveLayoutNestedContainersCollapsedForState, allSharedLayoutsByAdminOrder, annotatePayloadError, apiCapabilitySet, apiErrorMessage,
    apiFetch, apiFetchRequest, apiUploadFormData, apiUploadFormDataRequest, appUnlocked,
    appendCopiedFromTemplateNote, applyBackupRestoreModeUi, applyCategoryFilterDialog, applyCollectionModeFromSource, applyConflictChoices, applyConflictChoicesToState,
    applyDefaultCollapsedContainers, applyEditMeta, applyEntityChangesToState, applyGuestLocalDisplayPreferences, applyItemAvailabilityStatus, applyLayoutArrangement,
    applyLayoutArrangementToState, applyLayoutEditFields, applyLoadedStateToCurrentScope, applyPackingVisualStyle, applyPackingVisualStyleClass,
    applyLayoutLocked, applyPreferredPrivateLayoutChoice, applyPublicTemplateLanguage, applyPublicTemplateMetadataToPayload, applyPublishedPayloadPhotosToLayoutState, applyRemoteState,
    applySearchInputNow, applyStaticTranslations, applyStaticTranslationsUi, applyingLayoutArrangement, applyingRemoteState,
    arePublishedTemplatesBlocked, askConfirmDialog, askConflictResolution, askPrintLabelsChoice, askUnsavedChangesDialog,
    assertAdminApiCompatibility, assertEntitySyncConfirmed, assertEntitySyncListFreshnessApi, assertPublishedTemplateCopyConfirmed, assertRemoteStateIntegrity,
    adminBackupPayloads, backupDownloadName, bestCatalogListRecord, bestMeaningfulLayoutId, bindBoardScroll, bindDictionaryControls,
    bindFixedScrollbar, bindStickyRootHeaderRow, bindHorizontalTouchScroll, bindLayoutEditorControls, bindLayoutOrderPointerDrag, bindLongPressTooltips, bindPackingEventsUi, bindPhotoGalleries,
    bindRootContainersEditorControls, bindSettingsPointerDragUi, bindSharedLayoutEvents, bindSharedVirtualEvents, bindSharedVirtualEventsUi,
    blockDestructiveLocalSave, blockDestructiveRemoteState, blockRemoteIntegrityFailureIfNeeded, blurActiveEditableBeforeButtonAction, buildAdminDemoTemplateOptions,
    backupAdminTemplateRows, buildAdminSharedTemplateOptions, buildBackupLayoutRows, buildBackupPhotoEntries, buildChangedEntitySyncEntries, buildChangedEntitySyncEntriesForSync,
    buildCurrentBackupManifestValue, buildEntitySyncBody, buildEntitySyncBodyForSync, buildListSaveBody, buildListSaveBodyForSync,
    buildPrintableDocument, buildRememberedOfflineUser, buildSharedListUrl, buildSharedListUrlFromHref, canAddUsageEntries,
    canDeleteActiveLayoutForState, canEditManagedAdminTemplateNow, canEditPublishedTemplatesNow, canLocalStateOverrideRemote, canOpenAdminPublishedEdit, canReplaceLayoutCreateNameSuggestionValue,
    canRequestEntityChanges, canSeedEmptyRemoteFromLocal, canUseCachedStartupState, canUseLocalEditableState, canUsePrivateState,
    canViewAdminPublishedCatalog, cancelPublishedLayoutSave, capitalize, captureActiveLayoutArrangement, captureBike3dDetailViewport,
    captureSearchBlurViewportLock, catalogActionTargetIds, categories, checkAdminApiCompatibility, checkAuthAndLoad,
    checkAuthAndLoadFlow, checkRemoteStateFreshness, chooseContainerTreeCopyToLayoutAction, chooseDefaultPackingList, chooseSharedCopyTargetLayoutId,
    cleanPublishedEntityId, cleanupEmptyContainersInLayoutArrangement, cleanupEmptyContainersInState, cleanupGeneratedCatalogArtifacts, clearActiveAdminDemoStateOnStartup,
    clearCategoryFilter, clearLocalStorageScope, clearOfflineRememberedSession, clearReadOnlyPackingListContextForPrivateMutation,
    clearSearch, clearSelectFilter, clearStaleDirtyFlagIfNoLocalChanges, clone, cloneIsolatedPublicEntity,
    clonePlain, cloneStateForSync, cloneStateForSyncPayload, closeDialogWithoutRestoringFocus, closeTopMenu,
    collapsedDefaultsForTemplateContainers, collectManagedPublicDraftRecords, collectPublicLayoutRecordIds, commitSearchInputForNavigation, comparableValueForMerge,
    containerCopyExcludedLayoutIds,
    compareDemoTemplateOrder, compareSharedLayoutAdminOrder, compareSharedLayoutIndexEntries, compareSharedTemplateAdminOrder, confirmContainerTreeCopyToLayout,
    confirmCreateLayoutFromReadonlyTemplate, confirmGuestImportRemoteState, confirmLoadedDemoPublicTemplate, confirmPublicCopyDuplicates, confirmPublicLayoutTransition,
    confirmRepeatedSharedLayoutCopy, conflictDefaultChoice, conflictFormatter, conflictKindLabel, conflictLabel,
    conflictSummary, conflictTimestamp, conflictVersionStamp, consumeGuestLocalLayoutCandidate, containerCategories,
    containerCreatedTimeForState, containerEntitySyncUnavailable, containerPathForState, containerTreeSnapshotScore, containerWeightForState,
    copyItemInState, copyMissingLayoutSnapshotItemsToLayout, copyMissingPublicSnapshotItemsToLayout, copyPickerLayoutLabel, copyPublishedContainerToState,
    copyPublishedContainerToStateValue, copyPublishedDemoStateToLocalLayout, copyPublishedItemToState, copyRecordPhotosForLocalDuplicate,
    copySharedItem, copySharedItemToLayoutContainer, copySharedItemToState, copySharedLayout, copySharedListLink,
    copySharedRoot, copySharedRootToLayoutContainer, copySharedRootToState, countPrivateLayouts,
    createAdminReportsDialogController, createBackupZip, createBlankBikePackingState, createConfirmDialogController, createConflictValueFormatter,
    createDeletedSharedLayoutStore, createDemoTemplateCopyRecord, createDemoTemplateListId, createEmptyLayoutArrangement, createEmptyPublicTemplateDraftRecord,
    createEmptyPublicTemplateState, createEmptyUserState, createGroupFromItemsInState, createItemPhotoFromFile, createLayoutArrangementFromCurrentState,
    createLayoutCopyRecordFromSource, createLayoutLoadStatusController, createLegacyPersonalSyncWriteBlockedError, createLocalDemoCopy, createManagedLayoutCopyRecord,
    createMetaForDevice, createModalScrollLockController, createNewPublicTemplateDraftRecordValue, createPackingDragController, createPhotoDraftFromRecord,
    createPrintWindowTarget, createPrivateLayoutFromTemplateSourceRecord, createPublicTemplatePayloadCache, createReadOnlyBikePackingError, createRefs,
    createRemoteListRecordSelector, createSharedLayoutCatalogDiagnostics, createSharedLayoutsByLanguage, createSharedVirtualStateForPublic, createSkippedPersonalListApiError,
    createTemplateCopyFromSourceFlow, createTemplateCopyLayoutRecordValue, createTemplateCopyRecord, currentAdminApiWarning, currentCreateMeta,
    currentDemoTemplate, currentEditMeta, currentHistoryComparisonState, currentLayoutChoice, currentPackingListId,
    currentPackingListMeta, currentPageScrollPosition, currentPublicTemplateStatusMessage, currentPublishedTemplateBlockReason, currentSessionMode,
    currentSharedLayouts, currentUsageLimit, currentUser, currentUserEmail, currentUserId,
    currentUserIdFromStorage, currentUserSyncKey, currentViewScope, cycleDictionarySortMode, defaultBike3dViewState,
    defaultDemoState, defaultRootContainerLocation, deleteCachedPhoto, deleteItemFromState, deletePublishedDemoTemplateRecord, deletePublishedSharedTemplateRecord,
    deleteRemotePhotoIfPossible, deleteRootContainerFromState, deleteUnusedLayoutContainerEntityFromState, demoAdminPathForPublicListId, demoAdminPathForPublicListIdFromScope,
    demoAdminStatePathForPublicListId, demoAdminStatePathForPublicListIdFromScope, demoCopyActionText, demoCopyLayoutName, demoCopyPreferredTemplateName,
    demoCopyTemplateListId, demoLanguageFromLayoutChoice, demoLanguageFromLayoutChoiceValue, demoLayoutChoiceForLanguage, demoLayoutChoiceForLanguageValue,
    demoLayoutChoiceForTemplate, demoLayoutChoiceForTemplateValue, demoPublicListIdForLanguage, demoPublicListIdForLanguageFromScope, demoSharedLayout,
    demoStatePayloadForLanguage, demoTemplateChoiceForEntry, demoTemplateChoiceForLanguage, demoTemplateChoiceForLayout, demoTemplateEntryForLanguage,
    demoTemplateFallbackName, demoTemplateForLanguage, demoTemplateIdFromLayoutChoice, demoTemplateIdFromLayoutChoiceValue, demoTemplateNameCandidates,
    demoTemplateNameFromPayload, demoTemplatesForLanguage, demoTemplatesForUiLanguage, dictionaryCategorySortMode, dictionaryEditScope,
    dictionaryEntitySyncUnavailable, dictionaryListForOwner, dictionaryLocationSortMode, dictionaryOptionsForOwner, dictionaryOptionsForUi,
    dictionaryOptionsForUiValues, dictionarySelectEntry, dictionarySortModeForType, dictionaryValueLabel, draftPhotosToCleanup, createSubcontainerInLayoutState, duplicateContainerSnapshotRecords,
    duplicateItemToContainerInLayoutState, duplicateRootContainerInState, duplicateSnapshotItemToContainerInLayoutState, editMetaForDevice, editSharedSourceAsAdmin,
    editedLayoutName, editingItemTitleId, ensureAdminPublicCopyTargetsAvailable, ensureCurrentPackingListId, ensureGuestDemoPreviewPayload,
    ensureGuestPublicScope, ensureItemDisplayModeState, ensureLayoutContainerPlacementForState, ensureLayoutDictionaries, ensureLayoutDictionariesForState,
    ensurePrivateDictionaries, ensurePrivateDictionariesForState, ensurePrivateStateForSharedCopy, ensureSharedCopyTargetLayoutId, enterSignedOutPublicMode,
    entitySyncBodyContext, entitySyncStateDeps, escapeHtml, expandedHistoryGroups, expandedHistoryRecordId,
    explicitLayoutChoice, exportLayoutAsDemoState, exportLayoutAsPublishedState, fallbackDemoTemplateEntry, fetchAdminReports,
    fetchBikePackingApiCapabilities, fetchPublicSharedLayoutCatalog, fetchPublicTemplatePayloadRecordByItemKey, fetchPublishedDemoTemplateState, fetchPublishedListStateById,
    fetchRemoteListChangesRecord, fetchRemoteListDetailRecord, fetchRemoteListFreshnessRecord, fetchRemoteListStateRecord, fetchRemoteListStateSnapshot,
    fetchRemoteStateRecord, fetchSharedListLinkRecord, fetchStateRecordByItemKey, fetchStateRecordMetaByItemKey,
    fetchStateRecordPayloadByItemKey, filterAutoResolvedMergeConflicts, findCopiedSharedLayout, findDemoTemplateForLanguage,
    findMaterializedSharedContainerId, findMaterializedSharedItemId, findSharedItem, findSharedLayout, findSharedLayoutForLanguage,
    findSharedPublishedContainer, findSharedPublishedItem, findSharedRoot, fixedScrollbarRefreshFrame, flushActivePublishedEditSave,
    forgetDeletedSharedLayoutId, formatFullDateTime, formatHistoryDateTime, formatItemWeight, formatMergeConflicts,
    formatThingCount, formatVolume, formatWeight, fullBackupRestoreConfirm, generatedCatalogString,
    getActiveEditableLayoutId, getBike3dPackingScrollHost, getCachedPhoto, getContainerItemIdsDeepForState, getCurrentView,
    getDescendantContainerIdsForState, getItemContainerIdInLayoutForState, getLayoutContainerIdSetForState, getLayoutCreateCopySourceOptions, getLayoutDescendantContainerIdsForState,
    getLayoutItemIdSetForState, getPublishedEditLayoutId, getPublishedWorkLayout, getSavedAuthEmail,
    getSavedAuthEmailFromStorage, getTemplateCopyRootSnapshots, getTemplateCopySourceScore, getUnsyncedPhotoEntries, getUnsyncedPhotoEntriesForSync,
    getUploadablePhotoEntries, getUploadablePhotoEntriesForSync, getVisibleLayoutRootIdsForState, groupHistoryRecords, groupHistoryRecordsForSync,
    guestCandidateLayouts, guestDemoCopyCleanupPlan, guestDemoCopyLayoutNameValue, guestDemoCopyRecordWasEdited, guestDemoStartupAction,
    guestLayoutHasUserContentEdits, guestLayoutImportFallbackName, guestLocalDisplayPreferences, guestLocalDisplayPreferencesWereChanged, guestLocalLayoutCandidate,
    guestLocalLayoutImportPlan, hadAuthoritativeLocalStateAtStartup, hadLocalStateAtStartup, hadRemoteBaselineAtStartup, handleAuthButton,
    handlePackingTabTouchEnd, handleRemoteSaveConflict, handleRemoteSaveConflictFlow, handleSearchInput, handleWindowReturn,
    hasContainerDimensions, hasGeneratedPublicArtifacts, hasGuestDemoCopyLayoutRecord, hasLegacyPayloadChanges, hasLegacyPayloadChangesForSync,
    hasListFreshnessSignal, hasLocalSavedState, hasLocalSyncChanges, hasPrivateSyncBlockedPublicOrigin, hasPublicOriginMarker,
    hasRemotePhotoUrl, inspectRecordRemotePhotoSources, hasStateIntegrityMeta, hasStoredLocalValue, highlight, highlightSearchText,
    historyComparisonState, historyPayloadTitle, historyRecordKey, historyRecordState, historyRecordStateForSync,
    historyRecords, historySourceLabel, hydrateItemPhotos, hydrateLocalSharedTemplateCatalogFromState, importDemoStateAsEditableLayout,
    importDemoStateAsEditableLayoutValue, importGuestLocalLayouts, importGuestLocalLayoutsToState, init, initialRemoteLoadPending,
    installRuntimeActiveLayoutId, isActiveLayoutChoiceExplicit, isAdminEditablePublishedLayout, isAdminPublicEditScope,
    isAdminSession, isAdminUser, isAutomaticGuestDemoCopyLayout, isBike3dPackingView, isCollectionPackedVisible,
    isConcretePublicSharedLayoutListRecord, isConflictMetaField, isContainerPickerContainerCopyModeValue, isContainerPickerCopyModeValue, isContainerPickerItemCopyModeValue,
    isNewItemPlacementPickerMode, itemDialogContainerPickerMode, itemDialogTargetLayoutFromPicker,
    isCurrentLocalStateDestructiveRegression, isDefaultDemoSeedLayoutRecord, isDeletedSharedLayoutId, isDemoLayoutChoice, isDemoLayoutChoiceValue,
    isDemoPublicTemplateMissing, isDestructiveStateRegression, isDisposableManagedPublicDraft, isEditableElement, isEntitySyncTypeUnavailable,
    isEntitySyncUnavailableError, isExplicitlySignedOut, isForcedOffline, isForeignLocalSyncState, isGeneratedCatalogContainerStateArtifact,
    isGeneratedCatalogContainerSyncArtifact, isGeneratedCatalogStateArtifact, isGeneratedCatalogSyncArtifact, isGeneratedStartupFallbackState, isGuestDemoCopyLayout,
    isGuestDemoCopyLayoutRecord, isGuestLocalPersonalLayout, isGuestSession, isItemAwayFromHomeAndBikeValue, isItemInCatalogForState,
    isItemInLayoutForState, isItemWithoutWeightValue, isLayoutCreateTemplateLayoutModeValue, isLayoutMeaningful, isLocalDevOrigin,
    isItemUnavailableForPacking, isLayoutLocked, isManagedDemoTemplateLayout, isManagedPublicTemplateDraft, isManagedTemplateUnpublished, managedTemplatePublicationAction,
    isMeaningfulPackingState, isNetworkError, isOfflineRememberedAdminSession,
    isOfflineRememberedSession, isOwnLayoutEchoConflict, isOwnLayoutEchoConflictValue, isPackingStateShape, isPhotoStoredForList,
    isPhotoUsableFromServer, isPrivateCatalogRecord, isPrivateLayoutChoice, isPrivateLayoutChoiceForStateRestore, isPrivateLayoutChoiceValue,
    isPrivateUserLayoutId, isPublicCatalogContainerRecordForState, isPublicCatalogItemRecordForState, isPublicDemoTemplateRecord, isPublicLayoutContext,
    isPublicSharedLayoutListRecord, isPublicSharedTemplatePayload, isPublicSyncContainer, isPublicSyncItem, isPublicTemplateListId,
    isPublishedLayoutEditable, isReadOnlyBikePackingContext, isReadOnlyBikePackingError, isReadOnlyBikePackingRecord, isReadOnlyItemKey,
    isReadOnlyScope, isReadOnlyStateScope, isReadonlyTemplateView, isRecentExplicitLayoutChoice, isRootContainerForEditorForState,
    isRootContainerInCatalogForState, isRootContainerInLayoutForState, isSafePublishedDemoState, isSearchInputEditing, isSharedListLinkRoute,
    isStartupGuestDemoPreview, isStartupGuestDemoPreviewState, isStoredActiveLayoutChoiceExplicit, isSuspiciousEmptyPackingState, isTemplateCopySharedLayoutId,
    isTemporaryServerStorageError, isTimeoutError, isViewingPublishedTarget, itemCategories, itemCopyConfirm,
    itemCreatedTimeForState, itemDeleteConfirm, itemDisplayMode, itemDisplayModeFromFlags, itemDisplayModeLabel,
    itemEntitySyncUnavailable, itemPhotoSignature, itemQuantityForState, itemSortMode, itemTotalWeightForState,
    itemUsageCountsForCatalog, itemsForActiveCatalogForState, itemsForItemsViewForState, keepRemoteOnlyPhotoReference, languageOptionLabel,
    languageOptionLabelValue, lastItemTitleTap, lastPackingTabTapTime, lastPackingTouchToggleAt, lastRootContainerTitleTap,
    lastToastAt, lastToastSignature, layoutArrangementContentScore, layoutContainerPathForState, layoutContainersOwnWeightForState,
    layoutCreateModeState, layoutDictionaryValues, layoutEditTitle, layoutEntitySyncUnavailable, layoutLoadStatus,
    layoutManageLanguage, layoutOrderIdsFromSections, layoutOrderSectionsFromSources, applyLayoutOrderToSources, changedPersonalLayoutOrderIds, layoutSourceNameFromOptionLabel, legacyComparableStateForSync, legacyComparableStateForSyncPayload, legacyComparableTopLevelDiffKeys,
    legacyComparableTopLevelDiffKeysForSync, legacySharedRootSnapshot, linkExistingContainerTreeToLayoutState, linkMissingContainerTreeToLayoutState, linkedSharedListLayout, listFreshnessChanged,
    listRecordVisibility, loadActiveLayoutChoice, loadActivePackingListId, loadActivePrivateLayoutChoice, loadBaseState,
    loadCurrentHistoryComparisonState, loadCurrentServerStateDirectly, loadGuestPublishedDemoOnStartup, loadPublishedDemoState, loadPublishedTemplateCopySourceValue,
    loadRecoverySnapshots, loadRemoteHistory, loadRemoteState, loadRemoteStateFlow, loadSharedLayoutPayload,
    loadState, loadStateForScope, loadStoredActiveLayoutChoice, loadStoredActivePackingListId, loadStoredActivePrivateLayoutChoice,
    loadStoredSyncMeta, loadStoredUiSettings, loadSyncDevice, loadSyncMeta, loadUiLanguage,
    loadUiSettings, localAdminTemplateCopyLayouts, localDemoCopyInFlight, localDemoTemplateEntriesFromLayouts, localSharedLayoutCatalogEntriesFromLayouts,
    localStorageScopeKey, locations, makeContainerCopyNameForLayout, makeContainerCopyNameForState, makeItemCopyNameForState, managedSharedDraftLanguage,
    markCopiedItemForPublicLayout, markEdited, markEntitySyncTypeUnavailable, markLayoutPhotosForCurrentListCopy, markLayoutPhotosForCurrentListCopyForSync,
    markLocalPublicCopyOrigin, markPhotoUploadStarted, markPrivateCopyOriginFromSource, markPublicTemplateOptionsState, markRecordPhotosForCurrentListCopy, matchesCollectionFilterValue,
    matchesItemFieldsFilterValue, matchesRootContainerFieldsFilterValue, materializeDemoLayoutForAdminCopy, materializeSharedLayoutForAdmin, materializeSharedLayoutForAdminState,
    mergeBuiltInSharedEntriesIntoAdminLayout, mergeBuiltInSharedEntriesIntoAdminLayoutValue, mergeDemoTemplateCatalogEntry, mergeDemoTemplateEntriesForAdmin, mergeLocalCollapsedContainers,
    mergeManagedPublicDraftRecords, mergePublishedSharedStateIntoAdminLayout, mergePublishedSharedStateIntoAdminLayoutValue, mergeServerDemoTemplateCatalog, mergeSharedLayoutCatalogEntries,
    mergeStateFromBase, mergeStateFromBaseValue, migrateContainerOrder, missingDemoPublicTemplates, modeState,
    moveContainerInLayoutArrangementForState, moveItemInLayoutArrangementForState, moveLayoutBeforeInSections, moveLayoutWithinSections, moveRootColumnInState, rootColumnInsertIndexFromVisibleNeighbors, nextDemoTemplateAfter, nextItemDisplayModeValue,
    itemAvailabilityBlocksPlacement, itemPlacementSnapshotChanged, lockedLayoutMutationBlocked, lockedLayoutsContainingContainer, lockedLayoutsContainingItem, lockedLayoutsContainingNestedContainer, selectUnlockedLayoutTargetId, unavailableSnapshotItems, nextServerConfirmedSharedLayoutAfter, normalizeActiveLayoutChoice, normalizeActiveLayoutChoiceValue, normalizeBike3dTransform, normalizeBike3dTransforms,
    normalizeBike3dViewState, normalizeCatalogSelection, normalizeCollectionModeState, normalizeContainerColor, normalizeContainerDimensions,
    normalizeContainerFields, normalizeDemoLayoutName, normalizeDemoPayloadForLanguage, normalizeDemoTemplateName, normalizeDictionaryValues,
    normalizeIntegrityCount, normalizeItemCategories, normalizeItemDisplayMode, normalizeItemFields, normalizeItemPhotos,
    normalizeItemAvailabilityStatus, normalizeItemQuantity, normalizeLayoutArrangement, normalizeLayoutFields, normalizeListFreshness, normalizePackingListsResponse,
    normalizePackingViewMode, normalizePackingVisualStyle, normalizePhotoUrlFields, normalizePrivateDictionariesForSyncState, normalizePrivateLayoutChoiceForStateRestore,
    normalizePublicTemplateMetadataResponse, normalizePublishedDemoTemplatePayload, normalizePublishedStatePayload, normalizeRemoteListRecord,
    normalizeRemoteState, normalizeRestoredBackupState, normalizeSharedGearName, normalizeSortMode, normalizeStateRevision,
    normalizeUiLanguage, nowIso, offerLoadServerForTruncatedLocalState, offerPendingGuestLocalLayoutsAfterRemoteLoad,
    offerSaveGuestLocalLayouts, offlineRememberedUser, openAdminDemoLayout, openAuthDialog, openCategoryFilterDialog,
    openConfirmDialog, openDemoLayoutFromSelect, openHelpLimitsDialog, openHelpLimitsDialogUi, openHistoryDialog,
    openModalDialog, openPrivateLayout, openSharedLayoutForAdmin, openSharedLayoutViewer, openSharedLayoutsDialog,
    openSharedListFromLink, orderAdminPublicDraftsLikeMainSelect, packingVisualStyle, packingVisualStyleButtonLabel, packingVisualStylePanelVisible,
    parseContainerDimensionInput, parseVolumeInput, parseWeightInput, pendingGuestLocalLayoutCandidate, persistActiveLayoutSelection,
    persistStateSnapshot, personalListApiUnavailable, photoDraftChanged, photoObjectUrls,
    photoDialogStatusText, photoRemoteSrc, photoShouldBeCopiedToCurrentList, photoStatusText, photoUploadInFlight, photoUploadProgressRenderFrame,
    updatePhotoGalleryUploadProgress,
    pickRicherRemoteListRecord, placeDuplicatedContainerSnapshotInLayoutState, placeExistingContainerInLayoutInState, placeExistingItemInLayoutInState, planLayoutTreeMissingItems, planPublicCopyMissingItems,
    pluralRu, preferredCurrentLayoutRef, prepareBackupPhotosForStateValue, preserveSearchBlurViewport, preventDoubleTapZoom,
    primaryItemPhoto, printHtmlDocument, copyCrossesPublicNamespaceBoundary, itemCopyNamespacePolicy, privateContainerTreeCopyRoute, photoDuplicateOptionsForLayoutCopy, shouldCopyPhotosToCurrentListForLayoutCopy, privateLayoutCount, privateLayoutDeleteConfirm, privateMojibakeLayoutFallbackName,
    pruneAdminPublishedDraftsForSync, pruneAdminPublishedDraftsForSyncValue, pruneRuntimeSharedLayouts, pruneUneditedGuestDemoCopies, pruneUnusedLayoutCustomDictionaries,
    containerPlacementSnapshotChanged, publicCopyComparableText, publicCopyDuplicateSummaryForSnapshot, publicCopyMissingItemPlanForSnapshot, publicCopyRecordContentHash, publicCopySnapshotFromSourceSnapshot,
    publicCopySourceIdFromRecord, isSharedCopyTargetLayout, publicCopyTargetLayouts, sharedCopyTargetLayouts, publicDemoTemplateEntryFromRecord, publicDemoTemplatePayloadTarget, publicLayoutChoiceForLayout, publicLayoutChoiceValue,
    publicLayoutDeleteConfirm, publicListIdForPublishedTarget, publicReadonlyItemDisplayMode, publicSharedLayouts, publicTemplateChoice,
    publicTemplateDeleteBlockReason, publicTemplateDeletePath, publicTemplateMetadataPath, publicTemplateMetadataRequest, publicTemplateMetadataTarget,
    publicTemplateOptionLabel, publicTemplatePayloadPath, publishPublicHistoryRecord, publishedItemKeyStateCache, publishedLayoutSaveLayoutId,
    publishedLayoutSaveTimer, publishedLayoutTarget, publishedListStateCache, publishedPayloadWithTemplateMetadata, publishedTemplateBlockReason,
    purgeDeletedSharedTemplateFromFrontendState, purgeUnconfirmedSharedTemplatesFromFrontendState, putCachedPhoto, readBackupArchiveFile, readBackupImportFile,
    readOnlyLayoutDictionariesForState, readableGuestDemoLayoutName, readonlyPublicTemplateOptionLabel, readonlyTemplateMessage, reconcilePublishedTemplateCopyDraft,
    recoverUnsyncedLocalChanges, refreshActiveReadOnlyPublicTemplate, refreshHistoryDialog, refreshOpenPhotoDialogPreviews,
    refreshPublicSharedLayoutCatalog, refreshPublicSharedLayoutCatalogFlow, refreshPublicSharedLayoutIndex, refreshPublicSharedTemplates, refreshPublishedLayoutView,
    refs, registerAppServiceWorker, rememberActiveLayoutChoice, rememberAuthenticatedUser, rememberAuthenticatedUserInStorage,
    rememberConflictRemoteMeta, rememberConflictRemoteMetaForSync, rememberCurrentPackingListRecord, rememberCurrentSyncAccount, rememberDeletedSharedLayoutId,
    rememberEntitySyncResultMeta, rememberPrivateServerLayoutChoice, rememberRemoteIntegrityMeta, rememberedOfflineUser, remoteListRecords,
    remoteRecordId, remoteRecordPrivateLayoutCount, remoteRecordStateInfo, remoteRefreshInFlight,
    remoteRefreshTimer, remoteStateIntegrityError, remoteStateLoadPromise, remoteUpdatedAt, removeContainerFromLayoutOnlyInState,
    removeCustomDictionaryValue, removeItemFromLayoutArrangement, removeItemFromLayoutInState, removeLayoutTree, removeLayoutTreeFromState,
    removeManagedDemoTemplateTreesFromState, removeManagedSharedTemplateTreesFromState, removePhotoFromDraft, removePublicLayoutDrafts, removePublicTemplateCatalogEntry,
    removeScopedLocalValue, renameCustomDictionaryValue, renameDictionaryEntryValue, renameReusableGuestDemoCopy, render,
    renderAndScrollToTop, renderBackupAnalysisUi, renderBackupProgress, renderBackupRules, renderBackupSelectionSummary, renderBike3dPackingView,
    renderCachedPrivateStateDuringRemoteLoad, renderCatalogCard, renderCatalogPills, renderConflictDetails, renderConflictSyncContext,
    renderContainerWeightText, renderDictionaryHtml, renderEmptyState, renderPackingAddRootCard,
    renderPackingEmptyState, renderFilterControls, renderFilteredRootContainerColumnHtml,
    renderFilters, renderGuestPublicDemoPreviewDuringAuthCheck, renderHistoryRecordArticleHtml, renderHistoryRecords, renderHistorySourceControls,
    renderInitialLocalFallbackIfNeeded, renderItemPhotoHtml, renderItemQuantityText, renderItemsViewHtml, renderLayoutEditorHtml,
    renderListItemHtml, renderPackingItemCardHtml, renderPackingRootHeaderCellHtml, renderPhotoGalleryHtml, renderPreservingPackingScroll, renderRootContainerCardHtml,
    renderRootContainerColumnHtml, renderRootContainersEditorHtml, renderSharedItemsViewHtml, renderSharedLayouts, renderSharedLayoutsHtml,
    renderSubcontainerSectionHtml, repairActiveEmptyAdminDemoDraft, repairAdminDemoLayout, repairAdminDemoLayoutValue, repairCollapsedActiveLayoutBeforeSave,
    repairContainerMembershipFromItemLinks, repairEmptyTemplateCopyDraftFromPublishedLayout, repairMojibakeLayoutNames, repairPlacementRegressionFromReference, repairPrivateMojibakeLayoutNames,
    repairPublishedLayoutArrangement, repairRemoteStateFromLocalReferences, replaceState, requirePublishedTemplatesAvailable, requireUsageCapacity,
    resetBackupImportUi, resetData, resetGuestDemoScopeToCanonical, resolveExistingBackupPhotosValue, resolveLayoutCreateTemplateCopyLayoutValue,
    resolveLayoutCreateTemplateCopySourceValue, resolvePreferredLayoutId, resolveStoredPrivateLayoutChoice, resolveStoredPrivateLayoutChoiceForState, restorableStoredPrivateLayoutChoiceId,
    restoreAdminPublishedLayoutContext, restoreBackupAdminTemplates, restoreBike3dDetailViewport, restoreFullBackupFlow, restoreHistoryRecord, restoreModeState,
    restorePrivateHistoryRecordOnServer, restorePrivateLayoutChoiceInState, restoreSavedLayoutChoice, restoreSearchBlurViewportLock, restoreSelectedBackupLayoutsFlow,
    restoreSelectedBackupLayoutsToState, reusableGuestDemoCopyLayout, rootContainerCopyConfirm, rootContainerDeleteConfirm,
    rootContainerSortMode, rootContainerUsageCountsForCatalog, rootContainersForEditorForState, rootContainersForSettingsForState, runSyncNow,
    runSyncNowFlow, safeSetLocalStorage, sameJson, sanitizePrivateCopiedPublicOrigins, saveActiveLayoutChoice,
    saveActivePackingListId, saveAuthEmail, saveAuthEmailToStorage, saveBaseState, saveDictionaryOwner,
    saveGuestImportToRemote, saveItemDialogAction, saveLayoutMutation, saveLocalUiState, savePublishedLayoutRecord,
    savePublishedLayoutRecordFlow, savePublishedTemplateMetadata, saveRecoverySnapshot, saveRemoteListStateRecord, saveRemoteState,
    saveRemoteStateFlow, saveRemoteStateRecord, saveRootContainerDialogAction, saveState, saveStoredActiveLayoutChoice,
    saveStoredActivePackingListId, saveStoredSyncMeta, saveStoredUiSettings, saveSyncMeta, saveUiLanguage,
    saveUiSettings, scheduleActivePublishedEditSave, schedulePhotoUploadProgressRender, schedulePublishedLayoutSave, scheduleRemoteSave,
    scheduleSearchContextCommit, scopedLocalStorageKey, scopedStorageKey, searchContextCommitTimer, selectDemoTemplateForLanguage,
    selectLocalAdminTemplateCopyLayouts, selectedBackupAdminTemplateKeys, selectedBackupLayoutIdsFromUi, selectedBackupRestoreModeFromUi, selectedBackupRestoreConfirm, selectedHistoryPublishedTarget, selectedSharedTargetLayoutId,
    serializeState, serverChangedSinceLastSync, serverConfirmedDemoTemplates, serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsByAdminOrder,
    serverConfirmedSharedLayoutsFromPublicRecords, setActiveLocalEditableScope, setActivePrivateScope, setActiveReadOnlyScope, setDemoPublicTemplateMissing,
    setDemoStatePayloadForLanguage, setDictionarySortModeForType, setExplicitlySignedOut, setForcedOffline, setLayoutLoadProgress,
    setLayoutLoadStatus, setLoadedRemoteListProgress, setPackingVisualStyle, setPackingVisualStylePanelVisible, setPersonalLayoutsLoadedStatus,
    setPrimaryPhotoInDraft, setTemporaryAdminEditLayout, setUiLanguage, setViewScope,
    settingLabel, setupDialogKeyboardScrollGuard, setupModalScrollLock, setupPackingVisualStyleQuickControl, setupTouchActionButtonFeedback,
    shareCurrentPackingListByLink, sharedGearPhotos, sharedItemFromPublishedItem, sharedLayoutCatalogDiagnostics, sharedLayoutIdFromLocation,
    sharedLayoutIdFromPublicListRecord, sharedLayoutIdFromUrl, sharedLayoutItemKey, sharedLayoutItemKeyFromScope, sharedLayoutLanguageFromPayload,
    sharedLayoutPublicSourceId, sharedLayoutRoots, sharedLayoutsByLanguage, sharedListIdFromLocation, sharedListIdFromUrl,
    sharedPayloadActiveLayout, sharedRootFromPublishedContainer, shouldBlockLegacyPersonalSyncWrite, shouldBlockLegacyPersonalSyncWriteFallback, shouldCaptureGuestLocalLayoutCandidate,
    shouldAutoPublishManagedTemplate, shouldClearPackingListContextForPrivateMutation, shouldConfirmManagedTemplateTransition,
    shouldCopyPublicTemplatePhotoReferencesOnServer, shouldCreatePublishedTemplateBeforePhotos, shouldDeletePublishedTemplateForLayoutValue, shouldImportGuestLayoutBeforeRemote,
    shouldKeepCurrentReadonlyDemoAfterAuthCheck, shouldKeepReadonlyDemoAfterAuthCheck, shouldKeepScopedControlsStable, shouldRecoverUnsyncedLocalChanges, shouldRenderGuestDemoPreviewDuringAuthCheck,
    shouldShowItemLabels, shouldShowItemLabelsForMode, shouldShowItemPhotos, shouldShowItemPhotosForMode, shouldUseStickyFilterControls,
    shouldWarnAboutSharedLayoutCatalog, snapshotContainerTreeFromLayoutArrangement, snapshotContainerTreeFromLiveStateValue, snapshotHasLocalPublicCopyOrigin, snapshotHasPrivateSyncBlockedPublicOrigin,
    snapshotModeState, snapshotsEqual, solidifyManagedTemplateDrafts, solidifyManagedTemplateDraftsForState, solidifyTemplateDraftLayout,
    solidifyTemplateDraftLayoutForState, sortDictionaryValues, sortHistoryRecords, sortLayoutSectionByDate, sortLayoutSectionByName, sortedDictionaryValues, splitEntitySyncEntries,
    splitEntitySyncEntriesForSync, startRemoteStateWatcher, startupLocalStateWasFallback, startupSyncMeta, state,
    stateIntegrityMetaFromResponse, statePrivateLayoutCount, stateStats, stateStatsForDestructiveComparison, storedGuestLocalLayoutCandidate,
    storedGuestLocalLayoutCandidateOffered, storedPrivateLayoutChoiceRef, stripPublicOriginForPrivateCopy, stripPublishedPublicOriginMarkers, subcontainerTitleHtml,
    submitAuthDialog, suggestedLayoutCreateName, summarizeBackupLayouts, summarizeHistoryPayload, summarizeLayoutTreeIdDuplicates,
    summarizePublicCopyDuplicates, switchActiveLayout, switchView, syncChangedBikePackingEntities, syncChangedEntityType,
    syncCreatedPrivateLayoutEntities, syncDemoStatePayloadForLanguage, syncDevice, syncInFlight, syncMeta,
    syncMetaAccountKey, syncMetaBelongsToCurrentUser, syncNow, syncPackingVisualStyleControls, syncPayloadSizeReport,
    syncPublishedEntityPhotos, syncPublishedEntityPhotosValue, syncQueued, syncQueuedForce, syncTimer,
    t, templateCopySourceKindFromChoice, templateCopySourceRootIds, templateDraftLayoutId, timeValue, toggleActiveLayoutNestedContainers,
    toggleActiveLayoutNestedContainersCollapsedForState, toggleCollectionMode, toggleCollectionModeEnabled, toggleFilterContext, toggleForcedOfflineMode,
    toggleItemDisplayMode, togglePackingViewMode, togglePackingVisualStylePanel, toggleShowOnlyUnpacked, toggleTopMenu,
    touchContainer, touchItem, touchLayout, touchLayoutsReferencingItemInState, tryApplyRemoteEntityChanges,
    uiLanguage, uiSettings, uniqueLayoutIds, uniqueName, unlockOfflineState,
    updateCatalogSelection, updateCategoryFilterButton, updateCompactStickyControls, updateFilterContextToggle, updateFilterHighlights,
    updateLayoutCollapseAllToggle, updateLayoutLoadStatusUi, updateMetaToggle, updatePackingViewModeControl, updateSearchFocusState,
    updateSharedLayoutCatalogEntryMetadata, updateStickyControlsHeight, updateSyncUi, updateSyncUiControls, updateViewScopedControls,
    updateViewScopedControlsUi, uploadEntityPhoto, uploadEntityPhotoToPath, uploadPendingPhotos, uploadPhotoToPath, uploadPublishedEntityPhoto, uploadPublishedLayoutPhotos,
    unpublishManagedTemplateFlow, unpublishPublishedDemoTemplateRecord, unpublishPublishedSharedTemplate, upsertDemoTemplateCatalogEntry, upsertRuntimeSharedLayout, usageLimitExceededMessage, usageLimitForRole, userEditableLayoutsForState,
    userStorageScopeKey, validateGuestImportSyncState, visibleItemLayoutPlacementsForState, visibleSharedLayoutsForLanguage, withLayoutArrangementApplied,
    withLayoutArrangementAppliedAsync, withoutPhotoReferences, writeContainerTreeToLayoutArrangement, writeLargeScopedLocalValue
  } = ctx;

function isEnglishUi() {
  return normalizeUiLanguage(uiLanguage) === "en";
}

function localText(en, ru) {
  return isEnglishUi() ? en : ru;
}

function quoteName(name) {
  return isEnglishUi() ? `“${name}”` : `«${name}»`;
}

function layoutDisplayName(layout) {
  return layout?.name || defaultLayoutName();
}

function lockedLayoutNames(layouts = []) {
  return layouts.map(layoutDisplayName).join(", ");
}

function warnLockedLayoutMutation(layoutId) {
  const layout = state.layouts?.[layoutId];
  if (!isLayoutLocked(layout)) return false;
  showToast(t("layout.lockedMutationBlock", { name: layoutDisplayName(layout) }), "warning");
  return true;
}

function warnLockedItemDelete(itemId) {
  const layouts = lockedLayoutsContainingItem(state, itemId);
  if (!layouts.length) return false;
  showToast(t("items.deleteLockedLayoutBlock", { layouts: lockedLayoutNames(layouts) }), "warning");
  return true;
}

function warnLockedContainerDelete(containerId) {
  const layouts = lockedLayoutsContainingContainer(state, containerId);
  if (!layouts.length) return false;
  showToast(t("layout.containerDeleteLockedBlock", { layouts: lockedLayoutNames(layouts) }), "warning");
  return true;
}

function warnLockedItemEdit(itemId) {
  const layouts = lockedLayoutsContainingItem(state, itemId);
  if (!layouts.length) return false;
  showToast(t("items.editLockedLayoutBlock", { layouts: lockedLayoutNames(layouts) }), "warning");
  return true;
}

function warnLockedContainerEdit(containerId) {
  const layouts = lockedLayoutsContainingNestedContainer(state, containerId);
  if (!layouts.length) return false;
  showToast(t("layout.containerEditLockedBlock", { layouts: lockedLayoutNames(layouts) }), "warning");
  return true;
}

function warnUnavailableItemPlacement(itemId) {
  if (!itemAvailabilityBlocksPlacement(state.items?.[itemId])) return false;
  showToast(t("items.unavailableCannotAdd"), "warning");
  return true;
}

function warnUnavailableItemDialogPlacement() {
  if (!runtime.editingItemId) return false;
  if (!itemAvailabilityBlocksPlacement(state.items?.[runtime.editingItemId], refs.itemAvailabilityStatus?.value)) return false;
  showToast(t("items.unavailableCannotAdd"), "warning");
  return true;
}

function warnUnavailableSnapshotCopy(sourceSnapshot) {
  if (!unavailableSnapshotItems(sourceSnapshot).length) return false;
  showToast(t("items.unavailableCannotAdd"), "warning");
  return true;
}

function itemDialogChangedOnlyAvailability() {
  if (!runtime.itemDialogInitialSnapshot) return false;
  const initial = { ...runtime.itemDialogInitialSnapshot };
  const current = { ...getItemDialogSnapshot() };
  delete initial.availabilityStatus;
  delete current.availabilityStatus;
  return snapshotsEqual(initial, current);
}

function warnLockedItemDialogPlacementChange() {
  if (!runtime.itemDialogInitialSnapshot) return false;
  if (!itemPlacementSnapshotChanged(runtime.itemDialogInitialSnapshot, getItemDialogSnapshot())) return false;
  return warnLockedLayoutMutation(runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId());
}

function warnLockedRootContainerDialogPlacementChange() {
  if (!runtime.rootContainerDialogInitialSnapshot) return false;
  if (!containerPlacementSnapshotChanged(runtime.rootContainerDialogInitialSnapshot, getRootContainerDialogSnapshot())) return false;
  return warnLockedLayoutMutation(getPublishedEditLayoutId());
}

function confirmLayoutNameHtml(name) {
  return `<span class="confirm-layout-name">${escapeHtml(name || defaultLayoutName())}</span>`;
}

function defaultLayoutName() {
  return localText("New layout", "Новая укладка");
}

function defaultTemplateName() {
  return localText("Template", "Шаблон");
}

function openAddToContainerDialog(containerId) {
  if (!state.containers[containerId]) return;
  replacingPackingItemId = "";
  runtime.addToContainerTargetId = containerId;
  runtime.addToContainerTargetLayoutId = resolveEditableLayoutIdForContainer(containerId);
  if (warnLockedLayoutMutation(runtime.addToContainerTargetLayoutId)) return;
  refs.addToContainerTitle.textContent = t("buttons.add");
  refs.addToContainerPath.textContent = containerPath(containerId);
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  refs.newSubcontainerName.value = "";
  if (refs.addToContainerCreationActions) refs.addToContainerCreationActions.hidden = false;
  renderAddToContainerResults();
  openModalDialog(refs.addToContainerDialog);
  requestAnimationFrame(() => refs.addToContainerSearch.focus({ preventScroll: true }));
}

function openPackingItemReplacementDialog(itemId = runtime.editingItemId) {
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  const item = state.items?.[itemId];
  const containerId = getItemContainerIdInLayout(layout, itemId);
  if (!item || !layout || !containerId || warnLockedLayoutMutation(layoutId)) return;
  replacingPackingItemId = itemId;
  runtime.addToContainerTargetId = containerId;
  runtime.addToContainerTargetLayoutId = layoutId;
  refs.addToContainerTitle.textContent = t("replacement.itemTitle", { name: item.name });
  refs.addToContainerPath.textContent = containerPath(containerId);
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  refs.newSubcontainerName.value = "";
  if (refs.addToContainerCreationActions) refs.addToContainerCreationActions.hidden = true;
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
  const containerId = runtime.addToContainerTargetId;
  const layout = state.layouts?.[runtime.addToContainerTargetLayoutId || state.activeLayoutId];
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
    const unavailable = isItemUnavailableForPacking(item);
    return `
      <button
        class="add-item-result ${alreadyHere ? "already-here" : ""} ${unavailable ? "unavailable" : ""}"
        type="button"
        data-add-existing-item="${item.id}"
        ${alreadyHere || unavailable ? "disabled" : ""}
      >
        <strong>${highlightSearchText(item.name, query)}</strong>
        ${unavailable ? `<small>${escapeHtml(t("items.unavailableBadge"))}</small>` : ""}
      </button>
    `;
  }).join("") || `<div class="empty">${escapeHtml(t("empty.notFound"))}</div>`;

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
    item.containerId ? containerPath(item.containerId) : t("forms.outsideLayout")
  ].join(" ").toLowerCase().includes(query);
}

function clearAddToContainerSearch() {
  refs.addToContainerSearch.value = "";
  refs.clearAddToContainerSearchBtn.hidden = true;
  renderAddToContainerResults();
  refs.addToContainerSearch.focus({ preventScroll: true });
}

function openLayoutRootDialog(options = {}) {
  const requestedTargetLayoutId = options?.targetLayoutId || "";
  layoutRootTargetLayoutId = state.layouts?.[requestedTargetLayoutId]
    ? requestedTargetLayoutId
    : getPublishedEditLayoutId();
  replacingPackingContainerId = "";
  if (refs.createRootForLayoutBtn) refs.createRootForLayoutBtn.hidden = false;
  if (refs.layoutRootTitle) refs.layoutRootTitle.textContent = t("rootContainers.add");
  if (refs.layoutRootPath) {
    const targetLayout = state.layouts?.[layoutRootTargetLayoutId];
    refs.layoutRootPath.textContent = requestedTargetLayoutId && targetLayout
      ? t("copy.targetLayout", { name: targetLayout.name || defaultLayoutName() })
      : t("replacement.currentLayout");
  }
  refs.layoutRootSearch.value = "";
  refs.clearLayoutRootSearchBtn.hidden = true;
  renderLayoutRootResults();
  refs.layoutRootDialog.returnValue = "";
  openModalDialog(refs.layoutRootDialog);
  if (options?.returnToCopyPicker) {
    refs.layoutRootDialog.addEventListener("close", () => {
      if (refs.layoutRootDialog.returnValue === "create") return;
      scheduleCopyPickerResumeAfterContainerSetup();
    }, { once: true });
  }
}

function openCreateRootContainerForCurrentLayout() {
  const targetLayoutId = getLayoutRootTargetLayoutId();
  const returnToCopyPicker = Boolean(pendingCopyTargetContainerSetup);
  if (refs.layoutRootDialog.open) refs.layoutRootDialog.close("create");
  openRootContainerDialog(null, { placeInCurrentLayout: true, targetLayoutId });
  if (returnToCopyPicker) {
    refs.rootContainerDialog.addEventListener("close", scheduleCopyPickerResumeAfterContainerSetup, { once: true });
  }
}

function openNewItemForAddTarget() {
  const targetContainerId = runtime.addToContainerTargetId;
  const targetLayoutId = runtime.addToContainerTargetLayoutId || state.activeLayoutId;
  const layout = state.layouts?.[targetLayoutId];
  if (!targetContainerId || !state.containers?.[targetContainerId] || !layout) return;
  if (!getLayoutContainerIdSet(layout).has(targetContainerId) || warnLockedLayoutMutation(targetLayoutId)) return;
  if (refs.addToContainerDialog.open) refs.addToContainerDialog.close("create-item");
  openItemDialog(null, { targetContainerId, targetLayoutId });
}

function openContainerReplacementDialog(event) {
  event?.preventDefault();
  const containerId = runtime.editingRootContainerId;
  const container = state.containers?.[containerId];
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  if (!container || !layout || !getLayoutContainerIdSet(layout).has(containerId) || warnLockedLayoutMutation(layoutId)) return;
  layoutRootTargetLayoutId = layoutId;
  replacingPackingContainerId = containerId;
  if (refs.createRootForLayoutBtn) refs.createRootForLayoutBtn.hidden = true;
  if (refs.layoutRootTitle) refs.layoutRootTitle.textContent = t("replacement.containerTitle", { name: container.name });
  if (refs.layoutRootPath) refs.layoutRootPath.textContent = t("replacement.containerHint");
  refs.layoutRootSearch.value = "";
  refs.clearLayoutRootSearchBtn.hidden = true;
  renderLayoutRootResults();
  openModalDialog(refs.layoutRootDialog);
  requestAnimationFrame(() => refs.layoutRootSearch.focus({ preventScroll: true }));
}

function renderLayoutRootResults() {
  const query = refs.layoutRootSearch.value.trim().toLowerCase();
  refs.clearLayoutRootSearchBtn.hidden = !query;
  const activeIds = getLayoutContainerIdSet(state.layouts?.[getLayoutRootTargetLayoutId()]);
  const replacementLayout = state.layouts?.[getPublishedEditLayoutId()];
  const catalogRoots = getRootContainers().filter(isRootContainerInActiveCatalog);
  const availableRoots = catalogRoots
    .filter((container) => !activeIds.has(container.id))
    .filter((container) => !replacingPackingContainerId || isContainerReplacementCandidateInLayoutState(
      state,
      replacementLayout,
      replacingPackingContainerId,
      container.id
    ))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const roots = availableRoots.filter((container) => matchesLayoutRootSearch(container, query));
  refs.layoutRootResults.innerHTML = roots.map((container) => `
    <button class="add-item-result" type="button" data-add-layout-root="${container.id}">
      <strong>${highlightSearchText(container.name, query)}</strong>
      <small>${formatWeight(Number(container.weight || 0))}${container.volume ? ` · ${formatVolume(container.volume)}` : ""}</small>
    </button>
  `).join("") || renderEmptyState(
    t(query ? "empty.notFoundByFilter" : "rootContainers.noneAvailable"),
    { filtered: Boolean(query) }
  );

  refs.layoutRootResults.querySelectorAll("[data-add-layout-root]").forEach((button) => {
    button.addEventListener("click", () => selectRootContainerFromPicker(button.dataset.addLayoutRoot));
  });
}

function selectRootContainerFromPicker(containerId) {
  if (replacingPackingContainerId) {
    replaceExistingContainerInLayout(containerId);
    return;
  }
  addRootContainerToActiveLayout(containerId);
}

function getLayoutRootTargetLayoutId() {
  return state.layouts?.[layoutRootTargetLayoutId]
    ? layoutRootTargetLayoutId
    : getPublishedEditLayoutId();
}

function matchesLayoutRootSearch(container, query) {
  if (!query) return true;
  return [
    container.name,
    containerCategories(container).join(" "),
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
  const containerId = runtime.editingRootContainerId;
  const container = state.containers[containerId];
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  if (!containerId || !container) {
    refs.rootContainerPlacementField.hidden = true;
    return;
  }
  const pendingParentId = runtime.rootContainerDialogPendingParentId;
  const isPackage = pendingParentId !== undefined ? Boolean(pendingParentId) : Boolean(container.parentId);
  const active = isPackage || getRootContainerDialogLayoutRootIds().includes(containerId);
  const currentText = isPackage
    ? layoutContainerPath(layout, getRootContainerDialogParentId())
    : (active ? t("settings.currentLayout") : t("settings.outsideCurrentLayout"));
  refs.rootContainerPlacementField.hidden = false;
  if (refs.rootContainerPlacementLabel) refs.rootContainerPlacementLabel.textContent = t("forms.locatedIn");
  if (refs.rootContainerPlacementCurrent) {
    refs.rootContainerPlacementCurrent.hidden = false;
    refs.rootContainerPlacementCurrent.textContent = currentText || t("forms.outsideLayout");
    refs.rootContainerPlacementCurrent.classList.toggle("active", active);
  }
  refs.rootContainerPlacementBtn.textContent = t("forms.moveInsideLayout");
  refs.rootContainerPlacementBtn.classList.remove("active");
  refs.rootContainerPlacementBtn.classList.add("repack-button");
  refs.rootContainerPlacementBtn.setAttribute("aria-label", isPackage
    ? localText(`Move from ${currentText || "current place"}`, `Переложить из ${currentText || "текущего места"}`)
    : localText(`Move: ${currentText}`, `Переставить: ${currentText}`));
}

function updateRootContainerRemoveFromLayoutButton() {
  if (!refs.rootContainerRemoveFromLayoutBtn) return;
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  const container = state.containers?.[runtime.editingRootContainerId];
  const isNested = Boolean(layout && runtime.editingRootContainerId && !getLayoutContainerRootStatus(layout, runtime.editingRootContainerId));
  const isPersistentNested = isNested && container?.nestable === true;
  const canRemove = canRemoveContainerFromActiveLayout(runtime.editingRootContainerId);
  const label = isNested && !isPersistentNested ? t("buttons.deleteForever") : t("forms.removeFromLayout");
  refs.rootContainerRemoveFromLayoutBtn.textContent = label;
  refs.rootContainerRemoveFromLayoutBtn.classList.toggle("delete-forever-button", isNested && !isPersistentNested);
  refs.rootContainerRemoveFromLayoutBtn.classList.toggle("remove-from-layout-button", !isNested || isPersistentNested);
  refs.rootContainerRemoveFromLayoutBtn.setAttribute(
    "aria-label",
    isNested && !isPersistentNested
      ? localText("Delete nested bag or place forever", "Удалить вложенную сумку или место навсегда")
      : localText("Remove bag or place from layout", "Убрать сумку или место из укладки")
  );
  refs.rootContainerRemoveFromLayoutBtn.title = label;
  refs.rootContainerRemoveFromLayoutBtn.hidden = !canRemove;
  refs.rootContainerRemoveFromLayoutBtn.disabled = !canRemove;
}

function updateRootContainerReplacementButton() {
  if (!refs.rootContainerReplaceBtn) return;
  const containerId = runtime.editingRootContainerId;
  const container = state.containers?.[containerId];
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  const inLayout = Boolean(layout && containerId && getLayoutContainerIdSet(layout).has(containerId));
  const isNested = Boolean(inLayout && !getLayoutContainerRootStatus(layout, containerId));
  const canReplace = Boolean(container && inLayout && !isReadOnlyStateScope() && !isSharedLayoutView());
  refs.rootContainerReplaceBtn.textContent = t("replacement.containerAction");
  refs.rootContainerReplaceBtn.hidden = !canReplace;
  refs.rootContainerReplaceBtn.disabled = !canReplace;
}

function updateRootContainerTemporaryStatus() {
  if (!refs.rootContainerTemporaryStatus) return;
  const containerId = runtime.editingRootContainerId;
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  const temporary = isTemporaryContainerInLayoutState(state, layout, containerId);
  refs.rootContainerTemporaryStatus.hidden = !temporary;
  if (!temporary) return;
  refs.rootContainerTemporaryStatusTitle.textContent = t("replacement.temporaryContainerLabel");
  refs.rootContainerTemporaryStatusText.textContent = t("replacement.temporaryContainerHint");
}

function updateRootContainerDeleteForeverButton() {
  if (!refs.rootContainerDeleteForeverBtn) return;
  const container = state.containers?.[runtime.editingRootContainerId];
  const canDelete = Boolean(
    runtime.editingRootContainerId &&
    container &&
    (!container.parentId || container.nestable === true) &&
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
  const containerId = runtime.editingRootContainerId;
  const container = state.containers?.[containerId];
  const layout = state.layouts?.[getPublishedEditLayoutId()];
  if (!container || !layout || !canRemoveContainerFromActiveLayout(containerId)) return;
  if (warnLockedLayoutMutation(layout.id)) return;
  const itemCount = getLayoutSubtreeItemCount(layout, containerId);
  const isRoot = getLayoutContainerRootStatus(layout, containerId);
  const remainsInCatalog = isRoot || container.nestable === true;
  const layoutName = layout.name || defaultLayoutName();
  const currentLayoutText = localText(`Current layout: ${layoutName}`, `Текущая укладка: ${layoutName}`);
  const currentLayoutHtml = localText(
    `Current layout: ${confirmLayoutNameHtml(layoutName)}`,
    `Текущая укладка: ${confirmLayoutNameHtml(layoutName)}`
  );
  const nestedSubject = localText(
    `This nested pouch will be deleted forever from the current layout ${layoutName}.`,
    `Этот вложенный пакет будет удалён навсегда из текущей укладки ${layoutName}.`
  );
  const nestedSubjectHtml = localText(
    `This nested pouch will be deleted forever from the current layout ${confirmLayoutNameHtml(layoutName)}.`,
    `Этот вложенный пакет будет удалён навсегда из текущей укладки ${confirmLayoutNameHtml(layoutName)}.`
  );
  const affectedItemsText = itemCount
    ? localText(
      `${formatThingCount(itemCount)} from ${remainsInCatalog ? "this bag/place" : "this pouch"} will be removed from the layout and become outside the layout. Nested pouches inside will be deleted.`,
      `${formatThingCount(itemCount)} из ${remainsInCatalog ? "этой сумки/места" : "этого пакета"} будут убраны из укладки и окажутся вне укладки. Вложенные пакеты внутри будут удалены.`
    )
    : "";
  const emptyRootText = localText(
    "This bag/place is already empty, so only the empty shell will leave the current layout.",
    "Эта сумка/место уже пустые, поэтому из текущей укладки уйдёт только пустая оболочка."
  );
  const confirmed = await askConfirmDialog({
    title: remainsInCatalog
      ? localText("Remove from layout?", "Убрать из укладки?")
      : localText("Delete forever?", "Удалить навсегда?"),
    text: remainsInCatalog
      ? localText(
        `${quoteName(container.name)} will be removed from the current layout.`,
        `${quoteName(container.name)} исчезнет из текущей укладки.`
      )
      : localText(
        `${quoteName(container.name)} will be deleted forever from the current layout as a nested bag/place.`,
        `${quoteName(container.name)} будет удалён навсегда из текущей укладки как вложенная сумка/место.`
      ),
    highlightText: itemCount
      ? `${remainsInCatalog ? `${currentLayoutText}\n` : `${nestedSubject}\n`}${affectedItemsText}`
      : remainsInCatalog
        ? `${currentLayoutText}\n${emptyRootText}`
        : nestedSubject,
    highlightHtml: itemCount
      ? `${remainsInCatalog ? `${currentLayoutHtml}\n` : `${nestedSubjectHtml}\n`}${escapeHtml(affectedItemsText)}`
      : remainsInCatalog
        ? `${currentLayoutHtml}\n${escapeHtml(emptyRootText)}`
        : nestedSubjectHtml,
    tone: itemCount || !remainsInCatalog ? "danger" : "safe",
    okText: remainsInCatalog ? localText("Remove", "Убрать") : t("buttons.deleteForever"),
    hideClose: true
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
  if (runtime.rootContainerDialogPendingParentId !== undefined) return runtime.rootContainerDialogPendingParentId;
  return state.containers[runtime.editingRootContainerId]?.parentId || "";
}

function getRootContainerDialogParentIndex() {
  if (runtime.rootContainerDialogPendingParentIndex !== null) return runtime.rootContainerDialogPendingParentIndex;
  const container = state.containers[runtime.editingRootContainerId];
  const parent = state.containers[getRootContainerDialogParentId()];
  if (!container || !parent) return "";
  const index = (parent.order || []).findIndex((entry) => entry.type === "container" && entry.id === container.id);
  return index >= 0 ? index : "";
}

function openRootContainerPlacementAction(event) {
  event?.preventDefault();
  const container = state.containers[runtime.editingRootContainerId];
  if (!container) return;
  if (warnLockedLayoutMutation(getPublishedEditLayoutId())) return;
  if (container.parentId || refs.rootContainerNestable?.checked) {
    openContainerParentPickerDialog();
    return;
  }
  openRootPlacementDialog();
}

function openRootPlacementDialog() {
  const containerId = runtime.editingRootContainerId;
  const container = state.containers[containerId];
  if (warnLockedLayoutMutation(getPublishedEditLayoutId())) return;
  if (!container || container.parentId) return;
  refs.rootPlacementTitle.textContent = t("forms.moveNamedContainer", { name: container.name });
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
  const placeHereText = escapeHtml(t("tooltips.placeHere"));
  return `
    <button
      class="root-placement-slot"
      type="button"
      data-place-root-index="${slotIndex}"
      ${disabled ? "disabled" : ""}
      aria-label="${placeHereText}"
      title="${placeHereText}"
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
  if (warnLockedLayoutMutation(getPublishedEditLayoutId())) return;
  const index = normalizeRootPlacementIndex(containerId, slotIndex);
  const rootIds = getRootContainerDialogLayoutRootIds().filter((id) => id !== containerId);
  rootIds.splice(Math.max(0, Math.min(index, rootIds.length)), 0, containerId);
  runtime.rootContainerDialogPendingRootIds = rootIds;
  refs.rootPlacementDialog.close();
  updateRootContainerPlacementButton();
  updateRootContainerRemoveFromLayoutButton();
  updateRootContainerDialogSaveState();
  showToast(localText("Place selected. Click “Save”.", "Место выбрано. Нажмите «Сохранить»."), "success");
}

function normalizeRootPlacementIndex(containerId, slotIndex) {
  const rootIds = getRootContainerDialogLayoutRootIds();
  const currentIndex = rootIds.indexOf(containerId);
  if (currentIndex >= 0 && currentIndex < slotIndex) return slotIndex - 1;
  return slotIndex;
}

function getRootContainerDialogLayoutRootIds() {
  if (runtime.rootContainerDialogPendingRootIds) return [...runtime.rootContainerDialogPendingRootIds];
  const layout = getPublishedWorkLayout();
  return [...getVisibleLayoutRootIds(layout)];
}

function applyRootContainerDialogPlacement() {
  if (!runtime.rootContainerDialogPendingRootIds) return false;
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  if (!layout) return false;
  if (warnLockedLayoutMutation(layoutId)) return false;
  const currentIds = layout.rootContainerIds || [];
  if (snapshotsEqual(currentIds, runtime.rootContainerDialogPendingRootIds)) return false;
  layout.rootContainerIds = [...runtime.rootContainerDialogPendingRootIds];
  touchLayout(layoutId);
  return true;
}

function addRootContainerToActiveLayout(containerId, targetIndex = null, { closeDialog = true, renderAfter = true } = {}) {
  const layoutId = getLayoutRootTargetLayoutId();
  if (warnLockedLayoutMutation(layoutId)) return;
  if (!addRootContainerToLayoutInState(state, layoutId, containerId, targetIndex, {
    includeContents: !pendingCopyTargetContainerSetup,
    markRecordActivePublicCatalog,
    touchLayout
  })) return;
  if (layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
  saveLayoutMutation(layoutId, { publishDelay: 500 });
  if (closeDialog && refs.layoutRootDialog.open) refs.layoutRootDialog.close();
  if (renderAfter) render();
}

function replaceExistingContainerInLayout(replacementContainerId) {
  const sourceContainerId = replacingPackingContainerId;
  const layoutId = getPublishedEditLayoutId();
  const source = state.containers?.[sourceContainerId];
  const replacement = state.containers?.[replacementContainerId];
  const layout = state.layouts?.[layoutId];
  const temporaryNestedSource = isTemporaryContainerInLayoutState(state, layout, sourceContainerId);
  const changedAt = nowIso();
  if (!source || !replacement || warnLockedLayoutMutation(layoutId)) return;
  const replaced = replaceContainerInLayoutState(state, layoutId, sourceContainerId, replacementContainerId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    beforeRemoveSource: deleteContainerPhotos,
    changedAt,
    removeSourceRecord: temporaryNestedSource,
    touchLayout
  });
  if (!replaced) {
    showToast(t("replacement.failed"), "error");
    return;
  }
  replacingPackingContainerId = "";
  saveLayoutMutation(layoutId);
  if (refs.layoutRootDialog.open) refs.layoutRootDialog.close();
  if (refs.rootContainerDialog.open) refs.rootContainerDialog.close("cancel");
  renderPreservingPackingScroll();
  showToast(t(temporaryNestedSource ? "replacement.temporaryContainerSuccess" : "replacement.containerSuccess", {
    oldName: source.name,
    newName: replacement.name
  }), "success");
}

function addExistingItemToContainer(itemId) {
  if (replacingPackingItemId) {
    replaceExistingItemInLayout(itemId);
    return;
  }
  const containerId = runtime.addToContainerTargetId;
  const layoutId = runtime.addToContainerTargetLayoutId || state.activeLayoutId;
  const changedAt = nowIso();
  if (warnLockedLayoutMutation(layoutId) || warnUnavailableItemPlacement(itemId)) return;
  if (!placeExistingItemInLayout(itemId, containerId, layoutId, { changedAt })) {
    showToast(localText("Could not add the item to this layout.", "Не удалось добавить вещь в эту укладку."), "error");
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

function replaceExistingItemInLayout(replacementItemId) {
  const sourceItemId = replacingPackingItemId;
  const layoutId = runtime.addToContainerTargetLayoutId || state.activeLayoutId;
  const source = state.items?.[sourceItemId];
  const replacement = state.items?.[replacementItemId];
  const changedAt = nowIso();
  if (!source || !replacement || warnLockedLayoutMutation(layoutId) || warnUnavailableItemPlacement(replacementItemId)) return;
  const replaced = replaceItemInLayoutState(state, layoutId, sourceItemId, replacementItemId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    touchLayout
  });
  if (!replaced) {
    showToast(t("replacement.failed"), "error");
    return;
  }
  replacingPackingItemId = "";
  saveLayoutMutation(layoutId);
  if (refs.addToContainerDialog.open) refs.addToContainerDialog.close();
  if (refs.dialog.open) refs.dialog.close("cancel");
  renderPreservingPackingScroll();
  showToast(t("replacement.itemSuccess", { oldName: source.name, newName: replacement.name }), "success");
}

function markRecentlyAddedItem(itemId, layoutId = state.activeLayoutId) {
  runtime.recentlyAddedItemId = itemId || null;
  runtime.recentlyAddedContainerId = "";
  runtime.recentlyAddedLayoutId = layoutId || "";
}

function markRecentlyAddedContainer(containerId, layoutId = state.activeLayoutId) {
  runtime.recentlyAddedContainerId = containerId || "";
  runtime.recentlyAddedItemId = null;
  runtime.recentlyAddedLayoutId = layoutId || "";
}

function createSubcontainerFromAddDialog(event) {
  event.preventDefault();
  const parentId = runtime.addToContainerTargetId;
  const layoutId = runtime.addToContainerTargetLayoutId || state.activeLayoutId;
  const name = refs.newSubcontainerName.value.trim();
  if (!name) return;
  if (warnLockedLayoutMutation(layoutId)) return;
  if (!requireUsageCapacity("containers")) return;
  const changedAt = nowIso();
  const id = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const created = createSubcontainerInLayoutState(state, parentId, layoutId, {
    changedAt,
    currentCreateMeta,
    id,
    name,
    markRecordActivePublicCatalog,
    normalizeLayoutArrangement,
    touchContainer: markEdited,
    touchLayout
  });
  if (!created) {
    showToast(localText("Could not add the new list to this layout.", "Не удалось добавить новый список в эту укладку."), "error");
    return;
  }
  state.collapsedContainers[parentId] = false;
  state.collapsedContainers[id] = false;
  saveLocalUiState();
  markRecentlyAddedContainer(id, layoutId);
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
  if (runtime.recentlyAddedLayoutId && runtime.recentlyAddedLayoutId !== state.activeLayoutId) return;
  runtime.pendingPackingScroll = null;
  const card = refs.packingView.querySelector(`[data-item-id="${cssEscape(itemId)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  window.setTimeout(() => {
    if (runtime.recentlyAddedItemId === itemId) {
      runtime.recentlyAddedItemId = null;
      runtime.recentlyAddedLayoutId = "";
      card.classList.remove("just-added");
    }
  }, 1700);
}

function focusRecentlyAddedContainer(containerId) {
  if (runtime.recentlyAddedLayoutId && runtime.recentlyAddedLayoutId !== state.activeLayoutId) return;
  runtime.pendingPackingScroll = null;
  const selector = `[data-root-container-id="${cssEscape(containerId)}"], [data-subcontainer-id="${cssEscape(containerId)}"]`;
  const scrollToCard = (card, behavior = "smooth") => {
    card.scrollIntoView({ block: "center", inline: "center", behavior });
    syncFixedScrollbarVisibility();
  };
  const tryFocus = (remaining = 4) => {
    const card = refs.packingView.querySelector(selector);
    if (!card) {
      if (remaining > 0) requestAnimationFrame(() => tryFocus(remaining - 1));
      return;
    }
    scrollToCard(card, remaining === 4 ? "smooth" : "auto");
    if (remaining > 0) requestAnimationFrame(() => scrollToCard(card, "auto"));
    window.setTimeout(() => {
      if (runtime.recentlyAddedContainerId === containerId) {
        runtime.recentlyAddedContainerId = "";
        runtime.recentlyAddedLayoutId = "";
        card.classList.remove("just-added");
      }
    }, 1700);
  };
  tryFocus();
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

function renderCategoryPicker(target, selected = null, {
  fallbackDefault = true,
  idPrefix = "category",
  allowCreate = false
} = {}) {
  if (!target) return;
  const searchInput = target === refs.itemCategoryList
    ? refs.itemCategorySearch
    : (target === refs.rootContainerCategoryList ? refs.rootContainerCategorySearch : null);
  const selectedSet = new Set(selected || getCheckedCategoriesFromList(target));
  const categoryOptions = dictionaryOptionsForUi("category", { selected: [...selectedSet] });
  if (!categoryOptions.length && allowCreate) {
    target.innerHTML = renderEmptyCategoryPicker({
      hint: t("categories.emptyCreateHint"),
      placeholder: t("categories.newPlaceholder"),
      actionText: t("categories.add")
    });
    bindEmptyCategoryPicker(target, {
      onCreate: (value) => createCategoryFromDialogPicker(target, value)
    });
    syncCategorySearchAvailability(searchInput, target, {
      available: false,
      emptyText: t("categories.searchEmpty"),
      reset: true
    });
    return;
  }
  if (fallbackDefault && !selectedSet.size && categoryOptions[0]) selectedSet.add(categoryOptions[0]);
  target.innerHTML = categoryOptions.map((category) => {
    const id = `${idPrefix}-${cssSafeId(category)}`;
    return renderCategorySearchOption({
      category,
      label: dictionaryValueLabel(category),
      id,
      checked: selectedSet.has(category)
    });
  }).join("") + categorySearchEmptyHtml(t("categories.searchEmpty"));
  syncCategorySearchAvailability(searchInput, target, {
    available: Boolean(categoryOptions.length),
    emptyText: t("categories.searchEmpty"),
    reset: true
  });
}

function renderItemCategoryPicker(selected = null, { fallbackDefault = false } = {}) {
  renderCategoryPicker(refs.itemCategoryList, selected, {
    fallbackDefault,
    idPrefix: "item-category",
    allowCreate: true
  });
}

function renderRootContainerCategoryPicker(selected = null, { fallbackDefault = true } = {}) {
  renderCategoryPicker(refs.rootContainerCategoryList, selected, {
    fallbackDefault,
    idPrefix: "root-container-category",
    allowCreate: true
  });
}

function createCategoryFromDialogPicker(target, value) {
  const owner = activeDictionaryOwner();
  const existing = dictionaryOptionsForOwner("category", owner);
  if (!existing.includes(value)) {
    if (!requireUsageCapacity("categories")) return false;
    addCustomDictionaryValue(owner, "category", value);
    saveDictionaryOwner(owner);
  }
  const selected = [...getCheckedCategoriesFromList(target), value]
    .filter((category, index, values) => values.indexOf(category) === index);
  if (target === refs.itemCategoryList) {
    renderItemCategoryPicker(selected, { fallbackDefault: false });
    updateItemDialogSaveState();
  } else if (target === refs.rootContainerCategoryList) {
    renderRootContainerCategoryPicker(selected, { fallbackDefault: false });
    updateRootContainerDialogSaveState();
  }
  return true;
}

function getCheckedCategoriesFromList(target) {
  return [...target?.querySelectorAll?.("input:checked") || []].map((input) => input.value);
}

function getSelectedCategoriesFromPicker(target) {
  return getCheckedCategoriesFromList(target);
}

function getDialogSelectedCategories() {
  return getSelectedCategoriesFromPicker(refs.itemCategoryList);
}

function getRootContainerDialogSelectedCategories() {
  return getSelectedCategoriesFromPicker(refs.rootContainerCategoryList);
}

function isContainerPickerCopyMode() {
  return isContainerPickerCopyModeValue(runtime.containerPickerMode);
}

function isContainerPickerItemCopyMode() {
  return isContainerPickerItemCopyModeValue(runtime.containerPickerMode);
}

function isContainerPickerContainerCopyMode() {
  return isContainerPickerContainerCopyModeValue(runtime.containerPickerMode);
}

function isSharedTemplateCopyPickerMode() {
  return runtime.containerPickerMode === SHARED_ITEM_COPY_PICKER_MODE ||
    runtime.containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE;
}

function isContainerNestedInLayout(containerId, layoutId) {
  if (!containerId) return false;
  const layout = state.layouts?.[layoutId] || getPublishedWorkLayout();
  const rootIds = new Set([
    ...(layout?.rootContainerIds || []),
    ...(layout?.arrangement?.rootContainerIds || [])
  ]);
  if (rootIds.has(containerId)) return false;
  const placementParentId = layout?.arrangement?.containers?.[containerId]?.parentId;
  if (placementParentId) return true;
  return Boolean(state.containers?.[containerId]?.parentId);
}

function shouldUseRootCopyPlacementPicker() {
  return isContainerPickerContainerCopyMode() && !containerPickerSourceIsNestedContainer;
}

function getSharedTemplateCopyExcludedLayoutIds() {
  return containerCopyExcludedLayoutIds({
    mode: isSharedTemplateCopyPickerMode() ? runtime.containerPickerMode : "",
    readonlyLayoutId: activeReadOnlyLayoutId(),
    sourceLayoutId: runtime.containerPickerSourceLayoutId
  });
}

function getContainerCopyExcludedLayoutIds() {
  return containerCopyExcludedLayoutIds({
    mode: runtime.containerPickerMode,
    readonlyLayoutId: activeReadOnlyLayoutId(),
    sourceLayoutId: runtime.containerPickerSourceLayoutId
  });
}

function openItemContainerPickerDialog(event) {
  event?.preventDefault();
  const layoutId = runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const pickerMode = itemDialogContainerPickerMode(runtime.editingItemId);
  if (!isNewItemPlacementPickerMode(pickerMode) && warnLockedLayoutMutation(layoutId)) return;
  if (warnUnavailableItemDialogPlacement()) return;
  containerPickerSourceIsNestedContainer = false;
  runtime.containerPickerMode = pickerMode;
  runtime.containerPickerTargetContainerId = "";
  runtime.containerPickerLayoutId = layoutId;
  runtime.containerPickerSourceLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openItemCopyContainerPickerDialog(event) {
  event?.preventDefault();
  if (!runtime.editingItemId || !state.items[runtime.editingItemId]) return;
  if (warnUnavailableItemDialogPlacement()) return;
  containerPickerSourceIsNestedContainer = false;
  runtime.containerPickerMode = "item-copy";
  runtime.containerPickerTargetContainerId = "";
  runtime.containerPickerLayoutId = getPublishedEditLayoutId();
  runtime.containerPickerSourceLayoutId = getPublishedEditLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  if (await offerCreateLayoutWhenNoCopyTargets()) return;
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function openContainerParentPickerDialog(event) {
  event?.preventDefault();
  const container = state.containers[runtime.editingRootContainerId];
  if (!runtime.editingRootContainerId || !container) return;
  if (!container.parentId && !refs.rootContainerNestable?.checked) return;
  if (warnLockedLayoutMutation(getPublishedEditLayoutId())) return;
  containerPickerSourceIsNestedContainer = false;
  runtime.containerPickerMode = "container";
  runtime.containerPickerTargetContainerId = runtime.editingRootContainerId;
  runtime.containerPickerLayoutId = getPublishedEditLayoutId();
  runtime.containerPickerSourceLayoutId = getPublishedEditLayoutId();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openRootContainerCopyPickerDialog(event) {
  event?.preventDefault();
  if (!runtime.editingRootContainerId || !state.containers[runtime.editingRootContainerId]) return;
  containerPickerSourceIsNestedContainer = isContainerNestedInLayout(runtime.editingRootContainerId, getPublishedEditLayoutId());
  containerPickerCopyIncludesContents = rootContainerDialogCopyIncludesContents;
  runtime.containerPickerMode = "container-copy";
  runtime.containerPickerTargetContainerId = runtime.editingRootContainerId;
  runtime.containerPickerLayoutId = getPublishedEditLayoutId();
  runtime.containerPickerSourceLayoutId = getPublishedEditLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  if (await offerCreateLayoutWhenNoCopyTargets()) return;
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function orderedPersonalCopyTargetLayouts() {
  const targets = sharedCopyTargetLayouts(state.layouts, {
    excludeEmptySystemDefault: !canOpenAdminPublishedEdit() && isReadonlyTemplateView(),
    excludeRedundantEmptySystemDefault: !canOpenAdminPublishedEdit(),
    readonlySourceLayoutId: !canOpenAdminPublishedEdit() && isReadonlyTemplateView() ? activeReadOnlyLayoutId() : ""
  });
  const targetIds = new Set(targets.map((layout) => layout.id));
  return orderedLayouts(state.layouts, {
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    includeLayout: (layout) => targetIds.has(layout?.id),
    locale: uiLanguage || "ru"
  });
}

function firstPrivateLayoutId() {
  return orderedPersonalCopyTargetLayouts()[0]?.id || "";
}

async function openSharedItemCopyPicker(sourceId) {
  if (!sourceId) return;
  const sourceLayoutId = canOpenAdminPublishedEdit()
    ? getPublishedEditLayoutId()
    : activeReadOnlyLayoutId() || state.activeLayoutId;
  await ensurePrivateStateForSharedCopy();
  containerPickerSourceIsNestedContainer = false;
  runtime.sharedPickerSourceItemId = sourceId;
  runtime.sharedPickerSourceContainerId = "";
  runtime.containerPickerMode = SHARED_ITEM_COPY_PICKER_MODE;
  runtime.containerPickerTargetContainerId = "";
  runtime.containerPickerSourceLayoutId = sourceLayoutId || "";
  runtime.containerPickerLayoutId = selectedSharedTargetLayoutId() || firstPrivateLayoutId() || ensureSharedCopyTargetLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  if (await offerCreateLayoutWhenNoCopyTargets()) return;
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

async function openSharedContainerCopyPicker(sourceId, {
  sourceIsNestedContainer = false,
  includeContents = true
} = {}) {
  if (!sourceId) return;
  const sourceLayoutId = canOpenAdminPublishedEdit()
    ? getPublishedEditLayoutId()
    : activeReadOnlyLayoutId() || state.activeLayoutId;
  await ensurePrivateStateForSharedCopy();
  containerPickerSourceIsNestedContainer = sourceIsNestedContainer ||
    isContainerNestedInLayout(sourceId, sourceLayoutId);
  sharedPickerCopyIncludesContents = includeContents !== false;
  runtime.sharedPickerSourceItemId = "";
  runtime.sharedPickerSourceContainerId = sourceId;
  runtime.containerPickerMode = SHARED_CONTAINER_COPY_PICKER_MODE;
  runtime.containerPickerTargetContainerId = "";
  runtime.containerPickerSourceLayoutId = sourceLayoutId || "";
  runtime.containerPickerLayoutId = selectedSharedTargetLayoutId() || firstPrivateLayoutId() || ensureSharedCopyTargetLayoutId();
  await ensureAdminPublicCopyTargetsAvailable();
  if (await offerCreateLayoutWhenNoCopyTargets()) return;
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function renderContainerPicker() {
  const layoutOptions = getContainerPickerLayoutOptions();
  const newItemPlacementMode = isNewItemPlacementPickerMode(runtime.containerPickerMode);
  if (newItemPlacementMode) {
    runtime.containerPickerLayoutId = selectUnlockedLayoutTargetId(layoutOptions, runtime.containerPickerLayoutId);
  } else if (!layoutOptions.some((layout) => layout.id === runtime.containerPickerLayoutId)) {
    runtime.containerPickerLayoutId = layoutOptions[0]?.id || getPublishedEditLayoutId();
  }
  updateContainerPickerTitle();
  renderContainerPickerLayoutSelect(layoutOptions);
  const rootCopyPicker = shouldUseRootCopyPlacementPicker();
  let boardHtml = "";
  refs.containerPickerBoard.classList.toggle("root-copy-placement-board", rootCopyPicker);
  if (rootCopyPicker) {
    boardHtml = renderRootCopyPlacementBoard();
  } else if (runtime.containerPickerLayoutId) {
    withLayoutArrangementApplied(runtime.containerPickerLayoutId, () => {
      const layout = state.layouts?.[runtime.containerPickerLayoutId] || (newItemPlacementMode ? null : getPublishedWorkLayout());
      const rootIds = getVisibleLayoutRootIds(layout);
      boardHtml = rootIds.map(renderContainerPickerColumn).join("");
    });
  }
  const emptyItemCopyTarget = Boolean(
    !boardHtml &&
    isContainerPickerItemCopyMode() &&
    runtime.containerPickerLayoutId &&
    state.layouts?.[runtime.containerPickerLayoutId]
  );
  refs.containerPickerBoard.innerHTML = boardHtml || (emptyItemCopyTarget
    ? renderPackingAddRootCard({
        title: t("packing.addRootTitle"),
        text: t("packing.addRootText")
      })
    : `<div class="empty">${escapeHtml(t(newItemPlacementMode && !runtime.containerPickerLayoutId
        ? "forms.noUnlockedLayouts"
        : "forms.emptyTopLevel"))}</div>`);
  refs.containerPickerNoneBtn.hidden = runtime.containerPickerMode === "container" || isContainerPickerItemCopyMode() || rootCopyPicker;
  refs.containerPickerNoneBtn.classList.toggle("active", runtime.containerPickerMode === "item" && !refs.itemContainer.value);
  refs.containerPickerNoneBtn.textContent = isContainerPickerContainerCopyMode()
    ? t("forms.rootOfLayout")
    : refs.itemContainer.value ? t("forms.removeFromLayout") : t("forms.outsideLayout");
  refs.containerPickerBoard.querySelectorAll("[data-pick-container]").forEach((button) => {
    button.addEventListener("click", () => selectContainerPickerTarget(button.dataset.pickContainer));
  });
  refs.containerPickerBoard.querySelectorAll("[data-pick-container-parent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectContainerPickerTarget(button.dataset.pickContainerParent, Number(button.dataset.pickContainerIndex));
    });
  });
  refs.containerPickerBoard.querySelectorAll("[data-pick-root-index]").forEach((button) => {
    button.addEventListener("click", () => selectContainerPickerRootTarget(Number(button.dataset.pickRootIndex)));
  });
  refs.containerPickerBoard.querySelector("[data-add-packing-root]")
    ?.addEventListener("click", openCopyTargetContainerSetup);
  bindHorizontalTouchScroll(refs.containerPickerBoard);
}

function renderRootCopyPlacementBoard() {
  let boardHtml = "";
  withLayoutArrangementApplied(runtime.containerPickerLayoutId, () => {
    const layout = state.layouts?.[runtime.containerPickerLayoutId] || getPublishedWorkLayout();
    const rootIds = getVisibleLayoutRootIds(layout);
    const pieces = [];
    for (let index = 0; index <= rootIds.length; index += 1) {
      pieces.push(renderRootCopyPlacementSlot(index));
      if (index < rootIds.length) pieces.push(renderRootPlacementColumn(rootIds[index], ""));
    }
    boardHtml = pieces.join("") || renderRootCopyPlacementSlot(0);
  });
  return boardHtml;
}

function renderRootCopyPlacementSlot(slotIndex) {
  const placeHereText = escapeHtml(t("tooltips.placeHere"));
  return `
    <button
      class="root-placement-slot"
      type="button"
      data-pick-root-index="${slotIndex}"
      aria-label="${placeHereText}"
      title="${placeHereText}"
    >+</button>
  `;
}

function getContainerPickerLayoutOptions() {
  const currentLayout = getPublishedWorkLayout();
  const copyMode = isContainerPickerCopyMode();
  const newItemPlacementMode = isNewItemPlacementPickerMode(runtime.containerPickerMode);
  if (!copyMode && !newItemPlacementMode) {
    return currentLayout ? [currentLayout] : [];
  }
  const excludedLayoutIds = getContainerCopyExcludedLayoutIds();
  const allLayouts = Object.values(state.layouts || {});
  const personalLayouts = orderedPersonalCopyTargetLayouts()
    .filter((layout) => !excludedLayoutIds.has(layout.id));
  if (!canOpenAdminPublishedEdit()) return personalLayouts;
  const publicDrafts = orderAdminPublicDraftsLikeMainSelect(publicCopyTargetLayouts(allLayouts, {
    choiceForLayout: publicLayoutChoiceForLayout,
    visibleChoices: adminPublicLayoutOptions().map(([value]) => value)
  }).filter((layout) => isPublishedLayoutEditable(layout) && !excludedLayoutIds.has(layout.id)));
  return [...publicDrafts, ...personalLayouts];
}

async function offerCreateLayoutWhenNoCopyTargets() {
  if (getContainerPickerLayoutOptions().length) return false;
  const confirmed = await askConfirmDialog({
    title: t("copy.noOtherLayoutsTitle"),
    text: t("copy.noOtherLayoutsText"),
    okText: t("copy.createLayout"),
    cancelText: t("buttons.cancel")
  });
  if (confirmed) {
    pendingCopyTargetLayoutCreation = captureContainerPickerContinuation();
    if (refs.containerPickerDialog?.open) refs.containerPickerDialog.close();
    openLayoutDialog({ copyTargetFlow: true });
  }
  return true;
}

function resumeCopyPickerAfterLayoutCreation(layoutId) {
  const pending = pendingCopyTargetLayoutCreation;
  if (!pending || !layoutId || !state.layouts?.[layoutId]) return false;
  pendingCopyTargetLayoutCreation = null;
  restoreContainerPickerContinuation(pending, layoutId);
  return true;
}

function captureContainerPickerContinuation() {
  return {
    activeLayoutId: state.activeLayoutId,
    containerPickerLayoutId: runtime.containerPickerLayoutId,
    containerPickerMode: runtime.containerPickerMode,
    containerPickerSourceLayoutId: runtime.containerPickerSourceLayoutId,
    containerPickerTargetContainerId: runtime.containerPickerTargetContainerId,
    sharedPickerSourceContainerId: runtime.sharedPickerSourceContainerId,
    sharedPickerSourceItemId: runtime.sharedPickerSourceItemId,
    sourceIsNestedContainer: containerPickerSourceIsNestedContainer,
    containerPickerCopyIncludesContents,
    sharedPickerCopyIncludesContents
  };
}

function restoreContainerPickerContinuation(pending, layoutId = pending?.containerPickerLayoutId) {
  if (!pending || !layoutId || !state.layouts?.[layoutId]) return false;
  if (pending.activeLayoutId && state.layouts?.[pending.activeLayoutId] && state.activeLayoutId !== pending.activeLayoutId) {
    switchActiveLayout(pending.activeLayoutId, { remember: false });
  }
  runtime.containerPickerMode = pending.containerPickerMode;
  runtime.containerPickerTargetContainerId = pending.containerPickerTargetContainerId;
  runtime.containerPickerSourceLayoutId = pending.containerPickerSourceLayoutId;
  runtime.sharedPickerSourceContainerId = pending.sharedPickerSourceContainerId;
  runtime.sharedPickerSourceItemId = pending.sharedPickerSourceItemId;
  containerPickerSourceIsNestedContainer = pending.sourceIsNestedContainer;
  containerPickerCopyIncludesContents = pending.containerPickerCopyIncludesContents !== false;
  sharedPickerCopyIncludesContents = pending.sharedPickerCopyIncludesContents !== false;
  runtime.containerPickerLayoutId = layoutId;
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
  return true;
}

function openCopyTargetContainerSetup(event) {
  event?.preventDefault();
  const targetLayoutId = runtime.containerPickerLayoutId;
  if (!isContainerPickerItemCopyMode() || !state.layouts?.[targetLayoutId]) return;
  pendingCopyTargetContainerSetup = captureContainerPickerContinuation();
  if (refs.containerPickerDialog?.open) refs.containerPickerDialog.close("add-copy-target-container");
  openLayoutRootDialog({ targetLayoutId, returnToCopyPicker: true });
}

function scheduleCopyPickerResumeAfterContainerSetup() {
  Promise.resolve().then(resumeCopyPickerAfterContainerSetup);
}

function resumeCopyPickerAfterContainerSetup() {
  const pending = pendingCopyTargetContainerSetup;
  if (!pending) return false;
  pendingCopyTargetContainerSetup = null;
  layoutRootTargetLayoutId = "";
  rootContainerPlacementTargetLayoutId = "";
  return restoreContainerPickerContinuation(pending);
}

function renderContainerPickerLayoutSelect(layoutOptions) {
  if (!refs.containerPickerLayoutField || !refs.containerPickerLayoutSelect) return;
  const newItemPlacementMode = isNewItemPlacementPickerMode(runtime.containerPickerMode);
  const visible = shouldShowContainerPickerLayoutSelect({
    copyMode: isContainerPickerCopyMode(),
    newItemPlacementMode,
    optionCount: layoutOptions.length
  });
  refs.containerPickerLayoutField.hidden = !visible;
  if (!visible) return;
  fillSelect(
    refs.containerPickerLayoutSelect,
    layoutOptions.map((layout) => [
      layout.id,
      `${isLayoutLocked(layout) ? t("layout.lockedOptionPrefix") : ""}${copyPickerLayoutLabel(layout)}`,
      "",
      newItemPlacementMode && isLayoutLocked(layout)
    ]),
    runtime.containerPickerLayoutId
  );
}

function updateContainerPickerTitle() {
  if (!refs.containerPickerTitle) return;
  if (isNewItemPlacementPickerMode(runtime.containerPickerMode)) {
    refs.containerPickerTitle.textContent = t("forms.chooseLayoutPlace");
    return;
  }
  if (runtime.containerPickerMode === SHARED_ITEM_COPY_PICKER_MODE) {
    refs.containerPickerTitle.textContent = t("forms.copySharedItemTitle");
    return;
  }
  if (runtime.containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    refs.containerPickerTitle.textContent = t("forms.copySharedContainerTitle");
    return;
  }
  if (runtime.containerPickerMode === "item-copy") {
    refs.containerPickerTitle.textContent = t("forms.copyToPlace");
    return;
  }
  if (runtime.containerPickerMode === "container-copy") {
    const target = state.containers[runtime.containerPickerTargetContainerId];
    refs.containerPickerTitle.textContent = target?.name ? t("forms.copyNamedContainer", { name: target.name }) : t("forms.copyToPlace");
    return;
  }
  const target = runtime.containerPickerMode === "container" ? state.containers[runtime.containerPickerTargetContainerId] : null;
  refs.containerPickerTitle.textContent = target?.name ? t("forms.choosePlaceFor", { name: target.name }) : t("forms.choosePlace");
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
      return runtime.containerPickerMode === "container" ? "" : `${beforeSlot}${renderContainerPickerChildren(child.id, level + 1)}`;
    }
    const selected = getContainerPickerSelectedId() === child.id;
    const nested = runtime.containerPickerMode === "container" ? "" : renderContainerPickerChildren(child.id, level + 1);
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
    >${escapeHtml(t("forms.currentPlace"))}</div>
  `;
}

function isContainerPickerCurrentTarget(containerId) {
  return (runtime.containerPickerMode === "container" || isContainerPickerContainerCopyMode()) &&
    containerId === runtime.containerPickerTargetContainerId;
}

function shouldShowContainerPickerSlotsForParent(parentId) {
  if (runtime.containerPickerMode !== "container" && !(isContainerPickerContainerCopyMode() && containerPickerSourceIsNestedContainer)) return false;
  const parent = state.containers[parentId];
  return Boolean(parent && !parent.parentId);
}

function renderContainerPickerSlot(parentId, orderIndex, level, compact = false, isCurrentPosition = false) {
  if (runtime.containerPickerMode !== "container" && !(isContainerPickerContainerCopyMode() && containerPickerSourceIsNestedContainer)) return "";
  if (!isContainerPickerTargetAllowed(parentId)) return "";
  if (isCurrentPosition) return renderContainerPickerCurrentSlot(level, compact);
  const selected = getContainerPickerSelectedId() === parentId && getContainerPickerSelectedIndex() === orderIndex;
  const placeHereText = escapeHtml(t("tooltips.placeHere"));
  return `
    <button
      class="container-picker-slot ${compact ? "compact" : ""} ${selected ? "selected" : ""}"
      type="button"
      data-pick-container-parent="${parentId}"
      data-pick-container-index="${orderIndex}"
      style="--level: ${level}"
      aria-label="${placeHereText}"
      title="${placeHereText}"
    >+</button>
  `;
}

function isContainerPickerCurrentPositionSlot(parentId, orderIndex) {
  if (runtime.containerPickerMode !== "container" || !runtime.containerPickerTargetContainerId) return false;
  const movingContainer = state.containers[runtime.containerPickerTargetContainerId];
  const parent = state.containers[parentId];
  if (!movingContainer || !parent || movingContainer.parentId !== parentId) return false;
  const currentIndex = (parent.order || []).findIndex((entry) => entry.type === "container" && entry.id === movingContainer.id);
  return currentIndex >= 0 && orderIndex === currentIndex + 1;
}

function getContainerPickerSelectedId() {
  if (isContainerPickerCopyMode()) return "";
  return runtime.containerPickerMode === "container" ? getRootContainerDialogParentId() : refs.itemContainer.value;
}

function getContainerPickerSelectedIndex() {
  return runtime.containerPickerMode === "container" ? runtime.rootContainerDialogPendingParentIndex : null;
}

function isContainerPickerTargetAllowed(containerId) {
  if (runtime.containerPickerMode !== "container" && !isContainerPickerContainerCopyMode()) return true;
  if (!runtime.containerPickerTargetContainerId) return true;
  if (containerId === runtime.containerPickerTargetContainerId) return false;
  return !getDescendantContainerIds(runtime.containerPickerTargetContainerId).includes(containerId);
}

async function selectContainerPickerTarget(containerId, targetIndex = null) {
  if (runtime.containerPickerMode === "container") {
    selectRootContainerParent(containerId, targetIndex);
    return;
  }
  if (runtime.containerPickerMode === "item-copy") {
    await copyItemToContainerInLayout(runtime.editingItemId, containerId, runtime.containerPickerLayoutId);
    return;
  }
  if (runtime.containerPickerMode === "container-copy") {
    await copyContainerTreeToLayout(runtime.editingRootContainerId, runtime.containerPickerLayoutId, containerId, {
      includeContents: containerPickerCopyIncludesContents,
      sourceLayoutId: runtime.containerPickerSourceLayoutId,
      targetIndex
    });
    return;
  }
  if (runtime.containerPickerMode === SHARED_ITEM_COPY_PICKER_MODE) {
    await copySharedItemToLayoutContainer(runtime.sharedPickerSourceItemId, containerId, runtime.containerPickerLayoutId);
    return;
  }
  if (runtime.containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    await copySharedRootToLayoutContainer(runtime.sharedPickerSourceContainerId, containerId, runtime.containerPickerLayoutId, {
      includeContents: sharedPickerCopyIncludesContents,
      targetIndex
    });
    return;
  }
  selectItemContainer(containerId);
}

async function selectContainerPickerRootTarget(targetIndex = null) {
  if (runtime.containerPickerMode === "container-copy") {
    await copyContainerTreeToLayout(runtime.editingRootContainerId, runtime.containerPickerLayoutId, "", {
      includeContents: containerPickerCopyIncludesContents,
      sourceLayoutId: runtime.containerPickerSourceLayoutId,
      targetIndex
    });
    return;
  }
  if (runtime.containerPickerMode === SHARED_CONTAINER_COPY_PICKER_MODE) {
    await copySharedRootToLayoutContainer(runtime.sharedPickerSourceContainerId, "", runtime.containerPickerLayoutId, {
      includeContents: sharedPickerCopyIncludesContents,
      targetIndex
    });
  }
}

function selectItemContainer(containerId) {
  const layoutId = itemDialogTargetLayoutFromPicker({
    currentLayoutId: runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId(),
    mode: runtime.containerPickerMode,
    pickerLayoutId: runtime.containerPickerLayoutId
  });
  if (warnLockedLayoutMutation(layoutId)) return;
  runtime.itemDialogTargetLayoutId = layoutId;
  refs.itemContainer.value = containerId || "";
  updateItemContainerPickerButton();
  updateItemRemoveFromLayoutButton();
  updateItemDialogSaveState();
  refs.containerPickerDialog.close();
}

function closeSourceEditorAfterCopy(kind, sourceId) {
  if (kind === "item" && runtime.editingItemId === sourceId && refs.dialog?.open) {
    refs.dialog.close("copy");
  }
  if (kind === "container" && runtime.editingRootContainerId === sourceId && refs.rootContainerDialog?.open) {
    refs.rootContainerDialog.close("copy");
  }
}

async function hydrateAuthForSharedLink() {
  if (runtime.currentUser || isForcedOffline()) return;
  try {
    const authData = await apiFetch("/auth/me", { silentErrors: true });
    runtime.currentUser = authData.user || authData.me || authData.account || null;
    if (!runtime.currentUser && (authData.id || authData.email)) runtime.currentUser = { id: authData.id, email: authData.email };
    runtime.currentAuthorization = normalizeAuthAuthorization(authData.authorization);
    if (runtime.currentUser) {
      clearOfflineRememberedSession();
      setExplicitlySignedOut(false);
      activateLocalStorageScopeForCurrentUser();
      rememberAuthenticatedUser();
    }
  } catch {
    runtime.currentUser = null;
    runtime.currentAuthorization = normalizeAuthAuthorization(null);
  }
}

async function copyItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  if (warnLockedLayoutMutation(targetLayoutId) || warnUnavailableItemPlacement(itemId)) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const sourceRecordHasPublicOrigin = itemRecordIsPublicNamespaceSource(source, {
    hasPrivateSyncBlockedPublicOrigin
  });
  const { sourceIsPublicCopy, crossesPublicNamespace } = itemCopyNamespacePolicy({
    sourceLayoutIsPublic: isAdminEditablePublishedLayout(runtime.containerPickerSourceLayoutId),
    sourceRecordHasPublicOrigin,
    targetIsPublic
  });
  if (!crossesPublicNamespace) {
    if (layoutContainsItem(targetLayoutId, itemId)) {
      const duplicate = await askConfirmDialog({
        title: localText("The item is already in this layout", "Вещь уже есть в этой укладке"),
        text: localText(
          `“${source.name || "Item"}” is already used in “${targetLayout.name || "Layout"}”. Create a separate copy of this item?`,
          `«${source.name || "Вещь"}» уже участвует в укладке «${targetLayout.name || "Укладка"}». Создать отдельную копию этой вещи?`
        ),
        okText: localText("Duplicate", "Дублировать"),
        cancelText: localText("Do not copy", "Не копировать"),
        tone: "safe"
      });
      if (duplicate) {
        await duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId);
        return;
      }
      refs.containerPickerDialog.close();
      showToast(localText("Copy skipped: the item is already in the target layout.", "Копирование пропущено: вещь уже есть в целевой укладке."), "success");
      return;
    }
    if (linkExistingItemToContainerInLayout(itemId, targetContainerId, targetLayoutId)) return;
    return;
  }
  const publicSourceSnapshot = publicCopySnapshotFromSourceSnapshot({ rootId: "", containers: {}, items: { [itemId]: source } });
  if ((targetIsPublic || sourceIsPublicCopy) && publicSourceSnapshot) {
    if (!(await confirmPublicCopyDuplicates(targetLayoutId, publicSourceSnapshot, source.name))) return;
  }
  await duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId, { sourceIsPublicCopy });
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
  showToast(localText("The item was added to the selected layout without creating a duplicate.", "Вещь добавлена в выбранную укладку без создания дубля."), "success");
  return true;
}

async function duplicateItemToContainerInLayout(itemId, targetContainerId, targetLayoutId = state.activeLayoutId, {
  sourceIsPublicCopy: sourceIsPublicCopyContext = false
} = {}) {
  const source = state.items[itemId];
  const targetLayout = state.layouts[targetLayoutId];
  if (!source || !targetLayout) return;
  if (warnLockedLayoutMutation(targetLayoutId) || warnUnavailableItemPlacement(itemId)) return;
  if (!requireUsageCapacity("items")) return;
  const sourceSnapshot = clone(source);
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  const sourceIsPublicCopy = sourceIsPublicCopyContext || Boolean(sourceSnapshot.publicCatalogLayoutId) ||
    hasPrivateSyncBlockedPublicOrigin(sourceSnapshot, itemId) ||
    Boolean(publicCopySourceIdFromRecord(sourceSnapshot, "item", itemId));
  const shouldCopyPhotosToCurrentList = shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  const photoDuplicateOptions = photoDuplicateOptionsForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  const copyId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const copied = await duplicateItemToContainerInLayoutState(state, itemId, targetContainerId, targetLayoutId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    cloneEntity: cloneIsolatedPublicEntity,
    copyName: makeItemCopyName,
    copyPhotos: (record, options) => copyRecordPhotosForLocalDuplicate(record, { ...options, ...photoDuplicateOptions }),
    currentEditMeta,
    id: copyId,
    mapRecordToTarget: (record) => {
      if (targetIsPublic) {
        record.publicCatalogLayoutId = targetLayoutId;
      }
      if (shouldCopyPhotosToCurrentList) markRecordPhotosForCurrentListCopy(record);
      if (!targetIsPublic) {
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
  await saveLayoutMutation(targetLayoutId, { publishNow: targetIsPublic, forcePublic: targetIsPublic });
  if (!targetIsPublic && runtime.currentUser) {
    void saveRemoteState({
      expectedEntityIds: {
        items: [copyId],
        containers: [],
        layouts: [targetLayoutId]
      }
    });
  }
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("item", itemId);
  render();
  requestAnimationFrame(() => focusRecentlyAddedItem(copyId));
  showToast(localText("The item was copied to the selected layout.", "Вещь скопирована в выбранную укладку."), "success");
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

async function copyContainerTreeToLayout(containerId, targetLayoutId = state.activeLayoutId, targetParentId = "", {
  includeContents = true,
  sourceLayoutId = "",
  targetIndex = null
} = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  const fullSourceSnapshot = snapshotContainerTree(containerId, { sourceLayoutId, excludeLayoutId: targetLayoutId });
  const sourceSnapshot = containerCopySnapshotForContext(fullSourceSnapshot, { includeContents });
  if (!sourceSnapshot || !targetLayout) return;
  if (warnLockedLayoutMutation(targetLayoutId)) return;
  if (warnUnavailableSnapshotCopy(sourceSnapshot)) return;
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  const sourceLayout = state.layouts?.[sourceLayoutId];
  const sourceIsPublic = Boolean(
    sourceLayout?.adminDemo ||
    sourceLayout?.adminSharedSourceId ||
    Object.values(sourceSnapshot.containers || {}).some((container) => container?.publicCatalogLayoutId) ||
    Object.values(sourceSnapshot.items || {}).some((item) => item?.publicCatalogLayoutId)
  );
  const crossesPublicNamespace = copyCrossesPublicNamespaceBoundary({ sourceIsPublic, targetIsPublic });
  const copyAction = await chooseContainerTreeCopyToLayoutAction(targetLayoutId, sourceSnapshot, state.containers?.[containerId]?.name || "");
  if (copyAction === "cancel") return;
  if (copyAction === "copy-missing") {
    const copiedCount = await copyMissingPublicSnapshotItemsToLayout(sourceSnapshot, targetLayoutId);
    if (copiedCount) closeSourceEditorAfterCopy("container", sourceSnapshot.rootId || containerId);
    return;
  }
  if (copyAction === "copy-missing-local") {
    const copiedCount = await copyMissingLayoutSnapshotItemsToLayout(sourceSnapshot, targetLayoutId);
    if (copiedCount) closeSourceEditorAfterCopy("container", sourceSnapshot.rootId || containerId);
    return;
  }
  if (!crossesPublicNamespace) {
    const duplicates = layoutDuplicateSummaryForContainerTree(targetLayoutId, sourceSnapshot);
    const route = privateContainerTreeCopyRoute({
      copyAction,
      duplicateContainerIds: duplicates.containerIds,
      duplicateItemIds: duplicates.itemIds
    });
    if (route === "link-existing") {
      if (!linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId, targetParentId, { targetIndex })) {
        showToast(localText("Could not add the bag or pouch to the selected layout.", "Не удалось добавить сумку или пакет в выбранную укладку."), "error");
      }
      return;
    }
    if (route === "duplicate-explicit") {
      await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
        sourceContainerId: containerId,
        targetIndex
      });
      return;
    }
    return;
  }
  await duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId, targetParentId, {
    sourceContainerId: containerId,
    publicSource: sourceIsPublic,
    targetIndex
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

function layoutMissingItemPlanForContainerTree(layoutId, sourceSnapshot) {
  return planLayoutTreeMissingItems({
    sourceSnapshot,
    targetLayout: state.layouts[layoutId],
    getLayoutContainerIdSet,
    getLayoutItemIdSet
  });
}

function linkExistingContainerTreeToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "", { targetIndex = null } = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return false;
  if (warnLockedLayoutMutation(targetLayoutId)) return false;
  if (warnUnavailableSnapshotCopy(sourceSnapshot)) return false;
  ensureWritableTargetLayoutContext(targetLayoutId);
  const changedAt = nowIso();
  let linkedRootId = "";
  withLayoutArrangementApplied(targetLayoutId, () => {
    linkedRootId = linkExistingContainerTreeToLayoutState(state, sourceSnapshot, targetLayoutId, targetParentId, {
      changedAt,
      normalizeLayoutArrangement,
      targetIndex,
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
  showToast(localText("The bag or pouch was added to the selected layout without duplicates.", "Сумка или пакет добавлены в выбранную укладку без создания дублей."), "success");
  return true;
}

async function duplicateContainerSnapshotToLayout(sourceSnapshot, targetLayoutId = state.activeLayoutId, targetParentId = "", {
  sourceContainerId = sourceSnapshot?.rootId || "",
  publicSource = false,
  targetIndex = null
} = {}) {
  const targetLayout = state.layouts[targetLayoutId];
  if (!sourceSnapshot || !targetLayout) return "";
  if (warnLockedLayoutMutation(targetLayoutId)) return "";
  if (warnUnavailableSnapshotCopy(sourceSnapshot)) return "";
  if (!requireUsageCapacity("containers", Object.keys(sourceSnapshot.containers || {}).length)) return "";
  if (!requireUsageCapacity("items", Object.keys(sourceSnapshot.items || {}).length)) return "";
  const changedAt = nowIso();
  const targetIsPublic = isAdminEditablePublishedLayout(targetLayoutId);
  if (!targetIsPublic) ensureWritableTargetLayoutContext(targetLayoutId);
  const sourceIsPublicCopy = publicSource ||
    snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) ||
    snapshotHasLocalPublicCopyOrigin(sourceSnapshot);
  const shouldCopyPhotosToCurrentList = shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  const photoDuplicateOptions = photoDuplicateOptionsForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  const mapPublicOrigin = (record, sourceRecord, kind, sourceId) => {
    const publicSourceId = publicCopySourceIdFromRecord(sourceRecord, kind, sourceId) || sourceId;
    const marked = markPrivateCopyOriginFromSource(record, sourceRecord, kind, sourceId);
    if (!marked && publicSource) {
      markLocalPublicCopyOrigin(
        record,
        kind,
        publicSourceId,
        sourceRecord?._publicCopySourceLayoutId || "",
        publicCopyRecordContentHash(sourceRecord, kind)
      );
    }
    if (targetIsPublic && publicSource && !record.sharedSourceId) record.sharedSourceId = publicSourceId;
  };
  const mapRecordToTarget = (record) => {
    if (!record) return;
    if (targetIsPublic) {
      record.publicCatalogLayoutId = targetLayoutId;
    }
    if (shouldCopyPhotosToCurrentList) markRecordPhotosForCurrentListCopy(record);
    if (!targetIsPublic) {
      stripPublicOriginForPrivateCopy(record);
    }
  };
  const duplicateIntoTargetLayout = async () => {
    const activeTargetLayout = state.layouts[targetLayoutId];
    const targetContainerSet = getLayoutContainerIdSet(activeTargetLayout);
    if (targetParentId && (!state.containers[targetParentId] || !targetContainerSet.has(targetParentId))) return "";

    const {
      rootId: nextRootId,
      copiedPlacements,
      copiedItemContainers
    } = await duplicateContainerSnapshotRecords(sourceSnapshot, {
      changedAt,
      cloneEntity: cloneIsolatedPublicEntity,
      copyContainerName: (name) => makeContainerCopyNameForLayout(
        name,
        activeTargetLayout,
        state.containers,
        uiLanguage === "en" ? "copy" : "копия"
      ),
      copyPhotos: (record, options) => copyRecordPhotosForLocalDuplicate(record, { ...options, ...photoDuplicateOptions }),
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
      targetIndex,
      touchContainer,
      touchLayout
    });
    if (!placed) return "";
    if (targetLayoutId === state.activeLayoutId) applyLayoutArrangement(targetLayoutId);
    markRecentlyAddedContainer(nextRootId, targetLayoutId);
    await saveLayoutMutation(targetLayoutId, { publishNow: targetIsPublic, forcePublic: targetIsPublic });
    if (!targetIsPublic && runtime.currentUser) {
      void saveRemoteState({
        expectedEntityIds: {
          items: Object.keys(copiedItemContainers),
          containers: Object.keys(copiedPlacements),
          layouts: [targetLayoutId]
        }
      });
    }
    return nextRootId;
  };

  const nextRootId = targetLayoutId === state.activeLayoutId
    ? await duplicateIntoTargetLayout()
    : await withLayoutArrangementAppliedAsync(targetLayoutId, duplicateIntoTargetLayout);
  if (!nextRootId) return "";
  openCopiedTargetLayout(targetLayoutId);
  refs.containerPickerDialog.close();
  closeSourceEditorAfterCopy("container", sourceContainerId || sourceSnapshot.rootId);
  render();
  renderSharedLayouts();
  requestAnimationFrame(() => focusRecentlyAddedContainer(nextRootId));
  showToast(localText("The bag or pouch was copied to the selected layout.", "Сумка или пакет скопированы в выбранную укладку."), "success");
  return nextRootId;
}

function selectRootContainerParent(parentId, targetIndex = null) {
  const containerId = runtime.containerPickerTargetContainerId || runtime.editingRootContainerId;
  if (!containerId || !state.containers[containerId] || !state.containers[parentId]) return;
  if (warnLockedLayoutMutation(getPublishedEditLayoutId())) return;
  if (!isContainerPickerTargetAllowed(parentId)) return;
  runtime.rootContainerDialogPendingParentId = parentId;
  runtime.rootContainerDialogPendingParentIndex = Number.isFinite(targetIndex) ? targetIndex : null;
  updateRootContainerPlacementButton();
  updateRootContainerRemoveFromLayoutButton();
  updateRootContainerDialogSaveState();
  refs.containerPickerDialog.close();
  showToast(localText("Place selected. Click “Save”.", "Место выбрано. Нажмите «Сохранить»."), "success");
}

function updateItemContainerPickerButton() {
  const containerId = refs.itemContainer.value;
  const layout = state.layouts?.[runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId()];
  const hasContainer = Boolean(containerId && state.containers[containerId]);
  const path = hasContainer ? layoutContainerPath(layout, containerId) : t("forms.outsideLayout");
  if (refs.itemContainerLabel) refs.itemContainerLabel.textContent = hasContainer
    ? localText("Stored in", "Находится в")
    : t("forms.placeIn");
  if (refs.itemContainerCurrent) {
    refs.itemContainerCurrent.hidden = false;
    refs.itemContainerCurrent.textContent = path;
    refs.itemContainerCurrent.classList.toggle("active", hasContainer);
  }
  refs.itemContainerPickerBtn.textContent = runtime.editingItemId
    ? t("forms.moveInsideLayout")
    : t("forms.placeInLayout");
  refs.itemContainerPickerBtn.classList.remove("active");
  refs.itemContainerPickerBtn.classList.add("repack-button");
  refs.itemContainerPickerBtn.setAttribute("aria-label", hasContainer
    ? localText(`Move from ${path}`, `Переложить из ${path}`)
    : localText("Place in layout", "Положить в укладку"));
}

function updateItemRemoveFromLayoutButton() {
  if (!refs.itemRemoveFromLayoutBtn) return;
  const layout = state.layouts?.[runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId()];
  const canRemove = Boolean(
    runtime.editingItemId &&
    refs.itemContainer.value &&
    getItemContainerIdInLayout(layout, runtime.editingItemId)
  );
  refs.itemRemoveFromLayoutBtn.hidden = !canRemove;
  refs.itemRemoveFromLayoutBtn.disabled = !canRemove;
}

function updateItemReplacementButton() {
  if (!refs.itemReplaceBtn) return;
  const layout = state.layouts?.[runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId()];
  const canReplace = Boolean(
    runtime.editingItemId &&
    getItemContainerIdInLayout(layout, runtime.editingItemId) &&
    !isReadOnlyStateScope() &&
    !isSharedLayoutView()
  );
  refs.itemReplaceBtn.textContent = t("replacement.itemAction");
  refs.itemReplaceBtn.hidden = !canReplace;
  refs.itemReplaceBtn.disabled = !canReplace;
}

function updateItemDeleteForeverButton() {
  if (!refs.itemDeleteForeverBtn) return;
  const canDelete = Boolean(runtime.editingItemId && state.items?.[runtime.editingItemId]);
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
    runtime.pendingFilterJump = false;
    runtime.filterMatchSignature = "";
    runtime.filterMatchIndex = 0;
    return;
  }
  const signature = filterNavigationSignature();
  const matches = getFilterMatchElements();
  if (signature !== runtime.filterMatchSignature) {
    runtime.filterMatchSignature = signature;
    runtime.filterMatchIndex = 0;
    runtime.pendingFilterJump = !runtime.suppressNextFilterJump;
    runtime.suppressNextFilterJump = false;
  }
  if (runtime.filterMatchIndex >= matches.length) runtime.filterMatchIndex = Math.max(0, matches.length - 1);
  refs.filterPrevBtn.disabled = matches.length < 1;
  refs.filterNextBtn.disabled = matches.length < 1;
  refs.filterNavStatus.textContent = matches.length ? `${runtime.filterMatchIndex + 1}/${matches.length}` : "0/0";
  if (runtime.pendingFilterJump) {
    runtime.pendingFilterJump = false;
    if (matches.length) requestAnimationFrame(() => scrollToFilterMatch(runtime.filterMatchIndex, { highlight: true }));
  }
}

function scheduleFilterNavigationRefresh() {
  if (runtime.filterNavRefreshFrame) return;
  runtime.filterNavRefreshFrame = requestAnimationFrame(() => {
    runtime.filterNavRefreshFrame = null;
    updateFilterNavigationUi();
  });
}

function moveFilterMatch(step) {
  const matches = getFilterMatchElements();
  if (!matches.length) return;
  runtime.filterMatchIndex = (runtime.filterMatchIndex + step + matches.length) % matches.length;
  scrollToFilterMatch(runtime.filterMatchIndex, { highlight: true });
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
    if (runtime.filterViewCollapsedContainers[containerId] !== false) {
      runtime.filterViewCollapsedContainers[containerId] = false;
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
    const notHome = containers.filter((container) =>
      isItemAwayFromHomeAndBike({ location: container.location || defaultRootContainerLocation(state) })
    ).length;
    const unknownWeight = containers.filter((container) => !Number(container.weight || 0)).length;
    renderSummaryContent([
      metric(formatWeight(totalWeight), filteredLabel(t("summary.totalBagWeight"), isFiltered)),
      metric(String(containers.length), filteredLabel(t("summary.bagsShown"), isFiltered)),
      metric(String(notHome), filteredLabel(t("summary.notPacked"), isFiltered)),
      metric(String(unknownWeight), filteredLabel(t("summary.withoutWeight"), isFiltered))
    ]);
    return;
  }
  const visibleItems = getSummaryItems(view);
  const totalWeight = getSummaryWeight(view, visibleItems, isFiltered);
  const unknownWeight = visibleItems.filter((item) => !Number(item.weight)).length;
  const notHome = visibleItems.filter(isItemAwayFromHomeAndBike).length;
  if (isPackingView && state.collectionMode) {
    const activeItems = getActiveLayoutItems().filter(matchesBaseFilters);
    const packedCount = activeItems.filter((item) => isItemPacked(item.id)).length;
    const unpackedCount = Math.max(0, activeItems.length - packedCount);
    renderSummaryContent([
      metric(`${packedCount} / ${activeItems.length}`, t("summary.packed")),
      metric(String(unpackedCount), t("summary.leftToPack")),
      metric(String(notHome), filteredLabel(t("summary.notPacked"), isFiltered)),
      metric(String(unknownWeight), filteredLabel(t("summary.withoutWeight"), isFiltered))
    ]);
    return;
  }
  renderSummaryContent([
    metric(formatWeight(totalWeight), filteredLabel(t("summary.totalWeight"), isFiltered)),
    metric(String(visibleItems.length), filteredLabel(t("summary.itemsShown"), isFiltered)),
    metric(String(notHome), filteredLabel(t("summary.notPacked"), isFiltered)),
    metric(String(unknownWeight), filteredLabel(t("summary.withoutWeight"), isFiltered))
  ]);
}

function getSummaryItems(view = getCurrentView()) {
  if (view === "items") return getItemsViewSummaryItems();
  return getActiveLayoutItems().filter(matchesFilters);
}

function getSummaryWeight(view, items, isFiltered) {
  const layout = state.layouts[state.activeLayoutId];
  if (view === "packing" || view === "settings") {
    return layoutContainersOwnWeightForState(state, layout) + items.reduce((sum, item) => sum + itemTotalWeight(item), 0);
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
  if (view === "bags") return runtime.rootContainerUsageFilter !== "all" || hasActiveContentFilter("bags");
  return hasActiveContentFilter() || (state.collectionMode && state.showOnlyUnpacked);
}

function filteredLabel(label, isFiltered) {
  return isFiltered ? `${label} в фильтре` : label;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function layoutNotesSummaryHtml() {
  const layoutId = state.activeLayoutId || "";
  const notes = normalizeLayoutNotes(state.layouts?.[layoutId]?.notes);
  if (!notes) return "";
  const storageKey = scopedLocalStorageKey(LAYOUT_NOTES_COLLAPSE_STORAGE_KEY);
  const collapsed = isLayoutNotesCollapsed(storageKey, layoutId);
  const toggleLabel = t(collapsed ? "tooltips.expand" : "tooltips.collapse");
  const editLabel = t("tooltips.edit");
  return `
    <div class="layout-notes-summary ${collapsed ? "collapsed" : ""}">
      <div class="layout-notes-header">
        <strong>${escapeHtml(t("layout.notesTitle"))}</strong>
        <div class="layout-notes-actions">
          ${canManageActiveLayout() ? `
            <button
              type="button"
              class="edit-button layout-notes-edit-button"
              data-edit-layout-notes
              aria-label="${escapeHtml(editLabel)}"
              title="${escapeHtml(editLabel)}"
            ><span aria-hidden="true">&#9998;</span></button>
          ` : ""}
          <button
            type="button"
            class="layout-notes-collapse-button"
            data-toggle-layout-notes="${escapeHtml(layoutId)}"
            aria-expanded="${String(!collapsed)}"
            aria-label="${escapeHtml(`${t("layout.notesTitle")}: ${toggleLabel}`)}"
            title="${escapeHtml(toggleLabel)}"
          ><span class="layout-notes-chevron" aria-hidden="true"></span></button>
        </div>
      </div>
      <p ${collapsed ? "hidden" : ""}>${escapeHtml(notes)}</p>
    </div>
  `;
}

function renderSummaryContent(metrics) {
  refs.summary.innerHTML = `${metrics.join("")}${layoutNotesSummaryHtml()}`;
  refs.summary.querySelector("[data-toggle-layout-notes]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const layoutId = button.dataset.toggleLayoutNotes || "";
    const collapsed = button.getAttribute("aria-expanded") === "true";
    setLayoutNotesCollapsed(scopedLocalStorageKey(LAYOUT_NOTES_COLLAPSE_STORAGE_KEY), layoutId, collapsed);
    renderSummary();
  });
  refs.summary.querySelector("[data-edit-layout-notes]")?.addEventListener("click", openLayoutEditDialog);
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
    sharedVirtualCollapsedContainers: runtime.sharedVirtualCollapsedContainers,
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
    runtime.sharedVirtualCollapsedContainers = { ...state.collapsedContainers };
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
    renderSummaryContent([
      metric(t("shared.prefix"), t("shared.viewMetric")),
      metric(formatWeight(totalWeight), t("summary.totalWeight")),
      metric(String(rootCount), t("summary.bags")),
      metric(String(unknownWeight), t("summary.withoutWeight"))
    ]);
  });
}

function renderPacking() {
  const photoRenderState = capturePackingPhotoRenderState(refs.packingView);
  if (isSharedLayoutView()) {
    if (isBike3dPackingView(runtime.packingViewMode)) {
      renderSharedPackingBike3d();
      restorePackingPhotoRenderState(refs.packingView, photoRenderState);
      return;
    }
    renderSharedPacking();
    restorePackingPhotoRenderState(refs.packingView, photoRenderState);
    return;
  }
  if (isBike3dPackingView(runtime.packingViewMode)) {
    renderCurrentPackingBike3d();
    restorePackingPhotoRenderState(refs.packingView, photoRenderState);
    return;
  }
  const layout = state.layouts[state.activeLayoutId] || Object.values(state.layouts || {})[0] || { rootContainerIds: [] };
  const rootIds = getVisibleLayoutRootIds(layout);
  const visibleRootIds = hasActiveContentFilter() && !isFilterContextActive()
    ? rootIds.filter(containerHasVisibleFilterResult)
    : rootIds;
  const columns = hasActiveContentFilter() && !isFilterContextActive()
    ? visibleRootIds.map(renderFilteredContainer)
    : visibleRootIds.map(renderContainer);
  const filteredEmpty = hasActiveContentFilter();
  const emptyText = t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound");
  const emptyHtml = filteredEmpty
    ? renderEmptyState(emptyText, { extraClass: "board-empty", filtered: true })
    : rootIds.length === 0
      ? renderPackingEmptyState({
          title: t("packing.emptyTitle"),
          text: t("packing.emptyText"),
          actionText: t("packing.emptyAction"),
          hint: t("packing.emptyHint")
        })
      : renderEmptyState(emptyText, { extraClass: "board-empty" });
  const addRootHtml = !filteredEmpty && rootIds.length > 0 && !isLayoutLocked(layout)
    ? renderPackingAddRootCard({
        title: t("packing.addRootTitle"),
        text: t("packing.addRootText")
      })
    : "";
  const boardHtml = columns.length ? `${columns.join("")}${addRootHtml}` : emptyHtml;
  refs.packingView.innerHTML = `
    ${renderPackingRootHeaderRow(visibleRootIds, { filtered: hasActiveContentFilter() && !isFilterContextActive() })}
    <div class="board">${boardHtml}</div>
  `;
  restorePackingPhotoRenderState(refs.packingView, photoRenderState);
  bindPackingEvents(refs.packingView);
  const sharedBoard = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(sharedBoard);
  bindBoardScroll(sharedBoard);
  bindStickyRootHeaderRow(sharedBoard);
  bindFixedScrollbar(sharedBoard);
}

function renderCurrentPackingBike3d({ beforeHtml = "", shared = false } = {}) {
  const layout = state.layouts[state.activeLayoutId] || Object.values(state.layouts || {})[0] || { rootContainerIds: [] };
  const rootIds = getVisibleLayoutRootIds(layout).filter((id) => state.containers[id]);
  if (runtime.selectedBike3dContainerId && !rootIds.includes(runtime.selectedBike3dContainerId)) {
    runtime.selectedBike3dContainerId = "";
    runtime.adjustingBike3dContainerId = "";
  }
  renderBike3dPackingView({
    target: refs.packingView,
    beforeHtml,
    rootIds,
    containers: state.containers,
    selectedContainerId: runtime.selectedBike3dContainerId,
    adjustingContainerId: runtime.adjustingBike3dContainerId,
    transforms: runtime.bike3dTransforms,
    viewState: runtime.bike3dViewState,
    renderContainer,
    containerWeight,
    formatWeight,
    escapeHtml,
    localText,
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
  if (!containerId || runtime.selectedBike3dContainerId === containerId) return;
  capturePackingScroll();
  const keepAdjusting = Boolean(runtime.adjustingBike3dContainerId);
  runtime.selectedBike3dContainerId = containerId;
  if (keepAdjusting) runtime.adjustingBike3dContainerId = containerId;
  renderPacking();
}

function closeBike3dDetail() {
  capturePackingScroll();
  runtime.selectedBike3dContainerId = "";
  runtime.adjustingBike3dContainerId = "";
  renderPacking();
}

function toggleBike3dAdjusting(containerId) {
  if (!containerId) return;
  capturePackingScroll();
  runtime.adjustingBike3dContainerId = runtime.adjustingBike3dContainerId === containerId ? "" : containerId;
  runtime.selectedBike3dContainerId = containerId;
  renderPacking();
}

function getBike3dTransform(containerId) {
  return normalizeBike3dTransform(runtime.bike3dTransforms[containerId]);
}

function adjustBike3dTransform(action) {
  if (!runtime.selectedBike3dContainerId) return;
  capturePackingScroll();
  const current = getBike3dTransform(runtime.selectedBike3dContainerId);
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
  if (action === "reset") delete runtime.bike3dTransforms[runtime.selectedBike3dContainerId];
  else runtime.bike3dTransforms[runtime.selectedBike3dContainerId] = normalizeBike3dTransform(next);
  saveUiSettings();
  renderPacking();
}

function setBike3dColor(color) {
  if (!runtime.selectedBike3dContainerId || !/^#[0-9a-f]{6}$/i.test(String(color || ""))) return;
  capturePackingScroll();
  runtime.bike3dTransforms[runtime.selectedBike3dContainerId] = normalizeBike3dTransform({
    ...getBike3dTransform(runtime.selectedBike3dContainerId),
    color
  });
  saveUiSettings();
  renderPacking();
}

function setBike3dViewState(nextViewState) {
  runtime.bike3dViewState = normalizeBike3dViewState(nextViewState);
  saveUiSettings();
}

function resetBike3dViewState() {
  capturePackingScroll();
  runtime.bike3dViewState = defaultBike3dViewState();
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
  const authorName = String(layout?.listRecord?.authorName || "").trim();
  return `
    <div class="shared-mode-banner ${compact ? "shared-mode-banner-compact" : ""}">
      <div class="shared-mode-banner-text">
        <strong>${escapeHtml(layout?.name || t("shared.layout"))}</strong>
        ${authorName ? `<span>${escapeHtml(uiLanguage === "en" ? `Author: ${authorName}` : `Автор: ${authorName}`)}</span>` : ""}
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
    const visibleRootIds = hasActiveContentFilter() && !isFilterContextActive()
      ? rootIds.filter(containerHasVisibleFilterResult)
      : rootIds;
    const columns = hasActiveContentFilter() && !isFilterContextActive()
      ? visibleRootIds.map(renderFilteredContainer)
      : visibleRootIds.map(renderContainer);
    const filteredEmpty = hasActiveContentFilter();
    const emptyText = t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound");
    refs.packingView.innerHTML = `
      ${renderSharedModeBanner(currentSharedLayout())}
      ${renderPackingRootHeaderRow(visibleRootIds, { filtered: hasActiveContentFilter() && !isFilterContextActive() })}
      <div class="board">${columns.join("") || renderEmptyState(emptyText, { extraClass: "board-empty", filtered: filteredEmpty })}</div>
    `;
  });
  bindSharedVirtualEvents(refs.packingView);
  const sharedBoard = refs.packingView.querySelector(".board");
  restorePendingPackingScroll(sharedBoard);
  bindBoardScroll(sharedBoard);
  bindStickyRootHeaderRow(sharedBoard);
  bindFixedScrollbar(sharedBoard);
}

function capturePackingScroll() {
  const board = getPackingScrollHost();
  const packingHidden = refs.packingView.classList.contains("hidden");
  const pageScroll = currentPageScrollPosition();
  if (packingHidden && runtime.lastPackingScrollSnapshot) {
    runtime.pendingPackingScroll = { ...runtime.lastPackingScrollSnapshot };
    return;
  }
  runtime.pendingPackingScroll = {
    boardLeft: board?.scrollLeft || 0,
    windowX: pageScroll.x,
    windowY: pageScroll.y,
    bike3dDetail: isBike3dPackingView(runtime.packingViewMode) ? captureBike3dDetailViewport(refs.packingView) : null
  };
  if (!packingHidden) {
    runtime.lastPackingScrollSnapshot = { ...runtime.pendingPackingScroll };
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
  return [
    refs.controls,
    document.querySelector(".tabs-row"),
    ...document.querySelectorAll(".catalog-toolbar-sticky")
  ]
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
  const target = getFilterMatchElements()[runtime.filterMatchIndex];
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
  if (!runtime.pendingPackingScroll || !board) return;
  if (refs.packingView.classList.contains("hidden")) return;
  const { boardLeft, windowX, windowY, bike3dDetail = null } = runtime.pendingPackingScroll;
  runtime.pendingPackingScroll = null;
  runtime.lastPackingScrollSnapshot = { boardLeft, windowX, windowY, bike3dDetail };
  board.scrollLeft = boardLeft;
  window.scrollTo({ left: windowX, top: windowY, behavior: "auto" });
  restoreBike3dDetailViewport(refs.packingView, bike3dDetail);
  requestAnimationFrame(() => {
    board.scrollLeft = boardLeft;
    window.scrollTo({ left: windowX, top: windowY, behavior: "auto" });
    restoreBike3dDetailViewport(refs.packingView, bike3dDetail);
    syncFixedScrollbarVisibility();
  });
}

function renderPackingRootStickyHeader(containerId, { filtered = false } = {}) {
  const container = state.containers[containerId];
  if (!container) return "";
  const descendantIds = getDescendantContainerIds(containerId);
  const hasNestedContainers = !filtered && descendantIds.length > 0;
  const allNestedCollapsed = hasNestedContainers && descendantIds.every((id) => state.collapsedContainers[id]);
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  return renderPackingRootHeaderCellHtml({
    allNestedCollapsed,
    container,
    hasNestedContainers,
    packed,
    readonly: isReadOnlyStateScope(),
    readonlyTemplate: isReadonlyTemplateView(),
    rootCollapsed,
    t,
    titleHtml: `${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${filtered || isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}`,
    totalWeightHtml: renderContainerWeightText(containerWeight(containerId))
  });
}

function renderPackingRootHeaderRow(rootIds, { filtered = false } = {}) {
  const headers = (rootIds || [])
    .map((containerId) => renderPackingRootStickyHeader(containerId, { filtered }))
    .join("");
  return headers ? `<div class="packing-root-header-row"><div class="packing-root-header-track">${headers}</div></div>` : "";
}

function renderContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const descendantIds = getDescendantContainerIds(containerId);
  const hasNestedContainers = descendantIds.length > 0;
  const allNestedCollapsed = hasNestedContainers && descendantIds.every((id) => state.collapsedContainers[id]);
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = runtime.recentlyAddedContainerId === container.id && (!runtime.recentlyAddedLayoutId || runtime.recentlyAddedLayoutId === state.activeLayoutId);
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
    t,
    titleHtml: `${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${isFilterContextActive() ? highlight(container.name) : escapeHtml(container.name)}`,
    totalWeightHtml: renderContainerWeightText(total)
  });
}

function renderFilteredContainer(containerId) {
  const container = state.containers[containerId];
  const total = containerWeight(containerId);
  const rootCollapsed = isReadOnlyStateScope() && Boolean(state.collapsedContainers[containerId]);
  const packed = state.collectionMode && isContainerPacked(containerId);
  const justAdded = runtime.recentlyAddedContainerId === container.id && (!runtime.recentlyAddedLayoutId || runtime.recentlyAddedLayoutId === state.activeLayoutId);
  return renderFilteredRootContainerColumnHtml({
    container,
    contentsHtml: rootCollapsed ? "" : renderFilteredContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: rootCollapsed ? "" : renderItemPhoto(container),
    readonly: isReadOnlyStateScope(),
    readonlyTemplate: isReadonlyTemplateView(),
    rootCollapsed,
    t,
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
  const justAdded = runtime.recentlyAddedContainerId === container.id && (!runtime.recentlyAddedLayoutId || runtime.recentlyAddedLayoutId === state.activeLayoutId);
  return renderSubcontainerSectionHtml({
    collapsed,
    container,
    contentsHtml: renderContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: renderItemPhoto(container),
    t,
    titleHtml: subcontainerTitleHtml({
      container,
      editing: runtime.editingContainerId === container.id,
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
  const justAdded = runtime.recentlyAddedContainerId === container.id && (!runtime.recentlyAddedLayoutId || runtime.recentlyAddedLayoutId === state.activeLayoutId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const collapsed = getFilterViewCollapsed(containerId, defaultCollapsed);
  return renderSubcontainerSectionHtml({
    collapsed,
    container,
    contentsHtml: collapsed ? "" : renderFilteredContainerContents(container.id),
    justAdded,
    packed,
    photoHtml: renderItemPhoto(container),
    t,
    titleHtml: subcontainerTitleHtml({
      container,
      editing: runtime.editingContainerId === container.id,
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
  return Boolean(refs.searchInput.value.trim() || refs.locationFilter.value || runtime.selectedCategoryFilters.length);
}

function clearContentFiltersForPackingDrag() {
  if (!hasActiveContentFilter()) return false;
  if (runtime.searchRenderTimer) {
    window.clearTimeout(runtime.searchRenderTimer);
    runtime.searchRenderTimer = null;
  }
  if (runtime.searchContextCommitTimer) {
    window.clearTimeout(runtime.searchContextCommitTimer);
    runtime.searchContextCommitTimer = null;
  }
  resetContentFilterControls({ refs, runtime });
  showToast(localText(
    "Search filters were cleared so the full layout is available for dragging.",
    "Фильтр сброшен, чтобы была доступна вся укладка для перетаскивания."
  ), "warning");
  return true;
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
    runtime.selectedCategoryFilters.join(","),
    state.collectionMode && state.showOnlyUnpacked ? "unpacked" : ""
  ].join("\u001f");
}

function ensureFilterViewCollapseState() {
  const signature = contentFilterSignature();
  if (signature !== runtime.filterViewCollapseSignature) {
    runtime.filterViewCollapseSignature = signature;
    runtime.filterViewCollapsedContainers = {};
  }
}

function getFilterViewCollapsed(containerId, defaultCollapsed) {
  ensureFilterViewCollapseState();
  if (Object.prototype.hasOwnProperty.call(runtime.filterViewCollapsedContainers, containerId)) {
    return runtime.filterViewCollapsedContainers[containerId];
  }
  return defaultCollapsed;
}

function toggleFilterViewCollapsed(containerId) {
  const result = getContainerFilterResult(containerId);
  const defaultCollapsed = !(result.hasMatchingItems || result.hasVisibleChildContainers);
  const current = getFilterViewCollapsed(containerId, defaultCollapsed);
  runtime.filterViewCollapsedContainers[containerId] = !current;
}

function containerTitleMatchesSearch(container) {
  return matchesContainerFieldsFilter(container);
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
  if (!state.items[itemId] || runtime.editingItemTitleId === itemId) return;
  runtime.editingItemTitleId = itemId;
  runtime.editingContainerId = null;
  renderPreservingPackingScroll();
}

function togglePacked(itemId) {
  if (!state.items[itemId]) return;
  if (warnLockedLayoutMutation(state.activeLayoutId)) return;
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
  if (warnLockedLayoutMutation(state.activeLayoutId)) return;
  openConfirmDialog({
    title: localText("Mark all items as unpacked?", "Разобрать все вещи?"),
    text: localText("All packed marks will be removed. The items and layout will stay in place.", "Все отметки «собрано» будут сняты. Сами вещи и укладка останутся на месте."),
    okText: localText("Mark as unpacked", "Разобрать"),
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
  const justAdded = runtime.recentlyAddedItemId === item.id && (!runtime.recentlyAddedLayoutId || runtime.recentlyAddedLayoutId === state.activeLayoutId);
  const isEditingTitle = runtime.editingItemTitleId === item.id;
  const title = isEditingTitle
    ? `<input class="item-title-input" data-item-title-input="${item.id}" value="${escapeHtml(item.name)}" />`
    : `<strong class="item-title">${highlight(item.name)}${renderItemQuantityText(item)}</strong>`;
  const titleDragAttr = isEditingTitle ? "" : ` data-item-drag="${item.id}"`;
  return renderPackingItemCardHtml({
    categoriesHtml: itemCategories(item).map((category) => `<span class="pill">${highlight(dictionaryValueLabel(category))}</span>`).join(""),
    collection,
    filterMatch,
    item,
    justAdded,
    labelsVisible: shouldShowItemLabels(),
    locationHtml: highlight(dictionaryValueLabel(item.location)),
    packed,
    packedVisible,
    photoHtml: renderItemPhoto(item),
    t,
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
      runtime.itemDialogPhotoActiveIndex = index;
      updateItemDialogPhotoPrimaryButton();
    },
    onRootContainerPreviewActive(index) {
      runtime.rootContainerDialogPhotoActiveIndex = index;
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
    getDescendantContainerIds,
    getEditingContainerId: () => runtime.editingContainerId,
    getLastItemTitleTap: () => runtime.lastItemTitleTap,
    getState: () => state,
    getDraggingContainerId: () => runtime.draggingContainerId,
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
    openPackingItemReplacementDialog,
    openItemDialog,
    openLayoutRootDialog,
    openRootContainerDialog,
    placePlaceholder,
    removeDropzoneDragOver,
    render,
    renderPreservingPackingScroll,
    saveLocalUiState,
    saveState,
    setDraggingContainerId: (value) => {
      runtime.draggingContainerId = value;
    },
    setDraggingItemId: (value) => {
      runtime.draggingItemId = value;
    },
    setEditingContainerId: (value) => {
      runtime.editingContainerId = value;
    },
    setEditingItemTitleId: (value) => {
      runtime.editingItemTitleId = value;
    },
    setLastItemTitleTap: (value) => {
      runtime.lastItemTitleTap = value;
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
  if (!runtime.packingDragController) {
    runtime.packingDragController = createPackingDragController({
      edgeScrollMaxSpeed: EDGE_SCROLL_MAX_SPEED,
      edgeScrollZone: EDGE_SCROLL_ZONE,
      getContainerItemIdsDeep,
      getCurrentView,
      getDescendantContainerIds,
      getDraggingContainerId: () => runtime.draggingContainerId,
      getDraggingItemId: () => runtime.draggingItemId,
      getColumnPlaceholderIndex,
      getItemContainerIdInLayout,
      getPackingRoot: () => refs.packingView,
      getPackingTab: () => document.querySelector('.tab[data-view="packing"]'),
      getDragCancelLabel: () => t("packing.dragCancel"),
      getState: () => state,
      isOriginalRootColumnPosition,
      canStartPackingDrag: () => !warnLockedLayoutMutation(state.activeLayoutId),
      onBeforePackingDragEnter: clearContentFiltersForPackingDrag,
      moveContainer,
      moveContainerIntoContainerTop,
      moveContainerToRoot: (containerId, targetIndex) =>
        placeExistingContainerInLayout(containerId, "", state.activeLayoutId, { targetIndex }),
      moveItem,
      moveItemIntoContainerTop,
      moveRootColumn,
      nestedGroupHoverDelayMs: NESTED_GROUP_HOVER_DELAY_MS,
      pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
      setDraggingContainerId: (value) => {
        runtime.draggingContainerId = value;
      },
      setDraggingItemId: (value) => {
        runtime.draggingItemId = value;
      },
      switchToPacking: () => {
        switchView("packing");
        renderPacking();
      },
      touchDragCancelDistance: TOUCH_DRAG_CANCEL_DISTANCE,
      touchDragDelayMs: TOUCH_DRAG_DELAY_MS,
      touchScrollCancelDistance: TOUCH_SCROLL_CANCEL_DISTANCE,
      createGroupFromItems
    });
  }
  return runtime.packingDragController;
}

function bindRootColumnDrag(root) {
  getPackingDragController().bindRootColumnDrag(root);
}

function bindPointerPackingDrag(root, placeholder) {
  getPackingDragController().bindPointerPackingDrag(root, placeholder);
}

function bindCatalogItemPackingDrag(root) {
  getPackingDragController().bindCatalogItemPackingDrag(root);
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

function getEntryAfterPointer(zone, pointerY, placeholder = null) {
  return getPackingDragController().getEntryAfterPointer(zone, pointerY, placeholder);
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
  if (runtime.fixedScrollbarRefreshFrame) return;
  runtime.fixedScrollbarRefreshFrame = requestAnimationFrame(() => {
    runtime.fixedScrollbarRefreshFrame = null;
    syncFixedScrollbarVisibility();
    requestAnimationFrame(syncFixedScrollbarVisibility);
  });
  window.setTimeout(syncFixedScrollbarVisibility, 120);
}

function renderItems() {
  if (isSharedLayoutView()) {
    runtime.selectedCatalogItemIds = new Set();
    runtime.selectedCatalogItemAnchorId = "";
    renderSharedItemsView();
    return;
  }
  const items = getItemsForItemsView();
  runtime.selectedCatalogItemIds = normalizeCatalogSelection(runtime.selectedCatalogItemIds, items.map((item) => item.id));
  if (runtime.selectedCatalogItemAnchorId && !items.some((item) => item.id === runtime.selectedCatalogItemAnchorId)) runtime.selectedCatalogItemAnchorId = "";
  const counts = getItemsUsageCounts();
  const filteredEmpty = hasActiveContentFilter();
  refs.itemsView.innerHTML = renderItemsViewHtml({
    counts,
    emptyFiltered: filteredEmpty,
    emptyText: t(filteredEmpty ? "empty.notFoundByFilter" : "empty.notFound"),
    itemSortMode: runtime.itemSortMode,
    itemUsageFilter: runtime.itemUsageFilter,
    items,
    renderListItem,
    showLabels: shouldShowItemLabels(),
    showPhotos: shouldShowItemPhotos(),
    t
  });
  refs.itemsView.querySelector("#addItemBtn").addEventListener("click", () => openItemDialog());
  refs.itemsView.querySelector("#itemUsageFilter").addEventListener("change", (event) => {
    runtime.itemUsageFilter = event.target.value;
    renderItems();
  });
  refs.itemsView.querySelector("#itemSortBtn").addEventListener("click", () => {
    runtime.itemSortMode = runtime.itemSortMode === "none" ? "asc" : runtime.itemSortMode === "asc" ? "desc" : "none";
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
  bindCatalogItemPackingDrag(refs.itemsView);
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
      itemSortMode: runtime.itemSortMode,
      itemUsageFilter: runtime.itemUsageFilter,
      items,
      renderListItem,
      showLabels: shouldShowItemLabels(),
      showPhotos: shouldShowItemPhotos(),
      t
    });
  });
  refs.itemsView.querySelector("#itemUsageFilter")?.addEventListener("change", (event) => {
    runtime.itemUsageFilter = event.target.value;
    renderItems();
  });
  refs.itemsView.querySelector("#itemSortBtn")?.addEventListener("click", () => {
    runtime.itemSortMode = runtime.itemSortMode === "none" ? "asc" : runtime.itemSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    renderItems();
  });
  bindSharedVirtualEvents(refs.itemsView);
}

function renderListItem(item) {
  const filterMatch = isFilterContextActive() && matchesItemsViewFilters(item);
  const inCurrentLayout = isItemInActiveLayout(item);
  const placementText = item.containerId ? containerPath(item.containerId) : t("items.outsideLayout");
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(item)
      ? renderItemPhoto(item)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">${t("labels.noPhoto")}</div>`
    : "";
  return renderListItemHtml({
    categories: itemCategories(item),
    filterMatch,
    highlightText: highlight,
    inCurrentLayout,
    item,
    selected: runtime.selectedCatalogItemIds.has(item.id),
    photoHtml: photoSlot,
    placementText,
    quantityText: itemQuantity(item) > 1 ? t("items.quantitySuffix", { count: itemQuantity(item) }) : "",
    showLabels: shouldShowItemLabels(),
    t
  });
}

function isCatalogSelectionClick(event) {
  return Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey);
}

function isCatalogActionTarget(target) {
  return Boolean(target?.closest?.("button, input, select, textarea, label, a, [data-photo-open]"));
}

function hasCatalogSelection() {
  return runtime.selectedCatalogItemIds.size > 0 || runtime.selectedCatalogRootIds.size > 0;
}

function clearCatalogSelection() {
  runtime.selectedCatalogItemIds = new Set();
  runtime.selectedCatalogItemAnchorId = "";
  runtime.selectedCatalogRootIds = new Set();
  runtime.selectedCatalogRootAnchorId = "";
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
      anchorId: runtime.selectedCatalogItemAnchorId,
      range: event.shiftKey,
      selectedIds: runtime.selectedCatalogItemIds,
      targetId: card.dataset.listItemId,
      toggle: event.ctrlKey || event.metaKey,
      visibleIds: getItemsForItemsView().map((item) => item.id)
    });
    runtime.selectedCatalogItemIds = result.selectedIds;
    runtime.selectedCatalogItemAnchorId = result.anchorId;
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
      anchorId: runtime.selectedCatalogRootAnchorId,
      range: event.shiftKey,
      selectedIds: runtime.selectedCatalogRootIds,
      targetId: card.dataset.rootCard,
      toggle: event.ctrlKey || event.metaKey,
      visibleIds: getRootContainersForSettings().map((container) => container.id)
    });
    runtime.selectedCatalogRootIds = result.selectedIds;
    runtime.selectedCatalogRootAnchorId = result.anchorId;
    renderBags();
  }, { capture: true });
}

function catalogItemActionIds(itemId) {
  return catalogActionTargetIds(runtime.selectedCatalogItemIds, itemId).filter((id) => state.items?.[id]);
}

function catalogRootActionIds(containerId) {
  return catalogActionTargetIds(runtime.selectedCatalogRootIds, containerId).filter((id) => {
    const container = state.containers?.[id];
    return container && !container.parentId;
  });
}

function selectionNames(records, limit = 8) {
  const names = records.map((record) => record?.name).filter(Boolean);
  const visible = names.slice(0, limit).map((name) => `- ${name}`).join("\n");
  return names.length > limit
    ? `${visible}\n- ${localText(`${names.length - limit} more`, `ещё ${names.length - limit}`)}`
    : visible;
}

function formatRootContainerCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} сумка/место`;
  return `${count} сумок/мест`;
}

async function copyCatalogItems(itemIds) {
  const ids = [...new Set(itemIds)].filter((id) => state.items?.[id]);
  if (ids.some((id) => warnUnavailableItemPlacement(id))) return;
  if (ids.length <= 1) {
    if (ids[0]) copyItem(ids[0], { keepPlacement: false });
    return;
  }
  const confirmed = await askConfirmDialog({
    title: localText("Copy selected items?", "Скопировать выбранные вещи?"),
    text: localText(`${ids.length} item copies will be created on the Items tab.`, `Будет создано ${formatThingCount(ids.length)} во вкладке «Вещи».`),
    highlightText: selectionNames(ids.map((id) => state.items[id])),
    okText: localText("Copy", "Скопировать"),
    tone: "safe"
  });
  if (!confirmed) return;
  for (const id of ids) await copyItem(id, { keepPlacement: false, confirm: false });
  runtime.selectedCatalogItemIds = new Set();
  runtime.selectedCatalogItemAnchorId = "";
  renderItems();
}

async function confirmDeleteCatalogItems(itemIds) {
  const ids = [...new Set(itemIds)].filter((id) => state.items?.[id]);
  if (ids.length <= 1) {
    if (ids[0]) confirmDeleteItem(ids[0]);
    return;
  }
  const confirmed = await askConfirmDialog({
    title: localText("Delete selected items forever?", "Удалить выбранные вещи навсегда?"),
    text: localText(`${ids.length} items will be removed from the item list and every layout. Bags and places will remain. This cannot be undone.`, `${formatThingCount(ids.length)} будут удалены из списка вещей и из всех укладок. Сумки и места останутся. Это действие нельзя отменить.`),
    highlightText: selectionNames(ids.map((id) => state.items[id])),
    okText: localText("Delete", "Удалить"),
    tone: "danger",
    hideClose: true
  });
  if (!confirmed) return;
  ids.forEach((id) => deleteItemForever(id, { cleanupContainers: false, renderAfter: false }));
  runtime.selectedCatalogItemIds = new Set();
  runtime.selectedCatalogItemAnchorId = "";
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
    title: localText("Copy selected bags and places?", "Скопировать выбранные сумки и места?"),
    text: localText(`${ids.length} bag/place copies will be created without their contents.`, `Будет создано ${formatRootContainerCount(ids.length)} без вещей внутри.`),
    highlightText: selectionNames(ids.map((id) => state.containers[id])),
    okText: localText("Copy", "Скопировать"),
    tone: "safe"
  });
  if (!confirmed) return;
  for (const id of ids) await duplicateRootContainer(id);
  runtime.selectedCatalogRootIds = new Set();
  runtime.selectedCatalogRootAnchorId = "";
  renderBags();
}

async function confirmDeleteCatalogRootContainers(containerIds) {
  const ids = [...new Set(containerIds)].filter((id) => state.containers?.[id] && !state.containers[id].parentId);
  if (ids.length <= 1) {
    if (ids[0]) confirmDeleteRootContainer(ids[0]);
    return;
  }
  const confirmed = await askConfirmDialog({
    title: localText("Delete selected bags and places?", "Удалить выбранные сумки и места?"),
    text: localText(`${ids.length} bags/places will be removed from the bag list and every layout.`, `${formatRootContainerCount(ids.length)} будут удалены из списка сумок и мест и из всех укладок.`),
    highlightText: selectionNames(ids.map((id) => state.containers[id])),
    okText: localText("Delete", "Удалить"),
    tone: "danger",
    hideClose: true
  });
  if (!confirmed) return;
  ids.forEach((id) => deleteRootContainer(id));
  runtime.selectedCatalogRootIds = new Set();
  runtime.selectedCatalogRootAnchorId = "";
  renderBags();
}

function renderBags() {
  if (isSharedLayoutView()) {
    runtime.selectedCatalogRootIds = new Set();
    runtime.selectedCatalogRootAnchorId = "";
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
  bindEmptyContentFilterReset(refs.bagsView);
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
    runtime.rootContainerUsageFilter = event.target.value;
    render();
  });
  document.querySelector("#rootContainerSortBtn")?.addEventListener("click", () => {
    runtime.rootContainerSortMode = runtime.rootContainerSortMode === "none" ? "asc" : runtime.rootContainerSortMode === "asc" ? "desc" : "none";
    saveUiSettings();
    render();
  });
  bindEmptyContentFilterReset(refs.bagsView);
  bindSharedVirtualEvents(refs.bagsView);
}

function bindEmptyContentFilterReset(root) {
  root?.querySelector?.("[data-reset-content-filters]")?.addEventListener("click", () => {
    if (runtime.searchRenderTimer) {
      window.clearTimeout(runtime.searchRenderTimer);
      runtime.searchRenderTimer = null;
    }
    if (runtime.searchContextCommitTimer) {
      window.clearTimeout(runtime.searchContextCommitTimer);
      runtime.searchContextCommitTimer = null;
    }
    resetContentFilterControls({ refs, runtime });
    render();
  });
}

function renderSettings() {
  if (isSharedLayoutView()) {
    renderSharedSettingsView();
    return;
  }
  const dictionaryOwner = activeDictionaryOwner();
  refs.settingsView.innerHTML = `
    ${renderProfileSettingsHtml(runtime.currentUser, { language: uiLanguage })}
    <div class="settings-grid">
      ${renderDictionary(t("labels.storagePlaces"), "location", dictionaryOptionsForOwner("location", dictionaryOwner))}
      ${renderDictionary(t("labels.categories"), "category", dictionaryOptionsForOwner("category", dictionaryOwner))}
    </div>
  `;
  bindDictionary("location", dictionaryOwner);
  bindDictionary("category", dictionaryOwner);
  bindProfileSettingsControls();
}

function bindProfileSettingsControls() {
  refs.settingsView.querySelector("#saveProfileDisplayName")?.addEventListener("click", async () => {
    const button = refs.settingsView.querySelector("#saveProfileDisplayName");
    const status = refs.settingsView.querySelector("#profileDisplayNameStatus");
    button.disabled = true;
    try {
      const data = await apiFetch("/auth/me", profileDisplayNameRequest(refs.settingsView.querySelector("#profileDisplayName")?.value));
      runtime.currentUser = data.user || runtime.currentUser;
      status.textContent = localText("Name saved.", "Имя сохранено.");
      status.className = "dialog-status success";
    } catch (error) {
      status.textContent = error.message;
      status.className = "dialog-status error";
    } finally {
      button.disabled = false;
    }
  });
}

function renderSharedSettingsView() {
  withSharedVirtualState(() => {
    refs.settingsView.innerHTML = `
      ${renderProfileSettingsHtml(runtime.currentUser, { language: uiLanguage })}
      ${renderSharedModeBanner(currentSharedLayout(), { compact: true })}
      <div class="settings-grid">
        ${renderDictionary(t("labels.storagePlaces"), "location", dictionaryOptionsForUi("location"))}
        ${renderDictionary(t("labels.categories"), "category", dictionaryOptionsForUi("category"))}
      </div>
    `;
  });
  bindProfileSettingsControls();
  bindSharedVirtualEvents(refs.settingsView);
}

function renderLayoutEditor() {
  const layoutId = getActiveEditableLayoutId();
  return renderLayoutEditorHtml({
    containerWeight,
    containers: state.containers,
    layout: state.layouts[layoutId],
    t
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
    canNestContainer: (containerId) => state.containers?.[containerId]?.nestable === true,
    cleanupLayoutDropState,
    dropList: document.querySelector("#layoutDropList"),
    getCurrentView,
    getLayoutPlaceholderIndex,
    getLayoutRowAfterPointer,
    getPackingRoot: () => refs.packingView,
    getPackingTab: () => document.querySelector('.tab[data-view="packing"]'),
    getColumnPlaceholderIndex,
    getDescendantContainerIds,
    getState: () => state,
    getTouchPoint,
    isHoldDragInput,
    markDragPending,
    onBeforePackingDragEnter: clearContentFiltersForPackingDrag,
    placeContainerInActiveLayout: (containerId, parentId, targetIndex, options = {}) =>
      placeExistingContainerInLayout(containerId, parentId, state.activeLayoutId, { ...options, targetIndex }),
    pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
    preventDragContextMenu,
    render,
    switchToPacking: () => {
      switchView("packing");
      renderPacking();
    },
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
  if (signature === runtime.lastToastSignature && now - runtime.lastToastAt < 2500) return;
  runtime.lastToastSignature = signature;
  runtime.lastToastAt = now;
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
  runtime.selectedCatalogRootIds = normalizeCatalogSelection(runtime.selectedCatalogRootIds, roots.map((container) => container.id));
  if (runtime.selectedCatalogRootAnchorId && !roots.some((container) => container.id === runtime.selectedCatalogRootAnchorId)) runtime.selectedCatalogRootAnchorId = "";
  const counts = rootContainerUsageCountsForCatalog(state, {
    isPrivateCatalogContainerRecord,
    isRootContainerForEditor,
    isRootContainerInActiveCatalog,
    isRootContainerInActiveLayout: (containerId) => getLayoutContainerIdSet(getPublishedWorkLayout()).has(containerId)
  });
  return renderRootContainersEditorHtml({
    counts,
    emptyFiltered: hasActiveContentFilter(),
    emptyText: t(hasActiveContentFilter() ? "empty.notFoundByFilter" : "empty.notFound"),
    resetFiltersText: hasActiveContentFilter() ? t("filters.resetAll") : "",
    renderRootContainerCard,
    rootContainerSortMode: runtime.rootContainerSortMode,
    rootContainerUsageFilter: runtime.rootContainerUsageFilter,
    roots,
    showLabels: shouldShowItemLabels(),
    showPhotos: shouldShowItemPhotos(),
    t
  });
}

function renderRootContainerCard(container) {
  const filterMatch = isFilterContextActive() && matchesRootContainerFieldsFilter(container);
  const inCurrentLayout = isRootContainerInActiveLayout(container.id);
  const nestedInCurrentLayout = !inCurrentLayout && getLayoutContainerIdSet(getPublishedWorkLayout()).has(container.id);
  const location = container.location || defaultRootContainerLocation(state);
  const photoSlot = shouldShowItemPhotos()
    ? primaryItemPhoto(container)
      ? renderItemPhoto(container)
      : `<div class="item-photo item-photo-empty" aria-hidden="true">${t("labels.noPhoto")}</div>`
    : "";
  return renderRootContainerCardHtml({
    categories: containerCategories(container),
    container,
    filterMatch,
    highlightText: highlight,
    inCurrentLayout,
    nestedInCurrentLayout,
    location,
    selected: runtime.selectedCatalogRootIds.has(container.id),
    photoHtml: photoSlot,
    showLabels: shouldShowItemLabels(),
    t
  });
}

function bindRootContainersEditor() {
  bindRootContainersEditorControls({
    bindRootCatalogSelection,
    catalogRootActionIds,
    confirmDeleteCatalogRootContainers,
    copyCatalogRootContainers,
    getLastRootContainerTitleTap: () => runtime.lastRootContainerTitleTap,
    getRootContainerSortMode: () => runtime.rootContainerSortMode,
    openRootContainerDialog,
    parseWeightInput,
    render,
    saveState,
    saveUiSettings,
    setEditingRootContainerId: (value) => {
      runtime.editingRootContainerId = value;
    },
    setLastRootContainerTitleTap: (value) => {
      runtime.lastRootContainerTitleTap = value;
    },
    setRootContainerSortMode: (value) => {
      runtime.rootContainerSortMode = value;
    },
    setRootContainerUsageFilter: (value) => {
      runtime.rootContainerUsageFilter = value;
    },
    state,
    touchContainer
  });
}
function renderDictionary(title, type, values) {
  return renderDictionaryHtml(title, type, values, {
    editingEntry: runtime.editingDictionaryEntry,
    sortMode: dictionarySortModeForType(type),
    t
  });
}

function dictionaryRenameSideEffects(type, oldValue, newValue) {
  if (type === "location") {
    if (refs.locationFilter.value === oldValue) refs.locationFilter.value = newValue;
    return;
  }
  runtime.selectedCategoryFilters = runtime.selectedCategoryFilters.map((category) => category === oldValue ? newValue : category)
    .filter((category, index, list) => list.indexOf(category) === index);
}

function bindDictionary(type, owner = activeDictionaryOwner()) {
  document.querySelector(`[data-dictionary-sort="${type}"]`)?.addEventListener("click", () => {
    cycleDictionarySortMode(type);
  });
  bindDictionaryControls(type, {
    activeDictionaryOwner,
    addCustomDictionaryValue,
    capitalize,
    dictionaryEditScope,
    dictionaryOptionsForOwner,
    editingDictionaryEntry: runtime.editingDictionaryEntry,
    formatThingCount,
    containerCategories,
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
      runtime.editingDictionaryEntry = value;
    },
    showToast,
    touchContainer
  });
}

function renameDictionaryEntry(type, oldValue, rawNewValue, owner = activeDictionaryOwner()) {
  return renameDictionaryEntryValue(type, oldValue, rawNewValue, {
    dictionaryEditScope,
    dictionaryOptionsForOwner,
    containerCategories,
    itemCategories,
    markEdited,
    nowIso,
    onRenamed: dictionaryRenameSideEffects,
    owner,
    renameCustomDictionaryValue,
    render,
    saveDictionaryOwner,
    setEditingDictionaryEntry: (value) => {
      runtime.editingDictionaryEntry = value;
    },
    showToast,
    touchContainer
  });
}
function moveItem(itemId, targetContainerId, targetIndex = null, options = {}) {
  const layoutId = state.activeLayoutId;
  const layout = state.layouts?.[layoutId];
  if (!state.items[itemId] || !layout || !state.containers[targetContainerId]) return;
  if (warnLockedLayoutMutation(layoutId)) return;
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
  if (warnLockedLayoutMutation(layoutId)) return;
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
  if (warnLockedLayoutMutation(layoutId)) return;
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
  runtime.editingContainerId = groupId;
  applyLayoutArrangement(layoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeItemFromActiveLayout(itemId, layoutId = state.activeLayoutId) {
  if (warnLockedLayoutMutation(layoutId)) return;
  capturePackingScroll();
  const changedAt = nowIso();
  if (!removeItemFromLayoutInState(state, layoutId, itemId, { changedAt, touchLayout })) return;
  if (isAdminEditablePublishedLayout(layoutId)) markRecordActivePublicCatalog(state.items?.[itemId], layoutId);
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
  if (warnLockedLayoutMutation(layoutId) || warnUnavailableItemPlacement(itemId)) return false;
  return placeExistingItemInLayoutInState(state, itemId, containerId, layoutId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    targetIndex,
    touchLayout
  });
}

function placeExistingContainerInLayout(containerId, parentId, layoutId = state.activeLayoutId, {
  changedAt = nowIso(),
  renderAfter = true,
  targetIndex = null
} = {}) {
  const container = state.containers?.[containerId];
  const layout = state.layouts?.[layoutId];
  const currentParentId = layout?.arrangement?.containers?.[containerId]?.parentId || "";
  if (!container || !layout) return false;
  if (parentId && container.nestable !== true) return false;
  if (!parentId && !currentParentId) return false;
  if (warnLockedLayoutMutation(layoutId)) return false;
  capturePackingScroll();
  const placed = placeExistingContainerInLayoutInState(state, containerId, parentId, layoutId, {
    activeLayoutId: state.activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    targetIndex,
    touchLayout
  });
  if (!placed) return false;
  saveLayoutMutation(layoutId, { publishDelay: 500 });
  if (renderAfter) render();
  return true;
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
  if (warnLockedLayoutMutation(state.activeLayoutId)) return;
  openConfirmDialog({
    title: t("items.removeFromLayoutTitle"),
    text: t("items.removeFromLayoutText", { name: item.name }),
    highlightText: t("items.removeFromLayoutHighlight"),
    okText: t("items.removeFromLayoutOk"),
    tone: "danger",
    hideClose: true,
    onConfirm: () => removeItemFromActiveLayout(itemId)
  });
}

async function confirmRemoveEditingItemFromActiveLayout(event) {
  event?.preventDefault();
  const itemId = runtime.editingItemId;
  const item = state.items?.[itemId];
  const layoutId = runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId();
  const layout = state.layouts?.[layoutId];
  if (!item || !layout || !getItemContainerIdInLayout(layout, itemId)) return;
  if (warnLockedLayoutMutation(layoutId)) return;
  const confirmed = await askConfirmDialog({
    title: t("items.removeFromLayoutTitle"),
    text: t("items.removeFromLayoutText", { name: item.name }),
    highlightText: t("items.removeFromLayoutHighlight"),
    okText: t("items.removeFromLayoutOk"),
    tone: "danger",
    hideClose: true
  });
  if (!confirmed) return;
  refs.dialog?.close("remove-from-layout");
  removeItemFromActiveLayout(itemId, layoutId);
}

function confirmDeleteEditingItemForever(event) {
  event?.preventDefault();
  const itemId = runtime.editingItemId;
  if (!itemId || !state.items?.[itemId]) return;
  confirmDeleteItem(itemId, {
    afterConfirm: () => refs.dialog?.close("delete-item")
  });
}

function confirmDeleteItem(itemId, { afterConfirm = null } = {}) {
  const item = state.items[itemId];
  if (!item) return;
  if (warnLockedItemDelete(itemId)) return;
  const placements = describeVisibleItemLayoutPlacementRows(item);
  const placementText = placements.length
    ? `${t("items.deleteUsedNow")}\n${placements.map((placement) => `- ${placement.label}`).join("\n")}`
    : t("items.deleteOutside");
  const placementHtml = placements.length
    ? `${escapeHtml(t("items.deleteUsedNow"))}\n${placements.map((placement) =>
      `- ${confirmLayoutNameHtml(placement.layoutName)}: ${escapeHtml(placement.placeText)}`
    ).join("\n")}`
    : escapeHtml(t("items.deleteOutside"));
  openConfirmDialog({
    title: "Delete item forever?",
    text: `“${item.name}” will be deleted from the item list and from every layout. This action cannot be undone.`,
    highlightText: placementText,
    okText: "Delete",
    tone: placements.length ? "danger" : "safe",
    ...itemDeleteConfirm({ item, placementText, hasPlacements: Boolean(placements.length), t }),
    highlightHtml: placementHtml,
    onConfirm: () => {
      deleteItemForever(itemId);
      afterConfirm?.();
    }
  });
}

function describeVisibleItemLayoutPlacementRows(item) {
  return visibleItemLayoutPlacementsForState(state, item, { containerPath }).map((placement) => {
    const rootText = isEnglishUi()
      ? `bag ${quoteName(placement.rootName)}`
      : `сумка ${quoteName(placement.rootName)}`;
    const placeText = placement.isRoot
      ? rootText
      : isEnglishUi()
        ? `${rootText}, place ${quoteName(placement.path)}`
        : `${rootText}, место ${quoteName(placement.path)}`;
    return {
      ...placement,
      layoutName: placement.layoutName || defaultLayoutName(),
      placeText,
      label: `${placement.layoutName || defaultLayoutName()}: ${placeText}`
    };
  });
}

function describeVisibleItemLayoutPlacements(item) {
  return describeVisibleItemLayoutPlacementRows(item).map((placement) => placement.label);
}

function deleteItemPhotos(item, itemId) {
  normalizeItemPhotos(item).forEach((photo) => {
    if (photo.localId || photo.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo.url || photo.thumbUrl) deleteRemotePhotoIfPossible(itemId, photo);
  });
}

function deleteItemForever(itemId, { cleanupContainers = true, renderAfter = true } = {}) {
  if (warnLockedItemDelete(itemId)) return;
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
  if (warnUnavailableItemPlacement(itemId)) return;
  if (!requireUsageCapacity("items")) return;
  const keepPlacement = Boolean(options.keepPlacement);
  if (keepPlacement && warnLockedLayoutMutation(state.activeLayoutId)) return;
  const offlineCopy = isForcedOffline() || !runtime.currentUser || globalThis.navigator?.onLine === false;
  let cachedFallbackSourceIds = offlineCopy
    ? normalizeItemPhotos(item).map((photo) => String(photo.localId || photo.id || "").trim()).filter(Boolean)
    : [];
  let missingRemotePhotos = [];
  if (!offlineCopy) {
    const inspection = await inspectRecordRemotePhotoSources(item);
    missingRemotePhotos = inspection.missing || [];
    cachedFallbackSourceIds = missingRemotePhotos
      .filter((entry) => entry.cached)
      .map((entry) => entry.sourceLocalId)
      .filter(Boolean);
  }
  if (missingRemotePhotos.length) {
    const recoverableCount = cachedFallbackSourceIds.length;
    const confirmed = await askConfirmDialog({
      title: localText("Photo is missing from the server", "Фото отсутствует на сервере"),
      text: recoverableCount === missingRemotePhotos.length
        ? localText(
          "The server could not find this item's photo. A local copy remains in this browser. Use it to create an independent photo for the new item?",
          "Сервер не нашёл фото этой вещи. В браузере сохранилась локальная копия. Использовать её для создания независимого фото у новой вещи?"
        )
        : recoverableCount
          ? localText(
            `The server could not find ${missingRemotePhotos.length} photos. ${recoverableCount} are available locally; the others will not be copied.`,
            `Сервер не нашёл ${missingRemotePhotos.length} фото. Локально доступны ${recoverableCount}; остальные фото не будут скопированы.`
          )
          : localText(
            "The server could not find this item's photo, and no local copy is available. The new item will be created without an available photo.",
            "Сервер не нашёл фото этой вещи, и локальной копии нет. Новая вещь будет создана без доступного фото."
          ),
      okText: localText("Copy anyway", "Всё равно копировать"),
      tone: "warning"
    });
    if (!confirmed) return;
  } else if (options.confirm !== false) {
    const confirmed = await askConfirmDialog(itemCopyConfirm({ item, keepPlacement, t }));
    if (!confirmed) return;
  }
  const changedAt = nowIso();
  const id = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const copied = await copyItemInState(state, itemId, {
    activeLayoutId: state.activeLayoutId,
    changedAt,
    copyName: makeItemCopyName,
    copyPhotos: (record, copyOptions) => copyRecordPhotosForLocalDuplicate(record, {
      ...copyOptions,
      cachedFallbackSourceIds,
      copyRemotePhotosToCurrentList: true
    }),
    currentEditMeta,
    id,
    keepPlacement,
    markRecordActivePublicCatalog,
    touchLayout
  });
  if (!copied) return;
  if (runtime.currentUser && !isForcedOffline()) {
    try {
      const copiedItem = state.items[copied.id];
      const targetListId = await ensureCurrentPackingListId();
      for (const photo of normalizeItemPhotos(copiedItem)) {
        if (!photo._copyToCurrentList && !photo.copyToCurrentList) continue;
        await uploadEntityPhoto(targetListId, copiedItem, photo, "item");
      }
    } catch {
      // The copy marker remains local and the normal sync retry will finish it later.
    }
  }
  if (copied.placed) applyLayoutArrangement(state.activeLayoutId);
  saveState();
  scheduleActivePublishedEditSave();
  render();
  const container = copied.placed;
  showToast(container ? t("items.copyPlaced") : t("items.copyOutside"), "success");
}

async function copyRootContainer(containerId) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  const confirmed = await askConfirmDialog(rootContainerCopyConfirm({ container, inLayout: false, t }));
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
    copyPhotos: (record, copyOptions) => copyRecordPhotosForLocalDuplicate(record, {
      ...copyOptions,
      copyRemotePhotosToCurrentList: true
    }),
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
    ? t("rootContainers.copyPlaced")
    : t("rootContainers.copyOutside"), "success");
}

function makeContainerCopyName(name) {
  return makeContainerCopyNameForState(name, state.containers);
}

function confirmDeleteEditingRootContainerForever(event) {
  event?.preventDefault();
  const containerId = runtime.editingRootContainerId;
  if (!containerId || !state.containers?.[containerId]) return;
  confirmDeleteRootContainer(containerId, {
    afterConfirm: () => refs.rootContainerDialog?.close("delete-container")
  });
}

function confirmDeleteRootContainer(containerId, { afterConfirm = null } = {}) {
  const container = state.containers[containerId];
  if (!container || (container.parentId && container.nestable !== true)) return;
  if (warnLockedContainerDelete(containerId)) return;
  const itemCount = getContainerItemIdsDeep(containerId).length;
  const layoutRows = Object.values(state.layouts)
    .filter((layout) => getLayoutContainerIdSet(layout).has(containerId))
    .map((layout) => ({
      id: layout.id || "",
      name: layout.name || defaultLayoutName()
    }));
  const layoutText = layoutRows.length
    ? `${t("rootContainers.deleteUsedInLayouts")}\n${layoutRows.map((layout) => `- ${layout.name}`).join("\n")}`
    : t("rootContainers.deleteUnused");
  const layoutHtml = layoutRows.length
    ? `${escapeHtml(t("rootContainers.deleteUsedInLayouts"))}\n${layoutRows.map((layout) =>
      `- ${confirmLayoutNameHtml(layout.name)}`
    ).join("\n")}`
    : escapeHtml(t("rootContainers.deleteUnused"));
  const itemsText = itemCount
    ? `\n${t("rootContainers.deleteItemsRemain", { count: formatThingCount(itemCount) })}`
    : "";
  const itemsHtml = itemCount
    ? `\n${escapeHtml(t("rootContainers.deleteItemsRemain", { count: formatThingCount(itemCount) }))}`
    : "";
  openConfirmDialog({
    title: localText("Delete bag or place?", "Удалить сумку или место?"),
    text: localText(`“${container.name}” will be removed from the bag/place list and every layout.`, `«${container.name}» будет удалено из списка сумок и мест и из всех укладок.`),
    highlightText: `${layoutText}${itemsText}`,
    okText: localText("Delete", "Удалить"),
    tone: layoutRows.length || itemCount ? "danger" : "safe",
    ...rootContainerDeleteConfirm({
      container,
      layoutText,
      layoutHtml,
      itemsText,
      itemsHtml,
      risky: Boolean(layoutRows.length || itemCount),
      t
    }),
    onConfirm: () => {
      deleteRootContainer(containerId);
      afterConfirm?.();
    }
  });
}

function deleteRootContainer(containerId) {
  if (warnLockedContainerDelete(containerId)) return;
  const changedAt = nowIso();
  const deleted = deleteRootContainerFromState(state, containerId, {
    beforeDeleteContainer: deleteContainerPhotos,
    changedAt,
    markEdited
  });
  if (!deleted) return;
  if (runtime.editingRootContainerId === containerId) runtime.editingRootContainerId = null;
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeRootContainerFromActiveLayout(containerId) {
  const layoutId = getPublishedEditLayoutId();
  const layout = state.layouts[layoutId];
  const container = state.containers[containerId];
  if (!layout || !container) return;
  if (warnLockedLayoutMutation(layoutId)) return;
  const changedAt = nowIso();
  if (!removeContainerFromLayoutOnly(layout, containerId, changedAt)) return;
  touchLayout(layoutId, changedAt);
  applyLayoutArrangement(layoutId);
  if (runtime.editingRootContainerId === containerId) refs.rootContainerDialog.close("cancel");
  saveState();
  scheduleActivePublishedEditSave();
  render();
}

function removeContainerFromLayoutOnly(layout, containerId, changedAt = nowIso()) {
  if (warnLockedLayoutMutation(layout?.id || state.activeLayoutId)) return false;
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

function getColumnPlaceholderIndex(board, placeholder, containerId = "") {
  const visibleRootSiblingId = (start, direction) => {
    let current = start;
    while (current) {
      if (current.classList?.contains("container-card") && !current.classList.contains("dragging")) {
        return current.dataset.rootContainerId || "";
      }
      current = direction === "next" ? current.nextElementSibling : current.previousElementSibling;
    }
    return "";
  };
  const nextRootId = visibleRootSiblingId(placeholder.nextElementSibling, "next");
  const previousRootId = visibleRootSiblingId(placeholder.previousElementSibling, "previous");
  const layout = getPublishedWorkLayout();
  if (containerId && layout?.rootContainerIds) {
    return rootColumnInsertIndexFromVisibleNeighbors(layout.rootContainerIds, containerId, {
      nextRootId,
      previousRootId
    });
  }
  const cards = [...board.children].filter((child) =>
    child.classList?.contains("container-card") && !child.classList.contains("dragging")
  );
  const index = cards.findIndex((card) => card.dataset.rootContainerId && card.dataset.rootContainerId === nextRootId);
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
  if (warnLockedLayoutMutation(layoutId)) return;
  capturePackingScroll();
  moveRootColumnInState(state, layoutId, containerId, targetIndex, { touchLayout });
  saveState({ captureArrangement: false });
  scheduleActivePublishedEditSave();
  render();
}

function openRootContainerDialog(containerId = null, {
  copyIncludesContents = true,
  placeInCurrentLayout = false,
  targetLayoutId = ""
} = {}) {
  resetSharedReadonlyRootContainerDialog();
  const container = containerId ? state.containers[containerId] : null;
  if (containerId && !container) return;
  placeNewRootInCurrentLayout = Boolean(!containerId && placeInCurrentLayout);
  rootContainerPlacementTargetLayoutId = placeNewRootInCurrentLayout && state.layouts?.[targetLayoutId]
    ? targetLayoutId
    : "";
  runtime.editingRootContainerId = containerId || null;
  rootContainerDialogCopyIncludesContents = copyIncludesContents !== false;
  runtime.rootContainerDialogPendingRootIds = null;
  runtime.rootContainerDialogPendingParentId = undefined;
  runtime.rootContainerDialogPendingParentIndex = null;
  refs.rootContainerDialogTitle.textContent = containerId ? t("rootContainers.edit") : t("rootContainers.add");
  updateRootContainerTemporaryStatus();
  refs.rootContainerName.value = container?.name || "";
  refs.rootContainerWeight.value = Number(container?.weight || 0);
  refs.rootContainerVolume.value = container?.volume ? String(container.volume).replace(".", ",") : "";
  if (refs.rootContainerColor) refs.rootContainerColor.value = container?.color || "";
  const dimensions = normalizeContainerDimensions(container?.dimensions);
  if (refs.rootContainerWidth) refs.rootContainerWidth.value = dimensions.width ? String(dimensions.width).replace(".", ",") : "";
  if (refs.rootContainerHeight) refs.rootContainerHeight.value = dimensions.height ? String(dimensions.height).replace(".", ",") : "";
  if (refs.rootContainerDepth) refs.rootContainerDepth.value = dimensions.depth ? String(dimensions.depth).replace(".", ",") : "";
  fillRootContainerLocationSelect(container?.location || defaultRootContainerLocation(state));
  renderRootContainerCategoryPicker(container ? containerCategories(container) : [], { fallbackDefault: false });
  if (refs.rootContainerNestable) refs.rootContainerNestable.checked = container?.nestable === true;
  updateRootContainerPlacementButton();
  updateRootContainerRemoveFromLayoutButton();
  updateRootContainerReplacementButton();
  updateRootContainerDeleteForeverButton();
  if (refs.rootContainerCopyToContainerBtn) refs.rootContainerCopyToContainerBtn.hidden = !containerId;
  if (refs.shareRootContainerLinkBtn) {
    refs.shareRootContainerLinkBtn.hidden = !containerId || !currentUserId() || isPublicLayoutContext();
  }
  refs.rootContainerNote.value = container?.note || "";
  runtime.rootContainerDialogPhotoDraft = null;
  runtime.rootContainerDialogPhotoActiveIndex = 0;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  updateRootContainerDialogPhotoPreview(normalizeItemPhotos(container || { photos: [] }));
  runtime.rootContainerDialogInitialSnapshot = getRootContainerDialogSnapshot();
  updateRootContainerDialogSaveState();
  openModalDialog(refs.rootContainerDialog);
  resetDialogScrollPosition(refs.rootContainerDialog);
}

function fillRootContainerLocationSelect(selected = "") {
  const options = dictionaryOptionsForUi("location", { selected: selected ? [selected] : [] });
  const fallback = options[0] || defaultRootContainerLocation(state);
  const entries = options.map(dictionarySelectEntry);
  fillSelect(refs.rootContainerLocation, entries, selected || fallback);
}

function openItemDialog(itemId = null, { targetContainerId = "", targetLayoutId = "" } = {}) {
  resetSharedReadonlyItemDialog();
  runtime.editingItemId = itemId;
  runtime.itemDialogTargetLayoutId = !itemId && targetLayoutId
    ? targetLayoutId
    : getPublishedEditLayoutId();
  const item = itemId ? state.items[itemId] : {
    name: "",
    weight: 0,
    quantity: 1,
    color: "",
    location: dictionaryOptionsForUi("location")[0] || defaultRootContainerLocation(state),
    category: "",
    categories: [],
    containerId: "",
    note: "",
    photos: []
  };
  refs.dialogTitle.textContent = itemId ? t("items.editItem") : t("items.addItem");
  refs.itemName.value = item.name;
  refs.itemWeight.value = item.weight || 0;
  refs.itemQuantity.value = itemQuantity(item);
  updateItemQuantityUi();
  if (refs.itemColor) refs.itemColor.value = item.color || "";
  const dimensions = normalizeContainerDimensions(item.dimensions);
  if (refs.itemWidth) refs.itemWidth.value = dimensions.width ? String(dimensions.width).replace(".", ",") : "";
  if (refs.itemHeight) refs.itemHeight.value = dimensions.height ? String(dimensions.height).replace(".", ",") : "";
  if (refs.itemDepth) refs.itemDepth.value = dimensions.depth ? String(dimensions.depth).replace(".", ",") : "";
  fillSelect(refs.itemLocation, dictionaryOptionsForUi("location", { selected: item.location ? [item.location] : [] }).map(dictionarySelectEntry), item.location);
  renderItemCategoryPicker(itemCategories(item), { fallbackDefault: false });
  if (refs.itemAvailabilityStatus) refs.itemAvailabilityStatus.value = normalizeItemAvailabilityStatus(item.availabilityStatus);
  refs.itemContainer.value = itemId
    ? getItemContainerIdInLayout(state.layouts?.[runtime.itemDialogTargetLayoutId], itemId)
    : state.containers?.[targetContainerId] && getLayoutContainerIdSet(state.layouts?.[runtime.itemDialogTargetLayoutId]).has(targetContainerId)
      ? targetContainerId
      : "";
  if (refs.itemContainerField) refs.itemContainerField.hidden = false;
  updateItemContainerPickerButton();
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = !itemId;
  if (refs.shareItemLinkBtn) {
    refs.shareItemLinkBtn.hidden = !itemId || !currentUserId() || isPublicLayoutContext();
  }
  updateItemRemoveFromLayoutButton();
  updateItemReplacementButton();
  updateItemDeleteForeverButton();
  refs.itemNote.value = item.note || "";
  runtime.itemDialogPhotoDraft = null;
  runtime.itemDialogPhotoActiveIndex = 0;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview(normalizeItemPhotos(item));
  runtime.itemDialogInitialSnapshot = getItemDialogSnapshot();
  updateItemDialogSaveState();
  openModalDialog(refs.dialog);
  resetDialogScrollPosition(refs.dialog);
}

function sharedRecordContainerPath(sourceState, containerId) {
  const names = [];
  const visited = new Set();
  let currentId = String(containerId || "");
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const container = sourceState?.containers?.[currentId];
    if (!container) break;
    if (container.name) names.unshift(container.name);
    currentId = container.parentId || sharedRecordContainerParentId(sourceState, currentId);
  }
  return names.join(" / ");
}

function sharedRecordContainerParentId(sourceState, containerId) {
  for (const layout of Object.values(sourceState?.layouts || {})) {
    const parentId = layout?.arrangement?.containers?.[containerId]?.parentId;
    if (parentId) return parentId;
  }
  return "";
}

function sharedRecordItemContainerId(sourceState, itemId, fallback = "") {
  for (const layout of Object.values(sourceState?.layouts || {})) {
    const containerId = layout?.arrangement?.items?.[itemId];
    if (containerId) return containerId;
  }
  return fallback || "";
}

async function openSharedReadonlyItemDialog(sourceItemId) {
  const match = findSharedItem(sourceItemId);
  if (!match) return;
  runtime.sharedDialogCopyItemId = sourceItemId;
  runtime.editingItemId = null;
  const sharedItem = match.item;
  const item = match.sourceRecord || {
    name: sharedItem.name || "",
    weight: Number(sharedItem.weightGrams || 0),
    quantity: 1,
    location: "",
    categories: [],
    availabilityStatus: "available",
    containerId: "",
    note: sharedItem.description || "",
    photos: sharedGearPhotos(sharedItem)
  };
  refs.dialogTitle.textContent = t("items.viewItem");
  refs.itemName.value = item.name || "";
  refs.itemWeight.value = Number(item.weight || 0);
  refs.itemQuantity.value = itemQuantity(item);
  updateItemQuantityUi();
  if (refs.itemColor) refs.itemColor.value = item.color || "";
  const dimensions = normalizeContainerDimensions(item.dimensions);
  if (refs.itemWidth) refs.itemWidth.value = dimensions.width ? String(dimensions.width).replace(".", ",") : "";
  if (refs.itemHeight) refs.itemHeight.value = dimensions.height ? String(dimensions.height).replace(".", ",") : "";
  if (refs.itemDepth) refs.itemDepth.value = dimensions.depth ? String(dimensions.depth).replace(".", ",") : "";
  const location = item.location || "";
  fillSelect(refs.itemLocation, location ? [dictionarySelectEntry(location)] : [], location);
  renderCategoryPicker(refs.itemCategoryList, itemCategories(item), {
    fallbackDefault: false,
    idPrefix: "item-category",
    allowCreate: false
  });
  if (refs.itemAvailabilityStatus) refs.itemAvailabilityStatus.value = normalizeItemAvailabilityStatus(item.availabilityStatus);
  const containerId = sharedRecordItemContainerId(match.sourceState, sourceItemId, item.containerId);
  const entityOnlyItem = !shouldShowSharedEntityPlacement(match.sourceState, "item");
  refs.itemContainer.value = entityOnlyItem ? "" : containerId;
  if (refs.itemContainerField) refs.itemContainerField.hidden = entityOnlyItem;
  if (refs.itemContainerLabel) refs.itemContainerLabel.textContent = t("forms.locatedIn");
  if (refs.itemContainerCurrent) {
    refs.itemContainerCurrent.hidden = false;
    refs.itemContainerCurrent.textContent = sharedRecordContainerPath(match.sourceState, containerId) || t("forms.outsideLayout");
    refs.itemContainerCurrent.classList.toggle("active", Boolean(containerId));
  }
  updateItemDeleteForeverButton();
  refs.itemNote.value = item.note || "";
  runtime.itemDialogPhotoDraft = null;
  runtime.itemDialogPhotoActiveIndex = 0;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  await updateItemDialogPhotoPreview(normalizeItemPhotos(item));
  setSharedReadonlyItemDialog(true);
  openModalDialog(refs.dialog);
}

function setSharedReadonlyItemDialog(readonly) {
  refs.copySharedItemDialogBtn.hidden = !readonly;
  refs.saveItemBtn.hidden = readonly;
  refs.itemContainerPickerBtn.hidden = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.hidden = readonly;
  if (refs.shareItemLinkBtn) refs.shareItemLinkBtn.hidden = readonly || refs.shareItemLinkBtn.hidden;
  if (refs.itemReplaceBtn) refs.itemReplaceBtn.hidden = readonly || refs.itemReplaceBtn.hidden;
  if (refs.itemRemoveFromLayoutBtn) refs.itemRemoveFromLayoutBtn.hidden = readonly || refs.itemRemoveFromLayoutBtn.hidden;
  if (refs.itemDeleteForeverBtn) refs.itemDeleteForeverBtn.hidden = readonly || refs.itemDeleteForeverBtn.hidden;
  refs.dialog.querySelectorAll("input, textarea, select").forEach((element) => {
    element.disabled = readonly;
  });
  if (refs.itemQuantityMinus) refs.itemQuantityMinus.disabled = readonly;
  if (refs.itemQuantityPlus) refs.itemQuantityPlus.disabled = readonly;
  refs.itemContainerPickerBtn.disabled = readonly;
  if (refs.itemCopyToContainerBtn) refs.itemCopyToContainerBtn.disabled = readonly;
  if (refs.itemReplaceBtn) refs.itemReplaceBtn.disabled = readonly || refs.itemReplaceBtn.disabled;
  if (refs.itemRemoveFromLayoutBtn) refs.itemRemoveFromLayoutBtn.disabled = readonly || refs.itemRemoveFromLayoutBtn.disabled;
  if (refs.itemDeleteForeverBtn) refs.itemDeleteForeverBtn.disabled = readonly || refs.itemDeleteForeverBtn.disabled;
  refs.itemPhotoRemoveBtn.disabled = readonly;
  if (refs.itemPhotoPrimaryBtn) refs.itemPhotoPrimaryBtn.disabled = readonly || refs.itemPhotoPrimaryBtn.disabled;
  refs.itemPhotoInput.disabled = readonly;
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.disabled = readonly;
  const photoActions = refs.dialog.querySelector(".item-photo-actions");
  const pasteHint = refs.dialog.querySelector(".photo-paste-hint");
  if (photoActions) photoActions.hidden = readonly;
  if (pasteHint) pasteHint.hidden = readonly;
  refs.dialog.querySelectorAll(".item-photo-pick").forEach((label) => {
    label.classList.toggle("disabled", readonly);
  });
}

function resetSharedReadonlyItemDialog() {
  runtime.sharedDialogCopyItemId = "";
  if (!refs.copySharedItemDialogBtn || !refs.saveItemBtn) return;
  if (refs.itemContainerField) refs.itemContainerField.hidden = false;
  setSharedReadonlyItemDialog(false);
}

function copySharedItemFromReadonlyDialog() {
  const itemId = runtime.sharedDialogCopyItemId;
  if (!itemId) return;
  refs.dialog.close();
  copySharedItem(itemId);
}

async function openSharedReadonlyContainerDialog(sourceContainerId) {
  const match = findSharedRoot(sourceContainerId);
  if (!match) return;
  const container = match.sourceRecord || {
    name: match.name || "",
    weight: Number(match.weightGrams || 0),
    volume: Number(match.volumeLiters || 0),
    color: "",
    location: "",
    categories: [],
    nestable: false,
    parentId: "",
    note: match.description || "",
    photos: sharedGearPhotos(match)
  };
  runtime.editingRootContainerId = null;
  refs.rootContainerDialogTitle.textContent = t("rootContainers.view");
  if (refs.rootContainerTemporaryStatus) refs.rootContainerTemporaryStatus.hidden = true;
  refs.rootContainerName.value = container.name || "";
  refs.rootContainerWeight.value = Number(container.weight || 0);
  refs.rootContainerVolume.value = container.volume ? String(container.volume).replace(".", ",") : "";
  if (refs.rootContainerColor) refs.rootContainerColor.value = container.color || "";
  const dimensions = normalizeContainerDimensions(container.dimensions);
  if (refs.rootContainerWidth) refs.rootContainerWidth.value = dimensions.width ? String(dimensions.width).replace(".", ",") : "";
  if (refs.rootContainerHeight) refs.rootContainerHeight.value = dimensions.height ? String(dimensions.height).replace(".", ",") : "";
  if (refs.rootContainerDepth) refs.rootContainerDepth.value = dimensions.depth ? String(dimensions.depth).replace(".", ",") : "";
  const location = container.location || "";
  fillSelect(refs.rootContainerLocation, location ? [dictionarySelectEntry(location)] : [], location);
  renderCategoryPicker(refs.rootContainerCategoryList, containerCategories(container), {
    fallbackDefault: false,
    idPrefix: "root-container-category",
    allowCreate: false
  });
  if (refs.rootContainerNestable) refs.rootContainerNestable.checked = container.nestable === true;
  if (refs.rootContainerPlacementField) refs.rootContainerPlacementField.hidden = false;
  if (refs.rootContainerPlacementLabel) refs.rootContainerPlacementLabel.textContent = t("forms.locatedIn");
  if (refs.rootContainerPlacementCurrent) {
    refs.rootContainerPlacementCurrent.hidden = false;
    const parentId = container.parentId || sharedRecordContainerParentId(match.sourceState, sourceContainerId);
    refs.rootContainerPlacementCurrent.textContent = sharedRecordContainerPath(match.sourceState, parentId) || t("settings.currentLayout");
    refs.rootContainerPlacementCurrent.classList.toggle("active", true);
  }
  refs.rootContainerNote.value = container.note || "";
  runtime.rootContainerDialogPhotoDraft = null;
  runtime.rootContainerDialogPhotoActiveIndex = 0;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  await updateRootContainerDialogPhotoPreview(normalizeItemPhotos(container));
  setSharedReadonlyRootContainerDialog(true);
  openModalDialog(refs.rootContainerDialog);
}

function setSharedReadonlyRootContainerDialog(readonly) {
  refs.saveRootContainerBtn.hidden = readonly;
  if (refs.shareRootContainerLinkBtn) refs.shareRootContainerLinkBtn.hidden = readonly || refs.shareRootContainerLinkBtn.hidden;
  [
    refs.rootContainerPlacementBtn,
    refs.rootContainerCopyToContainerBtn,
    refs.rootContainerReplaceBtn,
    refs.rootContainerRemoveFromLayoutBtn,
    refs.rootContainerDeleteForeverBtn
  ].forEach((button) => {
    if (!button) return;
    button.hidden = readonly;
    button.disabled = readonly;
  });
  refs.rootContainerDialog.querySelectorAll("input, textarea, select").forEach((element) => {
    element.disabled = readonly;
  });
  const photoActions = refs.rootContainerDialog.querySelector(".item-photo-actions");
  const pasteHint = refs.rootContainerDialog.querySelector(".photo-paste-hint");
  if (photoActions) photoActions.hidden = readonly;
  if (pasteHint) pasteHint.hidden = readonly;
  refs.rootContainerDialog.querySelectorAll(".item-photo-pick").forEach((label) => {
    label.classList.toggle("disabled", readonly);
  });
}

function resetSharedReadonlyRootContainerDialog() {
  if (!refs.saveRootContainerBtn) return;
  setSharedReadonlyRootContainerDialog(false);
}

function uniqueLayoutName(baseName = defaultLayoutName(), { exceptLayoutId = "" } = {}) {
  const existingNames = Object.values(state.layouts || [])
    .filter((layout) => layout?.id !== exceptLayoutId)
    .map((layout) => layout?.name);
  return uniqueName(baseName, existingNames, { fallback: defaultLayoutName() });
}

function uniquePublishedTemplateName(baseName = defaultTemplateName(), { exceptLayoutId = "" } = {}) {
  const existingNames = [
    ...runtime.serverConfirmedDemoTemplates.map((layout) => layout?.name),
    ...(linkedSharedListLayout && !isDeletedSharedLayoutId(linkedSharedListLayout.id) ? [linkedSharedListLayout.name] : []),
    ...allSharedLayoutsByAdminOrder().map((layout) => layout?.name),
    ...Object.values(state.layouts || {})
      .filter((layout) => layout?.id !== exceptLayoutId && layout?.adminDemo)
      .map((layout) => layout?.name),
    ...localAdminTemplateCopyLayouts()
      .filter((layout) => layout?.id !== exceptLayoutId)
      .map((layout) => layout?.name)
  ];
  return uniqueName(baseName, existingNames, { fallback: defaultTemplateName() });
}

function canManageLayout(layoutId = state.activeLayoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout || isReadOnlyStateScope() || isSharedLayoutView()) return false;
  if (isAdminEditablePublishedLayout(layout.id)) return canEditManagedAdminTemplateNow(layout);
  return canUseLocalEditableState(layout.id);
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
      get serverConfirmedDemoTemplates() { return runtime.serverConfirmedDemoTemplates; },
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
    serverConfirmedDemoTemplates: runtime.serverConfirmedDemoTemplates,
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

async function createTemplateCopyDraft(sourceLayout, requestedName, { sourceKind = "" } = {}) {
  if (!sourceLayout || !requestedName || !isAdminEditablePublishedLayout(sourceLayout.id)) return "";
  const language = normalizeUiLanguage(sourceLayout.adminDemoLanguage || sourceLayout.language || uiLanguage);
  const createdId = await createTemplateCopyFromSource(sourceLayout, requestedName, {
    language,
    sourceKind,
    activate: false,
    renderAfter: false
  });
  if (!createdId) return "";
  activateAdminPublishedLayout(createdId);
  updateSyncUi(t("template.draftStatus"));
  render();
  return createdId;
}

function openLayoutDialog({ copyTargetFlow = false } = {}) {
  if (!copyTargetFlow) pendingCopyTargetLayoutCreation = null;
  if (refs.layoutCreateTitle) {
    refs.layoutCreateTitle.textContent = copyTargetFlow
      ? t("copy.createLayout")
      : canOpenAdminPublishedEdit()
      ? localText("New layout/template", "Новая укладка/шаблон")
      : defaultLayoutName();
  }
  const activePublicChoice = publicLayoutChoiceForLayout(state.layouts?.[state.activeLayoutId]);
  const shouldSuggestActiveTemplateCopy = Boolean(!copyTargetFlow && canOpenAdminPublishedEdit() && activePublicChoice);
  refs.layoutName.value = uniqueLayoutName(defaultLayoutName());
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
  refs.layoutCreateMode.querySelectorAll("option[value='from-template-layout'], option[value='template-copy'], option[value='demo-template'], option[value='shared-template']").forEach((option) => {
    option.hidden = !canCreateTemplates;
    option.disabled = !canCreateTemplates;
  });
  refs.layoutCreateMode.querySelectorAll("option[value='template']").forEach((option) => {
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
      ? localText("Copy template from", "Скопировать шаблон из")
      : shouldCreateFromTemplate
        ? localText("Create layout from template", "Создать укладку из шаблона")
        : localText("Copy layout from", "Скопировать укладку из");
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
  const shouldShowLegacyTemplateKind = modeState.mode === "template";
  if (refs.layoutTemplateKindLabel && refs.layoutTemplateKind) {
    refs.layoutTemplateKindLabel.hidden = !shouldShowLegacyTemplateKind;
    refs.layoutTemplateKindLabel.setAttribute("aria-hidden", String(!shouldShowLegacyTemplateKind));
    refs.layoutTemplateKind.disabled = !shouldShowLegacyTemplateKind;
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
    showToast(localText("Only an administrator can create templates.", "Шаблоны может создавать только админ."), "error");
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
    serverConfirmedDemoTemplates: runtime.serverConfirmedDemoTemplates
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
    switchView("packing");
    showToast(t("template.draftCreated"), "success");
    return;
  }
  if (shouldCopyTemplate) {
    const sourceChoice = refs.layoutCopyFrom.value;
    const sourceLayout = await resolveLayoutCreateTemplateCopyLayout(sourceChoice);
    if (!sourceLayout) {
      showToast(localText("Template source not found.", "Источник шаблона не найден."), "error");
      return;
    }
    try {
      const sourceKind = templateCopySourceKindFromChoice(sourceChoice, {
        isDemoLayoutChoice,
        state,
        templateDraftLayoutId
      });
      const createdId = await createTemplateCopyDraft(sourceLayout, requestedName, { sourceKind });
      if (!createdId) return;
      refs.layoutDialog.close();
      switchView("packing");
      showToast(t("template.draftCreated"), "success");
    } catch (error) {
      showToast(localText(`Could not copy the template: ${error.message}`, `Не удалось скопировать шаблон: ${error.message}`), "error");
    }
    return;
  }
  if (shouldCreateFromTemplate) {
    const templateSource = await resolveLayoutCreateTemplateCopySource(refs.layoutCopyFrom.value);
    if (!templateSource) {
      showToast(localText("Template source not found.", "Источник шаблона не найден."), "error");
      return;
    }
    const createdId = createPrivateLayoutFromTemplateSource(templateSource, requestedName, {
      activate: !pendingCopyTargetLayoutCreation
    });
    if (!createdId) return;
    refs.layoutDialog.close();
    const resumedCopy = resumeCopyPickerAfterLayoutCreation(createdId);
    if (!resumedCopy) switchView("packing");
    try {
      await syncCreatedPrivateLayoutEntities(createdId);
      showToast(localText("Layout created from the template.", "Укладка создана из шаблона."), "success");
    } catch (error) {
      showToast(localText(`The layout was created locally but was not saved to the server: ${error.message}`, `Укладка создана локально, но не сохранена на сервере: ${error.message}`), "error");
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
  const createdId = createLayoutCopyFromSource(source, requestedName, {
    activate: !pendingCopyTargetLayoutCreation
  });
  if (!createdId) return;
  refs.layoutDialog.close();
  if (!resumeCopyPickerAfterLayoutCreation(createdId)) switchView("packing");
}

function openLayoutEditDialog() {
  const layoutId = getActiveEditableLayoutId();
  const layout = state.layouts?.[layoutId];
  if (!layout || !canManageActiveLayout()) {
    showToast(localText("This layout cannot be edited.", "Эту укладку нельзя редактировать."), "error");
    return;
  }
  if (isAdminEditablePublishedLayout(layout.id) && state.activeLayoutId !== layout.id) {
    restoreAdminPublishedLayoutContext(layout.id);
  }
  runtime.layoutEditTargetId = layout.id;
  refs.layoutEditTitle.textContent = layoutEditTitle(layout);
  refs.layoutEditName.value = layout.name || "";
  const showLanguage = isAdminEditablePublishedLayout(layout.id);
  const notesLabel = refs.layoutEditNotes?.closest("label");
  if (notesLabel) {
    notesLabel.hidden = showLanguage;
    notesLabel.setAttribute("aria-hidden", String(showLanguage));
  }
  if (refs.layoutEditNotes) refs.layoutEditNotes.value = showLanguage ? "" : normalizeLayoutNotes(layout.notes);
  refs.layoutEditLanguageLabel.hidden = !showLanguage;
  refs.layoutEditLanguageLabel.setAttribute("aria-hidden", String(!showLanguage));
  const showLock = !showLanguage;
  if (refs.layoutLockedLabel) {
    refs.layoutLockedLabel.hidden = !showLock;
    refs.layoutLockedLabel.setAttribute("aria-hidden", String(!showLock));
  }
  if (refs.layoutLocked) refs.layoutLocked.checked = isLayoutLocked(layout);
  if (showLanguage) {
    fillSelect(refs.layoutEditLanguage, languageSelectEntries(), normalizeUiLanguage(layoutManageLanguage(layout, uiLanguage)));
  }
  updateLayoutEditDeleteButton(layout);
  updateLayoutEditPublishButton(layout);
  layoutEditInitialSnapshot = getLayoutEditSnapshot();
  updateLayoutEditSaveState();
  renderLayoutOrderPanel();
  openModalDialog(refs.layoutEditDialog);
}

function publicTemplateDeleteBlockReasonForLayout(layout) {
  if (!layout || !isAdminEditablePublishedLayout(layout.id) || isManagedTemplateUnpublished(layout)) return "";
  const target = publishedLayoutTarget(layout);
  return publicTemplateDeleteBlockReason({
    target,
    layout,
    deletePublished: shouldDeletePublishedTemplateForLayout(layout),
    demoTemplates: runtime.serverConfirmedDemoTemplates,
    sharedTemplates: runtime.serverConfirmedSharedLayouts,
    languageLabel: languageOptionLabel
  });
}

function updateLayoutEditDeleteButton(layout) {
  if (!refs.deleteEditedLayoutBtn) return;
  const lockedByOpenForm = Boolean(layout?.id && layout.id === runtime.layoutEditTargetId && refs.layoutLocked?.checked);
  const lockedReason = (isLayoutLocked(layout) || lockedByOpenForm) ? t("layout.deleteLockedBlock") : "";
  const publicReason = publicTemplateDeleteBlockReasonForLayout(layout);
  const reason = lockedReason || publicReason;
  refs.deleteEditedLayoutBtn.textContent = t("buttons.deleteLayout");
  refs.deleteEditedLayoutBtn.title = reason;
  refs.deleteEditedLayoutBtn.classList.toggle("delete-blocked", Boolean(publicReason));
  refs.deleteEditedLayoutBtn.classList.toggle("danger", !publicReason);
  refs.deleteEditedLayoutBtn.disabled = Boolean(publicReason) || !canDeleteManagedLayout(layout?.id);
}

function updateLayoutEditPublishButton(layout) {
  if (!refs.publishEditedTemplateBtn) return;
  const action = layout?.id && isAdminEditablePublishedLayout(layout.id)
    ? managedTemplatePublicationAction(layout)
    : "";
  const visible = Boolean(action);
  const labelKey = action === "retry-unpublish"
    ? "template.retryUnpublish"
    : action === "unpublish"
      ? "template.unpublish"
      : "template.publish";
  refs.publishEditedTemplateBtn.textContent = t(labelKey);
  refs.publishEditedTemplateBtn.hidden = !visible;
  refs.publishEditedTemplateBtn.disabled = !visible || !canEditPublishedTemplatesNow();
  refs.publishEditedTemplateBtn.classList.toggle("template-unpublish-action", action === "unpublish" || action === "retry-unpublish");
  refs.publishEditedTemplateBtn.closest(".layout-edit-actions")?.classList.toggle("template-publish-visible", visible);
}

function editableLayoutOrderSections() {
  const showPublicTemplates = canViewAdminPublishedCatalog();
  const editPublishedCatalog = canEditPublishedTemplatesNow();
  return layoutOrderSectionsFromSources({
    layouts: state.layouts,
    demoTemplates: editPublishedCatalog
      ? runtime.serverConfirmedDemoTemplates
      : showPublicTemplates ? [] : demoTemplatesForUiLanguage(uiLanguage),
    sharedTemplates: editPublishedCatalog
      ? serverConfirmedSharedLayoutsByAdminOrder()
      : showPublicTemplates ? [] : currentSharedLayouts(uiLanguage),
    serverCatalogVisible: showPublicTemplates,
    guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG,
    includeLayout: (layout) => Boolean(layout?.id && canManageLayout(layout.id)),
    locale: uiLanguage || "ru"
  });
}

function cloneLayoutOrderSections(sections = []) {
  return sections.map((section) => ({ ...section, layouts: [...(section.layouts || [])] }));
}

function layoutOrderSectionsSignature(sections = []) {
  return sections.map((section) =>
    `${section?.id || ""}:${(section?.layouts || []).map((layout) => layout?.id || "").join(",")}`
  ).join("|");
}

function currentLayoutOrderSections() {
  return layoutOrderDraftSections ? cloneLayoutOrderSections(layoutOrderDraftSections) : editableLayoutOrderSections();
}

function startLayoutOrderDraft() {
  layoutOrderDraftSections = editableLayoutOrderSections();
  layoutOrderInitialSignature = layoutOrderSectionsSignature(layoutOrderDraftSections);
  updateLayoutOrderSaveState();
}

function setLayoutOrderDraftSections(sections) {
  layoutOrderDraftSections = cloneLayoutOrderSections(sections);
  renderLayoutOrderPanel();
}

function updateLayoutOrderSaveState() {
  if (!refs.saveLayoutOrderBtn) return;
  const changed = refs.layoutOrderDialog?.open && layoutOrderSectionsSignature(currentLayoutOrderSections()) !== layoutOrderInitialSignature;
  updateModalSaveButton(refs.saveLayoutOrderBtn, { hasName: true, changed });
}

function hasSavableLayoutOrderChanges() {
  updateLayoutOrderSaveState();
  return refs.layoutOrderDialog?.open && refs.saveLayoutOrderBtn && !refs.saveLayoutOrderBtn.disabled;
}

function setLayoutOrderButtonTooltip(button, text) {
  button.title = text;
  button.dataset.touchTooltip = text;
  button.setAttribute("aria-label", text);
}

function layoutOrderSectionTitle(sectionId) {
  if (sectionId === "demo") return t("layoutOrder.sectionDemo");
  if (sectionId === "shared") return t("layoutOrder.sectionShared");
  return t("layoutOrder.sectionPersonal");
}

function layoutOrderDateText(layout) {
  const created = layout?.createdAt || "";
  const updated = layout?.updatedAt || "";
  const value = created || updated;
  if (!value) return t("layoutOrder.dateNotSet");
  const label = created ? t("layoutOrder.created") : t("layoutOrder.updated");
  return `${label}: ${formatFullDateTime(value)}`;
}

function renderLayoutOrderPanel() {
  if (!refs.layoutOrderToggleBtn || !refs.layoutOrderDialog || !refs.layoutOrderList) return;
  const open = Boolean(refs.layoutOrderDialog.open);
  refs.layoutOrderToggleBtn.setAttribute("aria-expanded", String(open));
  if (!open) {
    refs.layoutOrderList.replaceChildren();
    return;
  }
  const sections = currentLayoutOrderSections();
  refs.layoutOrderList.replaceChildren(...sections.map(renderLayoutOrderSection));
  updateLayoutOrderSaveState();
}

function renderLayoutOrderSection(section) {
  const wrapper = document.createElement("section");
  wrapper.className = "layout-order-section";
  wrapper.dataset.layoutOrderSection = section.id;

  const header = document.createElement("div");
  header.className = "layout-order-section-header";
  const title = document.createElement("h3");
  title.textContent = layoutOrderSectionTitle(section.id);
  const tools = document.createElement("div");
  tools.className = "layout-order-section-tools";
  [
    ["name-asc", "A-Z", t("layoutOrder.sortNameAsc")],
    ["name-desc", "Z-A", t("layoutOrder.sortNameDesc")],
    ["date-asc", "1-9", t("layoutOrder.sortDateAsc")],
    ["date-desc", "9-1", t("layoutOrder.sortDateDesc")]
  ].forEach(([action, label, tooltipText]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost layout-order-sort";
    button.dataset.layoutOrderAction = action;
    button.dataset.layoutOrderSection = section.id;
    button.textContent = label;
    setLayoutOrderButtonTooltip(button, tooltipText);
    button.disabled = section.layouts.length < 2;
    tools.append(button);
  });
  header.append(title, tools);
  wrapper.append(header);

  const list = document.createElement("div");
  list.className = "layout-order-section-list";
  list.dataset.layoutOrderSectionList = section.id;
  if (!section.layouts.length) {
    const empty = document.createElement("p");
    empty.className = "layout-order-empty";
    empty.textContent = t("layoutOrder.emptySection");
    list.append(empty);
  } else {
    section.layouts.forEach((layout, index) => list.append(renderLayoutOrderRow(layout, section, index)));
  }
  wrapper.append(list);
  return wrapper;
}

function renderLayoutOrderRow(layout, section, index) {
  const row = document.createElement("div");
  row.className = "layout-order-row";
  row.dataset.layoutOrderId = layout.id;
  row.dataset.layoutOrderSection = section.id;
  row.draggable = false;
  if (layout.id === runtime.layoutEditTargetId) row.classList.add("active");

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "layout-order-handle";
  handle.textContent = "↕";
  setLayoutOrderButtonTooltip(handle, t("layoutOrder.dragToReorder"));

  const title = document.createElement("div");
  title.className = "layout-order-title";
  const name = document.createElement("strong");
  name.textContent = layout.name || t("labels.layout");
  const meta = document.createElement("span");
  meta.textContent = layoutOrderDateText(layout);
  title.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "layout-order-row-actions";
  [
    ["up", "↑", t("layoutOrder.moveUp"), index === 0],
    ["down", "↓", t("layoutOrder.moveDown"), index >= section.layouts.length - 1]
  ].forEach(([action, label, tooltipText, disabled]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost layout-order-step";
    button.dataset.layoutOrderAction = action;
    button.dataset.layoutOrderId = layout.id;
    button.textContent = label;
    setLayoutOrderButtonTooltip(button, tooltipText);
    button.setAttribute("aria-label", `${tooltipText}: ${layout.name || ""}`.trim());
    button.disabled = disabled;
    actions.append(button);
  });

  row.append(handle, title, actions);
  return row;
}

async function applyLayoutOrderSections(sections) {
  const orderedIds = layoutOrderIdsFromSections(sections);
  const previousLayouts = clone(state.layouts);
  const previousDemoTemplates = runtime.serverConfirmedDemoTemplates;
  const previousSharedTemplates = runtime.serverConfirmedSharedLayouts;
  const result = applyLayoutOrderToSources(state, orderedIds, {
    demoTemplates: previousDemoTemplates,
    sharedTemplates: previousSharedTemplates,
    changedAt: nowIso(),
    markEdited
  });
  if (!result.changed) return false;
  const publicOrderUpdates = publicTemplateOrderUpdates({
    beforeDemoTemplates: previousDemoTemplates,
    afterDemoTemplates: result.demoTemplates,
    beforeSharedTemplates: previousSharedTemplates,
    afterSharedTemplates: result.sharedTemplates
  });
  const personalOrderLayoutIds = changedPersonalLayoutOrderIds(previousLayouts, state.layouts, {
    includeLayout: (layout) => Boolean(
      layout?.id &&
      !layout.adminDemo &&
      !layout.adminSharedSourceId &&
      !layout.publicCatalogLayoutId &&
      !layout?.[GUEST_DEMO_COPY_FLAG]
    )
  });
  try {
    if (publicOrderUpdates.length) {
      await assertAdminApiCompatibility({ force: true });
      updateSyncUi(localText("Saving template order...", "Сохраняю порядок шаблонов..."));
      await persistPublicTemplateOrderUpdates(publicOrderUpdates, {
        apiFetch,
        demoAdminPathForPublicListId
      });
    }
  } catch (error) {
    state.layouts = previousLayouts;
    runtime.serverConfirmedDemoTemplates = previousDemoTemplates;
    runtime.serverConfirmedSharedLayouts = previousSharedTemplates;
    renderFilters();
    renderLayoutOrderPanel();
    updateSyncUi();
    throw error;
  }
  if (result.demoTemplatesChanged) runtime.serverConfirmedDemoTemplates = result.demoTemplates;
  if (result.sharedTemplatesChanged) runtime.serverConfirmedSharedLayouts = result.sharedTemplates;
  if (result.stateChanged) {
    saveState();
    if (personalOrderLayoutIds.length && runtime.currentUser && canUsePrivateState()) {
      updateSyncUi(localText("Saving personal layout order...", "Сохраняю порядок личных укладок..."));
      await saveRemoteState({
        expectedEntityIds: {
          items: [],
          containers: [],
          layouts: personalOrderLayoutIds
        }
      });
    }
  }
  renderFilters();
  renderLayoutOrderPanel();
  updateSyncUi();
  return true;
}

function toggleLayoutOrderPanel() {
  if (!refs.layoutOrderDialog) return;
  if (refs.layoutOrderDialog.open) {
    requestCloseLayoutOrderDialog();
    return;
  }
  startLayoutOrderDraft();
  openModalDialog(refs.layoutOrderDialog);
  renderLayoutOrderPanel();
}

function handleLayoutOrderFormSubmit(event) {
  event.preventDefault();
  if (event.submitter === refs.saveLayoutOrderBtn) {
    saveLayoutOrder(event);
    return;
  }
  if (event.submitter?.value === "cancel") {
    requestCloseLayoutOrderDialog();
  }
}

async function requestCloseLayoutOrderDialog() {
  if (!hasSavableLayoutOrderChanges()) {
    refs.layoutOrderDialog.close("cancel");
    return;
  }
  const action = await askUnsavedChangesDialog();
  if (action === "save") {
    saveLayoutOrder();
    return;
  }
  if (action === "discard") refs.layoutOrderDialog.close("cancel");
}

async function saveLayoutOrder(event) {
  event?.preventDefault();
  if (!hasSavableLayoutOrderChanges()) return;
  if (refs.saveLayoutOrderBtn) refs.saveLayoutOrderBtn.disabled = true;
  try {
    await applyLayoutOrderSections(currentLayoutOrderSections());
    refs.layoutOrderDialog.close("default");
  } catch (error) {
    showToast(localText(
      `Could not save layout order: ${apiErrorMessage(error)}`,
      `Не удалось сохранить порядок укладок: ${apiErrorMessage(error)}`
    ), "error");
    updateLayoutOrderSaveState();
  }
}

function handleLayoutOrderListClick(event) {
  const button = event.target.closest("[data-layout-order-action]");
  if (!button || !refs.layoutOrderList?.contains(button)) return;
  const action = button.dataset.layoutOrderAction || "";
  const sections = currentLayoutOrderSections();
  let nextSections = sections;
  if (action === "up" || action === "down") {
    nextSections = moveLayoutWithinSections(sections, button.dataset.layoutOrderId || "", action === "up" ? -1 : 1);
  } else if (action === "name-asc" || action === "name-desc") {
    nextSections = sortLayoutSectionByName(sections, button.dataset.layoutOrderSection || "", action === "name-desc" ? "desc" : "asc", uiLanguage || "ru");
  } else if (action === "date-asc" || action === "date-desc") {
    nextSections = sortLayoutSectionByDate(sections, button.dataset.layoutOrderSection || "", action === "date-desc" ? "desc" : "asc");
  }
  setLayoutOrderDraftSections(nextSections);
}

function bindLayoutOrderDragControls() {
  bindLayoutOrderPointerDrag({
    list: refs.layoutOrderList,
    getSections: currentLayoutOrderSections,
    applySections: setLayoutOrderDraftSections,
    moveBeforeInSections: moveLayoutBeforeInSections,
    moveWithinSections: moveLayoutWithinSections,
    getTouchPoint,
    isHoldDragInput,
    markDragPending,
    clearDragPending,
    preventDragContextMenu,
    pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
    touchDragCancelDistance: TOUCH_DRAG_CANCEL_DISTANCE,
    touchDragDelayMs: TOUCH_DRAG_DELAY_MS,
    touchScrollCancelDistance: TOUCH_SCROLL_CANCEL_DISTANCE,
    vibrateDragStart
  });
  bindLongPressTooltips({
    root: refs.layoutOrderList,
    selector: "[data-touch-tooltip]"
  });
  bindLongPressTooltips({
    root: refs.layoutEditDialog,
    selector: "[data-touch-tooltip]"
  });
}

function handleLayoutOrderDragStart(event) {
  const row = event.target.closest("[data-layout-order-id]");
  if (!row || !refs.layoutOrderList?.contains(row)) return;
  layoutOrderDragId = row.dataset.layoutOrderId || "";
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", layoutOrderDragId);
}

function handleLayoutOrderDragOver(event) {
  if (!layoutOrderDragId) return;
  const row = event.target.closest("[data-layout-order-id]");
  if (!row || !refs.layoutOrderList?.contains(row)) return;
  const source = refs.layoutOrderList.querySelector(`[data-layout-order-id="${CSS.escape(layoutOrderDragId)}"]`);
  if (!source || source.dataset.layoutOrderSection !== row.dataset.layoutOrderSection) return;
  event.preventDefault();
  row.classList.add("drag-over");
}

function handleLayoutOrderDragLeave(event) {
  const row = event.target.closest("[data-layout-order-id]");
  if (row) row.classList.remove("drag-over");
}

function handleLayoutOrderDrop(event) {
  if (!layoutOrderDragId) return;
  const row = event.target.closest("[data-layout-order-id]");
  if (!row || !refs.layoutOrderList?.contains(row)) return;
  event.preventDefault();
  row.classList.remove("drag-over");
  setLayoutOrderDraftSections(moveLayoutBeforeInSections(currentLayoutOrderSections(), layoutOrderDragId, row.dataset.layoutOrderId || ""));
  layoutOrderDragId = "";
}

function handleLayoutOrderDragEnd() {
  layoutOrderDragId = "";
  refs.layoutOrderList?.querySelectorAll(".dragging, .drag-over").forEach((row) => row.classList.remove("dragging", "drag-over"));
}

function handleLayoutOrderDialogClose() {
  handleLayoutOrderDragEnd();
  layoutOrderDraftSections = null;
  layoutOrderInitialSignature = "";
  renderLayoutOrderPanel();
}

function getLayoutEditSnapshot() {
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  const adminPublished = Boolean(layout?.id && isAdminEditablePublishedLayout(layout.id));
  return {
    name: refs.layoutEditName?.value.trim() || "",
    language: adminPublished ? normalizeUiLanguage(refs.layoutEditLanguage?.value || layoutManageLanguage(layout, uiLanguage)) : "",
    notes: adminPublished ? "" : normalizeLayoutNotes(refs.layoutEditNotes?.value || ""),
    locked: adminPublished ? false : Boolean(refs.layoutLocked?.checked)
  };
}

function updateLayoutEditSaveState() {
  if (!refs.saveEditedLayoutBtn) return;
  const snapshot = getLayoutEditSnapshot();
  const changed = !layoutEditInitialSnapshot || !snapshotsEqual(snapshot, layoutEditInitialSnapshot);
  updateModalSaveButton(refs.saveEditedLayoutBtn, { hasName: Boolean(snapshot.name), changed });
}

function hasSavableLayoutEditChanges() {
  updateLayoutEditSaveState();
  return refs.layoutEditDialog?.open && refs.saveEditedLayoutBtn && !refs.saveEditedLayoutBtn.disabled;
}

function handleLayoutEditFormSubmit(event) {
  event.preventDefault();
  if (event.submitter === refs.saveEditedLayoutBtn) {
    saveEditedLayout(event);
    return;
  }
  if (event.submitter?.value === "cancel") {
    requestCloseLayoutEditDialog();
  }
}

async function requestCloseLayoutEditDialog() {
  if (!hasSavableLayoutEditChanges()) {
    refs.layoutEditDialog.close("cancel");
    return;
  }
  const action = await askUnsavedChangesDialog();
  if (action === "save") {
    saveEditedLayout();
    return;
  }
  if (action === "discard") refs.layoutEditDialog.close("cancel");
}

function handleLayoutEditDialogClose() {
  layoutEditInitialSnapshot = null;
}

function canDeleteManagedLayout(layoutId = runtime.layoutEditTargetId || state.activeLayoutId) {
  const layout = state.layouts?.[layoutId];
  if (!layout) return false;
  if (publicTemplateDeleteBlockReasonForLayout(layout)) return false;
  if (isAdminEditablePublishedLayout(layoutId)) return canEditManagedAdminTemplateNow(layout);
  return canDeleteActiveLayout() && layoutId === state.activeLayoutId;
}

async function saveEditedLayout(event, { closeDialog = true, notify = true } = {}) {
  event?.preventDefault();
  if (refs.saveEditedLayoutBtn?.disabled) return;
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  if (!layout || !canManageLayout(layout.id)) return;
  const adminPublished = isAdminEditablePublishedLayout(layout.id);
  const changedAt = nowIso();
  const nextName = refs.layoutEditName.value.trim();
  if (!nextName) return;
  const previousLocked = isLayoutLocked(layout);
  const nextLocked = !adminPublished && refs.layoutLocked ? refs.layoutLocked.checked : false;
  if (previousLocked && nextLocked && nextName !== (layout.name || "")) {
    warnLockedLayoutMutation(layout.id);
    return;
  }
  if (previousLocked && !nextLocked) {
    const confirmed = await askConfirmDialog({
      title: t("layout.unlockTitle"),
      text: t("layout.unlockText"),
      okText: t("layout.unlockOk"),
      cancelText: t("buttons.cancel"),
      tone: "danger"
    });
    if (!confirmed) return;
  }
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
  const notesChanged = !adminPublished && applyLayoutNotes(layout, refs.layoutEditNotes?.value || "");
  const lockChanged = !adminPublished && applyLayoutLocked(layout, nextLocked);
  if (!changed && !notesChanged && !lockChanged) {
    if (closeDialog) refs.layoutEditDialog.close();
    return true;
  }
  touchLayout(layout.id, changedAt);
  if (adminPublished) {
    if (isManagedTemplateUnpublished(layout)) {
      saveState({ sync: false });
      layoutEditInitialSnapshot = getLayoutEditSnapshot();
      updateLayoutEditSaveState();
      if (closeDialog) refs.layoutEditDialog.close();
      render();
      if (notify) showToast(t("template.draftUpdated"), "success");
      return true;
    }
    refs.saveEditedLayoutBtn.disabled = true;
    try {
      await savePublishedTemplateMetadata(layout, previousLayout);
      if (closeDialog) refs.layoutEditDialog.close();
      render();
      if (notify) showToast(localText("Template label updated.", "Метка шаблона обновлена."), "success");
      return true;
    } catch (error) {
      if (previousLayout?.id) state.layouts[previousLayout.id] = previousLayout;
      saveState({ sync: false });
      render();
      if (error?.isAdminApiCompatibilityError) {
        updateSyncUi();
        showToast(error.message, "error");
      } else {
        updateSyncUi(localText(`Could not save the template label: ${error.message}`, `Не удалось сохранить метку шаблона: ${error.message}`));
        showToast(localText(`Could not save the template label: ${error.message}`, `Не удалось сохранить метку шаблона: ${error.message}`), "error");
      }
      return false;
    } finally {
      refs.saveEditedLayoutBtn.disabled = false;
    }
    return;
  }
  saveLayoutMutation(layout.id);
  if (closeDialog) refs.layoutEditDialog.close();
  render();
  if (notify) showToast(localText("Layout updated.", "Укладка обновлена."), "success");
  return true;
}

async function publishEditedTemplate(event) {
  event?.preventDefault();
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  if (!layout || !isAdminEditablePublishedLayout(layout.id) || !isManagedTemplateUnpublished(layout)) return;
  if (!canEditPublishedTemplatesNow()) return;
  if (hasSavableLayoutEditChanges()) {
    const saved = await saveEditedLayout(null, { closeDialog: false, notify: false });
    if (!saved) return;
  }
  refs.publishEditedTemplateBtn.disabled = true;
  refs.saveEditedLayoutBtn.disabled = true;
  try {
    await savePublishedLayoutRecord(layout.id);
    updateLayoutEditPublishButton(layout);
    refs.layoutEditDialog.close();
    render();
    showToast(t("template.published"), "success");
  } catch (error) {
    updateSyncUi();
    showToast(t("template.publishFailed", { message: error.message }), "error");
  } finally {
    if (refs.layoutEditDialog.open) {
      refs.publishEditedTemplateBtn.disabled = false;
      updateLayoutEditSaveState();
    }
  }
}

async function unpublishEditedTemplate(event) {
  event?.preventDefault();
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  const action = managedTemplatePublicationAction(layout);
  const retryPending = action === "retry-unpublish";
  if (!layout || !isAdminEditablePublishedLayout(layout.id) || (action !== "unpublish" && !retryPending)) return;
  if (!canEditPublishedTemplatesNow()) return;
  if (hasSavableLayoutEditChanges()) {
    const saved = await saveEditedLayout(null, { closeDialog: false, notify: false });
    if (!saved) return;
  }
  if (!retryPending) {
    const confirmed = await askConfirmDialog({
      title: t("template.unpublishConfirmTitle"),
      text: t("template.unpublishConfirmText", { name: layout.name || t("template.prefix") }),
      highlightText: t("template.unpublishConfirmHint"),
      okText: t("template.unpublish"),
      tone: "warning"
    });
    if (!confirmed) return;
  }
  refs.publishEditedTemplateBtn.disabled = true;
  refs.saveEditedLayoutBtn.disabled = true;
  try {
    await assertAdminApiCompatibility({ force: true });
    updateSyncUi(t("template.unpublishing"));
    const unpublished = await unpublishManagedTemplateFlow({
      layout,
      target: publishedLayoutTarget(layout),
      state,
      cancelPublishedLayoutSave,
      unpublishPublishedTemplate,
      persistStateSnapshot
    });
    if (!unpublished) throw new Error(t("template.unpublishNotConfirmed"));
    updateSyncUi(t("template.draftStatus"));
    updateLayoutEditPublishButton(layout);
    refs.layoutEditDialog.close();
    render();
    showToast(t("template.unpublished"), "success");
  } catch (error) {
    updateSyncUi();
    updateLayoutEditPublishButton(layout);
    render();
    const pending = managedTemplatePublicationAction(layout) === "retry-unpublish";
    showToast(
      pending
        ? t("template.unpublishPending")
        : t("template.unpublishFailed", { message: error.message }),
      pending ? "warning" : "error"
    );
  } finally {
    if (refs.layoutEditDialog.open) {
      refs.publishEditedTemplateBtn.disabled = false;
      refs.saveEditedLayoutBtn.disabled = false;
      updateLayoutEditSaveState();
    }
  }
}

async function unpublishPublishedTemplate(target, sourceLayout = null, { historyAction = "" } = {}) {
  if (target?.type === "shared" && target.sharedId) {
    const unpublished = await unpublishPublishedSharedTemplate({
      sharedId: target.sharedId,
      apiFetch,
      historyAction,
      layoutsByLanguage: sharedLayoutsByLanguage,
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS
    });
    if (unpublished) {
      runtime.serverConfirmedSharedLayouts = runtime.serverConfirmedSharedLayouts.filter((layout) => layout?.id !== target.sharedId);
    }
    return unpublished;
  }
  if (target?.type !== "demo") return false;

  const listId = target.demoListId || sourceLayout?.adminDemoListId || demoPublicListIdForLanguage(target.language || uiLanguage);
  const unpublished = await unpublishPublishedDemoTemplateRecord({
    listId,
    apiFetch,
    historyAction,
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS
  });
  if (!unpublished) return false;

  const language = normalizeUiLanguage(target.language || sourceLayout?.adminDemoLanguage || sourceLayout?.language || uiLanguage);
  const payloadTarget = publicDemoTemplatePayloadTarget({
    id: listId,
    listId,
    language
  }, {
    fallbackLanguage: language,
    demoListIdForLanguage: demoPublicListIdForLanguage
  });
  publishedListStateCache.remove?.(listId);
  if (payloadTarget?.itemKey) publishedItemKeyStateCache.remove?.(payloadTarget.itemKey);
  runtime.serverConfirmedDemoTemplates = removePublicTemplateCatalogEntry(runtime.serverConfirmedDemoTemplates, {
    listId,
    publicTemplateKind: "demo"
  });
  if (demoSharedLayout.statePayloadByTemplateId) delete demoSharedLayout.statePayloadByTemplateId[listId];
  return true;
}

function handleEditedTemplatePublication(event) {
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  const action = managedTemplatePublicationAction(layout);
  if (action === "unpublish" || action === "retry-unpublish") return unpublishEditedTemplate(event);
  return publishEditedTemplate(event);
}

async function confirmDeleteEditedLayout() {
  const layout = state.layouts?.[runtime.layoutEditTargetId];
  if (isLayoutLocked(layout) || refs.layoutLocked?.checked) {
    showToast(t("layout.deleteLockedBlock"), "warning");
    updateLayoutEditDeleteButton(layout);
    return;
  }
  const blockReason = publicTemplateDeleteBlockReasonForLayout(layout);
  if (blockReason) {
    showToast(blockReason, "warning");
    updateLayoutEditDeleteButton(layout);
    return;
  }
  if (!layout || !canDeleteManagedLayout(layout.id)) {
    showToast(localText("This layout cannot be deleted.", "Эту укладку нельзя удалить."), "error");
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

async function deletePublishedSharedTemplate(sharedId, sourceLayout = null, { preserveLocalDraft = false } = {}) {
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
    runtime.serverConfirmedSharedLayouts = runtime.serverConfirmedSharedLayouts.filter((layout) => layout?.id !== sharedId);
    if (!preserveLocalDraft) {
      purgeDeletedSharedTemplateFromFrontendState({
        targetState: state,
        layoutsByLanguage: sharedLayoutsByLanguage,
        sharedId,
        name: deletedName,
        language: deletedLanguage
      });
    }
  }
  return deleted;
}

async function deletePublishedDemoTemplate(target, sourceLayout = null) {
  const listId = target.demoListId || sourceLayout?.adminDemoListId || demoPublicListIdForLanguage(target.language || uiLanguage);
  const deleted = await deletePublishedDemoTemplateRecord({
    listId,
    apiFetch,
    fetchCatalog: fetchPublicSharedLayoutCatalog,
    timeoutMs: LIST_SAVE_API_TIMEOUT_MS
  });
  if (!deleted) return false;
  const language = normalizeUiLanguage(target.language || sourceLayout?.adminDemoLanguage || sourceLayout?.language || uiLanguage);
  const payloadTarget = publicDemoTemplatePayloadTarget({
    id: listId,
    listId,
    language
  }, {
    fallbackLanguage: language,
    demoListIdForLanguage: demoPublicListIdForLanguage
  });
  publishedListStateCache.remove?.(listId);
  if (payloadTarget?.itemKey) publishedItemKeyStateCache.remove?.(payloadTarget.itemKey);
  runtime.serverConfirmedDemoTemplates = removePublicTemplateCatalogEntry(runtime.serverConfirmedDemoTemplates, {
    listId,
    publicTemplateKind: "demo"
  });
  if (demoSharedLayout.statePayloadByTemplateId) delete demoSharedLayout.statePayloadByTemplateId[listId];
  if (runtime.activeDemoTemplateListId === listId) runtime.activeDemoTemplateListId = nextDemoTemplateAfter(listId, language)?.listId || "";
  if (!demoTemplatesForUiLanguage(language).some((entry) => entry?.serverConfirmed)) {
    setDemoPublicTemplateMissing(language, true, { updateCatalog: false });
    if (demoSharedLayout.statePayloadByLanguage) demoSharedLayout.statePayloadByLanguage[language] = null;
    if (normalizeUiLanguage(uiLanguage) === language) demoSharedLayout.statePayload = null;
  }
  return true;
}

async function deletePublishedTemplate(target, sourceLayout = null, options = {}) {
  if (target?.type === "demo") return await deletePublishedDemoTemplate(target, sourceLayout);
  if (target?.type === "shared" && target.sharedId) return await deletePublishedSharedTemplate(target.sharedId, sourceLayout, options);
  return false;
}

function shouldDeletePublishedTemplateForLayout(layout) {
  if (isManagedTemplateUnpublished(layout)) return false;
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
  const unpublished = isManagedTemplateUnpublished(layout);
  const shouldDeletePublishedTemplate = shouldDeletePublishedTemplateForLayout(layout);
  const nextSharedLayout = (shouldDeletePublishedTemplate || unpublished) && target?.type === "shared"
    ? nextServerConfirmedSharedLayoutAfter(target.sharedId)
    : null;
  const nextDemoTemplate = (shouldDeletePublishedTemplate || unpublished) && target?.type === "demo"
    ? nextDemoTemplateAfter(target.demoListId, target.language || layout.language || uiLanguage)
    : null;
  if (shouldDeletePublishedTemplate) {
    try {
      await assertAdminApiCompatibility({ force: true });
      updateSyncUi(t("template.removingFromList"));
      const removedFromList = await unpublishPublishedTemplate(target, layout, { historyAction: "delete" });
      if (!removedFromList) {
        throw new Error(localText(
          "The server did not confirm that the template was removed from the public list.",
          "Сервер не подтвердил удаление шаблона из публичного списка."
        ));
      }
      updateSyncUi();
    } catch (error) {
      updateSyncUi();
      showToast(t("template.removeFailed", { message: error.message }), "error");
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
  if (shouldDeletePublishedTemplate || unpublished) {
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
  showToast(
    shouldDeletePublishedTemplate ? t("template.removedRecoverable") : t("template.removedLocal"),
    "success"
  );
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
      name: uniqueLayoutName(defaultLayoutName()),
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
  showToast(localText("Layout deleted.", "Укладка удалена."), "success");
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
  const dimensions = readItemDialogDimensions();
  return {
    name: refs.itemName.value.trim(),
    weight: parseWeightInput(refs.itemWeight.value),
    quantity: readItemDialogQuantity(),
    color: normalizeContainerColor(refs.itemColor?.value),
    width: dimensions.width,
    height: dimensions.height,
    depth: dimensions.depth,
    location: refs.itemLocation.value,
    categories: getDialogSelectedCategories().join("\u0000"),
    availabilityStatus: refs.itemAvailabilityStatus ? normalizeItemAvailabilityStatus(refs.itemAvailabilityStatus.value) : "available",
    containerId: refs.itemContainer.value || "",
    note: refs.itemNote.value.trim(),
    photo: getItemDialogPhotoSnapshot()
  };
}

function getItemDialogPhotoSnapshot() {
  if (runtime.itemDialogPhotoDraft) return itemPhotoSignature({ photos: runtime.itemDialogPhotoDraft.photos });
  return runtime.editingItemId ? itemPhotoSignature(state.items[runtime.editingItemId]) : "";
}

async function handleItemPhotoInputChange(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    setItemDialogPhotoStatus(localText("Preparing photos...", "Готовлю фото..."));
    const photos = [];
    for (const file of files) {
      photos.push(await createItemPhotoFromFile(file));
    }
    const limit = usageLimitForRole("photosPerRecord", canOpenAdminPublishedEdit());
    const source = runtime.editingItemId ? state.items[runtime.editingItemId] : { photos: [] };
    const draft = runtime.itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
    const result = addPhotosToDraft(draft, photos, limit);
    runtime.itemDialogPhotoDraft = result.draft;
    if (result.rejected.length) {
      deleteCachedDraftPhotos(result.rejected);
      showToast(usageLimitExceededMessage("photosPerRecord", limit), "warning");
    }
    runtime.itemDialogPhotoActiveIndex = Math.max(0, runtime.itemDialogPhotoDraft.photos.length - result.accepted.length);
    await updateItemDialogPhotoPreview(runtime.itemDialogPhotoDraft.photos);
    updateItemDialogSaveState();
    uploadItemDialogDraftPhotos(result.accepted).catch(() => null);
  } catch (error) {
    setItemDialogPhotoStatus(error.message || localText("Could not prepare the photo.", "Не удалось подготовить фото."));
    showToast(error.message || localText("Could not prepare the photo.", "Не удалось подготовить фото."), "error");
  } finally {
    if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
    if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  }
}

async function removeItemDialogPhoto() {
  const source = runtime.editingItemId ? state.items[runtime.editingItemId] : { photos: [] };
  const draft = runtime.itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
  if (!draft.photos.length) return;
  const confirmed = await confirmDialogPhotoDelete("item");
  if (!confirmed) return;
  const result = removePhotoFromDraft(draft, runtime.itemDialogPhotoActiveIndex, source);
  runtime.itemDialogPhotoDraft = result.draft;
  runtime.itemDialogPhotoActiveIndex = result.nextIndex;
  if (result.discardedPhoto) {
    deleteCachedDraftPhotos(result.discardedPhoto);
    if (result.discardedPhoto.url || result.discardedPhoto.thumbUrl) {
      deleteRemotePhotoIfPossible(runtime.editingItemId, result.discardedPhoto);
    }
  }
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview(runtime.itemDialogPhotoDraft.photos);
  updateItemDialogSaveState();
}

function setItemDialogPhotoPrimary(event) {
  event?.preventDefault();
  if (runtime.sharedDialogCopyItemId || refs.itemPhotoPrimaryBtn?.disabled) return;
  const source = runtime.editingItemId ? state.items[runtime.editingItemId] : { photos: [] };
  const draft = runtime.itemDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = setPrimaryPhotoInDraft(draft, runtime.itemDialogPhotoActiveIndex);
  runtime.itemDialogPhotoDraft = result.draft;
  runtime.itemDialogPhotoActiveIndex = result.nextIndex;
  updateItemDialogPhotoPreview(runtime.itemDialogPhotoDraft.photos);
  if (result.changed) updateItemDialogSaveState();
}

function bindPhotoOrderDialogControls() {
  refs.itemPhotoOrderBtn?.addEventListener("click", () => openPhotoOrderDialog("item"));
  refs.rootContainerPhotoOrderBtn?.addEventListener("click", () => openPhotoOrderDialog("container"));
  refs.photoOrderApplyBtn?.addEventListener("click", applyPhotoOrderDialog);
  refs.photoOrderDialog?.querySelector("form")?.addEventListener("submit", handlePhotoOrderFormSubmit);
  refs.photoOrderDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClosePhotoOrderDialog();
  });
  refs.photoOrderDialog?.addEventListener("close", () => {
    photoOrderContext = null;
    photoOrderInitialSignature = "";
  });
  refs.photoOrderList?.addEventListener("click", handlePhotoOrderListClick);
  bindLayoutOrderPointerDrag({
    list: refs.photoOrderList,
    getSections: currentPhotoOrderSections,
    applySections: applyPhotoOrderSections,
    moveBeforeInSections: moveLayoutBeforeInSections,
    moveWithinSections: moveLayoutWithinSections,
    getTouchPoint,
    isHoldDragInput,
    markDragPending,
    clearDragPending,
    preventDragContextMenu,
    pointerDragStartDistance: POINTER_DRAG_START_DISTANCE,
    touchDragCancelDistance: TOUCH_DRAG_CANCEL_DISTANCE,
    touchDragDelayMs: TOUCH_DRAG_DELAY_MS,
    touchScrollCancelDistance: TOUCH_SCROLL_CANCEL_DISTANCE,
    vibrateDragStart
  });
}

function bindPhotoClipboardControls() {
  [
    [refs.dialog, "item"],
    [refs.rootContainerDialog, "container"]
  ].forEach(([dialog, kind]) => {
    dialog?.addEventListener("paste", (event) => handleDialogPhotoPaste(event, kind));
    dialog?.querySelector(".photo-paste-hint")?.addEventListener("click", (event) =>
      handlePhotoPasteButtonClick(event, kind)
    );
  });
}

function handleDialogPhotoPaste(event, kind = "item") {
  if (!shouldHandlePhotoPasteTarget(event.target)) return;
  const files = clipboardImageFiles(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  if (kind === "container") handleRootContainerPhotoInputChange({ target: { files } });
  else handleItemPhotoInputChange({ target: { files } });
}

async function handlePhotoPasteButtonClick(event, kind = "item") {
  const button = event.currentTarget;
  if (!button || button.disabled || button.getAttribute("aria-busy") === "true") return;
  button.setAttribute("aria-busy", "true");
  try {
    const files = await readClipboardImageFiles(navigator.clipboard);
    if (files === null) {
      showToast(t("photo.clipboardUnavailable"), "warning");
      return;
    }
    if (!files.length) {
      showToast(t("photo.clipboardEmpty"), "warning");
      return;
    }
    if (kind === "container") await handleRootContainerPhotoInputChange({ target: { files } });
    else await handleItemPhotoInputChange({ target: { files } });
  } catch {
    showToast(t("photo.clipboardUnavailable"), "warning");
  } finally {
    button.removeAttribute("aria-busy");
  }
}

function openPhotoOrderDialog(kind = "item") {
  const itemMode = kind === "item";
  const source = itemMode
    ? (runtime.editingItemId ? state.items?.[runtime.editingItemId] : { photos: [] })
    : (runtime.editingRootContainerId ? state.containers?.[runtime.editingRootContainerId] : { photos: [] });
  const draft = itemMode
    ? (runtime.itemDialogPhotoDraft || createPhotoDraftFromRecord(source))
    : (runtime.rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source));
  if (draft.photos.length < 2) return;
  const activeIndex = itemMode ? runtime.itemDialogPhotoActiveIndex : runtime.rootContainerDialogPhotoActiveIndex;
  const previewRoot = itemMode ? refs.itemPhotoPreview : refs.rootContainerPhotoPreview;
  const previewSources = new Map();
  [...(previewRoot?.querySelectorAll(".photo-gallery-slide img") || [])].forEach((image, index) => {
    const id = photoOrderIdentity(draft.photos[index]);
    const src = image.currentSrc || image.src || "";
    if (id && src) previewSources.set(id, src);
  });
  photoOrderContext = { kind, photos: [...draft.photos], activeId: photoOrderIdentity(draft.photos[activeIndex]), previewSources };
  photoOrderInitialSignature = photoOrderSignature(photoOrderContext.photos);
  refs.photoOrderTitle.textContent = isEnglishUi() ? "Photo order" : "Порядок фото";
  refs.photoOrderHint.textContent = isEnglishUi()
    ? "Drag by the handle or use the arrow buttons. The primary photo stays first."
    : "Перетаскивайте за ручку или используйте стрелки. Главное фото остаётся первым.";
  renderPhotoOrderDialog();
  openModalDialog(refs.photoOrderDialog);
}

function renderPhotoOrderDialog() {
  if (!photoOrderContext) return;
  refs.photoOrderList.innerHTML = renderPhotoOrderRows(photoOrderContext.photos, {
    language: uiLanguage,
    previewSources: photoOrderContext.previewSources
  });
  updatePhotoOrderSaveState();
}

function photoOrderSignature(photos = []) {
  return photos.map(photoOrderIdentity).join("|");
}

function updatePhotoOrderSaveState() {
  if (!refs.photoOrderApplyBtn) return;
  const changed = Boolean(photoOrderContext) && photoOrderSignature(photoOrderContext.photos) !== photoOrderInitialSignature;
  updateModalSaveButton(refs.photoOrderApplyBtn, { hasName: true, changed });
}

function hasSavablePhotoOrderChanges() {
  updatePhotoOrderSaveState();
  return Boolean(refs.photoOrderDialog?.open && refs.photoOrderApplyBtn && !refs.photoOrderApplyBtn.disabled);
}

function handlePhotoOrderFormSubmit(event) {
  event.preventDefault();
  if (event.submitter === refs.photoOrderApplyBtn) {
    applyPhotoOrderDialog(event);
    return;
  }
  if (event.submitter?.value === "cancel") requestClosePhotoOrderDialog();
}

async function requestClosePhotoOrderDialog() {
  if (!hasSavablePhotoOrderChanges()) {
    refs.photoOrderDialog.close("cancel");
    return;
  }
  const action = await askUnsavedChangesDialog();
  if (action === "save") {
    applyPhotoOrderDialog();
    return;
  }
  if (action === "discard") refs.photoOrderDialog.close("cancel");
}

function movePhotoOrder(fromIndex, toIndex) {
  if (!photoOrderContext) return false;
  const result = moveOrderedPhoto(photoOrderContext.photos, fromIndex, toIndex, { preservePrimary: true });
  photoOrderContext.photos = result.photos;
  if (result.changed) renderPhotoOrderDialog();
  return result.changed;
}

function currentPhotoOrderSections() {
  return [{
    id: "photos",
    layouts: (photoOrderContext?.photos || []).slice(1).map((photo) => ({ id: photoOrderIdentity(photo) }))
  }];
}

function applyPhotoOrderSections(sections = []) {
  if (!photoOrderContext) return false;
  const primary = photoOrderContext.photos[0];
  const byId = new Map(photoOrderContext.photos.slice(1).map((photo) => [photoOrderIdentity(photo), photo]));
  const ordered = (sections[0]?.layouts || []).map((entry) => byId.get(entry.id)).filter(Boolean);
  if (ordered.length !== byId.size) return false;
  photoOrderContext.photos = [primary, ...ordered];
  renderPhotoOrderDialog();
  return true;
}

function handlePhotoOrderListClick(event) {
  const up = event.target.closest("[data-photo-order-up]");
  const down = event.target.closest("[data-photo-order-down]");
  if (up) movePhotoOrder(Number(up.dataset.photoOrderUp), Number(up.dataset.photoOrderUp) - 1);
  if (down) movePhotoOrder(Number(down.dataset.photoOrderDown), Number(down.dataset.photoOrderDown) + 1);
}

function applyPhotoOrderDialog(event) {
  event?.preventDefault();
  if (!photoOrderContext) return;
  const itemMode = photoOrderContext.kind === "item";
  const source = itemMode
    ? (runtime.editingItemId ? state.items?.[runtime.editingItemId] : { photos: [] })
    : (runtime.editingRootContainerId ? state.containers?.[runtime.editingRootContainerId] : { photos: [] });
  const draft = itemMode
    ? (runtime.itemDialogPhotoDraft || createPhotoDraftFromRecord(source))
    : (runtime.rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source));
  draft.photos = [...photoOrderContext.photos];
  const activeIndex = Math.max(0, draft.photos.findIndex((photo) => photoOrderIdentity(photo) === photoOrderContext.activeId));
  if (itemMode) {
    runtime.itemDialogPhotoDraft = draft;
    runtime.itemDialogPhotoActiveIndex = activeIndex;
    updateItemDialogPhotoPreview(draft.photos);
    updateItemDialogSaveState();
  } else {
    runtime.rootContainerDialogPhotoDraft = draft;
    runtime.rootContainerDialogPhotoActiveIndex = activeIndex;
    updateRootContainerDialogPhotoPreview(draft.photos);
    updateRootContainerDialogSaveState();
  }
  refs.photoOrderDialog.close("default");
}

function resetItemDialogPhotoDraft() {
  cleanupUnsavedItemDialogPhotoDraft();
  runtime.itemDialogPhotoDraft = null;
  revokeObjectUrls(runtime.itemDialogPhotoObjectUrls);
  runtime.itemDialogPhotoObjectUrls = [];
  runtime.itemDialogPhotoActiveIndex = 0;
  if (refs.itemPhotoInput) refs.itemPhotoInput.value = "";
  if (refs.itemPhotoCameraInput) refs.itemPhotoCameraInput.value = "";
  updateItemDialogPhotoPreview([]);
}

function cleanupUnsavedItemDialogPhotoDraft() {
  if (!runtime.itemDialogPhotoDraft) return;
  const isDiscardedNewRecord = !runtime.editingItemId && refs.dialog?.returnValue === "cancel";
  if (!runtime.editingItemId && !isDiscardedNewRecord) return;
  const source = runtime.editingItemId ? state.items?.[runtime.editingItemId] || { photos: [] } : { photos: [] };
  draftPhotosToCleanup(runtime.itemDialogPhotoDraft, source).forEach((photo) => {
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(runtime.editingItemId, photo);
    deleteCachedDraftPhotos(photo);
  });
}

async function updateItemDialogPhotoPreview(photos) {
  if (!refs.itemPhotoPreview) return;
  const renderToken = ++itemDialogPhotoPreviewRenderToken;
  const previousObjectUrls = runtime.itemDialogPhotoObjectUrls;
  const objectUrls = [];
  const list = Array.isArray(photos) ? photos : (photos ? [photos] : []);
  if (!list.length) {
    revokeObjectUrls(previousObjectUrls);
    runtime.itemDialogPhotoObjectUrls = [];
    itemDialogPhotoPreviewPhotoCount = 0;
    refs.itemPhotoPreview.innerHTML = "";
    refs.itemPhotoPreview.classList.add("empty");
    refs.itemPhotoRemoveBtn.hidden = true;
    if (refs.itemPhotoPrimaryBtn) refs.itemPhotoPrimaryBtn.hidden = true;
    if (refs.itemPhotoOrderBtn) refs.itemPhotoOrderBtn.hidden = true;
    setItemDialogPhotoStatus("");
    return;
  }
  const rendered = await renderPhotoGalleryHtml(list, {
    objectUrls,
    activeIndex: runtime.itemDialogPhotoActiveIndex,
    className: "dialog-photo-gallery"
  });
  if (renderToken !== itemDialogPhotoPreviewRenderToken) {
    revokeObjectUrls(objectUrls);
    return;
  }
  revokeObjectUrls(previousObjectUrls);
  runtime.itemDialogPhotoObjectUrls = objectUrls;
  itemDialogPhotoPreviewPhotoCount = list.length;
  refs.itemPhotoPreview.innerHTML = rendered;
  refs.itemPhotoPreview.classList.toggle("empty", !rendered);
  refs.itemPhotoRemoveBtn.hidden = false;
  updateItemDialogPhotoPrimaryButton(list.length);
  if (refs.itemPhotoOrderBtn) refs.itemPhotoOrderBtn.hidden = list.length < 2 || Boolean(runtime.sharedDialogCopyItemId);
  bindPhotoGalleries(refs.itemPhotoPreview, photoGalleryBindingOptions());
  setItemDialogPhotoStatus(photoDialogStatusText(list));
}

function updateItemDialogPhotoPrimaryButton(photoCount = null) {
  const source = runtime.itemDialogPhotoDraft || (runtime.editingItemId ? state.items[runtime.editingItemId] : null);
  const count = resolvePhotoPrimaryButtonPhotoCount({
    explicitCount: photoCount,
    sourceCount: source ? normalizeItemPhotos(source).length : null,
    previewCount: itemDialogPhotoPreviewPhotoCount,
    domCount: refs.itemPhotoPreview?.querySelectorAll(".photo-gallery-slide").length
  });
  updatePhotoPrimaryButton(refs.itemPhotoPrimaryBtn, runtime.itemDialogPhotoActiveIndex, count);
}

function setItemDialogPhotoStatus(message) {
  if (refs.itemPhotoStatus) refs.itemPhotoStatus.textContent = message || "";
}

function revokeObjectUrls(urls) {
  (Array.isArray(urls) ? urls : [urls]).filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
}

function deleteCachedDraftPhotos(photos = []) {
  (Array.isArray(photos) ? photos : [photos]).filter(Boolean).forEach((photo) => {
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
  });
}

function getRootContainerDialogPhotoSnapshot() {
  if (runtime.rootContainerDialogPhotoDraft) return itemPhotoSignature({ photos: runtime.rootContainerDialogPhotoDraft.photos });
  return runtime.editingRootContainerId ? itemPhotoSignature(state.containers[runtime.editingRootContainerId]) : "";
}

async function handleRootContainerPhotoInputChange(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    setRootContainerDialogPhotoStatus(localText("Preparing photos...", "Готовлю фото..."));
    const photos = [];
    for (const file of files) {
      photos.push(await createItemPhotoFromFile(file));
    }
    const limit = usageLimitForRole("photosPerRecord", canOpenAdminPublishedEdit());
    const source = runtime.editingRootContainerId ? state.containers[runtime.editingRootContainerId] : { photos: [] };
    const draft = runtime.rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
    const result = addPhotosToDraft(draft, photos, limit);
    runtime.rootContainerDialogPhotoDraft = result.draft;
    if (result.rejected.length) {
      deleteCachedDraftPhotos(result.rejected);
      showToast(usageLimitExceededMessage("photosPerRecord", limit), "warning");
    }
    runtime.rootContainerDialogPhotoActiveIndex = Math.max(0, runtime.rootContainerDialogPhotoDraft.photos.length - result.accepted.length);
    await updateRootContainerDialogPhotoPreview(runtime.rootContainerDialogPhotoDraft.photos);
    updateRootContainerDialogSaveState();
    uploadRootContainerDialogDraftPhotos(result.accepted).catch(() => null);
  } catch (error) {
    setRootContainerDialogPhotoStatus(error.message || localText("Could not prepare the photo.", "Не удалось подготовить фото."));
    showToast(error.message || localText("Could not prepare the photo.", "Не удалось подготовить фото."), "error");
  } finally {
    if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
    if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  }
}

async function removeRootContainerDialogPhoto() {
  const source = runtime.editingRootContainerId ? state.containers[runtime.editingRootContainerId] : { photos: [] };
  const draft = runtime.rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
  if (!draft.photos.length) return;
  const confirmed = await confirmDialogPhotoDelete("container");
  if (!confirmed) return;
  const result = removePhotoFromDraft(draft, runtime.rootContainerDialogPhotoActiveIndex, source);
  runtime.rootContainerDialogPhotoDraft = result.draft;
  runtime.rootContainerDialogPhotoActiveIndex = result.nextIndex;
  if (result.discardedPhoto) {
    deleteCachedDraftPhotos(result.discardedPhoto);
    if (result.discardedPhoto.url || result.discardedPhoto.thumbUrl) {
      deleteRemotePhotoIfPossible(runtime.editingRootContainerId, result.discardedPhoto, "container");
    }
  }
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  updateRootContainerDialogPhotoPreview(runtime.rootContainerDialogPhotoDraft.photos);
  updateRootContainerDialogSaveState();
}

function confirmDialogPhotoDelete(kind = "item") {
  const targetText = kind === "container"
    ? localText("this bag or place", "этой сумки или места")
    : localText("this item", "этой вещи");
  return askConfirmDialog({
    title: localText("Delete photo?", "Удалить фото?"),
    text: localText(`The photo will be removed from ${targetText} after you save the changes.`, `Фото будет удалено из ${targetText} после сохранения изменений.`),
    okText: localText("Delete photo", "Удалить фото"),
    cancelText: localText("Keep", "Оставить"),
    tone: "danger"
  });
}

async function uploadItemDialogDraftPhotos(photos = []) {
  const item = runtime.editingItemId ? state.items?.[runtime.editingItemId] : null;
  await uploadDialogDraftPhotos({
    entity: item,
    entityType: "item",
    photos,
    shouldUploadPhoto: (photo) => dialogDraftPhotoStillOwnedBy({
      draft: runtime.itemDialogPhotoDraft,
      entity: item,
      photo
    }),
    onPhotoProgress: () => {
      const list = runtime.itemDialogPhotoDraft?.photos || normalizeItemPhotos(item);
      updatePhotoGalleryUploadProgress(refs.itemPhotoPreview, list);
      setItemDialogPhotoStatus(photoDialogStatusText(list));
    },
    onAfterUpload: () => {
      const list = runtime.itemDialogPhotoDraft?.photos || normalizeItemPhotos(item);
      updatePhotoGalleryUploadProgress(refs.itemPhotoPreview, list);
      setItemDialogPhotoStatus(photoDialogStatusText(list));
      updateItemDialogSaveState();
    }
  });
}

async function uploadRootContainerDialogDraftPhotos(photos = []) {
  const container = runtime.editingRootContainerId ? state.containers?.[runtime.editingRootContainerId] : null;
  await uploadDialogDraftPhotos({
    entity: container,
    entityType: "container",
    photos,
    shouldUploadPhoto: (photo) => dialogDraftPhotoStillOwnedBy({
      draft: runtime.rootContainerDialogPhotoDraft,
      entity: container,
      photo
    }),
    onPhotoProgress: () => {
      const list = runtime.rootContainerDialogPhotoDraft?.photos || normalizeItemPhotos(container);
      updatePhotoGalleryUploadProgress(refs.rootContainerPhotoPreview, list);
      setRootContainerDialogPhotoStatus(photoDialogStatusText(list));
    },
    onAfterUpload: () => {
      const list = runtime.rootContainerDialogPhotoDraft?.photos || normalizeItemPhotos(container);
      updatePhotoGalleryUploadProgress(refs.rootContainerPhotoPreview, list);
      setRootContainerDialogPhotoStatus(photoDialogStatusText(list));
      updateRootContainerDialogSaveState();
    }
  });
}

async function uploadDialogDraftPhotos({
  entity = null,
  entityType = "item",
  photos = [],
  shouldUploadPhoto = () => true,
  onPhotoProgress = () => {},
  onAfterUpload = () => {}
} = {}) {
  const uploadPhotos = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  if (!entity?.id || !uploadPhotos.length || !runtime.currentUser || isForcedOffline()) return false;
  const publishedLayoutId = getPublishedEditLayoutId();
  const usePublishedTemplateUpload = currentViewScope() === VIEW_SCOPE_ADMIN_PUBLIC_EDIT &&
    isAdminEditablePublishedLayout(publishedLayoutId);
  if (!usePublishedTemplateUpload && isReadOnlyBikePackingContext()) return false;
  const slotAvailable = await waitForDialogPhotoUploadSlot({
    shouldContinue: () => uploadPhotos.some((photo) => shouldUploadPhoto(photo) && !photoRemoteSrc(photo))
  });
  if (!slotAvailable) return false;
  let uploaded = false;
  try {
    if (usePublishedTemplateUpload) {
      for (const photo of uploadPhotos) {
        if (!shouldUploadPhoto(photo) || photoRemoteSrc(photo)) continue;
        markPhotoUploadStarted(photo);
        onPhotoProgress(photo, photo.uploadProgress || 0);
        uploaded = await uploadPublishedEntityPhoto(publishedLayoutId, entity, photo, entityType, {
          onPhotoProgress,
          retryTemporaryUploadFailure: false
        }) || uploaded;
      }
    } else {
      const targetListId = await ensureCurrentPackingListId();
      if (!currentPackingListMeta && targetListId) await fetchRemoteListDetailRecord(targetListId).catch(() => null);
      if (isReadOnlyBikePackingContext()) return false;
      for (const photo of uploadPhotos) {
        if (!shouldUploadPhoto(photo) || photoRemoteSrc(photo)) continue;
        markPhotoUploadStarted(photo);
        onPhotoProgress(photo, photo.uploadProgress || 0);
        uploaded = await uploadEntityPhoto(targetListId, entity, photo, entityType, {
          onPhotoProgress,
          retryTemporaryUploadFailure: false
        }) || uploaded;
      }
    }
  } finally {
    runtime.photoUploadInFlight = false;
    onAfterUpload();
  }
  if (uploaded && uploadPhotos.some((photo) => entityHasPhoto(entity, photo))) saveState();
  return true;
}

async function waitForDialogPhotoUploadSlot({
  shouldContinue = () => true,
  maxWaitMs = 120000,
  delayMs = 250
} = {}) {
  return acquirePhotoUploadSlot({
    isBusy: () => runtime.photoUploadInFlight,
    setBusy: (value) => { runtime.photoUploadInFlight = value; },
    shouldContinue: () => Boolean(runtime.currentUser) && !isForcedOffline() && shouldContinue(),
    maxWaitMs,
    delayMs,
    setTimeoutImpl: window.setTimeout.bind(window)
  });
}

function dialogDraftPhotoStillOwnedBy({ draft = null, entity = null, photo = null } = {}) {
  if (!photo) return false;
  if (draft && photoIdentityMatches(photoIdentitySet(draft.photos), photo)) return true;
  return entityHasPhoto(entity, photo);
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
  if (refs.rootContainerPhotoPrimaryBtn?.disabled) return;
  const source = runtime.editingRootContainerId ? state.containers[runtime.editingRootContainerId] : { photos: [] };
  const draft = runtime.rootContainerDialogPhotoDraft || createPhotoDraftFromRecord(source);
  const result = setPrimaryPhotoInDraft(draft, runtime.rootContainerDialogPhotoActiveIndex);
  runtime.rootContainerDialogPhotoDraft = result.draft;
  runtime.rootContainerDialogPhotoActiveIndex = result.nextIndex;
  updateRootContainerDialogPhotoPreview(runtime.rootContainerDialogPhotoDraft.photos);
  if (result.changed) updateRootContainerDialogSaveState();
}

function resetRootContainerDialogPhotoDraft() {
  cleanupUnsavedRootContainerDialogPhotoDraft();
  runtime.rootContainerDialogPhotoDraft = null;
  revokeObjectUrls(runtime.rootContainerDialogPhotoObjectUrls);
  runtime.rootContainerDialogPhotoObjectUrls = [];
  runtime.rootContainerDialogPhotoActiveIndex = 0;
  if (refs.rootContainerPhotoInput) refs.rootContainerPhotoInput.value = "";
  if (refs.rootContainerPhotoCameraInput) refs.rootContainerPhotoCameraInput.value = "";
  updateRootContainerDialogPhotoPreview([]);
}

function cleanupUnsavedRootContainerDialogPhotoDraft() {
  if (!runtime.rootContainerDialogPhotoDraft) return;
  const isDiscardedNewRecord = !runtime.editingRootContainerId && refs.rootContainerDialog?.returnValue === "cancel";
  if (!runtime.editingRootContainerId && !isDiscardedNewRecord) return;
  const source = runtime.editingRootContainerId ? state.containers?.[runtime.editingRootContainerId] || { photos: [] } : { photos: [] };
  draftPhotosToCleanup(runtime.rootContainerDialogPhotoDraft, source).forEach((photo) => {
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(runtime.editingRootContainerId, photo, "container");
    deleteCachedDraftPhotos(photo);
  });
}

async function updateRootContainerDialogPhotoPreview(photos) {
  if (!refs.rootContainerPhotoPreview) return;
  const renderToken = ++rootContainerDialogPhotoPreviewRenderToken;
  const previousObjectUrls = runtime.rootContainerDialogPhotoObjectUrls;
  const objectUrls = [];
  const list = Array.isArray(photos) ? photos : (photos ? [photos] : []);
  if (!list.length) {
    revokeObjectUrls(previousObjectUrls);
    runtime.rootContainerDialogPhotoObjectUrls = [];
    rootContainerDialogPhotoPreviewPhotoCount = 0;
    refs.rootContainerPhotoPreview.innerHTML = "";
    refs.rootContainerPhotoPreview.classList.add("empty");
    refs.rootContainerPhotoRemoveBtn.hidden = true;
    if (refs.rootContainerPhotoPrimaryBtn) refs.rootContainerPhotoPrimaryBtn.hidden = true;
    if (refs.rootContainerPhotoOrderBtn) refs.rootContainerPhotoOrderBtn.hidden = true;
    setRootContainerDialogPhotoStatus("");
    return;
  }
  const rendered = await renderPhotoGalleryHtml(list, {
    objectUrls,
    activeIndex: runtime.rootContainerDialogPhotoActiveIndex,
    className: "dialog-photo-gallery"
  });
  if (renderToken !== rootContainerDialogPhotoPreviewRenderToken) {
    revokeObjectUrls(objectUrls);
    return;
  }
  revokeObjectUrls(previousObjectUrls);
  runtime.rootContainerDialogPhotoObjectUrls = objectUrls;
  rootContainerDialogPhotoPreviewPhotoCount = list.length;
  refs.rootContainerPhotoPreview.innerHTML = rendered;
  refs.rootContainerPhotoPreview.classList.toggle("empty", !rendered);
  refs.rootContainerPhotoRemoveBtn.hidden = false;
  updateRootContainerDialogPhotoPrimaryButton(list.length);
  if (refs.rootContainerPhotoOrderBtn) refs.rootContainerPhotoOrderBtn.hidden = list.length < 2;
  bindPhotoGalleries(refs.rootContainerPhotoPreview, photoGalleryBindingOptions());
  setRootContainerDialogPhotoStatus(photoDialogStatusText(list));
}

function updateRootContainerDialogPhotoPrimaryButton(photoCount = null) {
  const source = runtime.rootContainerDialogPhotoDraft || (runtime.editingRootContainerId ? state.containers[runtime.editingRootContainerId] : null);
  const count = resolvePhotoPrimaryButtonPhotoCount({
    explicitCount: photoCount,
    sourceCount: source ? normalizeItemPhotos(source).length : null,
    previewCount: rootContainerDialogPhotoPreviewPhotoCount,
    domCount: refs.rootContainerPhotoPreview?.querySelectorAll(".photo-gallery-slide").length
  });
  updatePhotoPrimaryButton(refs.rootContainerPhotoPrimaryBtn, runtime.rootContainerDialogPhotoActiveIndex, count);
}

function updatePhotoPrimaryButton(button, activeIndex = 0, photoCount = 0) {
  applyPhotoPrimaryButtonState(button, photoPrimaryButtonState({
    activeIndex,
    photoCount,
    primaryText: t("buttons.primaryPhoto"),
    alreadyPrimaryText: t("buttons.primaryPhotoDone"),
    forceDisabled: Boolean(runtime.sharedDialogCopyItemId && button === refs.itemPhotoPrimaryBtn)
  }));
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
    categories: getRootContainerDialogSelectedCategories().join("\u0000"),
    nestable: Boolean(refs.rootContainerNestable?.checked),
    note: refs.rootContainerNote.value.trim(),
    photo: getRootContainerDialogPhotoSnapshot(),
    parentId: runtime.editingRootContainerId && (
      runtime.rootContainerDialogPendingParentId !== undefined || state.containers[runtime.editingRootContainerId]?.parentId
    )
      ? getRootContainerDialogParentId()
      : "",
    parentIndex: runtime.editingRootContainerId && (
      runtime.rootContainerDialogPendingParentId !== undefined || state.containers[runtime.editingRootContainerId]?.parentId
    )
      ? getRootContainerDialogParentIndex()
      : "",
    layoutRootIds: runtime.editingRootContainerId && !state.containers[runtime.editingRootContainerId]?.parentId && runtime.rootContainerDialogPendingParentId === undefined
      ? getRootContainerDialogLayoutRootIds().join("\u0000")
      : ""
  };
}

function updateItemDialogSaveState() {
  if (!refs.saveItemBtn) return;
  const snapshot = getItemDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !runtime.itemDialogInitialSnapshot || !snapshotsEqual(snapshot, runtime.itemDialogInitialSnapshot);
  updateModalSaveButton(refs.saveItemBtn, { hasName, changed });
}

function hasSavableItemDialogChanges() {
  if (refs.saveItemBtn?.hidden) return false;
  updateItemDialogSaveState();
  return dialogHasSavableChanges({ dialog: refs.dialog, saveButton: refs.saveItemBtn });
}

function updateRootContainerDialogSaveState() {
  if (!refs.saveRootContainerBtn) return;
  const snapshot = getRootContainerDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !runtime.rootContainerDialogInitialSnapshot || !snapshotsEqual(snapshot, runtime.rootContainerDialogInitialSnapshot);
  updateModalSaveButton(refs.saveRootContainerBtn, { hasName, changed });
}

function updateModalSaveButton(button, { hasName, changed }) {
  button.disabled = !hasName || !changed;
  button.classList.toggle("muted-save", button.disabled);
  if (!changed) {
    button.textContent = t("buttons.noChanges");
    button.title = t("buttons.noChangesTitle");
    button.setAttribute("aria-label", t("buttons.noChangesTitle"));
    return;
  }
  if (!hasName) {
    button.textContent = t("buttons.enterName");
    button.title = t("buttons.enterNameTitle");
    button.setAttribute("aria-label", t("buttons.enterNameTitle"));
    return;
  }
  button.textContent = t("buttons.save");
  button.removeAttribute("title");
  button.removeAttribute("aria-label");
}

function hasSavableRootContainerDialogChanges() {
  if (refs.saveRootContainerBtn?.hidden) return false;
  updateRootContainerDialogSaveState();
  return dialogHasSavableChanges({ dialog: refs.rootContainerDialog, saveButton: refs.saveRootContainerBtn });
}

async function shareEditedEntityByLink({ entityId, entityType, layoutId, name, saveDialog }) {
  if (!currentUserId()) {
    showToast(t("shareEntity.signIn"), "error");
    handleAuthButton();
    return;
  }
  if (isPublicLayoutContext()) {
    showToast(t("shareEntity.privateOnly"), "error");
    return;
  }
  const canUseLayout = sharedEntityBelongsToLayout(state, { entityId, entityType, layoutId });
  const authorLabel = currentUserEmail();
  let publishOptions = { mode: "live", scope: "entity", includeAuthor: false };
  const entityOnlyLabel = entityType === "item"
    ? t("shareEntity.entityOnlyItem")
    : t("shareEntity.entityOnlyContainer");
  const confirmed = await askConfirmDialog({
    title: entityType === "item" ? t("shareEntity.itemTitle") : t("shareEntity.containerTitle"),
    text: t("shareEntity.chooseOptions"),
    highlightHtml: sharedEntityPublishDialogHtml({
      authorLabel,
      canUseLayout,
      labels: {
        live: t("shareEntity.live"),
        liveDescription: t("shareEntity.liveDescription"),
        snapshot: t("shareEntity.snapshot"),
        snapshotDescription: t("shareEntity.snapshotDescription"),
        entityOnly: entityOnlyLabel,
        entityOnlyDescription: t("shareEntity.entityOnlyDescription"),
        inLayout: t("shareEntity.inLayout"),
        inLayoutDescription: t("shareEntity.inLayoutDescription"),
        inLayoutUnavailable: t("shareEntity.inLayoutUnavailable"),
        showAuthor: t("shareEntity.showAuthor")
      }
    }),
    okText: t("shareEntity.create"),
    hideCancel: true,
    keepOpenOnOk: true,
    onOk: () => { publishOptions = readSharedEntityPublishOptions(refs.confirmDialog); }
  });
  if (!confirmed) return;

  try {
    saveDialog();
    updateSyncUi(t("shareEntity.preparing"));
    await flushActivePublishedEditSave();
    const uploadedPhotos = await uploadPendingPhotos({ markDirty: true });
    if (uploadedPhotos) {
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
    }
    if (syncMeta.dirty) await saveRemoteState({ notify: false });
    const listId = await ensureCurrentPackingListId();
    const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/entity-links`, {
      method: "POST",
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      body: JSON.stringify({
        mode: publishOptions.mode,
        scope: publishOptions.scope,
        entityType,
        entityId,
        layoutId,
        includeAuthor: publishOptions.includeAuthor,
        authorName: publishOptions.includeAuthor ? authorLabel : "",
        title: name || ""
      })
    });
    const sharedListId = data?.entityLink?.id || data?.list?.id || "";
    if (!sharedListId) throw new Error("Entity link id is missing");
    const link = buildSharedEntityUrlFromHref(location.href, {
      listParam: SHARED_LIST_QUERY_PARAM,
      layoutParam: SHARED_LAYOUT_QUERY_PARAM,
      listId: sharedListId,
      layoutId: publishOptions.scope === "layout" ? layoutId : "",
      entityType,
      entityId
    });
    refs.confirmTitle.textContent = t("shareEntity.linkTitle");
    refs.confirmText.innerHTML = sharedEntityLinkResultHtml(link, {
      ready: t("shareEntity.ready"),
      hint: t("shareEntity.publicHint"),
      ariaLabel: t("shareEntity.linkAria")
    });
    refs.confirmOkBtn.textContent = t("shareEntity.copy");
    refs.confirmOkBtn.disabled = false;
    refs.confirmOkBtn.onclick = async (event) => {
      event.preventDefault();
      await copySharedListLink(link);
      showToast(t("shareEntity.copied"), "success");
    };
    refs.confirmText.querySelector("input")?.select();
    updateSyncUi(t("shareEntity.created"));
  } catch (error) {
    if (refs.confirmDialog.open) refs.confirmDialog.close("close");
    const message = t("shareEntity.failed", { message: error.message });
    updateSyncUi(message);
    showToast(message, "error");
  }
}

function shareEditingItemByLink() {
  const entityId = String(runtime.editingItemId || "");
  const item = state.items?.[entityId];
  if (!item) return;
  return shareEditedEntityByLink({
    entityId,
    entityType: "item",
    layoutId: runtime.itemDialogTargetLayoutId || getPublishedEditLayoutId(),
    name: refs.itemName?.value || item.name,
    saveDialog: () => saveDialogItem()
  });
}

function shareEditingContainerByLink() {
  const entityId = String(runtime.editingRootContainerId || "");
  const container = state.containers?.[entityId];
  if (!container) return;
  return shareEditedEntityByLink({
    entityId,
    entityType: "container",
    layoutId: getPublishedEditLayoutId(),
    name: refs.rootContainerName?.value || container.name,
    saveDialog: () => saveRootContainerDialog()
  });
}

function saveRootContainerDialog(event) {
  event?.preventDefault();
  if (warnLockedRootContainerDialogPlacementChange()) return;
  const shouldPlaceInCurrentLayout = placeNewRootInCurrentLayout;
  const placementTargetLayoutId = rootContainerPlacementTargetLayoutId;
  const returningToCopyPicker = Boolean(pendingCopyTargetContainerSetup);
  let createdRootPlaced = false;
  const result = saveRootContainerDialogAction({
    applyRootContainerDialogParent,
    applyRootContainerDialogPhotoDraft,
    applyRootContainerDialogPlacement,
    applyRootContainerDimensions,
    changedAt: nowIso(),
    closeDialogWithoutRestoringFocus,
    currentCreateMeta,
    defaultRootContainerLocation,
    editingRootContainerId: runtime.editingRootContainerId,
    getRootContainerSelectedCategories: getRootContainerDialogSelectedCategories,
    getPublishedEditLayoutId,
    hasContainerDimensions,
    markRecordActivePublicCatalog,
    normalizeContainerColor,
    parseVolumeInput,
    parseWeightInput,
    placeCreatedRootContainer: (containerId) => {
      if (!shouldPlaceInCurrentLayout) return false;
      const layoutId = state.layouts?.[placementTargetLayoutId]
        ? placementTargetLayoutId
        : getPublishedEditLayoutId();
      if (warnLockedLayoutMutation(layoutId)) return false;
      createdRootPlaced = addRootContainerToLayoutInState(state, layoutId, containerId, null, {
        markRecordActivePublicCatalog,
        touchLayout
      });
      if (createdRootPlaced && layoutId === state.activeLayoutId) applyLayoutArrangement(layoutId);
      if (createdRootPlaced) markRecentlyAddedContainer(containerId, layoutId);
      if (createdRootPlaced && layoutId !== getPublishedEditLayoutId()) {
        saveLayoutMutation(layoutId, { publishDelay: 500 });
      }
      return createdRootPlaced;
    },
    readRootContainerDialogDimensions,
    refs,
    render,
    requireUsageCapacity,
    restoreAdminPublishedLayoutContext,
    rootContainerDialogPhotoDraft: runtime.rootContainerDialogPhotoDraft,
    saveLayoutMutation,
    state,
    touchContainer
  });
  if (result) {
    placeNewRootInCurrentLayout = false;
    rootContainerPlacementTargetLayoutId = "";
  }
  if (result?.created && createdRootPlaced && !returningToCopyPicker) {
    result.dialogCloseSettled?.then?.(() => focusRecentlyAddedContainer(result.id));
  } else if (result?.created && !returningToCopyPicker && getCurrentView() === "bags") {
    focusCreatedCatalogCard({
      after: result.dialogCloseSettled,
      recordId: result.id,
      root: refs.bagsView,
      type: "container"
    });
  }
}

function saveDialogItem(event) {
  event?.preventDefault();
  if (warnLockedItemDialogPlacementChange()) return;
  capturePackingScroll();
  const result = saveItemDialogAction({
    applyItemAvailabilityStatus,
    applyItemDimensions,
    applyItemDialogPhotoDraft,
    applyLayoutArrangement,
    changedAt: nowIso(),
    cleanupEmptyContainersInLayoutArrangement: (layout, containerId) =>
      cleanupEmptyContainersInLayoutArrangement(layout, containerId, state),
    closeDialogWithoutRestoringFocus,
    currentEditMeta,
    editingItemId: runtime.editingItemId,
    getDialogSelectedCategories,
    getItemContainerIdInLayout,
    getPublishedEditLayoutId,
    hasItemDimensions: hasContainerDimensions,
    itemDialogPhotoDraft: runtime.itemDialogPhotoDraft,
    itemDialogTargetLayoutId: runtime.itemDialogTargetLayoutId,
    markRecordActivePublicCatalog,
    normalizeItemColor: normalizeContainerColor,
    normalizeItemAvailabilityStatus,
    parseWeightInput,
    placeExistingItemInLayout,
    placementFailedText: localText("Could not add the item to this layout.", "Не удалось добавить вещь в эту укладку."),
    readItemDialogDimensions,
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
    touchLayout,
    unavailablePlacementText: t("items.unavailableCannotAdd")
  });
  if (result?.created && getCurrentView() === "items") {
    focusCreatedCatalogCard({
      after: result.dialogCloseSettled,
      recordId: result.id,
      root: refs.itemsView,
      type: "item"
    });
  } else if (result?.created && getCurrentView() === "packing") {
    markRecentlyAddedItem(result.id, runtime.itemDialogTargetLayoutId);
    result.dialogCloseSettled?.then?.(() => focusRecentlyAddedItem(result.id));
  }
}

function applyItemDialogPhotoDraft(item, changedAt = nowIso()) {
  if (!runtime.itemDialogPhotoDraft || !photoDraftChanged(runtime.itemDialogPhotoDraft, item)) return;
  item.photos = [...runtime.itemDialogPhotoDraft.photos];
  runtime.itemDialogPhotoDraft.deletedPhotos.forEach((photo) => {
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(item.id, photo);
  });
  markEdited(item, changedAt);
}

function applyRootContainerDialogPhotoDraft(container, changedAt = nowIso()) {
  if (!runtime.rootContainerDialogPhotoDraft || !photoDraftChanged(runtime.rootContainerDialogPhotoDraft, container)) return;
  container.photos = [...runtime.rootContainerDialogPhotoDraft.photos];
  runtime.rootContainerDialogPhotoDraft.deletedPhotos.forEach((photo) => {
    if (photo?.localId || photo?.id) deleteCachedPhoto(photo.localId || photo.id);
    if (photo?.url || photo?.thumbUrl) deleteRemotePhotoIfPossible(container.id, photo, "container");
  });
  markEdited(container, changedAt);
}

function applyRootContainerDialogParent(changedAt = nowIso()) {
  if (runtime.rootContainerDialogPendingParentId === undefined || !runtime.editingRootContainerId) return false;
  const layoutId = getPublishedEditLayoutId();
  if (warnLockedLayoutMutation(layoutId)) return false;
  const layout = state.layouts?.[layoutId];
  const container = state.containers[runtime.editingRootContainerId];
  const targetParent = state.containers[runtime.rootContainerDialogPendingParentId];
  if (!layout || !container || !targetParent) return false;
  let placement = layout.arrangement?.containers?.[runtime.editingRootContainerId];
  if (!placement) {
    if (!addRootContainerToLayoutInState(state, layoutId, container.id, null, {
      changedAt,
      markRecordActivePublicCatalog,
      touchLayout
    })) return false;
    placement = layout.arrangement?.containers?.[container.id];
  }
  if (!placement) return false;
  if (container.id === targetParent.id) return false;
  const requestedIndex = runtime.rootContainerDialogPendingParentIndex;
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
    itemSortMode: runtime.itemSortMode,
    itemUsageFilter: runtime.itemUsageFilter,
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

function markRecordActivePublicCatalog(record, layoutId = getPublishedEditLayoutId()) {
  if (!record || !isScopedCatalogLayout(layoutId)) return;
  record.publicCatalogLayoutId = layoutId;
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
    categories: runtime.selectedCategoryFilters,
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
    isRootContainerInActiveLayout: (containerId) => getLayoutContainerIdSet(getPublishedWorkLayout()).has(containerId),
    matchesRootContainerFieldsFilter,
    rootContainerSortMode: runtime.rootContainerSortMode,
    rootContainerUsageFilter: runtime.rootContainerUsageFilter
  });
}

function matchesRootContainerFieldsFilter(container, { ignoreLocation = false } = {}) {
  return matchesContainerFieldsFilter(container, { ignoreLocation });
}

function matchesContainerFieldsFilter(container, { ignoreLocation = false, ignoreCategories = false } = {}) {
  const containerLocation = container.location || defaultRootContainerLocation(state);
  return matchesRootContainerFieldsFilterValue(container, {
    query: refs.searchInput.value,
    location: refs.locationFilter.value,
    categories: runtime.selectedCategoryFilters,
    containerLocation,
    containerCategories,
    ignoreCategories,
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

function itemQuantity(item) {
  return itemQuantityForState(item);
}

function itemTotalWeight(item) {
  return itemTotalWeightForState(item);
}

function openBackupDialog() {
  runtime.backupImportState = null;
  if (refs.backupFileInput) refs.backupFileInput.value = "";
  renderBackupRules(refs.backupRules, { t });
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
  if (!response.ok) throw new Error(localText(`Photo ${photo.id || ""}: HTTP ${response.status}`, `Фото ${photo.id || ""}: HTTP ${response.status}`));
  return await response.blob();
}

function buildCurrentBackupManifest(snapshot, photos) {
  return buildCurrentBackupManifestValue({
    appVersion: APP_VERSION,
    canIncludeAdmin: canOpenAdminPublishedEdit(),
    cloneValue: clone,
    currentDemoTemplates: () => runtime.serverConfirmedDemoTemplates,
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
  if (refs.backupCreateBtn) refs.backupCreateBtn.disabled = true;
  try {
    renderBackupProgress(refs.backupStatus, { percent: 2, title: localText("Preparing data", "Подготавливаю данные"), detail: localText("Step 1 of 4", "Шаг 1 из 4") });
    if (canOpenAdminPublishedEdit()) await refreshPublicSharedTemplates().catch(() => null);
    renderBackupProgress(refs.backupStatus, { percent: 8, title: localText("Template catalog updated", "Каталог шаблонов обновлён"), detail: localText("Step 1 of 4", "Шаг 1 из 4") });
    captureActiveLayoutArrangement();
    const snapshot = clone(state);
    const adminPhotoSnapshots = canOpenAdminPublishedEdit()
      ? adminBackupPayloads({
        currentDemoTemplates: () => runtime.serverConfirmedDemoTemplates,
        currentSharedLayouts,
        demoStatePayloadForLanguage,
        languages: SUPPORTED_LANGUAGES
      })
      : [];
    const personalLayoutCount = buildBackupLayoutRows(snapshot, { layouts: {} }).length;
    const adminTemplateCount = canOpenAdminPublishedEdit()
      ? runtime.serverConfirmedDemoTemplates.length + SUPPORTED_LANGUAGES.reduce((sum, language) => sum + currentSharedLayouts(language).length, 0)
      : 0;
    renderBackupProgress(refs.backupStatus, {
      percent: 15,
      title: localText("Layouts and templates prepared", "Укладки и шаблоны подготовлены"),
      detail: localText(`Step 2 of 4 · Layouts: ${personalLayoutCount} of ${personalLayoutCount}; templates: ${adminTemplateCount} of ${adminTemplateCount}`, `Шаг 2 из 4 · Укладки: ${personalLayoutCount} из ${personalLayoutCount}; шаблоны: ${adminTemplateCount} из ${adminTemplateCount}`)
    });
    const { entries: photoEntries, photos, missing } = await buildBackupPhotoEntries(snapshot, {
      extraSnapshots: adminPhotoSnapshots,
      normalizePhotos: normalizeItemPhotos,
      fetchPhotoBlob: fetchBackupPhotoBlob,
      onProgress: ({ current, total, missing: missingCount }) => {
        const fraction = total ? current / total : 1;
        renderBackupProgress(refs.backupStatus, {
          percent: 15 + fraction * 65,
          title: localText("Copying photos", "Копирую фотографии"),
          detail: localText(`Step 3 of 4 · Photos: ${current} of ${total}; unavailable: ${missingCount}`, `Шаг 3 из 4 · Фото: ${current} из ${total}; недоступно: ${missingCount}`)
        });
      }
    });
    const manifest = buildCurrentBackupManifest(snapshot, photos);
    const zip = await createBackupZip(manifest, photoEntries, {
      onProgress: ({ current, total }) => {
        const fraction = total ? current / total : 1;
        renderBackupProgress(refs.backupStatus, {
          percent: 80 + fraction * 19,
          title: localText("Packing archive", "Упаковываю архив"),
          detail: localText(`Step 4 of 4 · ZIP files: ${current} of ${total}`, `Шаг 4 из 4 · Файлы ZIP: ${current} из ${total}`)
        });
      }
    });
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupDownloadName();
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatus(
      missing.length
        ? localText(`Archive created, but ${missing.length} photos could not be retrieved. Check old or unavailable photos.`, `Архив создан, но ${missing.length} фото не удалось подтянуть. Проверьте старые/недоступные фото.`)
        : localText(`Archive created: ${Object.keys(snapshot.layouts || {}).length} layouts, ${photos.length} photos.`, `Архив создан: ${Object.keys(snapshot.layouts || {}).length} укладок, ${photos.length} фото.`),
      missing.length ? "error" : "success"
    );
  } catch (error) {
    setBackupStatus(localText(`Could not create archive: ${error.message}`, `Не удалось создать архив: ${error.message}`), "error");
  } finally {
    if (refs.backupCreateBtn) refs.backupCreateBtn.disabled = false;
  }
}

async function handleBackupFileSelected(event) {
  const nextImportState = await readBackupImportFile(event, {
    localText,
    normalizeRemoteState,
    readBackupArchiveFile,
    refs,
    resetBackupImportUi,
    setBackupStatus
  });
  if (nextImportState === undefined) return;
  runtime.backupImportState = nextImportState;
  if (runtime.backupImportState) renderBackupAnalysis();
}
function backupLayoutRows() {
  return runtime.backupImportState ? buildBackupLayoutRows(runtime.backupImportState.state, state) : [];
}

function selectedBackupLayoutIds() {
  return selectedBackupLayoutIdsFromUi(refs.backupAnalysis);
}

function selectedBackupRestoreMode() {
  return selectedBackupRestoreModeFromUi(refs.backupAnalysis);
}

function summarizeSelectedBackupLayouts(layoutIds = new Set(), restoreMode = "replace") {
  if (!runtime.backupImportState) return { replace: 0, create: 0, unchanged: 0, matchesCurrentState: false, newItems: [], newContainers: [], newPhotos: [], photos: [] };
  return summarizeBackupLayouts({
    backupState: runtime.backupImportState.state,
    currentState: state,
    photoFiles: runtime.backupImportState.photoFiles,
    layoutIds,
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    normalizePhotos: normalizeItemPhotos,
    restoreMode
  });
}

function renderBackupAnalysis() {
  if (!runtime.backupImportState || !refs.backupAnalysis) return;
  const rows = backupLayoutRows();
  const adminTemplateRows = canOpenAdminPublishedEdit()
    ? backupAdminTemplateRows(runtime.backupImportState.manifest, { demoPublicListIdForLanguage })
    : [];
  runtime.backupImportState.selectedLayoutIds = new Set(rows.map((row) => row.layout.id));
  runtime.backupImportState.adminTemplateRows = adminTemplateRows;
  renderBackupAnalysisUi(refs, {
    adminTemplateRows,
    backupState: runtime.backupImportState.state,
    language: uiLanguage,
    rows,
    photoCount: runtime.backupImportState.photoFiles.size
  });
  setBackupStatus(
    localText(
      `Archive loaded: ${rows.length} personal layouts, ${adminTemplateRows.length} public templates, ${runtime.backupImportState.photoFiles.size} photos.`,
      `Архив прочитан: ${rows.length} личных укладок, ${adminTemplateRows.length} public-шаблонов, ${runtime.backupImportState.photoFiles.size} фото.`
    ),
    "success"
  );
  updateBackupSelectionSummary();
}

function handleBackupSelectionChange(event) {
  if (event.target.closest("[data-backup-admin-template-key]")) {
    updateBackupAdminSelection();
    return;
  }
  if (event.target.closest("[data-backup-layout-id], [data-backup-restore-mode]")) updateBackupSelectionSummary();
}

function updateBackupAdminSelection() {
  if (!refs.backupRestoreAdminBtn) return;
  refs.backupRestoreAdminBtn.disabled = selectedBackupAdminTemplateKeys(refs.backupAnalysis).size === 0;
}

function updateBackupSelectionSummary() {
  if (!runtime.backupImportState) return;
  runtime.backupImportState.selectedLayoutIds = selectedBackupLayoutIds();
  const restoreMode = selectedBackupRestoreMode();
  applyBackupRestoreModeUi(refs.backupAnalysis, restoreMode);
  const summary = summarizeSelectedBackupLayouts(runtime.backupImportState.selectedLayoutIds, restoreMode);
  renderBackupSelectionSummary(refs, {
    language: uiLanguage,
    restoreMode,
    selectedCount: runtime.backupImportState.selectedLayoutIds.size,
    summary
  });
}

async function resolveExistingBackupPhotos(photoFiles) {
  return resolveExistingBackupPhotosValue(photoFiles, {
    apiFetch,
    currentUser: runtime.currentUser,
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
    photoFiles: runtime.backupImportState?.photoFiles,
    photoIds,
    putCachedPhoto,
    resolveExistingPhotos: resolveExistingBackupPhotos
  });
}

async function restoreSelectedBackupLayouts() {
  await restoreSelectedBackupLayoutsFlow({
    askConfirmDialog,
    backupImportState: runtime.backupImportState,
    backupLayoutRows,
    cloneValue: clone,
    getLayoutContainerIdSet: getLayoutContainerIdSetForState,
    getLayoutItemIdSet: getLayoutItemIdSetForState,
    localText,
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
    selectedBackupRestoreMode,
    selectedBackupRestoreConfirm: (summary, options) => selectedBackupRestoreConfirm(summary, { ...options, language: uiLanguage }),
    setBackupStatus,
    showToast,
    state,
    summarizeSelectedBackupLayouts,
    uploadPendingPhotos,
    uniqueLayoutId: () => `layout-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
  });
}

async function restoreSelectedBackupAdminTemplates() {
  if (!runtime.backupImportState || !canOpenAdminPublishedEdit()) return;
  const selectedKeys = selectedBackupAdminTemplateKeys(refs.backupAnalysis);
  if (!selectedKeys.size) return;
  const rows = runtime.backupImportState.adminTemplateRows || [];
  const confirmed = await askConfirmDialog({
    title: localText("Restore selected public templates?", "Восстановить выбранные public-шаблоны?"),
    text: localText("Published versions of the selected demo/shared templates will be replaced by archived versions. Other languages and templates remain unchanged.", "Текущие опубликованные версии выбранных demo/shared-шаблонов будут заменены версиями из архива. Остальные языки и шаблоны не изменятся."),
    highlightText: localText(`Templates to restore: ${selectedKeys.size}.`, `Будет восстановлено шаблонов: ${selectedKeys.size}.`),
    okText: localText("Restore templates", "Восстановить шаблоны"),
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    setBackupStatus(localText("Restoring demo/shared templates...", "Восстанавливаю demo/shared-шаблоны..."));
    const restored = await restoreBackupAdminTemplates({
      apiFetch,
      apiUploadFormData,
      demoAdminPathForPublicListId,
      demoAdminStatePathForPublicListId,
      getCachedPhoto,
      localText,
      normalizePhotos: normalizeItemPhotos,
      onProgress: ({
        itemPercent = 0,
        photosCompleted = 0,
        stage,
        templateName = "",
        templatesCompleted = 0,
        totalPhotos = 0,
        totalTemplates = 0
      }) => {
        const totalWork = Math.max(1, totalTemplates + totalPhotos);
        const activePhotoFraction = stage === "photos" ? Math.max(0, Math.min(1, Number(itemPercent) / 100)) : 0;
        const completedWork = templatesCompleted + photosCompleted + activePhotoFraction;
        renderBackupProgress(refs.backupStatus, {
          percent: 5 + (completedWork / totalWork) * 94,
          title: stage === "photos" ? localText("Restoring template photos", "Восстанавливаю фотографии шаблонов") : localText("Restoring public templates", "Восстанавливаю public-шаблоны"),
          detail: localText(`Templates: ${templatesCompleted} of ${totalTemplates}; photos: ${photosCompleted} of ${totalPhotos}${templateName ? ` · ${templateName}` : ""}`, `Шаблоны: ${templatesCompleted} из ${totalTemplates}; фото: ${photosCompleted} из ${totalPhotos}${templateName ? ` · ${templateName}` : ""}`)
        });
      },
      photoFiles: runtime.backupImportState.photoFiles,
      publicListIdForPublishedTarget,
      putCachedPhoto,
      rows,
      selectedKeys,
      timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
      uploadPhotoToPath,
      withoutPhotoReferences
    });
    await refreshPublicSharedTemplates({ renderAfter: true }).catch(() => null);
    const uploaded = restored.reduce((sum, entry) => sum + Number(entry.uploaded || 0), 0);
    setBackupStatus(localText(`Public templates restored: ${restored.length}; photos: ${uploaded}.`, `Восстановлено public-шаблонов: ${restored.length}; фото: ${uploaded}.`), "success");
    showToast(localText(`Public templates restored: ${restored.length}.`, `Восстановлено public-шаблонов: ${restored.length}.`), "success");
  } catch (error) {
    setBackupStatus(localText(`Could not restore public templates: ${error.message}`, `Не удалось восстановить public-шаблоны: ${error.message}`), "error");
  }
}
async function restoreFullBackup() {
  await restoreFullBackupFlow({
    askConfirmDialog,
    backupImportState: runtime.backupImportState,
    fullBackupRestoreConfirm: (stats) => fullBackupRestoreConfirm(stats, { language: uiLanguage }),
    localText,
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
  const printChoice = await buildPrintableHtmlFromChoice();
  if (!printChoice) return;
  const { html, printTarget } = printChoice;
  printHtmlDocument(html, { printTarget });
}

async function buildPrintableHtmlFromChoice() {
  const layout = state.layouts[state.activeLayoutId];
  const { cancelled, includeLabels, printTarget } = await askPrintLabelsChoice(askConfirmDialog, {
    createPrintTarget: createPrintWindowTarget
  });
  if (cancelled) return null;
  return {
    html: buildPrintableDocument(state, {
      layoutId: state.activeLayoutId,
      includeGeneratedRoots: isReadOnlyStateScope() || isAdminEditablePublishedLayout(layout?.id),
      includeLabels
    }),
    printTarget
  };
}

function readItemDialogDimensions() {
  return normalizeContainerDimensions({
    width: parseContainerDimensionInput(refs.itemWidth?.value),
    height: parseContainerDimensionInput(refs.itemHeight?.value),
    depth: parseContainerDimensionInput(refs.itemDepth?.value)
  });
}

function applyItemDimensions(item, dimensions = readItemDialogDimensions()) {
  const normalized = normalizeContainerDimensions(dimensions);
  if (hasContainerDimensions(normalized)) item.dimensions = normalized;
  else delete item.dimensions;
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

  return {
    openAddToContainerDialog, openNewItemForAddTarget, resolveEditableLayoutIdForContainer, renderAddToContainerResults, matchesAddToContainerSearch,
    clearAddToContainerSearch, openLayoutRootDialog, openCreateRootContainerForCurrentLayout, renderLayoutRootResults, matchesLayoutRootSearch,
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
    needsHoldToDrag, getPackingDragController, bindRootColumnDrag, bindPointerPackingDrag, bindCatalogItemPackingDrag,
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
    openPackingItemReplacementDialog, openContainerReplacementDialog,
    fillRootContainerLocationSelect, openItemDialog, openSharedReadonlyItemDialog, setSharedReadonlyItemDialog,
    resetSharedReadonlyItemDialog, copySharedItemFromReadonlyDialog, openSharedReadonlyContainerDialog,
    setSharedReadonlyRootContainerDialog, resetSharedReadonlyRootContainerDialog, uniqueLayoutName, uniquePublishedTemplateName,
    canManageLayout, canManageActiveLayout, languageSelectEntries, createLayoutCopyFromSource,
    templateCopyRootSnapshots, templateCopySourceKindFromChoice, templateCopySourceScore, loadPublishedTemplateCopySource, createTemplateCopyFromSource,
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
    updatePhotoGalleryUploadProgress, updatePhotoPrimaryButton, setRootContainerDialogPhotoStatus, readItemDialogQuantity, normalizeItemQuantityInput,
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
  };
}
