import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateOrderBatch, readAdminTemplateOrderInventory } from "../../src/public/admin-template-order-batch.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminPhotoCopyClientFixture, copy, hash } from "../fixtures/admin-template-photo-copy-client-fixture.js";

const captureKey = binding => "bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(binding);
const orderPrefix = actorId => "bike-packing-admin-order-v1:" + encodeURIComponent(actorId) + ":";
const bindingFor = intent => Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]]));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const paused = () => Object.assign(Error("Another retained action owns this base"), { isAdminTemplateBlocked: true });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const chosen = () => [{ id: "demo", layouts: [] }, { id: "shared", layouts: ["other", "target"] }, { id: "personal", layouts: [] }];
function exclusiveLocks() {
  const tails = new Map(), held = new Set(), requests = [];
  return { held, requests, request(name, task) {
    requests.push(name);
    const before = tails.get(name) || Promise.resolve(), release = deferred();
    tails.set(name, before.then(() => release.promise));
    return before.then(async () => {
      assert.equal(held.has(name), false); held.add(name);
      try { return await task({ name, mode: "exclusive" }); }
      finally { held.delete(name); release.resolve(); }
    });
  } };
}

async function fixture({ retainedCopy = false } = {}) {
  const f = await adminPhotoCopyClientFixture(), locks = exclusiveLocks(), prefix = orderPrefix(f.binding.actorId);
  if (!retainedCopy) f.idb.rows().clear();
  const other = { ...f.binding, listId: "public-shared-layout-other", itemKey: "shared-layout:other" };
  const targets = [{ layoutId: "target", layoutOrder: 1, binding: f.binding }, { layoutId: "other", layoutOrder: 2, binding: other }];
  const source = f.intent.body.photoCopy.source;
  const copyBindings = [f.binding, { ...f.binding, listId: source.listId, itemKey: source.itemKey }];
  const context = { actorId: f.binding.actorId, environment: f.binding.environment, scope: "admin-template-order", admin: true, generation: "order-one" };
  const controls = Object.assign(f.controls, { afterOrderScan: null, afterCopyScan: null, admissions: [], pendingChecks: 0, noPending: null }), apiCalls = [];
  const clientFor = binding => ({ async prepare() {
    const target = targets.find(value => same(value.binding, binding)); assert.ok(target);
    return { ok: true, ...binding, exists: true, deleted: false, stateRevision: f.intent.body.base.stateRevision, visibility: "private", indexes: [],
      metadata: copy(f.intent.body.metadata), payload: { activeLayoutId: "layout", layouts: { layout: { id: "layout", layoutOrder: target.layoutOrder } } } };
  }, async read() { apiCalls.push("read"); return null; }, async capture() { assert.fail("No dispatch during capture"); }, async run() { assert.fail("No dispatch during capture"); } });
  const copyStoreOff = f.makeStore({ enabled: false });
  const admission = async ({ plan, captureLease, guard }) => {
    const bindings = plan.entries.map(entry => bindingFor(entry.intent));
    assert.equal(assertAdminTemplateCaptureLease(captureLease, bindings), true);
    // Another callback may still be unwinding a disjoint source lock. Verify
    // this batch's complete coverage without claiming those locks are ours.
    for (const name of [prefix, ...bindings.map(captureKey)]) assert.equal(locks.held.has(name), true);
    controls.admissions.push(copy(plan));
    for (const { intent } of plan.entries) {
      if (!same(bindingFor(intent), f.binding)) continue;
      const ids = await copyStoreOff.ids(); guard();
      for (const id of ids) {
        const record = await copyStoreOff.read(id); guard();
        if (same(record.action.body.base, intent.body.base) || intent.body.base?.operationId === id) throw paused();
      }
    }
    await controls.afterOrderScan?.({ plan, captureLease, guard }); guard();
  };
  const make = extra => createAdminTemplateOrderBatch({ actorId: f.binding.actorId, getContext: () => context, clientFor,
    storage: f.storage, locks, enabled: true, assertCaptureAllowed: admission,
    assertNoPending: async binding => { controls.pendingChecks++; await controls.noPending?.(binding); }, ...extra });
  const captureCopy = () => withAdminTemplateCapture({ bindings: copyBindings, locks }, async captureLease => {
    const guard = () => assertAdminTemplateCaptureLease(captureLease, copyBindings);
    const entries = await readAdminTemplateOrderInventory({ binding: f.binding, storage: f.storage, guard }); guard();
    if (entries.some(({ intent }) => same(intent.body.base, f.intent.body.base) || f.intent.body.base?.operationId === intent.id)) throw paused();
    await controls.afterCopyScan?.({ captureLease, guard }); guard();
    const record = await f.store.capture({ action: f.input.action, snapshot: f.input.snapshot }); guard(); return record;
  });
  const orderRows = () => [...f.values].filter(([key]) => key.startsWith(prefix));
  return Object.assign(f, { locks, prefix, other, targets, copyBindings, context, controls, apiCalls, make, captureCopy, orderRows });
}

