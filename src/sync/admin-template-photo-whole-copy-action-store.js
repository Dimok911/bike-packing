import { sameProtocolJson as same } from "./protocol-json-equality.js";
import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } from "./admin-template-photo-whole-copy-protocol.js";
import { encodeAdminTemplatePhotoWholeCopyRecord, decodeAdminTemplatePhotoWholeCopyRecord } from "./admin-template-photo-whole-copy-record.js";

// Reuse only the database connection. Every operation still creates its own
// fresh transaction, reads complete values and performs unchanged readbacks.
const openConnections = new WeakMap();
const databaseName = "bike-packing-admin-template-photo-whole-copy-actions-v1";
const clone = value => JSON.parse(canonical(value));
const blocked = (code, cause) => Object.assign(Error("Сохранённое копирование требует сверки. Исходный выбор сохранён для восстановления."),
  { code: `admin-template-photo-whole-copy-storage-${code}`, cause, isAdminTemplateBlocked: true });

const operation = value => { if (!validTemplateOperationId(value)) throw blocked("operation-id"); };
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// Shared by binding reads and actor discovery, never with another DB.
// Context callbacks are synchronous checks, not asynchronous grants.
function access(indexedDB, getContext, scope) {
  const current = () => {
    const value = getContext?.();
    if (value && typeof value.then === "function") { Promise.resolve(value).catch(() => {}); throw blocked("context-changed"); }
    if (!value || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(scope).some(field => value[field] !== scope[field])) throw blocked("context-changed");
    return clone(value);
  };
  const guard = initial => { if (!same(initial, current())) throw blocked("context-changed"); };
  const release = db => {
    if (openConnections.get(indexedDB)?.db === db) openConnections.delete(indexedDB);
    db.close();
  };
  const open = () => {
    if (!indexedDB?.open) return Promise.reject(blocked("unavailable"));
    const existing = openConnections.get(indexedDB);
    if (existing) return existing.promise;
    const retained = { db: null, promise: null };
    openConnections.set(indexedDB, retained);
    retained.promise = new Promise((resolve, reject) => {
      let request, abandoned = false;
      try { request = indexedDB.open(databaseName, 1); } catch (cause) { reject(blocked("open", cause)); return; }
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains("actions")) db.createObjectStore("actions", { keyPath: "key" }).createIndex("binding", "bindingKey", { unique: false });
          if (!db.objectStoreNames.contains("stage-dispatches")) db.createObjectStore("stage-dispatches", { keyPath: "key" });
        } catch (cause) { abandoned = true; try { request.transaction.abort(); } catch {} reject(blocked("upgrade", cause)); }
      };
      request.onerror = () => reject(blocked("open", request.error));
      request.onblocked = () => { abandoned = true; reject(blocked("open-blocked")); };
      request.onsuccess = () => {
        const db = request.result; retained.db = db;
        db.onversionchange = () => release(db);
        db.onclose = () => { if (openConnections.get(indexedDB) === retained) openConnections.delete(indexedDB); };
        if (abandoned) release(db); else resolve(db);
      };
    });
    retained.promise.catch(() => { if (openConnections.get(indexedDB) === retained) openConnections.delete(indexedDB); });
    return retained.promise;
  };
  const transaction = async (mode, initial, run, names = ["actions"]) => {
    guard(initial); const db = await open();
    try { guard(initial); } catch (cause) { release(db); throw cause; }
    return new Promise((resolve, reject) => {
      let tx, value, error;
      try { tx = db.transaction(names, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch (cause) { release(db); reject(blocked("transaction", cause)); return; }
      const abort = cause => { error = cause; try { tx.abort(); } catch { release(db); reject(cause); } };
      tx.oncomplete = () => { try { guard(initial); resolve(value); } catch (cause) { release(db); reject(cause); } };
      tx.onabort = () => { release(db); reject(error || blocked("transaction-aborted", tx.error)); };
      tx.onerror = () => { error ||= blocked("transaction-failed", tx.error); };
      try { guard(initial); run(tx, result => { value = result; }, abort); } catch (cause) { abort(cause); }
    });
  };
  return { current, guard, transaction };
}

// JSON intent only, no files or fabricated server proof. Target absence is an
// allocation declaration. Caller still owes live namespace/SQL absence, common
// source+target capture lease and complete cross-store admission. Neither gate
// OFF nor cancellation removes a record or a no-rePOST stage claim.
export function createAdminTemplatePhotoWholeCopyActionStore({ binding, getContext, indexedDB = globalThis.indexedDB,
  enabled = ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } = {}) {
  binding = Object.freeze(adminTemplatePhotoActionBinding(binding));
  const bindingKey = canonical(binding), key = operationId => canonical([bindingKey, operationId]);
  const { current, guard, transaction } = access(indexedDB, getContext, binding);
  const readRaw = (operationId, initial) => transaction("readonly", initial, (tx, finish, abort) => {
    const request = tx.objectStore("actions").get(key(operationId));
    request.onsuccess = () => { try { guard(initial); finish(request.result ?? null); } catch (cause) { abort(cause); } };
  });
  const header = raw => {
    try {
      const value = JSON.parse(raw.intentJson), id = value.action?.operationId;
      operation(id);
      if (raw.key !== key(id) || raw.bindingKey !== bindingKey || !same(value.binding, binding)
        || value.action?.body?.base !== null) throw blocked("record-key");
      return value;
    } catch (cause) { throw cause?.isAdminTemplateBlocked ? cause : blocked("record-key", cause); }
  };
  const decode = async (raw, operationId, initial) => {
    if (!raw) { guard(initial); return null; }
    const value = await decodeAdminTemplatePhotoWholeCopyRecord(raw, binding, operationId); guard(initial); return value;
  };
  const scan = initial => transaction("readonly", initial, (tx, finish, abort) => {
    const store = tx.objectStore("actions"), request = store.index("binding").getAllKeys(bindingKey);
    request.onsuccess = () => {
      try {
        guard(initial); const found = []; let remaining = request.result.length;
        if (!remaining) { finish(found); return; }
        for (const id of request.result) {
          const get = store.get(id);
          get.onsuccess = () => { try {
            guard(initial); if (!get.result || get.result.key !== id) throw blocked("record-key");
            found.push(get.result); if (--remaining === 0) finish(found);
          } catch (cause) { abort(cause); } };
        }
      } catch (cause) { abort(cause); }
    };
  });
  return Object.freeze({ binding,
    async capture(input) {
      if (enabled !== true) throw blocked("disabled");
      const initial = current(), frozen = clone(input);
      if (!frozen || Object.keys(frozen).length !== 2 || !Object.hasOwn(frozen, "action") || !Object.hasOwn(frozen, "snapshot")) throw blocked("capture-shape");
      try {
        const record = await encodeAdminTemplatePhotoWholeCopyRecord({ binding, ...frozen }); guard(initial);
        const prior = new Map();
        for (const raw of await scan(initial)) {
          const value = header(raw); await decode(raw, value.action.operationId, initial); prior.set(raw.key, raw);
        }
        await transaction("readwrite", initial, (tx, finish, abort) => {
          const store = tx.objectStore("actions"), request = store.index("binding").getAllKeys(bindingKey);
          request.onsuccess = () => {
            try {
              guard(initial); let remaining = request.result.length, exists = false;
              if ([...prior.keys()].some(previousKey => !request.result.includes(previousKey))) throw blocked("inventory-changed");
              const commit = () => { if (!exists) store.add(record); finish(record.key); };
              if (!remaining) { commit(); return; }
              for (const previousKey of request.result) {
                const get = store.get(previousKey);
                get.onsuccess = () => { try {
                  guard(initial); const raw = get.result;
                  if (previousKey === record.key) {
                    if (!same(raw, record)) throw blocked("operation-id-reused"); exists = true;
                  } else {
                    header(raw);
                    // A competing creation may win after the scan. Its existence
                    // is a barrier, never permission to reinterpret this target.
                    throw blocked("target-already-captured");
                  }
                  if (--remaining === 0) commit();
                } catch (cause) { abort(cause); } };
              }
            } catch (cause) { abort(cause); }
          };
        });
        const stored = await readRaw(frozen.action.operationId, initial);
        if (!stored || !same(stored, record)) throw blocked("readback");
        const decoded = await decode(stored, frozen.action.operationId, initial);
        if (!same(stored, await readRaw(frozen.action.operationId, initial))) throw blocked("readback");
        guard(initial); return decoded;
      } catch (cause) {
        const error = cause?.isAdminTemplateBlocked ? cause : blocked("capture", cause);
        try { guard(initial); error.unconfirmedAdminPhotoWholeCopy = frozen; } catch { /* The original actor retains any committed record. */ }
        throw error;
      }
    },
    async read(operationId) {
      operation(operationId); const initial = current(), raw = await readRaw(operationId, initial), value = await decode(raw, operationId, initial);
      if (!same(raw, await readRaw(operationId, initial))) throw blocked("inventory-changed");
      guard(initial); return value;
    },
    async ids() {
      const initial = current(), ids = [], rows = await scan(initial);
      for (const raw of rows) { const value = header(raw); await decode(raw, value.action.operationId, initial); ids.push(value.action.operationId); }
      if (!same(rows, await scan(initial))) throw blocked("inventory-changed");
      guard(initial); return ids.sort();
    },
    async readStage(operationId, stageId) {
      operation(operationId); operation(stageId); const initial = current(), raw = await readRaw(operationId, initial), record = await decode(raw, operationId, initial);
      if (!same(raw, await readRaw(operationId, initial))) throw blocked("inventory-changed");
      const stage = record?.stages.find(value => value.operationId === stageId);
      if (!stage) return null;
      return { binding: record.binding, action: record.action, snapshot: record.snapshot, intentHash: record.intentHash, stage,
        assetDigest: record.action.body.photoCopy.owners.flatMap(owner => owner.photos).find(value => value.assetId === stageId).assetDigest };
    },
    async claimStage(operationId, stageId) {
      if (enabled !== true) throw blocked("disabled");
      operation(operationId); operation(stageId); const initial = current(), raw = await readRaw(operationId, initial), record = await decode(raw, operationId, initial);
      const stage = record?.stages.find(value => value.operationId === stageId), asset = record?.action.body.photoCopy.owners.flatMap(owner => owner.photos).find(value => value.assetId === stageId);
      if (!stage || !asset) throw blocked("stage-missing");
      const claim = { key: canonical([bindingKey, operationId, stageId]), bindingKey, actionOperationId: operationId,
        stageOperationId: stageId, intentHash: record.intentHash, assetDigest: asset.assetDigest };
      let fresh;
      await transaction("readwrite", initial, (tx, finish, abort) => {
        const request = tx.objectStore("actions").get(key(operationId));
        request.onsuccess = () => { try {
          guard(initial); if (!same(request.result, raw)) throw blocked("action-changed");
          const claims = tx.objectStore("stage-dispatches"), get = claims.get(claim.key);
          get.onsuccess = () => { try {
            guard(initial); if (get.result && !same(get.result, claim)) throw blocked("claim-changed");
            fresh = !get.result; if (fresh) claims.add(claim); finish(claim.key);
          } catch (cause) { abort(cause); } };
        } catch (cause) { abort(cause); } };
      }, ["actions", "stage-dispatches"]);
      const saved = await transaction("readonly", initial, (tx, finish, abort) => {
        const request = tx.objectStore("actions").get(key(operationId));
        request.onsuccess = () => { try {
          guard(initial); if (!same(request.result, raw)) throw blocked("action-changed");
          const get = tx.objectStore("stage-dispatches").get(claim.key);
          get.onsuccess = () => { try { guard(initial); finish(get.result); } catch (cause) { abort(cause); } };
        } catch (cause) { abort(cause); } };
      }, ["actions", "stage-dispatches"]);
      guard(initial); if (!same(saved, claim)) throw blocked("claim-readback"); return { ...claim, fresh };
    }
  });
}


// Discovery cannot start from a target layout: a crash may precede its creation.
// Foreign records with a canonical, self-consistent routing header stay private.
// Unclassifiable headers fail closed; candidate records are fully decoded even
// when OFF, then the actor's exact key/byte inventory is read again after hashes.
export async function readAdminTemplatePhotoWholeCopyActorInventory({ actorId, environment, getContext, indexedDB = globalThis.indexedDB } = {}) {
  if (typeof actorId !== "string" || !actorId || actorId !== actorId.trim() || actorId.length > 36 || environment !== "bike-packing-experiment")
    throw blocked("context-changed");
  const { current, guard, transaction } = access(indexedDB, getContext, { actorId, environment });
  const initial = current();
  const scan = () => transaction("readonly", initial, (tx, finish, abort) => {
    const store = tx.objectStore("actions"), request = store.getAllKeys();
    request.onsuccess = () => { try {
      guard(initial); const rows = []; let remaining = request.result.length;
      if (!remaining) { finish(rows); return; }
      for (const key of request.result) {
        const get = store.get(key);
        get.onsuccess = () => { try {
          guard(initial); const raw = get.result;
          if (!raw || raw.key !== key || typeof raw.bindingKey !== "string") throw blocked("record-key");
          const parsed = JSON.parse(raw.bindingKey), binding = adminTemplatePhotoActionBinding(parsed);
          if (canonical(binding) !== raw.bindingKey) throw blocked("record-key");
          const pair = JSON.parse(key);
          if (!Array.isArray(pair) || pair.length !== 2 || pair[0] !== raw.bindingKey || canonical(pair) !== key) throw blocked("record-key");
          operation(pair[1]);
          if (binding.actorId === actorId && binding.environment === environment) rows.push({ raw, binding, operationId: pair[1] });
          if (--remaining === 0) finish(rows.sort((a, b) => a.raw.key.localeCompare(b.raw.key)));
        } catch (cause) { abort(cause?.isAdminTemplateBlocked ? cause : blocked("record-key", cause)); } };
      }
    } catch (cause) { abort(cause); } };
  });
  const rows = await scan(), records = [], bindings = new Map();
  for (const row of rows) {
    records.push(await decodeAdminTemplatePhotoWholeCopyRecord(row.raw, row.binding, row.operationId)); guard(initial);
    bindings.set(canonical(row.binding), row.binding);
  }
  if (!same(rows, await scan())) throw blocked("inventory-changed");
  guard(initial);
  return freeze(clone({ bindings: [...bindings.values()], records }));
}
