import test from "node:test";
import assert from "node:assert/strict";
import { planPersonalOrdinaryRebase } from "../../src/sync/personal-ordinary-rebase.js";

const listId = "list-rebase", clone = structuredClone;
const bases = ["https://api.vniipo-help.ru/letters-vniipo/api", "https://api.vniipo-help.ru/experiment/letters-vniipo/api",
  "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api", "https://experiment.vniipo-help.ru/letters-vniipo/api"];
function routes(photo, origin) {
  for (const [key, variant] of [["url", "file"], ["thumbUrl", "thumb"]]) {
    photo[key] = `${origin}/bike-packing/lists/${listId}/photos/${photo.id}/${variant}?v=old%2Fphoto&width=300`;
  }
}
function fixture() {
  const photo = { id: "legacy-1", listId, status: "synced", width: 640, height: 480, updatedAt: "2026-09-14T10:00:00.000Z" };
  routes(photo, bases[0]);
  const payload = { items: { tent: { id: "tent", name: "Tent", weight: 100, note: "", futureField: { keep: [1, 2] } } },
    containers: { bag: { id: "bag", name: "Bag", weight: 200, photos: [photo] },
      empty: { id: "empty", name: "No photos", photos: [] }, absent: { id: "absent", name: "Absent photos field" } },
    layouts: { layout: { id: "layout", name: "Trip", arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { parentId: "", itemIds: [], childIds: [], order: [] } }, items: {}, packedItems: {} } } },
    categories: ["Tools", "Old"], unknownSetting: { exact: ["retain", { nested: true }] } };
  const f = { listId, base: { payload: clone(payload), stateRevision: 1582 }, local: clone(payload),
    remote: { payload: clone(payload), stateRevision: 1585 } };
  f.plan = choices => planPersonalOrdinaryRebase({ ...f, choices }); return f;
}

test("trusted base rebase retains local weight and independent server bag addition without mutating inputs", () => {
  const f = fixture(); f.local.items.tent.weight = 120;
  f.remote.payload.containers.new = { id: "new", name: "Server bag", weight: 300 };
  f.remote.payload.layouts.layout.arrangement.rootContainerIds.push("new");
  f.remote.payload.layouts.layout.arrangement.containers.new = { parentId: "", itemIds: [], childIds: [], order: [] };
  const original = clone({ base: f.base, local: f.local, remote: f.remote });
  const result = f.plan(); assert.deepEqual(result.conflicts, []);
  assert.equal(result.payload.items.tent.weight, 120); assert.deepEqual(result.payload.containers.new, f.remote.payload.containers.new);
  assert.deepEqual(result.payload.layouts, f.remote.payload.layouts);
  assert.deepEqual(result.payload.containers.bag.photos, f.remote.payload.containers.bag.photos);
  assert.deepEqual(result.payload.items.tent.futureField, original.local.items.tent.futureField);
  assert.deepEqual(result.payload.unknownSetting, original.remote.payload.unknownSetting);
  assert.deepEqual({ base: f.base, local: f.local, remote: f.remote }, original);
  result.payload.containers.bag.photos[0].width = 0; assert.deepEqual(f.remote, original.remote);
});

test("only approved legacy aliases compare equal; output uses the remote raw URLs with exact query and empty metadata", () => {
  for (const localBase of bases) for (const remoteBase of bases) {
    const f = fixture();
    for (const payload of [f.base.payload, f.local, f.remote.payload]) {
      payload.containers.bag.photos[0].listId = "";
      payload.containers.oldCopy = { id: "oldCopy", name: "Old owner", photos: clone(payload.containers.bag.photos) };
    }
    for (const collection of [f.local, f.remote.payload]) for (const id of ["bag", "oldCopy"]) {
      routes(collection.containers[id].photos[0], collection === f.local ? localBase : remoteBase);
    }
    f.local.items.tent.weight = 120;
    const result = f.plan(); assert.deepEqual(result.conflicts, []);
    for (const id of ["bag", "oldCopy"]) assert.deepEqual(result.payload.containers[id].photos, f.remote.payload.containers[id].photos);
  }
});

test("same-field conflict exposes complete records and explicit choices retain exact remote photos", () => {
  const f = fixture(); f.local.containers.bag.name = "Local"; f.remote.payload.containers.bag.name = "Remote";
  routes(f.local.containers.bag.photos[0], bases[1]);
  const result = f.plan(); assert.equal(result.payload, undefined); assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].baseValue.photos, f.base.payload.containers.bag.photos);
  assert.deepEqual(result.conflicts[0].localValue.photos, f.local.containers.bag.photos);
  assert.deepEqual(result.conflicts[0].remoteValue.photos, f.remote.payload.containers.bag.photos);
  assert.equal(f.plan({ 0: "local" }).payload.containers.bag.name, "Local");
  assert.deepEqual(f.plan({ 0: "local" }).payload.containers.bag.photos, f.remote.payload.containers.bag.photos);
  assert.equal(f.plan({ 0: "remote" }).payload.containers.bag.name, "Remote");
});

test("missing or invalid base and older/unavailable remote never infer a base from local data", () => {
  const f = fixture();
  for (const base of [undefined, null, {}, { payload: f.local }, { payload: f.local, stateRevision: "1582" }]) {
    assert.equal(planPersonalOrdinaryRebase({ ...f, base }).blocked, "missing-base");
  }
  assert.equal(planPersonalOrdinaryRebase({ ...f, remote: null }).blocked, "remote-unavailable");
  assert.equal(planPersonalOrdinaryRebase({ ...f, remote: { ...f.remote, stateRevision: 1581 } }).blocked, "revision");
});

