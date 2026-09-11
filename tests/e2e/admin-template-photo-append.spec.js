import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { trackBrowserLifecycle } from "../fixtures/browser-lifecycle.js";
import { adminPhotoBrowserFixture, adminPhotoOrigin, openAdminPhotoEditor, nativeAdminPhotoRecords, selectedGif, photoReferences } from "../fixtures/admin-template-photo-browser-fixture.js";

// The production gate stays OFF. Only this isolated bundle enables the first
// administrative append package; all actions below use real dialogs and IDB.
test.beforeAll(() => {
  const build = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
    "build", "--config", "tests/e2e/admin-template-ui.vite.config.js", "--mode", "admin-photo-append"],
    { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(build.status, build.stderr).toBe(0);
});
test.beforeEach(async ({ page }) => { page.adminPhotoLifecycle = trackBrowserLifecycle(page); });
test.afterEach(async ({ page }, info) => {
  const server = page.adminPhotoServer;
  if (server) await info.attach("admin-photo-byte-evidence", { body: JSON.stringify({
    note: "WebKit fallback proves original outgoing FormData bytes plus native IDB bytes; it does not prove bytes serialized on the wire. Chromium checks intercepted multipart bytes.",
    stages: server.stagePosts.map(row => ({ id: row.manifest.operationId, evidence: row.byteEvidence, hash: row.manifest.file.hash, size: row.bytes.length }))
  }), contentType: "application/json" });
  if (info.status === info.expectedStatus) return;
  await info.attach("admin-photo-server", { body: JSON.stringify(server ? { errors: server.errors, posts: server.posts,
    stagePosts: server.stagePosts.map(({ bytes, thumbBytes, ...row }) => ({ ...row, byteLength: bytes.length, thumbLength: thumbBytes?.length })),
    operationGets: server.operationGets, stageGets: server.stageGets } : { fixtureNotReady: true }), contentType: "application/json" });
  const state = await page.evaluate(() => ({ scope: window.__adminUiTest?.scope(), state: window.__adminUiTest?.state(),
    error: window.__adminUiLastError, quotaAttempts: window.__adminPhotoQuotaAttempts,
    candidateChecks: window.__adminPhotoCandidateChecks, candidateDiagnosticError: window.__adminPhotoCandidateDiagnosticError,
    journals: Object.entries(localStorage).filter(([key]) => /bike-packing-admin-(save-plans|template)-v1:/.test(key)) })).catch(error => ({ unavailable: error.message }));
  if (page.adminPhotoPreReloadChecks) state.preReloadCandidateChecks = page.adminPhotoPreReloadChecks;
  await info.attach("admin-photo-page", { body: JSON.stringify(state), contentType: "application/json" });
  await info.attach("admin-photo-native-idb", { body: JSON.stringify(await nativeAdminPhotoRecords(page).catch(error => ({ error: error.message }))), contentType: "application/json" });
  await info.attach("admin-photo-browser-lifecycle", { body: JSON.stringify(page.adminPhotoLifecycle), contentType: "application/json" });
});

async function fixture(page, context, options) {
  const server = await adminPhotoBrowserFixture(page, context, options); page.adminPhotoServer = server;
  return server;
}
const selectors = type => type === "item"
  ? { dialog: "#itemDialog", name: "#itemName", input: "#itemPhotoInput", camera: "#itemPhotoCameraInput", save: "#saveItemBtn", status: "#itemPhotoStatus" }
  : { dialog: "#rootContainerDialog", name: "#rootContainerName", input: "#rootContainerPhotoInput", camera: "#rootContainerPhotoCameraInput", save: "#saveRootContainerBtn", status: "#rootContainerPhotoStatus" };
