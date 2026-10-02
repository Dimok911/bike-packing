import { bindLayoutMediaReorder } from "./layout-media-reorder.js";
import { updatePhotoGallerySources, updatePhotoGalleryUploadProgress } from "./photo-gallery.js";
import { escapeHtml } from "../utils/html.js";
import { layoutMediaSnapshot, layoutMediaSignature, normalizeLayoutVideoUrl } from "../state/layout-media.js";

export function createLayoutMediaEditor({ dialog, createPhoto, deleteCachedPhoto, renderGallery, bindGalleries, onChange, getLimit, localText, showToast, onPhotoAdded = () => {}, confirmRemovePhoto = async () => false }) {
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
  let reordering = false;
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
    reorder.cancel();
    const version = ++renderVersion;
    const photos = [...draft.photos];
    const galleries = await Promise.all(photos.map((photo) => renderGallery([photo], { className: "layout-media-thumbnail" })));
    if (version !== renderVersion) return;
    galleryBinding?.destroy();
    list.innerHTML = photos.map((photo, index) => `
      <div class="layout-media-photo ${photo.status === "pending" ? "layout-media-local" : ""}" data-layout-photo-index="${index}">
        <div class="layout-media-preview">${galleries[index]}
          <button type="button" class="layout-media-drag-handle" data-layout-photo-drag aria-label="${escapeHtml(localText(`Reorder photo ${index + 1}`, `Изменить порядок фото ${index + 1}`))}" title="${escapeHtml(localText("Drag to reorder; use arrow keys when focused", "Перетащите; с клавиатуры — стрелки"))}">⠿</button>
          <button type="button" class="layout-media-remove" data-layout-photo-remove aria-label="${escapeHtml(localText(`Remove photo ${index + 1}`, `Удалить фото ${index + 1}`))}">×</button>
        </div>
        <div class="layout-media-caption">
          <button type="button" data-layout-caption-edit title="${escapeHtml(photo.caption || localText("Add caption", "Добавить подпись"))}">${escapeHtml(photo.caption || localText("Add caption", "Добавить подпись"))}</button>
          <input hidden data-layout-photo-caption aria-label="${escapeHtml(localText(`Caption ${index + 1}`, `Подпись ${index + 1}`))}" maxlength="2000" value="${escapeHtml(photo.caption || "")}" />
        </div>
        <p data-layout-photo-error hidden role="status"></p>
      </div>`).join("");
    list.querySelectorAll("[data-photo-open]").forEach((button, index) => {
      button.setAttribute("aria-label", photos[index].caption || localText(`Open photo ${index + 1}`, `Открыть фото ${index + 1}`));
      const image = button.querySelector("img");
      if (image) image.alt = photos[index].caption || "";
    });
    galleryBinding = bindGalleries(list);
    refreshUploads();
  }
  list.addEventListener("input", (event) => {
    if (!event.target.matches("[data-layout-photo-caption]")) return;
    const index = Number(event.target.closest("[data-layout-photo-index]").dataset.layoutPhotoIndex);
    if (draft.photos[index]) draft.photos[index].caption = event.target.value;
    changed();
  });
  const reorder = bindLayoutMediaReorder({list, dialog, canMove: () => !busy && !reordering, onMove: async (from, to) => {
    const token = session;
    const photo = draft.photos.splice(from,1)[0];
    if (!photo) return;
    reordering = true;
    try {
      draft.photos.splice(to,0,photo); changed();
      await render();
      if (token === session) list.querySelector(`[data-layout-photo-index="${to}"] [data-layout-photo-drag]`)?.focus({preventScroll:true});
    } finally { reordering = false; }
  }});
  const finishCaption = input => {
    const row=input.closest("[data-layout-photo-index]");
    if (!row) return;
    const button=row.querySelector("[data-layout-caption-edit]");
    button.textContent=input.value || localText("Add caption", "Добавить подпись");
    button.title=button.textContent;
    const open=row.querySelector("[data-photo-open]");
    if(open)open.setAttribute("aria-label", input.value || localText(`Open photo ${Number(row.dataset.layoutPhotoIndex)+1}`, `Открыть фото ${Number(row.dataset.layoutPhotoIndex)+1}`));
    input.hidden=true; button.hidden=false;
  };
  list.addEventListener("focusout", event=>{if(event.target.matches("[data-layout-photo-caption]"))finishCaption(event.target);});
  list.addEventListener("keydown", event=>{
    if (!event.target.matches("[data-layout-photo-caption]") || !["Enter","Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const button=event.target.parentElement.querySelector("button");
    finishCaption(event.target); button.focus();
  });
  list.addEventListener("click", async event => {
    const edit=event.target.closest("[data-layout-caption-edit]");
    if(edit) {
      const input=edit.parentElement.querySelector("input");
      edit.hidden=true; input.hidden=false; input.focus(); input.select(); return;
    }
    const button=event.target.closest("[data-layout-photo-remove]");
    if(!button || busy) return;
    const token=session, index=Number(button.closest("[data-layout-photo-index]").dataset.layoutPhotoIndex);
    const photo=draft.photos[index];
    if(!photo || !await confirmRemovePhoto(photo.caption || localText(`Photo ${index+1}`,`Фото ${index+1}`))) return;
    if(token!==session || busy) return;
    const current=draft.photos.indexOf(photo);
    if(current<0)return;
    draft.photos.splice(current,1); await render(); changed();
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
    reorder.cancel();
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
        photo.caption = "";
        created.push(photo);
        draft.photos.push(photo);
        // Start each prepared file immediately, without waiting for the next picker or Save.
        Promise.resolve(onPhotoAdded(photo)).catch(() => {});
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
  function refreshUploads() {
      updatePhotoGallerySources(list, draft.photos);
      [...list.querySelectorAll("[data-photo-gallery]")].forEach((gallery, index) => updatePhotoGalleryUploadProgress(gallery, [draft.photos[index]]));
      [...list.querySelectorAll("[data-layout-photo-error]")].forEach((element, index) => {
        const photo = draft.photos[index];
        element.textContent = ["error", "missing-local-file"].includes(photo?.status) ? photo.error || localText("Could not upload photo.", "Не удалось загрузить фото.") : "";
        element.hidden = !element.textContent;
      });
      galleryBinding?.refresh?.();
    }
  return {
    addFiles,
    sessionToken: () => session,
    refreshUploads,
    open(layout, { preserveCreated = false } = {}) {
      reorder.cancel();
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
      reorder.cancel();
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
