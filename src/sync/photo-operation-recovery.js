import { photoWriteIdentity } from "./experiment-transport.js";

// Opt-in pilot only; ordinary/unsupported endpoints retain their existing gate.
export const PHOTO_OPERATION_RECOVERY_RELEASE_ENABLED = false;
export const PHOTO_OPERATION_CAPABILITY = "personalPhotoUploadOperationsV1";
const personalUpload = /^\/bike-packing\/lists\/([^/]+)\/photos$/;
const environment = "bike-packing-experiment";
const hashBlob = async (blob) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");

function unconfirmed(id, message = "Результат загрузки не подтверждён. Повтор приостановлен; фото сохранено на устройстве.") {
  return Object.assign(new Error(message), { isAmbiguousMutation: true, uncertainWriteId: id });
}

export function validatePhotoOperationReceipt(data, expected) {
  const op = data?.operation;
  return Boolean(data?.ok === true && op?.state === "committed" && op.id === expected.operationId
    && op.environment === environment && String(op.actorId) === expected.actorId
    && op.listId === expected.listId && op.photoId === expected.photoId
    && op.entityId === expected.entityId && op.entityType === expected.entityType
    && op.fileHash === expected.fileHash && op.thumbHash === expected.thumbHash
    && /^[a-f0-9]{64}$/.test(op.payloadDigest || "")
    && data.photo?.id === expected.photoId && typeof data.photo.url === "string" && data.photo.url);
}

export function createPhotoOperationRecovery({
  transport, enabled = PHOTO_OPERATION_RECOVERY_RELEASE_ENABLED,
  fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 10000,
} = {}) {
  const read = async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(transport.apiUrl(path), {
        method: "GET", credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Photo operation read: HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const acknowledge = (id, data, expected) => {
    if (!validatePhotoOperationReceipt(data, expected)) throw unconfirmed(id);
    // Persist the exact photo receipt before releasing this intent. If a tab
    // closes before its local photo queue saves, replay queries status, not POST.
    if (!transport.confirmWrite(id, { receipt: data })) throw unconfirmed(id);
    return data;
  };
  const recover = async (entry) => {
    const data = await read(`/bike-packing/lists/${encodeURIComponent(entry.recovery.listId)}/photo-operations/${encodeURIComponent(entry.id)}`);
    return acknowledge(entry.id, data, entry.recovery);
  };
  return {
    async run({ path, method = "POST", body, send }) {
      const match = personalUpload.exec(path);
      if (!enabled || !transport.experiment || method !== "POST" || !match) return send(null);
      await transport.prepare();
      const identity = await photoWriteIdentity(path, method, body);
      const me = await read("/auth/me");
      const actorId = String(me?.user?.id || "");
      if (!actorId) throw unconfirmed(null, "Для проверки отправки нужен вход в тот же аккаунт.");
      const existing = transport.writes.find((entry) => entry.identity === identity && entry.recovery?.actorId === actorId);
      if (existing) {
        // Includes ACK receipts, interrupted pages and another tab's pending
        // upload. A missing/old matching hash cannot substitute for this read.
        try { return await recover(existing); } catch { throw unconfirmed(existing.id); }
      }
      transport.assertWritable(path, method);
      const capabilities = await read("/bike-packing/capabilities");
      if (!capabilities?.capabilities?.includes(PHOTO_OPERATION_CAPABILITY)) {
        throw unconfirmed(null, "Сервер ещё не поддерживает восстановление загрузки. Фото не отправлено.");
      }
      const file = body.get("file"), thumb = body.get("thumb");
      const expected = {
        operationId: crypto.randomUUID(), actorId, listId: decodeURIComponent(match[1]),
        photoId: String(body.get("photoId")), entityId: String(body.get("entityId") || body.get("itemId")),
        entityType: String(body.get("entityType") || "item"),
        fileHash: await hashBlob(file), thumbHash: await hashBlob(thumb || file),
      };
      body.set("operationId", expected.operationId);
      try {
        const data = await send(expected);
        return acknowledge(expected.operationId, data, expected);
      } catch (error) {
        const entry = transport.writes.find(({ id }) => id === expected.operationId);
        if (!entry) throw error; // Failed before durable registration/dispatch.
        transport.noteFailure(unconfirmed(entry.id), path, method, entry.id);
        try { return await recover(entry); } catch { throw unconfirmed(entry.id); }
      }
    },
  };
}
