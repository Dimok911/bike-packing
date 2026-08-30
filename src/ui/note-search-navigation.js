import { searchQueryTerms } from "../state/catalog-search.js";

function normalizedQuery(value) {
  return String(value || "").trim();
}

function termMatches(haystack, term) {
  const matches = [];
  let offset = 0;
  while (offset <= haystack.length - term.length) {
    const start = haystack.indexOf(term, offset);
    if (start < 0) break;
    matches.push({ start, end: start + term.length });
    offset = start + Math.max(term.length, 1);
  }
  return matches;
}

export function findNoteSearchMatches(value, rawQuery) {
  const text = String(value || "");
  const query = normalizedQuery(rawQuery);
  const terms = searchQueryTerms(query);
  if (!text || !terms.length) return [];

  const haystack = text.toLocaleLowerCase();
  if (!terms.every((term) => haystack.includes(term))) return [];

  const phrase = terms.join(" ");
  const phraseMatches = termMatches(haystack, phrase);
  if (phraseMatches.length) return phraseMatches;

  return terms
    .flatMap((term) => termMatches(haystack, term))
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((match, index, matches) => index === 0 || match.start !== matches[index - 1].start || match.end !== matches[index - 1].end);
}

function copyTextareaStyle(source, target, windowRef) {
  const computed = windowRef?.getComputedStyle?.(source);
  if (!computed) return;
  [
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRightWidth",
    "borderTopWidth",
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
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "tabSize",
    "textIndent",
    "textTransform",
    "wordBreak",
    "wordSpacing"
  ].forEach((property) => {
    target.style[property] = computed[property];
  });
}

function matchOffsetTop(textarea, start, end, windowRef) {
  const documentRef = textarea?.ownerDocument;
  if (!documentRef?.body || !documentRef.createElement) return null;
  const mirror = documentRef.createElement("div");
  const marker = documentRef.createElement("span");
  copyTextareaStyle(textarea, mirror, windowRef);
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    width: `${Math.max(1, textarea.clientWidth || 1)}px`
  });
  mirror.append(documentRef.createTextNode(String(textarea.value || "").slice(0, start)));
  marker.textContent = String(textarea.value || "").slice(start, end) || "\u200b";
  mirror.append(marker);
  documentRef.body.append(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return Number.isFinite(top) ? top : null;
}

export function centerNoteFieldInDialog(textarea) {
  const field = textarea?.closest?.(".note-field");
  const dialog = textarea?.closest?.("dialog");
  const dialogCard = textarea?.closest?.(".dialog-card");
  const scrollHost = Number(dialogCard?.scrollHeight) > Number(dialogCard?.clientHeight) + 1
    ? dialogCard
    : dialog;
  const fieldRect = field?.getBoundingClientRect?.();
  const hostRect = scrollHost?.getBoundingClientRect?.();
  if (!fieldRect || !hostRect || !Number(scrollHost?.clientHeight)) {
    field?.scrollIntoView?.({ block: "center", behavior: "auto" });
    return Boolean(field);
  }
  const fieldCenter = Number(fieldRect.top) + Number(fieldRect.height) / 2;
  const hostCenter = Number(hostRect.top) + Number(scrollHost.clientHeight) / 2;
  const maximum = Math.max(0, Number(scrollHost.scrollHeight) - Number(scrollHost.clientHeight));
  const top = Math.max(0, Math.min(maximum, (Number(scrollHost.scrollTop) || 0) + fieldCenter - hostCenter));
  scrollHost.scrollTop = top;
  return true;
}

export function revealNoteSearchMatch({ textarea, start, end, scrollField = false } = {}) {
  if (!textarea || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  textarea.focus?.({ preventScroll: true });
  textarea.setSelectionRange?.(start, end);
  textarea.classList?.add("note-search-match-active");
  const windowRef = textarea.ownerDocument?.defaultView || globalThis.window;
  const top = matchOffsetTop(textarea, start, end, windowRef);
  if (top !== null) {
    const computed = windowRef?.getComputedStyle?.(textarea);
    const lineHeight = Number.parseFloat(computed?.lineHeight) || (Number.parseFloat(computed?.fontSize) || 16) * 1.35;
    textarea.scrollTop = Math.max(0, top - (textarea.clientHeight || 0) / 2 + lineHeight);
  }
  if (scrollField) {
    centerNoteFieldInDialog(textarea);
    windowRef?.requestAnimationFrame?.(() => centerNoteFieldInDialog(textarea));
  }
  return true;
}

export function createNoteSearchNavigator({
  container,
  nextButton,
  previousButton,
  queryLabel,
  requestAnimationFrame = (callback) => callback(),
  revealMatch = revealNoteSearchMatch,
  status,
  t = (key) => key,
  textarea
} = {}) {
  let query = "";
  let matches = [];
  let currentIndex = 0;

  const render = () => {
    const visible = matches.length > 0;
    if (container) {
      container.hidden = !visible;
      container.classList?.toggle("single-match", matches.length === 1);
    }
    textarea?.classList?.toggle("note-search-match-active", visible);
    if (!visible) return;
    if (status) status.textContent = t("noteSearch.status", {
      current: currentIndex + 1,
      total: matches.length
    });
    if (queryLabel) queryLabel.textContent = query;
    if (previousButton) previousButton.disabled = matches.length < 2;
    if (nextButton) nextButton.disabled = matches.length < 2;
  };

  const revealCurrent = ({ scrollField = false } = {}) => {
    const match = matches[currentIndex];
    if (!match) return;
    requestAnimationFrame(() => revealMatch({
      textarea,
      start: match.start,
      end: match.end,
      scrollField
    }));
  };

  const refresh = ({ keepNearest = false, scrollField = false } = {}) => {
    const previousStart = matches[currentIndex]?.start ?? 0;
    matches = findNoteSearchMatches(textarea?.value, query);
    if (!matches.length) currentIndex = 0;
    else if (keepNearest) {
      currentIndex = matches.reduce((best, match, index) => (
        Math.abs(match.start - previousStart) < Math.abs(matches[best].start - previousStart) ? index : best
      ), 0);
    } else currentIndex = 0;
    render();
    revealCurrent({ scrollField });
  };

  const move = (step) => {
    if (matches.length < 2) return;
    currentIndex = (currentIndex + step + matches.length) % matches.length;
    render();
    revealCurrent();
  };

  previousButton?.addEventListener?.("click", (event) => {
    event.preventDefault?.();
    move(-1);
  });
  nextButton?.addEventListener?.("click", (event) => {
    event.preventDefault?.();
    move(1);
  });
  textarea?.addEventListener?.("input", () => {
    if (query) refresh({ keepNearest: true });
  });

  return {
    clear() {
      query = "";
      matches = [];
      currentIndex = 0;
      render();
    },
    open(rawQuery) {
      query = normalizedQuery(rawQuery);
      refresh({ scrollField: true });
      return matches.length;
    }
  };
}
