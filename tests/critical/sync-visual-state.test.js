import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  resolveSyncVisualState,
  syncVisualHelp
} from "../../src/ui/sync-visual-state.js";
import { createConnectionStatusController } from "../../src/ui/connection-status.js";
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

test("network failures stay visible until a successful server response", () => {
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
