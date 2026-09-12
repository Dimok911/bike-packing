// Host-bound, not a release flag: a shared production build must never acquire
// this label through a stored preference, query string or API route selection.
export function installExperimentBanner({ documentRef = document, locationLike = location } = {}) {
  if (locationLike?.origin !== "https://experiment.vniipo-help.ru") return null;
  const title = documentRef.querySelector(".topbar h1");
  if (!title) return null;
  const existing = documentRef.querySelector("#experimentTitleLabel");
  if (existing) return existing;
  const label = documentRef.createElement("span");
  label.id = "experimentTitleLabel";
  label.className = "experiment-title-label";
  label.textContent = "эксперимент";
  title.setAttribute("data-experiment-title", "");
  title.append(documentRef.createTextNode(" —\u00a0"), label);
  return label;
}
