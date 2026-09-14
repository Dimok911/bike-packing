import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveStoredPrivateLayoutChoice,
  resolveStoredPrivateLayoutChoiceForState
} from "../../src/storage/active-choice.js";
import {
  cloneStateForSyncPayload
} from "../../src/sync/serialize.js";
import {
  installRuntimeActiveLayoutId
} from "../../src/state/active-layout-runtime.js";
import { layoutDisplayNameForLanguage } from "../../src/state/layout-normalize.js";
import {
  containerCategories,
  itemCategories,
  normalizeItemCategories,
  normalizeItemFields,
  normalizeContainerFields
} from "../../src/state/normalize.js";
import {
  itemTotalWeight,
  layoutContainersOwnWeight
} from "../../src/state/metrics.js";
import {
  checkAuthAndLoadFlow,
  isAuthCheckUnavailableError
} from "../../src/sync/auth-load-flow.js";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import { canUseCachedStartupState, STARTUP_CACHE_INTEGRITY_VERSION } from "../../src/sync/list-freshness.js";
import {
  OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE,
  offlineRememberedStatusMessages,
  syncAccountLabelWithEmailWrap,
  updateSyncUiControls
} from "../../src/ui/sync-ui.js";
import {
  createLayoutLoadStatusController,
  countPrivateLayouts,
  formatLayoutLoadProgress,
  formatPersonalLayoutsLoadedStatus
} from "../../src/ui/layout-load-status.js";
import {
  isNewItemPlacementPickerMode,
  itemDialogContainerPickerMode,
  itemDialogTargetLayoutFromPicker,
  saveItemDialogAction
} from "../../src/ui/item-dialog-save.js";
import { shouldPreserveLinkedSharedListOnLanguageChange } from "../../src/public/shared-link-language.js";
import { readSharedListPublishOptions } from "../../src/public/shared-list-publish.js";
import {
  normalizeInlineCategoryName,
  renderEmptyCategoryPicker
} from "../../src/ui/category-picker-empty.js";
import {
  bindCategoryFilterResetVisibility,
  categoryMatchesSearch,
  highlightCategorySearchMatch,
  normalizeCategorySearchQuery,
  renderCategorySearchOption
} from "../../src/ui/category-search.js";

const root = resolve(import.meta.dirname, "../..");
const privateIds = new Set(["layout-a", "layout-b", "layout-c"]);
const normalizeChoice = (choice) => String(choice || "").trim();
const isPrivateChoice = (choice) => Boolean(choice && !choice.startsWith("shared:") && !choice.startsWith("demo:"));
const isPrivateUserLayoutId = (choice) => privateIds.has(choice);

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("category search filters case-insensitively and highlights safe matches", () => {
  assert.equal(normalizeCategorySearchQuery("  ВЕЛО  "), "вело");
  assert.equal(categoryMatchesSearch("Велозапчасти", "ЗАП"), true);
  assert.equal(categoryMatchesSearch("Документы", "вело"), false);
  assert.equal(
    highlightCategorySearchMatch("Velo <Velo>", "velo"),
    "<mark>Velo</mark> &lt;<mark>Velo</mark>&gt;"
  );
  const option = renderCategorySearchOption({
    category: "camping",
    label: "Camping & sleep",
    id: "category-camping",
    checked: true
  });
  assert.match(option, /data-category-search-option/);
  assert.match(option, /Camping &amp; sleep/);
  assert.match(option, /checked/);
});

test("category filter reset stays hidden without a selection and follows checkbox changes", () => {
  const inputs = [{ checked: false }, { checked: false }];
  const listListeners = new Map();
  const buttonListeners = new Map();
  const list = {
    querySelector: (selector) => selector === "input:checked"
      ? inputs.find((input) => input.checked) || null
      : null,
    querySelectorAll: () => inputs,
    addEventListener: (type, listener) => listListeners.set(type, listener),
    removeEventListener: (type) => listListeners.delete(type)
  };
  const resetButton = {
    hidden: false,
    addEventListener: (type, listener) => buttonListeners.set(type, listener),
    removeEventListener: (type) => buttonListeners.delete(type)
  };

  const destroy = bindCategoryFilterResetVisibility(list, resetButton);
  assert.equal(resetButton.hidden, true);

  inputs[0].checked = true;
  listListeners.get("change")();
  assert.equal(resetButton.hidden, false);

  buttonListeners.get("click")();
  assert.deepEqual(inputs.map((input) => input.checked), [false, false]);
  assert.equal(resetButton.hidden, true);

  destroy();
  assert.equal(listListeners.size, 0);
  assert.equal(buttonListeners.size, 0);
});

test("category filter keeps Done anchored and has no duplicate close cross", () => {
  const html = readProjectFile("index.html");
  const styles = readProjectFile("styles.css");
  const dialog = html.match(/<dialog id="categoryFilterDialog">([\s\S]*?)<\/dialog>/)?.[1] || "";

  assert.doesNotMatch(dialog, /class="icon-button"/);
  assert.match(dialog, /id="resetCategoryFilterBtn"[^>]*hidden/);
  assert.match(dialog, /id="applyCategoryFilterBtn"/);
  assert.match(
    styles,
    /\.category-filter-dialog-card #applyCategoryFilterBtn\s*\{\s*margin-left:\s*auto;/
  );
});

test("CRITICAL layout-ui: system layout and load progress follow the interface language", () => {
  const systemLayout = { id: "layout-main", name: "Текущая укладка" };
  const userLayout = { id: "layout-custom", name: "Текущая укладка" };

  assert.equal(layoutDisplayNameForLanguage(systemLayout, "en"), "Current layout");
  assert.equal(layoutDisplayNameForLanguage(systemLayout, "ru"), "Текущая укладка");
  assert.equal(layoutDisplayNameForLanguage(userLayout, "en"), "Текущая укладка");
  assert.equal(
    formatLayoutLoadProgress({ loaded: 2, total: 3, prefix: "Personal layouts received", language: "en" }),
    "Personal layouts received: 2 of 3"
  );
  assert.equal(formatPersonalLayoutsLoadedStatus(2, "en"), "Personal layouts loaded: 2 of 2");
  assert.equal(formatPersonalLayoutsLoadedStatus(0, "ru"), "Личные укладки загружены: 0 из 0 · список пока пустой");
});

