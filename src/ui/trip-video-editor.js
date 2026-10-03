import { escapeHtml } from "../utils/html.js";
import { layoutVideos, normalizeLayoutVideoUrl } from "../state/layout-media.js";
import { bindLayoutMediaReorder } from "./layout-media-reorder.js";
import { bindTripVideoCards, renderTripVideoCard } from "./trip-video-cards.js";

// The trip editor reuses photo-grid sorting and the existing trip video player.
export function createTripVideoEditor({ host, dialog, localText, onChange, canEdit, confirmRemove }) {
  const list = host.querySelector("[data-layout-videos]");
  const input = host.querySelector("[data-layout-video]");
  const add = host.querySelector("[data-layout-add-video]");
  let videos = [], session = 0, player = null;
  const name = index => videos[index]?.caption || localText(`Video ${index + 1}`, `Видео ${index + 1}`);
  const snapshot = () => {
    const pending = input.value.trim();
    return [...videos.map(video => ({ ...video })), ...(pending ? [{ url: pending, caption: "" }] : [])];
  };
  const reorder = bindLayoutMediaReorder({ list, dialog, canMove: canEdit,
    handleSelector: "[data-layout-video-drag]", indexAttribute: "data-layout-video-index",
    onMove(from, to) {
      const video = videos.splice(from, 1)[0];
      if (!video) return;
      videos.splice(to, 0, video);
      render(); onChange();
      list.querySelector(`[data-layout-video-index="${to}"] [data-layout-video-drag]`)?.focus({ preventScroll: true });
    }
  });
  function render() {
    reorder.cancel(); player?.destroy();
    list.innerHTML = videos.map((video, index) => `<div class="layout-media-photo trip-video-editor-card" data-layout-video-index="${index}">
      <div class="layout-media-preview">${renderTripVideoCard(video, index, localText, { showCaption: false })}
        <button type="button" class="layout-media-drag-handle" data-layout-video-drag aria-label="${escapeHtml(localText(`Reorder video ${index + 1}`, `Изменить порядок видео ${index + 1}`))}" title="${escapeHtml(localText("Drag to reorder; use arrow keys when focused", "Перетащите; с клавиатуры — стрелки"))}">⠿</button>
        <button type="button" class="layout-media-remove" data-layout-remove-video aria-label="${escapeHtml(localText(`Remove video ${index + 1}`, `Удалить видео ${index + 1}`))}">×</button>
      </div>
      <div class="layout-media-caption">
        <button type="button" data-layout-video-caption-edit title="${escapeHtml(video.caption || localText("Add caption", "Добавить подпись"))}">${escapeHtml(video.caption || localText("Add caption", "Добавить подпись"))}</button>
        <input hidden data-layout-video-caption aria-label="${escapeHtml(localText(`Video caption ${index + 1}`, `Подпись видео ${index + 1}`))}" maxlength="2000" value="${escapeHtml(video.caption)}" />
      </div>
    </div>`).join("");
    player = bindTripVideoCards(list, localText);
  }
  function validate() {
    const url = normalizeLayoutVideoUrl(input.value);
    input.setCustomValidity(input.value.trim() && !url ? localText("Enter an HTTP or HTTPS video link.", "Введите ссылку на видео, начинающуюся с http:// или https://.") : "");
    return input.reportValidity();
  }
  function append() {
    if (!canEdit() || !validate()) return false;
    const url = normalizeLayoutVideoUrl(input.value);
    if (!url) return true;
    videos.push({ url, caption: "" }); input.value = "";
    render(); onChange();
    return true;
  }
  input.addEventListener("input", () => { input.setCustomValidity(""); onChange(); });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault(); event.stopPropagation(); append();
  });
  add.addEventListener("click", () => {
    if (append() && videos.length) list.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "auto" });
  });
  const finishCaption = field => {
    const index = Number(field.closest("[data-layout-video-index]").dataset.layoutVideoIndex);
    const button = field.parentElement.querySelector("button");
    button.textContent = field.value || localText("Add caption", "Добавить подпись");
    button.title = button.textContent;
    const link = field.closest("[data-layout-video-index]").querySelector("a");
    link.setAttribute("aria-label", name(index));
    field.hidden = true; button.hidden = false;
  };
  list.addEventListener("input", event => {
    if (!event.target.matches("[data-layout-video-caption]")) return;
    const index = Number(event.target.closest("[data-layout-video-index]").dataset.layoutVideoIndex);
    videos[index].caption = event.target.value; onChange();
  });
  list.addEventListener("focusout", event => {
    if (event.target.matches("[data-layout-video-caption]")) finishCaption(event.target);
  });
  list.addEventListener("keydown", event => {
    if (!event.target.matches("[data-layout-video-caption]") || !["Enter", "Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const button = event.target.parentElement.querySelector("button");
    finishCaption(event.target); button.focus();
  });
  list.addEventListener("click", async event => {
    const edit = event.target.closest("[data-layout-video-caption-edit]");
    if (edit) {
      const field = edit.parentElement.querySelector("input");
      edit.hidden = true; field.hidden = false; field.focus(); field.select(); return;
    }
    const remove = event.target.closest("[data-layout-remove-video]");
    if (!remove || !canEdit()) return;
    const index = Number(remove.closest("[data-layout-video-index]").dataset.layoutVideoIndex);
    const video = videos[index], token = session;
    if (!video || !await confirmRemove(name(index)) || token !== session || !canEdit()) return;
    const current = videos.indexOf(video);
    if (current < 0) return;
    videos.splice(current, 1); render(); onChange();
  });
  return {
    open(media) {
      session++; videos = layoutVideos(media); input.value = ""; input.setCustomValidity("");
      input.setAttribute("aria-label", localText("Video link", "Ссылка на видео"));
      add.textContent = localText("Add video", "Добавить видео"); render();
    },
    snapshot,
    validate: append,
    close() { session++; reorder.cancel(); player?.destroy(); player = null; videos = []; input.value = ""; list.innerHTML = ""; }
  };
}
