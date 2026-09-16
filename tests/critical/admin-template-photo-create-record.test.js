import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { adminPhotoCreateRecordInput } from "../fixtures/admin-template-photo-create-record-fixture.js";
import { prepareAdminTemplatePhotoCreateRecord } from "../../src/public/admin-template-photo-create-state.js";
import { encodeAdminTemplatePhotoCreateRecord, decodeAdminTemplatePhotoCreateRecord } from "../../src/sync/admin-template-photo-create-record.js";
import { encodeAdminTemplatePhotoRecord } from "../../src/sync/admin-template-photo-record.js";
import { applyLayoutArrangementToState } from "../../src/state/layout-arrangement.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";
import { migrateContainerOrder } from "../../src/state/normalize.js";

const bad = { code: "admin-template-photo-create-record", isAdminTemplateBlocked: true };
const copy = value => structuredClone(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const captureInput = record => ({ binding: record.binding, action: record.action, snapshot: record.snapshot,
  files: record.files.map(({ stage, file, thumb }) => ({ stage, file, thumb })) });

for (const entityType of ["item", "container"]) for (const placed of [false, true]) {
  test(`real projector mapping creates one ${placed ? "placed" : "catalog"} ${entityType}, preserving raw source and every prior owner`, async () => {
    const input = await adminPhotoCreateRecordInput({ entityType, placed }), before = copy(input), record = await prepareAdminTemplatePhotoCreateRecord(input);
    const { localId, serverId } = record.snapshot.createdOwner, type = entityType === "item" ? "items" : "containers";
    assert.deepEqual(input, before); assert.deepEqual(record.action.body.payload, before.snapshot.sourcePayload);
    assert.deepEqual(record.snapshot.beforeState, before.snapshot.beforeState); assert.deepEqual(record.snapshot.ownerMap, before.snapshot.ownerMap);
    assert.equal(record.snapshot.ownerMap.owners.some(owner => owner.localId === localId || owner.serverId === serverId), false);
    assert.equal(record.snapshot.state[type][localId].publicCatalogLayoutId, input.snapshot.layoutId);
    assert.deepEqual(record.snapshot.state[type][localId].photos, input.photos);
    assert.equal(Object.hasOwn(record.action.body.payload[type], serverId), false);
    for (const collection of ["items", "containers"]) for (const [id, row] of Object.entries(input.snapshot.beforeState[collection])) {
      const selected = placed && entityType === "item" && collection === "containers"
        && input.snapshot.ownerMap.owners.find(owner => owner.localId === id)?.serverId === input.formContext.placement.containerId;
      const actual = copy(record.snapshot.state[collection][id]), expected = copy(row);
      if (selected) { delete actual.itemIds; delete actual.order; delete expected.itemIds; delete expected.order; }
      assert.deepEqual(actual, expected);
    }
    const layout = record.snapshot.state.layouts[input.snapshot.layoutId], oldLayout = input.snapshot.beforeState.layouts[input.snapshot.layoutId];
    assert.deepEqual(layout.arrangement.packedItems, oldLayout.arrangement.packedItems);
    assert.deepEqual(record.snapshot.state.locations, input.snapshot.beforeState.locations);
    assert.deepEqual(record.snapshot.state.categories, input.snapshot.beforeState.categories);
    if (!placed) assert.deepEqual(layout, oldLayout);
    else if (entityType === "item") {
      const bag = input.snapshot.ownerMap.owners.find(owner => owner.serverId === input.formContext.placement.containerId).localId;
      assert.equal(layout.arrangement.items[localId], bag); assert.equal(layout.arrangement.itemQuantities[localId], 2);
      assert.deepEqual(layout.arrangement.containers[bag].order.at(-1), { type: "item", id: localId });
    } else assert.equal(layout.rootContainerIds.at(-1), localId);
    for (const [i, part] of record.files.entries()) {
      assert.equal(part.stage.version, 2); assert.equal(part.stage.operationId, input.files[i].stageOperationId);
      assert.equal(part.stage.entityId, serverId); assert.equal(part.stage.templateOperationId, input.operationId);
      assert.equal(part.fileMetadata.hash, hash(Buffer.from(await input.files[i].blob.arrayBuffer())));
      assert.equal(await part.file.text(), await input.files[i].blob.text());
    }
    await assert.rejects(encodeAdminTemplatePhotoRecord(captureInput(record)), { code: "admin-template-photo-record" });
  });
}

test("first item or bag in a confirmed empty template needs no invented previous owner", async () => {
  for (const entityType of ["item", "container"]) {
    const input = await adminPhotoCreateRecordInput({ entityType, empty: true, shared: false });
    const record = await prepareAdminTemplatePhotoCreateRecord(input);
    assert.deepEqual(record.snapshot.ownerMap.owners, []);
    assert.equal(Object.keys(record.snapshot.state.items).length + Object.keys(record.snapshot.state.containers).length, 1);
  }
});

test("unavailable catalog item and cleared dimensions preserve actual form semantics", async () => {
  const input = await adminPhotoCreateRecordInput({ placed: false }); input.fields.dimensions = null; input.formContext.availabilityStatus = "broken";
  const record = await prepareAdminTemplatePhotoCreateRecord(input), owner = record.snapshot.state.items[input.snapshot.createdOwner.localId];
  assert.equal(owner.availabilityStatus, "broken"); assert.equal(Object.hasOwn(owner, "dimensions"), false);
  assert.deepEqual(record.snapshot.state.layouts, record.snapshot.beforeState.layouts);
});

test("preparation detaches form, map, metadata and Blob handles before its first yield; repeat retains every ID and hash", async () => {
  const input = await adminPhotoCreateRecordInput(), original = copy(input), pending = prepareAdminTemplatePhotoCreateRecord(input);
  input.fields.name = "Later edit"; input.photos.reverse(); input.files[0].blob = new Blob(["other"], { type: "image/png" });
  input.files[0].stageOperationId = crypto.randomUUID(); input.snapshot.createdOwner.localId = "later-owner";
  input.snapshot.beforeState.locations.push("later");
  const record = await pending, retry = await prepareAdminTemplatePhotoCreateRecord(original);
  assert.deepEqual(record.action, retry.action); assert.deepEqual(record.snapshot, retry.snapshot); assert.equal(record.intentHash, retry.intentHash);
  assert.equal(record.snapshot.state.items[original.snapshot.createdOwner.localId].name, original.fields.name);
  assert.equal(await record.files[0].file.text(), await original.files[0].blob.text());
});

test("missing stage IDs, changed original bytes/metadata and forged pending photo fields fail before capture", async () => {
  const input = await adminPhotoCreateRecordInput();
  const changes = [v => delete v.files[0].stageOperationId, v => v.files[0].stageOperationId = v.operationId,
    v => v.files[1].stageOperationId = v.files[0].stageOperationId, v => v.files[0].fullBlobVerified = false,
    v => v.files[0].size++, v => v.files[0].type = "image/png", v => v.photos[0].fileName = "other.jpg",
    v => v.photos[0].assetId = crypto.randomUUID(), v => v.photos[0].publicCopySourceId = "foreign",
    v => v.photos[0].url = "/already-uploaded", v => v.photos.reverse(), v => v.files[0].id = "старое-фото"];
  for (const change of changes) { const value = copy(input); change(value); await assert.rejects(prepareAdminTemplatePhotoCreateRecord(value), bad); }
});

test("before-state map and namespace cannot admit an existing, foreign, detached-missing or ambiguously mapped owner", async () => {
  const input = await adminPhotoCreateRecordInput(), old = input.snapshot.ownerMap.owners[0];
  const changes = [v => delete v.snapshot.beforeState,
    v => v.snapshot.createdOwner.localId = old.localId, v => v.snapshot.createdOwner.serverId = old.serverId,
    v => v.snapshot.createdOwner.localId = v.snapshot.layoutId,
    v => v.snapshot.ownerMap.owners.pop(), v => v.snapshot.ownerMap.owners.push(copy(old)),
    v => v.snapshot.ownerMap.stateRevision++, v => v.snapshot.beforeState[old.type][old.localId].publicCatalogLayoutId = "private",
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].adminCausalSource.binding.actorId = "other",
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].adminCausalSource.planId = crypto.randomUUID(),
    v => v.snapshot.beforeState.items.private = { id: "private", name: "Private record" },
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].arrangement.itemQuantities[old.localId] = 99];
  for (const change of changes) { const value = copy(input); change(value); await assert.rejects(prepareAdminTemplatePhotoCreateRecord(value), bad); }
});

