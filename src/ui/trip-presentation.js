import { escapeHtml } from "../utils/html.js";

const STORAGE_KEY = "bike-packing-trip-presentation-v1";
export const DEFAULT_TRIP_PRESENTATION = "story-left";
const VIEWS = [
  ["current", "Previous layout", "Прежний"],
  ["photos-top", "Photos above", "Фото сверху"],
  ["photo-story", "Photos and description", "Фото и описание"],
  ["description-maps", "Description and maps", "Описание и карты"],
  ["story-left", "Description and maps on the left", "Описание слева"]
];
export function tripPresentation(canChoose = false) {
  if (!canChoose) return DEFAULT_TRIP_PRESENTATION;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VIEWS.some(([key]) => key === value) ? value : DEFAULT_TRIP_PRESENTATION;
  } catch { return DEFAULT_TRIP_PRESENTATION; }
}

export function setupTripPresentationControl(control, localText, canChoose) {
  const group = document.createElement("div");
  group.className = "trip-presentation-control";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", localText("Trip block", "Блок поездки"));
  group.innerHTML = `<strong>${escapeHtml(localText("Trip block", "Блок поездки"))}:</strong>${VIEWS.map(([key, en, ru]) => `<button type="button" class="admin-visual-option" data-trip-presentation="${key}" ${key === DEFAULT_TRIP_PRESENTATION ? 'data-visual-default="true"' : ""} title="${escapeHtml(localText(en, ru) + (key === DEFAULT_TRIP_PRESENTATION ? localText(" · Default for everyone", " · По умолчанию для всех") : ""))}">${escapeHtml(localText(en, ru))}</button>`).join("")}`;
  const sync = () => group.querySelectorAll("button").forEach(button => {
    const active = button.dataset.tripPresentation === tripPresentation(canChoose());
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  group.addEventListener("click", event => {
    const button = event.target.closest("[data-trip-presentation]");
    if (!button || !canChoose()) return;
    const value = button.dataset.tripPresentation;
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Apply for this session. */ }
    group.querySelectorAll("button").forEach(item => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    document.dispatchEvent(new CustomEvent("trip-presentation-change", { detail: value }));
  });
  control.append(group);
  sync();
  return sync;
}

// Keep the existing media nodes and bindings alive while changing their layout.
export function applyTripPresentation(host, value) {
  const content = host.parentElement;
  if (!content) return;
  content.dataset.tripPresentation = value;
  const parts = {
    photos: host.hidden || host.dataset.photoView === "hidden" ? null : host.querySelector(".layout-summary-photos"),
    videos: host.hidden ? null : host.querySelector(".layout-summary-videos"),
    maps: host.hidden ? null : host.querySelector(".layout-summary-map"),
    description: content.querySelector("#layoutDescriptionSummary:not([hidden])"),
    notes: content.querySelector("#layoutPrivateNotesSummary:not([hidden])")
  };
  const arrangements = {
    "photos-top": [["photos"], ["videos", "maps"], ["description"]],
    "photo-story": [["photos", "description"], ["videos", "maps"]],
    "description-maps": [["description", "maps"], ["photos"], ["videos"]],
    "story-left": [["description", "photos"], ["maps", "videos"]]
  };
  let order = 0;
  const rows = [...(arrangements[value] || []), ["notes"]].map(row => row.filter(key => parts[key])).filter(row => row.length);
  for (const row of rows) for (const key of row) parts[key].style.setProperty("--trip-part-order", String(order++));
  if (value === "story-left") ["description", "maps", "photos", "videos", "notes"].forEach((key,index) => parts[key]?.style.setProperty("--trip-part-order", String(index)));
  content.style.setProperty("--trip-grid-areas", rows.map(row => `"${row.length === 1 ? `${row[0]} ${row[0]}` : row.join(" ")}"`).join(" ") || "none");
}
