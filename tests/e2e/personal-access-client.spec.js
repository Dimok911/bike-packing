import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { personalAccessIntent, canonicalAccessJson } from "../../src/sync/personal-access-protocol.js";
import { isCanonicalExperimentApi, experimentApiCors } from "../fixtures/experiment-api-route.js";

const origin = "https://experiment.vniipo-help.ru", pageUrl = origin + "/__access-client";
const grant = (listId = "list-a") => ({ operationId: randomUUID(), listId, kind: "access.grant",
  body: { version: 1, recipientEmail: "b@example.test", role: "viewer", token: "a".repeat(64),
    expectedGrant: null, dataSource: { stateRevision: 7 } } });

async function fixture(context) {
  const state = { receipts: new Map(), posts: [], hidden: "", lose: "", beforeAck: null };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith("/src/")) return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve("." + url.pathname), "utf8") });
    if (url.origin === origin && url.pathname === "/__access-client") return route.fulfill({ contentType: "text/html", body: '<!doctype html><script type="module">' +
      "import {createPersonalAccessClient} from '/src/sync/personal-access-client.js';" +
      "import {createExperimentTransport} from '/src/sync/experiment-transport.js';" +
      "window.actor='actor-a'; window.generation='one';" +
      "window.access = (listId='list-a',enabled=true)=>{const binding={actorId:window.actor,environment:'bike-packing-experiment',listId};" +
      "const transport=createExperimentTransport({selection:'direct'});" +
      "return {transport,client:createPersonalAccessClient({binding,enabled,transport,getContext:()=>({...binding,actorId:window.actor,scope:'personal',scopeKey:'id:'+window.actor,generation:window.generation})})};};" +
      "window.invoke=async(method,input,listId='list-a',enabled=true)=>{try {return {ok:true,value:await access(listId,enabled).client[method](input)};}catch(error){return {ok:false,code:error.code||'blocked'};}};" +
      "</script>" });
    if (!isCanonicalExperimentApi(url)) throw Error("Unexpected access test API destination: " + url.origin + url.pathname);
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: experimentApiCors });
    let data;
    if (url.pathname.endsWith("/auth/me")) data = { ok: true, user: { id: "actor-a" } };
    else if (url.pathname.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api", capabilities: ["personalCausalListAccessV1"] };
    else if (request.method() === "POST") {
      const input = request.postDataJSON(); state.posts.push({ path: url.pathname, input });
      const intent = personalAccessIntent({ actorId: input.expectedActorId, ...input }), { id, ...binding } = intent;
      if (!state.receipts.has(id)) {
        const cancelled = url.pathname.endsWith("/cancel");
        const payload = intent.kind === "access.grant" ? { ok: true, grant: { shareId: "1", grantOperationId: id, recipientEmail: intent.body.recipientEmail,
          role: intent.body.role, sourceStateRevision: 7 } } : { ok: true, grant: intent.body.grant, revoked: true };
        const { body, ...metadata } = binding;
        state.receipts.set(id, { operation: { ...metadata, id, state: cancelled ? "rejected" : "committed",
          payloadDigest: createHash("sha256").update(canonicalAccessJson(binding)).digest("hex") },
          result: { status: cancelled ? 409 : 200, payload: cancelled ? { ok: false, code: "operation_cancelled",
            cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } : payload } });
      }
      await state.beforeAck?.();
      if (input.operationId === state.lose) { state.hidden = state.lose; return route.abort("failed"); }
      data = { ok: true, ...state.receipts.get(id) };
    } else {
      const id = url.pathname.split("/").at(-1);
      if (id === state.hidden) return route.abort("failed");
      data = { ok: true, ...(state.receipts.get(id) || { operation: { id, state: "unknown" } }) };
    }
    return route.fulfill({ json: data, headers: experimentApiCors });
  });
  return state;
}
const open = async page => { await page.goto(pageUrl); await page.waitForFunction(() => Boolean(window.invoke)); };
const invoke = (page, method, input, listId = "list-a", enabled = true) =>
  page.evaluate(args => window.invoke(...args), [method, input, listId, enabled]);

