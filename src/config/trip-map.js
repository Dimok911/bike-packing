// Browser key: restrict it to approved website domains in the Yandex dashboard.
// Configure in ignored .env.local before building; never store OAuth/server secrets here.
export const YANDEX_MAPS_API_KEY = String(import.meta.env?.VITE_YANDEX_MAPS_API_KEY || "").trim();
