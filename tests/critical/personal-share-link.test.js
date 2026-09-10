import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalShareLink, personalShareLinkProjection, personalSharePhotoInventory, assertPersonalShareLinkBody, verifyPersonalShareLinkResult, PERSONAL_SHARE_LINK_ENABLED } from "../../src/sync/personal-share-link.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { personalDeletionReference } from "../../src/sync/personal-deletion-intent.js";

const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
export function shareFixture() {
  const payload = { locations: ["Bike", "Private camp"], categories: ["Repair", "Secret"], custom: { privateRoot: "all-list only" },
    containers: { bag: { id: "bag", name: "Bag", location: "Bike", photos: [] }, pocket: { id: "pocket", name: "Pocket", photos: [] },
      catalog: { id: "catalog", name: "Unplaced", photos: [] }, secret: { id: "secret", name: "Private", location: "Private camp", photos: [] } },
    items: { tool: { id: "tool", name: "Tool", location: "Bike", categories: ["Repair"], note: "exact note", photos: [], custom: { untouched: true } },
      spare: { id: "spare", name: "Spare", photos: [] }, private: { id: "private", name: "Private item", categories: ["Secret"], photos: [] } },
    layouts: {
      chosen: { id: "chosen", name: "Chosen", rootContainerIds: ["bag"], custom: { fullLayout: true }, arrangement: {
        rootContainerIds: ["bag"], containers: {
          bag: { parentId: "", childIds: ["pocket"], itemIds: ["tool"], order: [{ type: "container", id: "pocket" }, { type: "item", id: "tool" }] },
          pocket: { parentId: "bag", childIds: [], itemIds: ["spare"], order: [{ type: "item", id: "spare" }] } },
        items: { tool: "bag", spare: "pocket" }, itemQuantities: { tool: 3, spare: 2 }, packedItems: { tool: true, spare: false }, custom: "layout placement metadata" } },
      other: { id: "other", name: "Other private trip", rootContainerIds: ["secret"], arrangement: {
        rootContainerIds: ["secret"], containers: { secret: { parentId: "", childIds: [], itemIds: ["private"], order: [{ type: "item", id: "private" }] } },
        items: { private: "secret" }, itemQuantities: { private: 1 }, packedItems: {} } } } };
  return payload;
}
function request(payload, values = {}) {
  return { binding, snapshot: structuredClone(payload), basePayload: payload, baseStateRevision: 7,
    selection: { mode: "snapshot", scope: "layout", entityType: "", entityId: "", layoutId: "chosen",
      title: "Chosen link", description: "Exact description", includeAuthor: false, authorName: "", ...values } };
}
const cases = [
  { scope: "list", entityType: "", entityId: "", layoutId: "chosen" },
  { scope: "layout", entityType: "", entityId: "", layoutId: "chosen" },
  { scope: "layout", entityType: "item", entityId: "tool", layoutId: "chosen" },
  { scope: "entity", entityType: "item", entityId: "tool", layoutId: "" },
  { scope: "entity", entityType: "container", entityId: "bag", layoutId: "chosen" },
  { scope: "entity", entityType: "container", entityId: "pocket", layoutId: "chosen" },
  { scope: "entity", entityType: "container", entityId: "catalog", layoutId: "" },
];
for (const mode of ["live", "snapshot"]) for (const selected of cases)
test(`frozen ${mode} share ${selected.scope} ${selected.entityId || "whole"} preserves exact selection and disclosure scope`, () => {
  const source = shareFixture(), input = request(source, { ...selected, mode }), operationId = randomUUID(); let ids = 0;
  const plan = preparePersonalShareLink(input, { enabled: true, createUuid: () => { ids++; return operationId; } });
  assert.equal(ids, 1); assert.equal(plan.operationId, operationId); assert.deepEqual(plan.body.payload, source);
  assert.deepEqual(personalShareLinkProjection(source, plan.body.shareLink, operationId), plan.projection);
  if (selected.scope === "list") assert.deepEqual(plan.projection, source);
  else {
    assert.equal(plan.projection.items.private, undefined); assert.equal(plan.projection.containers.secret, undefined);
    assert.equal(plan.projection.custom, undefined); assert.ok(!plan.projection.categories.includes("Secret"));
    if (selected.scope === "layout") assert.deepEqual(plan.projection.layouts.chosen, source.layouts.chosen);
    if (selected.entityId === "bag") {
      const layout = Object.values(plan.projection.layouts)[0];
      assert.deepEqual(layout.arrangement.itemQuantities, { tool: 3, spare: 2 });
      assert.deepEqual(layout.arrangement.packedItems, { tool: true, spare: false });
      assert.deepEqual(layout.arrangement.containers.bag.order, source.layouts.chosen.arrangement.containers.bag.order);
    }
    if (selected.entityId === "pocket") {
      assert.equal(plan.projection.containers.bag, undefined); assert.equal(plan.projection.items.tool, undefined);
      assert.deepEqual(Object.values(plan.projection.layouts)[0].arrangement.itemQuantities, { spare: 2 });
    }
    if (selected.entityId === "tool" && selected.scope === "entity") {
      assert.deepEqual(plan.projection.items, { tool: source.items.tool });
      assert.deepEqual(Object.values(plan.projection.layouts)[0].arrangement.itemQuantities, { tool: 1 });
    }
    if (selected.entityId === "catalog") assert.deepEqual(plan.projection.items, {});
  }
  const frozen = structuredClone(plan); source.items.tool.note = "changed after selection"; source.layouts.chosen.name = "another choice";
  input.selection.mode = mode === "live" ? "snapshot" : "live"; input.snapshot.items.tool.name = "different editor";
  assert.deepEqual(plan, frozen);
});

