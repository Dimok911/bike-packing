import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminTemplatePhotoCopyEditorSnapshot } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { adminPhotoRecordFixture } from "../fixtures/admin-template-photo-record-fixture.js";
import { adminPhotoEditFixture } from "../fixtures/admin-template-photo-edit-fixture.js";
import { adminPhotoCreateClientFixture } from "../fixtures/admin-template-photo-create-client-fixture.js";
import { adminPhotoCopyClientFixture } from "../fixtures/admin-template-photo-copy-client-fixture.js";

const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const captureKey = binding => "bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(binding);
const planPrefix = binding => "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
const blocked = error => error?.isAdminTemplateBlocked === true;
function exclusiveLocks() {
  const tails = new Map(), held = new Set(), requests = [];
  return { held, requests, request(name, task) {
    requests.push(name);
    const previous = tails.get(name) || Promise.resolve(), release = deferred();
    tails.set(name, previous.then(() => release.promise));
    return previous.then(async () => {
      assert.equal(held.has(name), false); held.add(name);
      try { return await task({ name, mode: "exclusive" }); }
      finally { held.delete(name); release.resolve(); }
    });
  } };
}
function coordinator(binding, options = {}) {
  const values = new Map(), writes = [], locks = exclusiveLocks(), current = { ...binding, scope: "admin-template", admin: true, generation: "initial" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push(key); values.set(key, value); } };
  const make = extra => createAdminTemplateSavePlans({ binding, getContext: () => current, enabled: true,
    storage, locks, client: {}, ...options, ...extra });
  return { binding, values, writes, storage, locks, current, make };
}
function ordinary(body) {
  return { operationId: crypto.randomUUID(), base: clone(body.base), exists: true, visibility: "private",
    payload: clone(body.payload), metadata: clone(body.metadata) };
}
function copyInput(f) {
  return { operationId: f.id, body: clone(f.record.action.body), editorSnapshot: adminTemplatePhotoCopyEditorSnapshot(f.record),
    recordIntentHash: f.record.intentHash };
}
function copyBindings(f) {
  const source = f.intent.body.photoCopy.source;
  return [f.binding, { actorId: f.binding.actorId, environment: f.binding.environment, listId: source.listId, itemKey: source.itemKey }];
}
async function family(version) {
  if (version === 8) {
    const f = await adminPhotoCopyClientFixture();
    return { binding: f.binding, bindings: copyBindings(f), method: "capturePhotoCopy", input: copyInput(f),
      options: { photoCopyEnabled: true, photoCopyStore: f.store } };
  }
  if (version === 7) {
    const f = await adminPhotoCreateClientFixture();
    return { binding: f.binding, bindings: [f.binding], method: "capturePhotoCreate", input: f.planInput,
      options: { photoCreateEnabled: true, photoStore: f.store } };
  }
  if (version === 6) {
    const f = adminPhotoEditFixture(); return { binding: f.binding, bindings: [f.binding], method: "capturePhotoEdit", input: f.input };
  }
  const f = await adminPhotoRecordFixture({ count: 1 }), { binding, action, snapshot } = f;
  if (version === 5) return { binding, bindings: [binding], method: "capturePhoto", input: { operationId: action.operationId,
    body: action.body, editorSnapshot: adminTemplatePhotoEditorSnapshot(snapshot.state, snapshot.layoutId, snapshot.metadata) } };
  const input = ordinary(action.body);
  if (version === 1) return { binding, bindings: [binding], method: "capture", input };
  if (version === 2) return { binding, bindings: [binding], method: "captureCommand", input: { operationId: input.operationId,
    kind: "template.metadata", body: { version: 1, base: input.base, metadata: { title: "Renamed", language: "ru" } },
    editorSnapshot: { payload: input.payload, metadata: input.metadata } } };
  const sourceSnapshot = clone(snapshot.sourcePayload), source = { itemKey: "shared-layout:source", listId: "public-shared-layout-source",
    base: { stateRevision: 3 }, payloadDigest: await adminTemplateCopyPayloadDigest(sourceSnapshot) };
  return { binding, bindings: [binding], method: version === 3 ? "captureCopy" : "captureSourceSave", input: {
    operationId: input.operationId, sourceSnapshot, body: { version: 1, base: version === 3 ? null : input.base,
      ...(version === 4 ? { payload: input.payload } : {}), metadata: input.metadata, source } } };
}

