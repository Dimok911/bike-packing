import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { adminPhotoBrowserFixture, openAdminPhotoEditor, nativeAdminPhotoRecords, selectedGif,
  photoReferences } from "../fixtures/admin-template-photo-browser-fixture.js";

test.beforeAll(() => {
  if (process.env.BIKE_REPLACE_UI_REUSE === "1") return;
  const vite = fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")));
  for (const mode of ["admin-photo-replace", "admin-photo-replace-off"]) {
    const build = spawnSync(process.execPath, [vite, "build", "--config", "tests/e2e/admin-template-ui.vite.config.js", "--mode", mode],
      { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
    expect(build.status, build.stderr || build.stdout).toBe(0);
  }
});

test.afterEach(async ({ page }, info) => {
  const server = page.adminPhotoServer;
  if (server) await info.attach("replacement-byte-evidence", { body: JSON.stringify({
    note: "Chromium inspects intercepted multipart. WebKit may require the existing independent outgoing FormData observer; physical Safari is separate acceptance.",
    stages: server.stagePosts.map(row => ({ id: row.manifest.operationId, fileName: row.fileName, byteEvidence: row.byteEvidence,
      size: row.bytes.length, hash: createHash("sha256").update(row.bytes).digest("hex") }))
  }), contentType: "application/json" });
  if (info.status === info.expectedStatus) return;
  await info.attach("replacement-server", { body: JSON.stringify(server && { errors: server.errors, posts: server.posts,
    stages: server.stagePosts.map(({ bytes, thumbBytes, ...row }) => row), stageGets: server.stageGets,
    operationGets: server.operationGets, revision: server.revision }), contentType: "application/json" });
  await info.attach("replacement-page", { body: JSON.stringify(await page.evaluate(() => ({ state: window.__adminUiTest?.state(),
    journals: Object.entries(localStorage).filter(([key]) => /bike-packing-admin-(save-plans|template)-v1:/.test(key))
  })).catch(error => ({ error: error.message }))), contentType: "application/json" });
  await info.attach("replacement-idb", { body: JSON.stringify(await nativeAdminPhotoRecords(page).catch(error => ({ error: error.message }))),
    contentType: "application/json" });
});

const uiFor = type => {
  const prefix = type === "item" ? "item" : "rootContainer";
  return { dialog: `#${prefix}Dialog`, name: `#${prefix}Name`, note: `#${prefix}Note`, input: `#${prefix}PhotoInput`,
    preview: `#${prefix}PhotoPreview`, remove: `#${prefix}PhotoRemoveBtn`, primary: `#${prefix}PhotoPrimaryBtn`,
    order: `#${prefix}PhotoOrderBtn`, status: `#${prefix}PhotoStatus`, save: type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn" };
};
const activate = async (page, selector) => test.info().project.name === "mobile-webkit"
  ? page.locator(selector).tap() : page.locator(selector).click();
const fixture = (page, context, options = {}) => adminPhotoBrowserFixture(page, context,
  { photoReplace: true, exactSourceArrangement: true, ...options });
async function openForm(page, server, type, name = type === "item" ? "Насос шаблона" : "Сумка шаблона") {
  const selected = await page.evaluate(({ listId, type, name }) => {
    const state = __adminUiTest.state(), layout = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === listId);
    const owner = Object.values(state[type === "item" ? "items" : "containers"]).find(row => row.publicCatalogLayoutId === layout.id && row.name === name);
    return { layoutId: layout.id, entityId: owner.id, oldPhotos: structuredClone(owner.photos),
      privatePayload: __adminUiTest.privatePayload() };
  }, { listId: server.binding.listId, type, name });
  await page.evaluate(({ type, id }) => type === "item" ? __adminUiTest.openItem(id) : __adminUiTest.openContainer(id), { type, id: selected.entityId });
  const ui = uiFor(type); await expect(page.locator(ui.dialog)).toBeVisible();
  return { ...selected, type, ui, rawId: type === "item" ? "pump" : "bag", baseRevision: server.revision };
}
async function removeFirst(page, selected) {
  await activate(page, `${selected.ui.preview} [data-photo-index="0"]`);
  await activate(page, selected.ui.remove); await expect(page.locator("#confirmDialog")).toBeVisible();
  await activate(page, "#confirmOkBtn"); await expect(page.locator("#confirmDialog")).not.toBeVisible();
}
async function addFiles(page, selected, count = 2) {
  selected.files = Array.from({ length: count }, (_, index) => ({ name: `Новый ${selected.type} ${index}.gif`, mimeType: "image/gif", buffer: selectedGif }));
  await page.locator(selected.ui.input).setInputFiles(selected.files);
  await expect(page.locator(selected.ui.status)).toContainText(`Фото подготовлены: ${count}`);
}
async function primary(page, selected, index) {
  await activate(page, `${selected.ui.preview} [data-photo-index="${index}"]`);
  await expect(page.locator(selected.ui.primary)).toBeEnabled(); await activate(page, selected.ui.primary);
}
async function order(page, selected, selectors) {
  await activate(page, selected.ui.order); await expect(page.locator("#photoOrderDialog")).toBeVisible();
  for (const selector of selectors) await activate(page, selector);
  await activate(page, "#photoOrderApplyBtn"); await expect(page.locator("#photoOrderDialog")).not.toBeVisible();
}
async function mixedForm(page, server, type) {
  const selected = await openForm(page, server, type); await removeFirst(page, selected); await addFiles(page, selected);
  await primary(page, selected, 3); await order(page, selected, ['[data-photo-order-down="1"]']);
  selected.expected = ["new:1", selected.oldPhotos[2].id, selected.oldPhotos[1].id, "new:0"];
  selected.changedName = type === "item" ? "Замена фото вещи" : "Замена фото сумки";
  selected.note = "Проверенная заметка вместе с фотографиями";
  await page.locator(selected.ui.name).fill(selected.changedName); await page.locator(selected.ui.note).fill(selected.note);
  return selected;
}
async function save(page, selected) { await page.locator(selected.ui.note).blur(); await activate(page, selected.ui.save); }
async function confirmed(page, server, revision = 8) {
  await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts).some(layout =>
    layout.adminCausalSource?.binding.listId === listId && layout.adminCausalSource.base?.stateRevision === revision
      && !layout.adminCausalSource.photoAppendPending && !layout.adminCausalSource.photoEditPending && !layout.adminCausalSource.planId),
  { listId: server.binding.listId, revision });
}
async function plans(page) {
  return page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
    .map(([, text]) => JSON.parse(text).plan));
}
function expectedIds(server, selected) {
  return selected.expected.map(id => id.startsWith("new:")
    ? server.stagePosts.find(row => row.fileName === selected.files[Number(id.slice(4))].name)?.manifest.photoId : id);
}
async function assertReplacement(page, server, selected) {
  expect(server.errors).toEqual([]); expect(server.posts).toHaveLength(1); expect(server.stagePosts).toHaveLength(selected.files.length);
  const action = server.posts[0], type = selected.type === "item" ? "items" : "containers", ids = expectedIds(server, selected);
  expect(ids.every(Boolean)).toBe(true); expect(action.body.photoAppend.version).toBe(2);
  expect(action.body.photoAppend.photoIds).toEqual(ids); expect(action.body.base).toEqual({ stateRevision: selected.baseRevision });
  expect(photoReferences(action.body.payload)).toEqual(photoReferences(server.initialPayload));
  expect(action.body.payload.layouts).toEqual(server.initialPayload.layouts);
  expect(action.body.payload.locations).toEqual(server.initialPayload.locations); expect(action.body.payload.categories).toEqual(server.initialPayload.categories);
  if (selected.changedName) expect(action.body.payload[type][selected.rawId].name).toBe(selected.changedName);
  if (selected.note) expect(action.body.payload[type][selected.rawId].note).toBe(selected.note);
  const raw = server.initialPayload[type][selected.rawId].photos, after = server.payload[type][selected.rawId].photos;
  expect(after.map(photo => photo.id)).toEqual(ids);
  for (const photo of raw.filter(photo => ids.includes(photo.id))) expect(after.find(row => row.id === photo.id)).toEqual(photo);
  const proof = server.receipts.get(action.operationId).result.payload.photoAppend;
  expect(proof.removedPhotoIds).toEqual(raw.filter(photo => !ids.includes(photo.id)).map(photo => photo.id));
  expect(proof.photoIds).toEqual(ids); expect(proof.confirmedPayload).toEqual(server.payload);
  for (const ownerType of ["items", "containers"]) for (const [id, owner] of Object.entries(server.initialPayload[ownerType])) {
    if (ownerType !== type || id !== selected.rawId) expect(server.payload[ownerType][id]).toEqual(owner);
  }
  const stored = await nativeAdminPhotoRecords(page); expect(stored.actions).toHaveLength(1); expect(stored.claims).toHaveLength(selected.files.length);
  const record = stored.actions[0]; expect(record.checkedIntentHash).toBe(record.intentHash);
  expect(record.intent.action.body).toEqual(action.body); expect(record.intent.action.operationId).toBe(action.operationId);
  expect(record.intent.snapshot.state[type][selected.entityId].photos.map(photo => photo.id)).toEqual(ids);
  expect(record.intent.snapshot.beforeState[type][selected.entityId].photos).toEqual(selected.oldPhotos);
  for (const stage of server.stagePosts) {
    expect(stage.bytes.equals(selectedGif)).toBe(true); expect(stage.manifest.templateOperationId).toBe(action.operationId);
    expect(selected.files.some(file => file.name === stage.fileName)).toBe(true);
    expect(record.files.find(file => file.stageOperationId === stage.manifest.operationId)?.hash)
      .toBe(createHash("sha256").update(selectedGif).digest("hex"));
    expect(stored.claims.find(claim => claim.stageOperationId === stage.manifest.operationId))
      .toMatchObject({ actionOperationId: action.operationId, intentHash: record.intentHash, assetDigest: stage.assetDigest });
  }
  const savedPlans = await plans(page); expect(savedPlans).toHaveLength(1); expect(savedPlans[0].version).toBe(5);
  expect(savedPlans[0].operations[0].body).toEqual(action.body);
  expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  return { action, stored, savedPlans };
}
async function discard(page, selected) {
  await activate(page, `${selected.ui.dialog} header button[value="cancel"]`);
  await expect(page.locator("#confirmDialog")).toBeVisible(); await activate(page, "#confirmCancelBtn");
  await expect(page.locator(selected.ui.dialog)).not.toBeVisible();
}

