import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planPersonalPayloadReconciliation } from "../../src/sync/personal-save-reconciliation.js";
import { personalBusinessPayload } from "../../src/sync/personal-server-payload.js";
import { recoverPersonalAdminDrafts } from "../../src/sync/personal-admin-draft-recovery.js";
import { personalSnapshotWithUiPreferences } from "../../src/sync/personal-snapshot-codec.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

function actualReconciledSnapshot({ state, localStorageScopeKey = "id:admin-a", normalizeRemoteState }) {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function personalReconciledSnapshot\([^]*?\n\}/)[0];
  const deps = { personalBusinessPayload, recoverPersonalAdminDrafts, personalSnapshotWithUiPreferences,
    cloneStateForSync: cloneStateForSyncPayload,
    sameJson: (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b),
    state, localStorageScopeKey, adminTemplateUiEnabled: () => true, normalizeRemoteState };
  return new Function(...Object.keys(deps), `return (${source});`)(...Object.values(deps));
}

test("actual reconciled snapshot still rejects business repairs after projecting display mirrors", () => {
  const payload = { containers: { bag: { id: "bag", name: "Exact", weight: 10 } }, items: {}, layouts: {},
    locations: ["Bike"], categories: ["Tools"], activeLayoutId: "", packedItems: {} };
  for (const repair of ["none", "delete", "add", "edit", "dictionary"]) {
    const make = actualReconciledSnapshot({ state: structuredClone(payload),
      normalizeRemoteState: value => {
        const result = structuredClone(value); result.collapsedContainers = {};
        if (repair === "delete") delete result.containers.bag;
        if (repair === "add") result.items.added = { id: "added" };
        if (repair === "edit") result.containers.bag.weight = 99;
        if (repair === "dictionary") result.categories = [];
        return result;
      } });
    if (repair === "none") assert.equal(make(payload, { activeLayoutId: "" }).containers.bag.weight, 10);
    else assert.throws(() => make(payload, { activeLayoutId: "" }), /проверки структуры/);
  }
  assert.equal(payload.containers.bag.weight, 10);
});

test("actual personal reconciliation retains the current actor's administrative draft and immutable plan", () => {
  const payload = { containers: {}, items: { personal: { id: "personal", name: "Reconciled personal edit" } },
    layouts: { personal: { id: "personal", rootContainerIds: [], arrangement: {
      rootContainerIds: [], containers: {}, items: { personal: "" }, itemQuantities: { personal: 2 }, packedItems: { personal: true } } } },
    locations: ["Reconciled"], categories: ["Tools"] };
  const previous = { ...structuredClone(payload), activeLayoutId: "personal", showItemMeta: true };
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment",
    listId: "public-demo-state-ui", itemKey: "demo-state:ui" };
  const adminPayload = { items: { copy: { id: "copy", name: "Chosen administrative copy" },
    detached: { id: "detached", name: "Unplaced administrative record" } },
    containers: { adminBag: { id: "adminBag", itemIds: ["copy"] } },
    layouts: { admin: { id: "admin", rootContainerIds: ["adminBag"], arrangement: { rootContainerIds: ["adminBag"],
      containers: { adminBag: { parentId: "", itemIds: ["copy"], childIds: [], order: [] } },
      items: { copy: "adminBag" }, itemQuantities: { copy: 1 }, packedItems: {} } } } };
  const plan = adminTemplateSavePlan({ binding, operationId: "12345678-1234-4234-8234-123456789abc", exists: true,
    visibility: "private", base: { stateRevision: 7 }, payload: adminPayload,
    metadata: { title: "Admin draft", description: "", language: "ru" } });
  const state = structuredClone(previous);
  state.items.personal.name = "Stale private mirror";
  state.items.deletedPersonal = { id: "deletedPersonal", name: "Must stay deleted" };
  state.locations = ["Stale mirror"]; state.categories = ["Stale mirror"];
  state.items.copy = { ...adminPayload.items.copy, publicCatalogLayoutId: "admin" };
  state.items.detached = { ...adminPayload.items.detached, publicCatalogLayoutId: "admin" };
  state.containers.adminBag = { ...adminPayload.containers.adminBag, publicCatalogLayoutId: "admin" };
  state.layouts.admin = { ...structuredClone(adminPayload.layouts.admin), adminDemo: true, adminDemoListId: binding.listId,
    adminCausalSource: { version: 1, binding, base: { stateRevision: 7 }, planId: null },
    templateDraftSyncPending: true, adminCausalCopyPlan: plan };
  state.layouts.foreign = { id: "foreign", adminDemo: true, adminDemoListId: "public-demo-state-other",
    adminCausalSource: { version: 1, binding: { ...binding, actorId: "other", listId: "public-demo-state-other", itemKey: "demo-state:other" },
      base: { stateRevision: 9 }, planId: null } };
  state.items.foreign = { id: "foreign", publicCatalogLayoutId: "foreign" };
  const before = structuredClone({ payload, previous, state });
  const make = actualReconciledSnapshot({ state, normalizeRemoteState: value => structuredClone(value) });
  const result = make(payload, previous);
  assert.deepEqual(result.layouts, { ...payload.layouts, admin: state.layouts.admin });
  assert.deepEqual(result.items, { ...payload.items, copy: state.items.copy, detached: state.items.detached });
  assert.deepEqual(result.containers, { adminBag: state.containers.adminBag });
  assert.deepEqual(result.locations, payload.locations); assert.deepEqual(result.categories, payload.categories);
  assert.equal(result.activeLayoutId, "personal"); assert.equal(result.showItemMeta, true);
  assert.deepEqual(result.layouts.admin.adminCausalCopyPlan, plan);
  assert.deepEqual({ payload, previous, state }, before);
  result.layouts.admin.adminCausalCopyPlan.operations[0].body.payload.items.copy.name = "Changed returned copy";
  assert.deepEqual(state, before.state);
});

