import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { expect } from "@playwright/test";
import { readBrowserPersonalMirror, seedBrowserPersonalMirror } from "./personal-mirror-browser-fixture.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { EXPERIMENT_RELEASE_CAPABILITIES } from "../../scripts/experiment-release-profile.mjs";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPlacementMutation, personalPlacementIntent } from "../../src/sync/personal-placement-mutation.js";
import { canonicalListOperationJson, createListOperationQueue } from "../../src/sync/list-operation-queue.js";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { buildListSaveBody } from "../../src/sync/save-body.js";
import { scopedLocalStorageKey } from "../../src/storage/scope.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY, SYNC_META_KEY, ACTIVE_LIST_ID_KEY } from "../../src/config/constants.js";
import { AMBIGUOUS_WRITE_KEY, createExperimentTransport } from "../../src/sync/experiment-transport.js";

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
const defaultBinding = legacyPhotoBinding, defaultLayoutId = legacyLayoutId, defaultBagId = legacyBagId, defaultPendingIds = legacyPendingBagIds;
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
  const storageEntries = await page.evaluate(async prefix => {
    const rows = Object.entries(localStorage).filter(([key]) => key.startsWith(prefix)
      || key.startsWith("bike-packing-personal-ordinary-recovery-v1:"));
    if (!rows.some(([, raw]) => JSON.parse(raw)?.personalJournalReference)) return rows;
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("bike-packing-personal-journal-v1"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try {
      const stored = await new Promise((resolve, reject) => {
        const req = db.transaction("entries").objectStore("entries").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      return rows.map(([key, raw]) => {
        const marker = JSON.parse(raw); if (!marker.personalJournalReference) return [key, raw];
        const body = stored.find(row => row.key === "raw:" + marker.sha256);
        if (!body || body.raw.length !== marker.utf16Length) throw Error("Fixture cannot read journal reference");
        return [key, body.raw];
      });
    } finally { db.close(); }
  }, prefix);
  const entries = storageEntries.filter(([key]) => key.startsWith(prefix));
  const outbox = createPersonalSaveOutbox({ storage: memoryStorage(storageEntries), ...legacyPhotoBinding,
    ordinaryRecoveryEnabled: page.legacyPhotoFixture?.ordinaryRecovery === true });
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
export function assertLegacyPhotoRowsPreserved(before, after, { routeAliases = false, allowUnphotographedEntities = false } = {}) {
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
  if (!allowUnphotographedEntities) {
    assert.deepEqual(Object.keys(after.items).sort(), Object.keys(before.items).sort());
    assert.deepEqual(Object.keys(after.containers).sort(), Object.keys(before.containers).sort());
  }
}

// Construct the same durable native records as an editor that really saw the
// old server base and then lost an unconfirmed request. No receipt is injected.
export async function seedLegacyPhotoRebaseAction(page, { localWeight = 1850 } = {}) {
  const local = await page.evaluate(({ stateKey, metaKey }) => ({ snapshot: JSON.parse(localStorage.getItem(stateKey)),
    meta: JSON.parse(localStorage.getItem(metaKey)) }), { stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY) });
  local.snapshot = JSON.parse(await readBrowserPersonalMirror(page, scoped(STORAGE_KEY)));
  assert.equal(local.meta.stateRevision, 1582);
  local.snapshot.activeLayoutId = legacyLayoutId;
  const storage = memoryStorage(), outbox = createPersonalSaveOutbox({ storage, ...legacyPhotoBinding });
  const base = personalBusinessPayload(await releaseSerializedPayload(local.snapshot));
  outbox.adoptRemoteBaseline({ snapshot: local.snapshot, payload: base, stateRevision: 1582 });
  const snapshot = structuredClone(local.snapshot);
  snapshot.containers["placed-bag"].weight = localWeight;
  const payload = await releaseSerializedPayload(snapshot);
  page.legacyPhotoFixture.preserveRows(base, payload);
  const body = buildListSaveBody({ serializeState: () => payload, nowIso: () => timestamp,
    syncMeta: { ...local.meta, localUpdatedAt: timestamp }, syncDevice: { id: "legacy-browser-device", name: "Изолированный браузер" } });
  const record = outbox.capture({ snapshot, body, operationId: randomUUID() });
  assert.deepEqual(record.mergeBase, { payload: base, stateRevision: 1582 });
  const locks = { request: (_name, callback) => Promise.resolve().then(callback) };
  const transport = createExperimentTransport({ locationLike: new URL(legacyPhotoOrigin), selection: "direct", storage, locks });
  const seededRequests = [];
  const queue = createListOperationQueue({ transport, locks, enabled: true, operationPreparationEnabled: false, legacyPhotoPreservationEnabled: true,
    getContext: () => ({ ...legacyPhotoBinding, environment: "bike-packing-experiment", scope: "personal", generation: record.action.generation }),
    fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname; let result, status = 200;
      if (pathname.endsWith("/auth/me")) result = { user: { id: legacyPhotoBinding.actorId } };
      else if (pathname.endsWith("/capabilities")) result = { capabilities: ["personalListCausalOperationsV1", "personalLegacyPhotoPreservationV1"] };
      else if (pathname.endsWith("/list-operations") && options.method === "POST") {
        seededRequests.push(JSON.parse(options.body)); status = 403; result = { ok: false, code: "personal_owner_only" };
      } else if (pathname.endsWith(`/list-operations/${record.action.operationId}`) && options.method === "GET") {
        result = { ok: true, operation: { id: record.action.operationId, state: "unknown" } };
      } else throw Error(`Unexpected native journal seed ${options.method} ${pathname}`);
      return new Response(JSON.stringify(result), { status });
    } });
  await assert.rejects(queue.run({ path: `/bike-packing/lists/${legacyPhotoBinding.listId}`, method: "PUT",
    operationId: record.action.operationId, body: JSON.stringify(record.action.body) }), error => {
      assert.equal(error.code, "owner-access", `Native old-request seed failed before expected 403: ${error.stack}`);
      assert.equal(error.isPersonalSaveBlocked, true); return true;
    });
  assert.equal(seededRequests.length, 1); assert.equal(transport.writes.length, 1);
  assert.equal(transport.writes[0].confirmed, undefined);
  assert.deepEqual(transport.writes[0].recovery.body, record.action.body);
  const entries = [...storage.values];
  await page.evaluate(({ entries, snapshot, meta, stateKey, metaKey }) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
    localStorage.setItem(metaKey, JSON.stringify({ ...meta, dirty: true }));
  }, { entries, snapshot, meta: local.meta, stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY) });
  await seedBrowserPersonalMirror(page, scoped(STORAGE_KEY), JSON.stringify(snapshot));
  return { record, records: [record], entries, snapshot, seededRequests };
}