for (const type of ["item", "container"]) test(`replacement ${type} combines removal order new primary and metadata atomically`, async ({ page, context }) => {
  const server = await fixture(page, context, { shared: type === "container" }), selected = await mixedForm(page, server, type);
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  await save(page, selected); await confirmed(page, server); await assertReplacement(page, server, selected);
});

test("replacement new primary interleaves new files while preserving every old reference", async ({ page, context }) => {
  const server = await fixture(page, context), selected = await openForm(page, server, "item"); await addFiles(page, selected);
  await primary(page, selected, 3); await order(page, selected, ['[data-photo-order-up="4"]', '[data-photo-order-up="3"]']);
  selected.expected = ["new:0", selected.oldPhotos[0].id, "new:1", selected.oldPhotos[1].id, selected.oldPhotos[2].id];
  await save(page, selected); await confirmed(page, server); await assertReplacement(page, server, selected);
});

test("replacement lost stage acknowledgement reads each original stage without another upload", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await mixedForm(page, server, "container");
  server.lostStageAck = true; await save(page, selected); await confirmed(page, server);
  await assertReplacement(page, server, selected);
  for (const stage of server.stagePosts) expect(server.stageGets).toContain(stage.manifest.operationId);
  expect(new Set(server.stagePosts.map(row => row.manifest.operationId)).size).toBe(selected.files.length);
});