for (const first of ["copy", "order"]) test(`concurrent ${first}-first capture admits one durable order or real IDB copy without a lock cycle`, { timeout: 5000 }, async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets), entered = deferred(), release = deferred();
  f.controls[first === "copy" ? "afterCopyScan" : "afterOrderScan"] = async () => { entered.resolve(); await release.promise; };
  const firstPending = first === "copy" ? f.captureCopy() : batch.capture(session, chosen());
  await entered.promise;
  const secondPending = first === "copy" ? batch.capture(session, chosen()) : f.captureCopy();
  const completed = Promise.allSettled([firstPending, secondPending]);
  release.resolve(); const results = await completed;
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
  assert.match(results[1].reason.message, /Another retained action/);
  assert.equal(f.orderRows().length, first === "order" ? 1 : 0);
  assert.equal(f.idb.rows().size, first === "copy" ? 1 : 0);
  assert.equal(f.locks.held.size, 0); assert.equal(f.server.calls.length, 0);
  assert.equal(f.locks.requests.filter(key => key === f.prefix).length, 2, "only open and order capture request the actor lock; copy inventory never does");
});

test("a copy IDB orphan stays visible with copy OFF before any order journal or operation is written", async () => {
  const f = await fixture({ retainedCopy: true }), batch = f.make(), { session } = await batch.open(f.targets), before = copy(session);
  await assert.rejects(batch.capture(session, chosen()), /Another retained action/);
  assert.deepEqual(session, before); assert.equal(f.orderRows().length, 0); assert.deepEqual(await f.store.read(f.id), f.record);
  assert.equal(f.controls.admissions.length, 1); assert.equal(f.server.calls.length, 0); assert.deepEqual(f.apiCalls, []);
});

test("retained order retries recheck copy admission with their exact original operations and cannot adopt a different selection", async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, chosen());
  const before = f.orderRows(), changedSession = copy(session); changedSession.rows.forEach(row => { row.base.stateRevision = 99; });
  assert.deepEqual(await f.make().capture(changedSession, chosen()), plan);
  assert.deepEqual(f.controls.admissions.map(row => row.id), [plan.id, plan.id]); assert.deepEqual(f.controls.admissions[1].entries, plan.entries);
  assert.deepEqual(f.orderRows(), before);
  const different = chosen(); different[1].layouts.reverse(); await assert.rejects(batch.capture(session, different));
  await f.store.capture({ action: f.input.action, snapshot: f.input.snapshot });
  await assert.rejects(f.make().capture(session, chosen()), /Another retained action/);
  assert.deepEqual(f.orderRows(), before); assert.equal(f.server.calls.length, 0);
});

test("read-only inventory returns exact immutable target entries without locks, receipts or applied-flag exclusions", async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, chosen());
  const count = f.locks.requests.length, expected = plan.entries.find(entry => same(bindingFor(entry.intent), f.binding));
  const entries = await readAdminTemplateOrderInventory({ binding: f.binding, storage: f.storage });
  assert.deepEqual(entries, [{ batchId: plan.id, digest: hash(plan), applied: false, intent: expected.intent }]);
  for (const value of [entries, entries[0], entries[0].intent, entries[0].intent.body, entries[0].intent.body.metadata]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { entries[0].intent.body.metadata.layoutOrder = 1; }, TypeError);
  const [key, raw] = f.orderRows()[0], row = JSON.parse(raw); row.applied = true; f.values.set(key, JSON.stringify(row));
  const applied = await readAdminTemplateOrderInventory({ binding: f.binding, storage: f.storage });
  assert.equal(applied[0].applied, true); assert.deepEqual(applied[0].intent, expected.intent);
  await assert.rejects(f.captureCopy(), /Another retained action/);
  const successor = { operationId: expected.intent.id };
  assert.ok(applied.some(entry => successor.operationId === entry.intent.id), "applied cannot grant a pending order predecessor to a generic copy");
  assert.equal(f.locks.requests.filter(name => name === f.prefix).length, 2); assert.equal(count + 2, f.locks.requests.length);
  assert.deepEqual(f.apiCalls, []); assert.equal(f.server.calls.length, 0);
});

