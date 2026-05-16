export function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("[bike-packing] localStorage write skipped", key, error);
    return false;
  }
}
