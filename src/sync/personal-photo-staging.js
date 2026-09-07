export const PERSONAL_PHOTO_STAGING_ENABLED = false;
export const PERSONAL_PHOTO_CANCELLATION_ENABLED = false;
export const STAGED_PHOTO_ASSET_CAPABILITY = "personalStagedPhotoAssetsV1";
export const STAGED_PHOTO_CANCELLATION_CAPABILITY = "personalStagedPhotoCancellationV1";
const environment = "bike-packing-experiment";
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const paused = (id, message = "Загрузка фото ещё не подтверждена. Файл и действие сохранены; повтор отправки остановлен.") =>
  Object.assign(new Error(message), { isAmbiguousMutation: true, isPhotoStagingBlocked: true, uncertainWriteId: id });

export function validateStagedPhotoReceipt(data, expected) {
  const op = data?.operation, asset = data?.asset;
  return data?.ok === true && op?.state === "committed" && op.id === expected.operationId
    && op.environment === environment && op.actorId === expected.actorId && op.listId === expected.listId
    && op.entityType === expected.entityType && op.entityId === expected.entityId && op.photoId === expected.photoId
    && hash(op.payloadDigest) && asset?.id === expected.operationId && asset.publication === "not-published"
    && ["ready", "unavailable", "retired"].includes(asset.state)
    && asset.fileHash === expected.fileHash && asset.thumbHash === expected.thumbHash
    && hash(asset.storedFileHash) && hash(asset.storedThumbHash);
}

export function validateCancelledStagedPhotoReceipt(data, expected) {
  const op = data?.operation, proof = data?.cancellation;
  return data?.ok === true && op?.state === "cancelled" && op.id === expected.operationId
    && op.environment === environment && op.actorId === expected.actorId && op.listId === expected.listId
    && op.entityType === expected.entityType && op.entityId === expected.entityId && op.photoId === expected.photoId
    && hash(op.payloadDigest) && data.asset === undefined && proof?.version === 1 && proof.stageOperationId === expected.operationId
    && proof.fileHash === expected.fileHash && proof.thumbHash === expected.thumbHash
    && proof.noAssetPublished === true && proof.stageCannotPublish === true;
}

const stageForm = (record, expected) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ operationId: expected.operationId, expectedActorId: record.binding.actorId, environment,
    photoId: expected.photoId, entityType: expected.entityType, entityId: expected.entityId })) form.set(key, value);
  form.set("file", record.file, record.stage.fileName);
  if (record.thumb) form.set("thumb", record.thumb, "thumb");
  return form;
};

