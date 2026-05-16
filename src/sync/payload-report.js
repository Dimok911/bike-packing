import { formatBytes } from "../utils/bytes.js";
import { jsonUtf8ByteLength } from "../utils/json.js";

export function syncPayloadSizeReport(payload, bodyJson = "") {
  const containers = payload?.containers || {};
  const items = payload?.items || {};
  const layouts = payload?.layouts || {};
  const photos = [
    ...Object.values(items).flatMap((item) => Array.isArray(item?.photos) ? item.photos : []),
    ...Object.values(containers).flatMap((container) => Array.isArray(container?.photos) ? container.photos : [])
  ];
  return {
    bodyBytes: bodyJson ? jsonUtf8ByteLength(bodyJson) : 0,
    payloadBytes: jsonUtf8ByteLength(payload),
    containersBytes: jsonUtf8ByteLength(containers),
    itemsBytes: jsonUtf8ByteLength(items),
    layoutsBytes: jsonUtf8ByteLength(layouts),
    photosBytes: jsonUtf8ByteLength(photos),
    containers: Object.keys(containers).length,
    items: Object.keys(items).length,
    layouts: Object.keys(layouts).length,
    photos: photos.length
  };
}

export function payloadReportText(report) {
  if (!report) return "";
  return `payload ${formatBytes(report.payloadBytes)}, запрос ${formatBytes(report.bodyBytes)}, ` +
    `вещи ${formatBytes(report.itemsBytes)}/${report.items}, сумки ${formatBytes(report.containersBytes)}/${report.containers}, ` +
    `укладки ${formatBytes(report.layoutsBytes)}/${report.layouts}, фото-мета ${formatBytes(report.photosBytes)}/${report.photos}`;
}

export function annotatePayloadError(error, report) {
  if (!error || !report) return error;
  if (!/payload is too large|payload_too_large/i.test(`${error.message || ""} ${error.data?.code || ""} ${error.data?.error || ""}`)) {
    return error;
  }
  error.message = `${error.message} (${payloadReportText(report)})`;
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[bike-packing] Sync payload too large", report);
  }
  return error;
}
