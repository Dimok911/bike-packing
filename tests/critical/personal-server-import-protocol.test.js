import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { preparePersonalServerImportSource } from "../../src/sync/personal-server-import-source.js";
import { preparePersonalServerImportSelection, preparePersonalServerEntitySelection } from "../../src/sync/personal-server-import-selection.js";
import { preparePersonalPublicImportSelection } from "../../src/sync/personal-public-import-selection.js";
import { assertPersonalServerImportBody, assertPersonalServerImportHashes, personalServerImportReceipt,
  validatePersonalServerImportResult } from "../../src/sync/personal-server-import-protocol.js";

async function fixture(kind, photos) {
  const f = kind === "layout" ? await publicImportFixture(!photos) : await publicEntityFixture({ kind, photos,
    transformSource: value => { if (photos && kind === "shell") value.containers.bag.photos = [{ id: "shared-bag-original" }]; } });
  const source = await preparePersonalServerImportSource({ stateRevision: 8, descriptor: { version: 1,
    id: `shared-entity-link-${randomUUID()}`, mode: "live", scope: "layout", entityType: "", entityId: "", layoutId: "a",
    title: "Chosen shared source", description: "", includeAuthor: false, authorName: "" } });
  const { publicImport, ...body } = f.action.body;
  f.action.body = { ...body, serverImport: { ...publicImport, source },
    causal: { dependsOn: [], reads: [{ listId: source.listId, revision: source.stateRevision }] } };
  return f;
}

for (const kind of ["layout", "tree", "shell", "item", "catalog"]) for (const photos of [false, true])
test(`server import ${kind} ${photos ? "with files" : "without files"} binds source version, saved IDs and exact placement`, async () => {
  const { action, plan, options } = await fixture(kind, photos), body = action.body, frozen = structuredClone(body);
  assert.deepEqual(assertPersonalServerImportBody(body, options), plan); await assertPersonalServerImportHashes(body);
  assert.deepEqual(body, frozen);
  for (const mutate of [value => { value.serverImport.source.stateRevision++; }, value => { value.causal.reads = []; },
    value => { value.serverImport.ownerTargets[0].reuse = true; }, value => { value.publicImport = value.serverImport; },
    value => { value.serverImport.source.listId = "private-other-owner"; }, value => { value.serverImport.source.mode = "snapshot"; },
    value => { const owner = value.serverImport.ownerTargets[0]; value.serverImport.sourcePayload[owner.entityType === "item" ? "items" : "containers"][owner.sourceId].name = "A newer source"; },
    value => { value.serverImport.payloadHash = "unchecked"; }, value => { value.serverImport.version = 19; }]) {
    const changed = structuredClone(body); mutate(changed); assert.throws(() => assertPersonalServerImportBody(changed, options));
  }
  const changed = structuredClone(body); changed.serverImport.sourcePayload.items.item.unrelated = "different selected bytes";
  await assert.rejects(assertPersonalServerImportHashes(changed));
});

test("server import receipt proves its own source and every newly owned file, with no success borrowed from another adapter", async () => {
  const { action } = await fixture("layout", true), manifest = action.body.serverImport, payload = structuredClone(action.body.payload);
  const serverPhotos = manifest.files.map(file => {
    const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: action.listId, status: "synced",
      url: "https://example.test/selected.png", thumbUrl: "https://example.test/selected-thumb.png", fileName: file.file.fileName,
      type: file.file.type, size: file.file.size, width: 1, height: 1 };
    payload[file.entityType === "item" ? "items" : "containers"][file.entityId].photos = [photo];
    return { entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId,
      fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, photo };
  });
  const revision = manifest.targetStateRevision + 1;
  const result = { ok: true, stateRevision: revision, list: { id: action.listId, stateRevision: revision, payload },
    serverImport: personalServerImportReceipt(manifest), serverPhotos };
  assert.equal(validatePersonalServerImportResult(result, action), true);
  for (const mutate of [value => { value.serverPhotos = []; }, value => { value.serverPhotos[0].entityId = "another-owner"; },
    value => { value.serverPhotos[0].fileHash = "0".repeat(64); }, value => { value.serverImport.source.selectionHash = "0".repeat(64); },
    value => { value.serverImport.source.stateRevision++; }, value => { value.publicImport = value.serverImport; },
    value => { value.sharedLink = {}; }, value => { value.list.payload.items[manifest.files[0].entityId].name = "Changed target"; }]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalServerImportResult(changed, action), false);
  }
});

for (const kind of ["layout", "tree", "shell", "item", "catalog"])
test(`saved server ${kind} selection allocates once before waits and preserves its own source grammar`, async () => {
  const f = await fixture(kind, true), input = { ...f.selection, source: f.action.body.serverImport.source,
    ...(kind === "layout" ? { layoutIds: ["a"], layoutNames: ["New chosen copy"] } : {}) };
  const prepare = kind === "layout" ? preparePersonalServerImportSelection : preparePersonalServerEntitySelection;
  assert.throws(() => prepare(input, { createUuid: () => assert.fail("disabled allocator") }));
  const repeated = randomUUID(); assert.throws(() => prepare(input, { enabled: true, createUuid: () => repeated }));
  const selection = prepare(input, { enabled: true }), frozen = structuredClone(selection);
  assert.ok(selection.ownerTargets.every(owner => !owner.reuse && owner.sourceId !== owner.targetId));
  assert.deepEqual(selection.source, f.action.body.serverImport.source);
  assert.throws(() => prepare(input, { enabled: true, createUuid: () => input.source.listId }));
  if (kind === "layout") assert.throws(() => preparePersonalPublicImportSelection(input, { enabled: true }));
  input.source.stateRevision++; input.sourcePayload.items.item.name = "Later source"; input.basePayload.locations.push("Later target");
  assert.deepEqual(selection, frozen);
});
