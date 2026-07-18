export function createModalScrollLockController() {
  let modalScrollLock = null;
  let modalTouchStartY = 0;

  function setupModalScrollLock() {
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("close", updateModalScrollLock);
      dialog.addEventListener("cancel", () => requestAnimationFrame(updateModalScrollLock));
    });
    document.addEventListener("touchstart", captureModalTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", preventBackgroundModalScroll, { passive: false, capture: true });
    document.addEventListener("wheel", preventBackgroundModalWheel, { passive: false, capture: true });
  }

  function openModalDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    updateModalScrollLock();
  }

  function hasOpenModalDialog() {
    return Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);
  }

  function updateModalScrollLock() {
    if (hasOpenModalDialog()) {
      lockPageScrollForModal();
    } else {
      unlockPageScrollForModal();
    }
  }

  function lockPageScrollForModal() {
    if (modalScrollLock) return;
    const softLock = shouldUseSoftModalScrollLock();
    modalScrollLock = {
      softLock,
      x: window.scrollX,
      y: window.scrollY,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.body.classList.add("modal-scroll-locked");
    if (softLock) return;
    document.body.style.position = "fixed";
    document.body.style.top = `-${modalScrollLock.y}px`;
    document.body.style.left = `-${modalScrollLock.x}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScrollForModal() {
    if (!modalScrollLock) return;
    const { softLock, x, y, position, top, left, right, width, overflow } = modalScrollLock;
    modalScrollLock = null;
    document.body.classList.remove("modal-scroll-locked");
    if (!softLock) {
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.left = left;
      document.body.style.right = right;
      document.body.style.width = width;
      document.body.style.overflow = overflow;
      window.scrollTo(x, y);
    }
  }

  function shouldUseSoftModalScrollLock() {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
    const visibleStickyTabs = Array.from(document.querySelectorAll(".tabs-row")).some((tabsRow) => {
      const rect = tabsRow.getBoundingClientRect();
      return window.getComputedStyle(tabsRow).position === "sticky"
        && rect.bottom > 0
        && rect.top < window.innerHeight;
    });
    return Boolean(visibleStickyTabs || (coarsePointer && window.innerWidth <= 760));
  }

  function captureModalTouchStart(event) {
    modalTouchStartY = event.touches?.[0]?.clientY || 0;
  }

  function preventBackgroundModalScroll(event) {
    if (!modalScrollLock) return;
    const dialog = event.target.closest?.("dialog");
    if (dialog?.open) {
      const currentY = event.touches?.[0]?.clientY || modalTouchStartY;
      const deltaY = currentY - modalTouchStartY;
      if (canScrollInsideOpenDialog(event.target, dialog, deltaY)) return;
    }
    event.preventDefault();
  }

  function preventBackgroundModalWheel(event) {
    if (!modalScrollLock) return;
    const dialog = event.target.closest?.("dialog");
    if (dialog?.open && canScrollInsideOpenDialog(event.target, dialog, -event.deltaY)) return;
    event.preventDefault();
  }

  function canScrollInsideOpenDialog(target, dialog, deltaY) {
    if (!deltaY) return true;
    const scroller = findModalScrollableAncestor(target, dialog);
    if (!scroller) return false;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (maxScroll <= 0) return false;
    if (deltaY > 0) return scroller.scrollTop > 0;
    return scroller.scrollTop < maxScroll - 1;
  }

  function findModalScrollableAncestor(target, dialog) {
    let element = target;
    while (element && element !== document.body) {
      if (element.scrollHeight > element.clientHeight + 1) {
        const overflowY = window.getComputedStyle(element).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return element;
      }
      if (element === dialog) break;
      element = element.parentElement;
    }
    return null;
  }

  return {
    hasOpenModalDialog,
    openModalDialog,
    setupModalScrollLock,
    updateModalScrollLock
  };
}