test("replacement lost save acknowledgement survives cold reload with exact action files and plan", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await mixedForm(page, server, "item");
  server.lostSaveAck = true; server.hideSaveAfterCommit = true; await save(page, selected);
  await expect.poll(() => server.saveHidden).toBe(true);
  const before = { action: structuredClone(server.posts[0]), records: await nativeAdminPhotoRecords(page), plans: await plans(page) };
  expect(await page.evaluate(id => Boolean(__adminUiTest.state().layouts[id].adminCausalSource.photoAppendPending), selected.layoutId)).toBe(true);
  server.lostSaveAck = false; server.hideSaveAfterCommit = false; server.saveHidden = false;
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  const after = await assertReplacement(page, server, selected);
  expect(after.action).toEqual(before.action); expect(after.stored).toEqual(before.records); expect(after.savedPlans).toEqual(before.plans);
  expect(server.operationGets).toContain(before.action.operationId);
});

test("replacement cancelled form leaves the original owner and creates no durable action", async ({ page, context }) => {
  const server = await fixture(page, context), selected = await mixedForm(page, server, "container");
  await discard(page, selected); expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] }); expect(await plans(page)).toEqual([]);
  const reopened = await openForm(page, server, "container"); expect(reopened.oldPhotos).toEqual(selected.oldPhotos);
  expect(server.payload).toEqual(server.initialPayload); expect(server.errors).toEqual([]);
});

test("replacement OFF blocks the mixed form while the established pure append remains available", async ({ page, context }) => {
  const server = await fixture(page, context, { replaceOff: true }), mixed = await mixedForm(page, server, "item");
  await save(page, mixed); await expect(page.locator(mixed.ui.status)).toContainText("Замена фотографий ещё не включена");
  await expect(page.locator(mixed.ui.dialog)).toBeVisible(); expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] });
  await discard(page, mixed); const selected = await openForm(page, server, "item"); await addFiles(page, selected, 1);
  await save(page, selected); await confirmed(page, server);
  expect(server.posts).toHaveLength(1); expect(server.stagePosts).toHaveLength(1);
  expect(server.posts[0].body.photoAppend.version).toBe(1); expect(server.posts[0].body.photoAppend.photoIds).toBeUndefined();
  expect(server.payload.items.pump.photos.slice(0, 3)).toEqual(server.initialPayload.items.pump.photos);
  expect(server.payload.items.pump.photos.at(-1).fileName).toBe(selected.files[0].name); expect(server.errors).toEqual([]);
});

test("replacement OFF preserves established fileless deletion and order without staging", async ({ page, context }) => {
  const server = await fixture(page, context, { replaceOff: true, shared: true }), selected = await openForm(page, server, "container");
  await removeFirst(page, selected); await primary(page, selected, 1); await save(page, selected); await confirmed(page, server);
  expect(server.posts).toHaveLength(1); expect(server.stagePosts).toEqual([]);
  expect(server.posts[0].body.photoEdit).toEqual({ version: 1, entityType: "container", entityId: "bag",
    photoIds: [selected.oldPhotos[2].id, selected.oldPhotos[1].id] });
  expect(server.posts[0].body.photoAppend).toBeUndefined(); expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] });
  expect(server.payload.containers.bag.photos).toEqual([server.initialPayload.containers.bag.photos[2], server.initialPayload.containers.bag.photos[1]]);
  expect((await plans(page))[0].version).toBe(6); expect(server.errors).toEqual([]);
});