test("record rejects extra owner, removed old owner and collateral candidate edits even with a freshly encoded hash", async () => {
  const record = await prepareAdminTemplatePhotoCreateRecord(await adminPhotoCreateRecordInput());
  const localId = record.snapshot.createdOwner.localId, old = record.snapshot.ownerMap.owners.find(owner => owner.type === "items"
    && record.snapshot.beforeState.items[owner.localId].photos?.length);
  const changes = [v => v.snapshot.state.items.extra = { ...copy(v.snapshot.state.items[localId]), id: "extra" },
    v => delete v.snapshot.state.items[old.localId], v => v.snapshot.state.items[old.localId].opaque = "lost",
    v => v.snapshot.state.items[old.localId].photos = [], v => v.snapshot.state.items[localId].sharedSourceId = "forged",
    v => v.snapshot.state.items[localId].id = "other-id", v => v.snapshot.state.categories.push("new dictionary"),
    v => v.snapshot.state.layouts[v.snapshot.layoutId].opaque = { changed: true },
    v => v.action.body.payload.opaque.keep.reverse(), v => v.snapshot.state.items[localId].photos[0].size++];
  for (const change of changes) { const value = captureInput(copy(record)); change(value); await assert.rejects(encodeAdminTemplatePhotoCreateRecord(value), bad); }
});

