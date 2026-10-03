import { escapeHtml } from "../utils/html.js";

const STORAGE_KEY = "bike-packing-trip-backdrop-v1";
export const TRIP_BACKDROP_DEFAULTS = Object.freeze({ photo: 32, wash: 76 });

export function tripBackdropSettings(canChoose = false) {
  if (canChoose) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Object.fromEntries(Object.entries(TRIP_BACKDROP_DEFAULTS).map(([key, fallback]) =>
        [key, Number.isFinite(saved?.[key]) ? Math.max(0, Math.min(100, saved[key])) : fallback]));
    } catch { /* Defaults also work when storage is unavailable. */ }
  }
  return { ...TRIP_BACKDROP_DEFAULTS };
}

export function applyTripBackdropSettings(card, canChoose) {
  if (!card) return;
  const { photo, wash } = tripBackdropSettings(canChoose);
  card.style.setProperty("--trip-backdrop-photo", String(photo / 100));
  for (const [key, offset] of [["left",18],["middle",0],["right",-51],["mobile-top",-36],["mobile-bottom",12]]) {
    card.style.setProperty(`--trip-backdrop-${key}`, `${Math.max(0, Math.min(100, wash + offset))}%`);
  }
}

export function setupTripBackdropControls(control, localText, canChoose) {
  const group = document.createElement("div");
  group.className = "trip-backdrop-controls";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", localText("Trip background", "Фон поездки"));
  group.innerHTML = `<strong>${escapeHtml(localText("Trip background", "Фон поездки"))}</strong>${[["photo",localText("Photo visibility", "Видимость фото")],["wash",localText("Light overlay", "Светлая подложка")]].map(([key,label]) => `<label><span>${escapeHtml(label)} <output data-backdrop-output="${key}"></output></span><span class="trip-backdrop-range"><input type="range" min="0" max="100" step="1" data-trip-backdrop="${key}" aria-label="${escapeHtml(label)}" /><i aria-hidden="true" style="left:${TRIP_BACKDROP_DEFAULTS[key]}%"></i></span><small>${escapeHtml(localText("Default for everyone", "Для всех"))}: ${TRIP_BACKDROP_DEFAULTS[key]}%</small></label>`).join("")}<button type="button" class="ghost" data-backdrop-reset>${escapeHtml(localText("Use defaults", "Как у всех"))}</button>`;
  const sync = () => {
    const values = tripBackdropSettings(canChoose());
    for (const [key, value] of Object.entries(values)) {
      group.querySelector(`[data-trip-backdrop="${key}"]`).value = value;
      group.querySelector(`[data-backdrop-output="${key}"]`).textContent = `${value}%`;
    }
  };
  const save = values => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* Optional visual preference. */ }
    sync();
    document.dispatchEvent(new Event("layout-trip-backdrop-change"));
  };
  group.addEventListener("input", event => {
    if (!canChoose() || !event.target.matches("[data-trip-backdrop]")) return;
    save({ ...tripBackdropSettings(true), [event.target.dataset.tripBackdrop]: Number(event.target.value) });
  });
  group.querySelector("[data-backdrop-reset]").addEventListener("click", () => { if (canChoose()) save({ ...TRIP_BACKDROP_DEFAULTS }); });
  control.append(group);
  const legend = document.createElement("small");
  legend.className = "visual-default-legend";
  legend.textContent = localText("● Outline: default for everyone · Fill: your selection", "● Обводка — для всех по умолчанию · Заливка — ваш выбор");
  control.append(legend);
  sync();
  return sync;
}
