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
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

export const legacyPhotoOrigin = "https://experiment.vniipo-help.ru";
const api = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api";
const canonicalApi = "https://api.vniipo-help.ru/experiment/letters-vniipo/api";
const root = path.resolve(process.env.BIKE_LEGACY_PHOTO_BUNDLE_DIRECTORY || "www/vniipo-help.ru/bike-packing");
export const previousLegacyPhotoBundle = path.resolve(process.env.BIKE_LEGACY_PHOTO_PREVIOUS_BUNDLE_DIRECTORY
  || "../experiment-pending-startup-v1613/www/vniipo-help.ru/bike-packing");
const preparationCapability = "personalListOperationPreparationV1";
export const legacyPhotoBinding = Object.freeze({ actorId: "legacy-photo-user", listId: "legacy-photo-list", scopeKey: "id:legacy-photo-user" });
export const legacyLayoutId = "personal-layout", legacyBagId = "sumka";
export const legacyPendingBagIds = Object.freeze([legacyBagId, "second", "third"]);
const timestamp = "2026-09-14T10:00:00.000Z", prefix = "bike-packing-personal-save-v1:";
const scoped = key => scopedLocalStorageKey(key, legacyPhotoBinding.scopeKey);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

export function legacyPhotoPayload() {
  const bags = Object.fromEntries(["placed-bag", ...legacyPendingBagIds].map(id => [id, {
    id, name: id === legacyBagId ? "Сумка с четырьмя фотографиями" : id === "placed-bag" ? "Размещённая сумка" : `Неразмещённая сумка ${id}`,
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
  return { entries, records: outbox.list().sort((a,b)=>a.action.generation-b.action.generation),
    record: outbox.recover(), pending: outbox.hasPending(), confirmed: outbox.confirmedBase() };
}

export async function nativeLegacyPhotoTransport(page) {
  return page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix + ":"))
    .map(([key, raw]) => ({ key, raw, value: JSON.parse(raw) })), AMBIGUOUS_WRITE_KEY);
}

// Independent synthetic server rule: all registered photos stay on the same
// owner, in the same order, with all old fields exact. No photo mutation route
// is served. Actual SQL/file preservation has separate API acceptance tests.
export function assertLegacyPhotoRowsPreserved(before, after, { routeAliases = false } = {}) {
  const reference = photo => {
    const value = structuredClone(photo);
    if (!routeAliases) return value;
    // Independent synthetic SQL-row rule: only known deployment aliases for
    // THIS list/photo/variant are equivalent. Query, fragment and every other
    // reference field remain exact; this does not authorize changed photos.
    for (const [key, variant] of [["url","file"],["thumbUrl","thumb"]]) {
      const url = new URL(value[key]);
      assert.ok(["https://api.vniipo-help.ru","https://api-eu.vniipo-help.ru",legacyPhotoOrigin].includes(url.origin));
      assert.equal(url.username, ""); assert.equal(url.password, "");
      assert.ok(["",legacyPhotoBinding.listId].includes(photo.listId), "foreign legacy list metadata");
      const suffix = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(legacyPhotoBinding.listId)}/photos/${encodeURIComponent(photo.id)}/${variant}`;
      assert.ok([suffix, "/experiment" + suffix].includes(url.pathname), "foreign list/photo/variant route");
      value[key] = suffix + url.search + url.hash;
    }
    return value;
  };
  const inventory = payload => Object.fromEntries(["items", "containers"].flatMap(collection =>
    Object.entries(payload[collection] || {}).filter(([, owner]) => owner.photos?.length)
      .map(([id, owner]) => [`${collection}/${id}`, owner.photos.map(reference)])));
  assert.deepEqual(inventory(after), inventory(before), "ordinary save changed registered photo owner/order/metadata");
  assert.deepEqual(Object.keys(after.items).sort(), Object.keys(before.items).sort());
  assert.deepEqual(Object.keys(after.containers).sort(), Object.keys(before.containers).sort());
}

export async function seedLegacyPhotoPendingAction(page, ids = [legacyBagId]) {
  const local = await page.evaluate(({ stateKey, metaKey }) => ({ snapshot: JSON.parse(localStorage.getItem(stateKey)),
    meta: JSON.parse(localStorage.getItem(metaKey)), selectedLayoutId: document.querySelector("#layoutSelect").value }),
  { stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY) });
  assert.equal(local.meta.stateRevision, 1582);
  assert.equal(local.selectedLayoutId, legacyLayoutId);
  // Active layout is a display preference omitted by the persisted personal
  // business mirror; bind the simulated old capture to the actual UI choice.
  local.snapshot.activeLayoutId = local.selectedLayoutId;
  const storage = memoryStorage(), outbox = createPersonalSaveOutbox({ storage, ...legacyPhotoBinding });
  let snapshot = local.snapshot;
  const records = [];
  for (const [index, id] of ids.entries()) {
    const prepared = preparePersonalPlacementMutation(snapshot, {
      layoutId: legacyLayoutId, action: "link-root", ids: [id], targetIndex: index + 1, includeContents: true });
    snapshot = prepared.snapshot;
    const payload = await releaseSerializedPayload(snapshot);
    page.legacyPhotoFixture.preserveRows(page.legacyPhotoFixture.initial, payload);
    const body = buildListSaveBody({ serializeState: () => payload, nowIso: () => timestamp,
      syncMeta: { ...local.meta, localUpdatedAt: timestamp }, syncDevice: { id: "legacy-browser-device", name: "Изолированный браузер" } });
    body.userPlacement = personalPlacementIntent(prepared.intent);
    const record = outbox.capture({ snapshot, body, operationId: randomUUID() });
    assert.equal(record.mergeBase, undefined); assert.equal(record.action.body.baseStateRevision, 1582);
    assert.equal(record.action.body.causal.baseOperationId, records.at(-1)?.action.operationId);
    records.push(record);
  }
  const record = records.at(-1);
  assert.deepEqual(createPersonalSaveOutbox({ storage, ...legacyPhotoBinding }).list(), records);
  const entries = [...storage.values];
  await page.evaluate(({ entries, snapshot, meta, stateKey, metaKey, listKey, listId }) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
    localStorage.setItem(stateKey, JSON.stringify(snapshot)); localStorage.setItem(metaKey, JSON.stringify({ ...meta, dirty: true }));
    localStorage.setItem(listKey, listId);
  }, { entries, snapshot, meta: local.meta, stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY),
    listKey: scoped(ACTIVE_LIST_ID_KEY), listId: legacyPhotoBinding.listId });
  return { record, records, entries, snapshot };
}

export async function setupPersonalLegacyPhotoBrowser(page, context, {
  loseAck = false, mixedLegacyRoutes = false, sharedOwnerUpgrade = false
} = {}) {
  const initial = legacyPhotoPayload();
  if (mixedLegacyRoutes) for (const [index, photo] of initial.containers[legacyBagId].photos.entries()) {
    const origin = index % 2 ? legacyPhotoOrigin : "https://api.vniipo-help.ru";
    for (const [key, variant] of [["url","file"],["thumbUrl","thumb"]]) {
      photo[key] = `${origin}/letters-vniipo/api/bike-packing/lists/${legacyPhotoBinding.listId}/photos/${photo.id}/${variant}?source=legacy`;
    }
  }
  // Two old catalog owners already reference the same registered photos. This
  // is source data, not permission to copy a photo to another owner now. The
  // synthetic physical inventory below has only one row per registered ID.
  if (mixedLegacyRoutes) {
    initial.containers[legacyBagId].photos[0].listId = "";
    initial.containers[legacyBagId].photos[1].listId = "";
    initial.containers.second.photos = structuredClone(initial.containers[legacyBagId].photos.slice(0, 2));
  }
  const f = { initial, payload: structuredClone(initial), revision: 1582, calls: [], posts: [], receiptReads: [],
    receipts: new Map(), captured: [], errors: [], loseAck, dropped: false, hideReceipts: false, failWrites: false, freshnessAvailable: true };
  Object.assign(f, { bundleDirectory: sharedOwnerUpgrade ? previousLegacyPhotoBundle : root,
    legacyOwnerDenied: sharedOwnerUpgrade, preparationEnabled: !sharedOwnerUpgrade, ownerAllowed: true,
    preparations: [], waiting: new Map(), preparationSnapshots: [] });
  f.upgradeBundle = () => { f.bundleDirectory = root; f.legacyOwnerDenied = false; };
  f.registeredPhotoRows = new Map(initial.containers[legacyBagId].photos.map(photo => [photo.id,
    { listId:legacyPhotoBinding.listId, entityType:"container", entityId:legacyBagId, reference:structuredClone(photo) }]));
  f.preserveRows = (before, after) => assertLegacyPhotoRowsPreserved(before, after, { routeAliases: mixedLegacyRoutes });
  page.legacyPhotoFixture = f;
  const list = () => ({ id: legacyPhotoBinding.listId, title: "Личные укладки",
    ownerId: f.ownerAllowed ? legacyPhotoBinding.actorId : "different-owner", role: f.ownerAllowed ? "owner" : "editor",
    ...(sharedOwnerUpgrade ? { visibility: "shared", sourceType: "user" } : {}),
    canEdit: true, stateRevision: f.revision, updatedAt: timestamp, payload: structuredClone(f.payload) });
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
        capabilities: [...new Set([...REQUIRED_ADMIN_API_CAPABILITIES, ...EXPERIMENT_RELEASE_CAPABILITIES,
          "personalLegacyPhotoPreservationV1", preparationCapability])].filter(value => f.preparationEnabled || value !== preparationCapability) };
      else if (endpoint === "/auth/me") data = { ok: true, user: { id: legacyPhotoBinding.actorId, email: "legacy-photo@example.test" } };
      else if (endpoint === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (endpoint === "/bike-packing/lists") data = { ok: true, lists: [list()] };
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}` || endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`)
        data = { ok: true, list: list(), state: structuredClone(f.payload), stateRevision: f.revision };
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/freshness`) {
        if (!f.freshnessAvailable) return route.fulfill({ status: 404, headers, json: { ok: false, code: "isolated_freshness_not_available" } });
        data = { ok: true, listId: legacyPhotoBinding.listId, stateRevision: f.revision, serverUpdatedAt: timestamp,
          itemCount: 0, containerCount: Object.keys(f.payload.containers).length, layoutCount: 1 };
      }
      else if (new RegExp(`^/bike-packing/lists/${legacyPhotoBinding.listId}/photos/legacy-photo-[1-4]/(file|thumb)$`).test(endpoint))
        return route.fulfill({ headers, contentType: "image/png", body: png });
      else if (/^\/bike-packing\/list-operations\/[^/]+\/prepare$/.test(endpoint) && method === "POST") {
        const action = request.postDataJSON(); f.preparations.push(structuredClone(action));
        assert.equal(sharedOwnerUpgrade, true, "unexpected preparation outside the upgrade fixture");
        assert.equal(f.preparationEnabled, true, "preparation sent without server capability");
        assert.equal(action.operationId, endpoint.split("/").at(-2));
        assert.deepEqual(action, f.posts[0], "preparation changed the original failed immutable envelope");
        assert.deepEqual(action.body.causal, { dependsOn: [], reads: [] }, "only the original root may be prepared");
        for (const key of ["force", "forceOverwrite", "fullReplace"]) assert.ok(action.body[key] === undefined || action.body[key] === false);
        f.preserveRows(f.payload, action.body.payload);
        if (!f.ownerAllowed) { call.status = 403; call.code = "personal_owner_only";
          return route.fulfill({ status: 403, headers, json: { ok: false, code: call.code } }); }
        assert.equal(action.body.baseStateRevision, f.revision);
        const before = { revision: f.revision, payload: structuredClone(f.payload), photos: structuredClone([...f.registeredPhotoRows]) };
        const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
        const { body, ...identity } = binding;
        data = { ok: true, operation: { id: action.operationId, ...identity, state: "waiting",
          payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") }, result: null,
          waiting: { code: "owner_update_prepared", operationIds: [], retrySameOperation: true } };
        f.waiting.set(action.operationId, structuredClone(data));
        f.preparationSnapshots.push({ before, after: { revision: f.revision, payload: structuredClone(f.payload),
          photos: structuredClone([...f.registeredPhotoRows]) }, native: await nativeLegacyPhotoOutbox(page) });
      } else if (endpoint === "/bike-packing/list-operations" && method === "POST") {
        const action = request.postDataJSON(); f.posts.push(structuredClone(action));
        f.captured.push(await nativeLegacyPhotoOutbox(page));
        assert.equal(action.environment, "bike-packing-experiment"); assert.equal(action.expectedActorId, legacyPhotoBinding.actorId);
        assert.equal(action.listId, legacyPhotoBinding.listId); assert.equal(action.kind, "list.update");
        assert.ok(["link-root", "remove-container"].includes(action.body.userPlacement?.action), "unexpected business intent");
        assert.equal(f.receipts.has(action.operationId), false, "the same immutable action was POSTed twice");
        const parentId = action.body.causal.baseOperationId;
        if (parentId) {
          const parent = f.receipts.get(parentId);
          assert.equal(parent?.operation.state, "committed", "missing committed causal parent");
          assert.equal(parent.result.payload.stateRevision, f.revision, "causal parent is not the current server head");
          assert.ok([parent.operation.body.baseStateRevision, f.revision].includes(action.body.baseStateRevision),
            "neither the immutable chain base nor the newly confirmed numeric base");
          assert.deepEqual(action.body.causal.dependsOn, [{ operationId: parentId, listId: legacyPhotoBinding.listId }]);
        } else assert.equal(action.body.baseStateRevision, f.revision);
        f.preserveRows(f.payload, action.body.payload);
        if (f.legacyOwnerDenied || !f.ownerAllowed) { call.status = 403; call.code = "personal_owner_only";
          return route.fulfill({ status: 403, headers, json: { ok: false, code: call.code } }); }
        if (sharedOwnerUpgrade && !parentId) {
          assert.equal(f.waiting.get(action.operationId)?.operation.state, "waiting", "unknown is not permission to replay");
          assert.ok(f.calls.some(entry => entry.method === "GET" && entry.path === `/bike-packing/list-operations/${action.operationId}`
            && entry.receiptState === "waiting"), "durable waiting was not independently read before replay");
        }
        if (f.failWrites) return route.fulfill({ status: 503, headers, json: { ok: false, code: "isolated_unavailable" } });
        f.payload = structuredClone(action.body.payload);
        if (mixedLegacyRoutes) for (const collection of ["containers","items"]) {
          for (const [id, owner] of Object.entries(f.initial[collection])) if (owner.photos?.length) {
            f.payload[collection][id].photos = structuredClone(owner.photos);
          }
        }
        f.revision++;
        const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
        data = { ok: true, operation: { id: action.operationId, ...binding, state: "committed",
          payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
          result: { status: 200, payload: { ok: true, stateRevision: f.revision, list: list() } } };
        f.receipts.set(action.operationId, structuredClone(data));
        if (f.loseAck) { f.dropped = true; f.hideReceipts = true; return route.abort("failed"); }
      } else if (endpoint.startsWith("/bike-packing/list-operations/") && method === "GET") {
        const id = endpoint.split("/").at(-1); f.receiptReads.push(id);
        if (f.hideReceipts) return route.abort("failed");
        data = f.receipts.get(id) || f.waiting.get(id) || { ok: true, operation: { id, state: "unknown" } };
        call.receiptState = data.operation.state;
      } else if (method === "GET") return route.fulfill({ status: 404, headers, json: { ok: false, code: "isolated_not_found" } });
      else throw Error(`Unexpected isolated API write ${method} ${endpoint}`);
      call.status = 200;
      return route.fulfill({ headers, json: data });
    }
    if (url.origin !== legacyPhotoOrigin) return route.fulfill({ status: 404, body: "No external fixture access" });
    const bundleRoot = path.resolve(f.bundleDirectory);
    const file = path.resolve(bundleRoot, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    assert.ok(file.startsWith(bundleRoot + path.sep));
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
