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
import { currentDocumentLanguage } from "../utils/language.js";
import { formatWeight } from "../utils/weight.js";

const PRINT_COLUMN_CAPACITY = 40;
const PRINT_COLUMN_CAPACITY_WITH_LABELS = 34;
const PRINT_MAX_DEPTH = 6;

const ATTENTION_LOCATIONS = ["Надо купить", "Не знаю где", "Need to buy", "Unknown location"];

function printText(en, ru) {
  return currentDocumentLanguage() === "en" ? en : ru;
}

export function askPrintLabelsChoice(askConfirmDialog, { createPrintTarget = null } = {}) {
  if (typeof askConfirmDialog !== "function") {
    return Promise.resolve({ includeLabels: true, printTarget: createPrintTarget?.() || null });
  }
  const english = currentDocumentLanguage() === "en";
  let printTarget = null;
  const preparePrintTarget = () => {
    printTarget = createPrintTarget?.() || null;
  };
  return askConfirmDialog({
    title: english ? "Print list" : "Печать списка",
    text: english
      ? "Print storage-place and category labels? Labels make the list easier to navigate on the trip; without labels, the list is more compact."
      : "Печатать метки мест хранения и категорий? С метками проще ориентироваться в поездке, без меток список компактнее.",
    okText: english ? "With labels" : "С метками",
    cancelText: english ? "Without labels" : "Без меток",
    onOk: preparePrintTarget,
    onCancel: preparePrintTarget
  }).then((includeLabels) => includeLabels === null
    ? { cancelled: true, includeLabels: true, printTarget: null }
    : { includeLabels, printTarget });
}

export function createPrintWindowTarget() {
  const printWindow = window.open("", "_blank", "popup=no,width=920,height=1200");
  if (printWindow) {
    writePrintPlaceholder(printWindow);
  }
  return printWindow;
}

export function printHtmlDocument(html, { printTarget = null } = {}) {
  const printWindow = printTarget && !printTarget.closed
    ? printTarget
    : createPrintWindowTarget();
  if (printWindow) {
    try {
      writePrintHtml(printWindow, html);
      schedulePrintWindow(printWindow);
      return true;
    } catch {
      try {
        printWindow.close();
      } catch {
        // Ignore close errors and fall back to iframe printing.
      }
    }
  }
  printHtmlInFrame(html);
  return true;
}

function printHtmlInFrame(html) {
  const frame = document.createElement("iframe");
  frame.title = "PDF print";
  frame.style.position = "absolute";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.width = "210mm";
  frame.style.minHeight = "297mm";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  frame.style.pointerEvents = "none";
  frame.style.zIndex = "0";
  frame.addEventListener("load", () => {
    const targetWindow = frame.contentWindow;
    if (!targetWindow) {
      frame.remove();
      return;
    }
    const cleanup = () => window.setTimeout(() => frame.remove(), 3000);
    targetWindow.addEventListener("afterprint", cleanup, { once: true });
    waitForPrintableLayout(targetWindow).then(() => {
      const doc = targetWindow.document;
      const height = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        1123
      );
      frame.style.height = `${height}px`;
      targetWindow.focus();
      targetWindow.print();
      window.setTimeout(cleanup, 120000);
    });
  }, { once: true });
  document.body.appendChild(frame);
  frame.srcdoc = html;
}

