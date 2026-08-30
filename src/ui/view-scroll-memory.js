function normalizePosition(position = {}) {
  return {
    x: Math.max(0, Number(position.x) || 0),
    y: Math.max(0, Number(position.y) || 0)
  };
}

export function createViewScrollMemory({
  readPosition = () => ({ x: 0, y: 0 }),
  writePosition = () => {}
} = {}) {
  const positions = new Map();

  const remember = (view) => {
    const key = String(view || "");
    if (!key) return null;
    const position = normalizePosition(readPosition());
    positions.set(key, position);
    return { ...position };
  };

  const restore = (view, { defaultPosition = { x: 0, y: 0 } } = {}) => {
    const key = String(view || "");
    const position = normalizePosition(positions.get(key) || defaultPosition);
    // The target view is already visible when restore is called. Apply its
    // position before Safari can paint an intermediate document position or
    // begin handling the next touch gesture.
    writePosition({ ...position });
    return { ...position };
  };

  return {
    remember,
    restore
  };
}

export function createReachableViewScrollRestore({
  createObserver = (callback) => typeof ResizeObserver === "function" ? new ResizeObserver(callback) : null,
  clearTimer = (timer) => clearTimeout(timer),
  maxWaitMs = 5000,
  readCurrentView = () => "",
  readPosition = () => ({ x: 0, y: 0 }),
  scheduleTimer = (callback, delay) => setTimeout(callback, delay),
  writePosition = () => {}
} = {}) {
  let observer = null;
  let timer = null;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    observer?.disconnect?.();
    observer = null;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const restore = (view, position, target) => {
    cancel();
    const key = String(view || "");
    const desired = normalizePosition(position);
    if (!key || !target || (!desired.x && !desired.y)) return false;
    const activeGeneration = generation;

    const apply = () => {
      if (generation !== activeGeneration) return false;
      if (String(readCurrentView() || "") !== key) {
        cancel();
        return false;
      }
      const current = normalizePosition(readPosition());
      if (Math.abs(current.x - desired.x) <= 1 && Math.abs(current.y - desired.y) <= 1) {
        cancel();
        return true;
      }
      writePosition({ ...desired });
      const restored = normalizePosition(readPosition());
      if (Math.abs(restored.x - desired.x) <= 1 && Math.abs(restored.y - desired.y) <= 1) {
        cancel();
        return true;
      }
      return false;
    };

    if (apply()) return true;
    observer = createObserver(apply);
    observer?.observe?.(target);
    timer = scheduleTimer(() => {
      if (generation === activeGeneration) cancel();
    }, maxWaitMs);
    return Boolean(observer);
  };

  return { cancel, restore };
}
