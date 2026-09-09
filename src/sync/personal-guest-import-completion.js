import { personalArchiveHash, personalArchiveJson } from "./personal-archive-import-protocol.js";
import { personalGuestImportPlan } from "./personal-guest-import-plan.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Подтверждение гостевого переноса не совпало с выбранной работой. Исходные данные сохранены."), { code: "guest-completion" }); };

// Retain only files/causal metadata beside the immutable selection. Together
// they reconstruct the exact submitted body, including its full source, after
// ordinary outbox compaction has retired the old action.
export async function personalGuestSelectionBody(selection, intent) {
  if (!Array.isArray(intent?.files) || !intent.causal) fail();
  const manifest = { version: 1, operationId: selection.operationId, sourcePayload: selection.candidate.sourceState,
    sourceHash: await personalArchiveHash(selection.candidate.sourceState), layoutTargets: selection.layoutTargets,
    ownerTargets: selection.ownerTargets, photoTargets: selection.photoTargets, editMeta: selection.editMeta,
    targetStateRevision: selection.baseStateRevision, files: intent.files };
  const plan = personalGuestImportPlan({ ...manifest, currentPayload: selection.basePayload, listId: selection.binding.listId }, manifest.files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  return { baseStateRevision: selection.baseStateRevision, payload: plan.payload, guestImport: manifest, causal: intent.causal };
}

export async function personalGuestCompletedBody(selection, completion) {
  if (completion?.version !== 1 || !completion.proof || Object.keys(completion).length !== 4) fail();
  const body = await personalGuestSelectionBody(selection, completion);
  const proof = completion.proof, operation = proof.operation;
  if (proof.historicalOnly !== true || operation?.state !== "committed" || operation.id !== selection.operationId || operation.kind !== "list.import"
    || ["environment", "actorId", "listId"].some(key => operation[key] !== selection.binding[key])
    || proof.resultStatus < 200 || proof.resultStatus >= 300 || !Number.isInteger(proof.resultStatus)
    || proof.stateRevision !== selection.baseStateRevision + 1
    || operation.payloadDigest !== await personalArchiveHash({ environment: selection.binding.environment, actorId: selection.binding.actorId,
      kind: "list.import", listId: selection.binding.listId, body })) fail();
  return body;
}

export async function personalGuestPreparedIntent(selection, action) {
  if (action?.operationId !== selection.operationId || action.kind !== "list.import"
    || Object.keys(selection.binding).some(key => selection.binding[key] !== action[key])) fail();
  const intent = structuredClone({ version: 1, files: action.body.guestImport.files, causal: action.body.causal });
  if (!same(await personalGuestSelectionBody(selection, intent), action.body)) fail();
  return intent;
}

export async function personalGuestCompletion(selection, action, proof) {
  const completion = { ...await personalGuestPreparedIntent(selection, action), proof: structuredClone(proof) };
  if (!same(await personalGuestCompletedBody(selection, completion), action.body)) fail();
  return completion;
}
