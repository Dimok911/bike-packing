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
  const linkPanel = doc.createElement("div");
  linkPanel.className = "rich-note-link-panel";
  linkPanel.hidden = true;
  linkPanel.setAttribute("role", "group");
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
  toolbar.after(linkPanel);
  anchor.after(editor);
  let active = false;
  let savedRange = null;
  let linkDraft = null;

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
    if (disabled) { linkPanel.hidden = true; linkPanel.replaceChildren(); linkDraft = null; }
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
  function openLinkPanel() {
    if (textarea.disabled || textarea.readOnly) return;
    const selection = doc.getSelection();
    const range = active && selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)
      ? selection.getRangeAt(0).cloneRange() : savedRange?.cloneRange();
    const node = range?.startContainer;
    const existing = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.("a[href]");
    const existingLink = active && existing && editor.contains(existing) && existing.contains(range.endContainer) ? existing : null;
    linkDraft = { range, start: textarea.selectionStart, end: textarea.selectionEnd, existingLink };
    linkPanel.replaceChildren();
    linkPanel.setAttribute("aria-label", tr("Link", "Ссылка"));
    const makeField = (caption, key, value) => {
      const label = doc.createElement("label");
      label.textContent = caption;
      const input = doc.createElement("input");
      input.dataset.noteLinkField = key;
      input.value = value;
      label.append(input); linkPanel.append(label);
      return input;
    };
    const textInput = makeField(tr("Link text", "Текст ссылки"), "text", existingLink?.textContent || (active ? range?.toString() || "" : textarea.value.slice(linkDraft.start, linkDraft.end)));
    const urlInput = makeField(tr("Address", "Адрес"), "url", existingLink?.getAttribute("href") || "");
    urlInput.inputMode = "url"; urlInput.autocapitalize = "off"; urlInput.spellcheck = false;
    urlInput.placeholder = "https://example.com";
    urlInput.addEventListener("input", () => urlInput.setCustomValidity(""));
    const actions = doc.createElement("div"); actions.className = "rich-note-link-actions";
    const cancel = doc.createElement("button"); cancel.type = "button"; cancel.className = "ghost";
    cancel.textContent = tr("Cancel", "Отмена");
    cancel.addEventListener("click", () => {
      linkPanel.hidden = true; linkPanel.replaceChildren(); linkDraft = null;
      if (active) restoreRange(); else textarea.focus({ preventScroll: true });
    });
    const apply = doc.createElement("button"); apply.type = "button";
    apply.textContent = tr("Insert link", "Вставить ссылку"); apply.dataset.noteLinkApply = "";
    const commitLink = () => {
      if (textarea.disabled || textarea.readOnly || !linkDraft) return;
      let url;
      try {
        const address = urlInput.value.trim();
        if (!address) throw new Error("empty");
        url = new URL(address.startsWith("//") ? `https:${address}` : /^[a-z][a-z\d+.-]*:/i.test(address) ? address : `https://${address}`);
        if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        urlInput.setCustomValidity(tr("Enter a website address or mailto link.", "Введите адрес сайта или ссылку mailto."));
        urlInput.reportValidity(); return;
      }
      const draft = linkDraft;
      const link = doc.createElement("a");
      link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = textInput.value.trim() || url.href;
      linkPanel.hidden = true; linkPanel.replaceChildren(); linkDraft = null;
      if (!active) textarea.setSelectionRange(draft.start, draft.end);
      activate();
      if (draft.existingLink?.isConnected) {
        draft.range = doc.createRange(); draft.range.selectNode(draft.existingLink);
      }
      if (draft.range && editor.contains(draft.range.commonAncestorContainer)) {
        const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(draft.range);
      }
      insert(link.outerHTML);
    };
    apply.addEventListener("click", commitLink);
    for (const input of [textInput, urlInput]) input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commitLink(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel.click(); }
    });
    actions.append(cancel, apply); linkPanel.append(actions);
    linkPanel.hidden = false;
    (textInput.value ? urlInput : textInput).focus();
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
    const linkButton = doc.createElement("button");
    linkButton.type = "button"; linkButton.className = "ghost";
    linkButton.textContent = tr("Link", "Ссылка"); linkButton.dataset.noteCommand = "link";
    linkButton.addEventListener("mousedown", (event) => event.preventDefault());
    linkButton.addEventListener("click", openLinkPanel);
    toolbar.append(linkButton);
  }
  editor.addEventListener("input", () => sync());
  editor.addEventListener("beforeinput", clearMatch);
  editor.addEventListener("paste", paste);
  textarea.addEventListener("paste", paste);
  function openLink(event) {
    if (event.button !== 0 && event.button !== 1) return;
    const link = event.target.closest?.("a[href]");
    if (!link || !editor.contains(link)) return;
    event.preventDefault();
    // Dragging across link text must still allow selecting and editing it.
    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed && selection.containsNode(link, true)) return;
    try {
      const url = new URL(link.getAttribute("href"));
      if (["https:", "http:", "mailto:"].includes(url.protocol)) {
        doc.defaultView.open(url.href, "_blank", "noopener,noreferrer");
      }
    } catch { /* An invalid address must never navigate the editor. */ }
  }
  editor.addEventListener("click", openLink);
  editor.addEventListener("auxclick", openLink);
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
      linkPanel.hidden = true; linkPanel.replaceChildren(); linkDraft = null;
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
