import { describe, it, expect } from 'vitest';
import { normalize, classifySource, parseMoney } from '../src/normalize.js';
import { deriveInsights } from '../src/rules.js';

// Synthetic fixture used ONLY by tests (never shipped as dashboard data).
const fixture = {
  accounts: [{ id: 'acc-1', name: 'Test Co' }, { id: 'acc-2', name: 'Other Co' }],
  paperwork: {
    'acc-1': {
      account_sheet: { deals: [{ deal: 'Framework', value: '€100k', stage: 'Negotiation', blocker: 'Privacy assessment documentation pending', deadline: '2026-11-20' }],
        people: [{ name: 'Pat Doe', title: 'DPO', relationship: 'Guarded' }] },
      letters: [{ title: 'Insurer letter', savings_amount: 180000 }],
      calls: [{ title: 'Call', savings_amount: 1200000 }],
    },
    'acc-2': {},
  },
};

describe('normalize', () => {
  const n = normalize(fixture as any);
  it('keeps both accounts, even when one has no paperwork', () => expect(n.accounts.map((a) => a.id)).toEqual(['acc-1', 'acc-2']));
  it('never marks unknown sources VERIFIED by default', () => { expect(classifySource('paperwork.zzz').status).toBe('CLAIM'); expect(classifySource('paperwork.account_sheet').status).toBe('CLAIM'); });
  it('every deal and money figure carries evidence', () => {
    expect(n.deals.length).toBe(1); expect(n.deals[0].evidenceIds.length).toBeGreaterThan(0); expect(n.deals[0].value).toBe(100000);
    for (const e of n.evidence.filter((x) => x.numericValue !== undefined)) { expect(e.sourceId).toBeTruthy(); expect(e.statusReason).toBeTruthy(); }
  });
  it('infers roles only as inferred', () => expect(n.people[0].rolesInferred).toBe(true));
  it('parses money', () => { expect(parseMoney('€1.2m')).toBe(1_200_000); expect(parseMoney('abc')).toBeUndefined(); });
  it('handles empty/missing payloads without throwing', () => expect(() => normalize({ accounts: [{ id: 'x' }], paperwork: {} })).not.toThrow());
});

describe('rules', () => {
  const base = normalize(fixture as any);
  const out = deriveInsights(base, new Date('2026-11-14'));
  it('flags documentation blocker, guarded stakeholder, unverified financials', () => {
    const ids = out.risks.map((r) => r.ruleId);
    expect(ids).toContain('R-DOC-BLOCK'); expect(ids).toContain('R-GUARDED'); expect(ids).toContain('R-UNVERIFIED-FIN');
  });
  it('every risk, action has a reason and evidence list; undated actions say so', () => {
    for (const a of out.actions) { expect(a.reason.length).toBeGreaterThan(5); expect(a.deadline).toBeTruthy(); }
    expect(out.actions.find((a) => a.ruleId === 'R-GUARDED')!.deadline).toBe('Date not established');
    for (const r of out.risks) expect(r.why.length).toBeGreaterThan(5);
  });
  it('limits to three ranked actions per account and surfaces unknowns', () => {
    expect(out.actions.filter((a) => a.accountId === 'acc-1').length).toBeLessThanOrEqual(3);
    expect(out.unknowns.some((u) => u.accountId === 'acc-2')).toBe(true);
  });
  it('detects discrepancy between claim and verified figure', () => {
    const b = normalize({ accounts: [{ id: 'a' }], paperwork: { a: { calls: [{ title: 'c', savings_amount: 1200000 }], letters: [{ title: 'l', savings_amount: 180000 }] } } } as any);
    expect(deriveInsights(b).risks.some((r) => r.ruleId === 'R-DISCREPANCY')).toBe(true);
  });
});