test("native access journal survives reload and lost ACK with original UUID/token and no duplicate grant", async ({ page, context }) => {
  const state = await fixture(context), action = grant(); await open(page);
  expect((await invoke(page, "capture", action)).ok).toBe(true);
  state.lose = action.operationId; expect((await invoke(page, "run", action.operationId)).ok).toBe(false);
  await page.reload(); await page.waitForFunction(() => Boolean(window.invoke));
  state.lose = ""; state.hidden = "";
  const result = await invoke(page, "run", action.operationId);
  expect(result.value.operation.state).toBe("committed"); expect(state.posts).toHaveLength(1);
  expect((await invoke(page, "read", action.operationId)).value.intent.body.token).toBe(action.body.token);
  const journal = await page.evaluate(() => JSON.stringify(access().transport.writes));
  expect(journal).not.toContain(action.body.token);
});
test("native Web Locks coordinate two tabs without overwriting intent or submitting twice", async ({ page, context }) => {
  const state = await fixture(context), action = grant(); await open(page);
  const other = await context.newPage(); await open(other);
  const captures = await Promise.all([invoke(page, "capture", action), invoke(other, "capture", action)]);
  expect(captures.every(value => value.ok)).toBe(true);
  const results = await Promise.all([invoke(page, "run", action.operationId), invoke(other, "run", action.operationId)]);
  expect(results.every(value => value.ok && value.value.operation.state === "committed")).toBe(true); expect(state.posts).toHaveLength(1);
  const changed = { ...action, body: { ...action.body, role: "editor" } };
  expect((await invoke(other, "capture", changed)).ok).toBe(false);
});
test("access OFF blocks durable capture while historical receipt survives reload and stays readable", async ({ page, context }) => {
  const state = await fixture(context), action = grant(); await open(page);
  expect((await invoke(page, "capture", action, "list-a", false)).ok).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await invoke(page, "capture", action); await invoke(page, "run", action.operationId); await open(page);
  expect((await invoke(page, "inspect", action.operationId, "list-a", false)).value.operation.state).toBe("committed");
  expect((await invoke(page, "run", action.operationId, "list-a", false)).ok).toBe(false);
  expect((await invoke(page, "cancel", action.operationId, "list-a", false)).ok).toBe(false); expect(state.posts).toHaveLength(1);
});
test("native journal preserves cancellation through reload without dispatching the grant", async ({ page, context }) => {
  const state = await fixture(context), action = grant(); await open(page); await invoke(page, "capture", action);
  state.lose = action.operationId; expect((await invoke(page, "cancel", action.operationId)).ok).toBe(false);
  await open(page); state.lose = ""; state.hidden = "";
  const result = await invoke(page, "run", action.operationId);
  expect(result.value.result.payload.code).toBe("operation_cancelled"); expect(state.posts).toHaveLength(1);
  expect(state.posts[0].path).toContain("/cancel");
});
for (const failure of ["context", "quota"]) {
  test("native " + failure + " change after commit preserves the original request for recovery", async ({ page, context }) => {
    const state = await fixture(context), action = grant(); await open(page); await invoke(page, "capture", action);
    state.beforeAck = () => page.evaluate(mode => {
      if (mode === "context") window.actor = "actor-b";
      else Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
    }, failure);
    expect((await invoke(page, "run", action.operationId)).ok).toBe(false);
    state.beforeAck = null; await open(page);
    expect((await invoke(page, "run", action.operationId)).value.operation.state).toBe("committed"); expect(state.posts).toHaveLength(1);
  });
}
test("unknown access ACK on one list does not block another list in the same browser", async ({ page, context }) => {
  const state = await fixture(context), first = grant(), second = grant("list-b"); await open(page);
  await invoke(page, "capture", first); state.lose = first.operationId;
  expect((await invoke(page, "run", first.operationId)).ok).toBe(false);
  expect((await invoke(page, "capture", second, "list-b")).ok).toBe(true);
  expect((await invoke(page, "run", second.operationId, "list-b")).value.operation.state).toBe("committed");
  state.lose = ""; state.hidden = "";
  expect((await invoke(page, "run", first.operationId)).value.operation.state).toBe("committed"); expect(state.posts).toHaveLength(2);
});
