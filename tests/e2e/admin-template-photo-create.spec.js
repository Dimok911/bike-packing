import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { adminPhotoBrowserFixture, openAdminPhotoEditor, nativeAdminPhotoRecords, selectedGif, photoReferences } from "../fixtures/admin-template-photo-browser-fixture.js";

test.beforeAll(() => {
  if (process.env.BIKE_CREATE_UI_REUSE === "1") return;
  const vite = fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")));
  for (const mode of ["admin-photo-create", "admin-photo-create-off"]) {
    const build = spawnSync(process.execPath, [vite, "build", "--config", "tests/e2e/admin-template-ui.vite.config.js", "--mode", mode],
      { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
    expect(build.status, build.stderr || build.stdout).toBe(0);
  }
});
test.afterEach(async ({ page }, info) => {
  const server = page.adminPhotoServer;
  await info.attach("create-byte-evidence", { body: JSON.stringify(server?.stagePosts.map(row => ({ manifest: row.manifest,
    hash: createHash("sha256").update(row.bytes).digest("hex"), size: row.bytes.length, byteEvidence: row.byteEvidence }))), contentType: "application/json" });
  if (info.status === info.expectedStatus) return;
  await info.attach("create-server", { body: JSON.stringify(server && { errors: server.errors, posts: server.posts,
    stages: server.stagePosts.map(({ bytes, thumbBytes, ...row }) => row), stageGets: server.stageGets, operationGets: server.operationGets, payload: server.payload }), contentType: "application/json" });
  await info.attach("create-page", { body: JSON.stringify(await page.evaluate(() => ({ state: __adminUiTest?.state(),
    journals: Object.entries(localStorage), error: window.__adminUiLastError })).catch(error => ({ error: error.message }))), contentType: "application/json" });
  await info.attach("create-idb", { body: JSON.stringify(await nativeAdminPhotoRecords(page).catch(error => ({ error: error.message }))), contentType: "application/json" });
});

const activate = async (page, selector) => test.info().project.name === "mobile-webkit" ? page.locator(selector).tap() : page.locator(selector).click();
const fixture = (page, context, options = {}) => adminPhotoBrowserFixture(page, context, { photoCreate: true, exactSourceArrangement: true, ...options });
const uiFor = type => { const prefix = type === "item" ? "item" : "rootContainer"; return { dialog: `#${prefix}Dialog`, name: `#${prefix}Name`,
  note: `#${prefix}Note`, input: `#${prefix}PhotoInput`, preview: `#${prefix}PhotoPreview`, status: `#${prefix}PhotoStatus`,
  save: type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn" }; };
const plans = page => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:")).map(([, value]) => JSON.parse(value).plan));
async function openNew(page, server, type, placed = false) {
  await activate(page, `.tab[data-view="${type === "item" ? "items" : "bags"}"]`);
  if (type === "container" && placed) {
    await activate(page, "#addLayoutRootBtn"); await expect(page.locator("#layoutRootDialog")).toBeVisible(); await activate(page, "#createRootForLayoutBtn");
  } else await activate(page, type === "item" ? "#addItemBtn" : "#addRootContainerBtn");
  const ui = uiFor(type); await expect(page.locator(ui.dialog)).toBeVisible();
  const selected = await page.evaluate(({ listId }) => {
    const state = __adminUiTest.state(), layout = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === listId);
    return { layoutId: layout.id, bagId: Object.values(state.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === "Сумка шаблона")?.id,
      privatePayload: __adminUiTest.privatePayload() };
  }, { listId: server.binding.listId });
  if (type === "item" && placed) {
    await activate(page, "#itemContainerPickerBtn"); await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await activate(page, `[data-pick-container="${selected.bagId}"]`); await page.locator("#itemQuantity").fill("3");
  }
  const name = `Новая ${type === "item" ? "вещь" : "сумка"} с фото`, note = "Исходные выбранные файлы и поля";
  await page.locator(ui.name).fill(name); await page.locator(ui.note).fill(note);
  return { ...selected, type, placed, name, note, ui, files: [{ name: `Оригинал ${type}.gif`, mimeType: "image/gif", buffer: selectedGif }] };
}
async function selectFiles(page, selected) {
  await page.locator(selected.ui.input).setInputFiles(selected.files);
  await expect(page.locator(selected.ui.status)).toContainText("Фото подготовлены: 1");
}
async function save(page, selected) { await page.locator(selected.ui.note).blur(); await activate(page, selected.ui.save); }
async function confirmed(page, server, revision = 8) {
  await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts).some(row => row.adminCausalSource?.binding.listId === listId
    && row.adminCausalSource.base?.stateRevision === revision && !row.adminCausalSource.planId && !row.adminCausalSource.photoCreatePending), { listId: server.binding.listId, revision });
}
async function assertCreate(page, server, selected) {
  expect(server.errors).toEqual([]); expect(server.posts).toHaveLength(1); expect(server.stagePosts).toHaveLength(1);
  const action = server.posts[0], create = action.body.photoCreate, type = selected.type === "item" ? "items" : "containers";
  expect(action.body.payload).toEqual(server.initialPayload); expect(create.entityType).toBe(selected.type);
  expect(create.fields.name).toBe(selected.name); expect(create.fields.note).toBe(selected.note);
  expect(create.formContext.placement === null).toBe(!selected.placed);
  if (selected.type === "item" && selected.placed) expect(create.formContext.placement.quantity).toBe(3);
  const raw = server.payload[type][create.entityId]; expect(raw.name).toBe(selected.name); expect(raw.photos).toHaveLength(1);
  expect(raw.photos[0].id).toBe(create.assets[0].photoId); expect(raw.photos[0].fileName).toBe(selected.files[0].name);
  expect(photoReferences(action.body.payload)).toEqual(photoReferences(server.initialPayload));
  for (const kind of ["items", "containers"]) for (const [id, row] of Object.entries(server.initialPayload[kind])) {
    const expected = structuredClone(row);
    if (kind === "containers" && create.entityType === "item" && create.formContext.placement?.containerId === id) {
      expected.itemIds.push(create.entityId); expected.order.push({ type: "item", id: create.entityId });
    }
    expect(server.payload[kind][id]).toEqual(expected);
  }
  const stored = await nativeAdminPhotoRecords(page); expect(stored.actions).toHaveLength(1); expect(stored.claims).toHaveLength(1);
  const record = stored.actions[0], stage = server.stagePosts[0]; expect(record.intentHash).toBe(record.checkedIntentHash);
  expect(record.intent.action).toMatchObject({ operationId: action.operationId, body: action.body });
  expect(record.intent.snapshot.createdOwner.serverId).toBe(create.entityId);
  expect(record.intent.snapshot.state[type][record.intent.snapshot.createdOwner.localId].photos[0].id).toBe(create.assets[0].photoId);
  expect(stage.manifest).toMatchObject({ version: 2, templateOperationId: action.operationId, entityId: create.entityId, photoId: create.assets[0].photoId });
  expect(stage.bytes.equals(selectedGif)).toBe(true); expect(record.files[0].hash).toBe(createHash("sha256").update(selectedGif).digest("hex"));
  const saved = await plans(page); expect(saved).toHaveLength(1); expect(saved[0].version).toBe(7); expect(saved[0].recordIntentHash).toBe(record.intentHash);
  expect(server.receipts.get(action.operationId).result.payload.photoCreate.confirmedPayload).toEqual(server.payload);
  expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  return { action, stored, saved };
}

for (const scenario of [
  { type: "item", shared: true, placed: false, empty: false }, { type: "container", shared: false, placed: false, empty: false },
  { type: "item", shared: false, placed: true, empty: false }, { type: "container", shared: true, placed: true, empty: false },
  { type: "item", shared: true, placed: false, empty: true }, { type: "container", shared: false, placed: true, empty: true }
]) test(`actual new ${scenario.type} ${scenario.placed ? "placed" : "catalog"} ${scenario.empty ? "first empty" : scenario.shared ? "shared" : "demo"}`, async ({ page, context }) => {
  const server = await fixture(page, context, scenario);
  if (scenario.type === "item" && scenario.shared && !scenario.empty) await page.evaluate(() => {
    const state = __adminUiTest.state(); state.layouts.foreignAdmin = { id: "foreignAdmin", adminSharedSourceId: "other", name: "Другой административный черновик",
      rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} },
      adminCausalSource: { version: 1, exists: true, visibility: "private", binding: { actorId: "admin-a", environment: "bike-packing-experiment",
        listId: "public-shared-layout-other", itemKey: "shared-layout:other" }, base: { stateRevision: 4 }, planId: null } };
    state.items.foreignDraft = { id: "foreignDraft", publicCatalogLayoutId: "foreignAdmin", name: "Неизменённая чужая форма", opaque: { order: [4, 2] } };
    const key = Object.keys(localStorage).find(key => key.startsWith("bike-packing-prototype-state-v1") && key.includes("admin-a"));
    localStorage.setItem(key, JSON.stringify(state)); localStorage.setItem("create-test-personal-form-sentinel", "retained");
    window.__createForeignBefore = { layout: structuredClone(state.layouts.foreignAdmin), item: structuredClone(state.items.foreignDraft) };
  });
  const selected = await openNew(page, server, scenario.type, scenario.placed); await selectFiles(page, selected); await save(page, selected);
  await confirmed(page, server); await assertCreate(page, server, selected);
  if (scenario.type === "item" && scenario.shared && !scenario.empty) expect(await page.evaluate(() => ({
    layout: __adminUiTest.state().layouts.foreignAdmin, item: __adminUiTest.state().items.foreignDraft,
    expected: window.__createForeignBefore, sentinel: localStorage.getItem("create-test-personal-form-sentinel")
  }))).toEqual(await page.evaluate(() => ({ ...window.__createForeignBefore, expected: window.__createForeignBefore, sentinel: "retained" })));
  if (scenario.type === "item" && scenario.shared && !scenario.empty) {
    // Ordinary placement after create must still update the explicit tree even
    // though canonical snapshotting no longer rebuilds it from display links.
    const beforeMove = structuredClone(server.payload);
    const owner = await page.evaluate(name => Object.values(__adminUiTest.state().items).find(row => row.name === name), selected.name);
    await page.locator("#itemsView article").filter({ hasText: selected.name }).first().click();
    await expect(page.locator(selected.ui.dialog)).toBeVisible();
    const bag = await page.evaluate(() => Object.values(__adminUiTest.state().containers).find(row => row.name === "Сумка шаблона").id);
    await activate(page, "#itemContainerPickerBtn"); await activate(page, `[data-pick-container="${bag}"]`);
    await page.locator("#itemQuantity").fill("4"); await page.locator("#itemQuantity").blur(); await save(page, selected); await confirmed(page, server, 9);
    expect(server.posts).toHaveLength(2); expect(server.posts[1].body.photoCreate).toBeUndefined();
    const id = server.posts[0].body.photoCreate.entityId, layout = Object.values(server.payload.layouts)[0];
    expect(layout.arrangement.items[id]).toBe("bag"); expect(layout.arrangement.itemQuantities[id]).toBe(4);
    expect(server.payload.items[id].photos[0].id).toBe(server.posts[0].body.photoCreate.assets[0].photoId);
    expect(server.payload.locations).toEqual(beforeMove.locations); expect(server.payload.categories).toEqual(beforeMove.categories);
    expect(server.payload.packedItems).toEqual(beforeMove.packedItems);
    expect(layout.arrangement.photoRecoveryMarker).toEqual(Object.values(beforeMove.layouts)[0].arrangement.photoRecoveryMarker);
    for (const [key, row] of Object.entries(beforeMove.items)) if (key !== id) expect(server.payload.items[key]).toEqual(row);
    expect(photoReferences(server.payload)).toEqual(photoReferences(beforeMove));
    const expectedBag = structuredClone(beforeMove.containers.bag);
    expectedBag.itemIds.push(id); expectedBag.order.push({ type: "item", id }); expect(server.payload.containers.bag).toEqual(expectedBag);
    expect(server.payload.containers.spareBag).toEqual(beforeMove.containers.spareBag);
    await activate(page, '.tab[data-view="packing"]'); await activate(page, '#menuBtn'); await activate(page, '#collectionMenuBtn');
    // This UI preference also schedules its existing ordinary save. Finish it
    // before testing the next distinct packed intent against a numeric base.
    await confirmed(page, server, 10);
    await activate(page, `[data-toggle-packed="${owner.id}"]`);
    await confirmed(page, server, 11);
    expect(Object.values(server.payload.layouts)[0].arrangement.packedItems[id]).toBe(true);
    expect(Object.values(server.payload.layouts)[0].arrangement.photoRecoveryMarker).toEqual(layout.arrangement.photoRecoveryMarker);
    await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server, 11);
    expect(await page.evaluate(id => { const state = __adminUiTest.state(); return state.layouts[state.activeLayoutId].arrangement.packedItems[id]; }, owner.id)).toBe(true);
    const beforeSecond = structuredClone(server.payload), second = await openNew(page, server, "container");
    await selectFiles(page, second); await save(page, second); await confirmed(page, server, 12);
    expect(server.posts).toHaveLength(5); expect(server.stagePosts).toHaveLength(2);
    const next = server.posts[4]; expect(next.body.base.stateRevision).toBe(11); expect(next.body.payload).toEqual(beforeSecond);
    expect(next.body.photoCreate.entityType).toBe("container");
    expect(server.payload.items).toEqual(beforeSecond.items); expect(server.payload.layouts).toEqual(beforeSecond.layouts);
    expect(server.payload.locations).toEqual(beforeSecond.locations); expect(server.payload.categories).toEqual(beforeSecond.categories);
    const records = await nativeAdminPhotoRecords(page); expect(records.actions).toHaveLength(2);
    const captured = records.actions.find(row => row.intent.action.operationId === next.operationId);
    expect(captured.intent.snapshot.ownerMap.stateRevision).toBe(11);
    expect(captured.intent.snapshot.beforeState.layouts[selected.layoutId].adminCausalSource.photoOwnerMap.stateRevision).toBe(11);
    expect(captured.files[0].hash).toBe(createHash("sha256").update(selectedGif).digest("hex")); expect(server.errors).toEqual([]);
  }
});

