import { adminTemplatePhotoStageManifest, adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { captureAdminTemplatePhotoOwnerMap } from "../../src/sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";

export const bytesHash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
export async function adminPhotoRecordFixture({ entityType = "item", oldPhotos = true, count = 2 } = {}) {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-shared-layout-selected", itemKey: "shared-layout:selected" };
  const metadata = { title: "Edited template", description: "Preserved description", language: "ru" }, layoutId = "local-editor";
  const rawPhoto = { id: "photo-existing", photoId: "photo-existing", listId: binding.listId, status: "synced",
    fileName: "Original.png", url: "https://example.test/original.png", thumbUrl: "https://example.test/original-thumb.png",
    metadata: { credit: "Original owner", exact: [3, 2, 1] } };
  const type = entityType === "item" ? "items" : "containers", serverId = entityType === "item" ? "server-item" : "server-bag";
  const localId = entityType === "item" ? "local-item" : "local-bag", stateRevision = 7;
  const sourcePayload = { activeLayoutId: "original", locations: [], categories: [],
    items: { "server-item": { id: "server-item", name: "Source item", photos: [] } },
    containers: { "server-bag": { id: "server-bag", name: "Source bag", photos: [] } },
    layouts: { original: { id: "original", rootContainerIds: [], arrangement: { rootContainerIds: [], items: {}, containers: {}, packedItems: {}, itemQuantities: {} } } } };
  if (oldPhotos) sourcePayload[type][serverId].photos = [rawPhoto];
  const state = { activeLayoutId: layoutId, locations: [], categories: [],
    items: { "local-item": { ...structuredClone(sourcePayload.items["server-item"]), id: "local-item", publicCatalogLayoutId: layoutId } },
    containers: { "local-bag": { ...structuredClone(sourcePayload.containers["server-bag"]), id: "local-bag", publicCatalogLayoutId: layoutId } },
    layouts: { [layoutId]: { ...structuredClone(sourcePayload.layouts.original), id: layoutId, name: metadata.title,
      adminSharedSourceId: "selected", adminCausalSource: { version: 1, binding, exists: true, visibility: "private", base: { stateRevision }, planId: null } } } };
  const mappings = { items: { "local-item": "server-item" }, containers: { "local-bag": "server-bag" } };
  for (const owner of [...Object.values(state.items), ...Object.values(state.containers)]) normalizeItemPhotos(owner);
  state.layouts[layoutId].adminCausalSource.photoView = captureAdminTemplatePhotoView({ binding, layoutId, sourcePayload, state, mappings });
  const ownerMap = captureAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, sourcePayload, state, mappings });
  const operationId = crypto.randomUUID(), files = [], assets = [];
  for (let index = 0; index < count; index++) {
    const file = new Blob([`Full image ${index}: exact immutable bytes`], { type: "image/png" });
    const thumb = index % 2 ? null : new Blob([`Thumbnail ${index}: smaller bytes`], { type: "image/png" });
    const fileMetadata = { hash: await bytesHash(await file.arrayBuffer()), size: file.size, type: file.type, fileName: `Original ${index}.png` };
    const thumbMetadata = thumb && { hash: await bytesHash(await thumb.arrayBuffer()), size: thumb.size, type: thumb.type };
    const stage = adminTemplatePhotoStageManifest({ version: 1, ...binding, operationId: crypto.randomUUID(), templateOperationId: operationId,
      baseStateRevision: stateRevision, entityType, entityId: serverId, photoId: `photo-new-${index}`, file: fileMetadata, thumb: thumbMetadata });
    files.push({ stage, file, thumb });
    assets.push({ assetId: stage.operationId, assetDigest: await adminTemplatePhotoStageDigest(stage), entityType, entityId: serverId, photoId: stage.photoId });
    state[type][localId].photos.push({ id: stage.photoId, localId: stage.photoId, status: "pending", url: "", thumbUrl: "",
      fileName: fileMetadata.fileName, type: file.type, size: file.size, width: 600, height: 400,
      createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", error: "" });
  }
  const payload = structuredClone(sourcePayload); payload[type][serverId].name = "Edited with new photos";
  state[type][localId].name = payload[type][serverId].name;
  const action = { operationId, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey,
    body: { version: 1, base: { stateRevision }, payload, metadata, photoAppend: { version: 1, assets } } };
  const snapshot = { version: 1, layoutId, ownerMap, sourcePayload, state, metadata };
  return { binding, action, snapshot, files };
}

// Events, serial transactions and cloned IDB values are modeled here. This
// double verifies store orchestration; the browser suite owns native IDB proof.
export function adminPhotoIndexedDBFixture() {
  const databases = new Map(), controls = { onGet: () => {}, onCommit: () => {}, quota: false, abortWrite: false, failOpen: false };
  const transactions = [], requests = [];
  const indexedDB = { open(name, version) {
    const request = {};
    queueMicrotask(() => {
      if (controls.failOpen) { request.error = Error("IDB unavailable"); request.onerror?.(); return; }
      const fresh = !databases.has(name);
      if (fresh) databases.set(name, { stores: new Map(), tail: Promise.resolve() });
      const saved = databases.get(name);
      const db = { objectStoreNames: { contains: key => saved.stores.has(key) }, close() {},
        createObjectStore(key) { saved.stores.set(key, new Map()); return { createIndex() {} }; },
        transaction(names, mode, options) {
          transactions.push({ name, names: [...names], mode, options });
          let done = false, pending = 0, working, finishTail;
          const previous = saved.tail; saved.tail = new Promise(resolve => { finishTail = resolve; });
          const ready = previous.then(() => { working = new Map(names.map(key => [key, structuredClone(saved.stores.get(key))])); });
          const tx = { abort() {
            if (done) return; done = true;
            queueMicrotask(() => { tx.onabort?.(); finishTail(); });
          }, objectStore(storeName) {
            if (!names.includes(storeName)) throw Error("Store outside transaction");
            const enqueue = (operation, key, value) => {
              const result = {}; pending++;
              requests.push({ mode, storeName, operation, key });
              ready.then(() => queueMicrotask(() => {
                if (done) return;
                try {
                  const rows = working.get(storeName);
                  if (operation === "get") { controls.onGet({ mode, storeName, key }); result.result = structuredClone(rows.get(key)); }
                  if (operation === "keys") { controls.onGet({ mode, storeName, key }); result.result = [...rows].filter(([, row]) => row.bindingKey === key).map(([rowKey]) => rowKey); }
                  if (operation === "add") {
                    if (controls.quota) throw Error("Quota exceeded");
                    if (rows.has(value.key)) throw Error("Constraint violation");
                    rows.set(value.key, structuredClone(value)); result.result = value.key;
                  }
                  result.onsuccess?.();
                } catch (error) { result.error = tx.error = error; result.onerror?.(); tx.onerror?.(); tx.abort(); }
                pending--; complete();
              }));
              return result;
            };
            return { get: key => enqueue("get", key), add: value => enqueue("add", value.key, value),
              index: () => ({ getAllKeys: key => enqueue("keys", key) }) };
          } };
          function complete() {
            if (pending || done) return;
            setImmediate(() => {
              if (pending || done) return;
              if (mode === "readwrite" && controls.abortWrite) { tx.error = Error("Transaction aborted"); tx.abort(); return; }
              done = true;
              if (mode === "readwrite") for (const [storeName, rows] of working) saved.stores.set(storeName, rows);
              controls.onCommit({ mode, names, saved }); tx.oncomplete?.(); finishTail();
            });
          }
          ready.then(complete);
          return tx;
        }
      };
      request.result = db;
      if (fresh) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  } };
  return { indexedDB, controls, requests, transactions, databases,
    rows: (storeName = "actions") => databases.get("bike-packing-admin-template-photo-actions-v1")?.stores.get(storeName) };
}
