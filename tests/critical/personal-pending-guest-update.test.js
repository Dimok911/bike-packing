import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { preparePersonalGuestImportFiles } from "../../src/sync/personal-guest-import-files.js";
import { personalGuestImportPlan } from "../../src/sync/personal-guest-import-plan.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { personalGuestPhotoResultReference, isPersonalPendingGuestUpdate, personalPendingGuestUpdateSource } from "../../src/sync/personal-pending-guest-update.js";

async function fixture(fileless = false) {
  const input = guestSelectionFixture();
  input.candidate.sourceState.items.item.photos = fileless ? [] : [{ id: "one" }, { id: "two" }];
  input.handoff = createGuestLoginHandoff({ candidate: input.candidate, eligibleLayoutIds: ["a", "b"], email: input.user.email,
    guestSessionId: "guest-descendants", nowMs: input.nowMs });
  const selection = preparePersonalGuestImportSelection(input, { enabled: true });
  const parts = await preparePersonalGuestImportFiles(selection, { loadFile: async () => ({ file: new Blob(["original"], { type: "image/png" }), fileName: "guest.png" }) }).verify();
  const manifest = { version: 1, operationId: selection.operationId, sourcePayload: selection.candidate.sourceState,
    sourceHash: await personalArchiveHash(selection.candidate.sourceState), layoutTargets: selection.layoutTargets,
    ownerTargets: selection.ownerTargets, photoTargets: selection.photoTargets, editMeta: selection.editMeta,
    targetStateRevision: selection.baseStateRevision, files: parts.map(part => part.manifest) };
  const plan = personalGuestImportPlan({ ...manifest, listId: "list", currentPayload: selection.basePayload }, manifest.files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  const source = { version: 1, snapshot: structuredClone(plan.payload), mergeBase: { payload: selection.basePayload, stateRevision: 7 },
    action: { ...input.binding, kind: "list.import", operationId: selection.operationId, generation: 1,
      body: { payload: plan.payload, baseStateRevision: 7, guestImport: manifest, causal: { dependsOn: [], reads: [] } } },
    photoState: { version: 1, payload: plan.payload, fileIntentHash: fileless ? null : "a".repeat(64), ...(fileless ? {} : { fileInventoryVersion: 2 }) } };
  return { source, item: plan.createdOwners.items[0], bag: plan.createdOwners.containers[0], layout: plan.importedLayoutIds[0] };
}
const allowed = (source, basePayload, payload, userDeletion = null) => isPersonalPendingGuestUpdate({ source, basePayload, payload, userDeletion, listId: "list" });
const child = (source, parent, payload, userDeletion) => ({ version: 1, snapshot: structuredClone(payload), action: { ...parent.action,
  kind: "list.update", operationId: randomUUID(), generation: parent.action.generation + 1,
  body: { baseStateRevision: 7, payload, ...(userDeletion ? { userDeletion } : {}), photoResults: personalGuestPhotoResultReference(source),
    causal: { baseOperationId: parent.action.operationId, reads: [], dependsOn: [...new Set([parent.action.operationId, source.action.operationId])].map(operationId => ({ operationId, listId: "list" })) } } } });

for (const fileless of [false, true]) test(`pending guest ${fileless ? "fileless" : "photo"} fields and explicit deletion follow both exact parents without reviving owners`, async () => {
  const { source, item, bag } = await fixture(fileless), frozen = structuredClone(source), base = source.action.body.payload, edited = structuredClone(base);
  edited.items[item].weight = 99; edited.containers[bag].note = "Later guest bag";
  assert.equal(allowed(source, base, edited), true);
  const first = child(source, source, edited), deletion = preparePersonalDeletionBatch(edited, { type: "item", id: item });
  assert.equal(allowed(source, edited, deletion.snapshot, deletion.intent), true);
  const second = child(source, first, deletion.snapshot, deletion.intent), final = structuredClone(deletion.snapshot); final.containers[bag].weight = 53;
  const third = child(source, second, final);
  assert.equal(personalPendingGuestUpdateSource({ records: [third, source, second, first], operationId: third.action.operationId, listId: "list" }), source);
  assert.equal(personalGuestPhotoResultReference(source).version, 4);
  assert.equal(allowed(source, deletion.snapshot, edited), false);
  assert.deepEqual(source, frozen);
});

test("pending guest refuses missing/rebound/reordered files, unproved owner deletion and archive substitution", async () => {
  const { source, item, bag } = await fixture(), base = source.action.body.payload;
  for (const mutate of [p => p.items[item].photos.reverse(), p => p.items[item].photos.pop(), p => delete p.items[item],
    p => p.containers[bag].photos = p.items[item].photos, p => p.items[item].photos[0].assetId = randomUUID(),
    p => p.items[item].photos[0].url = "https://guessed.test/file"]) {
    const actual = structuredClone(base); mutate(actual); assert.equal(allowed(source, base, actual), false);
  }
  const archive = structuredClone(source); archive.action.body.archiveImport = archive.action.body.guestImport; delete archive.action.body.guestImport;
  assert.equal(allowed(archive, base, base), false);
});

test("pending guest layout removal keeps owners, all selected photos and the other shared layout", async () => {
  const { source, item, layout } = await fixture(), base = source.action.body.payload, actual = structuredClone(base), deletion = { type: "layout", id: layout };
  delete actual.layouts[layout];
  assert.equal(allowed(source, base, actual, deletion), true); assert.equal(allowed(source, base, base, deletion), false);
  delete actual.items[item]; assert.equal(allowed(source, base, actual, deletion), false);
});

test("pending guest ancestry rejects wrong source versions, omitted parents, cycles and foreign actors", async () => {
  const { source, item } = await fixture(), payload = structuredClone(source.action.body.payload); payload.items[item].weight = 50;
  const first = child(source, source, payload), second = child(source, first, payload);
  assert.equal(personalPendingGuestUpdateSource({ records: [source], operationId: source.action.operationId, listId: "list", includeSource: true }), source);
  for (const mutate of [r => r.action.body.photoResults.version = 3, r => r.action.body.causal.dependsOn.pop(), r => r.action.actorId = "foreign",
    r => r.action.body.causal.baseOperationId = r.action.operationId, r => r.action.body.photoResults.operationId = randomUUID(),
    r => r.action.generation++, r => r.action.body.payload.items[item].photos.reverse()]) {
    const changed = structuredClone(second); mutate(changed);
    assert.equal(personalPendingGuestUpdateSource({ records: [source, first, changed], operationId: changed.action.operationId, listId: "list" }), null);
  }
});
