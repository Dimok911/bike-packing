const STORAGE_KEY = "bike-packing-prototype-state-v1";
const APP_VERSION = "v322";
const SYNC_META_KEY = "bike-packing-prototype-sync-meta-v1";
const BASE_STATE_KEY = "bike-packing-prototype-base-state-v1";
const AUTH_EMAIL_KEY = "bike-packing-auth-email";
const AUTH_SIGNED_OUT_KEY = "bike-packing-auth-signed-out";
const FORCE_OFFLINE_KEY = "bike-packing-force-offline";
const DEVICE_META_KEY = "bike-packing-device-meta-v1";
const UI_SETTINGS_KEY = "bike-packing-ui-settings-v1";
const API_BASE = "https://api.vniipo-help.ru/letters-vniipo/api";
const DATA_SCOPE_KEY = "bike-packing";
const DATA_ITEM_KEY = "state";
const OWNER_EMAIL = "dimok911@gmail.com";
const COLLAPSE_DEFAULTS_VERSION = 2;
const API_TIMEOUT_MS = 7000;
const POINTER_DRAG_START_DISTANCE = 4;
const TOUCH_DRAG_DELAY_MS = 260;
const TOUCH_DRAG_CANCEL_DISTANCE = 10;
const TOUCH_SCROLL_CANCEL_DISTANCE = 4;
const NESTED_GROUP_HOVER_DELAY_MS = 360;
const EDGE_SCROLL_ZONE = 42;
const EDGE_SCROLL_MAX_SPEED = 10;
const REMOTE_REFRESH_INTERVAL_MS = 30000;
const SEARCH_RENDER_DEBOUNCE_MS = 350;
const REQUIRED_CHARGE_CATEGORY = "Требует заряда";

const categories = [
  "Сон",
  "Одежда",
  "Кухня",
  "Еда",
  "Вода",
  "Ремонт",
  "Медицина",
  "Электроника",
  "Документы",
  "Гигиена",
  "Навигация",
  "Велозапчасти",
  "Инструменты",
  REQUIRED_CHARGE_CATEGORY,
  "Прочее"
];

const locations = ["Дом", "Дача", "Уже на велосипеде", "Надо купить", "Не знаю где"];

const seedTree = [
  ["Левый задний баул", [
    ["Несессер Ortlieb", [
      "Карман нижний левый: расческа + зубная паста + зубная щетка, сухой шампунь + щипцы для ногтей",
      "Карман средний: ручка + зип пакетики + фальшфейер + шнур USB-C",
      "Карман нижний правый: бечевка",
      "Карман верхний левый: линзы по 5 шт. + налобный фонарь + блок питания 30W",
      "Карман верхний правый: крепление GoPro на шлем + манометр велосипедный",
      "Отсек задний: мелочь"
    ]],
    "Седло Prologo",
    ["Желтый несессер", [
      "Нож",
      "Батарейки для педалей и для пульсометра",
      "Переходник для телефона для чтения SD карт",
      "Штатив маленький",
      "Стяжки короткие и длинные",
      "Пакет зип: ручка + карандаш",
      "Шнур USB-С",
      "Зип пакет: нитки + иголка",
      "Складная ложка",
      "Записная книжка"
    ]],
    ["Пакет для ремонта велосипеда", [
      "Запасная покрышка Schwalbe G-One overland 365",
      "Тряпка",
      "Тросик для переключателя 1.2х2000",
      "Тросик для тормоза 1.5х2000",
      "Смазка для цепи",
      "Запасная камера (1 шт.)",
      "Герметик 100 гр.",
      "Ключ для педалей (на 15)"
    ]],
    ["Аптечка", [
      "Терафлю (2 шт.)",
      "В пакете зип: Самофиксирующийся бинт + лекопластырь + ватные палочки",
      "Клещедер",
      "Темпалгин",
      "Гепаксид",
      "Йод",
      "Бинт",
      "Энтерол",
      "Контактные линзы"
    ]],
    ["Повседневная одежда", [
      "Ветровка",
      "Термоштаны",
      "Пакет с бельем",
      "Футболки 3 шт.",
      "Трусы 3 шт."
    ]],
    ["Пакет с веловещами", [
      "Велотрусы GTO",
      "Носки Offroad",
      "Носки 1/3",
      "Термомайка 1/3 белая",
      "Термомака 2/3 черная",
      "Гетры",
      "Баф"
    ]]
  ]],
  ["Правый задний баул", [
    "Палатка",
    "Спальный мешок Ferrino",
    ["Пакет с вещами на прохладную погоду", [
      "Джерси длинный рукав 2/3",
      "Куртка легкая пуховая Salewa"
    ]],
    ["Мешок Thermarest", [
      "Надувной коврик",
      "Надувная подушка",
      "Насос"
    ]],
    "Карман баула внутренний на молнии: топорик",
    "Карман баула внутренний: стрепы Voile узкие (2 шт.), широкие (2 шт.)",
    ["Пакет 1", [
      "Повербанк 50",
      "Повербанк 20",
      "Очки"
    ]],
    ["Пакет 2", [
      "Пластиковые пакеты",
      "Стретч-пленка"
    ]]
  ]],
  ["Баул на багажнике красный", [
    ["Пакет 1", [
      "насос велосипедный электрический",
      "крем от солнца",
      "средство от насекомых"
    ]],
    "Велозамок",
    "Кроссовки Allbirds",
    "Crocs",
    "Еда на дорогу в обед: творог + сметана + шоколад, сыр и колбаса из холодильника",
    ["Дождевой пакет", [
      "Дождевые штаны",
      "Велоперчатки непромокаемые 36.5"
    ]],
    ["Пакет для приготовления пищи", [
      "Газовый баллон 450 г",
      "Кружка с горелкой внутри",
      "Салфетки",
      "Раскладная ложка",
      "Каши (10 шт.)",
      "Чай",
      "Спички"
    ]],
    ["Поясная сумка", [
      "Портмоне с картами и деньгами",
      "Паспорт",
      "Ключи от дома",
      "Мюсли"
    ]],
    ["Сменная одежда", [
      "Шорты Focus",
      "Трусы",
      "Футболка"
    ]]
  ]],
  ["На себе", [
    "Велошорты Gravel",
    "Термомайка 1/3 черная",
    "Джерси с коротким рукавом",
    "Ветровка розовая",
    "Бахилы GripGrab",
    "Наушники",
    "Часы",
    "Пульсометр",
    "Шлем",
    "Очки",
    "Ботинки MTB"
  ]],
  ["На веле", [
    "Педали двусторонние с креплением по шипы и обычный ботинок",
    "Две баклажки воды по 800 мл",
    "Камера GoPro",
    "Велокомп Wahoo",
    "Насос",
    ["Бардачок задний", [
      "запасная камера",
      "набор инструментов с битами + звенья цепи и замок",
      "монтажки",
      "заплатки для камер"
    ]],
    ["Бардачок верхний", [
      "Набор для ремонта бескамерных покрышек",
      "Газовый баллончик",
      "Влажные салфетки",
      "Ключи для креплений GoPro (квадратный и треугольный)",
      "Баллон СО2",
      "Зажигалка",
      "Ключ для ниппеля велокамеры",
      "Повербанк 10"
    ]]
  ]]
];

const state = loadState();
const uiSettings = loadUiSettings();
let editingItemId = null;
let editingItemTitleId = null;
let editingRootContainerId = null;
let editingContainerId = null;
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
let applyingRemoteState = false;
let appUnlocked = false;
let syncVisualState = "local";
let remoteRefreshTimer = null;
let remoteRefreshInFlight = false;
let historyRecords = [];
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
let editingDictionaryEntry = null;
let fixedScrollbarRefreshFrame = null;
let searchRenderTimer = null;
let suppressNextFilterJump = false;
let modalTouchStartY = 0;

