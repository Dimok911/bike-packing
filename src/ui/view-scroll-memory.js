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
    // position in the same task, before Safari can begin a touch gesture or
    // paint an intermediate document position.
    writePosition({ ...position });
    return { ...position };
  };

  return {
    remember,
    restore
  };
}
