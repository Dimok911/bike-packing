import {
  REQUIRED_ADMIN_API_CAPABILITIES,
  REQUIRED_ADMIN_API_VERSION
} from "../src/config/api-contract.js";
import { EXPERIMENT_API_BASE } from "../src/config/constants.js";

const apiBase = String(process.env.BIKE_PACKING_API_BASE || EXPERIMENT_API_BASE).replace(/\/$/, "");
const capabilitiesUrl = `${apiBase}/bike-packing/capabilities`;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);

try {
  const response = await fetch(capabilitiesUrl, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    signal: controller.signal
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const liveVersion = String(payload?.apiCompatibilityVersion || "").trim();
  if (liveVersion !== REQUIRED_ADMIN_API_VERSION) {
    throw new Error(`frontend requires ${REQUIRED_ADMIN_API_VERSION}, live API reports ${liveVersion || "no version"}`);
  }
  const available = new Set(Array.isArray(payload?.capabilities) ? payload.capabilities : []);
  const missing = REQUIRED_ADMIN_API_CAPABILITIES.filter((capability) => !available.has(capability));
  if (missing.length) throw new Error(`live API lacks: ${missing.join(", ")}`);
  console.log(`Live Experiment API contract verified: ${liveVersion}; ${REQUIRED_ADMIN_API_CAPABILITIES.length} required capabilities.`);
} catch (error) {
  console.error(`Experiment frontend/API contract check failed at ${capabilitiesUrl}: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
