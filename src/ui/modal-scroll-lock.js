import {
  currentViewportScrollPosition,
  scrollViewportTo,
  viewportScrollHost
} from "./viewport-scroll-host.js";

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
    const position = currentViewportScrollPosition();
    const scrollHost = softLock ? viewportScrollHost() : null;
    modalScrollLock = {
      softLock,
      scrollHost,
      scrollHostOverflow: scrollHost?.style?.overflow || "",
      x: position.x,
      y: position.y,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.body.classList.add("modal-scroll-locked");
    if (softLock) {
      if (scrollHost?.style) scrollHost.style.overflow = "hidden";
      return;
    }
    document.body.style.position = "fixed";
    document.body.style.top = `-${modalScrollLock.y}px`;
    document.body.style.left = `-${modalScrollLock.x}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScrollForModal() {
    if (!modalScrollLock) return;
    const {
      softLock,
      scrollHost,
      scrollHostOverflow,
      x,
      y,
      position,
      top,
      left,
      right,
      width,
      overflow
    } = modalScrollLock;
    modalScrollLock = null;
    document.body.classList.remove("modal-scroll-locked");
    if (softLock) {
      if (scrollHost?.style) scrollHost.style.overflow = scrollHostOverflow;
      return;
    }
    document.body.style.position = position;
    document.body.style.top = top;
    document.body.style.left = left;
    document.body.style.right = right;
    document.body.style.width = width;
    document.body.style.overflow = overflow;
    scrollViewportTo({ left: x, top: y, behavior: "auto" });
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
      if (event.target.closest?.("[data-modal-scroll-control]")) return;
      // A gesture-owned dialog (for example the fullscreen photo gallery)
      // resolves horizontal swipes and zoom itself. When it is opened above
      // an edit dialog, the background lock must not cancel those events.
      if (dialog.hasAttribute?.("data-modal-gesture-surface")) return;
      const currentY = event.touches?.[0]?.clientY || modalTouchStartY;
      const deltaY = currentY - modalTouchStartY;
      if (eventTargetsDialogContent(event, dialog)
        && canScrollInsideOpenDialog(event.target, dialog, deltaY)) return;
    }
    stopBackgroundModalEvent(event);
  }

  function preventBackgroundModalWheel(event) {
    if (!modalScrollLock) return;
    const dialog = event.target.closest?.("dialog");
    if (dialog?.open && dialog.hasAttribute?.("data-modal-gesture-surface")) return;
    if (dialog?.open
      && eventTargetsDialogContent(event, dialog)
      && canScrollInsideOpenDialog(event.target, dialog, -event.deltaY)) return;
    stopBackgroundModalEvent(event);
  }

  function eventTargetsDialogContent(event, dialog) {
    if (event.target !== dialog) return true;
    const point = event.touches?.[0] || event;
    const x = Number(point?.clientX);
    const y = Number(point?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const rect = dialog.getBoundingClientRect?.();
    if (!rect) return true;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function stopBackgroundModalEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }

  function canScrollInsideOpenDialog(target, dialog, deltaY) {
    if (!deltaY) return true;
    let scroller = findModalScrollableAncestor(target, dialog);
    while (scroller) {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      if (maxScroll > 0) {
        if (deltaY > 0 && scroller.scrollTop > 0) return true;
        if (deltaY < 0 && scroller.scrollTop < maxScroll - 1) return true;
      }
      // When a nested field has reached its edge, keep looking for the
      // dialog card. Leaving the event native lets Safari hand the same
      // gesture from the field to the modal instead of freezing it.
      scroller = findModalScrollableAncestor(scroller.parentElement, dialog);
    }
    return false;
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
