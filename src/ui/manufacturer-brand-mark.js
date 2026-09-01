export function manufacturerBrandDefinition(brands = [], name = "") {
  const normalized = String(name || "").trim().toLocaleLowerCase();
  return (Array.isArray(brands) ? brands : []).find((entry) => (
    String(entry?.catalogBrand || entry?.name || "").trim().toLocaleLowerCase() === normalized
  )) || null;
}

export function renderManufacturerBrandMark({
  brand,
  brands = [],
  className = "",
  escapeHtml = (value) => String(value || "")
} = {}) {
  const definition = manufacturerBrandDefinition(brands, brand);
  const name = String(definition?.name || brand || "").trim();
  const classes = ["manufacturer-brand-mark", className].filter(Boolean).join(" ");
  const logoUrl = String(definition?.logoUrl || "").trim();
  return logoUrl
    ? `<span class="${escapeHtml(classes)}"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" /></span>`
    : `<span class="${escapeHtml(`${classes} manufacturer-brand-mark-text`)}">${escapeHtml(name)}</span>`;
}