async function editWithFiles(page, server, type, { count = 2, camera = false, emptyOwner = false, currentName = "" } = {}) {
  const previousPosts = server.posts.length, previousStages = server.stagePosts.length, baseRevision = server.revision;
  const value = await page.evaluate(({ listId, type, emptyOwner, currentName }) => {
    const state = __adminUiTest.state(), layout = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === listId);
    const expectedName = currentName || (type === "item" ? emptyOwner ? "Вещь без фото" : "Насос шаблона" : emptyOwner ? "Сумка без фото" : "Сумка шаблона");
    const row = Object.values(state[type === "item" ? "items" : "containers"]).find(row => row.publicCatalogLayoutId === layout.id && row.name === expectedName);
    return { layoutId: layout.id, entityId: row.id, privatePayload: __adminUiTest.privatePayload(), source: structuredClone(layout.adminCausalSource) };
  }, { listId: server.binding.listId, type, emptyOwner, currentName });
  expect(value.source.base).toEqual({ stateRevision: baseRevision }); expect(value.source.photoOwnerMap?.owners).toHaveLength(4);
  await page.evaluate(({ type, id }) => type === "item" ? __adminUiTest.openItem(id) : __adminUiTest.openContainer(id), { type, id: value.entityId });
  const ui = selectors(type), changedName = type === "item" ? "Насос с выбранными фото" : "Сумка с выбранными фото";
  await expect(page.locator(ui.dialog)).toBeVisible(); await page.locator(ui.name).fill(changedName);
  const files = Array.from({ length: count }, (_, index) => ({ name: `Фото ${type} ${index + 1}.gif`, mimeType: "image/gif", buffer: selectedGif }));
  await page.locator(camera ? ui.camera : ui.input).setInputFiles(files);
  await expect(page.locator(ui.dialog)).toContainText(`Фото подготовлены: ${count}`);
  await expect(page.locator(ui.save)).toBeEnabled();
  expect(server.stagePosts).toHaveLength(previousStages); expect(server.posts).toHaveLength(previousPosts);
  return { ...value, files, changedName, type, ui, previousPosts, previousStages, baseRevision };
}
async function submit(page, selected) {
  await page.locator(selected.ui.name).blur();
  if (test.info().project.name === "mobile-webkit") await page.locator(selected.ui.save).tap();
  else await page.locator(selected.ui.save).click();
}
async function confirmed(page, server, revision = 8) {
  await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts)
    .some(row => row.adminCausalSource?.binding.listId === listId && row.adminCausalSource.base?.stateRevision === revision
      && !row.adminCausalSource.photoAppendPending && !row.adminCausalSource.planId), { listId: server.binding.listId, revision });
}
async function assertSavedFiles(page, server, selected) {
  expect(server.errors).toEqual([]); expect(server.posts).toHaveLength(selected.previousPosts + 1);
  expect(server.stagePosts).toHaveLength(selected.previousStages + selected.files.length);
  const action = server.posts[selected.previousPosts], type = selected.type === "item" ? "items" : "containers";
  expect(action.expectedActorId).toBe(server.binding.actorId); expect(action.body.base).toEqual({ stateRevision: selected.baseRevision });
  expect(action.listId).toBe(server.binding.listId); expect(action.itemKey).toBe(server.binding.itemKey);
  expect(photoReferences(action.body.payload)).toEqual(photoReferences(server.initialPayload));
  expect(JSON.stringify(action.body.payload)).not.toMatch(/photoOwnerMap|photoView|photoAppendPending/);
  expect(action.body.photoAppend.assets.map(asset => asset.entityType)).toEqual(selected.files.map(() => selected.type));
  const targetId = action.body.photoAppend.assets[0].entityId;
  expect(action.body.payload[type][targetId].name).toBe(selected.changedName);
  const oldPhotos = server.initialPayload[type][targetId].photos || [], after = server.payload[type][targetId].photos;
  expect(after.slice(0, oldPhotos.length)).toEqual(oldPhotos);
  expect(after.slice(oldPhotos.length).map(photo => photo.fileName)).toEqual(selected.files.map(file => file.name));
  expect(after.slice(oldPhotos.length).every(photo => photo.status === "synced" && photo.id === photo.photoId && photo.assetId)).toBe(true);
  const stored = await nativeAdminPhotoRecords(page);
  expect(stored.actions).toHaveLength(1); expect(stored.claims).toHaveLength(selected.files.length);
  const record = stored.actions[0]; expect(record.checkedIntentHash).toBe(record.intentHash);
  expect(record.intent.action).toEqual({ operationId: action.operationId, kind: action.kind, listId: action.listId, itemKey: action.itemKey, body: action.body });
  expect(record.intent.binding).toEqual(server.binding);
  expect(record.intent.snapshot.state[type][selected.entityId].name).toBe(selected.changedName);
  for (const [index, stage] of server.stagePosts.entries()) {
    const asset = action.body.photoAppend.assets[index], file = record.files[index];
    expect(stage.manifest.templateOperationId).toBe(action.operationId);
    expect(stage.manifest.operationId).toBe(asset.assetId); expect(stage.manifest.photoId).toBe(asset.photoId);
    expect(stage.assetDigest).toBe(asset.assetDigest); expect(stage.fileName).toBe(selected.files[index].name);
    expect(stage.bytes.equals(selectedGif)).toBe(true); expect(stage.thumbBytes).toBeNull();
    expect(file).toEqual({ stageOperationId: asset.assetId, size: selectedGif.length,
      hash: createHash("sha256").update(selectedGif).digest("hex"), thumbHash: null });
    expect(stored.claims.find(claim => claim.stageOperationId === asset.assetId)).toMatchObject({
      actionOperationId: action.operationId, assetDigest: asset.assetDigest, intentHash: record.intentHash });
  }
  expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  return { action, stored };
}