test("lost new-owner stage acknowledgement uses GET and never uploads the selected bytes twice", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }); server.lostStageAck = true;
  const selected = await openNew(page, server, "item"); await selectFiles(page, selected); await save(page, selected);
  await confirmed(page, server); await assertCreate(page, server, selected); expect(server.stageGets).toContain(server.stagePosts[0].manifest.operationId);
});

test("cold reload resolves a committed create with unreachable save receipt using exact original IDs", async ({ page, context }) => {
  const server = await fixture(page, context); server.lostSaveAck = true; server.hideSaveAfterCommit = true;
  const selected = await openNew(page, server, "container"); await selectFiles(page, selected); await save(page, selected);
  await expect.poll(() => server.posts.length).toBe(1); const before = await nativeAdminPhotoRecords(page), beforePlans = await plans(page);
  server.saveHidden = false; server.lostSaveAck = false;
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  const after = await assertCreate(page, server, selected); expect(after.stored.actions).toEqual(before.actions); expect(after.saved).toEqual(beforePlans);
});

test("new-owner binary quota retains the real form and retries one action with the original bytes", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await openNew(page, server, "item"); await selectFiles(page, selected);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add; window.__createRejectAdds = true; window.__createAddAttempts = [];
    IDBObjectStore.prototype.add = function(value, ...args) {
      if (this.transaction.db.name === "bike-packing-admin-template-photo-actions-v1" && this.name === "actions") {
        window.__createAddAttempts.push({ intentJson: value.intentJson, intentHash: value.intentHash,
          files: value.files.map(part => ({ stageOperationId: part.stageOperationId, bytes: Array.from(new Uint8Array(part.file)) })) });
        if (window.__createRejectAdds) { this.transaction.abort(); throw new DOMException("New owner quota", "QuotaExceededError"); }
      }
      return add.call(this, value, ...args);
    };
  });
  await save(page, selected); await expect.poll(() => page.evaluate(() => window.__createAddAttempts.length)).toBe(1);
  await expect(page.locator(selected.ui.dialog)).toBeVisible(); await expect(page.locator(selected.ui.save)).toBeEnabled();
  await expect(page.locator(selected.ui.name)).toHaveValue(selected.name); expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] });
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  const first = await page.evaluate(() => window.__createAddAttempts[0]); await page.evaluate(() => { window.__createRejectAdds = false; });
  await save(page, selected); await confirmed(page, server); const after = await assertCreate(page, server, selected);
  expect(await page.evaluate(() => window.__createAddAttempts)).toEqual([first, first]); expect(after.action.operationId).toBe(JSON.parse(first.intentJson).action.operationId);
});