export async function seedLegacyPhotoPendingAction(page, ids = [legacyBagId]) {
  const local = await page.evaluate(({ stateKey, metaKey }) => ({ snapshot: JSON.parse(localStorage.getItem(stateKey)),
    meta: JSON.parse(localStorage.getItem(metaKey)), selectedLayoutId: document.querySelector("#layoutSelect").value }),
  { stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY) });
  local.snapshot = JSON.parse(await readBrowserPersonalMirror(page, scoped(STORAGE_KEY)));
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
    localStorage.setItem(metaKey, JSON.stringify({ ...meta, dirty: true }));
    localStorage.setItem(listKey, listId);
  }, { entries, snapshot, meta: local.meta, stateKey: scoped(STORAGE_KEY), metaKey: scoped(SYNC_META_KEY),
    listKey: scoped(ACTIVE_LIST_ID_KEY), listId: legacyPhotoBinding.listId });
  await seedBrowserPersonalMirror(page, scoped(STORAGE_KEY), JSON.stringify(snapshot));
  return { record, records, entries, snapshot };
}

export async function setupPersonalLegacyPhotoBrowser(page, context, {
  loseAck = false, mixedLegacyRoutes = false, sharedOwnerUpgrade = false, ordinaryRecovery = false, ordinaryRebase = false,
  phoneRecovery = null, liveUpdates = false, initialPayload = null, validateBusinessIntent = null
} = {}) {
  const legacyPhotoBinding = phoneRecovery?.binding || defaultBinding, legacyLayoutId = phoneRecovery?.layoutId || defaultLayoutId;
  const legacyBagId = phoneRecovery?.bagId || defaultBagId, legacyPendingBagIds = phoneRecovery?.pendingIds || defaultPendingIds;
  assert.ok(!ordinaryRebase || ordinaryRecovery, "rebase fixture requires ordinary recovery mode");
  const initial = phoneRecovery ? structuredClone(phoneRecovery.payload) : initialPayload ? structuredClone(initialPayload) : legacyPhotoPayload();
  if (phoneRecovery) initial.activeLayoutId = legacyLayoutId;
  if (ordinaryRecovery && !phoneRecovery) {
    for (const bag of Object.values(initial.containers)) bag.weight = 1350;
    initial.layouts[legacyLayoutId].name = "Демо-укладка 2 2";
  }
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
    receipts: new Map(), captured: [], errors: [], browserErrors: [], pageErrors: [], loseAck, dropped: false, hideReceipts: false, failWrites: false, freshnessAvailable: true };
  f.eventWaiters = [];
  f.notifyRemoteChange = () => { for (const resolve of f.eventWaiters.splice(0)) resolve(); };
  Object.assign(f, { bundleDirectory: sharedOwnerUpgrade ? previousLegacyPhotoBundle : root,
    legacyOwnerDenied: sharedOwnerUpgrade, preparationEnabled: !sharedOwnerUpgrade, ownerAllowed: true,
    detailOwnerId: legacyPhotoBinding.actorId,
    preparations: [], waiting: new Map(), preparationSnapshots: [] });
  Object.assign(f, { ordinaryRecovery, ordinaryRebase, cancellations: [], cancellationSnapshots: [], ordinaryOriginals: new Map(),
    noopPosts: [], loseCancellationAck: false, cancellationAckDropped: false, hideCancellationReceipts: false });
  f.upgradeBundle = () => { f.bundleDirectory = root; f.legacyOwnerDenied = false; };
  f.registeredPhotoRows = new Map(initial.containers[legacyBagId].photos.map(photo => [photo.id,
    { listId:legacyPhotoBinding.listId, entityType:"container", entityId:legacyBagId, reference:structuredClone(photo) }]));
  f.preserveRows = (before, after) => assertLegacyPhotoRowsPreserved(before, after, {
    routeAliases: mixedLegacyRoutes, allowUnphotographedEntities: ordinaryRebase });
  f.registerOrdinaryRebase = (original, { conflictingWeight = null } = {}) => {
    assert.equal(ordinaryRebase, true); assert.equal(f.revision, 1582); assert.equal(f.posts.length, 0);
    const record = original.record;
    assert.equal(record.mergeBase.stateRevision, 1582); assert.equal(record.action.body.baseStateRevision, 1582);
    f.preserveRows(record.mergeBase.payload, f.initial);
    f.ordinaryOriginals.set(record.action.operationId, { expectedActorId: legacyPhotoBinding.actorId,
      environment: "bike-packing-experiment", operationId: record.action.operationId, listId: record.action.listId,
      kind: record.action.kind, body: structuredClone(record.action.body) });
    let remote = structuredClone(f.initial);
    remote.containers["server-new-bag"] = { ...structuredClone(remote.containers.third), id: "server-new-bag",
      name: "Новая сумка с другого устройства", weight: 750, photos: [] };
    remote = preparePersonalPlacementMutation(remote, { layoutId: legacyLayoutId, action: "link-root",
      ids: ["server-new-bag"], targetIndex: 1, includeContents: true }).snapshot;
    if (conflictingWeight !== null) remote.containers["placed-bag"].weight = conflictingWeight;
    f.preserveRows(f.initial, remote); f.payload = remote; f.revision = 1585;
    // Independent expected result, never call the production rebase planner in
    // the synthetic server. A conflict requires an explicit test/UI choice.
    f.rebaseExpected = conflictingWeight === null ? personalBusinessPayload(remote) : null;
    if (f.rebaseExpected) f.rebaseExpected.containers["placed-bag"].weight = record.action.body.payload.containers["placed-bag"].weight;
    f.selectRebaseWeight = weight => { f.rebaseExpected = personalBusinessPayload(remote); f.rebaseExpected.containers["placed-bag"].weight = weight; };
    return structuredClone(remote);
  };
  f.registerOrdinaryRecovery = original => {
    assert.equal(ordinaryRecovery, true); assert.equal(f.revision, 1582); assert.equal(f.posts.length, 0);
    for (const record of original.records) {
      assert.equal(record.mergeBase, undefined); assert.equal(record.action.body.baseStateRevision, 1582);
      f.ordinaryOriginals.set(record.action.operationId, { expectedActorId: legacyPhotoBinding.actorId,
        environment: "bike-packing-experiment", operationId: record.action.operationId, listId: record.action.listId,
        kind: record.action.kind, body: structuredClone(record.action.body) });
    }
    let remote = structuredClone(f.initial);
    for (const [index, id] of legacyPendingBagIds.entries()) {
      remote = preparePersonalPlacementMutation(remote, {
        layoutId: legacyLayoutId, action: "link-root", ids: [id], targetIndex: index + 1, includeContents: true }).snapshot;
    }
    f.preserveRows(f.initial, remote);
    // This is a synthetic different-device server advance, never a receipt for
    // the phone's retained UUIDs. Real SQL cancellation is tested separately.
    f.payload = remote; f.revision = 1585;
    return structuredClone(remote);
  };
  page.legacyPhotoFixture = f;
  // GET metadata and permission at the later mutation lock are independent:
  // an owner read does not promise that /prepare will still authorize writing.
  const list = () => ({ id: legacyPhotoBinding.listId, title: "Личные укладки",
    ownerId: f.detailOwnerId, role: f.detailOwnerId === legacyPhotoBinding.actorId ? "owner" : "editor",
    visibility: sharedOwnerUpgrade || ordinaryRecovery ? "shared" : "private", sourceType: "user",
    canEdit: true, stateRevision: f.revision, updatedAt: timestamp, payload: structuredClone(f.payload) });
  const stateResponse = () => {
    // Match handleBikePackingListStateGet/mapAssembledStateRecord: /state has
    // a top-level listId, but neither its envelope nor record owns id/ownerId.
    // Only the separate detail response can authenticate the list owner.
    const payload = structuredClone(f.payload);
    // The API hashes/counts normalizePayload(state), including default fields
    // omitted from an ordinary business CAS. Keep that calculation separate
    // from the stored fixture payload and the immutable client's body.
    const normalized = { locations: [], categories: [], containers: [], items: [], layouts: [], activeLayoutId: "", packedItems: {}, ...payload };
    for (const key of ["locations", "categories", "containers", "items", "layouts"]) {
      if (!normalized[key] || typeof normalized[key] !== "object") normalized[key] = [];
    }
    if (!normalized.packedItems || typeof normalized.packedItems !== "object" || Array.isArray(normalized.packedItems)) normalized.packedItems = {};
    const hash = value => createHash("sha256").update(canonicalListOperationJson(value)).digest("hex");
    const record = { payload, payloadHash: hash(normalized),
      entityHash: hash({ items: payload.items, containers: payload.containers, layouts: payload.layouts }),
      stateRevision: f.revision, itemCount: Object.keys(payload.items).length,
      containerCount: Object.keys(payload.containers).length, layoutCount: Object.keys(payload.layouts).length,
      payloadSize: Buffer.byteLength(JSON.stringify(normalized), "utf8"), updatedAt: timestamp };
    return { ok: true, listId: legacyPhotoBinding.listId, updatedAt: timestamp, serverUpdatedAt: timestamp,
      stateRevision: record.stateRevision, state: structuredClone(payload), payload, record,
      payloadHash: record.payloadHash, entityHash: record.entityHash, itemCount: record.itemCount,
      containerCount: record.containerCount, layoutCount: record.layoutCount };
  };
  const headers = { "Access-Control-Allow-Origin": legacyPhotoOrigin, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate",
    "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" };
  // WebKit's protocol can report a native failed-load diagnostic as pageerror
  // even when the fetch rejection is caught. Preserve that complete channel;
  // uncaught application failures come from the browser's actual DOM events.
  page.on("pageerror", error => f.pageErrors.push({ name: error.name, message: error.message, stack: error.stack }));
  await page.exposeBinding("__legacyPhotoReportBrowserError", (_source, event) => {
    assert.ok(["error", "unhandledrejection"].includes(event.type));
    assert.equal(typeof event.message, "string");
    f.browserErrors.push(event); f.errors.push(event.message);
  });
  await page.addInitScript(() => {
    const deliveries = new Set();
    let deliveryFailure = null;
    const report = event => {
      const delivery = window.__legacyPhotoReportBrowserError(event);
      deliveries.add(delivery);
      delivery.then(() => deliveries.delete(delivery), error => {
        deliveries.delete(delivery); deliveryFailure = String(error);
      });
    };
    window.addEventListener("error", event => {
      // A resource-load Event has no JavaScript exception. Do not prevent any
      // default handling; native diagnostics remain in the pageErrors channel.
      if (!(event instanceof ErrorEvent)) return;
      report({ type: "error", message: event.message, name: event.error?.name || "Error",
        stack: event.error?.stack || "", filename: event.filename, line: event.lineno, column: event.colno });
    });
    window.addEventListener("unhandledrejection", event => {
      const reason = event.reason;
      report({ type: "unhandledrejection", message: String(reason?.message ?? reason),
        name: reason?.name || "", stack: reason?.stack || "" });
    });
    // Read-only test observer bookkeeping, never an application/state hook.
    // A failed delivery must fail an explicit flush, not silently drop errors.
    window.__legacyPhotoFlushBrowserErrors = async () => {
      while (deliveries.size) await Promise.allSettled([...deliveries]);
      if (deliveryFailure !== null) throw Error(`Browser error observer delivery failed: ${deliveryFailure}`);
    };
  });
  f.flushErrors = () => page.evaluate(() => window.__legacyPhotoFlushBrowserErrors());
  await context.addInitScript(() => {
    localStorage.setItem("bike-packing-language-v1", "ru");
    sessionStorage.setItem("bike-packing-experiment-transport-v1", "eu");
  });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.href.startsWith(api + "/")) {
      if (f.apiOffline) return route.abort("internetdisconnected");
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const endpoint = url.pathname.split("/letters-vniipo/api")[1];
      const call = { method, path: endpoint, body: request.postDataJSON(), revision: f.revision };
      f.calls.push(call);
      let data;
      if (endpoint === "/bike-packing/capabilities") data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...new Set([...REQUIRED_ADMIN_API_CAPABILITIES, ...EXPERIMENT_RELEASE_CAPABILITIES,
          "personalLegacyPhotoPreservationV1", preparationCapability, ...(liveUpdates ? ["listLiveUpdatesV1"] : [])])].filter(value => f.preparationEnabled || value !== preparationCapability) };
      else if (liveUpdates && endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/events`) {
        await new Promise(resolve => f.eventWaiters.push(resolve));
        return route.fulfill({ headers, contentType: "text/event-stream", body: "event: changed\ndata: {}\n\n" });
      }
      else if (endpoint === "/auth/me") data = { ok: true, user: { id: legacyPhotoBinding.actorId, email: "legacy-photo@example.test" } };
      else if (endpoint === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (endpoint === "/bike-packing/lists") data = { ok: true, lists: [list()] };
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}`) {
        data = { ok: true, list: list() };
        call.response = { type: "detail", id: data.list.id, ownerId: data.list.ownerId, stateRevision: data.list.stateRevision };
      }
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`) {
        data = stateResponse();
        call.response = { type: "state", keys: Object.keys(data), recordKeys: Object.keys(data.record),
          listId: data.listId, stateRevision: data.stateRevision };
        // A synthetic concurrent server change occurs after S was assembled,
        // before the following detail read. Never modify the received S bytes.
        f.afterStateRead?.();
      }
      else if (endpoint === `/bike-packing/lists/${legacyPhotoBinding.listId}/freshness`) {
        if (!f.freshnessAvailable) return route.fulfill({ status: 404, headers, json: { ok: false, code: "isolated_freshness_not_available" } });
        data = { ok: true, listId: legacyPhotoBinding.listId, stateRevision: f.revision, serverUpdatedAt: timestamp,
          itemCount: 0, containerCount: Object.keys(f.payload.containers).length, layoutCount: 1 };
      }
      else if (new RegExp(`^/bike-packing/lists/${legacyPhotoBinding.listId}/photos/legacy-photo-[1-4]/(file|thumb)$`).test(endpoint)
        || phoneRecovery && method === "GET" && Object.values({ ...initial.items, ...initial.containers }).some(owner => (owner.photos || [])
          .some(photo => [photo.url, photo.thumbUrl].some(value => value && new URL(value).pathname.endsWith(endpoint)))))
        return route.fulfill({ headers, contentType: "image/png", body: png });
      else if (/^\/bike-packing\/list-operations\/[^/]+\/prepare$/.test(endpoint) && method === "POST") {
        const action = request.postDataJSON(); f.preparations.push(structuredClone(action));
        if (ordinaryRecovery) {
          assert.deepEqual(action, f.ordinaryOriginals.get(action.operationId), "preparation changed the retained phone intent");
          assert.equal(action.operationId, endpoint.split("/").at(-2));
          if (!f.ownerAllowed) return route.fulfill({ status: 403, headers, json: { ok: false, code: "personal_owner_only" } });
          if (f.receipts.has(action.operationId)) return route.fulfill({ headers, json: f.receipts.get(action.operationId) });
          assert.ok(Number.isSafeInteger(action.body.baseStateRevision) && action.body.baseStateRevision > 0
            && action.body.baseStateRevision < f.revision);
          assert.deepEqual(action.body.causal, { dependsOn: [], reads: [] });
          const before = { payload: structuredClone(f.payload), revision: f.revision, photos: structuredClone([...f.registeredPhotoRows]) };
          const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
          const { body, ...identity } = binding;
          data = { ok: true, operation: { id: action.operationId, ...identity, state: "rejected",
            payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
            result: { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: f.revision } } };
          f.receipts.set(action.operationId, structuredClone(data));
          f.preparationSnapshots.push({ before, after: { payload: structuredClone(f.payload), revision: f.revision,
            photos: structuredClone([...f.registeredPhotoRows]) } });
          call.status = 200; return route.fulfill({ headers, json: data });
        }
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
      } else if (/^\/bike-packing\/list-operations\/[^/]+\/cancel$/.test(endpoint) && method === "POST" && ordinaryRecovery) {
        const action = request.postDataJSON(); f.cancellations.push(structuredClone(action));
        assert.equal(action.operationId, endpoint.split("/").at(-2));
        assert.deepEqual(action, f.ordinaryOriginals.get(action.operationId), "cancellation must bind the exact old UUID/body");
        if (!f.ownerAllowed) { call.status = 403; call.code = "personal_owner_only";
          return route.fulfill({ status: 403, headers, json: { ok: false, code: call.code } }); }
        const before = { payload: structuredClone(f.payload), revision: f.revision, photos: structuredClone([...f.registeredPhotoRows]) };
        const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
        const { body, ...identity } = binding;
        data = f.receipts.get(action.operationId) || { ok: true, operation: { id: action.operationId, ...identity, state: "rejected",
          payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
          result: { status: 409, payload: { ok: false, code: "operation_cancelled", stateRevision: f.revision,
            cancellation: { version: 1, operationId: action.operationId, noBusinessEffects: true, operationCannotApply: true } } } };
        f.receipts.set(action.operationId, structuredClone(data));
        f.cancellationSnapshots.push({ before, after: { payload: structuredClone(f.payload), revision: f.revision,
          photos: structuredClone([...f.registeredPhotoRows]) } });
        if (f.loseCancellationAck) {
          f.loseCancellationAck = false; f.cancellationAckDropped = true; f.hideCancellationReceipts = true;
          return route.abort("failed");
        }
      } else if (endpoint === "/bike-packing/list-operations" && method === "POST") {
        const action = request.postDataJSON(); f.posts.push(structuredClone(action));
        f.captured.push(await nativeLegacyPhotoOutbox(page));
        assert.equal(action.environment, "bike-packing-experiment"); assert.equal(action.expectedActorId, legacyPhotoBinding.actorId);
        assert.equal(action.listId, legacyPhotoBinding.listId);
        assert.ok(["list.update", "item.rename"].includes(action.kind));
        const compactRename = action.kind === "item.rename";
        let nextPayload = action.body.payload;
        if (compactRename) {
          // Independent synthetic endpoint contract, intentionally not the
          // application's validator/projector: only this item's name and form
          // metadata may change, with an exact current-name precondition.
          assert.ok(Buffer.byteLength(JSON.stringify(action.body), "utf8") <= 4096);
          assert.equal(action.body.version, 1);
          assert.ok(Object.keys(action.body).every(key => ["version", "itemId", "expectedName", "name", "baseStateRevision", "causal",
            "clientDeviceId", "clientDeviceName", "clientUpdatedAt", "changeGroupId", "affectedLayoutIds", "changeScope", "itemMeta"].includes(key)));
          assert.equal(Object.hasOwn(action.body, "payload"), false);
          assert.match(action.body.itemId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
          assert.ok(!["__proto__", "prototype", "constructor"].includes(action.body.itemId));
          assert.ok(Number.isSafeInteger(action.body.baseStateRevision) && action.body.baseStateRevision > 0);
          assert.equal(typeof action.body.expectedName, "string");
          assert.ok(action.body.expectedName.length <= 255);
          const item = f.payload.items[action.body.itemId];
          assert.ok(item && item.id === action.body.itemId);
          assert.equal(action.body.expectedName, item.name);
          assert.equal(typeof action.body.name, "string");
          assert.ok(action.body.name.length > 0 && action.body.name.length <= 255);
          assert.equal(action.body.name.trim(), action.body.name);
          nextPayload = structuredClone(f.payload);
          nextPayload.items[action.body.itemId].name = action.body.name;
          if (action.body.itemMeta) {
            assert.deepEqual(Object.keys(action.body.itemMeta).sort(), ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]);
            for (const value of Object.values(action.body.itemMeta)) assert.ok(typeof value === "string" && value.length <= 255);
            assert.match(action.body.itemMeta.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
            assert.ok(Number.isFinite(Date.parse(action.body.itemMeta.updatedAt)));
            Object.assign(nextPayload.items[action.body.itemId], action.body.itemMeta);
          }
        }
        const recoveryRebase = ordinaryRebase && !action.body.userPlacement;
        const recoveryNoop = ordinaryRecovery && !ordinaryRebase && !action.body.userPlacement;
        if (ordinaryRecovery) assert.equal(f.ordinaryOriginals.has(action.operationId), false, "original phone action must never be executed by recovery");
        if (recoveryRebase) {
          assert.equal(f.noopPosts.length, 0, "only one new rebase CAS is allowed");
          assert.ok(f.rebaseExpected, "conflicting fields need an explicit choice");
          for (const id of f.ordinaryOriginals.keys()) {
            assert.equal(f.receipts.get(id)?.result?.payload?.code, "stale_state_revision");
            assert.ok(f.calls.some(entry => entry.method === "GET" && entry.path === `/bike-packing/list-operations/${id}`
              && entry.receiptState === "rejected"), "original stale rejection must be read independently before rebase");
          }
          assert.deepEqual(action.body.payload, f.rebaseExpected, "rebase must preserve all remote additions, selected local fields and exact raw remote photos");
          assert.equal(action.body.baseStateRevision, f.revision);
          assert.deepEqual(action.body.causal, { dependsOn: [], reads: [] });
          for (const key of ["force", "forceOverwrite", "fullReplace"]) assert.equal(action.body[key], false);
          for (const key of ["userDeletion", "userPlacement", "archiveImport", "photoResults"]) assert.equal(Object.hasOwn(action.body, key), false);
          f.noopPosts.push(structuredClone(action));
        } else if (recoveryNoop) {
          assert.equal(f.noopPosts.length, 0, "only one new server-choice CAS is allowed");
          assert.ok(f.ordinaryOriginals.size > 0);
          assert.ok(Object.keys(action.body).every(key => ["payload", "baseStateRevision", "stateRevision", "baseServerUpdatedAt",
            "force", "forceOverwrite", "fullReplace", "causal"].includes(key)), "server choice contains an unexpected mutation directive");
          for (const id of f.ordinaryOriginals.keys()) {
            assert.ok(["operation_cancelled", "stale_state_revision"].includes(f.receipts.get(id)?.result?.payload?.code), "every retained old UUID must be fenced");
            assert.ok(f.calls.some(entry => entry.method === "GET" && entry.path === `/bike-packing/list-operations/${id}`
              && entry.receiptState === "rejected"), "terminal cancellation must be read independently before adoption");
          }
          assert.deepEqual(action.body.payload, personalBusinessPayload(f.payload), "new choice must preserve the entire current raw business payload");
          assert.equal(action.body.baseStateRevision, f.revision);
          assert.deepEqual(action.body.causal, { dependsOn: [], reads: [] });
          for (const key of ["force", "forceOverwrite", "fullReplace"]) assert.ok(action.body[key] === undefined || action.body[key] === false);
          f.noopPosts.push(structuredClone(action));
        } else if (validateBusinessIntent) {
          validateBusinessIntent(action.body);
        } else if (!compactRename) {
          assert.ok(["link-root", "remove-container"].includes(action.body.userPlacement?.action), "unexpected business intent");
          if (ordinaryRecovery) assert.equal(f.noopPosts.length, 1, "ordinary editing cannot resume before the server-choice CAS");
        }
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
        f.preserveRows(f.payload, nextPayload);
        if (f.legacyOwnerDenied || !f.ownerAllowed) { call.status = 403; call.code = "personal_owner_only";
          return route.fulfill({ status: 403, headers, json: { ok: false, code: call.code } }); }
        if (sharedOwnerUpgrade && !parentId) {
          assert.equal(f.waiting.get(action.operationId)?.operation.state, "waiting", "unknown is not permission to replay");
          assert.ok(f.calls.some(entry => entry.method === "GET" && entry.path === `/bike-packing/list-operations/${action.operationId}`
            && entry.receiptState === "waiting"), "durable waiting was not independently read before replay");
        }
        if (f.failWrites) return route.fulfill({ status: 503, headers, json: { ok: false, code: "isolated_unavailable" } });
        f.payload = structuredClone(nextPayload);
        if (mixedLegacyRoutes) for (const collection of ["containers","items"]) {
          for (const [id, owner] of Object.entries(f.initial[collection])) if (owner.photos?.length) {
            f.payload[collection][id].photos = structuredClone(owner.photos);
          }
        }
        f.revision++;
        const binding = { environment: action.environment, actorId: action.expectedActorId, listId: action.listId, kind: action.kind, body: action.body };
        data = { ok: true, operation: { id: action.operationId, ...binding, state: "committed",
          payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
          result: { status: 200, payload: { ok: true, stateRevision: f.revision, list: list(),
            ...(compactRename ? { rename: { version: 1, itemId: action.body.itemId, previousName: action.body.expectedName,
              name: action.body.name, ...(action.body.itemMeta ? { itemMeta: structuredClone(action.body.itemMeta) } : {}) },
              upserted: [action.body.itemId], conflicts: [], skipped: [], deleted: [] } : {}) } } };
        f.receipts.set(action.operationId, structuredClone(data));
        await f.afterCommit?.(structuredClone(action));
        if (f.loseAck) { f.dropped = true; f.hideReceipts = true; return route.abort("failed"); }
      } else if (endpoint.startsWith("/bike-packing/list-operations/") && method === "GET") {
        const id = endpoint.split("/").at(-1); f.receiptReads.push(id);
        if (f.hideReceipts) return route.abort("failed");
        if (ordinaryRecovery && f.hideCancellationReceipts && f.ordinaryOriginals.has(id)) return route.abort("failed");
        if (ordinaryRecovery && !f.ownerAllowed && f.receipts.has(id)) return route.fulfill({ status: 403, headers, json: { ok: false, code: "personal_owner_only" } });
        data = f.receipts.get(id) || f.waiting.get(id) || { ok: true, operation: { id, state: "unknown" } };
        call.receiptState = data.operation.state;
      } else if (method === "GET") return route.fulfill({ status: 404, headers, json: { ok: false, code: "isolated_not_found" } });
      else throw Error(`Unexpected isolated API write ${method} ${endpoint}`);
      call.status = 200;
      return route.fulfill({ headers, json: data });
    }
    if (url.origin !== legacyPhotoOrigin) {
      // Optional shared gallery bootstrap is unavailable in this isolated
      // release fixture, matching the pre-existing browser fixture contract.
      if (method === "GET" && url.origin === "https://vniipo-help.ru" && url.pathname === "/shared-ui/photo-gallery/stable.js") {
        assert.deepEqual([...url.searchParams.keys()], ["contract", "window", "bundled"]);
        assert.equal(url.searchParams.get("contract"), "2"); assert.match(url.searchParams.get("window"), /^\d+$/);
        assert.equal(url.hash, "");
        return route.fulfill({ status: 404, body: "Optional shared gallery is not served by the isolated fixture" });
      }
      if (method === "GET" && url.origin === "https://vniipo-help.ru" && url.pathname === "/shared-ui/input-layout/stable.js") {
        assert.deepEqual([...url.searchParams.keys()], ["contract", "window"]);
        assert.equal(url.searchParams.get("contract"), "1"); assert.match(url.searchParams.get("window"), /^\d+$/);
        assert.equal(url.hash, "");
        return route.fulfill({ status: 404, body: "Optional shared input layout is not served by the isolated fixture" });
      }
      if (ordinaryRecovery) {
        const knownPhotos = Object.values({ ...f.initial.items, ...f.initial.containers }).flatMap(owner => (owner.photos || []).flatMap(photo => [photo.url, photo.thumbUrl]));
        assert.ok(method === "GET" && knownPhotos.some(value => value === url.href), `Unexpected external fixture request ${method} ${url.origin}${url.pathname}`);
        return route.fulfill({ contentType: "image/png", body: png });
      }
      return route.fulfill({ status: 404, body: "No external fixture access" });
    }
    const bundleRoot = path.resolve(f.bundleDirectory);
    const file = path.resolve(bundleRoot, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    assert.ok(file.startsWith(bundleRoot + path.sep));
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
    try { return route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] || "application/octet-stream" }); }
    catch (error) { if (error.code !== "ENOENT") throw error; return route.fulfill({ status: 404, body: "Not in release bundle" }); }
  });
  if (phoneRecovery) {
    const outbox = createPersonalSaveOutbox({ storage: memoryStorage(phoneRecovery.entries.map(row => [row.key, row.value])), ...legacyPhotoBinding });
    f.registerOrdinaryRecovery({ records: outbox.list(), record: outbox.recover() });
    await page.addInitScript(({ entries, snapshot, binding, keys }) => {
      if (location.hostname !== "experiment.vniipo-help.ru") return;
      const nativeSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, raw) {
        if (this === localStorage) {
          let bytes = 2 * (String(key).length + String(raw).length);
          for (let i = 0; i < this.length; i++) { const other = this.key(i); if (other !== key) bytes += 2 * (other.length + this.getItem(other).length); }
          if (bytes > 5 * 1024 * 1024) {
            (window.__phoneQuotaFailures ||= []).push({ bytes, completion: String(key).includes(":complete:"), archive: String(key).includes(":archive:") });
            throw new DOMException("Fixture localStorage quota", "QuotaExceededError");
          }
        }
        return nativeSet.call(this, key, raw);
      };
      if (sessionStorage.getItem("phone-mirror-seeded")) return;
      sessionStorage.setItem("phone-mirror-seeded", "1");
      for (const row of entries) localStorage.setItem(row.key, row.value);
      for (const key of keys.mirrors) localStorage.setItem(`${key}::${binding.scopeKey}`, JSON.stringify(snapshot));
      localStorage.setItem(`${keys.meta}::${binding.scopeKey}`, JSON.stringify({ stateRevision: 1582, dirty: true,
        listId: binding.listId, accountId: binding.actorId, accountKey: binding.scopeKey }));
      localStorage.setItem(`${keys.list}::${binding.scopeKey}`, binding.listId);
      const total = Object.entries(localStorage).reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0);
      const padding = Math.max(0, Math.floor((3.79 * 1024 * 1024 - total) / 2) - 32);
      localStorage.setItem("phone-unrelated-fixture-data", "x".repeat(padding));
      window.__phoneSeedBytes = Object.entries(localStorage).reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0);
    }, { entries: phoneRecovery.entries, snapshot: phoneRecovery.snapshot, binding: legacyPhotoBinding,
      keys: { mirrors: [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY], meta: SYNC_META_KEY, list: ACTIVE_LIST_ID_KEY } });
  }
  await page.goto(legacyPhotoOrigin);
  if (phoneRecovery) await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  else await readyLegacyPhotoBrowser(page);
  return f;
}

export async function readyLegacyPhotoBrowser(page) {
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(page.locator(`#layoutSelect option[value="${legacyLayoutId}"]`)).toBeAttached({ timeout: 30000 });
  await expect(page.locator("#layoutSelect")).toHaveValue(legacyLayoutId);
}
