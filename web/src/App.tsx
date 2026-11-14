import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Building2, ClipboardList, FileText, HelpCircle, Menu, RefreshCw, ShieldAlert, Users, Briefcase } from 'lucide-react';
import { api, type Meta, type SyncInfo } from './api';
import type { CrmState } from './types';
import { EvidenceProvider } from './components/Evidence';
import { Empty } from './components/ui';
import Overview from './pages/Overview';
import Sync from './pages/Sync';
import { Accounts, Actions, Deals, Evidence, People, Risks, Unknowns } from './pages/Lists';

const NAV = [
  ['overview', 'Overview', BarChart3], ['accounts', 'Accounts', Building2], ['people', 'People & Stakeholders', Users], ['deals', 'Deals & Pipeline', Briefcase],
  ['risks', 'Risks & Deadlines', ShieldAlert], ['actions', 'Actions', ClipboardList], ['evidence', 'Evidence & Documents', FileText], ['unknowns', 'Unknowns', HelpCircle], ['sync', 'Synchronization', RefreshCw],
] as const;

export default function App() {
  const [page, setPage] = useState(location.hash.slice(1) || 'overview');
  const [state, setState] = useState<CrmState | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [err, setErr] = useState('');
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.state(); setState(r.state); setMeta(r.meta); setErr(''); } catch (e) { setErr((e as Error).message); }
    try { setInfo(await api.sync()); } catch { /* shown via err */ }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]); // polls OUR cache, not the MCP API
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || 'overview'); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const go = (p: string) => { location.hash = p; setMenu(false); };

  const body = () => {
    if (!state) return <Empty>{err ? `Cannot reach the API: ${err}. If you are offline, the last cached view is not available in the browser.` : 'Loading…'}</Empty>;
    switch (page) {
      case 'accounts': return <Accounts s={state} />; case 'people': return <People s={state} />; case 'deals': return <Deals s={state} />;
      case 'risks': return <Risks s={state} />; case 'actions': return <Actions s={state} />; case 'evidence': return <Evidence s={state} />;
      case 'unknowns': return <Unknowns s={state} />; case 'sync': return <Sync s={state} meta={meta} info={info} reload={load} />;
      default: return <Overview s={state} />;
    }
  };
  return (
    <div className="flex min-h-screen">
      <nav aria-label="Main" className={`${menu ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-30 w-64 bg-navy-900 p-4 text-slate-200 lg:static lg:block`}>
        <p className="mb-6 px-2 text-sm font-semibold text-white">Account Quest CRM<span className="block text-xs font-normal text-slate-400">FlytBase Customer Success</span></p>
        {NAV.map(([id, label, Icon]) => (
          <button key={id} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined} className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${page === id ? 'bg-navy-700 text-white' : 'hover:bg-navy-800'}`}><Icon size={16} />{label}</button>))}
      </nav>
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2"><button className="lg:hidden" aria-label="Open menu" onClick={() => setMenu(!menu)}><Menu /></button>
            <h1 className="text-lg font-semibold">{NAV.find((n) => n[0] === page)?.[1] ?? 'Overview'}</h1></div>
          <p className="text-xs text-slate-500">{meta?.hasData ? `Cached data · last sync ${meta.lastSuccessAt ? new Date(meta.lastSuccessAt).toLocaleString() : 'incomplete'}` : 'No data synced'}{info?.status.running ? ' · syncing…' : ''}</p>
        </header>
        <div className="p-4">{state ? <EvidenceProvider evidence={state.evidence}>{body()}</EvidenceProvider> : body()}</div>
      </main>
    </div>
  );
}