for (const shared of [false, true]) for (const type of ["item", "container"]) {
  test(`admin photo append prepared ${shared ? "shared" : "demo"} ${type} retains old references and native files`, async ({ page, context }) => {
    const server = await fixture(page, context, { shared }), selected = await editWithFiles(page, server, type);
    await submit(page, selected); await expect(page.locator(selected.ui.dialog)).not.toBeVisible(); await confirmed(page, server);
    const { action } = await assertSavedFiles(page, server, selected);
    await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
    expect(server.posts).toEqual([action]); expect(server.stagePosts).toHaveLength(2);
    const projected = await page.evaluate(id => __adminUiTest.snapshot(id), selected.layoutId);
    expect(photoReferences(projected.payload)).toEqual(photoReferences(server.payload)); expect(server.errors).toEqual([]);
  });
}

test("admin photo append uses exact fileless owner mapping through the camera input", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await editWithFiles(page, server, "container", { emptyOwner: true, camera: true, count: 1 });
  await submit(page, selected); await confirmed(page, server); const { action } = await assertSavedFiles(page, server, selected);
  expect(action.body.photoAppend.assets[0].entityId).toBe("spareBag"); expect(server.errors).toEqual([]);
});

for (const lost of ["stage", "save"]) test(`admin photo append lost ${lost} acknowledgement resolves by GET without a second POST`, async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await editWithFiles(page, server, "item", { count: 1 });
  server.lostStageAck = lost === "stage"; server.lostSaveAck = lost === "save";
  await submit(page, selected); await confirmed(page, server); const { action } = await assertSavedFiles(page, server, selected);
  if (lost === "stage") expect(server.stageGets.filter(id => id === action.body.photoAppend.assets[0].assetId).length).toBeGreaterThanOrEqual(2);
  else expect(server.operationGets.filter(id => id === action.operationId).length).toBeGreaterThanOrEqual(2);
  server.lostStageAck = false; server.lostSaveAck = false;
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  expect(server.posts).toEqual([action]); expect(server.stagePosts).toHaveLength(1); expect(server.errors).toEqual([]);
});

test("admin photo append reload reconciles a committed save whose receipt remained unreachable", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: false }), selected = await editWithFiles(page, server, "container", { count: 1 });
  server.lostSaveAck = true; server.hideSaveAfterCommit = true;
  await submit(page, selected); await expect.poll(() => server.saveHidden).toBe(true);
  expect(server.posts).toHaveLength(1); const action = structuredClone(server.posts[0]), before = await nativeAdminPhotoRecords(page);
  server.saveHidden = false; server.lostSaveAck = false; server.hideSaveAfterCommit = false;
  await page.reload(); await openAdminPhotoEditor(page, server); await confirmed(page, server);
  expect(server.posts).toEqual([action]); expect(await nativeAdminPhotoRecords(page)).toEqual(before);
  await assertSavedFiles(page, server, selected);
});

