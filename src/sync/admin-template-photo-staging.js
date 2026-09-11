import { canonicalTemplateJson, TEMPLATE_OPERATION_CAPABILITY } from "./admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, TEMPLATE_PHOTO_APPEND_CAPABILITY, adminTemplatePhotoStageManifest,
  adminTemplatePhotoStageDigest, validateAdminTemplatePhotoStageReceipt } from "./admin-template-photo-append-protocol.js";

const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const clone = value => JSON.parse(canonicalTemplateJson(value));
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = (code = "admin-template-photo-stage-paused") => Object.assign(Error("Загрузка фото шаблона требует сверки. Сохранённый файл и действие остаются на устройстве."),
  { code, isAdminTemplateBlocked: true, isAmbiguousMutation: true });
const path = "/bike-packing/admin/template-photo-assets";

// This client can only upload the exact bytes from the administrative IDB
// record. It never attaches a photo or advances a template revision.
export function createAdminTemplatePhotoStaging({ store, getContext, transport, locks = globalThis.navigator?.locks,
  fetchImpl = (...args) => globalThis.fetch(...args), lifecycleTarget = globalThis.window, timeoutMs = 10000,
  enabled = ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED } = {}) {
  const binding = clone(store?.binding);
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment") throw paused();
  const context = () => {
    const current = getContext?.();
    if (!current || current.scope !== "admin-template" || current.admin !== true || !current.generation
      || Object.keys(binding).some(key => current[key] !== binding[key])) throw paused("admin-template-photo-stage-context");
    return clone(current);
  };
  const run = async (actionId, stageId, inspectOnly) => {
    if (!transport?.experiment || !inspectOnly && enabled !== true) throw paused("admin-template-photo-stage-disabled");
    const initial = context(), controller = new AbortController();
    const abort = () => controller.abort(), guard = () => {
      if (controller.signal.aborted || !same(context(), initial)) throw paused("admin-template-photo-stage-context");
    };
    for (const event of ["beforeunload", "pagehide"]) lifecycleTarget?.addEventListener(event, abort, { once: true });
    const request = async (url, options = {}) => {
      guard(); let timer;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetchImpl(transport.apiUrl(url), { credentials: "include", cache: "no-store", redirect: "error",
              ...options, signal: controller.signal });
            const data = await response.json(); guard();
            if (response.status !== 200 || data?.ok !== true) throw Object.assign(paused(), { status: response.status });
            return data;
          })(),
          new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(paused()); }, timeoutMs); }),
        ]);
      } finally { clearTimeout(timer); }
    };
    try {
      if (!locks?.request) throw paused("admin-template-photo-stage-lock");
      return await locks.request(`bike-packing-admin-photo-stage-v1:${binding.actorId}:${binding.listId}`, async () => {
        guard();
        const record = await store.readStage(actionId, stageId); guard();
        if (!record || !same(record.binding, binding) || record.action?.operationId !== actionId) throw paused();
        const manifest = adminTemplatePhotoStageManifest(record.stage), assetDigest = await adminTemplatePhotoStageDigest(manifest); guard();
        if (manifest.operationId !== stageId || manifest.templateOperationId !== actionId
          || Object.keys(binding).some(key => manifest[key] !== binding[key])
          || !/^[a-f0-9]{64}$/.test(record.intentHash)) throw paused();
        const expected = { manifest, assetDigest }, metadata = { type: "admin-template-photo-stage", protocol: "admin-template-photo-stage-v1",
          ...binding, operationId: stageId, actionOperationId: actionId, assetDigest, intentHash: record.intentHash };
        const entry = () => {
          const found = transport.writes.find(value => value.id === stageId);
          if (found && (found.path !== path || found.method !== "POST" || found.mode !== transport.mode || !same(found.recovery, metadata))) throw paused();
          return found;
        };
        await transport.prepare(); guard();
        const me = await request("/auth/me");
        if (me.user?.id !== binding.actorId) throw paused("admin-template-photo-stage-context");
        const rights = await request("/bike-packing/authorization");
        if (rights.authorization?.version !== 1 || rights.authorization.role !== "admin" || !rights.authorization.capabilities?.includes("templates:write")) throw paused();
        entry();
        const settle = async data => {
          if (!await validateAdminTemplatePhotoStageReceipt(data, expected)) throw paused();
          guard(); const prior = entry();
          if (prior?.confirmed && !same(prior.receipt?.receipt, data.receipt)) throw paused();
          if (prior && transport.confirmWrite(stageId, { receipt: data }) !== true) throw paused("admin-template-photo-stage-receipt-storage");
          guard();
          if (!inspectOnly && data.assetState !== "ready") throw paused("admin-template-photo-stage-unavailable");
          return clone(data);
        };
        const known = await request(`${path}/${encodeURIComponent(stageId)}`);
        if (await validateAdminTemplatePhotoStageReceipt(known, expected)) return settle(known);
        guard();
        if (!exact(known, ["ok", "operation"]) || !exact(known.operation, ["id", "environment", "actorId", "state"])
          || known.operation.id !== stageId || known.operation.environment !== binding.environment
          || known.operation.actorId !== binding.actorId || known.operation.state !== "unknown" || entry()?.confirmed) throw paused();
        if (inspectOnly) return clone(known);
        const capabilities = await request("/bike-packing/capabilities");
        if (capabilities.service !== "bikepacking-api" || ![TEMPLATE_OPERATION_CAPABILITY, TEMPLATE_PHOTO_APPEND_CAPABILITY]
          .every(value => capabilities.capabilities?.includes(value))) throw paused("admin-template-photo-stage-capability");
        if (entry()) throw paused();
        transport.assertWritable(path, "POST", metadata);
        const claim = await store.claimStage(actionId, stageId); guard();
        if (!claim?.fresh || claim.stageOperationId !== stageId || claim.actionOperationId !== actionId
          || claim.intentHash !== record.intentHash || claim.assetDigest !== assetDigest) throw paused();
        // The durable IDB claim precedes both transport registration and the
        // request. Losing/clearing the latter can never permit a second upload.
        const form = new FormData(); form.set("manifest", canonicalTemplateJson(manifest));
        form.set("file", record.file, manifest.file.fileName);
        if (record.thumb) form.set("thumb", record.thumb, "thumb");
        await transport.beginWrite(path, "POST", form, metadata); guard();
        try { return await settle(await request(path, { method: "POST", body: form })); }
        catch (error) {
          if (error.code === "admin-template-photo-stage-unavailable" || error.code === "admin-template-photo-stage-receipt-storage") throw error;
          transport.noteFailure(error, path, "POST", stageId); guard();
          return settle(await request(`${path}/${encodeURIComponent(stageId)}`));
        }
      });
    } finally { for (const event of ["beforeunload", "pagehide"]) lifecycleTarget?.removeEventListener(event, abort); }
  };
  return Object.freeze({ stage: (actionId, stageId) => run(actionId, stageId, false), inspect: (actionId, stageId) => run(actionId, stageId, true) });
}
