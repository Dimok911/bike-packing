import { itemCategories, migrateContainerOrder } from "../state/normalize.js";
import { getVisibleLayoutRootIds } from "../state/layout-selectors.js";
import {
  containerWeight,
  countItemsByLocation,
  countItemsInContainer,
  itemQuantity,
  itemTotalWeight
} from "../state/metrics.js";
import { escapeHtml } from "../utils/html.js";
import { formatWeight } from "../utils/weight.js";

const ATTENTION_LOCATIONS = ["Надо купить", "Не знаю где"];

export function askPrintLabelsChoice(askConfirmDialog) {
  if (typeof askConfirmDialog !== "function") return Promise.resolve(true);
  return askConfirmDialog({
    title: "Печать списка",
    text: "Печатать метки мест хранения и категорий? С метками проще ориентироваться в поездке, без меток список компактнее.",
    okText: "С метками",
    cancelText: "Без меток"
  });
}

export function printHtmlDocument(html) {
  const frame = document.createElement("iframe");
  frame.title = "PDF print";
  frame.style.position = "fixed";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.width = "100vw";
  frame.style.height = "100vh";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.zIndex = "-1";
  frame.addEventListener("load", () => {
    const targetWindow = frame.contentWindow;
    if (!targetWindow) {
      frame.remove();
      return;
    }
    const cleanup = () => window.setTimeout(() => frame.remove(), 3000);
    targetWindow.addEventListener("afterprint", cleanup, { once: true });
    targetWindow.focus();
    targetWindow.print();
    window.setTimeout(cleanup, 120000);
  }, { once: true });
  document.body.appendChild(frame);
  frame.srcdoc = html;
}

