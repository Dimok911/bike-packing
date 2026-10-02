import { MAX_GPX_BYTES, normalizeTripTrack, parseTripGpx } from "../state/trip-track.js";
import { escapeHtml } from "../utils/html.js";

export function createTripTrackEditor({ host, localText, onChange }) {
  let track = null, busy = false, session = 0;
  host.innerHTML = `<strong>${escapeHtml(localText("Map", "Карта"))}</strong>
    <p>${escapeHtml(localText("Upload a GPX track. The map is included when you share the trip.", "Загрузите трек GPX. Карта будет видна в публикации поездки."))}</p>
    <div class="trip-track-actions"><button type="button" data-trip-gpx-add>${escapeHtml(localText("Upload GPX", "Загрузить GPX"))}</button>
    <button type="button" class="ghost danger" data-trip-gpx-remove>${escapeHtml(localText("Remove track", "Удалить трек"))}</button></div>
    <input type="file" accept=".gpx,application/gpx+xml" data-trip-gpx-file hidden />
    <p data-trip-gpx-status role="status"></p>`;
  const input = host.querySelector("input");
  const add = host.querySelector("[data-trip-gpx-add]");
  const remove = host.querySelector("[data-trip-gpx-remove]");
  const status = host.querySelector("[data-trip-gpx-status]");
  const render = () => {
    add.disabled = remove.disabled = busy;
    remove.hidden = !track;
    status.textContent = busy ? localText("Reading GPX…", "Читаем GPX…") : track ? `${track.name || track.fileName} · GPX` : localText("No track yet", "Трек пока не добавлен");
  };
  add.addEventListener("click", () => input.click());
  remove.addEventListener("click", () => { track = null; render(); onChange(); });
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; input.value = "";
    if (!file || busy) return;
    const token = session;
    busy = true; render(); onChange();
    try {
      if (!/\.gpx$/i.test(file.name)) throw new Error("format");
      if (file.size > MAX_GPX_BYTES) throw new Error("size");
      const text = await file.text();
      if (session !== token) return;
      const next = parseTripGpx(text, file.name);
      track = next;
      busy = false; render();
    } catch (error) {
      if (session !== token) return;
      busy = false; render();
      status.textContent = error.message === "size" ? localText("GPX must be at most 20 MB.", "GPX должен быть не больше 20 МБ.") : localText("Could not read the GPX track. Choose a GPX with valid track coordinates; the previous track is unchanged.", "Не удалось прочитать трек. Выберите GPX с координатами маршрута. Прежний трек сохранён.");
    } finally {
      if (session === token) { busy = false; add.disabled = remove.disabled = false; onChange(); }
    }
  });
  return {
    open(value) { session++; busy = false; track = normalizeTripTrack(value); input.value = ""; render(); },
    snapshot: () => normalizeTripTrack(track),
    isBusy: () => busy,
    close() { session++; busy = false; track = null; }
  };
}
