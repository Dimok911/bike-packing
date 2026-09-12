// Fixed test contract: never broaden a mock to arbitrary hosts or Production.
export const experimentFrontendOrigin = "https://experiment.vniipo-help.ru";
export const canonicalExperimentApiOrigin = "https://api.vniipo-help.ru";
export const canonicalExperimentApiPrefix = "/experiment/letters-vniipo/api";
export const experimentApiCors = Object.freeze({
  "Access-Control-Allow-Origin": experimentFrontendOrigin,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});
export function isCanonicalExperimentApi(url) {
  return url.origin === canonicalExperimentApiOrigin && !url.username && !url.password
    && url.pathname.startsWith(canonicalExperimentApiPrefix + "/");
}