test("stage actor, source revision, new-owner pair, order and actual hash must match the immutable intent", async () => {
  const record = await prepareAdminTemplatePhotoCreateRecord(await adminPhotoCreateRecordInput());
  for (const change of [v => v.files[0].stage.actorId = "other", v => v.files[0].stage.baseStateRevision++,
    v => v.files[0].stage.entityId = "different-owner", v => v.files.reverse(), v => v.files[0].stage.version = 1,
    v => v.action.body.photoCreate.assets[0].assetDigest = "f".repeat(64),
    v => v.files[0].file = new Blob(["wrong bytes"], { type: v.files[0].file.type })]) {
    const value = captureInput(copy(record)); change(value); await assert.rejects(encodeAdminTemplatePhotoCreateRecord(value), bad);
  }
});

test("cold decoding verifies stored bytes, original manifest and account even after attacker recomputes the outer hash", async () => {
  const prepared = await prepareAdminTemplatePhotoCreateRecord(await adminPhotoCreateRecordInput()), encoded = await encodeAdminTemplatePhotoCreateRecord(captureInput(prepared));
  const good = await decodeAdminTemplatePhotoCreateRecord(encoded, prepared.binding, prepared.action.operationId);
  assert.equal(good.intentHash, prepared.intentHash);
  const damaged = copy(encoded); new Uint8Array(damaged.files[0].file)[0] ^= 1;
  await assert.rejects(decodeAdminTemplatePhotoCreateRecord(damaged, prepared.binding, prepared.action.operationId), bad);
  const forged = copy(encoded), intent = JSON.parse(forged.intentJson);
  intent.snapshot.state.items[intent.snapshot.createdOwner.localId].name = "tampered";
  forged.intentJson = JSON.stringify(intent); forged.intentHash = hash(forged.intentJson);
  await assert.rejects(decodeAdminTemplatePhotoCreateRecord(forged, prepared.binding, prepared.action.operationId), bad);
  await assert.rejects(decodeAdminTemplatePhotoCreateRecord(encoded, { ...prepared.binding, actorId: "other" }, prepared.action.operationId), bad);
});

