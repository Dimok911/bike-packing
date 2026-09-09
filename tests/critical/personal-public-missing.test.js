import test from "node:test";
import assert from "node:assert/strict";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { personalPublicMissingPreview } from "../../src/sync/personal-public-entity-plan.js";
import { preparePersonalPublicEntitySelection } from "../../src/sync/personal-public-import-selection.js";
import { personalPublicImportPlan, assertPersonalPublicImportBody, assertPersonalPublicImportHashes } from "../../src/sync/personal-public-import-protocol.js";
import { preparePersonalGuestImportFiles } from "../../src/sync/personal-guest-import-files.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";

async function fixture(photos = true) {
  const f = await publicEntityFixture(), sourcePayload = structuredClone(f.selection.sourcePayload), base = structuredClone(f.selection.basePayload);
  const a = sourcePayload.layouts.a.arrangement, target = base.layouts.private.arrangement;
  base.containers.target = { ...structuredClone(sourcePayload.containers.bag), id: "target", photos: [], customTarget: { edited: true } };
  base.containers["private-pocket"] = { ...structuredClone(sourcePayload.containers.pocket), id: "private-pocket", photos: [], note: "Keep my note" };
  target.containers.target.childIds.push("private-pocket"); target.containers.target.order.unshift({ type: "container", id: "private-pocket" });
  target.containers["private-pocket"] = { parentId: "target", childIds: [], itemIds: [], order: [], privateRow: 23 };
  base.items.kept = { ...structuredClone(sourcePayload.items.item), id: "kept", photos: [], quantity: a.itemQuantities.item, note: "My later note", customTarget: 71 };
  target.itemQuantities.kept = a.itemQuantities.item;
  for (const [id, parentId, quantity] of [["new-root", "bag", 5], ["new-pocket", "pocket", 4]]) {
    sourcePayload.items[id] = { ...structuredClone(sourcePayload.items.item), id, name: id, _publicCopySourceId: id, photos: photos && id === "new-root" ? structuredClone(sourcePayload.items.item.photos) : [],
      customSource: { complete: id } };
    if (sourcePayload.items[id].photos.length) sourcePayload.items[id].photos[0].id = `source-photo-${id}`;
    a.containers[parentId].itemIds.push(id); a.containers[parentId].order.push({ type: "item", id });
    a.items[id] = parentId; a.itemQuantities[id] = quantity; a.packedItems[id] = true;
  }
  // Unknown placement fields must not override the bag's business properties.
  a.containers.bag.name = "Unrelated placement metadata";
  const preview = personalPublicMissingPreview({ currentPayload: base, sourcePayload, sourceLayoutId: "a", sourceId: "bag", targetLayoutId: "private" });
  const selection = preparePersonalPublicEntitySelection({ ...f.selection, basePayload: base, sourcePayload, copy: preview.copy }, { enabled: true });
  const parts = await preparePersonalGuestImportFiles({ ...selection, candidate: { sourceState: sourcePayload } },
    { loadFile: async () => ({ file: f.file, thumb: null, fileName: "Original.png" }) }).verify();
  const { binding, basePayload, baseStateRevision, ...selected } = selection;
  const manifest = { ...selected, targetStateRevision: baseStateRevision, files: parts.map(part => part.manifest), sourceHash: await personalArchiveHash(sourcePayload) };
  const plan = personalPublicImportPlan({ ...manifest, currentPayload: basePayload, listId: binding.listId }, manifest.files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  const body = { baseStateRevision, payload: plan.payload, publicImport: manifest,
    causal: { dependsOn: [], reads: [{ listId: selection.source.listId, revision: selection.source.stateRevision }] } };
  return { f, selection, preview, plan, body, options: { base: basePayload, listId: binding.listId, operationId: selection.operationId, causal: true } };
}

for (const photos of [false, true]) test(`public missing-only preserves edited owners and appends exact things into distinct existing bags, photos=${photos}`, async () => {
  const { selection, preview, plan, body, options } = await fixture(photos), base = selection.basePayload;
  assert.deepEqual(preview.missingItems, [{ sourceItemId: "new-pocket", targetContainerId: "private-pocket" }, { sourceItemId: "new-root", targetContainerId: "target" }]);
  assert.equal(preview.canCopyMissingItems, true); assert.equal(preview.duplicates.containerIds.length, 2);
  assert.deepEqual(plan.payload.containers, base.containers); assert.deepEqual(plan.payload.items.kept, base.items.kept);
  assert.deepEqual(plan.createdOwners.containers, []); assert.equal(plan.createdOwners.items.length, 2); assert.deepEqual(plan.importedLayoutIds, []);
  assert.equal(body.publicImport.files.length, Number(photos));
  const a = plan.payload.layouts.private.arrangement;
  for (const row of selection.ownerTargets) {
    assert.equal(row.entityType, "item"); assert.equal(row.reuse, false);
    const parent = row.sourceId === "new-root" ? "target" : "private-pocket";
    assert.equal(a.items[row.targetId], parent); assert.equal(a.itemQuantities[row.targetId], row.sourceId === "new-root" ? 5 : 4);
    assert.equal(a.packedItems[row.targetId], undefined);
    assert.equal(plan.payload.items[row.targetId].customSource.complete, row.sourceId);
    assert.deepEqual(a.containers[parent].order.at(-1), { type: "item", id: row.targetId });
  }
  assert.equal(a.packedItems.kept, true); assert.equal(a.containers["private-pocket"].privateRow, 23);
  assert.deepEqual(assertPersonalPublicImportBody(body, options).payload, plan.payload); await assertPersonalPublicImportHashes(body);
});

test("public missing-only rejects partial, reordered, redirected and expanded choices without changing its frozen target", async () => {
  const { body, options } = await fixture();
  for (const mutate of [copy => copy.missingItems.pop(), copy => copy.missingItems.reverse(),
    copy => { copy.missingItems[0].targetContainerId = "target"; }, copy => { copy.destination.index = 0; },
    copy => { copy.entries[0].includeContents = false; }, copy => { copy.mode = "independent"; },
    copy => { copy.missingItems.push({ sourceItemId: "item", targetContainerId: "target" }); }]) {
    const changed = structuredClone(body); mutate(changed.publicImport.copy);
    assert.throws(() => assertPersonalPublicImportBody(changed, options));
  }
  const changed = structuredClone(body); changed.payload.items.kept.note = "Overwrite user work";
  assert.throws(() => assertPersonalPublicImportBody(changed, options));
});

test("public missing-only creates no action when no target bag matches and detects a changed target before compiling", async () => {
  const { selection, body, options } = await fixture(), base = structuredClone(selection.basePayload);
  for (const container of Object.values(base.containers)) {
    container.name = `Different ${container.id}`; delete container._publicCopySourceId; delete container._publicCopySourceKind;
  }
  const preview = personalPublicMissingPreview({ currentPayload: base, sourcePayload: selection.sourcePayload, sourceLayoutId: "a", sourceId: "bag", targetLayoutId: "private" });
  assert.equal(preview.canCopyMissingItems, false); assert.deepEqual(preview.copy.missingItems, []);
  assert.throws(() => preparePersonalPublicEntitySelection({ ...selection, basePayload: base, copy: preview.copy }, { enabled: true }));
  assert.throws(() => assertPersonalPublicImportBody(body, { ...options, base }));
});

test("an oversized independent tree does not prevent a valid missing-only selection from keeping just its required files", async () => {
  const { selection } = await fixture();
  selection.sourcePayload.items.item.photos = Array.from({ length: 51 }, (_, index) => ({ id: `retained-original-${index}` }));
  const preview = personalPublicMissingPreview({ currentPayload: selection.basePayload, sourcePayload: selection.sourcePayload,
    sourceLayoutId: "a", sourceId: "bag", targetLayoutId: "private" });
  const independent = { ...preview.copy, version: 1, mode: "independent" }; delete independent.missingItems;
  assert.throws(() => preparePersonalPublicEntitySelection({ ...selection, copy: independent }, { enabled: true }));
  const missing = preparePersonalPublicEntitySelection({ ...selection, copy: preview.copy }, { enabled: true });
  assert.equal(missing.photoTargets.length, 1); assert.equal(missing.ownerTargets.length, 2);
  assert.deepEqual(missing.sourcePayload, selection.sourcePayload);
});
