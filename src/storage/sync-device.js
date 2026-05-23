import { DEVICE_META_KEY } from "../config/constants.js";
import { safeSetLocalStorage } from "../utils/storage.js";

export function loadSyncDevice() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_META_KEY));
    if (saved?.id && saved?.name) return saved;
  } catch {
    // Recreate below.
  }
  const meta = {
    id: globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: guessDeviceName()
  };
  try {
    safeSetLocalStorage(DEVICE_META_KEY, JSON.stringify(meta));
  } catch {
    // Device labels are optional sync metadata.
  }
  return meta;
}

export function guessDeviceName() {
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  return "Это устройство";
}