export function buildPrintableDocument(targetState, { layoutId = targetState.activeLayoutId, includeGeneratedRoots = false, includeLabels = true } = {}) {
  migrateContainerOrder(targetState);
  const layout = targetState.layouts?.[layoutId] || targetState.layouts?.[targetState.activeLayoutId] || Object.values(targetState.layouts || {})[0];
  const rootContainerIds = getVisibleLayoutRootIds(targetState, layout, { includeGenerated: includeGeneratedRoots });
  const generatedAt = new Date().toLocaleString("ru-RU");
  const totalWeight = rootContainerIds.reduce((sum, id) => sum + containerWeight(targetState, id), 0);
  const itemCount = rootContainerIds.reduce((sum, id) => sum + countItemsInContainer(targetState, id), 0);
  const missingCount = rootContainerIds.reduce((sum, id) => sum + countItemsByLocation(targetState, id, ATTENTION_LOCATIONS), 0);
  const layoutName = layout?.name || "Укладка";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(layoutName)} - печатный чек-лист</title>
  <style>
    * { box-sizing: border-box; }
    html { color: #000; background: #fff; }
    body {
      margin: 0;
      color: #000;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.25;
    }
    main { max-width: 1120px; margin: 0 auto; padding: 18px; }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items: end;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.05; }
    h2 { margin: 0; font-size: 15px; line-height: 1.1; }
    h3 { margin: 0; font-size: 12px; line-height: 1.1; }
    .muted { color: #000; font-size: 10px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin: 10px 0;
    }
    .stat { border: 1px solid #000; padding: 6px 8px; min-height: 36px; }
    .stat strong { display: block; font-size: 16px; line-height: 1.1; }
    .print-without-labels .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .print-without-labels .optional-label { display: none; }
    .overview { width: 100%; border-collapse: collapse; margin: 10px 0 12px; }
    .overview caption {
      caption-side: top;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
      margin-bottom: 4px;
    }
    .overview th,
    .overview td {
      border: 1px solid #000;
      padding: 4px 5px;
      text-align: left;
      vertical-align: top;
    }
    .overview th { background: #eee; font-size: 10px; text-transform: uppercase; }
    .overview .num { width: 9mm; text-align: center; font-weight: 700; }
    .bags { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-items: start; }
    .bag {
      border: 2px solid #000;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #fff;
    }
    .bag-heading,
    .group-heading {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: start;
      border-bottom: 1px solid #000;
      background: #eee;
      padding: 6px 7px;
    }
    .bag-title,
    .group-title { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
    .bag-index {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 6mm;
      height: 6mm;
      border: 1px solid #000;
      background: #fff;
      font-weight: 700;
      line-height: 1;
    }
    .facts { text-align: right; white-space: nowrap; font-size: 10px; }
    .container-note {
      border-bottom: 1px solid #000;
      padding: 4px 7px;
      font-size: 10px;
    }
    .checklist { width: 100%; }
    .check-header,
    .check-row {
      display: grid;
      grid-template-columns: 10mm minmax(38mm, 1fr) 11mm 17mm 24mm 25mm;
      align-items: stretch;
    }
    .check-header.compact,
    .check-row.compact { grid-template-columns: 10mm minmax(54mm, 1fr) 11mm 17mm; }
    .check-header {
      border-bottom: 1px solid #000;
      background: #f4f4f4;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .check-header > div,
    .check-row > div {
      border-right: 1px solid #000;
      padding: 3px 4px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .check-header > div:last-child,
    .check-row > .last-cell { border-right: 0; }
    .check-row {
      border-bottom: 1px solid #000;
      break-inside: avoid;
      page-break-inside: avoid;
      min-height: 8mm;
    }
    .check-row:last-child { border-bottom: 0; }
    .box-cell { display: flex; align-items: center; justify-content: center; }
    .checkbox {
      width: 5mm;
      height: 5mm;
      border: 1.5px solid #000;
      background: #fff;
      display: inline-block;
    }
    .item-name { font-weight: 700; }
    .attention { font-weight: 700; text-transform: uppercase; }
    .check-note {
      grid-column: 2 / -1;
      border-top: 1px dotted #000;
      border-right: 0;
      font-size: 10px;
      min-height: 7mm;
    }
    .group {
      margin-left: calc(var(--print-depth, 1) * 4mm);
      border-top: 2px solid #000;
      border-left: 2px solid #000;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .group .group-heading { background: #fff; }
    .group .check-header { background: #fff; }
    .empty-line {
      min-height: 9mm;
      border-bottom: 1px solid #000;
      padding: 4px 7px;
      color: #000;
      font-style: italic;
    }
    @media screen {
      body { background: #ddd; }
      main { background: #fff; box-shadow: 0 0 0 1px #bbb; }
    }
    @media print {
      body { font-size: 10.5px; }
      main { max-width: none; padding: 0; }
      .bags { grid-template-columns: minmax(0, 1fr); gap: 7px; }
      .group { margin-left: calc(var(--print-depth, 1) * 3mm); }
      .overview thead { display: table-header-group; }
      a { color: #000; text-decoration: none; }
    }
    @page { margin: 10mm; }
  </style>
</head>
<body class="${includeLabels ? "print-with-labels" : "print-without-labels"}">
  <main>
    <header>
      <div>
        <h1>Чек-лист велоупаковки</h1>
        <div class="muted">Укладка: ${escapeHtml(layoutName)}</div>
      </div>
      <div class="muted">Сформировано: ${escapeHtml(generatedAt)}</div>
    </header>
    <section class="stats" aria-label="Сводка">
      <div class="stat"><strong>${escapeHtml(formatWeight(totalWeight))}</strong><span>общий вес</span></div>
      <div class="stat"><strong>${itemCount}</strong><span>вещей в укладке</span></div>
      <div class="stat optional-label"><strong>${missingCount}</strong><span>купить / найти</span></div>
    </section>
    ${renderOverview(targetState, rootContainerIds, { includeLabels })}
    <section class="bags">
      ${rootContainerIds.map((id, index) => renderPrintableContainer(targetState, id, {
        root: true,
        indexLabel: String(index + 1),
        depth: 0,
        includeLabels
      })).join("")}
    </section>
  </main>
</body>
</html>`;
}

function renderOverview(targetState, rootContainerIds, { includeLabels = true } = {}) {
  if (!rootContainerIds.length) return "";
  return `<table class="overview">
    <caption>Быстрый ориентир по сумкам</caption>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Сумка / место</th>
        <th>Вещей</th>
        <th>Вес</th>
        ${includeLabels ? `<th>Купить / найти</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${rootContainerIds.map((id, index) => renderOverviewRow(targetState, id, index + 1, { includeLabels })).join("")}
    </tbody>
  </table>`;
}

function renderOverviewRow(targetState, containerId, index, { includeLabels = true } = {}) {
  const container = targetState.containers?.[containerId];
  if (!container) return "";
  const attentionCount = countItemsByLocation(targetState, containerId, ATTENTION_LOCATIONS);
  return `<tr>
    <td class="num">${index}</td>
    <td>${escapeHtml(container.name)}${includeLabels && container.location ? `<br><span class="muted">${escapeHtml(container.location)}</span>` : ""}</td>
    <td>${countItemsInContainer(targetState, containerId)}</td>
    <td>${escapeHtml(formatWeight(containerWeight(targetState, containerId)))}</td>
    ${includeLabels ? `<td>${attentionCount || ""}</td>` : ""}
  </tr>`;
}

function renderPrintableContainer(targetState, containerId, { root = false, indexLabel = "", depth = 0, includeLabels = true } = {}) {
  const container = targetState.containers?.[containerId];
  if (!container) return "";
  const tag = root ? "article" : "section";
  const className = root ? "bag" : "group";
  const titleClass = root ? "bag-heading" : "group-heading";
  const headingLevel = root ? "h2" : "h3";
  const entriesHtml = renderContainerEntries(targetState, container, indexLabel, depth, { includeLabels });
  const facts = renderContainerFacts(targetState, containerId, container, { includeLabels });
  const note = printableNote(container);
  const depthStyle = root ? "" : ` style="--print-depth:${Math.min(Math.max(depth, 1), 6)}"`;

  return `<${tag} class="${className}"${depthStyle}>
    <div class="${titleClass}">
      <div class="${root ? "bag-title" : "group-title"}">
        ${indexLabel ? `<span class="bag-index">${escapeHtml(indexLabel)}</span>` : ""}
        <${headingLevel}>${escapeHtml(container.name)}</${headingLevel}>
      </div>
      <div class="facts">${facts}</div>
    </div>
    ${note ? `<div class="container-note">${escapeHtml(note)}</div>` : ""}
    <div class="checklist">
      ${renderChecklistHeader({ includeLabels })}
      ${entriesHtml || `<div class="empty-line">Пусто - можно вписать вручную.</div>`}
    </div>
  </${tag}>`;
}

function renderContainerEntries(targetState, container, indexLabel, depth, { includeLabels = true } = {}) {
  let childIndex = 0;
  return (container.order || []).map((entry) => {
    if (entry.type === "item") return renderPrintableItem(targetState, entry.id, { includeLabels });
    if (entry.type === "container") {
      childIndex += 1;
      const childLabel = indexLabel ? `${indexLabel}.${childIndex}` : String(childIndex);
      return renderPrintableContainer(targetState, entry.id, {
        root: false,
        indexLabel: childLabel,
        depth: depth + 1,
        includeLabels
      });
    }
    return "";
  }).join("");
}

function renderContainerFacts(targetState, containerId, container, { includeLabels = true } = {}) {
  const facts = [
    `${countItemsInContainer(targetState, containerId)} вещей`,
    formatWeight(containerWeight(targetState, containerId))
  ];
  if (Number(container.volume || 0) > 0) facts.push(`${container.volume} л`);
  if (includeLabels && container.location) facts.push(container.location);
  return facts.map((fact) => escapeHtml(fact)).join("<br>");
}

function renderChecklistHeader({ includeLabels = true } = {}) {
  return `<div class="check-header ${includeLabels ? "" : "compact"}" aria-hidden="true">
    <div>OK</div>
    <div>Вещь</div>
    <div>Кол.</div>
    <div>Вес</div>
    ${includeLabels ? `<div>Где</div><div>Категория</div>` : ""}
  </div>`;
}

function renderPrintableItem(targetState, itemId, { includeLabels = true } = {}) {
  const item = targetState.items?.[itemId];
  if (!item) return "";
  const quantity = itemQuantity(item);
  const weight = itemTotalWeight(item);
  const categories = itemCategories(item).join(", ");
  const location = item.location || "";
  const attention = ATTENTION_LOCATIONS.includes(location);
  const note = printableNote(item);

  return `<div class="check-row ${includeLabels ? "" : "compact"}">
    <div class="box-cell"><span class="checkbox"></span></div>
    <div class="item-name">${escapeHtml(item.name)}</div>
    <div>${quantity}</div>
    <div class="${includeLabels ? "" : "last-cell"}">${escapeHtml(formatWeight(weight))}</div>
    ${includeLabels ? `<div class="${attention ? "attention" : ""}">${escapeHtml(location)}</div><div class="last-cell">${escapeHtml(categories)}</div>` : ""}
    ${note ? `<div class="check-note">${escapeHtml(note)}</div>` : ""}
  </div>`;
}

function printableNote(entity) {
  const note = typeof entity?.note === "string" ? entity.note.trim() : "";
  const description = typeof entity?.description === "string" ? entity.description.trim() : "";
  if (note && description && note !== description) return `${note} / ${description}`;
  return note || description;
}
