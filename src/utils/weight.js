export function parseWeightInput(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

export function parseVolumeInput(value) {
  const number = Number(String(value || "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 10) / 10;
}

export function formatVolume(liters) {
  const number = Number(liters || 0);
  if (!number) return "0 л";
  return `${String(number).replace(".", ",")} л`;
}

export function formatWeight(grams) {
  if (!grams) return "0 г";
  if (grams < 1000) return `${grams} г`;
  return `${(grams / 1000).toFixed(1).replace(".", ",")} кг`;
}
