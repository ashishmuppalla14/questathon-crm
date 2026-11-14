import express from 'express';
import cors from 'cors';
import { Store } from './store.js';
import { RequestQueue } from './queue.js';
import { SyncService, extractAccountIds } from './sync.js';
import { callTool, McpConfig } from './mcp.js';
import { normalize } from './normalize.js';
import { deriveInsights } from './rules.js';
import type { CrmState, StoredNote } from './types.js';

export interface AppDeps { store: Store; queue: RequestQueue; cfg: McpConfig; adminKey?: string; origins: string[]; fetchImpl?: typeof fetch; refreshSeconds?: number }

export function buildState(sync: SyncService, store: Store): CrmState {
  const accountsData = sync.cached('get_my_accounts')?.data as any;
  const ids = extractAccountIds(accountsData).slice(0, 2);
  const list: any[] = Array.isArray(accountsData) ? accountsData : accountsData?.accounts ?? [];
  const accounts = ids.map((a) => ({ ...a, raw: list.find((x) => String(x?.id ?? x) === a.id) }));
  const paperwork: Record<string, unknown> = {};
  for (const a of ids) paperwork[a.id] = sync.cached(`get_all_paperwork:${a.id}`)?.data;
  const base = normalize({ accounts, paperwork, team: sync.cached('get_flytbase_team')?.data, signals: sync.cached('get_signals')?.data, notes: store.read<StoredNote[]>('notes') ?? [] });
  return { generatedAt: new Date().toISOString(), ...base, ...deriveInsights(base) };
}

export function createApp(d: AppDeps) {
  const app = express();
  const sync = new SyncService(d.store, d.queue, d.cfg, d.fetchImpl);
  app.use(cors({ origin: d.origins.length ? d.origins : false }));
  app.use(express.json({ limit: '200kb' }));

  const admin: express.RequestHandler = (req, res, next) => {
    if (!d.adminKey) return res.status(503).json({ error: 'ADMIN_KEY not configured on server' });
    if (req.header('x-admin-key') !== d.adminKey) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  app.get('/health', (_q, r) => r.json({ ok: true }));

  app.get('/api/state', (_q, r) => {
    const calls = ['whoami', 'get_my_accounts', 'get_data_format', 'get_flytbase_team', 'get_signals'].map((k) => sync.cached(k));
    const fetchedTimes = calls.filter(Boolean).map((c) => c!.fetchedAt).sort();
    r.json({ state: buildState(sync, d.store), meta: { hasData: !!sync.cached('get_my_accounts'), lastSuccessAt: sync.status.lastSuccessAt ?? null, oldestFetch: fetchedTimes[0] ?? null, dataSource: 'cache' } });
  });

  app.get('/api/sync/status', (_q, r) => r.json({
    status: sync.status, queue: { nextAllowedAt: d.queue.nextAllowedAt ? new Date(d.queue.nextAllowedAt).toISOString() : null, intervalSeconds: d.queue.intervalMs / 1000, queued: d.queue.queued, executed: d.queue.executed, lastError: d.queue.lastError },
    refreshSeconds: d.refreshSeconds ?? null,
  }));

  app.post('/api/sync', admin, (req, res) => {
    if (sync.status.running) return res.status(409).json({ error: 'Sync already running', status: sync.status });
    const mode = req.body?.mode === 'signals' ? 'signals' : undefined;
    void sync.run({ force: !!req.body?.force, only: mode });   // runs in background; poll /api/sync/status
    res.status(202).json({ accepted: true, note: 'Calls run one every >=65 s; a full initial sync takes about 10 minutes.' });
  });

  app.get('/api/raw/:key', admin, (req, res) => {
    const c = sync.cached(String(req.params.key)); c ? res.json(c) : res.status(404).json({ error: 'Not cached' });
  });

  // Write-back: preview never calls the API; confirm requires explicit confirm:true and the exact previewed text.
  const KINDS = ['task', 'risk', 'note', 'next_step'];
  app.post('/api/notes/preview', admin, (req, res) => {
    const { text, accountId, kind, title } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
    res.json({ preview: { tool: 'write_note', args: { text: text.trim(), account: accountId, kind, title } }, consumesApiCall: true, earliestWriteAt: d.queue.nextAllowedAt ? new Date(d.queue.nextAllowedAt).toISOString() : 'now' });
  });
  app.post('/api/notes/confirm', admin, async (req, res) => {
    const { text, accountId, kind, title, confirm } = req.body ?? {};
    if (confirm !== true) return res.status(400).json({ error: 'Explicit confirm:true required' });
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
    try {
      const args: Record<string, unknown> = { text: text.trim() }; if (accountId) args.account = accountId; if (kind) args.kind = kind; if (title) args.title = title;
      const out: any = await d.queue.enqueue({ key: `write:${Date.now()}`, write: true }, () => callTool(d.cfg, 'write_note', args, d.fetchImpl));
      const notes = d.store.read<StoredNote[]>('notes') ?? [];
      const saved: StoredNote = { id: String(out?.id ?? out?.note_id ?? out?.noteId ?? `local-${Date.now()}`), text: args.text as string, accountId, kind, title, savedAt: new Date().toISOString() };
      d.store.write('notes', [...notes, saved]);
      res.json({ saved, apiResponse: out });
    } catch (e) { res.status(502).json({ error: (e as Error).message, retried: false }); }
  });

  return { app, sync };
}
