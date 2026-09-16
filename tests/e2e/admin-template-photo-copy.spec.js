import { test, expect as baseExpect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adminPhotoCopyUiFixture, nativeAdminCopyRecords, openCopyUiTemplate } from "../fixtures/admin-template-photo-copy-ui-fixture.js";

// Full immutable JSON/IDB verification is slower in Windows mobile WebKit.
// Keep the same bounded waits when the general CI config collects this file.
const expect = baseExpect.configure({ timeout: 30000 });
test.describe.configure({ timeout: 120000 });

test.beforeAll(() => {
  if (process.env.BIKE_COPY_UI_REUSE === "1") return;
  const vite = fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")));
  for (const mode of ["admin-photo-copy", "admin-photo-copy-off"]) {
    const build = spawnSync(process.execPath, [vite, "build", "--config", "tests/e2e/admin-template-ui.vite.config.js", "--mode", mode],
      { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
    expect(build.status, build.stderr || build.stdout).toBe(0);
  }
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const server = page.adminPhotoCopyServer;
  await info.attach("copy-ui-server", { body: JSON.stringify(server && { errors: [...server.errors, ...server.target.errors],
    source: server.source, target: { binding: server.target.binding, payload: server.target.payload, posts: server.target.posts,
      receipts: [...server.target.receipts] }, stagePosts: server.stagePosts, stageGets: server.stageGets, saveGets: server.saveGets }), contentType: "application/json" });
  await info.attach("copy-ui-page", { body: JSON.stringify(await page.evaluate(() => ({ state: window.__adminUiTest?.state(),
    journals: Object.entries(localStorage), error: window.__adminUiLastError })).catch(error => ({ error: error.message }))), contentType: "application/json" });
  await info.attach("copy-ui-idb", { body: JSON.stringify(await nativeAdminCopyRecords(page).catch(error => ({ error: error.message }))), contentType: "application/json" });
});

const activate = async (page, selector) => test.info().project.name === "mobile-webkit" ? page.locator(selector).tap() : page.locator(selector).click();
const plans = page => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:")).map(([, value]) => JSON.parse(value).plan));
const copyButton = "[data-pick-admin-photo-catalog]";
async function selection(page, server, entityType) {
  return page.evaluate(({ sourceList, targetList, entityType }) => {
    const state = __adminUiTest.state(), source = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === sourceList),
      target = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === targetList), type = entityType === "item" ? "items" : "containers";
    const sourceOwner = source.adminCausalSource.photoOwnerMap.owners.find(row => row.type === type && row.serverId === (entityType === "item" ? "pump" : "bag"));
    const namespace = layout => ({ layout: structuredClone(layout), items: Object.fromEntries(Object.entries(state.items).filter(([, row]) => row.publicCatalogLayoutId === layout.id)),
      containers: Object.fromEntries(Object.entries(state.containers).filter(([, row]) => row.publicCatalogLayoutId === layout.id)) });
    return { sourceId: sourceOwner.localId, sourceLayoutId: source.id, targetLayoutId: target.id, entityType,
      sourceBefore: namespace(source), targetBefore: namespace(target), privatePayload: __adminUiTest.privatePayload() };
  }, { sourceList: server.source.binding.listId, targetList: server.target.binding.listId, entityType });
}
async function openPicker(page, server, entityType, { unsaved = false, includeContents = false } = {}) {
  await openCopyUiTemplate(page, server.source.binding);
  const picked = await selection(page, server, entityType), item = entityType === "item";
  picked.dialog = item ? "#itemDialog" : "#rootContainerDialog";
  await activate(page, `.tab[data-view="${item ? "items" : "bags"}"]`);
  if (includeContents) await page.evaluate(id => __adminUiTest.openContainer(id), picked.sourceId);
  else await activate(page, item ? `#itemsView [data-list-item-id="${picked.sourceId}"] .item-title` : `[data-root-card="${picked.sourceId}"] .item-title`);
  await expect(page.locator(picked.dialog)).toBeVisible();
  if (unsaved) await page.locator(item ? "#itemName" : "#rootContainerName").fill("Несохранённая правка источника");
  await activate(page, item ? "#itemCopyToContainerBtn" : "#rootContainerCopyToContainerBtn");
  await expect(page.locator("#containerPickerDialog")).toBeVisible();
  await page.locator("#containerPickerLayoutSelect").selectOption(picked.targetLayoutId);
  return picked;
}
async function confirmed(page, server) {
  await expect.poll(() => server.target.receipts.size).toBe(server.target.posts.length);
  await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts).some(row => row.adminCausalSource?.binding.listId === listId
    && row.adminCausalSource.base?.stateRevision === revision && !row.adminCausalSource.planId && !row.adminCausalSource.photoCopyPending),
  { listId: server.target.binding.listId, revision: server.target.revision });
}
async function assertNoCandidate(page, selected) {
  const current = await page.evaluate(id => {
    const state = __adminUiTest.state(); return { items: Object.fromEntries(Object.entries(state.items).filter(([, row]) => row.publicCatalogLayoutId === id)),
      containers: Object.fromEntries(Object.entries(state.containers).filter(([, row]) => row.publicCatalogLayoutId === id)) };
  }, selected.targetLayoutId);
  expect(current.items).toEqual(selected.targetBefore.items); expect(current.containers).toEqual(selected.targetBefore.containers);
}
async function assertCopied(page, server, selected) {
  expect([...server.errors, ...server.target.errors]).toEqual([]); expect(server.target.posts).toHaveLength(1); expect(server.stagePosts).toHaveLength(2);
  const input = server.target.posts[0], copy = input.body.photoCopy, type = selected.entityType === "item" ? "items" : "containers";
  expect(input.body.payload).toEqual(server.target.initialPayload); expect(copy.source.payload).toEqual(server.source.initialPayload);
  expect(server.source.payload).toEqual(server.source.initialPayload); expect(server.source.revision).toBe(5);
  expect(copy.entityType).toBe(selected.entityType); expect(copy.assets.map(asset => asset.sourcePhotoId)).toEqual(server.source.payload[type][copy.source.entityId].photos.map(photo => photo.id ?? photo.photoId));
  const added = server.target.payload[type][copy.entityId], original = server.source.payload[type][copy.source.entityId];
  expect(added.sourceOpaque).toEqual(original.sourceOpaque); expect(added.name).toBe(`${original.name} (копия)`); expect(added.photos).toHaveLength(2);
  expect(added.photos.map(photo => photo.id)).toEqual(copy.assets.map(asset => asset.photoId));
  for (const [index, photo] of added.photos.entries()) {
    expect(photo.createdAt).toBe(original.photos[index].createdAt); expect(photo.updatedAt).toBe(original.photos[index].updatedAt);
    expect(photo.url).toContain(server.target.binding.listId); expect(photo.url).not.toContain(server.source.binding.listId);
    expect(photo.file_url).toBeUndefined(); expect(photo.thumbnailUrl).toBeUndefined();
  }
  if (selected.entityType === "container") expect({ parentId: added.parentId, itemIds: added.itemIds, childIds: added.childIds, order: added.order })
    .toEqual({ parentId: null, itemIds: [], childIds: [], order: [] });
  else expect(added.containerId).toBe("");
  for (const collection of ["items", "containers"]) for (const [id, value] of Object.entries(server.target.initialPayload[collection])) expect(server.target.payload[collection][id]).toEqual(value);
  for (const key of ["layouts", "locations", "categories", "packedItems"]) expect(server.target.payload[key]).toEqual(server.target.initialPayload[key]);
  const records = await nativeAdminCopyRecords(page), saved = await plans(page);
  expect(records.actions).toHaveLength(1); expect(records.claims).toHaveLength(2); expect(saved).toHaveLength(1);
  const row = records.actions[0]; expect(row.intentHash).toBe(row.checkedIntentHash); expect(row.intent.action).toMatchObject({ operationId: input.operationId, body: input.body });
  expect(saved[0]).toMatchObject({ version: 8, id: input.operationId, recordIntentHash: row.intentHash });
  expect(row.intent.stages).toEqual(server.stagePosts.map(row => row.manifest));
  expect(server.target.receipts.get(input.operationId).result.payload.photoCopy.confirmedPayload).toEqual(server.target.payload);
  for (const stage of server.stages.values()) {
    expect(stage.receipt.ownerId).not.toBe(server.target.binding.actorId); expect(stage.receipt.sourceOwnerId).not.toBe(stage.receipt.ownerId);
    expect(stage.receipt.sourceStored).toEqual(stage.receipt.stored);
    for (const hash of Object.values(stage.receipt.materialization.target)) expect(Object.values(stage.receipt.materialization.source)).not.toContain(hash);
  }
  const ui = await page.evaluate(({ selected, copiedId }) => {
    const state = __adminUiTest.state(), source = state.layouts[selected.sourceLayoutId], target = state.layouts[selected.targetLayoutId];
    return { sourceItems: Object.fromEntries(Object.entries(state.items).filter(([, row]) => row.publicCatalogLayoutId === source.id)),
      sourceContainers: Object.fromEntries(Object.entries(state.containers).filter(([, row]) => row.publicCatalogLayoutId === source.id)),
      oldMap: target.adminCausalSource.photoOwnerMap.owners.filter(row => row.serverId !== copiedId),
      copied: target.adminCausalSource.photoOwnerMap.owners.find(row => row.serverId === copiedId), privatePayload: __adminUiTest.privatePayload() };
  }, { selected, copiedId: copy.entityId });
  expect(ui.sourceItems).toEqual(row.intent.snapshot.source.beforeState.items); expect(ui.sourceContainers).toEqual(row.intent.snapshot.source.beforeState.containers);
  expect(ui.oldMap).toEqual(selected.targetBefore.layout.adminCausalSource.photoOwnerMap.owners);
  expect(ui.copied.localId).toBe(row.intent.snapshot.copiedOwner.localId); expect(ui.privatePayload).toEqual(selected.privatePayload);
  return { input, records, saved };
}

