// A deliberately small, single-user loopback application. Only the delivery
// kernel is shared with Bike Packing; this adapter owns its schema and receipts.
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createConfirmedDelivery } from '../../src/protocol/confirmed-delivery.js';

const digest = intent => createHash('sha256').update(JSON.stringify(intent)).digest('hex');
function writeJson(file, value) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value));
  renameSync(`${file}.tmp`, file);
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

// File replacement keeps the demo's business state and receipt in one snapshot.
// This is not a production database adapter or a power-loss durability guarantee.
export function fileStorage(directory) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'client.json');
  if (!existsSync(file)) writeJson(file, {});
  return {
    getItem(key) { return readJson(file)[key] ?? null; },
    setItem(key, value) { writeJson(file, { ...readJson(file), [key]: value }); },
  };
}

export async function startNotesServer(directory) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'server.json');
  if (!existsSync(file)) writeJson(file, { title: 'First note', revision: 1, effects: 0, receipts: {} });
  const server = createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    try {
      if (request.method === 'GET' && request.url === '/note') {
        const { title, revision, effects } = readJson(file);
        return reply(200, { title, revision, effects });
      }
      if (request.method === 'GET' && request.url.startsWith('/receipts/')) {
        const id = decodeURIComponent(request.url.slice('/receipts/'.length));
        return reply(200, readJson(file).receipts[id] || { state: 'unknown', id });
      }
      if (request.method !== 'POST' || request.url !== '/operations') return reply(404, { error: 'route' });
      let text = '';
      for await (const chunk of request) {
        text += chunk;
        if (text.length > 4096) return reply(413, { error: 'size' });
      }
      const raw = JSON.parse(text);
      if (!/^[a-f0-9-]{36}$/.test(raw.id || '') || raw.owner !== 'local-demo' || raw.resource !== 'note-1'
        || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 200
        || !Number.isSafeInteger(raw.baseRevision) || raw.baseRevision < 1) return reply(400, { error: 'intent' });
      const intent = { id: raw.id, owner: raw.owner, resource: raw.resource, title: raw.title, baseRevision: raw.baseRevision };
      const hash = digest(intent), state = readJson(file), known = state.receipts[intent.id];
      if (known) return reply(known.digest === hash ? 200 : 409, known.digest === hash ? known : { error: 'identity-reuse' });
      const accepted = state.revision === intent.baseRevision;
      if (accepted) { state.title = intent.title; state.revision++; state.effects++; }
      const receipt = { id: intent.id, owner: intent.owner, resource: intent.resource, digest: hash,
        state: accepted ? 'committed' : 'rejected', title: state.title, revision: state.revision };
      state.receipts[intent.id] = receipt;
      writeJson(file, state);
      reply(200, receipt);
    } catch { reply(500, { error: 'storage-or-request' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

export function createNotesClient({ url, storage, getContext = () => 'local-demo', fetchImpl = fetch }) {
  return {
    async rename(title, { id = randomUUID(), baseRevision = 1 } = {}) {
      const owner = getContext();
      const intent = { id, owner, resource: 'note-1', title, baseRevision };
      const key = `confirmed-notes:${owner}:${id}`;
      const assertCurrent = () => { if (getContext() !== owner) throw Error('context-changed'); };
      const request = async (path, body) => {
        const response = await fetchImpl(`${url}${path}`, { method: body ? 'POST' : 'GET',
          ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
        if (response.status !== 200) throw Error('unknown-outcome');
        return response.json();
      };
      const delivery = createConfirmedDelivery({
        capture: value => {
          if (storage.getItem(key)) throw Error('already-recorded');
          const entry = { intent: value, confirmed: false };
          storage.setItem(key, JSON.stringify(entry));
          return entry;
        },
        send: entry => request('/operations', entry.intent),
        readReceipt: entry => request(`/receipts/${encodeURIComponent(entry.intent.id)}`),
        accept: (entry, receipt) => {
          if (!['committed', 'rejected'].includes(receipt.state) || receipt.id !== entry.intent.id
            || receipt.owner !== entry.intent.owner || receipt.resource !== entry.intent.resource
            || receipt.digest !== digest(entry.intent) || typeof receipt.title !== 'string'
            || !Number.isSafeInteger(receipt.revision)) throw Error('unconfirmed-receipt');
          storage.setItem(key, JSON.stringify({ ...entry, confirmed: true, receipt }));
          return receipt;
        },
      });
      assertCurrent();
      const saved = storage.getItem(key);
      let result;
      if (saved) {
        const entry = JSON.parse(saved);
        if (digest(entry.intent) !== digest(intent)) throw Error('identity-reuse');
        result = await delivery.recover(entry);
      } else result = await delivery.deliverNew(intent, { assertReady: assertCurrent });
      assertCurrent(); // A historical receipt cannot update another user's view.
      return result.receipt;
    },
  };
}
