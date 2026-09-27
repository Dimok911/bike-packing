const activeCopies = new Set();

export async function copySharedLayoutFlow({ runtime, dependencies }, layoutId, {
  triggerButton = null
} = {}) {
  const {
    applyLayoutArrangement,
    beginCopyProgress,
    cacheGuestTemplatePhotoFallbacks,
    canOpenAdminPublishedEdit,
    closeSharedLayoutsDialog,
    confirmRepeatedSharedLayoutCopy,
    copyPublishedContainerToState,
    copySharedRootToState,
    createLayoutArrangementFromCurrentState,
    createLayoutId,
    createLocalDemoCopy,
    createdLayoutSyncErrorText,
    currentCreateMeta,
    ensurePrivateStateForSharedCopy,
    findCopiedSharedLayout,
    findSharedLayout,
    guestLayoutFlags,
    isServerBackedCopy,
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
  } = dependencies;
  const id = String(layoutId || "").trim();
  if (!id || activeCopies.has(id)) return "";
  const layout = findSharedLayout(id);
  if (!layout) return "";

  activeCopies.add(id);
  const progress = beginCopyProgress({
    layoutId: id,
    name: layout.name || "",
    triggerButton,
    t
  });
  if (!progress) {
    activeCopies.delete(id);
    return "";
  }

  let createdLayoutId = "";
  try {
    if (layout.id === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit()) {
      progress.update(25, "shared.copyStageLoading");
      createdLayoutId = await createLocalDemoCopy({ forceNew: true });
      progress.update(100, "shared.copyStageDone");
      progress.finish();
      return createdLayoutId;
    }

    progress.update(15, "shared.copyStageLoadingPersonal");
    await ensurePrivateStateForSharedCopy();

    let sourceState = sharedLayoutStatePayload(layout);
    if (!sourceState) {
      progress.update(30, "shared.copyStageLoading");
      await loadSharedLayoutPayload(layout.id);
      sourceState = sharedLayoutStatePayload(layout);
    }
    const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0] || null;
    if (!sourceState || !sourceLayout) throw new Error(t("shared.copySourceUnavailable"));

    const repeatedCopy = findCopiedSharedLayout(layout, sourceLayout);
    if (!(await confirmRepeatedSharedLayoutCopy(repeatedCopy, sourceLayout.name || layout.name))) {
      progress.cancel();
      return "";
    }

    progress.update(45, "shared.copyStageEntities");
    const changedAt = nowIso();
    const rootIds = (sourceLayout.rootContainerIds || [])
      .map((rootId) => copyPublishedContainerToState(sourceState, rootId, { targetLayoutId: "", changedAt }))
      .filter(Boolean);
    const fallbackRootIds = rootIds.length || (sourceLayout.rootContainerIds || []).length
      ? rootIds
      : sharedLayoutRoots(layout)
        .map((root) => copySharedRootToState(root, { targetLayoutId: "", changedAt }))
        .filter(Boolean);
    createdLayoutId = createLayoutId();
    runtime.state.layouts[createdLayoutId] = {
      id: createdLayoutId,
      name: uniqueLayoutName(sourceLayout.name || layout.name),
      rootContainerIds: fallbackRootIds,
      arrangement: createLayoutArrangementFromCurrentState(runtime.state, fallbackRootIds),
      ...guestLayoutFlags(),
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(
      runtime.state.layouts[createdLayoutId],
      "layout",
      sharedLayoutPublicSourceId(layout, sourceLayout),
      sourceState.activeLayoutId || layout.id
    );
    runtime.state.activeLayoutId = createdLayoutId;
    applyLayoutArrangement(createdLayoutId);
    setActivePrivateScope();
    rememberActiveLayoutChoice(createdLayoutId);

    // Persist and open the new layout before slow photo caching or server sync.
    // This is essential on mobile Safari, where those operations can take seconds.
    saveState({ sync: false });
    closeSharedLayoutsDialog();
    switchView("packing");
    runtime.render();
    progress.update(65, "shared.copyStageOpened");

    progress.update(75, "shared.copyStagePhotos");
    const cachedPhotoCount = await cacheGuestTemplatePhotoFallbacks(createdLayoutId, { changedAt }).catch(() => 0);
    if (cachedPhotoCount) saveState({ sync: false });

    progress.update(90, "shared.copyStageSaving");
    try {
      await syncCreatedPrivateLayoutEntities(createdLayoutId);
      showToast(t(isServerBackedCopy()
        ? "shared.copySavedServer"
        : "shared.copySavedLocal", { name: layout.name || "" }), "success");
    } catch (error) {
      const errorText = createdLayoutSyncErrorText(error, runtime.uiLanguage);
      showToast(t("shared.copySavedLocalSyncFailed", { message: errorText }), "error");
    }

    progress.finish();
    return createdLayoutId;
  } catch (error) {
    const message = t("shared.copyFailedWithMessage", { message: error?.message || error });
    progress.fail(message);
    updateSyncUi(message);
    showToast(message, "error");
    return createdLayoutId;
  } finally {
    activeCopies.delete(id);
  }
}