for (const [entityType, sharedTarget] of [["item", true], ["container", false]]) test(`actual ${entityType} catalog copy preserves both templates and waits before adding its owner`, async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context, { sharedTarget }), selected = await openPicker(page, server, entityType);
  await expect(page.locator(copyButton)).toBeVisible();
  if (entityType === "container") await expect(page.locator(copyButton)).toContainText("без содержимого");
  let release; server.stageHold = new Promise(resolve => { release = resolve; });
  try {
    await activate(page, copyButton); await expect.poll(() => server.stagePosts.length).toBe(1);
    await assertNoCandidate(page, selected); expect(server.target.posts).toEqual([]);
    const durable = await nativeAdminCopyRecords(page); expect(durable.actions).toHaveLength(1); expect((await plans(page))[0].version).toBe(8);
    expect(await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalSource.photoCopyPending, selected.targetLayoutId)).toBe(durable.actions[0].intent.action.operationId);
  } finally { server.stageHold = null; release(); }
  await expect.poll(() => server.target.posts.length).toBe(1); await confirmed(page, server); await assertCopied(page, server, selected);
  if (entityType === "item") {
    const first = structuredClone(server.target.posts[0]), before = structuredClone(server.target.payload);
    const next = await openPicker(page, server, "item"); await activate(page, copyButton);
    await expect.poll(() => server.target.posts.length).toBe(2); await confirmed(page, server);
    expect([...server.errors, ...server.target.errors]).toEqual([]); expect(server.stagePosts).toHaveLength(4);
    const second = server.target.posts[1]; expect(second.operationId).not.toBe(first.operationId);
    expect(second.body.photoCopy.entityId).not.toBe(first.body.photoCopy.entityId); expect(second.body.payload).toEqual(before);
    const records = await nativeAdminCopyRecords(page); expect(records.actions).toHaveLength(2); expect(records.claims).toHaveLength(4);
    const currentMap = await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalSource.photoOwnerMap.owners, next.targetLayoutId);
    for (const old of next.targetBefore.layout.adminCausalSource.photoOwnerMap.owners) expect(currentMap.find(row => row.serverId === old.serverId)).toEqual(old);
    expect(currentMap).toHaveLength(next.targetBefore.layout.adminCausalSource.photoOwnerMap.owners.length + 1);
    expect(server.source.payload).toEqual(server.source.initialPayload); expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  }
});

