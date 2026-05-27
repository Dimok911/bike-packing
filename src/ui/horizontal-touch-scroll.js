export function bindHorizontalTouchScroll(board) {
  if (!board || board.dataset.touchScrollBound === "true") return;
  board.dataset.touchScrollBound = "true";
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let horizontalScroll = false;
  let suppressClickUntil = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let momentumFrame = null;

  const stopMomentum = () => {
    if (!momentumFrame) return;
    cancelAnimationFrame(momentumFrame);
    momentumFrame = null;
  };

  const clampScrollLeft = (value) => {
    const max = Math.max(0, board.scrollWidth - board.clientWidth);
    return Math.max(0, Math.min(max, value));
  };

  const startMomentum = () => {
    stopMomentum();
    if (!horizontalScroll || Math.abs(velocityX) < 0.08) return;
    let velocity = velocityX;
    let previousTime = performance.now();
    const step = (time) => {
      const elapsed = Math.min(32, time - previousTime);
      previousTime = time;
      const nextLeft = clampScrollLeft(board.scrollLeft - velocity * elapsed);
      const hitEdge = nextLeft === 0 || nextLeft >= Math.max(0, board.scrollWidth - board.clientWidth);
      board.scrollLeft = nextLeft;
      velocity *= Math.pow(0.94, elapsed / 16);
      if (hitEdge) velocity *= 0.35;
      if (Math.abs(velocity) < 0.015) {
        momentumFrame = null;
        return;
      }
      momentumFrame = requestAnimationFrame(step);
    };
    momentumFrame = requestAnimationFrame(step);
  };

  board.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    stopMomentum();
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = board.scrollLeft;
    horizontalScroll = false;
    lastX = touch.clientX;
    lastTime = performance.now();
    velocityX = 0;
  }, { passive: true });

  board.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (!horizontalScroll) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      horizontalScroll = true;
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - lastTime);
    velocityX = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = now;
    board.scrollLeft = clampScrollLeft(startLeft - dx);
    suppressClickUntil = Date.now() + 350;
  }, { passive: false });

  board.addEventListener("touchend", startMomentum, { passive: true });
  board.addEventListener("touchcancel", stopMomentum, { passive: true });

  board.addEventListener("click", (event) => {
    if (Date.now() <= suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}
