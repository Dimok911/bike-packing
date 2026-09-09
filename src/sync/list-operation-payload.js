// Matches the API's canonical binding limit, not the smaller UI snapshot or
// JavaScript string length. Sorting JSON object keys does not change byte size.
export const MAX_LIST_OPERATION_PAYLOAD_BYTES = 3 * 1024 * 1024;
const failure = (code, message) => Object.assign(new Error(message), { code, isOperationPreflightError: true });

export function assertListOperationJsonValue(value) {
  const validate = (value, depth = 0) => {
    if (depth > 100) throw failure("payload-shape", "Данные вложены слишком глубоко. Изменение не отправлено; сохраните копию для восстановления.");
    if (value === null || ["string", "boolean"].includes(typeof value) || typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) { for (const entry of value) validate(entry, depth + 1); return; }
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      for (const entry of Object.values(value)) validate(entry, depth + 1);
      return;
    }
    throw failure("payload-shape", "Формат данных не подходит для отправки. Сохраните копию для восстановления.");
  };
  validate(value);
}

export function assertListOperationPayload({ environment = "bike-packing-experiment", actorId, kind, listId, body }) {
  const binding = { environment, actorId, kind, listId, body };
  assertListOperationJsonValue(binding);
  const bytes = new TextEncoder().encode(JSON.stringify(binding)).byteLength;
  if (bytes > MAX_LIST_OPERATION_PAYLOAD_BYTES) throw Object.assign(failure("payload-size",
    "Изменение превышает допустимый размер отправки. Оно не отправлено; не закрывайте вкладку и скачайте копию для восстановления."),
  { payloadBytes: bytes, maxPayloadBytes: MAX_LIST_OPERATION_PAYLOAD_BYTES });
  return bytes;
}
