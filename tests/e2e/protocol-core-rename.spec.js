import { test, expect } from "@playwright/test";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, legacyPhotoPayload,
  legacyLayoutId, legacyBagId, nativeLegacyPhotoOutbox } from "../fixtures/personal-legacy-photo-browser-fixture.js";

// Normal release bundle and actual item edit dialog; only a synthetic API/user.
// The paired HTTP/MySQL check independently verifies the real server contract.
const itemId = "core-rename-item", originalName = "Фляга до переименования";
const firstName = "Походная фляга", secondName = "Походная фляга для воды";
const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

function renamePayload(large = false) {
  const payload = legacyPhotoPayload();
  // Keep initial form values normalized: trimming an old note on submit is
  // an additional business edit and correctly requires a full list action.
  payload.items[itemId] = { id: itemId, name: originalName, weight: 80,
    quantity: 1, containerId: "placed-bag", location: "Велосипед", category: "", categories: [], color: "",
    note: large ? "Сохранённые данные. ".repeat(24000).trim() : "", photos: [] };
  payload.containers["placed-bag"].itemIds = [itemId];
  const arrangement = payload.layouts[legacyLayoutId].arrangement;
  arrangement.items[itemId] = "placed-bag";
  arrangement.itemQuantities[itemId] = 1;
  arrangement.containers["placed-bag"].itemIds = [itemId];
  arrangement.containers["placed-bag"].order = [{ type: "item", id: itemId }];
  return payload;
}

async function renameThroughForm(page, name) {
  const item = page.locator(`#packingView [data-item-id="${itemId}"]`);
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill(name);
  await page.locator("#itemName").blur();
  await page.locator("#saveItemBtn").click();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await expect(item).toContainText(name);
}

function assertCompactAction(action, expectedName, name) {
  expect(action.kind).toBe("item.rename");
  expect(action.body).toMatchObject({ version: 1, itemId, expectedName, name });
  expect(Object.hasOwn(action.body, "payload")).toBe(false);
  expect(bytes(action.body)).toBeLessThanOrEqual(4096);
  expect(bytes(action)).toBeLessThan(8192);
  expect(Object.keys(action.body.itemMeta).sort()).toEqual(["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]);
  expect(Number.isFinite(Date.parse(action.body.itemMeta.updatedAt))).toBe(true);
  for (const key of ["userPlacement", "userDeletion", "photoResults", "archiveImport"]) expect(action.body[key]).toBeUndefined();
}

function assertServerRename(f, payload, action) {
  const expected = { ...payload.items[itemId], name: action.body.name, ...action.body.itemMeta };
  expect(f.payload.items[itemId]).toEqual(expected);
  expect(Object.keys(f.payload.items)).toEqual([itemId]);
  expect(f.payload.containers).toEqual(payload.containers);
  expect(f.payload.layouts).toEqual(payload.layouts);
  expect(f.payload.containers[legacyBagId].photos).toEqual(payload.containers[legacyBagId].photos);
  expect(f.receipts.get(action.operationId).result.payload.rename).toEqual({ version: 1, itemId,
    previousName: action.body.expectedName, name: action.body.name, itemMeta: action.body.itemMeta });
}

async function assertCleanFinish(page, f, name, count) {
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(page.locator(`#packingView [data-item-id="${itemId}"]`)).toContainText(name);
  expect((await nativeLegacyPhotoOutbox(page)).pending).toBe(false);
  expect(f.posts).toHaveLength(count);
  await f.flushErrors(); expect(f.errors).toEqual([]); expect(f.pageErrors).toEqual([]);
}

test("healthy photo recovery fence never opens a modal during compact rename or reload", async ({ page, context }) => {
  test.setTimeout(90000);
  // A visibility assertion after saving would miss a transient modal. Observe
  // the actual native open call before startup and retain observations across
  // reload, without changing dialog behavior.
  await context.addInitScript(() => {
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function(...args) {
      if (this.id === "personalSaveRecoveryDialog") {
        const key = "test-personal-recovery-modal-opens";
        sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || 0) + 1));
      }
      return showModal.apply(this, args);
    };
  });
  const payload = renamePayload();
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload });
  await renameThroughForm(page, firstName);
  await assertCleanFinish(page, f, firstName, 1);
  assertCompactAction(f.posts[0], originalName, firstName);
  assertServerRename(f, payload, f.posts[0]);
  await f.waitForApiIdle(); await page.reload(); await readyLegacyPhotoBrowser(page);
  await assertCleanFinish(page, f, firstName, 1);
  await f.waitForApiIdle();
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  expect(await page.evaluate(() => Number(sessionStorage.getItem("test-personal-recovery-modal-opens") || 0))).toBe(0);
});

