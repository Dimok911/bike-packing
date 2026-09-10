import test from "node:test";
import assert from "node:assert/strict";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplateOrderBatch } from "../../src/public/admin-template-order-batch.js";

const selection = (ids = ["b", "a"]) => [{ id: "demo", layouts: ids }, { id: "shared", layouts: [] }, { id: "personal", layouts: ["mine"] }];
function fixture() {
  const values = new Map(), tails = new Map(), records = new Map(), server = new Map(), calls = [], prepares = [];
  const context = { actorId: "admin-a", environment: "bike-packing-experiment", scope: "admin-template-order", admin: true, generation: "one" };
  const state = { fail: null, failAfter: false, quota: false, pending: false, reject: null, beforePrepare: null, beforeRun: null };
  const targets = ["a", "b"].map((id, index) => ({ layoutId: id, layoutOrder: index + 1,
    binding: { actorId: context.actorId, environment: context.environment, listId: "public-demo-state-" + id, itemKey: "demo-state:" + id } }));
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (state.quota) throw Error("Quota"); values.set(key, value); } };
  const locks = { request(key, fn) { const promise = (tails.get(key) || Promise.resolve()).catch(() => {}).then(fn); tails.set(key, promise); return promise; } };
  const clientFor = binding => ({
    async prepare() {
      prepares.push(binding.listId); await state.beforePrepare?.();
      const target = targets.find(row => row.binding.listId === binding.listId);
      return { ok: true, ...binding, exists: true, deleted: false, stateRevision: 7, visibility: "public", indexes: [],
        metadata: { title: target.layoutId, language: "ru" }, payload: { activeLayoutId: "layout", layouts: { layout: { layoutOrder: target.layoutOrder } } } };
    },
    async capture(input) {
      const intent = adminTemplateIntent({ ...binding, ...input });
      if (records.has(intent.id)) assert.deepEqual(records.get(intent.id).intent, intent);
      else records.set(intent.id, { intent, receipt: null });
    },
    async read(id) { return structuredClone(records.get(id) || null); },
    async run(id) {
      const saved = records.get(id); calls.push(id); await state.beforeRun?.(id);
      assert.equal(values.size, 1, "whole batch exists before first business operation");
      assert.equal(records.size, 2, "both stable intents exist before first dispatch");
      if (state.fail === saved.intent.listId && !state.failAfter) throw Error("Offline");
      if (!server.has(id)) server.set(id, { operation: { id, state: state.reject === saved.intent.listId ? "rejected" : "committed" }, result: { payload: { stateRevision: 8 } } });
      if (state.fail === saved.intent.listId) throw Error("Lost ACK");
      saved.receipt = structuredClone(server.get(id)); return saved.receipt;
    },
  });
  const make = (extra = {}) => createAdminTemplateOrderBatch({ actorId: context.actorId, getContext: () => context, clientFor,
    storage, locks, enabled: true, assertNoPending: async () => { if (state.pending) throw Error("Editor pending"); }, ...extra });
  return { make, targets, values, records, server, calls, prepares, context, state };
}

test("whole order and observed revisions freeze before await and before any dispatch", async () => {
  const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets), chosen = selection();
  const promise = batch.capture(session, chosen); chosen[0].layouts.reverse(); session.rows[0].base.stateRevision = 99;
  const plan = await promise;
  assert.deepEqual(plan.selection, selection()); assert.deepEqual(plan.entries.map(entry => entry.intent.body.base), [{ stateRevision: 7 }, { stateRevision: 7 }]);
  assert.equal(f.calls.length, 0); assert.equal((await batch.run(plan.id)).state, "committed");
});

