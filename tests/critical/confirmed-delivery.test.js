import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConfirmedDelivery } from '../../src/protocol/confirmed-delivery.js';
import { startNotesServer, fileStorage, createNotesClient } from '../../examples/confirmed-notes/notes.mjs';

test('persistence failure cannot send or read; context changes during capture cannot send', async () => {
  let calls = 0;
  const forbidden = () => { calls++; throw Error('unexpected network'); };
  const failed = createConfirmedDelivery({ capture: () => { throw Error('quota'); }, send: forbidden, readReceipt: forbidden });
  await assert.rejects(failed.deliverNew({ id: '1' }), /quota/);
  let context = 'a';
  const changed = createConfirmedDelivery({ capture: async intent => { context = 'b'; return intent; }, send: forbidden, readReceipt: forbidden });
  await assert.rejects(changed.deliverNew({ id: '2' }, { assertReady: () => {
    if (context !== 'a') throw Error('context');
  } }), /context/);
  assert.equal(calls, 0);
});

test('unconfirmed outcome survives a cold client and recovery never sends', async () => {
  let posts = 0, saved, available = false;
  const options = {
    capture: intent => (saved = JSON.parse(JSON.stringify(intent))),
    send: () => { posts++; throw Error('timeout'); },
    readReceipt: entry => available ? { id: entry.id, state: 'committed' } : { state: 'unknown' },
    accept: (entry, data) => {
      if (data.state !== 'committed' || data.id !== entry.id) throw Error('unconfirmed');
      return data;
    },
  };
  await assert.rejects(createConfirmedDelivery(options).deliverNew({ id: 'stable-id' }), /unconfirmed/);
  await assert.rejects(createConfirmedDelivery(options).recover(saved), /unconfirmed/);
  available = true;
  assert.equal((await createConfirmedDelivery(options).recover(saved)).receipt.id, 'stable-id');
  assert.equal(posts, 1);
});

test('failed proof persistence never resolves as confirmed and never repeats dispatch', async () => {
  let posts = 0, reads = 0;
  const client = createConfirmedDelivery({ capture: intent => intent,
    send: () => { posts++; return { state: 'committed' }; },
    readReceipt: () => { reads++; return { state: 'committed' }; },
    accept: () => { throw Error('proof-quota'); },
  });
  await assert.rejects(client.deliverNew({ id: '1' }), /proof-quota/);
  assert.equal(posts, 1); assert.equal(reads, 1);
});

test('adapter waiting and owner-access errors retain their distinct meaning', async () => {
  const waiting = Error('waiting'), denied = Error('owner-access');
  let reads = 0;
  const options = { capture: intent => intent, send: () => { throw waiting; },
    readReceipt: () => { reads++; throw Error('unknown'); }, accept: () => {},
    canReadAfterError: error => error !== waiting,
    recoveryFailure: (sendError, readError) => sendError === denied ? denied : readError,
  };
  await assert.rejects(createConfirmedDelivery(options).deliverNew({}), error => error === waiting);
  assert.equal(reads, 0);
  options.send = () => { throw denied; };
  await assert.rejects(createConfirmedDelivery(options).deliverNew({}), error => error === denied);
  assert.equal(reads, 1);
});

test('independent notes application: HTTP + persistent server/client restart + rejection and context isolation', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'confirmed-notes-test-'));
  let server = await startNotesServer(directory);
  t.after(async () => { await server.close(); rmSync(directory, { recursive: true, force: true }); });
  const storage = fileStorage(directory), id = randomUUID();
  let posts = 0, owner = 'local-demo';
  const client = createNotesClient({ url: server.url, storage, fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (options.method === 'POST') { posts++; await response.arrayBuffer(); throw Error('lost ACK'); }
    return response;
  } });
  assert.equal((await client.rename('Travel checklist', { id })).state, 'committed');
  await server.close();
  server = await startNotesServer(directory);
  const restarted = createNotesClient({ url: server.url, storage: fileStorage(directory), fetchImpl: (url, options) => {
    assert.equal(options.method, 'GET', 'restart must only recover the receipt'); return fetch(url, options);
  } });
  assert.equal((await restarted.rename('Travel checklist', { id })).id, id);
  await assert.rejects(restarted.rename('Different body', { id }), /identity-reuse/);
  assert.equal(posts, 1);
  let state = await (await fetch(`${server.url}/note`)).json();
  assert.deepEqual(state, { title: 'Travel checklist', revision: 2, effects: 1 });
  const ordinary = createNotesClient({ url: server.url, storage });
  assert.equal((await ordinary.rename('Stale edit')).state, 'rejected');
  const switched = createNotesClient({ url: server.url, storage, getContext: () => owner, fetchImpl: async (url, options) => {
    const response = await fetch(url, options); owner = 'another-user'; return response;
  } });
  await assert.rejects(switched.rename('New title', { baseRevision: 2 }), /context-changed/);
  state = await (await fetch(`${server.url}/note`)).json();
  assert.equal(state.effects, 2, 'receipt is historical; account switch does not undo server commit');
});
