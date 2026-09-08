import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { personalPhotoFormOwner } from "../../src/sync/personal-photo-form-protocol.js";
import { readZipEntries, zipText } from "../../src/utils/simple-zip.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

// Full application, isolated browser/API fixture. Gates are changed only in
// an isolated test bundle; source/publication flags and live services stay off.
const origin = "https://experiment.vniipo-help.ru";
const bundleRoot = path.resolve("test-results/personal-ui-build");
const photoRecoveryBundleRoot = path.resolve("test-results/personal-photo-cancel-ui-build");
test.beforeAll(async () => {
  for (const mode of ["production", "photo-recovery", "photo-form", "photo-edit"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
    "build", "--config", "tests/e2e/personal-ui.vite.config.js", "--mode", mode], { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
  }
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const startup = await page.evaluate(() => globalThis.__personalStartupPhase).catch(() => null);
    if (startup) console.log("PERSONAL STARTUP", JSON.stringify(startup));
    const formError = await page.evaluate(() => globalThis.__personalTestPhotoFormError).catch(() => null);
    if (formError) { console.log("PHOTO FORM FAILURE", JSON.stringify(formError)); await info.attach("photo-form-failure", { body: JSON.stringify(formError), contentType: "application/json" }); }
    const difference = await page.evaluate(() => globalThis.__personalTestProjectionDifference).catch(() => null);
    if (difference) await info.attach("personal-projection-difference", { body: JSON.stringify(difference, null, 2), contentType: "application/json" });
    const photoEvents = await page.evaluate(() => globalThis.__photoEditEvents).catch(() => null);
    if (photoEvents) await info.attach("photo-edit-events", { body: JSON.stringify(photoEvents), contentType: "application/json" });
  }
  if (info.status !== info.expectedStatus) await info.attach("personal-ui-errors", {
    body: JSON.stringify(page.personalFixture?.errors || []), contentType: "application/json"
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

async function setup(page, context, { fresh = false, lose = false, payload = initialPayload(), photoRecovery = false, photoForm = false, photoEdit = false, migration = false, migrationComplete = true } = {}) {
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
  const activeBundleRoot = photoEdit ? path.resolve("test-results/personal-photo-edit-ui-build") : photoForm ? path.resolve("test-results/personal-photo-form-ui-build") : photoRecovery ? photoRecoveryBundleRoot : bundleRoot;
  state.photoRevisions = new Map();
  state.stagePosts = [];
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
  await context.addInitScript(() => { localStorage.setItem("bike-packing-language-v1", "ru"); });
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
      if (path === "/auth/me" || path === "/auth/experiment-share-session") data = { ok: true, user: { id: "actor-a", email: "personal@example.test" } };
      else if (path === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (path === "/bike-packing/capabilities") data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "personalListCausalOperationsV1", ...(photoForm ? ["personalCausalPhotoFormV1"] : []), ...(photoEdit ? ["personalCausalPhotoCopyFormV1", "personalCausalPhotoCopyDeletionV1"] : []), ...(migration ? ["personalListInitialMigrationV1"] : []), ...(photoRecovery || photoForm ?
          ["personalCausalPhotoPublicationV1", "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1", "personalListOperationCancellationV1"] : [])] };
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
        data = { ok: true, actorId: "actor-a", environment: "bike-packing-experiment", listId: state.listId,
          restore: { payload, baseStateRevision: state.revision, historyRestore: { version: 1, historyId: 101,
            historyPayloadHash: hash(source.payload), payloadHash: hash(payload), layoutIds, targetStateRevision: state.revision } } };
      }
      else if (photoEdit && path === `/bike-packing/lists/${state.listId}/photo-owner-state`) {
        expect(request.method()).toBe("GET");
        const entityType = url.searchParams.get("entityType"), entityId = url.searchParams.get("entityId");
        const owner = state.payload[entityType === "item" ? "items" : "containers"][entityId];
        data = { ok: true, version: 1, readOnly: true, environment: "bike-packing-experiment", actorId: "actor-a", listId: state.listId,
          stateRevision: state.revision, owner: { entityType, entityId, entityRevision: state.revision, payload: structuredClone(owner) },
          photos: owner.photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: state.photoRevisions.get(photo.id) })) };
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
          asset: { id, state: "ready", publication: "not-published", fileHash: sent.fileHash, thumbHash: sent.thumbHash,
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
        expect(id).toBe(state.cancelPhotoAction.operationId); expect(body.operationId).toBe(id);
        expect(body.expectedActorId).toBe("actor-a"); expect(body.environment).toBe("bike-packing-experiment");
        expect(body.listId).toBe(state.listId); expect(body.kind).toBe("photos.mutate"); expect(body.body).toEqual(state.cancelPhotoAction.body);
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
        if (body.body.copySource && state.beforeCopyDispatch) await state.beforeCopyDispatch(body);
        if (state.dropCopyBeforeCommit && body.kind === "photos.mutate" && body.body.copySource) {
          state.injectedFailure = true; return route.abort("failed");
        }
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
        const digest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
        const predecessor = body.body.causal?.baseOperationId && state.receipts.get(body.body.causal.baseOperationId);
        if (["list.update", "list.restore"].includes(body.kind) && state.beforeUpdate) await state.beforeUpdate(body);
        const base = predecessor?.result.payload.list?.stateRevision ?? body.body.baseStateRevision;
        if (body.kind === "list.create") { expect(state.listId).toBeNull(); expect(body.body.id).toBe(body.listId); }
        else if (!state.allowConflicts) expect(base).toBe(state.revision);
        if (photoForm && body.kind === "photos.mutate") {
          expect(body.body.action).toBe("form");
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
                expect(change.basePhotoRevision).toBe(state.photoRevisions.get(change.photoId));
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
          if (body.body.baseEntityRevision === 0) {
            for (const key of body.body.entityType === "item" ? ["containerId"] : ["parentId", "childIds", "itemIds", "order"]) delete owner[key];
          }
          state.payload[body.body.entityType === "item" ? "items" : "containers"][owner.id] = owner; state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, stateRevision: state.revision, list: structuredClone(record()), photoChanges: changes,
              photoForm: { entityType: body.body.entityType, entityId: owner.id, created: body.body.baseEntityRevision === 0 } } } };
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
          state.listId = body.listId; state.payload = body.body.photoResults ? structuredClone(body.body.payload) : body.body.payload;
          if (body.body.photoResults) {
            const ref = body.body.photoResults, collection = ref.entityType === "item" ? "items" : "containers";
            const copy = state.receipts.get(ref.operationId);
            expect(copy.operation.state).toBe("committed");
            expect(body.body.causal.dependsOn).toContainEqual({ operationId: ref.operationId, listId: state.listId });
            if (state.payload[collection][ref.entityId]) state.payload[collection][ref.entityId].photos = structuredClone(copy.result.payload.list.payload[collection][ref.entityId].photos);
          }
          state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, list: structuredClone(record()), ...(body.kind === "list.migrate" ? { migration: body.body.migration } : {}) } } };
        }
        state.receipts.set(body.operationId, data);
        if (state.loseFormOwner && body.kind === "photos.mutate" && body.body.action === "form") {
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
  if (!fresh && !migration) {
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

for (const withContents of [false, true]) test(`personal tree picker freezes ${withContents ? "contents" : "empty bag"} copy and placement as one action across lost ACK`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(); payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Цель копии" };
  const f = await setup(page, context, { payload }), bag = await createRootContainer(page, "Сумка ветки");
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

for (const quota of [false, true]) test(`personal tree picker missing-only retains exact additions and existing records (${quota ? "quota" : "lost ACK"})`, async ({ page, context }) => {
  test.setTimeout(120000);
  const payload = initialPayload(); payload.layouts["layout-b"] = { ...structuredClone(payload.layouts["layout-a"]), id: "layout-b", name: "Цель дополнения" };
  const f = await setup(page, context, { payload }), bag = await createRootContainer(page, "Сумка дополнения");
  await createItemInContainer(page, bag, "Уже размещённая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], originalItemId = Object.keys(f.payload.items)[0];
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
});

test("personal tree picker links existing records to another layout without copying their IDs", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка связи");
  await createItemInContainer(page, bag, "Вещь связи");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const rootId = Object.keys(f.payload.containers)[0], itemId = Object.keys(f.payload.items)[0];
  await page.locator("#newLayoutBtn").click(); await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Цель связи"); await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await synchronize(page, () => Object.keys(f.payload.layouts).length === 2);
  const targetId = Object.keys(f.payload.layouts).find(id => id !== "layout-a");
  await page.locator("#layoutSelect").selectOption("layout-a");
  await page.locator(`#packingView [data-root-container-id="${rootId}"]`).getByText("Сумка связи", { exact: true }).click();
  await page.locator("#rootContainerCopyToContainerBtn").click();
  await page.locator("#containerPickerLayoutSelect").selectOption(targetId);
  const before = f.posts.length;
  await page.locator("#containerPickerBoard [data-pick-root-index]").last().click();
  await expect(page.locator("#containerPickerDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.layouts[targetId].arrangement.rootContainerIds.includes(rootId));
  expect(f.posts).toHaveLength(before + 1); expect(f.posts.at(-1).body.userContainerTree.mode).toBe("link");
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
}

async function prepareOrdinaryPhotoForm(page, context, { type = "container", created = false, photoEdit = false, photoCount = 2 } = {}) {
  const f = await setup(page, context, { photoForm: true, photoEdit }), bag = await createRootContainer(page, "База фотоформы");
  if (type === "item" && !created) await createItemInContainer(page, bag, "Вещь фотоформы");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1 && (type !== "item" || created || Object.keys(f.payload.items).length === 1));
  const before = f.posts.length, collection = type === "item" ? "items" : "containers";
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  if (created) await page.locator(type === "item" ? "#addItemBtn" : "#addRootContainerBtn").click();
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
  await expect(page.locator(`#${prefix}PhotoStatus`)).toContainText("Отправятся после сохранения карточки");
  await expect(page.locator(button)).toBeEnabled();
  expect(f.stagePosts).toHaveLength(0); expect(f.posts).toHaveLength(before);
  await page.locator(`#${prefix}Note`).blur();
  await expect(page.locator(button)).toBeVisible();
  return { f, before, collection, prefix, button, dialog };
}

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

async function prepareExistingPhotoEdit(page, context, { type = "container", change = "delete" } = {}) {
  const form = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true, photoCount: change === "delete-order" ? 3 : 2 }), { f, before, collection, prefix, button, dialog } = form;
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
  await page.reload();
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

for (const type of ["item", "container"]) for (const lost of [false, true]) test(`pending photo deletion ${type} cancellation retains files and allows a postponed choice${lost ? " after lost cancellation ACK" : ""}`, async ({ page, context }) => {
  test.setTimeout(120000);
  const { f, before, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  const server = structuredClone(f.payload);
  let release;
  f.beforeStageAck = () => new Promise(resolve => { release = resolve; });
  f.loseStageAt = 1;
  try {
    await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
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
    f.cancellationReceipts = new Map(retained.cancellationReceipts.map(proof => [proof.operation.id, proof]));
    f.beforeStageAck = null; release();
    await expect.poll(() => f.hiddenStage).toBe(f.stagePosts[0]);
    await reloadApp(page, { recovery: true }); f.hiddenStage = null;
    const recovery = page.locator("#personalSaveRecoveryDialog"), cancel = recovery.locator("[data-cancel-photo-upload]");
    await expect(cancel).toBeVisible();
    if (lost) {
      f.loseCancellation = true; f.hideCancellationReceipt = true;
      await cancel.click(); await expect(cancel).toBeEnabled();
      expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 1);
      await reloadApp(page, { recovery: true });
      f.loseCancellation = false; f.hiddenFormOwner = null;
    }
    await cancel.click(); await expect(page.locator("#confirmDialog")).toBeVisible();
    await expect(page.locator("#confirmDialog")).toContainText("действий: 2");
    await page.locator("#confirmCancelBtn").click(); await expect(recovery.getByRole("status")).toContainText("Выбор отложен");
    expect(f.payload).toEqual(server); expect(f.posts).toHaveLength(before + 2); expect(f.stagePosts).toHaveLength(1);
    expect(f.receipts.get(retained.deletion.operationId).result.payload.code).toBe("dependency_rejected");
    await reloadApp(page, { recovery: true }); await cancel.click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    await expect(recovery).toContainText("Подтверждения и актуальная версия сохранены");
    expect(f.posts).toHaveLength(before + 3); expect(f.stagePosts).toHaveLength(1); expect(f.cancellationPosts).toHaveLength(1);
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

for (const type of ["item", "container"]) for (const outcome of ["source", "copy", "both", "lost deletion", "quota", "cancel both", "cancel both lost ACK"]) test(`pending photo copy ${type} deletion ${outcome} preserves its frozen result and exact dependencies`, async ({ page, context }) => {
  test.setTimeout(150000);
  const { f, collection, prefix, button, dialog } = await prepareOrdinaryPhotoForm(page, context, { type, photoEdit: true });
  await submitForm(page, button); await expect(dialog).not.toBeVisible(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.at(-1)?.kind).toBe("photos.mutate");
  const sourceId = f.posts.at(-1).body.entityId;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-prototype-sync-meta-v1::id:actor-a"))?.dirty)).toBe(false);
  const before = f.posts.length, server = structuredClone(f.payload), stages = [...f.stagePosts], cancelled = outcome.startsWith("cancel");
  const records = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(record => record.action));
  let release;
  const hold = () => new Promise(resolve => { release = resolve; });
  if (cancelled) { f.beforeCopyDispatch = hold; f.dropCopyBeforeCommit = true; }
  else { f.afterFormCommit = hold; f.loseFormOwner = !["lost deletion", "quota"].includes(outcome); }
  try {
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${sourceId}"]`).click();
    await submitForm(page, "#confirmOkBtn"); await page.locator("#syncBtn").click();
    await expect.poll(() => Boolean(release)).toBe(true);
    const originalRecords = await records(), form = originalRecords.find(record => record.action.body.copySource), targetId = form.action.body.entityId;
    const selected = ["source", "quota"].includes(outcome) ? [sourceId] : outcome === "copy" ? [targetId] : [targetId, sourceId];
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
      expect(child.action.body.photoResults).toEqual({ version: 1, operationId: form.action.operationId, entityType: type, entityId: targetId });
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
      await expect(page.locator("#confirmDialog")).toContainText("действий: 3");
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
        expect(f.payload[collection][targetId].photos.map(photo => photo.id)).toEqual(form.action.body.changes.map(change => change.photoId));
        expect(f.payload[collection][targetId].photos.every(photo => photo.status === "synced")).toBe(true);
        expect(f.payload[collection][targetId].note).toBe(server[collection][sourceId].note);
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
  await page.locator("#categoryInput").fill("Питание"); await submitForm(page, "#categoryAdd", "#categoryInput");
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
