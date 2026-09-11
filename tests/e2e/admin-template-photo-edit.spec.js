import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { trackBrowserLifecycle } from "../fixtures/browser-lifecycle.js";
import { adminPhotoBrowserFixture, adminPhotoOrigin, openAdminPhotoEditor, nativeAdminPhotoRecords, photoReferences } from "../fixtures/admin-template-photo-browser-fixture.js";

// Only this isolated bundle enables fileless administrative photo edits.
// The production gate and new-file append remain OFF.
test.beforeAll(() => {
  const build = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
    "build", "--config", "tests/e2e/admin-template-ui.vite.config.js", "--mode", "admin-photo-edit"],
    { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(build.status, build.stderr).toBe(0);
});
test.beforeEach(async ({ page }) => { page.adminPhotoLifecycle = trackBrowserLifecycle(page); });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const server = page.adminPhotoServer;
  await info.attach("admin-photo-edit-server", { body: JSON.stringify(server ? { errors: server.errors, posts: server.posts,
    revision: server.revision, operationGets: server.operationGets } : {}), contentType: "application/json" });
  await info.attach("admin-photo-edit-page", { body: JSON.stringify(await page.evaluate(() => ({
    state: window.__adminUiTest?.state(), checks: window.__adminPhotoCandidateChecks, error: window.__adminUiLastError,
    journals: Object.entries(localStorage).filter(([key]) => /bike-packing-admin-(save-plans|template)-v1:/.test(key))
  })).catch(error => ({ unavailable: error.message }))), contentType: "application/json" });
  await info.attach("admin-photo-edit-lifecycle", { body: JSON.stringify(page.adminPhotoLifecycle), contentType: "application/json" });
});

const selectors = type => {
  const prefix = type === "item" ? "item" : "rootContainer";
  return { dialog: type === "item" ? "#itemDialog" : "#rootContainerDialog", name: `#${prefix}Name`,
    save: type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", remove: `#${prefix}PhotoRemoveBtn`,
    primary: `#${prefix}PhotoPrimaryBtn`, order: `#${prefix}PhotoOrderBtn`, preview: `#${prefix}PhotoPreview` };
};
async function fixture(page, context, options = {}) {
  return adminPhotoBrowserFixture(page, context, { ...options, photoEdit: true });
}
async function openForm(page, server, type, name = type === "item" ? "Насос шаблона" : "Сумка шаблона") {
  const selected = await page.evaluate(({ listId, type, name }) => {
    const state = __adminUiTest.state(), layout = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === listId);
    const owner = Object.values(state[type === "item" ? "items" : "containers"]).find(row => row.publicCatalogLayoutId === layout.id && row.name === name);
    return { entityId: owner.id, layoutId: layout.id, source: structuredClone(layout.adminCausalSource),
      photos: structuredClone(owner.photos), privatePayload: __adminUiTest.privatePayload() };
  }, { listId: server.binding.listId, type, name });
  await page.evaluate(({ type, id }) => type === "item" ? __adminUiTest.openItem(id) : __adminUiTest.openContainer(id), { type, id: selected.entityId });
  const ui = selectors(type); await expect(page.locator(ui.dialog)).toBeVisible();
  await expect(page.locator(ui.remove)).toBeVisible();
  return { ...selected, type, ui, rawId: type === "item" ? "pump" : "bag" };
}
async function activate(page, selector) {
  if (test.info().project.name === "mobile-webkit") await page.locator(selector).tap();
  else await page.locator(selector).click();
}
async function removeActive(page, selected) {
  await activate(page, selected.ui.remove);
  await expect(page.locator("#confirmDialog")).toBeVisible(); await activate(page, "#confirmOkBtn");
  await expect(page.locator("#confirmDialog")).not.toBeVisible();
}
async function save(page, selected) { await page.locator(selected.ui.name).blur(); await activate(page, selected.ui.save); }
async function confirmed(page, server, revision = 8) {
  await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts).some(row =>
    row.adminCausalSource?.binding.listId === listId && row.adminCausalSource.base?.stateRevision === revision
    && !row.adminCausalSource.photoEditPending && !row.adminCausalSource.planId), { listId: server.binding.listId, revision });
}
async function plans(page) {
  return page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(row => row.plan?.version === 6));
}
async function assertSaved(page, server, selected, photoIds) {
  expect(server.errors).toEqual([]); expect(server.posts).toHaveLength(1); expect(server.stagePosts).toEqual([]);
  expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] });
  const action = server.posts[0], type = selected.type === "item" ? "items" : "containers";
  expect(action.body.base).toEqual({ stateRevision: 7 });
  expect(action.body.photoEdit).toEqual({ version: 1, entityType: selected.type, entityId: selected.rawId, photoIds });
  expect(photoReferences(action.body.payload)).toEqual(photoReferences(server.initialPayload));
  const originals = server.initialPayload[type][selected.rawId].photos;
  expect(server.payload[type][selected.rawId].photos).toEqual(photoIds.map(id => originals.find(photo => photo.id === id)));
  const stored = await plans(page); expect(stored).toHaveLength(1); expect(stored[0].plan.id).toBe(action.operationId);
  expect(stored[0].plan.operations[0].body).toEqual(action.body);
  expect(stored[0].plan.photoSnapshot.beforeState[type][selected.entityId].photos).toEqual(selected.photos);
  expect(stored[0].plan.photoSnapshot.state[type][selected.entityId].photos.map(photo => photo.id)).toEqual(photoIds);
  expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  return action;
}

