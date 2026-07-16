function setText(element, text) {
  if (element) element.textContent = text;
}

function setFirstText(element, text) {
  if (!element) return;
  const firstTextNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (firstTextNode) {
    firstTextNode.nodeValue = `${text}\n          `;
    return;
  }
  element.prepend(document.createTextNode(`${text}\n          `));
}

function setAttr(element, name, value) {
  if (element) element.setAttribute(name, value);
}

function setDialogCloseLabels(documentRef, text) {
  documentRef.querySelectorAll("dialog .icon-button").forEach((button) => {
    if (button.getAttribute("value") === "cancel" || button.textContent.trim() === "×") {
      button.setAttribute("aria-label", text);
    }
  });
}

export function applyStaticTranslationsUi({
  activeReadOnlyLayoutId = () => "",
  canOpenAdminPublishedEdit = () => false,
  demoCopyActionText = () => "",
  demoSharedLayoutId = "",
  documentRef = document,
  isSharedLayoutView = () => false,
  refs = {},
  t = (key) => key,
  uiLanguage = "ru"
} = {}) {
  documentRef.documentElement.lang = uiLanguage;
  documentRef.title = t("app.title");
  const appTitle = documentRef.querySelector(".topbar h1");
  const authGateTitle = documentRef.querySelector(".auth-gate h2");
  const authGateText = documentRef.querySelector(".auth-gate p");
  const languageLabel = documentRef.querySelector("#languageSelectLabel");
  const layoutLabel = documentRef.querySelector(".layout-select-control");
  const searchLabel = documentRef.querySelector("#searchFilterLabel");
  const locationLabel = documentRef.querySelector("#locationFilterLabel");
  const categoryLabel = documentRef.querySelector("#categoryFilterLabel");
  setText(appTitle, t("app.title"));
  setText(authGateTitle, uiLanguage === "en" ? "Sign in to open your packing lists" : "Войдите, чтобы открыть сборы");
  setText(authGateText, uiLanguage === "en"
    ? "Layouts, weight and storage places will be available after signing in with a magic link."
    : "Укладка, вес и места хранения будут доступны после входа по magic link.");
  setText(refs.authGateBtn, uiLanguage === "en" ? "Get sign-in link" : "Получить ссылку для входа");
  setText(refs.syncBtn, t("buttons.sync"));
  setText(refs.sharedLayoutsBtn, t("menu.sharedLayouts"));
  setText(refs.shareListBtn, t("menu.shareList"));
  setText(refs.adminReportsBtn, t("menu.adminReports"));
  setText(refs.helpLimitsBtn, t("menu.help"));
  setText(refs.collectionMenuBtn, t("menu.collectionOff"));
  setText(refs.forceOfflineBtn, t("menu.offline"));
  documentRef.querySelector("#historyBtn")?.replaceChildren(documentRef.createTextNode(t("menu.history")));
  setText(refs.historyDialog?.querySelector("header h2"), t("history.title"));
  setText(documentRef.querySelector("#historyRetentionNote"), t("history.retentionNote"));
  setAttr(refs.historySourceTabs, "aria-label", t("history.sourceAria"));
  setText(refs.historySourceTabs?.querySelector('[data-history-source="private"]'), t("history.sourceMineTab"));
  setText(refs.historySourceTabs?.querySelector('[data-history-source="demo"]'), t("history.sourceDemoTab"));
  setText(refs.historySourceTabs?.querySelector('[data-history-source="shared"]'), t("history.sourceTemplatesTab"));
  setText(refs.historyDemoField?.querySelector("span"), t("history.demoTemplateLabel"));
  setText(refs.historySharedField?.querySelector("span"), t("history.templateLabel"));
  if (!refs.historyDetailDialog?.open) {
    setText(refs.historyDetailTitle, t("history.detailsTitle"));
    setText(refs.historyDetailRestoreBtn, t("history.restore"));
  }
  documentRef.querySelector("#backupBtn")?.replaceChildren(documentRef.createTextNode(t("menu.backups")));
  documentRef.querySelector("#visualStyleMenuBtn")?.replaceChildren(documentRef.createTextNode(t("menu.viewOptions")));
  documentRef.querySelector("#exportBtn")?.replaceChildren(documentRef.createTextNode(t("menu.print")));
  setText(languageLabel, t("menu.language"));
  setFirstText(layoutLabel, t("labels.layout"));
  if (refs.newLayoutBtn) {
    refs.newLayoutBtn.textContent = isSharedLayoutView()
      ? (activeReadOnlyLayoutId() === demoSharedLayoutId && !canOpenAdminPublishedEdit() ? demoCopyActionText() : t("buttons.copyAll"))
      : t("buttons.newLayout");
  }
  setText(refs.editLayoutBtn, t("buttons.edit"));
  setFirstText(searchLabel, t("labels.search"));
  if (refs.searchInput) refs.searchInput.placeholder = t("placeholders.search");
  setFirstText(locationLabel, t("labels.storage"));
  setFirstText(categoryLabel, t("labels.category"));
  documentRef.querySelectorAll(".tabs .tab").forEach((tab) => {
    const key = `tabs.${tab.dataset.view}`;
    tab.textContent = t(key);
  });
  setText(refs.copySharedLayoutBtn, uiLanguage === "en" ? "Copy whole layout" : "Скопировать всю укладку");
  if (refs.languageSelect) refs.languageSelect.value = uiLanguage;

  setAttr(refs.menuBtn, "aria-label", uiLanguage === "en" ? "Menu" : "Меню");
  setAttr(refs.clearSearchBtn, "aria-label", uiLanguage === "en" ? "Clear search" : "Очистить поиск");
  setAttr(refs.clearLocationFilterBtn, "aria-label", uiLanguage === "en" ? "Clear storage place" : "Сбросить место хранения");
  setAttr(refs.clearCategoryFilterBtn, "aria-label", uiLanguage === "en" ? "Clear category" : "Сбросить категорию");
  setAttr(refs.filterContextBtn, "aria-label", uiLanguage === "en" ? "Show filter context" : "Показывать контекст фильтра");
  setAttr(refs.filterContextBtn, "title", uiLanguage === "en" ? "Show filter context" : "Показывать контекст фильтра");
  setAttr(refs.collectionActions?.querySelector(".collection-panel"), "aria-label", t("collection.mode"));
  setText(refs.unpackAllBtn, t("collection.unpackAll"));
  setDialogCloseLabels(documentRef, t("buttons.close"));

  setFirstText(refs.dialog?.querySelector("label:has(#itemName)"), t("forms.name"));
  setFirstText(refs.dialog?.querySelector("label:has(#itemWeight)"), t("forms.weightGrams"));
  setFirstText(refs.dialog?.querySelector(".quantity-field"), t("forms.quantity"));
  setText(refs.dialog?.querySelector(".item-total-weight span"), t("forms.totalWeight"));
  setFirstText(refs.dialog?.querySelector("label:has(#itemLocation)"), t("forms.storage"));
  setFirstText(refs.dialog?.querySelector(".field-label:has(#itemCategoryList)"), t("forms.categories"));
  setFirstText(refs.dialog?.querySelector("label:has(#itemAvailabilityStatus)"), t("forms.availability"));
  if (refs.itemAvailabilityStatus) {
    const availabilityLabels = {
      available: t("items.availability.available"),
      lost: t("items.availability.lost"),
      broken: t("items.availability.broken"),
      retired: t("items.availability.retired")
    };
    refs.itemAvailabilityStatus.querySelectorAll("option").forEach((option) => {
      option.textContent = availabilityLabels[option.value] || option.textContent;
    });
  }
  setText(refs.itemContainerLabel, t("forms.placeIn"));
  setText(refs.itemContainerPickerBtn, t("forms.moveInsideLayout"));
  setText(refs.itemCopyToContainerBtn, t("forms.copyToLayout"));
  setText(refs.itemRemoveFromLayoutBtn, t("forms.removeFromLayout"));
  setText(refs.itemDeleteForeverBtn, t("buttons.deleteForever"));
  setFirstText(refs.dialog?.querySelector("label:has(#itemNote)"), t("forms.note"));
  setFirstText(refs.dialog?.querySelector(".field-label:has(#itemPhotoPreview)"), t("forms.photo"));
  const itemPhotoPick = refs.itemPhotoInput?.closest(".item-photo-pick");
  setText(itemPhotoPick, t("buttons.choosePhoto"));
  if (itemPhotoPick && refs.itemPhotoInput) itemPhotoPick.append(refs.itemPhotoInput);
  const itemCameraPick = refs.itemPhotoCameraInput?.closest(".item-photo-pick");
  setText(itemCameraPick, t("buttons.takePhoto"));
  if (itemCameraPick && refs.itemPhotoCameraInput) itemCameraPick.append(refs.itemPhotoCameraInput);
  setText(refs.itemPhotoRemoveBtn, t("buttons.removePhoto"));
  setText(refs.itemPhotoPrimaryBtn, t("buttons.primaryPhoto"));
  setText(refs.itemPhotoOrderBtn, t("buttons.photoOrder"));
  setText(refs.copySharedItemDialogBtn, t("buttons.copy"));

  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerName)"), t("forms.name"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerWeight)"), t("forms.weightGrams"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerVolume)"), t("forms.volumeLiters"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerColor)"), t("forms.color"));
  if (refs.rootContainerColor) refs.rootContainerColor.placeholder = t("forms.colorPlaceholder");
  setText(refs.rootContainerDialog?.querySelector(".container-dimensions-field legend"), t("forms.dimensionsCm"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerWidth)"), t("forms.widthShort"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerHeight)"), t("forms.heightShort"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerDepth)"), t("forms.depthShort"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerLocation)"), t("forms.storage"));
  setFirstText(refs.rootContainerDialog?.querySelector(".field-label:has(#rootContainerCategoryList)"), t("forms.categories"));
  setText(refs.rootContainerNestableLabel, t("rootContainers.nestable"));
  setText(refs.rootContainerPlacementLabel, t("forms.locatedIn"));
  setText(refs.rootContainerPlacementBtn, t("forms.moveInsideLayout"));
  setText(refs.rootContainerCopyToContainerBtn, t("forms.copyToLayout"));
  setText(refs.rootContainerRemoveFromLayoutBtn, t("forms.removeFromLayout"));
  setText(refs.rootContainerDeleteForeverBtn, t("buttons.deleteForever"));
  setFirstText(refs.rootContainerDialog?.querySelector("label:has(#rootContainerNote)"), t("forms.notes"));
  setFirstText(refs.rootContainerDialog?.querySelector(".field-label:has(#rootContainerPhotoPreview)"), t("forms.photo"));
  const rootPhotoPick = refs.rootContainerPhotoInput?.closest(".item-photo-pick");
  setText(rootPhotoPick, t("buttons.choosePhoto"));
  if (rootPhotoPick && refs.rootContainerPhotoInput) rootPhotoPick.append(refs.rootContainerPhotoInput);
  const rootCameraPick = refs.rootContainerPhotoCameraInput?.closest(".item-photo-pick");
  setText(rootCameraPick, t("buttons.takePhoto"));
  if (rootCameraPick && refs.rootContainerPhotoCameraInput) rootCameraPick.append(refs.rootContainerPhotoCameraInput);
  setText(refs.rootContainerPhotoRemoveBtn, t("buttons.removePhoto"));
  setText(refs.rootContainerPhotoPrimaryBtn, t("buttons.primaryPhoto"));
  setText(refs.rootContainerPhotoOrderBtn, t("buttons.photoOrder"));
  documentRef.querySelectorAll(".photo-paste-hint").forEach((hint) => setText(hint, t("photo.pasteHint")));

  setText(refs.rootPlacementTitle, t("forms.inCurrentLayout"));
  setText(refs.rootPlacementDialog?.querySelector(".dialog-subtitle"), t("forms.choosePlace"));
  setText(refs.containerPickerTitle, t("forms.choosePlace"));
  setText(refs.containerPickerLayoutField?.querySelector("span"), t("labels.layout"));
  setText(refs.containerPickerNoneBtn, t("forms.outsideLayout"));
  setAttr(refs.layoutCollapseAllBtn, "aria-label", t("tooltips.collapseAllInLayout"));
  setAttr(refs.layoutCollapseAllBtn, "title", t("tooltips.collapseAllInLayout"));
  setText(refs.categoryFilterDialog?.querySelector("h2"), t("categoryFilter.title"));
  setText(refs.resetCategoryFilterBtn, t("buttons.reset"));
  setText(refs.applyCategoryFilterBtn, t("buttons.done"));
  setText(refs.addToContainerTitle, t("items.addItem"));
  setFirstText(refs.addToContainerDialog?.querySelector("label:has(#addToContainerSearch)"), t("forms.search"));
  if (refs.addToContainerSearch) refs.addToContainerSearch.placeholder = t("forms.itemNamePlaceholder");
  setAttr(refs.clearAddToContainerSearchBtn, "aria-label", uiLanguage === "en" ? "Clear search" : "Очистить поиск");
  if (refs.newSubcontainerName) refs.newSubcontainerName.placeholder = t("forms.newSubcontainerPlaceholder");
  setText(refs.createSubcontainerBtn, t("buttons.add"));
  setText(refs.layoutRootDialog?.querySelector("h2"), t("rootContainers.add"));
  setText(refs.layoutRootDialog?.querySelector(".dialog-subtitle"), t("forms.inCurrentLayout"));
  setFirstText(refs.layoutRootDialog?.querySelector("label:has(#layoutRootSearch)"), t("forms.search"));
  if (refs.layoutRootSearch) refs.layoutRootSearch.placeholder = t("forms.bagOrPlaceNamePlaceholder");
  setAttr(refs.clearLayoutRootSearchBtn, "aria-label", uiLanguage === "en" ? "Clear search" : "Очистить поиск");

  setFirstText(refs.layoutDialog?.querySelector("label:has(#layoutCreateMode)"), t("layout.createMode"));
  setFirstText(refs.layoutDialog?.querySelector("label:has(#layoutName)"), t("forms.name"));
  if (refs.layoutName) refs.layoutName.placeholder = t("layout.namePlaceholder");
  if (refs.layoutCreateMode) {
    const modeLabels = {
      empty: t("layout.createEmpty"),
      copy: t("layout.createCopy"),
      "from-template-layout": t("layout.createFromTemplate"),
      template: t("layout.createEmptyTemplate"),
      "demo-template": t("layout.createDemoTemplate"),
      "shared-template": t("layout.createSharedTemplate"),
      "template-copy": t("layout.createTemplateCopy")
    };
    refs.layoutCreateMode.querySelectorAll("option").forEach((option) => {
      option.textContent = modeLabels[option.value] || option.textContent;
    });
  }
  setText(refs.saveLayoutBtn, t("buttons.add"));

  setFirstText(refs.layoutEditDialog?.querySelector("label:has(#layoutEditName)"), t("forms.name"));
  setFirstText(refs.layoutEditDialog?.querySelector("label:has(#layoutEditNotes)"), t("forms.notes"));
  if (refs.layoutEditNotes) refs.layoutEditNotes.placeholder = t("layout.notesPlaceholder");
  setText(refs.layoutLockedLabel?.querySelector("span"), t("layout.lockedLabel"));
  setText(refs.deleteEditedLayoutBtn, t("buttons.deleteLayout"));
  setText(refs.saveEditedLayoutBtn, t("buttons.save"));
  const layoutOrderButtonText = t("layoutOrder.button");
  setText(refs.layoutOrderToggleBtn?.querySelector(".layout-order-toggle-text"), layoutOrderButtonText);
  setAttr(refs.layoutOrderToggleBtn, "aria-label", layoutOrderButtonText);
  setAttr(refs.layoutOrderToggleBtn, "title", layoutOrderButtonText);
  if (refs.layoutOrderToggleBtn) refs.layoutOrderToggleBtn.dataset.touchTooltip = layoutOrderButtonText;
  setText(refs.layoutOrderTitle, t("layoutOrder.title"));
  setText(refs.saveLayoutOrderBtn, t("buttons.save"));

  setText(refs.backupDialog?.querySelector("h2"), t("backup.title"));
  setText(refs.backupCreateBtn, t("backup.createArchive"));
  const backupPick = refs.backupFileInput?.closest(".backup-file-pick");
  setText(backupPick, t("backup.loadArchive"));
  if (backupPick && refs.backupFileInput) backupPick.append(refs.backupFileInput);
  setText(refs.backupRestoreSelectedBtn, uiLanguage === "en" ? "Restore selected personal layouts" : "Восстановить выбранные личные");
  setText(refs.backupRestoreAdminBtn, uiLanguage === "en" ? "Restore selected templates" : "Восстановить выбранные шаблоны");
  setText(refs.backupRestoreFullBtn, uiLanguage === "en" ? "All personal data (excluding templates)" : "Личные данные целиком (без шаблонов)");
}
