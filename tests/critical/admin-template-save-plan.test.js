import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminTemplateSavePlan, adminTemplateSourceSavePlan, createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";

const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-a", itemKey: "demo-state:a" };
const action = () => ({ operationId: randomUUID(), publicationId: randomUUID(), exists: true, visibility: "private", base: { stateRevision: 7 },
  payload: { items: { a: { id: "a", name: "Captured item" } } }, metadata: { title: "Captured", description: "", language: "ru" }, published: true, indexes: [] });
function fixture() {
  const values = new Map(), intents = new Map(), receipts = new Map(), calls = [], tails = new Map();
  const state = { failId: null, failAfter: false, quota: false };
  const context = { ...binding, scope: "admin-template", admin: true, generation: "one" };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (state.quota) throw Error("Quota"); values.set(key, value); } };
  const locks = { request: (key, fn) => { const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(fn); tails.set(key, next); return next; } };
  const execute = (id, cancel) => {
    if (state.failId === id && !state.failAfter) throw Error("Disconnected");
    if (!receipts.has(id)) {
      calls.push({ id, cancel }); receipts.set(id, { operation: { id, state: cancel ? "rejected" : "committed" },
        result: { payload: cancel ? { code: "operation_cancelled" } : { ok: true } } });
    }
    if (state.failId === id) throw Error("Lost ACK");
    return structuredClone(receipts.get(id));
  };
  const client = { capture: async intent => {
    if (intents.has(intent.operationId)) assert.deepEqual(intent, intents.get(intent.operationId));
    else intents.set(intent.operationId, structuredClone(intent));
  }, run: async id => execute(id, false), cancel: async id => execute(id, true) };
  const make = (extra = {}) => createAdminTemplateSavePlans({ binding, client, getContext: () => context, storage, locks, enabled: true, ...extra });
  return { make, state, context, values, intents, receipts, calls };
}

test("create stays private until its separately identified publication is confirmed", () => {
  const input = action(); input.exists = false; input.visibility = null; input.base = null;
  const plan = adminTemplateSavePlan({ binding, ...input });
  assert.deepEqual(plan.operations.map(operation => operation.kind), ["template.create", "template.publication"]);
  assert.equal(plan.operations[0].body.base, null); assert.deepEqual(plan.operations[1].body.base, { operationId: input.operationId });
  assert.equal(Object.hasOwn(plan.operations[0].body, "published"), false);
});
test("keeping an existing published template private hides it before changing its data", () => {
  const input = action(); input.visibility = "public"; input.published = false;
  const plan = adminTemplateSavePlan({ binding, ...input });
  assert.deepEqual(plan.operations.map(operation => operation.kind), ["template.publication", "template.save"]);
  assert.deepEqual(plan.operations[0].body.base, { stateRevision: 7 }); assert.equal(plan.operations[0].body.published, false);
  assert.deepEqual(plan.operations[1].body.base, { operationId: input.publicationId });
});
test("a draft save does not invent a publication operation or new target identity", () => {
  const input = action(); input.published = false; input.publicationId = null;
  const plan = adminTemplateSavePlan({ binding, ...input }); assert.equal(plan.operations.length, 1);
  assert.equal(plan.id, input.operationId); assert.deepEqual(plan.operations[0].body.base, input.base);
  assert.throws(() => adminTemplateSavePlan({ binding, ...input, publicationId: randomUUID() }));
  assert.throws(() => adminTemplateSavePlan({ binding, ...input, exists: false }));
});
test("plan freezes the candidate before await; reload resumes after the same already committed save", async () => {
  const f = fixture(), plan = f.make(), input = action(), pending = plan.capture(input);
  input.payload.items.a.name = "Later edit"; input.published = false;
  const saved = await pending; assert.equal(saved.plan.operations[0].body.payload.items.a.name, "Captured item");
  assert.equal(saved.plan.requestedPublication, true);
  f.state.failId = input.publicationId; await assert.rejects(plan.run(input.operationId));
  assert.equal(f.calls.length, 1); f.state.failId = null;
  assert.equal((await f.make().run(input.operationId)).state, "committed");
  assert.deepEqual(f.calls.map(call => call.id), [input.operationId, input.publicationId]);
  assert.equal((await f.make().list()).length, 1);
});
test("lost publication ACK resumes the same two IDs without rebuilding from changed UI data", async () => {
  const f = fixture(), input = action(); await f.make().capture(input);
  f.state.failId = input.publicationId; f.state.failAfter = true; await assert.rejects(f.make().run(input.operationId));
  f.state.failId = null; assert.equal((await f.make().run(input.operationId)).state, "committed"); assert.equal(f.calls.length, 2);
  const changed = structuredClone(input); changed.metadata.title = "Different"; await assert.rejects(f.make().capture(changed));
});
test("durable cancellation fences the descendant first and never resumes an uncaptured publication", async () => {
  const f = fixture(), input = action(); await f.make().capture(input);
  f.state.failId = input.operationId; await assert.rejects(f.make().cancel(input.operationId));
  assert.deepEqual(f.calls, [{ id: input.publicationId, cancel: true }]);
  f.state.failId = null; assert.equal((await f.make().run(input.operationId)).state, "cancelled");
  assert.equal(f.calls.length, 2); assert.ok(f.calls.every(call => call.cancel));
});
test("quota, corrupted storage, route changes and OFF keep the saved plan from business dispatch", async () => {
  const f = fixture(), input = action(); await f.make().capture(input);
  await assert.rejects(f.make({ enabled: false }).run(input.operationId));
  assert.ok(await f.make({ enabled: false }).read(input.operationId));
  f.state.quota = true; await assert.rejects(f.make().cancel(input.operationId)); assert.equal(f.calls.length, 0); f.state.quota = false;
  const key = [...f.values.keys()][0], saved = JSON.parse(f.values.get(key)); saved.plan.operations[0].body.metadata.title = "Corrupted";
  f.values.set(key, JSON.stringify(saved)); await assert.rejects(f.make().run(input.operationId)); assert.equal(f.calls.length, 0);
  f.context.admin = false; await assert.rejects(f.make().read(input.operationId));
});

