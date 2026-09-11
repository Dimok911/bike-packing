import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED } from "./admin-template-photo-append-protocol.js";
import { adminTemplatePhotoActionBinding, encodeAdminTemplatePhotoRecord, decodeAdminTemplatePhotoRecord } from "./admin-template-photo-record.js";

const databaseName = "bike-packing-admin-template-photo-actions-v1";
const clone = value => JSON.parse(canonicalTemplateJson(value));
const blocked = (code, cause) => Object.assign(Error("Не удалось подтвердить локальный фотопакет шаблона. Исходные файлы сохранены для восстановления."),
  { code: `admin-template-photo-storage-${code}`, cause, isAdminTemplateBlocked: true });
const sameBytes = (left, right) => {
  if (!(left instanceof ArrayBuffer) || !(right instanceof ArrayBuffer) || left.byteLength !== right.byteLength) return false;
  const bytes = new Uint8Array(right); return new Uint8Array(left).every((byte, index) => byte === bytes[index]);
};
const sameKeys = (left, right) => left && right && JSON.stringify(Object.keys(left).sort()) === JSON.stringify(Object.keys(right).sort());
const sameRecord = (left, right) => sameKeys(left, right) && left.version === right.version && left.key === right.key && left.bindingKey === right.bindingKey
  && left.intentJson === right.intentJson && left.intentHash === right.intentHash && Array.isArray(left.files) && left.files.length === right.files.length
  && right.files.every((part, index) => sameKeys(left.files[index], part) && left.files[index].stageOperationId === part.stageOperationId
    && sameBytes(left.files[index].file, part.file) && (part.thumb === null ? left.files[index].thumb === null : sameBytes(left.files[index].thumb, part.thumb)));

