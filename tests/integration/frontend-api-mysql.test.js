import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import mysql from "mysql2/promise";

const API_BASE_PATH = "/letters-vniipo/api";
const PRODUCTION_API_BASE = "https://api.vniipo-help.ru/letters-vniipo/api";
const COOKIE_NAME = "bikepacking_browser_integration_session";
const TEST_GUARD_ENV = "BIKE_PACKING_BROWSER_INTEGRATION_TEST";
const TEST_DB_NAME_ENV = "BIKE_PACKING_TEST_DB_NAME";
const TEST_DB_NAME_PATTERN = /^[A-Za-z0-9_]*_test(?:_[A-Za-z0-9_]+)?$/;
const TEST_TIMEOUT_MS = 90_000;
const STARTUP_TIMEOUT_MS = 20_000;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, "../..");
const configuredApiDirectory = process.env.BIKE_PACKING_API_DIR || "bikepacking-api";
const apiDirectory = path.resolve(frontendDirectory, configuredApiDirectory);
const artifactDirectory = path.join(frontendDirectory, "test-results/browser-api-mysql");

const dbConfig = {
  host: process.env.BIKE_PACKING_TEST_DB_HOST || "127.0.0.1",
  port: Number(process.env.BIKE_PACKING_TEST_DB_PORT || 3306),
  user: process.env.BIKE_PACKING_TEST_DB_USER || "root",
  password: process.env.BIKE_PACKING_TEST_DB_PASSWORD || "",
  database: process.env[TEST_DB_NAME_ENV] || "bikepacking_frontend_integration_test",
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");

function assertSafeTestDatabase() {
  assert.equal(
    process.env[TEST_GUARD_ENV],
    "1",
    `Refusing to run: set ${TEST_GUARD_ENV}=1 for an isolated disposable MySQL database`
  );
  assert.match(
    dbConfig.database,
    TEST_DB_NAME_PATTERN,
    `Refusing to run: ${TEST_DB_NAME_ENV} must be an explicit test database name ending in _test`
  );
  assert.notEqual(dbConfig.host, "vniipo-help.ru", "Production database host is forbidden");
  assert.notEqual(dbConfig.host, "90.156.128.115", "Production server is forbidden");
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForUrl(url, child, logs, label) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited during startup with code ${child.exitCode}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // The child process is still opening its listener.
    }
    await delay(100);
  }
  throw new Error(`${label} did not start within ${STARTUP_TIMEOUT_MS}ms\n${logs.join("")}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await Promise.race([exited, delay(2_000)]);
}

async function requestJson(baseUrl, route, { token = "", method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, payload };
}

function stateFromApiPayload(payload) {
  const record = payload?.list || payload?.record || payload;
  return record?.payload || record?.state || payload?.payload || payload?.state || null;
}

function stateSummary(payload) {
  const state = stateFromApiPayload(payload);
  if (!state || typeof state !== "object") return "state=missing";
  return [
    `items=${Object.keys(state.items || {}).length}`,
    `containers=${Object.keys(state.containers || {}).length}`,
    `layouts=${Object.keys(state.layouts || {}).length}`,
    `activeLayoutId=${String(state.activeLayoutId || "") || "missing"}`,
  ].join(",");
}

function initialState() {
  return {
    locations: ["Велосипед"],
    categories: ["Ремонт"],
    containers: {
      "bag-browser": {
        id: "bag-browser",
        name: "Тестовая сумка MySQL",
        parentId: null,
        childIds: [],
        itemIds: ["item-browser"],
        order: [{ type: "item", id: "item-browser" }],
        location: "Велосипед",
      },
    },
    items: {
      "item-browser": {
        id: "item-browser",
        name: "Насос из базы данных",
        weight: 120,
        quantity: 1,
        containerId: "bag-browser",
        location: "Велосипед",
        categories: ["Ремонт"],
      },
    },
    layouts: {
      "layout-browser": {
        id: "layout-browser",
        name: "Укладка из настоящего API",
        rootContainerIds: ["bag-browser"],
        arrangement: {
          rootContainerIds: ["bag-browser"],
          containers: {
            "bag-browser": {
              parentId: "",
              childIds: [],
              itemIds: ["item-browser"],
              order: [{ type: "item", id: "item-browser" }],
            },
          },
          items: { "item-browser": "bag-browser" },
          packedItems: {},
        },
      },
    },
    activeLayoutId: "layout-browser",
    packedItems: {},
  };
}

async function installApiProxy(context, apiBaseUrl, frontendOrigin, token, requestLog) {
  await context.route(`${PRODUCTION_API_BASE}/**`, async (route) => {
    const request = route.request();
    const productionUrl = new URL(request.url());
    const localUrl = new URL(`${productionUrl.pathname}${productionUrl.search}`, apiBaseUrl);
    const headers = { ...request.headers() };
    delete headers.host;
    headers.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
    headers.origin = frontendOrigin;
    let response;
    try {
      response = await route.fetch({ url: localUrl.toString(), headers });
    } catch (error) {
      if (/request context disposed|target page, context or browser has been closed/i.test(error.message)) {
        requestLog.push(`${request.method()} ${productionUrl.pathname}${productionUrl.search} -> cancelled while closing browser`);
        return;
      }
      throw error;
    }
    let responseSummary = "";
    if (request.method() === "GET" && /\/bike-packing\/lists\/[^/]+\/state$/.test(productionUrl.pathname)) {
      try {
        responseSummary = ` (${stateSummary(await response.json())})`;
      } catch (error) {
        responseSummary = ` (state response could not be decoded: ${error.message})`;
      }
    } else if (request.method() === "POST" && /\/bike-packing\/lists\/[^/]+\/items\/sync$/.test(productionUrl.pathname)) {
      try {
        const payload = await response.json();
        responseSummary = ` (upserted=${JSON.stringify(payload?.upserted || [])},conflicts=${JSON.stringify(payload?.conflicts || [])})`;
      } catch (error) {
        responseSummary = ` (item sync response could not be decoded: ${error.message})`;
      }
    }
    requestLog.push(`${request.method()} ${productionUrl.pathname}${productionUrl.search} -> ${response.status()}${responseSummary}`);
    await route.fulfill({ response });
  });
}

async function openAuthenticatedPage(browser, frontendUrl, apiBaseUrl, token, requestLog) {
  const context = await browser.newContext({ locale: "ru-RU", serviceWorkers: "block" });
  await installApiProxy(context, apiBaseUrl, new URL(frontendUrl).origin, token, requestLog);
  await context.addInitScript(() => {
    localStorage.setItem("bike-packing-language-v1", "ru");
  });
  const page = await context.newPage();
  await page.goto(frontendUrl);
  await page.locator("body.app-ready").waitFor({ timeout: 20_000 });
  return { context, page };
}

async function selectDatabaseLayout(page) {
  const option = page.locator("#layoutSelect option").filter({ hasText: "Укладка из настоящего API" });
  try {
    await option.waitFor({ state: "attached", timeout: 20_000 });
  } catch (error) {
    const optionTexts = await page.locator("#layoutSelect option").allTextContents();
    const syncStatus = await page.locator("#syncStatus").textContent().catch(() => "");
    const storedLayouts = await page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((key) => {
        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          const layouts = parsed?.layouts && typeof parsed.layouts === "object"
            ? Object.values(parsed.layouts).map((layout) => ({ id: layout?.id, name: layout?.name }))
            : [];
          return [key, layouts];
        } catch {
          return [key, []];
        }
      }).filter(([, layouts]) => layouts.length)
    ));
    throw new Error([
      error.message,
      `Layout options: ${JSON.stringify(optionTexts)}`,
      `Sync status: ${JSON.stringify(syncStatus)}`,
      `Stored layouts: ${JSON.stringify(storedLayouts)}`,
    ].join("\n"), { cause: error });
  }
  assert.equal(await option.textContent(), "Укладка из настоящего API");
  const optionValue = await option.getAttribute("value");
  assert.ok(optionValue, "The database layout option must have a selectable value");
  await page.locator("#layoutSelect").selectOption(optionValue);
}

async function poll(description, check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`${description} did not become true within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ""}`);
}

test("frontend browser saves through the real API and restores from MySQL", { timeout: TEST_TIMEOUT_MS }, async () => {
  assertSafeTestDatabase();
  await rm(artifactDirectory, { recursive: true, force: true });
  await mkdir(artifactDirectory, { recursive: true });

  let adminConnection;
  let pool;
  let apiProcess;
  let viteProcess;
  let browser;
  let browserContext;
  let page;
  const apiLogs = [];
  const viteLogs = [];
  const requestLog = [];

  try {
    adminConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true,
    });
    const escapedDatabase = `\`${dbConfig.database}\``;
    await adminConnection.query(`DROP DATABASE IF EXISTS ${escapedDatabase}`);
    await adminConnection.query(
      `CREATE DATABASE ${escapedDatabase} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );

    const schemaSql = await readFile(path.join(apiDirectory, "docs/personal-tags-db.sql"), "utf8");
    const schemaConnection = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
    try {
      await schemaConnection.query(schemaSql);
    } finally {
      await schemaConnection.end();
    }

    pool = mysql.createPool({ ...dbConfig, connectionLimit: 4 });
    const userId = randomUUID();
    const email = "browser-api@example.test";
    const token = `browser-api-${randomUUID()}`;
    await pool.query(
      "INSERT INTO users (id, email, email_normalized) VALUES (?, ?, ?)",
      [userId, email, email]
    );
    await pool.query(
      `INSERT INTO sessions (id, user_id, session_token_hash, expires_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL 1 DAY)`,
      [randomUUID(), userId, sha256(token)]
    );

    const apiPort = await reservePort();
    const vitePort = await reservePort();
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    const frontendUrl = `http://127.0.0.1:${vitePort}/`;
    apiProcess = spawn(process.execPath, ["server.mjs"], {
      cwd: apiDirectory,
      env: {
        ...process.env,
        PERSONAL_TAGS_SERVER_HOST: "127.0.0.1",
        PERSONAL_TAGS_SERVER_PORT: String(apiPort),
        PERSONAL_TAGS_DB_HOST: dbConfig.host,
        PERSONAL_TAGS_DB_PORT: String(dbConfig.port),
        PERSONAL_TAGS_DB_USER: dbConfig.user,
        PERSONAL_TAGS_DB_PASSWORD: dbConfig.password,
        PERSONAL_TAGS_DB_DATABASE: dbConfig.database,
        PERSONAL_TAGS_SERVER_ALLOW_ORIGIN: new URL(frontendUrl).origin,
        PERSONAL_TAGS_SESSION_COOKIE_NAME: COOKIE_NAME,
        PERSONAL_TAGS_SESSION_COOKIE_SECURE: "0",
        PERSONAL_TAGS_TRUST_USER_ID_HEADER: "0",
        BIKE_PACKING_PHOTOS_STORAGE_DIR: path.join(artifactDirectory, "photos"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    apiProcess.stdout.on("data", (chunk) => apiLogs.push(chunk.toString()));
    apiProcess.stderr.on("data", (chunk) => apiLogs.push(chunk.toString()));
    await waitForUrl(`${apiBaseUrl}/healthz`, apiProcess, apiLogs, "API server");

    const viteBin = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
    viteProcess = spawn(process.execPath, [
      viteBin,
      "--host", "127.0.0.1",
      "--port", String(vitePort),
      "--strictPort",
    ], {
      cwd: frontendDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    viteProcess.stdout.on("data", (chunk) => viteLogs.push(chunk.toString()));
    viteProcess.stderr.on("data", (chunk) => viteLogs.push(chunk.toString()));
    await waitForUrl(frontendUrl, viteProcess, viteLogs, "Vite server");

    const lists = await requestJson(apiBaseUrl, `${API_BASE_PATH}/bike-packing/lists`, { token });
    assert.equal(lists.status, 200, JSON.stringify(lists.payload));
    const defaultList = lists.payload?.lists?.find((list) => list?.isDefault) || lists.payload?.lists?.[0];
    const listId = defaultList?.id;
    assert.ok(listId, `The API did not create a default list: ${JSON.stringify(lists.payload)}`);
    const seeded = await requestJson(
      apiBaseUrl,
      `${API_BASE_PATH}/bike-packing/lists/${encodeURIComponent(listId)}`,
      {
        token,
        method: "PUT",
        body: {
          title: "Browser integration list",
          payload: initialState(),
          force: true,
          forceOverwrite: true,
          fullReplace: true,
          baseStateRevision: defaultList.stateRevision,
          baseServerUpdatedAt: defaultList.updatedAt || defaultList.serverUpdatedAt,
        },
      }
    );
    assert.equal(seeded.status, 200, JSON.stringify(seeded.payload));
    const seededState = await requestJson(
      apiBaseUrl,
      `${API_BASE_PATH}/bike-packing/lists/${encodeURIComponent(listId)}/state`,
      { token }
    );
    assert.equal(seededState.status, 200, JSON.stringify(seededState.payload));
    assert.equal(
      seededState.payload?.state?.containers?.["bag-browser"]?.name,
      "Тестовая сумка MySQL",
      `The API did not preserve the seeded browser bag: ${JSON.stringify(seededState.payload)}`
    );
    assert.equal(
      seededState.payload?.state?.items?.["item-browser"]?.name,
      "Насос из базы данных",
      `The API did not preserve the seeded browser item: ${JSON.stringify(seededState.payload)}`
    );
    assert.equal(
      seededState.payload?.state?.layouts?.["layout-browser"]?.name,
      "Укладка из настоящего API",
      `The API did not preserve the seeded browser layout: ${JSON.stringify(seededState.payload)}`
    );

    browser = await chromium.launch();
    ({ context: browserContext, page } = await openAuthenticatedPage(browser, frontendUrl, apiBaseUrl, token, requestLog));
    await page.locator("#syncUserEmail").waitFor({ state: "visible", timeout: 20_000 });
    const displayedEmail = (await page.locator("#syncUserEmail").textContent()).replaceAll("\u200b", "");
    assert.match(displayedEmail, /browser-api@example\.test/);
    await selectDatabaseLayout(page);

    const item = page.locator('#packingView [data-item-id="item-browser"]');
    await item.waitFor({ state: "visible" });
    assert.match(await item.textContent(), /Насос из базы данных/);
    await item.locator(".item-title-hitarea").click();
    await page.locator("#itemDialog").waitFor({ state: "visible" });
    const changedName = "Насос сохранён в базе данных";
    const itemNameInput = page.locator("#itemName");
    assert.equal(await itemNameInput.inputValue(), "Насос из базы данных");
    await itemNameInput.fill(changedName);
    assert.equal(await itemNameInput.inputValue(), changedName);
    assert.equal(await page.locator("#saveItemBtn").isEnabled(), true, "The item save button did not become enabled");
    await page.locator("#saveItemBtn").click();
    await page.locator("#itemDialog").waitFor({ state: "hidden" });
    const editedLocally = await poll("browser state containing the local item edit", async () => {
      return (await item.textContent()).includes(changedName);
    }, 3_000).catch(() => false);
    if (!editedLocally) {
      const localItemCopies = await page.evaluate(() => Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.includes("bike-packing-prototype-state-v1"))
          .map((key) => {
            try {
              return [key, JSON.parse(localStorage.getItem(key))?.items?.["item-browser"] || null];
            } catch {
              return [key, null];
            }
          })
      ));
      throw new Error([
        "The browser did not apply the item edit locally",
        `Rendered item: ${JSON.stringify(await item.textContent())}`,
        `Stored item copies: ${JSON.stringify(localItemCopies)}`,
      ].join("\n"));
    }
    await page.locator("#syncBtn").click();

    let lastApiState = null;
    await poll("API state containing the browser edit", async () => {
      const state = await requestJson(
        apiBaseUrl,
        `${API_BASE_PATH}/bike-packing/lists/${encodeURIComponent(listId)}/state`,
        { token }
      );
      lastApiState = state;
      return state.status === 200 && state.payload?.state?.items?.["item-browser"]?.name === changedName;
    }).catch((error) => {
      const lastItem = lastApiState?.payload?.state?.items?.["item-browser"] || null;
      throw new Error(`${error.message}; last API item: ${JSON.stringify(lastItem)}`, { cause: error });
    });
    await poll("MySQL entity row containing the browser edit", async () => {
      const [[row]] = await pool.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')) AS name
         FROM bike_packing_items WHERE list_id = ? AND item_id = ? AND deleted_at IS NULL`,
        [listId, "item-browser"]
      );
      return row?.name === changedName;
    });

    await browserContext.close();
    browserContext = null;
    ({ context: browserContext, page } = await openAuthenticatedPage(browser, frontendUrl, apiBaseUrl, token, requestLog));
    await page.locator("#syncUserEmail").waitFor({ state: "visible", timeout: 20_000 });
    await selectDatabaseLayout(page);
    const restoredItem = page.locator('#packingView [data-item-id="item-browser"]');
    await restoredItem.waitFor({ state: "visible" });
    assert.match(await restoredItem.textContent(), new RegExp(changedName));
  } catch (error) {
    throw new Error([
      error.message,
      requestLog.length ? `Proxied API requests:\n${requestLog.join("\n")}` : "",
      apiLogs.length ? `API output:\n${apiLogs.join("")}` : "",
      viteLogs.length ? `Vite output:\n${viteLogs.join("")}` : "",
    ].filter(Boolean).join("\n"), { cause: error });
  } finally {
    await browserContext?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await stopChild(viteProcess);
    await stopChild(apiProcess);
    await writeFile(path.join(artifactDirectory, "api.log"), apiLogs.join(""), "utf8").catch(() => {});
    await writeFile(path.join(artifactDirectory, "vite.log"), viteLogs.join(""), "utf8").catch(() => {});
    if (pool) await pool.end();
    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${dbConfig.database}\``).catch(() => {});
      await adminConnection.end();
    }
  }
});
