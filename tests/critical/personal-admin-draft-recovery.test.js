import test from "node:test";
import assert from "node:assert/strict";
import { recoverPersonalAdminDrafts, personalPayloadWithoutAdminDrafts } from "../../src/sync/personal-admin-draft-recovery.js";

const options = { enabled: true, scopeKey: "id:admin-a" };
function fixture(shared = false) {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment",
    listId: shared ? "public-shared-layout-ui" : "public-demo-state-ui", itemKey: shared ? "shared-layout:ui" : "demo-state:ui" };
  const snapshot = { items: { personal: { id: "personal", name: "Durable personal edit" },
    old: { id: "old", publicCatalogLayoutId: "admin" } },
    containers: { bag: { id: "bag", publicCatalogLayoutId: "admin", itemIds: ["old"] } },
    layouts: { personal: { id: "personal", arrangement: { items: { personal: "" } } },
      admin: { id: "admin", ...(shared ? { adminSharedSourceId: "ui" } : { adminDemo: true, adminDemoListId: binding.listId }),
        adminCausalSource: { version: 1, binding, base: { stateRevision: 7 }, planId: null },
        arrangement: { items: { old: "bag" } } } },
    locations: ["Durable"], packedItems: { personal: true }, activeLayoutId: "personal" };
  const mirror = structuredClone(snapshot);
  mirror.items.personal.name = "Stale mirror";
  mirror.items.deletedPersonal = { id: "deletedPersonal" };
  mirror.layouts.personal.name = "Stale layout";
  mirror.locations = ["Stale"]; mirror.packedItems = {}; mirror.activeLayoutId = "admin";
  delete mirror.items.old;
  mirror.items.copy = { id: "copy", name: "Chosen copy", publicCatalogLayoutId: "admin" };
  mirror.items.detached = { id: "detached", name: "Unplaced", publicCatalogLayoutId: "admin" };
  mirror.containers.bag.itemIds = ["copy"];
  mirror.layouts.admin.arrangement.items = { copy: "bag" };
  mirror.layouts.admin.adminCausalSource.base.stateRevision = 8;
  return { snapshot, mirror };
}

for (const shared of [false, true]) test(`private recovery keeps the independent ${shared ? "shared" : "demo"} draft, including a pre-capture copy`, () => {
  for (const quota of [false, true]) {
    const { snapshot, mirror } = fixture(shared), original = structuredClone(snapshot);
    if (quota) {
      mirror.layouts.admin.adminCausalSource.base.stateRevision = 7;
      mirror.layouts.admin.adminCausalCopyPlan = { id: "immutable-plan", sourceSnapshot: { items: { copy: mirror.items.copy } } };
    }
    const result = recoverPersonalAdminDrafts(snapshot, JSON.stringify(mirror), options);
    assert.deepEqual(result.layouts.admin, mirror.layouts.admin);
    assert.deepEqual(result.containers, mirror.containers);
    assert.deepEqual(result.items, { personal: snapshot.items.personal, copy: mirror.items.copy, detached: mirror.items.detached });
    for (const key of ["locations", "packedItems", "activeLayoutId"]) assert.deepEqual(result[key], snapshot[key]);
    assert.deepEqual(result.layouts.personal, snapshot.layouts.personal);
    assert.deepEqual(snapshot, original);
    result.layouts.admin.adminCausalSource.base.stateRevision = 99;
    assert.notEqual(mirror.layouts.admin.adminCausalSource.base.stateRevision, 99);
  }
});

test("removed drafts and catalog records are not resurrected by a private snapshot", () => {
  const { snapshot, mirror } = fixture();
  delete mirror.layouts.admin;
  const result = recoverPersonalAdminDrafts(snapshot, JSON.stringify(mirror), options);
  assert.deepEqual(result.layouts, { personal: snapshot.layouts.personal });
  assert.deepEqual(result.items, { personal: snapshot.items.personal });
  assert.deepEqual(result.containers, {});
});

test("an older mirror cannot roll back a confirmed administrative revision", () => {
  const { snapshot, mirror } = fixture();
  snapshot.layouts.admin.adminCausalSource.base.stateRevision = 9;
  const before = structuredClone({ snapshot, mirror });
  assert.throws(() => recoverPersonalAdminDrafts(snapshot, JSON.stringify(mirror), options), { code: "admin-template-editor-recovery-required" });
  assert.deepEqual({ snapshot, mirror }, before);
});

test("another account, environment and legacy public cache cannot supply administrative drafts", () => {
  for (const change of [layout => { layout.adminCausalSource.binding.actorId = "other"; },
    layout => { layout.adminCausalSource.binding.environment = "production"; }, layout => { delete layout.adminCausalSource; }]) {
    const { snapshot, mirror } = fixture();
    delete snapshot.layouts.admin; delete snapshot.items.old; delete snapshot.containers.bag;
    change(mirror.layouts.admin);
    assert.deepEqual(recoverPersonalAdminDrafts(snapshot, JSON.stringify(mirror), options), snapshot);
  }
});

