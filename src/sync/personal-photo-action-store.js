import { assertListOperationPayload } from "./list-operation-payload.js";

export const PERSONAL_PHOTO_ACTIONS_ENABLED = false;
const environment = "bike-packing-experiment", databaseName = "bike-packing-personal-photo-actions-v1";
const uuid = id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191 && value === value.trim()
  && !["constructor", "prototype", "__proto__"].includes(value);
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
const clone = value => JSON.parse(JSON.stringify(value));
const blocked = (code, cause) => Object.assign(new Error("Фото не подтверждено в локальном журнале. Отправка остановлена; исходные данные нужно сохранить."),
  { code, cause, isPersonalPhotoStorageBlocked: true });
const sameBytes = (a, b) => {
  if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer) || a.byteLength !== b.byteLength) return false;
  const right = new Uint8Array(b); return new Uint8Array(a).every((value, index) => value === right[index]);
};

// Separate from the evictable thumbnail/offline cache. No delete, overwrite or
// expiry API: an unfinished user action owns both its immutable intent and bytes.
export function createPersonalPhotoActionStore({ actorId, listId, scopeKey, environmentId = environment,
  indexedDB = globalThis.indexedDB, getContext, enabled = PERSONAL_PHOTO_ACTIONS_ENABLED } = {}) {
  if (!id(actorId) || actorId.length > 36 || !id(listId) || scopeKey !== `id:${actorId}` || environmentId !== environment) throw blocked("scope");
  const binding = Object.freeze({ environment, actorId, listId, scopeKey }), bindingKey = JSON.stringify(binding);
  const key = operationId => JSON.stringify([bindingKey, operationId]);
  const assertContext = initial => {
    const current = getContext?.();
    if (!current || current.scope !== "personal" || !initial?.generation || current.generation !== initial.generation
      || Object.keys(binding).some(name => current[name] !== binding[name])) throw blocked("context-changed");
  };
  const open = () => new Promise((resolve, reject) => {
    if (!indexedDB) { reject(blocked("storage-unavailable")); return; }
    let abandoned = false;
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("actions")) {
        const store = db.createObjectStore("actions", { keyPath: "key" });
        store.createIndex("binding", "bindingKey", { unique: false });
      }
      if (!db.objectStoreNames.contains("stage-dispatches")) db.createObjectStore("stage-dispatches", { keyPath: "key" });
    };
    request.onerror = () => reject(blocked("open", request.error));
    request.onblocked = () => { abandoned = true; reject(blocked("open-blocked")); };
    request.onsuccess = () => {
      const db = request.result; db.onversionchange = () => db.close();
      if (abandoned) db.close(); else resolve(db);
    };
  });
  const transaction = async (mode, run, stores = ["actions"]) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx, result, error;
      try { tx = db.transaction(stores, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch (cause) { db.close(); reject(blocked("transaction", cause)); return; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(error || blocked("transaction-aborted", tx.error)); };
      tx.onerror = () => { error ||= blocked("transaction-failed", tx.error); };
      const abort = cause => { error = cause; try { tx.abort(); } catch { db.close(); reject(cause); } };
      try { run(tx.objectStore("actions"), value => { result = value; }, abort, tx); }
      catch (cause) { abort(blocked("transaction-failed", cause)); }
    });
  };
  const decode = async (record, operationId) => {
    if (!record) return null;
    if (record.key !== key(operationId) || record.bindingKey !== bindingKey || record.version !== 1) throw blocked("corrupt-record");
    if (await sha(new TextEncoder().encode(record.intentJson)) !== record.intentHash) throw blocked("corrupt-intent");
    const intent = JSON.parse(record.intentJson);
    if (intent.action?.operationId !== operationId || JSON.stringify(intent.binding) !== bindingKey) throw blocked("corrupt-intent");
    for (const [name, expected] of [["file", intent.file], ["thumb", intent.thumb]]) {
      if (!expected) { if (record[name] !== null) throw blocked("corrupt-bytes"); continue; }
      if (!(record[name] instanceof ArrayBuffer) || record[name].byteLength !== expected.size || await sha(record[name]) !== expected.hash) throw blocked("missing-or-corrupt-bytes");
    }
    return { ...intent, intentHash: record.intentHash, file: new Blob([record.file], { type: intent.file.type }),
      thumb: intent.thumb ? new Blob([record.thumb], { type: intent.thumb.type }) : null,
      fileMetadata: intent.file, thumbMetadata: intent.thumb };
  };
  return {
    binding,
    async capture({ action, stage, snapshot, file, thumb = null }) {
      // Freeze metadata and desired state before hash preparation yields to UI.
      const frozen = clone({ binding, action, stage: { ...stage, fileName: stage?.fileName || file?.name || "photo" }, snapshot });
      const initial = { ...getContext?.() };
      try {
        if (!enabled) throw blocked("disabled");
        assertContext(initial);
        const body = frozen.action?.body, source = frozen.stage, operationId = frozen.action?.operationId;
        const owner = frozen.snapshot?.[source.entityType === "item" ? "items" : "containers"]?.[source.entityId];
        if (!uuid(operationId) || !uuid(source.operationId) || operationId === source.operationId
          || frozen.action.kind !== "photos.mutate" || frozen.action.listId !== listId || body?.version !== 1 || body.action !== "attach"
          || body.assetId !== source.operationId || !["item", "container"].includes(source.entityType)
          || body.entityType !== source.entityType || !id(source.entityId) || body.entityId !== source.entityId
          || !id(source.photoId) || body.photoId !== source.photoId || !owner || owner.id !== source.entityId
          || typeof source.fileName !== "string" || !source.fileName || source.fileName.length > 255
          || !Number.isSafeInteger(body.baseEntityRevision) || body.baseEntityRevision < 1
          || !Array.isArray(body.expectedPhotoIds) || body.expectedPhotoIds.some(photoId => !id(photoId) || photoId === source.photoId)
          || new Set(body.expectedPhotoIds).size !== body.expectedPhotoIds.length
          || !Number.isSafeInteger(body.index) || body.index < 0 || body.index > body.expectedPhotoIds.length
          || body.force || body.forceOverwrite || body.payload !== undefined
          || !Array.isArray(owner.photos) || owner.photos.filter(photo => photo.id === source.photoId).length !== 1) throw blocked("invalid-intent");
        if (new TextEncoder().encode(JSON.stringify(frozen.snapshot)).byteLength > 2 * 1024 * 1024) throw blocked("snapshot-too-large");
        assertListOperationPayload({ environment, actorId, ...frozen.action });
        const materialize = async blob => {
          if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > 10 * 1024 * 1024
            || !["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(blob.type)) throw blocked("invalid-file");
          const bytes = await blob.arrayBuffer(); return { bytes, metadata: { size: bytes.byteLength, type: blob.type, hash: await sha(bytes) } };
        };
        const full = await materialize(file), small = thumb ? await materialize(thumb) : null;
        const intentJson = JSON.stringify({ ...frozen, file: full.metadata, thumb: small?.metadata || null });
        const intentHash = await sha(new TextEncoder().encode(intentJson));
        assertContext(initial);
        const record = { version: 1, key: key(operationId), bindingKey, intentJson, intentHash, file: full.bytes, thumb: small?.bytes || null };
        await transaction("readwrite", (store, finish, abort) => {
          assertContext(initial);
          const lookup = store.get(record.key);
          lookup.onsuccess = () => {
            try {
              assertContext(initial);
              if (lookup.result) {
                const old = lookup.result;
                if (old.intentJson !== intentJson || old.intentHash !== intentHash || !sameBytes(old.file, record.file)
                  || (record.thumb ? !sameBytes(old.thumb, record.thumb) : old.thumb !== null)) throw blocked("operation-id-reused");
              } else store.add(record);
              finish(operationId);
            } catch (cause) { abort(cause); }
          };
        });
        // A context change after commit leaves recoverable data; never apply
        // its local snapshot to another account/editor just because it exists.
        assertContext(initial);
        const saved = await decode(record, operationId); assertContext(initial); return saved;
      } catch (cause) {
        const error = cause.isPersonalPhotoStorageBlocked ? cause : blocked("storage", cause);
        error.unconfirmedPhotoDraft = { ...frozen, file, thumb }; throw error;
      }
    },
    async read(operationId) {
      if (!uuid(operationId)) throw blocked("invalid-operation-id");
      const record = await transaction("readonly", (store, finish) => { const request = store.get(key(operationId)); request.onsuccess = () => finish(request.result); });
      return decode(record, operationId);
    },
    async ids() {
      const keys = await transaction("readonly", (store, finish) => { const request = store.index("binding").getAllKeys(bindingKey); request.onsuccess = () => finish(request.result); });
      return keys.map(value => JSON.parse(value)[1]);
    },
    async recoveryRecords() {
      // A read-only forensic copy, not decoded actions or dispatch authority.
      // Preserve damaged intent/hash data and the available original bytes.
      const initial = { ...getContext?.() }; assertContext(initial);
      const records = await transaction("readonly", (store, finish, abort, tx) => {
        const request = store.index("binding").getAll(bindingKey);
        request.onsuccess = () => {
          try {
            assertContext(initial);
            const rows = request.result, result = []; let remaining = rows.length;
            if (!remaining) { finish(result); return; }
            for (const row of rows) {
              const operationId = JSON.parse(row.key)?.[1];
              if (!uuid(operationId) || row.key !== key(operationId) || row.bindingKey !== bindingKey) throw blocked("recovery-binding");
              const claim = tx.objectStore("stage-dispatches").get(row.key);
              claim.onsuccess = () => {
                try {
                  assertContext(initial);
                  if (claim.result && (claim.result.key !== row.key || claim.result.bindingKey !== bindingKey)) throw blocked("recovery-binding");
                  result.push({ operationId, record: row, claim: claim.result || null });
                  if (!--remaining) finish(result);
                } catch (cause) { abort(cause); }
              };
            }
          } catch (cause) { abort(cause); }
        };
      }, ["actions", "stage-dispatches"]);
      assertContext(initial); return records;
    },
    async claimStage(operationId) {
      if (!enabled) throw blocked("disabled");
      const initial = { ...getContext?.() }; assertContext(initial);
      const action = await this.read(operationId); assertContext(initial);
      if (!action) throw blocked("missing-action");
      const claim = { version: 1, key: key(operationId), bindingKey, actionOperationId: operationId,
        stageOperationId: action.stage.operationId, intentHash: action.intentHash };
      const result = await transaction("readwrite", (store, finish, abort, tx) => {
        assertContext(initial);
        const original = store.get(key(operationId));
        original.onsuccess = () => {
          try {
            assertContext(initial);
            if (original.result?.intentHash !== claim.intentHash) throw blocked("action-changed");
            const claims = tx.objectStore("stage-dispatches"), lookup = claims.get(claim.key);
            lookup.onsuccess = () => {
              try {
                assertContext(initial);
                if (lookup.result && Object.keys(claim).some(name => lookup.result[name] !== claim[name])) throw blocked("dispatch-claim-changed");
                if (!lookup.result) claims.add(claim);
                finish({ ...claim, fresh: !lookup.result });
              } catch (cause) { abort(cause); }
            };
          } catch (cause) { abort(cause); }
        };
      }, ["actions", "stage-dispatches"]);
      assertContext(initial); return result;
    },
  };
}
