import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile touch actions leave tab taps and document momentum to the browser", () => {
  const source = readFileSync(new URL("../../src/ui/touch-actions.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  assert.doesNotMatch(source, /preventDoubleTapZoom/);
  assert.doesNotMatch(source, /touchend[\s\S]{0,240}preventDefault/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]{0,500}touch-action:\s*manipulation;/);
  assert.match(html, /name="viewport"[^>]+maximum-scale=1/);
});
