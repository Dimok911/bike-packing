// Host-bound, not a release flag: a shared production build must never acquire
// this label through a stored preference, query string or API route selection.
export function installExperimentBanner({ documentRef = document, locationLike = location } = {}) {
  if (locationLike?.origin !== "https://experiment.vniipo-help.ru") return null;
  const app = documentRef.querySelector(".app");
  if (!app) return null;
  const existing = documentRef.querySelector("#experimentBanner");
  if (existing) return existing;
  const banner = documentRef.createElement("div");
  banner.id = "experimentBanner";
  banner.className = "experiment-banner";
  banner.setAttribute("role", "note");
  banner.textContent = "ЭКСПЕРИМЕНТ";
  app.prepend(banner);
  return banner;
}
