import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "./admin-template-photo-tree-copy-protocol.js";
import { encodeAdminTemplatePhotoTreeCopyRecord, decodeAdminTemplatePhotoTreeCopyRecord } from "./admin-template-photo-tree-copy-record.js";

const databaseName = "bike-packing-admin-template-photo-tree-copy-actions-v1";
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const blocked = (code, cause) => Object.assign(Error("Сохранённое копирование требует сверки. Исходный выбор сохранён для восстановления."),
  { code: `admin-template-photo-tree-copy-storage-${code}`, cause, isAdminTemplateBlocked: true });

// JSON derivative intents only. This store never gains upload/file authority,
// stores server receipts, dispatches requests or deletes retained proof. Its
// base-conflict check excludes competing copies only in THIS DB. An older
// record at another base is not evidence of completion. Before dispatch the
// caller still owes a common capture lease, complete inventory and typed stop
// proof across ordinary/upload/copy stores. No exclusion/cancel authority is
// implemented here; neither reads nor failed readback release a retained claim.
export function createAdminTemplatePhotoTreeCopyActionStore({ binding, getContext, indexedDB = globalThis.indexedDB,
  enabled = ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } = {}) {
  binding = Object.freeze(adminTemplatePhotoActionBinding(binding));
  const bindingKey = canonical(binding), key = operationId => canonical([bindingKey, operationId]);
  const operation = value => { if (!validTemplateOperationId(value)) throw blocked("operation-id"); };
  const current = () => {
    const context = getContext?.();
    if (!context || context.scope !== "admin-template" || context.admin !== true || typeof context.generation !== "string" || !context.generation
      || Object.keys(binding).some(field => context[field] !== binding[field])) throw blocked("context-changed");
    return clone(context);
  };
  const guard = initial => { if (!same(initial, current())) throw blocked("context-changed"); };
  const open = () => new Promise((resolve, reject) => {
    if (!indexedDB?.open) { reject(blocked("unavailable")); return; }
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
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); if (abandoned) db.close(); else resolve(db); };
  });
  const transaction = async (mode, initial, run, names = ["actions"]) => {
    guard(initial); const db = await open();
    try { guard(initial); } catch (cause) { db.close(); throw cause; }
    return new Promise((resolve, reject) => {
      let tx, value, error;
      try { tx = db.transaction(names, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch (cause) { db.close(); reject(blocked("transaction", cause)); return; }
      const abort = cause => { error = cause; try { tx.abort(); } catch { db.close(); reject(cause); } };
      tx.oncomplete = () => { db.close(); try { guard(initial); resolve(value); } catch (cause) { reject(cause); } };
      tx.onabort = () => { db.close(); reject(error || blocked("transaction-aborted", tx.error)); };
      tx.onerror = () => { error ||= blocked("transaction-failed", tx.error); };
      try { guard(initial); run(tx, result => { value = result; }, abort); } catch (cause) { abort(cause); }
    });
  };
  const readRaw = (operationId, initial) => transaction("readonly", initial, (tx, finish, abort) => {
    const request = tx.objectStore("actions").get(key(operationId));
    request.onsuccess = () => { try { guard(initial); finish(request.result ?? null); } catch (cause) { abort(cause); } };
  });
  const header = raw => {
    try {
      const value = JSON.parse(raw.intentJson), id = value.action?.operationId;
      operation(id);
      if (raw.key !== key(id) || raw.bindingKey !== bindingKey || !same(value.binding, binding)
        || !Number.isSafeInteger(value.action?.body?.base?.stateRevision)) throw blocked("record-key");
      return value;
    } catch (cause) { throw cause?.isAdminTemplateBlocked ? cause : blocked("record-key", cause); }
  };
  const decode = async (raw, operationId, initial) => {
    if (!raw) { guard(initial); return null; }
    const value = await decodeAdminTemplatePhotoTreeCopyRecord(raw, binding, operationId); guard(initial); return value;
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
        const record = await encodeAdminTemplatePhotoTreeCopyRecord({ binding, ...frozen }); guard(initial);
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
                    const value = header(raw);
                    // Hash validation happens outside the active IDB tx. A new
                    // or changed row cannot become authority during that await.
                    if (value.action.body.base.stateRevision === frozen.action.body.base.stateRevision) throw blocked("base-already-captured");
                    if (!prior.has(previousKey) || !same(raw, prior.get(previousKey))) throw blocked("inventory-changed");
                  }
                  if (--remaining === 0) commit();
                } catch (cause) { abort(cause); } };
              }
            } catch (cause) { abort(cause); }
          };
        });
        const stored = await readRaw(frozen.action.operationId, initial);
        if (!stored || !same(stored, record)) throw blocked("readback");
        return await decode(stored, frozen.action.operationId, initial);
      } catch (cause) {
        const error = cause?.isAdminTemplateBlocked ? cause : blocked("capture", cause);
        try { guard(initial); error.unconfirmedAdminPhotoTreeCopy = frozen; } catch { /* The original actor retains any committed record. */ }
        throw error;
      }
    },
    async read(operationId) { operation(operationId); const initial = current(); return decode(await readRaw(operationId, initial), operationId, initial); },
    async ids() {
      const initial = current(), ids = [];
      for (const raw of await scan(initial)) { const value = header(raw); await decode(raw, value.action.operationId, initial); ids.push(value.action.operationId); }
      guard(initial); return ids.sort();
    },
    async readStage(operationId, stageId) {
      operation(operationId); operation(stageId); const initial = current(), record = await decode(await readRaw(operationId, initial), operationId, initial);
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
