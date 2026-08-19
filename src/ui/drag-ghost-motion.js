export function createDragGhostMotion({
  applyPosition,
  responsiveness = 1,
  settleDistance = 0.5,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frame) => cancelAnimationFrame(frame)
} = {}) {
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let frame = null;

  const applyTarget = () => {
    currentX = targetX;
    currentY = targetY;
    applyPosition?.(currentX, currentY);
  };

  const tick = () => {
    frame = null;
    if (responsiveness >= 1) {
      applyTarget();
      return;
    }

    currentX += (targetX - currentX) * responsiveness;
    currentY += (targetY - currentY) * responsiveness;
    applyPosition?.(currentX, currentY);
    if (Math.abs(targetX - currentX) < settleDistance && Math.abs(targetY - currentY) < settleDistance) {
      applyTarget();
      return;
    }
    frame = requestFrame(tick);
  };

  const move = (left, top, { immediate = false } = {}) => {
    targetX = left;
    targetY = top;
    if (immediate) {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      applyTarget();
      return;
    }
    if (frame === null) frame = requestFrame(tick);
  };

  const stop = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };

  return { move, stop };
}
