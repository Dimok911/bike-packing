import { escapeHtml } from "../utils/html.js";

const ALLOWED = new Set("p div br strong em u s ul ol li blockquote h2 h3 pre code table caption thead tbody tfoot tr th td a".split(" "));
const DROP = new Set("script style iframe object embed svg math template noscript head meta link base form input textarea select button video audio source canvas".split(" "));
const BLOCKS = new Set("P DIV LI BLOCKQUOTE H2 H3 PRE CAPTION TR".split(" "));

// Parse in an inert template, then construct a fresh allowlisted tree. No source
// attributes, CSS, images, event handlers or executable elements enter the page.
export function sanitizeNoteHtml(source, documentRef = globalThis.document) {
  if (!documentRef?.createElement) return "";
  const input = documentRef.createElement("template");
  input.innerHTML = String(source || "");
  const output = documentRef.createElement("div");
  function copy(node, parent) {
    if (node.nodeType === 3) {
      if (!node.data.trim() && /^(TABLE|THEAD|TBODY|TFOOT|TR)$/.test(parent.nodeName)) return;
      parent.append(documentRef.createTextNode(node.data));
      return;
    }
    if (node.nodeType !== 1) return;
    const original = node.localName.toLowerCase();
    if (DROP.has(original)) return;
    const tag = ({ b: "strong", i: "em", strike: "s", h1: "h2", h4: "h3", h5: "h3", h6: "h3" })[original] || original;
    const target = ALLOWED.has(tag) ? documentRef.createElement(tag) : documentRef.createDocumentFragment();
    if (tag === "a" && node.hasAttribute("href")) {
      const href = node.getAttribute("href").trim();
      try {
        const url = new URL(href);
        if (["https:", "http:", "mailto:"].includes(url.protocol)) {
          target.setAttribute("href", url.href);
          target.setAttribute("target", "_blank");
          target.setAttribute("rel", "noopener noreferrer");
        }
      } catch { /* Relative and unsafe links become ordinary text. */ }
    }
    if (tag === "td" || tag === "th") {
      for (const key of ["colspan", "rowspan"]) {
        const value = Number(node.getAttribute(key));
        if (Number.isInteger(value) && value > 1) target.setAttribute(key, String(Math.min(value, 100)));
      }
    }
    let content = target;
    const weight = node.style?.fontWeight;
    const decoration = node.style?.textDecorationLine || node.style?.textDecoration || "";
    for (const [enabled, format] of [
      [tag !== "strong" && (weight === "bold" || Number(weight) >= 600), "strong"],
      [tag !== "em" && node.style?.fontStyle === "italic", "em"],
      [tag !== "u" && decoration.includes("underline"), "u"]
    ]) {
      if (enabled && !/^(table|thead|tbody|tfoot|tr)$/.test(tag)) {
        const wrapper = documentRef.createElement(format);
        content.append(wrapper);
        content = wrapper;
      }
    }
    for (const child of node.childNodes) copy(child, content);
    parent.append(target);
  }
  for (const child of input.content.childNodes) copy(child, output);
  return output.innerHTML;
}

export function plainNoteHtml(text) {
  return escapeHtml(String(text || "")).replace(/\r\n?/g, "\n").replaceAll("\n", "<br>");
}

// Virtual newlines and tabs preserve table boundaries in search, old clients,
// history and plain-text exports. Text-node offsets also drive search highlights.
export function noteTextMap(root) {
  let text = "";
  const spans = [];
  const newline = () => { if (text && !text.endsWith("\n")) text += "\n"; };
  const visit = (node) => {
    if (node.nodeType === 3) {
      spans.push({ node, start: text.length, end: text.length + node.data.length });
      text += node.data;
      return;
    }
    if (node.nodeName === "BR") { text += "\n"; return; }
    const block = BLOCKS.has(node.nodeName);
    if (block) newline();
    for (const child of node.childNodes) visit(child);
    if (node.nodeName === "TD" || node.nodeName === "TH") text += "\t";
    if (block) newline();
  };
  for (const child of root.childNodes) visit(child);
  const leading = text.length - text.trimStart().length;
  return { text: text.trim(), spans: spans.map((span) => ({ ...span, start: span.start - leading, end: span.end - leading })) };
}

export function readNoteFields(textarea) {
  const noteHtml = textarea?.richNoteEditor?.getHtml() || "";
  return { note: String(textarea?.value || ""), ...(noteHtml ? { noteHtml } : {}) };
}

export function applyNoteFields(record, textarea) {
  delete record.noteHtml;
  Object.assign(record, readNoteFields(textarea));
  record.note = record.note.trim();
}

export function loadNoteFields(textarea, record = {}) {
  if (textarea?.richNoteEditor) textarea.richNoteEditor.load(record?.note || "", record?.noteHtml || "");
  else if (textarea) textarea.value = record?.note || "";
}