test("CRITICAL layout-ui: loaded status is reformatted after an interface language change", () => {
  let language = "ru";
  const classes = new Set();
  const element = {
    hidden: true,
    textContent: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
    }
  };
  const controller = createLayoutLoadStatusController({ getElement: () => element });
  controller.setStatus("success", () => formatPersonalLayoutsLoadedStatus(1, language));
  assert.equal(element.textContent, "Личные укладки загружены: 1 из 1");

  language = "en";
  controller.render();
  assert.equal(element.textContent, "Personal layouts loaded: 1 of 1");
});

test("CRITICAL layout-ui: signed-out auth status follows an immediate language change", async () => {
  const previousDocument = globalThis.document;
  const documentElement = { lang: "en" };
  globalThis.document = { documentElement };
  let statusText = "";
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    syncMeta: { dirty: false }
  };
  const dependencies = {
    activateLocalStorageScope: () => {},
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: () => false,
    apiFetch: async () => ({ user: null, session: null }),
    applyPreferredPrivateLayoutChoice: () => false,
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => null,
    currentPublicTemplateStatusMessage: () => "Demo/public read-only",
    enterSignedOutPublicMode: async () => {},
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: () => false,
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {},
    loadRemoteState: async () => {},
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: (_tone, text) => {
      statusText = text;
    },
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => true,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: () => {},
    GUEST_STORAGE_SCOPE: "guest"
  };

  try {
    await checkAuthAndLoadFlow({ runtime, dependencies });
    assert.equal(typeof statusText, "function");
    assert.equal(statusText(), "Sign-in is not confirmed, personal layouts are hidden");
    documentElement.lang = "ru";
    assert.equal(statusText(), "Вход не подтверждён, личные укладки скрыты");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("CRITICAL layout-ui: language switching rerenders the current load status before async layout work", () => {
  const appSource = readProjectFile("app.js");
  const languageSwitchStart = appSource.indexOf("async function setUiLanguage");
  const staticTranslationsStart = appSource.indexOf("applyStaticTranslations();", languageSwitchStart);
  const statusRenderStart = appSource.indexOf("updateLayoutLoadStatusUi();", staticTranslationsStart);
  const asyncLayoutBranchStart = appSource.indexOf("if (sharedLanguageTarget", statusRenderStart);
  assert.notEqual(languageSwitchStart, -1);
  assert.notEqual(staticTranslationsStart, -1);
  assert.ok(statusRenderStart > staticTranslationsStart);
  assert.ok(asyncLayoutBranchStart > statusRenderStart);
});

test("CRITICAL shared-link: language switch preserves the linked list layout", () => {
  assert.equal(
    shouldPreserveLinkedSharedListOnLanguageChange({
      isSharedListRoute: true,
      linkedLayoutId: "linked-list-list-1-layout-2",
      activeReadOnlyLayoutId: "linked-list-list-1-layout-2"
    }),
    true
  );
  assert.equal(
    shouldPreserveLinkedSharedListOnLanguageChange({
      isSharedListRoute: false,
      linkedLayoutId: "shared-template-ru",
      activeReadOnlyLayoutId: "shared-template-ru"
    }),
    false
  );
});

test("CRITICAL shared-link: publish options distinguish live links and immutable snapshots", () => {
  const root = {
    querySelector(selector) {
      if (selector.includes(":checked")) return { value: "snapshot" };
      if (selector === "[data-share-author]") return { checked: true };
      return null;
    }
  };
  assert.deepEqual(readSharedListPublishOptions(root), { mode: "snapshot", includeAuthor: true });
  assert.deepEqual(readSharedListPublishOptions(null), { mode: "live", includeAuthor: false });
});

test("CRITICAL sync-save: stored private layout choice wins over server active layout", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "layout-a",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-a"
  );
});

test("CRITICAL sync-save: legacy general layout choice is preserved before server active fallback", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-b"
  );
});

test("CRITICAL sync-save: public saved choice is ignored for private startup restore", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "",
      storedChoice: "shared:template-1",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: stale stored private choice falls back to current private layout", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "layout-deleted",
      storedChoice: "layout-missing",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: local snapshot restores stored private layout choice before first render", () => {
  const targetState = {
    activeLayoutId: "layout-c",
    layouts: {
      "layout-a": { id: "layout-a", name: "Stored" },
      "layout-b": { id: "layout-b", name: "General stored" },
      "layout-c": { id: "layout-c", name: "Server fallback" }
    }
  };

  assert.equal(
    resolveStoredPrivateLayoutChoiceForState(targetState, {
      storedPrivateChoice: "layout-a",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      guestDemoCopyFlag: "__guest"
    }),
    "layout-a"
  );
});

test("CRITICAL sync-save: local snapshot ignores stored public or guest layout choice", () => {
  const targetState = {
    activeLayoutId: "layout-c",
    layouts: {
      "layout-a": { id: "layout-a", name: "Guest", __guest: true },
      "layout-c": { id: "layout-c", name: "Server fallback" }
    }
  };

  assert.equal(
    resolveStoredPrivateLayoutChoiceForState(targetState, {
      storedPrivateChoice: "layout-a",
      storedChoice: "shared:template-1",
      normalizeChoice,
      isPrivateChoice,
      guestDemoCopyFlag: "__guest"
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: active layout choice is not written to sync payload", () => {
  const payload = cloneStateForSyncPayload({
    activeLayoutId: "layout-c",
    locations: [],
    categories: [],
    containers: {},
    items: {},
    layouts: {
      "layout-c": {
        id: "layout-c",
        name: "Current",
        rootContainerIds: []
      }
    }
  }, { forSync: true });

  assert.equal(Object.hasOwn(payload, "activeLayoutId"), false);
});

test("CRITICAL sync-save: runtime active layout id is readable but not serialized as state", () => {
  const state = installRuntimeActiveLayoutId({
    activeLayoutId: "layout-a",
    layouts: {
      "layout-a": { id: "layout-a", name: "A" },
      "layout-b": { id: "layout-b", name: "B" }
    }
  }, "layout-a");

  assert.equal(state.activeLayoutId, "layout-a");
  state.activeLayoutId = "layout-b";
  assert.equal(state.activeLayoutId, "layout-b");
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(state)), "activeLayoutId"), false);
});

