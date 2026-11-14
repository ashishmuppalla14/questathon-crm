import type { ReactNode } from 'react';
import type { CrmState } from '../types';
export const Card = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    {title && <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">{title}</h2>{right}</div>}
    {children}
  </section>
);
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-600">{children}</p>;
export const money = (v?: number, cur?: string) => (v === undefined ? 'Value not established' : new Intl.NumberFormat('en', { style: 'currency', currency: cur ?? 'EUR', maximumFractionDigits: 0 }).format(v) + (cur ? '' : ' (currency not stated)'));
export const accName = (s: CrmState, id: string) => s.accounts.find((a) => a.id === id)?.name ?? (id === 'flytbase' ? 'FlytBase' : id);
export const SEV: Record<string, string> = { high: 'bg-red-50 text-red-800 ring-red-200', medium: 'bg-amber-50 text-amber-800 ring-amber-200', low: 'bg-slate-100 text-slate-700 ring-slate-300' };
export const Sev = ({ s }: { s: string }) => <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ${SEV[s]}`}>{s}</span>;
export const Scroll = ({ children }: { children: ReactNode }) => <div className="overflow-x-auto">{children}</div>;
export const Th = ({ children }: { children?: ReactNode }) => <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left text-xs font-semibold text-slate-500">{children}</th>;
export const Td = ({ children }: { children?: ReactNode }) => <td className="border-b border-slate-100 px-2 py-2 align-top text-sm">{children}</td>;
export const AGREED = /(agreed|signed|won|closed|live|active|renewed)/i;