// Separate from personal files and the evictable image cache. One transaction
// owns the full immutable intent and all bytes. No dispatch, expiry, overwrite
// or deletion authority is exposed, including after a partial caller failure.
export function createAdminTemplatePhotoActionStore({ binding, getContext, indexedDB = globalThis.indexedDB,
  enabled = ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED } = {}) {
  binding = Object.freeze(adminTemplatePhotoActionBinding(binding));
  const bindingKey = JSON.stringify(binding), key = operationId => JSON.stringify([bindingKey, operationId]);
  const current = () => {
    const context = getContext?.();
    if (!context || context.scope !== "admin-template" || context.admin !== true || typeof context.generation !== "string" || !context.generation
      || Object.keys(binding).some(field => context[field] !== binding[field])) throw blocked("context-changed");
    return clone(context);
  };
  const guard = initial => { if (canonicalTemplateJson(current()) !== canonicalTemplateJson(initial)) throw blocked("context-changed"); };
  const operation = operationId => { if (!validTemplateOperationId(operationId)) throw blocked("operation-id"); };
  const open = () => new Promise((resolve, reject) => {
    if (!indexedDB?.open) { reject(blocked("unavailable")); return; }
    let request, abandoned = false;
    try { request = indexedDB.open(databaseName, 1); } catch (error) { reject(blocked("open", error)); return; }
    request.onupgradeneeded = () => {
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains("actions")) db.createObjectStore("actions", { keyPath: "key" }).createIndex("binding", "bindingKey", { unique: false });
        if (!db.objectStoreNames.contains("stage-dispatches")) db.createObjectStore("stage-dispatches", { keyPath: "key" });
      } catch (error) { abandoned = true; try { request.transaction.abort(); } catch { /* The failed upgrade remains closed. */ } reject(blocked("upgrade", error)); }
    };
    request.onerror = () => reject(blocked("open", request.error));
    request.onblocked = () => { abandoned = true; reject(blocked("open-blocked")); };
    request.onsuccess = () => {
      const db = request.result; db.onversionchange = () => db.close();
      if (abandoned) db.close(); else resolve(db);
    };
  });
  const transaction = async (mode, initial, run, stores = ["actions"]) => {
    guard(initial); const db = await open();
    try { guard(initial); } catch (error) { db.close(); throw error; }
    return new Promise((resolve, reject) => {
      let tx, result, error;
      try { tx = db.transaction(stores, mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch (cause) { db.close(); reject(blocked("transaction", cause)); return; }
      tx.oncomplete = () => {
        db.close();
        try { guard(initial); resolve(result); } catch (cause) { reject(cause); }
      };
      tx.onabort = () => { db.close(); reject(error || blocked("transaction-aborted", tx.error)); };
      tx.onerror = () => { error ||= blocked("transaction-failed", tx.error); };
      const abort = cause => { error = cause; try { tx.abort(); } catch { db.close(); reject(cause); } };
      try { guard(initial); run(tx.objectStore("actions"), value => { result = value; }, abort, tx); }
      catch (cause) { abort(cause); }
    });
  };
  const readRecord = (operationId, initial) => transaction("readonly", initial, (store, finish, abort) => {
    const request = store.get(key(operationId));
    request.onsuccess = () => { try { guard(initial); finish(request.result ?? null); } catch (error) { abort(error); } };
  });
  const decode = async (record, operationId, initial) => {
    guard(initial);
    if (!record) return null;
    const result = await decodeAdminTemplatePhotoRecord(record, binding, operationId); guard(initial);
    return result;
  };
  return Object.freeze({
    binding,
    async capture({ action, snapshot, files }) {
      if (!enabled) throw blocked("disabled");
      const initial = current();
      const frozen = { binding, action: clone(action), snapshot: clone(snapshot), files: files?.map(part => ({
        stage: clone(part.stage), file: part.file, thumb: part.thumb ?? null })) };
      try {
        const record = await encodeAdminTemplatePhotoRecord(frozen); guard(initial);
        await transaction("readwrite", initial, (store, finish, abort) => {
          const candidates = store.index("binding").getAllKeys(bindingKey);
          candidates.onsuccess = () => {
            try {
              guard(initial);
              const keys = candidates.result; let remaining = keys.length, exists = false;
              const commit = () => { if (!exists) store.add(record); finish(record.key); };
              if (!remaining) { commit(); return; }
              // The scan and insertion share one serialized IDB transaction.
              // Two tabs cannot capture distinct actions for the same base.
              for (const previousKey of keys) {
                const lookup = store.get(previousKey);
                lookup.onsuccess = () => {
                  try {
                    guard(initial); const previous = lookup.result;
                    if (previousKey === record.key) {
                      if (!sameRecord(previous, record)) throw blocked("operation-id-reused");
                      exists = true;
                    } else {
                      const intent = JSON.parse(previous.intentJson);
                      if (previous.bindingKey !== bindingKey || canonicalTemplateJson(intent.binding) !== canonicalTemplateJson(binding)
                        || !Number.isSafeInteger(intent.action?.body?.base?.stateRevision)) throw blocked("record-key");
                      if (intent.action.body.base.stateRevision === frozen.action.body.base.stateRevision) throw blocked("base-already-captured");
                    }
                    if (--remaining === 0) commit();
                  } catch (error) { abort(error); }
                };
              }
            } catch (error) { abort(error); }
          };
        });
        guard(initial);
        // Read the actual committed IDB record in a separate transaction. Never
        // substitute the just-encoded in-memory record for durability evidence.
        const stored = await readRecord(frozen.action.operationId, initial); guard(initial);
        if (!stored || !sameRecord(stored, record)) throw blocked("readback");
        return await decode(stored, frozen.action.operationId, initial);
      } catch (cause) {
        const error = cause?.isAdminTemplateBlocked ? cause : blocked("capture", cause);
        // A new account must not receive the previous actor's draft/files.
        try { guard(initial); error.unconfirmedAdminPhotoDraft = frozen; } catch { /* The original account can recover its stored record. */ }
        throw error;
      }
    },
    async read(operationId) {
      operation(operationId); const initial = current();
      return decode(await readRecord(operationId, initial), operationId, initial);
    },
    async ids() {
      const initial = current();
      const ids = await transaction("readonly", initial, (store, finish, abort) => {
        const request = store.index("binding").getAllKeys(bindingKey);
        request.onsuccess = () => {
          try {
            guard(initial);
            finish(request.result.map(value => {
              const parts = JSON.parse(value);
              if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== bindingKey || value !== key(parts[1])) throw blocked("record-key");
              operation(parts[1]); return parts[1];
            }).sort());
          } catch (error) { abort(error); }
        };
      });
      guard(initial); return ids;
    },
    async readStage(operationId, stageId) {
      operation(operationId); operation(stageId); const initial = current();
      const record = await decode(await readRecord(operationId, initial), operationId, initial); guard(initial);
      if (!record) return null;
      const part = record.files.find(file => file.stage.operationId === stageId);
      return part ? { binding: record.binding, action: record.action, snapshot: record.snapshot, intentHash: record.intentHash, ...part } : null;
    },
    async claimStage(operationId, stageId) {
      if (!enabled) throw blocked("disabled");
      operation(operationId); operation(stageId); const initial = current();
      const raw = await readRecord(operationId, initial), record = await decode(raw, operationId, initial); guard(initial);
      const part = record?.files.find(file => file.stage.operationId === stageId);
      const asset = record?.action.body.photoAppend.assets.find(value => value.assetId === stageId);
      if (!part || !asset) throw blocked("stage-missing");
      const claim = { key: JSON.stringify([bindingKey, operationId, stageId]), bindingKey, actionOperationId: operationId,
        stageOperationId: stageId, intentHash: record.intentHash, assetDigest: asset.assetDigest };
      let fresh;
      await transaction("readwrite", initial, (store, finish, abort, tx) => {
        const request = store.get(key(operationId));
        request.onsuccess = () => {
          try {
            guard(initial);
            if (!sameRecord(request.result, raw)) throw blocked("action-changed");
            const claims = tx.objectStore("stage-dispatches"), lookup = claims.get(claim.key);
            lookup.onsuccess = () => {
              try {
                guard(initial);
                if (lookup.result && canonicalTemplateJson(lookup.result) !== canonicalTemplateJson(claim)) throw blocked("claim-changed");
                fresh = !lookup.result; if (fresh) claims.add(claim); finish(claim.key);
              } catch (error) { abort(error); }
            };
          } catch (error) { abort(error); }
        };
      }, ["actions", "stage-dispatches"]);
      const saved = await transaction("readonly", initial, (store, finish, abort, tx) => {
        const actionRequest = store.get(key(operationId));
        actionRequest.onsuccess = () => {
          try {
            guard(initial); if (!sameRecord(actionRequest.result, raw)) throw blocked("action-changed");
            const request = tx.objectStore("stage-dispatches").get(claim.key);
            request.onsuccess = () => { try { guard(initial); finish(request.result); } catch (error) { abort(error); } };
          } catch (error) { abort(error); }
        };
      }, ["actions", "stage-dispatches"]);
      guard(initial);
      if (canonicalTemplateJson(saved) !== canonicalTemplateJson(claim)) throw blocked("claim-readback");
      return { ...claim, fresh };
    }
  });
}