test("CRITICAL offline-auth-scope: confirmed startup auth leaves the temporary public preview before loading personal layouts", async () => {
  let activeLayoutId = "layout-last";
  const remoteLoads = [];
  let automaticRecoveryCalls = 0;
  let privateScopeActivated = false;
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    syncMeta: { dirty: false }
  };
  const dependencies = {
    activateLocalStorageScope: () => {},
    activateLocalStorageScopeForCurrentUser: () => {
      activeLayoutId = "layout-server";
    },
    activateOfflineRememberedSession: () => false,
    apiFetch: async () => ({ user: { id: "user-1", email: "u@example.test" } }),
    applyPreferredPrivateLayoutChoice: (preferred) => {
      activeLayoutId = preferred.id;
      return true;
    },
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => ({
      id: activeLayoutId,
      name: activeLayoutId === "layout-last" ? "Last layout" : "Server layout",
      allowEmpty: true
    }),
    currentPublicTemplateStatusMessage: () => "",
    enterSignedOutPublicMode: async () => {},
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: () => false,
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {},
    loadRemoteState: async (options) => {
      assert.equal(privateScopeActivated, true);
      remoteLoads.push(options);
    },
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => { automaticRecoveryCalls += 1; },
    setActivePrivateScope: () => {
      privateScopeActivated = true;
    },
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: () => {},
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => false,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: () => {},
    GUEST_STORAGE_SCOPE: "guest"
  };

  await checkAuthAndLoadFlow({ runtime, dependencies });

  assert.equal(privateScopeActivated, true);
  assert.equal(activeLayoutId, "layout-last");
  assert.equal(automaticRecoveryCalls, 0);
  assert.equal(remoteLoads.length, 1);
  assert.equal(remoteLoads[0].preferredLayout.id, "layout-last");
});

async function runAuthenticatedLayoutLoad({ mode = "remote", dirty = false } = {}) {
  const state = {
    items: {}, containers: {},
    layouts: Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
      const id = `local-layout-${index + 1}`;
      return [id, { id, name: `Local ${index + 1}`, rootIds: [] }];
    }))
  };
  const original = structuredClone(state);
  const runtime = {
    appUnlocked: false, currentUser: null, initialRemoteLoadPending: true,
    remoteRefreshInFlight: false, uiLanguage: "ru", state,
    syncMeta: {
      dirty, listId: "personal-list", stateRevision: 7,
      cacheIntegrityVersion: STARTUP_CACHE_INTEGRITY_VERSION,
      serverUpdatedAt: "2026-09-13T10:00:00.000Z",
      localUpdatedAt: dirty ? "2026-09-13T11:00:00.000Z" : "2026-09-13T10:00:00.000Z"
    }
  };
  const statuses = [], syncMessages = [], loads = [], saves = [], restoredChoices = [];
  const requests = [], savedBaselines = [];
  let fallbackCount = 0;
  const failure = Object.assign(new Error(`${mode} failure`), { name: mode === "timeout" ? "TimeoutError" : "Error" });
  const fails = ["network", "timeout", "storage", "generic", "migration"].includes(mode);
  const setLayoutLoadStatus = (tone, text) => statuses.push({ tone, text: typeof text === "function" ? text() : text });
  const setPersonalLayoutsLoadedStatus = () => setLayoutLoadStatus("success", formatPersonalLayoutsLoadedStatus(countPrivateLayouts(runtime.state), "ru"));
  const updateSyncUi = (text = "") => syncMessages.push(text);
  const unexpected = () => assert.fail(`Unexpected branch in ${mode}`);
  const shared = {
    hasLocalSavedState: () => true,
    isSharedListLinkRoute: () => false,
    isNetworkError: (error) => error === failure && mode === "network",
    renderInitialLocalFallbackIfNeeded: () => { fallbackCount += 1; runtime.initialRemoteLoadPending = false; },
    setLayoutLoadStatus, setPersonalLayoutsLoadedStatus, updateSyncUi
  };
  const remote = structuredClone(state);
  if (["dirty-save", "refused-apply"].includes(mode)) remote.layouts["local-layout-1"].name = "Server version";
  const loadDependencies = {
    ...shared,
    applyRemoteState: () => {
      assert.equal(mode, "refused-apply");
      setLayoutLoadStatus("warning", "Серверная версия пока не заменяет локальные действия.");
      return false;
    },
    blockRemoteIntegrityFailureIfNeeded: () => {
      if (mode !== "integrity") return false;
      setLayoutLoadStatus("error", "Проверка целостности не пройдена.");
      return true;
    },
    canUseCachedStartupState,
    canLocalStateOverrideRemote: () => true,
    canSeedEmptyRemoteFromLocal: () => true,
    clearStaleDirtyFlagIfNoLocalChanges: () => false,
    cloneStateForSync: (value) => structuredClone(value),
    currentPackingListId: () => mode === "cache" ? "personal-list" : "",
    fetchRemoteListFreshnessRecord: async (id) => {
      assert.equal(mode, "cache");
      requests.push(`freshness:${id}`);
      return { listId: id, stateRevision: 7, serverUpdatedAt: runtime.syncMeta.serverUpdatedAt, layoutCount: 5 };
    },
    fetchRemoteStateRecord: async () => {
      requests.push("state");
      assert.notEqual(mode, "cache", "validated startup cache must avoid full-state fetch");
      if (fails) throw failure;
      return { source: "catalog", record: { id: "personal-list", stateRevision: 7,
        updatedAt: runtime.syncMeta.serverUpdatedAt, payload: mode === "empty-server" ? null : remote } };
    },
    handleInitialListMigrationRequired: async (error) => {
      if (mode !== "migration") return false;
      assert.equal(error, failure);
      setLayoutLoadStatus("warning", "Подготовка списка отложена.");
      return true;
    },
    isForeignLocalSyncState: () => false,
    isMeaningfulPackingState: (value) => countPrivateLayouts(value) > 0,
    isPublicLayoutContext: () => false,
    isSuspiciousEmptyPackingState: () => false,
    isTemporaryServerStorageError: (error) => error === failure && mode === "storage",
    isTimeoutError: (error) => error === failure && mode === "timeout",
    layoutItemQuantityMigrationRecovered: () => false,
    loadBaseState: unexpected,
    normalizeRemoteState: (value) => value,
    nowIso: () => "2026-09-13T12:00:00.000Z",
    remoteUpdatedAt: (record) => record.updatedAt,
    rememberCurrentSyncAccount: () => {},
    rememberRemoteIntegrityMeta: () => {},
    renderPreservingPackingScroll: () => {},
    repairPrivateMojibakeLayoutNames: () => {},
    saveBaseState: (value) => savedBaselines.push(structuredClone(value)),
    saveRemoteState: async (options) => {
      assert.ok(["empty-server", "dirty-save"].includes(mode));
      saves.push(options);
      runtime.syncMeta.dirty = false;
      updateSyncUi("Синхронизация завершена.");
      // Successful existing save callbacks resolve undefined and do not own the layout status.
    },
    saveSyncMeta: () => {},
    serializeState: () => structuredClone(runtime.state),
    setLayoutLoadProgress: (options) => setLayoutLoadStatus("loading", formatLayoutLoadProgress(options)),
    showToast: unexpected,
    stateIntegrityMetaFromResponse: () => ({ stateRevision: 7 }),
    statePrivateLayoutCount: countPrivateLayouts,
    timeValue: (value) => Date.parse(value) || 0
  };
  const dependencies = {
    ...shared,
    activateLocalStorageScopeForCurrentUser: () => {},
    apiFetch: async (path) => {
      requests.push(path);
      if (path === "/auth/me") return { user: { id: "user-1" } };
      assert.equal(path, "/bike-packing/authorization");
      return { authorization: { version: 1, role: "user", capabilities: [] } };
    },
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => ({ id: "local-layout-1", name: "Local 1" }),
    isAdminUser: () => false,
    isForcedOffline: () => false,
    loadRemoteState: async (options) => {
      const outcome = await loadRemoteStateFlow({ runtime, dependencies: loadDependencies }, options);
      loads.push({ options, outcome, status: statuses.at(-1) });
      return outcome;
    },
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    restoreSavedLayoutChoice: async (options) => restoredChoices.push(options),
    setExplicitlySignedOut: () => {},
    setActivePrivateScope: () => {},
    storedPrivateLayoutChoiceRef: () => null
  };
  await checkAuthAndLoadFlow({ runtime, dependencies }, { syncDirtyNotify: true });
  return { runtime, original, statuses, syncMessages, loads, saves, requests, savedBaselines, restoredChoices, fallbackCount };
}

