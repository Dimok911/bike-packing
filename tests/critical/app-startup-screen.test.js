import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  finishAppStartup,
  renderBeforeFinishingAppStartup
} from "../../src/ui/app-startup.js";

test("CRITICAL offline-start: the static shell shows a neutral startup state instead of the auth gate", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(html, /<body class="app-starting auth-gated">/);
  assert.match(html, /<section class="app-startup"[^>]*aria-busy="true"/);
  assert.ok(html.indexOf('class="app-startup"') < html.indexOf('class="auth-gate"'));
  assert.match(styles, /body\.app-starting \.auth-gate,[\s\S]*body\.app-starting \.auth-required[\s\S]*display: none !important/);
});

test("shared-link startup stays covered until the resolved content has rendered", () => {
  const classes = new Set(["app-starting", "auth-gated"]);
  const attributes = new Map([["aria-busy", "true"]]);
  const documentRef = {
    body: {
      classList: {
        contains: (name) => classes.has(name),
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
  assert.equal(attributes.get("aria-busy"), "false");
});

test("finishing startup is safe when the loading section is absent", () => {
  const removed = [];
  finishAppStartup({
    body: { classList: { remove: (name) => removed.push(name) } },
    querySelector: () => null
  });
  assert.deepEqual(removed, ["app-starting"]);
});