test("share selection rejects malformed scope, cycles, ambiguous placement and unrequested author disclosure", () => {
  for (const mutate of [
    x => { x.selection.includeAuthor = false; x.selection.authorName = "Unrequested name"; },
    x => { x.selection.scope = "guess"; }, x => { x.selection.scope = "entity"; },
    x => { x.selection.entityType = "item"; x.selection.entityId = "private"; },
    x => { x.selection.layoutId = "absent"; }, x => { x.selection.id = randomUUID(); },
    x => { x.binding.environment = "production"; }, x => { x.snapshot.items.tool.name = "unsaved other choice"; },
    x => { x.basePayload.layouts.chosen.arrangement.containers.pocket.parentId = "pocket"; x.snapshot = structuredClone(x.basePayload); },
    x => { x.basePayload.layouts.chosen.arrangement.containers.bag.order.push({ type: "item", id: "private" }); x.snapshot = structuredClone(x.basePayload); },
    x => { Object.assign(x.selection, { scope: "entity", entityType: "container", entityId: "bag", layoutId: "" }); },
  ]) {
    const input = request(shareFixture()); input.binding = structuredClone(binding); mutate(input);
    assert.throws(() => preparePersonalShareLink(input, { enabled: true }));
  }
});

test("share preparation is disabled by default and never allocates an ID while off", () => {
  assert.equal(PERSONAL_SHARE_LINK_ENABLED, false);
  assert.throws(() => preparePersonalShareLink(request(shareFixture()), { createUuid: () => assert.fail("disabled writer") }), { code: "share-link-disabled" });
});

test("share projection retains the exact selected photos without treating their presence as publication proof", () => {
  const payload = shareFixture(); payload.items.tool.photos = [{ id: "photo", assetId: randomUUID(), status: "pending", listId: binding.listId }];
  const plan = preparePersonalShareLink(request(payload), { enabled: true });
  assert.deepEqual(plan.projection.items.tool.photos, payload.items.tool.photos);
  assert.equal(plan.body.shareLink.published, undefined);
  assert.equal(plan.body.shareLink.photoReceipt, undefined);
});

test("share body excludes visibility, extra mutations and substituted identifiers; receipt proves the exact choice", () => {
  const plan = preparePersonalShareLink(request(shareFixture()), { enabled: true });
  assert.deepEqual(assertPersonalShareLinkBody(plan.body, plan.operationId), plan.projection);
  for (const extra of [{ visibility: "shared" }, { force: true }, { userCopy: {} }, { causal: {} }])
    assert.throws(() => assertPersonalShareLinkBody({ ...plan.body, ...extra }, plan.operationId));
  assert.throws(() => assertPersonalShareLinkBody(plan.body, randomUUID()));
  const result = { status: 200, payload: { ok: true, stateRevision: 8, list: { id: binding.listId, payload: plan.body.payload },
    sharedLink: { version: 1, descriptor: plan.body.shareLink, sourceListId: binding.listId, sourceStateRevision: 7, files: [] } } };
  const expected = { ...plan, ...binding };
  assert.equal(verifyPersonalShareLinkResult(result, expected), true);
  for (const mutate of [x => { delete x.payload.sharedLink; }, x => { x.payload.sharedLink.descriptor.scope = "list"; },
    x => { x.payload.sharedLink.sourceListId = "another-list"; }, x => { x.payload.sharedLink.sourceStateRevision = 8; },
    x => { x.payload.sharedLink.descriptor.authorName = "someone else"; }, x => { x.payload.sharedLink.extra = true; }]) {
    const corrupted = structuredClone(result); mutate(corrupted); assert.equal(verifyPersonalShareLinkResult(corrupted, expected), false);
  }
});