function writePrintPlaceholder(printWindow) {
  try {
    const language = currentDocumentLanguage();
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${printText("Print", "Печать")}</title>
  <style>
    body { margin: 24px; font-family: Arial, Helvetica, sans-serif; color: #111; }
  </style>
</head>
<body>${printText("Preparing the printable list...", "Готовлю печатный список...")}</body>
</html>`);
    printWindow.document.close();
  } catch {
    // A pre-opened print target is best-effort; the caller will fall back if it cannot be written.
  }
}

function writePrintHtml(printWindow, html) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function schedulePrintWindow(printWindow) {
  const print = () => {
    waitForPrintableLayout(printWindow).then(() => {
      printWindow.focus();
      printWindow.print();
    });
  };
  printWindow.addEventListener("afterprint", () => {
    window.setTimeout(() => printWindow.close(), 250);
  }, { once: true });
  if (printWindow.document.readyState === "complete") {
    print();
  } else {
    printWindow.addEventListener("load", print, { once: true });
  }
}

function waitForPrintableLayout(targetWindow) {
  return new Promise((resolve) => {
    const doc = targetWindow.document;
    const fontsReady = doc.fonts?.ready
      ? doc.fonts.ready.catch(() => null)
      : Promise.resolve();
    fontsReady.then(() => {
      targetWindow.requestAnimationFrame(() => {
        targetWindow.requestAnimationFrame(resolve);
      });
    });
  });
}

export function buildPrintableDocument(targetState, { layoutId = targetState.activeLayoutId, includeGeneratedRoots = false, includeLabels = true } = {}) {
  migrateContainerOrder(targetState);
  const language = currentDocumentLanguage();
  const layout = targetState.layouts?.[layoutId] || targetState.layouts?.[targetState.activeLayoutId] || Object.values(targetState.layouts || {})[0];
  const rootContainerIds = getVisibleLayoutRootIds(targetState, layout, { includeGenerated: includeGeneratedRoots });
  const generatedAt = new Date().toLocaleString(language === "en" ? "en-US" : "ru-RU");
  const totalWeight = rootContainerIds.reduce((sum, id) => sum + containerWeight(targetState, id), 0);
  const itemCount = rootContainerIds.reduce((sum, id) => sum + countItemsInContainer(targetState, id), 0);
  const missingCount = rootContainerIds.reduce((sum, id) => sum + countItemsByLocation(targetState, id, ATTENTION_LOCATIONS), 0);
  const layoutName = layout?.name || printText("Layout", "Укладка");

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(layoutName)} - ${escapeHtml(printText("printable checklist", "печатный чек-лист"))}</title>
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
    .bags { display: block; }
    .bag + .bag { margin-top: 8px; }
    .bag {
      border: 2px solid #000;
      break-inside: auto;
      page-break-inside: auto;
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
    .checklist-flow { width: 100%; }
    .bag-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      width: 100%;
    }
    .bag-column {
      min-width: 0;
      border-right: 1px solid #000;
    }
    .bag-column + .bag-column { border-left: 0; }
    .bag-column:last-child { border-right: 0; }
    .flow-depth-item {
      border-left: 1px solid #000;
      margin-left: calc(3mm + var(--print-depth, 0) * 3mm);
    }
    .flow-depth-item .item-name { padding-left: 3px; }
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
    .flow-depth-item:last-child { border-bottom: 1px solid #000; }
    .bag-column .check-header,
    .bag-column .check-row {
      grid-template-columns: 7mm minmax(18mm, 1fr) 8mm 12mm 15mm 17mm;
      font-size: 9px;
      line-height: 1.18;
    }
    .bag-column .check-header.compact,
    .bag-column .check-row.compact {
      grid-template-columns: 7mm minmax(32mm, 1fr) 8mm 12mm;
    }
    .bag-column .check-header > div,
    .bag-column .check-row > div {
      padding: 2px 3px;
    }
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
      break-inside: auto;
      page-break-inside: auto;
    }
    .bag-heading,
    .group-heading,
    .check-header {
      break-after: avoid;
      page-break-after: avoid;
    }
    .group .group-heading { background: #fff; }
    .group .check-header { background: #fff; }
    .group-flow-heading {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: start;
      border-top: 2px solid #000;
      border-bottom: 1px solid #000;
      border-left: 2px solid #000;
      background: #f0f0f0;
      padding: 4px 5px;
      margin-left: calc(var(--print-depth, 0) * 3mm);
      break-after: avoid;
      page-break-after: avoid;
    }
    .group-flow-title {
      display: flex;
      gap: 5px;
      align-items: baseline;
      min-width: 0;
    }
    .flow-note {
      border-left: 2px solid #000;
      margin-left: calc(3mm + var(--print-depth, 0) * 3mm);
    }
    .flow-block-depth {
      border-left: 1px solid #000;
      margin-left: calc(3mm + var(--print-depth, 0) * 3mm);
    }
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
      .bags {
        break-before: page;
        page-break-before: always;
      }
      .bag + .bag { margin-top: 7px; }
      .bag {
        break-after: page;
        page-break-after: always;
      }
      .bag:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .bag-column > .check-row,
      .bag-column > .group,
      .bag-column > .group-flow-heading,
      .bag-column > .empty-line {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .group { margin-left: calc(var(--print-depth, 1) * 3mm); }
      .overview thead { display: table-header-group; }
      a { color: #000; text-decoration: none; }
    }
    @page { size: A4 portrait; margin: 10mm; }
  </style>
</head>
<body class="${includeLabels ? "print-with-labels" : "print-without-labels"}">
  <main>
    <header>
      <div>
        <h1>${escapeHtml(printText("Bikepacking checklist", "Чек-лист велоупаковки"))}</h1>
        <div class="muted">${escapeHtml(printText("Layout", "Укладка"))}: ${escapeHtml(layoutName)}</div>
      </div>
      <div class="muted">${escapeHtml(printText("Generated", "Сформировано"))}: ${escapeHtml(generatedAt)}</div>
    </header>
    <section class="stats" aria-label="${escapeHtml(printText("Summary", "Сводка"))}">
      <div class="stat"><strong>${escapeHtml(formatWeight(totalWeight))}</strong><span>${escapeHtml(printText("total weight", "общий вес"))}</span></div>
      <div class="stat"><strong>${itemCount}</strong><span>${escapeHtml(printText("items in layout", "вещей в укладке"))}</span></div>
      <div class="stat optional-label"><strong>${missingCount}</strong><span>${escapeHtml(printText("buy / find", "купить / найти"))}</span></div>
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
    <caption>${escapeHtml(printText("Bag overview", "Быстрый ориентир по сумкам"))}</caption>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>${escapeHtml(printText("Bag / place", "Сумка / место"))}</th>
        <th>${escapeHtml(printText("Items", "Вещей"))}</th>
        <th>${escapeHtml(printText("Weight", "Вес"))}</th>
        ${includeLabels ? `<th>${escapeHtml(printText("Buy / find", "Купить / найти"))}</th>` : ""}
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
  if (root) {
    return renderPrintableRootContainer(targetState, containerId, {
      indexLabel,
      includeLabels
    });
  }
  const tag = root ? "article" : "section";
  const className = root ? "bag" : "group";
  const titleClass = root ? "bag-heading" : "group-heading";
  const headingLevel = root ? "h2" : "h3";
  const entryBlocks = renderContainerEntryBlocks(targetState, container, indexLabel, depth, { includeLabels });
  const entriesHtml = entryBlocks.map((block) => block.html).join("");
  const facts = renderContainerFacts(targetState, containerId, container, { includeLabels });
  const note = printableNote(container);
  const depthStyle = root ? "" : ` style="--print-depth:${Math.min(Math.max(depth, 1), 6)}"`;
  const checklistHtml = `${renderChecklistHeader({ includeLabels })}
    <div class="checklist-flow">
      ${entriesHtml || `<div class="empty-line">${escapeHtml(printText("Empty — you can write items in by hand.", "Пусто — можно вписать вручную."))}</div>`}
    </div>`;

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
      ${checklistHtml}
    </div>
  </${tag}>`;
}

function renderPrintableRootContainer(targetState, containerId, { indexLabel = "", includeLabels = true } = {}) {
  const container = targetState.containers?.[containerId];
  if (!container) return "";
  const entryBlocks = renderContainerFlowBlocks(targetState, container, indexLabel, 0, { includeLabels });
  const pages = splitPrintableBlocksIntoPages(entryBlocks, { includeLabels });
  const note = printableNote(container);

  return pages.map((page, pageIndex) => {
    const continued = pageIndex > 0;
    const title = continued ? `${container.name} (${printText("continued", "продолжение")})` : container.name;
    const pageLabel = pages.length > 1 ? ` · ${printText("page", "лист")} ${pageIndex + 1}/${pages.length}` : "";
    return `<article class="bag">
      <div class="bag-heading">
        <div class="bag-title">
          ${indexLabel ? `<span class="bag-index">${escapeHtml(indexLabel)}</span>` : ""}
          <h2>${escapeHtml(title)}${pageLabel ? `<span class="muted">${escapeHtml(pageLabel)}</span>` : ""}</h2>
        </div>
        <div class="facts">${renderContainerFacts(targetState, containerId, container, { includeLabels })}</div>
      </div>
      ${note && !continued ? `<div class="container-note">${escapeHtml(note)}</div>` : ""}
      <div class="checklist">
        ${renderRootChecklistPage(page, { includeLabels })}
      </div>
    </article>`;
  }).join("");
}

function renderRootChecklistPage(page, { includeLabels = true } = {}) {
  const renderColumn = (blocks) => `${renderChecklistHeader({ includeLabels })}${blocks.map((block) => block.html).join("") || `<div class="empty-line">${escapeHtml(printText("Empty — you can write items in by hand.", "Пусто — можно вписать вручную."))}</div>`}`;
  return `<div class="bag-columns">
    <div class="bag-column">${renderColumn(page[0])}</div>
    <div class="bag-column">${renderColumn(page[1])}</div>
  </div>`;
}

function splitPrintableBlocksIntoPages(blocks, { includeLabels = true } = {}) {
  const pages = [];
  const columnCapacity = includeLabels ? PRINT_COLUMN_CAPACITY_WITH_LABELS : PRINT_COLUMN_CAPACITY;
  let page = [[], []];
  let weights = [0, 0];
  let columnIndex = 0;

  if (!blocks.length) return [[[], []]];
  blocks.forEach((block) => {
    const requiredWeight = block.keepWithNextWeight || block.weight;
    if (weights[columnIndex] > 0 && weights[columnIndex] + requiredWeight > columnCapacity) {
      ({ page, weights, columnIndex } = advancePrintableColumn(pages, page, weights, columnIndex));
    }
    page[columnIndex].push(block);
    weights[columnIndex] += block.weight;
  });
  if (page[0].length || page[1].length) pages.push(page);
  return pages.length ? pages : [[[], []]];
}

function advancePrintableColumn(pages, page, weights, columnIndex) {
  if (columnIndex === 0) {
    return { page, weights, columnIndex: 1 };
  }
  pages.push(page);
  return { page: [[], []], weights: [0, 0], columnIndex: 0 };
}

function renderContainerFlowBlocks(targetState, container, indexLabel, depth, { includeLabels = true } = {}) {
  let childIndex = 0;
  const blocks = [];
  (container.order || []).forEach((entry) => {
    if (entry.type === "item") {
      const item = targetState.items?.[entry.id];
      blocks.push({
        html: renderPrintableItem(targetState, entry.id, { includeLabels, depth }),
        weight: printableItemBlockWeight(item, { includeLabels })
      });
      return;
    }
    if (entry.type === "container") {
      childIndex += 1;
      const childContainer = targetState.containers?.[entry.id];
      if (!childContainer) return;
      const childLabel = indexLabel ? `${indexLabel}.${childIndex}` : String(childIndex);
      const childNote = printableNote(childContainer);
      const childBlocks = renderContainerFlowBlocks(targetState, childContainer, childLabel, depth + 1, { includeLabels });
      const emptyBlock = {
        html: `<div class="empty-line flow-block-depth"${printDepthStyle(depth + 1)}>${escapeHtml(printText("Empty — you can write items in by hand.", "Пусто — можно вписать вручную."))}</div>`,
        weight: 1
      };
      const noteWeight = childNote ? printableNoteBlockWeight(childNote, { includeLabels }) : 0;
      const firstContentWeight = childBlocks[0]?.keepWithNextWeight || childBlocks[0]?.weight || emptyBlock.weight;
      blocks.push({
        html: renderPrintableFlowContainerHeading(targetState, entry.id, childLabel, depth + 1, { includeLabels }),
        weight: 2.4,
        keepWithNextWeight: 2.4 + noteWeight + firstContentWeight
      });
      if (childNote) {
        blocks.push({
          html: `<div class="container-note flow-note"${printDepthStyle(depth + 1)}>${escapeHtml(childNote)}</div>`,
          weight: noteWeight
        });
      }
      if (childBlocks.length) {
        blocks.push(...childBlocks);
      } else {
        blocks.push(emptyBlock);
      }
    }
  });
  return blocks;
}

function renderPrintableFlowContainerHeading(targetState, containerId, indexLabel, depth, { includeLabels = true } = {}) {
  const container = targetState.containers?.[containerId];
  if (!container) return "";
  return `<div class="group-flow-heading"${printDepthStyle(depth)}>
    <div class="group-flow-title">
      ${indexLabel ? `<span class="bag-index">${escapeHtml(indexLabel)}</span>` : ""}
      <h3>${escapeHtml(container.name)}</h3>
    </div>
    <div class="facts">${renderContainerFacts(targetState, containerId, container, { includeLabels })}</div>
  </div>`;
}

function printDepthStyle(depth) {
  const value = Math.min(Math.max(Number(depth) || 0, 0), PRINT_MAX_DEPTH);
  return value ? ` style="--print-depth:${value}"` : "";
}

function renderContainerEntryBlocks(targetState, container, indexLabel, depth, { includeLabels = true } = {}) {
  let childIndex = 0;
  return (container.order || []).map((entry) => {
    if (entry.type === "item") {
      return {
        html: renderPrintableItem(targetState, entry.id, { includeLabels }),
        weight: printableItemBlockWeight(targetState.items?.[entry.id], { includeLabels })
      };
    }
    if (entry.type === "container") {
      childIndex += 1;
      const childLabel = indexLabel ? `${indexLabel}.${childIndex}` : String(childIndex);
      return {
        html: renderPrintableContainer(targetState, entry.id, {
          root: false,
          indexLabel: childLabel,
          depth: depth + 1,
          includeLabels
        }),
        weight: printableContainerBlockWeight(targetState, entry.id)
      };
    }
    return { html: "", weight: 0 };
  }).filter((block) => block.html);
}

function printableItemBlockWeight(item, { includeLabels = true } = {}) {
  if (!item) return 1;
  const note = printableNote(item);
  const nameLength = String(item.name || "").length;
  const labelLength = includeLabels
    ? String(item.location || "").length + itemCategories(item).join(", ").length
    : 0;
  return 1.1 +
    Math.ceil(nameLength / 28) * 0.42 +
    (includeLabels ? Math.ceil(labelLength / 18) * 0.32 : 0) +
    (note ? printableNoteBlockWeight(note, { includeLabels }) : 0);
}

function printableNoteBlockWeight(note, { includeLabels = true } = {}) {
  const textLength = String(note || "").length;
  return 0.8 + Math.ceil(textLength / (includeLabels ? 34 : 52)) * 0.35;
}

function printableContainerBlockWeight(targetState, containerId) {
  const container = targetState.containers?.[containerId];
  if (!container) return 1;
  const entryCount = (container.order || []).length;
  const nestedCount = (container.order || []).filter((entry) => entry.type === "container").length;
  return 1.8 + entryCount * 1.1 + nestedCount * 0.8;
}

function renderContainerFacts(targetState, containerId, container, { includeLabels = true } = {}) {
  const facts = [
    `${countItemsInContainer(targetState, containerId)} ${printText("items", "вещей")}`,
    formatWeight(containerWeight(targetState, containerId))
  ];
  if (Number(container.volume || 0) > 0) facts.push(`${container.volume} ${printText("L", "л")}`);
  if (includeLabels && container.location) facts.push(container.location);
  return facts.map((fact) => escapeHtml(fact)).join("<br>");
}

function renderChecklistHeader({ includeLabels = true } = {}) {
  return `<div class="check-header ${includeLabels ? "" : "compact"}" aria-hidden="true">
    <div>OK</div>
    <div>${escapeHtml(printText("Item", "Вещь"))}</div>
    <div>${escapeHtml(printText("Qty", "Кол."))}</div>
    <div>${escapeHtml(printText("Weight", "Вес"))}</div>
    ${includeLabels ? `<div>${escapeHtml(printText("Where", "Где"))}</div><div>${escapeHtml(printText("Category", "Категория"))}</div>` : ""}
  </div>`;
}

function renderPrintableItem(targetState, itemId, { includeLabels = true, depth = 0 } = {}) {
  const item = targetState.items?.[itemId];
  if (!item) return "";
  const quantity = itemQuantity(item);
  const weight = itemTotalWeight(item);
  const categories = itemCategories(item).join(", ");
  const location = item.location || "";
  const attention = ATTENTION_LOCATIONS.includes(location);
  const note = printableNote(item);

  const depthValue = Math.min(Math.max(depth, 0), PRINT_MAX_DEPTH);
  const depthClass = depthValue ? " flow-depth-item" : "";
  const depthStyle = depthValue ? ` style="--print-depth:${depthValue}"` : "";

  return `<div class="check-row ${includeLabels ? "" : "compact"}${depthClass}"${depthStyle}>
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