test("lost save ACK reconciles the original copy after cold reload with the copy gate OFF", async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context), selected = await openPicker(page, server, "item");
  server.lostSaveAck = true; server.hideSaveAfterCommit = true; await activate(page, copyButton);
  await expect.poll(() => server.saveHidden).toBe(true); const before = await nativeAdminCopyRecords(page), beforePlans = await plans(page);
  await assertNoCandidate(page, selected); server.lostSaveAck = false; server.saveHidden = false; server.copyOff = true;
  await page.reload(); await openCopyUiTemplate(page, server.target.binding); await confirmed(page, server);
  const after = await assertCopied(page, server, selected); expect(after.records.actions).toEqual(before.actions); expect(after.saved).toEqual(beforePlans);
  expect(after.records.claims).toEqual(before.claims);
});

test("lost derived-stage ACK cold recovery reads that exact stage and never creates a second copy", async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context, { sharedTarget: false }), selected = await openPicker(page, server, "container");
  server.lostStageAck = true; server.hideStageAfterCommit = true; await activate(page, copyButton);
  await expect.poll(() => server.stageHidden).toBe(true); const before = await nativeAdminCopyRecords(page), beforePlans = await plans(page);
  await assertNoCandidate(page, selected); expect(server.target.posts).toEqual([]);
  server.lostStageAck = false; server.stageHidden = false;
  await page.reload(); await openCopyUiTemplate(page, server.target.binding); await expect.poll(() => server.target.posts.length).toBe(1); await confirmed(page, server);
  const after = await assertCopied(page, server, selected); expect(after.records.actions).toEqual(before.actions); expect(after.saved).toEqual(beforePlans);
  expect(server.stagePosts.filter(row => row.manifest.operationId === before.actions[0].intent.stages[0].operationId)).toHaveLength(1);
});