for (const shared of [false, true]) for (const type of ["item", "container"]) {
  test(`admin photo edit ${shared ? "shared" : "demo"} ${type} delete preserves raw references and next ordinary save`, async ({ page, context }) => {
    const server = await fixture(page, context, { shared }), selected = await openForm(page, server, type);
    await page.locator(selected.ui.name).fill("Изменено вместе с удалением");
    await removeActive(page, selected); expect(server.posts).toEqual([]);
    await expect(page.locator(`${selected.ui.preview} [data-photo-index]`)).toHaveCount(2);
    await save(page, selected); await confirmed(page, server);
    const ids = selected.photos.slice(1).map(photo => photo.id), action = await assertSaved(page, server, selected, ids);
    const form = await openForm(page, server, type, "Изменено вместе с удалением");
    await page.locator(form.ui.name).fill("Следующее обычное сохранение"); await save(page, form); await confirmed(page, server, 9);
    expect(server.posts).toHaveLength(2); expect(server.posts[1].body.photoEdit).toBeUndefined();
    expect(server.posts[1].body.base).toEqual({ stateRevision: 8 });
    expect(photoReferences(server.posts[1].body.payload)).toEqual(photoReferences(server.receipts.get(action.operationId).result.payload.photoEdit.confirmedPayload));
    expect(server.stagePosts).toEqual([]); expect(server.errors).toEqual([]);
  });
}
for (const type of ["item", "container"]) {
  test(`admin photo edit ${type} order and primary are explicit ordered original IDs`, async ({ page, context }) => {
    const server = await fixture(page, context), selected = await openForm(page, server, type);
    await activate(page, selected.ui.order); await expect(page.locator("#photoOrderDialog")).toBeVisible();
    await activate(page, '[data-photo-order-down="1"]'); await activate(page, "#photoOrderApplyBtn");
    await expect(page.locator("#photoOrderDialog")).not.toBeVisible();
    await activate(page, `${selected.ui.preview} [data-photo-index="1"]`);
    await expect(page.locator(selected.ui.primary)).toBeEnabled(); await activate(page, selected.ui.primary);
    await save(page, selected); await confirmed(page, server);
    await assertSaved(page, server, selected, [selected.photos[2].id, selected.photos[0].id, selected.photos[1].id]);
  });
  test(`admin photo edit ${type} removes every photo without uploading any file`, async ({ page, context }) => {
    const server = await fixture(page, context, { shared: true }), selected = await openForm(page, server, type);
    for (let index = 0; index < 3; index++) await removeActive(page, selected);
    await expect(page.locator(selected.ui.preview)).toHaveClass(/empty/);
    await save(page, selected); await confirmed(page, server); await assertSaved(page, server, selected, []);
  });
}
test("admin photo edit lost acknowledgement resumes the original UUID after cold reload", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await openForm(page, server, "item");
  await removeActive(page, selected); server.lostSaveAck = true; server.hideSaveAfterCommit = true;
  await save(page, selected); await expect.poll(() => server.saveHidden).toBe(true);
  const original = structuredClone(server.posts[0]), stored = await plans(page);
  server.lostSaveAck = false; server.hideSaveAfterCommit = false; server.saveHidden = false;
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  expect(server.posts).toEqual([original]); expect(await plans(page)).toEqual(stored);
  expect(server.operationGets.filter(id => id === original.operationId).length).toBeGreaterThanOrEqual(2);
  await assertSaved(page, server, selected, selected.photos.slice(1).map(photo => photo.id));
});
test("admin photo edit pre-capture quota leaves the form and retries the same frozen plan", async ({ page, context }) => {
  const server = await fixture(page, context), selected = await openForm(page, server, "item"); await removeActive(page, selected);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem; window.__editReject = true; window.__editAttempts = [];
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-admin-save-plans-v1:") && String(value).includes('"version":6')) {
        window.__editAttempts.push(JSON.parse(value));
        if (window.__editReject) throw new DOMException("Photo edit plan quota", "QuotaExceededError");
      }
      return set.call(this, key, value);
    };
  });
  await save(page, selected); await expect.poll(() => page.evaluate(() => window.__editAttempts.length)).toBeGreaterThan(0);
  await expect(page.locator(selected.ui.dialog)).toBeVisible(); await expect(page.locator(selected.ui.save)).toBeEnabled();
  expect(server.posts).toEqual([]); expect(await plans(page)).toEqual([]);
  const first = await page.evaluate(() => window.__editAttempts[0]); await page.evaluate(() => { window.__editReject = false; });
  await save(page, selected); await confirmed(page, server);
  const attempts = await page.evaluate(() => window.__editAttempts); expect(attempts.every(row => JSON.stringify(row) === JSON.stringify(first))).toBe(true);
  expect(server.posts[0].operationId).toBe(first.plan.id);
  await assertSaved(page, server, selected, selected.photos.slice(1).map(photo => photo.id));
});
test("admin photo edit mirror quota recovers the full candidate including original arrangement", async ({ page, context }) => {
  const server = await fixture(page, context, { exactSourceArrangement: true }), selected = await openForm(page, server, "container");
  await page.locator(selected.ui.name).fill("Сумка восстановлена из плана"); await removeActive(page, selected);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem; window.__editMirrorRejects = 0;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-prototype-state-v1") && String(value).includes('"photoEditPending"')) {
        window.__editMirrorRejects++; throw new DOMException("Photo edit mirror quota", "QuotaExceededError");
      }
      return set.call(this, key, value);
    };
  });
  await save(page, selected); await expect.poll(() => page.evaluate(() => window.__editMirrorRejects)).toBeGreaterThan(0);
  const stored = await plans(page); expect(stored).toHaveLength(1); expect(server.posts).toEqual([]);
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  expect(server.posts[0].operationId).toBe(stored[0].plan.id); expect(server.payload.containers.bag.name).toBe("Сумка восстановлена из плана");
  expect(server.payload.layouts).toEqual(server.initialPayload.layouts);
  await assertSaved(page, server, selected, selected.photos.slice(1).map(photo => photo.id));
});

