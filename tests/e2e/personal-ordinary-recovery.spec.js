import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, nativeLegacyPhotoOutbox, nativeLegacyPhotoTransport,
  seedLegacyPhotoPendingAction, seedLegacyPhotoRebaseAction, legacyPhotoBinding, legacyLayoutId, legacyBagId, legacyPendingBagIds } from "../fixtures/personal-legacy-photo-browser-fixture.js";

// Normal release artifacts only. HTTP is a strict synthetic server; the paired
// existing API's stale cancellation and real file/SQL invariants have separate
// MySQL coverage. No app lexical hooks or operation receipts are injected.
test.setTimeout(120000);
test.use({ screenshot: "off" });
const dialog = page => page.locator("#personalOrdinaryRecoveryDialog");
const storagePrefix = "bike-packing-personal-ordinary-recovery-v1:";
const roots = page => page.locator("#packingView [data-root-container-id]");
const reload = async page => { await page.reload(); await readyLegacyPhotoBrowser(page); };

async function recoveryStorage(page) {
  return page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix))
    .map(([key, raw]) => ({ key, raw, value: JSON.parse(raw) })), storagePrefix);
}

async function assertArchive(page, original, { completed }) {
  const entries = await recoveryStorage(page), archives = entries.filter(entry => entry.key.includes(":archive:"));
  expect(archives).toHaveLength(1);
  const archive = archives[0].value;
  expect(archive.format).toBe("bike-packing-personal-ordinary-recovery-v1");
  expect(archive.operationIds).toEqual(original.records.map(record => record.action.operationId));
  expect(archive.snapshot.layouts).toEqual(original.snapshot.layouts);
  for (const [key, value] of original.entries) expect(archive.entries).toContainEqual({ key, value });
  expect(entries.some(entry => entry.key.includes(":complete:") && entry.value.recoveryId === archive.recoveryId)).toBe(completed);
  return archive;
}

async function oldPhone(page, context) {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { ordinaryRecovery: true, mixedLegacyRoutes: true });
  const original = await seedLegacyPhotoPendingAction(page);
  expect(original.record.mergeBase).toBeUndefined();
  const server = f.registerOrdinaryRecovery(original), registered = structuredClone([...f.registeredPhotoRows]);
  await reload(page);
  await expect.poll(() => f.calls.some(call => call.method === "GET"
    && call.path === `/bike-packing/list-operations/${original.record.action.operationId}` && call.receiptState === "unknown"),
  { timeout: 30000 }).toBe(true);
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "synced");
  await expect(roots(page)).toHaveCount(2);
  await expect(page.locator("#summary")).toContainText(/2[.,]7(?:0)?\s*кг/);
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("#personalRecoveryNotice")).toBeVisible();
  await expect(page.locator("#personalRecoveryNotice")).toContainText("нужно ваше решение");
  expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]);
  expect(f.revision).toBe(1585); expect(f.payload).toEqual(server);
  expect((await nativeLegacyPhotoOutbox(page)).records).toEqual(original.records);
  return { f, original, server, registered };
}

async function openChoice(page) {
  await page.getByRole("button", { name: "Разобрать изменения", exact: true }).click();
  await expect(dialog(page)).toBeVisible({ timeout: 30000 });
  await expect(dialog(page)).toContainText("На сервере уже более свежая версия");
}

async function green(page, f) {
  await expect.poll(() => f.revision, { timeout: 30000 }).toBe(1586);
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).pending, { timeout: 30000 }).toBe(false);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(roots(page)).toHaveCount(4);
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("#personalRecoveryNotice")).not.toBeVisible();
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || !page.legacyPhotoFixture) return;
  const f = page.legacyPhotoFixture;
  await info.attach("ordinary-recovery-evidence", { contentType: "application/json", body: JSON.stringify({
    calls: f.calls, cancellations: f.cancellations, cancellationSnapshots: f.cancellationSnapshots, posts: f.posts,
    receipts: [...f.receipts], payload: f.payload, revision: f.revision, errors: f.errors,
    archives: await recoveryStorage(page).catch(error => ({ error: error.message })),
    transport: await nativeLegacyPhotoTransport(page).catch(error => ({ error: error.message })),
    outbox: await nativeLegacyPhotoOutbox(page).catch(error => ({ error: error.message }))
  }, null, 2) });
});

