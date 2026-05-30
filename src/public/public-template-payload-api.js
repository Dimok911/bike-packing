export const PUBLIC_TEMPLATE_PAYLOAD_ENDPOINT_CAPABILITY = "publicTemplatePayloadEndpoint";

const normalizeText = (value = "") => String(value || "").trim();

export function publicTemplatePayloadPath(itemKey) {
  const normalizedItemKey = normalizeText(itemKey);
  if (!normalizedItemKey) return "";
  return `/bike-packing/public-template-payloads/${encodeURIComponent(normalizedItemKey)}`;
}