for (const failAfter of [false, true]) test(`reload resumes only unfinished portion with original IDs (lost ACK ${failAfter})`, async () => {
  const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, selection());
  f.state.fail = f.targets[1].binding.listId; f.state.failAfter = failAfter; await assert.rejects(batch.run(plan.id));
  const first = plan.entries[0].intent.id; assert.equal(f.calls.filter(id => id === first).length, 1);
  f.state.fail = null; f.targets[0].layoutOrder = 99;
  const reopened = await f.make().open(f.targets); assert.deepEqual(reopened.pending, plan); assert.equal(f.prepares.length, 2);
  assert.equal((await f.make().run(plan.id)).state, "committed"); assert.equal(f.calls.filter(id => id === first).length, 1);
  assert.equal(f.server.size, 2); await f.make().acknowledge(plan.id);
  assert.ok([...f.values.values()].every(value => JSON.parse(value).applied));
});

test("two tabs cannot replace an unfinished selection with a different order", async () => {
  const f = fixture(), a = f.make(), b = f.make(), sa = (await a.open(f.targets)).session, sb = (await b.open(f.targets)).session;
  const results = await Promise.all([a.capture(sa, selection()), b.capture(sb, selection())]);
  assert.equal(results[0].id, results[1].id); assert.equal(f.values.size, 1);
  await assert.rejects(b.capture(sb, selection(["a", "b"]))); assert.equal(f.values.size, 1); assert.equal(f.calls.length, 0);
});

test("quota and corrupted plan preserve local choice and prevent business dispatch", async () => {
  const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets);
  f.state.quota = true; await assert.rejects(batch.capture(session, selection())); assert.equal(f.values.size, 0); assert.equal(f.calls.length, 0);
  f.state.quota = false; const plan = await batch.capture(session, selection()), key = [...f.values.keys()][0];
  const saved = JSON.parse(f.values.get(key)); saved.plan.entries[0].intent.body.metadata.title = "Corruption"; f.values.set(key, JSON.stringify(saved));
  await assert.rejects(batch.run(plan.id)); assert.equal(f.calls.length, 0);
});

test("local applied flag cannot unlock a new selection without retained confirmations", async () => {
  const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, selection());
  await assert.rejects(batch.acknowledge(plan.id));
  const key = [...f.values.keys()][0], saved = JSON.parse(f.values.get(key)); saved.applied = true; f.values.set(key, JSON.stringify(saved));
  await assert.rejects(f.make().open(f.targets)); assert.equal(f.calls.length, 0);
});

test("a terminal rejection retains the full order and does not resend accepted predecessors", async () => {
  const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, selection());
  f.state.reject = f.targets[1].binding.listId;
  assert.equal((await batch.run(plan.id)).state, "rejected"); assert.equal((await f.make().run(plan.id)).state, "rejected");
  assert.equal(f.calls.length, 2); await assert.rejects(batch.acknowledge(plan.id)); assert.deepEqual((await f.make().open([])).pending, plan);
});

test("account, rights, route, pending edits and OFF stop preparation or dispatch", async () => {
  for (const field of ["actorId", "admin", "generation"]) {
    const f = fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, selection());
    f.state.beforeRun = () => { f.context[field] = field === "admin" ? false : "changed"; };
    await assert.rejects(batch.run(plan.id)); assert.equal(f.calls.length, 1); assert.equal(f.server.size, 1);
  }
  const f = fixture(); f.state.pending = true; await assert.rejects(f.make().open(f.targets)); assert.equal(f.prepares.length, 0);
  f.state.pending = false; await assert.rejects(f.make({ enabled: false }).open(f.targets)); assert.equal(f.prepares.length, 0);
});

test("source changes during preparation or missing members cannot become a new order", async () => {
  const f = fixture(); f.state.beforePrepare = () => { f.context.generation = "changed"; }; await assert.rejects(f.make().open(f.targets));
  f.state.beforePrepare = null; const batch = f.make(), { session } = await batch.open(f.targets);
  await assert.rejects(batch.capture(session, selection(["a"]))); await assert.rejects(batch.capture(session, selection(["a", "a"])));
  assert.equal(f.calls.length, 0); assert.equal(f.values.size, 0);
});
