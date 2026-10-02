import { YANDEX_MAPS_API_KEY } from "../config/trip-map.js";
import { normalizeTripTrack, projectTrackSegments } from "../state/trip-track.js";
import { escapeHtml } from "../utils/html.js";

let sdkPromise;
function loadYandexMaps() {
  if (!YANDEX_MAPS_API_KEY) return Promise.reject(new Error("key"));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(new Error("timeout")), 20000);
    const fail = error => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(error); };
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YANDEX_MAPS_API_KEY)}&lang=ru_RU`;
    script.onerror = () => fail(new Error("network"));
    script.onload = () => {
      if (!window.ymaps?.ready) { fail(new Error("sdk")); return; }
      window.ymaps.ready(() => { clearTimeout(timer); resolve(window.ymaps); }, () => fail(new Error("sdk")));
    };
    document.head.append(script);
  });
  return sdkPromise;
}

export function trackOutlineSvg(track) {
  const segments = projectTrackSegments(track.segments);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const segment of segments) for (const [x, y] of segment) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.min(288 / Math.max(1, maxX - minX), 168 / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const lines = segments.map(segment => `<polyline points="${segment.map(([x, y]) => `${(160 + (x - cx) * scale).toFixed(2)},${(100 - (y - cy) * scale).toFixed(2)}`).join(" ")}" />`).join("");
  return `<svg viewBox="0 0 320 200" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${lines}</g></svg>`;
}

export function renderTripTrackMap(value, localText) {
  const track = normalizeTripTrack(value);
  if (!track) return "";
  const title = localText("Map", "Карта");
  const name = track.name || track.fileName || localText("Trip track", "Трек поездки");
  const date = track.startedAt ? new Intl.DateTimeFormat(localText("en-GB", "ru-RU"), {day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(track.startedAt)) : "";
  return `<section class="layout-summary-map" aria-label="${escapeHtml(title)}"><strong>${escapeHtml(title)}</strong>
    <div class="trip-track-preview"><div class="trip-track-canvas" data-trip-track-canvas>${trackOutlineSvg(track)}</div>
    <small data-trip-map-status role="status"></small><button type="button" class="trip-track-open" data-trip-track-open aria-haspopup="dialog" aria-label="${escapeHtml(localText("Open large map", "Открыть большую карту"))}"><span class="trip-track-name">${escapeHtml(name)}</span>${date ? `<time datetime="${escapeHtml(track.startedAt)}">${escapeHtml(date)}</time>` : ""}<span class="trip-track-expand" aria-hidden="true">↗</span></button></div></section>`;
}

export function bindTripTrackMap(host, value, localText) {
  const track = normalizeTripTrack(value);
  const section = host.querySelector(".layout-summary-map");
  if (!track || !section) return { destroy() {} };
  let destroyed = false, dialog = null, stopLarge = null, observer = null;
  const fallbackLabel = () => localText("Track outline · map unavailable", "Схема трека · карта недоступна");
  function mount(canvas, status, interactive, onClick) {
    let closed = false, map = null;
    const fallback = () => {
      map?.destroy(); map = null;
      canvas.innerHTML = trackOutlineSvg(track);
      status.textContent = fallbackLabel();
    };
    status.textContent = YANDEX_MAPS_API_KEY ? localText("Loading map…", "Загружаем карту…") : fallbackLabel();
    if (YANDEX_MAPS_API_KEY) loadYandexMaps().then(async ymaps => {
      if (closed || destroyed) return;
      canvas.replaceChildren();
      map = new ymaps.Map(canvas, { center: track.segments[0][0], zoom: 10, controls: interactive ? ["zoomControl", "fullscreenControl"] : [], behaviors: interactive ? ["drag", "scrollZoom", "multiTouch"] : [] });
      for (const segment of track.segments) map.geoObjects.add(new ymaps.Polyline(segment, {}, { strokeColor: "#ed6723", strokeWidth: 4 }));
      await map.setBounds(map.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: interactive ? 32 : 16 });
      if (closed || destroyed) return;
      if (map.getZoom() > 17) map.setZoom(17);
      if (onClick) map.events.add("click", onClick);
      status.textContent = "";
    }).catch(() => { if (!closed && !destroyed) fallback(); });
    return () => { closed = true; map?.destroy(); map = null; };
  }
  const close = () => {
    if (!dialog) return;
    stopLarge?.(); stopLarge = null;
    const current = dialog; dialog = null;
    current.close(); current.remove();
    if (!destroyed) section.querySelector("[data-trip-track-open]")?.focus({ preventScroll: true });
  };
  const open = () => {
    if (destroyed || dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "trip-track-dialog";
    dialog.setAttribute("aria-label", localText("Trip map", "Карта поездки"));
    dialog.innerHTML = `<header><strong>${escapeHtml(track.name || localText("Trip map", "Карта поездки"))}</strong><button type="button" aria-label="${escapeHtml(localText("Close map", "Закрыть карту"))}">×</button></header><div class="trip-track-canvas">${trackOutlineSvg(track)}</div><small role="status"></small>`;
    dialog.querySelector("button").addEventListener("click", close);
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("close", close);
    document.body.append(dialog); dialog.showModal();
    stopLarge = mount(dialog.querySelector(".trip-track-canvas"), dialog.querySelector("small"), true);
  };
  const onClick = event => { if (event.target.closest("[data-trip-track-open], .trip-track-canvas svg")) open(); };
  section.addEventListener("click", onClick);
  const canvas = section.querySelector("[data-trip-track-canvas]");
  const status = section.querySelector("[data-trip-map-status]");
  status.textContent = fallbackLabel();
  let stopPreview = null;
  // Do not create a map at zero size while the trip panel is collapsed.
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && !stopPreview) { stopPreview = mount(canvas, status, false, open); observer.disconnect(); }
  });
  observer.observe(canvas);
  return { destroy() { destroyed = true; observer.disconnect(); stopPreview?.(); close(); section.removeEventListener("click", onClick); } };
}
