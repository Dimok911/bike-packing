import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { personalPhotoCopyOwner } from "./personal-photo-copy-source.js";
import { PERSONAL_PHOTO_TREE_COPY_ENABLED, assertPersonalPhotoCopyBatchCandidate } from "./personal-photo-copy-batch-protocol.js";
import { personalPhotoTreeCopyLayout } from "./personal-photo-tree-copy-layout.js";
import { createPersonalPhotoCopySetSession } from "./personal-photo-copy-batch.js";
import { assertPersonalPhotoTreeSource } from "./personal-photo-tree-source.js";
import { stripContainerArrangementFields, stripItemPlacementFields } from "./serialize.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Состав копии дерева с фото не подтверждён. Исходные записи сохранены."), { code: "photo-tree-copy" }); };
const sourcesForRequest = input => ["container", "item"].flatMap(entityType => Object.keys(input.request?.sourceSnapshot?.[entityType === "item" ? "items" : "containers"] || {})
  .map(entityId => ({ entityType, entityId })));

export function preparePersonalPhotoTreeCopy(input, { enabled = PERSONAL_PHOTO_TREE_COPY_ENABLED, snapshotToPayload = value => value } = {}) {
  if (!enabled) fail();
  assertListOperationPayload({ ...input.binding, kind: "photos.mutate", body: input });
  const { binding, snapshot, basePayload, baseStateRevision, request, changedAt, editMeta, ids, versions, rootName } = clone(input);
  if (!same(snapshotToPayload(clone(snapshot)), basePayload) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1
    || !Array.isArray(ids) || ids.some(id => !uuid(id)) || new Set(ids).size !== ids.length || !request) fail();
  const sources = sourcesForRequest(input), selected = request.sourceSnapshot;
  assertPersonalPhotoTreeSource({ snapshot, sourceSnapshot: selected, listId: binding.listId });
  const count = sources.reduce((sum, source) => sum + (basePayload[source.entityType === "item" ? "items" : "containers"]?.[source.entityId]?.photos?.length || 0), 0);
  if (!sources.length || sources.length > 50 || !count || count > 50 || ids.length !== 1 + sources.length + 2 * count
    || !Array.isArray(versions) || versions.length !== sources.length || typeof rootName !== "string" || !rootName.trim()) fail();
  let offset = 1 + sources.length;
  const owners = [], changes = [];
  for (const [ownerIndex, { entityType, entityId: sourceId }] of sources.entries()) {
    const collection = entityType === "item" ? "items" : "containers", source = basePayload[collection]?.[sourceId];
    if (!source) fail();
    const chosen = clone(selected[collection][sourceId]), frozen = clone(source);
    if (entityType === "item") { stripItemPlacementFields(chosen); delete chosen.quantity; delete frozen.quantity; }
    else stripContainerArrangementFields(chosen);
    if (!same(chosen, frozen)) fail();
    const entityId = `${entityType}-${ids[ownerIndex + 1]}`, version = versions[ownerIndex], photos = source.photos || [], ownerChanges = [];
    if (!Number.isSafeInteger(version?.baseEntityRevision) || version.baseEntityRevision < 1 || version.baseEntityRevision > baseStateRevision
      || !Array.isArray(version.photoRevisions) || version.photoRevisions.length !== photos.length) fail();
    for (const [index, photo] of photos.entries()) {
      const proof = version.photoRevisions[index];
      if (proof?.photoId !== photo.id || proof.assetId !== photo.assetId) fail();
      ownerChanges.push({ version: 1, action: "copy", entityType, entityId, baseEntityRevision: 0,
        expectedPhotoIds: ownerChanges.map(change => change.photoId), photoId: ids[offset++], assetId: ids[offset++], index,
        source: { listId: binding.listId, photoId: photo.id, assetId: photo.assetId, photoRevision: proof.photoRevision } });
    }
    const owner = { entityType, entityId, fields: { name: sourceId === selected.rootId ? rootName : source.name, createdAt: changedAt, ...clone(editMeta) },
      copySource: { entityType, entityId: sourceId, listId: binding.listId, entityRevision: version.baseEntityRevision, payload: source } };
    owners.push(owner); changes.push(...ownerChanges);
    snapshot[collection][entityId] = { ...personalPhotoCopyOwner(owner), ...owner.fields,
      photos: ownerChanges.map(change => ({ id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId: binding.listId, status: "pending" })) };
  }
  const includeContents = Object.keys(selected.containers).length > 1 || Object.keys(selected.items).length > 0;
  const sourceLayoutId = request.sourceLayoutId || (includeContents ? snapshot.activeLayoutId : "");
  if (includeContents && !sourceLayoutId || sourceLayoutId && !basePayload.layouts[sourceLayoutId] || !basePayload.layouts[request.targetLayoutId]) fail();
  const body = { version: 1, action: "copy-batch", baseStateRevision, owners, changes, copyTree: {
    version: 1, rootId: selected.rootId, includeContents,
    sourceLayout: sourceLayoutId ? clone(basePayload.layouts[sourceLayoutId]) : null, targetLayout: clone(basePayload.layouts[request.targetLayoutId]),
    targetParentId: request.targetParentId || "", targetIndex: request.targetIndex ?? null, layoutFields: clone(editMeta) } };
  const tree = personalPhotoTreeCopyLayout(body, basePayload);
  // Check selected placement and quantities, including a subset chosen without contents.
  for (const [sourceId, chosen] of Object.entries(selected.containers)) {
    const placement = body.copyTree.sourceLayout?.arrangement.containers[sourceId];
    const expected = body.copyTree.includeContents ? placement : { childIds: [], itemIds: [], order: [] };
    if (!["childIds", "itemIds", "order"].every(key => same(chosen[key], expected[key]))) fail();
  }
  for (const [sourceId, chosen] of Object.entries(selected.items)) if (chosen.containerId !== body.copyTree.sourceLayout.arrangement.items[sourceId]
    || chosen.quantity !== body.copyTree.sourceLayout.arrangement.itemQuantities[sourceId]) fail();
  snapshot.layouts[tree.targetLayoutId] = tree.layout;
  const payload = snapshotToPayload(clone(snapshot));
  assertPersonalPhotoCopyBatchCandidate({ body, basePayload, payload, listId: binding.listId });
  for (const value of [body, snapshot, payload]) assertListOperationPayload({ ...binding, kind: "photos.mutate", body: value });
  return { binding, operationId: ids[0], body, snapshot, payload, rootId: tree.rootId };
}

export function createPersonalPhotoTreeCopySession(options = {}) {
  return createPersonalPhotoCopySetSession({ ...options, enabled: options.enabled ?? PERSONAL_PHOTO_TREE_COPY_ENABLED,
    prepareCopy: preparePersonalPhotoTreeCopy, sourcesForRequest });
}
