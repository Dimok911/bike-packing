import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startNotesServer, fileStorage, createNotesClient } from './notes.mjs';

const directory = mkdtempSync(join(tmpdir(), 'confirmed-notes-'));
const storage = fileStorage(directory), id = randomUUID();
let server = await startNotesServer(directory);
try {
  const client = createNotesClient({ url: server.url, storage, fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (options.method === 'POST') { await response.arrayBuffer(); throw Error('simulated-lost-response'); }
    return response;
  } });
  const first = await client.rename('Confirmed after a lost response', { id });
  await server.close();
  server = await startNotesServer(directory);
  const restarted = createNotesClient({ url: server.url, storage: fileStorage(directory) });
  const recovered = await restarted.rename('Confirmed after a lost response', { id });
  const state = await (await fetch(`${server.url}/note`)).json();
  console.log(JSON.stringify({ first: first.state, afterRestart: recovered.state, sameId: recovered.id === id,
    serverEffects: state.effects, title: state.title, recoveryDirectory: directory }, null, 2));
} finally { await server.close(); }
