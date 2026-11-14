import { describe, it, expect } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { Store } from '../src/store.js';
import { RequestQueue, HARD_MIN_INTERVAL_MS } from '../src/queue.js';

const mk = () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'q-')));
  let t = 1_000_000; const sleeps: number[] = [];
  const q = new RequestQueue({ store, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  return { store, q, sleeps, clock: () => t, advance: (ms: number) => { t += ms; } };
};

describe('RequestQueue', () => {
  it('clamps interval to at least 65s', () => {
    const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'q-')));
    expect(new RequestQueue({ store, minIntervalMs: 1000 }).intervalMs).toBe(HARD_MIN_INTERVAL_MS);
  });
  it('spaces consecutive calls by >= 65s and runs them serially', async () => {
    const { q, clock } = mk(); const starts: number[] = []; let active = 0, maxActive = 0;
    const job = (k: string) => q.enqueue({ key: k }, async () => { active++; maxActive = Math.max(maxActive, active); starts.push(clock()); active--; return k; });
    await Promise.all([job('a'), job('b'), job('c')]);
    expect(maxActive).toBe(1);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(65_000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(65_000);
  });
  it('dedupes identical keys', async () => {
    const { q } = mk(); let calls = 0;
    const [x, y] = await Promise.all([q.enqueue({ key: 'k' }, async () => ++calls), q.enqueue({ key: 'k' }, async () => ++calls)]);
    expect(calls).toBe(1); expect(x).toBe(y);
  });
  it('persists last-call time so a restart still waits', async () => {
    const a = mk(); await a.q.enqueue({ key: 'x' }, async () => 1);
    const sleeps: number[] = [];
    const q2 = new RequestQueue({ store: a.store, now: a.clock, sleep: async (ms) => { sleeps.push(ms); a.advance(ms); } });
    await q2.enqueue({ key: 'y' }, async () => 2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(64_000);
  });
  it('retries recoverable reads with backoff but never retries writes', async () => {
    const { q } = mk(); let n = 0;
    const r = await q.enqueue({ key: 'r' }, async () => { if (++n < 3) throw Object.assign(new Error('503'), { recoverable: true }); return 'ok'; });
    expect(r).toBe('ok'); expect(n).toBe(3);
    let w = 0;
    await expect(q.enqueue({ key: 'w', write: true }, async () => { w++; throw Object.assign(new Error('fail'), { recoverable: true }); })).rejects.toThrow('fail');
    expect(w).toBe(1);
  });
  it('failed calls still consume the interval', async () => {
    const { q } = mk(); await expect(q.enqueue({ key: 'f', write: true }, async () => { throw new Error('x'); })).rejects.toThrow();
    expect(q.nextAllowedAt).toBeGreaterThan(q.lastCallAt);
  });
});
