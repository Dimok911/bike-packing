import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { wholeCopyProtocolFixture, prepareWholeCopyProtocolFixture, copy, hash } from "../fixtures/admin-template-photo-whole-copy-protocol-fixture.js";
import { adminTemplateIntent, canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { projectAdminTemplateCopy } from "../../src/sync/admin-template-copy-projection.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifest } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { adminTemplatePhotoWholeCopyIntent as intent, adminTemplatePhotoWholeCopyStageManifest as stage,
  adminTemplatePhotoWholeCopyStageManifests as stages, adminTemplatePhotoWholeCopyStageDigest as stageDigest,
  adminTemplatePhotoWholeCopyCommitment as commitment, adminTemplatePhotoWholeCopyDigest as digest,
  assertAdminTemplatePhotoWholeCopyIntentDigests as prove, adminTemplatePhotoWholeCopyPayload as project,
  ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY, ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_LIMITS as limits
} from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

const assets = input => input.body.photoCopy.owners.flatMap(owner => owner.photos);
const photoOwner = input => input.body.photoCopy.owners.find(owner => owner.photos.length > 1);
const fail = (callback, suffix) => assert.throws(callback, suffix ? { code: `admin-template-photo-whole-copy-${suffix}` } : undefined);

test("whole-copy has a separate OFF type; existing generic copy and tree parsers keep rejecting V3", async () => {
  const f = await wholeCopyProtocolFixture();
  assert.equal(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, false);
  assert.equal(TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY, "adminTemplatePhotoWholeCopyV1");
  assert.equal(f.intent.kind, "template.copy"); assert.equal(f.intent.body.photoCopy.version, 3); assert.equal(f.intent.body.base, null);
  assert.throws(() => adminTemplateIntent(f.input)); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.input));
  assert.throws(() => adminTemplatePhotoTreeCopyStageManifest(f.manifests[0]));
  const { photoCopy, ...ordinary } = f.input.body;
  assert.equal(adminTemplateIntent({ ...f.input, body: ordinary }).kind, "template.copy");
  assert.equal(f.intent.id, f.input.operationId); assert.equal(Object.hasOwn(f.intent, "operationId"), false);
  assert.ok(Object.isFrozen(f.intent.body.photoCopy.owners[0]));
});

test("commitment covers complete catalog, metadata and absent target without a fake target revision", async () => {
  const f = await wholeCopyProtocolFixture(), c = await commitment(f.input);
  assert.equal(c.version, 3); assert.equal(c.kind, "admin-template-photo-whole-copy");
  assert.deepEqual(c.source, { itemKey: f.input.body.source.itemKey, listId: f.input.body.source.listId,
    baseStateRevision: 7, payloadDigest: f.input.body.source.payloadDigest, layoutId: "source-layout" });
  assert.equal(Object.hasOwn(c.target, "payloadDigest"), false); assert.equal(c.target.base, null);
  assert.ok(Object.isFrozen(c.owners[1].photos));
});

