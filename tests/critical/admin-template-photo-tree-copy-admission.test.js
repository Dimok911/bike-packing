import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyClientFixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { adminPhotoTreeCopyRecordInput, refreshTreeRecordDigests } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { createAdminTemplatePhotoTreeCopyAdmission } from "../../src/sync/admin-template-photo-tree-copy-admission.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const same = (a, b) => canonical(a) === canonical(b);
const lockPrefix = "bike-packing-admin-template-photo-capture:";
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
// Whole-operation deadlock watchdog, including fixture hashes, IDB readback,
// four stages and the final receipt. A successful single dispatch took 6.88 s
// under the parallel transport suite, so a 5 s budget cancelled these races
// during valid work. This does not change any client/request deadline or turn
// the concurrency assertions into a performance benchmark.
const concurrentDispatchTimeoutMs = 30_000;
const bindingsFor = record => [record.binding, { ...record.binding, listId: record.action.body.photoCopy.source.listId,
  itemKey: record.action.body.photoCopy.source.itemKey }].sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));

// FIFO LockManager double, running the REAL lease helper. Native browser
// scheduling is deliberately not claimed by these bounded unit tests.
function lockManager() {
  const tails = new Map(), held = new Set(), events = [], requested = [];
  return { held, events, requested, async request(name, task) {
    requested.push(name); const prior = tails.get(name) || Promise.resolve(), released = deferred();
    const tail = prior.then(() => released.promise); tails.set(name, tail); await prior;
    assert.equal(held.has(name), false); held.add(name); events.push(["enter", name]);
    try { return await task(); }
    finally { events.push(["leave", name]); held.delete(name); released.resolve(); if (tails.get(name) === tail) tails.delete(name); }
  } };
}

async function fixture() {
  const f = await treeCopyClientFixture(), locks = lockManager(), namespaces = copy(f.record.snapshot), pending = new Map();
  const controls = { beforeInventory: null, afterInventory: null, revoke: false }, calls = [], retained = [];
  // Explicit TEST application policy. Production must supply its actual
  // decoded plan/upload/copy/order inventories and editor guard separately.
  // The runner's typed scope is lifecycle plumbing, not a substitute for that.
  const withInventory = async (proof, task) => {
    proof.assertCurrent(); assertAdminTemplateCaptureLease(proof.captureLease, proof.bindings);
    await controls.beforeInventory?.(proof); proof.assertCurrent();
    const own = await f.store.read(f.id); proof.assertCurrent();
    assert.deepEqual(own, proof.record, "same UUID alone cannot exclude a changed retained record");
    const before = canonical([...pending]);
    for (const [kind, row] of pending) {
      calls.push(kind);
      if (proof.bindings.some(binding => same(binding, row.binding)) && row.action.body.base.stateRevision === (
        same(row.binding, proof.record.binding) ? proof.record.action.body.base.stateRevision : proof.record.action.body.photoCopy.source.base.stateRevision)) {
        throw Error(`Pending ${kind}`);
      }
    }
    controls.afterInventory?.(proof); proof.assertCurrent();
    let active = true;
    const scope = { kind: "admin-template-photo-tree-copy-inventory-v1", bindings: proof.bindings, recordIntentHash: own.intentHash,
      assertCurrent() { assert.equal(active, true); proof.assertCurrent(); assert.equal(controls.revoke, false); assert.equal(canonical([...pending]), before); } };
    retained.push(scope);
    try { return await task(scope); } finally { active = false; }
  };
  let depth = 0;
  const withNamespaces = async (proof, task) => {
    proof.assertCurrent();
    assert.deepEqual(namespaces.source, proof.record.snapshot.source); assert.deepEqual(namespaces.target, proof.record.snapshot.target);
    let active = true; depth++; f.admission.active = true;
    const scope = { kind: "admin-template-photo-tree-copy-namespaces-v1", bindings: proof.bindings, recordIntentHash: proof.record.intentHash,
      assertCurrent() {
        assert.equal(active, true); proof.assertCurrent();
        assert.deepEqual(namespaces.source, proof.record.snapshot.source); assert.deepEqual(namespaces.target, proof.record.snapshot.target);
      } };
    retained.push(scope);
    try { return await task(scope); } finally { active = false; depth--; f.admission.active = depth > 0; }
  };
  const options = { binding: f.binding, store: f.store, getContext: () => f.current, locks, withInventory, withNamespaces };
  const admission = createAdminTemplatePhotoTreeCopyAdmission(options);
  const clientFor = session => f.make({ locks, getContext: session.getContext, withDispatchAdmission: session.withDispatchAdmission }).client;
  const run = extra => admission.run(f.id, async session => {
    const client = clientFor(session); await client.capture(session.record.action); session.assertCurrent();
    await extra?.(session, client); return await client.run(f.id);
  });
  return Object.assign(f, { locks, namespaces, pending, admissionRunner: admission, options, controlsAdmission: controls, calls, retained, clientFor, run });
}