function outboxFixture() {
  const values = new Map(); let quota = false;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (quota) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  return { values, storage, setQuota: value => { quota = value; },
    make: (enabled = true) => createPersonalSaveOutbox({ storage, ...binding, shareLinkEnabled: enabled }) };
}

test("unchanged source still stores a distinct share action, causal predecessor and frozen selection across reload", () => {
  const f = outboxFixture(), outbox = f.make(), payload = shareFixture();
  const edit = outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 7 } });
  const plan = preparePersonalShareLink(request(payload), { enabled: true }), saved = outbox.capture(plan);
  assert.notEqual(saved.action.operationId, edit.action.operationId);
  assert.equal(saved.action.operationId, plan.operationId);
  assert.equal(saved.action.body.causal.baseOperationId, edit.action.operationId);
  assert.deepEqual(saved.action.body.causal.dependsOn, [{ operationId: edit.action.operationId, listId: binding.listId }]);
  assert.deepEqual(f.make(false).recover(), saved, "reader remains available with writer off");
  assert.deepEqual(f.make(false).recoverSnapshot(), payload);
  plan.body.shareLink.mode = "live"; payload.items.tool.name = "later editor";
  assert.deepEqual(f.make().recover(), saved);
});

test("share capture off and quota leave the old queue byte-for-byte intact", () => {
  const f = outboxFixture(), payload = shareFixture(), outbox = f.make();
  outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 7 } }); const prior = [...f.values];
  const plan = preparePersonalShareLink(request(payload), { enabled: true });
  assert.throws(() => f.make(false).capture(plan), { code: "share-link-disabled" }); assert.deepEqual([...f.values], prior);
  f.setQuota(true); assert.throws(() => outbox.capture(plan), { code: "quota" }); assert.deepEqual([...f.values], prior);
});

test("corrupt stored share is blocked rather than recovered as an ordinary save", () => {
  const f = outboxFixture(), plan = preparePersonalShareLink(request(shareFixture()), { enabled: true });
  f.make().capture(plan);
  const [key, bytes] = [...f.values][0], data = JSON.parse(bytes); data.action.body.shareLink.scope = "guess";
  f.values.set(key, JSON.stringify(data));
  assert.throws(() => f.make(false).recover());
});

test("share receipt requires every selected file hash and exact owner binding, while preserving source privacy", () => {
  const payload = shareFixture(); payload.items.tool.photos = [{ id: "selected", photoId: "selected", assetId: randomUUID(), listId: binding.listId, status: "synced", url: "https://example.test/private-photo" }];
  payload.items.private.photos = [{ id: "secret", photoId: "secret", assetId: randomUUID(), listId: binding.listId, status: "synced" }];
  const plan = preparePersonalShareLink(request(payload), { enabled: true });
  const files = personalSharePhotoInventory(plan.projection).map(file => ({ ...file, fileHash: "a".repeat(64), thumbHash: "b".repeat(64) }));
  assert.equal(files.length, 1); assert.equal(files[0].photoId, "selected");
  const result = { status: 200, payload: { ok: true, stateRevision: 8, list: { id: binding.listId, payload },
    sharedLink: { version: 1, descriptor: plan.body.shareLink, sourceListId: binding.listId, sourceStateRevision: 7, files } } };
  const expected = { ...binding, ...plan }; assert.equal(verifyPersonalShareLinkResult(result, expected), true);
  for (const mutate of [x => { x.payload.sharedLink.files = []; }, x => { x.payload.sharedLink.files[0].entityId = "private"; },
    x => { x.payload.sharedLink.files[0].assetId = randomUUID(); }, x => { x.payload.sharedLink.files[0].fileHash = "unchecked"; },
    x => { x.payload.sharedLink.files.push(x.payload.sharedLink.files[0]); }, x => { x.payload.list.payload.items.tool.name = "Different source"; }]) {
    const value = structuredClone(result); mutate(value); assert.equal(verifyPersonalShareLinkResult(value, expected), false);
  }
});

