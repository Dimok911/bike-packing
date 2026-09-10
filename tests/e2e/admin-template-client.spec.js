import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";

const origin = "https://experiment.vniipo-help.ru", pageUrl = origin + "/__admin-template-client";
const save = () => ({ operationId: randomUUID(), kind: "template.save", body: { version: 1, base: { stateRevision: 7 },
  payload: { items: { a: { id: "a", name: "Captured item" } } }, metadata: { title: "Captured title", description: "Private draft", language: "ru" } } });
async function fixture(context) {
  const state = { receipts: new Map(), posts: [], hidden: "", lose: "", admin: true, beforeAck: null };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) throw Error("Unexpected admin test origin");
    if (url.pathname.startsWith("/src/")) return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve("." + url.pathname), "utf8") });
    if (url.pathname === "/__admin-template-client") return route.fulfill({ contentType: "text/html", body: '<!doctype html><script type="module">' +
      "import {createAdminTemplateClient} from '/src/sync/admin-template-client.js';" +
      "import {createExperimentTransport} from '/src/sync/experiment-transport.js';" +
      "window.actor='admin-a';window.generation='one';window.adminMode=true;" +
      "window.adminClient=(suffix='a',enabled=true)=>{const binding={actorId:window.actor,environment:'bike-packing-experiment',listId:'public-demo-state-'+suffix,itemKey:'demo-state:'+suffix};" +
      "const transport=createExperimentTransport({selection:'direct'});return {transport,client:createAdminTemplateClient({binding,enabled,transport,getContext:()=>({...binding,actorId:window.actor,scope:'admin-template',admin:window.adminMode,generation:window.generation})})};};" +
      "window.invoke=async(method,input,suffix='a',enabled=true)=>{try{return {ok:true,value:await adminClient(suffix,enabled).client[method](input)};}catch(error){return {ok:false,code:error.code||'blocked'};}};" +
      "</script>" });
    let data;
    if (url.pathname.endsWith("/auth/me")) data = { ok: true, user: { id: "admin-a" } };
    else if (url.pathname.endsWith("/authorization")) data = { ok: true, authorization: { version: 1, role: state.admin ? "admin" : "user", capabilities: state.admin ? ["templates:write"] : [] } };
    else if (url.pathname.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api", capabilities: ["adminTemplateCausalOperationsV1"] };
    else if (request.method() === "POST") {
      const input = request.postDataJSON(), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input });
      state.posts.push(input);
      const { id, ...binding } = intent, { body, ...metadata } = binding, cancel = url.pathname.endsWith("/cancel");
      if (!state.receipts.has(id)) state.receipts.set(id, { operation: { id, ...metadata, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: cancel ? "rejected" : "committed" },
        result: { status: cancel ? 409 : 200, payload: cancel ? { ok: false, code: "operation_cancelled",
          cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } }
          : { ok: true, listId: intent.listId, itemKey: intent.itemKey, stateRevision: 8, visibility: "private", indexes: [] } } });
      await state.beforeAck?.();
      if (id === state.lose) { state.hidden = id; return route.abort("failed"); }
      data = { ok: true, ...state.receipts.get(id) };
    } else {
      const id = url.pathname.split("/").at(-1); if (id === state.hidden) return route.abort("failed");
      data = { ok: true, ...(state.receipts.get(id) || { operation: { id, state: "unknown" } }) };
    }
    return route.fulfill({ json: data });
  });
  return state;
}
const open = async page => { await page.goto(pageUrl); await page.waitForFunction(() => Boolean(window.invoke)); };
const invoke = (page, method, input, suffix = "a", enabled = true) => page.evaluate(args => window.invoke(...args), [method, input, suffix, enabled]);

test("administrative native journal recovers lost ACK after reload with the same candidate and one POST", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); await invoke(page, "capture", action);
  state.lose = action.operationId; expect((await invoke(page, "run", action.operationId)).ok).toBe(false);
  await open(page); state.lose = ""; state.hidden = "";
  expect((await invoke(page, "run", action.operationId)).value.operation.state).toBe("committed"); expect(state.posts).toHaveLength(1);
  expect((await invoke(page, "read", action.operationId)).value.intent.body).toEqual(action.body);
  expect(await page.evaluate(() => JSON.stringify(adminClient().transport.writes))).not.toContain("Private draft");
});
test("two administrative tabs coordinate the original UUID using native Web Locks", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); const other = await context.newPage(); await open(other);
  await Promise.all([invoke(page, "capture", action), invoke(other, "capture", action)]);
  const results = await Promise.all([invoke(page, "run", action.operationId), invoke(other, "run", action.operationId)]);
  expect(results.every(result => result.ok)).toBe(true); expect(state.posts).toHaveLength(1);
  const changed = structuredClone(action); changed.body.metadata.title = "New title";
  expect((await invoke(other, "capture", changed)).ok).toBe(false);
});
test("OFF prohibits administrative writes and keeps previously accepted status readable", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page);
  expect((await invoke(page, "capture", action, "a", false)).ok).toBe(false); expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await invoke(page, "capture", action); await invoke(page, "run", action.operationId); await open(page);
  expect((await invoke(page, "inspect", action.operationId, "a", false)).value.operation.state).toBe("committed"); expect(state.posts).toHaveLength(1);
});
test("native quota failure preserves the captured action without sending it", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); await invoke(page, "capture", action);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  expect((await invoke(page, "run", action.operationId)).ok).toBe(false); expect(state.posts).toHaveLength(0);
  await open(page); expect((await invoke(page, "run", action.operationId)).ok).toBe(true); expect(state.posts).toHaveLength(1);
});
test("loss of current administrator rights and exit from admin mode block dispatch", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); await invoke(page, "capture", action);
  state.admin = false; expect((await invoke(page, "run", action.operationId)).ok).toBe(false);
  state.admin = true; await page.evaluate(() => window.adminMode = false); expect((await invoke(page, "run", action.operationId)).ok).toBe(false);
  expect(state.posts).toHaveLength(0);
});
test("route change during ACK prevents adoption; reload recovers the exact receipt", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); await invoke(page, "capture", action);
  state.beforeAck = () => page.evaluate(() => window.generation = "different-route");
  expect((await invoke(page, "run", action.operationId)).ok).toBe(false); state.beforeAck = null; await open(page);
  expect((await invoke(page, "run", action.operationId)).ok).toBe(true); expect(state.posts).toHaveLength(1);
});
test("cancellation survives lost reply; unrelated administrative templates continue", async ({ page, context }) => {
  const state = await fixture(context), action = save(); await open(page); await invoke(page, "capture", action);
  state.lose = action.operationId; expect((await invoke(page, "cancel", action.operationId)).ok).toBe(false);
  const second = save(); await invoke(page, "capture", second, "b"); expect((await invoke(page, "run", second.operationId, "b")).ok).toBe(true);
  await open(page); state.hidden = ""; state.lose = "";
  expect((await invoke(page, "run", action.operationId)).value.result.payload.code).toBe("operation_cancelled"); expect(state.posts).toHaveLength(2);
});