test("admin photo append mirror quota keeps the immutable files and plan for cold recovery of the selected fields", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: false, exactSourceArrangement: true });
  // Observe the real prepared editor; the source fixture already owns packed
  // state and unknown fields, with no separate local mirror mutation.
  const selected = await editWithFiles(page, server, "item", { count: 1 });
  const editorArrangement = await page.evaluate(id => structuredClone(__adminUiTest.state().layouts[id].arrangement), selected.layoutId);
  expect(editorArrangement.packedItems).toEqual({ [selected.entityId]: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem; window.__adminPhotoQuotaAttempts = 0;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-prototype-state-v1") && String(value).includes('"photoAppendPending"')) {
        window.__adminPhotoQuotaAttempts++; throw new DOMException("Admin selected snapshot mirror quota", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await submit(page, selected); await expect.poll(() => page.evaluate(() => window.__adminPhotoQuotaAttempts)).toBeGreaterThan(0);
  const before = await nativeAdminPhotoRecords(page); expect(before.actions).toHaveLength(1); expect(before.claims).toEqual([]);
  page.adminPhotoPreReloadChecks = await page.evaluate(() => window.__adminPhotoCandidateChecks);
  const action = before.actions[0].intent.action;
  const candidate = before.actions[0].intent.snapshot.state;
  expect(candidate.layouts[selected.layoutId].arrangement).toEqual(editorArrangement);
  expect(action.body.payload.layouts).toEqual(server.initialPayload.layouts);
  const plans = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(row => row.plan?.version === 5));
  expect(plans).toHaveLength(1); expect(plans[0].plan.id).toBe(action.operationId);
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  let releaseStage; server.stageHold = new Promise(resolve => { releaseStage = resolve; });
  await page.reload();
  const opening = openAdminPhotoEditor(page, server); opening.catch(() => {});
  try {
    await expect.poll(() => server.stagePosts.length).toBe(1);
    const restored = await page.evaluate(({ layoutId, entityId }) => {
      const state = __adminUiTest.state();
      return { owner: state.items[entityId], arrangement: state.layouts[layoutId].arrangement,
        items: Object.fromEntries(Object.entries(state.items).filter(([, row]) => row.publicCatalogLayoutId === layoutId)),
        containers: Object.fromEntries(Object.entries(state.containers).filter(([, row]) => row.publicCatalogLayoutId === layoutId)) };
    }, { layoutId: selected.layoutId, entityId: selected.entityId });
    expect(restored.owner.name).toBe(selected.changedName);
    expect(restored.owner.photos.at(-1)).toMatchObject({ id: action.body.photoAppend.assets[0].photoId, localId: action.body.photoAppend.assets[0].photoId,
      status: "pending", fileName: selected.files[0].name });
    expect(restored.arrangement).toEqual(editorArrangement);
    for (const type of ["items", "containers"]) {
      expect(Object.keys(restored[type]).sort()).toEqual(Object.keys(candidate[type]).sort());
      for (const [id, row] of Object.entries(candidate[type]).filter(([, row]) => row.name.includes("без фото"))) expect(restored[type][id]).toEqual(row);
    }
    expect((await nativeAdminPhotoRecords(page)).actions).toEqual(before.actions);
    releaseStage(); await opening; await confirmed(page, server); await assertSavedFiles(page, server, selected);
    expect(server.payload.layouts).toEqual(server.initialPayload.layouts);
    expect(server.receipts.get(action.operationId).result.payload.photoAppend.confirmedPayload).toEqual(server.payload);
    // The live arrangement is normalized for known UI fields. Opaque source
    // fields remain exact in the wire payload and retained receipt above.
    const confirmedArrangement = await page.evaluate(id => __adminUiTest.state().layouts[id].arrangement, selected.layoutId);
    expect(Object.values(confirmedArrangement.packedItems)).toEqual([true]);
    await page.evaluate(() => __adminUiTest.openPrivate("personal"));
    expect(await page.evaluate(() => __adminUiTest.state().packedItems)).toEqual({});
    expect(server.privatePayload.packedItems).toEqual({});
    expect(await page.evaluate(() => __adminUiTest.privatePayload())).toEqual(selected.privatePayload);
  } finally { releaseStage(); await opening.catch(() => {}); }
});

