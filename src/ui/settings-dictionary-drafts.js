// Unsaved input is UI draft, not an accepted dictionary mutation. Keep it
// through a background render, but never move it to another account/owner.
const scopes = new WeakMap();
const selectors = '#locationInput, #categoryInput, [data-dictionary-edit-input]';
function keyFor(input) {
  if (input.id === "locationInput" || input.id === "categoryInput") return input.id;
  const type = input.dataset.dictionaryEditInput;
  if (!["location", "category"].includes(type)) return null;
  const button = input.closest(".dictionary-chip")?.querySelector(`[data-save-${type}]`);
  return button ? JSON.stringify([type, button.getAttribute(`data-save-${type}`)]) : null;
}

export function captureSettingsDictionaryDrafts(root, scope) {
  if (!scope || scopes.get(root) !== scope) return [];
  return [...root.querySelectorAll(selectors)].map(input => ({ key: keyFor(input), value: input.value,
    focused: input.ownerDocument.activeElement === input, start: input.selectionStart, end: input.selectionEnd,
    direction: input.selectionDirection })).filter(entry => entry.key !== null);
}

export function restoreSettingsDictionaryDrafts(root, scope, drafts) {
  scopes.set(root, scope);
  if (!scope) return;
  for (const input of root.querySelectorAll(selectors)) {
    const saved = drafts.find(entry => entry.key === keyFor(input));
    if (!saved) continue;
    input.value = saved.value;
    if (saved.focused) {
      input.focus({ preventScroll: true });
      if (saved.start !== null && saved.end !== null) input.setSelectionRange(saved.start, saved.end, saved.direction || "none");
    }
  }
}
