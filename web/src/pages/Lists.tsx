import { useMemo } from 'react';
import type { CrmState } from '../types';
import { Card, Empty, Scroll, Td, Th, money, accName, Sev } from '../components/ui';
import { EvidenceLink, StatusBadge, best } from '../components/Evidence';

export function Accounts({ s }: { s: CrmState }) {
  if (!s.accounts.length) return <Empty>No accounts yet. Run the initial sync.</Empty>;
  return <div className="grid gap-4 xl:grid-cols-2">{s.accounts.map((a) => {
    const deals = s.deals.filter((d) => d.accountId === a.id); const people = s.people.filter((p) => p.accountId === a.id);
    return (
      <Card key={a.id} title={a.name} right={<span className="font-mono text-xs text-slate-500">{a.id}</span>}>
        <h3 className="mt-1 text-xs font-semibold text-slate-500">Deals</h3>
        {deals.length ? deals.map((d) => <p key={d.id} className="text-sm"><EvidenceLink ids={d.evidenceIds}>{d.name}</EvidenceLink> — {money(d.value, d.currency)} · {d.stage ?? 'stage not established'}{d.blocker ? ` · blocker: ${d.blocker}` : ''}</p>) : <p className="text-sm text-slate-500">None parsed.</p>}
        <h3 className="mt-3 text-xs font-semibold text-slate-500">Stakeholders</h3>
        {people.length ? people.map((p) => <p key={p.id} className="text-sm">{p.name} — {p.title ?? 'title not established'}</p>) : <p className="text-sm text-slate-500">None parsed.</p>}
        <h3 className="mt-3 text-xs font-semibold text-slate-500">Risks / unknowns</h3>
        <p className="text-sm">{s.risks.filter((r) => r.accountId === a.id).length} risks · {s.unknowns.filter((u) => u.accountId === a.id).length} unknowns · {s.deadlines.filter((d) => d.accountId === a.id).length} dated deadlines</p>
      </Card>);
  })}</div>;
}

export function People({ s }: { s: CrmState }) {
  if (!s.people.length) return <Empty>No people parsed yet.</Empty>;
  return <Card><Scroll><table className="w-full"><thead><tr><Th>Name</Th><Th>Title</Th><Th>Account</Th><Th>Relationship</Th><Th>Decision role</Th><Th>Said</Th><Th>Evidence</Th><Th>Next interaction</Th></tr></thead>
    <tbody>{s.people.map((p) => { const next = s.actions.find((a) => a.title.includes(p.name)); return (
      <tr key={p.id}><Td><b>{p.name}</b></Td><Td>{p.title ?? '—'}</Td><Td>{accName(s, p.accountId)}</Td><Td>{p.relationship ?? 'Not established'}</Td>
        <Td>{p.roles.join(', ') || 'Not established'}{p.rolesInferred && p.roles.length ? ' (inferred)' : ''}</Td><Td>{p.said ?? '—'}</Td>
        <Td><EvidenceLink ids={p.evidenceIds}><StatusBadge status={best(p.evidenceIds, s.evidence)} /></EvidenceLink></Td><Td>{next?.title ?? 'No rule triggered'}</Td></tr>); })}</tbody></table></Scroll></Card>;
}

export function Deals({ s }: { s: CrmState }) {
  if (!s.deals.length) return <Empty>No deals parsed yet. Inspect Evidence & Documents; the parser in server/src/normalize.ts may need field names from get_data_format.</Empty>;
  const NE = 'Not established';
  return <Card><Scroll><table className="w-full"><thead><tr><Th>Deal</Th><Th>Account</Th><Th>Value</Th><Th>Stage</Th><Th>Blocker</Th><Th>Approver</Th><Th>Owner</Th><Th>Next action</Th><Th>Deadline</Th><Th>Evidence</Th></tr></thead>
    <tbody>{s.deals.map((d) => <tr key={d.id}><Td><b>{d.name}</b></Td><Td>{accName(s, d.accountId)}</Td><Td>{money(d.value, d.currency)}</Td><Td>{d.stage ?? NE}</Td><Td>{d.blocker ?? 'None recorded'}</Td><Td>{d.approver ?? NE}</Td><Td>{d.owner ?? NE}</Td><Td>{d.nextAction ?? NE}</Td><Td>{d.deadline ?? 'Date not established'}</Td>
      <Td><EvidenceLink ids={d.evidenceIds}><StatusBadge status={best(d.evidenceIds, s.evidence)} /></EvidenceLink></Td></tr>)}</tbody></table></Scroll></Card>;
}

