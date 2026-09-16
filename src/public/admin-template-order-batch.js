import { adminTemplateIntent, canonicalTemplateJson, validTemplateOperationId, ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "../sync/admin-template-protocol.js";
import { adminTemplateEditorSource } from "./admin-template-causal-save-flow.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../sync/admin-template-capture-lease.js";

const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const paused = () => Object.assign(Error("Порядок шаблонов сохранён для сверки. Продолжите исходный порядок перед новым изменением."),
  { code: "admin-template-order-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const bindingFor = intent => Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]]));
const orderPrefix = actorId => "bike-packing-admin-order-v1:" + encodeURIComponent(actorId) + ":";
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

function selection(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((section, index) => !exact(section, ["id", "layouts"])
    || section.id !== ["demo", "shared", "personal"][index] || !Array.isArray(section.layouts)
    || section.layouts.some(id => typeof id !== "string" || !id.trim()))) throw paused();
  const ids = value.flatMap(section => section.layouts);
  if (new Set(ids).size !== ids.length) throw paused();
  return clone(value);
}

function validatePlan(plan, actorId) {
  if (!exact(plan, ["version", "id", "actorId", "environment", "selection", "entries"]) || plan.version !== 1
    || !validTemplateOperationId(plan.id) || plan.actorId !== actorId || plan.environment !== "bike-packing-experiment"
    || !Array.isArray(plan.entries) || !plan.entries.length) throw paused();
  const chosen = selection(plan.selection), publicIds = chosen.slice(0, 2).flatMap(section => section.layouts);
  if (new Set(plan.entries.map(entry => entry?.layoutId)).size !== plan.entries.length
    || new Set(plan.entries.map(entry => entry?.intent?.listId)).size !== plan.entries.length
    || new Set(plan.entries.map(entry => entry?.intent?.id)).size !== plan.entries.length) throw paused();
  for (const entry of plan.entries) {
    const intent = entry?.intent;
    if (!exact(entry, ["layoutId", "intent"]) || !publicIds.includes(entry.layoutId)
      || intent?.actorId !== actorId || intent.environment !== plan.environment || intent.kind !== "template.metadata"
      || intent.body?.metadata?.layoutOrder !== publicIds.indexOf(entry.layoutId) + 1
      || !equal(intent, adminTemplateIntent({ ...intent, operationId: intent.id }))) throw paused();
  }
  return plan;
}

async function decodeOrderRow(raw, id, actorId) {
  if (!validTemplateOperationId(id) || typeof raw !== "string") throw paused();
  const row = JSON.parse(raw);
  if (!exact(row, ["version", "plan", "digest", "applied"]) || row.version !== 1 || typeof row.applied !== "boolean"
    || row.plan?.id !== id || row.digest !== await hash(validatePlan(row.plan, actorId))) throw paused();
  return row;
}

function orderSnapshot(storage, prefix) {
  if (!storage || typeof storage.key !== "function" || typeof storage.getItem !== "function"
    || !Number.isSafeInteger(storage.length) || storage.length < 0) throw paused();
  const names = [];
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index); if (typeof name !== "string") throw paused();
    if (name.startsWith(prefix)) names.push(name);
  }
  if (new Set(names).size !== names.length) throw paused();
  return names.sort().map(name => {
    const raw = storage.getItem(name);
    if (typeof raw !== "string") throw paused();
    return [name, raw];
  });
}

// The caller holds its source/target capture lease. Never take the actor-order
// lock here: order capture already takes actor -> bindings, so doing the inverse
// would deadlock. Applied is descriptive only; it grants no conflict exclusion.
export async function readAdminTemplateOrderInventory({ binding, storage = globalThis.localStorage, guard = () => {} }) {
  binding = adminTemplatePhotoActionBinding(binding);
  if (typeof guard !== "function") throw paused();
  guard();
  const prefix = orderPrefix(binding.actorId), before = orderSnapshot(storage, prefix), entries = [];
  for (const [name, raw] of before) {
    const row = await decodeOrderRow(raw, name.slice(prefix.length), binding.actorId); guard();
    for (const { intent } of row.plan.entries) if (equal(bindingFor(intent), binding)) {
      entries.push({ batchId: row.plan.id, digest: row.digest, applied: row.applied, intent });
    }
  }
  guard(); if (!equal(before, orderSnapshot(storage, prefix))) throw paused();
  return freeze(clone(entries));
}

