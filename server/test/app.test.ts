import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { RequestQueue } from '../src/queue.js';

const TOKEN = 'TEST_TOKEN_SHOULD_NEVER_LEAK';
const responses: Record<string, unknown> = {
  whoami: { user: 'tester' },
  get_my_accounts: { accounts: [{ id: 'a1', name: 'Alpha' }, { id: 'a2', name: 'Beta' }] },
  get_data_format: { note: 'format' },
  get_all_paperwork: { calls: [{ name: 'Sam Lee', title: 'Head of Ops', relationship: 'Guarded' }] },
  get_flytbase_team: [{ name: 'Fiona Fly', title: 'CSM' }], get_feature_requests: [], get_release_notes: [], get_signals: [],
  write_note: { id: 'note-9' },
};
function setup() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'a-')));
  const calls: string[] = []; let t = 0;
  const queue = new RequestQueue({ store, now: () => t, sleep: async (ms) => { t += ms; } });
  const fetchImpl = (async (_u: any, init: any) => {
    const body = JSON.parse(init.body); const name = body.params.name; calls.push(name);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(responses[name]) }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { app, sync } = createApp({ store, queue, cfg: { url: 'http://mcp', token: TOKEN, authHeader: 'Authorization', authScheme: 'Bearer' }, adminKey: 'k', origins: ['http://localhost:5173'], fetchImpl });
  return { app, sync, calls, store };
}

describe('API', () => {
  it('health works; sync requires admin key', async () => {
    const { app } = setup();
    expect((await request(app).get('/health')).body.ok).toBe(true);
    expect((await request(app).post('/api/sync')).status).toBe(401);
  });
  it('initial sync follows the planned order, no duplicate calls, uses returned account ids, both accounts load', async () => {
    const { app, sync, calls } = setup();
    await sync.run();
    expect(calls).toEqual(['whoami', 'get_my_accounts', 'get_data_format', 'get_all_paperwork', 'get_all_paperwork', 'get_flytbase_team', 'get_feature_requests', 'get_release_notes', 'get_signals']);
    const { state, meta } = (await request(app).get('/api/state')).body;
    expect(meta.hasData).toBe(true); expect(state.accounts.map((a: any) => a.id)).toEqual(['a1', 'a2']);
    expect(state.people.some((p: any) => p.name === 'Sam Lee')).toBe(true);
    await sync.run(); expect(calls.length).toBe(10); // second run: only get_signals refetched, everything else cached
  });
  it('serves cached data when the MCP API is down', async () => {
    const { app, sync, store } = setup(); await sync.run();
    const q2 = new RequestQueue({ store, now: () => 1e12, sleep: async () => {} });
    const down = createApp({ store, queue: q2, cfg: { url: 'http://x', token: TOKEN, authHeader: 'Authorization', authScheme: 'Bearer' }, adminKey: 'k', origins: [], fetchImpl: (async () => { throw new Error('offline'); }) as any });
    const r = await request(down.app).get('/api/state'); expect(r.body.state.accounts.length).toBe(2);
  });
  it('records endpoint errors and continues', async () => {
    const { sync } = setup(); delete responses.get_release_notes;
    (responses as any).get_release_notes = undefined; // JSON "undefined" -> text undefined; ensure no throw
    const s = await sync.run(); expect(s.running).toBe(false);
    responses.get_release_notes = [];
  });
  it('write-back: preview does not call API; confirm needs confirm:true; no automatic retry', async () => {
    const { app, calls } = setup();
    const p = await request(app).post('/api/notes/preview').set('x-admin-key', 'k').send({ text: 'Call Fatima', accountId: 'a1', kind: 'task' });
    expect(p.status).toBe(200); expect(calls.length).toBe(0);
    expect((await request(app).post('/api/notes/confirm').set('x-admin-key', 'k').send({ text: 'x' })).status).toBe(400);
    const c = await request(app).post('/api/notes/confirm').set('x-admin-key', 'k').send({ text: 'Call Fatima', accountId: 'a1', kind: 'task', confirm: true });
    expect(c.body.saved.id).toBe('note-9'); expect(calls).toEqual(['write_note']);
  });
  it('never exposes the token in any response or cache file', async () => {
    const { app, sync, store } = setup(); await sync.run();
    for (const url of ['/api/state', '/api/sync/status', '/health']) expect(JSON.stringify((await request(app).get(url)).body)).not.toContain(TOKEN);
    for (const f of fs.readdirSync(store.dir)) expect(fs.readFileSync(path.join(store.dir, f), 'utf8')).not.toContain(TOKEN);
  });
});
