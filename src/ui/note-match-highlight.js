const highlightBindings = new WeakMap();

const TEXT_STYLE_PROPERTIES = [
  "direction",
  "boxSizing",
  "fontFamily",
  "fontFeatureSettings",
  "fontKerning",
  "fontSize",
  "fontStretch",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "overflowWrap",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "tabSize",
  "textAlign",
  "textIndent",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "wordSpacing"
];

export function noteMatchHighlightSegments(value, start, end) {
  const text = String(value || "");
  const safeStart = Math.max(0, Math.min(text.length, Number(start) || 0));
  const safeEnd = Math.max(safeStart, Math.min(text.length, Number(end) || 0));
  return {
    before: text.slice(0, safeStart),
    match: text.slice(safeStart, safeEnd),
    after: text.slice(safeEnd),
    start: safeStart,
    end: safeEnd
  };
}

function copyTextStyle(textarea, content, windowRef) {
  const computed = windowRef?.getComputedStyle?.(textarea);
  if (!computed) return;
  for (const property of TEXT_STYLE_PROPERTIES) {
    content.style[property] = computed[property];
  }
  content.style.borderTopWidth = computed.borderTopWidth;
  content.style.borderRightWidth = computed.borderRightWidth;
  content.style.borderBottomWidth = computed.borderBottomWidth;
  content.style.borderLeftWidth = computed.borderLeftWidth;
}

function createBinding(textarea, windowRef) {
  const documentRef = textarea?.ownerDocument;
  const field = textarea?.closest?.(".note-field");
  if (!documentRef?.createElement || !field?.append) return null;

  const layer = documentRef.createElement("div");
  layer.className = "note-search-match-highlight";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");

  const content = documentRef.createElement("div");
  content.className = "note-search-match-highlight-content";
  layer.append(content);
  field.append(layer);

  const syncGeometry = () => {
    const textareaRect = textarea.getBoundingClientRect?.();
    const fieldRect = field.getBoundingClientRect?.();
    const left = textareaRect && fieldRect
      ? Number(textareaRect.left) - Number(fieldRect.left)
      : Number(textarea.offsetLeft) || 0;
    const top = textareaRect && fieldRect
      ? Number(textareaRect.top) - Number(fieldRect.top)
      : Number(textarea.offsetTop) || 0;
    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.width = `${Math.max(0, Number(textareaRect?.width) || Number(textarea.offsetWidth) || 0)}px`;
    layer.style.height = `${Math.max(0, Number(textareaRect?.height) || Number(textarea.offsetHeight) || 0)}px`;
    content.style.width = `${Math.max(1, Number(textarea.offsetWidth) || Number(textarea.clientWidth) || 1)}px`;
    content.style.transform = `translate3d(0, ${-(Number(textarea.scrollTop) || 0)}px, 0)`;
    copyTextStyle(textarea, content, windowRef);
  };

  textarea.addEventListener?.("scroll", syncGeometry, { passive: true });
  const ResizeObserverCtor = windowRef?.ResizeObserver || globalThis.ResizeObserver;
  const observer = typeof ResizeObserverCtor === "function"
    ? new ResizeObserverCtor(syncGeometry)
    : null;
  observer?.observe?.(textarea);

  const binding = { content, layer, observer, syncGeometry };
  highlightBindings.set(textarea, binding);
  return binding;
}

export function clearNoteMatchHighlight(textarea) {
  const binding = highlightBindings.get(textarea);
  if (binding?.layer) binding.layer.hidden = true;
  textarea?.removeAttribute?.("data-note-search-match-start");
  textarea?.removeAttribute?.("data-note-search-match-end");
}

export function renderNoteMatchHighlight(textarea, start, end, {
  windowRef = textarea?.ownerDocument?.defaultView || globalThis.window
} = {}) {
  if (!textarea || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  const segments = noteMatchHighlightSegments(textarea.value, start, end);
  if (!segments.match) {
    clearNoteMatchHighlight(textarea);
    return false;
  }

  const binding = highlightBindings.get(textarea) || createBinding(textarea, windowRef);
  const documentRef = textarea.ownerDocument;
  if (!binding || !documentRef?.createTextNode) return false;

  const marker = documentRef.createElement("mark");
  marker.className = "note-search-match-marker";
  marker.textContent = segments.match;
  binding.content.replaceChildren(
    documentRef.createTextNode(segments.before),
    marker,
    documentRef.createTextNode(segments.after || "\u200b")
  );
  textarea.setAttribute?.("data-note-search-match-start", String(segments.start));
  textarea.setAttribute?.("data-note-search-match-end", String(segments.end));
  binding.layer.hidden = false;
  binding.syncGeometry();
  return true;
}
