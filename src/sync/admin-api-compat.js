export function missingCapabilities(capabilities = [], requiredCapabilities = []) {
  const available = new Set((Array.isArray(capabilities) ? capabilities : [])
    .map((capability) => String(capability || "").trim())
    .filter(Boolean));
  return requiredCapabilities.filter((capability) => !available.has(capability));
}

export function adminApiWarningFromCapabilities(data, {
  appVersion = "",
  requiredVersion = "",
  requiredCapabilities = []
} = {}) {
  const version = String(data?.apiCompatibilityVersion || data?.bikePackingApiCompatibilityVersion || "").trim();
  const capabilities = Array.isArray(data?.capabilities)
    ? data.capabilities
    : (Array.isArray(data?.bikePackingApiCapabilities) ? data.bikePackingApiCapabilities : []);
  const missing = missingCapabilities(capabilities, requiredCapabilities);
  if (!version) {
    return "Админка: API не отдал версию совместимости. Проверьте деплой backend перед публикацией шаблонов.";
  }
  if (version !== requiredVersion) {
    return `Админка: фронт ${appVersion} ждёт API ${requiredVersion}, сейчас ${version}.`;
  }
  if (missing.length) {
    return `Админка: API без нужных возможностей (${missing.join(", ")}). Не публикуйте шаблоны с фото до деплоя backend.`;
  }
  return "";
}
