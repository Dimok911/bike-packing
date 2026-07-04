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
import {
  containerCategories,
  itemCategories,
  normalizeItemCategories,
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
import {
  updateSyncUiControls
} from "../../src/ui/sync-ui.js";
import {
  saveItemDialogAction
} from "../../src/ui/item-dialog-save.js";

const root = resolve(import.meta.dirname, "../..");
const privateIds = new Set(["layout-a", "layout-b", "layout-c"]);
const normalizeChoice = (choice) => String(choice || "").trim();
const isPrivateChoice = (choice) => Boolean(choice && !choice.startsWith("shared:") && !choice.startsWith("demo:"));
const isPrivateUserLayoutId = (choice) => privateIds.has(choice);

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

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

test("CRITICAL sync-save: auth load keeps visible private layout as remote preferred choice", async () => {
  let activeLayoutId = "layout-last";
  const remoteLoads = [];
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
      remoteLoads.push(options);
    },
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => {},
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

  assert.equal(activeLayoutId, "layout-last");
  assert.equal(remoteLoads.length, 1);
  assert.equal(remoteLoads[0].preferredLayout.id, "layout-last");
});

test("CRITICAL offline-auth-scope: auth network failure prefers remembered private offline over readonly demo", async () => {
  const runtime = {
    appUnlocked: false,
    currentUser: { id: "user-1", email: "u@example.test" },
    syncMeta: { dirty: false }
  };
  let offlineActivated = false;
  let enteredPublic = false;
  let keptReadonly = false;
  const dependencies = {
    activateLocalStorageScope: () => {},
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: () => {
      offlineActivated = true;
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
  let clearedOffline = false;
  let guestScopeActivated = false;
  let loadedGuestDemo = false;
  const dependencies = {
    activateLocalStorageScope: () => {
      guestScopeActivated = true;
    },
    activateLocalStorageScopeForCurrentUser: () => {},
    activateOfflineRememberedSession: () => {
      offlineActivated = true;
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
  assert.equal(refs.syncUserEmail.textContent, "u@example.test");
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
  assert.equal(refs.syncUserEmail.textContent, "Локально · u@example.test");
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
  assert.equal(refs.syncUserEmail.textContent, "Local · u@example.test");
  assert.equal(refs.syncUserEmail.title, "Server sign-in is not confirmed. Local copy: u@example.test");
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

test("new item form does not preselect the first dictionary category", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  assert.match(controllers, /function renderItemCategoryPicker\(selected = null, \{ fallbackDefault = false \} = \{\}\)/);
  assert.match(controllers, /category:\s*"",\s*categories:\s*\[\],\s*containerId:/);
  assert.doesNotMatch(controllers, /const defaultCategory = dictionaryOptionsForUi\("category"\)\[0\]/);
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
