import { itemCategories, migrateContainerOrder } from "../state/normalize.js";
import { getVisibleLayoutRootIds } from "../state/layout-selectors.js";
import {
  containerWeight,
  countItemsByLocation,
  countItemsInContainer
} from "../state/metrics.js";
import { formatItemWeight } from "./item-format.js";
import { escapeHtml } from "../utils/html.js";
import { formatWeight } from "../utils/weight.js";

export function buildPrintableDocument(targetState, { layoutId = targetState.activeLayoutId, includeGeneratedRoots = false } = {}) {
  migrateContainerOrder(targetState);
  const layout = targetState.layouts?.[layoutId] || targetState.layouts?.[targetState.activeLayoutId] || Object.values(targetState.layouts || {})[0];
  const rootContainerIds = getVisibleLayoutRootIds(targetState, layout, { includeGenerated: includeGeneratedRoots });
  const generatedAt = new Date().toLocaleString("ru-RU");
  const totalWeight = rootContainerIds.reduce((sum, id) => sum + containerWeight(targetState, id), 0);
  const itemCount = rootContainerIds.reduce((sum, id) => sum + countItemsInContainer(targetState, id), 0);
  const missingCount = rootContainerIds.reduce((sum, id) => sum + countItemsByLocation(targetState, id, ["Надо купить", "Не знаю где"]), 0);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(layout?.name || "Укладка")} — велопоход</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1d2522;
      background: #f6f4ee;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1f6f5b; padding-bottom: 18px; margin-bottom: 18px; }
    h1 { margin: 0 0 6px; font-size: 30px; }
    h2 { margin: 0; font-size: 20px; }
    h3 { margin: 0; font-size: 15px; }
    .muted { color: #62706b; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
    .metric { background: #fff; border: 1px solid #d8ddd7; border-radius: 8px; padding: 10px; }
    .metric strong { display: block; font-size: 22px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .bag { break-inside: avoid; background: #fff; border: 1px solid #cfd8d2; border-radius: 8px; overflow: hidden; }
    .bag-title { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #e3f1ec; border-bottom: 1px solid #c7ddd5; }
    .content { padding: 10px 12px; }
    .item, .box { break-inside: avoid; margin: 0 0 8px; }
    .item { border: 1px solid #d8ddd7; border-radius: 8px; padding: 8px; background: #fff; }
    .box { border: 1px solid #b9d3ca; border-left: 5px solid #1f6f5b; border-radius: 8px; background: #eef7f3; }
    .box-title { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; background: #e3f1ec; border-bottom: 1px solid #c7ddd5; font-weight: 800; }
    .box-content { padding: 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .pill { display: inline-block; border-radius: 999px; padding: 2px 7px; background: #dcece6; color: #1f6f5b; font-weight: 700; font-size: 11px; }
    .warn { background: #fde9dd; color: #b75d2a; }
    .print-note { margin-top: 18px; color: #62706b; font-size: 12px; }
    @media print {
      body { background: #fff; }
      main { max-width: none; padding: 0; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bag, .item, .box, .metric { box-shadow: none; }
    }
    @page { margin: 14mm; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Сборы в велопоход</h1>
        <div class="muted">Укладка: ${escapeHtml(layout?.name || "Укладка")}</div>
      </div>
      <div class="muted">Сформировано: ${escapeHtml(generatedAt)}</div>
    </header>
    <section class="metrics">
      <div class="metric"><strong>${escapeHtml(formatWeight(totalWeight))}</strong><span>общий вес</span></div>
      <div class="metric"><strong>${itemCount}</strong><span>вещей в укладке</span></div>
      <div class="metric"><strong>${missingCount}</strong><span>надо купить / не знаю где</span></div>
    </section>
    <section class="grid">
      ${rootContainerIds.map((id) => renderPrintableContainer(targetState, id, true)).join("")}
    </section>
    <p class="print-note">Подсказка: в окне печати можно выбрать «Сохранить как PDF».</p>
  </main>
</body>
</html>`;
}

function renderPrintableContainer(targetState, containerId, root = false) {
  const container = targetState.containers?.[containerId];
  if (!container) return "";
  const entries = (container.order || []).map((entry) => {
    if (entry.type === "item") return renderPrintableItem(targetState, entry.id);
    if (entry.type === "container") return renderPrintableContainer(targetState, entry.id, false);
    return "";
  }).join("");
  const tag = root ? "article" : "section";
  const className = root ? "bag" : "box";
  const titleClass = root ? "bag-title" : "box-title";
  const contentClass = root ? "content" : "box-content";
  return `<${tag} class="${className}">
    <div class="${titleClass}">
      <h2>${escapeHtml(container.name)}</h2>
      <strong>${escapeHtml(formatWeight(containerWeight(targetState, containerId)))}</strong>
    </div>
    <div class="${contentClass}">${entries}</div>
  </${tag}>`;
}

function renderPrintableItem(targetState, itemId) {
  const item = targetState.items?.[itemId];
  if (!item) return "";
  const warn = item.location === "Надо купить" || item.location === "Не знаю где";
  return `<div class="item">
    <h3>${escapeHtml(item.name)}</h3>
    <div class="meta">
      <span class="pill">${escapeHtml(formatItemWeight(item))}</span>
      ${itemCategories(item).map((category) => `<span class="pill">${escapeHtml(category)}</span>`).join("")}
      <span class="pill ${warn ? "warn" : ""}">${escapeHtml(item.location)}</span>
    </div>
    ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ""}
  </div>`;
}
