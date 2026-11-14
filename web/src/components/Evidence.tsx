import { createContext, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Evidence, EvidenceStatus } from '../types';

const STYLE: Record<EvidenceStatus, string> = {
  VERIFIED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  TOLD: 'bg-amber-50 text-amber-800 ring-amber-200',
  CLAIM: 'bg-sky-50 text-sky-800 ring-sky-200',
  UNKNOWN: 'bg-slate-100 text-slate-700 ring-slate-300',
};
const HELP: Record<EvidenceStatus, string> = {
  VERIFIED: 'Supported by paperwork or another authoritative source',
  TOLD: 'Stated by a stakeholder, not independently checked',
  CLAIM: 'From the official account sheet, not independently verified',
  UNKNOWN: 'Not yet established',
};
export function StatusBadge({ status }: { status: EvidenceStatus }) {
  return <span title={HELP[status]} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ${STYLE[status]}`}>{status}</span>;
}

interface Ctx { open: (ids: string[]) => void }
const C = createContext<Ctx>({ open: () => {} });
export const useEvidence = () => useContext(C);

export function EvidenceProvider({ evidence, children }: { evidence: Evidence[]; children: ReactNode }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const items = ids ? evidence.filter((e) => ids.includes(e.id)) : [];
  return (
    <C.Provider value={{ open: setIds }}>
      {children}
      {ids && (
        <aside role="dialog" aria-label="Evidence" className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">Supporting evidence</h2>
            <button aria-label="Close evidence" onClick={() => setIds(null)} className="rounded p-1 hover:bg-slate-100"><X size={18} /></button></div>
          {items.length === 0 && <p className="text-sm text-slate-600">No evidence is attached to this item. That is itself a finding: treat it as UNKNOWN until a source is found.</p>}
          {items.map((e) => (
            <div key={e.id} className="mb-4 rounded border border-slate-200 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-slate-500">confidence: {e.confidence}</span></div>
              <p className="font-medium">{e.claim}</p>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div><dt className="inline font-semibold">Source ID: </dt><dd className="inline break-all font-mono">{e.sourceId}</dd></div>
                <div><dt className="inline font-semibold">Source type: </dt><dd className="inline">{e.sourceType}</dd></div>
                <div><dt className="inline font-semibold">Why this status: </dt><dd className="inline">{e.statusReason}</dd></div>
                {e.date && <div><dt className="inline font-semibold">Date: </dt><dd className="inline">{e.date}</dd></div>}
              </dl>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{e.excerpt}</pre>
            </div>
          ))}
        </aside>
      )}
    </C.Provider>
  );
}

/** Clickable value/claim that opens its evidence. */
export function EvidenceLink({ ids, children }: { ids: string[]; children: ReactNode }) {
  const { open } = useEvidence();
  return <button type="button" onClick={() => open(ids)} className="text-left underline decoration-dotted underline-offset-2 hover:text-blue-700">{children}</button>;
}
export const best = (ids: string[], all: Evidence[]): EvidenceStatus => {
  const e = all.filter((x) => ids.includes(x.id)); return e.some((x) => x.status === 'VERIFIED') ? 'VERIFIED' : e.some((x) => x.status === 'TOLD') ? 'TOLD' : e.length ? 'CLAIM' : 'UNKNOWN';
};
