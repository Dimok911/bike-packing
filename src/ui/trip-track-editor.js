import { bindLayoutMediaReorder } from "./layout-media-reorder.js";
import { MAX_GPX_BYTES, normalizeTripTracks, parseTripGpx, sortTripTracksByDate, tripTrackCaption } from "../state/trip-track.js";
import { trackOutlineSvg } from "./trip-track-map.js";
import { escapeHtml } from "../utils/html.js";

export function createTripTrackEditor({ host, localText, onChange }) {
  let tracks = [], busy = false, session = 0, order = "date";
  host.innerHTML = `<strong>${escapeHtml(localText("Maps", "Карты"))}</strong>
    <p>${escapeHtml(localText("Add one or several GPX files. Each track gets its own map in the shared trip.", "Добавьте один или несколько файлов GPX. Каждый трек будет отдельной картой в публикации поездки."))}</p>
    <div class="trip-track-actions"><button type="button" data-trip-gpx-add>${escapeHtml(localText("Add GPX", "Добавить GPX"))}</button><button type="button" data-trip-gpx-sort>${escapeHtml(localText("By date ↑", "По дате ↑"))}</button></div>
    <input type="file" accept=".gpx,application/gpx+xml" data-trip-gpx-file multiple hidden />
    <p data-trip-gpx-order></p><p data-trip-gpx-status role="status"></p><div class="trip-track-editor-list" data-trip-gpx-list></div>`;
  const input = host.querySelector("input");
  const add = host.querySelector("[data-trip-gpx-add]");
  const sort = host.querySelector("[data-trip-gpx-sort]");
  const status = host.querySelector("[data-trip-gpx-status]");
  const list = host.querySelector("[data-trip-gpx-list]");
  const render = () => {
    reorder.cancel();
    sort.disabled = busy || !tracks.length;
    sort.setAttribute("aria-pressed", String(order === "date"));
    host.querySelector("[data-trip-gpx-order]").textContent = order === "date" ? localText("Order: oldest first", "Порядок: сначала старые") : localText("Order: manual", "Порядок: вручную");
    sort.title = localText("Oldest first; tracks without a date last", "Сначала старые; треки без даты — в конце");
    add.disabled = input.disabled = busy;
    status.textContent = busy ? localText("Reading GPX…", "Читаем GPX…") : tracks.length ? tracks.map(track => `${track.name || track.fileName} · GPX`).join("; ") : localText("No tracks yet", "Треки пока не добавлены");
    list.innerHTML = tracks.map((track,index) => {
      const date = track.startedAt ? new Intl.DateTimeFormat(localText("en-GB","ru-RU")).format(new Date(track.startedAt)) : "";
      return `<div class="trip-track-editor-card" data-trip-track-index="${index}"><button type="button" class="layout-media-drag-handle" data-trip-track-drag ${busy ? "disabled" : ""} aria-label="${escapeHtml(localText(`Reorder map ${index+1}`,`Изменить порядок карты ${index+1}`))}" title="${escapeHtml(localText("Drag to reorder; use arrow keys when focused", "Перетащите; с клавиатуры — стрелки"))}">⠿</button><div class="trip-track-editor-outline">${trackOutlineSvg(track)}</div><div class="layout-media-caption"><button type="button" data-trip-track-caption-edit title="${escapeHtml(tripTrackCaption(track) || localText("Add caption", "Добавить подпись"))}">${escapeHtml(tripTrackCaption(track) || localText("Add caption", "Добавить подпись"))}</button><input hidden data-trip-track-caption aria-label="${escapeHtml(localText(`Track caption ${index+1}`, `Подпись трека ${index+1}`))}" maxlength="2000" value="${escapeHtml(tripTrackCaption(track))}" /></div>${date ? `<time datetime="${escapeHtml(track.startedAt)}">${escapeHtml(date)}</time>` : ""}<button type="button" class="layout-media-remove" data-trip-gpx-remove="${index}" ${busy ? "disabled" : ""} aria-label="${escapeHtml(localText(`Remove track ${index+1}`,`Удалить трек ${index+1}`))}">×</button></div>`;
    }).join("");
  };
  const reorder = bindLayoutMediaReorder({list, dialog: host.closest("dialog") || host, handleSelector: "[data-trip-track-drag]", indexAttribute: "data-trip-track-index", canMove: () => !busy, onMove(from,to) {
    const track = tracks.splice(from,1)[0];
    if (!track) return;
    tracks.splice(to,0,track); order = "manual"; render(); onChange();
    list.querySelector(`[data-trip-track-index="${to}"] [data-trip-track-drag]`)?.focus({preventScroll:true});
  }});
  sort.addEventListener("click", () => {
    if (busy) return;
    order = "date"; tracks = sortTripTracksByDate(tracks); render(); onChange();
  });
  add.addEventListener("click", () => input.click());
  const finishCaption = field => {
    const button = field.parentElement.querySelector("button");
    button.textContent = field.value || localText("Add caption", "Добавить подпись");
    button.title = button.textContent; field.hidden = true; button.hidden = false;
  };
  list.addEventListener("input", event => {
    if (!event.target.matches("[data-trip-track-caption]")) return;
    const index = Number(event.target.closest("[data-trip-track-index]").dataset.tripTrackIndex);
    tracks[index].caption = event.target.value; onChange();
  });
  list.addEventListener("focusout", event => {
    if (event.target.matches("[data-trip-track-caption]")) finishCaption(event.target);
  });
  list.addEventListener("keydown", event => {
    if (!event.target.matches("[data-trip-track-caption]") || !["Enter", "Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const button = event.target.parentElement.querySelector("button");
    finishCaption(event.target); button.focus();
  });
  list.addEventListener("click", event => {
    const edit = event.target.closest("[data-trip-track-caption-edit]");
    if (edit && !busy) {
      const field = edit.parentElement.querySelector("input");
      edit.hidden = true; field.hidden = false; field.focus(); field.select(); return;
    }
    const button = event.target.closest("[data-trip-gpx-remove]");
    if (!button || busy) return;
    tracks.splice(Number(button.dataset.tripGpxRemove),1); render(); onChange();
  });
  input.addEventListener("change", async () => {
    const files = [...(input.files || [])]; input.value = "";
    if (!files.length || busy) return;
    const token = session, errors = [];
    busy = true; render(); onChange();
    try {
      for (const file of files) {
        try {
          if (!/\.gpx$/i.test(file.name)) throw new Error("format");
          if (file.size > MAX_GPX_BYTES) throw new Error("size");
          const text = await file.text();
          if (session !== token) return;
          tracks.push(parseTripGpx(text, file.name));
        } catch(error) {
          if (session !== token) return;
          errors.push(`${file.name}: ${error.message === "size" ? localText("at most 20 MB", "не больше 20 МБ") : localText("could not read track", "не удалось прочитать трек")}`);
        }
      }
    } finally {
      if (session === token) {
        if (order === "date") tracks = sortTripTracksByDate(tracks);
        busy = false; render();
        if (errors.length) status.textContent = `${localText("Could not read some GPX files. Other tracks are retained.", "Не удалось прочитать часть файлов GPX. Остальные треки сохранены.")} ${errors.join("; ")}`;
        onChange();
      }
    }
  });
  return {
    open(value, savedOrder) { reorder.cancel(); session++; busy = false; order = savedOrder === "manual" ? "manual" : "date"; tracks = normalizeTripTracks(value); if (order === "date") tracks = sortTripTracksByDate(tracks); input.value = ""; render(); },
    snapshot: () => normalizeTripTracks(tracks),
    order: () => order,
    isBusy: () => busy,
    close() { reorder.cancel(); session++; busy = false; tracks = []; }
  };
}