for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) test(`V${version}: default and supplied leases cover admission while retaining confirmed-base and UUID locks`, { timeout: 5000 }, async () => {
  for (const nested of [false, true]) {
    const f = await family(version), c = coordinator(f.binding, f.options), prefix = planPrefix(f.binding), observations = [];
    const plans = c.make({ assertCaptureAllowed({ plan, captureLease, guard }) {
      guard(); assert.equal(assertAdminTemplateCaptureLease(captureLease, f.bindings), true);
      const expected = [...new Set(f.bindings.map(captureKey))].sort();
      const base = plan.operations[0].body.base;
      if (base?.stateRevision) expected.push(prefix + "confirmed-base:" + base.stateRevision);
      expected.push(prefix + plan.id);
      assert.deepEqual([...c.locks.held], expected); observations.push(captureLease);
    } });
    const call = lease => plans[f.method](f.input, lease ? { captureLease: lease } : undefined);
    const saved = nested ? await withAdminTemplateCapture({ bindings: [...f.bindings].reverse().concat(f.binding), locks: c.locks }, call) : await call();
    assert.equal(saved.plan.version, version); assert.deepEqual(await plans.read(saved.plan.id), saved);
    assert.equal(c.writes.length, 1); assert.equal(observations.length, 1);
    assert.deepEqual(c.locks.requests.filter(name => name.startsWith("bike-packing-admin-template-photo-capture:")), [...new Set(f.bindings.map(captureKey))].sort());
    assert.equal(c.locks.held.size, 0); assert.throws(() => assertAdminTemplateCaptureLease(observations[0], f.bindings), blocked);
  }
});

test("V8 requires both validated source and target even with an otherwise genuine nested lease", { timeout: 5000 }, async () => {
  const f = await adminPhotoCopyClientFixture(), bindings = copyBindings(f), c = coordinator(f.binding, { photoCopyEnabled: true, photoCopyStore: f.store });
  let calls = 0; const plans = c.make({ assertCaptureAllowed() { calls++; } });
  for (const subset of [[bindings[0]], [bindings[1]]]) {
    await withAdminTemplateCapture({ bindings: subset, locks: c.locks }, async captureLease => {
      await assert.rejects(plans.capturePhotoCopy(copyInput(f), { captureLease }), blocked);
    });
  }
  assert.equal(calls, 0); assert.equal(c.values.size, 0);
  for (const captureLease of [null, {}, Object.freeze({})]) await assert.rejects(plans.capturePhotoCopy(copyInput(f), { captureLease }), blocked);
  assert.equal((await plans.capturePhotoCopy(copyInput(f))).plan.version, 8); assert.equal(calls, 1);
});

test("V8 default capture waits for an ordinary capture on its source without taking a global lock", { timeout: 5000 }, async () => {
  const f = await adminPhotoCopyClientFixture(), [target, source] = copyBindings(f), c = coordinator(target,
    { photoCopyEnabled: true, photoCopyStore: f.store }), entered = deferred(), release = deferred();
  const sourceContext = { ...source, scope: "admin-template", admin: true, generation: "source" };
  const sourcePlans = createAdminTemplateSavePlans({ binding: source, getContext: () => sourceContext, client: {}, enabled: true,
    storage: c.storage, locks: c.locks, async assertCaptureAllowed({ captureLease }) {
      assert.equal(assertAdminTemplateCaptureLease(captureLease, [source]), true); entered.resolve(); await release.promise;
    } });
  const sourceSave = sourcePlans.capture(ordinary({ base: f.intent.body.photoCopy.source.base,
    payload: f.intent.body.photoCopy.source.payload, metadata: f.record.snapshot.source.metadata }));
  await entered.promise;
  let copyEntered = false;
  const copySave = c.make({ assertCaptureAllowed() { copyEntered = true; } }).capturePhotoCopy(copyInput(f));
  const third = { ...target, itemKey: "shared-layout:third", listId: "public-shared-layout-third" };
  await withAdminTemplateCapture({ bindings: [third], locks: c.locks }, () => assert.equal(copyEntered, false));
  release.resolve(); await Promise.all([sourceSave, copySave]);
  assert.equal(copyEntered, true); assert.equal(c.values.size, 2); assert.equal(c.locks.held.size, 0);
});

test("ordinary admission sees a strictly decoded orphan copy in the separate IDB store even with copy OFF", { timeout: 5000 }, async () => {
  const f = await adminPhotoCopyClientFixture(), store = f.makeStore({ enabled: false }), c = coordinator(f.binding, { photoCopyEnabled: false });
  let scans = 0;
  const plans = c.make({ async assertCaptureAllowed({ plan, captureLease, guard }) {
    assert.equal(assertAdminTemplateCaptureLease(captureLease, [f.binding]), true);
    const ids = await store.ids(); guard(); scans++;
    for (const id of ids) {
      const record = await store.read(id); guard();
      assert.equal(record.intentHash, f.record.intentHash);
      if (canonicalTemplateJson(record.action.body.base) === canonicalTemplateJson(plan.operations[0].body.base)) {
        throw Object.assign(Error("Retained copy owns this target base"), { isAdminTemplateBlocked: true });
      }
    }
  } });
  await assert.rejects(plans.capture(ordinary(f.intent.body)), /Retained copy owns/);
  assert.equal(scans, 1); assert.equal(c.values.size, 0); assert.equal((await store.read(f.id)).intentHash, f.record.intentHash);
  assert.equal(f.server.calls.length, 0);
});