const refs = {
  syncStatus: document.querySelector("#syncStatus"),
  appVersion: document.querySelector("#appVersion"),
  authBtn: document.querySelector("#authBtn"),
  authGateBtn: document.querySelector("#authGateBtn"),
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
  itemContainerPickerBtn: document.querySelector("#itemContainerPickerBtn"),
  containerPickerDialog: document.querySelector("#containerPickerDialog"),
  containerPickerNoneBtn: document.querySelector("#containerPickerNoneBtn"),
  containerPickerBoard: document.querySelector("#containerPickerBoard"),
  itemNote: document.querySelector("#itemNote"),
  saveItemBtn: document.querySelector("#saveItemBtn"),
  rootContainerDialog: document.querySelector("#rootContainerDialog"),
  rootContainerDialogTitle: document.querySelector("#rootContainerDialogTitle"),
  rootContainerName: document.querySelector("#rootContainerName"),
  rootContainerWeight: document.querySelector("#rootContainerWeight"),
  rootContainerVolume: document.querySelector("#rootContainerVolume"),
  rootContainerColor: document.querySelector("#rootContainerColor"),
  rootContainerLocation: document.querySelector("#rootContainerLocation"),
  rootContainerPlacementField: document.querySelector("#rootContainerPlacementField"),
  rootContainerPlacementBtn: document.querySelector("#rootContainerPlacementBtn"),
  rootContainerNote: document.querySelector("#rootContainerNote"),
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
  historyStatus: document.querySelector("#historyStatus"),
  historyList: document.querySelector("#historyList"),
  toastRegion: document.querySelector("#toastRegion")
};

init();