test("manual ordinary recovery obtains server identity around the actual identity-free state DTO before offering a choice", async ({ page, context }, info) => {
  const { f, original, server } = await oldPhone(page, context), start = f.calls.length;
  await page.screenshot({ path: info.outputPath("recovery-notice.png") });
  await openChoice(page);
  await expect(dialog(page).locator("[data-recovery-actions]")).toContainText("Добавить существующую сумку в укладку");
  await expect(dialog(page).locator("[data-recovery-actions]")).toContainText("Сумка с четырьмя фотографиями");
  await expect(dialog(page).locator("[data-recovery-actions]")).toContainText("Укладка:");
  await expect(dialog(page).locator("[data-recovery-reason]")).not.toBeEmpty();
  await page.screenshot({ path: info.outputPath("recovery-dialog.png") });
  const reads = f.calls.slice(start).filter(call => call.response).map(call => call.response);
  expect(reads.some(read => read.type === "state")).toBe(true);
  for (const [index, read] of reads.entries()) if (read.type === "state") {
    expect(read.keys).toEqual(["ok", "listId", "updatedAt", "serverUpdatedAt", "stateRevision", "state", "payload",
      "record", "payloadHash", "entityHash", "itemCount", "containerCount", "layoutCount"]);
    expect(read.recordKeys).toEqual(["payload", "payloadHash", "entityHash", "stateRevision", "itemCount", "containerCount",
      "layoutCount", "payloadSize", "updatedAt"]);
    expect(read.listId).toBe(legacyPhotoBinding.listId); expect(read.stateRevision).toBe(1585);
    for (const detail of [reads[index - 1], reads[index + 1]]) expect(detail).toEqual({ type: "detail",
      id: legacyPhotoBinding.listId, ownerId: legacyPhotoBinding.actorId, stateRevision: read.stateRevision });
  }
  // Showing a decision is read-only: original UUID/body bytes and server data
  // remain untouched until the user actually chooses a recovery action.
  expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]); expect(f.preparations).toEqual([]);
  expect(await recoveryStorage(page)).toEqual([]); expect(f.payload).toEqual(server);
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.records).toEqual(original.records);
  for (const entry of original.entries) expect(native.entries).toContainEqual(entry);
  await dialog(page).getByRole("button", { name: "Решить позже", exact: true }).click();
  await expect(page.locator("#personalRecoveryNotice")).toBeVisible();
  expect(f.errors).toEqual([]);
});

for (const changed of ["owner", "revision"]) test(`ordinary recovery does not offer a choice when ${changed} changes between state and final detail`, async ({ page, context }) => {
  const { f, original, server } = await oldPhone(page, context), start = f.calls.length;
  let changedOnce = false;
  f.afterStateRead = () => {
    f.afterStateRead = null; changedOnce = true;
    if (changed === "owner") f.detailOwnerId = "different-owner";
    else f.revision++;
  };
  await page.locator("#syncBtn").click();
  await expect.poll(() => changedOnce, { timeout: 30000 }).toBe(true);
  await expect.poll(() => f.calls.slice(start).some(call => call.response?.type === "detail"
    && (changed === "owner" ? call.response.ownerId === "different-owner" : call.response.stateRevision === 1586)),
  { timeout: 30000 }).toBe(true);
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "synced");
  await expect(dialog(page)).not.toBeVisible(); await expect(page.locator("#conflictDialog")).not.toBeVisible();
  await expect(roots(page)).toHaveCount(2);
  expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]); expect(f.preparations).toEqual([]);
  expect(await recoveryStorage(page)).toEqual([]); expect(f.payload).toEqual(server);
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.pending).toBe(true); expect(native.records).toEqual(original.records);
  for (const entry of original.entries) expect(native.entries).toContainEqual(entry);
  expect(f.errors).toEqual([]);
});

