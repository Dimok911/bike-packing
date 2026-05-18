export function safeSetLocalStorage(key, value, { silent = false } = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!silent) console.warn("[bike-packing] localStorage write skipped", key, error);
    return false;
  }
}