for (const mode of ["network", "timeout"]) {
  for (const dirty of [false, true]) {
    test(`CRITICAL auth-load-status: swallowed ${mode} keeps warning with five local layouts and dirty=${dirty}`, async () => {
      const result = await runAuthenticatedLayoutLoad({ mode, dirty });
      assert.equal(result.loads.length, 1, "error is handled inside the real load flow");
      assert.equal(result.loads[0].outcome, false);
      assert.equal(result.loads[0].status.tone, "warning");
      assert.equal(result.statuses.at(-1).tone, "warning");
      assert.match(result.statuses.at(-1).text, mode === "timeout" ? /Сервер долго отвечает/ : /Офлайн/);
      assert.equal(result.statuses.some(({ tone }) => tone === "success"), false);
      assert.equal(result.fallbackCount, 1);
      assert.equal(result.runtime.syncMeta.dirty, dirty);
      assert.deepEqual(result.runtime.state, result.original);
      assert.equal(countPrivateLayouts(result.runtime.state), 5);
      assert.deepEqual(result.saves, []);
      assert.deepEqual(result.restoredChoices, [{ privateOnly: true }]);
      assert.deepEqual(result.requests, ["/auth/me", "/bike-packing/authorization", "state"]);
      if (dirty) assert.equal(result.loads[0].options.notifyDirtySave, true);
    });
  }
}

for (const [mode, tone] of [["storage", "warning"], ["generic", "error"], ["migration", "warning"], ["integrity", "error"], ["refused-apply", "warning"]]) {
  test(`CRITICAL auth-load-status: ${mode} refusal remains visible after auth completes`, async () => {
    const result = await runAuthenticatedLayoutLoad({ mode });
    assert.equal(result.loads[0].outcome, false);
    assert.equal(result.loads[0].status.tone, tone);
    assert.deepEqual(result.statuses.at(-1), result.loads[0].status);
    assert.equal(result.statuses.some(({ tone }) => tone === "success"), false);
    assert.deepEqual(result.runtime.state, result.original);
    assert.deepEqual(result.saves, []);
    assert.deepEqual(result.savedBaselines, []);
    if (mode === "generic") assert.match(result.statuses.at(-1).text, /generic failure/);
  });
}

