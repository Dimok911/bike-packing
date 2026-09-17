import { canonicalTemplateJson as canonical, validTemplateOperationId, ADMIN_TEMPLATE_OPERATIONS_ENABLED, TEMPLATE_OPERATION_CAPABILITY, TEMPLATE_COPY_CAPABILITY } from "./admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, TEMPLATE_PHOTO_APPEND_CAPABILITY } from "./admin-template-photo-append-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED, TEMPLATE_PHOTO_CREATE_CAPABILITY } from "./admin-template-photo-create-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, TEMPLATE_PHOTO_COPY_CAPABILITY } from "./admin-template-photo-copy-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY,
  adminTemplatePhotoWholeCopyIntent } from "./admin-template-photo-whole-copy-protocol.js";
import { validateAdminTemplatePhotoWholeCopyStageReceipt, validateAdminTemplatePhotoWholeCopyStages,
  validateAdminTemplatePhotoWholeCopyReceipt } from "./admin-template-photo-whole-copy-receipt.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "./admin-template-photo-whole-copy-record.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";

const stagePath = "/bike-packing/admin/template-photo-assets/whole-copy", copyPath = stagePath, commandPath = "/bike-packing/admin/template-operations";
const kind = "admin-template-photo-whole-copy", clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const blocked = (code = "paused", cause) => Object.assign(Error("Копирование сохранено и требует сверки. Продолжите исходное действие."),
  { code: `admin-template-photo-whole-copy-client-${code}`, cause, isAdminTemplateBlocked: true });
const digest = async intent => {
  const { id, ...value } = intent;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");
};
const actionFor = intent => ({ operationId: intent.id, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body });
const assets = intent => intent.body.photoCopy.owners.flatMap(owner => owner.photos);