for (const emptyOwner of [false, true]) test(`an ordinary template field save followed by photo append keeps owner identities across confirmed revisions emptyOwner=${emptyOwner}`, async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true });
  const rawId = emptyOwner ? "spare" : "pump";
  const initial = await page.evaluate(({ listId, emptyOwner }) => {
    const state = __adminUiTest.state(), layout = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === listId);
    const item = Object.values(state.items).find(row => row.publicCatalogLayoutId === layout.id && row.name === (emptyOwner ? "Вещь без фото" : "Насос шаблона"));
    return { layoutId: layout.id, entityId: item.id, owners: structuredClone(layout.adminCausalSource.photoOwnerMap.owners) };
  }, { listId: server.binding.listId, emptyOwner });
  await page.evaluate(id => __adminUiTest.openItem(id), initial.entityId);
  const ordinaryName = "Насос после обычного сохранения";
  await page.locator("#itemName").fill(ordinaryName); await submit(page, { ui: selectors("item") });
  await confirmed(page, server, 8);
  expect(server.posts).toHaveLength(1); expect(server.posts[0].body.photoAppend).toBeUndefined(); expect(server.stagePosts).toEqual([]);
  expect(Object.keys(server.payload.items).sort()).toEqual(Object.keys(server.initialPayload.items).sort());
  expect(Object.keys(server.payload.containers).sort()).toEqual(Object.keys(server.initialPayload.containers).sort());
  expect(server.payload.items[rawId].name).toBe(ordinaryName);
  const selected = await editWithFiles(page, server, "item", { count: 1, currentName: ordinaryName, emptyOwner });
  expect(selected.entityId).toBe(initial.entityId);
  expect(selected.source.photoOwnerMap.owners).toEqual(initial.owners);
  await submit(page, selected); await confirmed(page, server, 9);
  const { action } = await assertSavedFiles(page, server, selected);
  expect(action.body.base).toEqual({ stateRevision: 8 }); expect(action.body.photoAppend.assets[0].entityId).toBe(rawId);
  expect(server.posts.map(row => row.body.base.stateRevision)).toEqual([7, 8]); expect(server.revision).toBe(9);
});

test("a proven pre-capture IndexedDB quota keeps the form and retries the same frozen action and bytes", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: false }), selected = await editWithFiles(page, server, "item", { count: 1 });
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add; window.__adminPhotoRejectAdds = true; window.__adminPhotoAddAttempts = [];
    IDBObjectStore.prototype.add = function(value, ...args) {
      if (this.transaction.db.name === "bike-packing-admin-template-photo-actions-v1" && this.name === "actions") {
        window.__adminPhotoAddAttempts.push({ intentJson: value.intentJson, intentHash: value.intentHash,
          files: value.files.map(part => ({ stageOperationId: part.stageOperationId, bytes: Array.from(new Uint8Array(part.file)),
            thumb: part.thumb ? Array.from(new Uint8Array(part.thumb)) : null })) });
        if (window.__adminPhotoRejectAdds) {
          this.transaction.abort(); throw new DOMException("Selected photo action quota", "QuotaExceededError");
        }
      }
      return add.call(this, value, ...args);
    };
  });
  await submit(page, selected);
  await expect.poll(() => page.evaluate(() => window.__adminPhotoAddAttempts.length)).toBe(1);
  await expect(page.locator(selected.ui.dialog)).toBeVisible(); await expect(page.locator(selected.ui.save)).toBeEnabled();
  expect(await nativeAdminPhotoRecords(page)).toEqual({ actions: [], claims: [] });
  expect(server.posts).toEqual([]); expect(server.stagePosts).toEqual([]);
  const first = await page.evaluate(() => window.__adminPhotoAddAttempts[0]);
  await expect(page.locator(selected.ui.name)).toHaveValue(selected.changedName);
  await page.evaluate(() => { window.__adminPhotoRejectAdds = false; });
  await submit(page, selected); await confirmed(page, server);
  const attempts = await page.evaluate(() => window.__adminPhotoAddAttempts);
  expect(attempts).toEqual([first, first]);
  const { action } = await assertSavedFiles(page, server, selected);
  expect(action.operationId).toBe(JSON.parse(first.intentJson).action.operationId);
});

