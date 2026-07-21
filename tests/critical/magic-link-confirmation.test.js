import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  magicLinkErrorI18nKey,
  magicLinkTokenFromInput
} from "../../src/auth/magic-link-confirmation.js";

test("magic link confirmation accepts a full link, pasted message, or raw code", () => {
  const token = "abcdefghijklmnopqrstuvwxyz_1234567890";
  assert.equal(magicLinkTokenFromInput(`https://api.example.test/auth/verify-magic-link?token=${token}`), token);
  assert.equal(magicLinkTokenFromInput(`Open this link: https://api.example.test/auth/verify-magic-link?token=${token}.`), token);
  assert.equal(magicLinkTokenFromInput(token), token);
  assert.equal(magicLinkTokenFromInput("not a link or code"), "");
});

test("magic link confirmation maps stable API failures to localized messages", () => {
  assert.equal(magicLinkErrorI18nKey("magic_link_used"), "auth.magicLinkUsed");
  assert.equal(magicLinkErrorI18nKey("magic_link_expired"), "auth.magicLinkExpired");
  assert.equal(magicLinkErrorI18nKey("magic_link_invalid"), "auth.magicLinkInvalid");
  assert.equal(magicLinkErrorI18nKey("unknown"), "auth.magicLinkConfirmFailed");
});

test("in-app confirmation UI keeps the original email link flow and requires the new API capability", async () => {
  const [appSource, indexSource, constantsSource] = await Promise.all([
    readFile(new URL("../../app.js", import.meta.url), "utf8"),
    readFile(new URL("../../index.html", import.meta.url), "utf8"),
    readFile(new URL("../../src/config/constants.js", import.meta.url), "utf8")
  ]);

  assert.match(indexSource, /id="authMagicLink"/);
  assert.match(indexSource, /id="authConfirmBtn"/);
  assert.match(indexSource, /id="authConfirmSection"[^>]*hidden/);
  assert.match(appSource, /revealAuthMagicLinkConfirmation\(\)/);
  assert.match(appSource, /authSubmitBtn\.classList\.add\("ghost"\)/);
  assert.match(appSource, /authConfirmBtn\.classList\.remove\("ghost"\)/);
  assert.match(appSource, /apiFetch\("\/auth\/verify-magic-link",\s*\{\s*method:\s*"POST"/);
  assert.match(appSource, /"inAppMagicLinkConfirmation"/);
  assert.match(appSource, /"publicTemplateCanonicalPhotoReferences"/);
  assert.match(appSource, /2026-07-21\.public-template-layout-order-v1/);
  assert.match(constantsSource, /APP_VERSION\s*=\s*"v1318"/);
});
