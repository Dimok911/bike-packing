import { escapeHtml } from "../utils/html.js";
import { layoutMediaSnapshot, layoutMediaSignature, normalizeLayoutVideoUrl } from "../state/layout-media.js";

export function createLayoutMediaEditor({ dialog, createPhoto, deleteCachedPhoto, renderGallery, bindGalleries, onChange, getLimit, localText, showToast }) {
  const host = dialog.querySelector("[data-layout-media-editor]");
  const list = host.querySelector("[data-layout-media-list]");
  const input = host.querySelector("input[type=file]");
  const addButton = host.querySelector("[data-layout-add-photos]");
  const camera = host.querySelector("[data-layout-camera]");
  addButton.addEventListener("click", () => input.click());
  const videos = host.querySelector("[data-layout-videos]");
  const addVideo = host.querySelector("[data-layout-add-video]");
  const status = host.querySelector("[data-layout-media-status]");
  let draft = { photos: [], videoUrl: "", videoUrls: [] };
  let session = 0;
  let renderVersion = 0;
  let busy = false;
  let created = [];
  let galleryBinding = null;
  // The gallery closes on keydown; suppress the native Escape action so it
  // cannot subsequently cancel the editor underneath it.
  const guardGalleryEscape = (event) => {
    if (event.key === "Escape" && dialog.open && document.querySelector(".photo-lightbox[open]")) event.preventDefault();
  };

  function changed() { onChange(); }
  function updateVideoLink(row) {
    const video = row.querySelector("[data-layout-video]");
    const videoLink = row.querySelector("[data-layout-video-link]");
    const url = normalizeLayoutVideoUrl(video.value);
    video.setCustomValidity(video.value.trim() && !url ? localText("Enter an HTTP or HTTPS video link.", "Введите ссылку на видео, начинающуюся с http:// или https://.") : "");
    videoLink.hidden = !url;
    if (url) videoLink.href = url;
    else videoLink.removeAttribute("href");
  }
  function renderVideos() {
    if (!draft.videoUrls.length) draft.videoUrls = [""];
    videos.innerHTML = draft.videoUrls.map((url, index) => `<div class="layout-video-row" data-layout-video-index="${index}">
      <label><span>${escapeHtml(localText(`Video link ${index + 1}`, `Ссылка на видео ${index + 1}`))}</span><input data-layout-video type="url" placeholder="https://www.youtube.com/watch?v=…" value="${escapeHtml(url)}" /></label>
      <button type="button" class="ghost danger" data-layout-remove-video aria-label="${escapeHtml(localText(`Remove video ${index + 1}`, `Удалить видео ${index + 1}`))}">${escapeHtml(localText("Remove", "Удалить"))}</button>
      <a data-layout-video-link target="_blank" rel="noopener noreferrer" hidden>${escapeHtml(localText("Open video", "Открыть видео"))}</a>
    </div>`).join("");
    videos.querySelectorAll("[data-layout-video-index]").forEach(updateVideoLink);
  }
  videos.addEventListener("input", event => {
    if (!event.target.matches("[data-layout-video]")) return;
    const row = event.target.closest("[data-layout-video-index]");
    draft.videoUrls[Number(row.dataset.layoutVideoIndex)] = event.target.value;
    draft.videoUrl = draft.videoUrls[0] || "";
    updateVideoLink(row);
    changed();
  });
  videos.addEventListener("click", event => {
    const remove = event.target.closest("[data-layout-remove-video]");
    if (!remove) return;
    const index = Number(remove.closest("[data-layout-video-index]").dataset.layoutVideoIndex);
    draft.videoUrls.splice(index, 1);
    draft.videoUrl = draft.videoUrls[0] || "";
    renderVideos(); changed();
  });
  addVideo.addEventListener("click", () => {
    draft.videoUrls.push(""); renderVideos();
    videos.querySelector("[data-layout-video-index]:last-child input").focus();
  });
  async function render() {
    const version = ++renderVersion;
    const photos = [...draft.photos];
    const galleries = await Promise.all(photos.map((photo) => renderGallery([photo], { className: "layout-media-thumbnail" })));
    if (version !== renderVersion) return;
    galleryBinding?.destroy();
    list.innerHTML = photos.map((photo, index) => `
      <div class="layout-media-photo ${photo.status === "pending" ? "layout-media-local" : ""}" data-layout-photo-index="${index}">
        <div class="layout-media-preview">${galleries[index]}</div>
        <label><span>${escapeHtml(localText("Caption", "Подпись"))} ${index + 1}</span>
          <input data-layout-photo-caption maxlength="2000" value="${escapeHtml(photo.caption || "")}" />
        </label>
        <div class="layout-media-photo-actions">
          <button type="button" class="ghost" data-layout-photo-move="-1" ${index === 0 ? "disabled" : ""} aria-label="${escapeHtml(localText("Move photo earlier", "Переместить фото раньше"))}">←</button>
          <button type="button" class="ghost" data-layout-photo-move="1" ${index === photos.length - 1 ? "disabled" : ""} aria-label="${escapeHtml(localText("Move photo later", "Переместить фото позже"))}">→</button>
          <button type="button" class="ghost danger" data-layout-photo-remove>${escapeHtml(localText("Remove", "Удалить"))}</button>
        </div>
      </div>`).join("");
    list.querySelectorAll("[data-photo-open]").forEach((button, index) => {
      button.setAttribute("aria-label", photos[index].caption || localText(`Open photo ${index + 1}`, `Открыть фото ${index + 1}`));
      const image = button.querySelector("img");
      if (image) image.alt = photos[index].caption || "";
    });
    galleryBinding = bindGalleries(list);
  }
  list.addEventListener("input", (event) => {
    if (!event.target.matches("[data-layout-photo-caption]")) return;
    const index = Number(event.target.closest("[data-layout-photo-index]").dataset.layoutPhotoIndex);
    if (draft.photos[index]) draft.photos[index].caption = event.target.value;
    changed();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout-photo-move], [data-layout-photo-remove]");
    if (!button || busy) return;
    const index = Number(button.closest("[data-layout-photo-index]").dataset.layoutPhotoIndex);
    if (button.hasAttribute("data-layout-photo-remove")) draft.photos.splice(index, 1);
    else {
      const next = index + Number(button.dataset.layoutPhotoMove);
      if (next < 0 || next >= draft.photos.length) return;
      [draft.photos[index], draft.photos[next]] = [draft.photos[next], draft.photos[index]];
    }
    render();
    changed();
  });
  input.addEventListener("change", async () => {
    const files = [...input.files];
    try { await addFiles(files); }
    finally { input.value = ""; }
  });
  camera.addEventListener("change", async () => {
    const files = [...camera.files];
    try { await addFiles(files); }
    finally { camera.value = ""; }
  });
  async function addFiles(files) {
    if (!files.length || busy) return;
    const token = session;
    busy = true;
    input.disabled = true;
    addButton.disabled = true;
    camera.disabled = true;
    status.textContent = localText("Preparing photos…", "Готовлю фотографии…");
    changed();
    try {
      for (const file of files) {
        if (draft.photos.length >= getLimit()) {
          showToast(localText("Photo limit reached.", "Достигнут лимит фотографий."), "warning");
          break;
        }
        const photo = await createPhoto(file);
        if (session !== token) {
          await deleteCachedPhoto(photo.localId || photo.id);
          return;
        }
        created.push(photo);
        draft.photos.push({ ...photo, caption: "" });
      }
    } catch (error) {
      showToast(localText(`Could not add photo: ${error.message}`, `Не удалось добавить фото: ${error.message}`), "error");
    } finally {
      if (session === token) {
        busy = false;
        input.disabled = false;
        addButton.disabled = false;
        camera.disabled = false;
        status.textContent = "";
        await render();
        changed();
      }
    }
  }
  return {
    addFiles,
    sessionToken: () => session,
    open(layout, { preserveCreated = false } = {}) {
      document.addEventListener("keydown", guardGalleryEscape, true);
      session++;
      draft = layoutMediaSnapshot(layout);
      if (!preserveCreated) created = [];
      busy = false;
      input.disabled = false;
      addButton.disabled = false;
      camera.disabled = false;
      host.querySelector("[data-layout-camera-label]").textContent = localText("Take photo", "Сделать фото");
      addButton.textContent = localText("Add photos", "Добавить фотографии");
      host.querySelector(".photo-paste-hint").textContent = localText("Paste photo or URL from clipboard", "Вставить фото или URL из буфера");
      host.querySelector("[data-layout-drop-hint]").textContent = localText("You can also drop photos here", "Также можно перетащить фотографии сюда");
      status.textContent = "";
      host.querySelector("[data-layout-photos-label]").textContent = localText("Photos", "Фотографии");
      input.setAttribute("aria-label", localText("Add layout photos", "Добавить фотографии укладки"));
      host.querySelector("[data-layout-videos-label]").textContent = localText("Trip videos", "Видео поездки");
      addVideo.textContent = localText("Add video", "Добавить видео");
      renderVideos();
      render();
    },
    snapshot: () => draft,
    signature: () => layoutMediaSignature(draft),
    isBusy: () => busy,
    validate: () => { videos.querySelectorAll("[data-layout-video-index]").forEach(updateVideoLink); return [...videos.querySelectorAll("[data-layout-video]")].every(video => video.reportValidity()) && !busy; },
    close(savedLayout) {
      document.removeEventListener("keydown", guardGalleryEscape, true);
      session++;
      renderVersion++;
      galleryBinding?.destroy();
      galleryBinding = null;
      const retained = new Set((savedLayout?.photos || []).map((photo) => photo.localId || photo.id));
      for (const photo of created) {
        if (!retained.has(photo.localId || photo.id)) Promise.resolve(deleteCachedPhoto(photo.localId || photo.id)).catch(() => {});
      }
      created = [];
      draft = { photos: [], videoUrl: "", videoUrls: [] };
      list.innerHTML = "";
      busy = false;
    }
  };
}