// One durable selection spans several independently confirmed template writes.
// The actor-wide lock prevents two tabs from replacing an unfinished selection.
export function createAdminTemplateOrderBatch({ actorId, getContext, clientFor, assertNoPending = async () => {},
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, uuid = () => crypto.randomUUID(),
  enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED, assertCaptureAllowed = async () => {} }) {
  const prefix = orderPrefix(actorId);
  const context = () => {
    const value = getContext?.();
    if (enabled !== true || !actorId || value?.actorId !== actorId || value.environment !== "bike-packing-experiment"
      || value.scope !== "admin-template-order" || value.admin !== true || !value.generation) throw paused();
    return clone(value);
  };
  const guard = initial => { if (!equal(context(), initial)) throw paused(); };
  const lock = task => { if (!locks?.request) throw paused(); return locks.request(prefix, task); };
  const key = id => { if (!validTemplateOperationId(id)) throw paused(); return prefix + id; };
  const read = async id => {
    const raw = storage.getItem(key(id)); if (raw === null) return null;
    return decodeOrderRow(raw, id, actorId);
  };
  const persist = (row, initial) => {
    guard(initial); const encoded = canonicalTemplateJson(row); storage.setItem(key(row.plan.id), encoded);
    if (storage.getItem(key(row.plan.id)) !== encoded) throw paused(); guard(initial);
  };
  const confirmed = async (plan, initial) => {
    const receipts = [];
    for (const { intent } of plan.entries) {
      const saved = await clientFor(bindingFor(intent)).read(intent.id); guard(initial);
      if (!saved || !equal(saved.intent, intent) || saved.receipt?.operation?.state !== "committed") return null;
      receipts.push(saved.receipt);
    }
    return receipts;
  };
  const pending = async initial => {
    const ids = [];
    for (let index = 0; index < storage.length; index++) { const name = storage.key(index); if (name?.startsWith(prefix)) ids.push(name.slice(prefix.length)); }
    const active = [];
    for (const id of ids) {
      const row = await read(id); guard(initial); if (!row) throw paused();
      if (row.applied) { if (!await confirmed(row.plan, initial)) throw paused(); }
      else active.push(row);
    }
    if (active.length > 1) throw paused();
    return active[0] || null;
  };
  return Object.freeze({
    async open(targets) {
      const initial = context(), frozen = clone(targets);
      return lock(async () => {
        guard(initial); const existing = await pending(initial); if (existing) return { pending: clone(existing.plan) };
        const rows = [];
        if (new Set(frozen.map(row => row.binding.listId)).size !== frozen.length) throw paused();
        for (const target of frozen) {
          if (target.binding.actorId !== actorId) throw paused();
          await assertNoPending(target.binding); guard(initial);
          const prepared = await clientFor(target.binding).prepare(); guard(initial);
          const source = adminTemplateEditorSource(target.binding, prepared);
          if (!source.exists || source.deleted) throw paused();
          const layout = prepared.payload?.layouts?.[prepared.payload.activeLayoutId] || Object.values(prepared.payload?.layouts || {})[0];
          if (!layout) throw paused();
          const order = layout.layoutOrder == null ? null : Number(layout.layoutOrder);
          if (order !== target.layoutOrder) throw Object.assign(paused(), { message: "Порядок на сервере изменился. Обновите список перед перестановкой." });
          rows.push({ layoutId: target.layoutId, binding: target.binding, base: source.base, layoutOrder: order,
            metadata: { title: prepared.metadata.title, language: prepared.metadata.language } });
        }
        return { session: { context: initial, rows } };
      });
    },
    async capture(session, chosen) {
      if (typeof assertCaptureAllowed !== "function") throw paused();
      const initial = context(), choice = selection(chosen), frozen = clone(session);
      guard(frozen.context);
      const publicIds = choice.slice(0, 2).flatMap(section => section.layouts);
      if (publicIds.length !== frozen.rows.length || frozen.rows.some(row => !publicIds.includes(row.layoutId))) throw paused();
      const entries = frozen.rows.filter(row => row.layoutOrder !== publicIds.indexOf(row.layoutId) + 1).map(row => ({ layoutId: row.layoutId,
        intent: adminTemplateIntent({ ...row.binding, operationId: uuid(), kind: "template.metadata", body: {
          version: 1, base: row.base, metadata: { ...row.metadata, layoutOrder: publicIds.indexOf(row.layoutId) + 1 } } }) }));
      const plan = entries.length ? validatePlan({ version: 1, id: uuid(), actorId, environment: "bike-packing-experiment", selection: choice, entries }, actorId) : null;
      const row = plan ? { version: 1, plan, digest: await hash(plan), applied: false } : null; guard(initial);
      return lock(async () => {
        guard(initial); const existing = await pending(initial);
        if (existing && !equal(existing.plan.selection, choice)) throw paused();
        const selected = existing?.plan || plan;
        if (!selected) return null;
        const bindings = selected.entries.map(entry => bindingFor(entry.intent)), before = orderSnapshot(storage, prefix);
        return withAdminTemplateCapture({ bindings, locks }, async captureLease => {
          const check = () => {
            guard(initial); assertAdminTemplateCaptureLease(captureLease, bindings);
            if (!equal(before, orderSnapshot(storage, prefix))) throw paused();
          };
          check();
          const allowed = await assertCaptureAllowed({ plan: clone(selected), captureLease, guard: check }); check();
          if (allowed === false) throw paused();
          if (existing) return clone(existing.plan);
          for (const entry of entries) { await assertNoPending(bindingFor(entry.intent)); check(); }
          persist(row, initial); return clone(plan);
        });
      });
    },
    async run(id) {
      const initial = context();
      return lock(async () => {
        guard(initial); const row = await pending(initial);
        if (!row || row.plan.id !== id) throw paused();
        // The whole plan is durable before any individual client is allowed to send.
        for (const { intent } of row.plan.entries) {
          await clientFor(bindingFor(intent)).capture({ operationId: intent.id, kind: intent.kind, body: intent.body }); guard(initial);
        }
        const receipts = [];
        for (const { intent } of row.plan.entries) {
          const client = clientFor(bindingFor(intent)), saved = await client.read(intent.id); guard(initial);
          const receipt = saved?.receipt && saved.receipt.operation.state !== "waiting" ? saved.receipt : await client.run(intent.id);
          guard(initial); receipts.push(receipt);
          if (receipt.operation.state !== "committed") return { state: receipt.operation.state, receipts };
        }
        return { state: "committed", receipts };
      });
    },
    async acknowledge(id) {
      const initial = context();
      return lock(async () => {
        const row = await read(id); guard(initial);
        if (!row || !await confirmed(row.plan, initial)) throw paused();
        persist({ ...row, applied: true }, initial);
      });
    },
  });
}