test("all stages bind their exact source reference, complete mapping and deterministic absent target", async () => {
  const f = await wholeCopyProtocolFixture(), c = await commitment(f.input), mappedAssets = assets(f.input);
  assert.equal(c.owners.length, 11); assert.equal(c.owners.filter(owner => owner.photos.length === 0).length, 7);
  assert.deepEqual(c.owners.map(owner => owner.sourceEntityId), ["a-child", "a-root", "b-root", "detached-child", "detached-root", "z-free",
    "item-a", "item-b", "item-detached", "item-nested", "item-unplaced"]);
  assert.deepEqual(c.target, { itemKey: f.intent.itemKey, listId: f.intent.listId, base: null, layoutId: `layout-${f.intent.id}` });
  assert.equal(Object.hasOwn(c.target, "baseStateRevision"), false); assert.equal(Object.hasOwn(c.target, "payloadDigest"), false);
  assert.equal(c.source.baseStateRevision, 7); assert.equal(c.source.layoutId, "source-layout");
  assert.equal(c.source.payloadDigest, hash(f.sourcePayload)); assert.deepEqual(c.metadata, f.input.body.metadata);
  assert.equal(c.owners.flatMap(owner => owner.photos).some(asset => Object.hasOwn(asset, "assetDigest")), false);
  assert.equal(await digest(f.input), hash(c)); assert.equal(await prove(f.input), true);
  for (const [index, m] of f.manifests.entries()) {
    assert.equal(m.copyDigest, hash(c)); assert.equal(m.templateOperationId, f.intent.id);
    assert.equal(m.operationId, mappedAssets[index].assetId); assert.equal(m.target.photoId, mappedAssets[index].photoId);
    const original = f.sourcePayload[m.source.entityType === "item" ? "items" : "containers"][m.source.entityId]
      .photos.find(photo => (photo.id ?? photo.photoId) === m.source.photoId);
    assert.equal(m.source.referenceDigest, hash(original)); assert.equal(await stageDigest(m), mappedAssets[index].assetDigest);
    assert.equal(m.target.base, null); assert.equal(m.target.layoutId, `layout-${f.intent.id}`);
    assert.ok(Object.isFrozen(m.target));
  }
});

test("complete projection preserves raw and arrangement forests, statuses, quantities and opaque fields", async () => {
  const f = await wholeCopyProtocolFixture(), original = copy(f.input), expected = projectAdminTemplateCopy(f.sourcePayload, f.intent.id, f.intent.body.metadata);
  for (const owner of f.added) {
    const type = owner.entityType === "item" ? "items" : "containers";
    if (Object.hasOwn(f.sourcePayload[type][owner.sourceEntityId], "photos")) expected[type][owner.entityId].photos = owner.added.map(entry => copy(entry.photo));
  }
  const actual = project(f.intent, f.added);
  assert.deepEqual(actual, expected); assert.deepEqual(f.input, original); assert.ok(Object.isFrozen(actual));
  const mapped = key => f.added.find(owner => owner.sourceEntityId === key).entityId;
  const arrangement = actual.layouts[actual.activeLayoutId].arrangement;
  assert.equal(actual.containers[mapped("a-child")].parentId, mapped("a-root"));
  assert.equal(arrangement.containers[mapped("a-child")].parentId, mapped("b-root"));
  assert.deepEqual(arrangement.rootContainerIds, [mapped("b-root"), mapped("a-root")]);
  assert.equal(actual.items[mapped("item-a")].availabilityStatus, "unavailable");
  assert.equal(actual.items[mapped("item-b")].availabilityStatus, "bought");
  assert.equal(actual.items[mapped("item-a")].quantity, 4); assert.equal(arrangement.itemQuantities[mapped("item-a")], 1);
  assert.equal(arrangement.packedItems[mapped("item-b")], true);
  assert.equal(Object.hasOwn(actual.items[mapped("item-b")], "photos"), false);
  assert.deepEqual(actual.containers[mapped("z-free")].photos, []); assert.deepEqual(actual.opaqueTop, f.sourcePayload.opaqueTop);
});

test("ordinary command restrictions and confirmed numeric source remain strict", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [p => { p.kind = "template.save"; }, p => { p.environment = "production"; }, p => { p.actorId = "x\n"; },
    p => { p.body.base = { stateRevision: 0 }; }, p => { p.body.source.base = { operationId: randomUUID() }; },
    p => { p.body.metadata.description = "constructor"; }, p => { p.body.metadata.title = "prototype"; },
    p => { p.body.metadata.title = " padded "; }, p => { p.body.indexes = []; }, p => { p.body.payload = {}; },
    p => { p.id = randomUUID(); }, p => { p.body.photoCopy.version = 2; }, p => { p.body.photoCopy.source = {}; },
    p => { p.extra = true; }, p => { p.body.source.base.stateRevision = 0; }]) {
    const input = copy(f.input); mutate(input); fail(() => intent(input));
  }
});