test("a second tab retains its ordinary field action while the photo receipt is waiting", async ({ page, context }) => {
  const server = await fixture(page, context), selected = await openForm(page, server, "item");
  const other = await context.newPage(); other.on("pageerror", error => server.errors.push(error.message));
  await other.goto(adminPhotoOrigin); await openAdminPhotoEditor(other, server);
  const second = await openForm(other, server, "container");
  await page.locator(selected.ui.name).fill("Фото первой вкладки"); await removeActive(page, selected);
  let release; server.editAckHold = new Promise(resolve => { release = resolve; });
  try {
    await save(page, selected); await expect.poll(() => server.revision).toBe(8);
    await other.locator(second.ui.name).fill("Поле второй вкладки должно сохраниться"); await save(other, second);
    const ordinaryPlans = () => other.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(row => row.plan?.version === 1));
    await expect.poll(async () => (await ordinaryPlans()).length).toBe(1);
    const retained = (await ordinaryPlans())[0];
    expect(Object.values(retained.plan.operations[0].body.payload.containers).some(row => row.name === "Поле второй вкладки должно сохраниться")).toBe(true);
    release();
    await expect(page.locator("body")).toContainText("В другой вкладке изменён этот шаблон");
    await other.reload(); await openAdminPhotoEditor(other, server);
    const recovered = await other.evaluate(({ id, entityId }) => ({ source: __adminUiTest.state().layouts[id]?.adminCausalSource,
      owner: __adminUiTest.state().containers[entityId] }), { id: second.layoutId, entityId: second.entityId });
    expect(recovered.source.planId).toBe(retained.plan.id);
    expect(recovered.owner.name).toBe("Поле второй вкладки должно сохраниться");
    expect(await ordinaryPlans()).toEqual([retained]); expect(await plans(other)).toHaveLength(1);
    expect(server.posts.filter(row => row.body.photoEdit)).toHaveLength(1); expect(server.stagePosts).toEqual([]);
    expect(server.errors).toEqual([]);
  } finally { release(); await other.close(); }
});