test("prior unsaved owner edits cannot be preserved only locally while the create request silently omits them", async () => {
  const input = await adminPhotoCreateRecordInput(), old = input.snapshot.ownerMap.owners.find(owner => owner.type === "items");
  // The first mapped item is deliberately a detached fieldless server record.
  assert.equal(Object.hasOwn(input.snapshot.sourcePayload.items[old.serverId], "name"), false);
  const edits = [row => row.name = "UNSAVED prior owner edit", row => row.weight = 200, row => row.quantity = 3,
    row => row.note = "Unsaved note", row => row.categories = ["unsaved"], row => row.updatedAt = "2026-09-12T14:00:00Z",
    row => row.unknown = "unsaved opaque value", row => delete row.unknown,
    // Even an apparently harmless default is not proof of its provenance.
    row => row.weight = 0, row => row.sharedSourceId = "guessed-server-id"];
  for (const edit of edits) {
    const value = copy(input); edit(value.snapshot.beforeState.items[old.localId]);
    await assert.rejects(prepareAdminTemplatePhotoCreateRecord(value), bad);
  }
  const bag = input.snapshot.ownerMap.owners.find(owner => owner.type === "containers");
  for (const edit of [row => row.volume = 8, row => row.nestable = false, row => row.opaque.keep = false]) {
    const value = copy(input); edit(value.snapshot.beforeState.containers[bag.localId]);
    await assert.rejects(prepareAdminTemplatePhotoCreateRecord(value), bad);
  }
});

test("layout business metadata, complete arrangement unknown fields and both dictionary views must match the source", async () => {
  const input = await adminPhotoCreateRecordInput();
  const changes = [v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].name = "Unsaved title",
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].note = "Unsaved description",
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].updatedAt = "2026-09-12T14:00:00Z",
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].opaque.keep = false,
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].arrangement.unknown = ["unsaved"],
    v => Object.values(v.snapshot.beforeState.layouts[v.snapshot.layoutId].arrangement.containers)[0].opaque = "unsaved",
    v => v.snapshot.beforeState.locations.push("unsaved location"), v => v.snapshot.beforeState.categories.push("unsaved category"),
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].locations[0].opaque = false,
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].categories.push("unsaved local category"),
    v => v.snapshot.beforeState.packedItems = {},
    v => v.snapshot.beforeState.layouts[v.snapshot.layoutId].templatePublished = true];
  for (const change of changes) { const value = copy(input); change(value); await assert.rejects(prepareAdminTemplatePhotoCreateRecord(value), bad); }
});

test("metadata changes are accepted only when explicitly carried by the same immutable save body", async () => {
  const input = await adminPhotoCreateRecordInput();
  input.snapshot.metadata = { title: "Saved title", description: "Saved description", language: "en" };
  Object.assign(input.snapshot.beforeState.layouts[input.snapshot.layoutId], { name: "Saved title", note: "Saved description", language: "en" });
  const record = await prepareAdminTemplatePhotoCreateRecord(input);
  assert.deepEqual(record.action.body.metadata, input.snapshot.metadata);
  assert.deepEqual(record.action.body.payload, input.snapshot.sourcePayload);
});

test("proven projector metadata and applied display links do not require discarding unknown source business", async () => {
  const input = await adminPhotoCreateRecordInput(), before = input.snapshot.beforeState, layoutId = input.snapshot.layoutId;
  before.layouts[layoutId].templateDraftServerHydrated = true; before.layouts[layoutId].templatePublished = false;
  const bag = input.snapshot.ownerMap.owners.find(owner => owner.type === "containers");
  assert.equal(before.containers[bag.localId].parentId, "");
  // The causal editor keeps its exact arrangement instead of invoking legacy
  // normalization; actual application still derives null parent/display links.
  applyLayoutArrangementToState(before, layoutId, { normalizeLayoutArrangement: layout => layout.arrangement,
    repairContainerMembershipFromItemLinks, migrateContainerOrder, preserveCatalog: true });
  assert.equal(before.containers[bag.localId].parentId, null);
  const record = await prepareAdminTemplatePhotoCreateRecord(input);
  assert.deepEqual(record.snapshot.beforeState, before); assert.deepEqual(record.action.body.payload, input.snapshot.sourcePayload);
  assert.deepEqual(record.action.body.payload.layouts.source.arrangement.unknown, ["raw"]);
  assert.deepEqual(record.action.body.payload.items.detached, input.snapshot.sourcePayload.items.detached);
});