test("new namespace is a UUID-bound demo/shared target, separate from confirmed source", async () => {
  const f = await wholeCopyProtocolFixture();
  const id = randomUUID(), demo = { ...copy(f.input), listId: `public-demo-state-${id}`, itemKey: `demo-state:${id}` };
  assert.equal(intent(demo).listId, demo.listId);
  for (const patch of [
    { listId: "public-shared-layout-fixed", itemKey: "shared-layout:fixed" },
    { listId: "public-demo-state", itemKey: "demo-state" },
    { listId: f.input.body.source.listId, itemKey: f.input.body.source.itemKey },
    { itemKey: `demo-state:${f.input.listId.slice(21)}` },
    { listId: `public-shared-layout-${f.input.operationId}`, itemKey: `shared-layout:${f.input.operationId}` }
  ]) fail(() => intent({ ...copy(f.input), ...patch }));
});

test("full ordered owner inventory cannot omit photo-free or detached owners or borrow arbitrary mapped IDs", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [p => { p.body.photoCopy.owners.shift(); }, p => { p.body.photoCopy.owners.reverse(); },
    p => { p.body.photoCopy.owners[0].entityId = "arbitrary-owner"; }, p => { p.body.photoCopy.owners[0].entityType = "item"; },
    p => { p.body.photoCopy.owners.push(copy(p.body.photoCopy.owners[0])); }, p => { p.body.photoCopy.owners[0].extra = true; },
    p => { p.body.photoCopy.owners[0].photos.push(copy(assets(p)[0])); }, p => { photoOwner(p).photos.reverse(); },
    p => { photoOwner(p).photos.pop(); }, p => { photoOwner(p).photos[0].sourcePhotoId = "foreign"; }]) {
    const input = copy(f.input); mutate(input); fail(() => intent(input));
  }
});

test("all new allocations are globally disjoint from operation, target UUID, source and one another", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [p => { assets(p)[0].assetId = p.operationId; }, p => { assets(p)[0].photoId = p.operationId; },
    p => { assets(p)[0].assetId = p.listId.slice(21); }, p => { assets(p)[0].photoId = assets(p)[0].assetId; },
    p => { assets(p)[1].assetId = assets(p)[0].photoId; }, p => { assets(p)[1].photoId = assets(p)[0].photoId; },
    p => { assets(p)[1].assetId = assets(p)[0].assetId; },
    p => { p.body.photoCopy.sourcePayload.items[p.operationId] = { id: p.operationId, containerId: "" }; },
    p => { p.body.photoCopy.sourcePayload.containers["a-root"].photos[0].assetId = assets(p)[0].assetId; }]) {
    const input = copy(f.input); mutate(input); fail(() => intent(input));
  }
});

test("source digest commits every unplaced owner, metadata and opaque byte; final asset digest is independently checked", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [p => { p.body.photoCopy.sourcePayload.items["item-unplaced"].name += " changed"; },
    p => { p.body.photoCopy.sourcePayload.opaqueTop.list.push("new" ); }, p => { p.body.source.payloadDigest = "0".repeat(64); }]) {
    const input = copy(f.input); mutate(input); await assert.rejects(stages(input), { code: "admin-template-photo-whole-copy-source-digest" });
  }
  const wrong = copy(f.input); assets(wrong)[0].assetDigest = "0".repeat(64);
  assert.equal((await stages(wrong)).length, 5, "allocation placeholders are allowed before the final proof");
  await assert.rejects(prove(wrong), { code: "admin-template-photo-whole-copy-stage-binding" });
  const metadata = copy(f.input); metadata.body.metadata.title += " new";
  assert.notEqual(await digest(metadata), await digest(f.input));
  await assert.rejects(prove(metadata), { code: "admin-template-photo-whole-copy-stage-binding" });
  const refreshed = copy(f.input);
  refreshed.body.photoCopy.sourcePayload.items["item-unplaced"].name += " changed";
  refreshed.body.source.payloadDigest = hash(refreshed.body.photoCopy.sourcePayload);
  refreshed.body.metadata.description += " changed";
  assert.notEqual(await digest(refreshed), await digest(f.input));
  await assert.rejects(prove(refreshed), { code: "admin-template-photo-whole-copy-stage-binding" });
  const reference = copy(f.input);
  reference.body.photoCopy.sourcePayload.containers["a-root"].photos[0].updatedAt = "2026-09-14T00:00:00Z";
  reference.body.source.payloadDigest = hash(reference.body.photoCopy.sourcePayload);
  const oldStage = f.manifests.find(m => m.source.entityId === "a-root");
  const newStage = (await stages(reference)).find(m => m.source.entityId === "a-root");
  assert.notEqual(newStage.source.referenceDigest, oldStage.source.referenceDigest);
  await assert.rejects(prove(reference), { code: "admin-template-photo-whole-copy-stage-binding" });
});

