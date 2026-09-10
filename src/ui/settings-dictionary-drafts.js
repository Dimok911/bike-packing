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
  return [...root.querySelectorAll(selectors)].map(input => ({ key: keyFor(input), node: input, value: input.value,
    focused: input.ownerDocument.activeElement === input, start: input.selectionStart, end: input.selectionEnd,
    direction: input.selectionDirection })).filter(entry => entry.key !== null);
}

// Keep inputs AND their ancestors connected throughout the render. Removing
// and reattaching the same field can still cancel WebKit's native text input.
// Buttons are replaced and rebound to the current owner, never reused.
export function renderSettingsWithDictionaryDrafts(root, html, drafts) {
  const fresh = root.ownerDocument.createElement("div"); fresh.innerHTML = html;
  const grid = root.querySelector(":scope > .settings-grid"), nextGrid = fresh.querySelector(":scope > .settings-grid");
  const panels = ["location", "category"].map(type => {
    const input = root.querySelector(`#${type}Input`), nextInput = fresh.querySelector(`#${type}Input`);
    return { type, input, nextInput, panel: input?.closest(".settings-panel"), next: nextInput?.closest(".settings-panel") };
  });
  if (!grid || !nextGrid || panels.some(row => !row.panel || !row.next || !drafts.some(entry => entry.node === row.input))) {
    root.innerHTML = html; return;
  }
  for (const { type, input, nextInput, panel, next } of panels) {
    panel.querySelector(".dictionary-heading").replaceWith(next.querySelector(".dictionary-heading"));
    const list = panel.querySelector(".dictionary-list"), nextList = next.querySelector(".dictionary-list");
    const edit = list.querySelector("[data-dictionary-edit-input]"), nextEdit = nextList.querySelector("[data-dictionary-edit-input]");
    const keep = edit && nextEdit && keyFor(edit) === keyFor(nextEdit) && drafts.some(entry => entry.node === edit)
      ? edit.closest(".dictionary-chip") : null;
    if (keep) {
      const nextChip = nextEdit.closest(".dictionary-chip");
      for (const action of ["save", "cancel"]) keep.querySelector(`[data-${action}-${type}]`).replaceWith(nextChip.querySelector(`[data-${action}-${type}]`));
      for (const child of [...list.childNodes]) if (child !== keep) child.remove();
      let after = false;
      for (const child of [...nextList.children]) {
        if (child === nextChip) { after = true; continue; }
        list.insertBefore(child, after ? null : keep);
      }
    } else list.replaceChildren(...nextList.childNodes);
    input.placeholder = nextInput.placeholder;
    panel.querySelector(`#${type}Add`).replaceWith(next.querySelector(`#${type}Add`));
  }
  // Profile/offline/transport controls are independent of the dictionary grid.
  for (const child of [...root.childNodes]) if (child !== grid) child.remove();
  for (const child of [...fresh.childNodes]) if (child !== nextGrid) root.insertBefore(child, grid);
}

export function restoreSettingsDictionaryDrafts(root, scope, drafts) {
  scopes.set(root, scope);
  if (!scope) return;
  for (const input of root.querySelectorAll(selectors)) {
    const saved = drafts.find(entry => entry.key === keyFor(input));
    if (!saved) continue;
    if (input === saved.node) {
      // Do not overwrite selection/value being changed by a native input
      // operation. The retained node already carries both.
      if (saved.focused) input.focus({ preventScroll: true });
      continue;
    }
    input.value = saved.value;
    if (saved.focused) {
      input.focus({ preventScroll: true });
      if (saved.start !== null && saved.end !== null) input.setSelectionRange(saved.start, saved.end, saved.direction || "none");
    }
  }
}