test("ordinary stale phone recovery fences the old UUID, adopts one fresh server CAS and keeps the archive after another edit", async ({ page, context }) => {
  const { f, original, server, registered } = await oldPhone(page, context);
  await openChoice(page);
  await dialog(page).getByRole("button", { name: "Загрузить серверную версию", exact: true }).click();
  await green(page, f);
  expect(f.cancellations).toEqual([...f.ordinaryOriginals.values()]);
  expect(f.posts).toHaveLength(1); expect(f.noopPosts).toEqual(f.posts);
  expect(f.posts[0].operationId).not.toBe(original.record.action.operationId);
  expect(f.posts[0].body.payload).toEqual(personalBusinessPayload(server));
  expect(f.receipts.get(original.record.action.operationId).operation.state).toBe("rejected");
  expect(f.receipts.get(original.record.action.operationId).result.payload.code).toBe("operation_cancelled");
  for (const snapshot of f.cancellationSnapshots) expect(snapshot.after).toEqual(snapshot.before);
  const archive = await assertArchive(page, original, { completed: true });
  expect(archive.successorOperationId).toBe(f.posts[0].operationId);
  expect([...f.registeredPhotoRows]).toEqual(registered);
  f.freshnessAvailable = false;
  await reload(page); await green(page, f);
  expect(f.posts).toHaveLength(1); expect(f.cancellations).toHaveLength(1);
  expect(await assertArchive(page, original, { completed: true })).toEqual(archive);
  const bag = page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`);
  await bag.getByRole("heading", { name: "Сумка с четырьмя фотографиями", exact: true }).click();
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(4);
  await page.locator("#rootContainerRemoveFromLayoutBtn").click(); await page.locator("#confirmOkBtn").click();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.revision, { timeout: 30000 }).toBe(1587);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced");
  expect(f.posts).toHaveLength(2); expect(f.posts[1].body.userPlacement.action).toBe("remove-container");
  expect(f.posts.every(post => !f.ordinaryOriginals.has(post.operationId))).toBe(true);
  expect(f.payload.layouts[legacyLayoutId].arrangement.rootContainerIds).toEqual(["placed-bag", ...legacyPendingBagIds.slice(1)]);
  await reload(page);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced");
  expect(await assertArchive(page, original, { completed: true })).toEqual(archive);
  expect(f.posts).toHaveLength(2); expect([...f.registeredPhotoRows]).toEqual(registered); expect(f.errors).toEqual([]);
});

test("ordinary recovery export and decide-later retain the phone placement and send no cancellation or save", async ({ page, context }) => {
  const { f, original, server } = await oldPhone(page, context);
  await openChoice(page);
  const downloaded = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: "Скачать данные для разбора", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("bike-packing-local-recovery.json");
  const copy = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(JSON.stringify(copy)).toContain(original.record.action.operationId);
  for (const [key, value] of original.entries) expect(copy.entries).toContainEqual({ key, value });
  await dialog(page).getByRole("button", { name: "Решить позже", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  expect(f.cancellations).toEqual([]); expect(f.posts).toEqual([]); expect(await recoveryStorage(page)).toEqual([]);
  expect((await nativeLegacyPhotoOutbox(page)).records).toEqual(original.records);
  expect(f.payload).toEqual(server); expect(f.revision).toBe(1585);
  await reload(page);
  await expect(roots(page)).toHaveCount(2); await expect(dialog(page)).not.toBeVisible();
  expect(f.cancellations).toEqual([]); expect(f.posts).toEqual([]); expect(f.errors).toEqual([]);
});

test("lost cancellation ACK resumes the durable server choice on reload without executing the phone action", async ({ page, context }) => {
  const { f, original, server } = await oldPhone(page, context);
  await openChoice(page); f.loseCancellationAck = true;
  await dialog(page).getByRole("button", { name: "Загрузить серверную версию", exact: true }).click();
  await expect.poll(() => f.cancellationAckDropped, { timeout: 30000 }).toBe(true);
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  const archive = await assertArchive(page, original, { completed: false });
  expect(f.posts).toEqual([]); expect(f.payload).toEqual(server); expect(f.revision).toBe(1585);
  expect((await nativeLegacyPhotoOutbox(page)).records).toEqual(original.records);
  f.hideCancellationReceipts = false;
  await reload(page); await green(page, f);
  expect(f.cancellations).toHaveLength(1); expect(f.posts).toHaveLength(1);
  expect(f.posts[0].operationId).toBe(archive.successorOperationId);
  expect(await assertArchive(page, original, { completed: true })).toEqual(archive);
  await reload(page); await green(page, f);
  expect(f.cancellations).toHaveLength(1); expect(f.posts).toHaveLength(1); expect(f.errors).toEqual([]);
});

test("quota while archiving the explicit choice blocks cancellation and preserves all old action bytes", async ({ page, context }) => {
  const { f, original, server } = await oldPhone(page, context);
  await openChoice(page);
  await page.evaluate(prefix => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith(prefix)) throw new DOMException("Isolated recovery quota", "QuotaExceededError");
      return originalSet.call(this, key, value);
    };
  }, storagePrefix);
  await dialog(page).getByRole("button", { name: "Загрузить серверную версию", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  expect(f.cancellations).toEqual([]); expect(f.posts).toEqual([]); expect(await recoveryStorage(page)).toEqual([]);
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.pending).toBe(true); expect(native.records).toEqual(original.records);
  for (const entry of original.entries) expect(native.entries).toContainEqual(entry);
  expect(f.payload).toEqual(server); expect(f.revision).toBe(1585);
  await reload(page); await expect(roots(page)).toHaveCount(2);
  expect(f.cancellations).toEqual([]); expect(f.posts).toEqual([]); expect(f.errors).toEqual([]);
});

async function verifiedBasePhone(page, context, options = {}) {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, {
    ordinaryRecovery: true, ordinaryRebase: true, mixedLegacyRoutes: true });
  const original = await seedLegacyPhotoRebaseAction(page);
  expect(original.record.mergeBase.stateRevision).toBe(1582);
  expect(original.record.action.body.payload.containers["placed-bag"].weight).toBe(1850);
  expect(original.seededRequests).toEqual([{ expectedActorId: legacyPhotoBinding.actorId, environment: "bike-packing-experiment",
    operationId: original.record.action.operationId, kind: "list.update", listId: legacyPhotoBinding.listId, body: original.record.action.body }]);
  const server = f.registerOrdinaryRebase(original, options), registered = structuredClone([...f.registeredPhotoRows]);
  expect(server.containers["server-new-bag"].weight).toBe(750);
  await reload(page);
  return { f, original, server, registered };
}

async function assertRebaseGreen(page, { f, original, registered }, weight) {
  await expect.poll(() => f.revision, { timeout: 30000 }).toBe(1586);
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).pending, { timeout: 30000 }).toBe(false);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(dialog(page)).not.toBeVisible(); await expect(page.locator("#conflictDialog")).not.toBeVisible();
  await expect(page.locator("#personalRecoveryNotice")).not.toBeVisible();
  await expect(roots(page)).toHaveCount(2);
  await expect(page.locator('#packingView [data-root-container-id="server-new-bag"]')).toContainText("Новая сумка с другого устройства");
  expect(f.posts).toHaveLength(1); expect(f.noopPosts).toEqual(f.posts); expect(f.cancellations).toEqual([]);
  const posted = f.posts[0];
  expect(posted.operationId).not.toBe(original.record.action.operationId);
  expect(posted.body.baseStateRevision).toBe(1585); expect(posted.body.causal).toEqual({ dependsOn: [], reads: [] });
  expect(posted.body.payload.containers["placed-bag"].weight).toBe(weight);
  expect(f.payload.containers["placed-bag"].weight).toBe(weight);
  expect(f.payload.layouts[legacyLayoutId].arrangement.rootContainerIds).toEqual(["placed-bag", "server-new-bag"]);
  for (const id of [legacyBagId, "second"]) {
    expect(posted.body.payload.containers[id].photos).toEqual(f.initial.containers[id].photos);
    expect(f.payload.containers[id].photos).toEqual(f.initial.containers[id].photos);
  }
  expect(f.preparations).toEqual([...f.ordinaryOriginals.values()]);
  expect(f.receipts.get(original.record.action.operationId)).toMatchObject({ operation: { state: "rejected" },
    result: { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: 1585 } } });
  for (const snapshot of f.preparationSnapshots) expect(snapshot.after).toEqual(snapshot.before);
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.confirmed.stateRevision).toBe(1586);
  expect(native.confirmed.payload).toEqual(personalBusinessPayload(f.payload));
  expect([...f.registeredPhotoRows]).toEqual(registered); expect(f.errors).toEqual([]);
}

test("verified saved base automatically rebases a local weight over the independently added server bag without replaying the old UUID", async ({ page, context }) => {
  const fixture = await verifiedBasePhone(page, context);
  await assertRebaseGreen(page, fixture, 1850);
  await expect(page.locator("#summary")).toContainText(/2[.,]6(?:0)?\s*кг/);
  fixture.f.freshnessAvailable = false;
  await reload(page); await assertRebaseGreen(page, fixture, 1850);
  expect(fixture.f.posts).toHaveLength(1); expect(fixture.f.preparations).toHaveLength(1);
});

for (const choice of ["local", "remote"]) test(`verified saved base asks about the conflicting weight, preserves defer, then applies the explicit ${choice} value with the remote bag`, async ({ page, context }) => {
  const fixture = await verifiedBasePhone(page, context, { conflictingWeight: 2250 });
  const { f, original, server } = fixture;
  // Autosave preserves focus and leaves a conflicting edit paused. Only an
  // explicit sync opens the comparison; a background dialog is not required.
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  await expect(page.locator("#conflictDialog")).not.toBeVisible();
  expect(f.posts).toEqual([]); expect(f.payload).toEqual(server);
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await expect(page.locator("#conflictList")).toContainText(/1[.,]9\s*кг/);
  await expect(page.locator("#conflictList")).toContainText(/2[.,]3\s*кг/);
  expect(f.posts).toEqual([]); expect(f.payload).toEqual(server); expect(f.revision).toBe(1585);
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#conflictDialog")).not.toBeVisible();
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]); expect(f.payload).toEqual(server);
  const pending = await nativeLegacyPhotoOutbox(page);
  expect(pending.pending).toBe(true); expect(pending.record.action).toEqual(original.record.action);
  expect(pending.record.snapshot).toEqual(original.snapshot);
  expect(pending.record.mergeBase).toEqual(original.record.mergeBase);
  const weight = choice === "local" ? 1850 : 2250;
  f.selectRebaseWeight(weight);
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 30000 });
  await page.locator(`#conflictList input[value="${choice}"]`).check();
  await page.locator("#conflictApplyBtn").click();
  await assertRebaseGreen(page, fixture, weight);
  await reload(page); await assertRebaseGreen(page, fixture, weight);
  expect(f.posts).toHaveLength(1); expect(f.preparations).toHaveLength(1);
});
