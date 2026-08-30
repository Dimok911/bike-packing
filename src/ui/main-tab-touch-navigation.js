const TAP_MOVE_LIMIT_PX = 10;
const PACKING_DOUBLE_TAP_MS = 360;
const SYNTHETIC_CLICK_SUPPRESSION_MS = 700;

function touchPoint(event) {
  return event?.touches?.[0] || event?.changedTouches?.[0] || null;
}

function stopSyntheticActivation(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

// iOS Safari can focus a sticky button without delivering the synthetic click,
// especially while another native scroll view is settling. Handle a completed
// touch tap directly and release touch focus before the next vertical gesture.
export function bindMainTabTouchNavigation(tabs, {
  documentRef = document,
  now = () => Date.now(),
  onPackingDoubleTap = () => {},
  onSelect = () => {},
  requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback)
} = {}) {
  const tabList = [...(tabs || [])].filter(Boolean);
  let gesture = null;
  let lastPackingTapAt = 0;
  let suppressClicksUntil = 0;

  const releaseTouchFocus = (tab) => {
    const blur = () => {
      if (documentRef?.activeElement === tab) tab.blur?.();
    };
    blur();
    requestFrame?.(blur);
  };

  const onTouchStart = (event) => {
    const point = event?.touches?.length === 1 ? touchPoint(event) : null;
    const tab = event?.currentTarget;
    gesture = point && tab ? {
      moved: false,
      startX: Number(point.clientX) || 0,
      startY: Number(point.clientY) || 0,
      tab
    } : null;
  };

  const onTouchMove = (event) => {
    const point = touchPoint(event);
    if (!gesture || gesture.tab !== event?.currentTarget || !point) return;
    const distance = Math.hypot(
      (Number(point.clientX) || 0) - gesture.startX,
      (Number(point.clientY) || 0) - gesture.startY
    );
    if (distance > TAP_MOVE_LIMIT_PX) gesture.moved = true;
  };

  const onTouchEnd = (event) => {
    const current = gesture;
    gesture = null;
    if (!current || current.tab !== event?.currentTarget || current.moved) return;
    const point = touchPoint(event);
    if (point && Math.hypot(
      (Number(point.clientX) || 0) - current.startX,
      (Number(point.clientY) || 0) - current.startY
    ) > TAP_MOVE_LIMIT_PX) return;

    stopSyntheticActivation(event);
    const touchedAt = Number(now()) || 0;
    suppressClicksUntil = touchedAt + SYNTHETIC_CLICK_SUPPRESSION_MS;
    const view = String(current.tab.dataset?.view || "");
    if (view) onSelect(view);
    if (view === "packing") {
      if (lastPackingTapAt && touchedAt - lastPackingTapAt <= PACKING_DOUBLE_TAP_MS) {
        lastPackingTapAt = 0;
        onPackingDoubleTap();
      } else {
        lastPackingTapAt = touchedAt;
      }
    } else {
      lastPackingTapAt = 0;
    }
    releaseTouchFocus(current.tab);
  };

  const onTouchCancel = () => {
    gesture = null;
  };

  const onClick = (event) => {
    if ((Number(now()) || 0) < suppressClicksUntil) {
      stopSyntheticActivation(event);
      releaseTouchFocus(event?.currentTarget);
      return;
    }
    const view = String(event?.currentTarget?.dataset?.view || "");
    if (view) onSelect(view);
  };

  const onDoubleClick = (event) => {
    const tab = event?.currentTarget;
    if (tab?.dataset?.view !== "packing") return;
    event?.preventDefault?.();
    if ((Number(now()) || 0) < suppressClicksUntil) {
      releaseTouchFocus(tab);
      return;
    }
    onSelect("packing");
    onPackingDoubleTap();
  };

  tabList.forEach((tab) => {
    tab.addEventListener?.("click", onClick);
    tab.addEventListener?.("dblclick", onDoubleClick);
    tab.addEventListener?.("touchstart", onTouchStart, { passive: true });
    tab.addEventListener?.("touchmove", onTouchMove, { passive: true });
    tab.addEventListener?.("touchend", onTouchEnd, { passive: false });
    tab.addEventListener?.("touchcancel", onTouchCancel, { passive: true });
  });

  return () => {
    gesture = null;
    tabList.forEach((tab) => {
      tab.removeEventListener?.("click", onClick);
      tab.removeEventListener?.("dblclick", onDoubleClick);
      tab.removeEventListener?.("touchstart", onTouchStart);
      tab.removeEventListener?.("touchmove", onTouchMove);
      tab.removeEventListener?.("touchend", onTouchEnd);
      tab.removeEventListener?.("touchcancel", onTouchCancel);
    });
  };
}