for (const mode of ["remote", "cache", "empty-server", "dirty-save"]) {
  test(`CRITICAL auth-load-status: successful ${mode} finishes loading`, async () => {
    const result = await runAuthenticatedLayoutLoad({ mode, dirty: mode === "dirty-save" });
    assert.deepEqual(result.statuses.at(-1), { tone: "success", text: "Личные укладки загружены: 5 из 5" });
    assert.equal(result.runtime.syncMeta.dirty, false);
    assert.equal(result.runtime.initialRemoteLoadPending, false);
    assert.deepEqual(result.runtime.state, result.original);
    assert.deepEqual(result.restoredChoices, [{ privateOnly: true }]);
    if (["remote", "cache"].includes(mode)) {
      assert.deepEqual(result.savedBaselines, [result.original]);
      assert.deepEqual(result.saves, []);
    } else {
      assert.equal(result.saves.length, 1);
      assert.equal(result.loads[0].outcome, undefined, "existing save completion has no boolean result");
      assert.equal(result.syncMessages.at(-1), "Синхронизация завершена.");
    }
    assert.equal(result.requests.at(-1), mode === "cache" ? "freshness:personal-list" : "state");
  });
}

test("CRITICAL offline-auth-scope: auth network failure prefers remembered private offline over readonly demo", async () => {
  const runtime = {
    appUnlocked: false,
    currentUser: { id: "user-1", email: "u@example.test" },
    syncMeta: { dirty: false }
  };
  let offlineActivated = false;
  let offlineReason = "";
  let enteredPublic = false;
  let keptReadonly = false;
  const dependencies = {
    activateLocalStorageScope: () => {},
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: (_syncMessage, _layoutStatusMessage, reason) => {
      offlineActivated = true;
      offlineReason = reason;
      return true;
    },
    apiFetch: async () => {
      const error = new Error("network");
      error.isNetworkError = true;
      throw error;
    },
    applyPreferredPrivateLayoutChoice: () => false,
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => null,
    currentPublicTemplateStatusMessage: () => "Demo/public read-only",
    enterSignedOutPublicMode: async () => {
      enteredPublic = true;
    },
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: (error) => Boolean(error?.isNetworkError),
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {
      keptReadonly = true;
    },
    loadRemoteState: async () => {},
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => {},
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: () => {},
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => true,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: () => {},
    GUEST_STORAGE_SCOPE: "guest"
  };

  await checkAuthAndLoadFlow({ runtime, dependencies });

  assert.equal(offlineActivated, true);
  assert.equal(offlineReason, OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE);
  assert.equal(enteredPublic, false);
  assert.equal(keptReadonly, false);
});

test("CRITICAL offline-auth-scope: empty auth response keeps remembered private scope", async () => {
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    syncMeta: { dirty: false }
  };
  let offlineActivated = false;
  let offlineLayoutStatusMessage = null;
  let clearedOffline = false;
  let guestScopeActivated = false;
  let loadedGuestDemo = false;
  const dependencies = {
    activateLocalStorageScope: () => {
      guestScopeActivated = true;
    },
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: (_syncMessage, layoutStatusMessage) => {
      offlineActivated = true;
      offlineLayoutStatusMessage = layoutStatusMessage;
      return true;
    },
    apiFetch: async () => ({ user: null, session: null }),
    applyPreferredPrivateLayoutChoice: () => false,
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {
      clearedOffline = true;
    },
    currentPrivateLayoutRef: () => null,
    currentPublicTemplateStatusMessage: () => "Demo/public read-only",
    enterSignedOutPublicMode: async () => {},
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: () => false,
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {
      loadedGuestDemo = true;
    },
    loadRemoteState: async () => {},
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => {},
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: () => {},
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => true,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: () => {},
    GUEST_STORAGE_SCOPE: "guest"
  };

  await checkAuthAndLoadFlow({ runtime, dependencies });

  assert.equal(offlineActivated, true);
  assert.equal(offlineLayoutStatusMessage, undefined);
  assert.equal(clearedOffline, false);
  assert.equal(guestScopeActivated, false);
  assert.equal(loadedGuestDemo, false);
});

test("CRITICAL offline-auth-scope: signed-out auth refresh keeps current readonly shared template", async () => {
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    syncMeta: { dirty: false }
  };
  let guestScopeActivated = false;
  let loadedGuestDemo = false;
  let enteredPublic = false;
  const statusMessages = [];
  const dependencies = {
    activateLocalStorageScope: () => {
      guestScopeActivated = true;
    },
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: () => false,
    apiFetch: async () => ({ user: null, session: null }),
    applyPreferredPrivateLayoutChoice: () => false,
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => null,
    currentPublicTemplateStatusMessage: () => "Shared read-only",
    enterSignedOutPublicMode: async () => {
      enteredPublic = true;
    },
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: () => false,
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {
      loadedGuestDemo = true;
    },
    loadRemoteState: async () => {},
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => {},
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: () => {},
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => true,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: (message = "") => {
      statusMessages.push(message);
    },
    GUEST_STORAGE_SCOPE: "guest"
  };

  await checkAuthAndLoadFlow({ runtime, dependencies }, { restoreLayoutChoice: false });

  assert.equal(runtime.appUnlocked, true);
  assert.equal(guestScopeActivated, true);
  assert.equal(loadedGuestDemo, false);
  assert.equal(enteredPublic, false);
  assert.deepEqual(statusMessages, ["Checking sign-in...", "Shared read-only"]);
});

test("CRITICAL offline-auth-scope: temporary auth HTTP failures are treated as offline-capable", () => {
  assert.equal(isAuthCheckUnavailableError({ status: 503 }, () => false), true);
  assert.equal(isAuthCheckUnavailableError({ status: 502 }, () => false), true);
  assert.equal(isAuthCheckUnavailableError({ status: 429 }, () => false), true);
  assert.equal(isAuthCheckUnavailableError({ status: 401 }, () => false), false);
  assert.equal(isAuthCheckUnavailableError({ status: 403 }, () => false), false);
});

