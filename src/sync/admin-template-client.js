import { adminTemplateIntent, canonicalTemplateJson, validTemplateOperationId, validTemplatePersonalSourceId, ADMIN_TEMPLATE_OPERATIONS_ENABLED,
  TEMPLATE_OPERATION_CAPABILITY, TEMPLATE_COPY_CAPABILITY, TEMPLATE_SOURCE_SAVE_CAPABILITY, TEMPLATE_PERSONAL_SOURCE_SAVE_CAPABILITY, TEMPLATE_PENDING_SOURCE_CAPABILITY, TEMPLATE_PENDING_PERSONAL_SOURCE_CAPABILITY } from "./admin-template-protocol.js";
const environment = "bike-packing-experiment";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const blocked = () => Object.assign(Error("Изменение шаблона сохранено и требует сверки. Продолжите исходное действие."),
  { code: "admin-template-paused", isAdminTemplateBlocked: true });
const digest = async intent => {
  const { id, ...binding } = intent;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(binding)))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export function validateAdminTemplateReceipt(receipt, expected) {
  try {
    const { intent, payloadDigest } = expected, operation = receipt?.operation;
    if (!exact(operation, ["id", "environment", "actorId", "listId", "itemKey", "kind", "payloadDigest", "state"])
      || ["id", "environment", "actorId", "listId", "itemKey", "kind"].some(key => operation[key] !== intent[key])
      || operation.payloadDigest !== payloadDigest) return false;
    if (operation.state === "waiting") {
      const allowed = [intent.body.base?.operationId, intent.body.source?.base?.operationId,
        ...(intent.body.indexes || []).map(index => index.base.operationId)].filter(Boolean);
      return exact(receipt, ["operation", "result", "waiting"]) && receipt.result === null
        && exact(receipt.waiting, ["code", "operationIds", "retrySameOperation"])
        && receipt.waiting.code === "template_dependency_not_committed" && receipt.waiting.retrySameOperation === true
        && Array.isArray(receipt.waiting.operationIds) && receipt.waiting.operationIds.length === 1 && allowed.includes(receipt.waiting.operationIds[0]);
    }
    if (!exact(receipt, ["operation", "result"]) || !exact(receipt.result, ["status", "payload"])) return false;
    const result = receipt.result, payload = result.payload;
    if (operation.state === "rejected") {
      if (![403,404,409].includes(result.status) || payload?.ok !== false || !/^[a-z_]{1,80}$/.test(payload.code)) return false;
      if (payload.code !== "operation_cancelled") return exact(payload, ["ok", "code"]);
      return result.status === 409 && exact(payload, ["ok", "code", "cancellation"]) && same(payload.cancellation, {
        version: 1, operationId: intent.id, noBusinessEffects: true, operationCannotApply: true });
    }
    const deleted = intent.kind === "template.delete";
    if (operation.state !== "committed" || result.status !== 200 || !exact(payload, ["ok", "listId", "itemKey", "stateRevision", deleted ? "deleted" : "visibility", "indexes"])
      || payload.ok !== true || payload.listId !== intent.listId || payload.itemKey !== intent.itemKey
      || !Number.isSafeInteger(payload.stateRevision) || payload.stateRevision < 1
      || ["template.create", "template.copy"].includes(intent.kind) && payload.stateRevision !== 1
      || intent.body.base?.stateRevision && payload.stateRevision !== intent.body.base.stateRevision + 1
      || (deleted ? payload.deleted !== true : !["private", "public"].includes(payload.visibility))) return false;
    if (!deleted && (["template.create", "template.copy", "template.archive"].includes(intent.kind) && payload.visibility !== "private"
      || intent.kind === "template.publication" && payload.visibility !== (intent.body.published ? "public" : "private"))) return false;
    const indexes = intent.body.indexes || [];
    return Array.isArray(payload.indexes) && payload.indexes.length === indexes.length
      && new Set(payload.indexes.map(index => index.listId)).size === indexes.length
      && payload.indexes.every(index => {
        const expected = indexes.find(value => value.listId === index.listId);
        return expected && exact(index, ["listId", "stateRevision"]) && Number.isSafeInteger(index.stateRevision) && index.stateRevision > 0
          && (expected.base.stateRevision === undefined || index.stateRevision === expected.base.stateRevision + 1);
      });
  } catch { return false; }
}

