export function bindLayoutEditorControls({
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
} = {}) {
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

export function bindRootContainersEditorControls({
  bindRootCatalogSelection,
  catalogRootActionIds,
  confirmDeleteCatalogRootContainers,
  copyCatalogRootContainers,
  getLastRootContainerTitleTap,
  getRootContainerSortMode,
  openRootContainerDialog,
  parseWeightInput,
  render,
  saveState,
  saveUiSettings,
  setEditingRootContainerId,
  setLastRootContainerTitleTap,
  setRootContainerSortMode,
  setRootContainerUsageFilter,
  state,
  touchContainer
} = {}) {
  document.querySelector("#rootContainerUsageFilter")?.addEventListener("change", (event) => {
    setRootContainerUsageFilter(event.target.value);
    render();
  });

  document.querySelector("#rootContainerSortBtn")?.addEventListener("click", () => {
    const current = getRootContainerSortMode();
    const next = current === "none" ? "asc" : current === "asc" ? "desc" : "none";
    setRootContainerSortMode(next);
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
      setEditingRootContainerId(null);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-copy-root]").forEach((button) => {
    button.addEventListener("click", () => copyCatalogRootContainers(catalogRootActionIds(button.dataset.copyRoot)));
  });

  document.querySelectorAll("[data-edit-root]").forEach((button) => {
    button.addEventListener("click", () => {
      openRootContainerDialog(button.dataset.editRoot);
    });
  });

  document.querySelectorAll("[data-delete-root]").forEach((button) => {
    button.addEventListener("click", () => confirmDeleteCatalogRootContainers(catalogRootActionIds(button.dataset.deleteRoot)));
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
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      const now = Date.now();
      const lastRootContainerTitleTap = getLastRootContainerTitleTap();
      const isDoubleTap = event.detail === 2 || (lastRootContainerTitleTap.id === containerId && now - lastRootContainerTitleTap.time < 360);
      if (isDoubleTap) {
        setLastRootContainerTitleTap({ id: "", time: 0 });
        edit(event);
        return;
      }
      setLastRootContainerTitleTap({ id: containerId, time: now });
    });
    title.addEventListener("dblclick", edit);
  });
  bindRootCatalogSelection();

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
        setEditingRootContainerId(null);
        render();
      }
    });
  });

  document.querySelector("#addRootContainerBtn")?.addEventListener("click", () => openRootContainerDialog());
}
