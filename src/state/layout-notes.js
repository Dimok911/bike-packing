export function normalizeLayoutNotes(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function applyLayoutNotes(layout, value, html = "") {
  if (!layout || typeof layout !== "object") return false;
  const next = normalizeLayoutNotes(value);
  const previous = normalizeLayoutNotes(layout.notes);
  const nextHtml = next ? String(html || "") : "";
  if (next === previous && nextHtml === String(layout.notesHtml || "")) return false;
  if (nextHtml) layout.notesHtml = nextHtml;
  else delete layout.notesHtml;
  if (next) {
    layout.notes = next;
  } else {
    delete layout.notes;
  }
  return true;
}
