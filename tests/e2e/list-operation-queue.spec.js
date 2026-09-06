import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

const origin = "https://experiment.vniipo-help.ru";
async function fixture(page, context) {
  const state = { posts: [], receipts: new Map(), lose: false, unknown: false, revision: 1, beforeAck: null };
  const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate",
    "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" };
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname.startsWith("/src/")) return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    if (url.pathname === "/__list-queue-test") return route.fulfill({ contentType: "text/html", body: `<script type="module">
      import {createExperimentTransport} from '/src/sync/experiment-transport.js';
      import {createListOperationQueue} from '/src/sync/list-operation-queue.js';
      import {apiFetchRequest} from '/src/sync/api-client.js';
      window.generation='generation-1'; window.actorId='actor-a';
      const transport=createExperimentTransport({selection:sessionStorage.getItem('list-route')||'direct',euEnabled:true});
      const queue=createListOperationQueue({transport,enabled:true,getContext:()=>({actorId:window.actorId,generation:window.generation,scope:'personal'})});
      window.run=async()=>{try {const result=await apiFetchRequest('/bike-packing/lists/list-a',{method:'PUT',body:JSON.stringify({payload:{items:{}}})},{transport,listQueue:queue});return {ok:true,id:result.list.id};}
        catch(error){return {ok:false,ambiguous:!!error.isAmbiguousMutation};}};
      window.entries=()=>transport.writes;
    </script>` });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let data;
    if (url.pathname.endsWith("/capabilities")) data = { apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
      capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "personalListDatabaseOperationsV1"] };
    else if (url.pathname.endsWith("/auth/me")) data = { user: { id: "actor-a" } };
    else if (url.pathname.endsWith("/freshness")) data = { stateRevision: state.revision };
    else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); state.posts.push({ url: url.toString(), body });
      const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
      const payloadDigest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
      data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest, state: "committed" },
        result: { status: 200, payload: { ok: true, list: { id: body.listId, stateRevision: 1 } } } };
      state.receipts.set(body.operationId, data);
      await state.beforeAck?.();
      if (state.lose) return route.abort("failed");
    } else if (url.pathname.includes("/list-operations/")) data = state.unknown
      ? { ok: true, operation: { state: "unknown" } } : state.receipts.get(url.pathname.split("/").at(-1));
    else return route.abort();
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/__list-queue-test`);
  await page.waitForFunction(() => Boolean(window.run));
  return state;
}

test("cold queue preserves the ID across lost ACK, page reload and direct/EU route change", async ({ page, context }) => {
  const f = await fixture(page, context); f.lose = true; f.unknown = true;
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  const id = f.posts[0].body.operationId;
  await page.evaluate(() => sessionStorage.setItem("list-route", "eu"));
  f.unknown = false;
  await page.reload(); await page.waitForFunction(() => Boolean(window.run));
  expect(await page.evaluate(() => window.run())).toEqual({ ok: true, id: "list-a" });
  expect(f.posts).toHaveLength(1);
  expect(await page.evaluate(() => window.entries()[0].id)).toBe(id);
});

test("concurrent tabs submit one logical action once; its acknowledged replay stays GET-only", async ({ page, context }) => {
  const f = await fixture(page, context);
  const other = await context.newPage(); await other.goto(`${origin}/__list-queue-test`);
  await other.waitForFunction(() => Boolean(window.run));
  const results = await Promise.all([page.evaluate(() => window.run()), other.evaluate(() => window.run())]);
  expect(results.every(result => result.ok)).toBe(true); expect(f.posts).toHaveLength(1);
  await other.reload(); await other.waitForFunction(() => Boolean(window.run));
  expect((await other.evaluate(() => window.run())).ok).toBe(true); expect(f.posts).toHaveLength(1);
});

test("new local edits during a request and newer server revisions reject historical application", async ({ page, context }) => {
  const f = await fixture(page, context);
  f.beforeAck = () => page.evaluate(() => { window.generation = "new-edit"; });
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  expect(f.posts).toHaveLength(1);
  f.beforeAck = null; f.revision = 2;
  await page.reload(); await page.waitForFunction(() => Boolean(window.run));
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  expect(f.posts).toHaveLength(1);
});
