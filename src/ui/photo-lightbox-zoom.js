function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