test("actual tree client holds the sorted real common lease through every claim and POST; released callbacks cannot dispatch", async () => {
  const f = await fixture(); let retained;
  f.controls.afterBegin = () => {
    assert.ok(f.locks.held.has(lockPrefix + canonical(f.binding)));
    assert.equal([...f.locks.held].filter(name => name.startsWith(lockPrefix)).length, 2);
  };
  assert.deepEqual(await f.run(session => { retained = session; }), f.receipt);
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1); assert.equal(f.locks.held.size, 0);
  assert.equal(f.locks.requested.filter(name => name.startsWith(lockPrefix)).length, 2, "admission never reacquires either binding");
  assert.equal(f.locks.events[0][1].startsWith(lockPrefix), true); assert.equal(f.locks.events[1][1].startsWith(lockPrefix), true);
  assert.equal(Object.isFrozen(retained.record.snapshot.source.beforeState), true);
  assert.throws(retained.assertCurrent); assert.throws(retained.getContext);
  assert.throws(() => assertAdminTemplateCaptureLease(retained.captureLease, [f.binding]));
  await assert.rejects(retained.withDispatchAdmission({ intent: f.intent, recordIntentHash: f.record.intentHash, assertCurrent() {} }, () => assert.fail("expired")));
  assert.ok(f.retained.length > 2); for (const scope of f.retained) assert.throws(scope.assertCurrent);
});

test("same-ID simultaneous dispatch serializes outside the command lock and never duplicates stage/save POST", { timeout: concurrentDispatchTimeoutMs }, async () => {
  const f = await fixture(); const result = await Promise.all([f.run(), f.run()]);
  assert.deepEqual(result, [f.receipt, f.receipt]); assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.locks.held.size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 4);
});

test("capture holding common locks may finish the same command before queued dispatch; no command/common inversion", { timeout: concurrentDispatchTimeoutMs }, async () => {
  const f = await fixture(), entered = deferred(), release = deferred();
  const capture = withAdminTemplateCapture({ bindings: bindingsFor(f.record), locks: f.locks }, async lease => {
    entered.resolve(); await release.promise; assertAdminTemplateCaptureLease(lease, [f.binding]);
    // The real client's capture takes the command lock while the form owns the
    // common lease, reproducing the existing app order rather than a mock POST.
    await f.make({ locks: f.locks, withDispatchAdmission: null }).client.capture(f.record.action);
  });
  await entered.promise; const dispatch = f.run();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.locks.events.some(([event, name]) => event === "enter" && name.startsWith(commandPrefix)), false);
  release.resolve(); await capture; assert.deepEqual(await dispatch, f.receipt);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.locks.held.size, 0);
});

