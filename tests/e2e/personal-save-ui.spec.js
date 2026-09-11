import { personalServerPhotoFormSummary } from "../../src/sync/personal-server-photo-form-result.js";
import { preparePersonalLegacyServerImportSource } from "../../src/sync/personal-legacy-server-import-source.js";
import { preparePersonalServerImportSource } from "../../src/sync/personal-server-import-source.js";
import { assertPersonalServerImportBody, assertPersonalServerImportHashes, personalServerImportReceipt } from "../../src/sync/personal-server-import-protocol.js";
import { assertPersonalShareLinkBody, personalShareLinkProjection, personalSharePhotoInventory } from "../../src/sync/personal-share-link.js";
import { assertPersonalPublicImportBody, assertPersonalPublicImportHashes, personalPublicImportReceipt } from "../../src/sync/personal-public-import-protocol.js";
import { createBackupZip } from "../../src/backup/archive.js";
import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";
import { guestLocalLayoutCandidateFromState } from "../../src/public/guest-login-import.js";
import { assertPersonalGuestImportBody, assertPersonalGuestImportHashes, personalGuestImportReceipt } from "../../src/sync/personal-guest-import-protocol.js";
import { assertPersonalArchivePhotoBody, assertPersonalArchivePhotoHashes, personalArchivePhotoReceipt } from "../../src/sync/personal-archive-photo-protocol.js";
import { assertPersonalArchiveImportBody, assertPersonalArchiveImportHashes, personalArchiveImportReceipt } from "../../src/sync/personal-archive-import-protocol.js";
import { personalPhotoHistoryPlan } from "../../src/sync/personal-photo-history-plan.js";
import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { trackBrowserLifecycle } from "../fixtures/browser-lifecycle.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { personalPhotoFormOwner } from "../../src/sync/personal-photo-form-protocol.js";
import { personalPublicPhotoFormSummary, personalPublicPendingPhotoInventory } from "../../src/sync/personal-public-photo-form-result.js";
import { personalImportPhotoFormSummary } from "../../src/sync/personal-import-photo-form-result.js";
import { applyPersonalPhotoItemFormContext } from "../../src/sync/personal-photo-item-form-context.js";
import { applyPersonalPhotoContainerFormContext } from "../../src/sync/personal-photo-container-form-context.js";
import { personalPhotoCopyOwner } from "../../src/sync/personal-photo-copy-source.js";
import { personalPhotoCopyPlacementLayout } from "../../src/sync/personal-photo-copy-placement-layout.js";
import { personalPhotoTreeCopyLayout } from "../../src/sync/personal-photo-tree-copy-layout.js";
import { personalBusinessPayload } from "../../src/sync/personal-server-payload.js";
import { readZipEntries, zipText } from "../../src/utils/simple-zip.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

// Full application, isolated browser/API fixture. Gates are changed only in
// an isolated test bundle; source/publication flags and live services stay off.
const origin = "https://experiment.vniipo-help.ru";
const bundleRoot = path.resolve("test-results/personal-ui-build");
const photoRecoveryBundleRoot = path.resolve("test-results/personal-photo-cancel-ui-build");
test.beforeAll(async () => {
  if (process.env.BIKE_RELEASE_BROWSER === "1") return; // Exact normal release build, no test-only gate transforms.
  for (const mode of process.env.BIKE_PERSONAL_UI_MODES?.split(",") || ["production", "photo-recovery", "photo-form", "photo-edit"]) {
  expect(["production", "photo-recovery", "photo-form", "photo-edit"]).toContain(mode);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
    "build", "--config", "tests/e2e/personal-ui.vite.config.js", "--mode", mode], { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
  }
});
test.beforeEach(async ({ page }) => { page.personalBrowserDiagnostics = trackBrowserLifecycle(page); });

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    if (info.title.includes("guest sign-in")) {
      const guest = await page.evaluate(() => ({ validation: globalThis.__personalGuestHandoffValidation,
        handoff: localStorage.getItem("bike-packing-guest-login-handoff-v2"), source: localStorage.getItem("bike-packing-prototype-state-v1") }))
        .catch(error => ({ unavailable: error.message }));
      console.log("GUEST UI FAILURE", JSON.stringify(guest));
      await info.attach("guest-import-failure", { body: JSON.stringify(guest), contentType: "application/json" });
    }
    const startup = await page.evaluate(() => globalThis.__personalStartupPhase).catch(() => null);
    if (startup) console.log("PERSONAL STARTUP", JSON.stringify(startup));
    const recoveryFailure = await page.evaluate(() => globalThis.__personalRecoveryFailure).catch(() => null);
    if (recoveryFailure) { console.log("RECOVERY FAILURE", JSON.stringify(recoveryFailure)); await info.attach("personal-recovery-failure", { body: JSON.stringify(recoveryFailure), contentType: "application/json" }); }
    const formError = await page.evaluate(() => globalThis.__personalTestPhotoFormError).catch(() => null);
    if (formError) { console.log("PHOTO FORM FAILURE", JSON.stringify(formError)); await info.attach("photo-form-failure", { body: JSON.stringify(formError), contentType: "application/json" }); }
    const photoQueue = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(record => record.action?.kind === "photos.mutate")).catch(() => null);
    if (photoQueue?.length) await info.attach("photo-form-outbox", { body: JSON.stringify(photoQueue), contentType: "application/json" });
    const treeInput = await page.evaluate(() => globalThis.__personalTestTreeCopyInput).catch(() => null);
    if (treeInput) await info.attach("photo-tree-copy-input", { body: JSON.stringify(treeInput), contentType: "application/json" });
    const difference = await page.evaluate(() => globalThis.__personalTestProjectionDifference).catch(() => null);
    if (difference) await info.attach("personal-projection-difference", { body: JSON.stringify(difference, null, 2), contentType: "application/json" });
    const photoEvents = await page.evaluate(() => globalThis.__photoEditEvents).catch(() => null);
    if (photoEvents) await info.attach("photo-edit-events", { body: JSON.stringify(photoEvents), contentType: "application/json" });
  }
  if (info.status !== info.expectedStatus) await info.attach("personal-ui-errors", {
    body: JSON.stringify(page.personalFixture?.errors || []), contentType: "application/json"
  });
  // Retain crashes that happen during the failed test's diagnostic reads too.
  if (info.status !== info.expectedStatus) await info.attach("browser-lifecycle", {
    body: JSON.stringify(page.personalBrowserDiagnostics), contentType: "application/json"
  });
});

async function submitForm(page, button, input) {
  if (input) await page.locator(input).blur();
  if (test.info().project.name === "mobile-webkit") await page.locator(button).tap();
  else await page.locator(button).click();
}

async function reloadApp(page, { recovery = false } = {}) {
  page.personalFixture.reloading = true;
  try {
    await page.reload();
    if (recovery) await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible({ timeout: 30000 });
    else await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  } finally { page.personalFixture.reloading = false; }
}

async function createRootContainer(page, name) {
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(name);
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
  const bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: name });
  await expect(bag).toHaveCount(1); return bag;
}

async function createItemInContainer(page, bag, name, { weight = "0" } = {}) {
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#createItemForContainerBtn").click();
  await page.locator("#itemName").fill(name); await page.locator("#itemWeight").fill(weight);
  await submitForm(page, "#saveItemBtn", "#itemWeight");
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  const item = bag.locator("[data-item-id]").filter({ hasText: name });
  await expect(item).toHaveCount(1); return item;
}

function initialPayload() {
  return { locations: ["Велосипед"], categories: ["Ремонт"], containers: {}, items: {},
    layouts: { "layout-a": { id: "layout-a", name: "Личный тест", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} } } },
    activeLayoutId: "layout-a", packedItems: {} };
}

function guestImportPayload(withPhoto) {
  const source = replacementPayload(), layout = source.layouts["layout-a"];
  layout.name = "Гостевая поездка"; layout.createdAt = "2026-09-08T00:00:00.000Z";
  layout.arrangement.packedItems.source = true;
  source.layouts["guest-second"] = { ...structuredClone(layout), id: "guest-second", name: "Гостевая запасная" };
  source.items.source.notes = "Сохранить гостевую заметку";
  source.items.source.photos = withPhoto ? [{ id: "guest-native", status: "synced", url: `${origin}/guest-photo/original.png`,
    thumbUrl: `${origin}/guest-photo/thumb.png`, fileName: "guest-original.png" }] : [];
  return source;
}

for (const withPhoto of [false, true]) test(`actual guest sign-in ${withPhoto ? "photo" : "fileless"} import survives lost owner ACK and remembers completion after reload`, async ({ page, context }) => {
  test.setTimeout(150000);
  const guestSource = guestImportPayload(withPhoto);
  const f = await setup(page, context, { photoEdit: true, guestSource, configure: value => { value.loseFormOwner = true; } });
  await expect.poll(() => f.injectedFailure, { timeout: 30000 }).toBe(true);
  expect(f.posts.filter(value => value.kind === "list.import")).toHaveLength(1);
  const action = structuredClone(f.posts.find(value => value.kind === "list.import")), stages = [...f.stagePosts];
  expect(action.body.guestImport.sourcePayload).toEqual(f.guestChosenSource); expect(action.body.guestImport.files).toHaveLength(withPhoto ? 1 : 0);
  expect(action.body.guestImport.layoutTargets).toHaveLength(2);
  if (withPhoto) await page.evaluate(() => {
    const newer = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1")); newer.items.source.notes = "Более новая гостевая работа";
    localStorage.setItem("bike-packing-prototype-state-v1", JSON.stringify(newer));
  });
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await expect(resume).toBeVisible(); f.loseFormOwner = false; f.hiddenFormOwner = null;
  await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.stagePosts).toEqual(stages); expect(f.posts.filter(value => value.kind === "list.import")).toHaveLength(1);
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  const ownerTarget = action.body.guestImport.ownerTargets.find(value => value.entityType === "item" && value.sourceId === "source");
  expect(f.payload.items[ownerTarget.targetId].notes).toBe("Сохранить гостевую заметку");
  for (const layout of action.body.guestImport.layoutTargets) {
    expect(f.payload.layouts[layout.targetId].arrangement.itemQuantities[ownerTarget.targetId]).toBe(3);
    expect(f.payload.layouts[layout.targetId].arrangement.packedItems[ownerTarget.targetId]).toBe(true);
  }
  await createRootContainer(page, "После гостевого переноса");
  await synchronizePhotoHistory(page, () => Object.values(f.payload.containers).some(value => value.name === "После гостевого переноса"));
  await reloadApp(page); expect(f.posts.filter(value => value.kind === "list.import")).toHaveLength(1);
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1")));
  expect(retained.items.source.notes).toBe(withPhoto ? "Более новая гостевая работа" : "Сохранить гостевую заметку"); expect(f.errors).toEqual([]);
});

for (const cancelImport of [false, true]) test(`actual guest sign-in partial files ${cancelImport ? "cancel through lost ACK" : "resume"} preserves the whole selected source`, async ({ page, context }) => {
  test.setTimeout(150000);
  const guestSource = guestImportPayload(true); guestSource.items.inside.photos = [{ ...guestSource.items.source.photos[0], id: "guest-second-photo" }];
  const f = await setup(page, context, { photoEdit: true, guestSource, configure: value => { value.loseStageAt = 1; } });
  await expect.poll(() => f.hiddenStage, { timeout: 30000 }).toBeTruthy();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(value => value.action?.body?.guestImport));
  expect(saved.action.body.guestImport.files).toHaveLength(2); expect(f.posts.filter(value => value.kind === "list.import")).toEqual([]);
  const before = structuredClone(f.payload);
  if (cancelImport) {
    f.cancelPhotoAction = saved.action;
    f.cancellationReceipts = new Map(saved.action.body.guestImport.files.map(file => [file.assetId, { ok: true,
      operation: { id: file.assetId, actorId: "actor-a", environment: "bike-packing-experiment", listId: f.listId,
        entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
      cancellation: { version: 1, stageOperationId: file.assetId, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, noAssetPublished: true, stageCannotPublish: true } }]));
  }
  await reloadApp(page, { recovery: true }); f.hiddenStage = null; f.loseStageAt = 0;
  const recovery = page.locator("#personalSaveRecoveryDialog");
  if (cancelImport) {
    const cancel = recovery.locator("[data-cancel-photo-upload]"); await expect(cancel).toBeVisible();
    f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
    await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
    await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("Гостевая работа");
    await page.locator("#confirmCancelBtn").click(); expect(f.payload).toEqual(before);
    await cancel.click(); await page.locator("#confirmOkBtn").click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.payload).toEqual(before); expect(f.stagePosts).toHaveLength(1);
    expect(f.posts.at(-1).body.guestImport).toBeUndefined();
  } else {
    await recovery.locator("[data-resume-photo-upload]").click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    const imported = f.posts.find(value => value.kind === "list.import"); expect(imported.operationId).toBe(saved.action.operationId); expect(imported.body).toEqual(saved.action.body);
    expect(f.stagePosts).toHaveLength(2); expect(new Set(f.stagePosts).size).toBe(2);
  }
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  expect(f.posts.filter(value => value.kind === "list.import")).toHaveLength(1);
  expect(await page.evaluate(() => Boolean(localStorage.getItem("bike-packing-prototype-state-v1")))).toBe(true); expect(f.errors).toEqual([]);
});

for (const phase of ["native files", "queue link"]) test(`actual guest sign-in ${phase} quota keeps every original and exports the durable selection after reload`, async ({ page, context }) => {
  test.setTimeout(150000);
  await context.addInitScript(phase => {
    if (phase === "native files") {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (row, ...rest) {
        if (row?.intentJson && JSON.parse(row.intentJson).action?.body?.guestImport) throw new DOMException("Guest native quota", "QuotaExceededError");
        return original.call(this, row, ...rest);
      };
    } else {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (!globalThis.__guestQuotaReleased && String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.guestImport) throw new DOMException("Guest link quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, phase);
  const f = await setup(page, context, { photoEdit: true, guestSource: guestImportPayload(true) });
  const recovery = page.locator("#personalSaveRecoveryDialog"); await expect(recovery).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const entries = await readZipEntries(new Blob([await readFile(await (await download).path())]));
  const form = JSON.parse(zipText(entries.get("opened-form/form.json")));
  expect(form.request.selection.candidate.sourceState).toEqual(f.guestChosenSource);
  expect(entries.get("opened-form/0/original.bin").byteLength).toBeGreaterThan(0);
  const rows = JSON.parse(zipText(entries.get("guest-import-selections.json"))); expect(rows).toHaveLength(1);
  expect(rows[0].completion).toBeUndefined(); expect(rows[0].intent.files).toHaveLength(1);
  expect(f.posts.filter(value => value.kind === "list.import")).toEqual([]); expect(f.stagePosts).toEqual([]);
  if (phase === "queue link") {
    await reloadApp(page, { recovery: true });
    const again = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
    const recovered = await readZipEntries(new Blob([await readFile(await (await again).path())]));
    expect(JSON.parse(zipText(recovered.get("guest-import-selections.json")))).toEqual(rows);
    expect([...recovered.keys()].some(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toBe(true);
    f.guestPhotoUnavailable = true; await page.evaluate(() => { globalThis.__guestQuotaReleased = true; });
    const resume = recovery.locator("[data-resume-photo-upload]"); await expect(resume).toBeVisible(); await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts.find(value => value.kind === "list.import").operationId).toBe(rows[0].operationId);
    await reloadApp(page); await expect(recovery).not.toBeVisible();
    expect(f.posts.filter(value => value.kind === "list.import")).toHaveLength(1);
  }
  expect(f.errors).toEqual([]);
});

for (const mode of ["live", "snapshot"]) for (const scope of ["layout", "list", "item", "container"]) test(`actual causal share ${mode} ${scope} uses saved selection and entity form fields`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS !== "1", "Requires isolated sharing bundle");
  test.setTimeout(100000);
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Сумка ссылки");
  const item = await createItemInContainer(page, bag, "Вещь ссылки");
  await synchronize(page, () => Object.values(f.payload.items).some(owner => owner.name === "Вещь ссылки"));
  const entity = ["item", "container"].includes(scope), bagId = Object.values(f.payload.containers).find(owner => owner.name === "Сумка ссылки").id;
  if (scope === "item") { await item.locator(".item-title-hitarea").click(); await page.locator("#itemWeight").fill("147"); await page.locator("#shareItemLinkBtn").click(); }
  else if (scope === "container") {
    await page.locator('[data-view="bags"]').click(); await page.locator(`#bagsView [data-root-card="${bagId}"] [data-root-title]`).click();
    await page.locator("#rootContainerWeight").fill("247"); await page.locator("#shareRootContainerLinkBtn").click();
  } else { await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click(); }
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator(`#confirmDialog input[name="${entity ? "shareEntityMode" : "shareLinkMode"}"][value="${mode}"]`).check();
  if (!entity) await page.locator(`#confirmDialog input[name="shareListScope"][value="${scope}"]`).check();
  await submitForm(page, "#confirmOkBtn");
  await expect(page.locator("#confirmDialog input[readonly]")).toBeVisible({ timeout: 30000 });
  const share = f.posts.find(post => post.body.shareLink); expect(share).toBeTruthy();
  expect(share.body.shareLink.mode).toBe(mode); expect(share.body.shareLink.scope).toBe(entity ? "entity" : scope);
  expect(share.body.shareLink.layoutId).toBe("layout-a"); expect(share.body.shareLink.includeAuthor).toBe(false);
  expect(share.body.shareLink.authorName).toBe(""); expect(share.body.visibility).toBeUndefined();
  if (entity) expect(share.body.payload[scope === "item" ? "items" : "containers"][share.body.shareLink.entityId].weight).toBe(scope === "item" ? 147 : 247);
  expect(await page.locator("#confirmDialog input[readonly]").inputValue()).toContain(share.body.shareLink.id);
  expect(f.posts.filter(post => post.body.shareLink)).toHaveLength(1); expect(f.errors).toEqual([]);
  const link = await page.locator("#confirmDialog input[readonly]").inputValue(), writes = f.posts.length;
  await page.goto(link); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(page.locator("#syncStatus")).toHaveText(/^Общий список ·/);
  await expect(page.locator("#packingView")).toBeVisible(); await expect(page.locator("#packingView")).toContainText("Вещь ссылки");
  expect(f.posts).toHaveLength(writes); expect(f.errors).toEqual([]);
});

for (const mode of ["live", "snapshot"]) test(`actual server import ${mode} layout copies the opened link and recovers its lost ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1" || process.env.BIKE_PERSONAL_SHARE_LINKS !== "1", "Requires isolated server copy bundle");
  test.setTimeout(120000);
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Исходная сумка по ссылке");
  await createItemInContainer(page, bag, "Исходная вещь по ссылке");
  await synchronize(page, () => Object.values(f.payload.items).some(owner => owner.name === "Исходная вещь по ссылке"));
  await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click();
  await page.locator(`#confirmDialog input[name="shareLinkMode"][value="${mode}"]`).check(); await submitForm(page, "#confirmOkBtn");
  const link = await page.locator("#confirmDialog input[readonly]").inputValue();
  await page.goto(link); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(page.locator("#packingView")).toContainText("Исходная вещь по ссылке");
  f.loseFormOwner = true;
  await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
  if (await page.locator("#confirmDialog").isVisible()) await submitForm(page, "#confirmOkBtn");
  await expect.poll(() => f.posts.filter(post => post.body.serverImport).length, { timeout: 30000 }).toBe(1);
  const action = f.posts.find(post => post.body.serverImport), manifest = action.body.serverImport;
  expect(manifest.source.mode).toBe(mode); expect(manifest.source.kind).toBe("shared-link");
  expect(manifest.ownerTargets.every(row => row.targetId !== row.sourceId && !row.reuse)).toBe(true);
  await expect.poll(() => f.hiddenFormOwner).toBe(action.operationId);
  // The opened shared URL remains a reader after reload. Recovery belongs to
  // the personal account, whose pending copy keeps its original operation ID.
  await reloadApp(page); expect(f.posts.filter(post => post.body.serverImport)).toHaveLength(1);
  f.reloading = true; await page.goto(origin);
  const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery).toBeVisible({ timeout: 30000 }); f.reloading = false;
  f.loseFormOwner = false; f.hiddenFormOwner = "";
  await recovery.locator("[data-resume-photo-upload]").click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  expect(f.posts.filter(post => post.body.serverImport)).toHaveLength(1); expect(f.errors).toEqual([]);
});

async function openServerSourceUi(page, context, { mode = "live", photos = true, legacy = false } = {}) {
  const source = guestImportPayload(photos), payload = replacementPayload();
  source.items.source.name = "Точная вещь по ссылке"; source.containers.bag.name = "Точная сумка по ссылке";
  if (photos) source.containers.bag.photos = [{ ...source.items.source.photos[0], id: "server-bag-photo" }];
  payload.items.source.name = "Моя вещь"; payload.containers.bag.name = "Моя сумка";
  const descriptor = { version: 1, id: `shared-entity-${mode === "live" ? "link" : "snapshot"}-${randomUUID()}`,
    mode, scope: "list", layoutId: "", entityType: "", entityId: "", title: "Чужой список по ссылке",
    description: "", includeAuthor: false, authorName: "" };
  if (legacy === "whole") descriptor.id = `shared-snapshot-${randomUUID()}`;
  const marker = legacy ? await preparePersonalLegacyServerImportSource({ listId: descriptor.id, stateRevision: mode === "live" ? 7 : 1,
    descriptor: mode === "live" ? { mode, scope: "layout", layoutId: "guest-source", entityType: "container", entityId: "bag", sourceListId: "old-private-source" } : null })
    : await preparePersonalServerImportSource({ descriptor, stateRevision: mode === "live" ? 7 : 1 });
  const f = await setup(page, context, { photoEdit: true, payload, configure: state => {
    state.serverSharedRecord = { id: descriptor.id, listId: descriptor.id, title: descriptor.title, ownerId: "actor-b",
      visibility: "shared", sourceType: "user", stateRevision: 1, serverCopySource: marker, payload: structuredClone(source) };
  } });
  await synchronize(page, () => Boolean(f.payload.items.source)); const before = structuredClone(f.payload);
  await page.goto(`${origin}/?sharedList=${descriptor.id}`);
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  return { f, source, before, marker };
}

for (const [mode, legacy] of [["live", false], ["snapshot", false], ["live", true], ["snapshot", true], ["snapshot", "whole"]])
  for (const kind of ["layout", "item", "tree", "empty", "catalog"])
test(`actual server import ${legacy ? `legacy ${legacy === "whole" ? "whole " : ""}` : ""}${mode} ${kind} with photos preserves another owner's source through lost ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1", "Requires isolated server import bundle"); test.setTimeout(120000);
  const { f, source, before, marker } = await openServerSourceUi(page, context, { mode, legacy });
  f.loseFormOwner = true;
  if (kind === "layout") await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
  else if (kind === "catalog") {
    await page.locator('[data-view="items"]').click();
    await page.locator('[data-list-item-id="shared-virtual-item-source"], [data-item-id="shared-virtual-item-source"]').filter({ visible: true }).first().locator(".item-title").click();
    await page.locator("#copySharedItemDialogBtn").click();
  } else {
    if (kind === "item") await page.locator('[data-view="items"]').click();
    if (kind === "empty") await page.locator('[data-view="bags"]').click();
    await page.locator(kind === "item" ? '[data-copy-layout-item="shared-virtual-item-source"], [data-copy-item="shared-virtual-item-source"]'
      : '[data-copy-root="shared-virtual-container-bag"]').filter({ visible: true }).first().click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-a");
    await page.locator(kind === "item" ? '#containerPickerBoard [data-pick-container="bag"]' : "#containerPickerBoard [data-pick-root-index]").last().click();
  }
  await expect.poll(async () => f.posts.some(post => post.body.serverImport) || await page.locator("#confirmDialog").isVisible(), { timeout: 30000 }).toBe(true);
  if (await page.locator("#confirmDialog").isVisible()) await submitForm(page, "#confirmOkBtn");
  await expect.poll(() => f.posts.filter(post => post.body.serverImport).length, { timeout: 30000 }).toBe(1);
  const original = structuredClone(f.posts.find(post => post.body.serverImport)), manifest = original.body.serverImport;
  expect(manifest.source).toEqual(marker); expect(manifest.sourcePayload).toEqual(source);
  expect(manifest.files).toHaveLength(["layout", "tree"].includes(kind) ? 2 : 1);
  expect(manifest.ownerTargets.every(row => row.targetId !== row.sourceId && !row.reuse)).toBe(true);
  await expect.poll(() => f.hiddenFormOwner).toBe(original.operationId);
  await expect(page).not.toHaveURL(/[?&](?:sharedList|shared)=/);
  await reloadApp(page, { recovery: true });
  f.loseFormOwner = false; f.hiddenFormOwner = null; f.serverSharedRecord = null; f.guestPhotoUnavailable = true;
  await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Подтверждения и актуальная версия сохранены");
  await reloadApp(page);
  expect(f.posts.filter(post => post.body.serverImport)).toEqual([original]); expect(f.stagePosts).toHaveLength(manifest.files.length);
  expect(personalBusinessPayload(f.payload).items.source).toEqual(personalBusinessPayload(before).items.source);
  expect(personalBusinessPayload(f.payload).containers.bag).toEqual(personalBusinessPayload(before).containers.bag);
  for (const file of manifest.files) {
    const owner = f.payload[file.entityType === "item" ? "items" : "containers"][file.entityId];
    expect(owner.photos, JSON.stringify({ owner, posts: f.posts.map(post => ({ id: post.operationId, kind: post.kind, ref: post.body.photoResults })) })).toContainEqual(expect.objectContaining({ id: file.photoId, status: "synced" }));
  }
  expect(f.errors).toEqual([]);
});

for (const kind of ["layout", "item"]) test(`actual server import own OFF keeps ${kind} source and personal journal unchanged`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_IMPORT === "1", "Requires own server import OFF"); test.setTimeout(90000);
  const { f, before } = await openServerSourceUi(page, context), posts = f.posts.length;
  const journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")));
  if (kind === "layout") await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
  else { await page.locator('[data-view="items"]').click(); await page.locator('[data-copy-item="shared-virtual-item-source"]').filter({ visible: true }).first().click(); }
  const pausedMessage = "Копирование списка по ссылке через очередь ещё не включено.";
  if (kind === "layout") await expect(page.locator("main")).toContainText(pausedMessage);
  else await expect(page.getByText(pausedMessage, { exact: true })).toBeVisible();
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")))).toEqual(journal);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-server-selections-v1:")))).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const phase of ["queue link", "partial files"]) test(`actual server import ${phase} recovers selected bytes after restart`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1", "Requires isolated server import bundle"); test.setTimeout(120000);
  const { f, source } = await openServerSourceUi(page, context);
  if (phase === "queue link") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, text) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(text)?.action?.body?.serverImport) throw new DOMException("Server copy quota", "QuotaExceededError");
      return original.call(this, key, text);
    };
  });
  else f.loseStageAt = 1;
  await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
  if (phase === "queue link") await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  else await expect.poll(() => f.hiddenStage, { timeout: 30000 }).toBeTruthy();
  const selected = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-server-selections-v1:") && key.endsWith(":action")).map(([, text]) => JSON.parse(text)));
  expect(selected).toHaveLength(1); const original = selected[0].action;
  expect(original.body.serverImport.sourcePayload).toEqual(source); expect(f.posts.filter(post => post.body.serverImport)).toEqual([]);
  f.reloading = true; await page.goto(origin); const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery).toBeVisible({ timeout: 30000 }); f.reloading = false;
  const download = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const entries = await readZipEntries(new Blob([await readFile(await (await download).path())]));
  expect(entries.has("server-import-selections.json")).toBe(true);
  expect([...entries.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(2);
  f.guestPhotoUnavailable = true; f.hiddenStage = null; f.loseStageAt = 0;
  await recovery.locator("[data-resume-photo-upload]").click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.posts.filter(post => post.body.serverImport)).toHaveLength(1);
  expect(f.posts.find(post => post.body.serverImport).operationId).toBe(original.operationId);
  expect(f.posts.find(post => post.body.serverImport).body).toEqual(original.body);
  expect(new Set(f.stagePosts).size).toBe(2); expect(f.stagePosts).toHaveLength(2);
  await reloadApp(page); expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const remove of [false, true])
test(`actual server import pending ${photos ? "photo" : "fileless"} ${remove ? "deletion" : "fields"} keeps causal order after lost ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1", "Requires isolated server import bundle"); test.setTimeout(120000);
  const { f } = await openServerSourceUi(page, context, { photos }); let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  if (photos) f.beforeStageAck = hold; else f.beforeUpdate = body => body.body?.serverImport || body.kind === "list.import" ? hold() : undefined;
  f.loseFormOwner = true;
  try {
    await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
    await expect.poll(() => Boolean(release), { timeout: 30000 }).toBe(true);
    const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, text]) => JSON.parse(text)).filter(row => row.action));
    const root = (await records()).find(row => row.action.body.serverImport), manifest = root.action.body.serverImport;
    const itemId = manifest.ownerTargets.find(owner => owner.entityType === "item" && owner.sourceId === "source").targetId;
    await page.locator('[data-view="items"]').click();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("193"); await submitForm(page, "#saveItemBtn", "#itemWeight");
    await expect(page.locator("#itemDialog")).not.toBeVisible();
    if (remove) {
      await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click(); await page.locator("#itemDeleteForeverBtn").click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn"); await expect(page.locator("#itemDialog")).not.toBeVisible();
    }
    const children = (await records()).filter(row => row.action.body.photoResults?.version === 12);
    expect(children).toHaveLength(remove ? 2 : 1); expect(children.every(row => row.action.body.photoResults.operationId === root.action.operationId)).toBe(true);
    f.beforeStageAck = null; f.beforeUpdate = null; release();
    await expect.poll(() => f.hiddenFormOwner, { timeout: 30000 }).toBe(root.action.operationId);
    f.reloading = true; await page.goto(origin); const recovery = page.locator("#personalSaveRecoveryDialog");
    await expect(recovery).toBeVisible({ timeout: 30000 }); f.reloading = false;
    f.loseFormOwner = false; f.hiddenFormOwner = null;
    await recovery.locator("[data-resume-photo-upload]").click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    await reloadApp(page);
    if (remove) expect(f.payload.items[itemId]).toBeUndefined(); else expect(f.payload.items[itemId].weight).toBe(193);
    expect(f.posts.filter(post => post.body.serverImport)).toHaveLength(1);
    for (const child of children) expect(f.posts.filter(post => post.operationId === child.action.operationId)).toHaveLength(1);
    expect(f.stagePosts).toHaveLength(photos ? 2 : 0); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; f.beforeUpdate = null; release?.(); }
});

test("actual causal share own gate off keeps the edited form and old queue", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS === "1", "Requires own sharing gate off");
  test.setTimeout(100000);
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Сумка выключенной ссылки");
  const item = await createItemInContainer(page, bag, "Вещь выключенной ссылки");
  await synchronize(page, () => Object.values(f.payload.items).some(owner => owner.name === "Вещь выключенной ссылки"));
  const before = f.posts.length, journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")));
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemWeight").fill("347"); await page.locator("#shareItemLinkBtn").click();
  await submitForm(page, "#confirmOkBtn");
  await expect(page.locator("#confirmDialog")).not.toBeVisible(); await expect(page.locator("#itemDialog")).toBeVisible();
  await expect(page.locator("#itemWeight")).toHaveValue("347");
  expect(f.posts).toHaveLength(before);
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")))).toEqual(journal);
  expect(f.errors).toEqual([]);
});

for (const mode of ["snapshot", "live"]) test(`actual causal share confirmed photo ${mode} preserves the exact selected owner`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS !== "1", "Requires isolated sharing bundle");
  test.setTimeout(120000);
  const { f, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "item", photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const photoAction = f.posts.find(post => post.kind === "photos.mutate"), owner = structuredClone(f.payload.items[photoAction.body.entityId]);
  const stages = [...f.stagePosts];
  await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click();
  await page.locator(`#confirmDialog input[name="shareLinkMode"][value="${mode}"]`).check(); await submitForm(page, "#confirmOkBtn");
  await expect(page.locator("#confirmDialog input[readonly]")).toBeVisible({ timeout: 30000 });
  const share = f.posts.find(post => post.body.shareLink); expect(share.body.payload.items[owner.id].photos).toEqual(owner.photos);
  expect(f.receipts.get(share.operationId).result.payload.sharedLink.files).toHaveLength(owner.photos.length);
  expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

test("actual causal share lost ACK resumes the same selected link after reload", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS !== "1", "Requires isolated sharing bundle");
  test.setTimeout(110000);
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Сумка сохранённой ссылки");
  await createItemInContainer(page, bag, "Вещь сохранённой ссылки");
  await synchronize(page, () => Object.values(f.payload.items).some(owner => owner.name === "Вещь сохранённой ссылки"));
  const choose = async () => { await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click();
    await page.locator('#confirmDialog input[name="shareLinkMode"][value="snapshot"]').check(); await submitForm(page, "#confirmOkBtn"); };
  f.loseShare = true; await choose();
  await expect.poll(() => f.hiddenFormOwner).toBeTruthy(); await expect(page.locator("#confirmDialog")).not.toBeVisible();
  const original = structuredClone(f.posts.find(post => post.body.shareLink));
  f.loseShare = false; f.hiddenFormOwner = "";
  await reloadApp(page); await page.locator("#syncBtn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  await choose(); await expect(page.locator("#confirmDialog input[readonly]")).toBeVisible({ timeout: 30000 });
  expect(await page.locator("#confirmDialog input[readonly]").inputValue()).toContain(original.body.shareLink.id);
  expect(f.posts.filter(post => post.body.shareLink)).toEqual([original]); expect(f.errors).toEqual([]);
});

for (const mode of ["snapshot", "live"]) test(`actual causal share pending photo ${mode} resumes its original choice and files`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS !== "1" || process.env.BIKE_PERSONAL_PENDING_FORM !== "1", "Requires isolated sharing and pending form bundle");
  test.setTimeout(120000);
  const { f, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "item", photoEdit: true });
  f.loseFormOwner = true; await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.hiddenFormOwner).toBeTruthy();
  const original = structuredClone(f.posts.find(post => post.kind === "photos.mutate")), stages = [...f.stagePosts];
  const choose = async () => { await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click();
    await page.locator(`#confirmDialog input[name="shareLinkMode"][value="${mode}"]`).check(); await submitForm(page, "#confirmOkBtn"); };
  await choose(); await expect(page.locator("#confirmDialog")).not.toBeVisible();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(value => value.action?.body.shareLink));
  expect(saved).toBeTruthy(); expect(saved.action.body.photoResults.version).toBe(5);
  expect(saved.action.body.photoResults.operationId).toBe(original.operationId);
  f.loseFormOwner = false; f.hiddenFormOwner = "";
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog");
  await recovery.getByRole("button", { name: "Продолжить сохранённую форму", exact: true }).click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  await choose(); await expect(page.locator("#confirmDialog input[readonly]")).toBeVisible({ timeout: 30000 });
  expect(await page.locator("#confirmDialog input[readonly]").inputValue()).toContain(saved.action.body.shareLink.id);
  expect(f.posts.filter(post => post.body.shareLink).map(post => post.operationId)).toEqual([saved.action.operationId]);
  expect(f.posts.filter(post => post.kind === "photos.mutate")).toEqual([original]); expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

test("actual causal share rejected source keeps the queue on cancel and requires a new selection after keep server", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SHARE_LINKS !== "1", "Requires isolated sharing bundle");
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Сумка отклонённой ссылки");
  await createItemInContainer(page, bag, "Вещь отклонённой ссылки");
  await synchronize(page, () => Object.values(f.payload.items).some(owner => owner.name === "Вещь отклонённой ссылки"));
  f.allowConflicts = true; f.beforeUpdate = body => { if (body.body.shareLink) { f.revision++; Object.values(f.payload.items)[0].note = "Изменено на сервере"; } };
  const choose = async () => { await page.locator("#menuBtn").click(); await page.locator("#shareListBtn").click();
    await page.locator('#confirmDialog input[name="shareLinkMode"][value="snapshot"]').check(); await submitForm(page, "#confirmOkBtn"); };
  await choose(); await expect(page.locator("#confirmDialog")).not.toBeVisible(); f.beforeUpdate = null;
  const original = structuredClone(f.posts.find(post => post.body.shareLink)), remote = structuredClone(f.payload);
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")));
  const before = await journal(); await page.locator("#syncBtn").click();
  await expect(page.locator("#confirmDialog")).toContainText("Ссылка не создана"); await page.locator("#confirmCancelBtn").click();
  await expect(page.locator("#confirmDialog")).not.toBeVisible(); expect(await journal()).toEqual(before);
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmDialog")).toContainText("Ссылка не создана");
  await submitForm(page, "#confirmOkBtn");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  expect(f.payload).toEqual(remote); expect(f.posts.filter(post => post.body.shareLink)).toEqual([original]);
  await reloadApp(page); await choose(); await expect(page.locator("#confirmDialog input[readonly]")).toBeVisible({ timeout: 30000 });
  const shares = f.posts.filter(post => post.body.shareLink); expect(shares).toHaveLength(2);
  expect(shares[1].operationId).not.toBe(original.operationId); expect(shares[1].body.payload).toEqual(personalBusinessPayload(remote)); expect(f.errors).toEqual([]);
});

async function setup(page, context, { fresh = false, lose = false, payload = initialPayload(), photoRecovery = false, photoForm = false, photoEdit = false, migration = false, migrationComplete = true,
  guestSource = null, publicSource = null, publicSourceConfig = null, language = "ru", configure = () => {} } = {}) {
  photoForm ||= photoEdit;
  if (migration && migrationComplete) {
    // A previously saved complete legacy list, not an intentionally incomplete
    // fixture requiring unrelated structural/dictionary repair in the UI.
    payload = structuredClone(payload);
    payload.customLocations = [...payload.locations]; payload.customCategories = [...payload.categories];
    payload.collapseDefaultsVersion = 2;
    for (const layout of Object.values(payload.layouts)) {
      layout.arrangement.itemQuantities ||= {};
      layout.arrangement.itemQuantityMigrationVersion = 3;
      Object.assign(layout, { customLocations: [], customCategories: [], locations: [], categories: [] });
    }
  }
  const state = { listId: fresh ? null : "list-a", payload: structuredClone(payload), revision: fresh ? 0 : 1,
    posts: [], receipts: new Map(), lose, unknown: lose, errors: [], stageReceipts: new Map(), cancellationPosts: [], migration, migrationPreviews: [] };
  const activeBundleRoot = process.env.BIKE_RELEASE_BROWSER === "1" ? path.resolve("www/vniipo-help.ru/bike-packing")
    : photoEdit ? path.resolve("test-results/personal-photo-edit-ui-build") : photoForm ? path.resolve("test-results/personal-photo-form-ui-build") : photoRecovery ? photoRecoveryBundleRoot : bundleRoot;
  state.publicSource = publicSource;
  state.publicReads = [];
  state.publicRecords = publicSource ? [...(publicSourceConfig?.others || []), {
    id: "public-shared-layout-template-ui", itemKey: "shared-layout:template-ui", sharedLayoutId: "template-ui", publicTemplateKind: "shared-layout",
    title: "Публичный шаблон", language: "ru", sourceType: "curated-bikepacker", visibility: "public", stateRevision: 7, ownerId: "public-owner",
    ...publicSourceConfig?.record, payload: publicSource }] : [];
  state.photoRevisions = new Map();
  state.stagePosts = [];
  configure(state);
  page.personalFixture = state;
  const record = () => ({ id: state.listId, title: "Личный тест", ownerId: "actor-a", role: "owner", canEdit: true,
    stateRevision: state.revision, updatedAt: `2026-09-06T10:00:${String(state.revision).padStart(2, "0")}.000Z`,
    payload: state.serverMirrors ? { ...structuredClone(state.payload), activeLayoutId: "", packedItems: {} } : state.payload });
  page.on("pageerror", error => {
    // WebKit reports a cancelled injected receipt fetch during reload. Do not
    // confuse this deliberate fixture failure with a JavaScript application error.
    if (state.injectedFailure && /\/list-operations\/.*due to access control checks\./.test(error.message)) return;
    if (test.info().project.name === "mobile-webkit" && state.reloading
      && /\/letters-vniipo\/api\/.*due to access control checks\.$/.test(error.message)) return;
    state.errors.push(error.message);
  });
  await context.addInitScript(language => { localStorage.setItem("bike-packing-language-v1", language); }, language);
  if (guestSource) {
    await context.addInitScript(guestSource => {
      if (sessionStorage.getItem("guest-seeded")) return;
      localStorage.setItem("bike-packing-prototype-state-v1", JSON.stringify(guestSource));
      sessionStorage.setItem("guest-seeded", "true");
    }, guestSource);
  }
  if (photoForm) await context.addInitScript(() => {
    globalThis.formSentFiles = {};
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (options?.body instanceof FormData) {
        const form = options.body, file = form.get("file"), thumb = form.get("thumb");
        const hash = async blob => blob && [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
        globalThis.formSentFiles[form.get("operationId")] = { fileHash: await hash(file), thumbHash: await hash(thumb), size: file.size };
      }
      return original(url, options);
    };
  });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (url.pathname.includes("/letters-vniipo/api/")) {
      const path = url.pathname.split("/letters-vniipo/api")[1];
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data, status = 200;
      if (path === "/auth/me" || path === "/auth/experiment-share-session") {
        if (guestSource && !state.guestChosenSource) {
          // A real sign-in starts from an already loaded guest editor. Bind
          // the handoff to that actual persisted source before returning auth.
          state.guestChosenSource = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1")));
          const candidate = guestLocalLayoutCandidateFromState(state.guestChosenSource, { fallbackName: "Гостевая укладка" });
          const handoff = createGuestLoginHandoff({ candidate, eligibleLayoutIds: candidate.layouts.map(entry => entry.layoutId), email: "personal@example.test", guestSessionId: "guest-sign-in-ui" });
          await page.evaluate(handoff => {
            localStorage.setItem("bike-packing-guest-login-handoff-v2", JSON.stringify(handoff));
            localStorage.setItem("bike-packing-guest-workspace-manifest-v2", JSON.stringify({ version: 2, sessionId: handoff.guestSessionId, layoutIds: handoff.layoutIds, updatedAt: handoff.createdAt }));
          }, handoff);
        }
        data = { ok: true, user: { id: "actor-a", email: "personal@example.test" } };
      }
      else if (path === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (path === "/bike-packing/capabilities") data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, ...(process.env.BIKE_PERSONAL_SERVER_PHOTO_FORMS === "1" ? ["personalCausalServerPhotoFormsV1"] : []), ...(process.env.BIKE_PERSONAL_SERVER_NEW_OWNERS === "1" ? ["personalCausalServerNewOwnerFormsV1"] : []), ...(process.env.BIKE_PERSONAL_SERVER_IMPORT === "1" ? ["personalCausalServerImportV1"] : []), ...(process.env.BIKE_PERSONAL_SHARE_LINKS === "1" ? ["personalCausalShareLinksV1"] : []), ...(process.env.BIKE_PERSONAL_PUBLIC_NEW_OWNERS === "1" ? ["personalCausalPublicNewOwnerFormsV1"] : []), ...(process.env.BIKE_PERSONAL_IMPORT_NEW_OWNERS === "1" ? ["personalCausalImportNewOwnerFormsV1"] : []), ...(process.env.BIKE_PERSONAL_IMPORT_PHOTO_FORMS === "1" ? ["personalCausalImportPhotoFormsV1"] : []), ...(process.env.BIKE_PERSONAL_PUBLIC_PHOTO_FORMS === "1" ? ["personalCausalPublicPhotoFormsV1"] : []), ...(process.env.BIKE_PERSONAL_PUBLIC_ENTITIES === "1" ? ["personalCausalPublicEntitiesV1"] : []), ...(process.env.BIKE_PERSONAL_PUBLIC_IMPORT === "1" ? ["personalCausalPublicImportV1"] : []), ...(process.env.BIKE_PERSONAL_PENDING_PUBLIC === "1" ? ["personalCausalPublicDescendantsV1"] : []), ...(photoEdit && process.env.BIKE_PERSONAL_PENDING_FILES === "1" ? ["personalCausalPhotoFormOwnerResultV1"] : []), ...(photoEdit && process.env.BIKE_PERSONAL_MANUFACTURER === "1" ? ["personalCausalManufacturerPhotoFormV1"] : []), ...(photoEdit && process.env.BIKE_PERSONAL_PENDING_FORM === "1" ? ["personalCausalPhotoFormDescendantsV1"] : []), "personalListCausalOperationsV1", "personalCausalArchiveImportV1", ...(photoForm ? ["personalCausalPhotoFormV1"] : []), ...(photoEdit ? ["personalCausalPhotoContainerFormContextV1", "personalCausalPhotoItemFormContextV1", "personalCausalGuestImportV1", "personalCausalGuestDescendantsV1", "personalCausalArchiveDescendantsV1", "personalCausalArchivePhotoImportV1", "personalCausalPhotoCopyFormV1", "personalCausalPhotoCopyDeletionV1", "personalCausalPhotoCopyBatchV1", "personalCausalPhotoCopyBatchDeletionV1", "personalCausalPhotoTreeCopyV1", "personalCausalPhotoCopyPlacementV1", "personalCausalPhotoHistoryRestoreV1"] : []), ...(migration ? ["personalListInitialMigrationV1"] : []), ...(photoRecovery || photoForm ?
          ["personalCausalPhotoPublicationV1", "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1", "personalListOperationCancellationV1"] : [])] };
      else if (request.method() === "GET" && /^\/bike-packing\/(?:entity-links|lists)\/shared-(?:entity-link|entity-snapshot|snapshot)-[a-f0-9-]+$/.test(path)) {
        const id = path.split("/").at(-1), receipt = [...state.receipts.values()].find(value => value.operation.state === "committed" && value.result.payload.sharedLink?.descriptor.id === id);
        if (state.serverSharedRecord?.id === id) data = { ok: true, [path.includes("/entity-links/") ? "entityLink" : "list"]: structuredClone(state.serverSharedRecord) };
        else if (!receipt) { data = { ok: false, code: "not_found" }; status = 404; }
        else {
          const descriptor = receipt.result.payload.sharedLink.descriptor;
          const payload = personalShareLinkProjection(personalBusinessPayload(descriptor.mode === "snapshot" ? receipt.result.payload.list.payload : state.payload), descriptor, receipt.operation.id);
          const record = { id, listId: id, ownerId: "actor-a", visibility: "shared", sourceType: "user", title: descriptor.title,
            description: descriptor.description, stateRevision: 1, payload, serverCopySource: await preparePersonalServerImportSource({ descriptor, stateRevision: descriptor.mode === "live" ? state.revision : 1 }), updatedAt: "2026-09-10T12:00:00.000Z" };
          data = { ok: true, [path.includes("/entity-links/") ? "entityLink" : "list"]: record, mode: descriptor.mode, scope: descriptor.scope };
        }
      }
      else if (publicSource && path === "/bike-packing/public-templates") data = { ok: true, canonical: true, lists: structuredClone(state.publicRecords) };
      else if (publicSource && path.startsWith("/bike-packing/public-template-payloads/")) {
        const itemKey = decodeURIComponent(path.split("/").at(-1)), source = state.publicRecords.find(record => record.itemKey === itemKey);
        state.publicReads.push(itemKey);
        if (!source) { status = 404; data = { ok: false, code: "not_found" }; }
        else data = { ok: true, publicTemplatePayload: true, canonical: true, itemKey, listId: source.id, stateRevision: source.stateRevision,
          payload: structuredClone(source.payload), record: structuredClone(source) };
      }
      else if (path === "/bike-packing/lists") data = { ok: true, lists: state.listId ? [record()] : [] };
      else if (path === `/bike-packing/lists/${state.listId}/migration`) {
        expect(request.method()).toBe("GET");
        const hash = value => createHash("sha256").update(canonicalListOperationJson(value)).digest("hex");
        data = { ok: true, actorId: "actor-a", environment: "bike-packing-experiment", listId: state.listId,
          migration: { baseStateRevision: state.revision, payload: structuredClone(state.payload), migration: {
            version: 1, legacyPayloadHash: hash(state.payload), projectedPayloadHash: hash(state.payload)
          } } };
        state.migrationPreviews.push(structuredClone(data));
      }
      else if (path === `/bike-packing/lists/${state.listId}` || path === `/bike-packing/lists/${state.listId}/state`) {
        if (state.migration) { status = 409; data = { ok: false, code: "causal_read_migration_required", message: "Initial preparation is required" }; }
        else data = { ok: true, list: record(), state: state.payload };
      }
      else if (path === `/bike-packing/lists/${state.listId}/freshness`) data = { ok: true, ...record(), payload: undefined };
      else if (path === `/bike-packing/lists/${state.listId}/history`) data = { ok: true, records: state.history || [], page: { hasMore: false } };
      else if (path === `/bike-packing/lists/${state.listId}/history/101/restore` && request.method() === "GET") {
        const source = state.history[0], layoutIds = url.searchParams.getAll("layoutId");
        const payload = structuredClone(layoutIds.length ? state.payload : source.payload);
        if (layoutIds.length) for (const id of layoutIds) payload.layouts[id] = structuredClone(source.payload.layouts[id]);
        payload.activeLayoutId ||= "layout-a"; payload.packedItems ||= {};
        const hash = value => createHash("sha256").update(canonicalListOperationJson(value)).digest("hex");
        const photoRestore = url.searchParams.get("photos") === "1" ? personalPhotoHistoryPlan({ listId: state.listId,
          baseStateRevision: state.revision, currentPayload: state.payload, payload, heads: state.historyHeads || [] }).manifest : null;
        data = { ok: true, actorId: "actor-a", environment: "bike-packing-experiment", listId: state.listId,
          restore: { payload, baseStateRevision: state.revision, historyRestore: { version: photoRestore ? 2 : 1, ...(photoRestore ? { photoRestore } : {}), historyId: 101,
            historyPayloadHash: hash(source.payload), payloadHash: hash(payload), layoutIds, targetStateRevision: state.revision } } };
      }
      else if (photoEdit && path === `/bike-packing/lists/${state.listId}/photo-owner-state`) {
        expect(request.method()).toBe("GET");
        const entityType = url.searchParams.get("entityType"), entityId = url.searchParams.get("entityId");
        const owner = state.payload[entityType === "item" ? "items" : "containers"][entityId];
        data = { ok: true, version: 1, readOnly: true, environment: "bike-packing-experiment", actorId: "actor-a", listId: state.listId,
          stateRevision: state.revision, owner: { entityType, entityId, entityRevision: state.revision, payload: structuredClone(owner) },
          photos: (owner.photos || []).map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: state.photoRevisions.get(photo.id) })) };
        state.ownerRead = structuredClone(data);
        if (state.afterOwnerRead) await state.afterOwnerRead(data);
      }
      else if (photoForm && ["items", "containers"].some(collection => path === `/bike-packing/lists/${state.listId}/${collection}`)) {
        const collection = path.split("/").at(-1);
        data = { ok: true, listId: state.listId, stateRevision: state.revision,
          [collection]: Object.values(state.payload[collection]).map(owner => ({ id: owner.id, listId: state.listId, ownerId: "actor-a",
            stateRevision: state.revision, deleted: false, deletedAt: null, payload: structuredClone(owner) })) };
      }
      else if (photoForm && path === `/bike-packing/lists/${state.listId}/photo-assets` && request.method() === "POST") {
        const form = await new Request(request.url(), { method: "POST", headers: request.headers(), body: request.postDataBuffer() }).formData();
        const id = form.get("operationId"), sent = await page.evaluate(id => formSentFiles[id], id);
        expect(sent.size).toBeGreaterThan(0); expect(form.get("expectedActorId")).toBe("actor-a");
        data = { ok: true, operation: { id, state: "committed", environment: "bike-packing-experiment", actorId: "actor-a", listId: state.listId,
          entityType: form.get("entityType"), entityId: form.get("entityId"), photoId: form.get("photoId"), payloadDigest: "a".repeat(64) },
          asset: { id, state: "ready", publication: "not-published", fileHash: sent.fileHash, thumbHash: sent.thumbHash || sent.fileHash,
            storedFileHash: sent.fileHash, storedThumbHash: sent.thumbHash || sent.fileHash } };
        state.stagePosts.push(id); state.stageReceipts.set(id, data);
        if (state.beforeStageAck) await state.beforeStageAck(id);
        if (state.loseStage || state.loseStageAt === state.stagePosts.length) { state.hiddenStage = id; return route.abort("failed"); }
      }
      else if ((photoRecovery || photoForm) && path.startsWith(`/bike-packing/lists/${state.listId}/photo-assets/`)) {
        const id = path.split("/photo-assets/")[1].split("/")[0];
        if (request.method() === "POST") {
          expect(path.endsWith("/cancel")).toBe(true); // No multipart file upload endpoint in this fixture.
          const body = request.postDataJSON();
          expect(request.headers()["content-type"]).toContain("application/json");
          const expected = state.cancellationReceipts?.get(id) || state.cancellationReceipt;
          expect(id).toBe(expected.operation.id);
          expect(body).toEqual({ expectedActorId: "actor-a", environment: "bike-packing-experiment", entityType: expected.operation.entityType,
            entityId: expected.operation.entityId, photoId: expected.operation.photoId,
            fileHash: expected.cancellation.fileHash, thumbHash: expected.cancellation.thumbHash });
          state.cancellationPosts.push({ id, body }); state.stageReceipts.set(id, expected);
        }
        data = (id !== state.hiddenStage && state.stageReceipts.get(id)) || { ok: true, operation: { id, state: "unknown",
          actorId: "actor-a", environment: "bike-packing-experiment", listId: state.listId } };
      }
      else if ((photoRecovery || photoEdit) && /^\/bike-packing\/list-operations\/[^/]+\/cancel$/.test(path) && request.method() === "POST") {
        const body = request.postDataJSON(), id = path.split("/").at(-2);
        (state.ownerCancellationPosts ||= []).push(id);
        const expectedAction = state.cancelPhotoActions?.get(id) || state.cancelPhotoAction;
        expect(id).toBe(expectedAction.operationId); expect(body.operationId).toBe(id);
        expect(body.expectedActorId).toBe("actor-a"); expect(body.environment).toBe("bike-packing-experiment");
        expect(body.listId).toBe(state.listId); expect(body.kind).toBe(expectedAction.kind); expect(body.body).toEqual(expectedAction.body);
        state.posts.push(body);
        const binding = { environment: body.environment, actorId: body.expectedActorId, kind: body.kind, listId: body.listId, body: body.body };
        data = state.receipts.get(id) || { ok: true,
          operation: { id, ...binding, payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex"), state: "rejected" },
          result: { status: 409, payload: { ok: false, code: "operation_cancelled", stateRevision: state.revision,
            cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } } };
        state.receipts.set(id, data);
        if (state.loseCancellation) {
          if (state.hideCancellationReceipt) state.hiddenFormOwner = id;
          return route.abort("failed");
        }
      }
      else if (path === "/bike-packing/list-operations" && request.method() === "POST") {
        const body = request.postDataJSON(); state.posts.push(body);
        const ownerCopy = body.body.copySource || body.body.action === "copy-batch";
        if (ownerCopy && state.beforeCopyDispatch) await state.beforeCopyDispatch(body);
        if (state.dropCopyBeforeCommit && body.kind === "photos.mutate" && ownerCopy) {
          state.injectedFailure = true; return route.abort("failed");
        }
        if (state.dropManufacturerBeforeCommit && body.body.manufacturerSource) { state.injectedFailure = true; return route.abort("failed"); }
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
        const digest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
        const predecessor = body.body.causal?.baseOperationId && state.receipts.get(body.body.causal.baseOperationId);
        if (["list.update", "list.restore", "list.import"].includes(body.kind) && state.beforeUpdate) await state.beforeUpdate(body);
        if (body.kind === "photos.mutate" && state.beforePhotoWrite) await state.beforePhotoWrite(body);
        const base = predecessor?.result.payload.list?.stateRevision ?? body.body.baseStateRevision;
        if (body.kind === "list.create") { expect(state.listId).toBeNull(); expect(body.body.id).toBe(body.listId); }
        else if (!state.allowConflicts) expect(base).toBe(state.revision);
        if (photoEdit && body.kind === "photos.mutate" && body.body.action === "copy-batch") {
          const copiedTree = body.body.copyTree ? personalPhotoTreeCopyLayout(body.body, state.payload) : null;
          const copiedPlacement = body.body.copyPlacement ? personalPhotoCopyPlacementLayout(body.body, state.payload) : null;
          const changes = [], owners = [];
          for (const descriptor of body.body.owners) {
            const owner = personalPhotoCopyOwner(descriptor); Object.assign(owner, descriptor.fields);
            expect(descriptor.copySource.payload).toEqual(state.payload[descriptor.entityType === "item" ? "items" : "containers"][descriptor.copySource.entityId]);
            expect(descriptor.copySource.entityRevision).toBe(state.revision);
            for (const change of body.body.changes.filter(change => change.entityId === owner.id && change.entityType === descriptor.entityType)) {
              expect(change.expectedPhotoIds).toEqual(owner.photos.map(photo => photo.id));
              expect(change.source.photoRevision).toBe(state.photoRevisions.get(change.source.photoId));
              const source = descriptor.copySource.payload.photos[change.index];
              expect(source.id).toBe(change.source.photoId); expect(source.assetId).toBe(change.source.assetId);
              const photo = { ...source, id: change.photoId, photoId: change.photoId, assetId: change.assetId,
                url: `${origin}/photo/${change.photoId}.png`, thumbUrl: `${origin}/thumb/${change.photoId}.png` };
              owner.photos.push(photo); state.photoRevisions.set(photo.id, state.revision + 1);
              changes.push({ index: changes.length, action: "copy", entityType: descriptor.entityType, entityId: owner.id, photoId: photo.id,
                assetId: photo.assetId, photoIds: owner.photos.map(photo => photo.id), photo });
            }
            for (const key of descriptor.entityType === "item" ? ["containerId"] : ["parentId", "childIds", "itemIds", "order"]) delete owner[key];
            owners.push({ entityType: descriptor.entityType, entityId: owner.id });
            state.payload[descriptor.entityType === "item" ? "items" : "containers"][owner.id] = owner;
          }
          if (copiedTree) state.payload.layouts[copiedTree.targetLayoutId] = copiedTree.layout;
          if (copiedPlacement) state.payload.layouts[copiedPlacement.targetLayoutId] = copiedPlacement.layout;
          state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, stateRevision: state.revision, list: structuredClone(record()), photoChanges: changes,
              photoCopyBatch: { version: 1, owners }, ...(copiedPlacement ? { photoCopyPlacement: { version: 1, itemId: copiedPlacement.itemId, targetLayoutId: copiedPlacement.targetLayoutId, targetContainerId: copiedPlacement.targetContainerId } } : {}), ...(copiedTree ? { photoCopyTree: { version: 1, rootId: copiedTree.rootId, targetLayoutId: copiedTree.targetLayoutId } } : {}) } } };
          if (state.afterFormCommit) await state.afterFormCommit(body);
        } else if (photoForm && body.kind === "photos.mutate") {
          expect(body.body.action).toBe("form");
          if (body.body.ownerResult) {
            expect(process.env.BIKE_PERSONAL_PENDING_FILES).toBe("1");
            expect(body.body.baseEntityRevision).toBeNull();
            expect(body.body.ownerResult.operationId).toBe(body.body.causal.baseOperationId);
            expect(predecessor.operation.state).toBe("committed");
            const source = structuredClone(body.body.ownerResult.owner);
            const published = predecessor.result.payload.list.payload[body.body.entityType === "item" ? "items" : "containers"][body.body.entityId];
            if ([4, 5, 7].includes(body.body.ownerResult.version)) {
              expect(process.env[body.body.ownerResult.version === 7 ? "BIKE_PERSONAL_SERVER_NEW_OWNERS" : body.body.ownerResult.version === 5 ? "BIKE_PERSONAL_PUBLIC_NEW_OWNERS" : "BIKE_PERSONAL_IMPORT_NEW_OWNERS"]).toBe("1"); expect(source).toBeNull(); expect(published).toBeUndefined();
              expect(state.payload.items[body.body.entityId]).toBeUndefined(); expect(state.payload.containers[body.body.entityId]).toBeUndefined();
            } else {
              source.photos = source.photos.map(photo => photo.status === "pending" ? published.photos.find(p => p.id === photo.id && p.assetId === photo.assetId) : photo);
              for (const key of ["parentId", "childIds", "itemIds", "order", "containerId", "parentContainerId"]) delete source[key];
              expect(source).toEqual(published);
            }
            expect(body.body.changes.every(change => change.baseEntityRevision === null)).toBe(true);
          }
          const owner = personalPhotoFormOwner(state.payload, body.body), changes = [];
          for (const [index, change] of body.body.changes.entries()) {
            expect(change.expectedPhotoIds).toEqual(owner.photos.map(photo => photo.id));
            if (change.action === "copy") {
              expect(photoEdit).toBe(true); expect(body.body.copySource.entityRevision).toBe(state.revision);
              expect(change.source.photoRevision).toBe(state.photoRevisions.get(change.source.photoId));
              const source = body.body.copySource.payload.photos[index];
              expect(source.id).toBe(change.source.photoId); expect(source.assetId).toBe(change.source.assetId);
              const photo = { ...source, id: change.photoId, photoId: change.photoId, assetId: change.assetId,
                url: `${origin}/photo/${change.photoId}.png`, thumbUrl: `${origin}/thumb/${change.photoId}.png` };
              owner.photos.push(photo); state.photoRevisions.set(photo.id, state.revision + 1);
              changes.push({ index, action: "copy", entityType: change.entityType, entityId: change.entityId, photoId: change.photoId,
                assetId: change.assetId, photoIds: owner.photos.map(photo => photo.id), photo });
              continue;
            }
            if (change.action !== "attach") {
              expect(photoEdit).toBe(true);
              if (change.action === "delete") {
                expect(change.basePhotoRevision).toBe(body.body.ownerResult ? null : state.photoRevisions.get(change.photoId));
                expect(owner.photos.find(photo => photo.id === change.photoId)?.assetId).toBe(change.assetId);
                owner.photos = owner.photos.filter(photo => photo.id !== change.photoId);
              } else {
                expect(change.action).toBe("order");
                owner.photos = change.photoIds.map(id => owner.photos.find(photo => photo.id === id));
              }
              changes.push({ index, action: change.action, entityType: change.entityType, entityId: change.entityId,
                ...(change.action === "delete" ? { photoId: change.photoId, assetId: change.assetId } : {}), photoIds: owner.photos.map(photo => photo.id) });
              continue;
            }
            expect(state.stageReceipts.has(change.assetId)).toBe(true);
            const photo = { id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId: state.listId, status: "synced",
              url: `${origin}/photo/${change.photoId}.png`, thumbUrl: `${origin}/thumb/${change.photoId}.png`,
              fileName: "prepared.png", type: "image/png", size: 68, width: 1, height: 1 };
            owner.photos.splice(change.index, 0, photo);
            state.photoRevisions.set(change.photoId, state.revision + 1);
            changes.push({ index, action: "attach", entityType: change.entityType, entityId: change.entityId, photoId: change.photoId,
              assetId: change.assetId, photoIds: owner.photos.map(photo => photo.id), photo });
          }
          if (body.body.baseEntityRevision === 0 || [4, 5, 7].includes(body.body.ownerResult?.version)) {
            for (const key of body.body.entityType === "item" ? ["containerId"] : ["parentId", "childIds", "itemIds", "order"]) delete owner[key];
          }
          state.payload[body.body.entityType === "item" ? "items" : "containers"][owner.id] = owner;
          if (body.body.formContext) applyPersonalPhotoItemFormContext(state.payload, body.body);
          if (body.body.containerFormContext) applyPersonalPhotoContainerFormContext(state.payload, body.body);
          state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, stateRevision: state.revision, list: structuredClone(record()), photoChanges: changes,
              photoForm: { entityType: body.body.entityType, entityId: owner.id, created: body.body.baseEntityRevision === 0 || [4, 5, 7].includes(body.body.ownerResult?.version),
                ...(body.body.manufacturerSource && !body.body.changes.length ? { manufacturerCatalogSource: structuredClone(owner.manufacturerCatalogSource) } : {}) } } } };
          if (state.afterFormCommit) await state.afterFormCommit(body);
        } else if (photoRecovery && body.kind === "photos.mutate") {
          throw Error("Photo recovery must not dispatch the original photo mutation");
        } else if (predecessor?.operation.state === "rejected" || body.kind !== "list.create" && base !== state.revision) {
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "rejected" },
            result: { status: 409, payload: { ok: false,
              code: predecessor?.operation.state === "rejected" ? "dependency_rejected" : "stale_state_revision", stateRevision: state.revision } } };
        } else {
          if (body.kind === "list.migrate") {
            expect(body.body).toEqual({ ...state.migrationPreviews.at(-1).migration, causal: { dependsOn: [], reads: [] } });
            state.migration = false;
          }
          const archivePhotos = [], guestImport = body.kind === "list.import" && body.body.guestImport?.version === 1,
            publicImport = body.kind === "list.import" && [1, 2].includes(body.body.publicImport?.version),
            serverImport = body.kind === "list.import" && [1, 2].includes(body.body.serverImport?.version);
          if (body.kind === "list.import") {
            if (serverImport || publicImport || guestImport || body.body.archiveImport.version === 2) {
              expect(photoEdit).toBe(true);
              if (serverImport) {
                assertPersonalServerImportBody(body.body, { base: personalBusinessPayload(state.payload), listId: body.listId, operationId: body.operationId, causal: true });
                await assertPersonalServerImportHashes(body.body);
              } else if (publicImport) {
                assertPersonalPublicImportBody(body.body, { base: personalBusinessPayload(state.payload), listId: body.listId, operationId: body.operationId, causal: true });
                await assertPersonalPublicImportHashes(body.body); expect(body.body.publicImport.sourcePayload).toEqual(publicSource);
              } else if (guestImport) {
                assertPersonalGuestImportBody(body.body, { base: personalBusinessPayload(state.payload), listId: body.listId, operationId: body.operationId, causal: true }); await assertPersonalGuestImportHashes(body.body);
              } else { assertPersonalArchivePhotoBody(body.body, { base: state.payload, listId: body.listId, causal: true }); await assertPersonalArchivePhotoHashes(body.body); }
              for (const file of (serverImport ? body.body.serverImport : publicImport ? body.body.publicImport : guestImport ? body.body.guestImport : body.body.archiveImport).files) {
                const stage = state.stageReceipts.get(file.assetId); expect(stage?.asset.state).toBe("ready");
                expect(stage.operation.entityId).toBe(file.entityId); expect(stage.operation.photoId).toBe(file.photoId);
                expect(stage.asset.fileHash).toBe(file.file.hash); expect(stage.asset.thumbHash).toBe(file.thumb?.hash || file.file.hash);
                const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: body.listId, status: "synced",
                  url: `${origin}/photo/${file.photoId}.png`, thumbUrl: `${origin}/thumb/${file.photoId}.png`,
                  fileName: file.file.fileName, type: file.file.type, size: file.file.size, width: 1, height: 1 };
                archivePhotos.push({ entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId,
                  fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, photo });
                state.photoRevisions.set(file.photoId, state.revision + 1);
              }
            } else {
              assertPersonalArchiveImportBody(body.body, { base: state.payload, causal: true }); await assertPersonalArchiveImportHashes(body.body);
            }
          }
          if (body.body.shareLink) {
            expect(process.env.BIKE_PERSONAL_SHARE_LINKS).toBe("1");
            assertPersonalShareLinkBody(body.body, body.operationId, { causal: true });
          }
          const shareSource = body.body.shareLink ? personalBusinessPayload(state.payload) : null;
          state.listId = body.listId; state.payload = body.body.photoResults ? structuredClone(body.body.payload) : body.body.payload;
          if (body.kind === "list.import" && (serverImport || publicImport || guestImport || body.body.archiveImport.version === 2)) {
            state.payload = structuredClone(state.payload);
            for (const file of archivePhotos) {
              const owner = state.payload[file.entityType === "item" ? "items" : "containers"][file.entityId];
              owner.photos = owner.photos.map(photo => photo.id === file.photoId ? file.photo : photo);
            }
          }
          if (body.body.photoResults) {
            const ref = body.body.photoResults;
            const copy = state.receipts.get(ref.operationId);
            expect(copy.operation.state).toBe("committed");
            expect(body.body.causal.dependsOn).toContainEqual({ operationId: ref.operationId, listId: state.listId });
            if ([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(ref.version)) {
              expect(copy.operation.kind).toBe([5, 6, 8, 9, 10, 11, 13, 14].includes(ref.version) ? "photos.mutate" : "list.import"); expect(predecessor.operation.state).toBe("committed");
              for (const collection of ["items", "containers"]) for (const [id, owner] of Object.entries(state.payload[collection])) {
                const previous = predecessor.result.payload.list.payload[collection][id];
                if (owner.photos) owner.photos = owner.photos.map(photo => {
                  if (photo.status !== "pending") return photo;
                  const file = ([6, 8, 9, 10, 11, 13, 14].includes(ref.version) ? copy.result.payload.list.payload[collection][id].photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, entityId: id, photo })) : ref.version === 5 ? copy.result.payload.photoChanges.filter(change => change.action === "attach") : ref.version === 12 ? copy.result.payload.serverPhotos : ref.version === 7 ? copy.result.payload.publicPhotos : ref.version === 4 ? copy.result.payload.guestPhotos : copy.result.payload.archivePhotos).find(file => file.photoId === photo.id);
                  expect(file?.entityId).toBe(id); expect(file?.assetId).toBe(photo.assetId);
                  expect(previous?.photos).toContainEqual(file.photo); return structuredClone(file.photo);
                });
                expect(owner.photos || []).toEqual(previous?.photos || []);
              }
            } else for (const owner of ref.version === 2 ? ref.owners : [ref]) {
              const collection = owner.entityType === "item" ? "items" : "containers";
              if (state.payload[collection][owner.entityId]) state.payload[collection][owner.entityId].photos = structuredClone(copy.result.payload.list.payload[collection][owner.entityId].photos);
            }
          }
          if (shareSource) expect(personalBusinessPayload(state.payload)).toEqual(shareSource);
          state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, stateRevision: state.revision, list: structuredClone(record()), ...(body.kind === "list.migrate" ? { migration: body.body.migration } : {}),
              ...(serverImport ? { serverImport: personalServerImportReceipt(body.body.serverImport), serverPhotos: archivePhotos } : publicImport ? { stateRevision: state.revision, publicImport: personalPublicImportReceipt(body.body.publicImport), publicPhotos: archivePhotos } : guestImport ? { stateRevision: state.revision, guestImport: personalGuestImportReceipt(body.body.guestImport), guestPhotos: archivePhotos } : body.kind === "list.import" ? { stateRevision: state.revision,
                archiveImport: (body.body.archiveImport.version === 2 ? personalArchivePhotoReceipt : personalArchiveImportReceipt)(body.body.archiveImport),
                ...(body.body.archiveImport.version === 2 ? { archivePhotos } : {}) } : {}),
              ...(body.kind === "list.restore" && body.body.historyRestore.version === 2 ? { restoreHistoryId: body.body.historyRestore.historyId,
                restoredLayoutIds: body.body.historyRestore.layoutIds, stateRevision: state.revision, photoHistoryRestore: body.body.historyRestore.photoRestore } : {}) } } };
        }
        if (data.operation.state === "committed" && [6, 7].includes(body.body.ownerResult?.version)) {
          expect(process.env.BIKE_PERSONAL_SERVER_PHOTO_FORMS).toBe("1");
          const ref = body.body.ownerResult, root = state.receipts.get(ref.serverOperationId);
          expect(body.body.causal.dependsOn).toContainEqual({ operationId: ref.serverOperationId, listId: state.listId });
          expect(root.result.payload.serverImport.operationId).toBe(ref.serverOperationId);
          Object.assign(data.result.payload, { serverPhotoForm: personalServerPhotoFormSummary(body.body, state.listId), serverPhotoFormSourceOperationId: body.operationId });
        }
        if (data.operation.state === "committed" && [12, 13, 14].includes(body.body.photoResults?.version) && process.env.BIKE_PERSONAL_SERVER_PHOTO_FORMS === "1") {
          const ref = body.body.photoResults, source = state.receipts.get(ref.operationId).result.payload;
          Object.assign(data.result.payload, { serverPhotoFormSourceOperationId: ref.operationId, serverPhotoForm: { version: 1,
            serverOperationId: ref.version === 12 ? ref.operationId : source.serverPhotoForm.serverOperationId,
            pendingPhotos: personalPublicPendingPhotoInventory(body.body.payload, state.listId) } });
        }
        if (data.operation.state === "committed" && [2, 5].includes(body.body.ownerResult?.version)) {
          expect(process.env.BIKE_PERSONAL_PUBLIC_PHOTO_FORMS).toBe("1");
          const ref = body.body.ownerResult;
          expect(body.body.causal.dependsOn).toContainEqual({ operationId: ref.publicOperationId, listId: state.listId });
          const root = state.receipts.get(ref.publicOperationId); expect(root.result.payload.publicImport.operationId).toBe(ref.publicOperationId);
          Object.assign(data.result.payload, { publicPhotoForm: personalPublicPhotoFormSummary(body.body, state.listId), publicPhotoFormSourceOperationId: body.operationId });
        }
        if (data.operation.state === "committed" && [7, 8, 11].includes(body.body.photoResults?.version) && process.env.BIKE_PERSONAL_PUBLIC_PHOTO_FORMS === "1") {
          const ref = body.body.photoResults, source = state.receipts.get(ref.operationId).result.payload;
          Object.assign(data.result.payload, { publicPhotoFormSourceOperationId: ref.operationId, publicPhotoForm: { version: 1,
            publicOperationId: ref.version === 7 ? ref.operationId : source.publicPhotoForm.publicOperationId,
            pendingPhotos: personalPublicPendingPhotoInventory(body.body.payload, state.listId) } });
        }
        if (data.operation.state === "committed" && [3, 4].includes(body.body.ownerResult?.version)) {
          expect(process.env.BIKE_PERSONAL_IMPORT_PHOTO_FORMS).toBe("1");
          const ref = body.body.ownerResult, root = state.receipts.get(ref.importOperationId);
          expect(body.body.causal.dependsOn).toContainEqual({ operationId: ref.importOperationId, listId: state.listId });
          expect(root.result.payload[ref.importKind === "guest" ? "guestImport" : "archiveImport"].version).toBe(ref.importKind === "guest" ? 1 : 2);
          Object.assign(data.result.payload, { importPhotoForm: personalImportPhotoFormSummary(body.body, state.listId), importPhotoFormSourceOperationId: body.operationId });
        }
        if (data.operation.state === "committed" && [3, 4, 9, 10].includes(body.body.photoResults?.version) && process.env.BIKE_PERSONAL_IMPORT_PHOTO_FORMS === "1") {
          const ref = body.body.photoResults, source = state.receipts.get(ref.operationId).result.payload;
          Object.assign(data.result.payload, { importPhotoFormSourceOperationId: ref.operationId, importPhotoForm: { version: 1,
            importOperationId: [9, 10].includes(ref.version) ? source.importPhotoForm.importOperationId : ref.operationId,
            importKind: [9, 10].includes(ref.version) ? source.importPhotoForm.importKind : ref.version === 4 ? "guest" : "archive",
            pendingPhotos: personalPublicPendingPhotoInventory(body.body.payload, state.listId) } });
        }
        if (data.operation.state === "committed" && body.body.shareLink) data.result.payload.sharedLink = {
          version: 1, descriptor: structuredClone(body.body.shareLink), sourceListId: state.listId, sourceStateRevision: state.revision - 1,
          files: personalSharePhotoInventory(personalShareLinkProjection(personalBusinessPayload(state.payload), body.body.shareLink, body.operationId))
            .map(file => ({ ...file, fileHash: "a".repeat(64), thumbHash: "b".repeat(64) })) };
        state.receipts.set(body.operationId, data);
        if (state.loseShare && body.body.shareLink) { state.hiddenFormOwner = body.operationId; state.injectedFailure = true; return route.abort("failed"); }
        if (state.loseFormOwner && (body.kind === "photos.mutate" && ["form", "copy-batch"].includes(body.body.action) || body.kind === "list.import" && ([1, 2].includes(body.body.serverImport?.version) || [1, 2].includes(body.body.publicImport?.version) || body.body.guestImport?.version === 1 || body.body.archiveImport?.version === 2))) {
          state.hiddenFormOwner = body.operationId; state.injectedFailure = true;
          return route.abort("failed");
        }
        if (state.lose) { state.injectedFailure = true; return route.abort("failed"); }
      } else if (path.startsWith("/bike-packing/list-operations/")) {
        data = state.unknown || path.split("/").at(-1) === state.hiddenFormOwner ? { ok: true, operation: { state: "unknown" } }
          : state.receipts.get(path.split("/").at(-1)) || { ok: true, operation: { id: path.split("/").at(-1), state: "unknown" } };
      } else if (request.method() !== "GET") throw Error(`Unexpected legacy write: ${request.method()} ${path}`);
      else { data = { ok: false, code: "fixture_not_found" }; status = 404; }
      return route.fulfill({ status, headers, json: data || { ok: false } });
    }
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith("/guest-photo/")) return state.guestPhotoUnavailable ? route.fulfill({ status: 404, body: "Original source is no longer available" }) : route.fulfill({ contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") });
    const target = path.resolve(activeBundleRoot, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
    if (!target.startsWith(activeBundleRoot + path.sep)) throw Error("Fixture path escaped its build directory");
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
      ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
    try { return await route.fulfill({ body: await readFile(target), contentType: mime[path.extname(target)] || "application/octet-stream" }); }
    catch (error) { if (error.code === "ENOENT") return route.fulfill({ status: 404, body: "Not in isolated fixture" }); throw error; }
  });
  await page.goto(origin);
  if (migration && migrationComplete) await expect(page.locator("#confirmDialog")).toBeVisible({ timeout: 30000 });
  else await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  if (!fresh && !migration && !guestSource) {
    await expect(page.locator("#layoutSelect option").filter({ hasText: "Личный тест" })).toBeAttached({ timeout: 20000 });
    await page.locator("#layoutSelect").selectOption("layout-a");
  }
  return state;
}

test("initial legacy list preparation requires an explicit real dialog and survives lost ACK without duplicate migration", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { migration: true, lose: true });
  const dialog = page.locator("#confirmDialog");
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText("Подготовить сохранённый список");
  expect(f.migrationPreviews.length).toBe(1); expect(f.posts).toHaveLength(0);
  await dialog.getByRole("button", { name: "Подготовить список", exact: true }).click();
  await expect.poll(() => f.posts.length).toBe(1); expect(f.posts[0].kind).toBe("list.migrate");
  await expect.poll(() => f.injectedFailure).toBe(true);
  const original = structuredClone(f.posts[0]);
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await synchronize(page, () => !f.migration);
  expect(f.posts).toEqual([original]); expect(f.revision).toBe(2);
  await createRootContainer(page, "После подготовки");
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "После подготовки"));
  expect(f.posts.filter(post => post.kind === "list.migrate")).toEqual([original]);
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.migration).toBeUndefined(); expect(f.errors).toEqual([]);
});

test("declining initial legacy list preparation leaves every server record and local action untouched", async ({ page, context }) => {
  const f = await setup(page, context, { migration: true }), before = structuredClone(f.payload);
  const dialog = page.locator("#confirmDialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Позже", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(f.posts).toHaveLength(0); expect(f.revision).toBe(1); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:")))).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("initial legacy list preparation never rebases a rejected frozen source during reload or manual sync", async ({ page, context }) => {
  const f = await setup(page, context, { migration: true });
  f.allowConflicts = true; f.revision++; f.payload.layouts["layout-a"].name = "Изменено на сервере";
  const current = structuredClone(f.payload);
  await page.locator("#confirmDialog").getByRole("button", { name: "Подготовить список", exact: true }).click();
  await expect.poll(() => f.posts.length).toBe(1);
  const original = structuredClone(f.posts[0]);
  expect(f.receipts.get(original.operationId).operation.state).toBe("rejected");
  await reloadApp(page); await page.locator("#syncBtn").click();
  await expect(page.locator("body")).toContainText("Подготовка старого списка отклонена");
  expect(f.posts).toEqual([original]); expect(f.payload).toEqual(current); expect(f.revision).toBe(2); expect(f.errors).toEqual([]);
});

test("initial legacy list preparation quota retains the candidate without changing the displayed or server data", async ({ page, context }) => {
  const f = await setup(page, context, { migration: true }), before = structuredClone(f.payload);
  const mirror = await page.evaluate(() => localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmDialog").getByRole("button", { name: "Подготовить список", exact: true }).click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  expect(f.posts).toHaveLength(0); expect(f.revision).toBe(1); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a"))).toBe(mirror);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:")))).toEqual([]);
});

test("initial legacy list preparation refuses unrelated structural repairs before confirmation and before any write", async ({ page, context }) => {
  const f = await setup(page, context, { migration: true, migrationComplete: false }), before = structuredClone(f.payload);
  await expect(page.locator("#confirmDialog")).not.toBeVisible();
  await expect(page.locator("body")).toContainText("требует проверки структуры");
  expect(f.posts).toHaveLength(0); expect(f.payload).toEqual(before); expect(f.revision).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:")))).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const nestedTarget of [false, true]) for (const outcome of photos ? ["lost ACK", "quota", "cancel"] : ["lost ACK", "quota"]) test(`personal item destination copy ${photos ? "with photos" : "without photos"} ${nestedTarget ? "nested bag" : "root bag"} across ${outcome}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(), targetLayoutId = "layout-b";
  payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Укладка назначения" };
  const f = await setup(page, context, { payload, photoEdit: photos }), bag = await createRootContainer(page, "Исходная сумка вещи");
  await createItemInContainer(page, bag, "Копируемая вещь", { weight: "123" });
  await page.locator("#layoutSelect").selectOption("layout-b");
  const targetRoot = await createRootContainer(page, "Сумка назначения");
  if (nestedTarget) {
    await targetRoot.locator("[data-add-to-container]").click(); await page.locator("#newSubcontainerName").fill("Карман назначения");
    await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName"); await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  }
  await synchronize(page, () => Object.keys(f.payload.containers).length === (nestedTarget ? 3 : 2));
  const sourceId = Object.keys(f.payload.items)[0], targetContainerId = Object.values(f.payload.containers).find(owner => owner.name === (nestedTarget ? "Карман назначения" : "Сумка назначения")).id;
  if (photos) { addConfirmedTreePhotos(f, [["items", sourceId]]); await reloadApp(page); }
  const openPicker = async () => {
    await page.locator("#layoutSelect").selectOption("layout-a"); await page.locator('[data-view="packing"]').click();
    await page.locator(`#packingView [data-item-id="${sourceId}"] .item-title-hitarea`).click();
    await page.locator("#itemCopyToContainerBtn").click(); await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerLayoutSelect").selectOption(targetLayoutId);
    await page.locator(`#containerPickerBoard [data-pick-container="${targetContainerId}"]`).click();
  };
  {
    await openPicker(); await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
    await synchronize(page, () => f.payload.layouts[targetLayoutId].arrangement.items[sourceId] === targetContainerId);
    expect(Object.keys(f.payload.items)).toHaveLength(1);
  }
  await openPicker(); await expect(page.locator("#confirmDialog")).toContainText("Создать отдельную копию");
  const original = structuredClone(f.payload), before = f.posts.length, activeChoice = await page.locator("#layoutSelect").inputValue();
  const journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Item copy quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else if (photos) { f.loseFormOwner = outcome === "lost ACK"; f.dropCopyBeforeCommit = outcome === "cancel"; }
  else { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  await submitForm(page, "#confirmOkBtn");
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft, newIds = Object.keys(draft.items).filter(id => !original.items[id]);
    expect(newIds).toHaveLength(1); expect(newIds[0]).toMatch(/^item-[0-9a-f-]{36}$/);
    expect(draft.layouts[targetLayoutId].arrangement.items[newIds[0]]).toBe(targetContainerId);
    expect(draft.items[newIds[0]].photos.every(photo => photo.status === "pending")).toBe(true);
    expect(personalBusinessPayload(draft).items[sourceId]).toEqual(original.items[sourceId]);
    expect(recovery.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(journal);
    expect(await page.locator("#layoutSelect").inputValue()).toBe(activeChoice);
    expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(original);
  } else {
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.posts).toHaveLength(before + 1); const action = structuredClone(f.posts.at(-1));
    const copyId = photos ? action.body.owners[0].entityId : action.body.userItemCopyPlacement.targetId;
    if (photos) {
      expect(action.body.copyPlacement.targetLayout).toEqual(original.layouts[targetLayoutId]);
      expect(action.body.copyPlacement.targetContainerId).toBe(targetContainerId);
      expect(action.body.owners[0].copySource.payload).toEqual(original.items[sourceId]);
      if (outcome === "cancel") {
        f.cancelPhotoAction = action; await reloadApp(page, { recovery: true });
        const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
        await expect(cancel).toBeVisible(); f.loseCancellation = true; f.hideCancellationReceipt = true;
        await cancel.click(); await expect(cancel).toBeEnabled(); expect(f.payload).toEqual(original);
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
        await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
        await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
        await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
        await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); expect(f.payload).toEqual(original);
      } else {
        await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
        await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(before + 1);
        f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
        await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
      }
    } else {
      expect(action.body.payload.items[sourceId]).toEqual(original.items[sourceId]);
      f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
      await synchronize(page, () => Object.keys(f.payload.items).length === 2);
    }
    if (outcome !== "cancel") {
      expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(action);
      expect(f.payload.items[sourceId]).toEqual(original.items[sourceId]); expect(f.payload.items[copyId].weight).toBe(123);
      expect(f.payload.items[copyId].photos).toHaveLength(photos ? 1 : 0);
      expect(f.payload.layouts[targetLayoutId].arrangement.items[copyId]).toBe(targetContainerId);
      expect(f.payload.layouts[targetLayoutId].arrangement.packedItems[copyId]).toBeUndefined();
      await page.locator("#layoutSelect").selectOption(targetLayoutId);
      await expect(page.locator(`#packingView [data-item-id="${copyId}"]`)).toBeVisible();
    }
  }
  expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const mode of ["copy", "empty"]) for (const outcome of ["lost ACK", "quota"]) test(`personal whole layout ${mode} ${photos ? "with photos" : "without photos"} retains one selected layout across ${outcome}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context, { photoEdit: photos }), bag = await createRootContainer(page, "Сумка укладки");
  await createItemInContainer(page, bag, "Вещь укладки");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], itemId = Object.keys(f.payload.items)[0];
  if (photos) { addConfirmedTreePhotos(f, [["containers", rootId], ["items", itemId]]); await reloadApp(page); }
  const original = structuredClone(f.payload), before = f.posts.length;
  const journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  await page.locator("#newLayoutBtn").click(); await page.locator("#layoutCreateMode").selectOption(mode);
  if (mode === "copy") await page.locator("#layoutCopyFrom").selectOption("layout-a");
  await page.locator("#layoutName").fill("Сохранённая укладка");
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Layout quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  await submitForm(page, "#saveLayoutBtn", "#layoutName");
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
    const ids = Object.keys(draft.layouts).filter(id => !original.layouts[id]); expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^layout-[0-9a-f-]{36}$/); expect(draft.layouts[ids[0]].name).toBe("Сохранённая укладка");
    expect(draft.layouts[ids[0]].arrangement.items).toEqual(mode === "copy" ? original.layouts["layout-a"].arrangement.items : {});
    expect(recovery.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(journal);
    const draftBusiness = personalBusinessPayload(draft);
    expect(draftBusiness.items).toEqual(original.items); expect(draftBusiness.containers).toEqual(original.containers);
    expect(await page.locator("#layoutSelect").inputValue()).toBe("layout-a");
    expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(original);
  } else {
    await expect(page.locator("#layoutDialog")).not.toBeVisible();
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.posts).toHaveLength(before + 1); const action = structuredClone(f.posts.at(-1)), targetId = action.body.userLayoutCopy.targetLayoutId;
    expect(action.body.userLayoutCopy).toEqual({ type: "layout-copy", version: 1, sourceLayoutId: mode === "copy" ? "layout-a" : "", targetLayoutId: targetId });
    expect(targetId).toMatch(/^layout-[0-9a-f-]{36}$/);
    expect(action.body.payload.items).toEqual(original.items); expect(action.body.payload.containers).toEqual(original.containers);
    expect(action.body.payload.layouts[targetId].arrangement.items).toEqual(mode === "copy" ? original.layouts["layout-a"].arrangement.items : {});
    f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
    await synchronize(page, () => Object.keys(f.payload.layouts).length === 2);
    expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(action);
    const savedCopy = structuredClone(f.payload.layouts[targetId]);
    await page.locator("#layoutSelect").selectOption("layout-a"); await confirmActiveLayoutDeletion(page);
    await page.locator("#confirmOkBtn").click(); await synchronize(page, () => !f.payload.layouts["layout-a"]);
    expect(f.payload.layouts[targetId]).toEqual(savedCopy); expect(f.payload.items).toEqual(original.items); expect(f.payload.containers).toEqual(original.containers);
    expect(f.posts.filter(post => post.body.userLayoutCopy)).toEqual([action]);
    await reloadApp(page); expect(await page.locator("#layoutSelect").inputValue()).toBe(targetId);
  }
  expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const withContents of [false, true]) for (const outcome of photos ? ["lost ACK", "quota", "cancel"] : ["lost ACK"]) test(`personal ${photos ? "photo " : ""}tree picker freezes ${withContents ? "contents" : "empty bag"} copy and placement as one action across ${outcome}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(); payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Цель копии" };
  // This destination represents a previously saved complete layout. Otherwise
  // opening it repairs a legacy version field unrelated to the chosen copy.
  Object.assign(payload.layouts["layout-b"].arrangement, { itemQuantities: {}, itemQuantityMigrationVersion: 3 });
  const f = await setup(page, context, { payload, photoEdit: photos }), bag = await createRootContainer(page, "Сумка ветки");
  let itemTarget = bag;
  if (withContents) {
    await bag.locator("[data-add-to-container]").click();
    await page.locator("#newSubcontainerName").fill("Карман ветки");
    await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
    await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
    itemTarget = bag.locator("[data-subcontainer-id]").filter({ hasText: "Карман ветки" });
  }
  await createItemInContainer(page, itemTarget, "Насос ветки", { weight: "123" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.values(f.payload.containers).find(record => record.name === "Сумка ветки").id, itemId = Object.keys(f.payload.items)[0];
  if (photos) { addConfirmedTreePhotos(f, [["containers", rootId], ["items", itemId]]); await reloadApp(page); }
  const sourceParentId = f.payload.layouts["layout-a"].arrangement.items[itemId];
  const openPicker = async () => {
    await page.locator("#layoutSelect").selectOption("layout-a");
    if (withContents) { await page.locator('[data-view="packing"]').click(); await bag.getByText("Сумка ветки", { exact: true }).click(); }
    else {
      await page.locator('[data-view="bags"]').click();
      await page.locator(`#bagsView [data-root-card="${rootId}"] [data-root-title]`).click();
    }
    await expect(page.locator("#rootContainerDialog")).toBeVisible();
    await page.locator("#rootContainerCopyToContainerBtn").click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-b");
  };
  await openPicker();
  await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.layouts["layout-b"].arrangement.rootContainerIds.includes(rootId));
  const before = f.posts.length;
  await openPicker();
  await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  await expect(page.locator("#confirmDialog")).toContainText("Создать отдельные копии");
  expect(f.posts.length).toBe(before);
  if (photos) {
    const server = structuredClone(f.payload), journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
    if (outcome === "quota") await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Tree copy quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    f.loseFormOwner = outcome === "lost ACK"; f.dropCopyBeforeCommit = outcome === "cancel";
    await submitForm(page, "#confirmOkBtn");
    if (outcome === "quota") {
      await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
      const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
      const newIds = Object.keys(draft.containers).filter(id => !server.containers[id]);
      expect(newIds).toHaveLength(withContents ? 2 : 1);
      expect(newIds.some(id => draft.layouts["layout-b"].arrangement.rootContainerIds.includes(id))).toBe(true);
      expect(Object.keys(draft.items)).toHaveLength(withContents ? 2 : 1);
      expect(Object.values(draft.containers).filter(owner => newIds.includes(owner.id)).flatMap(owner => owner.photos).every(photo => photo.status === "pending")).toBe(true);
      expect(recovery.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(journal);
      expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(server);
    } else {
      await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
      expect(f.posts).toHaveLength(before + 1); const action = structuredClone(f.posts.at(-1));
      expect(action.kind).toBe("photos.mutate"); expect(action.body.action).toBe("copy-batch");
      expect(action.body.copyTree.includeContents).toBe(withContents);
      expect(action.body.owners).toHaveLength(withContents ? 3 : 1);
      const root = action.body.owners.find(owner => owner.copySource.entityId === rootId).entityId;
      if (outcome === "cancel") {
        f.cancelPhotoAction = action; await reloadApp(page, { recovery: true });
        const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
        await expect(cancel).toBeVisible(); f.loseCancellation = true; f.hideCancellationReceipt = true;
        await cancel.click(); await expect(cancel).toBeEnabled(); expect(f.payload).toEqual(server);
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
        await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
        await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
        expect((await downloadRecovery(page)).journalEntries.length).toBeGreaterThan(0);
        await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
        await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); expect(f.payload).toEqual(server);
      } else {
        await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
        await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(before + 1);
        f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
        await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
        expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(action);
        expect(f.payload.layouts["layout-b"].arrangement.rootContainerIds).toEqual([rootId, root]);
        expect(f.payload.layouts["layout-a"]).toEqual(server.layouts["layout-a"]);
        for (const owner of action.body.owners) {
          const collection = owner.entityType === "item" ? "items" : "containers";
          expect(f.payload[collection][owner.copySource.entityId]).toEqual(server[collection][owner.copySource.entityId]);
          expect(f.payload[collection][owner.entityId].photos.map(photo => photo.id)).toEqual(action.body.changes.filter(change => change.entityId === owner.entityId).map(change => change.photoId));
        }
      }
    }
    expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]); return;
  }
  f.lose = true; f.beforeUpdate = () => { f.unknown = true; };
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1);
  const original = structuredClone(f.posts.at(-1)), intent = original.body.userContainerTree;
  expect(intent.mode).toBe("copy"); expect(intent.rootId).toBe(rootId); expect(intent.targetLayoutId).toBe("layout-b");
  expect(intent.containers).toHaveLength(withContents ? 2 : 1); expect(intent.items).toHaveLength(withContents ? 1 : 0);
  const copyId = intent.containers.find(row => row.sourceId === rootId).targetId; expect(copyId).toMatch(/^container-[0-9a-f-]{36}$/);
  expect(f.payload.layouts["layout-b"].arrangement.rootContainerIds).toEqual([rootId, copyId]);
  expect(f.payload.layouts["layout-a"].arrangement.items[itemId]).toBe(sourceParentId);
  if (withContents) {
    const copiedParentId = intent.containers.find(row => row.sourceId === sourceParentId).targetId;
    expect(f.payload.layouts["layout-b"].arrangement.items[intent.items[0].targetId]).toBe(copiedParentId);
    expect(f.payload.layouts["layout-b"].arrangement.containers[copiedParentId].parentId).toBe(copyId);
  }
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => Object.keys(f.payload.containers).length === (withContents ? 4 : 2));
  await page.locator("#layoutSelect").selectOption("layout-b");
  expect(f.posts.at(-1).body.payload).toEqual(original.body.payload);
  expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(original);
  await expect(page.locator(`#packingView [data-root-container-id="${copyId}"]`)).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("personal tree picker quota preserves the complete copy draft and original journal with no partial send", async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(); payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Цель копии" };
  const f = await setup(page, context, { payload }), bag = await createRootContainer(page, "Сумка без места");
  await createItemInContainer(page, bag, "Вещь без места");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], itemId = Object.keys(f.payload.items)[0];
  const pick = async () => {
    await page.locator("#layoutSelect").selectOption("layout-a");
    await bag.getByText("Сумка без места", { exact: true }).click();
    await page.locator("#rootContainerCopyToContainerBtn").click();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-b");
    await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  };
  await pick(); await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.layouts["layout-b"].arrangement.rootContainerIds.includes(rootId));
  await pick(); await expect(page.locator("#confirmDialog")).toContainText("Создать отдельные копии");
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(Object.keys(draft.containers)).toHaveLength(2); expect(Object.keys(draft.items)).toHaveLength(2);
  const copiedRootId = Object.keys(draft.containers).find(id => id !== rootId), copiedItemId = Object.keys(draft.items).find(id => id !== itemId);
  expect(draft.layouts["layout-b"].arrangement.items[copiedItemId]).toBe(copiedRootId);
  expect(draft.layouts["layout-a"].arrangement.items[itemId]).toBe(rootId);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts).toHaveLength(postsBefore); expect(Object.keys(f.payload.containers)).toEqual([rootId]); expect(f.errors).toEqual([]);
});

function addConfirmedTreePhotos(f, owners) {
  for (const [collection, id] of owners) {
    const photoId = randomUUID();
    f.payload[collection][id].photos = [{ id: photoId, photoId, assetId: randomUUID(), listId: f.listId, status: "synced",
      url: `/confirmed-tree/${photoId}`, thumbUrl: `/confirmed-tree/${photoId}/thumb`, fileName: "tree.png", type: "image/png", size: 10, width: 2, height: 2 }];
    f.photoRevisions.set(photoId, f.revision + 1);
  }
  f.revision++;
}

for (const photos of [false, true]) for (const quota of [false, true]) test(`personal ${photos ? "photo " : ""}tree picker missing-only retains exact additions and existing records (${quota ? "quota" : "lost ACK"})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(); payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Цель дополнения" };
  const f = await setup(page, context, { payload, photoEdit: photos }), bag = await createRootContainer(page, "Сумка дополнения");
  await createItemInContainer(page, bag, "Уже размещённая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], originalItemId = Object.keys(f.payload.items)[0];
  if (photos) { addConfirmedTreePhotos(f, [["containers", rootId], ["items", originalItemId]]); await reloadApp(page); }
  const pick = async () => {
    await page.locator("#layoutSelect").selectOption("layout-a");
    await bag.getByText("Сумка дополнения", { exact: true }).click();
    await page.locator("#rootContainerCopyToContainerBtn").click();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-b");
    await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  };
  await pick(); await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.layouts["layout-b"].arrangement.items[originalItemId] === rootId);
  await page.locator("#layoutSelect").selectOption("layout-a");
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#newSubcontainerName").fill("Недостающий карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  await createItemInContainer(page, bag.locator("[data-subcontainer-id]").filter({ hasText: "Недостающий карман" }), "Недостающая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  if (photos) {
    addConfirmedTreePhotos(f, [["containers", Object.keys(f.payload.containers).find(id => id !== rootId)],
      ["items", Object.keys(f.payload.items).find(id => id !== originalItemId)]]); await reloadApp(page);
  }
  const source = structuredClone(f.payload), pouchId = Object.keys(source.containers).find(id => id !== rootId), itemId = Object.keys(source.items).find(id => id !== originalItemId);
  expect(source.layouts["layout-b"].arrangement.containers[pouchId]).toBeUndefined();
  await pick(); await expect(page.locator("#confirmAlternateBtn")).toHaveText("Только недостающие");
  const before = f.posts.length, journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  if (quota) await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  await page.locator("#confirmAlternateBtn").click();
  if (quota) {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
    expect(Object.keys(draft.items).sort()).toEqual(Object.keys(source.items).sort());
    expect(Object.keys(draft.containers).sort()).toEqual(Object.keys(source.containers).sort());
    expect(draft.layouts["layout-b"].arrangement.items[itemId]).toBe(pouchId);
    expect(draft.layouts["layout-b"].arrangement.items[originalItemId]).toBe(rootId);
    if (photos) for (const collection of ["items", "containers"]) for (const id of Object.keys(source[collection]))
      expect(draft[collection][id].photos).toEqual(source[collection][id].photos);
    expect(recovery.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(journal);
    expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(source);
  } else {
    await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.posts).toHaveLength(before + 1);
    const original = structuredClone(f.posts.at(-1)), intent = original.body.userContainerTree;
    expect(intent.mode).toBe("missing"); expect(intent.additions).toEqual({ containers: [{ id: pouchId, parentId: rootId }], items: [{ id: itemId, parentId: pouchId }] });
    expect(f.payload.items).toEqual(source.items); expect(f.payload.containers).toEqual(source.containers);
    expect(f.payload.layouts["layout-a"]).toEqual(source.layouts["layout-a"]);
    expect(f.payload.layouts["layout-b"].arrangement.items[itemId]).toBe(pouchId);
    f.lose = false; f.unknown = false; f.beforeUpdate = null;
    await reloadApp(page); await synchronize(page, () => f.payload.layouts["layout-b"].arrangement.items[itemId] === pouchId);
    expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(original);
  }
  expect(f.errors).toEqual([]);
  if (photos) expect(f.stagePosts).toHaveLength(0);
});

for (const photos of [false, true]) for (const outcome of photos ? ["lost ACK", "quota"] : ["success"]) test(`personal ${photos ? "photo " : ""}tree picker links existing records to another layout without copying their IDs (${outcome})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context, { photoEdit: photos }), bag = await createRootContainer(page, "Сумка связи");
  await createItemInContainer(page, bag, "Вещь связи");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], itemId = Object.keys(f.payload.items)[0];
  await page.locator("#newLayoutBtn").click(); await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Цель связи"); await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await synchronize(page, () => Object.keys(f.payload.layouts).length === 2);
  if (photos) { addConfirmedTreePhotos(f, [["containers", rootId], ["items", itemId]]); await reloadApp(page); }
  const targetId = Object.keys(f.payload.layouts).find(id => id !== "layout-a");
  await page.locator("#layoutSelect").selectOption("layout-a");
  await page.locator(`#packingView [data-root-container-id="${rootId}"]`).getByText("Сумка связи", { exact: true }).click();
  await page.locator("#rootContainerCopyToContainerBtn").click();
  await page.locator("#containerPickerLayoutSelect").selectOption(targetId);
  const before = f.posts.length;
  const source = structuredClone(f.payload), journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  if (outcome === "lost ACK") { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Tree quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
    expect(draft.layouts[targetId].arrangement.items[itemId]).toBe(rootId);
    for (const [collection, id] of [["items", itemId], ["containers", rootId]]) expect(draft[collection][id].photos).toEqual(source[collection][id].photos);
    expect(recovery.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(journal);
    expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(source); expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]);
    return;
  }
  await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  if (outcome === "lost ACK") {
    await page.locator("#syncBtn").click();
    await expect.poll(() => f.payload.layouts[targetId].arrangement.rootContainerIds.includes(rootId)).toBe(true);
  } else await synchronize(page, () => f.payload.layouts[targetId].arrangement.rootContainerIds.includes(rootId));
  expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1).body.userContainerTree.mode).toBe("link");
  if (outcome === "lost ACK") {
    await expect.poll(() => f.injectedFailure).toBe(true);
    const action = structuredClone(f.posts.at(-1)); f.lose = false; f.unknown = false; f.beforeUpdate = null;
    await reloadApp(page); await synchronize(page, () => f.payload.layouts[targetId].arrangement.rootContainerIds.includes(rootId));
    expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(action);
  }
  if (photos) {
    for (const [collection, id] of [["items", itemId], ["containers", rootId]]) expect(f.payload[collection][id].photos).toEqual(source[collection][id].photos);
    expect(f.stagePosts).toHaveLength(0);
  }
  expect(Object.keys(f.payload.containers)).toEqual([rootId]); expect(Object.keys(f.payload.items)).toEqual([itemId]);
  expect(f.payload.layouts["layout-a"].arrangement.items[itemId]).toBe(rootId);
  expect(f.payload.layouts[targetId].arrangement.items[itemId]).toBe(rootId); expect(f.errors).toEqual([]);
});

test("actual bag and item dialogs persist immutable actions and recover lost ACK after reload", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { lose: true });
  const bag = await createRootContainer(page, "Сумка очереди");
  await createItemInContainer(page, bag, "Насос очереди", { weight: "130" });
  await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:") && !key.includes("applied:")).length)).toBeGreaterThan(0);
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const firstId = f.posts[0].operationId;
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await page.locator("#syncBtn").click();
  await expect.poll(() => Object.values(f.payload.items || {}).some(item => item.name === "Насос очереди"), { timeout: 20000 }).toBe(true);
  expect(f.posts.filter(post => post.operationId === firstId)).toHaveLength(1);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(Object.keys(f.payload.items)[0]).toMatch(/^item-[0-9a-f-]{36}$/);
  expect(Object.keys(f.payload.containers)[0]).toMatch(/^container-[0-9a-f-]{36}$/);
  expect(f.errors).toEqual([]);
});

async function synchronize(page, condition) {
  await page.locator("#syncBtn").click();
  await expect.poll(condition, { timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:"));
    return keys.length === 3 && keys.some(key => key.includes(":checkpoint:"));
  }), { timeout: 20000 }).toBe(true);
  // An empty outbox may already trigger the read-only retained-file check.
  // Native modal focus still blocks typing until that check has closed.
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
}

async function prepareOrdinaryPhotoForm(page, context, { type = "container", created = false, photoEdit = false, photoCount = 2, secondBag = false, placeNew = false, withContents = false, copyTarget = false, copySourcePhotos = false } = {}) {
  const payload = initialPayload();
  if (copyTarget) payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Пустая цель копирования",
    arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } };
  const f = await setup(page, context, { payload, photoForm: true, photoEdit }), bag = await createRootContainer(page, "База фотоформы");
  if (type === "item" && !created) await createItemInContainer(page, bag, "Вещь фотоформы");
  if (copyTarget) await createItemInContainer(page, bag, "Источник копирования в новую сумку");
  if (withContents) {
    await bag.locator("[data-add-to-container]").click(); await page.locator("#newSubcontainerName").fill("Карман фотоформы");
    await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
    await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
    await createItemInContainer(page, bag.locator("[data-subcontainer-id]").filter({ hasText: "Карман фотоформы" }), "Вещь внутри фотоформы");
  }
  if (secondBag) await createRootContainer(page, "Вторая сумка фотоформы");
  await synchronize(page, () => Object.keys(f.payload.containers).length === (secondBag ? 2 : 1) + Number(withContents) && (type !== "item" || created || Object.keys(f.payload.items).length === 1));
  if (copySourcePhotos) { addConfirmedTreePhotos(f, [["items", Object.keys(f.payload.items)[0]]]); await reloadApp(page); }
  const before = f.posts.length, collection = type === "item" ? "items" : "containers";
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  if (copyTarget) {
    await page.locator('[data-view="items"]').click(); await page.locator("#itemsView .item-title").filter({ hasText: "Источник копирования в новую сумку" }).click();
    await page.locator("#itemCopyToContainerBtn").click(); await page.locator("#containerPickerLayoutSelect").selectOption("layout-b");
    await page.locator("#containerPickerBoard [data-add-packing-root]").click();
    await page.locator("#createRootForLayoutBtn").click();
  } else if (created && placeNew) {
    await page.locator('[data-view="packing"]').click(); await page.locator("[data-add-packing-root]").click(); await page.locator("#createRootForLayoutBtn").click();
  } else if (created) await page.locator(type === "item" ? "#addItemBtn" : "#addRootContainerBtn").click();
  else await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: type === "item" ? "Вещь фотоформы" : "База фотоформы" }).click();
  const prefix = type === "item" ? "item" : "rootContainer", dialog = page.locator(`#${prefix}Dialog`), button = type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn";
  await expect(dialog).toBeVisible();
  await page.locator(`#${prefix}Name`).fill("Карточка со всеми файлами");
  await page.locator(`#${prefix}Note`).fill("Поля и два фото — одно действие");
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    const paint = canvas.getContext("2d"); paint.fillStyle = "red"; paint.fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await page.locator(`#${prefix}PhotoInput`).setInputFiles(Array.from({ length: photoCount }, (_, index) => ({ name: `фото-${index + 1}.png`, mimeType: "image/png", buffer: image })));
  await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(photoCount);
  if (photoCount) await expect(page.locator(`#${prefix}PhotoStatus`)).toContainText("Отправятся после сохранения карточки");
  await expect(page.locator(button)).toBeEnabled();
  expect(f.stagePosts).toHaveLength(0); expect(f.posts).toHaveLength(before);
  await page.locator(`#${prefix}Note`).blur();
  await expect(page.locator(button)).toBeVisible();
  return { f, before, collection, prefix, button, dialog };
}

for (const type of ["item", "container"]) for (const { outcome, change = null } of [
  ...["confirmed", "lost file", "lost first owner", "lost second owner", "quota", "cancel", "lost cancellation"].map(outcome => ({ outcome })),
  ...["delete-all", "order", "delete-order"].flatMap(change => ["confirmed", "lost second owner"].map(outcome => ({ change, outcome }))),
  ...["quota", "cancel", "lost cancellation"].map(outcome => ({ change: "delete-all", outcome }))
]) test(`pending photo form ${change ? `fileless ${change}` : "new files"} follows the exact owner result (${type}, ${outcome})`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_FILES !== "1", "Separate disabled feature in the isolated test bundle");
  test.setTimeout(150000);
  const fileless = change !== null, rootPhotoCount = fileless ? 3 : 2;
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, created: true, photoEdit: true, photoCount: rootPhotoCount });
  const server = structuredClone(f.payload), cancelMode = outcome === "cancel" || outcome === "lost cancellation";
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const nativeFiles = () => page.evaluate(async () => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const store = createPersonalPhotoActionStore(binding), result = [];
    for (const id of await store.ids()) {
      const saved = await store.read(id); result.push({ action: saved.action, files: saved.files.map(part => ({ size: part.file.size,
        proof: { ok: true, operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
          entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } } })) });
    } return result;
  });
  let release; f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const root = (await records()).find(record => record.action.kind === "photos.mutate"), ownerId = root.action.body.entityId;
    const originalRecords = await records();
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
    await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(rootPhotoCount);
    const deleteCount = change === "delete-all" ? rootPhotoCount : change === "order" ? 0 : 1;
    for (let index = 0; index < deleteCount; index++) {
      await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click();
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(rootPhotoCount - index - 1);
    }
    if (fileless && change !== "delete-all") {
      const chosen = await page.locator(`#${prefix}PhotoPreview img`).nth(1).getAttribute("data-photo-local-id");
      await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
      await expect(page.locator(`#${prefix}PhotoPrimaryBtn`)).toBeEnabled(); await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
      await expect(page.locator(`#${prefix}PhotoPreview img`).first()).toHaveAttribute("data-photo-local-id", chosen);
    }
    if (!fileless) {
      const image = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
      const paint = canvas.getContext("2d"); paint.fillStyle = "blue"; paint.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator(`#${prefix}PhotoInput`).setInputFiles([0, 1].map(i => ({ name: `следующее-${i}.png`, mimeType: "image/png", buffer: image })));
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(3);
    }
    const finalPhotoCount = fileless ? rootPhotoCount - deleteCount : 3;
    if (outcome === "quota") await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.ownerResult) throw new DOMException("Second photo form quota", "QuotaExceededError");
        return write.call(this, key, value);
      };
    });
    await page.locator(`#${prefix}Weight`).fill("321"); await submitForm(page, button, `#${prefix}Weight`);
    if (outcome === "quota") {
      await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
      expect(await records()).toEqual(originalRecords); const files = await nativeFiles();
      expect(files).toHaveLength(fileless ? 1 : 2); expect(files.every(saved => saved.files.length === rootPhotoCount && saved.files.every(file => file.size > 0))).toBe(true);
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before); return;
    }
    await expect(dialog).not.toBeVisible();
    const saved = await records(), child = saved.find(record => record.action.body.ownerResult);
    expect(child.action.body.ownerResult.operationId).toBe(root.action.operationId);
    expect(child.action.body.baseEntityRevision).toBeNull();
    expect(child.action.body.changes.filter(change => change.action === "delete").every(change => change.basePhotoRevision === null)).toBe(true);
    if (fileless) { expect(child.photoState.fileIntentHash).toBeNull(); expect(child.action.body.changes.some(change => change.action === "attach")).toBe(false); }
    expect(saved.find(record => record.action.operationId === root.action.operationId)).toEqual(root);
    await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
    await page.locator(`#${prefix}Weight`).fill("432"); await submitForm(page, button, `#${prefix}Weight`); await expect(dialog).not.toBeVisible();
    const dbChild = (await records()).find(record => record.action.body.photoResults?.version === 6); expect(dbChild).toBeTruthy();
    const files = await nativeFiles(); expect(files).toHaveLength(fileless ? 1 : 2); expect(files.every(saved => saved.files.length === rootPhotoCount)).toBe(true);
    if (cancelMode) {
      f.loseStageAt = 1;
      f.cancelPhotoActions = new Map([root, child, dbChild].map(record => [record.action.operationId, record.action]));
      f.cancellationReceipts = new Map(files.flatMap(saved => saved.files.map(file => [file.proof.operation.id, file.proof])));
    } else if (outcome === "lost file") f.loseStageAt = 4;
    else if (outcome.includes("owner")) f.beforePhotoWrite = action => { f.loseFormOwner = action.operationId === (outcome === "lost first owner" ? root : child).action.operationId; };
    f.beforeStageAck = null; release(); release = null;
    if (cancelMode) {
      await expect.poll(() => Boolean(f.hiddenStage)).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      if (outcome === "lost cancellation") {
        f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      }
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      expect(f.ownerCancellationPosts).toEqual([root.action.operationId, child.action.operationId, dbChild.action.operationId]);
      const posts = structuredClone(f.posts); await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      expect(f.posts).toHaveLength(posts.length + 1); expect(f.stagePosts).toHaveLength(1); expect(f.payload).toEqual(server);
      expect(await nativeFiles()).toEqual(files); await reloadApp(page); expect(f.errors).toEqual([]); return;
    }
    if (outcome !== "confirmed") {
      await expect.poll(() => Boolean(f.hiddenStage || f.hiddenFormOwner), { timeout: 20000 }).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null; f.beforePhotoWrite = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"); await recovery.locator("[data-resume-photo-upload]").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await synchronizePhotoHistory(page, () => f.payload[collection][ownerId]?.weight === 432);
    expect(f.posts).toHaveLength(before + 3);
    expect(f.stagePosts).toEqual([root, child].flatMap(record => record.action.body.changes.filter(change => change.action === "attach").map(change => change.assetId)));
    expect(f.payload[collection][ownerId].photos).toHaveLength(finalPhotoCount);
    expect(f.payload[collection][ownerId].photos.every(photo => photo.status === "synced")).toBe(true);
    const ids = f.payload[collection][ownerId].photos.map(photo => photo.id);
    expect(ids).toEqual(child.photoState.payload[collection][ownerId].photos.map(photo => photo.id));
    expect(f.payload[collection][ownerId].weight).toBe(432);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 3); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const outcome of ["confirmed", "lost file", "lost owner", "quota", "source failure", "form changed", "fileless", "fileless lost owner", "fileless quota", "fileless cancel"]) test(`manufacturer photo form preserves the selected source and complete files (${outcome})`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_MANUFACTURER !== "1", "Separate disabled manufacturer feature in the isolated test bundle");
  test.setTimeout(150000);
  const fileless = outcome.startsWith("fileless"), quota = outcome.includes("quota"), lostOwner = outcome.includes("lost owner");
  const { f, before, dialog, button } = await prepareOrdinaryPhotoForm(page, context, { created: true, photoEdit: true, photoCount: 0, placeNew: true });
  const server = structuredClone(f.payload), sourceId = "blackburn-outpost-frame-bag-large"; let release;
  if (outcome === "source failure" || outcome === "form changed") await context.route("**/assets/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().resourceType() === "fetch" && pathname.includes("outpost-frame-bag-large-2-")) {
      if (outcome === "source failure") return route.fulfill({ status: 503, body: "Unavailable selected image" });
      await new Promise(resolve => { release = resolve; });
    }
    return route.fallback();
  });
  try {
    await page.locator("#openBagCatalogBtn").click(); const catalog = page.locator("#bagCatalogDialog"); await expect(catalog).toBeVisible();
    await page.locator("#bagCatalogSearch").fill("BB-7099763");
    const select = catalog.locator(`[data-bag-catalog-select="${sourceId}"]`); await expect(select).toBeVisible(); await select.click();
    if (outcome === "form changed") {
      await expect.poll(() => Boolean(release)).toBe(true); await catalog.locator('button[value="cancel"]').click();
      await page.locator("#rootContainerName").fill("Мой новый ввод"); release(); release = null;
      await expect(page.locator("#rootContainerName")).toHaveValue("Мой новый ввод");
      await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(0); expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(server); return;
    }
    if (outcome === "source failure") {
      await expect(select).toBeEnabled(); await expect(catalog).toBeVisible();
      await expect(page.locator("#rootContainerName")).toHaveValue("Карточка со всеми файлами");
      await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(0); expect(f.stagePosts).toHaveLength(0); expect(f.posts).toHaveLength(before); return;
    }
    await expect(catalog).not.toBeVisible(); await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(2);
    if (fileless) for (const remaining of [1, 0]) {
      await page.locator("#rootContainerPhotoRemoveBtn").click(); await page.locator("#confirmOkBtn").click();
      await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(remaining);
    }
    await page.locator("#rootContainerName").fill("Моя сумка из каталога");
    if (quota) await page.evaluate(() => {
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Manufacturer journal quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    });
    f.loseStageAt = outcome === "lost file" ? 2 : 0; f.loseFormOwner = lostOwner;
    f.dropManufacturerBeforeCommit = outcome === "fileless cancel";
    await submitForm(page, button, "#rootContainerName");
    if (quota) {
      await expect(dialog).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
      const copy = await downloadRecovery(page); expect(JSON.stringify(copy)).toContain(sourceId);
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before); return;
    }
    await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    if (outcome === "fileless cancel") {
      await expect.poll(() => f.injectedFailure).toBe(true); f.cancelPhotoAction = f.posts.at(-1);
      await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      // The fixture's posts also includes the separate owner-cancellation POST.
      expect(f.posts).toHaveLength(before + 3); expect(f.ownerCancellationPosts).toEqual([f.cancelPhotoAction.operationId]);
      expect(f.stagePosts).toHaveLength(0); expect(f.cancellationPosts).toHaveLength(0); expect(f.payload).toEqual(server);
      await reloadApp(page); expect(f.posts).toHaveLength(before + 3); expect(f.errors).toEqual([]); return;
    }
    if (outcome === "lost file" || lostOwner) {
      await expect.poll(() => f.stagePosts.length).toBe(fileless ? 0 : 2);
      if (lostOwner) await expect.poll(() => f.injectedFailure).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"); await recovery.locator("[data-resume-photo-upload]").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await synchronizePhotoHistory(page, () => Object.values(f.payload.containers).some(owner => owner.name === "Моя сумка из каталога"));
    expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(fileless ? 0 : 2);
    const action = f.posts.at(-1), owner = f.payload.containers[action.body.entityId];
    expect(action.body.manufacturerSource.entry.id).toBe(sourceId); expect(action.body.manufacturerSource.imageUrls).toHaveLength(2);
    expect(action.body.containerFormContext.targetLayout.id).toBe("layout-a");
    expect(owner.manufacturerCatalogSource.catalogId).toBe(sourceId); expect(owner.photos).toHaveLength(fileless ? 0 : 2);
    expect(f.payload.layouts["layout-a"].arrangement.rootContainerIds).toContain(owner.id);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 1); expect(f.errors).toEqual([]);
  } finally { release?.(); }
});

test("manufacturer photo form remains paused without its separate source gate", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_MANUFACTURER === "1", "Verifies the source-disabled bundle");
  const { f, before } = await prepareOrdinaryPhotoForm(page, context, { created: true, photoEdit: true, photoCount: 0 });
  const imageFetches = [];
  page.on("request", request => { if (request.resourceType() === "fetch" && new URL(request.url()).pathname.startsWith("/assets/")) imageFetches.push(request.url()); });
  await page.locator("#openBagCatalogBtn").click(); await page.locator("#bagCatalogSearch").fill("BB-7099763");
  await page.locator('[data-bag-catalog-select="blackburn-outpost-frame-bag-large"]').click();
  await expect(page.locator("#bagCatalogDialog")).toBeVisible();
  await expect(page.locator(".toast.warning")).toContainText("Данные формы сохранены");
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(0);
  await expect(page.locator("#rootContainerName")).toHaveValue("Карточка со всеми файлами");
  expect(imageFetches).toEqual([]);
  expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(0);
});

for (const type of ["item", "container"]) for (const outcome of ["fields", "lost child", "delete", "quota"]) test(`pending ordinary photo form descendants ${type} (${outcome})`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_FORM !== "1", "Separate disabled feature in the isolated test bundle");
  test.setTimeout(150000);
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  const server = structuredClone(f.payload); let release;
  f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const originalRecords = await records(), form = originalRecords.find(record => record.action.kind === "photos.mutate"), ownerId = form.action.body.entityId;
    const edit = async value => {
      await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
      await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
      await page.locator(`#${prefix}Weight`).fill(String(value)); await submitForm(page, button, `#${prefix}Weight`);
    };
    if (outcome === "quota") await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.photoResults?.version === 5) throw new DOMException("Pending form quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await edit(111);
    if (outcome === "quota") {
      await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
      expect(await records()).toEqual(originalRecords); const draft = await downloadRecovery(page);
      expect(draft.unconfirmedMemoryDraft[collection][ownerId].weight).toBe(111); expect(draft.unconfirmedMemoryDraft[collection][ownerId].photos).toHaveLength(2);
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before); return;
    }
    await expect(dialog).not.toBeVisible(); await edit(222); await expect(dialog).not.toBeVisible();
    if (outcome === "delete") {
      await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
      await page.locator(`#${prefix}DeleteForeverBtn`).click(); await page.locator("#confirmOkBtn").click(); await expect(dialog).not.toBeVisible();
    }
    const saved = await records(), children = saved.filter(record => record.action.body.photoResults?.version === 5).sort((a, b) => a.action.generation - b.action.generation);
    expect(children).toHaveLength(outcome === "delete" ? 3 : 2); expect(saved.find(record => record.action.operationId === form.action.operationId)).toEqual(form);
    let parent = form;
    for (const child of children) {
      expect(child.action.body.causal.baseOperationId).toBe(parent.action.operationId);
      expect(child.action.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([...new Set([parent.action.operationId, form.action.operationId])]);
      expect(child.action.body.photoResults.owners).toEqual([{ entityType: type, entityId: ownerId }]); parent = child;
    }
    if (outcome === "lost child") { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
    f.beforeStageAck = null; release(); release = null;
    if (outcome === "lost child") {
      await expect.poll(() => f.posts.some(post => post.operationId === children[0].action.operationId), { timeout: 20000 }).toBe(true);
      await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      const posts = structuredClone(f.posts), stages = [...f.stagePosts]; await resume.click(); await expect(resume).toBeEnabled();
      expect(f.posts).toEqual(posts); expect(f.stagePosts).toEqual(stages);
      f.lose = false; f.unknown = false; f.beforeUpdate = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
    } else await synchronizePhotoHistory(page, () => outcome === "delete" ? !f.payload[collection][ownerId] : f.payload[collection][ownerId]?.weight === 222);
    expect(f.posts).toHaveLength(before + 1 + children.length);
    expect(f.stagePosts).toEqual(form.action.body.changes.filter(change => change.action === "attach").map(change => change.assetId));
    if (outcome !== "delete") { expect(f.payload[collection][ownerId].weight).toBe(222); expect(f.payload[collection][ownerId].photos).toHaveLength(2); }
    else expect(f.payload[collection][ownerId]).toBeUndefined();
    await reloadApp(page); expect(f.posts).toHaveLength(before + 1 + children.length); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const type of ["item", "container"]) test(`pending fileless ordinary photo form keeps later fields through lost child ACK (${type})`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_FORM !== "1", "Separate disabled feature in the isolated test bundle");
  test.setTimeout(150000);
  const { f, collection, prefix, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type, change: "delete-order" });
  const before = f.posts.length, stageBefore = f.stagePosts.length; let release;
  f.beforePhotoWrite = () => new Promise(resolve => { release = resolve; });
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    for (const weight of [111, 222]) {
      await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Фотографии изменены" }).click();
      await page.locator(`#${prefix}Weight`).fill(String(weight)); await submitForm(page, button, `#${prefix}Weight`); await expect(dialog).not.toBeVisible();
    }
    f.beforeUpdate = () => { f.lose = true; f.unknown = true; }; f.beforePhotoWrite = null; release(); release = null;
    await expect.poll(() => f.injectedFailure).toBe(true); await reloadApp(page, { recovery: true });
    f.beforeUpdate = null; f.lose = false; f.unknown = false;
    const recovery = page.locator("#personalSaveRecoveryDialog"); await recovery.locator("[data-resume-photo-upload]").click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.payload[collection][ownerId].weight).toBe(222);
    expect(f.payload[collection][ownerId].photos.map(photo => photo.id)).toEqual([originalPhotos[2].id, originalPhotos[1].id]);
    expect(f.posts).toHaveLength(before + 3); expect(f.stagePosts).toHaveLength(stageBefore);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 3); expect(f.errors).toEqual([]);
  } finally { f.beforePhotoWrite = null; release?.(); }
});

test("pending photo target accepts the selected item link before any file confirmation", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_FORM !== "1", "Separate disabled feature in the isolated test bundle");
  test.setTimeout(150000);
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "container", created: true, photoEdit: true, copyTarget: true });
  let release; f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  const server = structuredClone(f.payload), sourceId = Object.keys(server.items)[0];
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await expect.poll(() => Boolean(release), { timeout: 20000 }).toBe(true);
    const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(record => record.action));
    const form = (await records()).find(record => record.action.body.containerFormContext), targetId = form.action.body.entityId;
    await page.locator(`#containerPickerBoard [data-pick-container="${targetId}"]`).click(); await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
    const child = (await records()).find(record => record.action.body.photoResults?.version === 5);
    expect(child.action.body.userPlacement.action).toBe("link-item"); expect(child.action.body.causal.baseOperationId).toBe(form.action.operationId);
    expect(child.action.body.payload.layouts["layout-b"].arrangement.items[sourceId]).toBe(targetId);
    expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before);
    f.beforeStageAck = null; release(); release = null;
    await synchronizePhotoHistory(page, () => f.payload.layouts["layout-b"].arrangement.items[sourceId] === targetId);
    expect(f.payload.layouts["layout-a"]).toEqual(server.layouts["layout-a"]); expect(f.payload.items).toEqual(server.items);
    expect(f.payload.containers[targetId].photos).toHaveLength(2); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const scenario of ["copy", "copy with source photos", "lost file", "lost owner", "queue quota"]) test(`container photo form returns to the item copy picker (${scenario})`, async ({ page, context }) => {
  test.setTimeout(150000);
  const sourcePhotos = scenario === "copy with source photos";
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "container", created: true,
    photoEdit: true, copyTarget: true, copySourcePhotos: sourcePhotos });
  const server = structuredClone(f.payload), sourceId = Object.keys(server.items)[0], picker = page.locator("#containerPickerDialog");
  if (scenario === "lost file") f.loseStageAt = 2;
  if (scenario === "lost owner") f.loseFormOwner = true;
  if (scenario === "queue quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.containerFormContext) throw new DOMException("Copy target quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await submitForm(page, button, "#rootContainerNote");
  if (scenario === "queue quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
    await expect(picker).not.toBeVisible();
    const recovery = await downloadRecovery(page), owner = Object.values(recovery.unconfirmedMemoryDraft.containers).find(row => row.name === "Карточка со всеми файлами");
    expect(owner.photos).toHaveLength(2); expect(recovery.unconfirmedMemoryDraft.layouts["layout-b"].rootContainerIds).toContain(owner.id);
    expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]); return;
  }
  await expect(dialog).not.toBeVisible(); await expect(picker).toBeVisible(); await expect(page.locator("#containerPickerLayoutSelect")).toHaveValue("layout-b");
  await expect.poll(() => f.stagePosts.length, { timeout: 20000 }).toBe(2);
  if (scenario.startsWith("lost")) {
    if (scenario === "lost owner") await expect.poll(() => f.injectedFailure).toBe(true); else expect(f.payload).toEqual(server);
    const pending = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).map(([, value]) => JSON.parse(value)).find(record => record.action?.body?.containerFormContext));
    const journalBefore = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
    await page.locator(`#containerPickerBoard [data-pick-container="${pending.action.body.entityId}"]`).click();
    await expect(picker).toBeVisible(); await expect(page.locator("#layoutSelect")).toHaveValue("layout-a");
    expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort())).toEqual(journalBefore);
    const stages = [...f.stagePosts], posts = structuredClone(f.posts);
    await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toEqual(posts); expect(f.stagePosts).toEqual(stages);
    f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
    await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
    await page.locator('[data-view="items"]').click(); await page.locator("#itemsView .item-title").filter({ hasText: server.items[sourceId].name }).click();
    await page.locator("#itemCopyToContainerBtn").click(); await expect(picker).toBeVisible(); await page.locator("#containerPickerLayoutSelect").selectOption("layout-b");
  } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty), { timeout: 20000 }).toBe(false);
  expect(f.posts).toHaveLength(before + 1);
  const form = f.posts.at(-1), targetId = form.body.entityId, targetRevision = f.revision;
  expect(form.body.containerFormContext.targetLayout).toEqual(server.layouts["layout-b"]);
  expect(f.payload.containers[targetId].photos).toHaveLength(2); expect(f.payload.items).toEqual(server.items);
  await page.locator(`#containerPickerBoard [data-pick-container="${targetId}"]`).click(); await expect(picker).not.toBeVisible();
  await synchronizePhotoHistory(page, () => f.payload.layouts["layout-b"].arrangement.items[sourceId] === targetId);
  const copy = f.posts.at(-1);
  expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2);
  expect(copy.body.baseStateRevision).toBe(targetRevision);
  expect(copy.kind).toBe("list.update"); expect(copy.body.payload.layouts["layout-b"].arrangement.items[sourceId]).toBe(targetId);
  expect(copy.body.userPlacement.action).toBe("link-item"); expect(copy.body.userPlacement.layoutId).toBe("layout-b");
  expect(f.payload.items).toEqual(server.items); expect(f.payload.items[sourceId].photos).toHaveLength(sourcePhotos ? 1 : 0);
  expect(f.payload.layouts["layout-a"]).toEqual(server.layouts["layout-a"]);
  await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2); expect(f.errors).toEqual([]);
});

for (const scenario of ["create", "move", "root order", "lost file", "lost owner", "queue quota"]) test(`composed container photo form preserves complete placement (${scenario})`, async ({ page, context }) => {
  test.setTimeout(150000);
  const created = scenario === "create", reorder = scenario === "root order";
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "container", created, photoEdit: true,
    placeNew: created, secondBag: !created, withContents: !created });
  const server = structuredClone(f.payload), targetId = Object.values(server.containers).find(bag => bag.name === "Вторая сумка фотоформы")?.id;
  if (!created) {
    await page.locator("#rootContainerNestable").setChecked(!reorder); await page.locator("#rootContainerPlacementBtn").click();
    if (reorder) {
      await expect(page.locator("#rootPlacementDialog")).toBeVisible(); await page.locator("#rootPlacementBoard [data-place-root-index]").last().click();
    } else {
      await expect(page.locator("#containerPickerDialog")).toBeVisible(); await page.locator(`#containerPickerBoard [data-pick-container="${targetId}"]`).click();
    }
  }
  if (scenario === "lost file") f.loseStageAt = 2;
  if (scenario === "lost owner") f.loseFormOwner = true;
  if (scenario === "queue quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.containerFormContext) throw new DOMException("Container context quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await submitForm(page, button, "#rootContainerNote");
  if (scenario === "queue quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
    const copy = await downloadRecovery(page), owner = Object.values(copy.unconfirmedMemoryDraft.containers).find(bag => bag.name === "Карточка со всеми файлами");
    expect(copy.unconfirmedMemoryDraft.layouts["layout-a"].arrangement.containers[owner.id].parentId).toBe(targetId);
    expect(owner.photos).toHaveLength(2); expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(0);
  } else {
    await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    if (scenario.startsWith("lost")) {
      await expect.poll(() => f.stagePosts.length).toBe(2);
      if (scenario === "lost owner") await expect.poll(() => f.injectedFailure).toBe(true); else expect(f.payload).toEqual(server);
      const posts = structuredClone(f.posts), stages = [...f.stagePosts];
      await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toEqual(posts); expect(f.stagePosts).toEqual(stages);
      f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
    expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
    const action = f.posts.at(-1), ownerId = action.body.entityId, selection = action.body.containerFormContext, layout = f.payload.layouts["layout-a"];
    expect(selection.targetLayout).toEqual(server.layouts["layout-a"]); expect(f.payload.containers[ownerId].photos).toHaveLength(2);
    expect(layout.arrangement.containers[ownerId].parentId).toBe(created || reorder ? "" : targetId);
    if (created || reorder) expect(layout.rootContainerIds.at(-1)).toBe(ownerId);
    expect(f.payload.items).toEqual(server.items);
    expect(layout.arrangement.items).toEqual(server.layouts["layout-a"].arrangement.items);
    expect(layout.arrangement.itemQuantities).toEqual(server.layouts["layout-a"].arrangement.itemQuantities);
    for (const [id, owner] of Object.entries(server.containers)) if (id !== ownerId) expect(f.payload.containers[id]).toEqual(owner);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
  }
  expect(f.errors).toEqual([]);
});

for (const reorder of [false, true]) test(`composed container photo edit without new files ${reorder ? "reorders roots" : "moves subtree"} after a lost confirmation`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, before, ownerId, button, dialog, originalPhotos } = await prepareExistingPhotoEdit(page, context,
    { type: "container", change: "delete", secondBag: true, withContents: true });
  const server = structuredClone(f.payload), stages = [...f.stagePosts], targetId = Object.values(server.containers).find(bag => bag.name === "Вторая сумка фотоформы").id;
  await page.locator("#rootContainerNestable").setChecked(!reorder); await page.locator("#rootContainerPlacementBtn").click();
  if (reorder) { await expect(page.locator("#rootPlacementDialog")).toBeVisible(); await page.locator("#rootPlacementBoard [data-place-root-index]").last().click(); }
  else { await expect(page.locator("#containerPickerDialog")).toBeVisible(); await page.locator(`#containerPickerBoard [data-pick-container="${targetId}"]`).click(); }
  f.loseFormOwner = true; await submitForm(page, button, "#rootContainerNote"); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true); const action = structuredClone(f.posts.at(-1));
  expect(action.body.containerFormContext.targetLayout).toEqual(server.layouts["layout-a"]);
  expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toEqual(stages);
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts.at(-1)).toEqual(action);
  f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.payload.containers[ownerId].photos.map(photo => photo.id)).toEqual([originalPhotos[1].id]);
  expect(f.payload.layouts["layout-a"].arrangement.containers[ownerId].parentId).toBe(reorder ? "" : targetId);
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual(server.layouts["layout-a"].arrangement.items);
  expect(f.payload.items).toEqual(server.items);
  await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

for (const scenario of ["create", "move", "quantity", "unplace", "lost file", "lost owner", "queue quota"]) test(`composed item photo form preserves placement and availability (${scenario})`, async ({ page, context }) => {
  test.setTimeout(150000);
  const created = scenario === "create";
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type: "item", created, photoEdit: true, secondBag: scenario === "move" });
  const server = structuredClone(f.payload), bagId = scenario === "move" ? Object.values(f.payload.containers).find(bag => bag.name === "Вторая сумка фотоформы").id : Object.keys(f.payload.containers)[0];
  if (created || scenario === "move" || scenario === "unplace") {
    await page.locator("#itemContainerPickerBtn").click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator(scenario !== "unplace" ? `#containerPickerBoard [data-pick-container="${bagId}"]` : "#containerPickerNoneBtn").click();
  }
  if (scenario !== "unplace") await page.locator("#itemQuantity").fill("4");
  if (!created && scenario !== "move") await page.locator("#itemAvailabilityStatus").selectOption("broken");
  if (scenario === "lost file") f.loseStageAt = 2;
  if (scenario === "lost owner") f.loseFormOwner = true;
  if (scenario === "queue quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.formContext) throw new DOMException("Item context quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await submitForm(page, button, "#itemQuantity");
  if (scenario === "queue quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
    const copy = await downloadRecovery(page), itemId = Object.keys(server.items)[0];
    expect(copy.unconfirmedMemoryDraft.items[itemId].availabilityStatus).toBe("broken");
    expect(Object.values(copy.unconfirmedMemoryDraft.layouts).some(layout => layout.arrangement.itemQuantities[itemId] === 4)).toBe(true);
    expect(f.payload).toEqual(server); expect(f.stagePosts).toHaveLength(0); expect(f.posts).toHaveLength(before);
  } else {
    await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    if (scenario.startsWith("lost")) {
      await expect.poll(() => f.stagePosts.length).toBe(2);
      if (scenario === "lost owner") await expect.poll(() => f.injectedFailure).toBe(true);
      else expect(f.payload).toEqual(server);
      const posts = structuredClone(f.posts), stages = [...f.stagePosts];
      await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toEqual(posts); expect(f.stagePosts).toEqual(stages);
      f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty), { timeout: 30000 }).toBe(false);
    expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
    const action = f.posts.at(-1), itemId = action.body.entityId, placement = action.body.formContext.placement;
    expect(action.kind).toBe("photos.mutate"); expect(action.body.baseEntityRevision === 0).toBe(created);
    expect(f.payload.items[itemId].photos).toHaveLength(2);
    expect(f.payload.items[itemId].availabilityStatus).toBe(created || scenario === "move" ? undefined : "broken");
    expect(placement.targetLayout).toEqual(server.layouts[placement.targetLayout.id]);
    expect(f.payload.layouts[placement.targetLayout.id].arrangement.items[itemId]).toBe(scenario === "unplace" ? undefined : bagId);
    expect(f.payload.layouts[placement.targetLayout.id].arrangement.itemQuantities[itemId]).toBe(scenario === "unplace" ? undefined : 4);
    await reloadApp(page); expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
  }
  expect(f.errors).toEqual([]);
});

for (const unplace of [false, true]) test(`composed item photo edit without new files ${unplace ? "unplaces" : "changes quantity"} after a lost confirmation`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, before, ownerId, button, dialog, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type: "item", change: "delete" });
  const stages = [...f.stagePosts], server = structuredClone(f.payload);
  if (unplace) {
    await page.locator("#itemContainerPickerBtn").click(); await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerNoneBtn").click();
  } else await page.locator("#itemQuantity").fill("7");
  await page.locator("#itemAvailabilityStatus").selectOption("lost"); f.loseFormOwner = true;
  await submitForm(page, button, "#itemQuantity"); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  const action = structuredClone(f.posts.at(-1)); expect(action.body.formContext.availabilityStatus).toBe("lost");
  expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toEqual(stages);
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts.at(-1)).toEqual(action);
  f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.payload.items[ownerId].photos.map(photo => photo.id)).toEqual([originalPhotos[1].id]);
  expect(f.payload.items[ownerId].availabilityStatus).toBe("lost");
  const placement = action.body.formContext.placement, layout = f.payload.layouts[placement.targetLayout.id];
  expect(placement.targetLayout).toEqual(server.layouts[placement.targetLayout.id]);
  expect(layout.arrangement.itemQuantities[ownerId]).toBe(unplace ? undefined : 7);
  expect(Boolean(layout.arrangement.items[ownerId])).toBe(!unplace);
  await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

for (const type of ["container", "item"]) for (const created of [false, true]) test(`ordinary photo form ${type} ${created ? "create" : "edit"} saves files once and follows with a field edit${created ? " after lost ACK" : ""}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, created });
  await submitForm(page, button);
  await page.locator(button).evaluate(button => button.click());
  await expect(dialog).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  const action = f.posts.at(-1); expect(action.kind).toBe("photos.mutate"); expect(action.body.action).toBe("form");
  expect(action.body.baseEntityRevision === 0).toBe(created);
  await expect.poll(() => f.payload[collection][action.body.entityId]?.photos.length).toBe(2);
  expect(f.stagePosts).toEqual(action.body.changes.map(change => change.assetId));
  expect(f.payload[collection][action.body.entityId].note).toBe("Поля и два фото — одно действие");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  await reloadApp(page);
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
  const photos = structuredClone(f.payload[collection][action.body.entityId].photos);
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
  const prefix = type === "item" ? "item" : "rootContainer";
  await page.locator(`#${prefix}Name`).fill("Изменены только поля");
  await page.locator(`#${prefix}Weight`).fill("123");
  if (created) { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  await submitForm(page, button, `#${prefix}Weight`); await expect(dialog).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 2);
  const fieldAction = structuredClone(f.posts.at(-1));
  expect(fieldAction.kind).toBe("list.update"); expect(fieldAction.operationId).not.toBe(action.operationId);
  expect(fieldAction.body.payload[collection][action.body.entityId].photos).toEqual(photos);
  if (created) {
    await expect.poll(() => f.injectedFailure).toBe(true);
    await reloadApp(page);
    expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2);
    f.lose = false; f.unknown = false; f.beforeUpdate = null;
  }
  await synchronize(page, () => f.payload[collection][action.body.entityId]?.name === "Изменены только поля");
  expect(f.payload[collection][action.body.entityId].weight).toBe(123);
  expect(f.payload[collection][action.body.entityId].photos).toEqual(photos);
  expect(f.posts.at(-1)).toEqual(fieldAction); expect(f.stagePosts).toHaveLength(2);
  await reloadApp(page);
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2);
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const change of ["delete", "primary"]) test(`ordinary photo form keeps unsupported ${type} ${change} changes in the window`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type });
  await submitForm(page, button); await expect(dialog).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const action = f.posts.at(-1), photos = structuredClone(f.payload[collection][action.body.entityId].photos);
  const journal = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:"))
    .sort().map(key => [key, localStorage.getItem(key)])));
  const beforeJournal = await journal();
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
  if (change === "delete") {
    await page.locator(`#${prefix}PhotoRemoveBtn`).click();
    await page.locator("#confirmOkBtn").click();
    await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(1);
  } else {
    await page.locator(`#${prefix}PhotoPreview [data-photo-index="1"]`).click();
    await expect(page.locator(`#${prefix}PhotoPrimaryBtn`)).toBeEnabled();
    await page.locator(`#${prefix}PhotoPrimaryBtn`).click();
  }
  await expect(page.locator(button)).toBeEnabled(); await submitForm(page, button);
  await expect(dialog).toBeVisible(); await expect(page.locator(button)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.code)).toBe("photo-form-ui");
  expect(await journal()).toEqual(beforeJournal);
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2);
  expect(f.payload[collection][action.body.entityId].photos).toEqual(photos);
  expect(f.errors).toEqual([]);
});

async function prepareExistingPhotoEdit(page, context, { type = "container", change = "delete", secondBag = false, withContents = false } = {}) {
  const form = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true, secondBag, withContents, photoCount: change === "delete-order" ? 3 : 2 }), { f, before, collection, prefix, button, dialog } = form;
  await submitForm(page, button); await expect(dialog).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const ownerId = f.posts.at(-1).body.entityId, originalPhotos = structuredClone(f.payload[collection][ownerId].photos);
  await reloadApp(page);
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
  await expect(dialog).toBeVisible();
  await page.evaluate(prefix => {
    globalThis.__photoEditEvents = [];
    for (const name of ["pointerdown", "mousedown", "mouseup", "click", "touchend"]) document.addEventListener(name, event => {
      if (event.target.closest?.(`#${prefix}PhotoPrimaryBtn`)) globalThis.__photoEditEvents.push({ name, disabled: event.target.disabled });
    }, true);
  }, prefix);
  if (change !== "order") {
    await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click();
    await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(originalPhotos.length - 1);
  }
  if (change !== "delete") {
    // WebKit mouse emulation can produce down/up without a click on this
    // touch surface. Exercise a real tap and verify the chosen result before SAVE.
    await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
    await expect(page.locator(`#${prefix}PhotoPrimaryBtn`)).toBeEnabled(); await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
    await expect(page.locator(`#${prefix}PhotoPreview img`).first()).toHaveAttribute("data-photo-local-id", originalPhotos.at(-1).id);
    expect(await page.evaluate(() => globalThis.__photoEditEvents.some(event => event.name === "click"))).toBe(true);
  }
  await page.locator(`#${prefix}Name`).fill("Фотографии изменены");
  await page.locator(`#${prefix}Weight`).fill("321"); await page.locator(`#${prefix}Weight`).blur();
  await expect(page.locator(button)).toBeEnabled();
  return { ...form, ownerId, originalPhotos };
}

for (const type of ["item", "container"]) for (const outcome of ["confirmed", "lost file", "lost owner", "queue quota"]) test(`mixed photo form ${type} retains new files, deletion and final order (${outcome})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, prefix, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type, change: "delete" });
  const server = structuredClone(f.payload), stageBefore = f.stagePosts.length;
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await page.locator(`#${prefix}PhotoInput`).setInputFiles([1, 2].map(i => ({ name: `новое-${i}.png`, mimeType: "image/png", buffer: image })));
  await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(3);
  const firstNew = await page.locator(`#${prefix}PhotoPreview img`).nth(1).getAttribute("data-photo-local-id");
  await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
  await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
  await expect(page.locator(`#${prefix}PhotoPreview img`).first()).toHaveAttribute("data-photo-local-id", firstNew);
  if (outcome === "lost file") f.loseStageAt = stageBefore + 2;
  if (outcome === "lost owner") f.loseFormOwner = true;
  if (outcome === "queue quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) {
        const action = JSON.parse(value)?.action;
        if (action?.kind === "photos.mutate" && action.body.changes?.some(p => p.action === "delete")
          && action.body.changes.some(p => p.action === "attach")) throw new DOMException("Mixed form queue quota", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await submitForm(page, button);
  if (outcome === "queue quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
    const copy = await downloadRecovery(page);
    expect(copy.unconfirmedMemoryDraft[collection][ownerId].photos).toHaveLength(3);
    expect(copy.unconfirmedMemoryDraft[collection][ownerId].photos.some(p => p.id === originalPhotos[0].id)).toBe(false);
    expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(stageBefore);
  } else {
    await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    if (outcome !== "confirmed") {
      await expect.poll(() => f.stagePosts.length).toBe(stageBefore + 2);
      if (outcome === "lost owner") await expect.poll(() => f.injectedFailure).toBe(true);
      else expect(f.payload).toEqual(server);
      const posts = structuredClone(f.posts), stages = [...f.stagePosts];
      await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      await resume.click(); await expect(resume).toBeEnabled();
      expect(f.posts).toEqual(posts); expect(f.stagePosts).toEqual(stages);
      f.loseStageAt = 0; f.hiddenStage = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
    expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(stageBefore + 2);
    const action = f.posts.at(-1), changes = action.body.changes;
    expect(changes.map(p => p.action)).toEqual(["delete", "attach", "attach", "order"]);
    expect(changes[0].photoId).toBe(originalPhotos[0].id);
    expect(changes.at(-1).photoIds).toEqual([changes[1].photoId, originalPhotos[1].id, changes[2].photoId]);
    expect(f.payload[collection][ownerId].photos.map(p => p.id)).toEqual(changes.at(-1).photoIds);
    expect(f.payload[collection][ownerId].name).toBe("Фотографии изменены");
    await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(stageBefore + 2);
  }
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const change of ["delete", "order", "delete-order"]) for (const lost of [false, true]) {
  test(`existing photo ${type} ${change} is one durable form without upload (${lost ? "lost ACK" : "normal ACK"})`, async ({ page, context }) => {
    test.setTimeout(120000);
    const { f, before, collection, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type, change });
    f.loseFormOwner = lost;
    await submitForm(page, button); await expect(dialog).not.toBeVisible();
    await page.locator("#syncBtn").click(); await expect.poll(() => f.posts.length).toBe(before + 2);
    const action = structuredClone(f.posts.at(-1));
    expect(action.body.action).toBe("form"); expect(action.body.fields.name).toBe("Фотографии изменены");
    expect(action.body.fields.weight).toBe(321); expect(action.body.changes.map(entry => entry.action)).toEqual(change === "delete-order" ? ["delete", "order"] : [change]);
    if (change !== "order") expect(action.body.changes[0].basePhotoRevision).toBe(f.photoRevisions.get(originalPhotos[0].id));
    if (change === "delete-order") expect(action.body.changes[1].expectedPhotoIds).toEqual(originalPhotos.slice(1).map(photo => photo.id));
    expect(f.stagePosts).toHaveLength(originalPhotos.length); // Only the original attachments.
    if (lost) {
      await expect.poll(() => f.injectedFailure).toBe(true); await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      await expect(recovery).toBeVisible(); await expect(resume).toBeVisible();
      await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts.at(-1)).toEqual(action);
      expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(originalPhotos.length);
      f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
    await reloadApp(page); await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
    expect(f.payload[collection][ownerId].photos).toEqual(change === "delete" ? originalPhotos.slice(1)
      : change === "delete-order" ? originalPhotos.slice(1).reverse() : [...originalPhotos].reverse());
    expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(originalPhotos.length); expect(f.errors).toEqual([]);
  });
}

for (const type of ["item", "container"]) for (const failure of ["quota", "stale-owner"]) test(`existing photo ${type} ${failure} retains the complete unsent form`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, prefix, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type });
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const saved = await journal(), server = structuredClone(f.payload);
  if (failure === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && !String(key).includes(":checkpoint:")) throw new DOMException("Injected fileless form quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else f.afterOwnerRead = data => { data.stateRevision++; data.owner.payload.name = "Newer server owner"; };
  await submitForm(page, button);
  const recovery = page.locator("#personalSaveRecoveryDialog"); await expect(recovery).toBeVisible(); await expect(dialog).toBeVisible();
  await expect(page.locator(`#${prefix}Name`)).toHaveValue("Фотографии изменены");
  const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft[collection][ownerId].name).toBe("Фотографии изменены");
  expect(copy.unconfirmedMemoryDraft[collection][ownerId].photos.map(photo => photo.id)).toEqual(originalPhotos.slice(1).map(photo => photo.id));
  expect(await journal()).toEqual(saved); expect(f.payload).toEqual(server);
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toHaveLength(2); expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) test(`existing photo ${type} cancellation survives reload and a postponed version choice without staging`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type });
  const server = structuredClone(f.payload);
  await submitForm(page, button); await expect(dialog).not.toBeVisible();
  f.cancelPhotoAction = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(record => record.action?.kind === "photos.mutate" && record.photoState?.fileIntentHash === null)?.action);
  expect(f.cancelPhotoAction.body.action).toBe("form");
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
  await expect(recovery).toBeVisible(); await expect(cancel).toBeVisible(); await cancel.click();
  await expect(page.locator("#confirmTitle")).toHaveText("Изменения фото не применены");
  await expect(page.locator("#confirmDialog")).toContainText("поля и изменения фото");
  await page.locator("#confirmCancelBtn").click(); await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
  expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(2);
  await reloadApp(page, { recovery: true }); await expect(recovery).toBeVisible(); await cancel.click();
  await expect(page.locator("#confirmTitle")).toHaveText("Изменения фото не применены");
  await page.locator("#confirmOkBtn").click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.posts).toHaveLength(before + 3); expect(f.stagePosts).toHaveLength(2);
  expect(f.payload[collection][ownerId].photos).toEqual(originalPhotos); expect(f.payload[collection][ownerId].name).toBe(server[collection][ownerId].name);
  expect(f.posts.at(-1).operationId).not.toBe(f.cancelPhotoAction.operationId);
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  expect(f.posts).toHaveLength(before + 3); expect(f.errors).toEqual([]);
});

for (const scenario of ["lost-owner", "lost-last-file", "deleted-after-owner"]) test(`ordinary photo form recovery retains exact IDs through reload (${scenario})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { created: scenario === "deleted-after-owner" });
  if (scenario === "lost-last-file") f.loseStageAt = 2;
  else f.loseFormOwner = true;
  if (scenario === "deleted-after-owner") f.afterFormCommit = body => {
    delete f.payload.containers[body.body.entityId]; f.revision++;
  };
  await submitForm(page, button); await expect(dialog).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.stagePosts.length).toBe(2);
  if (scenario === "lost-last-file") expect(f.posts).toHaveLength(before);
  else await expect.poll(() => f.injectedFailure).toBe(true);
  const stageIds = [...f.stagePosts], original = f.posts.slice(before).map(post => structuredClone(post));
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await expect(recovery).toBeVisible(); await expect(resume).toBeVisible();
  // A still-unknown claim is not authorization to upload the same bytes again.
  await resume.click(); await expect(resume).toBeEnabled();
  expect(f.stagePosts).toEqual(stageIds); expect(f.posts.slice(before)).toEqual(original);
  f.loseFormOwner = false; f.hiddenFormOwner = null; f.loseStageAt = 0; f.hiddenStage = null;
  await resume.click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  const action = f.posts.slice(before).find(post => post.kind === "photos.mutate");
  expect(action.body.changes.map(change => change.assetId)).toEqual(stageIds);
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toEqual(stageIds);
  await reloadApp(page);
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  const owner = await page.evaluate(id => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a"))?.containers[id], action.body.entityId);
  if (scenario === "deleted-after-owner") expect(owner).toBeUndefined();
  else { expect(owner.name).toBe("Карточка со всеми файлами"); expect(owner.photos).toHaveLength(2); }
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toEqual(stageIds); expect(f.errors).toEqual([]);
});

for (const storage of ["native-files", "queue-link", "corrupt-link"]) test(`ordinary photo form storage failure keeps the window and exports all chosen bytes (${storage})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, button, dialog } = await prepareOrdinaryPhotoForm(page, context);
  await page.evaluate(storage => {
    if (storage === "native-files") {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === "actions") {
          globalThis.__photoQuotaInjected = true;
          throw new DOMException("Injected native photo quota", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
    } else {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.kind === "photos.mutate") {
          globalThis.__photoQuotaInjected = true;
          if (storage === "corrupt-link") return original.call(this, key, '{"interrupted-photo-record":');
          throw new DOMException("Injected photo queue link quota", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    }
  }, storage);
  await submitForm(page, button);
  const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery).toBeVisible(); await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => globalThis.__photoQuotaInjected)).toBe(true);
  expect(f.posts).toHaveLength(before); expect(f.stagePosts).toEqual([]);
  const downloaded = page.waitForEvent("download");
  await recovery.locator("[data-download-photo-recovery]").click();
  const download = await downloaded, bytes = await readFile(await download.path()), entries = await readZipEntries(new Blob([bytes]));
  const manifest = JSON.parse(zipText(entries.get("recovery-manifest.json")));
  expect(manifest.openedFormIncluded).toBe(true); expect(manifest.openedFormDispatchable).toBe(false);
  expect(manifest.automaticImportAllowed).toBe(false); expect(manifest.serverConfirmationIncluded).toBe(false);
  const form = JSON.parse(zipText(entries.get("opened-form/form.json")));
  expect(form.request.fields.name).toBe("Карточка со всеми файлами"); expect(form.files).toHaveLength(2);
  for (const index of [0, 1]) {
    expect(entries.get(`opened-form/${index}/original.bin`).byteLength).toBeGreaterThan(0);
    expect(entries.get(`opened-form/${index}/thumbnail.bin`).byteLength).toBeGreaterThan(0);
  }
  expect(manifest.files).toHaveLength(storage === "native-files" ? 0 : 1);
  if (storage === "corrupt-link") {
    const queue = JSON.parse(zipText(entries.get("personal-queue.json")));
    expect(queue.journalEntries.some(entry => entry.value === '{"interrupted-photo-record":')).toBe(true);
  }
  await expect(recovery.locator("[data-resume-photo-upload]")).not.toBeVisible();
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) test(`ordinary photo form ignores a late clipboard read after reopening ${type}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context, { photoForm: true }), bag = await createRootContainer(page, "Буфер сумки");
  if (type === "item") await createItemInContainer(page, bag, "Буфер вещи");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1 && (type !== "item" || Object.keys(f.payload.items).length === 1));
  const before = f.posts.length, prefix = type === "item" ? "item" : "rootContainer";
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  const title = page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: type === "item" ? "Буфер вещи" : "Буфер сумки" });
  await title.click();
  await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), char => char.charCodeAt(0));
    const file = new Blob([bytes], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { read() {
      globalThis.__clipboardReadStarted = true;
      return new Promise(resolve => { globalThis.__finishClipboardRead = () => resolve([{ types: ["image/png"], getType: async () => file }]); });
    } } });
  });
  const paste = page.locator(`#${prefix}Dialog .photo-paste-hint`);
  await paste.click(); await expect.poll(() => page.evaluate(() => globalThis.__clipboardReadStarted)).toBe(true);
  await page.keyboard.press("Escape"); await expect(page.locator(`#${prefix}Dialog`)).not.toBeVisible();
  await title.click(); await expect(page.locator(`#${prefix}Dialog`)).toBeVisible();
  await page.evaluate(() => globalThis.__finishClipboardRead());
  await expect(paste).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(0);
  expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) test(`actual ${type} editor and reload preserve a complete confirmed causal photo reference`, async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = initialPayload(), photo = { id: "ui-photo", photoId: "ui-photo", assetId: "b3321f20-f66d-4394-a583-f905a645fa02",
    listId: "list-a", status: "synced", url: `${origin}/photos/ui-photo/file`, thumbUrl: `${origin}/photos/ui-photo/thumb`,
    fileName: "Сумка.png", type: "image/png", size: 100, width: 1, height: 1 };
  payload.containers["ui-bag"] = { id: "ui-bag", name: "Сумка со связью фото", weight: 0, volume: 0, color: "",
    location: "Велосипед", note: "", categories: [], category: "", nestable: false, photos: type === "container" ? [photo] : [] };
  payload.layouts["layout-a"].rootContainerIds = ["ui-bag"];
  payload.layouts["layout-a"].arrangement.rootContainerIds = ["ui-bag"];
  payload.layouts["layout-a"].arrangement.containers["ui-bag"] = { parentId: null, childIds: [], itemIds: [], order: [] };
  if (type === "item") {
    payload.items["ui-item"] = { id: "ui-item", name: "Вещь со связью фото", quantity: 1, weight: 0, color: "",
      location: "Велосипед", note: "", categories: [], category: "", photos: [photo] };
    payload.layouts["layout-a"].arrangement.items["ui-item"] = "ui-bag";
    payload.layouts["layout-a"].arrangement.containers["ui-bag"].itemIds = ["ui-item"];
    payload.layouts["layout-a"].arrangement.containers["ui-bag"].order = [{ type: "item", id: "ui-item" }];
  }
  const f = await setup(page, context, { payload });
  const collection = type === "item" ? "items" : "containers", id = type === "item" ? "ui-item" : "ui-bag";
  const retained = () => page.evaluate(({ collection, id }) => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a"))[collection][id].photos,
    { collection, id });
  await expect.poll(retained).toEqual([photo]);
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  if (type === "item") await page.locator('#itemsView').getByText("Вещь со связью фото", { exact: true }).click();
  else await page.locator('#bagsView [data-root-card="ui-bag"] [data-root-title]').click();
  const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await reloadApp(page);
  await expect.poll(retained).toEqual([photo]);
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const outcome of ["file in flight", "lost owner", "lost deletion", "quota"]) test(`pending photo owner ${type} deletion follows its durable form (${outcome})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context,
    { type, created: outcome === "file in flight", photoEdit: true });
  let release;
  if (outcome === "lost owner") f.loseFormOwner = true;
  else f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  if (outcome === "lost owner") await expect.poll(() => f.injectedFailure).toBe(true);
  else await expect.poll(() => Boolean(release)).toBe(true);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const originalRecords = await records(), form = originalRecords.find(record => record.action.kind === "photos.mutate");
  const ownerId = form.action.body.entityId, originalForm = structuredClone(form);
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
  await expect(dialog).toBeVisible(); await page.locator(`#${prefix}DeleteForeverBtn`).click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Pending owner deletion quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  if (outcome === "lost deletion") { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  try {
    await submitForm(page, "#confirmOkBtn");
    if (outcome === "quota") {
      await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
      expect(await records()).toEqual(originalRecords);
      const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
      expect(local[collection][ownerId].photos.map(photo => photo.status)).toEqual(["pending", "pending"]);
      expect(f.posts).toHaveLength(before);
    } else {
      await expect(dialog).not.toBeVisible();
      const saved = await records(), deletion = saved.find(record => record.action.body.userDeletion?.id === ownerId);
      expect(deletion).toBeTruthy(); expect(saved.find(record => record.action.operationId === form.action.operationId)).toEqual(originalForm);
      expect(deletion.action.body.causal.baseOperationId).toBe(form.action.operationId);
      expect(deletion.action.body.causal.dependsOn).toEqual([{ operationId: form.action.operationId, listId: "list-a" }]);
      expect(deletion.action.body.payload[collection][ownerId]).toBeUndefined();
      f.beforeStageAck = null; release?.();
      if (outcome === "lost owner" || outcome === "lost deletion") {
        if (outcome === "lost deletion") await expect.poll(() => f.posts.some(post => post.operationId === deletion.action.operationId)).toBe(true);
        await reloadApp(page, { recovery: true });
        const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
        await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled();
        const beforeRecovery = f.posts.length, stageIds = [...f.stagePosts];
        f.lose = false; f.unknown = false; f.beforeUpdate = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
        await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
        expect(f.posts).toHaveLength(beforeRecovery + (outcome === "lost owner" ? 1 : 0)); expect(f.stagePosts).toEqual(stageIds);
        await reloadApp(page);
      } else {
        await expect.poll(() => f.posts.some(post => post.operationId === deletion.action.operationId), { timeout: 20000 }).toBe(true);
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
        await reloadApp(page);
      }
      const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
      expect(local[collection][ownerId]).toBeUndefined(); expect(f.payload[collection][ownerId]).toBeUndefined();
      expect(f.posts.slice(before).map(post => post.operationId)).toEqual([form.action.operationId, deletion.action.operationId]);
      expect(f.posts.at(-1).body).toEqual(deletion.action.body); expect(f.stagePosts).toHaveLength(2);
      await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
    }
  } finally { f.beforeStageAck = null; release?.(); }
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const lost of [false, true, ...(process.env.BIKE_PERSONAL_PENDING_FORM === "1" ? ["decision"] : [])]) test(`pending photo deletion ${type} cancellation retains files and allows a postponed choice${lost === "decision" ? " after lost decision ACK" : lost ? " after lost cancellation ACK" : ""}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const descendants = process.env.BIKE_PERSONAL_PENDING_FORM === "1", extra = descendants ? 1 : 0;
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  const server = structuredClone(f.payload);
  let release;
  f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  f.loseStageAt = 1;
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    if (descendants) {
      await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
      await page.locator(`#${prefix}Weight`).fill("222"); await submitForm(page, button, `#${prefix}Weight`); await expect(dialog).not.toBeVisible();
    }
    await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]").filter({ hasText: "Карточка со всеми файлами" }).click();
    await page.locator(`#${prefix}DeleteForeverBtn`).click(); await submitForm(page, "#confirmOkBtn");
    await expect(dialog).not.toBeVisible();
    await context.route(`${origin}/src/**/*.js`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
      return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
    });
    const retained = await page.evaluate(async () => {
      const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
      const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
      const records = Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
        .map(([, value]) => JSON.parse(value));
      const action = records.find(record => record.action?.kind === "photos.mutate").action;
      const saved = await createPersonalPhotoActionStore(binding).read(action.operationId);
      return { action, deletion: records.find(record => record.action?.body.userDeletion)?.action,
        cancellationReceipts: saved.files.map(part => ({ ok: true,
          operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
            entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } })) };
    });
    f.cancelPhotoAction = retained.action;
    if (descendants) expect(retained.deletion.body.photoResults.version).toBe(5);
    f.cancellationReceipts = new Map(retained.cancellationReceipts.map(proof => [proof.operation.id, proof]));
    f.beforeStageAck = null; release();
    await expect.poll(() => f.hiddenStage).toBe(f.stagePosts[0]);
    await reloadApp(page, { recovery: true }); f.hiddenStage = null;
    const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
    await expect(cancel).toBeVisible();
    if (lost === true) {
      f.loseCancellation = true; f.hideCancellationReceipt = true;
      await cancel.click(); await expect(cancel).toBeEnabled();
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 1);
      await reloadApp(page, { recovery: true });
      f.loseCancellation = false; f.hiddenFormOwner = null;
    }
    await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible();
    await expect(page.locator("#confirmDialog")).toContainText(`действий: ${2 + extra}`);
    await page.locator("#confirmCancelBtn").click(); await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
    expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 2 + extra); expect(f.stagePosts).toHaveLength(1);
    expect(f.receipts.get(retained.deletion.operationId).result.payload.code).toBe("dependency_rejected");
    await reloadApp(page, { recovery: true }); await cancel.click();
    if (lost === "decision") f.beforeUpdate = action => { if (!action.body.photoResults) { f.lose = true; f.unknown = true; } };
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    if (lost === "decision") {
      await expect.poll(() => f.posts.length).toBe(before + 3 + extra);
      f.beforeUpdate = null; f.lose = false; f.unknown = false;
      await reloadApp(page, { recovery: true }); await cancel.click();
    }
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 3 + extra); expect(f.stagePosts).toHaveLength(1); expect(f.cancellationPosts).toHaveLength(1);
    expect(f.payload[collection][retained.action.body.entityId]).toEqual(server[collection][retained.action.body.entityId]);
    expect(await page.evaluate(async id => {
      const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
      return (await createPersonalPhotoActionStore({ actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" }).read(id)).files.length;
    }, retained.action.operationId)).toBe(2);
    await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const type of ["item", "container"]) for (const outcome of ["confirmed", "lost ACK", "quota"]) test(`confirmed photo owner ${type} deletion preserves other files (${outcome})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(), photo = { id: "owner-photo", photoId: "owner-photo", assetId: "f58a351b-2293-41d4-a704-355e84c849ef",
    listId: "list-a", status: "synced", url: `${origin}/photos/owner-photo/file`, thumbUrl: `${origin}/photos/owner-photo/thumb`,
    fileName: "Удаляемое.png", type: "image/png", size: 100, width: 1, height: 1 };
  payload.containers["photo-bag"] = { id: "photo-bag", name: "Сумка с фото", weight: 0, volume: 0, color: "",
    location: "Велосипед", note: "", categories: [], category: "", nestable: false, photos: type === "container" ? [photo] : [] };
  for (const id of ["photo-item", "kept-item"]) payload.items[id] = { id, name: id === "photo-item" ? "Вещь с фото" : "Остающаяся вещь",
    quantity: 1, weight: 0, color: "", location: "Велосипед", note: "", categories: [], category: "",
    photos: id === "photo-item" ? type === "item" ? [photo] : [] : [{ ...photo, id: "kept-photo", photoId: "kept-photo",
      assetId: "fb20f8bf-0b4b-4c61-a169-70d1ee4f63ba" }] };
  const layout = payload.layouts["layout-a"];
  layout.rootContainerIds = ["photo-bag"]; layout.arrangement.rootContainerIds = ["photo-bag"];
  layout.arrangement.items = { "photo-item": "photo-bag", "kept-item": "photo-bag" };
  layout.arrangement.containers["photo-bag"] = { parentId: null, childIds: [], itemIds: ["photo-item", "kept-item"],
    order: ["photo-item", "kept-item"].map(id => ({ type: "item", id })) };
  const f = await setup(page, context, { payload, photoEdit: true });
  const collection = type === "item" ? "items" : "containers", ownerId = type === "item" ? "photo-item" : "photo-bag";
  const prefix = type === "item" ? "item" : "rootContainer";
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  // Settle the ordinary normalization of this legacy-shaped seed before
  // counting the single deletion action or injecting its lost response.
  await synchronize(page, () => Boolean(f.payload.customLocations));
  const before = f.posts.length, server = structuredClone(f.payload), saved = await journal();
  if (type === "item") await page.locator("#itemsView .item-title").filter({ hasText: "Вещь с фото" }).click();
  else await page.locator('#bagsView [data-root-card="photo-bag"] [data-root-title]').click();
  await page.locator(`#${prefix}DeleteForeverBtn`).click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Owner deletion quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else if (outcome === "lost ACK") { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  await submitForm(page, "#confirmOkBtn");
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    expect(local[collection][ownerId].photos).toEqual([photo]);
    expect(await journal()).toEqual(saved); expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before);
  } else {
    if (outcome === "lost ACK") {
      await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
      const original = structuredClone(f.posts.at(-1));
      await reloadApp(page); await page.locator("#syncBtn").click();
      expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1)).toEqual(original);
      f.lose = false; f.unknown = false; f.beforeUpdate = null;
    }
    await synchronize(page, () => !f.payload[collection][ownerId]);
    expect(f.posts).toHaveLength(before + 1);
    expect(f.posts.at(-1).kind).toBe("list.update");
    expect(f.posts.at(-1).body.userDeletion).toEqual({ type, id: ownerId });
    expect(f.payload.items["kept-item"].photos).toEqual(server.items["kept-item"].photos);
    await reloadApp(page);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    expect(local[collection][ownerId]).toBeUndefined(); expect(local.items["kept-item"].photos).toEqual(server.items["kept-item"].photos);
    expect(f.posts).toHaveLength(before + 1);
  }
  expect(f.stagePosts).toHaveLength(0); expect(f.errors).toEqual([]);
});

test("actual edit/delete dialogs, nested placement and confirmed compaction keep deleted entities absent", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  let bag = await createRootContainer(page, "Основная сумка");
  let item = await createItemInContainer(page, bag, "Вещь до изменения");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#newSubcontainerName").fill("Внутренний карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Внутренний карман"));
  const nested = Object.values(f.payload.containers).find(entry => entry.name === "Внутренний карман");
  expect(nested.id).toMatch(/^container-[0-9a-f-]{36}$/);
  expect(f.payload.layouts["layout-a"].arrangement.containers[nested.id].parentId).toBeTruthy();
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Изменённая вещь");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await synchronize(page, () => Object.values(f.payload.items).some(entry => entry.name === "Изменённая вещь"));
  item = page.locator("#packingView [data-item-id]").filter({ hasText: "Изменённая вещь" });
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.items).length === 0);
  bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Основная сумка" });
  await bag.getByRole("heading", { name: "Основная сумка" }).click();
  await page.locator("#rootContainerName").fill("Изменённая сумка");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Изменённая сумка"));
  bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Изменённая сумка" });
  await bag.getByRole("heading", { name: "Изменённая сумка" }).click();
  await page.locator("#rootContainerDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.payload.layouts["layout-a"].rootContainerIds).toEqual([]);
  await reloadApp(page);
  expect(Object.keys(f.payload.items)).toEqual([]);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(0);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

test("full application adopts a newer server baseline and next edit keeps the server change", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Первая сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const [id, previous] = Object.entries(f.payload.containers)[0];
  f.payload = { ...f.payload, containers: { ...f.payload.containers, [id]: { ...previous, note: "Изменено с другого устройства" } } };
  f.revision += 10;
  const remoteRevision = f.revision;
  await reloadApp(page);
  await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) =>
    key.includes(":checkpoint:") && JSON.parse(value)?.baseline?.stateRevision > 10))).toBe(true);
  const bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Первая сумка" });
  await bag.getByRole("heading", { name: "Первая сумка" }).click();
  await page.locator("#rootContainerName").fill("После серверного изменения");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await synchronize(page, () => f.payload.containers[id]?.name === "После серверного изменения");
  expect(f.payload.containers[id].note).toBe("Изменено с другого устройства");
  expect(f.posts.at(-1).body.baseStateRevision).toBe(remoteRevision);
  expect(f.posts.at(-1).body.causal.baseOperationId).toBeUndefined();
  expect(f.errors).toEqual([]);
});

test("actual sync reconciles different fields with a new ID and rechecks a second server change", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка сравнения");
  const item = await createItemInContainer(page, bag, "Исходное название", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let intervening = 0;
  f.beforeUpdate = () => {
    if (intervening < 2) {
      f.payload = structuredClone(f.payload); f.payload.items[id].weight += 50;
      f.revision++; intervening++;
    }
  };
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Новое название");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await synchronize(page, () => f.payload.items[id]?.name === "Новое название");
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(changes[1].body.payload.items[id].weight).toBe(150);
  expect(changes[2].body.payload.items[id].weight).toBe(200);
  expect(changes.slice(1).every(post => post.body.causal.dependsOn.length === 0 && !post.body.force)).toBe(true);
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Новое название" })).toHaveCount(1);
  expect(f.payload.items[id].weight).toBe(200); expect(f.errors).toEqual([]);
});

test("actual reconciliation accepts assembled API display mirrors without treating them as business changes", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка ответа сервера");
  const item = await createItemInContainer(page, bag, "Исходное имя сервера", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true; f.serverMirrors = true;
  f.beforeUpdate = () => {
    if (f.intervened) return;
    f.intervened = true; f.payload = structuredClone(f.payload); f.payload.items[id].weight = 140; f.revision++;
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Новое имя сервера");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await synchronize(page, () => f.payload.items[id]?.name === "Новое имя сервера" && f.payload.items[id]?.weight === 140);
  const changes = f.posts.slice(before); expect(changes).toHaveLength(2);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "committed"]);
  expect(changes[1].body.payload.activeLayoutId).toBeUndefined(); expect(changes[1].body.payload.packedItems).toBeUndefined();
  await reloadApp(page); expect(f.errors).toEqual([]);
});

test("actual sync retains the local version when the same field changed or the remote item was deleted", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка конфликта");
  const item = await createItemInContainer(page, bag, "Первоначальная вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  f.beforeUpdate = () => { f.payload = structuredClone(f.payload); f.payload.items[id].name = "На другом устройстве"; f.revision++; f.beforeUpdate = null; };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("На этом устройстве");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#syncStatus")).toContainText("Выбор отложен");
  expect(f.posts.slice(before)).toHaveLength(1);
  expect(f.payload.items[id].name).toBe("На другом устройстве");
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
  delete f.payload.items[id]; f.revision++;
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await expect(page.locator("#conflictList")).toContainText("Удалено");
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#syncStatus")).toContainText("Выбор отложен");
  expect(f.posts.slice(before)).toHaveLength(1); expect(f.payload.items[id]).toBeUndefined();
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("explicit UI conflict choices recompare another server edit and recover a lost chosen ACK", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка выбора");
  const item = await createItemInContainer(page, bag, "До выбора", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let attempt = 0;
  f.beforeUpdate = () => {
    attempt++;
    if (attempt <= 2) {
      f.payload = structuredClone(f.payload); f.payload.items[id].name = `Серверный вариант ${attempt}`; f.revision++;
    } else { f.lose = true; f.unknown = true; f.beforeUpdate = null; }
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Мой вариант");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#conflictList")).toContainText("Серверный вариант 1");
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await page.locator('#conflictList input[value="local"]').check();
  await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#conflictList")).toContainText("Серверный вариант 2", { timeout: 20000 });
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await page.locator('#conflictList input[value="remote"]').check();
  await page.locator("#conflictApplyBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3); expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(changes[1].body.payload.items[id].name).toBe("Мой вариант");
  expect(changes[2].body.payload.items[id].name).toBe("Серверный вариант 2");
  expect(changes.slice(1).every(post => !post.body.force && !post.body.forceOverwrite)).toBe(true);
  f.lose = false; f.unknown = false;
  await reloadApp(page); await synchronize(page, () => f.payload.items[id]?.name === "Серверный вариант 2");
  expect(f.posts.slice(before)).toHaveLength(3);
  await expect(page.locator("#conflictDialog")).not.toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Серверный вариант 2" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("a reconciled full UI action survives lost ACK and reload without another POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка восстановления");
  const item = await createItemInContainer(page, bag, "До сверки", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let attempt = 0;
  f.beforeUpdate = () => {
    if (attempt++ === 0) { f.payload = structuredClone(f.payload); f.payload.items[id].weight = 200; f.revision++; }
    else { f.lose = true; f.unknown = true; f.beforeUpdate = null; }
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("После сверки");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(2);
  const mergedId = f.posts.at(-1).operationId;
  await expect.poll(() => page.evaluate(operationId => Object.entries(localStorage).some(([key, value]) =>
    key.endsWith(operationId) && JSON.parse(value).reconciliation?.settled?.length), mergedId)).toBe(true);
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await synchronize(page, () => f.payload.items[id]?.name === "После сверки");
  expect(f.posts.filter(post => post.operationId === mergedId)).toHaveLength(1);
  expect(f.posts.slice(before)).toHaveLength(2);
  expect(f.payload.items[id].weight).toBe(200);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "После сверки" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("two queued UI edits settle a rejected predecessor and its unsent child before merging", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка цепочки");
  const item = await createItemInContainer(page, bag, "Перед цепочкой", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  let release;
  f.allowConflicts = true;
  f.beforeUpdate = async () => {
    f.beforeUpdate = null; f.payload = structuredClone(f.payload); f.payload.items[id].weight = 444; f.revision++;
    await new Promise(resolve => { release = resolve; });
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Первое изменение");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  try {
    const renamed = page.locator("#packingView [data-item-id]").filter({ hasText: "Первое изменение" });
    await renamed.locator(".item-title-hitarea").click(); await page.locator("#itemNote").fill("Второе изменение");
    await submitForm(page, "#saveItemBtn", "#itemNote");
    await expect.poll(() => page.evaluate(itemId => Object.entries(localStorage).some(([key, value]) =>
      key.startsWith("bike-packing-personal-save-v1:") && JSON.parse(value).action?.body.payload.items[itemId]?.note === "Второе изменение"), id)).toBe(true);
  } finally { release(); }
  await synchronize(page, () => f.payload.items[id]?.note === "Второе изменение" && f.payload.items[id]?.weight === 444);
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(f.receipts.get(changes[1].operationId).result.payload.code).toBe("dependency_rejected");
  expect(changes[1].body.causal.baseOperationId).toBe(changes[0].operationId);
  expect(f.payload.items[id].name).toBe("Первое изменение");
  expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(f.errors).toEqual([]);
});

test("lost ACK followed by a newer server edit adopts current data without replay and anchors the next UI edit", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка новой версии");
  const item = await createItemInContainer(page, bag, "До отправки", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.lose = true;
  f.beforeUpdate = () => { f.unknown = true; f.beforeUpdate = null; };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Принятое локальное изменение");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(1);
  f.payload = structuredClone(f.payload); f.payload.items[id].name = "Более свежая серверная версия"; f.payload.items[id].weight = 555;
  f.revision++; const adoptedRevision = f.revision;
  f.lose = false; f.unknown = false;
  await reloadApp(page); await page.locator("#syncBtn").click();
  const current = page.locator("#packingView [data-item-id]").filter({ hasText: "Более свежая серверная версия" });
  await expect(current).toHaveCount(1, { timeout: 20000 });
  await expect.poll(() => page.evaluate(revision => Object.entries(localStorage).some(([key, value]) =>
    key.includes(":checkpoint:") && JSON.parse(value).baseline?.stateRevision === revision), adoptedRevision)).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(1, "adoption must not replay the old intent or generate a business write");
  await current.locator(".item-title-hitarea").click(); await page.locator("#itemNote").fill("Редактирование после принятия");
  await submitForm(page, "#saveItemBtn", "#itemNote");
  await synchronize(page, () => f.payload.items[id]?.note === "Редактирование после принятия");
  expect(f.posts.slice(before)).toHaveLength(2);
  expect(f.posts.at(-1).body.baseStateRevision).toBe(adoptedRevision);
  expect(f.posts.at(-1).body.causal.dependsOn).toEqual([]);
  expect(f.payload.items[id].name).toBe("Более свежая серверная версия");
  expect(f.payload.items[id].weight).toBe(555); expect(f.errors).toEqual([]);
});

test("first authenticated UI change owns a durable create and survives a lost first ACK", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { fresh: true, lose: true });
  await page.locator("#newLayoutBtn").click();
  await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Самая первая укладка");
  await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  const bag = await createRootContainer(page, "Самая первая сумка");
  await createItemInContainer(page, bag, "Первая вещь");
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const first = structuredClone(f.posts[0]);
  expect(first.kind).toBe("list.create"); expect(first.listId).toMatch(/^personal-[a-f0-9]{64}$/);
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await synchronize(page, () => Object.values(f.payload.items).some(item => item.name === "Первая вещь"));
  expect(f.posts.filter(post => post.kind === "list.create")).toEqual([first]);
  expect(f.posts.every(post => post.listId === first.listId)).toBe(true);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

async function downloadRecovery(page) {
  const downloaded = page.waitForEvent("download");
  await page.locator("#personalSaveRecoveryDialog").getByRole("button", { name: "Скачать копию для восстановления", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("bike-packing-recovery.json");
  return JSON.parse(await readFile(await file.path(), "utf8"));
}

async function selectCatalogBatch(page, type, names, { action = "delete", ids = null } = {}) {
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  const selector = type === "item" ? "#itemsView [data-list-item-id]" : "#bagsView [data-root-card]";
  const card = index => ids ? page.locator(`${selector}[${type === "item" ? "data-list-item-id" : "data-root-card"}="${ids[index]}"]`)
    : page.locator(selector).filter({ hasText: names[index] });
  for (let index = 0; index < (ids || names).length; index++) {
    await card(index).click({ modifiers: ["Control"], position: { x: 8, y: 8 } });
  }
  await card(0).locator(`[data-${action}-${type === "item" ? "item" : "root"}]`).click();
  await expect(page.locator("#confirmDialog")).toContainText(type === "item" ? "выбранные вещи" : "выбранные сумки");
}

test("actual catalog bulk copies preserve all target IDs through lost ACK and later deletion of the sources", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context);
  const bag = await createRootContainer(page, "Источник сумка первая");
  await createItemInContainer(page, bag, "Источник вещь первая", { weight: "123" });
  await createItemInContainer(page, bag, "Источник вещь вторая", { weight: "234" });
  await createRootContainer(page, "Источник сумка вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2 && Object.keys(f.payload.containers).length === 2);
  const sourceIds = Object.keys(f.payload.items).sort(), before = f.posts.length;
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await selectCatalogBatch(page, "item", [], { action: "copy", ids: sourceIds });
  await page.locator("#confirmOkBtn").click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1); await expect.poll(() => f.injectedFailure).toBe(true);
  const copy = f.posts.at(-1), frozen = JSON.stringify(copy), mapping = copy.body.userCopy.entries;
  expect(mapping.map(entry => entry.sourceId).sort()).toEqual(sourceIds);
  expect(new Set(mapping.map(entry => entry.targetId)).size).toBe(2);
  for (const entry of mapping) {
    expect(copy.body.payload.items[entry.targetId].weight).toBe(copy.body.payload.items[entry.sourceId].weight);
    expect(copy.body.payload.items[entry.targetId].containerId).toBeUndefined();
    for (const layout of Object.values(copy.body.payload.layouts)) expect(layout.arrangement.items).not.toHaveProperty(entry.targetId);
  }
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => Object.keys(f.payload.items).length === 4);
  expect(f.posts.filter(post => post.operationId === copy.operationId)).toHaveLength(1); expect(JSON.stringify(copy)).toBe(frozen);
  await selectCatalogBatch(page, "item", [], { ids: sourceIds });
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => sourceIds.every(id => !f.payload.items[id]));
  expect(Object.keys(f.payload.items).sort()).toEqual(mapping.map(entry => entry.targetId).sort());
  const bagIds = Object.keys(f.payload.containers), beforeBags = f.posts.length;
  await selectCatalogBatch(page, "container", [], { action: "copy", ids: bagIds });
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 4);
  expect(f.posts.length).toBe(beforeBags + 1);
  const bagCopies = f.posts.at(-1).body.userCopy.entries;
  for (const entry of bagCopies) {
    expect(f.payload.containers[entry.targetId].childIds).toBeUndefined();
    expect(f.payload.containers[entry.targetId].itemIds).toBeUndefined();
    for (const layout of Object.values(f.payload.layouts)) {
      expect(layout.arrangement.containers).not.toHaveProperty(entry.targetId);
      expect(layout.arrangement.rootContainerIds).not.toContain(entry.targetId);
    }
  }
  await reloadApp(page);
  expect(Object.keys(f.payload.items).sort()).toEqual(mapping.map(entry => entry.targetId).sort());
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const outcome of ["confirmed", "lost ACK", "quota", "changed source"]) test(`ordinary photo owner copy ${type} ${outcome} retains exact source and never uploads again`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.at(-1)?.kind).toBe("photos.mutate");
  const sourceId = f.posts.at(-1).body.entityId;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const before = f.posts.length, source = structuredClone(f.payload[collection][sourceId]), stages = [...f.stagePosts];
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const originalJournal = await journal();
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${sourceId}"]`).click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  expect(f.posts).toHaveLength(before); expect(await journal()).toEqual(originalJournal);
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Copy quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  if (outcome === "changed source") f.afterOwnerRead = data => { data.owner.payload.name = "Изменён другим устройством"; };
  if (outcome === "lost ACK") f.loseFormOwner = true;
  await submitForm(page, "#confirmOkBtn");
  if (["quota", "changed source"].includes(outcome)) {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    expect(local[collection][sourceId].photos).toEqual(source.photos);
    expect(Object.keys(local[collection])).toEqual(Object.keys(f.payload[collection]));
    expect(await journal()).toEqual(originalJournal); expect(f.posts).toHaveLength(before);
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
    const copy = Object.values(draft[collection]).find(owner => !Object.hasOwn(f.payload[collection], owner.id));
    expect(copy).toBeTruthy(); expect(copy.photos.map(photo => photo.status)).toEqual(["pending", "pending"]);
    expect(copy.note).toBe(source.note); expect(copy.photos.map(photo => photo.id)).not.toEqual(source.photos.map(photo => photo.id));
  } else {
    await page.locator("#syncBtn").click();
    await expect.poll(() => f.posts.length).toBe(before + 1);
    const action = structuredClone(f.posts.at(-1)), targetId = action.body.entityId;
    expect(action.kind).toBe("photos.mutate"); expect(action.body.copySource.payload).toEqual(source);
    expect(action.body.copySource.entityId).toBe(sourceId); expect(action.body.baseEntityRevision).toBe(0);
    expect(action.body.changes.map(change => change.action)).toEqual(["copy", "copy"]);
    expect(f.payload[collection][targetId].photos.map(photo => photo.id)).toEqual(action.body.changes.map(change => change.photoId));
    if (outcome === "lost ACK") {
      await expect.poll(() => f.injectedFailure).toBe(true); await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
      await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(before + 1);
      f.loseFormOwner = false; f.hiddenFormOwner = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
    } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
    expect(f.posts.at(-1)).toEqual(action); expect(f.payload[collection][sourceId]).toEqual(source);
    const copiedPhotos = structuredClone(f.payload[collection][targetId].photos);
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    if (type === "item") await page.locator("#itemsView .item-title").filter({ hasText: /^Карточка со всеми файлами$/ }).click();
    else await page.locator(`#bagsView [data-root-card="${sourceId}"] [data-root-title]`).click();
    await page.locator(`#${prefix}DeleteForeverBtn`).click(); await submitForm(page, "#confirmOkBtn");
    await synchronize(page, () => !f.payload[collection][sourceId]);
    expect(f.payload[collection][targetId].photos).toEqual(copiedPhotos); expect(f.posts).toHaveLength(before + 2);
    await reloadApp(page); expect(f.payload[collection][sourceId]).toBeUndefined(); expect(f.payload[collection][targetId].photos).toEqual(copiedPhotos);
  }
  expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

for (const type of ["item", "container"]) for (const outcome of ["confirmed", "lost ACK", "quota", "last source changed", "cancel lost ACK"]) test(`selected photo owner batch ${type} ${outcome} preserves the entire frozen selection`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, collection, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.at(-1)?.kind).toBe("photos.mutate");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const firstId = f.posts.at(-1).body.entityId, sourceIds = [firstId, `${type}-second-source`, `${type}-empty-source`];
  // Simulate two already confirmed remote catalog owners. All interactions
  // under test below use the actual selected-card Copy and recovery buttons.
  for (const [index, id] of sourceIds.slice(1).entries()) {
    const source = structuredClone(f.payload[collection][firstId]); source.id = id; source.name = `Источник ${index + 2}`;
    source.photos = index === 0 ? source.photos.map(photo => { const id = randomUUID(); return { ...photo, id, photoId: id, assetId: randomUUID() }; }) : [];
    f.payload[collection][id] = source;
    for (const photo of source.photos) f.photoRevisions.set(photo.id, f.revision + 1);
  }
  f.revision++; await reloadApp(page);
  const server = structuredClone(f.payload), before = f.posts.length, stages = [...f.stagePosts];
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const originalJournal = await journal();
  await selectCatalogBatch(page, type, [], { action: "copy", ids: sourceIds });
  expect(await journal()).toEqual(originalJournal); expect(f.posts).toHaveLength(before);
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Batch quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  if (outcome === "last source changed") f.afterOwnerRead = data => {
    if (data.owner.entityId === sourceIds.at(-1)) data.owner.payload.name = "Новая серверная версия";
  };
  f.loseFormOwner = outcome === "lost ACK"; f.dropCopyBeforeCommit = outcome === "cancel lost ACK";
  await submitForm(page, "#confirmOkBtn");
  if (["quota", "last source changed"].includes(outcome)) {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    const recovery = await downloadRecovery(page), draft = recovery.unconfirmedMemoryDraft;
    const copies = Object.values(draft[collection]).filter(owner => !Object.hasOwn(server[collection], owner.id));
    expect(copies).toHaveLength(3); expect(copies.reduce((sum, owner) => sum + owner.photos.length, 0)).toBe(4);
    expect(copies.flatMap(owner => owner.photos).every(photo => photo.status === "pending")).toBe(true);
    expect(await journal()).toEqual(originalJournal); expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(server);
  } else {
    await page.locator("#syncBtn").click(); await expect.poll(() => f.posts.length).toBe(before + 1);
    const action = structuredClone(f.posts.at(-1)); expect(action.body.action).toBe("copy-batch");
    expect(action.body.owners.map(owner => owner.copySource.entityId).sort()).toEqual([...sourceIds].sort());
    expect(action.body.changes).toHaveLength(4);
    for (const owner of action.body.owners) expect(owner.copySource.payload).toEqual(server[collection][owner.copySource.entityId]);
    if (outcome === "cancel lost ACK") {
      await expect.poll(() => f.injectedFailure).toBe(true); f.cancelPhotoAction = action;
      await reloadApp(page, { recovery: true });
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await expect(cancel).toBeVisible(); f.loseCancellation = true; f.hideCancellationReceipt = true;
      await cancel.click(); await expect(cancel).toBeEnabled(); expect(f.payload).toEqual(server);
      await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
      await expect(recovery.getByRole("status")).toContainText("Выбор отложен"); expect(f.posts).toHaveLength(before + 2);
      expect((await downloadRecovery(page)).journalEntries.length).toBeGreaterThan(0);
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      expect(f.posts).toHaveLength(before + 3); expect(f.payload).toEqual(server); await reloadApp(page);
    } else {
      if (outcome === "lost ACK") {
        await expect.poll(() => f.injectedFailure).toBe(true); await reloadApp(page, { recovery: true });
        const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
        await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(before + 1);
        f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
        await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены"); await reloadApp(page);
      } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
      expect(f.posts.at(-1)).toEqual(action);
      for (const owner of action.body.owners) {
        const target = f.payload[collection][owner.entityId]; expect(target.note).toBe(owner.copySource.payload.note);
        expect(target.photos.map(photo => photo.id)).toEqual(action.body.changes.filter(change => change.entityId === owner.entityId).map(change => change.photoId));
        expect(target.photos.every(photo => photo.status === "synced")).toBe(true);
      }
      await selectCatalogBatch(page, type, [], { ids: sourceIds }); await submitForm(page, "#confirmOkBtn");
      await synchronize(page, () => sourceIds.every(id => !f.payload[collection][id]));
      await reloadApp(page); expect(f.posts).toHaveLength(before + 2);
      for (const owner of action.body.owners) expect(f.payload[collection][owner.entityId]).toBeTruthy();
    }
  }
  expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

for (const batch of [false, true]) for (const type of ["item", "container"]) for (const outcome of ["source", "copy", "both", "lost deletion", "quota", "cancel both", "cancel both lost ACK"]) test(`pending photo copy${batch ? " batch" : ""} ${type} deletion ${outcome} preserves its frozen result and exact dependencies`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.at(-1)?.kind).toBe("photos.mutate");
  const sourceId = f.posts.at(-1).body.entityId;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const sourceIds = [sourceId];
  if (batch) {
    for (const [index, id] of [`${type}-second-source`, `${type}-empty-source`].entries()) {
      const source = structuredClone(f.payload[collection][sourceId]); source.id = id; source.name = `Источник ${index + 2}`;
      source.photos = index === 0 ? source.photos.map(photo => { const id = randomUUID(); return { ...photo, id, photoId: id, assetId: randomUUID() }; }) : [];
      f.payload[collection][id] = source; sourceIds.push(id);
      for (const photo of source.photos) f.photoRevisions.set(photo.id, f.revision + 1);
    }
    f.revision++; await reloadApp(page);
  }
  const before = f.posts.length, server = structuredClone(f.payload), stages = [...f.stagePosts], cancelled = outcome.startsWith("cancel");
  // Storage enumeration order is unspecified across reload; compare exact
  // records by identity without using UUID order to schedule any action.
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action).sort((a, b) => a.action.operationId.localeCompare(b.action.operationId)));
  let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  if (cancelled) { f.beforeCopyDispatch = hold; f.dropCopyBeforeCommit = true; }
  else { f.afterFormCommit = hold; f.loseFormOwner = !["lost deletion", "quota"].includes(outcome); }
  try {
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    if (batch) await selectCatalogBatch(page, type, [], { action: "copy", ids: sourceIds });
    else await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${sourceId}"]`).click();
    await submitForm(page, "#confirmOkBtn"); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const originalRecords = await records(), form = originalRecords.find(record => batch ? record.action.body.action === "copy-batch" : record.action.body.copySource);
    const targetId = batch ? form.action.body.owners.find(owner => owner.copySource.entityId === sourceId).entityId : form.action.body.entityId;
    const selected = ["source", "quota"].includes(outcome) ? [sourceId] : outcome === "copy" ? [targetId] : [targetId, sourceId];
    if (batch && outcome !== "quota") {
      if (outcome !== "source") selected.push(form.action.body.owners.find(owner => owner.copySource.entityId === sourceIds.at(-1)).entityId);
      if (outcome !== "copy") selected.push(sourceIds.at(-1));
    }
    const children = [];
    for (const id of selected) {
      if (type === "item") await page.locator(`#itemsView [data-list-item-id="${id}"] .item-title`).click();
      else await page.locator(`#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      await expect(dialog).toBeVisible(); await page.locator(`#${prefix}DeleteForeverBtn`).click();
      await expect(page.locator("#confirmDialog")).toBeVisible();
      if (outcome === "quota") await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Pending copy deletion quota", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await submitForm(page, "#confirmOkBtn");
      if (outcome === "quota") {
        await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
        expect(await records()).toEqual(originalRecords); expect(f.posts).toHaveLength(before + 1);
        const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
        expect(local[collection][sourceId].photos).toEqual(server[collection][sourceId].photos);
        expect(local[collection][targetId].photos.map(photo => photo.status)).toEqual(["pending", "pending"]);
        expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]); return;
      }
      await expect(dialog).not.toBeVisible();
      const saved = await records(), child = saved.find(record => record.action.body.userDeletion?.id === id);
      expect(child).toBeTruthy(); expect(saved.find(record => record.action.operationId === form.action.operationId)).toEqual(form);
      const parentId = children.at(-1)?.action.operationId || form.action.operationId;
      expect(child.action.body.causal.baseOperationId).toBe(parentId);
      expect(child.action.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([...new Set([parentId, form.action.operationId])]);
      expect(child.action.body.photoResults).toEqual(batch ? { version: 2, operationId: form.action.operationId,
        owners: form.action.body.owners.map(({ entityType, entityId }) => ({ entityType, entityId })) }
        : { version: 1, operationId: form.action.operationId, entityType: type, entityId: targetId });
      expect(child.action.body.payload[collection][id]).toBeUndefined(); children.push(child);
    }
    const retained = await records(); f.cancelPhotoAction = form.action;
    if (outcome === "lost deletion") f.beforeUpdate = () => { f.lose = true; f.unknown = true; };
    f.beforeCopyDispatch = null; f.afterFormCommit = null; release();
    await expect.poll(() => f.injectedFailure).toBe(true);
    await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog");
    if (cancelled) {
      const cancel = recovery.locator("[data-cancel-photo-upload]"); await expect(cancel).toBeVisible();
      if (outcome.endsWith("lost ACK")) {
        f.loseCancellation = true; f.hideCancellationReceipt = true;
        await cancel.click(); await expect(cancel).toBeEnabled(); expect(f.payload).toEqual(server);
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      }
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible();
      await expect(page.locator("#confirmDialog")).toContainText(`действий: ${1 + children.length}`);
      await page.locator("#confirmCancelBtn").click(); await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 2 + children.length); expect(await records()).toEqual(retained);
      for (const child of children) expect(f.receipts.get(child.action.operationId).result.payload.code).toBe("dependency_rejected");
      await reloadApp(page, { recovery: true }); await cancel.click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      expect(f.posts).toHaveLength(before + 3 + children.length); expect(f.payload).toEqual(server);
    } else {
      const resume = recovery.locator("[data-resume-photo-upload]"); await expect(resume).toBeVisible();
      const beforeRecovery = f.posts.length;
      await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(beforeRecovery);
      f.lose = false; f.unknown = false; f.beforeUpdate = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
      await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      expect(f.posts).toHaveLength(before + 1 + children.length);
      expect(f.posts.slice(before).map(post => post.operationId)).toEqual([form.action.operationId, ...children.map(child => child.action.operationId)]);
      for (const id of selected) expect(f.payload[collection][id]).toBeUndefined();
      if (!selected.includes(targetId)) {
        expect(f.payload[collection][targetId].photos.map(photo => photo.id)).toEqual(form.action.body.changes.filter(change => change.entityId === targetId).map(change => change.photoId));
        expect(f.payload[collection][targetId].photos.every(photo => photo.status === "synced")).toBe(true);
        expect(f.payload[collection][targetId].note).toBe(server[collection][sourceId].note);
      }
      if (batch) for (const owner of form.action.body.owners.filter(owner => !selected.includes(owner.entityId))) {
        expect(f.payload[collection][owner.entityId].photos.map(photo => photo.id)).toEqual(form.action.body.changes.filter(change => change.entityId === owner.entityId).map(change => change.photoId));
        expect(f.payload[collection][owner.entityId].note).toBe(owner.copySource.payload.note);
      }
    }
    for (const child of children) expect(f.posts.find(post => post.operationId === child.action.operationId).body).toEqual(child.action.body);
    expect(f.posts.find(post => post.operationId === form.action.operationId).body).toEqual(form.action.body);
    expect(f.stagePosts).toEqual(stages); await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.errors).toEqual([]);
  } finally { f.beforeCopyDispatch = null; f.afterFormCommit = null; release?.(); }
});

for (const type of ["item", "container"]) for (const lost of [false, true]) test(`ordinary photo owner copy ${type} cancellation${lost ? " lost ACK" : ""} retains the chosen copy until an explicit decision`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, collection, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.at(-1)?.kind).toBe("photos.mutate");
  const sourceId = f.posts.at(-1).body.entityId;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const before = f.posts.length, server = structuredClone(f.payload), stageIds = [...f.stagePosts];
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${sourceId}"]`).click();
  f.dropCopyBeforeCommit = true; await submitForm(page, "#confirmOkBtn"); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1); await expect.poll(() => f.injectedFailure).toBe(true);
  f.cancelPhotoAction = structuredClone(f.posts.at(-1));
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
  await expect(cancel).toBeVisible();
  if (lost) {
    f.loseCancellation = true; f.hideCancellationReceipt = true;
    await cancel.click(); await expect(cancel).toBeEnabled(); expect(f.payload).toEqual(server);
    await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
  }
  await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmCancelBtn").click(); await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
  expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 2);
  expect(f.receipts.get(f.cancelPhotoAction.operationId).result.payload.code).toBe("operation_cancelled");
  const retained = await downloadRecovery(page);
  expect(retained.unconfirmedMemoryDraft || retained.journalEntries.length).toBeTruthy();
  await reloadApp(page, { recovery: true }); await cancel.click();
  await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.posts).toHaveLength(before + 3); expect(f.stagePosts).toEqual(stageIds); expect(f.payload).toEqual(server);
  expect(f.posts.at(-1).kind).toBe("list.update");
  await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.errors).toEqual([]);
});

test("single item and empty bag catalog copy buttons use the same frozen personal queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Одиночная сумка");
  await createItemInContainer(page, bag, "Одиночная вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const itemId = Object.keys(f.payload.items)[0], bagId = Object.keys(f.payload.containers)[0], before = f.posts.length;
  await page.locator('[data-view="items"]').click();
  await page.locator(`[data-copy-item="${itemId}"]`).click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  expect(f.posts.length).toBe(before + 1);
  expect(f.posts.at(-1).body.userCopy.entries).toEqual([{ type: "item", sourceId: itemId, targetId: expect.any(String) }]);
  await page.locator('[data-view="bags"]').click();
  await page.locator(`[data-copy-root="${bagId}"]`).click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  expect(f.posts.length).toBe(before + 2);
  expect(f.posts.at(-1).body.userCopy.entries).toEqual([{ type: "container", sourceId: bagId, targetId: expect.any(String) }]);
  expect(f.errors).toEqual([]);
});

test("quota during real bulk copy retains every new ID in the recovery draft without a partial queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка копирования");
  await createItemInContainer(page, bag, "Копирование первая"); await createItemInContainer(page, bag, "Копирование вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  await selectCatalogBatch(page, "item", [], { action: "copy", ids: Object.keys(f.payload.items) });
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(Object.keys(copy.unconfirmedMemoryDraft.items)).toHaveLength(4);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(Object.keys(f.payload.items)).toHaveLength(2); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

test("actual catalog bulk deletes use one frozen action per selection and recover lost ACK without partial replay", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context);
  const first = await createRootContainer(page, "Пакет сумка первая");
  await createItemInContainer(page, first, "Пакет вещь первая");
  await createItemInContainer(page, first, "Пакет вещь вторая");
  await createRootContainer(page, "Пакет сумка вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2 && Object.keys(f.payload.containers).length === 2);
  const itemIds = Object.keys(f.payload.items).sort(), bagIds = Object.keys(f.payload.containers).sort();
  const before = f.posts.length; f.lose = true;
  f.beforeUpdate = async () => { f.unknown = true; };
  await selectCatalogBatch(page, "item", ["Пакет вещь первая", "Пакет вещь вторая"]);
  await page.locator("#confirmOkBtn").click();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const deleted = f.posts.at(-1), frozen = JSON.stringify(deleted);
  expect(deleted.body.userDeletion).toEqual({ type: "batch", operations: itemIds.map(() => ({ type: "item", id: expect.any(String) })) });
  expect(deleted.body.userDeletion.operations.map(entry => entry.id).sort()).toEqual(itemIds);
  expect(deleted.body.payload.items).toEqual({});
  expect(Object.keys(deleted.body.payload.containers).sort()).toEqual(bagIds);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page);
  await synchronize(page, () => Object.keys(f.payload.items).length === 0);
  expect(f.posts.filter(post => post.operationId === deleted.operationId)).toHaveLength(1);
  expect(JSON.stringify(deleted)).toBe(frozen);
  const afterItems = f.posts.length;
  await selectCatalogBatch(page, "container", ["Пакет сумка первая", "Пакет сумка вторая"]);
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.posts.length).toBe(afterItems + 1);
  expect(f.posts.at(-1).body.userDeletion.operations.map(entry => entry.id).sort()).toEqual(bagIds);
  expect(f.payload.layouts["layout-a"].arrangement.rootContainerIds).toEqual([]);
  await reloadApp(page);
  expect(f.payload.items).toEqual({}); expect(f.payload.containers).toEqual({});
  expect(f.errors).toEqual([]);
});

test("deleting the last bag and its inner pocket keeps the items outside all layouts through reload", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Последняя сумка");
  await createItemInContainer(page, bag, "Оставленная вещь");
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#newSubcontainerName").fill("Удаляемый карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const itemId = Object.keys(f.payload.items)[0], rootId = f.payload.layouts["layout-a"].arrangement.rootContainerIds[0];
  const before = f.posts.length;
  await bag.getByRole("heading", { name: "Последняя сумка" }).click();
  await page.locator("#rootContainerDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.posts.length).toBe(before + 1);
  expect(f.posts.at(-1).body.userDeletion).toEqual({ type: "container", id: rootId });
  expect(f.posts.at(-1).body.force).not.toBe(true); expect(f.posts.at(-1).body.forceOverwrite).not.toBe(true);
  expect(f.payload.items[itemId].name).toBe("Оставленная вещь");
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({});
  await reloadApp(page); await page.locator('[data-view="items"]').click();
  await expect(page.locator(`[data-list-item-id="${itemId}"]`)).toContainText("Оставленная вещь");
  expect(f.errors).toEqual([]);
});

async function confirmActiveLayoutDeletion(page) {
  await page.locator("#editLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await page.locator("#deleteEditedLayoutBtn").click();
  await expect(page.locator("#confirmDialog")).toContainText("Удалить укладку");
}

test("actual layout deletion fixes one empty replacement through lost ACK and later uses an existing layout", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Оставляемая сумка");
  await createItemInContainer(page, bag, "Оставляемая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const before = f.posts.length, itemIds = Object.keys(f.payload.items), bagIds = Object.keys(f.payload.containers);
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await confirmActiveLayoutDeletion(page); await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const action = f.posts.at(-1), replacementId = Object.keys(action.body.payload.layouts)[0];
  expect(action.body.userDeletion).toEqual({ type: "layout", id: "layout-a" });
  expect(Object.keys(action.body.payload.layouts)).toEqual([replacementId]); expect(replacementId).not.toBe("layout-a");
  expect(Object.keys(action.body.payload.items)).toEqual(itemIds); expect(Object.keys(action.body.payload.containers)).toEqual(bagIds);
  expect(action.body.payload.layouts[replacementId].arrangement.items).toEqual({});
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => !f.payload.layouts["layout-a"]);
  await expect(page.locator("#layoutSelect")).toHaveValue(replacementId);
  expect(f.posts.filter(post => post.operationId === action.operationId)).toHaveLength(1);
  await page.locator("#newLayoutBtn").click(); await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Вторая для удаления"); await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await synchronize(page, () => Object.keys(f.payload.layouts).length === 2);
  const secondId = Object.keys(f.payload.layouts).find(id => id !== replacementId), beforeSecond = f.posts.length;
  await confirmActiveLayoutDeletion(page); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => !f.payload.layouts[secondId]);
  expect(f.posts.length).toBe(beforeSecond + 1); expect(Object.keys(f.payload.layouts)).toEqual([replacementId]);
  expect(Object.keys(f.payload.items)).toEqual(itemIds); expect(Object.keys(f.payload.containers)).toEqual(bagIds);
  await reloadApp(page); await expect(page.locator("#layoutSelect")).toHaveValue(replacementId); expect(f.errors).toEqual([]);
});

test("quota during layout deletion keeps its edit window open and exports the complete replacement draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Укладка сбой сумка");
  await createItemInContainer(page, bag, "Укладка сбой вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await confirmActiveLayoutDeletion(page);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.layouts["layout-a"]).toBeUndefined(); expect(Object.keys(draft.layouts)).toHaveLength(1);
  const replacementId = Object.keys(draft.layouts)[0];
  expect(replacementId).toMatch(/^layout-[0-9a-f-]{36}$/); expect(draft.layouts[replacementId].id).toBe(replacementId);
  expect(draft.layouts[replacementId].arrangement.rootContainerIds).toEqual([]);
  expect(Object.keys(draft.items)).toEqual(Object.keys(f.payload.items)); expect(Object.keys(draft.containers)).toEqual(Object.keys(f.payload.containers));
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.payload.layouts["layout-a"]).toBeTruthy(); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function openPreparedHistoryRestore(page, f, snapshot, scoped = false) {
  f.history = [{ id: 101, listId: f.listId, source: "bike_packing_list_history", createdAt: "2026-09-05T10:00:00Z",
    snapshotKind: scoped ? "undo" : "daily", changeScope: scoped ? "layout" : "global", affectedLayoutIds: scoped ? ["layout-a"] : [],
    action: { type: "layout_change" }, payload: structuredClone(snapshot) }];
  await page.locator("#menuBtn").click(); await page.locator("#historyBtn").click();
  await expect(page.locator("#historyDialog [data-restore-history]")).toHaveCount(1);
  await page.locator("#historyDialog [data-restore-history]").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
}

async function synchronizePhotoHistory(page, condition) {
  await page.locator("#syncBtn").click();
  await expect.poll(condition, { timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
}

for (const type of ["item", "container"]) for (const outcome of ["lost ACK", "quota", "rejected"]) test(`actual photo history ${type} keeps exact files and chosen restore (${outcome})`, async ({ page, context }) => {
  test.setTimeout(180000);
  const { f, collection, button, dialog, ownerId, originalPhotos } = await prepareExistingPhotoEdit(page, context, { type });
  const history = structuredClone(f.payload);
  await submitForm(page, button); await expect(dialog).not.toBeVisible();
  await synchronizePhotoHistory(page, () => f.payload[collection][ownerId].photos.length === 1);
  const current = structuredClone(f.payload), before = f.posts.length, stages = [...f.stagePosts];
  f.historyHeads = originalPhotos.map(reference => ({ photoId: reference.id, assetId: reference.assetId, entityType: type,
    entityId: ownerId, revision: f.revision, deleted: !current[collection][ownerId].photos.some(photo => photo.id === reference.id), reference }));
  await page.locator('[data-view="packing"]').click();
  await openPreparedHistoryRestore(page, f, history);
  if (outcome === "quota") await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.kind === "list.restore") throw new DOMException("History quota", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  if (outcome === "lost ACK") { f.lose = true; f.beforeUpdate = () => { f.unknown = true; }; }
  if (outcome === "rejected") {
    f.allowConflicts = true;
    f.beforeUpdate = action => {
      if (action.kind !== "list.restore" || f.restoreRejected) return;
      f.restoreRejected = true; f.payload = structuredClone(f.payload); f.payload[collection][ownerId].weight = 789; f.revision++;
    };
  }
  await page.locator("#confirmOkBtn").click();
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    await expect(page.locator("#historyDialog")).toBeVisible(); expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(current);
    const recovery = await downloadRecovery(page); expect(recovery.unconfirmedMemoryDraft[collection][ownerId].photos).toEqual(originalPhotos);
    await reloadApp(page); expect(f.payload[collection][ownerId].photos).toEqual(current[collection][ownerId].photos);
  } else {
    await expect(page.locator("#historyDialog")).not.toBeVisible(); await page.locator("#syncBtn").click();
    if (outcome === "lost ACK") {
      await expect.poll(() => f.injectedFailure).toBe(true);
      const restore = f.posts.at(-1); expect(restore.kind).toBe("list.restore"); expect(restore.body.historyRestore.version).toBe(2);
      expect(restore.body.payload[collection][ownerId].photos).toEqual(originalPhotos);
      f.lose = false; f.unknown = false; f.beforeUpdate = null;
      await reloadApp(page); await synchronizePhotoHistory(page, () => f.payload[collection][ownerId].photos.length === 2);
      expect(f.posts).toHaveLength(before + 1); expect(f.posts.filter(post => post.operationId === restore.operationId)).toHaveLength(1);
    } else {
      await expect(page.locator("#confirmTitle")).toHaveText("Восстановление не применено");
      await page.locator("#confirmCancelBtn").click(); expect(f.posts).toHaveLength(before + 1);
      f.beforeUpdate = null;
      await page.locator("#syncBtn").click(); await expect(page.locator("#confirmTitle")).toHaveText("Восстановление не применено");
      await page.locator("#confirmOkBtn").click();
      await expect.poll(() => f.posts.length).toBe(before + 2);
      await reloadApp(page); await synchronizePhotoHistory(page, () => f.payload[collection][ownerId].weight === 789);
      expect(f.payload[collection][ownerId].photos).toEqual(current[collection][ownerId].photos);
      expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.historyRestore).toBeUndefined();
    }
  }
  expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});

for (const scoped of [false, true]) test(`actual ${scoped ? "scoped" : "full"} history restore survives lost ACK and reload with one fixed action`, async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "До восстановления");
  await createItemInContainer(page, bag, "Сохранённая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const snapshot = structuredClone(f.payload), originalId = Object.keys(snapshot.containers)[0];
  await createRootContainer(page, "После точки истории");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const extraId = Object.keys(f.payload.containers).find(id => id !== originalId), before = f.posts.length;
  await openPreparedHistoryRestore(page, f, snapshot, scoped);
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#historyDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts).toHaveLength(before + 1);
  const restored = f.posts.at(-1); expect(restored.kind).toBe("list.restore");
  expect(restored.body.historyRestore.historyId).toBe(101);
  expect(restored.body.historyRestore.layoutIds).toEqual(scoped ? ["layout-a"] : []);
  expect(restored.body.payload.layouts["layout-a"].arrangement.rootContainerIds).toEqual([originalId]);
  expect(Boolean(restored.body.payload.containers[extraId])).toBe(scoped);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 1);
  expect(f.posts).toHaveLength(before + 1); expect(f.posts.filter(post => post.operationId === restored.operationId)).toHaveLength(1);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(1);
  await createRootContainer(page, "Следующая после восстановления");
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 2);
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.historyRestore).toBeUndefined();
  expect(f.errors).toEqual([]);
});

test("rejected history restore offers cancellation then rechecks a changed server and recovers the kept version after lost ACK", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context), bag = await createRootContainer(page, "До отклонённой истории");
  await createItemInContainer(page, bag, "Серверная вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const snapshot = structuredClone(f.payload), itemId = Object.keys(snapshot.items)[0];
  await createRootContainer(page, "Актуальная вторая сумка"); await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const before = f.posts.length; f.allowConflicts = true; f.serverMirrors = true;
  await openPreparedHistoryRestore(page, f, snapshot);
  f.beforeUpdate = body => {
    if (body.kind !== "list.restore" || f.restoreRejected) return;
    f.restoreRejected = true; f.payload = structuredClone(f.payload); f.payload.items[itemId].weight = 500; f.revision++;
  };
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#historyDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmTitle")).toHaveText("Восстановление не применено");
  await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
  expect(f.posts.length).toBe(before + 1); expect(Object.keys(f.payload.containers)).toHaveLength(2);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(1);
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
  f.beforeUpdate = body => {
    if (body.kind !== "list.update" || f.keepRejected) return;
    f.keepRejected = true; f.payload = structuredClone(f.payload); f.payload.items[itemId].weight = 900; f.revision++;
  };
  await page.locator("#confirmOkBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 2);
  await expect(page.locator("#confirmDialog")).toBeVisible(); await expect(page.locator("#confirmTitle")).toHaveText("Восстановление не применено");
  const rejectedKeep = f.posts.at(-1); expect(f.receipts.get(rejectedKeep.operationId).operation.state).toBe("rejected");
  f.lose = true; f.beforeUpdate = () => { f.unknown = true; };
  await page.locator("#confirmOkBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 3); const kept = f.posts.at(-1);
  expect(kept.kind).toBe("list.update"); expect(kept.body.historyRestore).toBeUndefined(); expect(kept.body.force).toBe(false);
  expect(kept.body.payload.items[itemId].weight).toBe(900); expect(Object.keys(kept.body.payload.containers)).toHaveLength(2);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2 && f.payload.items[itemId].weight === 900);
  expect(f.posts.length).toBe(before + 3); expect(new Set(f.posts.slice(before).map(post => post.operationId)).size).toBe(3);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(2);
  await openPreparedHistoryRestore(page, f, snapshot); await page.locator("#confirmCancelBtn").click(); expect(f.errors).toEqual([]);
});

test("quota keeping current data after a rejected history restore exports the chosen candidate and retains old operations", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка для отказа истории");
  await createItemInContainer(page, bag, "Сохранённая сервером вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const snapshot = structuredClone(f.payload), itemId = Object.keys(snapshot.items)[0];
  await createRootContainer(page, "Не отменяемая серверная сумка"); await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  f.allowConflicts = true;
  await openPreparedHistoryRestore(page, f, snapshot);
  f.beforeUpdate = body => {
    if (body.kind !== "list.restore" || f.restoreRejected) return;
    f.restoreRejected = true; f.payload = structuredClone(f.payload); f.payload.items[itemId].weight = 600; f.revision++;
  };
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#historyDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmTitle")).toHaveText("Восстановление не применено");
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toHaveLength(2); expect(copy.unconfirmedMemoryDraft.items[itemId].weight).toBe(600);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

test("quota before history restore keeps the history window and complete recovery candidate without changing the list", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), snapshot = structuredClone(f.payload);
  await createRootContainer(page, "Не теряем при отказе");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await openPreparedHistoryRestore(page, f, snapshot);
  const before = f.posts.length, server = structuredClone(f.payload);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#historyDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.containers).toEqual({}); expect(copy.unconfirmedMemoryDraft.items).toEqual({});
  expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(server); expect(f.errors).toEqual([]);
});

async function prepareArchiveUi(page, context, mode) {
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка из выбранного архива");
  await createItemInContainer(page, bag, "Вещь архива", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const source = structuredClone(f.payload), itemId = Object.keys(source.items)[0];
  source.activeLayoutId = "layout-a"; source.items[itemId].weight = 45;
  source.layouts["layout-a"].arrangement.itemQuantities[itemId] = 3;
  source.layouts["layout-a"].arrangement.packedItems[itemId] = true;
  await createRootContainer(page, "Более новая серверная сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const bytes = Buffer.from(await (await createBackupZip({ format: "bike-packing-backup", version: 1, createdAt: "2026-09-01T12:00:00Z", language: "ru", state: source, photos: [] })).arrayBuffer());
  await page.locator("#menuBtn").click(); await page.locator("#backupBtn").click();
  await page.locator("#backupFileInput").setInputFiles({ name: "selected.bikepacking-backup.zip", mimeType: "application/zip", buffer: bytes });
  await expect(page.locator('[data-backup-layout-id="layout-a"]')).toBeVisible();
  if (mode === "copy") await page.locator('[data-backup-restore-mode][value="copy"]').check();
  await page.locator(mode === "full" ? "#backupRestoreFullBtn" : "#backupRestoreSelectedBtn").click();
  await expect(page.locator("#confirmDialog"), await page.locator("#backupStatus").textContent()).toBeVisible();
  return { f, source, itemId };
}

async function preparePhotoArchiveUi(page, context, mode, { count = 2 } = {}) {
  const f = await setup(page, context, { photoEdit: true }), bag = await createRootContainer(page, "Сумка файлового архива");
  await createItemInContainer(page, bag, "Вещь файлового архива", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const source = structuredClone(f.payload), itemId = Object.keys(source.items)[0], bagId = Object.keys(source.containers)[0];
  source.activeLayoutId = "layout-a"; source.items[itemId].weight = 45;
  source.layouts["layout-a"].arrangement.itemQuantities[itemId] = 3;
  const photos = [], entries = [], originals = [];
  for (const index of Array.from({ length: count }, (_, index) => index)) {
    const id = `archive-photo-${index}`, bytes = Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"), Buffer.from(`frozen original ${index}`)]);
    const thumb = Buffer.concat([bytes, Buffer.from("thumbnail")]); originals.push(bytes);
    photos.push({ id, sha256: createHash("sha256").update(bytes).digest("hex"), file: `photos/${id}/file`, thumb: `photos/${id}/thumb`,
      fileName: `архив-${index}.png`, type: "image/png", thumbType: "image/png", size: bytes.length, width: 1, height: 1, entityType: "item", entityId: itemId });
    entries.push({ name: `photos/${id}/file`, content: new Blob([bytes], { type: "image/png" }) }, { name: `photos/${id}/thumb`, content: new Blob([thumb], { type: "image/png" }) });
  }
  for (const owner of [source.items[itemId], source.containers[bagId]]) owner.photos = photos.map(photo => ({ id: photo.id }));
  const bytes = Buffer.from(await (await createBackupZip({ format: "bike-packing-backup", version: 1, createdAt: "2026-09-01T12:00:00Z", language: "ru", state: source, photos }, entries)).arrayBuffer());
  await page.locator("#menuBtn").click(); await page.locator("#backupBtn").click();
  await page.locator("#backupFileInput").setInputFiles({ name: "photos.bikepacking-backup.zip", mimeType: "application/zip", buffer: bytes });
  await expect(page.locator('[data-backup-layout-id="layout-a"]')).toBeVisible();
  if (mode === "copy") await page.locator('[data-backup-restore-mode][value="copy"]').check();
  await page.locator(mode === "full" ? "#backupRestoreFullBtn" : "#backupRestoreSelectedBtn").click();
  await expect(page.locator("#confirmDialog"), await page.locator("#backupStatus").textContent()).toBeVisible();
  return { f, source, itemId, bagId, originals };
}

for (const type of ["item", "container"]) for (const lost of [false, true]) test(`completed guest private photos ${type} edit and copy (${lost ? "lost ACK" : "confirmed"})`, async ({ page, context }) => {
  test.setTimeout(180000);
  const guestSource = guestImportPayload(true), originalPhoto = guestSource.items.source.photos[0];
  guestSource.items.source.photos.push({ ...originalPhoto, id: "second-guest-item-photo" });
  guestSource.containers.bag.photos = [0, 1].map(index => ({ ...originalPhoto, id: `guest-bag-photo-${index}` }));
  const f = await setup(page, context, { photoEdit: true, guestSource });
  await expect.poll(() => f.posts.some(post => post.kind === "list.import"), { timeout: 30000 }).toBe(true);
  const imported = f.posts.find(post => post.kind === "list.import"), collection = type === "item" ? "items" : "containers";
  const ownerId = imported.body.guestImport.ownerTargets.find(owner => owner.entityType === type && owner.sourceId === (type === "item" ? "source" : "bag")).targetId;
  await synchronizePhotoHistory(page, () => f.payload[collection]?.[ownerId]?.photos?.every(photo => photo.status === "synced") === true);
  const original = structuredClone(f.payload[collection][ownerId]), stageCount = f.stagePosts.length;
  expect(original._publicCopySourceId).toBeTruthy(); expect(original.photos).toHaveLength(2); expect(stageCount).toBe(4);
  await reloadApp(page);
  const prefix = type === "item" ? "item" : "rootContainer", button = type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn";
  const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog");
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? `#itemsView [data-list-item-id="${ownerId}"] .item-title` : `#bagsView [data-root-card="${ownerId}"] [data-root-title]`).click();
  await expect(dialog).toBeVisible(); await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click();
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await page.locator(`#${prefix}PhotoInput`).setInputFiles([1, 2].map(index => ({ name: `после-переноса-${index}.png`, mimeType: "image/png", buffer: image })));
  await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(3);
  await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`); await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
  await page.locator(`#${prefix}Weight`).fill("197");
  const before = f.posts.length; f.loseFormOwner = lost;
  await submitForm(page, button, `#${prefix}Weight`); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  const action = structuredClone(f.posts.at(-1)); expect(action.kind).toBe("photos.mutate");
  expect(action.body.changes.map(change => change.action)).toEqual(["delete", "attach", "attach", "order"]);
  if (lost) {
    await expect.poll(() => f.injectedFailure).toBe(true); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await resume.click(); await expect(resume).toBeEnabled(); expect(f.posts).toHaveLength(before + 1);
    f.loseFormOwner = false; f.hiddenFormOwner = null; await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  } else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  expect(f.stagePosts).toHaveLength(stageCount + 2);
  expect(f.payload[collection][ownerId]._publicCopySourceId).toBe(original._publicCopySourceId);
  expect(f.payload[collection][ownerId].weight).toBe(197);
  expect(f.payload[collection][ownerId].photos.map(photo => photo.id)).toEqual(action.body.changes.at(-1).photoIds);
  await reloadApp(page);
  const source = structuredClone(f.payload[collection][ownerId]), stages = [...f.stagePosts];
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${ownerId}"]`).click();
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  await synchronizePhotoHistory(page, () => f.posts.length === before + 2);
  const copy = f.posts.at(-1); expect(copy.body.copySource.payload).toEqual(source);
  const copied = f.payload[collection][copy.body.entityId]; expect(copied._publicCopySourceId).toBe(original._publicCopySourceId);
  expect(copied.photos).toHaveLength(3); expect(copied.photos.some(photo => source.photos.some(old => old.id === photo.id || old.assetId === photo.assetId))).toBe(false);
  expect(f.payload[collection][ownerId]).toEqual(source); expect(f.stagePosts).toEqual(stages);
  await reloadApp(page); expect(f.posts).toHaveLength(before + 2); expect(f.posts.filter(post => post.kind === "list.import")).toHaveLength(1);
  expect(f.errors).toEqual([]);
});

async function preparePendingGuestUi(page, context, fileless) {
  const guestSource = guestImportPayload(!fileless);
  if (!fileless) guestSource.containers.bag.photos = [{ ...guestSource.items.source.photos[0], id: "guest-bag-photo" }];
  let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  const f = await setup(page, context, { photoEdit: true, guestSource, configure: value => {
    if (fileless) value.beforeUpdate = body => body.kind === "list.import" ? hold() : undefined;
    else value.beforeStageAck = hold;
  } });
  await expect.poll(() => Boolean(release), { timeout: 30000 }).toBe(true);
  const imported = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(record => record.action?.body.guestImport));
  const target = (entityType, sourceId) => imported.action.body.guestImport.ownerTargets.find(owner => owner.entityType === entityType && owner.sourceId === sourceId).targetId;
  const layoutId = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")).activeLayoutId);
  return { f, imported, itemId: target("item", "source"), bagId: target("container", "bag"), layoutId,
    release: () => release?.(), clearHold: () => { f.beforeStageAck = null; f.beforeUpdate = null; } };
}

for (const [fileless, outcome] of [[false, "fields"], [true, "fields"], [false, "item"], [false, "container"], [false, "layout"], [false, "quota"], [false, "lost child"]])
test(`pending guest descendants ${fileless ? "fileless" : "photo"} ${outcome} keep exact files and later changes through reload`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, imported, itemId, bagId, layoutId, release, clearHold } = await preparePendingGuestUi(page, context, fileless);
  const before = f.posts.filter(post => post.kind !== "list.import").length;
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    const children = [];
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "146" : "287");
      if (outcome === "quota") await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.photoResults?.version === 4) throw new DOMException("Pending guest quota", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
        expect((await records()).filter(record => record.action.body.photoResults?.version === 4)).toEqual([]);
        const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
        expect(local.items[itemId].weight).toBe(imported.action.body.payload.items[itemId].weight); expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(1);
        const downloaded = page.waitForEvent("download"); await page.locator("#personalSaveRecoveryDialog [data-download-photo-recovery]").click();
        const entries = await readZipEntries(new Blob([await readFile(await (await downloaded).path())]));
        const form = JSON.parse(zipText(entries.get("opened-form/form.json")));
        expect(form.preview.items[itemId].weight).toBe(146);
        expect([...entries.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(2);
        expect(JSON.parse(JSON.parse(zipText(entries.get("guest-import-selections.json")))[0].selectionJson).candidate.sourceState).toEqual(f.guestChosenSource);
        return;
      }
      await expect(dialog).not.toBeVisible();
      const child = (await records()).filter(record => record.action.body.photoResults?.version === 4).find(record => !children.some(known => known.action.operationId === record.action.operationId));
      expect(child).toBeTruthy(); children.push(child);
      expect(child.action.body.causal.baseOperationId).toBe(children.length === 1 ? imported.action.operationId : children.at(-2).action.operationId);
      expect(child.action.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([...new Set([child.action.body.causal.baseOperationId, imported.action.operationId])]);
    }
    if (["item", "container"].includes(outcome)) {
      const item = outcome === "item", id = item ? itemId : bagId;
      await page.locator(`[data-view="${item ? "items" : "bags"}"]`).click();
      await page.locator(item ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      await page.locator(item ? "#itemDeleteForeverBtn" : "#rootContainerDeleteForeverBtn").click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
      await expect(page.locator(item ? "#itemDialog" : "#rootContainerDialog")).not.toBeVisible();
    } else if (outcome === "layout") {
      await page.locator('[data-view="packing"]').click(); await confirmActiveLayoutDeletion(page);
      await page.locator("#confirmOkBtn").click(); await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
    }
    const pending = (await records()).filter(record => record.action.body.photoResults?.version === 4);
    expect(pending).toHaveLength(["item", "container", "layout"].includes(outcome) ? 3 : 2);
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    clearHold(); release();
    await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    if (outcome === "lost child" || fileless) f.beforeUpdate = body => { if (body.body.photoResults?.version === 4) { f.lose = true; f.unknown = true; } };
    else f.loseFormOwner = true;
    await resume.click(); await expect(resume).toBeEnabled(); await expect.poll(() => f.injectedFailure).toBe(true);
    f.loseFormOwner = false; f.hiddenFormOwner = null; f.beforeUpdate = null; f.lose = false; f.unknown = false;
    await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 1 + pending.length); expect(f.stagePosts).toHaveLength(fileless ? 0 : 2); expect(new Set(f.stagePosts).size).toBe(fileless ? 0 : 2);
    expect(f.posts[before].body).toEqual(imported.action.body);
    for (const child of pending) expect(f.posts.find(post => post.operationId === child.action.operationId).body).toEqual(child.action.body);
    await reloadApp(page); await expect(recovery).not.toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    if (outcome === "item") expect(local.items[itemId]).toBeUndefined(); else expect(local.items[itemId].weight).toBe(146);
    if (outcome === "container") expect(local.containers[bagId]).toBeUndefined(); else expect(local.containers[bagId].weight).toBe(287);
    if (outcome === "layout") expect(local.layouts[layoutId]).toBeUndefined();
    for (const owner of [local.items[itemId], local.containers[bagId]].filter(Boolean)) expect((owner.photos || []).map(photo => photo.status)).toEqual(fileless ? [] : ["synced"]);
    expect(f.posts.filter(post => post.kind === "list.import")).toHaveLength(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1")))).toEqual(f.guestChosenSource);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const lost of ["cancellation", "decision"]) test(`pending guest descendants cancellation preserves the full chain through lost ${lost} ACK`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId, release, clearHold } = await preparePendingGuestUi(page, context, false), before = f.posts.length, current = structuredClone(f.payload);
  try {
    await page.locator('[data-view="items"]').click();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("146"); await submitForm(page, "#saveItemBtn", "#itemWeight"); await expect(page.locator("#itemDialog")).not.toBeVisible();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click(); await page.locator("#itemDeleteForeverBtn").click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click(); await expect(page.locator("#itemDialog")).not.toBeVisible();
    const records = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(record => record.action));
    const saved = records.find(record => record.action.kind === "list.import"); f.cancelPhotoAction = saved.action;
    expect(records.filter(record => record.action.body.photoResults?.version === 4)).toHaveLength(2);
    f.cancellationReceipts = new Map(saved.action.body.guestImport.files.map(file => [file.assetId, { ok: true,
      operation: { id: file.assetId, actorId: "actor-a", environment: "bike-packing-experiment", listId: f.listId,
        entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
      cancellation: { version: 1, stageOperationId: file.assetId, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, noAssetPublished: true, stageCannotPublish: true } }]));
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]"); await expect(cancel).toBeVisible();
    if (lost === "cancellation") {
      f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
      expect(f.payload).toEqual(current); await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
    }
    await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("действий: 3");
    await page.locator("#confirmCancelBtn").click(); await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(current);
    expect(f.posts).toHaveLength(before + 3);
    if (lost === "decision") f.beforeUpdate = action => { if (!action.body.photoResults) { f.lose = true; f.unknown = true; } };
    await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    if (lost === "decision") {
      await expect.poll(() => f.injectedFailure).toBe(true); f.beforeUpdate = null; f.lose = false; f.unknown = false;
      await reloadApp(page, { recovery: true }); await cancel.click();
    }
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 4); expect(f.stagePosts).toHaveLength(1);
    expect(f.cancellationPosts.map(post => post.id)).toEqual(saved.action.body.guestImport.files
      .filter(file => !f.stagePosts.includes(file.assetId)).map(file => file.assetId));
    const decision = f.posts.at(-1); expect(decision.body.photoResults).toBeUndefined(); expect(decision.body.guestImport).toBeUndefined();
    await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.payload).toEqual(current); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const [mode, outcome] of [["full", "fields"], ["replace", "fields"], ["copy", "fields"], ["full", "item"], ["full", "container"], ["full", "layout"], ["full", "quota"], ["full", "lost child"]])
test(`pending archive descendants ${mode} ${outcome} keep exact files and later changes through reload`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId, bagId, originals } = await preparePhotoArchiveUi(page, context, mode), before = f.posts.length;
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  let release; f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  try {
    await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
    await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const imported = (await records()).find(record => record.action.kind === "list.import"), children = [];
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "146" : "287");
      if (outcome === "quota") await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.photoResults?.version === 3) throw new DOMException("Pending archive quota", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
        expect((await records()).filter(record => record.action.body.photoResults?.version === 3)).toEqual([]);
        const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
        expect(local.items[itemId].weight).toBe(45); expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(1);
        const downloaded = page.waitForEvent("download"); await page.locator("#personalSaveRecoveryDialog [data-download-photo-recovery]").click();
        const entries = await readZipEntries(new Blob([await readFile(await (await downloaded).path())]));
        const form = JSON.parse(zipText(entries.get("opened-form/form.json")));
        expect(form.preview.items[itemId].weight).toBe(146);
        for (const original of originals) expect([...entries.values()].some(bytes => Buffer.from(bytes).equals(original))).toBe(true);
        return;
      }
      await expect(dialog).not.toBeVisible();
      const child = (await records()).filter(record => record.action.body.photoResults?.version === 3).find(record => !children.some(known => known.action.operationId === record.action.operationId));
      expect(child).toBeTruthy(); children.push(child);
      expect(child.action.body.causal.baseOperationId).toBe(children.length === 1 ? imported.action.operationId : children.at(-2).action.operationId);
      expect(child.action.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([...new Set([child.action.body.causal.baseOperationId, imported.action.operationId])]);
    }
    if (["item", "container"].includes(outcome)) {
      const item = outcome === "item", id = item ? itemId : bagId;
      await page.locator(`[data-view="${item ? "items" : "bags"}"]`).click();
      await page.locator(item ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      await page.locator(item ? "#itemDeleteForeverBtn" : "#rootContainerDeleteForeverBtn").click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
      await expect(page.locator(item ? "#itemDialog" : "#rootContainerDialog")).not.toBeVisible();
    } else if (outcome === "layout") {
      await page.locator('[data-view="packing"]').click(); await confirmActiveLayoutDeletion(page);
      await page.locator("#confirmOkBtn").click(); await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
    }
    const pending = (await records()).filter(record => record.action.body.photoResults?.version === 3);
    expect(pending).toHaveLength(["item", "container", "layout"].includes(outcome) ? 3 : 2);
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    f.beforeStageAck = null; release();
    await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    if (outcome === "lost child") f.beforeUpdate = body => { if (body.body.photoResults?.version === 3) { f.lose = true; f.unknown = true; } };
    else f.loseFormOwner = true;
    await resume.click(); await expect(resume).toBeEnabled(); await expect.poll(() => f.injectedFailure).toBe(true);
    f.loseFormOwner = false; f.hiddenFormOwner = null; f.beforeUpdate = null; f.lose = false; f.unknown = false;
    await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 1 + pending.length); expect(f.stagePosts).toHaveLength(4); expect(new Set(f.stagePosts).size).toBe(4);
    expect(f.posts[before].body).toEqual(imported.action.body);
    for (const child of pending) expect(f.posts.find(post => post.operationId === child.action.operationId).body).toEqual(child.action.body);
    await reloadApp(page); await expect(recovery).not.toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    if (outcome === "item") expect(local.items[itemId]).toBeUndefined(); else expect(local.items[itemId].weight).toBe(146);
    if (outcome === "container") expect(local.containers[bagId]).toBeUndefined(); else expect(local.containers[bagId].weight).toBe(287);
    if (outcome === "layout") expect(local.layouts["layout-a"]).toBeUndefined();
    for (const owner of [local.items[itemId], local.containers[bagId]].filter(Boolean)) expect(owner.photos.map(photo => photo.status)).toEqual(["synced", "synced"]);
    expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const lost of ["cancellation", "decision"]) test(`pending archive descendants cancellation preserves the full chain through lost ${lost} ACK`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId } = await preparePhotoArchiveUi(page, context, "full"), before = f.posts.length, current = structuredClone(f.payload);
  let release; f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  try {
    await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
    await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click(); await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator('[data-view="items"]').click();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("146"); await submitForm(page, "#saveItemBtn", "#itemWeight"); await expect(page.locator("#itemDialog")).not.toBeVisible();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click(); await page.locator("#itemDeleteForeverBtn").click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click(); await expect(page.locator("#itemDialog")).not.toBeVisible();
    const records = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(record => record.action));
    const saved = records.find(record => record.action.kind === "list.import"); f.cancelPhotoAction = saved.action;
    expect(records.filter(record => record.action.body.photoResults?.version === 3)).toHaveLength(2);
    f.cancellationReceipts = new Map(saved.action.body.archiveImport.files.map(file => [file.assetId, { ok: true,
      operation: { id: file.assetId, actorId: "actor-a", environment: "bike-packing-experiment", listId: f.listId,
        entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
      cancellation: { version: 1, stageOperationId: file.assetId, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, noAssetPublished: true, stageCannotPublish: true } }]));
    f.beforeStageAck = null; release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]"); await expect(cancel).toBeVisible();
    if (lost === "cancellation") {
      f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
      expect(f.payload).toEqual(current); await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
    }
    await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("действий: 3");
    await page.locator("#confirmCancelBtn").click(); await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(current);
    expect(f.posts).toHaveLength(before + 3);
    if (lost === "decision") f.beforeUpdate = action => { if (!action.body.photoResults) { f.lose = true; f.unknown = true; } };
    await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    if (lost === "decision") {
      await expect.poll(() => f.injectedFailure).toBe(true); f.beforeUpdate = null; f.lose = false; f.unknown = false;
      await reloadApp(page, { recovery: true }); await cancel.click();
    }
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 4); expect(f.stagePosts).toHaveLength(1); expect(f.cancellationPosts).toHaveLength(3);
    const decision = f.posts.at(-1); expect(decision.body.photoResults).toBeUndefined(); expect(decision.body.archiveImport).toBeUndefined();
    await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.payload).toEqual(current); expect(f.errors).toEqual([]);
  } finally { f.beforeStageAck = null; release?.(); }
});

for (const mode of ["full", "replace", "copy"]) for (const lost of (mode === "full" ? ["owner", "last file"] : ["owner"]))
test(`actual ${mode} photo archive import survives lost ${lost}, native storage reload and exact receipt recovery`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId, bagId } = await preparePhotoArchiveUi(page, context, mode), before = f.posts.length;
  if (lost === "owner") f.loseFormOwner = true; else f.loseStageAt = 4;
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
  await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.stagePosts.length).toBe(4);
  if (lost === "owner") await expect.poll(() => f.injectedFailure).toBe(true); else expect(f.posts).toHaveLength(before);
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(value => value.action?.kind === "list.import"));
  expect(saved.action.body.archiveImport.files).toHaveLength(4);
  const frozenAction = structuredClone(saved.action), stages = [...f.stagePosts];
  expect(saved.action.body.archiveImport.files.map(file => file.assetId)).toEqual(stages);
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await expect(resume).toBeVisible(); await resume.click(); await expect(resume).toBeEnabled();
  expect(f.stagePosts).toEqual(stages); expect(f.posts).toHaveLength(before + (lost === "owner" ? 1 : 0));
  f.loseFormOwner = false; f.hiddenFormOwner = null; f.loseStageAt = 0; f.hiddenStage = null;
  await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.posts).toHaveLength(before + 1); expect(f.stagePosts).toEqual(stages);
  const action = f.posts.at(-1); expect(action.operationId).toBe(frozenAction.operationId); expect(action.body).toEqual(frozenAction.body);
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
  expect(local.items[itemId].photos).toHaveLength(2); expect(local.containers[bagId].photos).toHaveLength(2);
  expect(local.items[itemId].weight).toBe(mode === "full" ? 45 : 100);
  expect(new Set([...local.items[itemId].photos, ...local.containers[bagId].photos].map(photo => photo.id)).size).toBe(4);
  const targetId = mode === "full" ? "layout-a" : action.body.archiveImport.layoutTargets[0].targetId;
  await expect(page.locator("#layoutSelect")).toHaveValue(targetId);
  await createRootContainer(page, "Правка после файлового архива");
  await synchronizePhotoHistory(page, () => Object.values(f.payload.containers).some(value => value.name === "Правка после файлового архива"));
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.archiveImport).toBeUndefined(); expect(f.errors).toEqual([]);
});

for (const failure of ["native files", "queue link"]) test(`photo archive import ${failure} quota exports every selected original and keeps the archive window`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId, originals } = await preparePhotoArchiveUi(page, context, "full"), before = f.posts.length, current = structuredClone(f.payload);
  await page.evaluate(failure => {
    if (failure === "native files") {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === "actions") throw new DOMException("Archive quota", "QuotaExceededError"); return original.apply(this, args); };
    } else {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.kind === "list.import") throw new DOMException("Archive link quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, failure);
  await page.locator("#confirmOkBtn").click(); const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery).toBeVisible(); await expect(page.locator("#backupDialog")).toBeVisible();
  const downloaded = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const entries = await readZipEntries(new Blob([await readFile(await (await downloaded).path())]));
  const form = JSON.parse(zipText(entries.get("opened-form/form.json"))), manifest = JSON.parse(zipText(entries.get("recovery-manifest.json")));
  expect(form.request.source.items[itemId].weight).toBe(45); expect(form.files).toHaveLength(4);
  expect(manifest.automaticImportAllowed).toBe(false);
  for (const index of [0, 1, 2, 3]) expect(Buffer.from(entries.get(`opened-form/${index}/original.bin`))).toEqual(originals[index % 2]);
  expect(f.posts).toHaveLength(before); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(current); expect(f.errors).toEqual([]);
});

for (const lost of [false, true]) test(`photo archive import cancellation keeps ready files and fences undispatched parts${lost ? " through lost cancellation ACK" : ""}`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f } = await preparePhotoArchiveUi(page, context, "full"), before = f.posts.length, current = structuredClone(f.payload);
  f.loseStageAt = 1;
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
  await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click(); await expect.poll(() => f.hiddenStage).toBeTruthy();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(value => value.action?.kind === "list.import"));
  f.cancelPhotoAction = saved.action;
  f.cancellationReceipts = new Map(saved.action.body.archiveImport.files.map(file => [file.assetId, { ok: true,
    operation: { id: file.assetId, actorId: "actor-a", environment: "bike-packing-experiment", listId: f.listId,
      entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
    cancellation: { version: 1, stageOperationId: file.assetId, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, noAssetPublished: true, stageCannotPublish: true } }]));
  await reloadApp(page, { recovery: true }); f.hiddenStage = null;
  const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
  await expect(cancel).toBeVisible();
  if (lost) {
    f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
    expect(f.posts).toHaveLength(before + 1); expect(f.payload).toEqual(current);
    await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
  }
  await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("Архив");
  await page.locator("#confirmCancelBtn").click(); expect(f.payload).toEqual(current);
  await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  expect(f.stagePosts).toHaveLength(1); expect(f.cancellationPosts).toHaveLength(3);
  expect(f.posts.filter(post => post.kind === "list.import")).toHaveLength(1);
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.archiveImport).toBeUndefined();
  await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.payload).toEqual(current); expect(f.errors).toEqual([]);
});

test("rejected photo archive import retains the complete archive and waits for explicit keep-server through a lost decision ACK", async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, itemId } = await preparePhotoArchiveUi(page, context, "full"), before = f.posts.length;
  f.allowConflicts = true;
  f.beforeUpdate = action => {
    if (action.kind !== "list.import" || f.archiveRejected) return;
    f.archiveRejected = true; f.payload = structuredClone(f.payload); f.payload.items[itemId].weight = 765; f.revision++;
  };
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
  await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.archiveRejected).toBe(true); const original = f.posts.at(-1);
  await reloadApp(page, { recovery: true });
  const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
  await expect(cancel).toBeVisible(); await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("Архив");
  await page.locator("#confirmCancelBtn").click(); expect(f.posts).toHaveLength(before + 1); expect(f.payload.items[itemId].weight).toBe(765);
  f.lose = true; f.beforeUpdate = () => { f.unknown = true; };
  await cancel.click(); await page.locator("#confirmOkBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  const decision = f.posts.at(-1); expect(decision.kind).toBe("list.update"); expect(decision.body.archiveImport).toBeUndefined();
  expect(decision.body.payload.items[itemId].weight).toBe(765); expect(f.stagePosts).toHaveLength(4); expect(f.cancellationPosts).toEqual([]);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page, { recovery: true }); await cancel.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
  await reloadApp(page); await expect(recovery).not.toBeVisible();
  expect(f.posts.filter(post => post.operationId === original.operationId)).toHaveLength(1); expect(f.posts).toHaveLength(before + 2);
  expect(f.payload.items[itemId].weight).toBe(765); expect(f.errors).toEqual([]);
});

for (const mode of ["full", "replace", "copy"]) test(`actual ${mode} archive import freezes layout choices through lost ACK reload and later edit`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, itemId } = await prepareArchiveUi(page, context, mode), before = f.posts.length;
  f.lose = true; f.beforeUpdate = () => { f.unknown = true; };
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#backupStatus")).toContainText("на устройстве");
  await page.locator('#backupDialog [value="cancel"]').click();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1);
  const action = f.posts.at(-1); expect(action.kind).toBe("list.import"); expect(action.body.archiveImport.mode).toBe(mode);
  const targetId = mode === "full" ? "layout-a" : action.body.archiveImport.layoutTargets[0].targetId;
  expect(action.body.payload.items[itemId].weight).toBe(mode === "full" ? 45 : 100);
  expect(action.body.payload.layouts[targetId].arrangement.itemQuantities[itemId]).toBe(3);
  expect(action.body.payload.layouts[targetId].arrangement.packedItems[itemId]).toBe(true);
  expect(Object.keys(action.body.payload.containers)).toHaveLength(mode === "full" ? 1 : 2);
  expect(action.body.forceOverwrite).toBeUndefined();
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => f.payload.layouts[targetId]?.arrangement.itemQuantities[itemId] === 3);
  expect(f.posts.length).toBe(before + 1); await expect(page.locator("#layoutSelect")).toHaveValue(targetId);
  await createRootContainer(page, "Правка после импорта");
  await synchronize(page, () => Object.values(f.payload.containers).some(value => value.name === "Правка после импорта"));
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.archiveImport).toBeUndefined(); expect(f.errors).toEqual([]);
});

test("archive import quota retains the archive dialog and complete draft without changing the list", async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, itemId } = await prepareArchiveUi(page, context, "full"), before = f.posts.length, server = structuredClone(f.payload);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#backupDialog")).toBeVisible();
  const copy = await downloadRecovery(page); expect(copy.unconfirmedMemoryDraft.items[itemId].weight).toBe(45);
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toHaveLength(1); expect(f.posts.length).toBe(before); expect(f.payload).toEqual(server); expect(f.errors).toEqual([]);
});

test("rejected archive import preserves both choices until keep-server and does not replay archive data as an ordinary save", async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, itemId } = await prepareArchiveUi(page, context, "full"), before = f.posts.length; f.allowConflicts = true;
  f.beforeUpdate = action => {
    if (action.kind !== "list.import" || f.archiveRejected) return;
    f.archiveRejected = true; f.payload = structuredClone(f.payload); f.payload.items[itemId].weight = 765; f.revision++;
  };
  await page.locator("#confirmOkBtn").click(); await page.locator('#backupDialog [value="cancel"]').click();
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmDialog")).toContainText("заново выбрать архив");
  await page.locator("#confirmCancelBtn").click(); expect(f.posts.length).toBe(before + 1);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(1);
  f.lose = true; f.beforeUpdate = () => { f.unknown = true; };
  await page.locator("#syncBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  const kept = f.posts.at(-1); expect(kept.kind).toBe("list.update"); expect(kept.body.archiveImport).toBeUndefined(); expect(kept.body.payload.items[itemId].weight).toBe(765);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => f.payload.items[itemId].weight === 765); expect(f.posts.length).toBe(before + 2); expect(f.errors).toEqual([]);
});

function replacementPayload() {
  const payload = initialPayload(), layout = payload.layouts["layout-a"];
  payload.items = { source: { id: "source", name: "Исходная вещь", containerId: "bag", quantity: 1 },
    replacement: { id: "replacement", name: "Вещь для замены", containerId: "", quantity: 1 },
    inside: { id: "inside", name: "Вещь в кармане", containerId: "pocket", quantity: 1 } };
  payload.containers = Object.fromEntries(["bag", "pocket", "newbag", "newpocket"].map(id => [id, {
    id, name: { bag: "Исходная сумка", pocket: "Временный карман", newbag: "Сумка для замены", newpocket: "Съёмная сумка" }[id],
    parentId: id === "pocket" ? "bag" : null, nestable: id === "newpocket", childIds: [], itemIds: [], order: []
  }]));
  Object.assign(payload.containers.bag, { childIds: ["pocket"], itemIds: ["source"], order: [{ type: "item", id: "source" }, { type: "container", id: "pocket" }] });
  Object.assign(payload.containers.pocket, { itemIds: ["inside"], order: [{ type: "item", id: "inside" }] });
  layout.rootContainerIds = ["bag"];
  layout.arrangement = { rootContainerIds: ["bag"], containers: Object.fromEntries(["bag", "pocket"].map(id => {
    const { parentId, childIds, itemIds, order } = payload.containers[id]; return [id, { parentId: parentId || "", childIds, itemIds, order }];
  })), items: { source: "bag", inside: "pocket" }, itemQuantities: { source: 3, inside: 2 }, packedItems: {} };
  return payload;
}

test("actual replacement pickers freeze item bag and pocket swaps through lost ACK without losing quantities", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context, { payload: replacementPayload() });
  await synchronize(page, () => Boolean(f.payload.items.source));
  for (const [source, replacement, action] of [["source", "replacement", "replace-item"], ["bag", "newbag", "replace-container"], ["pocket", "newpocket", "replace-container"]]) {
    const before = f.posts.length; f.lose = true; f.injectedFailure = false; f.beforeUpdate = () => { f.unknown = true; };
    if (action === "replace-item") {
      await page.locator(`#packingView [data-item-id="${source}"] .item-title-hitarea`).click();
      await page.locator("#itemReplaceBtn").click(); await page.locator(`[data-add-existing-item="${replacement}"]`).click();
    } else {
      if (source === "bag") await page.locator('#packingView [data-root-container-id="bag"]').getByRole("heading", { name: "Исходная сумка" }).click();
      else await page.locator('#packingView [data-subcontainer-id="pocket"] .subcontainer-title').click();
      await page.locator("#rootContainerReplaceBtn").click(); await page.locator(`[data-add-layout-root="${replacement}"]`).click();
    }
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.errors).toEqual([]); expect(f.posts.length).toBe(before + 1); const post = f.posts.at(-1);
    expect(post.body.userPlacement.action).toBe(action); expect(post.body.userPlacement.ids).toEqual([source]);
    expect(post.body.userPlacement.replacementId).toBe(replacement);
    f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
    await synchronize(page, () => f.receipts.has(post.operationId));
    expect(f.posts.filter(entry => entry.operationId === post.operationId)).toHaveLength(1);
  }
  const placed = f.payload.layouts["layout-a"].arrangement;
  expect(placed.rootContainerIds).toEqual(["newbag"]); expect(placed.items).toEqual({ replacement: "newbag", inside: "newpocket" });
  expect(placed.itemQuantities).toEqual({ replacement: 3, inside: 2 }); expect(placed.containers.newpocket.parentId).toBe("newbag");
  expect(f.payload.items.source).toBeTruthy(); expect(f.payload.containers.bag).toBeTruthy(); expect(f.payload.containers.pocket).toBeUndefined();
  expect(Object.keys(f.payload.containers).sort()).toEqual(["bag", "newbag", "newpocket"]); expect(f.errors).toEqual([]);
});

test("existing record pickers and nested root selection retain exact actions through lost ACK and reload", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context, { payload: replacementPayload() });
  await synchronize(page, () => Boolean(f.payload.items.source)); const owners = Object.keys(f.payload.containers).sort();
  for (const [id, action] of [["replacement", "link-item"], ["newpocket", "link-container"], ["newpocket", "lift-container"], ["newbag", "link-root"]]) {
    const before = f.posts.length; f.lose = true; f.injectedFailure = false; f.beforeUpdate = () => { f.unknown = true; };
    if (["link-item", "link-container"].includes(action)) {
      await page.locator('#packingView [data-root-container-id="bag"] > .container-header [data-add-to-container]').click();
      await page.locator(`[data-add-existing-${action === "link-item" ? "item" : "container"}="${id}"]`).click();
    } else {
      await page.locator("[data-add-packing-root]").click(); await page.locator(`[data-add-layout-root="${id}"]`).click();
    }
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.errors).toEqual([]); expect(f.posts.length).toBe(before + 1); const post = f.posts.at(-1);
    expect(post.body.userPlacement.action).toBe(action); expect(post.body.userPlacement.ids).toEqual([id]);
    f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
    await synchronize(page, () => f.receipts.has(post.operationId)); expect(f.posts.filter(entry => entry.operationId === post.operationId)).toHaveLength(1);
  }
  const placed = f.payload.layouts["layout-a"].arrangement;
  expect(placed.rootContainerIds).toEqual(["bag", "newpocket", "newbag"]); expect(placed.items).toEqual({ source: "bag", inside: "pocket", replacement: "bag" });
  expect(placed.itemQuantities).toEqual({ source: 3, inside: 2, replacement: 1 }); expect(placed.containers.newpocket.parentId).toBe("");
  expect(Object.keys(f.payload.containers).sort()).toEqual(owners); expect(f.errors).toEqual([]);
});

test("quota in a replacement picker preserves its complete candidate and leaves the existing queue unchanged", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { payload: replacementPayload() });
  await synchronize(page, () => Boolean(f.payload.items.source));
  await page.locator('#packingView [data-subcontainer-id="pocket"] .subcontainer-title').click();
  await page.locator("#rootContainerReplaceBtn").click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator('[data-add-layout-root="newpocket"]').click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(page.locator("#layoutRootDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.containers.pocket).toBeUndefined(); expect(draft.layouts["layout-a"].arrangement.items.inside).toBe("newpocket");
  expect(draft.layouts["layout-a"].arrangement.itemQuantities).toEqual({ source: 3, inside: 2 });
  expect(Object.keys(draft.items).sort()).toEqual(Object.keys(f.payload.items).sort());
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.payload.containers.pocket).toBeTruthy(); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function dispatchPackingDrop(page, handle, containerId) {
  // Exercise the application's actual HTML5 drag handlers, not an exposed
  // mutation hook. Pointer/touch gesture coverage remains a separate check.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
  const zone = page.locator(`.dropzone[data-container-id="${containerId}"]`).first();
  await zone.scrollIntoViewIfNeeded(); const box = await zone.boundingBox();
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height - 2, dataTransfer: transfer };
  await zone.dispatchEvent("dragover", point); await expect(zone.locator(":scope > .drop-placeholder")).toHaveCount(1);
  await zone.dispatchEvent("drop", point); await transfer.dispose();
}

test("drag drop item and pocket keep frozen targets through lost ACK and reload", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Исходная для перемещения");
  const item = await createItemInContainer(page, bag, "Три вещи для перемещения");
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3"); await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await bag.locator("[data-add-to-container]").click(); await page.locator("#newSubcontainerName").fill("Перемещаемый карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await createRootContainer(page, "Целевая для перемещения"); await synchronize(page, () => Object.keys(f.payload.containers).length === 3);
  const itemId = Object.keys(f.payload.items)[0], pocketId = Object.values(f.payload.containers).find(record => record.name === "Перемещаемый карман").id;
  const targetId = Object.values(f.payload.containers).find(record => record.name === "Целевая для перемещения").id;
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await dispatchPackingDrop(page, page.locator(`[data-item-drag="${itemId}"]`), targetId);
  expect(f.errors).toEqual([]); await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const move = f.posts.at(-1);
  expect(move.body.userPlacement.action).toBe("move-item"); expect(move.body.userPlacement.targetContainerId).toBe(targetId);
  expect(move.body.payload.layouts["layout-a"].arrangement.itemQuantities[itemId]).toBe(3);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.items[itemId] === targetId);
  expect(f.posts.filter(post => post.operationId === move.operationId)).toHaveLength(1);
  await dispatchPackingDrop(page, page.locator(`[data-subcontainer-id="${pocketId}"] .subcontainer-title`).first(), targetId);
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.containers[pocketId].parentId === targetId);
  expect(f.posts.at(-1).body.userPlacement.action).toBe("move-container");
  await reloadApp(page); expect(Object.keys(f.payload.items)).toEqual([itemId]); expect(Object.keys(f.payload.containers)).toHaveLength(3);
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[itemId]).toBe(3); expect(f.errors).toEqual([]);
});

test("pointer grouping reserves one group and preserves quantity through lost ACK", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка группировки");
  const first = await createItemInContainer(page, bag, "Первый для группы"); await createItemInContainer(page, bag, "Второй для группы");
  await first.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3"); await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await synchronize(page, () => Object.values(f.payload.layouts["layout-a"].arrangement.itemQuantities).includes(3));
  const firstId = Object.values(f.payload.items).find(record => record.name === "Первый для группы").id;
  const secondId = Object.keys(f.payload.items).find(id => id !== firstId), before = f.posts.length;
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  const handle = page.locator(`#packingView [data-item-drag="${firstId}"]`); await handle.scrollIntoViewIfNeeded();
  const target = page.locator(`#packingView [data-item-id="${secondId}"]`), start = await handle.boundingBox();
  if (test.info().project.name === "mobile-webkit") {
    // iPhone uses the held touch path, not the desktop mouse path. Dispatch
    // touch events through that actual handler and release on its live target.
    await handle.evaluate((element, point) => {
      const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
      const event = new Event("touchstart", { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: [touch] }, targetTouches: { value: [touch] }, changedTouches: { value: [touch] } });
      element.dispatchEvent(event);
    }, { x: start.x + start.width / 2, y: start.y + start.height / 2 });
    await expect(page.locator("body")).toHaveClass(/dragging-ui/);
    await expect.poll(async () => {
      const current = await target.boundingBox();
      return handle.evaluate((element, point) => {
        const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
        const dispatch = (type, touches) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { touches: { value: touches }, targetTouches: { value: touches }, changedTouches: { value: [touch] } });
          element.dispatchEvent(event);
        };
        dispatch("touchmove", [touch]);
        if (!document.querySelector(".item-card.group-target")) return false;
        dispatch("touchend", []);
        return true;
      }, { x: current.x + current.width / 2, y: current.y + current.height / 2 });
    }).toBe(true);
  } else {
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 20, start.y + start.height / 2 + 20, { steps: 5 });
    await expect.poll(async () => {
      const current = await target.boundingBox();
      await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2);
      return (await target.getAttribute("class")).includes("group-target");
    }).toBe(true);
    await page.mouse.up();
  }
  await expect(page.locator("[data-subcontainer-id]")).toHaveCount(1);
  expect(f.errors).toEqual([]); await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const group = f.posts.at(-1), groupId = group.body.userPlacement.groupId;
  expect(group.body.userPlacement.action).toBe("group-items"); expect(groupId).toMatch(/^container-[0-9a-f-]{36}$/);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => Boolean(f.payload.containers[groupId]));
  expect(f.posts.filter(post => post.operationId === group.operationId)).toHaveLength(1);
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({ [firstId]: groupId, [secondId]: groupId });
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[firstId]).toBe(3); expect(Object.keys(f.payload.containers)).toHaveLength(2);
  expect(f.errors).toEqual([]);
});

test("packing marks quantity and both item-removal buttons keep frozen actions through lost ACK", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка отметок");
  const first = await createItemInContainer(page, bag, "Первая для отметок");
  await createItemInContainer(page, bag, "Вторая для отметок");
  await first.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3");
  await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await synchronize(page, () => Object.values(f.payload.layouts["layout-a"].arrangement.itemQuantities).includes(3));
  const firstId = Object.values(f.payload.items).find(item => item.name === "Первая для отметок").id;
  const ids = Object.keys(f.payload.items), secondId = ids.find(id => id !== firstId);
  await page.locator("#menuBtn").click(); await page.locator("#collectionMenuBtn").click();
  for (const id of ids) {
    await page.locator(`[data-toggle-packed="${id}"]`).click();
    expect(f.errors).toEqual([]);
    await expect(page.locator(`[data-toggle-packed="${id}"]`)).toHaveAttribute("title", "Собрано");
  }
  await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.packedItems).length === 2);
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await page.locator("#unpackAllBtn").click(); await page.locator("#confirmOkBtn").click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true); expect(f.posts.length).toBe(before + 1);
  const unpack = f.posts.at(-1); expect(unpack.body.userPlacement.packed).toBe(false);
  expect(unpack.body.userPlacement.ids.sort()).toEqual(ids.sort()); expect(unpack.body.payload.layouts["layout-a"].arrangement.packedItems).toEqual({});
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.packedItems).length === 0);
  expect(f.posts.filter(post => post.operationId === unpack.operationId)).toHaveLength(1);
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[firstId]).toBe(3);
  await page.locator(`[data-item-id="${firstId}"] .item-title-hitarea`).click(); await page.locator("#itemRemoveFromLayoutBtn").click();
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => !f.payload.layouts["layout-a"].arrangement.items[firstId]);
  expect(f.payload.items[firstId]).toBeTruthy(); expect(f.posts.at(-1).body.userPlacement.ids).toEqual([firstId]);
  await page.locator(`[data-remove-from-layout="${secondId}"]`).click(); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.items).length === 0);
  expect(Object.keys(f.payload.items).sort()).toEqual(ids.sort()); await reloadApp(page); expect(f.errors).toEqual([]);
});

test("removing a populated root keeps ten items outside the layout without regression repair after reload", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка десяти вещей");
  for (let i = 0; i < 10; i++) await createItemInContainer(page, bag, `Вещь размещения ${i + 1}`);
  await synchronize(page, () => Object.keys(f.payload.items).length === 10);
  const before = f.posts.length, bagId = Object.keys(f.payload.containers)[0], ids = Object.keys(f.payload.items).sort();
  await bag.getByRole("heading", { name: "Сумка десяти вещей" }).click(); await page.locator("#rootContainerRemoveFromLayoutBtn").click();
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 0);
  expect(f.posts.length).toBe(before + 1); const action = f.posts.at(-1);
  expect(action.body.userPlacement.action).toBe("remove-container"); expect(action.body.userPlacement.removedItemIds.sort()).toEqual(ids);
  expect(Object.keys(f.payload.items).sort()).toEqual(ids); expect(Object.keys(f.payload.containers)).toEqual([bagId]);
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({}); await reloadApp(page);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(0);
  await page.locator('[data-view="items"]').click(); await expect(page.locator("[data-list-item-id]")).toHaveCount(10);
  expect(f.errors).toEqual([]);
});

test("quota removing a root leaves its dialog open and retains all items with the full placement draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка перед сбоем размещения");
  await createItemInContainer(page, bag, "Сохраняемая вне укладки вещь"); await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await bag.getByRole("heading", { name: "Сумка перед сбоем размещения" }).click(); await page.locator("#rootContainerRemoveFromLayoutBtn").click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible(); const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.layouts["layout-a"].arrangement.items).toEqual({});
  expect(Object.keys(copy.unconfirmedMemoryDraft.items)).toEqual(Object.keys(f.payload.items));
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toEqual(Object.keys(f.payload.containers));
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function renameDictionaryInUi(page, type, from, to) {
  await page.locator(`[data-edit-${type}="${from}"]`).click();
  await page.locator(`[data-dictionary-edit-input="${type}"]`).fill(to);
  await submitForm(page, `[data-save-${type}="${from}"]`, `[data-dictionary-edit-input="${type}"]`);
}

for (const lose of [false, true]) test(`first dictionary edit in an empty personal list enters the durable queue before clearing its input (${lose ? "lost ACK" : "normal ACK"})`, async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  // Lose this business action's ACK, not an earlier layout-selection save.
  if (lose) f.beforeUpdate = async body => {
    if (body.body.userDictionary?.value === "Первая категория") { f.lose = true; f.unknown = true; }
  };
  await page.locator('[data-view="settings"]').click();
  await page.locator("#categoryInput").fill("Первая категория");
  await submitForm(page, "#categoryAdd", "#categoryInput");
  const journal = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")));
  await test.info().attach("first-dictionary-journal", { body: JSON.stringify({ journal, errors: f.errors }), contentType: "application/json" });
  expect(journal.length).toBeGreaterThan(0);
  await expect(page.locator("#categoryInput")).toHaveValue("");
  if (lose) {
    await page.locator("#syncBtn").click();
    await expect.poll(() => f.payload.categories.includes("Первая категория")).toBe(true);
  } else await synchronize(page, () => f.payload.categories.includes("Первая категория"));
  expect(f.posts.filter(post => post.body.userDictionary?.value === "Первая категория")).toHaveLength(1);
  if (lose) await expect.poll(() => f.injectedFailure).toBe(true);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page);
  await synchronize(page, () => f.payload.categories.includes("Первая категория"));
  await page.locator('[data-view="settings"]').click();
  await expect(page.locator('[data-edit-category="Первая категория"]')).toBeVisible();
  expect(f.posts.filter(post => post.body.userDictionary?.value === "Первая категория")).toHaveLength(1);
  await page.locator("#locationInput").fill("Первое место");
  await submitForm(page, "#locationAdd", "#locationInput");
  await synchronize(page, () => f.payload.locations.includes("Первое место"));
  await renameDictionaryInUi(page, "category", "Первая категория", "Категория без вещей");
  await synchronize(page, () => f.payload.categories.includes("Категория без вещей"));
  await page.locator('[data-remove-category="Категория без вещей"]').click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => !f.payload.categories.includes("Категория без вещей"));
  expect(Object.keys(f.payload.items)).toHaveLength(0); expect(Object.keys(f.payload.containers)).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

test("dictionary UI keeps unsent inputs through rerender and clears only an explicitly saved or cancelled draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка перед вводом справочника");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await page.locator('[data-view="settings"]').click();
  const before = f.posts.length;
  await page.locator("#categoryInput").fill("Черновик категории");
  await page.locator("#locationInput").fill("Черновик места");
  // A real UI rerender, with neither add button submitted.
  await page.locator('[data-dictionary-sort="category"]').click();
  await expect(page.locator("#categoryInput")).toHaveValue("Черновик категории");
  await expect(page.locator("#locationInput")).toHaveValue("Черновик места");
  expect(f.posts.length).toBe(before);
  await page.locator('[data-edit-category="Ремонт"]').click();
  await page.locator('[data-dictionary-edit-input="category"]').fill("Новый ремонт");
  await page.locator('[data-dictionary-sort="location"]').click();
  await expect(page.locator('[data-dictionary-edit-input="category"]')).toHaveValue("Новый ремонт");
  await page.locator('[data-cancel-category="Ремонт"]').click();
  await page.locator('[data-edit-category="Ремонт"]').click();
  await expect(page.locator('[data-dictionary-edit-input="category"]')).toHaveValue("Ремонт");
  await page.locator('[data-cancel-category="Ремонт"]').click();
  await submitForm(page, "#categoryAdd", "#categoryInput");
  await expect(page.locator("#categoryInput")).toHaveValue("");
  await synchronize(page, () => f.payload.categories.includes("Черновик категории"));
  await expect(page.locator("#locationInput")).toHaveValue("Черновик места");
  await page.locator('[data-dictionary-sort="category"]').click();
  await expect(page.locator("#categoryInput")).toHaveValue("");
  expect(f.posts.filter(post => post.body.userDictionary?.value === "Черновик категории")).toHaveLength(1);
  expect(f.errors).toEqual([]);
});

for (const type of ["location", "category"]) for (const action of ["add", "rename"]) {
  test(`dictionary ${type} ${action} retains the input across a render during focus`, async ({ page, context }) => {
    const f = await setup(page, context);
    await createRootContainer(page, "Сумка перед одновременным вводом");
    await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
    await page.locator('[data-view="settings"]').click();
    const previous = type === "location" ? "Велосипед" : "Ремонт", value = "Сохранённый ввод";
    const selector = action === "add" ? `#${type}Input` : `[data-dictionary-edit-input="${type}"]`;
    if (action === "rename") await page.locator(`[data-edit-${type}="${previous}"]`).click();
    await page.locator(selector).blur();
    await page.evaluate(({ selector, type }) => {
      const input = document.querySelector(selector); window.dictionaryInputBeforeRender = input;
      const ancestors = new Set(); for (let node = input; node; node = node.parentNode) ancestors.add(node);
      window.dictionaryInputDetachments = 0;
      window.dictionaryInputObserver = new MutationObserver(records => {
        for (const record of records) for (const node of record.removedNodes) if (ancestors.has(node)) window.dictionaryInputDetachments++;
      });
      window.dictionaryInputObserver.observe(document.querySelector("#settingsView"), { childList: true, subtree: true });
      // Reproduce a render between native focus and text insertion, the boundary
      // recorded in CI. The sort control uses the same real settings renderer.
      input.addEventListener("focus", () => document.querySelector(`[data-dictionary-sort="${type}"]`).click(), { once: true });
    }, { selector, type });
    const before = f.posts.length;
    await page.locator(selector).fill(value); await expect(page.locator(selector)).toHaveValue(value);
    expect(await page.evaluate(selector => document.querySelector(selector) === window.dictionaryInputBeforeRender, selector)).toBe(true);
    for (let i = 0; i < 2; i++) await page.locator(`[data-dictionary-sort="${type}"]`).click();
    await expect(page.locator(selector)).toHaveValue(value); expect(f.posts).toHaveLength(before);
    expect(await page.evaluate(() => { window.dictionaryInputObserver.disconnect(); return window.dictionaryInputDetachments; })).toBe(0);
    if (action === "rename") await page.locator(selector).press("Enter");
    else await submitForm(page, `#${type}Add`, selector);
    await synchronize(page, () => f.payload[type === "location" ? "locations" : "categories"].includes(value));
    expect(f.posts.slice(before)).toHaveLength(1); expect(f.posts.at(-1).body.userDictionary.action).toBe(action);
    expect(f.errors).toEqual([]);
  });
}

test("dictionary UI freezes add rename delete and every linked owner through lost ACK and reload", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка справочника");
  await createItemInContainer(page, bag, "Вещь справочника");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const itemId = Object.keys(f.payload.items)[0], bagId = Object.keys(f.payload.containers)[0];
  expect(f.payload.items[itemId].location).toBe("Велосипед"); expect(f.payload.containers[bagId].location).toBe("Велосипед");
  await page.locator('[data-view="settings"]').click();
  await page.locator("#locationInput").fill("Лагерь"); await submitForm(page, "#locationAdd", "#locationInput");
  await synchronize(page, () => f.payload.locations.includes("Лагерь"));
  expect(f.posts.at(-1).body.userDictionary.action).toBe("add");
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await renameDictionaryInUi(page, "location", "Велосипед", "Байк");
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const rename = f.posts.at(-1);
  expect(rename.body.userDictionary.items).toEqual([itemId]); expect(rename.body.userDictionary.containers).toEqual([bagId]);
  expect(rename.body.payload.items[itemId].location).toBe("Байк"); expect(rename.body.payload.containers[bagId].location).toBe("Байк");
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => f.payload.locations.includes("Байк"));
  expect(f.posts.filter(post => post.operationId === rename.operationId)).toHaveLength(1);
  await page.locator('[data-view="settings"]').click(); await page.locator('[data-remove-location="Байк"]').click();
  await expect(page.locator("#confirmDialog")).toContainText("Лагерь");
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => !f.payload.locations.includes("Байк"));
  expect(f.payload.items[itemId].location).toBe("Лагерь"); expect(f.payload.containers[bagId].location).toBe("Лагерь");
  await page.locator("#categoryInput").fill("Питание");
  await expect(page.locator("#categoryInput")).toHaveValue("Питание");
  await submitForm(page, "#categoryAdd", "#categoryInput");
  await synchronize(page, () => f.payload.categories.includes("Питание"));
  await renameDictionaryInUi(page, "category", "Питание", "Еда"); await synchronize(page, () => f.payload.categories.includes("Еда"));
  await page.locator('[data-remove-category="Еда"]').click(); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => !f.payload.categories.includes("Еда")); await reloadApp(page);
  expect(f.payload.items[itemId].location).toBe("Лагерь"); expect(f.errors).toEqual([]);
});

test("quota during dictionary deletion preserves the entire linked-record draft and old queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка перед удалением места");
  await createItemInContainer(page, bag, "Вещь перед удалением места");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await page.locator('[data-view="settings"]').click(); await page.locator('[data-remove-location="Велосипед"]').click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.locations).toEqual([]); expect(Object.values(draft.items)[0].location).toBe(""); expect(Object.values(draft.containers)[0].location).toBe("");
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.payload.locations).toContain("Велосипед"); expect(f.errors).toEqual([]);
});

test("oversized layout notes stop before publication and remain complete in the recovery copy", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка перед большим изменением");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length, notes = "я".repeat(1600000);
  await page.locator("#editLayoutBtn").click(); await page.locator("#layoutEditNotes").fill(notes);
  await submitForm(page, "#saveEditedLayoutBtn", "#layoutEditNotes");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.reasonCode).toBe("payload-size"); expect(copy.unconfirmedMemoryDraft.layouts["layout-a"].notes).toBe(notes);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

test("quota during real bulk deletion preserves the entire unsaved selection draft and the old queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  const bag = await createRootContainer(page, "Сумка до пакетного сбоя");
  await createItemInContainer(page, bag, "Удаление первая");
  await createItemInContainer(page, bag, "Удаление вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  await selectCatalogBatch(page, "item", ["Удаление первая", "Удаление вторая"]);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.items).toEqual({});
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toHaveLength(1);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(Object.keys(f.payload.items)).toHaveLength(2); expect(f.posts.length).toBe(postsBefore);
  // The async bulk handler must absorb the already surfaced latch failure.
  expect(f.errors).toEqual([]);
});

test("quota failure in a real form pauses editing and exports the unsaved draft without rewriting the queue", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Уже сохранённая сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#rootContainerName").fill("Несохранённая сумка");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  const warning = page.locator("#personalSaveRecoveryDialog");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("не хватает места");
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "error");
  await page.keyboard.press("Escape");
  await expect(warning).toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.scopeKey).toBe("id:actor-a");
  expect(copy.automaticImportAllowed).toBe(false);
  expect(Object.values(copy.unconfirmedMemoryDraft.containers).some(entry => entry.name === "Несохранённая сумка")).toBe(true);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort())).toEqual(before);
  expect(f.posts.length).toBe(postsBefore);
  const box = await warning.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.screenshot({ path: info.outputPath("personal-save-quota.png") });
  expect(f.errors).toEqual([]);
});

for (const offline of [false, true]) test(`actual startup fences an unlinked photo draft and exports its original local bytes without upload or deletion (${offline ? "offline damaged record" : "online"})`, async ({ page, context }, info) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка перед восстановлением фото");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  // Only the seed uses source modules; the recovery button belongs to the full
  // built app with ALL photo writer gates still disabled.
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid seed module path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const seeded = await page.evaluate(async listId => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId, scopeKey: "id:actor-a" };
    const current = { ...binding, scope: "personal", generation: "before-crash" };
    const store = createPersonalPhotoActionStore({ ...binding, enabled: true, getContext: () => current });
    const stage = { operationId: crypto.randomUUID(), photoId: "retained-photo", entityType: "item", entityId: "unlinked-owner", fileName: "original.png" };
    const action = { operationId: crypto.randomUUID(), listId, kind: "photos.mutate", body: { version: 1, action: "attach", baseStateRevision: 1,
      baseEntityRevision: 1, entityType: stage.entityType, entityId: stage.entityId, photoId: stage.photoId, assetId: stage.operationId, index: 0, expectedPhotoIds: [] } };
    await store.capture({ stage, action, snapshot: { items: { "unlinked-owner": { id: "unlinked-owner", photos: [{ id: stage.photoId, status: "pending" }] } } },
      file: new Blob(["original retained photo bytes"], { type: "image/png" }), thumb: new Blob(["retained thumbnail"], { type: "image/png" }) });
    await store.claimStage(action.operationId); // Crash before outbox registration / network.
    localStorage.setItem("fixture-auth-token", "never-export-this");
    return { actionId: action.operationId, stageId: stage.operationId };
  }, f.listId);
  if (offline) await page.evaluate(async () => {
    localStorage.setItem("bike-packing-force-offline", "1");
    const open = indexedDB.open("bike-packing-personal-photo-actions-v1", 2);
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("actions", "readwrite"), store = tx.objectStore("actions"), request = store.getAll();
      request.onsuccess = () => { for (const row of request.result) store.put({ ...row, intentHash: "damaged but retained" }); };
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); db.close();
  });
  const posts = f.posts.length, server = structuredClone(f.payload);
  await page.reload();
  const dialog = page.locator("#personalSaveRecoveryDialog");
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(dialog).toContainText("Найдены сохранённые фотодействия");
  const downloadPromise = page.waitForEvent("download");
  await dialog.locator("[data-download-photo-recovery]").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("bike-packing-photo-recovery.zip");
  const zip = await readZipEntries(new Blob([await readFile(await download.path())]));
  expect(zipText(zip.get(`photos/${seeded.actionId}/original.bin`))).toBe("original retained photo bytes");
  expect(zipText(zip.get(`photos/${seeded.actionId}/thumbnail.bin`))).toBe("retained thumbnail");
  const record = JSON.parse(zipText(zip.get(`photos/${seeded.actionId}/record.json`)));
  expect(record.dispatchClaim.stageOperationId).toBe(seeded.stageId);
  const manifest = JSON.parse(zipText(zip.get("recovery-manifest.json")));
  expect(manifest.inventory.entries[0].state).toBe(offline ? "corrupt-file" : "unlinked");
  if (offline) expect(record.intentHash).toBe("damaged but retained");
  expect(manifest.serverConfirmationIncluded).toBe(false);
  expect(zipText(zip.get("personal-queue.json"))).not.toContain("never-export-this");
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  expect(f.posts.length).toBe(posts); expect(f.payload).toEqual(server); expect(f.errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("personal-photo-recovery.png") });
});

for (const offline of [false, true]) test(`already settled retained photos do not reopen the startup recovery fence (${offline ? "offline" : "online"})`, async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка с завершённой проверкой");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid seed module path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  // Seed a previously completed no-effect/cancel decision with exact request
  // digests. Actual SQL and lost ACK behaviour is covered by the paired API test.
  const seeded = await page.evaluate(async ({ listId, base, revision, receipts, offline }) => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const { createPersonalSaveOutbox } = await import("/src/sync/personal-save-outbox.js");
    const { canonicalListOperationJson } = await import("/src/sync/list-operation-queue.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId, scopeKey: "id:actor-a" }, current = { ...binding, scope: "personal", generation: "completed-session" };
    const outbox = createPersonalSaveOutbox({ ...binding, storage: localStorage, photoEnabled: true });
    outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: revision });
    const store = createPersonalPhotoActionStore({ ...binding, enabled: true, getContext: () => current });
    const entityId = Object.keys(base.containers)[0], stage = { operationId: crypto.randomUUID(), photoId: "completed-photo", entityType: "container", entityId, fileName: "retained.png" };
    const candidate = structuredClone(base); candidate.containers[entityId].photos = [{ id: stage.photoId, photoId: stage.photoId, assetId: stage.operationId, status: "pending" }];
    const plan = outbox.preparePhoto({ snapshot: candidate, payload: candidate, body: { version: 1, action: "attach", entityType: stage.entityType, entityId,
      photoId: stage.photoId, assetId: stage.operationId, baseStateRevision: revision, baseEntityRevision: revision, expectedPhotoIds: [], index: 0 } });
    await store.capture({ action: plan.action, snapshot: plan.snapshot, stage, file: new Blob(["retained settled bytes"], { type: "image/png" }) });
    await outbox.capturePhoto({ plan, store, getContext: () => current });
    const digest = async action => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalListOperationJson({
      environment: binding.environment, actorId: binding.actorId, kind: action.kind, listId, body: action.body }))))].map(value => value.toString(16).padStart(2, "0")).join("");
    const proof = (action, payloadDigest, state, stateRevision, code = null) => ({ historicalOnly: true,
      operation: { id: action.operationId, environment: binding.environment, actorId: binding.actorId, listId, kind: action.kind, state, payloadDigest },
      stateRevision, resultStatus: state === "committed" ? 200 : 409, rejectionCode: code });
    const known = new Map(receipts.map(([id, data]) => [id, { historicalOnly: true,
      operation: Object.fromEntries(["id", "environment", "actorId", "listId", "kind", "state", "payloadDigest"].map(key => [key, data.operation[key]])),
      stateRevision: data.result.payload.list?.stateRevision ?? data.result.payload.stateRevision ?? null, resultStatus: data.result.status, rejectionCode: data.result.payload.code || null }]));
    known.set(plan.action.operationId, proof(plan.action, await digest(plan.action), "rejected", revision, "photo_asset_not_ready"));
    const options = { queue: { inspect: async input => known.get(input.operationId) }, getContext: () => current,
      readRemote: async () => ({ id: listId, ownerId: binding.actorId, stateRevision: revision, payload: base }) };
    const decision = await outbox.reconcile({ ...options, resolveRejectedPhoto: async () => "keep-server" });
    known.set(decision.action.operationId, proof(decision.action, await digest(decision.action), "committed", revision + 1));
    await outbox.reconcile({ ...options, readRemote: async () => ({ id: listId, ownerId: binding.actorId, stateRevision: revision + 1, payload: base }) });
    outbox.compact();
    if (offline) localStorage.setItem("bike-packing-force-offline", "1");
    return { id: plan.action.operationId, revision: revision + 1 };
  }, { listId: f.listId, base: f.payload, revision: f.revision, receipts: [...f.receipts], offline });
  f.revision = seeded.revision;
  const posts = f.posts.length;
  await reloadApp(page);
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText: "Сумка с завершённой проверкой" })).toBeVisible();
  expect(f.posts.length).toBe(posts);
  expect(await page.evaluate(async id => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    return (await createPersonalPhotoActionStore({ actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" }).read(id)).file.text();
  }, seeded.id)).toBe("retained settled bytes");
  expect(f.errors).toEqual([]);
});

for (const scenario of ["keep", "postpone", "remote-change", "lost-decision-ack", "ready-file", "lost-cancel-ack",
  "batch-keep", "batch-postpone", "batch-ready-file", "batch-lost-cancel-ack"]) test(`explicit photo cancellation preserves the file and separately confirms the keep-current decision (${scenario})`, async ({ page, context }) => {
  const batch = scenario.startsWith("batch-"), outcome = batch ? scenario.slice(6) : scenario;
  test.setTimeout(90000);
  const f = await setup(page, context, { photoRecovery: true });
  await createRootContainer(page, "Сумка отмены фото");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid seed module path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const seeded = await page.evaluate(async ({ base, revision, batch }) => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const { createPersonalSaveOutbox } = await import("/src/sync/personal-save-outbox.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const getContext = () => ({ ...binding, scope: "personal", generation: "photo-cancel-seed" });
    const outbox = createPersonalSaveOutbox({ ...binding, storage: localStorage, photoEnabled: true, photoBatchEnabled: true });
    outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: revision });
    const store = createPersonalPhotoActionStore({ ...binding, enabled: true, batchEnabled: true, getContext });
    if (batch) {
      const { preparePersonalPhotoAttachmentBatch } = await import("/src/sync/personal-photo-batch-plan.js");
      const prepared = preparePersonalPhotoAttachmentBatch({ binding, snapshot: base, basePayload: base, baseStateRevision: revision,
        entityType: "container", entityId: Object.keys(base.containers)[0], baseEntityRevision: revision,
        files: [1, 2].map(index => ({ fileName: `cancel-batch-${index}.png`, file: new Blob([`cancel UI original file ${index}`], { type: "image/png" }), thumb: null })) }, { enabled: true });
      const plan = outbox.preparePhoto(prepared);
      const saved = await store.captureBatch({ ...plan, files: prepared.files });
      await outbox.capturePhoto({ plan, store, getContext });
      return { action: plan.action, cancellationReceipts: saved.files.map(part => ({ ok: true,
        operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
          entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
        cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
          thumbHash: part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } })) };
    }
    const entityId = Object.keys(base.containers)[0], stage = { operationId: crypto.randomUUID(), photoId: "cancel-ui-photo", entityType: "container", entityId, fileName: "cancel-ui.png" };
    const candidate = structuredClone(base); candidate.containers[entityId].photos = [{ id: stage.photoId, photoId: stage.photoId, assetId: stage.operationId, status: "pending" }];
    const plan = outbox.preparePhoto({ snapshot: candidate, payload: candidate, body: { version: 1, action: "attach", entityType: "container", entityId,
      photoId: stage.photoId, assetId: stage.operationId, baseStateRevision: revision, baseEntityRevision: revision, expectedPhotoIds: [], index: 0 } });
    await store.capture({ action: plan.action, snapshot: plan.snapshot, stage, file: new Blob(["cancel UI original file"], { type: "image/png" }) });
    await outbox.capturePhoto({ plan, store, getContext });
    const file = await store.read(plan.action.operationId), hash = file.fileMetadata.hash;
    return { action: plan.action, cancellationReceipt: { ok: true, operation: { id: stage.operationId, actorId: binding.actorId,
      environment: binding.environment, listId: binding.listId, entityType: stage.entityType, entityId, photoId: stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
      cancellation: { version: 1, stageOperationId: stage.operationId, fileHash: hash, thumbHash: hash, noAssetPublished: true, stageCannotPublish: true } } };
  }, { base: f.payload, revision: f.revision, batch });
  f.cancelPhotoAction = seeded.action; f.cancellationReceipt = seeded.cancellationReceipt;
  if (batch) f.cancellationReceipts = new Map(seeded.cancellationReceipts.map(proof => [proof.operation.id, proof]));
  f.loseCancellation = outcome === "lost-cancel-ack";
  if (outcome === "ready-file") {
    for (const { operation, cancellation } of batch ? seeded.cancellationReceipts : [seeded.cancellationReceipt]) {
    f.stageReceipts.set(operation.id, { ok: true, operation: { ...operation, state: "committed" },
      asset: { id: operation.id, publication: "not-published", state: "ready", fileHash: cancellation.fileHash,
        thumbHash: cancellation.thumbHash, storedFileHash: cancellation.fileHash, storedThumbHash: cancellation.thumbHash } });
    }
  }
  const beforePosts = f.posts.length, beforePayload = structuredClone(f.payload), beforeRevision = f.revision;
  const journal = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const beforeJournal = await journal();
  await reloadApp(page);
  const dialog = page.locator("#personalSaveRecoveryDialog"), cancel = dialog.locator("[data-cancel-photo-upload]");
  await expect(dialog).toBeVisible(); await expect(cancel).toBeVisible(); await cancel.click();
  await expect(page.locator("#confirmDialog")).toBeVisible(); await expect(page.locator("#confirmTitle")).toHaveText(batch ? "Фото не добавлены" : "Фото не добавлено");
  if (batch) await expect(page.locator("#confirmDialog")).toContainText("Все исходные файлы останутся");
  expect(f.cancellationPosts).toHaveLength(outcome === "ready-file" ? 0 : batch ? 2 : 1); expect(f.posts.length).toBe(beforePosts + 1);
  expect(f.payload).toEqual(beforePayload); expect(f.revision).toBe(beforeRevision);
  if (outcome === "postpone") {
    await page.locator("#confirmCancelBtn").click();
    await expect(dialog.getByRole("status")).toContainText("Выбор отложен");
    expect(await journal()).toEqual(beforeJournal);
  } else {
    if (outcome === "remote-change") {
      f.allowConflicts = true;
      f.beforeUpdate = () => {
        f.payload = structuredClone(f.payload); f.revision++;
        Object.values(f.payload.containers)[0].name = "Изменение другой вкладки"; f.beforeUpdate = null;
      };
    }
    if (outcome === "lost-decision-ack") f.lose = true;
    await page.locator("#confirmOkBtn").click();
    if (outcome === "remote-change") {
      await expect(cancel).toBeEnabled(); await expect(dialog.getByRole("status")).not.toContainText("Перезагрузите страницу");
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible();
      await page.locator("#confirmOkBtn").click();
    }
    await expect(dialog.getByRole("status")).toContainText("Перезагрузите страницу");
    await expect(dialog.getByRole("status")).toBeInViewport();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(f.posts.length).toBe(beforePosts + (outcome === "remote-change" ? 3 : 2));
    if (outcome === "keep") await page.screenshot({ path: test.info().outputPath("photo-cancel-ready.png") });
    f.lose = false; page.once("dialog", event => event.accept()); await reloadApp(page);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText:
      outcome === "remote-change" ? "Изменение другой вкладки" : "Сумка отмены фото" })).toBeVisible();
  }
  expect(f.cancellationPosts).toHaveLength(outcome === "ready-file" ? 0 : batch ? 2 : 1);
  expect(f.posts.filter(post => post.kind === "photos.mutate").map(post => post.operationId)).toEqual([seeded.action.operationId]);
  expect(await page.evaluate(async id => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const saved = await createPersonalPhotoActionStore({ actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" }).read(id);
    return saved.files ? Promise.all(saved.files.map(part => part.file.text())) : saved.file.text();
  }, seeded.action.operationId)).toEqual(batch ? ["cancel UI original file 1", "cancel UI original file 2"] : "cancel UI original file");
  expect(f.errors).toEqual([]);
});

for (const outcome of ["confirmed", "unknown", "rejected", "quota"]) test(`explicit photo recovery checks exact receipts without uploading and requires reload after a durable current baseline (${outcome})`, async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка проверки фото");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid seed module path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const seeded = await page.evaluate(async ({ base, revision, receipts }) => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const { createPersonalSaveOutbox } = await import("/src/sync/personal-save-outbox.js");
    const { canonicalListOperationJson } = await import("/src/sync/list-operation-queue.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const getContext = () => ({ ...binding, scope: "personal", generation: "photo-recovery-seed" });
    const outbox = createPersonalSaveOutbox({ ...binding, storage: localStorage, photoEnabled: true });
    outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: revision });
    const store = createPersonalPhotoActionStore({ ...binding, enabled: true, getContext });
    const entityId = Object.keys(base.containers)[0], stage = { operationId: crypto.randomUUID(), photoId: "retained-photo", entityType: "container", entityId };
    const candidate = structuredClone(base); candidate.containers[entityId].photos = [{ id: stage.photoId, photoId: stage.photoId, assetId: stage.operationId, status: "pending" }];
    const plan = outbox.preparePhoto({ snapshot: candidate, payload: candidate, body: { version: 1, action: "attach", entityType: "container", entityId,
      photoId: stage.photoId, assetId: stage.operationId, baseStateRevision: revision, baseEntityRevision: revision, expectedPhotoIds: [], index: 0 } });
    await store.capture({ action: plan.action, snapshot: plan.snapshot, stage, file: new Blob(["photo recovery preserved bytes"], { type: "image/png" }) });
    await outbox.capturePhoto({ plan, store, getContext });
    const operation = async (action, state) => ({ id: action.operationId, environment: binding.environment, actorId: binding.actorId,
      listId: binding.listId, kind: action.kind, state, payloadDigest: [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
        canonicalListOperationJson({ environment: binding.environment, actorId: binding.actorId, listId: binding.listId, kind: action.kind, body: action.body }))))].map(byte => byte.toString(16).padStart(2, "0")).join("") });
    const rejected = { ok: true, operation: await operation(plan.action, "rejected"), result: { status: 409,
      payload: { ok: false, code: "photo_asset_not_ready", stateRevision: revision } } };
    const proof = receipt => ({ historicalOnly: true, operation: receipt.operation, resultStatus: receipt.result.status,
      stateRevision: receipt.result.payload.list?.stateRevision ?? receipt.result.payload.stateRevision ?? null, rejectionCode: receipt.result.payload.code || null });
    const known = new Map(receipts.map(([id, data]) => [id, proof(data)])); known.set(plan.action.operationId, proof(rejected));
    const decision = await outbox.reconcile({ queue: { inspect: async input => known.get(input.operationId) }, getContext,
      readRemote: async () => ({ id: "list-a", ownerId: "actor-a", stateRevision: revision, payload: base }), resolveRejectedPhoto: async () => "keep-server" });
    return { photo: plan.action.operationId, decision: await operation(decision.action, "committed"), rejected };
  }, { base: f.payload, revision: f.revision, receipts: [...f.receipts] });
  f.receipts.set(seeded.photo, seeded.rejected);
  const committed = outcome === "confirmed" || outcome === "quota";
  if (outcome !== "unknown") f.receipts.set(seeded.decision.id, { ok: true,
    operation: { ...seeded.decision, state: committed ? "committed" : "rejected" },
    result: committed ? { status: 200, payload: { ok: true, stateRevision: ++f.revision,
      list: { id: f.listId, stateRevision: f.revision, payload: structuredClone(f.payload) } } }
      : { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: f.revision } } });
  if (outcome === "confirmed") {
    f.payload = structuredClone(f.payload); f.revision++;
    Object.values(f.payload.containers)[0].name = "Более свежая серверная сумка";
  }
  const posts = f.posts.length;
  await reloadApp(page);
  const dialog = page.locator("#personalSaveRecoveryDialog");
  await expect(dialog).toBeVisible();
  const snapshot = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const before = await snapshot();
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && String(key).includes(":checkpoint:")) throw new DOMException("Injected photo checkpoint quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await dialog.locator("[data-check-photo-result]").click();
  await expect(dialog.locator("[data-check-photo-result]")).toBeEnabled();
  await expect(dialog).toBeVisible(); // The explicit check never clears the editing latch in place.
  if (outcome === "confirmed") {
    await expect(dialog.getByRole("status")).toContainText("Перезагрузите страницу");
    page.once("dialog", event => event.accept());
    await reloadApp(page);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText: "Более свежая серверная сумка" })).toBeVisible();
  } else {
    await expect(dialog.getByRole("status")).not.toContainText("Перезагрузите страницу");
    if (outcome === "quota") await expect(dialog.getByRole("status")).toContainText("Не хватило места");
    expect(await snapshot()).toEqual(before);
  }
  expect(f.posts.length).toBe(posts);
  expect(await page.evaluate(async id => {
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    return (await createPersonalPhotoActionStore({ actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" }).read(id)).file.text();
  }, seeded.photo)).toBe("photo recovery preserved bytes");
  expect(f.errors).toEqual([]);
});

test("corrupt journal at reload shows a blocking recovery dialog without empty-list fallback or POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка до повреждения");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const corruptedKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith("bike-packing-personal-save-v1:") && /:[0-9a-f-]{36}$/.test(key));
    localStorage.setItem(key, "broken journal retained verbatim");
    localStorage.setItem("fixture-auth-token", "not-for-export");
    return key;
  });
  const postsBefore = f.posts.length;
  f.reloading = true;
  await page.reload();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible({ timeout: 20000 });
  f.reloading = false;
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("недоступна или повреждена");
  const copy = await downloadRecovery(page);
  expect(copy.journalEntries.find(entry => entry.key === corruptedKey).value).toBe("broken journal retained verbatim");
  expect(copy.memoryDraftAvailable).toBe(false);
  expect(JSON.stringify(copy)).not.toContain("not-for-export");
  expect(await page.evaluate(key => localStorage.getItem(key), corruptedKey)).toBe("broken journal retained verbatim");
  expect(f.posts.length).toBe(postsBefore);
  expect(Object.values(f.payload.containers).some(entry => entry.name === "Сумка до повреждения")).toBe(true);
  expect(f.errors).toEqual([]);
});

test("failed local ACK checkpoint pauses the UI and reload settles the same receipt without another POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Подтверждённая исходная сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const precedingIds = f.posts.map(post => post.operationId);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && String(key).includes(":applied:")) {
        throw new DOMException("Injected checkpoint quota", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await createRootContainer(page, "Сумка с потерянной локальной отметкой");
  // Let autosave reach the injected checkpoint failure; on mobile the modal
  // may already cover the manual sync button by the time the form closes.
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "error");
  expect(f.posts).toHaveLength(precedingIds.length + 1);
  const operationId = f.posts.at(-1).operationId;
  const copy = await downloadRecovery(page);
  expect(copy.journalEntries.some(entry => entry.key.endsWith(`:${operationId}`))).toBe(true);
  expect(copy.journalEntries.some(entry => entry.key.includes(`:applied:${operationId}`))).toBe(false);
  page.once("dialog", dialog => dialog.accept()); // Explicitly leave only after the recovery download.
  await reloadApp(page);
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Сумка с потерянной локальной отметкой"));
  expect(f.posts.map(post => post.operationId)).toEqual([...precedingIds, operationId]);
  await expect(page.locator("#personalSaveRecoveryDialog")).toHaveCount(0);
  expect(f.errors).toEqual([]);
});

test("a stale real tab cannot save over another tab and can export its separate draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  const other = await context.newPage();
  other.personalFixture = f;
  await other.goto(origin);
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  await createRootContainer(other, "Сумка другой вкладки");
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#rootContainerName").fill("Сумка старой вкладки");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Другая вкладка");
  const copy = await downloadRecovery(page);
  expect(Object.values(copy.unconfirmedMemoryDraft.containers).some(entry => entry.name === "Сумка старой вкладки")).toBe(true);
  expect(copy.journalEntries.some(entry => entry.value.includes("Сумка другой вкладки"))).toBe(true);
  expect(copy.journalEntries.some(entry => entry.value.includes("Сумка старой вкладки"))).toBe(false);
  expect(f.posts.some(post => Object.values(post.body.payload.containers).some(entry => entry.name === "Сумка старой вкладки"))).toBe(false);
  expect(f.errors).toEqual([]);
});

test("a stale real editor can reconcile its retained draft with the other tab and continue the same queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка двух вкладок");
  const item = await createItemInContainer(page, bag, "Общее начало", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], other = await context.newPage(); other.personalFixture = f;
  await other.goto(origin); await expect(other.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  await other.locator("#packingView [data-item-id]").filter({ hasText: "Общее начало" }).locator(".item-title-hitarea").click();
  await other.locator("#itemWeight").fill("333"); await submitForm(other, "#saveItemBtn", "#itemWeight");
  await expect(other.locator("#itemDialog")).not.toBeVisible();
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Черновик старой вкладки");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Черновик старой вкладки" })).toHaveCount(1);
  await synchronize(page, () => f.payload.items[id]?.name === "Черновик старой вкладки" && f.payload.items[id]?.weight === 333);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Черновик старой вкладки" })).toHaveCount(1);
  expect(f.payload.items[id].weight).toBe(333); expect(f.errors).toEqual([]);
});

test("stale draft choices can be postponed and must be compared again if the other tab edits during the dialog", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка сравнения вкладок");
  const item = await createItemInContainer(page, bag, "Общая вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], other = await context.newPage(); other.personalFixture = f;
  await other.goto(origin); await expect(other.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  const editOther = async (from, to) => {
    await other.locator("#packingView [data-item-id]").filter({ hasText: from }).locator(".item-title-hitarea").click();
    await other.locator("#itemName").fill(to); await submitForm(other, "#saveItemBtn", "#itemName");
    await expect(other.locator("#itemDialog")).not.toBeVisible();
  };
  await editOther("Общая вещь", "Другой вариант 1");
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Мой отложенный вариант");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await expect(page.locator("#conflictList")).toContainText("другой вкладки");
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Сравнение отложено");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await editOther("Другой вариант 1", "Другой вариант 2");
  await page.locator('#conflictList input[value="local"]').check(); await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Повторите сравнение");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictList")).toContainText("Другой вариант 2");
  await page.locator('#conflictList input[value="remote"]').check(); await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.items[id]?.name === "Другой вариант 2");
  expect(f.posts.some(post => post.body.payload.items[id]?.name === "Мой отложенный вариант")).toBe(false);
  expect(f.errors).toEqual([]);
});

test("Experiment is prominent above the header, fits mobile and remains translated", async ({ page, context }, info) => {
  await setup(page, context);
  const banner = page.locator("#experimentBanner");
  await expect(banner).toHaveText("ЭКСПЕРИМЕНТ");
  const bounds = await banner.evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { left: rect.left, right: rect.right, bottom: rect.bottom, width: innerWidth,
      headerTop: document.querySelector(".topbar").getBoundingClientRect().top,
      fontSize: parseFloat(style.fontSize), weight: Number(style.fontWeight), position: style.position };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.headerTop);
  expect(bounds.fontSize).toBeGreaterThanOrEqual(24); expect(bounds.weight).toBe(900);
  expect(bounds.position).toBe("sticky");
  await page.screenshot({ path: info.outputPath("experiment-banner.png") });
  await page.locator("#menuBtn").click();
  await page.locator("#languageSelect").selectOption("en");
  await expect(banner).toHaveText("EXPERIMENT");
});

test("public template copying stays paused with its own flag off and cannot fall through to legacy writes", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT === "1", "This test checks the disabled public writer");
  test.setTimeout(90000);
  const f = await setup(page, context, { photoEdit: true, publicSource: guestImportPayload(true) });
  await synchronize(page, () => true);
  const before = structuredClone(f.payload), posts = f.posts.length;
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1, { timeout: 30000 });
  await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await page.locator("#confirmDialog").getByRole("button", { name: "Смотреть шаблон", exact: true }).click();
  await page.locator('[data-copy-shared-layout="template-ui"]').first().click();
  await expect(page.locator("main")).toContainText("Копирование публичных шаблонов через очередь ещё не включено.");
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-public-selections-v1:")))).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const fileless of [false, true]) for (const lost of [false, true]) test(`public template whole copy ${fileless ? "fileless" : "photos"} ${lost ? "lost owner ACK" : "confirmed"} is durable and recovers without duplicate IDs`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1", "Own public-copy gate remains disabled");
  test.setTimeout(90000);
  const publicSource = guestImportPayload(!fileless);
  publicSource.layouts[publicSource.activeLayoutId].name = "Публичная исходная укладка";
  const f = await setup(page, context, { photoEdit: true, publicSource, configure: f => { f.loseFormOwner = lost; } });
  await synchronize(page, () => true);
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1, { timeout: 30000 });
  await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await page.locator("#confirmDialog").getByRole("button", { name: "Смотреть шаблон", exact: true }).click();
  const button = page.locator('[data-copy-shared-layout="template-ui"]'); await expect(button.first()).toBeVisible();
  await button.first().click();
  await expect.poll(() => f.posts.filter(post => post.body.publicImport).length, { timeout: 30000 }).toBe(1);
  const action = structuredClone(f.posts.find(post => post.body.publicImport)), posts = f.posts.length, stages = [...f.stagePosts];
  expect(action.body.publicImport.sourcePayload).toEqual(publicSource);
  expect(action.body.publicImport.files).toHaveLength(fileless ? 0 : 1);
  expect(action.body.causal.reads).toEqual([{ listId: "public-shared-layout-template-ui", revision: 7 }]);
  if (lost) {
    await expect.poll(() => f.hiddenFormOwner).toBe(action.operationId);
    await reloadApp(page, { recovery: true });
    f.loseFormOwner = false; f.hiddenFormOwner = "";
    await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
    await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 20000 });
    await reloadApp(page);
  } else await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, text]) => key.startsWith("bike-packing-public-selections-v1:") && key.endsWith(":completion"))), { timeout: 30000 }).toBe(true);
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual(stages);
  expect(Object.values(f.payload.layouts).filter(layout => layout.id === action.body.publicImport.layoutTargets[0].targetId)).toHaveLength(1);
  for (const owner of action.body.publicImport.ownerTargets) expect(owner.targetId).not.toBe(owner.sourceId);
  await reloadApp(page); expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual(stages); expect(f.errors).toEqual([]);
});


async function preparePendingPublicUi(page, context, fileless, tree = false) {
  const publicSource = guestImportPayload(!fileless);
  if (!fileless) publicSource.containers.bag.photos = [{ ...publicSource.items.source.photos[0], id: "public-bag-photo" }];
  let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  const f = await setup(page, context, { photoEdit: true, publicSource }); f.publicChosenSource = structuredClone(publicSource);
  await synchronize(page, () => true);
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1, { timeout: 30000 });
  await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await page.locator("#confirmDialog").getByRole("button", { name: "Смотреть шаблон", exact: true }).click();
  if (fileless) f.beforeUpdate = body => body.kind === "list.import" ? hold() : undefined;
  else f.beforeStageAck = hold;
  if (tree) {
    await page.locator('[data-copy-root="shared-virtual-container-bag"]').filter({ visible: true }).first().click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-a");
    await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
    // This empty private target has no duplicates to resolve. The chosen
    // tree starts copying directly after its destination is selected.
  } else await page.locator('[data-copy-shared-layout="template-ui"]').first().click();
  await expect.poll(() => Boolean(release), { timeout: 30000 }).toBe(true);
  const imported = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(record => record.action?.body.publicImport));
  const target = (entityType, sourceId) => imported.action.body.publicImport.ownerTargets.find(owner => owner.entityType === entityType && owner.sourceId === sourceId).targetId;
  const layoutId = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")).activeLayoutId);
  return { f, imported, itemId: target("item", "source"), bagId: target("container", "bag"), layoutId,
    release: () => release?.(), clearHold: () => { f.beforeStageAck = null; f.beforeUpdate = null; } };
}

async function preparePendingServerUi(page, context, fileless, legacy = false) {
  const { f } = await openServerSourceUi(page, context, { photos: !fileless, legacy }); let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  if (fileless) f.beforeUpdate = body => body.kind === "list.import" ? hold() : undefined;
  else f.beforeStageAck = hold;
  await page.locator("[data-copy-shared-layout]").filter({ visible: true }).first().click();
  await expect.poll(() => Boolean(release), { timeout: 30000 }).toBe(true);
  await expect(page).not.toHaveURL(/[?&](?:sharedList|shared)=/);
  const imported = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(record => record.action?.body.serverImport));
  const target = (entityType, sourceId) => imported.action.body.serverImport.ownerTargets.find(owner => owner.entityType === entityType && owner.sourceId === sourceId).targetId;
  const layoutId = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")).activeLayoutId);
  return { f, imported, itemId: target("item", "source"), bagId: target("container", "bag"), layoutId,
    release: () => release?.(), clearHold: () => { f.beforeStageAck = null; f.beforeUpdate = null; } };
}

for (const [fileless, outcome] of [[false, "save"], [true, "save"], [false, "delete item"], [false, "quota"],
  [false, "mixed"], [false, "cancel"], [false, "lost cancellation"]])
test(`server pending new photo forms ${fileless ? "fileless" : "photos"} ${outcome} retain different owners and original files`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_SERVER_PHOTO_FORMS !== "1", "Server photo forms retain their independent gate");
  test.setTimeout(150000);
  const { f, imported, itemId, bagId, release, clearHold } = await preparePendingServerUi(page, context, fileless);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 12; canvas.height = 12;
    const context = canvas.getContext("2d"); context.fillStyle = "#326b47"; context.fillRect(0, 0, 12, 12);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const server = structuredClone(f.payload), forms = [];
  try {
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      const mixed = outcome === "mixed" && type === "item";
      if (mixed) { await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click(); }
      await page.locator(`#${prefix}PhotoInput`).setInputFiles(Array.from({ length: mixed ? 2 : 1 }, (_, i) => ({ name: `новое-${type}-${i}.png`, mimeType: "image/png", buffer: image })));
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(fileless ? 1 : 2);
      if (mixed) {
        await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
        await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
      }
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "341" : "562");
      if (outcome === "quota") await page.evaluate(() => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.ownerResult?.version === 6) throw new DOMException("Server photo form quota", "QuotaExceededError");
          return write.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(dialog).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
        expect((await records()).filter(record => record.action.body.ownerResult?.version === 6)).toEqual([]);
        expect(f.payload).toEqual(server);
        const download = page.waitForEvent("download"); await page.locator("[data-download-photo-recovery]").click();
        const archive = await readZipEntries(new Blob([await readFile(await (await download).path())]));
        expect([...archive.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(3);
        return;
      }
      await expect(dialog).not.toBeVisible();
      const saved = (await records()).find(record => record.action.body.ownerResult?.version === 6 && record.action.body.entityId === id);
      expect(saved).toBeTruthy(); forms.push(saved);
      expect(saved.action.body.ownerResult.serverOperationId).toBe(imported.action.operationId);
      if (!fileless || type === "container") expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(itemId);
      if (!fileless) expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(bagId);
      expect(saved.action.body.changes.filter(change => change.action === "attach")).toHaveLength(mixed ? 2 : 1);
    }
    if (outcome === "delete item") {
      await page.locator('[data-view="items"]').click(); await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
      await page.locator("#itemDeleteForeverBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible({ timeout: 30000 });
      await submitForm(page, "#confirmOkBtn"); await expect(page.locator("#itemDialog")).not.toBeVisible();
      expect((await records()).some(record => record.action.body.photoResults?.version === 13)).toBe(true);
    }
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    if (outcome === "cancel" || outcome === "lost cancellation") {
      await context.route(`${origin}/src/**/*.js`, async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
        return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
      });
      const nativeFiles = () => page.evaluate(async () => {
        const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
        const store = createPersonalPhotoActionStore(binding), proofs = [];
        for (const id of await store.ids()) for (const part of (await store.read(id)).files) proofs.push({ ok: true,
          operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
            entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } });
        return proofs;
      });
      const retained = await records(), files = await nativeFiles();
      expect(files).toHaveLength(4);
      f.cancelPhotoActions = new Map(retained.map(record => [record.action.operationId, record.action]));
      f.cancellationReceipts = new Map(files.map(proof => [proof.operation.id, proof]));
      f.loseStageAt = 1; clearHold(); release(); await expect.poll(() => Boolean(f.hiddenStage)).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await expect(cancel).toBeVisible();
      if (outcome === "lost cancellation") {
        f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled({ timeout: 30000 });
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      }
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible({ timeout: 30000 }); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      expect(new Set(f.ownerCancellationPosts)).toEqual(new Set([imported, ...forms].map(record => record.action.operationId)));
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
      expect(f.payload).toEqual(server); expect(f.stagePosts).toHaveLength(1); expect(await nativeFiles()).toEqual(files);
      await reloadApp(page); expect(f.errors).toEqual([]); return;
    }
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    f.beforePhotoWrite = action => { f.loseFormOwner = action.operationId === forms[1].action.operationId; };
    await resume.click(); await expect(resume).toBeEnabled({ timeout: 30000 }); await expect.poll(() => f.injectedFailure).toBe(true);
    f.beforePhotoWrite = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
    await reloadApp(page, { recovery: true }); await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    if (outcome === "delete item") expect(f.payload.items[itemId]).toBeUndefined();
    else { expect(f.payload.items[itemId].weight).toBe(341); expect(f.payload.items[itemId].photos).toHaveLength(fileless ? 1 : 2); }
    expect(f.payload.containers[bagId].weight).toBe(562); expect(f.payload.containers[bagId].photos).toHaveLength(fileless ? 1 : 2);
    if (outcome === "mixed") expect(f.payload.items[itemId].photos.map(photo => photo.id)).toEqual(forms[0].photoState.payload.items[itemId].photos.map(photo => photo.id));
    expect(f.stagePosts).toHaveLength(outcome === "mixed" ? 5 : fileless ? 2 : 4); expect(new Set(f.stagePosts).size).toBe(f.stagePosts.length);
    for (const saved of [imported, ...forms]) expect(f.posts.filter(post => post.operationId === saved.action.operationId)).toHaveLength(1);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const [fileless, outcome] of [[false, "save"], [true, "save"], [false, "delete item"], [false, "quota"],
  [false, "mixed"], [false, "cancel"], [false, "lost cancellation"]])
test(`public pending new photo forms ${fileless ? "fileless" : "photos"} ${outcome} retain different owners and original files`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_PHOTO_FORMS !== "1", "Public photo forms retain their independent gate");
  test.setTimeout(150000);
  const { f, imported, itemId, bagId, release, clearHold } = await preparePendingPublicUi(page, context, fileless);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 12; canvas.height = 12;
    const context = canvas.getContext("2d"); context.fillStyle = "#326b47"; context.fillRect(0, 0, 12, 12);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const server = structuredClone(f.payload), forms = [];
  try {
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      const mixed = outcome === "mixed" && type === "item";
      if (mixed) { await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click(); }
      await page.locator(`#${prefix}PhotoInput`).setInputFiles(Array.from({ length: mixed ? 2 : 1 }, (_, i) => ({ name: `новое-${type}-${i}.png`, mimeType: "image/png", buffer: image })));
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(fileless ? 1 : 2);
      if (mixed) {
        await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
        await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
      }
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "341" : "562");
      if (outcome === "quota") await page.evaluate(() => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.ownerResult?.version === 2) throw new DOMException("Public photo form quota", "QuotaExceededError");
          return write.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(dialog).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
        expect((await records()).filter(record => record.action.body.ownerResult?.version === 2)).toEqual([]);
        expect(f.payload).toEqual(server);
        const download = page.waitForEvent("download"); await page.locator("[data-download-photo-recovery]").click();
        const archive = await readZipEntries(new Blob([await readFile(await (await download).path())]));
        expect([...archive.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(3);
        return;
      }
      await expect(dialog).not.toBeVisible();
      const saved = (await records()).find(record => record.action.body.ownerResult?.version === 2 && record.action.body.entityId === id);
      expect(saved).toBeTruthy(); forms.push(saved);
      expect(saved.action.body.ownerResult.publicOperationId).toBe(imported.action.operationId);
      if (!fileless || type === "container") expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(itemId);
      if (!fileless) expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(bagId);
      expect(saved.action.body.changes.filter(change => change.action === "attach")).toHaveLength(mixed ? 2 : 1);
    }
    if (outcome === "delete item") {
      await page.locator('[data-view="items"]').click(); await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
      await page.locator("#itemDeleteForeverBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
      await submitForm(page, "#confirmOkBtn"); await expect(page.locator("#itemDialog")).not.toBeVisible();
      expect((await records()).some(record => record.action.body.photoResults?.version === 8)).toBe(true);
    }
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    if (outcome === "cancel" || outcome === "lost cancellation") {
      await context.route(`${origin}/src/**/*.js`, async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
        return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
      });
      const nativeFiles = () => page.evaluate(async () => {
        const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
        const store = createPersonalPhotoActionStore(binding), proofs = [];
        for (const id of await store.ids()) for (const part of (await store.read(id)).files) proofs.push({ ok: true,
          operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
            entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } });
        return proofs;
      });
      const retained = await records(), files = await nativeFiles();
      expect(files).toHaveLength(4);
      f.cancelPhotoActions = new Map(retained.map(record => [record.action.operationId, record.action]));
      f.cancellationReceipts = new Map(files.map(proof => [proof.operation.id, proof]));
      f.loseStageAt = 1; clearHold(); release(); await expect.poll(() => Boolean(f.hiddenStage)).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await expect(cancel).toBeVisible();
      if (outcome === "lost cancellation") {
        f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      }
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      expect(new Set(f.ownerCancellationPosts)).toEqual(new Set([imported, ...forms].map(record => record.action.operationId)));
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
      expect(f.payload).toEqual(server); expect(f.stagePosts).toHaveLength(1); expect(await nativeFiles()).toEqual(files);
      await reloadApp(page); expect(f.errors).toEqual([]); return;
    }
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    f.beforePhotoWrite = action => { f.loseFormOwner = action.operationId === forms[1].action.operationId; };
    await resume.click(); await expect(resume).toBeEnabled(); await expect.poll(() => f.injectedFailure).toBe(true);
    f.beforePhotoWrite = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
    await reloadApp(page, { recovery: true }); await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    if (outcome === "delete item") expect(f.payload.items[itemId]).toBeUndefined();
    else { expect(f.payload.items[itemId].weight).toBe(341); expect(f.payload.items[itemId].photos).toHaveLength(fileless ? 1 : 2); }
    expect(f.payload.containers[bagId].weight).toBe(562); expect(f.payload.containers[bagId].photos).toHaveLength(fileless ? 1 : 2);
    if (outcome === "mixed") expect(f.payload.items[itemId].photos.map(photo => photo.id)).toEqual(forms[0].photoState.payload.items[itemId].photos.map(photo => photo.id));
    expect(f.stagePosts).toHaveLength(outcome === "mixed" ? 5 : fileless ? 2 : 4); expect(new Set(f.stagePosts).size).toBe(f.stagePosts.length);
    for (const saved of [imported, ...forms]) expect(f.posts.filter(post => post.operationId === saved.action.operationId)).toHaveLength(1);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const family of ["public", "server"]) for (const type of ["item", "container"]) test(family + " pending new photo writer disabled retains the " + type + " form without fallback", async ({ page, context }) => {
  const gatePrefix = family === "server" ? "BIKE_PERSONAL_SERVER" : "BIKE_PERSONAL_PUBLIC";
  test.skip(process.env[gatePrefix + "_PHOTO_FORMS"] === "1" || process.env[gatePrefix + "_IMPORT"] !== "1", "Checks the independent photo writer gate");
  const { f, itemId, bagId, release, clearHold } = await (family === "server" ? preparePendingServerUi : preparePendingPublicUi)(page, context, false);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const before = await records(), server = structuredClone(f.payload), posts = f.posts.length;
  const prefix = type === "item" ? "item" : "rootContainer", id = type === "item" ? itemId : bagId;
  try {
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
    const image = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 3;
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator(`#${prefix}PhotoInput`).setInputFiles({ name: "retained.png", mimeType: "image/png", buffer: image });
    await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(2);
    await page.locator(`#${prefix}Weight`).fill("743");
    await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
    await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.message)).toBeTruthy();
    await expect(page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog")).toBeVisible();
    await expect(page.locator(`#${prefix}Weight`)).toHaveValue("743");
    expect(await records()).toEqual(before); expect(f.payload).toEqual(server);
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toHaveLength(1); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const [fileless, outcome] of [[false, "fields"], [true, "fields"], [false, "item"], [false, "container"], [false, "layout"], [false, "quota"], [false, "lost child"]])
test(`pending public descendants ${fileless ? "fileless" : "photo"} ${outcome} keep exact files and later changes through reload`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_PUBLIC !== "1" || process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1", "Public descendants remain disabled");
  test.setTimeout(150000);
  const { f, imported, itemId, bagId, layoutId, release, clearHold } = await preparePendingPublicUi(page, context, fileless);
  const before = f.posts.filter(post => post.kind !== "list.import").length;
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    const children = [];
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "146" : "287");
      if (outcome === "quota") await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.photoResults?.version === 7) throw new DOMException("Pending public quota", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(dialog).toBeVisible();
        expect((await records()).filter(record => record.action.body.photoResults?.version === 7)).toEqual([]);
        const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
        expect(local.items[itemId].weight).toBe(imported.action.body.payload.items[itemId].weight); expect(f.posts).toHaveLength(before); expect(f.stagePosts).toHaveLength(1);
        const downloaded = page.waitForEvent("download"); await page.locator("#personalSaveRecoveryDialog [data-download-photo-recovery]").click();
        const entries = await readZipEntries(new Blob([await readFile(await (await downloaded).path())]));
        const form = JSON.parse(zipText(entries.get("opened-form/form.json")));
        expect(form.preview.items[itemId].weight).toBe(146);
        expect([...entries.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(2);
        expect(JSON.parse(JSON.parse(zipText(entries.get("public-import-selections.json"))).find(row => row.key.endsWith(":selection")).text).selection.sourcePayload).toEqual(f.publicChosenSource);
        return;
      }
      await expect(dialog).not.toBeVisible();
      const child = (await records()).filter(record => record.action.body.photoResults?.version === 7).find(record => !children.some(known => known.action.operationId === record.action.operationId));
      expect(child).toBeTruthy(); children.push(child);
      expect(child.action.body.causal.baseOperationId).toBe(children.length === 1 ? imported.action.operationId : children.at(-2).action.operationId);
      expect(child.action.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([...new Set([child.action.body.causal.baseOperationId, imported.action.operationId])]);
    }
    if (["item", "container"].includes(outcome)) {
      const item = outcome === "item", id = item ? itemId : bagId;
      await page.locator(`[data-view="${item ? "items" : "bags"}"]`).click();
      await page.locator(item ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      await page.locator(item ? "#itemDeleteForeverBtn" : "#rootContainerDeleteForeverBtn").click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
      await expect(page.locator(item ? "#itemDialog" : "#rootContainerDialog")).not.toBeVisible();
    } else if (outcome === "layout") {
      await page.locator('[data-view="packing"]').click(); await confirmActiveLayoutDeletion(page);
      await page.locator("#confirmOkBtn").click(); await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
    }
    const pending = (await records()).filter(record => record.action.body.photoResults?.version === 7);
    expect(pending).toHaveLength(["item", "container", "layout"].includes(outcome) ? 3 : 2);
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    clearHold(); release();
    await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    if (outcome === "lost child" || fileless) f.beforeUpdate = body => { if (body.body.photoResults?.version === 7) { f.lose = true; f.unknown = true; } };
    else f.loseFormOwner = true;
    await resume.click(); await expect(resume).toBeEnabled(); await expect.poll(() => f.injectedFailure).toBe(true);
    f.loseFormOwner = false; f.hiddenFormOwner = null; f.beforeUpdate = null; f.lose = false; f.unknown = false;
    await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 1 + pending.length); expect(f.stagePosts).toHaveLength(fileless ? 0 : 2); expect(new Set(f.stagePosts).size).toBe(fileless ? 0 : 2);
    expect(f.posts[before].body).toEqual(imported.action.body);
    for (const child of pending) expect(f.posts.find(post => post.operationId === child.action.operationId).body).toEqual(child.action.body);
    await reloadApp(page); await expect(recovery).not.toBeVisible();
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    if (outcome === "item") expect(local.items[itemId]).toBeUndefined(); else expect(local.items[itemId].weight).toBe(146);
    if (outcome === "container") expect(local.containers[bagId]).toBeUndefined(); else expect(local.containers[bagId].weight).toBe(287);
    if (outcome === "layout") expect(local.layouts[layoutId]).toBeUndefined();
    for (const owner of [local.items[itemId], local.containers[bagId]].filter(Boolean)) expect((owner.photos || []).map(photo => photo.status)).toEqual(fileless ? [] : ["synced"]);
    expect(f.posts.filter(post => post.kind === "list.import")).toHaveLength(1);
    expect(imported.action.body.publicImport.sourcePayload).toEqual(f.publicChosenSource);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const lost of ["cancellation", "decision"]) test(`pending public descendants cancellation preserves the full chain through lost ${lost} ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_PUBLIC !== "1" || process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1", "Public descendants remain disabled");
  test.setTimeout(150000);
  const { f, itemId, release, clearHold } = await preparePendingPublicUi(page, context, false), before = f.posts.length, current = structuredClone(f.payload);
  try {
    await page.locator('[data-view="items"]').click();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("146"); await submitForm(page, "#saveItemBtn", "#itemWeight"); await expect(page.locator("#itemDialog")).not.toBeVisible();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click(); await page.locator("#itemDeleteForeverBtn").click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click(); await expect(page.locator("#itemDialog")).not.toBeVisible();
    const records = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
      .map(([, value]) => JSON.parse(value)).filter(record => record.action));
    const saved = records.find(record => record.action.kind === "list.import"); f.cancelPhotoAction = saved.action;
    expect(records.filter(record => record.action.body.photoResults?.version === 7)).toHaveLength(2);
    f.cancellationReceipts = new Map(saved.action.body.publicImport.files.map(file => [file.assetId, { ok: true,
      operation: { id: file.assetId, actorId: "actor-a", environment: "bike-packing-experiment", listId: f.listId,
        entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
      cancellation: { version: 1, stageOperationId: file.assetId, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, noAssetPublished: true, stageCannotPublish: true } }]));
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]"); await expect(cancel).toBeVisible();
    if (lost === "cancellation") {
      f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled();
      expect(f.payload).toEqual(current); await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
    }
    await cancel.click(); await expect(page.locator("#confirmDialog")).toContainText("действий: 3");
    await page.locator("#confirmCancelBtn").click(); await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(current);
    expect(f.posts).toHaveLength(before + 3);
    if (lost === "decision") f.beforeUpdate = action => { if (!action.body.photoResults) { f.lose = true; f.unknown = true; } };
    await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    if (lost === "decision") {
      await expect.poll(() => f.injectedFailure).toBe(true); f.beforeUpdate = null; f.lose = false; f.unknown = false;
      await reloadApp(page, { recovery: true }); await cancel.click();
    }
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 4); expect(f.stagePosts).toHaveLength(1);
    expect(f.cancellationPosts.map(post => post.id)).toEqual(saved.action.body.publicImport.files
      .filter(file => !f.stagePosts.includes(file.assetId)).map(file => file.assetId));
    const decision = f.posts.at(-1); expect(decision.body.photoResults).toBeUndefined(); expect(decision.body.publicImport).toBeUndefined();
    await reloadApp(page); await expect(recovery).not.toBeVisible(); expect(f.payload).toEqual(current); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});


for (const fileless of [false, true]) test(`pending public writer disabled keeps the ${fileless ? "fileless" : "photo"} draft and original import`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PENDING_PUBLIC === "1" || process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1", "Checks the independent disabled descendant writer");
  test.setTimeout(120000);
  const { f, itemId, release, clearHold } = await preparePendingPublicUi(page, context, fileless);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const before = await records(), posts = f.posts.length;
  try {
    await page.locator('[data-view="items"]').click();
    await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("146"); await submitForm(page, "#saveItemBtn", "#itemWeight");
    await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.message)).toBe("Правки до подтверждения копии публичного шаблона ещё не включены. Поля остались в форме.");
    await expect(page.locator("#itemDialog")).toBeVisible(); await expect(page.locator("#itemWeight")).toHaveValue("146");
    expect(await records()).toEqual(before); expect(f.posts).toHaveLength(posts);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1::id:actor-a")));
    expect(local.items[itemId].weight).toBe(before.find(record => record.action.body.publicImport).action.body.payload.items[itemId].weight);
    expect(f.stagePosts).toHaveLength(fileless ? 0 : 1); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const language of ["ru", "en"]) for (const fileless of [false, true]) test(`selected demo public copy ${language} ${fileless ? "fileless" : "photo"} retains the chosen template instead of the default after lost ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1", "Public copy remains disabled"); test.setTimeout(150000);
  const publicSource = guestImportPayload(!fileless), chosenName = `Selected demo ${language}`, listId = `public-demo-state-selected-${language}`, itemKey = `demo-state:selected-${language}`;
  publicSource.items.source.name = `Exact selected source ${language}`;
  const other = structuredClone(publicSource); other.items.source.name = "Different default source";
  const selected = { id: listId, itemKey, publicTemplateKind: "demo", sharedLayoutId: undefined, title: chosenName, language, sourceType: "public-template" };
  const f = await setup(page, context, { photoEdit: true, language, publicSource, publicSourceConfig: { record: selected,
    others: [{ ...selected, id: language === "ru" ? "public-demo-state" : "public-demo-state-en", itemKey: language === "ru" ? "demo-state" : "demo-state:en",
      title: "Default demo", payload: other, visibility: "public", stateRevision: 7, ownerId: "public-owner", layoutOrder: -1 }] } });
  await synchronize(page, () => true); const posts = f.posts.length;
  const option = page.locator("#layoutSelect option").filter({ hasText: chosenName });
  await expect(option).toHaveCount(1, { timeout: 30000 }); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  f.loseFormOwner = true;
  const button = page.locator('[data-copy-shared-layout]').filter({ visible: true }).first(); await button.click();
  await expect.poll(() => f.posts.length).toBe(posts + 1);
  const original = structuredClone(f.posts.at(-1)); expect(original.kind).toBe("list.import");
  expect(original.body.publicImport.source).toEqual({ kind: "public-template", listId, itemKey, stateRevision: 7, language });
  expect(original.body.publicImport.sourcePayload).toEqual(publicSource);
  await expect.poll(() => f.hiddenFormOwner).toBe(original.operationId);
  await reloadApp(page, { recovery: true }); f.loseFormOwner = false; f.hiddenFormOwner = null;
  await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText(language === "ru" ? "Подтверждения и актуальная версия сохранены" : "Receipts and the current version are saved");
  await reloadApp(page);
  expect(f.posts).toHaveLength(posts + 1); expect(f.stagePosts).toHaveLength(fileless ? 0 : 1);
  const copied = Object.values(f.payload.items).find(item => item.name === `Exact selected source ${language}`); expect(copied).toBeTruthy();
  expect(Object.values(f.payload.items).some(item => item.name === "Different default source")).toBe(false);
  expect(f.posts.at(-1)).toEqual(original); expect(f.errors).toEqual([]);
});

for (const kind of ["item", "tree", "empty", "nested", "unplaced"]) for (const fileless of [false, true]) for (const demo of (kind === "unplaced" ? [false] : [false, true]))
test(`public entity ${kind} ${fileless ? "fileless" : "photo"} ${demo ? "demo" : "shared"} copy keeps selected source and existing target through lost ACK`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1", "Separate public copies remain disabled");
  test.setTimeout(150000);
  const publicSource = guestImportPayload(!fileless), payload = replacementPayload();
  const sourceId = kind === "item" ? "source" : kind === "nested" ? "pocket" : kind === "unplaced" ? "newbag" : "bag";
  publicSource.items.source.name = "Точная публичная вещь"; publicSource.containers.bag.name = "Точная публичная сумка";
  payload.items.source.name = "Моя изменённая вещь"; payload.containers.bag.name = "Моя сумка";
  if (!fileless) publicSource.containers[kind === "nested" || kind === "unplaced" ? sourceId : "bag"].photos = [{ ...publicSource.items.source.photos[0], id: "public-bag-photo" }];
  const other = structuredClone(publicSource); other.items.source.name = "Ошибка: другой шаблон"; other.containers.bag.name = "Ошибка: другая сумка";
  const itemKey = demo ? "demo-state:entities-selected" : "shared-layout:entities-selected", listId = demo ? "public-demo-state-entities-selected" : "public-shared-layout-entities-selected";
  const selected = { id: listId, itemKey, publicTemplateKind: demo ? "demo" : "shared", sharedLayoutId: demo ? undefined : "entities-selected",
    title: "Выбранный источник копии", language: "ru", sourceType: demo ? "public-template" : "curated-bikepacker" };
  const f = await setup(page, context, { photoEdit: true, payload, publicSource, publicSourceConfig: { record: selected,
    others: [{ ...selected, id: demo ? "public-demo-state" : "public-shared-layout-entities-other", itemKey: demo ? "demo-state" : "shared-layout:entities-other",
      sharedLayoutId: demo ? undefined : "entities-other", title: "Другой источник", payload: other, visibility: "public", stateRevision: 7, ownerId: "public-owner", layoutOrder: -1 }] } });
  await synchronize(page, () => Boolean(f.payload.items.source)); const before = structuredClone(f.payload);
  const option = page.locator("#layoutSelect option").filter({ hasText: selected.title });
  await expect(option).toHaveCount(1, { timeout: 30000 }); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  if (["empty", "unplaced"].includes(kind)) await page.locator('[data-view="bags"]').click();
  if (kind === "item") await page.locator('[data-view="items"]').click();
  const copyButton = kind === "item" ? page.locator('[data-copy-layout-item="shared-virtual-item-source"], [data-copy-item="shared-virtual-item-source"]')
    : page.locator(`[data-copy-root="shared-virtual-container-${sourceId}"]`);
  await copyButton.filter({ visible: true }).first().click();
  const picker = page.locator("#containerPickerDialog"); await expect(picker).toBeVisible();
  await page.locator("#containerPickerLayoutSelect").selectOption("layout-a");
  f.loseFormOwner = true; const posts = f.posts.length;
  if (["item", "nested"].includes(kind)) await page.locator('#containerPickerBoard [data-pick-container="bag"]').click();
  else await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  if (kind !== "unplaced") { await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn"); }
  await expect(picker).not.toBeVisible();
  await expect.poll(() => f.posts.length, { timeout: 30000 }).toBe(posts + 1);
  const original = structuredClone(f.posts.at(-1)), manifest = original.body.publicImport;
  expect(original.kind).toBe("list.import"); expect(manifest.version).toBe(2);
  expect(manifest.source).toEqual({ kind: "public-template", listId, itemKey, stateRevision: 7, language: "ru" });
  expect(manifest.sourcePayload).toEqual(publicSource); expect(manifest.copy.destination.layoutId).toBe("layout-a");
  expect(manifest.copy.entries).toEqual([{ entityType: kind === "item" ? "item" : "container", sourceId, includeContents: ["tree", "nested"].includes(kind) }]);
  await expect.poll(() => f.hiddenFormOwner).toBe(original.operationId);
  await reloadApp(page, { recovery: true }); f.loseFormOwner = false; f.hiddenFormOwner = null;
  await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Подтверждения и актуальная версия сохранены");
  await reloadApp(page); expect(f.posts).toHaveLength(posts + 1); expect(f.posts.at(-1)).toEqual(original);
  expect(personalBusinessPayload(f.payload).items.source).toEqual(personalBusinessPayload(before).items.source);
  expect(personalBusinessPayload(f.payload).containers.bag).toEqual(personalBusinessPayload(before).containers.bag);
  expect(Object.keys(f.payload.layouts)).toEqual(Object.keys(before.layouts));
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities.source).toBe(3);
  const copiedItem = manifest.ownerTargets.find(owner => owner.entityType === "item" && owner.sourceId === (kind === "nested" ? "inside" : "source"));
  if (copiedItem) {
    expect(f.payload.items[copiedItem.targetId].name).toBe(publicSource.items[copiedItem.sourceId].name);
    expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[copiedItem.targetId]).toBe(kind === "nested" ? 2 : 3);
  }
  expect(f.stagePosts).toHaveLength(fileless ? 0 : kind === "tree" ? 2 : 1); expect(f.errors).toEqual([]);
});

for (const item of [false, true]) test(`public entity gate off keeps ${item ? "item" : "tree"} selection away from legacy writes`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES === "1", "Checks the independent disabled entity writer");
  const publicSource = guestImportPayload(true), f = await setup(page, context, { photoEdit: true, payload: replacementPayload(), publicSource });
  await synchronize(page, () => Boolean(f.payload.items.source)); const before = structuredClone(f.payload), posts = f.posts.length;
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  if (item) await page.locator('[data-view="items"]').click();
  await page.locator(item ? '[data-copy-item="shared-virtual-item-source"]' : '[data-copy-root="shared-virtual-container-bag"]').filter({ visible: true }).first().click();
  await expect(page.getByText("Копирование отдельных записей шаблона через очередь ещё не включено.", { exact: true })).toBeVisible();
  await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-public-selections-v1:")))).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const entity of [false, true]) for (const phase of ["selection", "fileless action", "native", "queue link"])
test(`public preparation ${entity ? "entity" : "layout"} ${phase} resumes the same selection after reload`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || entity && process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1", "Own public writers are disabled");
  test.setTimeout(90000);
  await context.addInitScript(phase => {
    const released = () => sessionStorage.getItem("public-preparation-quota-released") === "true";
    if (phase === "native") {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (row, ...rest) {
        if (!released() && row?.intentJson && JSON.parse(row.intentJson).action?.body?.publicImport) throw new DOMException("Public native quota", "QuotaExceededError");
        return original.call(this, row, ...rest);
      };
    } else if (["fileless action", "queue link"].includes(phase)) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (!released() && (phase === "fileless action" ? String(key).startsWith("bike-packing-public-selections-v1:") && String(key).endsWith(":action")
          : String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.publicImport)) throw new DOMException("Public preparation quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    }
  }, phase);
  const publicSource = guestImportPayload(phase !== "fileless action"), f = await setup(page, context, { photoEdit: true,
    payload: entity ? replacementPayload() : initialPayload(), publicSource, configure: f => { f.guestPhotoUnavailable = phase === "selection"; } });
  await synchronize(page, () => true);
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  if (entity) {
    await page.locator('[data-view="items"]').click();
    await page.locator('[data-copy-item="shared-virtual-item-source"]').filter({ visible: true }).first().click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await page.locator("#containerPickerLayoutSelect").selectOption("layout-a");
    await page.locator('#containerPickerBoard [data-pick-container="bag"]').click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  } else await page.locator('[data-copy-shared-layout="template-ui"]').first().click();
  const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
  await expect(recovery).toBeVisible({ timeout: 30000 }); await expect(resume).toBeVisible();
  const rows = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")));
  const selection = JSON.parse(rows.find(([key]) => key.endsWith(":selection"))[1]).selection;
  const actionRow = rows.find(([key]) => key.endsWith(":action")), original = actionRow ? JSON.parse(actionRow[1]).action : null;
  expect(Boolean(original)).toBe(["native", "queue link"].includes(phase)); expect(selection.sourcePayload).toEqual(publicSource);
  const before = structuredClone(f.payload), posts = f.posts.length;
  expect(f.posts.some(post => post.body.publicImport)).toBe(false); expect(f.stagePosts).toEqual([]);
  await reloadApp(page, { recovery: true }); await expect(resume).toBeVisible();
  expect(f.posts).toHaveLength(posts); expect(f.payload).toEqual(before);
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")))).toEqual(rows);
  f.guestPhotoUnavailable = phase === "queue link"; // Retained native originals must suffice even when the URL is unavailable.
  await page.evaluate(() => sessionStorage.setItem("public-preparation-quota-released", "true"));
  await resume.click();
  await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
  const copies = f.posts.filter(post => post.body.publicImport); expect(copies).toHaveLength(1);
  const saved = copies[0]; expect(saved.operationId).toBe(selection.operationId);
  expect(saved.body.publicImport.sourcePayload).toEqual(selection.sourcePayload);
  for (const key of ["source", "ownerTargets", "photoTargets", entity ? "copy" : "layoutTargets"])
    expect(saved.body.publicImport[key]).toEqual(selection[key]);
  if (original) {
    const { actorId, generation, scopeKey, previousLocalOperationId, ...wire } = original;
    expect(saved).toEqual({ ...wire, expectedActorId: actorId });
    expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), actionRow[0])).action).toEqual(original);
  }
  const stageCount = f.stagePosts.length, savedPayload = structuredClone(f.payload);
  await reloadApp(page); expect(f.posts).toHaveLength(posts + 1); expect(f.stagePosts).toHaveLength(stageCount); expect(f.payload).toEqual(savedPayload);
  expect(f.errors).toEqual([]);
});

for (const entity of [false, true]) test(`public preparation disabled reader ${entity ? "entity" : "layout"} keeps the original selection available for export`, async ({ page, context }) => {
  test.skip(entity ? process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES === "1"
    : process.env.BIKE_PERSONAL_PUBLIC_IMPORT === "1", "Checks the matching disabled writer");
  const publicSource = guestImportPayload(false), f = await setup(page, context, { photoEdit: true, publicSource,
    payload: entity ? replacementPayload() : initialPayload() });
  await synchronize(page, () => true); const before = structuredClone(f.payload), posts = f.posts.length;
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid retained-selection fixture path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const selected = await page.evaluate(async ({ entity, basePayload, baseStateRevision, sourcePayload }) => {
    const { preparePersonalPublicImportSelection, preparePersonalPublicEntitySelection } = await import("/src/sync/personal-public-import-selection.js");
    const { createPersonalPublicImportSelectionStore } = await import("/src/sync/personal-public-import-selection-store.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const sourceLayoutId = sourcePayload.activeLayoutId, selection = (entity ? preparePersonalPublicEntitySelection : preparePersonalPublicImportSelection)({
      binding, basePayload, baseStateRevision, sourcePayload, editMeta: {},
      source: { kind: "public-template", listId: "public-shared-layout-template-ui", itemKey: "shared-layout:template-ui", stateRevision: 7, language: "ru" },
      ...(entity ? { copy: { version: 1, mode: "independent", sourceLayoutId,
        entries: [{ entityType: "item", sourceId: "source", includeContents: false }], destination: { layoutId: "layout-a", containerId: "bag", index: null } } }
        : { layoutIds: [sourceLayoutId], layoutNames: ["Сохранённая копия"] })
    }, { enabled: true });
    const journal = createPersonalPublicImportSelectionStore({ binding, enabled: true, publicEntityEnabled: true,
      getContext: () => ({ ...binding, generation: "seed-retained-selection", scope: "personal" }) });
    await journal.capture(selection); return selection;
  }, { entity, basePayload: before, baseStateRevision: f.revision, sourcePayload: publicSource });
  await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog");
  await expect(recovery.locator("[data-resume-photo-upload]")).not.toBeVisible();
  const download = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const entries = await readZipEntries(new Blob([await readFile(await (await download).path())]));
  const rows = JSON.parse(zipText(entries.get("public-import-selections.json")));
  expect(rows).toHaveLength(1); expect(JSON.parse(rows[0].text).selection).toEqual(selected);
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before); expect(f.errors).toEqual([]);
});

for (const entity of [false, true]) for (const scenario of ["continue", "quota", "disabled"])
test(`public preparation choice ${entity ? "entity photos" : "layout fileless"} ${scenario} keeps alternatives and resumes only the explicit selection`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1"
    || (process.env.BIKE_PERSONAL_PUBLIC_CHOICE === "1") !== (scenario !== "disabled"), "Checks the independent choice gate");
  test.setTimeout(90000);
  if (scenario === "quota") await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith("bike-packing-public-selections-v1:") && String(key).includes(":choice:")
        && sessionStorage.getItem("choice-quota-released") !== "true") throw new DOMException("Choice quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const sourcePayload = guestImportPayload(entity), f = await setup(page, context, { photoEdit: true, publicSource: sourcePayload,
    payload: entity ? replacementPayload() : initialPayload() });
  await synchronize(page, () => true); const before = structuredClone(f.payload), posts = f.posts.length;
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid public preparation choice fixture path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const selections = await page.evaluate(async ({ entity, basePayload, baseStateRevision, sourcePayload }) => {
    const { preparePersonalPublicImportSelection, preparePersonalPublicEntitySelection } = await import("/src/sync/personal-public-import-selection.js");
    const { createPersonalPublicImportSelectionStore } = await import("/src/sync/personal-public-import-selection-store.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const journal = createPersonalPublicImportSelectionStore({ binding, enabled: true, publicEntityEnabled: true,
      getContext: () => ({ ...binding, generation: "seed-public-choices", scope: "personal" }) });
    const selections = [];
    for (const name of ["Первая сохранённая копия", "Вторая сохранённая копия"]) {
      const payload = structuredClone(sourcePayload);
      const selection = (entity ? preparePersonalPublicEntitySelection : preparePersonalPublicImportSelection)({
        binding, basePayload, baseStateRevision, sourcePayload: payload, editMeta: {},
        source: { kind: "public-template", listId: "public-shared-layout-template-ui", itemKey: "shared-layout:template-ui", stateRevision: 7, language: "ru" },
        ...(entity ? { copy: { version: 1, mode: "independent", sourceLayoutId: payload.activeLayoutId,
          entries: [{ entityType: "item", sourceId: "source", includeContents: false }], destination: { layoutId: "layout-a", containerId: "bag", index: null } } }
          : { layoutIds: [payload.activeLayoutId], layoutNames: [name] })
      }, { enabled: true });
      await journal.capture(selection); selections.push(selection);
    }
    return selections;
  }, { entity, basePayload: before, baseStateRevision: f.revision, sourcePayload });
  const originalRows = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")));
  await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog");
  const choices = recovery.locator("[data-public-preparation-choices]"), resume = recovery.locator("[data-resume-photo-upload]");
  await expect(resume).not.toBeVisible();
  await recovery.locator("[data-check-photo-result]").click();
  await expect(recovery).toContainText("Сначала выберите или продолжите сохранённую копию");
  await expect(recovery).not.toContainText("Подтверждения и актуальная версия сохранены");
  if (scenario === "disabled") await expect(choices).not.toBeVisible();
  else {
    await expect(choices).toBeVisible(); await expect(choices.locator("input:checked")).toHaveCount(0);
    await expect(choices.locator("button")).toBeDisabled();
    if (scenario === "continue") await choices.screenshot({ path: `node_modules/.cache/causal-evidence/2026-09-08/public-preparation-choice-${entity ? "entity" : "layout"}-${test.info().project.name}.png` });
    await choices.locator(`input[value="${selections[1].operationId}"]`).check();
    await choices.locator("button").click();
    if (scenario === "quota") {
      await expect(recovery).toContainText("Подготовленная копия шаблона требует восстановления");
      expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")))).toEqual(originalRows);
      await expect(resume).not.toBeVisible();
      await page.evaluate(() => sessionStorage.setItem("choice-quota-released", "true"));
      await choices.locator("button").click();
    }
    await expect(recovery).toContainText("Выбор сохранён. Остальные варианты доступны");
    await expect(choices).not.toBeVisible(); await expect(resume).toBeVisible();
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
    await reloadApp(page, { recovery: true }); await expect(choices).not.toBeVisible(); await expect(resume).toBeVisible();
  }
  const download = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const zip = await readZipEntries(new Blob([await readFile(await (await download).path())]));
  const rows = JSON.parse(zipText(zip.get("public-import-selections.json")));
  for (const selection of selections) expect(JSON.parse(rows.find(row => row.key === `${selection.operationId}:selection`).text).selection).toEqual(selection);
  expect(rows.filter(row => row.key.startsWith("choice:")).length).toBe(scenario === "disabled" ? 0 : 1);
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]);
  if (scenario !== "disabled") {
    await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    const copies = f.posts.filter(post => post.body.publicImport); expect(copies).toHaveLength(1);
    expect(copies[0].operationId).toBe(selections[1].operationId);
    expect(copies[0].body.publicImport.sourcePayload).toEqual(selections[1].sourcePayload);
    expect(f.stagePosts).toHaveLength(selections[1].photoTargets.length);
    const savedPayload = structuredClone(f.payload), stages = f.stagePosts.length;
    await reloadApp(page); expect(f.posts).toHaveLength(posts + 1); expect(f.stagePosts).toHaveLength(stages); expect(f.payload).toEqual(savedPayload);
    const retainedRows = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")));
    for (const [key, text] of originalRows) expect(retainedRows.find(row => row[0] === key)?.[1]).toBe(text);
  }
  expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const outcome of ["cancel", "lost owner", ...(photos ? ["lost stage"] : []), "committed", "disabled", "selection"])
test(`public preparation resolution ${photos ? "entity photos" : "layout fileless"} ${outcome} preserves exact alternatives through reload`, async ({ page, context }, testInfo) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1"
    || (process.env.BIKE_PERSONAL_PUBLIC_RESOLUTION === "1") !== (outcome !== "disabled"), "Checks the independent preparation resolution gate");
  test.setTimeout(120000);
  const sourcePayload = guestImportPayload(photos), f = await setup(page, context, { photoEdit: true, publicSource: sourcePayload,
    payload: photos ? replacementPayload() : initialPayload() });
  await synchronize(page, () => true);
  const before = structuredClone(f.payload), initialPosts = f.posts.length;
  await context.route(`${origin}/src/**/*.js`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid public resolution fixture path");
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
  });
  const seeded = await page.evaluate(async ({ photos, outcome, sourcePayload, basePayload, baseStateRevision }) => {
    const { preparePersonalPublicImportSelection, preparePersonalPublicEntitySelection } = await import("/src/sync/personal-public-import-selection.js");
    const { createPersonalPublicImportSelectionStore } = await import("/src/sync/personal-public-import-selection-store.js");
    const { preparePersonalPublicImport } = await import("/src/sync/personal-public-import.js");
    const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
    const { createPersonalSaveOutbox } = await import("/src/sync/personal-save-outbox.js");
    const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
    const getContext = () => ({ ...binding, generation: "seed-public-resolution", scope: "personal" });
    const journal = createPersonalPublicImportSelectionStore({ binding, getContext, enabled: true, publicEntityEnabled: true });
    const outbox = createPersonalSaveOutbox({ ...binding, storage: localStorage, photoEnabled: true, photoBatchEnabled: true, publicImportEnabled: true, publicEntityEnabled: true });
    outbox.adoptRemoteBaseline({ snapshot: basePayload, payload: basePayload, stateRevision: baseStateRevision });
    const store = createPersonalPhotoActionStore({ ...binding, getContext, enabled: true, batchEnabled: true, publicEnabled: true, publicEntityEnabled: true });
    const selections = [], commits = [];
    for (const name of ["Первая подготовка", "Вторая подготовка"]) {
      const selection = (photos ? preparePersonalPublicEntitySelection : preparePersonalPublicImportSelection)({ binding, basePayload, baseStateRevision,
        sourcePayload, editMeta: {}, source: { kind: "public-template", listId: "public-shared-layout-template-ui", itemKey: "shared-layout:template-ui", stateRevision: 7, language: "ru" },
        ...(photos ? { copy: { version: 1, mode: "independent", sourceLayoutId: sourcePayload.activeLayoutId,
          entries: [{ entityType: "item", sourceId: "source", includeContents: false }], destination: { layoutId: "layout-a", containerId: "bag", index: null } } }
          : { layoutIds: [sourcePayload.activeLayoutId], layoutNames: [name] }) }, { enabled: true });
      selections.push(selection); await journal.capture(selection);
      if (outcome !== "selection") commits.push(await preparePersonalPublicImport({ selection, selectionStore: journal, outbox, store, getContext,
        getState: () => basePayload, getRevision: () => baseStateRevision, makeSnapshot: value => value, onCaptured() {},
        loadFile: async () => ({ file: new Blob(["Retained public preparation file"], { type: "image/png" }), thumb: null, fileName: "prepared.png" }),
        enabled: true, publicEntityEnabled: true }));
    }
    outbox.capturePhoto = async () => { throw Error("Simulated interruption before queue link"); };
    for (const commit of commits) { try { await commit(); } catch (error) { if (!error.message.startsWith("Simulated interruption")) throw error; } }
    const entries = await journal.entries(), files = [], cancellationReceipts = [];
    for (const selection of selections) {
      const native = await store.read(selection.operationId);
      if (!native) continue;
      for (const part of native.files) {
        files.push({ operationId: selection.operationId, assetId: part.stage.operationId, text: await part.file.text() });
        cancellationReceipts.push({ ok: true, operation: { id: part.stage.operationId, environment: binding.environment, actorId: binding.actorId,
          listId: binding.listId, entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash, thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash,
            noAssetPublished: true, stageCannotPublish: true } });
      }
    }
    if (outcome === "committed") {
      const { createExperimentTransport } = await import("/src/sync/experiment-transport.js");
      const { createPersonalPhotoStaging } = await import("/src/sync/personal-photo-staging.js");
      const { createListOperationQueue } = await import("/src/sync/list-operation-queue.js");
      const transport = createExperimentTransport({ locationLike: location, selection: "direct" });
      const staging = createPersonalPhotoStaging({ store, transport, getContext, enabled: true, batchEnabled: true, publicEnabled: true, publicEntityEnabled: true });
      const entry = entries.find(entry => entry.selection.operationId === selections[0].operationId);
      for (const file of entry.action.body.publicImport.files) await staging.stage(entry.action.operationId, file.assetId);
      const queue = createListOperationQueue({ transport, getContext, enabled: true, photoEnabled: true, publicImportEnabled: true, publicEntityEnabled: true });
      await queue.run({ path: `/bike-packing/lists/${binding.listId}/import`, method: "POST", body: JSON.stringify(entry.action.body), operationId: entry.action.operationId });
    }
    return { selections, entries, files, cancellationReceipts };
  }, { photos, outcome, sourcePayload, basePayload: before, baseStateRevision: f.revision });
  f.cancelPhotoActions = new Map(seeded.entries.filter(entry => entry.action).map(entry => [entry.action.operationId, entry.action]));
  f.cancellationReceipts = new Map(seeded.cancellationReceipts.map(proof => [proof.operation.id, proof]));
  const originalRows = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:")));
  await reloadApp(page, { recovery: true }); const recovery = page.locator("#personalSaveRecoveryDialog"), manager = recovery.locator("[data-public-prepared-copies]");
  const stop = manager.locator("[data-stop-public-preparation]"), inspect = manager.locator("[data-check-public-preparation]");
  const select = id => manager.locator(`input[value="${id}"]`).check();
  await expect(manager).toBeVisible(); await select(seeded.selections[0].operationId);
  if (outcome === "disabled") {
    await expect(stop).not.toBeVisible(); await inspect.click(); await expect(recovery).toContainText("Сервер пока не подтвердил результат");
    if (photos) await page.screenshot({ path: path.resolve(`node_modules/.cache/causal-evidence/2026-09-08/public-preparation-resolution-${testInfo.project.name}.png`), fullPage: true });
  } else {
    if (outcome === "lost owner") { f.loseCancellation = true; f.hideCancellationReceipt = true; }
    if (outcome === "lost stage") f.hiddenStage = seeded.cancellationReceipts[0].operation.id;
    await stop.click();
    if (outcome.startsWith("lost")) {
      await expect(stop).toBeEnabled(); await reloadApp(page, { recovery: true });
      f.loseCancellation = false; f.hiddenFormOwner = null; f.hiddenStage = null;
      await select(seeded.selections[0].operationId); await stop.click();
    }
    await expect(recovery).toContainText(outcome === "committed" ? "Копия уже принята сервером" : outcome === "selection" ? "Вариант оставлен в архиве" : "Действие остановлено или отклонено", { timeout: 30000 });
    if (!["committed", "selection"].includes(outcome)) expect(f.ownerCancellationPosts).toEqual([seeded.selections[0].operationId]);
    if (outcome === "committed" || outcome === "selection") {
      await select(seeded.selections[1].operationId); await stop.click();
      await expect(recovery).toContainText("Перезагрузите страницу, чтобы прочитать актуальную серверную версию");
    }
  }
  const download = page.waitForEvent("download"); await recovery.locator("[data-download-photo-recovery]").click();
  const zip = await readZipEntries(new Blob([await readFile(await (await download).path())]));
  const rows = JSON.parse(zipText(zip.get("public-import-selections.json")));
  for (const [key, value] of originalRows) expect(rows.find(row => key.endsWith(row.key))?.text).toBe(value);
  expect([...zip.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(seeded.files.length);
  if (!["disabled", "committed", "selection"].includes(outcome)) {
    expect(f.payload).toEqual(before); expect(f.stagePosts).toEqual([]);
    await reloadApp(page, { recovery: true }); const resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible(); await resume.click(); await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    expect(f.stagePosts).toHaveLength(seeded.selections[1].photoTargets.length);
  }
  if (outcome !== "disabled") {
    const posts = f.posts.length, payload = structuredClone(f.payload); await reloadApp(page);
    expect(f.posts).toHaveLength(posts); expect(f.payload).toEqual(payload);
    expect(f.posts.filter(post => post.body.publicImport && !f.ownerCancellationPosts?.includes(post.operationId))).toHaveLength(outcome === "selection" ? 0 : 1);
  } else expect(f.posts).toHaveLength(initialPosts);
  expect(f.errors).toEqual([]);
});

for (const photos of [false, true]) for (const demo of [false, true]) for (const outcome of ["lost ACK", "quota", "cancel", ...(photos && !demo ? ["large source"] : [])])
test(`public missing only ${demo ? "demo" : "shared"} ${photos ? "photos" : "fileless"} preserves edited bags and exact additions across ${outcome}`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1", "Own public entity writer is disabled");
  test.setTimeout(120000);
  const publicSource = guestImportPayload(photos), payload = replacementPayload(), a = publicSource.layouts["layout-a"].arrangement;
  if (outcome === "large source") publicSource.items.source.photos = Array.from({ length: 51 }, (_, index) => ({
    ...publicSource.items.source.photos[0], id: `already-present-source-photo-${index}` }));
  payload.containers.bag.note = "Моя изменённая сумка"; payload.containers.pocket.custom = { preserve: "private pocket" };
  payload.items.source.note = "Моя заметка к вещи"; payload.layouts["layout-a"].arrangement.packedItems.source = true;
  for (const [id, parentId, quantity] of [["missing-root", "bag", 5], ["missing-pocket", "pocket", 4]]) {
    publicSource.items[id] = { id, name: `Новая вещь ${id}`, quantity: 1, containerId: parentId, custom: { original: id },
      photos: photos ? [{ ...publicSource.items.source.photos[0], id: `photo-${id}` }] : [] };
    a.items[id] = parentId; a.itemQuantities[id] = quantity; a.packedItems[id] = true;
    a.containers[parentId].itemIds.push(id); a.containers[parentId].order.push({ type: "item", id });
  }
  const itemKey = demo ? "demo-state:missing-selected" : "shared-layout:missing-selected", listId = demo ? "public-demo-state-missing-selected" : "public-shared-layout-missing-selected";
  const f = await setup(page, context, { photoEdit: true, payload, publicSource, publicSourceConfig: { record: {
    id: listId, itemKey, publicTemplateKind: demo ? "demo" : "shared", sharedLayoutId: demo ? undefined : "missing-selected",
    title: "Источник недостающих вещей", sourceType: demo ? "public-template" : "curated-bikepacker", language: "ru" } } });
  await synchronize(page, () => Boolean(f.payload.items.source));
  addConfirmedTreePhotos(f, [["containers", "bag"], ["items", "source"]]); await reloadApp(page);
  const before = structuredClone(f.payload), option = page.locator("#layoutSelect option").filter({ hasText: "Источник недостающих вещей" });
  await expect(option).toHaveCount(1); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  await page.locator('[data-copy-root="shared-virtual-container-bag"]').filter({ visible: true }).first().click();
  await expect(page.locator("#containerPickerDialog")).toBeVisible(); await page.locator("#containerPickerLayoutSelect").selectOption("layout-a");
  await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  await expect(page.locator("#confirmAlternateBtn")).toHaveText("Только недостающие");
  const posts = f.posts.length;
  if (outcome === "cancel") {
    await submitForm(page, "#confirmCancelBtn");
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-public-selections-v1:")))).toEqual([]);
    expect(f.errors).toEqual([]); return;
  }
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.publicImport?.copy?.mode === "missing")
        throw new DOMException("Missing copy queue quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  f.loseFormOwner = ["lost ACK", "large source"].includes(outcome);
  await submitForm(page, "#confirmAlternateBtn");
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
  } else await expect.poll(() => Boolean(f.hiddenFormOwner), { timeout: 30000 }).toBe(true);
  const retained = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:") && key.endsWith(":action"))
    .map(([, text]) => JSON.parse(text).action));
  expect(retained).toHaveLength(1); const original = retained[0];
  expect(original.body.publicImport.copy.mode).toBe("missing"); expect(original.body.publicImport.sourcePayload).toEqual(publicSource);
  expect(original.body.publicImport.files).toHaveLength(photos ? 2 : 0);
  expect(original.body.publicImport.ownerTargets.map(row => row.entityType)).toEqual(["item", "item"]);
  await reloadApp(page, { recovery: true }); f.loseFormOwner = false; f.hiddenFormOwner = ""; f.guestPhotoUnavailable = true;
  await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
  await reloadApp(page);
  expect(f.posts).toHaveLength(posts + 1); expect(f.stagePosts).toHaveLength(photos ? 2 : 0);
  expect(f.payload.containers).toEqual(before.containers);
  for (const [id, owner] of Object.entries(before.items)) expect(f.payload.items[id]).toEqual(owner);
  expect(Object.keys(f.payload.layouts)).toEqual(Object.keys(before.layouts));
  for (const row of original.body.publicImport.ownerTargets) {
    const parent = row.sourceId === "missing-root" ? "bag" : "pocket", target = f.payload.layouts["layout-a"].arrangement;
    expect(target.items[row.targetId]).toBe(parent); expect(target.itemQuantities[row.targetId]).toBe(parent === "bag" ? 5 : 4);
    expect(target.packedItems[row.targetId]).toBeUndefined(); expect(f.payload.items[row.targetId].custom.original).toBe(row.sourceId);
  }
  expect(f.payload.layouts["layout-a"].arrangement.packedItems.source).toBe(true); expect(f.errors).toEqual([]);
});

for (const demo of [false, true]) for (const photos of [false, true]) for (const outcome of ["lost ACK", "quota", "cancel"])
test(`public catalog details ${demo ? "demo" : "shared"} ${photos ? "photos" : "fileless"} keeps the chosen item without placement across ${outcome}`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES !== "1", "Own public entity writer is disabled");
  test.setTimeout(90000);
  const publicSource = guestImportPayload(photos), payload = replacementPayload();
  publicSource.items.source.name = "Вещь именно выбранного шаблона"; publicSource.items.source.quantity = 8;
  publicSource.items.source.custom = { full: "original source owner" };
  payload.items.source.name = "Моя изменённая вещь";
  const other = structuredClone(publicSource); other.items.source.name = "Другой шаблон с тем же ID";
  const itemKey = demo ? "demo-state:catalog-selected" : "shared-layout:catalog-selected", listId = demo ? "public-demo-state-catalog-selected" : "public-shared-layout-catalog-selected";
  const selected = { id: listId, itemKey, publicTemplateKind: demo ? "demo" : "shared", sharedLayoutId: demo ? undefined : "catalog-selected",
    title: "Источник вещи для каталога", language: "ru", sourceType: demo ? "public-template" : "curated-bikepacker" };
  const f = await setup(page, context, { photoEdit: true, payload, publicSource, publicSourceConfig: { record: selected,
    others: [{ ...selected, id: demo ? "public-demo-state" : "public-shared-layout-catalog-other", itemKey: demo ? "demo-state" : "shared-layout:catalog-other",
      sharedLayoutId: demo ? undefined : "catalog-other", title: "Другой источник", payload: other, visibility: "public", stateRevision: 7, ownerId: "public-owner", layoutOrder: -1 }] } });
  await synchronize(page, () => Boolean(f.payload.items.source)); const before = structuredClone(f.payload), posts = f.posts.length;
  const option = page.locator("#layoutSelect option").filter({ hasText: selected.title });
  await expect(option).toHaveCount(1); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  await page.locator('[data-view="items"]').click();
  await page.locator('[data-list-item-id="shared-virtual-item-source"], [data-item-id="shared-virtual-item-source"]').filter({ visible: true }).first().locator(".item-title").click();
  await expect(page.locator("#copySharedItemDialogBtn")).toBeVisible();
  await expect(page.locator("#itemName")).toHaveValue(publicSource.items.source.name);
  await page.locator("#copySharedItemDialogBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  if (outcome === "cancel") {
    await submitForm(page, "#confirmCancelBtn"); await expect(page.locator("#copySharedItemDialogBtn")).toBeVisible();
    // Loading the personal target changes the underlying view. A second click
    // must retain this dialog's chosen source instead of reading the new view.
    await page.locator("#copySharedItemDialogBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
    await submitForm(page, "#confirmCancelBtn"); await expect(page.locator("#copySharedItemDialogBtn")).toBeVisible();
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-public-selections-v1:")))).toEqual([]);
    expect(f.errors).toEqual([]); return;
  }
  if (outcome === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.publicImport?.copy?.mode === "catalog")
        throw new DOMException("Catalog copy queue quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  f.loseFormOwner = outcome === "lost ACK"; await submitForm(page, "#confirmOkBtn");
  if (outcome === "quota") {
    await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
    expect(await page.locator("#copySharedItemDialogBtn").evaluate(button => !button.hidden)).toBe(true);
  } else await expect.poll(() => Boolean(f.hiddenFormOwner), { timeout: 30000 }).toBe(true);
  const retained = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-public-selections-v1:") && key.endsWith(":action"))
    .map(([, text]) => JSON.parse(text).action));
  expect(retained).toHaveLength(1); const original = retained[0], manifest = original.body.publicImport;
  expect(manifest.copy).toEqual({ version: 3, mode: "catalog", sourceLayoutId: publicSource.activeLayoutId,
    entries: [{ entityType: "item", sourceId: "source", includeContents: false }], destination: { layoutId: "layout-a", containerId: "", index: null } });
  expect(manifest.sourcePayload).toEqual(publicSource); expect(manifest.source.itemKey).toBe(itemKey);
  expect(manifest.files).toHaveLength(photos ? 1 : 0);
  await reloadApp(page, { recovery: true }); f.loseFormOwner = false; f.hiddenFormOwner = ""; f.guestPhotoUnavailable = true;
  await page.locator("#personalSaveRecoveryDialog [data-resume-photo-upload]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
  await reloadApp(page);
  expect(f.posts).toHaveLength(posts + 1); expect(f.stagePosts).toHaveLength(photos ? 1 : 0);
  const final = personalBusinessPayload(f.payload), base = personalBusinessPayload(before), copyId = manifest.ownerTargets[0].targetId;
  expect(final.layouts).toEqual(base.layouts); expect(final.containers).toEqual(base.containers);
  for (const [id, owner] of Object.entries(base.items)) expect(final.items[id]).toEqual(owner);
  expect(final.items[copyId].name).toBe(publicSource.items.source.name); expect(final.items[copyId].quantity).toBe(8);
  expect(final.items[copyId].containerId).toBeUndefined(); expect(final.items[copyId].custom).toEqual(publicSource.items.source.custom);
  expect(f.errors).toEqual([]);
});

test("public catalog details gate off keeps the original dialog and blocks legacy copying", async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1" || process.env.BIKE_PERSONAL_PUBLIC_ENTITIES === "1", "Checks the independent disabled entity writer");
  const f = await setup(page, context, { photoEdit: true, payload: replacementPayload(), publicSource: guestImportPayload(true) });
  await synchronize(page, () => Boolean(f.payload.items.source)); const before = structuredClone(f.payload), posts = f.posts.length;
  const option = page.locator("#layoutSelect option").filter({ hasText: "Публичный шаблон" });
  await expect(option).toHaveCount(1); await page.locator("#layoutSelect").selectOption(await option.getAttribute("value"));
  await expect(page.locator("#confirmDialog")).toBeVisible(); await submitForm(page, "#confirmOkBtn");
  await page.locator('[data-view="items"]').click();
  await page.locator('[data-list-item-id="shared-virtual-item-source"], [data-item-id="shared-virtual-item-source"]').filter({ visible: true }).first().locator(".item-title").click();
  await page.locator("#copySharedItemDialogBtn").click();
  await expect(page.getByText("Копирование отдельных записей шаблона через очередь ещё не включено.", { exact: true })).toBeVisible();
  await expect(page.locator("#copySharedItemDialogBtn")).toBeVisible();
  expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toEqual([]); expect(f.payload).toEqual(before);
  expect(f.errors).toEqual([]);
});

async function preparePendingImportUi(page, context, fileless, importKind, mode = "full") {
  if (importKind === "guest") return preparePendingGuestUi(page, context, fileless);
  const { f, itemId, bagId } = await preparePhotoArchiveUi(page, context, mode, { count: fileless ? 0 : 1 });
  let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  if (fileless) f.beforeUpdate = body => body.kind === "list.import" ? hold() : undefined;
  else f.beforeStageAck = hold;
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#backupStatus")).toContainText("на устройстве");
  await page.locator('#backupDialog [value="cancel"]').click(); await page.locator("#syncBtn").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  const imported = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).find(record => record.action?.body.archiveImport));
  expect(imported.action.body.archiveImport.version).toBe(2);
  return { f, imported, itemId, bagId, release: () => release?.(), clearHold: () => { f.beforeStageAck = null; f.beforeUpdate = null; } };
}

for (const importKind of ["guest", "archive"]) for (const [fileless, outcome] of [[false, "save"], [true, "save"], [false, "delete item"], [false, "quota"],
  [false, "mixed"], [false, "cancel"], [false, "lost cancellation"],
  ...(importKind === "archive" ? [[false, "replace"], [true, "replace"], [false, "copy"], [true, "copy"]] : [])])
test(`${importKind} pending new photo forms ${fileless ? "fileless" : "photos"} ${outcome} retain different owners and original files`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_IMPORT_PHOTO_FORMS !== "1", "Import photo forms retain their independent gate");
  test.setTimeout(150000);
  const { f, imported, itemId, bagId, release, clearHold } = await preparePendingImportUi(page, context, fileless, importKind, ["replace", "copy"].includes(outcome) ? outcome : "full");
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 12; canvas.height = 12;
    const context = canvas.getContext("2d"); context.fillStyle = "#326b47"; context.fillRect(0, 0, 12, 12);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const server = structuredClone(f.payload), forms = [];
  try {
    for (const [type, id, prefix, view] of [["item", itemId, "item", "items"], ["container", bagId, "rootContainer", "bags"]]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
      const dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog"); await expect(dialog).toBeVisible();
      const mixed = outcome === "mixed" && type === "item";
      if (mixed) { await page.locator(`#${prefix}PhotoRemoveBtn`).click(); await page.locator("#confirmOkBtn").click(); }
      await page.locator(`#${prefix}PhotoInput`).setInputFiles(Array.from({ length: mixed ? 2 : 1 }, (_, i) => ({ name: `новое-${type}-${i}.png`, mimeType: "image/png", buffer: image })));
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(fileless ? 1 : 2);
      if (mixed) {
        await submitForm(page, `#${prefix}PhotoPreview [data-photo-index="1"]`);
        await submitForm(page, `#${prefix}PhotoPrimaryBtn`);
      }
      await page.locator(`#${prefix}Weight`).fill(type === "item" ? "341" : "562");
      if (outcome === "quota") await page.evaluate(() => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (String(key).startsWith("bike-packing-personal-save-v1:") && JSON.parse(value)?.action?.body?.ownerResult?.version === 3) throw new DOMException("Import photo form quota", "QuotaExceededError");
          return write.call(this, key, value);
        };
      });
      await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
      if (outcome === "quota") {
        await expect(dialog).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
        expect((await records()).filter(record => record.action.body.ownerResult?.version === 3)).toEqual([]);
        expect(f.payload).toEqual(server);
        const download = page.waitForEvent("download"); await page.locator("[data-download-photo-recovery]").click();
        const archive = await readZipEntries(new Blob([await readFile(await (await download).path())]));
        expect([...archive.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(3);
        return;
      }
      await expect(dialog, JSON.stringify(f.errors)).not.toBeVisible();
      const saved = (await records()).find(record => record.action.body.ownerResult?.version === 3 && record.action.body.entityId === id);
      expect(saved).toBeTruthy(); forms.push(saved);
      expect(saved.action.body.ownerResult.importOperationId).toBe(imported.action.operationId);
      if (!fileless || type === "container") expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(itemId);
      if (!fileless) expect(saved.action.body.ownerResult.pendingPhotos.map(row => row.entityId)).toContain(bagId);
      expect(saved.action.body.changes.filter(change => change.action === "attach")).toHaveLength(mixed ? 2 : 1);
    }
    if (outcome === "save" && !fileless) await page.screenshot({ path: `node_modules/.cache/causal-evidence/2026-09-08/import-pending-files-${importKind}-${test.info().project.name}.png` });
    if (outcome === "delete item") {
      await page.locator('[data-view="items"]').click(); await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
      await page.locator("#itemDeleteForeverBtn").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
      await submitForm(page, "#confirmOkBtn"); await expect(page.locator("#itemDialog")).not.toBeVisible();
      expect((await records()).some(record => record.action.body.photoResults?.version === 9)).toBe(true);
    }
    expect((await records()).find(record => record.action.operationId === imported.action.operationId)).toEqual(imported);
    if (outcome === "cancel" || outcome === "lost cancellation") {
      await context.route(`${origin}/src/**/*.js`, async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
        return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
      });
      const nativeFiles = () => page.evaluate(async () => {
        const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
        const store = createPersonalPhotoActionStore(binding), proofs = [];
        for (const id of await store.ids()) for (const part of (await store.read(id)).files) proofs.push({ ok: true,
          operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
            entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } });
        return proofs;
      });
      const retained = await records(), files = await nativeFiles();
      expect(files).toHaveLength(4);
      f.cancelPhotoActions = new Map(retained.map(record => [record.action.operationId, record.action]));
      f.cancellationReceipts = new Map(files.map(proof => [proof.operation.id, proof]));
      f.loseStageAt = 1; clearHold(); release(); await expect.poll(() => Boolean(f.hiddenStage)).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await expect(cancel).toBeVisible();
      if (outcome === "lost cancellation") {
        f.loseCancellation = true; f.hideCancellationReceipt = true; await cancel.click(); await expect(cancel).toBeEnabled({ timeout: 30000 });
        await reloadApp(page, { recovery: true }); f.loseCancellation = false; f.hiddenFormOwner = null;
      }
      // All owners and native parts are checked before asking which version
      // to keep. The multi-owner round trip can exceed the default five
      // seconds on mobile; wait for its actual result without another click.
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible({ timeout: 30000 }); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      expect(new Set(f.ownerCancellationPosts)).toEqual(new Set([imported, ...forms].map(record => record.action.operationId)));
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
      expect(f.payload).toEqual(server); expect(f.stagePosts).toHaveLength(1); expect(await nativeFiles()).toEqual(files);
      await reloadApp(page); expect(f.errors).toEqual([]); return;
    }
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    await expect(resume).toBeVisible();
    f.beforePhotoWrite = action => { f.loseFormOwner = action.operationId === forms[1].action.operationId; };
    await resume.click(); await expect(resume).toBeEnabled({ timeout: 30000 }); await expect.poll(() => f.injectedFailure).toBe(true);
    f.beforePhotoWrite = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
    await reloadApp(page, { recovery: true }); await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    if (outcome === "delete item") expect(f.payload.items[itemId]).toBeUndefined();
    else { expect(f.payload.items[itemId].weight).toBe(341); expect(f.payload.items[itemId].photos).toHaveLength(fileless ? 1 : 2); }
    expect(f.payload.containers[bagId].weight).toBe(562); expect(f.payload.containers[bagId].photos).toHaveLength(fileless ? 1 : 2);
    if (outcome === "mixed") expect(f.payload.items[itemId].photos.map(photo => photo.id)).toEqual(forms[0].photoState.payload.items[itemId].photos.map(photo => photo.id));
    expect(f.stagePosts).toHaveLength(outcome === "mixed" ? 5 : fileless ? 2 : 4); expect(new Set(f.stagePosts).size).toBe(f.stagePosts.length);
    for (const saved of [imported, ...forms]) expect(f.posts.filter(post => post.operationId === saved.action.operationId)).toHaveLength(1);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const importKind of ["guest", "archive"]) for (const type of ["item", "container"]) test(`${importKind} pending new photo writer disabled retains the ${type} form without fallback`, async ({ page, context }) => {
  test.skip(process.env.BIKE_PERSONAL_IMPORT_PHOTO_FORMS === "1", "Checks the independent import-photo writer gate");
  const { f, itemId, bagId, release, clearHold } = await preparePendingImportUi(page, context, false, importKind);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  const before = await records(), server = structuredClone(f.payload), posts = f.posts.length;
  const prefix = type === "item" ? "item" : "rootContainer", id = type === "item" ? itemId : bagId;
  try {
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    await page.locator(type === "item" ? `#itemsView [data-list-item-id="${id}"] .item-title` : `#bagsView [data-root-card="${id}"] [data-root-title]`).click();
    const image = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 3;
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator(`#${prefix}PhotoInput`).setInputFiles({ name: "retained.png", mimeType: "image/png", buffer: image });
    await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(2);
    await page.locator(`#${prefix}Weight`).fill("743");
    await submitForm(page, type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn", `#${prefix}Weight`);
    await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.message)).toBeTruthy();
    await expect(page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog")).toBeVisible();
    await expect(page.locator(`#${prefix}Weight`)).toHaveValue("743");
    expect(await records()).toEqual(before); expect(f.payload).toEqual(server);
    expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toHaveLength(1); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

async function preparePendingOwnerUi(page, context, fileless, importKind) {
  return importKind === "server" ? preparePendingServerUi(page, context, fileless) : importKind.startsWith("public") ? preparePendingPublicUi(page, context, fileless, importKind === "public-tree") : preparePendingImportUi(page, context, fileless, importKind);
}

for (const importKind of ["guest", "archive", "public", "server"]) test(`${importKind} atomic owner photo gate off keeps the entire new form`, async ({ page, context }) => {
  test.skip(importKind === "public" && process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1"
    || importKind === "server" && process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1", "Requires the parent import; the independent owner form gate stays OFF");
  test.skip(process.env[importKind === "server" ? "BIKE_PERSONAL_SERVER_NEW_OWNERS" : importKind.startsWith("public") ? "BIKE_PERSONAL_PUBLIC_NEW_OWNERS" : "BIKE_PERSONAL_IMPORT_NEW_OWNERS"] === "1", "Checks the independent atomic owner creation gate");
  const { f, release, clearHold } = await preparePendingOwnerUi(page, context, false, importKind);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    const before = await records(), server = structuredClone(f.payload), posts = f.posts.length;
    const bytes = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 3; return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator('[data-view="packing"]').click(); await page.locator("[data-add-packing-root]").click();
    await page.locator("#createRootForLayoutBtn").click(); await page.locator("#rootContainerName").fill("Новая сумка и удержанное фото");
    await page.locator("#rootContainerPhotoInput").setInputFiles({ name: "held-new-bag.png", mimeType: "image/png", buffer: bytes });
    await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(1); await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
    await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.message)).toBeTruthy();
    await expect(page.locator("#rootContainerDialog")).toBeVisible(); await expect(page.locator("#rootContainerName")).toHaveValue("Новая сумка и удержанное фото");
    await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(1);
    expect(await records()).toEqual(before); expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(posts); expect(f.stagePosts).toHaveLength(1);
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const importKind of ["guest", "archive", "public", "public-tree", "server"]) for (const [fileless, outcome] of (importKind === "public-tree" ? [[false, "lost ACK"]] : [[false, "lost ACK"], [true, "lost ACK"], [false, "quota"], [false, "cancel"]]))
test(`${importKind} atomic owner photo creation ${fileless ? "fileless" : "photos"} ${outcome} preserves complete forms`, async ({ page, context }) => {
  test.skip(process.env[importKind === "server" ? "BIKE_PERSONAL_SERVER_NEW_OWNERS" : importKind.startsWith("public") ? "BIKE_PERSONAL_PUBLIC_NEW_OWNERS" : "BIKE_PERSONAL_IMPORT_NEW_OWNERS"] !== "1", "Checks the independent new-owner photo form gate");
  test.setTimeout(150000);
  const quota = outcome === "quota", newOwnerVersion = importKind === "server" ? 7 : importKind.startsWith("public") ? 5 : 4;
  const { f, imported, release, clearHold } = await preparePendingOwnerUi(page, context, fileless, importKind);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    const image = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 3; return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator('[data-view="packing"]').click(); await page.locator("[data-add-packing-root]").click();
    await page.locator("#createRootForLayoutBtn").click(); await page.locator("#rootContainerName").fill("Новая сумка сразу с фото");
    await page.locator("#rootContainerPhotoInput").setInputFiles({ name: "new-bag.png", mimeType: "image/png", buffer: image });
    await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("bike-packing-new-container-form-draft-v1::id:actor-a")))).toBe(true);
    await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
    await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
    const afterBag = await records(), bagForm = afterBag.find(record => record.action.body.ownerResult?.version === newOwnerVersion);
    expect(await page.evaluate(() => localStorage.getItem("bike-packing-new-container-form-draft-v1::id:actor-a"))).toBeNull();
    expect(bagForm).toBeTruthy(); const bagId = bagForm.action.body.entityId;
    expect(bagForm.action.body.ownerResult.owner).toBeNull(); expect(bagForm.action.kind).toBe("photos.mutate");
    expect(f.payload.containers[bagId]).toBeUndefined();
    const bag = page.locator(`#packingView [data-root-container-id="${bagId}"]`);
    await bag.locator("[data-add-to-container]").click(); await page.locator("#createItemForContainerBtn").click();
    await page.locator("#itemName").fill("Новая вещь сразу с фото"); await page.locator("#itemWeight").fill("127");
    await page.locator("#itemPhotoInput").setInputFiles({ name: "new-item.png", mimeType: "image/png", buffer: image });
    await expect(page.locator("#itemPhotoPreview img")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("bike-packing-new-item-form-draft-v1::id:actor-a")))).toBe(true);
    if (quota) await page.evaluate(newOwnerVersion => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:")) {
          const body = JSON.parse(value).action?.body;
          if (body?.ownerResult?.version === newOwnerVersion && body.entityType === "item") throw new DOMException("atomic owner quota", "QuotaExceededError");
        }
        return write.call(this, key, value);
      };
    }, newOwnerVersion);
    await submitForm(page, "#saveItemBtn", "#itemWeight");
    if (quota) {
      await expect(page.locator("#itemDialog")).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
      expect(await records()).toEqual(afterBag); expect(f.payload.containers[bagId]).toBeUndefined();
      const download = page.waitForEvent("download"); await page.locator("[data-download-photo-recovery]").click();
      const entries = await readZipEntries(new Blob([await readFile(await (await download).path())]));
      expect([...entries.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(4);
      return;
    }
    await expect(page.locator("#itemDialog"), JSON.stringify(f.errors)).not.toBeVisible();
    const afterItem = await records(), itemForm = afterItem.find(record => record.action.body.ownerResult?.version === newOwnerVersion && record.action.body.entityType === "item");
    expect(await page.evaluate(() => localStorage.getItem("bike-packing-new-item-form-draft-v1::id:actor-a"))).toBeNull();
    const itemId = itemForm.action.body.entityId; expect(itemForm.action.body.causal.baseOperationId).toBe(bagForm.action.operationId);
    expect(itemForm.action.body.formContext.placement.targetContainerId).toBe(bagId); expect(f.payload.items[itemId]).toBeUndefined();
    await page.locator('[data-view="items"]').click(); await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    await page.locator("#itemWeight").fill("128"); await submitForm(page, "#saveItemBtn", "#itemWeight");
    await expect(page.locator("#itemDialog")).not.toBeVisible();
    const all = await records(), update = all.find(record => record.action.body.photoResults?.version === (importKind === "server" ? 14 : importKind.startsWith("public") ? 11 : 10));
    expect(update).toBeTruthy();
    for (const old of [imported, bagForm, itemForm]) expect(all.find(record => record.action.operationId === old.action.operationId)).toEqual(old);
    if (outcome === "cancel") {
      const server = structuredClone(f.payload);
      await context.route(`${origin}/src/**/*.js`, async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(pathname)) throw Error("Invalid native-file reader path");
        return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(`.${pathname}`), "utf8") });
      });
      const nativeFiles = () => page.evaluate(async () => {
        const { createPersonalPhotoActionStore } = await import("/src/sync/personal-photo-action-store.js");
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
        const store = createPersonalPhotoActionStore(binding), proofs = [];
        for (const id of await store.ids()) for (const part of (await store.read(id)).files) proofs.push({ ok: true,
          operation: { id: part.stage.operationId, actorId: binding.actorId, environment: binding.environment, listId: binding.listId,
            entityType: part.stage.entityType, entityId: part.stage.entityId, photoId: part.stage.photoId, state: "cancelled", payloadDigest: "c".repeat(64) },
          cancellation: { version: 1, stageOperationId: part.stage.operationId, fileHash: part.fileMetadata.hash,
            thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } });
        return proofs;
      });
      const files = await nativeFiles(); expect(files).toHaveLength(4);
      f.cancelPhotoActions = new Map(all.map(record => [record.action.operationId, record.action]));
      f.cancellationReceipts = new Map(files.map(proof => [proof.operation.id, proof]));
      f.loseStageAt = 1; clearHold(); release(); await expect.poll(() => Boolean(f.hiddenStage)).toBe(true);
      await reloadApp(page, { recovery: true }); f.loseStageAt = 0; f.hiddenStage = null;
      const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
      await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible({ timeout: 30000 }); await page.locator("#confirmCancelBtn").click();
      await expect(recovery).toContainText("Выбор отложен"); expect(f.payload).toEqual(server);
      await reloadApp(page, { recovery: true }); await cancel.click(); await page.locator("#confirmOkBtn").click();
      await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
      expect(f.payload).toEqual(server); expect(f.stagePosts).toHaveLength(1); expect(await nativeFiles()).toEqual(files);
      expect(new Set(f.ownerCancellationPosts)).toEqual(new Set([imported, bagForm, itemForm, update].map(record => record.action.operationId)));
      await reloadApp(page); expect(f.errors).toEqual([]); return;
    }
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog"), resume = recovery.locator("[data-resume-photo-upload]");
    f.beforePhotoWrite = action => { f.loseFormOwner = action.operationId === itemForm.action.operationId; };
    await resume.click(); await expect(resume).toBeEnabled({ timeout: 30000 }); await expect.poll(() => f.injectedFailure).toBe(true);
    f.beforePhotoWrite = null; f.loseFormOwner = false; f.hiddenFormOwner = null;
    await reloadApp(page, { recovery: true }); await resume.click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    expect(f.payload.items[itemId].photos).toHaveLength(1); expect(f.payload.items[itemId].weight).toBe(128);
    expect(f.payload.containers[bagId].photos).toHaveLength(1);
    expect(Object.values(f.payload.layouts).some(layout => layout.arrangement?.items?.[itemId] === bagId)).toBe(true);
    expect(f.stagePosts).toHaveLength(fileless ? 2 : 4);
    for (const old of [imported, bagForm, itemForm, update]) expect(f.posts.filter(post => post.operationId === old.action.operationId)).toHaveLength(1);
    await reloadApp(page); expect(f.errors).toEqual([]);
    for (const [view, button, prefix, dialog] of [["items", "addItemBtn", "item", "itemDialog"],
      ["bags", "addRootContainerBtn", "rootContainer", "rootContainerDialog"]]) {
      await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#${button}`).click();
      await expect(page.locator(`#${dialog}`)).toBeVisible();
      await expect(page.locator(`#${prefix}Name`)).toHaveValue("");
      await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(0);
      await page.locator(`#${dialog} header [value="cancel"]`).click();
      await expect(page.locator(`#${dialog}`)).not.toBeVisible();
    }
    expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const importKind of ["guest", "archive", "public", "server"]) test(`${importKind} pending owner creation gate off preserves the form and original import`, async ({ page, context }) => {
  test.skip(importKind === "public" && process.env.BIKE_PERSONAL_PUBLIC_IMPORT !== "1"
    || importKind === "server" && process.env.BIKE_PERSONAL_SERVER_IMPORT !== "1", "Requires the parent import; the independent owner creation gate stays OFF");
  test.skip(process.env[importKind === "server" ? "BIKE_PERSONAL_SERVER_NEW_OWNERS" : importKind.startsWith("public") ? "BIKE_PERSONAL_PENDING_PUBLIC_CREATE" : "BIKE_PERSONAL_PENDING_CREATE"] === "1", "Checks the independent fileless owner creation gate");
  const { f, release, clearHold } = await preparePendingOwnerUi(page, context, false, importKind);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    const before = await records(), server = structuredClone(f.payload), posts = f.posts.length;
    await page.locator('[data-view="packing"]').click(); await page.locator("[data-add-packing-root]").click();
    await page.locator("#createRootForLayoutBtn").click();
    await page.locator("#rootContainerName").fill("Сумка с выключенным переходом");
    await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
    await expect.poll(() => page.evaluate(() => globalThis.__personalTestPhotoFormError?.message)).toBeTruthy();
    await expect(page.locator("#rootContainerDialog")).toBeVisible();
    await expect(page.locator("#rootContainerName")).toHaveValue("Сумка с выключенным переходом");
    expect(await records()).toEqual(before); expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(posts); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});

for (const importKind of ["guest", "archive", "public", "server"]) for (const [fileless, quota] of [[false, false], [true, false], [false, true]])
test(`${importKind} pending owner creation ${fileless ? "fileless" : "photos"} ${quota ? "quota" : "save then photo"} keeps the original import and placements`, async ({ page, context }) => {
  test.skip(process.env[importKind === "server" ? "BIKE_PERSONAL_SERVER_NEW_OWNERS" : importKind.startsWith("public") ? "BIKE_PERSONAL_PENDING_PUBLIC_CREATE" : "BIKE_PERSONAL_PENDING_CREATE"] !== "1", "Checks the separately enabled owner creation adapter");
  test.setTimeout(150000);
  const { f, imported, release, clearHold } = await preparePendingOwnerUi(page, context, fileless, importKind);
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  try {
    await page.locator('[data-view="packing"]').click();
    const bag = await createRootContainer(page, "Новая сумка во время переноса");
    const bagId = await bag.getAttribute("data-root-container-id"), afterBag = await records();
    const bagAction = afterBag.find(record => record.action.body.payload?.containers?.[bagId]);
    expect(bagAction.action.body.photoResults.version).toBe(importKind === "server" ? 12 : importKind.startsWith("public") ? 7 : importKind === "guest" ? 4 : 3);
    expect(f.payload.containers[bagId]).toBeUndefined();
    if (quota) await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (String(key).startsWith("bike-packing-personal-save-v1:")) {
          const record = JSON.parse(value);
          if (Object.values(record.action?.body.payload?.items || {}).some(owner => owner.name === "Новая вещь во время переноса")) throw new DOMException("new owner quota", "QuotaExceededError");
        }
        return write.call(this, key, value);
      };
    });
    await bag.locator("[data-add-to-container]").click(); await page.locator("#createItemForContainerBtn").click();
    await page.locator("#itemName").fill("Новая вещь во время переноса"); await page.locator("#itemWeight").fill("127");
    await submitForm(page, "#saveItemBtn", "#itemWeight");
    if (quota) {
      await expect(page.locator("#itemDialog")).toBeVisible(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
      expect(await records()).toEqual(afterBag); expect(f.payload.containers[bagId]).toBeUndefined();
      const download = page.waitForEvent("download"); await page.locator("[data-download-photo-recovery]").click();
      const entries = await readZipEntries(new Blob([await readFile(await (await download).path())]));
      expect([...entries.keys()].filter(key => key.startsWith("photos/") && key.endsWith("original.bin"))).toHaveLength(2);
      return;
    }
    await expect(page.locator("#itemDialog"), JSON.stringify(f.errors)).not.toBeVisible();
    const afterItem = await records(), itemAction = afterItem.find(record => Object.values(record.action.body.payload?.items || {}).some(owner => owner.name === "Новая вещь во время переноса"));
    const itemId = Object.values(itemAction.action.body.payload.items).find(owner => owner.name === "Новая вещь во время переноса").id;
    expect(itemAction.action.body.causal.baseOperationId).toBe(bagAction.action.operationId);
    expect(f.payload.items[itemId]).toBeUndefined();
    // The separately saved new owner may then receive a normal import-linked
    // photo form. The import and both creation actions stay immutable.
    await page.locator('[data-view="items"]').click(); await page.locator(`#itemsView [data-list-item-id="${itemId}"] .item-title`).click();
    const bytes = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 3; return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.locator("#itemPhotoInput").setInputFiles({ name: "new-owner.png", mimeType: "image/png", buffer: bytes });
    await expect(page.locator("#itemPhotoPreview img")).toHaveCount(1); await submitForm(page, "#saveItemBtn");
    await expect(page.locator("#itemDialog")).not.toBeVisible();
    const all = await records(), photo = all.find(record => record.action.body.entityId === itemId);
    expect(photo.action.body.ownerResult.version).toBe(importKind === "server" ? 6 : importKind.startsWith("public") ? 2 : 3);
    for (const old of [imported, bagAction, itemAction]) expect(all.find(record => record.action.operationId === old.action.operationId)).toEqual(old);
    clearHold(); release(); await reloadApp(page, { recovery: true });
    const recovery = page.locator("#personalSaveRecoveryDialog");
    await recovery.locator("[data-resume-photo-upload]").click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены", { timeout: 30000 });
    expect(f.payload.items[itemId].photos).toHaveLength(1); expect(f.payload.items[itemId].weight).toBe(127);
    expect(Object.values(f.payload.layouts).some(layout => layout.arrangement?.items?.[itemId] === bagId)).toBe(true);
    expect(f.stagePosts).toHaveLength(fileless ? 1 : 3);
    for (const old of [imported, bagAction, itemAction, photo]) expect(f.posts.filter(post => post.operationId === old.action.operationId)).toHaveLength(1);
    await reloadApp(page); expect(f.errors).toEqual([]);
  } finally { clearHold(); release(); }
});