test("canonical object order is stable but changed photo order or stage transplant is not", async () => {
  const f = await wholeCopyProtocolFixture();
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
  assert.deepEqual(intent(reverse(f.input)), f.intent); assert.deepEqual(await stages(reverse(f.input)), f.manifests);
  const other = await wholeCopyProtocolFixture(), swapped = copy(f.input); assets(swapped)[0].assetDigest = assets(other.input)[0].assetDigest;
  await assert.rejects(prove(swapped), { code: "admin-template-photo-whole-copy-stage-binding" });
});

test("typed stage decoder rejects old types, fake target bases, loose identities and misplaced layouts", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [m => { m.version = 2; }, m => { m.kind = "admin-template-photo-tree-copy"; }, m => { m.treeDigest = m.copyDigest; },
    m => { m.target.base = { stateRevision: 0 }; }, m => { delete m.target.base; m.target.baseStateRevision = 0; },
    m => { m.target.payloadDigest = "0".repeat(64); }, m => { m.operationId = m.templateOperationId; },
    m => { m.target.photoId = m.operationId; }, m => { m.target.layoutId = m.source.layoutId; },
    m => { m.target.entityId = m.target.entityId.replace(/-\d+$/, "-100"); }, m => { m.target.entityId = m.target.entityId.replace(/-\d+$/, "-01"); },
    m => { m.target.entityType = m.source.entityType === "item" ? "container" : "item"; }, m => { m.source.baseStateRevision = "7"; },
    m => { m.source.referenceDigest = "bad"; }, m => { m.source.rootId = "tree-root"; }, m => { m.environment = "production"; }]) {
    const manifest = copy(f.manifests[0]); mutate(manifest); fail(() => stage(manifest));
  }
});

test("source inventory retains the existing forest, metadata, one-layout and complete owner/photo limits", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [p => { p.sharedLayoutsIndex = []; }, p => { p.layouts.extra = copy(p.layouts["source-layout"]); p.layouts.extra.id = "extra"; },
    p => { p.containers["a-root"].photos[0].unsupported = true; }, p => { p.items["item-a"].containerId = "missing"; },
    p => { p.layouts["source-layout"].arrangement.packedItems.ghost = true; },
    p => { for (let index = 0; index < 90; index++) p.items[`extra-${index}`] = { id: `extra-${index}`, containerId: "" }; },
    p => { for (const type of ["items", "containers"]) for (const owner of Object.values(p[type])) owner.photos = []; }]) {
    const input = copy(f.input); mutate(input.body.photoCopy.sourcePayload); fail(() => intent(input));
  }
});

test("fifty photos pass complete typed binding and fifty-one fail before stage creation", async () => {
  const f = await wholeCopyProtocolFixture(), input = copy(f.input), owner = photoOwner(input);
  const photos = input.body.photoCopy.sourcePayload.containers[owner.sourceEntityId].photos;
  while (assets(input).length < 50) {
    const sourcePhotoId = `extra-photo-${assets(input).length}`, reference = { id: sourcePhotoId, status: "synced", url: `https://legacy.example/${sourcePhotoId}.png` };
    photos.push(reference); owner.photos.push({ sourcePhotoId, photoId: randomUUID(), assetId: randomUUID(), assetDigest: "0".repeat(64) });
  }
  input.body.source.payloadDigest = hash(input.body.photoCopy.sourcePayload);
  assert.equal((await stages(input)).length, 50);
  photos.push({ id: "too-many", url: "https://legacy.example/extra.png" });
  owner.photos.push({ sourcePhotoId: "too-many", photoId: randomUUID(), assetId: randomUUID(), assetDigest: "0".repeat(64) });
  fail(() => intent(input), "limit");
});