async function reverseRecord(record) {
  const input = await adminPhotoTreeCopyRecordInput(), oldTarget = input.binding, oldSource = input.action.body.photoCopy.source;
  input.binding = { ...oldTarget, listId: oldSource.listId, itemKey: oldSource.itemKey };
  Object.assign(input.action, { listId: input.binding.listId, itemKey: input.binding.itemKey });
  Object.assign(oldSource, { listId: record.binding.listId, itemKey: record.binding.itemKey });
  for (const [payload, binding] of [[oldSource.payload, { ...input.binding, listId: oldSource.listId, itemKey: oldSource.itemKey }], [input.action.body.payload, input.binding]]) {
    for (const type of ["items", "containers"]) for (const row of Object.values(payload[type])) for (const photo of row.photos || []) photo.listId = binding.listId;
  }
  await refreshTreeRecordDigests(input);
  for (const label of ["source", "target"]) {
    const previous = input.snapshot[label], source = label === "source", binding = source ? { ...input.binding, listId: oldSource.listId, itemKey: oldSource.itemKey } : input.binding;
    const payload = source ? oldSource.payload : input.action.body.payload, revision = source ? oldSource.base.stateRevision : input.action.body.base.stateRevision;
    const layout = { id: previous.layoutId, ...(binding.listId.startsWith("public-demo-state")
      ? { adminDemo: true, adminDemoListId: binding.listId, adminDemoLanguage: previous.metadata.language }
      : { adminSharedSourceId: binding.listId.slice("public-shared-layout-".length) }) };
    const projection = projectAdminTemplateServerVariant(layout, { exists: true, visibility: "private", stateRevision: revision, payload, metadata: previous.metadata },
      crypto.randomUUID(), { photoBinding: binding, photoOwnerMapEnabled: true });
    Object.assign(projection.layout.adminCausalSource, { version: 1, binding, exists: true, visibility: "private", deleted: false, base: { stateRevision: revision }, planId: null });
    previous.ownerMap = projection.layout.adminCausalSource.photoOwnerMap;
    previous.beforeState = { activeLayoutId: layout.id, layouts: { [layout.id]: projection.layout }, items: projection.items, containers: projection.containers,
      locations: copy(payload.locations || []), categories: copy(payload.categories || []), packedItems: copy(projection.layout.arrangement.packedItems) };
  }
  for (const owner of input.snapshot.copiedOwners) {
    const raw = input.action.body.photoCopy.owners.find(row => row.entityId === owner.serverId);
    owner.sourceLocalId = input.snapshot.source.ownerMap.owners.find(row => row.serverId === raw.sourceEntityId).localId;
  }
  return prepareAdminTemplatePhotoTreeCopyRecord(input);
}

test("opposite source/target dispatch sessions use the same sorted common keys without overlapping scopes", { timeout: 5000 }, async () => {
  const f = await fixture(), reverse = await reverseRecord(f.record), entered = deferred(), release = deferred(), order = [];
  const scoped = kind => async (proof, task) => task({ kind, bindings: proof.bindings, recordIntentHash: proof.record.intentHash, assertCurrent: proof.assertCurrent });
  const second = createAdminTemplatePhotoTreeCopyAdmission({ binding: reverse.binding, store: { binding: reverse.binding, read: async () => copy(reverse) },
    getContext: () => ({ ...f.current, ...reverse.binding }), locks: f.locks,
    withInventory: scoped("admin-template-photo-tree-copy-inventory-v1"), withNamespaces: scoped("admin-template-photo-tree-copy-namespaces-v1") });
  const first = f.admissionRunner.run(f.id, async () => { order.push("forward"); entered.resolve(); await release.promise; order.push("forward-end"); });
  await entered.promise; const other = second.run(reverse.action.operationId, () => { order.push("reverse"); });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.deepEqual(order, ["forward"]);
  release.resolve(); await Promise.all([first, other]); assert.deepEqual(order, ["forward", "forward-end", "reverse"]);
  const acquired = f.locks.events.filter(([event]) => event === "enter").map(([, name]) => name);
  assert.deepEqual(acquired.slice(0, 2), acquired.slice(2)); assert.equal(f.locks.held.size, 0);
});