test("new-owner mirror quota preserves V7 and bytes for cold selected-namespace recovery", async ({ page, context }) => {
  const server = await fixture(page, context), selected = await openNew(page, server, "container", true); await selectFiles(page, selected);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem; window.__createMirrorQuota = 0;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-prototype-state-v1") && String(value).includes('"photoCreatePending"')) {
        window.__createMirrorQuota++; throw new DOMException("Create mirror quota", "QuotaExceededError");
      } return set.call(this, key, value);
    };
  });
  await save(page, selected); await expect.poll(() => page.evaluate(() => window.__createMirrorQuota)).toBeGreaterThan(0);
  const before = await nativeAdminPhotoRecords(page), beforePlans = await plans(page);
  expect(before.actions).toHaveLength(1); expect(before.claims).toEqual([]); expect(beforePlans[0].version).toBe(7);
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  const after = await assertCreate(page, server, selected); expect(after.stored.actions).toEqual(before.actions); expect(after.saved).toEqual(beforePlans);
});

test("create OFF leaves new chosen files unsent with no V7, stage or legacy write", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true, createOff: true }), selected = await openNew(page, server, "item");
  await page.locator(selected.ui.input).setInputFiles(selected.files);
  await expect(page.locator(selected.ui.status)).toContainText("уже сохранённой");
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]); expect(await plans(page)).toEqual([]);
  expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] }); await expect(page.locator(selected.ui.dialog)).toBeVisible();
});

for (const edit of [false, true]) test(`create ON preserves existing-owner ${edit ? "edit" : "append"}`, async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), ui = uiFor("item");
  const id = await page.evaluate(() => Object.values(__adminUiTest.state().items).find(row => row.name === "Насос шаблона").id);
  await page.evaluate(id => __adminUiTest.openItem(id), id); await expect(page.locator(ui.dialog)).toBeVisible();
  if (edit) { await activate(page, "#itemPhotoRemoveBtn"); await expect(page.locator("#confirmDialog")).toBeVisible(); await activate(page, "#confirmOkBtn"); }
  else { await page.locator(ui.input).setInputFiles({ name: "Existing owner.gif", mimeType: "image/gif", buffer: selectedGif }); await expect(page.locator(ui.status)).toContainText("Фото подготовлены: 1"); }
  await activate(page, ui.save); await confirmed(page, server);
  expect(server.errors).toEqual([]); expect(server.posts).toHaveLength(1); expect(server.posts[0].body.photoCreate).toBeUndefined();
  expect(server.posts[0].body[edit ? "photoEdit" : "photoAppend"]).toBeTruthy(); expect(server.stagePosts).toHaveLength(edit ? 0 : 1);
});