test("unmodified deleted entities stay deleted; local edit versus deletion is a conflict", () => {
  const f = fixture(); delete f.remote.payload.items.tent;
  assert.equal(Object.hasOwn(f.plan().payload.items, "tent"), false);
  f.local.items.tent.weight = 120;
  assert.equal(f.plan().payload, undefined); assert.equal(f.plan().conflicts[0].remoteHas, false);
  assert.equal(Object.hasOwn(f.plan({ 0: "remote" }).payload.items, "tent"), false);
});

test("dictionary and unknown arrays preserve deletions and report incompatible changes rather than union", () => {
  const f = fixture(); f.local.items.tent.weight = 120; f.remote.payload.categories = ["Tools"];
  f.remote.payload.unknownSetting.exact = ["retain"];
  assert.deepEqual(f.plan().payload.categories, ["Tools"]); assert.deepEqual(f.plan().payload.unknownSetting.exact, ["retain"]);
  f.local.categories.push("Local");
  assert.equal(f.plan().payload, undefined); assert.equal(f.plan().conflicts[0].id, "categories");
});

test("empty photo field presence remains distinct and no absent field is defaulted", () => {
  const f = fixture(); f.local.items.tent.weight = 120;
  let result = f.plan(); assert.deepEqual(result.payload.containers.empty.photos, []);
  assert.equal(Object.hasOwn(result.payload.containers.absent, "photos"), false);
  delete f.remote.payload.containers.empty.photos;
  result = f.plan(); assert.equal(Object.hasOwn(result.payload.containers.empty, "photos"), false);
});

test("independent edits inside the same layout remain an explicit whole-layout conflict", () => {
  const f = fixture(); f.local.layouts.layout.arrangement.packedItems.tent = true;
  f.remote.payload.layouts.layout.name = "Server trip";
  const result = f.plan(); assert.equal(result.payload, undefined);
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].type, "layout");
});

for (const mode of ["foreign-host", "foreign-list", "wrong-variant", "query", "query-order", "photo-order", "metadata", "pending",
  "delete-owner", "move-owner", "new-copy", "duplicate", "unknown-photo-field", "unsupported-photo-location"]) {
  test(`photo-bearing rebase refuses ${mode} before producing any candidate`, () => {
    const f = fixture();
    for (const payload of [f.base.payload, f.local, f.remote.payload]) {
      const next = clone(payload.containers.bag.photos[0]); next.id = "legacy-2"; routes(next, bases[0]); payload.containers.bag.photos.push(next);
    }
    const photos = f.remote.payload.containers.bag.photos;
    if (mode === "foreign-host") photos[0].url = photos[0].url.replace("api.vniipo-help.ru", "foreign.example");
    if (mode === "foreign-list") photos[0].url = photos[0].url.replace(`/lists/${listId}/`, "/lists/foreign/");
    if (mode === "wrong-variant") photos[0].url = photos[0].thumbUrl;
    if (mode === "query") photos[0].url += "&new=1";
    if (mode === "query-order") photos[0].url = photos[0].url.replace("v=old%2Fphoto&width=300", "width=300&v=old%2Fphoto");
    if (mode === "photo-order") photos.reverse();
    if (mode === "metadata") photos[0].height++;
    if (mode === "pending") photos[0].status = "pending";
    if (mode === "delete-owner") delete f.remote.payload.containers.bag;
    if (mode === "move-owner") { f.remote.payload.containers.empty.photos = photos; f.remote.payload.containers.bag.photos = []; }
    if (mode === "new-copy") f.remote.payload.containers.empty.photos = clone(photos);
    if (mode === "duplicate") photos.push(clone(photos[0]));
    if (mode === "unknown-photo-field") photos[0].newUpload = true;
    if (mode === "unsupported-photo-location") f.remote.payload.unknownSetting.photos = clone(photos);
    const before = clone({ base: f.base, local: f.local, remote: f.remote }), result = f.plan();
    assert.ok(["photo-inventory", "files-not-supported"].includes(result.blocked)); assert.equal(result.payload, undefined);
    assert.deepEqual({ base: f.base, local: f.local, remote: f.remote }, before);
  });
}

test("complete unchanged causal refs may coexist with legacy refs; malformed or duplicate causal assets are refused", () => {
  const f = fixture(), photo = { id: "causal-1", photoId: "causal-1", assetId: "12345678-1234-4234-8234-123456789abc", listId,
    status: "synced", url: "https://example.test/file", thumbUrl: "https://example.test/thumb", fileName: "photo.png", type: "image/png", size: 5, width: 1, height: 1 };
  for (const payload of [f.base.payload, f.local, f.remote.payload]) payload.items.tent.photos = [clone(photo)];
  f.local.items.tent.weight = 120;
  assert.deepEqual(f.plan().payload.items.tent.photos, [photo]);
  f.local.items.tent.photos[0].size++;
  assert.equal(f.plan().blocked, "photo-inventory");
  f.local.items.tent.photos[0].size--;
  for (const payload of [f.base.payload, f.local, f.remote.payload]) payload.items.tent.photos.push({ ...clone(photo), id: "causal-2", photoId: "causal-2" });
  assert.equal(f.plan().blocked, "photo-inventory", "even identical inventories cannot legitimize a duplicate causal asset");
});

test("malformed complete maps and non-JSON values are rejected before lossy projection", () => {
  for (const change of [f => { delete f.local.layouts; }, f => { f.local.layouts.layout.arrangement = {}; },
    f => { f.local.items.tent.futureField = undefined; }, f => { f.local.items.tent.weight = NaN; }]) {
    const f = fixture(); change(f); assert.equal(f.plan().blocked, "invalid-payload");
  }
});