test("missing dependencies, booleans, allow-ID arrays and mismatched typed coverage cannot authorize a callback", async () => {
  const f = await fixture();
  for (const name of ["withInventory", "withNamespaces", "getContext"]) for (const value of [undefined, true, [f.id]]) {
    assert.throws(() => createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, [name]: value }));
  }
  for (const result of [true, [f.id], {}, { kind: "admin-template-photo-tree-copy-inventory-v1", bindings: [f.binding], recordIntentHash: f.record.intentHash, assertCurrent() {} }]) {
    const runner = createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, withInventory: async (proof, task) => task(result) });
    await assert.rejects(runner.run(f.id, () => assert.fail("invalid inventory scope")));
  }
  const runner = createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, withInventory: async () => true });
  await assert.rejects(runner.run(f.id, () => assert.fail("inventory skipped callback"))); noPosts(f);
});

test("full record is re-proved after the common-lock wait and malformed, substituted or stale raw input cannot enter task", async () => {
  for (const fault of ["hash", "raw", "actor", "stage", "new-local-id"]) {
    const f = await fixture(), entered = deferred(), release = deferred(); let reads = 0;
    const blocker = withAdminTemplateCapture({ bindings: bindingsFor(f.record), locks: f.locks }, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const raw = copy(f.record), read = f.store.read.bind(f.store);
    const runner = createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, store: { binding: f.binding, async read(id) { reads++; return reads === 1 ? read(id) : raw; } } });
    const result = runner.run(f.id, () => assert.fail("stale record"));
    await new Promise(resolve => setTimeout(resolve, 10));
    if (fault === "hash") raw.intentHash = hash("wrong");
    if (fault === "raw") raw.action.body.photoCopy.source.payload.opaque.sourceOnly.push("lost-field");
    if (fault === "actor") raw.binding.actorId = "foreign";
    if (fault === "stage") raw.stages[0].operationId = crypto.randomUUID();
    if (fault === "new-local-id") raw.snapshot.copiedOwners[0].localId = raw.snapshot.source.layoutId;
    release.resolve(); await blocker; await assert.rejects(result); noPosts(f); assert.equal(f.locks.held.size, 0);
  }
});

test("external decoded record is detached before asynchronous reproof; later mutation cannot retarget the session", async t => {
  const f = await fixture(), external = copy(f.record); let reads = 0, mutated = false;
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, "digest", (...args) => {
    const pending = digest(...args);
    if (!mutated) { mutated = true; external.snapshot.copiedOwners[0].localId = "late-retarget"; }
    return pending;
  });
  const runner = createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, store: { binding: f.binding, async read() {
    reads++; if (reads === 1) return external;
    return copy(f.record);
  } } });
  await runner.run(f.id, session => { assert.deepEqual(session.record, f.record); assert.notEqual(session.record, external); });
  assert.equal(mutated, true); assert.equal(external.snapshot.copiedOwners[0].localId, "late-retarget"); assert.equal(reads, 2); noPosts(f);
});

test("trusted inventory checks exact own tree record and refuses other pending writer types for either binding", async () => {
  for (const kind of ["ordinary-plan", "upload-record", "v1-copy-record", "tree-record", "order-journal", "command-journal"]) {
    for (const side of ["source", "target"]) {
      const f = await fixture(), selected = side === "source" ? f.record.action.body.photoCopy.source : { ...f.binding, base: f.record.action.body.base };
      f.pending.set(kind, { binding: { ...f.binding, listId: selected.listId, itemKey: selected.itemKey },
        action: { ...copy(f.record.action), operationId: crypto.randomUUID(), body: { base: copy(selected.base), payload: { retained: kind } } } });
      await assert.rejects(f.run(), new RegExp(`Pending ${kind}`)); noPosts(f); assert.equal(f.values.size, 0);
    }
  }
  const f = await fixture(); f.controlsAdmission.afterInventory = proof => {
    assert.equal(proof.record.intentHash, f.record.intentHash); assert.deepEqual(proof.record.action, f.record.action);
  };
  assert.deepEqual(await f.run(), f.receipt);
});