export function createPersonalPhotoStaging({ store, transport, getContext,
  locks = globalThis.navigator?.locks, fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 10000, enabled = PERSONAL_PHOTO_STAGING_ENABLED, cancellationEnabled = PERSONAL_PHOTO_CANCELLATION_ENABLED } = {}) {
  const request = async (path, form, json = false) => {
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([
        fetchImpl(transport.apiUrl(path), { method: form ? "POST" : "GET", body: json ? JSON.stringify(form) : form,
          ...(json ? { headers: { "Content-Type": "application/json" } } : {}),
          credentials: "include", redirect: "error", cache: "no-store", signal: controller.signal })
          .then(async response => ({ status: response.status, data: await response.json() })),
        new Promise((resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(paused(null)); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const read = async path => { const response = await request(path); if (response.status !== 200) throw paused(null); return response.data; };
  const scope = record => ({ type: "photo-stage", protocol: "staging-v1", operationId: record.stage.operationId,
    actorId: record.binding.actorId, listId: record.binding.listId, entityType: record.stage.entityType,
    entityId: record.stage.entityId, photoId: record.stage.photoId, fileHash: record.fileMetadata.hash,
    thumbHash: record.thumbMetadata?.hash || record.fileMetadata.hash, actionOperationId: record.action.operationId, intentHash: record.intentHash });
  const run = async (actionOperationId, inspectOnly, cancelOnly = false) => {
    if (!transport?.experiment || !inspectOnly && (cancelOnly ? !cancellationEnabled : !enabled)) throw paused(null, "Новый режим загрузки фото ещё не включён.");
    const initial = { ...getContext?.() }, binding = store.binding;
    const assertCurrent = () => {
      const current = getContext?.();
      if (!current || !initial.generation || current.scope !== "personal" || current.generation !== initial.generation
        || Object.keys(binding).some(key => current[key] !== binding[key])) throw paused(null, "Аккаунт или карточка изменились. Старый результат фото не применён.");
    };
    assertCurrent();
    if (!locks?.request) throw paused(null, "Между вкладками недоступна блокировка. Фото не отправлено.");
    return locks.request(`bike-packing-photo-stage-v1:${binding.actorId}:${binding.listId}`, async () => {
      assertCurrent(); const record = await store.read(actionOperationId); assertCurrent();
      if (!record || Object.keys(binding).some(key => record.binding?.[key] !== binding[key])) throw paused(null, "Не найден полный локальный файл и его действие.");
      const expected = scope(record), stageId = expected.operationId;
      const path = `/bike-packing/lists/${encodeURIComponent(binding.listId)}/photo-assets`;
      const statusPath = `${path}/${encodeURIComponent(stageId)}`;
      await transport.prepare(); assertCurrent();
      const me = await read("/auth/me"); assertCurrent();
      if (me?.user?.id !== binding.actorId) throw paused(stageId, "Серверный аккаунт изменился. Фото не отправлено.");
      const entry = transport.writes.find(value => value.id === stageId);
      if (entry && Object.keys(expected).some(key => entry.recovery?.[key] !== expected[key])) throw paused(stageId, "Номер загрузки связан с другими данными.");
      const acknowledge = data => {
        if (validateCancelledStagedPhotoReceipt(data, expected)) {
          if (transport.writes.some(value => value.id === stageId) && !transport.confirmWrite(stageId, { receipt: data })) throw paused(stageId);
          assertCurrent();
          const proof = { ...data, historicalStageOnly: true, actionOperationId };
          if (inspectOnly || cancelOnly) return proof;
          throw Object.assign(paused(stageId, "Начало загрузки отменено на сервере. Файл сохранён локально; исходное фотодействие не отправлено."),
            { isAmbiguousMutation: false, isConfirmedStageCancellation: true, stageReceipt: proof });
        }
        if (!validateStagedPhotoReceipt(data, expected)) throw paused(stageId);
        // Historical stage proof is separate from current asset availability
        // and NEVER confirms the owner action or installs a photo URL.
        if (transport.writes.some(value => value.id === stageId) && !transport.confirmWrite(stageId, { receipt: data })) throw paused(stageId);
        assertCurrent();
        if (data.asset.state !== "ready") throw Object.assign(paused(stageId, "Файл был принят, но сейчас недоступен для привязки. Нужна отдельная проверка."),
          { isAmbiguousMutation: false, isConfirmedAssetUnavailable: true, stageReceipt: data });
        return { ...data, historicalStageOnly: true, actionOperationId };
      };
      if (inspectOnly) return acknowledge(await read(statusPath));
      const capabilities = await read("/bike-packing/capabilities"); assertCurrent();
      if (!capabilities?.capabilities?.includes(STAGED_PHOTO_ASSET_CAPABILITY)) throw paused(stageId, "Сервер ещё не поддерживает отдельное подтверждение файла. Фото не отправлено.");
      if (cancelOnly) {
        if (!capabilities.capabilities.includes(STAGED_PHOTO_CANCELLATION_CAPABILITY)) throw paused(stageId, "Сервер ещё не поддерживает подтверждённую отмену начала загрузки.");
        const known = await read(statusPath); assertCurrent();
        if (validateStagedPhotoReceipt(known, expected) || validateCancelledStagedPhotoReceipt(known, expected)) return acknowledge(known);
        const op = known?.operation;
        if (entry?.confirmed || known?.ok !== true || op?.state !== "unknown" || op.id !== stageId
          || op.environment !== environment || op.actorId !== binding.actorId || op.listId !== binding.listId) throw paused(stageId);
        if (!entry) transport.assertWritable(path, "POST", expected);
        const claim = await store.claimStage(actionOperationId); assertCurrent();
        if (claim.stageOperationId !== stageId || claim.intentHash !== record.intentHash) throw paused(stageId);
        // Preserve the ORIGINAL immutable transport/stage identity. This sends
        // only its explicit no-publication fence, never the original upload.
        if (!entry) await transport.beginWrite(path, "POST", stageForm(record, expected), expected);
        assertCurrent();
        const body = { expectedActorId: binding.actorId, environment, entityType: expected.entityType, entityId: expected.entityId,
          photoId: expected.photoId, fileHash: expected.fileHash, thumbHash: expected.thumbHash };
        try {
          const response = await request(`${statusPath}/cancel`, body, true);
          if (response.status !== 200) throw paused(stageId);
          return acknowledge(response.data);
        } catch (error) {
          if (error.isConfirmedAssetUnavailable || error.isConfirmedStageCancellation) throw error;
          if (!transport.writes.find(value => value.id === stageId)?.confirmed) transport.noteFailure(error, path, "POST", stageId);
          assertCurrent(); return acknowledge(await read(statusPath)); // No automatic cancellation or upload retry.
        }
      }
      if (!entry) transport.assertWritable(path, "POST", expected);
      // This immutable IDB claim survives clearing/replacing the transport
      // journal. Only the first claimant may POST; a reload is status-only,
      // including a crash between claim and request registration/dispatch.
      const claim = await store.claimStage(actionOperationId); assertCurrent();
      if (claim.stageOperationId !== stageId || claim.intentHash !== record.intentHash) throw paused(stageId);
      if (!claim.fresh || entry) return acknowledge(await read(statusPath));
      transport.assertWritable(path, "POST", expected);
      const form = stageForm(record, expected);
      await transport.beginWrite(path, "POST", form, expected); assertCurrent();
      try {
        const response = await request(path, form);
        if (response.status !== 200) throw paused(stageId);
        return acknowledge(response.data);
      } catch (error) {
        if (error.isConfirmedAssetUnavailable || error.isConfirmedStageCancellation) throw error;
        if (!transport.writes.find(value => value.id === stageId)?.confirmed) transport.noteFailure(error, path, "POST", stageId);
        assertCurrent();
        return acknowledge(await read(statusPath));
      }
    });
  };
  return { stage: id => run(id, false), inspect: id => run(id, true), cancel: id => run(id, false, true) };
}