test("a photo snapshot mirror quota never evicts an existing personal base or recovery snapshot", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), selected = await editWithFiles(page, server, "container", { count: 1 });
  const sentinels = await page.evaluate(() => {
    const payload = structuredClone(__adminUiTest.privatePayload());
    const values = {
      "bike-packing-prototype-base-state-v1::id:admin-a": JSON.stringify({ ...payload, retainedSentinel: { kind: "personal-base", exact: [3, 1, 2] } }),
      "bike-packing-recovery-state-v1::id:admin-a": JSON.stringify([{ createdAt: "2026-09-11T00:00:00Z", reason: "Retained private recovery",
        payload, retainedSentinel: { kind: "personal-recovery", exact: [2, 1, 3] } }])
    };
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    return values;
  });
  const installQuota = keys => {
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    window.__adminPhotoQuotaAttempts = 0; window.__adminPhotoRecoveryEvictions = [];
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-prototype-state-v1")) {
        window.__adminPhotoQuotaAttempts++; throw new DOMException("Admin mirror quota cannot evict personal recovery", "QuotaExceededError");
      }
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (keys.includes(String(key))) window.__adminPhotoRecoveryEvictions.push(String(key));
      return remove.call(this, key);
    };
  };
  await page.evaluate(installQuota, Object.keys(sentinels));
  await page.addInitScript(installQuota, Object.keys(sentinels));
  await submit(page, selected); await expect.poll(() => page.evaluate(() => window.__adminPhotoQuotaAttempts)).toBeGreaterThan(0);
  expect(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(sentinels))).toEqual(sentinels);
  expect(await page.evaluate(() => window.__adminPhotoRecoveryEvictions)).toEqual([]);
  const saved = await nativeAdminPhotoRecords(page); expect(saved.actions).toHaveLength(1); expect(saved.claims).toEqual([]);
  expect(server.stagePosts).toEqual([]); expect(server.posts).toEqual([]); expect(server.errors).toEqual([]);
  await page.reload(); await openAdminPhotoEditor(page, server);
  await expect.poll(() => page.evaluate(() => window.__adminPhotoQuotaAttempts)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__adminPhotoRecoveryEvictions)).toEqual([]);
  // Startup may legitimately replace a baseline or append recovery history;
  // quota must never make room by deleting either independent private record.
  expect(await page.evaluate(keys => keys.every(key => localStorage.getItem(key) !== null), Object.keys(sentinels))).toBe(true);
  expect(await nativeAdminPhotoRecords(page)).toEqual(saved);
  expect(server.stagePosts).toEqual([]); expect(server.posts).toEqual([]); expect(server.errors).toEqual([]);
});

test("two tabs saving photos against one confirmed template retain only one distinct action and pause the other form", async ({ page, context }) => {
  const server = await fixture(page, context, { shared: true }), otherPage = await context.newPage();
  otherPage.on("pageerror", error => server.errors.push(`Second tab: ${error.message}`));
  await otherPage.goto(adminPhotoOrigin); await openAdminPhotoEditor(otherPage, server);
  const first = await editWithFiles(page, server, "item", { count: 1 }), second = await editWithFiles(otherPage, server, "container", { count: 1 });
  let releaseStage; server.stageHold = new Promise(resolve => { releaseStage = resolve; });
  try {
    await Promise.all([submit(page, first), submit(otherPage, second)]);
    await expect.poll(() => server.stagePosts.length).toBe(1);
    const paused = async () => {
      const values = await Promise.all([[page, first], [otherPage, second]].map(async ([tab, selected]) => ({
        open: await tab.locator(selected.ui.dialog).isVisible(), text: await tab.locator(selected.ui.status).textContent() })));
      return values.filter(value => value.open && value.text && !value.text.startsWith("Фото подготовлены:")).length;
    };
    await expect.poll(paused).toBe(1);
    const stored = await nativeAdminPhotoRecords(page); expect(stored.actions).toHaveLength(1);
    expect(stored.claims).toHaveLength(1); expect(server.posts).toEqual([]);
    const action = stored.actions[0].intent.action, winner = action.body.photoAppend.assets[0].entityType === "item"
      ? { tab: page, selected: first, loser: otherPage, loserSelected: second }
      : { tab: otherPage, selected: second, loser: page, loserSelected: first };
    const plans = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(row => row.plan?.version === 5));
    expect(plans.map(row => row.plan.id)).toEqual([action.operationId]);
    await expect(winner.loser.locator(winner.loserSelected.ui.dialog)).toBeVisible();
    await expect(winner.loser.locator(winner.loserSelected.ui.name)).toHaveValue(winner.loserSelected.changedName);
    releaseStage(); await confirmed(winner.tab, server); await assertSavedFiles(winner.tab, server, winner.selected);
    expect((await nativeAdminPhotoRecords(otherPage)).actions.map(row => row.intent.action.operationId)).toEqual([action.operationId]);
    expect(server.stagePosts).toHaveLength(1); expect(server.posts).toHaveLength(1); expect(server.errors).toEqual([]);
  } finally { releaseStage(); await otherPage.close(); }
});
