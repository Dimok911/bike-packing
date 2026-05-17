export function sharedListIdFromUrl(href, { listParam, legacyListParam = "shared" } = {}) {
  try {
    const url = new URL(href);
    return String(url.searchParams.get(listParam) || url.searchParams.get(legacyListParam) || "").trim();
  } catch {
    return "";
  }
}

export function sharedLayoutIdFromUrl(href, { layoutParam, legacyLayoutParam = "layout" } = {}) {
  try {
    const url = new URL(href);
    return String(url.searchParams.get(layoutParam) || url.searchParams.get(legacyLayoutParam) || "").trim();
  } catch {
    return "";
  }
}

export function buildSharedListUrlFromHref(href, { listParam, layoutParam, listId, layoutId } = {}) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(listParam, String(listId || "").trim());
  const normalizedLayoutId = String(layoutId || "").trim();
  if (normalizedLayoutId) url.searchParams.set(layoutParam, normalizedLayoutId);
  return url.toString();
}
