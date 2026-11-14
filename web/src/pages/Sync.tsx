import { useEffect, useState } from 'react';
import { api, getAdminKey, setAdminKey, type Meta, type SyncInfo } from '../api';
import type { CrmState } from '../types';
import { Card } from '../components/ui';

export default function Sync({ s, meta, info, reload }: { s: CrmState; meta: Meta | null; info: SyncInfo | null; reload: () => void }) {
  const [key, setKey] = useState(getAdminKey());
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ text: '', accountId: s.accounts[0]?.id ?? '', kind: 'task', title: '' });
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.preview>> | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const next = info?.queue.nextAllowedAt ? new Date(info.queue.nextAllowedAt).getTime() : 0;
  const wait = Math.max(0, Math.ceil((next - now) / 1000));
  const run = async (fn: () => Promise<unknown>) => { try { setMsg(''); await fn(); reload(); } catch (e) { setMsg((e as Error).message); } };

  return (
    <div className="space-y-4">
      <Card title="Data freshness">
        <p className="text-sm">Source: <b>{meta?.hasData ? 'cached MCP data (served from server cache)' : 'no data yet'}</b></p>
        <p className="text-sm">Last fully successful sync: {meta?.lastSuccessAt ?? 'never'}</p>
        <p className="text-sm">Sync running: {info?.status.running ? `yes — ${info.status.step}` : 'no'} · completed steps: {info?.status.completed.length ?? 0}</p>
        {info?.status.errors.map((e) => <p key={e.step} className="text-sm text-red-700">{e.step}: {e.message}</p>)}
      </Card>
      <Card title="Admin / debug: API rate limit">
        <p className="text-sm">Minimum interval: {info?.queue.intervalSeconds ?? 65}s · calls executed this session: {info?.queue.executed ?? 0} · queued: {info?.queue.queued ?? 0}</p>
        <p className="text-sm">Next permitted API request: {next ? (wait > 0 ? `in ${wait}s (${new Date(next).toLocaleTimeString()})` : 'now') : 'now'}</p>
        {info?.queue.lastError && <p className="text-sm text-red-700">Last error: {info.queue.lastError}</p>}
        <p className="text-sm text-slate-500">Auto-refresh interval: {info?.refreshSeconds ? `${info.refreshSeconds}s (signals only)` : 'off (manual only)'} — set REFRESH_SECONDS on the server (min 65).</p>
      </Card>
      <Card title="Actions (require admin key)">
        <label className="block text-sm">Admin key <input type="password" className="ml-2 rounded border border-slate-300 px-2 py-1" value={key} onChange={(e) => { setKey(e.target.value); setAdminKey(e.target.value); }} /></label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded bg-navy-800 px-3 py-1.5 text-sm text-white" onClick={() => run(() => api.startSync({}))}>Run / resume initial sync (~10 min)</button>
          <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => run(() => api.startSync({ mode: 'signals' }))}>Refresh signals only (1 call)</button>
          <button className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={reload}>Reload view</button>
        </div>
        {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
      </Card>
      <Card title="Save a note to Questathon (write_note)">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label>Account <select className="ml-2 rounded border border-slate-300 px-2 py-1" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>{s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Type <select className="ml-2 rounded border border-slate-300 px-2 py-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{['task', 'risk', 'note', 'next_step'].map((k) => <option key={k}>{k}</option>)}</select></label>
          <input aria-label="Title" placeholder="Title (optional)" className="rounded border border-slate-300 px-2 py-1 sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea aria-label="Note text" rows={3} placeholder="Note text" className="rounded border border-slate-300 px-2 py-1 sm:col-span-2" value={form.text} onChange={(e) => { setForm({ ...form, text: e.target.value }); setPreview(null); }} />
        </div>
        <button className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => run(async () => setPreview(await api.preview(form)))}>Preview (no API call)</button>
        {preview && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold">This will use 1 API call and cannot be retried automatically.</p>
            <pre className="mt-1 whitespace-pre-wrap text-xs">{JSON.stringify(preview.preview, null, 2)}</pre>
            <p className="text-xs">Earliest write time: {preview.earliestWriteAt}</p>
            <button className="mt-2 rounded bg-red-700 px-3 py-1.5 text-white" onClick={() => run(async () => { const r = await api.confirm(form); setMsg(`Saved. Returned id: ${r.saved.id}`); setPreview(null); })}>Confirm and write</button>
          </div>)}
        {s.notes.length > 0 && <ul className="mt-3 text-sm">{s.notes.map((n) => <li key={n.id}><span className="font-mono text-xs">{n.id}</span> · {n.kind ?? 'note'} · {n.text}</li>)}</ul>}
      </Card>
    </div>
  );
}