test("assembled server projection removes only display mirrors and never rewrites arrangement, files or unknown data", () => {
  const value = { activeLayoutId: "other", packedItems: {}, collapsedContainers: { bag: true }, showItemMeta: true,
    locations: ["Bike"], categories: ["Tools"], customSetting: { retained: true },
    items: { a: { id: "a", name: "Exact name", containerId: "wrong-mirror", quantity: 1, photos: [{ id: "file", localOnly: "keep" }] } },
    containers: { bag: { id: "bag", parentId: "wrong-mirror", itemIds: ["wrong"], childIds: ["wrong"], order: [], weight: 10 } },
    layouts: { l: { id: "l", arrangement: { rootContainerIds: ["bag"], containers: { bag: { parentId: "", itemIds: ["a"], childIds: [], order: [] } },
      items: { a: "bag" }, itemQuantities: { a: 3 }, packedItems: { a: true } } } } };
  const original = structuredClone(value), result = personalBusinessPayload(value);
  assert.deepEqual(value, original); assert.equal(result.activeLayoutId, undefined); assert.equal(result.packedItems, undefined);
  assert.equal(result.items.a.containerId, undefined); assert.equal(result.containers.bag.itemIds, undefined);
  assert.deepEqual(result.layouts, original.layouts); assert.deepEqual(result.items.a.photos, original.items.a.photos);
  assert.deepEqual(result.customSetting, original.customSetting); assert.deepEqual(result.categories, original.categories);
  assert.equal(result.items.a.name, original.items.a.name); assert.equal(result.containers.bag.weight, 10);
  assert.deepEqual(personalBusinessPayload(result), result);
});

test("server projection refuses missing authority and malformed maps instead of repairing or erasing them", () => {
  const valid = { items: {}, containers: {}, layouts: {} };
  for (const payload of [null, [], { ...valid, items: [] }, { ...valid, containers: { a: { id: "wrong" } } },
    { ...valid, layouts: { l: { id: "l" } } }, { ...valid, layouts: { l: { id: "l", arrangement: { items: {}, containers: {}, packedItems: {}, rootContainerIds: {} } } } },
    JSON.parse('{"items":{"__proto__":{}},"containers":{},"layouts":{}}')]) assert.throws(() => personalBusinessPayload(payload), /структуру/);
  assert.deepEqual(personalBusinessPayload(valid), valid);
});

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
