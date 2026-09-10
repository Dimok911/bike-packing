function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolvePhotoLightboxWheelScale({ scale = 1, deltaY = 0, deltaMode = 0, ctrlKey = false, pageHeight = 800 } = {}) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, finiteNumber(pageHeight, 800)) : 1;
  // Trackpad pinch emits small Ctrl+wheel deltas. Preserve their magnitude:
  // dividing one gesture into more events must not make it zoom faster.
  const exponent = -finiteNumber(deltaY) * unit * (ctrlKey ? 0.01 : 0.002);
  return Math.max(1, Math.min(4, finiteNumber(scale, 1) * Math.exp(exponent)));
}

export function resolvePhotoLightboxPinchPan({
  startScale,
  nextScale,
  startPanX = 0,
  startPanY = 0,
  startCenterX = 0,
  startCenterY = 0,
  centerX = startCenterX,
  centerY = startCenterY,
  originX = 0,
  originY = 0
} = {}) {
  const safeStartScale = Math.max(Number.EPSILON, finiteNumber(startScale, 1));
  const safeNextScale = Math.max(Number.EPSILON, finiteNumber(nextScale, safeStartScale));
  const safeStartPanX = finiteNumber(startPanX);
  const safeStartPanY = finiteNumber(startPanY);
  const safeOriginX = finiteNumber(originX);
  const safeOriginY = finiteNumber(originY);
  const safeStartCenterX = finiteNumber(startCenterX);
  const safeStartCenterY = finiteNumber(startCenterY);
  const focalX = (safeStartCenterX - safeOriginX - safeStartPanX) / safeStartScale;
  const focalY = (safeStartCenterY - safeOriginY - safeStartPanY) / safeStartScale;

  return {
    x: finiteNumber(centerX, safeStartCenterX) - safeOriginX - focalX * safeNextScale,
    y: finiteNumber(centerY, safeStartCenterY) - safeOriginY - focalY * safeNextScale
  };
}
