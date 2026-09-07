// Entity identity is independent of wall clocks and operation ordering. The
// caller reserves this ID once in its draft/action; retries reuse that draft.
export function createEntityId(type, { crypto = globalThis.crypto } = {}) {
  if (!["item", "container", "layout"].includes(type)) throw new Error("Unknown entity type");
  let id;
  if (typeof crypto?.randomUUID === "function") id = crypto.randomUUID();
  else if (typeof crypto?.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
    throw new Error("Не удалось назначить безопасный ID новой записи. Данные не заменены.");
  }
  return `${type}-${id.toLowerCase()}`;
}