test("CRITICAL offline-auth-scope: API outage status is reassuring and follows the UI language", () => {
  const previousDocument = globalThis.document;
  try {
    globalThis.document = { documentElement: { lang: "en" } };
    assert.deepEqual(
      offlineRememberedStatusMessages(OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE),
      {
        layout: "API unavailable · local copy",
        sync: "API unavailable · working locally · sync later"
      }
    );

    globalThis.document = { documentElement: { lang: "ru" } };
    assert.deepEqual(
      offlineRememberedStatusMessages(OFFLINE_REMEMBERED_REASON_API_UNAVAILABLE),
      {
        layout: "API недоступен · локальная копия",
        sync: "API недоступен · работаем локально · синхронизация позже"
      }
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  const appSource = readProjectFile("app.js");
  assert.match(appSource, /let offlineRememberedSessionReason = ""/);
  assert.match(appSource, /message \|\|\s*rememberedStatus\.sync/);
  assert.match(appSource, /setOfflineRememberedLayoutLoadStatus\(layoutStatusMessage \|\| rememberedStatus\.layout\)/);
});

test("CRITICAL offline-auth-scope: public readonly status cannot mask an active private login", () => {
  const createElement = () => ({
    classList: { toggle: () => {}, remove: () => {} },
    dataset: {},
    hidden: false,
    textContent: "",
    title: "",
    disabled: false,
    setAttribute: () => {}
  });
  const refs = {
    authBtn: createElement(),
    collectionMenuBtn: createElement(),
    forceOfflineBtn: createElement(),
    mobileAdminApiWarning: createElement(),
    syncBtn: createElement(),
    syncStatus: createElement(),
    syncUserEmail: createElement()
  };
  const signOutBtn = createElement();
  const documentRef = {
    body: { classList: { toggle: () => {} } },
    querySelector: (selector) => selector === "#signOutBtn" ? signOutBtn : null
  };

  const previousDocument = globalThis.document;
  globalThis.document = documentRef;
  try {
    updateSyncUiControls({
      appUnlocked: true,
      canUseLocalEditableState: () => true,
      currentPublicTemplateStatusMessage: () => "Demo/public read-only",
      currentUser: { id: "user-1", email: "u@example.test" },
      currentUserEmail: () => "u@example.test",
      document: documentRef,
      isCurrentPrivateLayout: () => true,
      message: "Demo/public read-only",
      refs,
      state: { collectionMode: false },
      syncMeta: { dirty: false },
      t: (key) => ({
        "auth.notSignedIn": "not signed in",
        "menu.collectionOff": "collection off",
        "menu.offline": "offline",
        "menu.signIn": "sign in",
        "menu.signOut": "sign out",
        "sync.dirty": "dirty",
        "sync.synced": "synced"
      }[key] || key)
    });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  assert.equal(refs.syncStatus.textContent, "synced");
  assert.equal(refs.syncUserEmail.textContent, "u@\u200bexample.test");
  assert.equal(refs.syncBtn.hidden, false);
});

test("CRITICAL offline-auth-scope: remembered local account is not shown as confirmed sync", () => {
  const toggles = [];
  const createElement = () => ({
    classList: {
      toggle: (name, enabled) => toggles.push([name, enabled]),
      remove: () => {}
    },
    dataset: {},
    hidden: false,
    textContent: "",
    title: "",
    disabled: false,
    setAttribute: () => {}
  });
  const refs = {
    authBtn: createElement(),
    collectionMenuBtn: createElement(),
    forceOfflineBtn: createElement(),
    mobileAdminApiWarning: createElement(),
    syncBtn: createElement(),
    syncStatus: createElement(),
    syncUserEmail: createElement()
  };
  const signOutBtn = createElement();
  const documentRef = {
    body: { classList: { toggle: () => {} } },
    documentElement: { lang: "ru" },
    querySelector: (selector) => selector === "#signOutBtn" ? signOutBtn : null
  };

  const previousDocument = globalThis.document;
  globalThis.document = documentRef;
  try {
    updateSyncUiControls({
      appUnlocked: true,
      canUseLocalEditableState: () => true,
      currentPublicTemplateStatusMessage: () => "Demo/public read-only",
      currentUser: null,
      currentUserEmail: () => "u@example.test",
      document: documentRef,
      isCurrentPrivateLayout: () => true,
      isOfflineRememberedSession: () => true,
      message: "Вход не подтверждён · открыта локальная копия личных укладок",
      refs,
      state: { collectionMode: false },
      syncMeta: { dirty: false },
      t: (key) => ({
        "auth.notSignedIn": "not signed in",
        "menu.collectionOff": "collection off",
        "menu.offline": "offline",
        "menu.signIn": "sign in",
        "menu.signOut": "sign out",
        "sync.dirty": "dirty",
        "sync.synced": "synced"
      }[key] || key)
    });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  assert.equal(refs.syncStatus.textContent, "Вход не подтверждён · открыта локальная копия личных укладок");
  assert.equal(refs.authBtn.hidden, false);
  assert.equal(refs.authBtn.textContent, "Подтвердить вход");
  assert.equal(signOutBtn.hidden, false);
  assert.equal(refs.syncUserEmail.textContent, "Локально · u@\u200bexample.test");
  assert.equal(refs.syncUserEmail.title, "Вход на сервере не подтверждён. Локальная копия: u@example.test");
  assert.equal(refs.syncBtn.dataset.syncState, "offline");
  assert.equal(toggles.some(([name, enabled]) => name === "local-remembered-email" && enabled), true);
});

test("CRITICAL offline-auth-scope: remembered local account fallback text does not say offline", () => {
  const createElement = () => ({
    classList: { toggle: () => {}, remove: () => {} },
    dataset: {},
    hidden: false,
    textContent: "",
    title: "",
    disabled: false,
    setAttribute: () => {}
  });
  const refs = {
    authBtn: createElement(),
    collectionMenuBtn: createElement(),
    forceOfflineBtn: createElement(),
    mobileAdminApiWarning: createElement(),
    syncBtn: createElement(),
    syncStatus: createElement(),
    syncUserEmail: createElement()
  };
  const documentRef = {
    body: { classList: { toggle: () => {} } },
    documentElement: { lang: "ru" },
    querySelector: () => null
  };

  const previousDocument = globalThis.document;
  globalThis.document = documentRef;
  try {
    updateSyncUiControls({
      appUnlocked: true,
      canUseLocalEditableState: () => true,
      currentUser: null,
      currentUserEmail: () => "u@example.test",
      document: documentRef,
      isCurrentPrivateLayout: () => true,
      isOfflineRememberedSession: () => true,
      refs,
      state: { collectionMode: false },
      syncMeta: { dirty: false },
      t: (key) => ({
        "auth.notSignedIn": "not signed in",
        "menu.collectionOff": "collection off",
        "menu.offline": "offline",
        "menu.signIn": "sign in",
        "menu.signOut": "sign out",
        "sync.dirty": "dirty",
        "sync.synced": "synced"
      }[key] || key)
    });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  assert.equal(refs.syncStatus.textContent, "Локальная копия личных укладок · войдите для синхронизации");
  assert.equal(refs.syncStatus.textContent.includes("Офлайн"), false);
});

test("CRITICAL offline-auth-scope: remembered local account labels follow English UI language", () => {
  const createElement = () => ({
    classList: { toggle: () => {}, remove: () => {} },
    dataset: {},
    hidden: false,
    textContent: "",
    title: "",
    disabled: false,
    setAttribute: () => {}
  });
  const refs = {
    authBtn: createElement(),
    collectionMenuBtn: createElement(),
    forceOfflineBtn: createElement(),
    mobileAdminApiWarning: createElement(),
    syncBtn: createElement(),
    syncStatus: createElement(),
    syncUserEmail: createElement()
  };
  const documentRef = {
    body: { classList: { toggle: () => {} } },
    documentElement: { lang: "en" },
    querySelector: () => null
  };

  const previousDocument = globalThis.document;
  globalThis.document = documentRef;
  try {
    updateSyncUiControls({
      appUnlocked: true,
      canUseLocalEditableState: () => true,
      currentUser: null,
      currentUserEmail: () => "u@example.test",
      document: documentRef,
      isCurrentPrivateLayout: () => true,
      isOfflineRememberedSession: () => true,
      refs,
      state: { collectionMode: false },
      syncMeta: { dirty: false },
      t: (key) => ({
        "auth.notSignedIn": "not signed in",
        "menu.collectionOff": "collection off",
        "menu.offline": "offline",
        "menu.signIn": "sign in",
        "menu.signOut": "sign out",
        "sync.dirty": "dirty",
        "sync.synced": "synced"
      }[key] || key)
    });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  assert.equal(refs.syncStatus.textContent, "Local copy of personal layouts · sign in to sync");
  assert.equal(refs.authBtn.textContent, "Confirm sign-in");
  assert.equal(refs.syncUserEmail.textContent, "Local · u@\u200bexample.test");
  assert.equal(refs.syncUserEmail.title, "Server sign-in is not confirmed. Local copy: u@example.test");
});

test("CRITICAL mobile account label gets one safe wrap opportunity after the email at-sign", () => {
  assert.equal(syncAccountLabelWithEmailWrap("dimok911@gmail.com", "dimok911@gmail.com"), "dimok911@\u200bgmail.com");
  assert.equal(syncAccountLabelWithEmailWrap("Локально · dimok911@gmail.com", "dimok911@gmail.com"), "Локально · dimok911@\u200bgmail.com");
  assert.equal(syncAccountLabelWithEmailWrap("Локальный аккаунт", ""), "Локальный аккаунт");
  const stylesSource = readProjectFile("styles.css");
  assert.match(stylesSource, /\.sync-user-email\s*\{[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/s);
});

test("container category edits can save an explicitly empty category list", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    locations: ["Уже на велосипеде"],
    containers: {
      "container-a": {
        id: "container-a",
        name: "Bag",
        categories: [],
        category: "",
        childIds: [],
        itemIds: []
      }
    }
  };

  normalizeContainerFields(targetState);

  assert.deepEqual(containerCategories(targetState.containers["container-a"]), []);
  assert.equal(targetState.containers["container-a"].category, "");
});

test("legacy containers without a category list do not receive built-in categories", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    locations: ["Уже на велосипеде"],
    containers: {
      "container-a": {
        id: "container-a",
        name: "Bag",
        childIds: [],
        itemIds: []
      }
    }
  };

  normalizeContainerFields(targetState);

  assert.deepEqual(containerCategories(targetState.containers["container-a"]), []);
  assert.equal(targetState.containers["container-a"].category, "");
});

test("item category edits can save an explicitly empty category list", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    items: {
      "item-a": {
        id: "item-a",
        name: "Thing",
        categories: [],
        category: ""
      }
    }
  };

  normalizeItemCategories(targetState);

  assert.deepEqual(itemCategories(targetState.items["item-a"]), []);
  assert.equal(targetState.items["item-a"].category, "");
});

test("legacy items without a category list do not receive built-in categories", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    items: {
      "item-a": {
        id: "item-a",
        name: "Thing"
      }
    }
  };

  normalizeItemCategories(targetState);

  assert.deepEqual(itemCategories(targetState.items["item-a"]), []);
  assert.equal(targetState.items["item-a"].category, "");
});

