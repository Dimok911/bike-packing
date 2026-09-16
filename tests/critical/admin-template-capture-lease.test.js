import test from "node:test";
import assert from "node:assert/strict";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../../src/sync/admin-template-photo-record.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";

const binding = name => ({ actorId: "admin-a", environment: "bike-packing-experiment",
  listId: `public-shared-layout-${name}`, itemKey: `shared-layout:${name}` });
const key = value => "bike-packing-admin-template-photo-capture:" + canonicalTemplateJson(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const isBlocked = error => error?.code === "admin-template-capture-lease" && error.isAdminTemplateBlocked === true;

// A FIFO exclusive lock double with independent queues per name. Each held
// callback keeps its lock across awaits; native-browser coverage is separate.
function exclusiveLocks() {
  const tails = new Map(), held = new Set(), requests = [], events = [];
  return { held, requests, events, request(name, task) {
    assert.equal(this.requests, requests, "the LockManager receiver is retained");
    requests.push(name);
    const previous = tails.get(name) || Promise.resolve(), released = deferred();
    tails.set(name, previous.then(() => released.promise));
    return previous.then(async () => {
      assert.equal(held.has(name), false); held.add(name); events.push(["enter", name]);
      try { return await task({ name, mode: "exclusive" }); }
      finally { held.delete(name); events.push(["leave", name]); released.resolve(); }
    });
  } };
}

test("validated canonical bindings reuse the existing photo lock key and acquire sorted unique coverage", async () => {
  const a = binding("a"), unicode = binding("Снаряжение:1"), demo = { actorId: "admin-a", environment: "bike-packing-experiment",
    listId: "public-demo-state", itemKey: "demo-state" }, locks = exclusiveLocks();
  const reordered = { itemKey: a.itemKey, listId: a.listId, environment: a.environment, actorId: a.actorId };
  let retained;
  const result = await withAdminTemplateCapture({ bindings: [unicode, a, demo, reordered], locks }, async lease => {
    retained = lease;
    assert.equal(Object.isFrozen(lease), true); assert.equal(Object.getPrototypeOf(lease), null);
    assert.deepEqual(Reflect.ownKeys(lease), [], "callers cannot change or copy coverage metadata");
    assert.equal(assertAdminTemplateCaptureLease(lease, [reordered, unicode, demo]), true);
    assert.deepEqual([...locks.held], [key(unicode), key(a), key(demo)].sort());
    await Promise.resolve(); assert.equal(assertAdminTemplateCaptureLease(lease, [a]), true);
    return "durable";
  });
  assert.equal(result, "durable");
  assert.deepEqual(locks.requests, [key(unicode), key(a), key(demo)].sort());
  assert.equal(locks.held.size, 0); assert.throws(() => assertAdminTemplateCaptureLease(retained, [a]), isBlocked);
});

test("concurrent source-to-target and reverse copies finish without deadlock or overlapping captures", { timeout: 2000 }, async () => {
  const a = binding("a"), b = binding("b"), locks = exclusiveLocks(), entered = deferred(), release = deferred(), completed = [];
  const first = withAdminTemplateCapture({ bindings: [b, a], locks }, async lease => {
    assert.equal(assertAdminTemplateCaptureLease(lease, [a, b]), true); entered.resolve();
    await release.promise; completed.push("a-to-b");
  });
  let secondEntered = false;
  const second = withAdminTemplateCapture({ bindings: [a, b], locks }, lease => {
    secondEntered = true; assert.equal(assertAdminTemplateCaptureLease(lease, [b, a]), true);
    assert.deepEqual(completed, ["a-to-b"]); completed.push("b-to-a");
  });
  await entered.promise;
  assert.equal(secondEntered, false); assert.equal(locks.held.size, 2);
  release.resolve(); await Promise.all([first, second]);
  assert.deepEqual(completed, ["a-to-b", "b-to-a"]); assert.equal(locks.held.size, 0);
  assert.deepEqual(locks.requests, [key(a), key(a), key(b), key(b)]);
});

test("a separate target captures while another template is still held", { timeout: 2000 }, async () => {
  const a = binding("a"), b = binding("b"), locks = exclusiveLocks(), entered = deferred(), release = deferred();
  let firstComplete = false;
  const first = withAdminTemplateCapture({ bindings: [a], locks }, async () => {
    entered.resolve(); await release.promise; firstComplete = true;
  });
  await entered.promise;
  await withAdminTemplateCapture({ bindings: [b], locks }, lease => {
    assert.equal(assertAdminTemplateCaptureLease(lease, [b]), true);
    assert.equal(firstComplete, false); assert.equal(locks.held.has(key(a)), true);
  });
  release.resolve(); await first; assert.equal(locks.held.size, 0);
});

test("nested capture validates the same lease without reacquiring either held binding", { timeout: 2000 }, async () => {
  const a = binding("a"), b = binding("b"), locks = exclusiveLocks();
  const nested = async lease => {
    assert.equal(assertAdminTemplateCaptureLease(lease, [b]), true);
    await Promise.resolve(); assert.equal(assertAdminTemplateCaptureLease(lease, [a, b]), true);
    return 7;
  };
  const result = await withAdminTemplateCapture({ bindings: [a, b], locks }, async lease => {
    const count = locks.requests.length, result = await nested(lease);
    assert.equal(locks.requests.length, count); return result;
  });
  assert.equal(result, 7); assert.deepEqual(locks.requests, [key(a), key(b)]);
});

test("all bindings are detached before the first lock wait and caller mutation cannot widen the lease", { timeout: 2000 }, async () => {
  const original = binding("a"), second = binding("b"), mutable = structuredClone(original), bindings = [mutable, second];
  const locks = exclusiveLocks(), entered = deferred(), release = deferred();
  const blocker = locks.request(key(original), async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const capture = withAdminTemplateCapture({ bindings, locks }, lease => {
    assert.equal(assertAdminTemplateCaptureLease(lease, [original, binding("b")]), true);
    assert.throws(() => assertAdminTemplateCaptureLease(lease, [mutable]), isBlocked);
    assert.throws(() => assertAdminTemplateCaptureLease(lease, [binding("c")]), isBlocked);
  });
  Object.assign(mutable, binding("changed")); Object.assign(second, binding("other")); bindings.push(binding("c"));
  release.resolve(); await Promise.all([blocker, capture]);
  assert.deepEqual(locks.requests, [key(original), key(original), key(binding("b"))]);
});

test("fake, copied, expired and different-account or different-template leases fail closed", async () => {
  const a = binding("a"), locks = exclusiveLocks(); let retained;
  await withAdminTemplateCapture({ bindings: [a], locks }, lease => {
    retained = lease;
    for (const fake of [null, undefined, true, "lease", {}, Object.freeze({}), { ...lease }, Object.create(lease)]) {
      assert.throws(() => assertAdminTemplateCaptureLease(fake, [a]), isBlocked);
    }
    for (const other of [binding("b"), { ...a, actorId: "admin-b" }]) {
      assert.throws(() => assertAdminTemplateCaptureLease(lease, [other]), isBlocked);
    }
    assert.throws(() => assertAdminTemplateCaptureLease(lease, []), isBlocked);
    assert.throws(() => assertAdminTemplateCaptureLease(lease, [a, { ...a, itemKey: "shared-layout:other" }]), isBlocked);
    assert.equal(assertAdminTemplateCaptureLease(lease, [a]), true);
  });
  await withAdminTemplateCapture({ bindings: [a], locks }, next => {
    assert.notEqual(next, retained); assert.throws(() => assertAdminTemplateCaptureLease(retained, [a]), isBlocked);
    assert.equal(assertAdminTemplateCaptureLease(next, [a]), true);
  });
});

test("synchronous and asynchronous callback failures expire leases and release all locks for the next capture", { timeout: 2000 }, async () => {
  for (const asynchronous of [false, true]) {
    const a = binding("a"), b = binding("b"), locks = exclusiveLocks(), failure = Error("Durable journal unavailable");
    let retained;
    await assert.rejects(withAdminTemplateCapture({ bindings: [b, a], locks }, lease => {
      retained = lease;
      if (asynchronous) return Promise.resolve().then(() => { throw failure; });
      throw failure;
    }), error => error === failure);
    assert.equal(locks.held.size, 0); assert.throws(() => assertAdminTemplateCaptureLease(retained, [a]), isBlocked);
    await withAdminTemplateCapture({ bindings: [a, b], locks }, lease => assertAdminTemplateCaptureLease(lease, [a, b]));
    assert.equal(locks.held.size, 0);
  }
});

test("a later lock-request failure releases earlier bindings without issuing any lease", { timeout: 2000 }, async () => {
  const a = binding("a"), b = binding("b"), locks = exclusiveLocks(), request = locks.request, failure = Error("Lock unavailable");
  let called = false;
  locks.request = function (name, callback) { if (name === key(b)) return Promise.reject(failure); return request.call(this, name, callback); };
  await assert.rejects(withAdminTemplateCapture({ bindings: [a, b], locks }, () => { called = true; }), error => error === failure);
  assert.equal(called, false); assert.equal(locks.held.size, 0);
  locks.request = request;
  await withAdminTemplateCapture({ bindings: [a, b], locks }, lease => assertAdminTemplateCaptureLease(lease, [a, b]));
});

test("unsupported locking and invalid bindings stop before any request or callback", async () => {
  const a = binding("a"); let called = false;
  for (const locks of [undefined, null, {}, { request: true }]) {
    await assert.rejects(withAdminTemplateCapture({ bindings: [a], locks }, () => { called = true; }), isBlocked);
  }
  const locks = exclusiveLocks();
  const malformed = [null, [], {}, new Array(1), [null], [a, undefined], [{ ...a, actorId: "" }],
    [{ ...a, actorId: " admin-a" }], [{ ...a, actorId: "a".repeat(37) }], [{ ...a, environment: "production" }],
    [{ ...a, listId: "personal-list" }], [{ ...a, itemKey: "shared-layout:different" }],
    [{ ...a, listId: `public-shared-layout-${"a".repeat(64)}` }], [{ ...a, extra: true }], [Object.create(a)]];
  for (const bindings of malformed) {
    await assert.rejects(withAdminTemplateCapture({ bindings, locks }, () => { called = true; }), isBlocked);
  }
  await assert.rejects(withAdminTemplateCapture({ bindings: [a], locks }), isBlocked);
  assert.equal(called, false); assert.deepEqual(locks.requests, []);
  assert.deepEqual(adminTemplatePhotoActionBinding(a), a, "valid inputs use the existing binding grammar");
});
