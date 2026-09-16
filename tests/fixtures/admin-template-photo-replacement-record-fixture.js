import { adminPhotoRecordFixture } from "./admin-template-photo-record-fixture.js";

export async function adminPhotoReplacementRecordFixture({ entityType = "item", retainOld = false } = {}) {
  const input = await adminPhotoRecordFixture({ entityType, count: 2 });
  const type = entityType === "item" ? "items" : "containers", localId = entityType === "item" ? "local-item" : "local-bag";
  const serverId = entityType === "item" ? "server-item" : "server-bag";
  const state = input.snapshot.state, baseline = state.layouts[input.snapshot.layoutId].adminCausalSource.photoView;
  state.packedItems = {};
  const old = baseline.owners.find(row => row.type === type && row.localId === localId).viewPhotos;
  const pending = state[type][localId].photos.filter(photo => photo.status === "pending");
  input.snapshot.beforeState = structuredClone(state);
  input.snapshot.beforeState[type][localId].photos = structuredClone(old);
  input.snapshot.beforeState[type][localId].name = input.snapshot.sourcePayload[type][serverId].name;
  state[type][localId].photos = retainOld ? [pending[1], ...structuredClone(old), pending[0]] : [...pending].reverse();
  input.action.body.photoAppend = { ...input.action.body.photoAppend, version: 2, photoIds: state[type][localId].photos.map(photo => photo.id) };
  return input;
}

export function replacementPreparationInput(input) {
  const first = input.files[0].stage, type = first.entityType === "item" ? "items" : "containers";
  return { binding: input.binding, operationId: input.action.operationId, entityType: first.entityType,
    entityId: input.snapshot.ownerMap.owners.find(row => row.type === type && row.serverId === first.entityId).localId,
    replace: true, snapshot: input.snapshot, payload: input.action.body.payload,
    files: input.files.map(({ stage, file, thumb }) => ({ id: stage.photoId, fileName: stage.file.fileName,
      type: file.type, size: file.size, fullBlobVerified: true, blob: file, thumbBlob: thumb })) };
}
