function normalizePosition(position = {}) {
  return {
    x: Math.max(0, Number(position.x) || 0),
    y: Math.max(0, Number(position.y) || 0)
  };
}

export function createViewScrollMemory({
  readPosition = () => ({ x: 0, y: 0 }),
  schedule = (callback) => callback(),
  writePosition = () => {}
} = {}) {
  const positions = new Map();
  let restoreToken = 0;

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
    const token = ++restoreToken;
    schedule(() => {
      if (token !== restoreToken) return;
      writePosition({ ...position });
    });
    return { ...position };
  };

  const cancelPendingRestore = () => {
    restoreToken += 1;
  };

  return {
    cancelPendingRestore,
    remember,
    restore
  };
}