function init() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js");
  }
  if (refs.appVersion) refs.appVersion.textContent = APP_VERSION;
  preventDoubleTapZoom();
  setupModalScrollLock();
  setupTouchActionButtonFeedback();
  document.addEventListener("pointerdown", blurActiveEditableBeforeButtonAction, true);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  refs.layoutSelect.addEventListener("change", (event) => {
    state.activeLayoutId = event.target.value;
    saveState();
    render();
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
  refs.rootContainerPlacementBtn.addEventListener("click", openRootPlacementDialog);
  refs.itemContainerPickerBtn.addEventListener("click", openContainerPickerDialog);
  refs.containerPickerNoneBtn.addEventListener("click", () => selectItemContainer(""));
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
  refs.dialog.querySelector("form")?.addEventListener("input", updateItemDialogSaveState);
  refs.dialog.querySelector("form")?.addEventListener("change", updateItemDialogSaveState);
  refs.saveRootContainerBtn.addEventListener("click", saveRootContainerDialog);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("input", updateRootContainerDialogSaveState);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("change", updateRootContainerDialogSaveState);
  refs.rootContainerDialog.querySelector("form")?.addEventListener("submit", handleRootContainerFormSubmit);
  refs.rootContainerDialog.addEventListener("close", () => {
    editingRootContainerId = null;
    rootContainerDialogInitialSnapshot = null;
    rootContainerDialogPendingRootIds = null;
  });
  refs.dialog.addEventListener("close", () => {
    itemDialogInitialSnapshot = null;
  });
  refs.newLayoutBtn.addEventListener("click", openLayoutDialog);
  refs.layoutCreateMode.addEventListener("change", updateLayoutCopyVisibility);
  refs.saveLayoutBtn.addEventListener("click", saveNewLayout);
  refs.authBtn.addEventListener("click", handleAuthButton);
  refs.authGateBtn.addEventListener("click", handleAuthButton);
  refs.forceOfflineBtn.addEventListener("click", toggleForcedOfflineMode);
  refs.authForm.addEventListener("submit", submitAuthDialog);
  refs.syncBtn.addEventListener("click", () => syncNow({ force: true }));
  refs.menuBtn.addEventListener("click", toggleTopMenu);
  refs.topMenu.addEventListener("click", (event) => {
    if (event.target.closest("button")) closeTopMenu();
  });
  refs.historyBtn.addEventListener("click", openHistoryDialog);
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
      syncNow();
    } else if (appUnlocked) {
      updateSyncUi("Интернет появился · нажмите «Синхр.» для проверки входа");
    }
  });
  window.addEventListener("offline", () => {
    if (hasLocalSavedState() && !isExplicitlySignedOut()) {
      currentUser = null;
      appUnlocked = true;
      updateSyncUi("Офлайн · показаны сохранённые данные");
    }
  });
  window.addEventListener("focus", () => checkRemoteStateFreshness({ notify: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkRemoteStateFreshness({ notify: true });
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

  render();
  updateSyncUi();
  startRemoteStateWatcher();
  if (isForcedOffline() && hasLocalSavedState() && !isExplicitlySignedOut()) {
    unlockOfflineState("Принудительно офлайн · показаны сохранённые данные");
  } else if ("onLine" in navigator && !navigator.onLine && hasLocalSavedState() && !isExplicitlySignedOut()) {
    unlockOfflineState();
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

function createSeedState() {
  const containers = {};
  const items = {};
  const rootIds = [];
  let containerNo = 1;
  let itemNo = 1;

  const addContainer = (name, parentId = null) => {
    const id = `container-${containerNo++}`;
    containers[id] = { id, name, parentId, childIds: [], itemIds: [], order: [], weight: 0 };
    if (parentId) {
      containers[parentId].childIds.push(id);
      containers[parentId].order.push({ type: "container", id });
    }
    else rootIds.push(id);
    return id;
  };

  const addItem = (name, containerId) => {
    const id = `item-${itemNo++}`;
    items[id] = {
      id,
      name,
      weight: 0,
      quantity: 1,
      location: guessLocation(name),
      category: guessCategory(name),
      categories: [guessCategory(name)],
      containerId,
      note: ""
    };
    containers[containerId].itemIds.push(id);
    containers[containerId].order.push({ type: "item", id });
  };

  const walk = (nodes, parentId) => {
    nodes.forEach((node) => {
      if (Array.isArray(node)) {
        const id = addContainer(node[0], parentId);
        walk(node[1], id);
      } else {
        addItem(node, parentId);
      }
    });
  };

  seedTree.forEach(([name, children]) => {
    const id = addContainer(name);
    walk(children, id);
  });

  const collapsedContainers = {};
  Object.values(containers).forEach((container) => {
    if (container.parentId) collapsedContainers[container.id] = true;
  });

  return {
    locations: [...locations],
    categories: [...categories],
    containers,
    items,
    layouts: {
      "layout-full": {
        id: "layout-full",
        name: "Полная укладка",
        rootContainerIds: [...rootIds]
      },
      "layout-light": {
        id: "layout-light",
        name: "Легкая без красного баула",
        rootContainerIds: rootIds.filter((id) => containers[id].name !== "Баул на багажнике красный")
      }
    },
    activeLayoutId: "layout-full",
    collapsedContainers,
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    showItemMeta: true,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
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

function guessCategory(name) {
  const text = name.toLowerCase();
  if (match(text, ["палатка", "спальн", "коврик", "подушка"])) return "Сон";
  if (match(text, ["штаны", "футбол", "трусы", "носки", "джерси", "куртка", "ветровка", "баф", "бахил", "ботинки", "кроссовки", "crocs", "гетры", "одежда"])) return "Одежда";
  if (match(text, ["аптеч", "бинт", "йод", "темпалгин", "энтерол", "клещ", "пластыр"])) return "Медицина";
  if (match(text, ["повербанк", "usb", "gopro", "wahoo", "фонарь", "блок питания", "наушники", "часы", "пульсометр", "sd"])) return "Электроника";
  if (match(text, ["насос", "камера", "покрыш", "тросик", "цеп", "нипп", "co2", "герметик", "педал"])) return "Велозапчасти";
  if (match(text, ["ключ", "монтаж", "инструмент", "мультитул"])) return "Инструменты";
  if (match(text, ["ложка", "горел", "газовый баллон", "кружка", "спички", "салфетки"])) return "Кухня";
  if (match(text, ["каши", "чай", "мюсли", "творог", "сыр", "колбас", "шоколад"])) return "Еда";
  if (match(text, ["вода", "баклаж"])) return "Вода";
  if (match(text, ["паспорт", "карты", "деньг"])) return "Документы";
  if (match(text, ["зубн", "шампунь", "расческа", "крем", "насеком"])) return "Гигиена";
  if (match(text, ["записная", "ручка", "карандаш"])) return "Навигация";
  if (match(text, ["ремонт", "заплат", "стяжки", "стрепы"])) return "Ремонт";
  return "Прочее";
}

function guessLocation(name) {
  if (name.toLowerCase().includes("надо купить")) return "Надо купить";
  return "Не знаю где";
}

function match(text, words) {
  return words.some((word) => text.includes(word));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createSeedState();
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
    normalizeItemCategories(parsed);
    migrateContainerOrder(parsed);
    applyDefaultCollapsedContainers(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return createSeedState();
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
  localStorage.setItem(BASE_STATE_KEY, JSON.stringify(nextState));
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
    localStorage.setItem(DEVICE_META_KEY, JSON.stringify(meta));
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
      lastSyncedLocalUpdatedAt: meta.lastSyncedLocalUpdatedAt || null
    };
  } catch {
    return { dirty: false, serverUpdatedAt: null, localUpdatedAt: null, lastSyncedLocalUpdatedAt: null };
  }
}

function saveSyncMeta() {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
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
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify({
      itemSortMode: normalizeSortMode(itemSortMode),
      rootContainerSortMode: normalizeSortMode(rootContainerSortMode)
    }));
  } catch {
    // Sorting preferences are local convenience settings.
  }
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
  });
}

function normalizeContainerColor(value) {
  return String(value || "").trim();
}

function normalizeItemFields(targetState = state) {
  Object.values(targetState.items || {}).forEach((item) => {
    item.weight = parseWeightInput(item.weight);
    item.quantity = normalizeItemQuantity(item.quantity);
  });
}

function defaultRootContainerLocation(targetState = state) {
  const list = Array.isArray(targetState.locations) ? targetState.locations : [];
  return list.includes("Не знаю где") ? "Не знаю где" : (list[0] || "");
}

function normalizeItemCategories(targetState = state) {
  targetState.categories = Array.isArray(targetState.categories) ? targetState.categories : [...categories];
  if (!targetState.categories.includes(REQUIRED_CHARGE_CATEGORY)) {
    targetState.categories.push(REQUIRED_CHARGE_CATEGORY);
  }
  Object.values(targetState.items || {}).forEach((item) => {
    const values = Array.isArray(item.categories) ? item.categories : [];
    const legacy = typeof item.category === "string" ? item.category : "";
    const normalized = [...values, legacy]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    item.categories = normalized.length ? normalized : [targetState.categories[0] || "Прочее"];
    item.category = item.categories[0];
    item.categories.forEach((category) => {
      if (!targetState.categories.includes(category)) targetState.categories.push(category);
    });
  });
}

function itemCategories(item) {
  if (!item) return [];
  if (Array.isArray(item.categories) && item.categories.length) return item.categories;
  return item.category ? [item.category] : [];
}

function applyDefaultCollapsedContainers(targetState = state) {
  const forceInitialDefaults = targetState.collapseDefaultsVersion !== COLLAPSE_DEFAULTS_VERSION;
  Object.values(targetState.containers || {}).forEach((container) => {
    if (!container.parentId) return;
    if (forceInitialDefaults || !(container.id in targetState.collapsedContainers)) {
      targetState.collapsedContainers[container.id] = true;
    }
  });
  targetState.collapseDefaultsVersion = COLLAPSE_DEFAULTS_VERSION;
}

function migrateContainerOrder(targetState = state) {
  Object.values(targetState.containers || {}).forEach((container) => {
    const existing = Array.isArray(container.order) ? container.order : [];
    const seen = new Set();
    const order = [];

    existing.forEach((entry) => {
      if (!entry || !entry.type || !entry.id) return;
      const key = `${entry.type}:${entry.id}`;
      if (seen.has(key)) return;
      if (entry.type === "item" && !container.itemIds.includes(entry.id)) return;
      if (entry.type === "container" && !container.childIds.includes(entry.id)) return;
      seen.add(key);
      order.push(entry);
    });

    container.itemIds.forEach((id) => {
      const key = `item:${id}`;
      if (!seen.has(key)) order.push({ type: "item", id });
    });
    container.childIds.forEach((id) => {
      const key = `container:${id}`;
      if (!seen.has(key)) order.push({ type: "container", id });
    });
    container.order = order;
  });
}

function saveState({ sync = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (sync && !applyingRemoteState) {
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    updateSyncUi();
    scheduleRemoteSave();
  }
}

function saveLocalUiState() {
  saveState({ sync: false });
}

function nowIso() {
  return new Date().toISOString();
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
  return cloneStateForSync(state, options);
}

function cloneStateForSync(sourceState, { forSync = false } = {}) {
  const cloned = JSON.parse(JSON.stringify(sourceState));
  if (forSync) {
    delete cloned.collapsedContainers;
    delete cloned.showItemMeta;
    delete cloned.showFilterContext;
    delete cloned.collectionMode;
    delete cloned.showOnlyUnpacked;
  }
  return cloned;
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
  normalizeItemCategories(normalized);
  migrateContainerOrder(normalized);
  applyDefaultCollapsedContainers(normalized);
  return normalized;
}

function replaceState(nextState, { preserveLocalUi = true } = {}) {
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
  normalizeItemCategories(state);
  if (previousCollapsedContainers) {
    state.collapsedContainers = mergeLocalCollapsedContainers(state.collapsedContainers || {}, previousCollapsedContainers);
  }
  if (preserveLocalUi) {
    state.showItemMeta = typeof previousShowItemMeta === "boolean" ? previousShowItemMeta : Boolean(state.showItemMeta);
    state.showFilterContext = typeof previousShowFilterContext === "boolean" ? previousShowFilterContext : Boolean(state.showFilterContext);
    state.collectionMode = Boolean(previousCollectionMode);
    state.showOnlyUnpacked = Boolean(previousShowOnlyUnpacked && state.collectionMode);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function applyRemoteState(remoteState, updatedAt) {
  replaceState(remoteState);
  saveBaseState(remoteState);
  syncMeta.dirty = false;
  syncMeta.serverUpdatedAt = updatedAt || null;
  syncMeta.localUpdatedAt = updatedAt || null;
  syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
  saveSyncMeta();
  appUnlocked = true;
  renderPreservingPackingScroll();
  updateSyncUi();
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

function comparableValueForMerge(type, value) {
  if (!["item", "container", "layout"].includes(type) || !value || typeof value !== "object") return value;
  const comparable = { ...value };
  delete comparable.updatedAt;
  delete comparable.updatedByDeviceId;
  delete comparable.updatedByDeviceName;
  return comparable;
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
  refs.conflictList.innerHTML = conflicts.map((conflict, index) => `
    <section class="conflict-card">
      <h3>${escapeHtml(conflict.label)}</h3>
      <p>${escapeHtml(conflictSummary(conflict))}</p>
      <div class="conflict-choice">
        <label>
          <input type="radio" name="conflict-${index}" value="local" checked />
          <span>Моё</span>
          <small>${escapeHtml(conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name))}</small>
        </label>
        <label>
          <input type="radio" name="conflict-${index}" value="remote" />
          <span>С сервера</span>
          <small>${escapeHtml(conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, "другое устройство"))}</small>
        </label>
      </div>
    </section>
  `).join("");
  refs.conflictDialog.returnValue = "";
  return new Promise((resolve) => {
    const cleanup = () => {
      refs.conflictDialog.removeEventListener("close", handleClose);
      refs.conflictServerBtn.onclick = null;
      refs.conflictApplyBtn.onclick = null;
    };
    const readChoices = () => Object.fromEntries(conflicts.map((_, index) => {
      const selected = refs.conflictList.querySelector(`input[name="conflict-${index}"]:checked`);
      return [index, selected?.value || "local"];
    }));
    const handleClose = () => {
      const result = refs.conflictDialog.returnValue === "server" ? "server" : readChoices();
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

function conflictSummary(conflict) {
  const localText = conflictValueSummary(conflict, conflict.localValue, conflict.localHas);
  const remoteText = conflictValueSummary(conflict, conflict.remoteValue, conflict.remoteHas);
  const localStamp = conflictVersionStamp(conflict.localValue, conflict.localHas, syncDevice.name);
  const remoteStamp = conflictVersionStamp(conflict.remoteValue, conflict.remoteHas, "другое устройство");
  return `Моё: ${localText} (${localStamp}). Сервер: ${remoteText} (${remoteStamp}).`;
}

function conflictVersionStamp(value, exists, fallbackDevice) {
  if (!exists) return "удалено";
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

function conflictValueSummary(conflict, value, exists) {
  if (!exists) return "удалено";
  if (conflict.type === "item") {
    return [value.name, value.location, itemCategories(value).join(", ")].filter(Boolean).join(" · ") || "изменено";
  }
  if (conflict.type === "container" || conflict.type === "layout") return value.name || "изменено";
  if (conflict.type === "packed") return value ? "собрано" : "не собрано";
  if (conflict.type === "collapsed") return value ? "свернуто" : "развернуто";
  if (conflict.type === "setting") return String(value);
  return "изменено";
}

function currentUserEmail() {
  return String(currentUser?.email || currentUser?.user?.email || "").trim().toLowerCase();
}

function isOwnerUser() {
  return currentUserEmail() === OWNER_EMAIL;
}

function isNetworkError(error) {
  return Boolean(error?.isNetworkError);
}

function createNetworkError(message, cause = null) {
  const networkError = new Error(message);
  networkError.isNetworkError = true;
  networkError.cause = cause;
  return networkError;
}

function unlockOfflineState(message = "Офлайн · показаны сохранённые данные") {
  if (isExplicitlySignedOut()) return;
  currentUser = null;
  appUnlocked = true;
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

function updateSyncUi(message = "") {
  const loggedIn = Boolean(currentUser);
  const unlocked = loggedIn || appUnlocked;
  const forcedOffline = isForcedOffline();
  document.body.classList.toggle("auth-gated", !unlocked);
  refs.authBtn.textContent = loggedIn ? "Выйти" : "Войти";
  refs.forceOfflineBtn.textContent = forcedOffline ? "Включить онлайн" : "Работать офлайн";
  refs.forceOfflineBtn.classList.toggle("active", forcedOffline);
  refs.collectionMenuBtn.textContent = state.collectionMode ? "Выключить сбор" : "Режим сбора";
  refs.collectionMenuBtn.classList.toggle("active", state.collectionMode);
  refs.syncBtn.disabled = !loggedIn && !appUnlocked;
  updateSyncVisualState({ loggedIn, unlocked, message });
  if (message) {
    refs.syncStatus.textContent = message;
    return;
  }
  if (forcedOffline && appUnlocked) {
    refs.syncStatus.textContent = "Принудительно офлайн · API отключён";
    return;
  }
  if (!loggedIn && appUnlocked) {
    refs.syncStatus.textContent = "Офлайн · показаны сохранённые данные";
    return;
  }
  if (!loggedIn) {
    refs.syncStatus.textContent = "Локально · войдите для синхронизации";
    return;
  }
  refs.syncStatus.textContent = syncMeta.dirty ? "Вход выполнен · есть несинхронизированные изменения" : "Вход выполнен · синхронизировано";
}

function updateSyncVisualState({ loggedIn, unlocked, message = "" }) {
  let nextState = "local";
  const lowerMessage = message.toLowerCase();
  if (isForcedOffline()) {
    nextState = "offline";
  } else if (lowerMessage.includes("не удалось") || lowerMessage.includes("нет соединения") || lowerMessage.includes("сервер недоступен")) {
    nextState = "error";
  } else if (!loggedIn && unlocked) {
    nextState = "offline";
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
        ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {})
      }
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "сервер не ответил вовремя" : "нет соединения с сервером";
    throw createNetworkError(message, error);
  } finally {
    window.clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const apiError = new Error(data?.error || data?.message || `HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.data = data;
    throw apiError;
  }
  return data;
}

async function checkAuthAndLoad({ syncDirtyNotify = false } = {}) {
  if (isForcedOffline()) {
    if (hasLocalSavedState() && !isExplicitlySignedOut()) unlockOfflineState("Принудительно офлайн · показаны сохранённые данные");
    else updateSyncUi("Принудительно офлайн · локальная копия не найдена");
    return;
  }
  try {
    updateSyncUi("Проверяю вход...");
    const data = await apiFetch("/auth/me");
    currentUser = data.user || data.me || data.account || null;
    if (!currentUser && (data.id || data.email)) currentUser = { id: data.id, email: data.email };
    if (!currentUser) {
      appUnlocked = false;
      updateSyncUi();
      return;
    }
    setExplicitlySignedOut(false);
    if (syncMeta.dirty && hasLocalSavedState()) {
      appUnlocked = true;
      updateSyncUi("Есть локальные изменения · проверяю даты...");
      await loadRemoteState({ notifyDirtySave: syncDirtyNotify });
      return;
    }
    updateSyncUi("Вход выполнен · загружаю данные...");
    await loadRemoteState();
  } catch (error) {
    currentUser = null;
    if (isNetworkError(error) && hasLocalSavedState()) {
      unlockOfflineState();
      return;
    }
    appUnlocked = false;
    updateSyncUi();
  }
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
    appUnlocked = false;
    setExplicitlySignedOut(true);
    updateSyncUi();
    showToast("Вы вышли. Для доступа к списку войдите снова.", "success");
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
  try {
    localStorage.setItem(AUTH_EMAIL_KEY, email);
  } catch {
    // Email autocomplete is a convenience only; auth does not depend on localStorage.
  }
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
    if (value) localStorage.setItem(AUTH_SIGNED_OUT_KEY, "1");
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
    if (value) localStorage.setItem(FORCE_OFFLINE_KEY, "1");
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
    if (hasLocalSavedState() && !isExplicitlySignedOut()) appUnlocked = true;
    updateSyncUi("Принудительно офлайн · синхронизация отключена");
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
  if (!currentUser) {
    const hadLocalChanges = syncMeta.dirty;
    await checkAuthAndLoad({ syncDirtyNotify: force });
    if (!currentUser) {
      if (force) showToast(appUnlocked ? "Офлайн: войдите, когда появится интернет." : "Нужно войти для синхронизации.", "error");
      return;
    }
    if (force && hadLocalChanges && !syncMeta.dirty) return;
  }
  if (!force && !syncMeta.dirty) {
    updateSyncUi();
    return;
  }
  if (force && !syncMeta.dirty) {
    updateSyncUi();
    showToast("Уже синхронизировано.", "success");
    return;
  }
  if (force && syncMeta.dirty) {
    updateSyncUi("Есть локальные изменения · проверяю даты...");
    await loadRemoteState({ notifyDirtySave: true });
    return;
  }
  await saveRemoteState({ notify: force });
}

function buildRemoteSaveBody({ forceOverwrite = false } = {}) {
  const sourceUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  return {
    scopeKey: DATA_SCOPE_KEY,
    itemKey: DATA_ITEM_KEY,
    baseServerUpdatedAt: syncMeta.serverUpdatedAt || null,
    clientUpdatedAt: sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    sourceUpdatedAt,
    sourceDeviceId: syncDevice.id,
    sourceDeviceName: syncDevice.name,
    forceOverwrite,
    payload: serializeState({ forSync: true })
  };
}

async function saveRemoteState({ notify = false, forceOverwrite = false } = {}) {
  if (!currentUser) return;
  try {
    updateSyncUi("Сохраняю на сервер...");
    const data = await apiFetch("/bike-packing-data.json", {
      method: "POST",
      body: JSON.stringify(buildRemoteSaveBody({ forceOverwrite }))
    });
    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = remoteUpdatedAt(data.record) || new Date().toISOString();
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    updateSyncUi();
    if (notify) showToast("Синхронизация завершена.", "success");
  } catch (error) {
    syncMeta.dirty = true;
    saveSyncMeta();
    if (error.status === 409) {
      await handleRemoteSaveConflict(error, { notify });
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

async function handleRemoteSaveConflict(error, { notify = false } = {}) {
  const record = error.data?.record || error.data?.currentRecord || null;
  const remoteState = normalizeRemoteState(record?.payload || error.data?.payload);
  const updatedAt = remoteUpdatedAt(record) || error.data?.serverUpdatedAt || null;
  appUnlocked = true;
  updateSyncUi("Сервер изменился · нужно выбрать версию...");
  if (!remoteState) {
    if (notify) showToast("Сервер сообщил о конфликте. Локальные изменения не отправлены.", "error");
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
  applyRemoteState(remoteState, updatedAt);
  if (notify) showToast("Загружена серверная версия.", "success");
}

async function loadRemoteState({ notifyDirtySave = false } = {}) {
  if (!currentUser) return;
  const params = new URLSearchParams({ scopeKey: DATA_SCOPE_KEY, itemKey: DATA_ITEM_KEY });
  try {
    const data = await apiFetch(`/bike-packing-data.json?${params.toString()}`);
    const record = data.record;
    const remoteState = normalizeRemoteState(record?.payload);
    const serverTimeText = remoteUpdatedAt(record);
    const serverTime = timeValue(serverTimeText);
    const localTime = timeValue(syncMeta.localUpdatedAt);
    if (!remoteState) {
      if (syncMeta.dirty && hasLocalSavedState()) {
        appUnlocked = true;
        updateSyncUi("На сервере пока пусто · сохраняю локальные изменения...");
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      if (!isOwnerUser()) {
        replaceState(createEmptyUserState());
        syncMeta.dirty = true;
        saveSyncMeta();
        renderPreservingPackingScroll();
      }
      appUnlocked = true;
      updateSyncUi("На сервере пока пусто · отправляю локальные данные...");
      await saveRemoteState();
      return;
    }

    const localJson = JSON.stringify(serializeState({ forSync: true }));
    const remoteJson = JSON.stringify(cloneStateForSync(remoteState, { forSync: true }));
    if (localJson !== remoteJson) {
      if (!syncMeta.dirty) {
        applyRemoteState(remoteState, serverTimeText);
        return;
      }
      if (!serverChangedSinceLastSync(serverTime) || localTime >= serverTime) {
        appUnlocked = true;
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
        renderPreservingPackingScroll();
        updateSyncUi("Изменения объединены · отправляю на сервер...");
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      if (!mergeResult.merged) {
        appUnlocked = true;
        updateSyncUi("Найдены разные версии укладки...");
        const useServer = await askConfirmDialog({
          title: "Есть конфликты изменений",
          text: `Некоторые элементы менялись и здесь, и на другом устройстве:\n\n${formatMergeConflicts(mergeResult.conflicts)}\n\nЗагрузить серверную версию? Если оставить локальную, она будет отправлена на сервер.`,
          okText: "Загрузить серверную",
          cancelText: "Оставить локальную"
        });
        if (useServer) {
          applyRemoteState(remoteState, serverTimeText);
          return;
        }
        syncMeta.dirty = true;
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      appUnlocked = true;
      updateSyncUi("Есть конфликты изменений...");
      const resolution = await askConflictResolution(mergeResult.conflicts);
      if (resolution === "server") {
        applyRemoteState(remoteState, serverTimeText);
        return;
      }
      applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
      replaceState(mergeResult.merged);
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      renderPreservingPackingScroll();
      updateSyncUi("Конфликты объединены · отправляю на сервер...");
      await saveRemoteState({ notify: notifyDirtySave });
      return;
    }

    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = serverTimeText || null;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    saveBaseState(remoteState);
    saveSyncMeta();
    appUnlocked = true;
    updateSyncUi();
  } catch (error) {
    if (isNetworkError(error) && hasLocalSavedState()) {
      appUnlocked = true;
      updateSyncUi("Офлайн · показаны сохранённые данные");
      return;
    }
    appUnlocked = false;
    updateSyncUi(`Сервер недоступен: ${error.message}`);
  }
}

function startRemoteStateWatcher() {
  if (remoteRefreshTimer) window.clearInterval(remoteRefreshTimer);
  remoteRefreshTimer = window.setInterval(() => checkRemoteStateFreshness(), REMOTE_REFRESH_INTERVAL_MS);
}

async function checkRemoteStateFreshness({ notify = false } = {}) {
  if (isForcedOffline()) return;
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

async function openHistoryDialog() {
  if (isForcedOffline()) {
    showToast("История недоступна в офлайн-режиме.", "error");
    return;
  }
  if (!currentUser) {
    showToast("История доступна после входа.", "error");
    return;
  }
  refs.historyStatus.className = "dialog-status";
  refs.historyStatus.textContent = "Загружаю историю...";
  refs.historyList.innerHTML = "";
  openModalDialog(refs.historyDialog);
  try {
    historyRecords = await loadRemoteHistory();
    renderHistoryRecords(historyRecords);
  } catch (error) {
    refs.historyStatus.className = "dialog-status error";
    refs.historyStatus.textContent = `Не удалось загрузить историю: ${error.message}`;
  }
}

async function loadRemoteHistory() {
  const params = new URLSearchParams({ scopeKey: DATA_SCOPE_KEY, itemKey: DATA_ITEM_KEY });
  const data = await apiFetch(`/bike-packing-data-history.json?${params.toString()}`);
  const records = Array.isArray(data.records) ? data.records : [];
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
    refs.historyStatus.textContent = "Истории пока нет. Она появится после нескольких успешных синхронизаций.";
    refs.historyList.innerHTML = "";
    return;
  }
  refs.historyStatus.className = "dialog-status success";
  refs.historyStatus.textContent = `Найдено версий: ${records.length}`;
  refs.historyList.innerHTML = records.map((record) => {
    const payload = normalizeRemoteState(record.payload);
    const summary = summarizeHistoryPayload(payload);
    const createdAt = formatHistoryDateTime(record.createdAt || record.created_at);
    const sourceAt = formatHistoryDateTime(record.sourceUpdatedAt || record.source_updated_at);
    const device = record.sourceDeviceName || record.source_device_name || "устройство не указано";
    return `
      <article class="history-record">
        <div>
          <strong>${escapeHtml(createdAt || "без даты")}</strong>
          <p>${escapeHtml(summary)}</p>
          <small>${escapeHtml(device)}${sourceAt ? ` · изменение: ${escapeHtml(sourceAt)}` : ""}</small>
        </div>
        <button type="button" class="ghost" data-restore-history="${escapeHtml(String(record.id))}">Восстановить</button>
      </article>
    `;
  }).join("");
  refs.historyList.querySelectorAll("[data-restore-history]").forEach((button) => {
    button.addEventListener("click", () => restoreHistoryRecord(button.dataset.restoreHistory));
  });
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
  const restoredState = normalizeRemoteState(record?.payload);
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
  replaceState(restoredState);
  syncMeta.dirty = true;
  syncMeta.localUpdatedAt = nowIso();
  saveSyncMeta();
  appUnlocked = true;
  renderPreservingPackingScroll();
  updateSyncUi("Восстанавливаю версию на сервере...");
  await saveRemoteState({ notify: true, forceOverwrite: true });
  showToast("Версия восстановлена.", "success");
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
  capturePackingScroll();
  renderFilters();
  renderSummary();
  renderPacking();
  renderItems();
  renderBags();
  renderSettings();
  updateViewScopedControls();
  updateFilterNavigationUi();
  scheduleFixedScrollbarRefresh();
}

function getCurrentView() {
  return document.querySelector(".tab.active")?.dataset.view || "packing";
}

function updateViewScopedControls(view = getCurrentView()) {
  const filtersVisible = view === "packing" || view === "items" || view === "bags";
  const categoryVisible = view === "packing" || view === "items";
  const stableMobileControls = shouldKeepScopedControlsStable();
  document.querySelectorAll("[data-main-filter-control]").forEach((element) => {
    const isCollectionActions = element === refs.collectionActions;
    const isCategoryFilter = element === refs.categoryFilterLabel;
    const visible = isCollectionActions
      ? view === "packing" && state.collectionMode
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
  setScopedControlState(refs.metaToggleBtn, view === "packing" || view === "items", false);
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

function renderFilters() {
  fillSelect(refs.layoutSelect, Object.values(state.layouts).map((layout) => [layout.id, layout.name]), state.activeLayoutId);
  fillSelect(refs.layoutCopyFrom, Object.values(state.layouts).map((layout) => [layout.id, layout.name]), state.activeLayoutId);
  selectedCategoryFilters = selectedCategoryFilters.filter((category) => state.categories.includes(category));
  const locationOptions = getAvailableLocationFilterOptions();
  fillSelect(refs.locationFilter, [["", "Все места"], ...locationOptions.map((loc) => [loc, loc])], refs.locationFilter.value);
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
  const label = state.showItemMeta ? "Скрыть метки" : "Показать метки";
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
    refs.categoryFilter.textContent = "Все категории";
  } else if (count === 1) {
    refs.categoryFilter.textContent = selectedCategoryFilters[0];
  } else {
    refs.categoryFilter.textContent = `${count} категории`;
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
  const items = Object.values(state.items)
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
  const activeIds = new Set(state.layouts[state.activeLayoutId]?.rootContainerIds || []);
  const roots = getRootContainers()
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
  const active = Boolean(containerId && getRootContainerDialogLayoutRootIds().includes(containerId));
  refs.rootContainerPlacementField.hidden = !containerId;
  refs.rootContainerPlacementBtn.textContent = active ? "В текущей укладке" : "Выбрать место в укладке";
  refs.rootContainerPlacementBtn.classList.toggle("active", active);
}

function openRootPlacementDialog() {
  const containerId = editingRootContainerId;
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  refs.rootPlacementTitle.textContent = `Добавить «${container.name}»`;
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
  const layout = state.layouts[state.activeLayoutId];
  return [...(layout?.rootContainerIds || [])];
}

function applyRootContainerDialogPlacement() {
  if (!rootContainerDialogPendingRootIds) return false;
  const layout = state.layouts[state.activeLayoutId];
  if (!layout) return false;
  const currentIds = layout.rootContainerIds || [];
  if (snapshotsEqual(currentIds, rootContainerDialogPendingRootIds)) return false;
  layout.rootContainerIds = [...rootContainerDialogPendingRootIds];
  touchActiveLayout();
  return true;
}

function addRootContainerToActiveLayout(containerId, targetIndex = null, { closeDialog = true, renderAfter = true } = {}) {
  const layout = state.layouts[state.activeLayoutId];
  if (!layout || !state.containers[containerId]) return;
  layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => id !== containerId);
  const index = targetIndex === null
    ? layout.rootContainerIds.length
    : Math.max(0, Math.min(targetIndex, layout.rootContainerIds.length));
  layout.rootContainerIds.splice(index, 0, containerId);
  touchActiveLayout();
  saveState();
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
  parent.childIds = parent.childIds || [];
  parent.childIds.push(id);
  parent.order = parent.order || [];
  parent.order.push({ type: "container", id });
  state.collapsedContainers[parentId] = false;
  state.collapsedContainers[id] = false;
  touchContainer(parentId, changedAt);
  saveLocalUiState();
  saveState();
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
  return Object.values(state.items);
}

function getAvailableLocationFilterOptions() {
  const currentLocation = refs.locationFilter.value;
  const available = new Set();
  if (getCurrentView() === "bags") {
    getRootContainers().forEach((container) => {
      if (matchesRootContainerFieldsFilter(container, { ignoreLocation: true })) {
        available.add(container.location || defaultRootContainerLocation());
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
  select.innerHTML = entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
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

function openContainerPickerDialog(event) {
  event?.preventDefault();
  renderContainerPicker();
  openModalDialog(refs.containerPickerDialog);
}

function renderContainerPicker() {
  const layout = state.layouts[state.activeLayoutId];
  const rootIds = layout?.rootContainerIds || [];
  refs.containerPickerBoard.innerHTML = rootIds.map(renderContainerPickerColumn).join("") ||
    `<div class="empty">В текущей укладке нет верхних элементов</div>`;
  refs.containerPickerNoneBtn.classList.toggle("active", !refs.itemContainer.value);
  refs.containerPickerNoneBtn.textContent = refs.itemContainer.value ? "Убрать из укладки" : "Вне укладки";
  refs.containerPickerBoard.querySelectorAll("[data-pick-container]").forEach((button) => {
    button.addEventListener("click", () => selectItemContainer(button.dataset.pickContainer));
  });
  bindHorizontalTouchScroll(refs.containerPickerBoard);
}

function renderContainerPickerColumn(containerId) {
  const container = state.containers[containerId];
  if (!container) return "";
  const selected = refs.itemContainer.value === containerId;
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
  return (container.order || []).map((entry) => {
    if (entry.type !== "container") return "";
    const child = state.containers[entry.id];
    if (!child) return "";
    const selected = refs.itemContainer.value === child.id;
    return `
      <button
        class="container-picker-node ${selected ? "selected" : ""}"
        type="button"
        data-pick-container="${child.id}"
        style="--level: ${level}"
      >
        <span>${escapeHtml(child.name)}</span>
        <small>${formatWeight(containerWeight(child.id))}</small>
      </button>
      ${renderContainerPickerChildren(child.id, level + 1)}
    `;
  }).join("");
}

function selectItemContainer(containerId) {
  refs.itemContainer.value = containerId || "";
  updateItemContainerPickerButton();
  updateItemDialogSaveState();
  refs.containerPickerDialog.close();
}

function updateItemContainerPickerButton() {
  const containerId = refs.itemContainer.value;
  refs.itemContainerPickerBtn.textContent = containerId && state.containers[containerId]
    ? containerPath(containerId)
    : "Вне укладки";
  refs.itemContainerPickerBtn.classList.toggle("active", Boolean(containerId && state.containers[containerId]));
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
  const view = getCurrentView();
  const isPackingView = view === "packing";
  const isFiltered = isSummaryFiltered(view);
  if (view === "bags") {
    const containers = getSummaryRootContainers();
    const totalWeight = containers.reduce((sum, container) => sum + Number(container.weight || 0), 0);
    const notHome = containers.filter((container) => {
      const location = container.location || defaultRootContainerLocation();
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
    metric(formatWeight(totalWeight), filteredLabel("общий вес", isFiltered)),
    metric(String(visibleItems.length), filteredLabel("вещей показано", isFiltered)),
    metric(String(notHome), filteredLabel("не дома и не на веле", isFiltered)),
    metric(String(unknownWeight), filteredLabel("без веса", isFiltered))
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
  return Object.values(state.items).filter((item) => matchesItemFieldsFilter(item, { includeContainerPath: true }));
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

function renderPacking() {
  const layout = state.layouts[state.activeLayoutId];
  const rootIds = layout.rootContainerIds || [];
  const columns = hasActiveContentFilter() && !isFilterContextActive()
    ? rootIds.filter(containerHasVisibleFilterResult).map(renderFilteredContainer)
    : rootIds.map(renderContainer);
  refs.packingView.innerHTML = `<div class="board">${columns.join("") || `<div class="empty board-empty">Ничего не найдено</div>`}</div>`;
  bindPackingEvents(refs.packingView);
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
          <span>${formatWeight(total)}</span>
        </div>
      </header>
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
          <span>${formatWeight(containerWeight(containerId))}</span>
        </div>
      </div>
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
          <span>${formatWeight(containerWeight(containerId))}</span>
        </div>
      </div>
      <div class="dropzone" data-container-id="${container.id}">
        ${collapsed ? "" : renderFilteredContainerContents(container.id)}
      </div>
    </section>
  `;
}

function renderContainerContents(containerId) {
  const container = state.containers[containerId];
  migrateContainerOrder();
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
  migrateContainerOrder();
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
    </article>
  `;
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
    </article>
  `;
}

function renderBags() {
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

function renderSettings() {
  refs.settingsView.innerHTML = `
    <div class="settings-grid">
      ${renderDictionary("Места хранения", "location", state.locations)}
      ${renderDictionary("Категории", "category", state.categories)}
    </div>
  `;
  bindDictionary("location");
  bindDictionary("category");
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
  refs.confirmOkBtn.classList.toggle("danger-action", isDestructiveAction);
  refs.confirmDialog.classList.toggle("danger-confirm-dialog", isDestructiveAction);
  refs.confirmDialog.returnValue = "";
  return new Promise((resolve) => {
    const cleanup = () => {
      refs.confirmDialog.removeEventListener("close", handleClose);
      refs.confirmCancelBtn.onclick = null;
      refs.confirmOkBtn.onclick = null;
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

function showToast(message, type = "") {
  if (!refs.toastRegion) return;
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
          ${meta ? `<span class="root-container-meta">${highlight(meta)}</span>` : ""}
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
  if (oldContainerId && oldContainerId !== targetContainerId) cleanupEmptyContainers(oldContainerId);
  saveState();
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
  if (oldParentId && oldParentId !== targetParentId) cleanupEmptyContainers(oldParentId);
  saveState();
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

  targetParent.childIds.push(groupId);
  targetParent.order = targetParent.order || [];
  targetParent.order.splice(Math.min(insertIndex, targetParent.order.length), 0, { type: "container", id: groupId });
  targetItem.containerId = groupId;
  item.containerId = groupId;
  touchItem(itemId, changedAt);
  touchItem(targetItemId, changedAt);
  touchContainer(targetParent.id, changedAt);
  if (sourceParent.id !== targetParent.id) touchContainer(sourceParent.id, changedAt);
  state.collapsedContainers[groupId] = false;
  editingContainerId = groupId;
  if (sourceParent.id !== targetParent.id) cleanupEmptyContainers(sourceParent.id);
  saveState();
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
  cleanupEmptyContainers(containerId);
  saveState();
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
  Object.values(state.containers).forEach((container) => {
    const hadItem = (container.itemIds || []).includes(itemId) ||
      (container.order || []).some((entry) => entry.type === "item" && entry.id === itemId);
    container.itemIds = (container.itemIds || []).filter((id) => id !== itemId);
    container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
    if (hadItem) markEdited(container, changedAt);
  });
  delete state.items[itemId];
  delete state.packedItems?.[itemId];
  if (oldContainerId) cleanupEmptyContainers(oldContainerId);
  saveState();
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
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
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
  render();
  showToast(container ? "Вещь скопирована рядом с исходной." : "Вещь скопирована вне укладки.", "success");
}

function copyRootContainer(containerId) {
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
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
  saveState();
  render();
  showToast("Сумка или место скопированы пустыми вне укладки.", "success");
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
  render();
}

function removeRootContainerFromActiveLayout(containerId) {
  const layout = state.layouts[state.activeLayoutId];
  const container = state.containers[containerId];
  if (!layout || !container || container.parentId) return;
  const changedAt = nowIso();
  clearRootContainerContents(containerId, changedAt);
  layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => id !== containerId);
  markEdited(layout, changedAt);
  saveState();
  render();
}

function clearRootContainerContents(containerId, changedAt = nowIso()) {
  const container = state.containers[containerId];
  if (!container || container.parentId) return;
  getContainerItemIdsDeep(containerId).forEach((itemId) => {
    if (!state.items[itemId]) return;
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
  const layout = state.layouts[state.activeLayoutId];
  const originalIndex = layout.rootContainerIds.indexOf(containerId);
  return targetIndex === originalIndex;
}

function moveRootColumn(containerId, targetIndex) {
  const layout = state.layouts[state.activeLayoutId];
  if (!layout.rootContainerIds.includes(containerId)) return;
  capturePackingScroll();
  layout.rootContainerIds = layout.rootContainerIds.filter((id) => id !== containerId);
  const index = Math.max(0, Math.min(targetIndex, layout.rootContainerIds.length));
  layout.rootContainerIds.splice(index, 0, containerId);
  touchActiveLayout();
  saveState();
  render();
}

function openRootContainerDialog(containerId = null) {
  const container = containerId ? state.containers[containerId] : null;
  if (containerId && (!container || container.parentId)) return;
  editingRootContainerId = containerId || null;
  rootContainerDialogPendingRootIds = null;
  refs.rootContainerDialogTitle.textContent = containerId ? "Редактировать сумку или место" : "Добавить сумку или место";
  refs.rootContainerName.value = container?.name || "";
  refs.rootContainerWeight.value = Number(container?.weight || 0);
  refs.rootContainerVolume.value = container?.volume ? String(container.volume).replace(".", ",") : "";
  if (refs.rootContainerColor) refs.rootContainerColor.value = container?.color || "";
  fillRootContainerLocationSelect(container?.location || defaultRootContainerLocation());
  updateRootContainerPlacementButton();
  refs.rootContainerNote.value = container?.note || "";
  rootContainerDialogInitialSnapshot = getRootContainerDialogSnapshot();
  updateRootContainerDialogSaveState();
  openModalDialog(refs.rootContainerDialog);
}

function fillRootContainerLocationSelect(selected = "") {
  const fallback = defaultRootContainerLocation();
  const options = state.locations.map((location) => [location, location]);
  fillSelect(refs.rootContainerLocation, options, selected || fallback);
}

function openItemDialog(itemId = null) {
  editingItemId = itemId;
  const item = itemId ? state.items[itemId] : {
    name: "",
    weight: 0,
    quantity: 1,
    location: state.locations[0],
    category: "Прочее",
    categories: ["Прочее"],
    containerId: "",
    note: ""
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
  refs.itemNote.value = item.note || "";
  itemDialogInitialSnapshot = getItemDialogSnapshot();
  updateItemDialogSaveState();
  openModalDialog(refs.dialog);
}

function openLayoutDialog() {
  refs.layoutName.value = "Новая укладка";
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
  const shouldCopy = refs.layoutCreateMode.value === "copy";
  const source = state.layouts[refs.layoutCopyFrom.value] || state.layouts[state.activeLayoutId];
  const name = refs.layoutName.value.trim();
  if (!name) return;
  const id = `layout-${Date.now()}`;
  state.layouts[id] = {
    id,
    name,
    rootContainerIds: shouldCopy ? [...source.rootContainerIds] : [],
    ...currentEditMeta()
  };
  state.activeLayoutId = id;
  saveState();
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
    refs.rootContainerDialog.close("cancel");
    return;
  }
  if (isEditableElement(document.activeElement)) {
    document.activeElement.blur();
  }
}

function getItemDialogSnapshot() {
  return {
    name: refs.itemName.value.trim(),
    weight: parseWeightInput(refs.itemWeight.value),
    quantity: readItemDialogQuantity(),
    location: refs.itemLocation.value,
    categories: getDialogCheckedCategories().join("\u0000"),
    containerId: refs.itemContainer.value || "",
    note: refs.itemNote.value.trim()
  };
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
    location: refs.rootContainerLocation.value || defaultRootContainerLocation(),
    note: refs.rootContainerNote.value.trim(),
    layoutRootIds: editingRootContainerId ? getRootContainerDialogLayoutRootIds().join("\u0000") : ""
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

function updateRootContainerDialogSaveState() {
  if (!refs.saveRootContainerBtn) return;
  const snapshot = getRootContainerDialogSnapshot();
  const hasName = Boolean(snapshot.name);
  const changed = !rootContainerDialogInitialSnapshot || !snapshotsEqual(snapshot, rootContainerDialogInitialSnapshot);
  refs.saveRootContainerBtn.disabled = !hasName || !changed;
  refs.saveRootContainerBtn.classList.toggle("muted-save", refs.saveRootContainerBtn.disabled);
}

function saveRootContainerDialog(event) {
  event.preventDefault();
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
      location: refs.rootContainerLocation.value || defaultRootContainerLocation(),
      note: refs.rootContainerNote.value.trim(),
      ...currentCreateMeta(changedAt)
    };
    refs.rootContainerDialog.close();
    saveState();
    render();
    return;
  }
  container.name = name;
  container.weight = parseWeightInput(refs.rootContainerWeight.value);
  container.volume = parseVolumeInput(refs.rootContainerVolume.value);
  container.color = normalizeContainerColor(refs.rootContainerColor?.value);
  container.location = refs.rootContainerLocation.value || defaultRootContainerLocation();
  container.note = refs.rootContainerNote.value.trim();
  touchContainer(container.id, changedAt);
  applyRootContainerDialogPlacement();
  refs.rootContainerDialog.close();
  saveState();
  render();
}

function saveDialogItem(event) {
  event.preventDefault();
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
    touchItem(editingItemId, changedAt);
    if (previousContainerId !== containerId) {
      refs.dialog.close();
      if (containerId) {
        moveItem(editingItemId, containerId, null, { captureScroll: false });
        return;
      }
      detachItemFromContainer(editingItemId, previousContainerId, { captureScroll: false, changedAt });
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
      ...currentEditMeta(changedAt)
    };
    if (containerId && state.containers[containerId]) {
      state.containers[containerId].itemIds.push(id);
      state.containers[containerId].order = state.containers[containerId].order || [];
      state.containers[containerId].order.push({ type: "item", id });
      touchContainer(containerId, changedAt);
    }
  }

  saveState();
  refs.dialog.close();
  render();
}

function getFilteredItems() {
  return Object.values(state.items).filter(matchesFilters);
}

function getActiveLayoutItems() {
  return Object.values(state.items).filter((item) => !isItemRemovedFromActiveLayout(item) && isItemInActiveLayout(item));
}

function getItemsForItemsView() {
  const items = Object.values(state.items).filter((item) => {
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

function itemCreatedTime(item) {
  const created = timeValue(item?.createdAt || item?.created_at);
  if (created) return created;
  const idTime = Number(String(item?.id || "").match(/^item-(\d+)/)?.[1] || 0);
  if (idTime) return idTime;
  return timeValue(item?.updatedAt || item?.updated_at);
}

function getItemsUsageCounts() {
  return Object.values(state.items).filter(matchesItemsViewFilters).reduce(
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

function isItemAwayFromHomeAndBike(item) {
  return item.location !== "Дом" && item.location !== "Уже на велосипеде";
}

function isItemWithoutWeight(item) {
  return !Number(item?.weight || 0);
}

function isItemInActiveLayout(item) {
  if (!item?.containerId) return false;
  const layout = state.layouts[state.activeLayoutId];
  if (!layout) return false;
  return getActiveLayoutContainerIdSet(layout).has(item.containerId);
}

function getActiveLayoutContainerIdSet(layout = state.layouts[state.activeLayoutId]) {
  const ids = new Set();
  (layout?.rootContainerIds || []).forEach((rootId) => {
    ids.add(rootId);
    getDescendantContainerIds(rootId).forEach((id) => ids.add(id));
  });
  return ids;
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
    .filter((container) => !container.parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function getRootContainersForSettings() {
  const roots = Object.values(state.containers).filter((container) => {
    if (container.parentId) return false;
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
  const containerLocation = container.location || defaultRootContainerLocation();
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
  return Object.values(state.containers).filter((container) => !container.parentId).reduce(
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
  const layout = state.layouts[state.activeLayoutId];
  return Boolean(layout?.rootContainerIds?.includes(containerId));
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

function parseWeightInput(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
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

function parseVolumeInput(value) {
  const number = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 10) / 10;
}

function formatVolume(liters) {
  const number = Number(liters || 0);
  if (!number) return "0 л";
  return `${String(number).replace(".", ",")} л`;
}

function formatWeight(grams) {
  if (!grams) return "0 г";
  if (grams < 1000) return `${grams} г`;
  return `${(grams / 1000).toFixed(1).replace(".", ",")} кг`;
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
  migrateContainerOrder();
  const layout = state.layouts[state.activeLayoutId];
  const generatedAt = new Date().toLocaleString("ru-RU");
  const totalWeight = layout.rootContainerIds.reduce((sum, id) => sum + containerWeight(id), 0);
  const itemCount = layout.rootContainerIds.reduce((sum, id) => sum + countItemsInContainer(id), 0);
  const missingCount = layout.rootContainerIds.reduce((sum, id) => sum + countItemsByLocation(id, ["Надо купить", "Не знаю где"]), 0);

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
      ${layout.rootContainerIds.map((id) => renderPrintableContainer(id, true)).join("")}
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
  const message = isOwnerUser()
    ? "Сбросить прототип к исходному списку из Word?"
    : "Сбросить демо-укладку к начальному примеру?";
  openConfirmDialog({
    title: "Сбросить данные?",
    text: message,
    okText: "Сбросить",
    onConfirm: () => {
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, isOwnerUser() ? createSeedState() : createEmptyUserState());
      normalizeItemFields(state);
      normalizeItemCategories(state);
      saveState();
      render();
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
