import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4173;
const SERVER_URL = `http://${HOST}:${PORT}/`;
const DIST_DIR = "www/vniipo-help.ru/bike-packing";
const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_GRACE_MS = 1_500;
const SHUTDOWN_TIMEOUT_MS = 3_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(serverProcess) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`E2E Vite server exited during startup with code ${serverProcess.exitCode}`);
    }
    try {
      const response = await fetch(SERVER_URL);
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error(`E2E Vite server did not start within ${STARTUP_TIMEOUT_MS}ms`);
}

export default async function globalSetup() {
  const viteBin = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
  const catalogRuntime = spawnSync(process.execPath, ["scripts/build-manufacturer-catalog-runtime.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (catalogRuntime.status !== 0) {
    throw new Error(`Manufacturer catalog runtime build failed with code ${catalogRuntime.status ?? "unknown"}`);
  }
  const build = spawnSync(process.execPath, [viteBin, "build", "--outDir", DIST_DIR], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (build.status !== 0) {
    throw new Error(`E2E production build failed with code ${build.status ?? "unknown"}`);
  }
  const finalizeBuild = spawnSync(process.execPath, ["scripts/build-dist-assets.mjs", DIST_DIR], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (finalizeBuild.status !== 0) {
    throw new Error(`E2E production asset finalization failed with code ${finalizeBuild.status ?? "unknown"}`);
  }

  const serverProcess = spawn(process.execPath, [
    viteBin,
    "preview",
    "--host",
    HOST,
    "--port",
    String(PORT),
    "--strictPort",
    "--outDir",
    DIST_DIR,
  ], {
    stdio: "inherit",
    windowsHide: true,
  });

  try {
    await waitForServer(serverProcess);
  } catch (error) {
    serverProcess.kill("SIGKILL");
    throw error;
  }

  return async () => {
    if (serverProcess.exitCode !== null) return;

    const exited = once(serverProcess, "exit");
    serverProcess.kill("SIGTERM");
    const forceKillTimer = setTimeout(() => {
      if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
    }, SHUTDOWN_GRACE_MS);

    await Promise.race([exited, delay(SHUTDOWN_TIMEOUT_MS)]);
    clearTimeout(forceKillTimer);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  };
}