async function sourceSave() {
  const sourceSnapshot = { items: { source: { id: "source", name: "Original" } } }, input = action();
  return { operationId: input.operationId, sourceSnapshot, body: { version: 1, base: input.base, payload: input.payload, metadata: input.metadata,
    source: { itemKey: "shared-layout:source", listId: "public-shared-layout-source", base: { stateRevision: 3 },
      payloadDigest: await adminTemplateCopyPayloadDigest(sourceSnapshot) } } };
}

test("source save retains independent source and target revisions across a lost ACK and reload", async () => {
  const f = fixture(), input = await sourceSave(), expected = structuredClone(input), pending = f.make().captureSourceSave(input);
  input.sourceSnapshot.items.source.name = "Changed source"; input.body.base.stateRevision = 99; input.body.payload.items.a.name = "Changed target";
  const saved = await pending;
  assert.deepEqual(saved.plan, adminTemplateSourceSavePlan({ binding, ...expected }));
  assert.equal(saved.plan.operations[0].body.base.stateRevision, 7); assert.equal(saved.plan.operations[0].body.source.base.stateRevision, 3);
  f.state.failId = input.operationId; f.state.failAfter = true; await assert.rejects(f.make().run(input.operationId));
  f.state.failId = null; assert.equal((await f.make().run(input.operationId)).state, "committed"); assert.equal(f.calls.length, 1);
  assert.deepEqual((await f.make().read(input.operationId)).plan.sourceSnapshot, expected.sourceSnapshot);
});

test("source save rejects mismatched snapshots and cannot become a different source under the same UUID", async () => {
  const f = fixture(), input = await sourceSave(), invalid = structuredClone(input);
  invalid.sourceSnapshot.items.source.name = "Not the hashed snapshot";
  await assert.rejects(f.make().captureSourceSave(invalid)); assert.equal(f.values.size, 0);
  await f.make().captureSourceSave(input);
  const changed = structuredClone(input); changed.body.source.base.stateRevision++;
  await assert.rejects(f.make().captureSourceSave(changed)); assert.equal(f.calls.length, 0);
  changed.body.source.listId = binding.listId; changed.body.source.itemKey = binding.itemKey;
  assert.throws(() => adminTemplateSourceSavePlan({ binding, ...changed }));
  changed.body.source = null; assert.throws(() => adminTemplateSourceSavePlan({ binding, ...changed }));
});

test("source save quota and durable cancellation preserve both snapshots without a write", async () => {
  const f = fixture(), input = await sourceSave(); f.state.quota = true;
  await assert.rejects(f.make().captureSourceSave(input)); assert.equal(f.calls.length, 0); f.state.quota = false;
  await f.make().captureSourceSave(input); f.state.failId = input.operationId;
  await assert.rejects(f.make().cancel(input.operationId));
  assert.equal((await f.make().read(input.operationId)).cancelRequested, true);
  f.state.failId = null; assert.equal((await f.make().run(input.operationId)).state, "cancelled");
  assert.deepEqual(f.calls, [{ id: input.operationId, cancel: true }]);
});


async function commandRowFixture() {
  const { adminTemplateCommandPlan } = await import("../../src/sync/admin-template-save-plan.js");
  const { canonicalTemplateJson: canonical } = await import("../../src/sync/admin-template-protocol.js");
  const { createHash } = await import("node:crypto");
  const f = fixture(), hash = value => createHash("sha256").update(canonical(value)).digest("hex");
  const plan = adminTemplateCommandPlan({ binding, operationId: randomUUID(), kind: "template.metadata",
    body: { version: 1, base: { stateRevision: 8 }, metadata: { title: "Command", language: "ru" } },
    editorSnapshot: { payload: { items: { a: { id: "a", note: "snapshot".repeat(7000) } } }, metadata: { title: "Before", language: "ru" } } });
  const row = { version: 1, plan, digest: hash(plan), cancelRequested: false };
  const key = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonical(binding)) + ":" + plan.id;
  f.values.set(key, canonical(row)); return { ...f, plan, row, key, canonical, hash };
}

