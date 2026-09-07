import test from "node:test";
import assert from "node:assert/strict";
import { readPersonalPhotoFormOwnerRevision } from "../../src/sync/personal-photo-form-base.js";

function fixture(type = "item") {
  const collection = type === "item" ? "items" : "containers";
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "frozen", form: "form-1" };
  const owner = { id: "owner", name: "Original", photos: [] };
  const request = { binding, entityType: type, entityId: "owner", basePayload: { [collection]: { owner } }, baseStateRevision: 9 };
  const response = { ok: true, listId: "list", stateRevision: 9, [collection]: [{ id: "owner", listId: "list", ownerId: "actor",
    stateRevision: 3, deleted: false, deletedAt: null, payload: structuredClone(owner) }] };
  const paths = [];
  const options = { getContext: () => context, readEntities: async path => { paths.push(path); return response; } };
  return { request, response, context, paths, options, collection };
}

test("existing item and bag forms resolve the exact owner revision, not the list revision or a timestamp", async () => {
  for (const type of ["item", "container"]) {
    const f = fixture(type);
    assert.equal(await readPersonalPhotoFormOwnerRevision(f.request, f.options), 3);
    assert.deepEqual(f.paths, [`/bike-packing/lists/list/${f.collection}`]);
    assert.equal(f.request.baseStateRevision, 9);
  }
});

test("source response cannot rebase, resurrect, change owner, omit authority or hide duplicate rows", async () => {
  for (const mutate of [f => { f.response.stateRevision = 10; }, f => { f.response.listId = "other"; },
    f => { f.response.items[0].ownerId = "other"; }, f => { f.response.items[0].listId = "other"; },
    f => { f.response.items[0].stateRevision = 10; }, f => { f.response.items[0].stateRevision = 0; },
    f => { f.response.items[0].deleted = true; }, f => { delete f.response.items[0].deleted; },
    f => { f.response.items[0].deletedAt = "2026-09-07T00:00:00Z"; }, f => { f.response.items[0].payload.name = "Changed elsewhere"; },
    f => { f.response.items.push(structuredClone(f.response.items[0])); }, f => { f.response.items = []; }]) {
    const f = fixture(); mutate(f);
    await assert.rejects(readPersonalPhotoFormOwnerRevision(f.request, f.options), { code: "photo-form-base" });
  }
});

test("read freezes the click-time owner and refuses any changed editor, dialog, account, route scope or list", async () => {
  for (const key of ["generation", "form", "actorId", "scopeKey", "listId", "scope", "environment"]) {
    const f = fixture();
    f.options.readEntities = async () => { f.context[key] = "changed"; return f.response; };
    await assert.rejects(readPersonalPhotoFormOwnerRevision(f.request, f.options), { code: "photo-form-base" });
  }
  const f = fixture();
  f.options.readEntities = async () => { f.request.basePayload.items.owner.name = "Late edit"; f.request.binding.listId = "other"; return f.response; };
  assert.equal(await readPersonalPhotoFormOwnerRevision(f.request, f.options), 3);
});

test("new or absent owners and malformed inputs do not trigger an entity lookup", async () => {
  for (const change of [f => { delete f.request.basePayload.items.owner; }, f => { f.request.entityType = "admin"; },
    f => { f.request.baseStateRevision = 0; }, f => { f.request.binding.scopeKey = "id:other"; }]) {
    const f = fixture(); change(f);
    await assert.rejects(readPersonalPhotoFormOwnerRevision(f.request, f.options));
    assert.deepEqual(f.paths, []);
  }
});