test("inventory validates the actor's complete journal before filtering and rejects forged hashes, identities and unsupported records", async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets), plan = await batch.capture(session, chosen());
  const [key, raw] = f.orderRows()[0], emptyTarget = { ...f.binding, listId: "public-shared-layout-absent", itemKey: "shared-layout:absent" };
  assert.deepEqual(await readAdminTemplateOrderInventory({ binding: emptyTarget, storage: f.storage }), []);
  for (const fault of ["hash", "id", "actor", "version", "extra", "invalid-json"]) {
    const row = JSON.parse(raw);
    if (fault === "hash") row.plan.entries[0].intent.body.metadata.title = "Changed";
    if (fault === "id") row.plan.id = crypto.randomUUID();
    if (fault === "actor") row.plan.actorId = "other-admin";
    if (fault === "version") row.version = 2;
    if (fault === "extra") row.excluded = true;
    if (fault !== "hash") row.digest = hash(row.plan);
    f.values.set(key, fault === "invalid-json" ? "{" : JSON.stringify(row));
    await assert.rejects(readAdminTemplateOrderInventory({ binding: emptyTarget, storage: f.storage }));
  }
  f.values.set(key, raw);
  await assert.rejects(readAdminTemplateOrderInventory({ binding: { ...f.binding, itemKey: "shared-layout:wrong" }, storage: f.storage }));
  f.values.set(orderPrefix("another-admin") + crypto.randomUUID(), "not-this-account");
  assert.equal((await readAdminTemplateOrderInventory({ binding: f.binding, storage: f.storage }))[0].batchId, plan.id);
  assert.equal(f.server.calls.length, 0);
});

test("inventory refuses deletion, valid replacement or additional batches appearing across a hash await", async () => {
  for (const fault of ["delete", "replace", "add"]) {
    const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets); await batch.capture(session, chosen());
    const [key, raw] = f.orderRows()[0]; let calls = 0;
    await assert.rejects(readAdminTemplateOrderInventory({ binding: f.binding, storage: f.storage, guard() {
      if (++calls !== 2) return;
      if (fault === "delete") f.values.delete(key);
      else {
        const row = JSON.parse(raw);
        if (fault === "add") { row.plan.id = crypto.randomUUID(); row.plan.entries.forEach(entry => { entry.intent.id = crypto.randomUUID(); }); }
        else row.plan.entries[0].intent.body.metadata.title = "Valid replacement";
        row.digest = hash(row.plan); f.values.set(fault === "add" ? f.prefix + row.plan.id : key, JSON.stringify(row));
      }
    } }));
    assert.equal(f.server.calls.length, 0);
  }
});

test("missing storage methods or inconsistent inventory cannot masquerade as an empty order journal", async () => {
  const f = await fixture();
  for (const storage of [{}, { length: 0 }, { length: NaN, key() {}, getItem() {} },
    { length: 1, key: () => null, getItem: () => null },
    { length: 1, key: () => f.prefix + crypto.randomUUID(), getItem: () => null }]) {
    await assert.rejects(readAdminTemplateOrderInventory({ binding: f.binding, storage }));
  }
  assert.equal(f.server.calls.length, 0);
});

test("context and journal changes after admission block persistence and release every held lock", { timeout: 5000 }, async () => {
  for (const fault of ["context", "journal", "false", "throw"]) {
    const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets);
    if (fault === "context") f.controls.afterOrderScan = () => { f.context.generation = "different account session"; };
    if (fault === "journal") f.controls.afterOrderScan = () => { f.values.set(f.prefix + crypto.randomUUID(), "changed during callback"); };
    const selected = fault === "false" ? f.make({ assertCaptureAllowed: () => false })
      : fault === "throw" ? f.make({ assertCaptureAllowed: () => { throw Error("Copy journal unavailable"); } }) : batch;
    await assert.rejects(selected.capture(session, chosen()));
    assert.equal(f.orderRows().length, fault === "journal" ? 1 : 0); assert.equal(f.locks.held.size, 0); assert.equal(f.server.calls.length, 0);
  }
});

test("context guard follows every inventory await and input binding changes cannot select another actor's inventory", async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets); await batch.capture(session, chosen());
  const mutable = copy(f.binding), observed = f.context.generation; let guards = 0;
  const pending = readAdminTemplateOrderInventory({ binding: mutable, storage: f.storage, guard() {
    if (++guards === 2) f.context.generation = "changed";
    if (f.context.generation !== observed) throw Error("Account changed during read");
  } });
  mutable.actorId = "other-admin";
  await assert.rejects(pending, /Account changed/); assert.equal(f.server.calls.length, 0);
});

test("order quota releases capture locks and callback mutation cannot alter the captured metadata", { timeout: 5000 }, async () => {
  const f = await fixture(), batch = f.make(), { session } = await batch.open(f.targets), before = copy(session);
  f.controls.afterOrderScan = ({ plan }) => { plan.entries[0].intent.body.metadata.title = "Hook mutation"; };
  f.controls.rejectWrite = key => key.startsWith(f.prefix);
  await assert.rejects(batch.capture(session, chosen())); assert.equal(f.orderRows().length, 0); assert.equal(f.locks.held.size, 0);
  assert.deepEqual(session, before);
  f.controls.rejectWrite = null;
  const plan = await batch.capture(session, chosen());
  assert.ok(plan.entries.every(entry => entry.intent.body.metadata.title === f.intent.body.metadata.title));
  assert.equal(f.server.calls.length, 0);
});
