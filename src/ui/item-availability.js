import {
  ITEM_AVAILABILITY_STATUS_AVAILABLE,
  normalizeItemAvailabilityStatus
} from "../state/layout-locks.js";
import { escapeHtml } from "../utils/html.js";

const AVAILABILITY_ICONS = {
  lost: "?",
  broken: "!",
  retired: "-"
};

export function itemAvailabilityStatus(item) {
  return normalizeItemAvailabilityStatus(item?.availabilityStatus);
}

export function itemAvailabilityCardClass(item) {
  const status = itemAvailabilityStatus(item);
  if (status === ITEM_AVAILABILITY_STATUS_AVAILABLE) return "";
  return `item-unavailable item-unavailable-${status}`;
}

export function itemAvailabilityLabel(item, t = (key) => key) {
  const status = itemAvailabilityStatus(item);
  if (status === ITEM_AVAILABILITY_STATUS_AVAILABLE) return "";
  return t(`items.availability.${status}`);
}

export function itemAvailabilityBadgeHtml(item, t = (key) => key) {
  const status = itemAvailabilityStatus(item);
  if (status === ITEM_AVAILABILITY_STATUS_AVAILABLE) return "";
  const label = itemAvailabilityLabel(item, t);
  const icon = AVAILABILITY_ICONS[status] || "!";
  return `
    <span class="item-availability-badge item-availability-${escapeHtml(status)}" title="${escapeHtml(label)}">
      <span class="item-availability-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}
