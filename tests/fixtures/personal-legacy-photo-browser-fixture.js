import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { expect } from "@playwright/test";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { EXPERIMENT_RELEASE_CAPABILITIES } from "../../scripts/experiment-release-profile.mjs";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPlacementMutation, personalPlacementIntent } from "../../src/sync/personal-placement-mutation.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { buildListSaveBody } from "../../src/sync/save-body.js";
import { scopedLocalStorageKey } from "../../src/storage/scope.js";
import { STORAGE_KEY, SYNC_META_KEY, ACTIVE_LIST_ID_KEY } from "../../src/config/constants.js";

export const legacyPhotoOrigin = "https://experiment.vniipo-help.ru";
const api = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api";
const canonicalApi = "https://api.vniipo-help.ru/experiment/letters-vniipo/api";
const root = path.resolve("www/vniipo-help.ru/bike-packing");
export const legacyPhotoBinding = Object.freeze({ actorId: "legacy-photo-user", listId: "legacy-photo-list", scopeKey: "id:legacy-photo-user" });
export const legacyLayoutId = "personal-layout", legacyBagId = "sumka";
const timestamp = "2026-09-14T10:00:00.000Z", prefix = "bike-packing-personal-save-v1:";
const scoped = key => scopedLocalStorageKey(key, legacyPhotoBinding.scopeKey);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

export function legacyPhotoPayload() {
  const bags = Object.fromEntries(["placed-bag", legacyBagId].map(id => [id, {
    id, name: id === legacyBagId ? "Сумка с четырьмя фотографиями" : "Размещённая сумка",
    weight: 230, volume: 3, location: "Велосипед", note: "Сохранённая заметка", categories: [], category: "", color: "",
    parentId: null, itemIds: [], childIds: [], order: [], photos: id === legacyBagId ? [1, 2, 3, 4].map(index => {
      const photoId = `legacy-photo-${index}`;
      // Exact old registered reference shape: no assetId, photoId alias, file
      // hashes or upload metadata are invented by this fixture.
      return { height: 1, id: photoId, listId: legacyPhotoBinding.listId, status: "synced",
        thumbUrl: `${canonicalApi}/bike-packing/lists/${legacyPhotoBinding.listId}/photos/${photoId}/thumb`, updatedAt: timestamp,
        url: `${canonicalApi}/bike-packing/lists/${legacyPhotoBinding.listId}/photos/${photoId}/file`, width: 1 };
    }) : []
  }]));
  return { locations: ["Велосипед"], customLocations: ["Велосипед"], categories: [], customCategories: [],
    collapseDefaultsVersion: 2, containers: bags, items: {}, packedItems: {}, activeLayoutId: legacyLayoutId,
    layouts: { [legacyLayoutId]: { id: legacyLayoutId, name: "Личная укладка с фото", rootContainerIds: ["placed-bag"],
      locations: ["Велосипед"], customLocations: [], categories: [], customCategories: [],
      arrangement: { rootContainerIds: ["placed-bag"], containers: { "placed-bag": { parentId: "", itemIds: [], childIds: [], order: [] } },
        items: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } } } };
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function releaseSerializedPayload(snapshot) {
  // Node otherwise imports API_BASE in the Production context and rewrites
  // /experiment/ photo URLs. Evaluate the unchanged serializer with the same
  // location as this release before constructing (never rewriting) the action.
  return new Promise((resolve, reject) => {
    const worker = new Worker(`const { parentPort, workerData } = require("node:worker_threads");
      (async () => { globalThis.location = new URL(workerData.origin);
        const { cloneStateForSyncPayload } = await import(workerData.module);
        parentPort.postMessage(cloneStateForSyncPayload(workerData.snapshot, { forSync: true }));
      })().catch(error => { throw error; });`, { eval: true,
      workerData: { snapshot, origin: legacyPhotoOrigin, module: new URL("../../src/sync/serialize.js", import.meta.url).href } });
    worker.once("message", resolve); worker.once("error", reject);
    worker.once("exit", code => { if (code !== 0) reject(Error(`Serializer worker failed: ${code}`)); });
  });
}

export async function nativeLegacyPhotoOutbox(page) {
  const entries = await page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix)), prefix);
  const outbox = createPersonalSaveOutbox({ storage: memoryStorage(entries), ...legacyPhotoBinding });
  return { entries, record: outbox.recover(), pending: outbox.hasPending(), confirmed: outbox.confirmedBase() };
}

