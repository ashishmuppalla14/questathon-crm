import { Store } from './store.js';

export const HARD_MIN_INTERVAL_MS = 65_000;

export interface QueueOptions {
  store: Store;
  minIntervalMs?: number;                 // clamped to >= 65 000 unless allowBelowFloor (tests only)
  allowBelowFloor?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}
export interface JobOptions { key: string; write?: boolean }

/**
 * Single serial queue for every MCP call.
 *  - never concurrent (one promise chain)
 *  - >=65 s between call STARTS, persisted so restarts cannot violate it
 *  - identical in-flight/queued keys share one promise (dedupe)
 *  - exponential backoff for recoverable errors, never for writes
 */
export class RequestQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Promise<unknown>>();
  private minInterval: number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;
  public lastError: string | null = null;
  public queued = 0;
  public executed = 0;

  constructor(private o: QueueOptions) {
    this.minInterval = o.allowBelowFloor ? (o.minIntervalMs ?? HARD_MIN_INTERVAL_MS) : Math.max(o.minIntervalMs ?? HARD_MIN_INTERVAL_MS, HARD_MIN_INTERVAL_MS);
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = o.maxRetries ?? 3;
  }

  get lastCallAt(): number { return this.o.store.read<{ t: number }>('queue-state')?.t ?? 0; }
  get nextAllowedAt(): number { const l = this.lastCallAt; return l ? l + this.minInterval : 0; }
  get intervalMs() { return this.minInterval; }

  private stamp() { this.o.store.write('queue-state', { t: this.now() }); }
  private async waitTurn() {
    const wait = this.nextAllowedAt - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  enqueue<T>(job: JobOptions, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(job.key);
    if (existing) return existing as Promise<T>;           // dedupe
    this.queued++;
    const run = async (): Promise<T> => {
      let attempt = 0;
      for (;;) {
        await this.waitTurn();
        this.stamp();                                      // stamp BEFORE the call: failures still count
        try {
          const out = await fn();
          this.executed++; this.lastError = null;
          return out;
        } catch (e) {
          this.lastError = e instanceof Error ? e.message : String(e);
          const recoverable = !job.write && (e as { recoverable?: boolean }).recoverable !== false;
          if (!recoverable || attempt >= this.maxRetries) throw e;
          attempt++;
          await this.sleep(Math.min(this.minInterval * 2 ** attempt, 15 * 60_000)); // exponential backoff
        }
      }
    };
    const p = this.chain.then(run, run).finally(() => { this.pending.delete(job.key); this.queued--; });
    this.chain = p.catch(() => undefined);
    this.pending.set(job.key, p);
    return p;
  }
}