test("new item dialog defaults to no categories", () => {
  const state = {
    layouts: { "layout-a": { id: "layout-a", arrangement: { containers: {} } } },
    containers: {},
    items: {}
  };
  saveItemDialogAction({
    changedAt: "2026-07-04T00:00:00.000Z",
    currentEditMeta: () => ({}),
    getDialogSelectedCategories: () => [],
    getPublishedEditLayoutId: () => "layout-a",
    refs: {
      dialog: { close() {} },
      itemAvailabilityStatus: { value: "available" },
      itemContainer: { value: "" },
      itemLocation: { value: "Home" },
      itemName: { value: "New thing" },
      itemNote: { value: "" },
      itemQuantity: { value: "1" },
      itemWeight: { value: "0" },
      saveItemBtn: { disabled: false }
    },
    state
  });

  const item = Object.values(state.items)[0];
  assert.ok(item);
  assert.deepEqual(item.categories, []);
  assert.equal(item.category, "");
});

test("item dialog saves color and dimensions and normalization keeps their public payload shape", () => {
  const state = {
    layouts: { "layout-a": { id: "layout-a", arrangement: { containers: {} } } },
    containers: {},
    items: {}
  };
  saveItemDialogAction({
    changedAt: "2026-07-18T00:00:00.000Z",
    currentEditMeta: () => ({}),
    getDialogSelectedCategories: () => [],
    getPublishedEditLayoutId: () => "layout-a",
    hasItemDimensions: (value) => Boolean(value.width || value.height || value.depth),
    normalizeItemColor: (value) => String(value || "").trim(),
    readItemDialogDimensions: () => ({ width: 12.5, height: 7, depth: 3 }),
    refs: {
      dialog: { close() {} },
      itemAvailabilityStatus: { value: "available" },
      itemColor: { value: " orange " },
      itemContainer: { value: "" },
      itemLocation: { value: "Home" },
      itemName: { value: "New thing" },
      itemNote: { value: "" },
      itemQuantity: { value: "1" },
      itemWeight: { value: "50" },
      saveItemBtn: { disabled: false }
    },
    state
  });

  normalizeItemFields(state);
  const item = Object.values(state.items)[0];
  assert.equal(item.color, "orange");
  assert.deepEqual(item.dimensions, { width: 12.5, height: 7, depth: 3 });
});

