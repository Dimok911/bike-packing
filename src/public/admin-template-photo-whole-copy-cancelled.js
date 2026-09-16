import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoWholeCopyPlanRecord } from "../sync/admin-template-photo-whole-copy-save-plan.js";
import { adminTemplatePhotoWholeCopyParentKeys, readAdminTemplatePhotoWholeCopyParentFence } from "../sync/admin-template-photo-whole-copy-parent-fence.js";
const clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Error("Подтверждение остановки копирования требует повторной сверки."); };
const sync = fn => { const value = fn(); if (value?.then) { Promise.resolve(value).catch(() => {}); fail(); } return value; };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");

// Historical no-business-effects proof, NOT acceptance/adoption/UUID retirement.
// Callers may release only the SOURCE for fresh, independently admitted work.
// The cancelled target and every allocated ID remain reserved permanently.
export async function readAdminTemplatePhotoWholeCopyCancelled({ binding: input, operationId, store, getContext,
  storage = globalThis.localStorage }, externalGuard) {
  const binding = adminTemplatePhotoActionBinding(input), keys = adminTemplatePhotoWholeCopyParentKeys(binding, operationId);
  if (typeof externalGuard !== "function" || typeof getContext !== "function" || !same(store?.binding, binding)) fail();
  const context = () => {
    const value = sync(getContext);
    if (!value || value.admin !== true || value.scope !== "admin-template" || !value.generation
      || Object.keys(binding).some(key => value[key] !== binding[key])) fail();
    return clone(value);
  };
  const initial = context(), planKey = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonical(binding)) + ":" + operationId;
  const guard = () => { if (sync(externalGuard) === false || !same(context(), initial)) fail(); };
  guard(); const certificateText = storage.getItem(keys.certificate); guard(); if (certificateText === null) return null;
  const planText = storage.getItem(planKey), journalText = storage.getItem(keys.command);
  const parse = text => { const value = JSON.parse(text); if (!value || canonical(value) !== text) fail(); return value; };
  const saved = parse(planText), journal = parse(journalText), certificate = parse(certificateText);
  const current = () => {
    guard(); if (storage.getItem(planKey) !== planText || storage.getItem(keys.command) !== journalText
      || storage.getItem(keys.certificate) !== certificateText) fail(); guard();
  };
  if (!exact(saved, ["version", "plan", "digest", "cancelRequested"]) || saved.version !== 1 || saved.cancelRequested !== false
    || saved.plan?.version !== 10 || saved.plan.id !== operationId || !same(saved.plan.binding, binding)) fail();
  const hash = await digest(saved.plan); current(); if (hash !== saved.digest) fail();
  const record = await assertAdminTemplatePhotoWholeCopyPlanRecord(saved.plan, store, current); current();
  if (!same(journal.intent, saved.plan.operations[0]) || journal.recordIntentHash !== record.intentHash
    || !same(certificate.binding, binding) || certificate.operationId !== operationId) fail();
  await readAdminTemplatePhotoWholeCopyParentFence({ certificate, parentJournal: journal }); current();
  return Object.freeze({ ...clone({ plan: saved.plan, record, journal, certificate }), assertCurrent: current });
}
