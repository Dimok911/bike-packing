import { escapeHtml } from "../utils/html.js";

// Show actual contents as well as counts: equal-sized drafts may contain
// entirely different items. Render remote and local text through escaping.
export function adminTemplateComparisonHtml(local, server) {
  const describe = (value, label) => {
    const payload = value.payload, layout = Object.values(payload.layouts || {})[0] || {}, arrangement = layout.arrangement || {};
    const containers = payload.containers || {};
    const rows = (kind, entities) => Object.entries(entities || {}).map(([id, row]) => {
      const owner = kind === "Вещь" ? arrangement.items?.[id] ?? row.containerId : arrangement.containers?.[id]?.parentId ?? row.parentId;
      const quantity = kind === "Вещь" ? arrangement.itemQuantities?.[id] ?? row.quantity ?? 1 : null;
      const details = [kind, row.name || "Без названия", row.weight != null ? `${row.weight} г` : "",
        quantity !== null ? `${quantity} шт.` : "", owner ? `в ${containers[owner]?.name || "сумке"}` : "без вложения",
        arrangement.packedItems?.[id] ? "упаковано" : "", row.note || ""].filter(Boolean).join(" · ");
      return `<li>${escapeHtml(details)}</li>`;
    }).join("");
    return `<details open><summary>${escapeHtml(label)}: ${escapeHtml(value.metadata.title)}</summary>`
      + `<p>${escapeHtml(value.metadata.description || "Без описания")}</p><ul>`
      + (rows("Сумка", containers) + rows("Вещь", payload.items) || "<li>Вещей и сумок нет</li>") + "</ul></details>";
  };
  return describe(local, "На устройстве") + describe(server, "На сервере");
}
