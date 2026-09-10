import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";
import { assertPersonalServerImportBody } from "./personal-server-import-protocol.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Копирование списка по ссылке, очередь и набор файлов не совпали. Отправка остановлена."), { code: "server-import-outbox-record", isPersonalSaveBlocked: true }); };

export function assertPersonalServerImportRecord(record) {
  const action = record?.action, photo = record?.photoState;
  if (action?.kind !== "list.import" || ![1, 2].includes(action.body?.serverImport?.version) || photo?.version !== 1
    || !record.mergeBase || record.mergeBase.stateRevision !== action.body.baseStateRevision || record.reconciliation || record.localReconciliation
    || !same(photo.payload, action.body.payload) || !same(personalGuestBusinessPayload(record.snapshot), photo.payload)) fail();
  const plan = assertPersonalServerImportBody(action.body, { base: record.mergeBase.payload, listId: action.listId, operationId: action.operationId, causal: true });
  if (plan.attachments.length ? photo.fileInventoryVersion !== 2 || !/^[a-f0-9]{64}$/.test(photo.fileIntentHash || "")
    : photo.fileIntentHash !== null || photo.fileInventoryVersion !== undefined) fail();
  return plan.attachments.map(part => ({ ...part, action: "attach" }));
}

export function assertPersonalServerImportFile(record, saved, binding) {
  const attachments = assertPersonalServerImportRecord(record);
  if (!attachments.length || !saved || !same(saved.binding, binding) || !same(saved.action, record.action) || !same(saved.snapshot, record.snapshot)
    || saved.intentHash !== record.photoState.fileIntentHash || !Array.isArray(saved.files) || saved.files.length !== attachments.length) fail();
  for (const [index, part] of saved.files.entries()) {
    const expected = attachments[index];
    if (!same(part.stage, { operationId: expected.assetId, photoId: expected.photoId, entityType: expected.entityType,
      entityId: expected.entityId, fileName: expected.file.fileName }) || !(part.file instanceof Blob) || part.file.size !== expected.file.size || part.file.type !== expected.file.type
      || !same(part.fileMetadata, { hash: expected.file.hash, size: expected.file.size, type: expected.file.type })
      || !same(part.thumbMetadata, expected.thumb) || (expected.thumb === null ? part.thumb !== null : !(part.thumb instanceof Blob)
        || part.thumb.size !== expected.thumb.size || part.thumb.type !== expected.thumb.type)) fail();
  }
}