test("exact V2 derivation reuse still reads current bytes twice and detaches every returned value", async t => {
  const f = await commandRowFixture(), original = crypto.subtle.digest; let digests = 0, reads = 0;
  crypto.subtle.digest = function(...args) { digests++; return original.apply(this, args); };
  t.after(() => { crypto.subtle.digest = original; });
  const plans = f.make({ storage: { getItem(key) { reads++; return f.values.get(key) ?? null; } } });
  const first = await plans.read(f.plan.id); assert.equal(digests, 1); assert.equal(reads, 2);
  first.plan.editorSnapshot.payload.items.a.note = "caller mutation";
  const second = await plans.read(f.plan.id); assert.equal(digests, 1); assert.equal(reads, 4);
  assert.equal(second.plan.editorSnapshot.payload.items.a.note, f.plan.editorSnapshot.payload.items.a.note);
  f.context.admin = false; await assert.rejects(plans.read(f.plan.id));
});

test("warm V2 derivation detects full-row changes, deletion and valid replacement with the same UUID", async () => {
  const f = await commandRowFixture(), plans = f.make(); await plans.read(f.plan.id);
  const original = f.values.get(f.key), changed = structuredClone(f.row);
  changed.plan.editorSnapshot.payload.items.a.note += "x";
  f.values.set(f.key, f.canonical(changed)); await assert.rejects(plans.read(f.plan.id));
  changed.digest = f.hash(changed.plan); f.values.set(f.key, f.canonical(changed));
  assert.equal((await plans.read(f.plan.id)).plan.editorSnapshot.payload.items.a.note, changed.plan.editorSnapshot.payload.items.a.note);
  f.values.set(f.key, f.canonical({ ...changed, cancelRequested: true })); assert.equal((await plans.read(f.plan.id)).cancelRequested, true);
  f.values.set(f.key, f.canonical({ ...changed, extra: true })); await assert.rejects(plans.read(f.plan.id));
  f.values.delete(f.key); assert.equal(await plans.read(f.plan.id), null);
  f.values.set(f.key, original); assert.deepEqual(await plans.read(f.plan.id), f.row);
});

test("V2 readback rejects replacement during hashing and during a memo hit", async t => {
  const f = await commandRowFixture(), original = crypto.subtle.digest;
  crypto.subtle.digest = function(...args) { return original.apply(this, args).then(result => { f.values.delete(f.key); return result; }); };
  t.after(() => { crypto.subtle.digest = original; });
  await assert.rejects(f.make().read(f.plan.id)); crypto.subtle.digest = original;
  f.values.set(f.key, f.canonical(f.row)); await f.make().read(f.plan.id);
  let calls = 0;
  const plans = f.make({ storage: { getItem(key) { const raw = f.values.get(key) ?? null; if (++calls === 1) f.values.delete(key); return raw; } } });
  await assert.rejects(plans.read(f.plan.id)); assert.equal(calls, 2);
});

test("admin plan quota uses the existing renewable-cache fallback without changing operation bytes or history", async () => {
  const { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY: cacheKey } = await import('../../src/config/constants.js');
  const { canPersistOptionalStorage } = await import('../../src/utils/storage-pressure.js');
  const f = fixture(), input = action(); await f.make().capture(input);
  const history = [...f.values], next = action(), writes = [], removals = [];
  f.values.set(cacheKey, 'renewable public templates');
  f.values.set('original-private-draft', 'retained original');
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i],
    getItem: key => f.values.get(key) ?? null,
    removeItem(key) { removals.push(key); f.values.delete(key); },
    setItem(key, raw) {
      writes.push([key, raw]);
      if (f.values.has(cacheKey)) throw new DOMException('Full', 'QuotaExceededError');
      f.values.set(key, raw);
    } };
  const result = await f.make({ storage }).capture(next);
  assert.equal(result.plan.id, next.operationId); assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]); assert.deepEqual(removals, [cacheKey]);
  assert.equal(canPersistOptionalStorage(storage), false);
  for (const [key, raw] of history) assert.equal(f.values.get(key), raw);
  assert.equal(f.values.get('original-private-draft'), 'retained original');
  assert.deepEqual((await f.make({ storage }).read(next.operationId)), result);
  assert.deepEqual(f.calls, []);
});

test("persistent admin plan quota retains all original records and never dispatches a substitute", async () => {
  const { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY: cacheKey } = await import('../../src/config/constants.js');
  const f = fixture(); await f.make().capture(action()); const history = [...f.values];
  f.values.set(cacheKey, 'renewable'); let attempts = 0;
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i],
    getItem: key => f.values.get(key) ?? null, removeItem: key => f.values.delete(key),
    setItem() { attempts++; throw new DOMException('Still full', 'QuotaExceededError'); } };
  await assert.rejects(f.make({ storage }).capture(action()), { name: 'QuotaExceededError' });
  assert.equal(attempts, 2); assert.deepEqual([...f.values], history); assert.deepEqual(f.calls, []);
});
