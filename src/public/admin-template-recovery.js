import { ADMIN_TEMPLATE_OPERATIONS_ENABLED, canonicalTemplateJson, validTemplateOperationId } from "../sync/admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const paused = () => Object.assign(Error("Сохранённая цепочка шаблона требует сверки. Черновик и исходные действия сохранены."),
  { code: "admin-template-recovery-paused", isAdminTemplateBlocked: true });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

// Only this editor's dependency chain is selected. Independent plans and
// predecessors owned by other producers (e.g. a reorder batch) are not cancelled.
export function adminTemplatePlanChain(head, records) {
  const byId = new Map(), owner = new Map(), ordered = [], visiting = new Set(), visited = new Set();
  for (const row of records) {
    if (!validTemplateOperationId(row.plan?.id) || byId.has(row.plan.id)) throw paused();
    byId.set(row.plan.id, row);
    for (const intent of row.plan.operations) { if (owner.has(intent.id)) throw paused(); owner.set(intent.id, row.plan.id); }
  }
  const visit = id => {
    if (visited.has(id)) return;
    if (visiting.has(id) || !byId.has(id)) throw paused(); visiting.add(id);
    const row = byId.get(id);
    for (const intent of row.plan.operations) for (const previous of [intent.body.base?.operationId, ...(intent.body.indexes || []).map(index => index.base.operationId)]) {
      const parent = owner.get(previous); if (parent && parent !== id) visit(parent);
    }
    visiting.delete(id); visited.add(id); ordered.push(row);
  };
  visit(head); return ordered;
}

export function createAdminTemplateRecovery({ binding, getContext, plans, client,
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks, enabled = ADMIN_TEMPLATE_OPERATIONS_ENABLED }) {
  binding = clone(binding);
  const prefix = "bike-packing-admin-stop-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
  const key = id => { if (!validTemplateOperationId(id)) throw paused(); return prefix + id; };
  const context = () => {
    const value = getContext?.();
    if (enabled !== true || value?.admin !== true || value.scope !== "admin-template" || !value.generation
      || Object.keys(binding).some(field => value[field] !== binding[field])) throw paused();
    return clone(value);
  };
  const guard = before => { if (!same(context(), before)) throw paused(); };
  const read = async id => {
    const raw = storage.getItem(key(id)); if (raw === null) return null;
    const row = JSON.parse(raw), choice = row?.choice;
    if (!exact(row, ["version", "choice", "digest"]) || row.version !== 1
      || !exact(choice, ["version", "id", "binding", "plans", "editorSnapshot"]) || choice.version !== 1 || choice.id !== id
      || !same(choice.binding, binding) || !Array.isArray(choice.plans) || !choice.plans.length
      || choice.plans.at(-1)?.id !== id || new Set(choice.plans.map(plan => plan?.id)).size !== choice.plans.length
      || choice.plans.some(plan => !exact(plan, ["id", "digest"]) || !validTemplateOperationId(plan.id) || !/^[a-f0-9]{64}$/.test(plan.digest))
      || !exact(choice.editorSnapshot, ["payload", "metadata"]) || row.digest !== await hash(choice)) throw paused();
    return choice;
  };
  const chain = async (id, initial) => { const rows = await plans.list(); guard(initial); return adminTemplatePlanChain(id, rows); };
  const retainedChoice = async (rows, initial) => {
    for (const row of [...rows].reverse()) {
      const choice = await read(row.plan.id); guard(initial);
      if (choice) {
        const expected = adminTemplatePlanChain(choice.id, rows).map(entry => ({ id: entry.plan.id, digest: entry.digest }));
        if (!same(choice.plans, expected)) throw paused(); return choice;
      }
    }
    return null;
  };
  const inspect = async (id, { refresh = false } = {}) => {
    const initial = context(), rows = await chain(id, initial), stop = await retainedChoice(rows, initial), operations = [];
    for (const row of rows) for (const intent of row.plan.operations) {
      let saved = await client.read(intent.id); guard(initial);
      if (saved && !same(saved.intent, intent)) throw paused();
      if (refresh && saved) { await client.inspect(intent.id); guard(initial); saved = await client.read(intent.id); guard(initial); }
      operations.push({ id: intent.id, kind: intent.kind,
        state: saved?.receipt?.operation.state || (saved?.dispatched ? "unknown" : "queued"),
        cancelled: saved?.receipt?.result?.payload?.code === "operation_cancelled" });
    }
    const terminal = operations.every(operation => ["committed", "rejected"].includes(operation.state));
    return { id, operations, stopRequested: Boolean(stop), stopCoversHead: stop?.id === id,
      stopped: Boolean(stop?.id === id && terminal), committedCount: operations.filter(operation => operation.state === "committed").length };
  };
  const resumeStop = async id => {
    const initial = context(), rows = await chain(id, initial), choice = await retainedChoice(rows, initial);
    if (!choice) return null;
    if (!locks?.request) throw paused();
    return locks.request(prefix + "execute", async () => {
      guard(initial);
      const currentRows = await chain(id, initial), current = await retainedChoice(currentRows, initial);
      if (!same(current, choice)) throw paused();
      const results = [];
      for (const entry of [...choice.plans].reverse()) {
        guard(initial); const result = await plans.cancel(entry.id); guard(initial); results.push(result);
        if (result.state === "waiting") return { state: "stopping", results };
      }
      return { state: choice.id === id ? "stopped" : "stop-required", results,
        committedCount: results.flatMap(result => result.receipts).filter(receipt => receipt.operation.state === "committed").length };
    });
  };
  return Object.freeze({ inspect, resumeStop,
    async requiresCancellation(id) {
      const initial = context(), rows = await plans.list(); guard(initial);
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i); if (!name?.startsWith(prefix)) continue;
        const choice = await read(name.slice(prefix.length)); guard(initial);
        const selected = adminTemplatePlanChain(choice.id, rows).map(row => ({ id: row.plan.id, digest: row.digest }));
        if (!same(choice.plans, selected)) throw paused();
        if (choice.plans.some(plan => plan.id === id)) return true;
      }
      return false;
    },
    async assertCanAppend(id) {
      if (!id) return;
      const initial = context(); if (await retainedChoice(await chain(id, initial), initial)) throw paused();
    },
    async captureStop(id, editorSnapshot) {
      const initial = context(), snapshot = clone(editorSnapshot), rows = await chain(id, initial);
      const choice = { version: 1, id, binding, plans: rows.map(row => ({ id: row.plan.id, digest: row.digest })), editorSnapshot: snapshot };
      if (!exact(snapshot, ["payload", "metadata"]) || !locks?.request) throw paused();
      const row = { version: 1, choice, digest: await hash(choice) }; guard(initial);
      return locks.request(prefix + "capture", async () => {
        const existing = await read(id); guard(initial);
        if (existing) { if (!same(existing, choice)) throw paused(); return clone(existing); }
        const current = await chain(id, initial);
        if (!same(current.map(entry => ({ id: entry.plan.id, digest: entry.digest })), choice.plans)) throw paused();
        const encoded = canonicalTemplateJson(row); storage.setItem(key(id), encoded);
        if (storage.getItem(key(id)) !== encoded) throw paused(); guard(initial); return clone(choice);
      });
    },
  });
}
