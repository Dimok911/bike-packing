import { personalAccessIntent, canonicalAccessJson, validAccessOperationId,
  PERSONAL_LIST_ACCESS_ENABLED, PERSONAL_LIST_ACCESS_CAPABILITY } from "./personal-access-protocol.js";

const environment = "bike-packing-experiment";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalAccessJson(a) === canonicalAccessJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const shareId = value => typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const blocked = () => Object.assign(Error("Действие доступа сохранено и требует сверки. Исходное приглашение не заменено."),
  { code: "personal-access-paused", isPersonalSaveBlocked: true });
const digest = async intent => {
  const { id, ...binding } = intent;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalAccessJson(binding)))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export function validatePersonalAccessReceipt(receipt, expected) {
  try {
    const { intent, payloadDigest } = expected, operation = receipt?.operation;
    if (!operation || !exact(operation, ["id", "environment", "actorId", "listId", "kind", "payloadDigest", "state"])
      || ["id", "environment", "actorId", "listId", "kind"].some(key => operation[key] !== intent[key])
      || operation.payloadDigest !== payloadDigest) return false;
    if (operation.state === "waiting") {
      const allowed = [intent.body.dataSource?.operationId, intent.body.expectedGrant?.grantOperationId,
        intent.body.grant?.grantOperationId, intent.body.grantOperationId].filter(Boolean);
      return exact(receipt, ["operation", "result", "waiting"]) && receipt.result === null
        && exact(receipt.waiting, ["code", "operationIds", "retrySameOperation"])
        && receipt.waiting.code === "access_dependency_not_committed" && receipt.waiting.retrySameOperation === true
        && receipt.waiting.operationIds.length === 1 && allowed.includes(receipt.waiting.operationIds[0]);
    }
    if (!exact(receipt, ["operation", "result"]) || !exact(receipt.result, ["status", "payload"])) return false;
    const result = receipt.result, payload = result.payload;
    if (operation.state === "rejected") {
      if (result.status !== 409 || payload?.ok !== false || !/^[a-z_]{1,80}$/.test(payload.code)) return false;
      if (payload.code !== "operation_cancelled") return exact(payload, ["ok", "code"]);
      return exact(payload, ["ok", "code", "cancellation"]) && same(payload.cancellation, {
        version: 1, operationId: intent.id, noBusinessEffects: true, operationCannotApply: true });
    }
    if (operation.state !== "committed" || result.status !== 200 || payload?.ok !== true) return false;
    const grant = payload.grant;
    if (intent.kind === "access.grant") return exact(payload, ["ok", "grant"])
      && exact(grant, ["shareId", "grantOperationId", "recipientEmail", "role", "sourceStateRevision"])
      && shareId(grant.shareId) && grant.grantOperationId === intent.id && grant.recipientEmail === intent.body.recipientEmail
      && grant.role === intent.body.role && Number.isSafeInteger(grant.sourceStateRevision) && grant.sourceStateRevision > 0
      && (intent.body.dataSource.stateRevision === undefined || grant.sourceStateRevision === intent.body.dataSource.stateRevision);
    if (intent.kind === "access.revoke") return exact(payload, ["ok", "grant", "revoked"])
      && payload.revoked === true && same(grant, intent.body.grant);
    return exact(payload, ["ok", "grant", "accepted"]) && payload.accepted === true
      && exact(grant, ["shareId", "grantOperationId", "role"]) && shareId(grant.shareId)
      && ["viewer", "editor"].includes(grant.role)
      && (intent.body.version === 2 ? grant.grantOperationId === null && grant.shareId === intent.body.shareId
        : grant.grantOperationId === intent.body.grantOperationId);
  } catch { return false; }
}