test("photo recovery storage failure still opens the blocking dialog before sending a rename", async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = renamePayload();
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload });
  await f.waitForApiIdle();
  await page.evaluate(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === "bike-packing-personal-photo-actions-v1") {
        window.__photoRecoveryStorageFailures = (window.__photoRecoveryStorageFailures || 0) + 1;
        throw new DOMException("Synthetic photo recovery storage unavailable", "UnknownError");
      }
      return open.call(this, name, ...args);
    };
  });
  await renameThroughForm(page, firstName);
  const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery).toBeVisible({ timeout: 30000 });
  await expect(recovery).toHaveAttribute("role", "alertdialog");
  await expect(recovery.locator("#personalSaveRecoveryTitle")).toHaveText("Фото требуют проверки");
  await expect(recovery.locator("[data-recovery-reason]")).toContainText("их журнал недоступен");
  expect(await recovery.evaluate(dialog => dialog.matches(":modal"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(recovery).toBeVisible();
  expect(await page.evaluate(() => window.__photoRecoveryStorageFailures)).toBeGreaterThan(0);
  expect(f.posts).toHaveLength(0);
  expect(f.payload.items[itemId]).toEqual(payload.items[itemId]);
  expect(f.payload.containers[legacyBagId].photos).toEqual(payload.containers[legacyBagId].photos);
  await f.flushErrors(); expect(f.errors).toEqual([]); expect(f.pageErrors).toEqual([]);
});

for (const [loseAck, quotaPressure] of [[false, false], [true, false], [true, true]]) test(`compact form rename survives cold recovery; lost ACK=${loseAck}; quota=${quotaPressure}`, async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = renamePayload(quotaPressure);
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload, loseAck });
  if (quotaPressure) {
    const limitJournal = () => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("bike-packing-experiment-uncertain-write-v1:") && value.length > 65536)
          throw new DOMException("No room for another full payload", "QuotaExceededError");
        return set.call(this, key, value);
      };
    };
    await context.addInitScript(limitJournal); await page.evaluate(limitJournal);
  }
  await renameThroughForm(page, firstName);
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length, { timeout: 30000 }).toBe(1);
  await expect.poll(() => f.payload.items[itemId].name).toBe(firstName);
  const action = f.posts[0], id = action.operationId;
  assertCompactAction(action, originalName, firstName);
  expect(f.captured[0].records).toHaveLength(1);
  assertCompactAction(f.captured[0].record.action, originalName, firstName);
  if (loseAck) {
    await expect.poll(() => f.receiptReads.includes(id)).toBe(true);
    expect((await nativeLegacyPhotoOutbox(page)).pending).toBe(true);
    const markerRaw = await page.evaluate(id => localStorage.getItem(`bike-packing-experiment-uncertain-write-v1:${id}`), id);
    expect(Buffer.byteLength(markerRaw, "utf8")).toBeLessThan(8192);
    expect(JSON.parse(markerRaw).recovery?.body?.payload).toBeUndefined();
    // Failed receipt reads across a new JS runtime never authorize a repost.
    await page.waitForLoadState("networkidle");
    await page.reload(); await readyLegacyPhotoBrowser(page);
    expect(f.posts).toHaveLength(1);
    f.loseAck = false; f.hideReceipts = false;
  }
  await page.waitForLoadState("networkidle");
  await page.reload(); await readyLegacyPhotoBrowser(page);
  await assertCleanFinish(page, f, firstName, 1);
  expect(f.posts[0].operationId).toBe(id);
  assertServerRename(f, payload, action);
});

