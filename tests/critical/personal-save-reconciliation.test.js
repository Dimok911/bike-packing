import test from "node:test";
import assert from "node:assert/strict";
import { planPersonalPayloadReconciliation } from "../../src/sync/personal-save-reconciliation.js";

function fixture() {
  const payload = { containers: { bag: { id: "bag", name: "Bag", weight: 100, note: "" } }, items: {}, layouts: {}, categories: ["old"] };
  const base = { payload: structuredClone(payload), stateRevision: 5 }, local = structuredClone(payload);
  const remote = { payload: structuredClone(payload), stateRevision: 20 };
  return { base, local, remote, plan: () => planPersonalPayloadReconciliation({ base, local, remote }) };
}

test("personal reconciliation preserves independent fields and current remote additions without mutating inputs", () => {
  const f = fixture(); f.local.containers.bag.name = "Renamed"; f.remote.payload.containers.bag.weight = 200;
  f.remote.payload.items.new = { id: "new", name: "New", weight: 10 };
  const before = JSON.stringify(f), result = f.plan();
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.payload.containers.bag.name, "Renamed");
  assert.equal(result.payload.containers.bag.weight, 200);
  assert.ok(result.payload.items.new);
  assert.equal(JSON.stringify(f), before);
});

test("personal reconciliation does not pick a winner for the same field or DELETE versus edited entity", () => {
  for (const remove of [false, true]) {
    const f = fixture(); f.local.containers.bag.name = "Local";
    if (remove) delete f.remote.payload.containers.bag; else f.remote.payload.containers.bag.name = "Remote";
    const result = f.plan();
    assert.equal(result.conflicts.length, 1); assert.equal(result.payload, undefined);
    assert.equal(result.conflicts[0].remoteHas, !remove);
  }
});

test("personal reconciliation keeps a remote deletion when the local entity was unchanged", () => {
  const f = fixture(); delete f.remote.payload.containers.bag;
  f.local.items.new = { id: "new", name: "New", weight: 10 };
  assert.deepEqual(f.plan().payload.containers, {});
  assert.ok(f.plan().payload.items.new);
});

test("personal reconciliation never invents a common base or accepts an older/unavailable remote state", () => {
  const f = fixture();
  assert.equal(planPersonalPayloadReconciliation({ local: f.local, remote: f.remote }).blocked, "missing-base");
  assert.equal(planPersonalPayloadReconciliation({ ...f, remote: null }).blocked, "remote-unavailable");
  f.remote.stateRevision = 4; assert.equal(f.plan().blocked, "revision");
});

test("personal reconciliation preserves dictionary removals and conflicts on incompatible array edits", () => {
  const f = fixture(); f.remote.payload.categories = [];
  f.local.containers.bag.name = "Renamed";
  assert.deepEqual(f.plan().payload.categories, []);
  f.local.categories.push("local");
  assert.equal(f.plan().conflicts[0].id, "categories");
  assert.equal(f.plan().payload, undefined);
});

test("personal reconciliation preserves distinct newly created IDs but conflicts on a shared new ID", () => {
  const f = fixture(); f.local.items.a = { id: "a", name: "A" }; f.remote.payload.items.b = { id: "b", name: "B" };
  assert.deepEqual(Object.keys(f.plan().payload.items).sort(), ["a", "b"]);
  f.remote.payload.items.a = { id: "a", name: "Different" };
  assert.equal(f.plan().conflicts[0].id, "a");
});

test("personal reconciliation does not recursively combine incompatible layout structures or file actions", () => {
  const f = fixture(); f.base.payload.layouts.a = { id: "a", arrangement: { items: {} } };
  f.local.layouts.a = { id: "a", arrangement: { items: { x: "bag" } } };
  f.remote.payload.layouts.a = { id: "a", arrangement: { items: { y: "bag" } } };
  assert.equal(f.plan().conflicts[0].type, "layout");
  f.local.containers.bag.photos = [{ id: "p" }]; assert.equal(f.plan().blocked, "files-not-supported");
});

test("personal reconciliation distinguishes missing values from null and rejects malformed record maps", () => {
  const f = fixture(); f.base.payload.extra = null; f.local.extra = null;
  assert.equal(Object.hasOwn(f.plan().payload, "extra"), false);
  f.local.extra = "value"; assert.equal(f.plan().conflicts[0].id, "extra");
  f.local.items = []; assert.equal(f.plan().blocked, "invalid-map");
});

test("personal reconciliation rejects unsafe IDs, mismatched identities and non-record map entries", () => {
  for (const entries of ['{"__proto__":{"id":"__proto__"}}', '{"constructor":{}}', '{"a":{"id":"b"}}', '{"a":null}', '{"a":[]}', '{" a":{}}']) {
    const f = fixture(); f.local.items = JSON.parse(entries);
    assert.equal(f.plan().blocked, "invalid-map");
  }
});

test("explicit record choices retain independent changes and never mutate the comparison", () => {
  for (const side of ["local", "remote"]) {
    const f = fixture(); f.local.containers.bag.name = "Local"; f.remote.payload.containers.bag.name = "Remote";
    f.local.items.local = { id: "local", name: "Independent local" };
    f.remote.payload.items.remote = { id: "remote", name: "Independent remote" };
    const before = JSON.stringify(f);
    const result = planPersonalPayloadReconciliation({ ...f, choices: { 0: side } });
    assert.equal(result.payload.containers.bag.name, side === "local" ? "Local" : "Remote");
    assert.equal(result.resolved, 1); assert.deepEqual(Object.keys(result.payload.items).sort(), ["local", "remote"]);
    assert.equal(JSON.stringify(f), before);
    assert.equal(f.plan().conflicts[0].label, "Local");
  }
});

test("only complete explicit choices authorize a candidate; the whole-server choice is distinct", () => {
  const f = fixture(); f.local.containers.bag.name = "Local"; f.remote.payload.containers.bag.name = "Remote";
  for (const choices of [{}, [], null, { 0: "latest" }, { 0: "local", 1: "remote" }, Object.create({ 0: "local" })]) {
    const result = planPersonalPayloadReconciliation({ ...f, choices });
    assert.equal(result.blocked, "incomplete-choices"); assert.equal(result.payload, undefined);
  }
  f.local.categories.push("local-only");
  const result = planPersonalPayloadReconciliation({ ...f, choices: "server" });
  assert.deepEqual(result.payload, f.remote.payload); assert.notEqual(result.payload, f.remote.payload);
});

test("explicit deletion and restoration choices preserve missing records and missing settings", () => {
  for (const side of ["local", "remote"]) {
    const f = fixture(); f.local.containers.bag.name = "Local"; delete f.remote.payload.containers.bag;
    f.base.payload.extra = "old"; f.local.extra = "local";
    const result = planPersonalPayloadReconciliation({ ...f, choices: { 0: side, 1: side } });
    assert.equal(Object.hasOwn(result.payload.containers, "bag"), side === "local");
    assert.equal(Object.hasOwn(result.payload, "extra"), side === "local");
  }
});
