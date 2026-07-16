import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSyncVisualState,
  syncVisualHelp
} from "../../src/ui/sync-visual-state.js";

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
});
