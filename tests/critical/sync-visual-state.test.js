import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  resolveSyncVisualState,
  syncVisualHelp
} from "../../src/ui/sync-visual-state.js";
import { createConnectionStatusController } from "../../src/ui/connection-status.js";
import { apiFetchRequest } from "../../src/sync/api-client.js";
import { shouldReportConnectionFailure } from "../../src/sync/connection-failure-policy.js";
import { createNetworkTransitionController } from "../../src/sync/network-transition.js";
import { I18N } from "../../src/data/i18n.js";

test("sync help explains automatic and immediate manual sync in both languages", () => {
  const russianHelp = syncVisualHelp("syncing", "ru");
  assert.match(russianHelp, /изменения синхронизируются сразу после редактирования/);
  assert.match(russianHelp, /проверяет изменения с других устройств каждые 30 секунд/);
  assert.match(russianHelp, /синхронизировать сейчас/);

  const englishHelp = syncVisualHelp("syncing", "en");
  assert.match(englishHelp, /changes sync right after editing/);
  assert.match(englishHelp, /checks for changes from other devices every 30 seconds/);
  assert.match(englishHelp, /sync now/);
});

test("sync visual state recognizes progress and errors in both languages", () => {
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Сохраняю на сервер..." }), "syncing");
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Saving to the server..." }), "syncing");
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Сервер недоступен" }), "error");
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Server unavailable" }), "error");
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Сервер не отвечает · работа продолжается локально" }), "error");
  assert.equal(resolveSyncVisualState({ loggedIn: true, message: "Server is not responding · work continues locally" }), "error");
});

test("foreground connection failures stay visible until a successful server response", () => {
  let popoverOpen = false;
  const changes = [];
  const element = {
    dataset: {},
    hidden: true,
    textContent: "",
    matches: (selector) => selector === ":popover-open" && popoverOpen,
    showPopover() {
      popoverOpen = true;
    },
    hidePopover() {
      popoverOpen = false;
    }
  };
  const controller = createConnectionStatusController({
    getElement: () => element,
    getMessage: (kind) => kind === "timeout"
      ? I18N.ru["sync.serverTimeoutLocal"]
      : I18N.ru["sync.noConnectionLocal"],
    onChange: (kind) => changes.push(kind)
  });

  controller.reportFailure("timeout");
  assert.equal(element.hidden, false);
  assert.equal(popoverOpen, true);
  assert.equal(element.dataset.kind, "timeout");
  assert.equal(element.textContent, "Сервер не отвечает · работа продолжается локально");
  assert.equal(controller.currentMessage(), element.textContent);

  controller.refresh();
  assert.deepEqual(changes, ["timeout"]);
  controller.reportSuccess();
  assert.equal(element.hidden, true);
  assert.equal(popoverOpen, false);
  assert.equal(controller.currentMessage(), "");
  assert.deepEqual(changes, ["timeout", ""]);
  assert.equal(I18N.en["sync.noConnectionLocal"], "No connection to the server · work continues locally");
});

test("only user-impacting API failures open the persistent server banner", () => {
  assert.equal(shouldReportConnectionFailure({ method: "GET" }), false);
  assert.equal(shouldReportConnectionFailure({ method: "HEAD" }), false);
  assert.equal(shouldReportConnectionFailure({ method: "POST" }), true);
  assert.equal(shouldReportConnectionFailure({ method: "PUT" }), true);
  assert.equal(shouldReportConnectionFailure({ mode: "background", method: "POST" }), false);
  assert.equal(shouldReportConnectionFailure({ mode: "foreground", method: "GET" }), true);
});

test("Safari navigator.onLine=false cannot prevent a real API request", async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let requestCount = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout
    }
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      requestCount += 1;
      return {
        ok: true,
        json: async () => ({ ok: true, user: { id: "user-1" } })
      };
    }
  });
  try {
    const data = await apiFetchRequest("/auth/me", { timeoutMs: 1000 });
    assert.equal(requestCount, 1);
    assert.equal(data.user.id, "user-1");
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete globalThis.window;
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    else delete globalThis.fetch;
  }
});

test("brief iPhone offline transitions are canceled before changing auth scope", () => {
  const timers = [];
  let offlineCalls = 0;
  const onlineEvents = [];
  const controller = createNetworkTransitionController({
    onOffline: () => { offlineCalls += 1; },
    onOnline: (event) => onlineEvents.push(event),
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; }
  });

  controller.reportOffline();
  assert.equal(timers[0].delay, 4000);
  assert.equal(controller.hasPendingOffline(), true);
  controller.reportOnline();
  assert.equal(timers[0].cleared, true);
  assert.equal(offlineCalls, 0);
  assert.deepEqual(onlineEvents, [{ canceledPendingOffline: true }]);

  controller.reportOffline();
  timers[1].callback();
  assert.equal(offlineCalls, 1);
  assert.equal(controller.hasPendingOffline(), false);
});

test("app debounces Safari offline events without presenting them as a confirmed server failure", async () => {
  const appSource = await readFile(new URL("../../app.js", import.meta.url), "utf8");
  const apiClientSource = await readFile(new URL("../../src/sync/api-client.js", import.meta.url), "utf8");
  assert.match(appSource, /createNetworkTransitionController\(\{[\s\S]*onOnline:[\s\S]*onOffline:/);
  assert.match(appSource, /window\.addEventListener\("online", networkTransitionController\.reportOnline\)/);
  assert.match(appSource, /window\.addEventListener\("offline", networkTransitionController\.reportOffline\)/);
  assert.doesNotMatch(appSource, /onOffline:\s*\(\)\s*=>\s*\{\s*connectionStatusController\.reportFailure/);
  assert.doesNotMatch(appSource, /const offlineNow = [^;]*navigator\.onLine/);
  assert.doesNotMatch(apiClientSource, /if \("onLine" in navigator && !navigator\.onLine\)/);
  assert.match(appSource, /fetchRemoteListFreshnessRecord[\s\S]*connectionFailureMode: "background"/);
  assert.match(appSource, /const \{ connectionFailureMode = "auto", \.\.\.requestOptions \} = options;/);
  assert.match(appSource, /shouldReportConnectionFailure\(\{[\s\S]*mode: connectionFailureMode,[\s\S]*method: requestOptions\.method/);
});

test("sync button keeps its status palette independent from interface themes", async () => {
  const stylesSource = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  const syncedBlock = stylesSource.match(/body\.sync-synced #syncBtn\s*\{([\s\S]*?)\}/)?.[1] || "";
  const syncingBlock = stylesSource.match(/body\.sync-syncing #syncBtn\s*\{([\s\S]*?)\}/)?.[1] || "";
  const syncedDotBlock = stylesSource.match(/body\.sync-synced #syncBtn::before\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.doesNotMatch(`${syncedBlock}${syncingBlock}${syncedDotBlock}`, /--interface-hue|--accent/);
  assert.match(syncedBlock, /color:\s*hsl\(165deg 56% 28%\)/);
  assert.match(syncingBlock, /background:\s*hsl\(153deg 33% 95%\)/);
  assert.match(syncedDotBlock, /background:\s*hsl\(165deg 56% 28%\)/);
});
