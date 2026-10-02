import { escapeHtml } from "../utils/html.js";

// Navigation for Bike Packing trip rows; fullscreen gallery behavior is unchanged.
export function bindTripMediaScroll(host, localText) {
  const bindings = [...host.querySelectorAll(".layout-photo-summary-list, .layout-video-summary-list")].map(list => {
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
      const label = photos
        ? direction === "previous" ? localText("Scroll photos left", "Прокрутить фото влево") : localText("Scroll photos right", "Прокрутить фото вправо")
        : direction === "previous" ? localText("Scroll videos left", "Прокрутить видео влево") : localText("Scroll videos right", "Прокрутить видео вправо");
      button.setAttribute("aria-label", label);
      button.innerHTML = `<span aria-hidden="true">${escapeHtml(direction === "previous" ? "‹" : "›")}</span>`;
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