// Access has its own durable namespace: a recipient must never become the
// owner of a personal-save queue. Each ID keeps its original secret privately;
// the shared transport journal receives only a digest and scope metadata.
export function createPersonalAccessClient({ binding, getContext, transport, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, fetchImpl = (...args) => globalThis.fetch(...args), enabled = PERSONAL_LIST_ACCESS_ENABLED } = {}) {
  if (!exact(binding, ["actorId", "environment", "listId"]) || binding.environment !== environment) throw blocked();
  binding = clone(binding);
  const prefix = "bike-packing-access-v1:" + encodeURIComponent(canonicalAccessJson(binding)) + ":";
  const key = id => { if (!validAccessOperationId(id)) throw blocked(); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (!value || value.actorId !== binding.actorId || value.environment !== environment
      || value.scope !== "personal" || value.scopeKey !== "id:" + binding.actorId || !value.generation) throw blocked();
    return clone(value);
  };
  const guard = initial => { if (!same(context(), initial)) throw blocked(); };
  const read = async id => {
    const raw = storage?.getItem(key(id));
    if (raw == null) return null;
    const saved = JSON.parse(raw);
    if (!exact(saved, ["version", "intent", "payloadDigest", "dispatched", "cancelRequested", "receipt"])
      || saved.version !== 1 || typeof saved.dispatched !== "boolean" || typeof saved.cancelRequested !== "boolean"
      || !same(saved.intent, personalAccessIntent({ ...binding, operationId: id, kind: saved.intent?.kind, body: saved.intent?.body }))
      || saved.payloadDigest !== await digest(saved.intent)
      || saved.receipt !== null && !validatePersonalAccessReceipt(saved.receipt, saved)) throw blocked();
    return saved;
  };
  const persist = (saved, initial) => {
    guard(initial);
    const serialized = canonicalAccessJson(saved);
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
    const response = await fetchImpl(transport.apiUrl(path), { credentials: "include", cache: "no-store", redirect: "error", ...options });
    guard(initial);
    const data = await response.json(); guard(initial);
    if (response.status !== 200 || data?.ok !== true) throw Object.assign(blocked(), { status: response.status });
    return data;
  };
  const identity = async initial => {
    guard(initial); await transport.prepare(); guard(initial);
    const me = await request("/auth/me", initial);
    if (me.user?.id !== binding.actorId) throw blocked();
  };
  const metadata = saved => ({ type: "access", protocol: "access-v1", environment, operationId: saved.intent.id,
    actorId: binding.actorId, listId: binding.listId, kind: saved.intent.kind, payloadDigest: saved.payloadDigest });
  const checkTransport = saved => {
    const entry = transport.writes.find(value => value.id === saved.intent.id);
    if (entry && (!same(entry.recovery, metadata(saved)) || entry.mode !== transport.mode)) throw blocked();
    return entry;
  };
  const settle = (saved, data, initial) => {
    const { ok, ...receipt } = data;
    if (ok !== true || !validatePersonalAccessReceipt(receipt, saved)) throw blocked();
    if (saved.receipt && saved.receipt.operation.state !== "waiting" && !same(saved.receipt, receipt)) throw blocked();
    persist({ ...saved, receipt }, initial);
    const entry = checkTransport(saved);
    if (entry && receipt.operation.state !== "waiting"
      && transport.confirmWrite(saved.intent.id, { receipt }) !== true) throw blocked();
    return clone(receipt);
  };
  const inspect = async (saved, initial) => {
    checkTransport(saved);
    const result = await request("/bike-packing/access-operations/" + saved.intent.id, initial);
    if (exact(result, ["ok", "operation"]) && exact(result.operation, ["id", "state"])
      && result.operation.id === saved.intent.id && result.operation.state === "unknown") return null;
    return settle(saved, result, initial);
  };
  const execute = async (id, cancel) => {
    writable(); const initial = context();
    return withLock(id, async () => {
      guard(initial); let saved = await read(id); guard(initial);
      if (!saved) throw blocked();
      if (cancel && !saved.cancelRequested) saved = persist({ ...saved, cancelRequested: true }, initial);
      await identity(initial);
      const receipt = await inspect(saved, initial);
      if (receipt && receipt.operation.state !== "waiting") return receipt;
      if (saved.receipt && saved.receipt.operation.state !== "waiting") throw blocked();
      saved = await read(id); guard(initial);
      const capabilities = await request("/bike-packing/capabilities", initial);
      if (capabilities.service !== "bikepacking-api" || !capabilities.capabilities?.includes(PERSONAL_LIST_ACCESS_CAPABILITY)) throw blocked();
      const recovery = metadata(saved), gateway = "/bike-packing/access-operations";
      const path = saved.cancelRequested ? gateway + "/" + id + "/cancel" : gateway;
      const envelope = { expectedActorId: binding.actorId, environment, operationId: id, listId: binding.listId,
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
    });
  };
  return Object.freeze({
    async capture({ operationId, kind, body }) {
      writable(); const initial = context();
      // Freeze before the first asynchronous operation or cross-tab lock.
      const intent = personalAccessIntent({ ...binding, operationId, kind, body });
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
      return withLock(operationId, async () => {
        guard(initial); const saved = await read(operationId); guard(initial);
        if (!saved) throw blocked();
        await identity(initial);
        return inspect(saved, initial);
      });
    },
    run: operationId => execute(operationId, false),
    cancel: operationId => execute(operationId, true),
  });
}
