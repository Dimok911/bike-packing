import { adminTemplateIntent, canonicalTemplateJson, validTemplateOperationId, ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Сохранение шаблона ожидает продолжения исходного действия."), { code: "admin-template-plan-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// A full save and a visibility choice are distinct SQL effects, with fixed IDs
// and dependencies captured together. An existing public template is hidden
// BEFORE saving changes when the user explicitly chose to keep it private.
export function adminTemplateSavePlan({ binding, operationId, publicationId = null, base, exists, visibility, payload, metadata, published = null, indexes = [] }) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || typeof exists !== "boolean" || ![null, "private", "public"].includes(visibility)
    || exists !== (visibility !== null) || ![null, true, false].includes(published)
    || !exists && base !== null || !Array.isArray(indexes)) throw paused();
  const needsPublication = published === true || published === false && visibility === "public";
  if (needsPublication ? !validTemplateOperationId(publicationId) || publicationId === operationId : publicationId !== null) throw paused();
  if (!needsPublication && indexes.length || published !== false && indexes.length) throw paused();
  const capture = (id, kind, body) => adminTemplateIntent({ ...binding, operationId: id, kind, body });
  const hidingFirst = needsPublication && published === false;
  const write = capture(operationId, exists ? "template.save" : "template.create", {
    version: 1, base: hidingFirst ? { operationId: publicationId } : base, payload, metadata,
  });
  const publication = needsPublication ? capture(publicationId, "template.publication", {
    version: 1, base: hidingFirst ? base : { operationId }, published, indexes,
  }) : null;
  return { version: 1, id: operationId, binding: clone(binding), requestedPublication: published,
    operations: publication ? hidingFirst ? [publication, write] : [write, publication] : [write] };
}

function validatePlan(plan) {
  if (!exact(plan, ["version", "id", "binding", "requestedPublication", "operations"]) || plan.version !== 1
    || !validTemplateOperationId(plan.id) || ![null, true, false].includes(plan.requestedPublication)
    || !Array.isArray(plan.operations) || ![1, 2].includes(plan.operations.length)) throw paused();
  const write = plan.operations.find(operation => ["template.create", "template.save"].includes(operation.kind));
  const publication = plan.operations.find(operation => operation.kind === "template.publication");
  if (!write || write.id !== plan.id) throw paused();
  const hidingFirst = publication?.body.published === false;
  const expected = adminTemplateSavePlan({ binding: plan.binding, operationId: plan.id, publicationId: publication?.id || null,
    exists: write.kind !== "template.create", visibility: write.kind === "template.create" ? null : hidingFirst ? "public" : "private",
    base: hidingFirst ? publication.body.base : write.body.base, payload: write.body.payload, metadata: write.body.metadata,
    published: plan.requestedPublication, indexes: publication?.body.indexes || [] });
  if (!same(plan, expected)) throw paused();
  return plan;
}

export function createAdminTemplateSavePlans({ binding, client, getContext, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  binding = clone(binding);
  const prefix = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
  const key = id => { if (!validTemplateOperationId(id)) throw paused(); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (!value || value.actorId !== binding.actorId || value.environment !== binding.environment || value.listId !== binding.listId
      || value.itemKey !== binding.itemKey || value.scope !== "admin-template" || value.admin !== true || !value.generation) throw paused();
    return clone(value);
  };
  const guard = before => { if (!same(context(), before)) throw paused(); };
  const lock = (id, task) => { if (!locks?.request) throw paused(); return locks.request(key(id), task); };
  const persist = (saved, initial) => {
    guard(initial); const encoded = canonicalTemplateJson(saved); storage.setItem(key(saved.plan.id), encoded);
    if (storage.getItem(key(saved.plan.id)) !== encoded) throw paused(); guard(initial); return saved;
  };
  const read = async id => {
    const raw = storage.getItem(key(id)); if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (!exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1 || typeof saved.cancelRequested !== "boolean"
      || saved.plan.id !== id || !same(saved.plan.binding, binding) || saved.digest !== await hash(validatePlan(saved.plan))) throw paused();
    return saved;
  };
  const execute = async (id, cancel) => {
    if (enabled !== true) throw paused(); const initial = context();
    return lock(id, async () => {
      let saved = await read(id); guard(initial); if (!saved) throw paused();
      if (cancel && !saved.cancelRequested) saved = persist({ ...saved, cancelRequested: true }, initial);
      const ordered = saved.cancelRequested ? [...saved.plan.operations].reverse() : saved.plan.operations, receipts = [];
      for (const intent of ordered) {
        guard(initial); await client.capture({ operationId: intent.id, kind: intent.kind, body: intent.body }); guard(initial);
        const receipt = await client[saved.cancelRequested ? "cancel" : "run"](intent.id); guard(initial); receipts.push(receipt);
        if (!saved.cancelRequested && receipt.operation.state !== "committed") return { state: receipt.operation.state, receipts };
        if (receipt.operation.state === "waiting") return { state: "waiting", receipts };
      }
      const cancelled = receipts.some(receipt => receipt.result?.payload?.code === "operation_cancelled");
      const rejected = receipts.some(receipt => receipt.operation.state === "rejected");
      return { state: cancelled ? "cancelled" : rejected ? "rejected" : "committed", receipts };
    });
  };
  return Object.freeze({
    async capture(input) {
      if (enabled !== true) throw paused(); const initial = context();
      const plan = adminTemplateSavePlan({ ...input, binding }); // Freeze before hashing or acquiring a cross-tab lock.
      const saved = { version: 1, plan, digest: await hash(plan), cancelRequested: false }; guard(initial);
      return lock(plan.id, async () => {
        const existing = await read(plan.id); guard(initial);
        if (existing) { if (!same(existing.plan, plan)) throw paused(); return clone(existing); }
        return clone(persist(saved, initial));
      });
    },
    async read(id) { const initial = context(), saved = await read(id); guard(initial); return clone(saved); },
    async list() {
      const initial = context(), ids = [];
      for (let i = 0; i < storage.length; i++) { const name = storage.key(i); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length)); }
      const entries = []; for (const id of ids) { const entry = await read(id); if (entry) entries.push(entry); }
      guard(initial); return clone(entries);
    },
    run: id => execute(id, false), cancel: id => execute(id, true),
  });
}
