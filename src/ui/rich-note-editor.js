import { currentDocumentLanguage } from "../utils/language.js";
import { sanitizeNoteHtml, plainNoteHtml, noteTextMap } from "./rich-note-content.js";

const tr = (en, ru) => currentDocumentLanguage() === "en" ? en : ru;

export function createRichNoteEditor(textarea) {
  if (!textarea || textarea.richNoteEditor) return textarea?.richNoteEditor;
  const doc = textarea.ownerDocument;
  const field = textarea.closest(".note-field");
  const toolbar = doc.createElement("div");
  toolbar.className = "rich-note-toolbar";
  toolbar.setAttribute("role", "toolbar");
  const editor = doc.createElement("div");
  editor.id = `${textarea.id}Rich`;
  editor.className = "rich-note-editor";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.setAttribute("aria-labelledby", `${textarea.id}Label`);
  editor.spellcheck = true;
  editor.hidden = true;
  const anchor = textarea.closest(".desktop-input-layout") || textarea;
  anchor.before(toolbar);
  anchor.after(editor);
  let active = false;
  let savedRange = null;

  function clearMatch() {
    const marks = editor.querySelectorAll("mark[data-note-match]");
    marks.forEach((mark) => mark.replaceWith(...mark.childNodes));
    if (marks.length) editor.normalize();
  }
  function emit() {
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  }
  function sync(notify = true) {
    if (!active) return;
    textarea.value = noteTextMap(editor).text;
    if (notify) emit();
  }
  function readonly() {
    const disabled = textarea.disabled || textarea.readOnly;
    editor.contentEditable = String(!disabled);
    editor.setAttribute("aria-readonly", String(disabled));
    toolbar.hidden = disabled;
  }
  function showRich() {
    active = true;
    textarea.hidden = true;
    editor.hidden = false;
    field.classList.add("rich-note-active");
    field.querySelector("label")?.setAttribute("for", editor.id);
    readonly();
  }
  function restoreRange() {
    const current = doc.getSelection();
    if (current?.rangeCount && editor.contains(current.anchorNode) && editor.contains(current.focusNode)) {
      savedRange = current.getRangeAt(0).cloneRange();
    }
    editor.focus({ preventScroll: true });
    const selection = doc.getSelection();
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      selection.removeAllRanges(); selection.addRange(savedRange);
    } else {
      const range = doc.createRange(); range.selectNodeContents(editor); range.collapse(false);
      selection.removeAllRanges(); selection.addRange(range);
    }
  }
  function activate() {
    if (active) { restoreRange(); return; }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    editor.textContent = textarea.value;
    showRich();
    editor.focus({ preventScroll: true });
    const range = doc.createRange();
    if (editor.firstChild) {
      range.setStart(editor.firstChild, start); range.setEnd(editor.firstChild, end);
    } else range.selectNodeContents(editor);
    doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
    savedRange = range.cloneRange();
  }
  function insert(html) {
    activate();
    // Native insertion keeps the browser's undo history and caret behavior.
    if (!doc.execCommand("insertHTML", false, html)) {
      const selection = doc.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
    }
    sync();
  }
  function paste(event) {
    if (textarea.disabled || textarea.readOnly) return;
    const html = event.clipboardData?.getData("text/html") || "";
    const text = event.clipboardData?.getData("text/plain") || "";
    if (!active && !html) return;
    event.preventDefault();
    clearMatch();
    insert(html ? sanitizeNoteHtml(html, doc) : plainNoteHtml(text));
  }
  function renderToolbar() {
    toolbar.replaceChildren();
    toolbar.setAttribute("aria-label", tr("Note formatting", "Форматирование заметки"));
    for (const [command, label, title] of [
      ["bold", "B", tr("Bold", "Жирный")],
      ["italic", "I", tr("Italic", "Курсив")],
      ["underline", "U", tr("Underline", "Подчеркнуть")],
      ["insertUnorderedList", "•", tr("Bulleted list", "Маркированный список")],
      ["insertOrderedList", "1.", tr("Numbered list", "Нумерованный список")]
    ]) {
      const button = doc.createElement("button");
      button.type = "button"; button.className = "ghost";
      button.textContent = label; button.title = title; button.setAttribute("aria-label", title);
      button.dataset.noteCommand = command;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => { if (textarea.disabled || textarea.readOnly) return; activate(); doc.execCommand(command, false); sync(); });
      toolbar.append(button);
    }
  }
  editor.addEventListener("input", () => sync());
  editor.addEventListener("beforeinput", clearMatch);
  editor.addEventListener("paste", paste);
  textarea.addEventListener("paste", paste);
  editor.addEventListener("drop", (event) => {
    event.preventDefault();
    if (textarea.disabled || textarea.readOnly) return;
    const html = event.dataTransfer?.getData("text/html");
    insert(html ? sanitizeNoteHtml(html, doc) : plainNoteHtml(event.dataTransfer?.getData("text/plain")));
  });
  doc.addEventListener("selectionchange", () => {
    const selection = doc.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
  });
  new MutationObserver(readonly).observe(textarea, { attributes: true, attributeFilter: ["disabled", "readonly"] });
  const api = {
    element: editor,
    get active() { return active; },
    clearMatch,
    load(note, html) {
      active = false; savedRange = null;
      textarea.value = String(note);
      textarea.hidden = false; editor.hidden = true;
      field.classList.remove("rich-note-active");
      field.querySelector("label")?.setAttribute("for", textarea.id);
      editor.innerHTML = sanitizeNoteHtml(html, doc);
      // Respect plain-text edits made by an older client instead of reviving stale HTML.
      if (html && noteTextMap(editor).text === String(note).trim()) showRich();
      renderToolbar(); readonly();
    },
    getHtml() {
      if (!active) return "";
      sync(false);
      return textarea.value ? sanitizeNoteHtml(editor.innerHTML, doc) : "";
    },
    reveal(start, end) {
      if (!active || doc.activeElement === editor) return false;
      clearMatch();
      const { spans } = noteTextMap(editor);
      const marks = [];
      for (const span of spans) {
        const from = Math.max(start, span.start), to = Math.min(end, span.end);
        if (from >= to) continue;
        const range = doc.createRange();
        range.setStart(span.node, from - span.start); range.setEnd(span.node, to - span.start);
        const mark = doc.createElement("mark"); mark.dataset.noteMatch = "";
        range.surroundContents(mark); marks.push(mark);
      }
      marks[0]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
  };
  textarea.richNoteEditor = api;
  api.load(textarea.value, "");
  return api;
}
