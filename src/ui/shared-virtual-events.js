import { DEMO_SHARED_LAYOUT_ID } from "../config/constants.js";
import { originalSharedId } from "../public/shared-virtual-state.js";
import {
  TEMPLATE_COPY_ICON_HTML,
  TEMPLATE_COPY_TITLE
} from "../public/template-copy.js";

function tr(t, key, fallback) {
  return typeof t === "function" ? t(key) : fallback;
}

function markReadonlyTemplateActionButtons(root = document, { t } = {}) {
  const copyTitle = tr(t, "tooltips.copyFromTemplate", TEMPLATE_COPY_TITLE);
  root.querySelectorAll("[data-add-to-container], [data-delete-root], [data-remove-from-layout], [data-delete-item]").forEach((button) => {
    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
  });
  root.querySelectorAll("[data-edit-item], [data-replace-layout-item], [data-copy-layout-item], [data-copy-item], [data-edit-root], [data-edit-container], [data-copy-root]").forEach((button) => {
    button.classList.remove("template-action-disabled");
    button.removeAttribute("aria-disabled");
    button.title = copyTitle;
    button.setAttribute("aria-label", copyTitle);
    button.innerHTML = TEMPLATE_COPY_ICON_HTML;
  });
}

function addSharedReadOnlyCopyButtons(root = document, { t } = {}) {
  const copyTitle = tr(t, "tooltips.copy", "Скопировать");
  root.querySelectorAll("[data-root-container-id], [data-subcontainer-id]").forEach((card) => {
    const virtualId = card.dataset.rootContainerId || card.dataset.subcontainerId;
    const sourceId = originalSharedId(virtualId, "shared-virtual-container-");
    if (!sourceId) return;
    const tools = card.querySelector(".container-tools, .subcontainer-tools");
    if (!tools || tools.querySelector(`[data-copy-root="${CSS.escape(virtualId)}"]`)) return;
    const button = card.ownerDocument.createElement("button");
    button.className = "header-icon-button copy-item-button";
    button.type = "button";
    button.dataset.copyRoot = virtualId;
    button.title = copyTitle;
    button.setAttribute("aria-label", copyTitle);
    button.innerHTML = '<span aria-hidden="true">⧉</span>';
    tools.insertBefore(button, tools.firstChild);
  });
}

export function bindSharedVirtualEvents(root = document, dependencies = {}) {
  const {
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
    getSharedVirtualCollapsedContainers,
    getState,
    isReadonlyTemplateView,
    openSharedContainerCopyPicker,
    openSharedItemCopyPicker,
    openSharedReadonlyItemDialog,
    render,
    t,
    withSharedVirtualState
  } = dependencies;
  const demoSource = activeReadOnlyLayoutId() === DEMO_SHARED_LAYOUT_ID && !canOpenAdminPublishedEdit();
  const readonlyTemplate = isReadonlyTemplateView();
  if (!canOpenAdminPublishedEdit() && !readonlyTemplate) addSharedReadOnlyCopyButtons(root, { t });
  bindSharedLayoutEvents(root);
  root.querySelectorAll("[data-replace-layout-item], [data-copy-layout-item], [data-copy-item], [data-edit-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const virtualId = button.dataset.replaceLayoutItem || button.dataset.copyLayoutItem || button.dataset.copyItem || button.dataset.editItem;
      const sourceId = originalSharedId(virtualId, "shared-virtual-item-");
      if (!sourceId) return;
      if (readonlyTemplate) {
        openSharedItemCopyPicker(sourceId);
        return;
      }
      if (button.dataset.editItem && canOpenAdminPublishedEdit()) editSharedSourceAsAdmin("item", sourceId);
      else if (canOpenAdminPublishedEdit()) openSharedItemCopyPicker(sourceId);
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
      if (readonlyTemplate || (canOpenAdminPublishedEdit() && button.dataset.copyRoot)) {
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
      const collapsedContainers = getSharedVirtualCollapsedContainers();
      capturePackingScroll();
      collapsedContainers[containerId] = !collapsedContainers[containerId];
      render();
    });
  });
  root.querySelectorAll("[data-toggle-column]").forEach((button) => {
    button.addEventListener("click", () => {
      withSharedVirtualState(() => {
        const currentState = getState();
        const containerIds = getDescendantContainerIds(button.dataset.toggleColumn);
        const shouldCollapse = containerIds.some((id) => !currentState.collapsedContainers[id]);
        containerIds.forEach((id) => {
          currentState.collapsedContainers[id] = shouldCollapse;
        });
      });
      capturePackingScroll();
      render();
    });
  });
  root.querySelectorAll("#addRootContainerBtn").forEach((button) => {
    button.textContent = tr(t, "buttons.copyAll", "Скопировать всю укладку");
    if (demoSource) button.textContent = demoCopyActionText();
    button.addEventListener("click", () => copySharedLayout(activeReadOnlyLayoutId()));
  });
  if (!canOpenAdminPublishedEdit()) {
    if (readonlyTemplate) markReadonlyTemplateActionButtons(root, { t });
    root.querySelectorAll("[data-edit-item]").forEach((button) => {
      if (readonlyTemplate) {
        button.setAttribute("aria-label", tr(t, "tooltips.copyFromTemplate", "Скопировать из шаблона"));
      } else {
        const copyTitle = tr(t, "tooltips.copy", "Скопировать");
        button.title = copyTitle;
        button.setAttribute("aria-label", copyTitle);
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
