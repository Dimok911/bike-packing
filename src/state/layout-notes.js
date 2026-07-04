export function normalizeLayoutNotes(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function applyLayoutNotes(layout, value) {
  if (!layout || typeof layout !== "object") return false;
  const next = normalizeLayoutNotes(value);
  const previous = normalizeLayoutNotes(layout.notes);
  if (next === previous) return false;
  if (next) {
    layout.notes = next;
  } else {
    delete layout.notes;
  }
  return true;
}