test("native copy IDB quota retains the open selection and retries identical action IDs without an optimistic owner", async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context), selected = await openPicker(page, server, "item");
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add; window.__copyRejectAdds = true; window.__copyAddAttempts = [];
    IDBObjectStore.prototype.add = function(value, ...args) {
      if (this.transaction.db.name === "bike-packing-admin-template-photo-copy-actions-v1" && this.name === "actions") {
        window.__copyAddAttempts.push({ intentJson: value.intentJson, intentHash: value.intentHash });
        if (window.__copyRejectAdds) { this.transaction.abort(); throw new DOMException("Copy record quota", "QuotaExceededError"); }
      } return add.call(this, value, ...args);
    };
  });
  await activate(page, copyButton); await expect.poll(() => page.evaluate(() => window.__copyAddAttempts.length)).toBe(1);
  await expect(page.locator("#containerPickerDialog")).toBeVisible(); await expect(page.locator(selected.dialog)).toBeVisible(); await expect(page.locator(copyButton)).toBeEnabled();
  await assertNoCandidate(page, selected); expect(await nativeAdminCopyRecords(page)).toEqual({ actions: [], claims: [] }); expect(await plans(page)).toEqual([]);
  expect(server.stagePosts).toEqual([]); expect(server.target.posts).toEqual([]);
  const original = await page.evaluate(() => window.__copyAddAttempts[0]); await page.evaluate(() => { window.__copyRejectAdds = false; });
  await activate(page, copyButton); await expect.poll(() => server.target.posts.length).toBe(1); await confirmed(page, server); const after = await assertCopied(page, server, selected);
  expect(await page.evaluate(() => window.__copyAddAttempts)).toEqual([original, original]); expect(after.input.operationId).toBe(JSON.parse(original.intentJson).action.operationId);
});

test("target mirror quota retains V8 and its original JSON record for cold recovery without adding an owner", async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context, { sharedTarget: false }), selected = await openPicker(page, server, "container");
  await page.evaluate(() => {
    const set = Storage.prototype.setItem; window.__copyMirrorQuota = 0;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-prototype-state-v1") && String(value).includes('"photoCopyPending"')) {
        window.__copyMirrorQuota++; throw new DOMException("Copy mirror quota", "QuotaExceededError");
      } return set.call(this, key, value);
    };
  });
  await activate(page, copyButton); await expect.poll(() => page.evaluate(() => window.__copyMirrorQuota)).toBeGreaterThan(0);
  const before = await nativeAdminCopyRecords(page), beforePlans = await plans(page);
  expect(before.actions).toHaveLength(1); expect(before.claims).toEqual([]); expect(beforePlans[0].version).toBe(8);
  await assertNoCandidate(page, selected); expect(server.stagePosts).toEqual([]); expect(server.target.posts).toEqual([]);
  await page.reload(); await openCopyUiTemplate(page, server.target.binding); await expect.poll(() => server.target.posts.length).toBe(1); await confirmed(page, server);
  const after = await assertCopied(page, server, selected); expect(after.records.actions).toEqual(before.actions); expect(after.saved).toEqual(beforePlans);
});

test("unsaved source fields and a bag opened with contents never expose the catalog-shell command", async ({ page, context }) => {
  const server = await adminPhotoCopyUiFixture(page, context);
  await openPicker(page, server, "item", { unsaved: true }); await expect(page.locator(copyButton)).toHaveCount(0);
  expect(server.stagePosts).toEqual([]); expect(server.target.posts).toEqual([]); expect(await nativeAdminCopyRecords(page)).toEqual({ actions: [], claims: [] });
  await page.reload(); await openCopyUiTemplate(page, server.source.binding);
  await openPicker(page, server, "container", { includeContents: true }); await expect(page.locator(copyButton)).toHaveCount(0);
  expect(server.stagePosts).toEqual([]); expect(server.target.posts).toEqual([]); expect(await plans(page)).toEqual([]);
});
