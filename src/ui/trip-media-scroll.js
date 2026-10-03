import { escapeHtml } from "../utils/html.js";

// Navigation for Bike Packing trip rows; fullscreen gallery behavior is unchanged.
export function bindTripMediaScroll(host, localText) {
  const bindings = [...host.querySelectorAll(".layout-photo-summary-list, .layout-video-summary-list, .trip-map-summary-list")].map(list => {
    const photos = list.classList.contains("layout-photo-summary-list");
    const wrapper = document.createElement("div");
    wrapper.className = "trip-media-scroll";
    const previous = document.createElement("button");
    const next = document.createElement("button");
    for (const [button, direction] of [[previous, "previous"], [next, "next"]]) {
      button.type = "button";
      button.className = "trip-media-scroll-button";
      button.dataset.tripMediaScroll = direction;
      button.hidden = true;
      const maps = list.classList.contains("trip-map-summary-list");
      const label = maps
        ? direction === "previous" ? localText("Scroll maps left", "Прокрутить карты влево") : localText("Scroll maps right", "Прокрутить карты вправо")
        : photos
        ? direction === "previous" ? localText("Scroll photos left", "Прокрутить фото влево") : localText("Scroll photos right", "Прокрутить фото вправо")
        : direction === "previous" ? localText("Scroll videos left", "Прокрутить видео влево") : localText("Scroll videos right", "Прокрутить видео вправо");
      button.setAttribute("aria-label", label);
      button.innerHTML = `<span aria-hidden="true">${escapeHtml(direction === "previous" ? "‹" : "›")}</span><span class="trip-media-scroll-count" data-trip-media-count aria-hidden="true"></span>`;
    }
    list.before(wrapper);
    wrapper.append(previous, list, next);
    const sync = () => {
      // Compare with the full wrapper so removing the buttons cannot oscillate
      // around the overflow threshold as their own space is reclaimed.
      const overflow = wrapper.clientWidth > 0 && list.scrollWidth > wrapper.clientWidth + 1;
      wrapper.classList.toggle("has-overflow", overflow);
      previous.hidden = next.hidden = !overflow;
      previous.disabled = list.scrollLeft <= 1;
      next.disabled = list.scrollLeft >= list.scrollWidth - list.clientWidth - 1;
      const bounds = list.getBoundingClientRect();
      const left = bounds.left + list.clientLeft, right = left + list.clientWidth;
      let before = 0, after = 0;
      if (overflow) for (const child of list.children) {
        if (!child.getClientRects().length) continue;
        const box = child.getBoundingClientRect();
        // Include a clipped thumbnail: there is still part of it to reveal.
        if (box.left < left - 1) before++;
        if (box.right > right + 1) after++;
      }
      for (const [button, count, direction] of [[previous, before, "left"], [next, after, "right"]]) {
        button.querySelector("[data-trip-media-count]").textContent = count ? String(count) : "";
        const description = direction === "left" ? localText(`Offscreen to the left: ${count}`, `За краем слева: ${count}`) : localText(`Offscreen to the right: ${count}`, `За краем справа: ${count}`);
        button.setAttribute("aria-description", description);
        button.title = `${button.getAttribute("aria-label")} · ${description}`;
      }
    };
    const move = direction => list.scrollBy({
      left: direction * Math.max(1, list.clientWidth * 0.85),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
    const goBack = () => move(-1);
    const goNext = () => move(1);
    previous.addEventListener("click", goBack);
    next.addEventListener("click", goNext);
    list.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(wrapper);
    observer.observe(list);
    sync();
    return () => {
      observer.disconnect();
      previous.removeEventListener("click", goBack);
      next.removeEventListener("click", goNext);
      list.removeEventListener("scroll", sync);
      wrapper.replaceWith(list);
    };
  });
  return { destroy() { bindings.forEach(destroy => destroy()); } };
}