// Independent synthetic server rule: all registered photos stay on the same
// owner, in the same order, with all old fields exact. No photo mutation route
// is served. Actual SQL/file preservation has separate API acceptance tests.
export function assertLegacyPhotoRowsPreserved(before, after) {
  const inventory = payload => Object.fromEntries(["items", "containers"].flatMap(collection =>
    Object.entries(payload[collection] || {}).filter(([, owner]) => owner.photos?.length)
      .map(([id, owner]) => [`${collection}/${id}`, owner.photos])));
  assert.deepEqual(inventory(after), inventory(before), "ordinary save changed registered photo owner/order/metadata");
  assert.deepEqual(Object.keys(after.items).sort(), Object.keys(before.items).sort());
  assert.deepEqual(Object.keys(after.containers).sort(), Object.keys(before.containers).sort());
}

export async function seedLegacyPhotoPendingAction(page) {
  const local = await page.evaluate(({ stateKey, metaKey }) => ({ snapshot: JSON.parse(localStorage.getItem(stateKey)),
    meta: JSON.parse(localStorage.getItem(metaKey)), selectedLayoutId: document.querySelector("#layoutSelect").value }),
  { stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY) });
  assert.equal(local.meta.stateRevision, 1582);
  assert.equal(local.selectedLayoutId, legacyLayoutId);
  // Active layout is a display preference omitted by the persisted personal
  // business mirror; bind the simulated old capture to the actual UI choice.
  local.snapshot.activeLayoutId = local.selectedLayoutId;
  const { snapshot, intent } = preparePersonalPlacementMutation(local.snapshot, {
    layoutId: legacyLayoutId, action: "link-root", ids: [legacyBagId], targetIndex: 1, includeContents: true });
  const storage = memoryStorage(), outbox = createPersonalSaveOutbox({ storage, ...legacyPhotoBinding });
  const payload = await releaseSerializedPayload(snapshot);
  assertLegacyPhotoRowsPreserved(legacyPhotoPayload(), payload);
  const body = buildListSaveBody({ serializeState: () => payload, nowIso: () => timestamp,
    syncMeta: { ...local.meta, localUpdatedAt: timestamp }, syncDevice: { id: "legacy-browser-device", name: "Изолированный браузер" } });
  body.userPlacement = personalPlacementIntent(intent);
  const record = outbox.capture({ snapshot, body, operationId: randomUUID() });
  assert.equal(record.mergeBase, undefined);
  assert.deepEqual(createPersonalSaveOutbox({ storage, ...legacyPhotoBinding }).recover(), record);
  const entries = [...storage.values];
  await page.evaluate(({ entries, snapshot, meta, stateKey, metaKey, listKey, listId }) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
    localStorage.setItem(stateKey, JSON.stringify(snapshot)); localStorage.setItem(metaKey, JSON.stringify({ ...meta, dirty: true }));
    localStorage.setItem(listKey, listId);
  }, { entries, snapshot, meta: local.meta, stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY),
    listKey: scoped(ACTIVE_LIST_ID_KEY), listId: legacyPhotoBinding.listId });
  return { record, entries };
}

