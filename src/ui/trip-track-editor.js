import { MAX_GPX_BYTES, normalizeTripTracks, parseTripGpx } from "../state/trip-track.js";
import { trackOutlineSvg } from "./trip-track-map.js";
import { escapeHtml } from "../utils/html.js";

export function createTripTrackEditor({ host, localText, onChange }) {
  let tracks = [], busy = false, session = 0;
  host.innerHTML = `<strong>${escapeHtml(localText("Maps", "Карты"))}</strong>
    <p>${escapeHtml(localText("Add one or several GPX files. Each track gets its own map in the shared trip.", "Добавьте один или несколько файлов GPX. Каждый трек будет отдельной картой в публикации поездки."))}</p>
    <div class="trip-track-actions"><button type="button" data-trip-gpx-add>${escapeHtml(localText("Add GPX", "Добавить GPX"))}</button></div>
    <input type="file" accept=".gpx,application/gpx+xml" data-trip-gpx-file multiple hidden />
    <p data-trip-gpx-status role="status"></p><div class="trip-track-editor-list" data-trip-gpx-list></div>`;
  const input = host.querySelector("input");
  const add = host.querySelector("[data-trip-gpx-add]");
  const status = host.querySelector("[data-trip-gpx-status]");
  const list = host.querySelector("[data-trip-gpx-list]");
  const render = () => {
    add.disabled = input.disabled = busy;
    status.textContent = busy ? localText("Reading GPX…", "Читаем GPX…") : tracks.length ? tracks.map(track => `${track.name || track.fileName} · GPX`).join("; ") : localText("No tracks yet", "Треки пока не добавлены");
    list.innerHTML = tracks.map((track,index) => {
      const date = track.startedAt ? new Intl.DateTimeFormat(localText("en-GB","ru-RU")).format(new Date(track.startedAt)) : "";
      return `<div class="trip-track-editor-card"><div class="trip-track-editor-outline">${trackOutlineSvg(track)}</div><strong>${escapeHtml(track.name || track.fileName)}</strong>${date ? `<time datetime="${escapeHtml(track.startedAt)}">${escapeHtml(date)}</time>` : ""}<button type="button" class="layout-media-remove" data-trip-gpx-remove="${index}" ${busy ? "disabled" : ""} aria-label="${escapeHtml(localText(`Remove track ${index+1}`,`Удалить трек ${index+1}`))}">×</button></div>`;
    }).join("");
  };
  add.addEventListener("click", () => input.click());
  list.addEventListener("click", event => {
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
        busy = false; render();
        if (errors.length) status.textContent = `${localText("Could not read some GPX files. Other tracks are retained.", "Не удалось прочитать часть файлов GPX. Остальные треки сохранены.")} ${errors.join("; ")}`;
        onChange();
      }
    }
  });
  return {
    open(value) { session++; busy = false; tracks = normalizeTripTracks(value); input.value = ""; render(); },
    snapshot: () => normalizeTripTracks(tracks),
    isBusy: () => busy,
    close() { session++; busy = false; tracks = []; }
  };
}
