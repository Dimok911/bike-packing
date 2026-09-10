import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminTemplateSavePlan, createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";

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