test("two compact form renames stay ordered offline through a cold restart", async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = renamePayload(true);
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload });
  await page.waitForLoadState("networkidle");
  const offlineStatus = () => Object.defineProperty(navigator, "onLine", {
    configurable: true, get: () => sessionStorage.getItem("compact-test-offline") !== "1" });
  await context.addInitScript(offlineStatus); await page.evaluate(offlineStatus);
  f.apiOffline = true;
  await page.evaluate(() => { sessionStorage.setItem("compact-test-offline", "1"); dispatchEvent(new Event("offline")); });
  await renameThroughForm(page, firstName);
  await renameThroughForm(page, secondName);
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).records.length).toBe(2);
  const captured = await nativeLegacyPhotoOutbox(page);
  const [first, second] = captured.records.map(record => record.action);
  assertCompactAction(first, originalName, firstName); assertCompactAction(second, firstName, secondName);
  expect(second.body.causal.baseOperationId).toBe(first.operationId);
  const rawRecords = captured.entries.map(([, raw]) => JSON.parse(raw)).filter(value => value.action?.kind === "item.rename");
  expect(rawRecords).toHaveLength(2);
  expect(rawRecords.every(record => record.version === 4)).toBe(true);
  const successor = rawRecords.find(record => record.action.operationId === second.operationId);
  expect(successor.source).toEqual({ operationId: first.operationId });
  expect(bytes(successor)).toBeLessThan(8192);
  // The initial record has one shared baseline; the next command adds no list.
  expect(rawRecords.reduce((total, record) => total + bytes(record), 0)).toBeLessThan(bytes(payload) + 16384);
  expect(f.posts).toHaveLength(0);
  // Resources are served as cached files; all API requests remain aborted.
  await page.reload(); await readyLegacyPhotoBrowser(page);
  await expect(page.locator(`#packingView [data-item-id="${itemId}"]`)).toContainText(secondName);
  expect((await nativeLegacyPhotoOutbox(page)).records.map(record => record.action)).toEqual([first, second]);
  expect(f.posts).toHaveLength(0);
  f.apiOffline = false;
  await page.evaluate(() => { sessionStorage.removeItem("compact-test-offline"); dispatchEvent(new Event("online")); });
  await page.locator("#syncBtn").click();
  await assertCleanFinish(page, f, secondName, 2);
  expect(f.posts.map(action => action.operationId)).toEqual([first.operationId, second.operationId]);
  assertServerRename(f, payload, second);
  await f.waitForApiIdle(); await page.reload(); await readyLegacyPhotoBrowser(page);
  await assertCleanFinish(page, f, secondName, 2);
});

test("a second compact form rename survives the first rename's delayed ACK", async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = renamePayload();
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload });
  let releaseAck;
  const ack = new Promise(resolve => { releaseAck = resolve; });
  f.afterCommit = action => action.body.name === firstName ? ack : undefined;
  try {
    await renameThroughForm(page, firstName);
    await page.locator("#syncBtn").click();
    await expect.poll(() => f.receipts.size, { timeout: 30000 }).toBe(1);
    await renameThroughForm(page, secondName);
    await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).records.length).toBe(2);
    const [first, second] = (await nativeLegacyPhotoOutbox(page)).records.map(record => record.action);
    assertCompactAction(first, originalName, firstName); assertCompactAction(second, firstName, secondName);
    expect(f.posts).toHaveLength(1);
    expect(second.body.causal.baseOperationId).toBe(first.operationId);
    releaseAck();
    await assertCleanFinish(page, f, secondName, 2);
    expect(f.posts.map(action => action.operationId)).toEqual([first.operationId, second.operationId]);
    assertServerRename(f, payload, second);
    await page.waitForLoadState("networkidle"); await page.reload(); await readyLegacyPhotoBrowser(page);
    await assertCleanFinish(page, f, secondName, 2);
  } finally { releaseAck(); }
});
