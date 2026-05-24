export function normalizeContainerColor(value) {
  return String(value || "").trim();
}

export function parseContainerDimensionInput(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 10) / 10;
}

export function normalizeContainerDimensions(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    width: parseContainerDimensionInput(source.width),
    height: parseContainerDimensionInput(source.height),
    depth: parseContainerDimensionInput(source.depth)
  };
}

export function hasContainerDimensions(value) {
  const dimensions = normalizeContainerDimensions(value);
  return Boolean(dimensions.width || dimensions.height || dimensions.depth);
}
