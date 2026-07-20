import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  finishAppStartup,
  renderBeforeFinishingAppStartup,
  resolveAppStartupLanguage
} from "../../src/ui/app-startup.js";

test("CRITICAL offline-start: the static shell shows a neutral startup state instead of the auth gate", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(html, /<body class="app-starting auth-gated">/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Bikepacking List<\/title>/);
  assert.match(html, /<section class="app-startup" lang="en"[^>]*aria-busy="true"/);
  assert.match(html, /<h2 id="appStartupTitle">Opening bikepacking list<\/h2>/);
  assert.match(html, /<p id="appStartupText">Loading the list, item, or bag\.\.\.<\/p>/);
  assert.ok(html.indexOf('class="app-startup"') < html.indexOf('class="auth-gate"'));
  assert.match(styles, /body\.app-starting \.topbar,[\s\S]*display: none !important/);
  assert.match(styles, /body\.app-starting \.auth-gate,[\s\S]*body\.app-starting \.auth-required[\s\S]*display: none !important/);
  assert.match(styles, /body\.app-ready \.topbar,[\s\S]*animation: app-content-reveal 360ms/);
  assert.match(styles, /animation: app-content-reveal 360ms[^;]*backwards/);
  assert.doesNotMatch(styles, /animation: app-content-reveal 360ms[^;]*both/);
  assert.match(styles, /\.topbar \{[\s\S]*?position: relative;[\s\S]*?z-index: 80;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
});

test("startup language defaults to English and uses the UI language only for a known user session", () => {
  assert.equal(resolveAppStartupLanguage({ uiLanguage: "ru" }), "en");
  assert.equal(resolveAppStartupLanguage({ uiLanguage: "ru", authenticated: true }), "ru");
  assert.equal(resolveAppStartupLanguage({ uiLanguage: "ru", rememberedSession: true }), "ru");
  assert.equal(resolveAppStartupLanguage({ uiLanguage: "en", authenticated: true }), "en");
});

test("CRITICAL offline-start: normal startup stays covered until auth, catalogs, and the final render settle", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const startupFlow = source.slice(source.indexOf("  appUnlocked = true;"), source.indexOf("\n}\n\nfunction createEmptyUserState"));

  assert.doesNotMatch(startupFlow, /if \(!sharedListId\) finishAppStartup/);
  assert.match(startupFlow, /await checkAuthAndLoad\(\)/);
  assert.match(startupFlow, /await publicIndexRefresh;[\s\S]*render\(\);[\s\S]*finishAppStartup\(document\);/);
});

test("shared-link startup stays covered until the resolved content has rendered", () => {
  const classes = new Set(["app-starting", "auth-gated"]);
  const attributes = new Map([["aria-busy", "true"]]);
  const documentRef = {
    body: {
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name)
      }
    },
    querySelector: (selector) => selector === ".app-startup"
      ? { setAttribute: (name, value) => attributes.set(name, value) }
      : null
  };
  let renderedWhileCovered = false;

  renderBeforeFinishingAppStartup({
    documentRef,
    render: () => {
      renderedWhileCovered = documentRef.body.classList.contains("app-starting");
    }
  });

  assert.equal(renderedWhileCovered, true);
  assert.equal(documentRef.body.classList.contains("app-starting"), false);
  assert.equal(documentRef.body.classList.contains("app-ready"), true);
  assert.equal(attributes.get("aria-busy"), "false");
});

test("finishing startup is safe when the loading section is absent", () => {
  const added = [];
  const removed = [];
  finishAppStartup({
    body: { classList: { add: (name) => added.push(name), remove: (name) => removed.push(name) } },
    querySelector: () => null
  });
  assert.deepEqual(added, ["app-ready"]);
  assert.deepEqual(removed, ["app-starting"]);
});