test("new item placement can target another layout before the item is saved", () => {
  const mode = itemDialogContainerPickerMode("");

  assert.equal(isNewItemPlacementPickerMode(mode), true);
  assert.equal(itemDialogTargetLayoutFromPicker({
    currentLayoutId: "layout-a",
    mode,
    pickerLayoutId: "layout-b"
  }), "layout-b");
  assert.equal(itemDialogTargetLayoutFromPicker({
    currentLayoutId: "layout-a",
    mode: itemDialogContainerPickerMode("item-a"),
    pickerLayoutId: "layout-b"
  }), "layout-a");
});

test("new item save places the item into the layout selected by the placement picker", () => {
  const state = {
    layouts: {
      "layout-a": { id: "layout-a", arrangement: { containers: {} } },
      "layout-b": { id: "layout-b", arrangement: { containers: {} } }
    },
    containers: {
      "container-b": { id: "container-b", childIds: [], itemIds: [] }
    },
    items: {}
  };
  let placedLayoutId = "";

  saveItemDialogAction({
    changedAt: "2026-07-12T00:00:00.000Z",
    currentEditMeta: () => ({}),
    getDialogSelectedCategories: () => [],
    getPublishedEditLayoutId: () => "layout-a",
    itemDialogTargetLayoutId: "layout-b",
    placeExistingItemInLayout: (_itemId, _containerId, layoutId) => {
      placedLayoutId = layoutId;
      return true;
    },
    refs: {
      dialog: { close() {} },
      itemAvailabilityStatus: { value: "available" },
      itemContainer: { value: "container-b" },
      itemLocation: { value: "Home" },
      itemName: { value: "New thing" },
      itemNote: { value: "" },
      itemQuantity: { value: "1" },
      itemWeight: { value: "0" },
      saveItemBtn: { disabled: false }
    },
    state
  });

  assert.equal(placedLayoutId, "layout-b");
  assert.equal(Object.keys(state.items).length, 1);
});

test("new item form does not preselect the first dictionary category", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  assert.match(controllers, /function renderItemCategoryPicker\(selected = null, \{ fallbackDefault = false \} = \{\}\)/);
  assert.match(controllers, /category:\s*"",\s*categories:\s*\[\],\s*containerId:/);
  assert.doesNotMatch(controllers, /const defaultCategory = dictionaryOptionsForUi\("category"\)\[0\]/);
});

test("empty category picker offers inline creation in editable item and bag dialogs", () => {
  const html = renderEmptyCategoryPicker({
    hint: "No <categories>",
    placeholder: "Category name",
    actionText: "Add"
  });
  const controllers = readProjectFile("src/app/app-tail-controllers.js");

  assert.match(html, /data-new-category-input/);
  assert.match(html, /data-add-category-inline disabled/);
  assert.match(html, /No &lt;categories&gt;/);
  assert.equal(normalizeInlineCategoryName("  Camping  "), "Camping");
  assert.match(controllers, /allowCreate:\s*true/);
  assert.match(controllers, /addCustomDictionaryValue\(owner, "category", value\)/);
  assert.match(controllers, /renderItemCategoryPicker\(selected, \{ fallbackDefault: false \}\)/);
  assert.match(controllers, /renderRootContainerCategoryPicker\(selected, \{ fallbackDefault: false \}\)/);
});

test("new empty layouts and templates open on the packing tab", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  const saveNewLayout = controllers.slice(
    controllers.indexOf("async function saveNewLayout"),
    controllers.indexOf("function openLayoutEditDialog")
  );

  assert.doesNotMatch(saveNewLayout, /switchView\("bags"\)/);
  assert.match(saveNewLayout, /switchView\("packing"\)/);
});

test("settings summary weight can include every bag in the active layout", () => {
  const targetState = {
    activeLayoutId: "layout-a",
    containers: {
      root: { id: "root", weight: 500, childIds: ["nested"], itemIds: ["item-a"] },
      nested: { id: "nested", weight: 250, childIds: [], itemIds: ["item-b"] },
      catalog: { id: "catalog", weight: 1000, childIds: [], itemIds: [] }
    },
    items: {
      "item-a": { id: "item-a", weight: 100, quantity: 2 },
      "item-b": { id: "item-b", weight: 50, quantity: 1 }
    },
    layouts: {
      "layout-a": { id: "layout-a", rootContainerIds: ["root"] }
    }
  };

  const itemWeight = Object.values(targetState.items).reduce((sum, item) => sum + itemTotalWeight(item), 0);

  assert.equal(layoutContainersOwnWeight(targetState, targetState.layouts["layout-a"]), 750);
  assert.equal(layoutContainersOwnWeight(targetState, targetState.layouts["layout-a"]) + itemWeight, 1000);
});