test("actor or namespace loss after claim/readback prevents POST and retains immutable IDB selection and claim", async () => {
  for (const fault of ["actor", "source", "target", "inventory"]) {
    const f = await fixture();
    f.controls.afterClaim = () => {
      if (fault === "actor") f.current.actorId = "other-admin";
      if (fault === "source") f.namespaces.source.beforeState.layouts[f.namespaces.source.layoutId].name = "Unsaved source";
      if (fault === "target") f.namespaces.target.beforeState.layouts[f.namespaces.target.layoutId].name = "Unsaved target";
      if (fault === "inventory") f.controlsAdmission.revoke = true;
    };
    await assert.rejects(f.run()); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(f.locks.held.size, 0);
    assert.equal(f.admission.active, false); f.current.actorId = f.binding.actorId; assert.deepEqual(await f.store.read(f.id), f.record);
  }
});

test("a dependency returning before its callback completes expires the scope and releases every common lock", async () => {
  const f = await fixture(), paused = deferred(); let unfinished;
  const runner = createAdminTemplatePhotoTreeCopyAdmission({ ...f.options, withInventory(proof, task) {
    unfinished = task({ kind: "admin-template-photo-tree-copy-inventory-v1", bindings: proof.bindings, recordIntentHash: proof.record.intentHash, assertCurrent: proof.assertCurrent });
    unfinished.catch(() => {});
  } });
  await assert.rejects(runner.run(f.id, async session => { await paused.promise; session.assertCurrent(); assert.fail("scope outlived lease"); }));
  paused.resolve(); await assert.rejects(unfinished); noPosts(f); assert.equal(f.locks.held.size, 0);
});

test("an unawaited real client cannot continue writing after the outer task has released its session", async () => {
  const f = await fixture(); let unfinished;
  await f.admissionRunner.run(f.id, async session => {
    const client = f.clientFor(session); await client.capture(session.record.action);
    unfinished = client.run(f.id); unfinished.catch(() => {});
  });
  await assert.rejects(unfinished); noPosts(f); assert.equal(f.locks.held.size, 0);
  assert.equal(f.idb.rows("stage-dispatches").size, 0); assert.deepEqual(await f.store.read(f.id), f.record);
});

test("late/different intent admission and asynchronous guards fail closed without claims", async () => {
  const f = await fixture();
  await f.admissionRunner.run(f.id, async session => {
    for (const mutate of [request => { request.recordIntentHash = hash("foreign"); }, request => { request.intent.id = crypto.randomUUID(); },
      request => { request.intent.body.photoCopy.source.payload.opaque = { changed: true }; }, request => { request.assertCurrent = async () => {}; }]) {
      const request = { intent: copy(f.intent), recordIntentHash: f.record.intentHash, assertCurrent: session.assertCurrent }; mutate(request);
      await assert.rejects(session.withDispatchAdmission(request, () => assert.fail("wrong identity/guard")));
    }
  });
  noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("inventory revalidation failure before a later stage never grants the parent save or removes earlier receipts", async () => {
  const f = await fixture(); let entered = 0;
  f.controlsAdmission.beforeInventory = () => { if (++entered === 3) throw Error("Inventory read failed"); };
  await assert.rejects(f.run(), /Inventory read failed/);
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  const text = [...f.values].find(([name]) => name.startsWith(commandPrefix))[1];
  assert.deepEqual(JSON.parse(text).stageReceipts, [f.stages[0], null, null, null]); assert.equal(f.locks.held.size, 0);
});
