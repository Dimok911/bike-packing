import { randomUUID } from "node:crypto";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { preparePersonalServerImportSource } from "../../src/sync/personal-server-import-source.js";

async function serverFixture(input) {
  const source = await preparePersonalServerImportSource({ stateRevision: 7, descriptor: { version: 1,
    id: `shared-entity-link-${randomUUID()}`, mode: "live", scope: "layout", layoutId: "a", entityType: "", entityId: "",
    title: "Selected server source", description: "", includeAuthor: false, authorName: "" } });
  input.selection.source = source;
  input.action.body.serverImport = { ...input.action.body.publicImport, source }; delete input.action.body.publicImport;
  input.action.body.causal.reads = [{ listId: source.listId, revision: source.stateRevision }];
  return input;
}
export const serverImportFixture = async (fileless, options) => serverFixture(await publicImportFixture(fileless, options));
export const serverEntityFixture = async options => serverFixture(await publicEntityFixture(options));
