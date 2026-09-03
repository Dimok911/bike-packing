const MOVE_ARROW_CLASS = "comparison-move-arrow-overlay";
const MOVE_BUTTON_SELECTOR = "[data-compare-show-move-link]";

function rectCenter(rect) {
  return {
    x: Number(rect?.left || 0) + Number(rect?.width || 0) / 2,
    y: Number(rect?.top || 0) + Number(rect?.height || 0) / 2
  };
}

export function comparisonMoveArrowGeometry(sourceRect, targetRect, {
  boardRect = { left: 0, top: 0 },
  scrollLeft = 0,
  scrollTop = 0
} = {}) {
  const sourceCenter = rectCenter(sourceRect);
  const targetCenter = rectCenter(targetRect);
  const horizontal = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
  let sourcePoint;
  let targetPoint;

  if (horizontal) {
    const targetIsRight = targetCenter.x >= sourceCenter.x;
    sourcePoint = {
      x: targetIsRight ? Number(sourceRect.right) : Number(sourceRect.left),
      y: sourceCenter.y
    };
    targetPoint = {
      x: targetIsRight ? Number(targetRect.left) : Number(targetRect.right),
      y: targetCenter.y
    };
  } else {
    const targetIsBelow = targetCenter.y >= sourceCenter.y;
    sourcePoint = {
      x: sourceCenter.x,
      y: targetIsBelow ? Number(sourceRect.bottom) : Number(sourceRect.top)
    };
    targetPoint = {
      x: targetCenter.x,
      y: targetIsBelow ? Number(targetRect.top) : Number(targetRect.bottom)
    };
  }

  const offsetX = Number(scrollLeft) - Number(boardRect.left || 0);
  const offsetY = Number(scrollTop) - Number(boardRect.top || 0);
  const start = { x: sourcePoint.x + offsetX, y: sourcePoint.y + offsetY };
  const end = { x: targetPoint.x + offsetX, y: targetPoint.y + offsetY };
  const controlA = horizontal
    ? { x: start.x + (end.x - start.x) * 0.42, y: start.y }
    : { x: start.x, y: start.y + (end.y - start.y) * 0.42 };
  const controlB = horizontal
    ? { x: start.x + (end.x - start.x) * 0.58, y: end.y }
    : { x: end.x, y: start.y + (end.y - start.y) * 0.58 };

  return {
    start,
    end,
    path: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`
  };
}

function comparisonCards(root, entityKey) {
  return [...(root?.querySelectorAll?.("[data-comparison-entity]") || [])]
    .filter((candidate) => candidate.dataset.comparisonEntity === entityKey);
}

export function clearLayoutComparisonMoveLink(root) {
  root?.querySelector?.(`.${MOVE_ARROW_CLASS}`)?.remove();
  root?.querySelectorAll?.(".comparison-linked-highlight").forEach((candidate) => {
    candidate.classList.remove("comparison-linked-highlight");
  });
  root?.querySelectorAll?.(MOVE_BUTTON_SELECTOR).forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  const board = root?.querySelector?.(".comparison-board");
  if (board) delete board.dataset.comparisonMoveLink;
}

function renderLayoutComparisonMoveLink(root, entityKey) {
  const board = root?.querySelector?.(".comparison-board");
  if (!board || !entityKey) return false;
  const cards = comparisonCards(root, entityKey);
  const source = cards.find((card) => card.dataset.comparisonVariant === "source-ghost");
  const target = cards.find((card) => card.dataset.comparisonVariant === "target");
  if (!source || !target) return false;

  clearLayoutComparisonMoveLink(root);
  source.classList.add("comparison-linked-highlight");
  target.classList.add("comparison-linked-highlight");
  cards.forEach((card) => {
    card.querySelector?.(MOVE_BUTTON_SELECTOR)?.setAttribute("aria-pressed", "true");
  });

  const width = Math.max(Number(board.scrollWidth || 0), Number(board.clientWidth || 0), 1);
  const height = Math.max(Number(board.scrollHeight || 0), Number(board.clientHeight || 0), 1);
  const geometry = comparisonMoveArrowGeometry(
    source.getBoundingClientRect(),
    target.getBoundingClientRect(),
    {
      boardRect: board.getBoundingClientRect(),
      scrollLeft: board.scrollLeft,
      scrollTop: board.scrollTop
    }
  );
  const documentRef = board.ownerDocument;
  const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add(MOVE_ARROW_CLASS);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <defs>
      <marker id="comparison-move-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    </defs>
    <path class="comparison-move-arrow-path" d="${geometry.path}" marker-end="url(#comparison-move-arrow-head)"></path>
  `;
  board.appendChild(svg);
  board.dataset.comparisonMoveLink = entityKey;
  return true;
}

export function refreshLayoutComparisonMoveLink(root) {
  const entityKey = root?.querySelector?.(".comparison-board")?.dataset?.comparisonMoveLink || "";
  return entityKey ? renderLayoutComparisonMoveLink(root, entityKey) : false;
}

export function toggleLayoutComparisonMoveLink(root, entityKey) {
  const board = root?.querySelector?.(".comparison-board");
  if (!board || !entityKey) return false;
  if (board.dataset.comparisonMoveLink === entityKey) {
    clearLayoutComparisonMoveLink(root);
    return false;
  }
  return renderLayoutComparisonMoveLink(root, entityKey);
}
