// Pointer sorting for the trip editor's photo grid. A placeholder reserves the
// destination, as in the application's existing layout-order drag interaction.
export function bindLayoutMediaReorder({list, dialog, canMove, onMove}) {
  let cancelActive = () => {};
  const start = event => {
    const handle = event.target.closest("[data-layout-photo-drag]");
    if (!handle || event.button !== 0 || !canMove()) return;
    cancelActive();
    const source = handle.closest("[data-layout-photo-index]");
    const from = Number(source.dataset.layoutPhotoIndex);
    const startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, started = false, frame = 0;
    let ghost, placeholder;
    const scrollHost = (() => {
      for (let node = list.parentElement; node; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
      }
      return dialog;
    })();
    const place = () => {
      if (!started) return;
      ghost.style.transform = `translate(${x-startX}px,${y-startY}px)`;
      const target = document.elementFromPoint(x,y)?.closest("[data-layout-photo-index]");
      if (!target || target === source || !list.contains(target)) return;
      const box = target.getBoundingClientRect();
      const before = x < box.left + box.width/2 ? target : target.nextElementSibling;
      if (before === placeholder || placeholder.nextElementSibling === before) return;
      const cards = [...list.querySelectorAll("[data-layout-photo-index]")].filter(card=>card!==source);
      const old = cards.map(card=>card.getBoundingClientRect());
      list.insertBefore(placeholder, before);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) cards.forEach((card,i)=>{
        const next = card.getBoundingClientRect();
        card.getAnimations().forEach(animation=>animation.cancel());
        if (old[i].left!==next.left || old[i].top!==next.top) card.animate([{transform:`translate(${old[i].left-next.left}px,${old[i].top-next.top}px)`},{transform:"none"}],{duration:140,easing:"ease-out"});
      });
    };
    const tick = () => {
      if (!started) return;
      const box = scrollHost.getBoundingClientRect();
      const delta = y < box.top+48 ? -8 : y > box.bottom-48 ? 8 : 0;
      if (delta) { scrollHost.scrollTop += delta; place(); }
      frame = requestAnimationFrame(tick);
    };
    const move = current => {
      if (current.pointerId !== event.pointerId) return;
      x=current.clientX; y=current.clientY;
      if (!started && Math.hypot(x-startX,y-startY)<5) return;
      current.preventDefault();
      if (!started) {
        started=true;
        const box=source.getBoundingClientRect();
        placeholder=document.createElement("div");
        placeholder.className="layout-media-drop-placeholder";
        placeholder.style.height=`${box.height}px`;
        ghost=source.cloneNode(true); ghost.classList.add("layout-media-drag-ghost");
        ghost.removeAttribute("data-layout-photo-index"); ghost.setAttribute("aria-hidden","true");
        Object.assign(ghost.style,{width:`${box.width}px`,left:`${box.left}px`,top:`${box.top}px`});
        source.before(placeholder); source.classList.add("layout-media-drag-source");
        dialog.append(ghost); tick();
      }
      place();
    };
    const finish = (commit=false) => {
      const to=started ? [...list.children].filter(child=>child!==source).indexOf(placeholder) : from;
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",up);
      document.removeEventListener("pointercancel",cancel);
      document.removeEventListener("keydown",key,true);
      dialog.removeEventListener("cancel",cancel);
      source.classList.remove("layout-media-drag-source");
      placeholder?.remove(); ghost?.remove();
      if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      cancelActive=()=>{};
      if (commit && started && from!==to && to>=0) onMove(from,to);
    };
    const up = current => { if(current.pointerId===event.pointerId) finish(true); };
    const cancel = current => { current?.preventDefault(); finish(false); };
    const key = current => { if(current.key==="Escape") {current.stopImmediatePropagation(); cancel(current);} };
    cancelActive=()=>finish(false);
    handle.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove",move,{passive:false});
    document.addEventListener("pointerup",up);
    document.addEventListener("pointercancel",cancel);
    document.addEventListener("keydown",key,true);
    dialog.addEventListener("cancel",cancel);
  };
  const keyboard = event => {
    const handle=event.target.closest("[data-layout-photo-drag]");
    if (!handle || !canMove() || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const from=Number(handle.closest("[data-layout-photo-index]").dataset.layoutPhotoIndex);
    const total=list.querySelectorAll("[data-layout-photo-index]").length;
    const to=event.key==="Home" ? 0 : event.key==="End" ? total-1 : from+(["ArrowLeft","ArrowUp"].includes(event.key)?-1:1);
    if(to>=0 && to<total && from!==to) onMove(from,to);
  };
  list.addEventListener("pointerdown",start);
  list.addEventListener("keydown",keyboard);
  list.addEventListener("contextmenu",event=>{if(event.target.closest("[data-layout-photo-drag]"))event.preventDefault();});
  return {cancel:()=>cancelActive()};
}