test("selected layout rejects unrelated placement quantities and whole-list projection rejects a broken second layout", () => {
  for (const scope of ["layout", "list"]) {
    const payload = shareFixture(); payload.layouts[scope === "list" ? "other" : "chosen"].arrangement.itemQuantities.unrelated = 2;
    assert.throws(() => preparePersonalShareLink(request(payload, { scope }), { enabled: true }));
  }
});

for (const outcome of ["keep-server", "cancel", "quota", "context", "unknown", "off"])
test(`rejected share resolution ${outcome} never republishes an old disclosure choice`, async () => {
  const f = outboxFixture(), outbox = f.make(), plan = preparePersonalShareLink(request(shareFixture()), { enabled: true });
  const original = outbox.capture(plan), before = [...f.values];
  const remote = { id: binding.listId, ownerId: binding.actorId, stateRevision: 9, payload: shareFixture() };
  remote.payload.items.tool.note = "Current server data";
  const context = { ...outbox.binding, scope: "personal", generation: 1 };
  const proof = { historicalOnly: true, resultStatus: 409, stateRevision: 9, rejectionCode: "share_link_source_changed",
    operation: { ...outbox.binding, id: original.action.operationId, kind: "list.update", state: "rejected", payloadDigest: "a".repeat(64) } };
  let decisions = 0, inspections = 0;
  const options = { queue: { inspect: async () => { inspections++; return outcome === "unknown" ? { operation: { state: "unknown" } } : proof; },
    run: () => assert.fail("resolution does not execute the rejected share") }, getContext: () => ({ ...context }), readRemote: async () => remote,
    resolveRejectedShare: async details => { decisions++; assert.deepEqual(details.descriptor, plan.body.shareLink);
      if (outcome === "context") context.actorId = "other";
      if (outcome === "quota") f.setQuota(true);
      return outcome === "cancel" ? "cancel" : "keep-server"; } };
  if (outcome !== "keep-server") {
    await assert.rejects((outcome === "off" ? f.make(false) : outbox).reconcile(options), {
      code: { cancel: "reconciliation-cancelled", quota: "quota", context: "context", unknown: "receipt", off: "share-link-disabled" }[outcome] });
    assert.deepEqual([...f.values], before); if (outcome === "off") assert.equal(inspections, 0);
    assert.equal(decisions, ["off", "unknown"].includes(outcome) ? 0 : 1); return;
  }
  const result = await outbox.reconcile(options);
  assert.notEqual(result.action.operationId, original.action.operationId); assert.equal(result.action.body.shareLink, undefined);
  assert.deepEqual(result.action.body.payload, remote.payload); assert.deepEqual(f.make(false).recover(), result);
  assert.equal(result.reconciliation.decision.shareOperationId, original.action.operationId);
  assert.deepEqual(personalDeletionReference(plan.body.payload, [original, result]), remote.payload);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  const [key, bytes] = [...f.values].find(([key]) => !before.some(([old]) => key === old));
  for (const mutate of [value => { value.action.body.shareLink = original.action.body.shareLink; },
    value => { value.action.body.force = true; }, value => { value.reconciliation.decision.extra = true; },
    value => { value.reconciliation.decision.shareOperationId = randomUUID(); },
    value => { value.action.body.payload.items.tool.note = "Different data"; }]) {
    const value = JSON.parse(bytes); mutate(value); f.values.set(key, JSON.stringify(value));
    assert.throws(() => f.make().recover()); f.values.set(key, bytes);
  }
  outbox.markApplied({ operationId: result.action.operationId, stateRevision: 10 }); outbox.compact();
  const recovered = f.make(), boundary = recovered.confirmedBoundary();
  assert.equal(personalDeletionReference(remote.payload, recovered.list(), { confirmedBoundary: boundary }), null);
  const laterPlan = preparePersonalShareLink({ ...request(remote.payload), baseStateRevision: 10 }, { enabled: true });
  recovered.capture(laterPlan);
  assert.equal(personalDeletionReference(remote.payload, recovered.list(), { confirmedBoundary: boundary }), null);
  assert.throws(() => personalDeletionReference(plan.body.payload, recovered.list(), { confirmedBoundary: boundary }));
});
