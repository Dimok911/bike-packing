import { escapeHtml } from "../utils/html.js";

export function tripVideoPreview(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1];
    }
    const youtube = /^[\w-]{11}$/.test(id || "");
    const time = url.searchParams.get("start") || url.searchParams.get("t") || "";
    const parts = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const start = /^\d+$/.test(time) ? Number(time) : parts ? Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0) : 0;
    return { url: url.href, provider: youtube ? "YouTube" : host, thumbnail: youtube ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "",
      embed: youtube ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0${start > 0 && Number.isSafeInteger(start) ? `&start=${start}` : ""}` : "" };
  } catch { return null; }
}

export function renderTripVideoCards(urls, localText) {
  if (!urls.length) return "";
  const title = localText("Videos", "Видео");
  return `<section class="layout-summary-videos" aria-label="${escapeHtml(title)}"><strong>${escapeHtml(title)}</strong><div class="layout-video-summary-list">${urls.map((url, index) => {
    const video = tripVideoPreview(url);
    if (!video) return "";
    const name = localText(`Video ${index + 1}`, `Видео ${index + 1}`);
    return `<a class="layout-video-card${index >= 4 ? " trip-media-overflow" : ""}" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" ${video.embed ? 'data-trip-video-play aria-haspopup="dialog"' : ""} aria-label="${escapeHtml(`${name} · ${video.provider}`)}">
      <span class="layout-video-cover">${video.thumbnail ? `<img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-trip-video-thumbnail />` : ""}<span class="layout-video-play" aria-hidden="true">▶</span>${index === 3 && urls.length > 4 ? `<span class="trip-media-more" aria-hidden="true">+${urls.length - 4}</span>` : ""}</span>
      <span class="layout-video-caption"><span>${escapeHtml(name)}</span><small>${escapeHtml(video.provider)}</small></span></a>`;
  }).join("")}</div>${urls.length > 4 ? `<button type="button" class="ghost trip-videos-expand" data-trip-videos-expand>${escapeHtml(localText("Show all videos", "Показать все видео"))}</button>` : ""}</section>`;
}

// Bike Packing trip UI: the shared photo gallery is not involved in video playback.
export function bindTripVideoCards(host, localText) {
  let player = null;
  let opener = null;
  const closePlayer = () => {
    if (!player) return;
    const dialog = player;
    player = null;
    dialog.querySelector("iframe")?.remove();
    if (dialog.open) dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  const onClick = event => {
    const expand = event.target.closest("[data-trip-videos-expand]");
    if (expand && host.contains(expand)) {
      const section = expand.closest(".layout-summary-videos");
      const expanded = section.classList.toggle("is-expanded");
      expand.setAttribute("aria-expanded", String(expanded));
      expand.textContent = expanded ? localText("Collapse videos", "Свернуть видео") : localText("Show all videos", "Показать все видео");
      return;
    }
    const link = event.target.closest("[data-trip-video-play]");
    if (!link || !host.contains(link) || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const video = tripVideoPreview(link.href);
    if (!video?.embed) return;
    event.preventDefault();
    closePlayer();
    opener = link;
    const dialog = document.createElement("dialog");
    player = dialog;
    dialog.className = "trip-video-dialog";
    dialog.setAttribute("aria-label", link.getAttribute("aria-label"));
    dialog.innerHTML = `<div class="trip-video-player-header"><strong>${escapeHtml(link.getAttribute("aria-label"))}</strong><button type="button" class="icon-button" aria-label="${escapeHtml(localText("Close video", "Закрыть видео"))}">×</button></div><iframe title="${escapeHtml(link.getAttribute("aria-label"))}" src="${escapeHtml(video.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><a class="trip-video-external" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localText("Open on YouTube", "Открыть на YouTube"))} ↗</a>`;
    dialog.querySelector("button").addEventListener("click", closePlayer);
    dialog.addEventListener("cancel", event => { event.preventDefault(); closePlayer(); });
    dialog.addEventListener("close", () => { if (player === dialog) closePlayer(); });
    document.body.append(dialog);
    const links = [...host.querySelectorAll("[data-trip-video-play]")];
    let active = links.indexOf(link);
    if (links.length > 1) {
      const controls = document.createElement("div");
      controls.className = "trip-video-navigation";
      controls.innerHTML = `<button type="button" data-video-prev aria-label="${escapeHtml(localText("Previous video", "Предыдущее видео"))}">←</button><span></span><button type="button" data-video-next aria-label="${escapeHtml(localText("Next video", "Следующее видео"))}">→</button>`;
      const sync = () => {
        controls.querySelector("span").textContent = `${active + 1} / ${links.length}`;
        controls.querySelector("[data-video-prev]").disabled = active === 0;
        controls.querySelector("[data-video-next]").disabled = active === links.length - 1;
      };
      const select = index => {
        if (index < 0 || index >= links.length) return;
        active = index;
        const selected = links[active], next = tripVideoPreview(selected.href);
        dialog.querySelector("iframe").src = next.embed;
        dialog.querySelector("iframe").title = selected.getAttribute("aria-label");
        dialog.querySelector("strong").textContent = selected.getAttribute("aria-label");
        dialog.setAttribute("aria-label", selected.getAttribute("aria-label"));
        dialog.querySelector(".trip-video-external").href = next.url;
        sync();
      };
      controls.querySelector("[data-video-prev]").addEventListener("click", () => select(active - 1));
      controls.querySelector("[data-video-next]").addEventListener("click", () => select(active + 1));
      dialog.querySelector("iframe").after(controls); sync();
    }
    dialog.showModal();
  };
  const onImageError = event => {
    if (event.target.matches?.("[data-trip-video-thumbnail]")) event.target.hidden = true;
  };
  host.addEventListener("click", onClick);
  host.addEventListener("error", onImageError, true);
  host.querySelectorAll("[data-trip-video-thumbnail]").forEach(image => { if (image.complete && !image.naturalWidth) image.hidden = true; });
  return { destroy() { closePlayer(); host.removeEventListener("click", onClick); host.removeEventListener("error", onImageError, true); } };
}