export function Risks({ s }: { s: CrmState }) {
  const sorted = useMemo(() => [...s.risks].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity)), [s.risks]);
  return <div className="space-y-4">
    <Card title="Risks">{sorted.length === 0 ? <Empty>No risks triggered.</Empty> : <Scroll><table className="w-full"><thead><tr><Th>Severity</Th><Th>Risk</Th><Th>Account</Th><Th>Why (rule)</Th><Th>Probability</Th><Th>Owner</Th><Th>Mitigation</Th><Th>Deadline</Th></tr></thead>
      <tbody>{sorted.map((r) => <tr key={r.id}><Td><Sev s={r.severity} /></Td><Td><EvidenceLink ids={r.evidenceIds}>{r.title}</EvidenceLink></Td><Td>{accName(s, r.accountId)}</Td><Td>{r.why} <span className="font-mono text-xs text-slate-400">{r.ruleId}</span></Td><Td>{r.probability ?? 'Not established'}</Td><Td>{r.owner ?? 'Not established'}</Td><Td>{r.mitigation}</Td><Td>{r.deadline ?? 'Date not established'}</Td></tr>)}</tbody></table></Scroll>}</Card>
    <Card title="Deadlines">{s.deadlines.length === 0 ? <Empty>No dated deadlines in the data.</Empty> : <ul className="text-sm">{[...s.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map((d) => <li key={d.id}><EvidenceLink ids={d.evidenceIds}>{d.date}</EvidenceLink> — {d.label} · {accName(s, d.accountId)} · owner: {d.owner ?? 'not established'}</li>)}</ul>}</Card></div>;
}

export function Actions({ s }: { s: CrmState }) {
  if (!s.actions.length) return <Empty>No actions yet.</Empty>;
  return <div className="space-y-4">{s.accounts.map((a) => <Card key={a.id} title={`Top actions — ${a.name}`}>
    {s.actions.filter((x) => x.accountId === a.id).map((x) => (
      <div key={x.id} className="mb-3 rounded border border-slate-200 p-3 text-sm"><p className="font-semibold">#{x.rank} <EvidenceLink ids={x.evidenceIds}>{x.title}</EvidenceLink></p>
        <p className="mt-1 text-slate-600"><b>Why:</b> {x.reason}</p><p className="text-slate-600"><b>Owner:</b> {x.owner} · <b>Deadline:</b> {x.deadline} · <b>Status:</b> {x.status}</p>
        <p className="text-slate-600"><b>Expected outcome:</b> {x.expectedOutcome}</p><p className="font-mono text-xs text-slate-400">rule {x.ruleId} · score {Math.round(x.score)}</p></div>))}
    {!s.actions.some((x) => x.accountId === a.id) && <Empty>No rule triggered for this account.</Empty>}</Card>)}</div>;
}

export function Unknowns({ s }: { s: CrmState }) {
  if (!s.unknowns.length) return <Empty>No unknowns detected.</Empty>;
  return <Card><Scroll><table className="w-full"><thead><tr><Th>Unknown</Th><Th>Account</Th><Th>Why it matters</Th><Th>Who can answer</Th><Th>Ask</Th><Th>Decision that depends on it</Th></tr></thead>
    <tbody>{s.unknowns.map((u) => <tr key={u.id}><Td><b>{u.what}</b></Td><Td>{accName(s, u.accountId)}</Td><Td>{u.whyItMatters}</Td><Td>{u.whoCanAnswer}</Td><Td>{u.question}</Td><Td>{u.dependsOn}</Td></tr>)}</tbody></table></Scroll></Card>;
}

export function Evidence({ s }: { s: CrmState }) {
  return <div className="space-y-4">
    <Card title={`Evidence (${s.evidence.length})`}>{s.evidence.length === 0 ? <Empty>No evidence extracted yet.</Empty> : <Scroll><table className="w-full"><thead><tr><Th>Status</Th><Th>Claim</Th><Th>Account</Th><Th>Source ID</Th><Th>Why this status</Th></tr></thead>
      <tbody>{s.evidence.map((e) => <tr key={e.id}><Td><StatusBadge status={e.status} /></Td><Td><EvidenceLink ids={[e.id]}>{e.claim}</EvidenceLink></Td><Td>{accName(s, e.accountId)}</Td><Td><span className="break-all font-mono text-xs">{e.sourceId}</span></Td><Td>{e.statusReason}</Td></tr>)}</tbody></table></Scroll>}</Card>
    <Card title="Documents">{s.files.length === 0 ? <Empty>No file records found.</Empty> : <ul className="text-sm">{s.files.map((f) => <li key={f.id} className="break-all font-mono text-xs">{f.id}</li>)}</ul>}</Card></div>;
}