// This typed client does not supply global admission or cancellation authority.
// withDispatchAdmission must hold the caller's genuine common lease/inventory
// scope through the entire callback, including claims, readback, POST and settle.
// It provides {assertCurrent()} to recheck that scope after every await/effect.
// Absence pauses new POSTs; known immutable GET reconciliation remains available.
// Cancellation has its own withCancellationAdmission: exact retained plan/record
// and actor authority, without requiring an unchanged business namespace/base.
// Neither cancellation nor its terminal fact retires any separate stage claim.
export function createAdminTemplatePhotoWholeCopyClient({ binding, getContext, store, transport, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, fetchImpl = (...args) => globalThis.fetch(...args), lifecycleTarget = globalThis.window, timeoutMs = 10000,
  enabled = ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, adminEnabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED,
  appendEnabled = ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, createEnabled = ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED,
  copyEnabled = ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, withDispatchAdmission = null, withCancellationAdmission = null, onProgress = null } = {}) {
  // UI reporting must never change a durable command or prevent its receipt
  // from being reconciled. Counts advance only after a validated stage ACK.
  const progress = (phase, completed, total) => {
    try { onProgress?.({ phase, completed, total }); } catch { /* UI only. */ }
  };
  binding = Object.freeze(adminTemplatePhotoActionBinding(binding));
  if (!store || !same(store.binding, binding)) throw blocked("store-binding");
  const prefix = "bike-packing-admin-photo-whole-copy-commands-v1:" + encodeURIComponent(canonical(binding)) + ":";
  const key = id => { if (!validTemplateOperationId(id)) throw blocked("operation-id"); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (!transport?.experiment || !value || value.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation
      || Object.keys(binding).some(field => value[field] !== binding[field])) throw blocked("context");
    return clone(value);
  };
  const writing = () => { if (![enabled, adminEnabled, appendEnabled, createEnabled, copyEnabled].every(value => value === true)) throw blocked("disabled"); };
  const localGuard = initial => { if (!same(context(), initial)) throw blocked("context"); };
  const withLock = (id, task) => { if (!locks?.request) throw blocked("lock"); return locks.request(key(id), task); };
  const loadRecord = async (id, guard) => {
    guard(); const raw = await store.read(id); guard();
    if (!raw || !exact(raw, ["binding", "action", "snapshot", "stages", "intentHash"]) || !same(raw.binding, binding) || raw.action?.operationId !== id) throw blocked("record");
    const record = clone(raw), expected = await prepareAdminTemplatePhotoWholeCopyRecord({ binding, action: record.action, snapshot: record.snapshot }); guard();
    if (!same(record, expected)) throw blocked("record"); return record;
  };
  const read = async (id, guard) => {
    guard(); const text = storage?.getItem(key(id)); if (text == null) return null;
    if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 12 * 1024 * 1024) throw blocked("journal");
    let saved; try { saved = JSON.parse(text); } catch (cause) { throw blocked("journal", cause); }
    const keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
    if (!(exact(saved, keys) || exact(saved, [...keys, "cancelRequested"]))
      || Object.hasOwn(saved, "cancelRequested") && typeof saved.cancelRequested !== "boolean"
      || saved.version !== 1 || saved.kind !== kind || typeof saved.dispatched !== "boolean" || !hash(saved.recordIntentHash)
      || !exact(saved.intent, ["id", "environment", "actorId", "listId", "itemKey", "kind", "body"])
      || canonical(saved) !== text || !same(saved.intent, adminTemplatePhotoWholeCopyIntent({ ...binding, ...actionFor(saved.intent) }))
      || saved.intent.id !== id || saved.payloadDigest !== await digest(saved.intent)) throw blocked("journal");
    guard(); const record = await loadRecord(id, guard);
    if (saved.recordIntentHash !== record.intentHash || !same(actionFor(saved.intent), record.action)
      || !Array.isArray(saved.stageReceipts) || saved.stageReceipts.length !== record.stages.length) throw blocked("record");
    for (const [index, receipt] of saved.stageReceipts.entries()) if (receipt !== null) {
      if (!await validateAdminTemplatePhotoWholeCopyStageReceipt(receipt, { manifest: record.stages[index], assetDigest: assets(saved.intent)[index].assetDigest })) throw blocked("stage-receipt");
      guard();
    }
    if (saved.dispatched && saved.stageReceipts.some(value => value === null)) throw blocked("journal");
    if (saved.stageReceipts.every(value => value !== null) && !await validateAdminTemplatePhotoWholeCopyStages(saved.intent, saved.stageReceipts)) throw blocked("stages");
    guard();
    if (saved.receipt !== null && !await validateAdminTemplatePhotoWholeCopyReceipt(saved.receipt, { intent: saved.intent,
      payloadDigest: saved.payloadDigest, stageReceipts: saved.stageReceipts })) throw blocked("receipt");
    guard(); if (storage?.getItem(key(id)) !== text) throw blocked("journal-changed"); return saved;
  };
  const persist = (next, previous, guard) => {
    guard(); const name = key(next.intent.id), actual = storage?.getItem(name);
    if (!storage || actual !== (previous === null ? null : canonical(previous))) throw blocked("journal-changed");
    const encoded = canonical(next);
    if (new TextEncoder().encode(encoded).byteLength > 12 * 1024 * 1024) throw blocked("journal");
    storage.setItem(name, encoded);
    if (storage.getItem(name) !== encoded) throw blocked("journal-readback"); guard(); return next;
  };
  const commandMetadata = saved => ({ type: "admin-template", protocol: "admin-template-photo-whole-copy-parent-v3", ...binding, operationId: saved.intent.id,
    kind: "template.copy", payloadDigest: saved.payloadDigest, recordIntentHash: saved.recordIntentHash });
  const stageMetadata = (saved, index) => ({ type: "admin-template-photo-stage", protocol: "admin-template-photo-whole-copy-stage-v3", ...binding,
    operationId: assets(saved.intent)[index].assetId, actionOperationId: saved.intent.id,
    assetDigest: assets(saved.intent)[index].assetDigest, intentHash: saved.recordIntentHash });
  const entry = (metadata, path) => {
    const value = transport.writes.find(value => value.id === metadata.operationId);
    if (value && (!(Array.isArray(path) ? path : [path]).includes(value.path) || value.method !== "POST" || value.mode !== transport.mode || !same(value.recovery, metadata))) throw blocked("transport-binding");
    return value;
  };
  const cancelPath = saved => `${commandPath}/${saved.intent.id}/cancel`;
  const commandEntry = saved => entry(commandMetadata(saved), saved.cancelRequested ? [commandPath, cancelPath(saved)] : commandPath);
  const execute = (id, work) => {
    const initial = context(), controller = new AbortController(), abort = () => controller.abort();
    let admission = null;
    const baseGuard = () => { if (controller.signal.aborted) throw blocked("document-ended"); localGuard(initial); };
    const guard = () => {
      baseGuard();
      if (admission) { if (!admission.active()) throw blocked("admission-ended"); admission.assertCurrent(); baseGuard(); }
    };
    return (async () => {
      for (const event of ["beforeunload", "pagehide"]) lifecycleTarget?.addEventListener(event, abort, { once: true });
      try {
        return await withLock(id, async () => {
          guard(); let saved = await read(id, guard); guard(); if (!saved) throw blocked("missing");
          const admitted = async (task, cancellation = false) => {
            const enter = cancellation ? withCancellationAdmission : withDispatchAdmission;
            guard(); if (typeof enter !== "function" || admission) throw blocked(cancellation ? "cancellation-admission" : "admission");
            let entered = false, complete = false, active = true, result;
            try {
              await enter({ intent: clone(saved.intent), recordIntentHash: saved.recordIntentHash, assertCurrent: baseGuard }, async scope => {
                if (!active || entered || typeof scope?.assertCurrent !== "function"
                  || !exact(scope, ["assertCurrent"])) throw blocked("admission");
                const scopeGuard = scope.assertCurrent.bind(scope);
                entered = true; admission = { active: () => active, assertCurrent: () => {
                  const result = scopeGuard();
                  if (result?.then) {
                    Promise.resolve(result).catch(() => {}); throw blocked(cancellation ? "cancellation-admission" : "admission");
                  }
                  if (result === false) throw blocked(cancellation ? "cancellation-admission" : "admission");
                } };
                try { guard(); result = await task(); guard(); complete = true; return result; }
                finally { admission = null; }
              });
              baseGuard(); if (!entered || !complete) throw blocked("admission"); return result;
            } finally { active = false; }
          };
          const request = async (path, options = {}) => {
            // A durable beginWrite may yield to another tab. Re-read the exact
            // journal and typed record after that wait, immediately before POST.
            if (options.method === "POST") {
              await refresh(); guard();
              if (path === cancelPath(saved) && typeof transport.fenceWholeCopyParent !== "function") throw blocked("parent-fence");
            }
            guard(); let timer;
            try {
              return await Promise.race([(async () => {
                const response = await fetchImpl(transport.apiUrl(path), { credentials: "include", cache: "no-store", redirect: "error", ...options, signal: controller.signal });
                guard(); const data = await response.json(); guard();
                if (response.status !== 200 || data?.ok !== true) throw Object.assign(blocked("response"), { status: response.status });
                return clone(data);
              })(), new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(blocked("timeout")); }, timeoutMs); })]);
            } finally { clearTimeout(timer); }
          };
          // Persist the user's stop under the command lock before any network
          // wait, including auth and the first receipt GET. Offline/auth failure
          // must never turn an explicit stop back into a runnable copy on reload.
          if (work === "cancel") {
            if (adminEnabled !== true) throw blocked("disabled");
            if (!saved.cancelRequested) saved = persist({ ...saved, cancelRequested: true }, saved, guard);
            if (typeof transport.fenceWholeCopyParent !== "function") throw blocked("parent-fence");
          }
          await transport.prepare(); guard();
          const me = await request("/auth/me"); if (me.user?.id !== binding.actorId) throw blocked("actor");
          const rights = await request("/bike-packing/authorization");
          if (rights.authorization?.version !== 1 || rights.authorization.role !== "admin" || !Array.isArray(rights.authorization.capabilities)
            || !rights.authorization.capabilities.includes("templates:write")) throw blocked("rights");
          const capabilities = async () => {
            writing(); const value = await request("/bike-packing/capabilities");
            if (value.service !== "bikepacking-api" || !Array.isArray(value.capabilities)
              || ![TEMPLATE_OPERATION_CAPABILITY, TEMPLATE_COPY_CAPABILITY, TEMPLATE_PHOTO_APPEND_CAPABILITY, TEMPLATE_PHOTO_CREATE_CAPABILITY, TEMPLATE_PHOTO_COPY_CAPABILITY, TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY]
                .every(cap => value.capabilities.includes(cap))) throw blocked("capabilities");
          };
          const refresh = async () => {
            const current = await read(id, guard); guard();
            if (!current || !same(current, saved) || storage.getItem(key(id)) !== canonical(saved)) throw blocked("journal-changed");
          };
          const settleStage = async (index, data) => {
            const record = await loadRecord(id, guard), asset = assets(saved.intent)[index], metadata = stageMetadata(saved, index);
            if (!await validateAdminTemplatePhotoWholeCopyStageReceipt(data, { manifest: record.stages[index], assetDigest: asset.assetDigest })) throw blocked("stage-receipt");
            guard(); await refresh(); const prior = saved.stageReceipts[index], transportEntry = entry(metadata, copyPath);
            if (prior && !same(prior.receipt, data.receipt) || transportEntry?.confirmed && !same(transportEntry.receipt?.receipt, data.receipt)) throw blocked("stage-changed");
            const stages = clone(saved.stageReceipts); stages[index] = clone(data);
            saved = persist({ ...saved, stageReceipts: stages }, saved, guard);
            if (transportEntry && transport.confirmWrite(asset.assetId, { receipt: data }) !== true) throw blocked("stage-confirm-storage");
            guard(); return clone(data);
          };
          const inspectStage = async index => {
            const asset = assets(saved.intent)[index], metadata = stageMetadata(saved, index), transportEntry = entry(metadata, copyPath);
            const data = await request(`${stagePath}/${asset.assetId}`);
            if (exact(data, ["ok", "operation"]) && exact(data.operation, ["id", "environment", "actorId", "state"])
              && data.operation.id === asset.assetId && data.operation.environment === binding.environment && data.operation.actorId === binding.actorId
              && data.operation.state === "unknown") {
              if (saved.stageReceipts[index] || transportEntry?.confirmed) throw blocked("stage-disappeared"); return null;
            }
            return settleStage(index, data);
          };
          const stage = async index => {
            const known = await inspectStage(index);
            if (known) { if (known.assetState !== "ready") throw blocked("stage-unavailable"); return known; }
            return admitted(async () => {
              await capabilities(); await refresh();
              const asset = assets(saved.intent)[index], metadata = stageMetadata(saved, index);
              if (entry(metadata, copyPath)) throw blocked("stage-unknown");
              guard(); transport.assertWritable(copyPath, "POST", metadata);
              const record = await loadRecord(id, guard), claim = await store.claimStage(id, asset.assetId); guard();
              if (!same(claim, { key: canonical([canonical(binding), id, asset.assetId]), bindingKey: canonical(binding), actionOperationId: id,
                stageOperationId: asset.assetId, intentHash: saved.recordIntentHash, assetDigest: asset.assetDigest, fresh: true })) throw blocked("stage-unknown");
              await refresh();
              try {
                await transport.beginWrite(copyPath, "POST", null, metadata); guard();
                return await settleStage(index, await request(copyPath, { method: "POST", headers: { "content-type": "application/json" },
                  body: canonical({ manifest: record.stages[index] }) }));
              } catch (cause) {
                // Conservatively retain the transport barrier even if the
                // document/context/admission ended after dispatch registration.
                transport.noteFailure(cause, copyPath, "POST", asset.assetId); guard();
                const recovered = await inspectStage(index); if (recovered) return recovered; throw cause;
              }
            });
          };
          const settle = async data => {
            if (!exact(data, ["ok", "operation", "result"])) throw blocked("receipt");
            if (data.operation.state === "committed") {
              for (const [index, receipt] of saved.stageReceipts.entries()) {
                // A stage receipt may outlive a failed transport ACK write.
                // Only the original typed GET can settle that retained entry.
                const pending = entry(stageMetadata(saved, index), copyPath);
                if ((receipt === null || pending && !pending.confirmed) && !await inspectStage(index)) throw blocked("stage-unknown");
              }
            }
            const { ok, ...receipt } = data;
            if (ok !== true || !await validateAdminTemplatePhotoWholeCopyReceipt(receipt, { intent: saved.intent,
              payloadDigest: saved.payloadDigest, stageReceipts: saved.stageReceipts })) throw blocked("receipt");
            guard(); await refresh(); if (saved.receipt && !same(saved.receipt, receipt)) throw blocked("receipt-changed");
            const transportEntry = commandEntry(saved);
            if (transportEntry?.confirmed && !same(transportEntry.receipt, receipt)) throw blocked("receipt-changed");
            saved = persist({ ...saved, receipt }, saved, guard);
            if (transportEntry && transport.confirmWrite(id, { receipt }) !== true) throw blocked("confirm-storage");
            if (receipt.result.payload.code === "operation_cancelled") {
              if (typeof transport.fenceWholeCopyParent !== "function") throw blocked("parent-fence");
              await transport.fenceWholeCopyParent({ intent: saved.intent, recordIntentHash: saved.recordIntentHash, receipt, assertCurrent: guard });
            }
            guard(); return clone(receipt);
          };
          const inspect = async () => {
            const transportEntry = commandEntry(saved), data = await request(`${commandPath}/${id}`);
            if (exact(data, ["ok", "operation"]) && exact(data.operation, ["id", "state"]) && data.operation.id === id && data.operation.state === "unknown") {
              if (saved.receipt || transportEntry?.confirmed) throw blocked("receipt-disappeared"); return null;
            }
            return settle(data);
          };
          if (!["run", "inspect", "cancel"].includes(work)) {
            const index = assets(saved.intent).findIndex(asset => asset.assetId === work);
            if (index < 0) throw blocked("stage-missing");
            return await inspectStage(index) || { ok: true, operation: { id: work, environment: binding.environment, actorId: binding.actorId, state: "unknown" } };
          }
          const known = await inspect(); if (known || work === "inspect") return known;
          const envelope = { expectedActorId: binding.actorId, environment: binding.environment, operationId: id, kind: "template.copy",
            listId: binding.listId, itemKey: binding.itemKey, body: saved.intent.body };
          if (work === "cancel") {
            if (adminEnabled !== true) throw blocked("disabled");
            await refresh();
            // The stop was already durable before the first network request.
            // Missing cancellation authority can never silently resume the save.
            return admitted(async () => {
              await refresh();
              const caps = await request("/bike-packing/capabilities");
              if (caps.service !== "bikepacking-api" || !Array.isArray(caps.capabilities)
                || !caps.capabilities.includes(TEMPLATE_OPERATION_CAPABILITY)) throw blocked("capabilities");
              await refresh();
              const path = cancelPath(saved), metadata = commandMetadata(saved), permission = {
                operationId: id, payloadDigest: saved.payloadDigest, stageProtocol: "admin-template-photo-whole-copy-stage-v3",
                recordIntentHash: saved.recordIntentHash, assets: assets(saved.intent).map(({ assetId, assetDigest }) => ({ assetId, assetDigest }))
              };
              // The transport may still reject an unknown whole-copy stage.
              // Only the new typed parent fence can retire its own barrier;
              // cancellation never acknowledges any unfinished stage.
              transport.assertWritable(path, "POST", metadata, permission);
              try {
                if (!commandEntry(saved)) await transport.beginWrite(path, "POST", null, metadata, permission);
                guard(); await refresh();
                return await settle(await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: canonical(envelope) }));
              } catch (cause) {
                transport.noteFailure(cause, path, "POST", id); guard();
                const recovered = await inspect(); if (recovered) return recovered; throw cause;
              }
            }, true);
          }
          // Only another explicit cancel() may repeat the idempotent fence.
          // Ordinary continuation reads the same UUID and never resumes stages.
          if (saved.cancelRequested) throw blocked("cancel-requested");
          // Unlike generic administrative replay, this first copy client never
          // resends a save whose durable dispatch claim already exists.
          if (saved.dispatched || commandEntry(saved)) throw blocked("save-unknown");
          await capabilities();
          progress("photos", 0, saved.stageReceipts.length);
          for (let index = 0; index < saved.stageReceipts.length; index++) {
            const receipt = await stage(index); guard(); if (receipt.assetState !== "ready") throw blocked("stage-unavailable");
            progress("photos", index + 1, saved.stageReceipts.length);
          }
          if (!await validateAdminTemplatePhotoWholeCopyStages(saved.intent, saved.stageReceipts)) throw blocked("stages");
          guard();
          progress("confirming", saved.stageReceipts.length, saved.stageReceipts.length);
          return admitted(async () => {
            await refresh(); await capabilities();
            const metadata = commandMetadata(saved); guard(); transport.assertWritable(commandPath, "POST", metadata);
            saved = persist({ ...saved, dispatched: true }, saved, guard);
            try {
              await transport.beginWrite(commandPath, "POST", null, metadata); guard();
              return await settle(await request(commandPath, { method: "POST", headers: { "content-type": "application/json" }, body: canonical(envelope) }));
            } catch (cause) { transport.noteFailure(cause, commandPath, "POST", id); guard(); const recovered = await inspect(); if (recovered) return recovered; throw cause; }
          });
        });
      } finally { for (const event of ["beforeunload", "pagehide"]) lifecycleTarget?.removeEventListener(event, abort); }
    })();
  };
  return Object.freeze({
    binding,
    async capture(input) {
      const initial = context(), guard = () => localGuard(initial), action = clone(input);
      if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey) throw blocked("action");
      const intent = adminTemplatePhotoWholeCopyIntent({ ...binding, ...action });
      return withLock(intent.id, async () => {
        guard(); const record = await loadRecord(intent.id, guard); if (!same(record.action, action)) throw blocked("record");
        const previous = await read(intent.id, guard);
        if (previous) { if (!same(previous.intent, intent) || previous.recordIntentHash !== record.intentHash) throw blocked("journal"); return clone(previous); }
        writing(); const payloadDigest = await digest(intent); guard();
        return clone(persist({ version: 1, kind, intent, payloadDigest, recordIntentHash: record.intentHash, dispatched: false,
          stageReceipts: record.stages.map(() => null), receipt: null }, null, guard));
      });
    },
    async read(id) { const initial = context(); return clone(await read(id, () => localGuard(initial))); },
    async list() {
      const initial = context(), guard = () => localGuard(initial), ids = [];
      for (let index = 0; index < storage.length; index++) { const name = storage.key(index); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length)); }
      const result = []; for (const id of ids.sort()) { const saved = await read(id, guard); guard(); if (!saved) throw blocked("journal-changed"); result.push(saved); }
      guard(); return clone(result);
    },
    run: id => execute(id, "run"), inspect: id => execute(id, "inspect"), cancel: id => execute(id, "cancel"),
    inspectStage: (id, stageId) => { if (!validTemplateOperationId(stageId)) throw blocked("operation-id"); return execute(id, stageId); }
  });
}