test("context change or lease expiry during asynchronous admission prevents a plan write", { timeout: 5000 }, async () => {
  for (const reason of ["context", "lease"]) {
    const f = await family(1), c = coordinator(f.binding), entered = deferred(), release = deferred();
    const plans = c.make({ async assertCaptureAllowed({ guard }) { guard(); entered.resolve(); await release.promise; } });
    let pending;
    if (reason === "lease") {
      await withAdminTemplateCapture({ bindings: [f.binding], locks: c.locks }, captureLease => {
        pending = plans.capture(f.input, { captureLease }); return entered.promise;
      });
    } else { pending = plans.capture(f.input); await entered.promise; c.current.generation = "different editor"; }
    const rejected = assert.rejects(pending, blocked); release.resolve(); await rejected;
    assert.equal(c.values.size, 0); assert.equal(c.locks.held.size, 0);
  }
});

test("exact retained V8 capture still requires admission and full coverage when its own gate is OFF", { timeout: 5000 }, async () => {
  const f = await adminPhotoCopyClientFixture(), bindings = copyBindings(f), c = coordinator(f.binding, { photoCopyEnabled: true, photoCopyStore: f.store });
  const saved = await c.make().capturePhotoCopy(copyInput(f)), before = [...c.values], scans = [];
  const off = c.make({ photoCopyEnabled: false, assertCaptureAllowed({ plan, captureLease, guard }) {
    guard(); assert.equal(assertAdminTemplateCaptureLease(captureLease, bindings), true); scans.push(plan.id);
    throw Object.assign(Error("Copy source requires reconciliation"), { isAdminTemplateBlocked: true });
  } });
  await assert.rejects(off.capturePhotoCopy(copyInput(f)), /Copy source requires reconciliation/);
  assert.deepEqual(scans, [f.id]); assert.deepEqual([...c.values], before); assert.equal(c.writes.length, 1);
  assert.deepEqual(await c.make({ photoCopyEnabled: false }).capturePhotoCopy(copyInput(f)), saved);
  assert.equal(c.writes.length, 1);
});

test("admission cannot mutate the captured action, and false or thrown refusal leaves no new plan", async () => {
  const f = await family(1), c = coordinator(f.binding), original = clone(f.input);
  const plans = c.make({ assertCaptureAllowed({ plan }) { plan.operations[0].body.metadata.title = "Callback mutation"; } });
  const saved = await plans.capture(f.input);
  assert.deepEqual(saved.plan.operations[0].body.metadata, original.metadata); assert.deepEqual(await plans.read(saved.plan.id), saved);
  for (const refusal of [() => false, () => { throw Error("Other journal unavailable"); }]) {
    const request = { ...clone(original), operationId: crypto.randomUUID() };
    await assert.rejects(c.make({ assertCaptureAllowed: refusal }).capture(request));
  }
  assert.equal(c.values.size, 1); assert.equal(c.writes.length, 1);
});

test("waiting ordinary capture keeps its original bytes and refuses a later account before admission", { timeout: 5000 }, async () => {
  const f = await family(1), c = coordinator(f.binding), entered = deferred(), release = deferred(), original = clone(f.input);
  const blocker = withAdminTemplateCapture({ bindings: [f.binding], locks: c.locks }, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  let scans = 0; const plans = c.make({ assertCaptureAllowed() { scans++; } }), pending = plans.capture(f.input);
  f.input.payload.items["server-item"].name = "Later edit";
  release.resolve(); await blocker;
  const saved = await pending; assert.deepEqual(saved.plan.operations[0].body.payload, original.payload); assert.equal(scans, 1);
  const secondGate = deferred(), secondEntered = deferred();
  const secondBlocker = withAdminTemplateCapture({ bindings: [f.binding], locks: c.locks }, async () => { secondEntered.resolve(); await secondGate.promise; });
  await secondEntered.promise;
  const rejected = assert.rejects(plans.capture({ ...original, operationId: crypto.randomUUID() }), blocked);
  c.current.actorId = "another-admin"; secondGate.resolve(); await secondBlocker; await rejected;
  assert.equal(scans, 1); assert.equal(c.writes.length, 1);
});

test("legacy V6 followed by ordinary same-base edits and V1 successors keep their existing admission rules", async () => {
  const f = adminPhotoEditFixture(), c = coordinator(f.binding), plans = c.make();
  const selected = await plans.capturePhotoEdit(f.input), other = ordinary(f.body);
  other.payload.items.pump.name = "Later ordinary draft";
  const saved = await plans.capture(other);
  const next = { ...ordinary(f.body), base: { operationId: saved.plan.id } };
  assert.equal((await plans.capture(next)).plan.operations[0].body.base.operationId, saved.plan.id);
  await assert.rejects(plans.capture({ ...ordinary(f.body), base: { operationId: selected.plan.id } }), blocked);
  assert.equal(c.values.size, 3);
  const first = coordinator(f.binding); await first.make().capture(ordinary(f.body));
  await assert.rejects(first.make().capturePhotoEdit(f.input), blocked); assert.equal(first.values.size, 1);
});