test("collisions and invalid administrative ownership stop recovery without changing either input", () => {
  for (const change of [f => { f.mirror.items.personal.publicCatalogLayoutId = "admin"; },
    f => { f.mirror.layouts.admin.adminCausalSource.binding.itemKey = "shared-layout:ui"; },
    f => { f.snapshot.items.copy = { id: "copy", name: "Private collision" }; },
    f => { f.mirror.items.copy.id = "different"; }, f => { delete f.snapshot.layouts.admin.adminCausalSource; },
    f => { f.mirror.layouts.admin.adminCausalSource.binding.actorId = "other"; },
    f => { f.mirror.layouts.admin.arrangement.items.personal = "bag"; },
    f => { f.mirror.containers.bag.itemIds.push("personal"); },
    f => { f.mirror.items.copy.publicCatalogLayoutId = "constructor"; },
    f => {
      f.snapshot.containers.privateBag = { id: "privateBag" };
      f.mirror.containers.privateBag = { id: "privateBag" };
      f.mirror.layouts.admin.arrangement.containers = { bag: { childIds: ["privateBag"] } };
    },
    f => { f.mirror.layouts.admin.arrangement.containers = { bag: { itemIds: ["personal"] } }; },
    f => { f.mirror.containers.bag.order = [{ type: "item", id: "personal" }]; }]) {
    const f = fixture(); change(f); const before = structuredClone(f);
    assert.throws(() => recoverPersonalAdminDrafts(f.snapshot, JSON.stringify(f.mirror), options), { code: "admin-template-editor-recovery-required" });
    assert.deepEqual(f, before);
  }
});

test("disabled and guest recovery do not interpret the mirror; corrupt active recovery fails closed", () => {
  const { snapshot } = fixture();
  for (const args of [{}, { ...options, enabled: false }, { ...options, scopeKey: "guest" }]) {
    assert.deepEqual(recoverPersonalAdminDrafts(snapshot, "corrupt", args), snapshot);
  }
  assert.throws(() => recoverPersonalAdminDrafts(snapshot, "corrupt", options), { isPersonalSaveBlocked: true });
  assert.deepEqual(recoverPersonalAdminDrafts(snapshot, null, options), snapshot);
});

test("exact private projection removes only validated administrative records without normalizing business fields", () => {
  for (const shared of [false, true]) {
    const { mirror: mixed } = fixture(shared);
    mixed.items.personal.custom = { unknown: [2, 1] };
    mixed.items.personal.photos = [{ photoId: "legacy", metadata: { credit: "Exact" }, fileName: "Original.png" }];
    mixed.layouts.personal.arrangement = { rootContainerIds: [], containers: {}, items: { personal: "" },
      itemQuantities: { personal: 7 }, packedItems: { personal: true }, unknown: { exact: true } };
    mixed.packedItems = {}; mixed.categories = ["Unsorted", "A", "Unsorted"];
    mixed.unknown = { preserve: [3, 2, 1] };
    const before = structuredClone(mixed), expected = structuredClone(mixed);
    delete expected.layouts.admin; delete expected.containers.bag; delete expected.items.copy; delete expected.items.detached;
    const privatePayload = personalPayloadWithoutAdminDrafts(mixed, options);
    assert.deepEqual(privatePayload, expected); assert.deepEqual(mixed, before);
    privatePayload.items.personal.custom.unknown.push(3); assert.deepEqual(mixed, before);
  }
});

test("exact private projection fails closed on cross-namespace references and leaves foreign origins unapproved", () => {
  for (const change of [value => { value.layouts.admin.arrangement.items.personal = "bag"; },
    value => { value.items.copy.id = "other"; }, value => { value.containers.bag.itemIds.push("personal"); }]) {
    const { mirror } = fixture(); change(mirror); const before = structuredClone(mirror);
    assert.throws(() => personalPayloadWithoutAdminDrafts(mirror, options), { isPersonalSaveBlocked: true });
    assert.deepEqual(mirror, before);
  }
  for (const change of [value => { value.layouts.admin.adminCausalSource.binding.actorId = "other"; },
    value => { value.layouts.admin.adminCausalSource.binding.environment = "production"; },
    value => { delete value.layouts.admin.adminCausalSource; }]) {
    const { mirror } = fixture(); change(mirror);
    assert.deepEqual(personalPayloadWithoutAdminDrafts(mirror, options), mirror);
  }
  const { mirror } = fixture();
  assert.deepEqual(personalPayloadWithoutAdminDrafts(mirror, { ...options, enabled: false }), mirror);
});