export async function setupPersonalLegacyPhotoBrowser(page, context, { loseAck = false } = {}) {
  const initial = legacyPhotoPayload();
  const f = { initial, payload: structuredClone(initial), revision: 1582, calls: [], posts: [], receiptReads: [],
    receipts: new Map(), captured: [], errors: [], loseAck, dropped: false, hideReceipts: false };
  page.legacyPhotoFixture = f;
  const list = () => ({ id: legacyPhotoBinding.listId, title: "Личные укладки", ownerId: legacyPhotoBinding.actorId,
    role: "owner", canEdit: true, stateRevision: f.revision, updatedAt: timestamp, payload: structuredClone(f.payload) });
  const headers = { "Access-Control-Allow-Origin": legacyPhotoOrigin, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate",
    "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" };
  page.on("pageerror", error => f.errors.push(error.message));
  await context.addInitScript(() => {
    localStorage.setItem("bike-packing-language-v1", "ru");
    sessionStorage.setItem("bike-packing-experiment-transport-v1", "eu");
  });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.href.startsWith(api + "/")) {
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const endpoint = url.pathname.split("/letters-vniipo/api")[1];
      const call = { method, path: endpoint, body: request.postDataJSON(), revision: f.revision };
      f.calls.push(call);
      let data;
      if (endpoint === "/bike-packing/capabilities") data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...new Set([...REQUIRED_ADMIN_API_CAPABILITIES, ...EXPERIMENT_RELEASE_CAPABILITIES, "personalLegacyPhotoPreservationV1"])] };
      else if (endpoint === "/auth/me") data = { ok: true, user: { id: legacyPhotoBinding.actorId, email: "legacy-photo@example.test" } };
      else if (endpoint === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (endpoint === "/bike-packing/lists") data = { ok: true, lists: [list()] };
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}` || endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`)
        data = { ok: true, list: list(), state: structuredClone(f.payload), stateRevision: f.revision };
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/freshness`) data = { ok: true, listId: legacyPhotoBinding.listId,
        stateRevision: f.revision, serverUpdatedAt: timestamp, itemCount: 0, containerCount: 2, layoutCount: 1 };
      else if (new RegExp(`^/bike-packing/lists/${legacyPhotoBinding.listId}/photos/legacy-photo-[1-4]/(file|thumb)$`).test(endpoint))
        return route.fulfill({ headers, contentType: "image/png", body: png });
      else if (endpoint === "/bike-packing/list-operations" && method === "POST") {
        const action = request.postDataJSON(); f.posts.push(structuredClone(action));
        f.captured.push(await nativeLegacyPhotoOutbox(page));
        assert.equal(action.environment, "bike-packing-experiment"); assert.equal(action.expectedActorId, legacyPhotoBinding.actorId);
        assert.equal(action.listId, legacyPhotoBinding.listId); assert.equal(action.kind, "list.update");
        assert.ok(["link-root", "remove-container"].includes(action.body.userPlacement?.action), "unexpected business intent");
        assert.equal(f.receipts.has(action.operationId), false, "the same immutable action was POSTed twice");
        assert.equal(action.body.baseStateRevision, f.revision);
        assertLegacyPhotoRowsPreserved(f.payload, action.body.payload);
        f.payload = structuredClone(action.body.payload); f.revision++;
        const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
        data = { ok: true, operation: { id: action.operationId, ...binding, state: "committed",
          payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
          result: { status: 200, payload: { ok: true, stateRevision: f.revision, list: list() } } };
        f.receipts.set(action.operationId, structuredClone(data));
        if (f.loseAck) { f.dropped = true; f.hideReceipts = true; return route.abort("failed"); }
      } else if (endpoint.startsWith("/bike-packing/list-operations/") && method === "GET") {
        const id = endpoint.split("/").at(-1); f.receiptReads.push(id);
        if (f.hideReceipts) return route.abort("failed");
        data = f.receipts.get(id) || { ok: true, operation: { id, state: "unknown" } };
      } else if (method === "GET") return route.fulfill({ status: 404, headers, json: { ok: false, code: "isolated_not_found" } });
      else throw Error(`Unexpected isolated API write ${method} ${endpoint}`);
      return route.fulfill({ headers, json: data });
    }
    if (url.origin !== legacyPhotoOrigin) return route.fulfill({ status: 404, body: "No external fixture access" });
    const file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    assert.ok(file.startsWith(root + path.sep));
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    try { return route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] || "application/octet-stream" }); }
    catch (error) { if (error.code !== "ENOENT") throw error; return route.fulfill({ status: 404, body: "Not in release bundle" }); }
  });
  await page.goto(legacyPhotoOrigin); await readyLegacyPhotoBrowser(page);
  return f;
}

export async function readyLegacyPhotoBrowser(page) {
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(page.locator(`#layoutSelect option[value="${legacyLayoutId}"]`)).toBeAttached({ timeout: 30000 });
  await expect(page.locator("#layoutSelect")).toHaveValue(legacyLayoutId);
}
