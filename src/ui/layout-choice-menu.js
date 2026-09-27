import { escapeHtml } from "../utils/html.js";

const menus = new WeakMap();

// The native select remains the state/change contract; this view adds a count column.
export function renderLayoutChoiceMenu(select, entries, language = "ru") {
  if (!select) return;
  if (!menus.has(select)) menus.set(select, createMenu(select));
  menus.get(select).render(entries, language);
}

function createMenu(select) {
  const root = document.createElement("div");
  root.className = "layout-choice-menu";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "layout-choice-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const list = document.createElement("div");
  list.id = select.id + "-choices";
  list.className = "layout-choice-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  trigger.setAttribute("aria-controls", list.id);
  root.append(trigger, list);
  select.after(root);
  select.classList.add("layout-choice-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  let metadata = new Map();
  let language = "ru";
  let active = -1;
  let search = "";
  let searchedAt = 0;
  const options = () => [...select.options];
  const rows = () => [...list.children];
  const cell = option => {
    const meta = metadata.get(option?.value);
    const count = Number(meta?.count) || 0;
    return '<span class="layout-choice-name">' + escapeHtml(meta?.label || option?.textContent || "") + '</span>' +
      '<span class="layout-trip-count' + (count ? ' has-trips' : '') + '"' +
      (count ? ' title="' + escapeHtml(meta.description) + '" aria-label="' + escapeHtml(meta.description) + '"' : ' aria-hidden="true"') +
      '>' + (count || "") + '</span>';
  };
  function close() {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
  }
  function highlight(index) {
    active = index;
    rows().forEach((row, i) => row.classList.toggle("is-highlighted", i === index));
    if (rows()[index]) {
      trigger.setAttribute("aria-activedescendant", rows()[index].id);
      const row = rows()[index];
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
  }
  function open() {
    if (select.disabled) return;
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    highlight(Math.max(0, select.selectedIndex));
  }
  function choose(index) {
    const option = options()[index];
    if (!option || option.disabled) return;
    select.value = option.value;
    close();
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
    trigger.focus({ preventScroll: true });
  }
  function sync() {
    const label = language === "en" ? "Layout" : "Укладка";
    trigger.disabled = select.disabled;
    trigger.title = select.title;
    trigger.setAttribute("aria-label", label + ": " + (select.selectedOptions[0]?.textContent || ""));
    list.setAttribute("aria-label", label);
    trigger.innerHTML = cell(select.selectedOptions[0]) + '<span aria-hidden="true" class="layout-choice-chevron">⌄</span>';
    trigger.dataset.kind = select.selectedOptions[0]?.className.replace("select-option-", "") || "";
    list.innerHTML = options().map((option, index) =>
      '<div role="option" id="' + list.id + '-' + index + '" data-index="' + index + '" data-kind="' +
      escapeHtml(option.className.replace("select-option-", "")) + '" aria-selected="' + (index === select.selectedIndex) +
      '" aria-disabled="' + option.disabled + '">' + cell(option) + '</div>').join("");
    if (!list.hidden) highlight(select.selectedIndex);
  }
  trigger.addEventListener("click", event => {
    event.preventDefault();
    if (list.hidden) open(); else close();
  });
  // Keep combobox focus until the option click is handled. Touch scrolling stays native.
  list.addEventListener("mousedown", event => event.preventDefault());
  list.addEventListener("click", event => {
    const row = event.target.closest("[data-index]");
    if (row) { event.preventDefault(); choose(Number(row.dataset.index)); }
  });
  trigger.addEventListener("keydown", event => {
    const opts = options();
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") { close(); return; }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) open(); else choose(active);
      return;
    }
    const enabled = opts.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabled.length) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) open();
      const position = enabled.indexOf(active);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, position + (event.key === "ArrowDown" ? 1 : -1)));
      highlight(enabled[next]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search = Date.now() - searchedAt > 700 ? event.key : search + event.key;
      searchedAt = Date.now();
      const found = enabled.find(index => (metadata.get(opts[index].value)?.label || opts[index].textContent).toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
      if (found !== undefined) { if (list.hidden) open(); highlight(found); }
    }
  });
  document.addEventListener("pointerdown", event => { if (!root.contains(event.target)) close(); });
  root.addEventListener("focusout", event => { if (!root.contains(event.relatedTarget)) close(); });
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, { attributes: true, childList: true, subtree: true, attributeFilter: ["disabled", "title", "class"] });
  return { render(entries, nextLanguage) {
    metadata = new Map(entries.map(entry => [String(entry[0]), entry[4]]));
    language = nextLanguage;
    sync();
  } };
}