// Independent administrative storage, actor checks and rights. Private owner
// journals cannot confer administrator authority or absorb these confirmations.
export function createAdminTemplateClient({ binding, getContext, transport, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, fetchImpl = (...args) => globalThis.fetch(...args), lifecycleTarget = globalThis.window,
  enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED } = {}) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== environment) throw blocked();
  binding = clone(binding);
  const prefix = "bike-packing-admin-template-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
  const key = id => { if (!validTemplateOperationId(id)) throw blocked(); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (!value || value.actorId !== binding.actorId || value.environment !== environment
      || value.scope !== "admin-template" || value.admin !== true || value.listId !== binding.listId || value.itemKey !== binding.itemKey || !value.generation) throw blocked();
    return clone(value);
  };
  const liveExecutions = new WeakMap();
  const guard = initial => {
    liveExecutions.get(initial)?.throwIfAborted();
    if (!same(context(), initial)) throw blocked();
  };
  const withLiveDocument = async (initial, task) => {
    // Cancel the whole attempt, including gaps between requests. The journal
    // survives; a later attempt reconciles the original operation ID.
    const controller = new AbortController(), abort = () => controller.abort();
    const events = ["beforeunload", "pagehide"];
    liveExecutions.set(initial, controller.signal);
    for (const event of events) lifecycleTarget?.addEventListener(event, abort, { once: true });
    try { return await task(); }
    finally {
      for (const event of events) lifecycleTarget?.removeEventListener(event, abort);
      liveExecutions.delete(initial);
    }
  };
  const read = async id => {
    const raw = storage?.getItem(key(id));
    if (raw == null) return null;
    const saved = JSON.parse(raw);
    if (!exact(saved, ["version", "intent", "payloadDigest", "dispatched", "cancelRequested", "receipt"])
      || saved.version !== 1 || typeof saved.dispatched !== "boolean" || typeof saved.cancelRequested !== "boolean"
      || !same(saved.intent, adminTemplateIntent({ ...binding, operationId: id, kind: saved.intent?.kind, body: saved.intent?.body }))
      || saved.payloadDigest !== await digest(saved.intent)
      || saved.receipt !== null && !validateAdminTemplateReceipt(saved.receipt, saved)) throw blocked();
    return saved;
  };
  const persist = (saved, initial) => {
    guard(initial);
    const serialized = canonicalTemplateJson(saved);
    if (!storage) throw blocked();
    storage.setItem(key(saved.intent.id), serialized);
    if (storage.getItem(key(saved.intent.id)) !== serialized) throw blocked();
    guard(initial);
    return saved;
  };
  const withLock = (id, task) => {
    if (!locks?.request) throw blocked();
    return locks.request(key(id), task);
  };
  const writable = () => { if (enabled !== true || !transport?.experiment) throw blocked(); };
  const request = async (path, initial, options = {}) => {
    guard(initial);
    const response = await fetchImpl(transport.apiUrl(path), { credentials: "include", cache: "no-store", redirect: "error", ...options,
      signal: liveExecutions.get(initial) });
    guard(initial);
    const data = await response.json(); guard(initial);
    if (response.status !== 200 || data?.ok !== true) throw Object.assign(blocked(), { status: response.status });
    return data;
  };
  const identity = async initial => {
    guard(initial); await transport.prepare(); guard(initial);
    const me = await request("/auth/me", initial);
    if (me.user?.id !== binding.actorId) throw blocked();
    const authorization = await request("/bike-packing/authorization", initial);
    if (authorization.authorization?.version !== 1 || authorization.authorization?.role !== "admin" || !authorization.authorization.capabilities?.includes("templates:write")) throw blocked();
  };
  const metadata = saved => ({ type: "admin-template", protocol: "admin-template-v1", environment, operationId: saved.intent.id,
    actorId: binding.actorId, listId: binding.listId, itemKey: binding.itemKey, kind: saved.intent.kind, payloadDigest: saved.payloadDigest });
  const checkTransport = saved => {
    const entry = transport.writes.find(value => value.id === saved.intent.id);
    if (entry && (!same(entry.recovery, metadata(saved)) || entry.mode !== transport.mode)) throw blocked();
    return entry;
  };
  const settle = (saved, data, initial) => {
    const { ok, ...receipt } = data;
    if (ok !== true || !validateAdminTemplateReceipt(receipt, saved)) throw blocked();
    if (saved.receipt && saved.receipt.operation.state !== "waiting" && !same(saved.receipt, receipt)) throw blocked();
    persist({ ...saved, receipt }, initial);
    const entry = checkTransport(saved);
    if (entry && receipt.operation.state !== "waiting"
      && transport.confirmWrite(saved.intent.id, { receipt }) !== true) throw blocked();
    return clone(receipt);
  };
  const inspect = async (saved, initial) => {
    checkTransport(saved);
    const result = await request("/bike-packing/admin/template-operations/" + saved.intent.id, initial);
    if (exact(result, ["ok", "operation"]) && exact(result.operation, ["id", "state"])
      && result.operation.id === saved.intent.id && result.operation.state === "unknown") return null;
    return settle(saved, result, initial);
  };
  const execute = async (id, cancel) => {
    writable(); const initial = context();
    return withLiveDocument(initial, () => withLock(id, async () => {
      guard(initial); let saved = await read(id); guard(initial);
      if (!saved) throw blocked();
      if (cancel && !saved.cancelRequested) saved = persist({ ...saved, cancelRequested: true }, initial);
      await identity(initial);
      const receipt = await inspect(saved, initial);
      if (receipt && receipt.operation.state !== "waiting") return receipt;
      if (saved.receipt && saved.receipt.operation.state !== "waiting") throw blocked();
      saved = await read(id); guard(initial);
      const capabilities = await request("/bike-packing/capabilities", initial);
      if (capabilities.service !== "bikepacking-api" || !capabilities.capabilities?.includes(TEMPLATE_OPERATION_CAPABILITY)) throw blocked();
      if (saved.intent.kind === "template.copy" && !capabilities.capabilities.includes(TEMPLATE_COPY_CAPABILITY)) throw blocked();
      if (saved.intent.kind === "template.save" && saved.intent.body.source
        && !capabilities.capabilities.includes(TEMPLATE_SOURCE_SAVE_CAPABILITY)) throw blocked();
      if (saved.intent.body.source?.kind === "personal-list"
        && !capabilities.capabilities.includes(TEMPLATE_PERSONAL_SOURCE_SAVE_CAPABILITY)) throw blocked();
      if (saved.intent.body.source?.base?.operationId
        && !capabilities.capabilities.includes(TEMPLATE_PENDING_SOURCE_CAPABILITY)) throw blocked();
      if (saved.intent.body.source?.kind === "personal-list" && saved.intent.body.source.base.operationId
        && !capabilities.capabilities.includes(TEMPLATE_PENDING_PERSONAL_SOURCE_CAPABILITY)) throw blocked();
      const recovery = metadata(saved), gateway = "/bike-packing/admin/template-operations";
      const path = saved.cancelRequested ? gateway + "/" + id + "/cancel" : gateway;
      const envelope = { expectedActorId: binding.actorId, environment, operationId: id, listId: binding.listId, itemKey: binding.itemKey,
        kind: saved.intent.kind, body: saved.intent.body };
      transport.assertWritable(path, "POST", recovery);
      saved = persist({ ...saved, dispatched: true }, initial);
      if (!checkTransport(saved)) await transport.beginWrite(gateway, "POST", null, recovery);
      guard(initial);
      try {
        return settle(saved, await request(path, initial, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope) }), initial);
      } catch (error) {
        transport.noteFailure(error, path, "POST", id);
        guard(initial);
        const recovered = await inspect(saved, initial);
        if (recovered) return recovered;
        throw error;
      }
    }));
  };
  return Object.freeze({
    async preparePersonalSource(personalListId) {
      if (!validTemplatePersonalSourceId(personalListId)) throw blocked();
      const initial = context();
      return withLiveDocument(initial, async () => {
        await identity(initial);
        const result = await request("/bike-packing/admin/template-operations/prepare", initial, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personalListId }) });
        if (result.actorId !== binding.actorId || result.environment !== environment || result.listId !== personalListId) throw blocked();
        return clone(result);
      });
    },
    async prepare() {
      const initial = context();
      return withLiveDocument(initial, async () => {
        await identity(initial);
        const result = await request("/bike-packing/admin/template-operations/prepare", initial, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemKey: binding.itemKey }) });
        if (result.actorId !== binding.actorId || result.environment !== environment || result.listId !== binding.listId || result.itemKey !== binding.itemKey) throw blocked();
        return clone(result);
      });
    },
    async list() {
      const initial = context(), ids = [];
      for (let i = 0; i < storage.length; i++) { const name = storage.key(i); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length)); }
      const entries = [];
      for (const id of ids) { const entry = await read(id); if (entry) entries.push(entry); }
      guard(initial); return clone(entries);
    },
    async capture({ operationId, kind, body }) {
      writable(); const initial = context();
      // Freeze before the first asynchronous operation or cross-tab lock.
      const intent = adminTemplateIntent({ ...binding, operationId, kind, body });
      const saved = { version: 1, intent, payloadDigest: await digest(intent), dispatched: false, cancelRequested: false, receipt: null };
      guard(initial);
      return withLock(operationId, async () => {
        guard(initial); const existing = await read(operationId); guard(initial);
        if (existing) { if (!same(existing.intent, intent) || existing.payloadDigest !== saved.payloadDigest) throw blocked(); return clone(existing); }
        return clone(persist(saved, initial));
      });
    },
    async read(operationId) { const initial = context(), saved = await read(operationId); guard(initial); return clone(saved); },
    async inspect(operationId) {
      const initial = context();
      return withLiveDocument(initial, () => withLock(operationId, async () => {
        guard(initial); const saved = await read(operationId); guard(initial);
        if (!saved) throw blocked();
        await identity(initial);
        return inspect(saved, initial);
      }));
    },
    run: operationId => execute(operationId, false),
    cancel: operationId => execute(operationId, true),
  });
}