test("complete action limit counts UTF-8 envelope bytes, not merely source payload", async () => {
  const f = await wholeCopyProtocolFixture(), input = copy(f.input);
  input.body.photoCopy.sourcePayload.opaquePadding = "";
  const wire = value => { const parsed = intent(value); return { expectedActorId: parsed.actorId, environment: parsed.environment,
    operationId: parsed.id, kind: parsed.kind, itemKey: parsed.itemKey, listId: parsed.listId, body: parsed.body }; };
  const emptyBytes = new TextEncoder().encode(canonical(wire(input))).byteLength, remaining = limits.wireBytes - emptyBytes;
  input.body.photoCopy.sourcePayload.opaquePadding = "я".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "a" : "");
  assert.equal(new TextEncoder().encode(canonical(wire(input))).byteLength, limits.wireBytes);
  assert.ok(new TextEncoder().encode(canonical(intent(input))).byteLength < limits.wireBytes);
  assert.ok(new TextEncoder().encode(canonical(input.body.photoCopy.sourcePayload)).byteLength < limits.wireBytes);
  input.body.photoCopy.sourcePayload.opaquePadding += "x";
  fail(() => intent(input), "limit");
});

test("result owner arrays must match every allocated asset and preserve original photo metadata and routes", async () => {
  const f = await wholeCopyProtocolFixture();
  for (const mutate of [rows => { rows.reverse(); }, rows => { rows.pop(); }, rows => { rows[0].added = [copy(rows.find(row => row.added.length).added[0])]; },
    rows => { rows.find(row => row.added.length > 1).added.reverse(); }, rows => { rows.find(row => row.added.length).added[0].assetDigest = "0".repeat(64); },
    rows => { rows.find(row => row.added.length).added[0].photo.assetId = randomUUID(); },
    rows => { rows.find(row => row.added.length).added[0].photo.createdAt = "2026-09-14T00:00:00Z"; },
    rows => { rows.find(row => row.added.length).added[0].photo.url = "https://foreign.test/photo.png"; },
    rows => { rows.find(row => row.added.length).added[0].photo.thumbUrl += "?other=true"; },
    rows => { rows.find(row => row.added.length).added[0].photo.width = 0; }]) {
    const rows = copy(f.added); mutate(rows); fail(() => project(f.intent, rows));
  }
});

test("all asynchronous factories detach input before the first hash await", async () => {
  const f = await wholeCopyProtocolFixture(), input = copy(f.input), before = copy(input);
  const pendingStages = stages(input), pendingCommitment = commitment(input), pendingProof = prove(input);
  input.body.metadata.title = "Changed during digest"; input.body.photoCopy.sourcePayload.opaqueTop.list.push("changed");
  assets(input)[0].photoId = randomUUID();
  assert.deepEqual(await pendingStages, f.manifests); assert.deepEqual(await pendingCommitment, await commitment(before));
  assert.equal(await pendingProof, true); assert.deepEqual(f.input, before);
  const mutable = copy(f.input), normalized = intent(mutable); mutable.body.metadata.title = "Later";
  assert.equal(normalized.body.metadata.title, f.intent.body.metadata.title);
});

test("a cold decoded intent rederives identical final manifests and exact projected payload", async () => {
  const f = await wholeCopyProtocolFixture(), decoded = JSON.parse(JSON.stringify(f.input)), rebuilt = await prepareWholeCopyProtocolFixture(decoded);
  assert.deepEqual(rebuilt.intent, f.intent); assert.deepEqual(rebuilt.manifests, f.manifests);
  assert.deepEqual(rebuilt.projected, f.projected); assert.equal(await prove(rebuilt.intent), true);
});
