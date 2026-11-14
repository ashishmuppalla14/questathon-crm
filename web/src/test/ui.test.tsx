import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Overview, { pipelineTotals } from '../pages/Overview';
import { Deals } from '../pages/Lists';
import { EvidenceProvider, StatusBadge } from '../components/Evidence';
import type { CrmState, Evidence } from '../types';

const ev = (id: string, status: Evidence['status']): Evidence => ({ id, claim: `claim ${id}`, accountId: 'a', sourceId: `a:src-${id}`, sourceType: 'paperwork', status, statusReason: 'test reason', confidence: 'low', excerpt: `excerpt ${id}` });
const empty: CrmState = { generatedAt: '', accounts: [{ id: 'a', name: 'Alpha', raw: null, evidenceIds: [] }, { id: 'b', name: 'Beta', raw: null, evidenceIds: [] }], people: [], deals: [], deadlines: [], signals: [], evidence: [], risks: [], unknowns: [], actions: [], files: [], notes: [] };
const withDeals: CrmState = { ...empty, evidence: [ev('1', 'VERIFIED'), ev('2', 'CLAIM')],
  deals: [{ id: 'd1', accountId: 'a', name: 'Deal A', value: 1000, currency: 'EUR', stage: 'Signed', evidenceIds: ['1'] }, { id: 'd2', accountId: 'b', name: 'Deal B', value: 5000, currency: 'EUR', evidenceIds: ['2'] }] };

describe('UI', () => {
  it('renders empty state honestly (no invented numbers) with both accounts present', () => {
    render(<EvidenceProvider evidence={[]}><Overview s={empty} /></EvidenceProvider>);
    expect(screen.getByText(/No verified deal values yet/)).toBeInTheDocument();
    expect(screen.getByText(/No deals found/)).toBeInTheDocument();
  });
  it('does not count unverified value as supported pipeline', () => {
    const t = pipelineTotals(withDeals);
    expect(t.supportedSum).toBe(1000); expect(t.unverifiedSum).toBe(5000); expect(t.agreedSum).toBe(1000);
  });
  it('clicking a figure shows source id, status reason and excerpt', () => {
    render(<EvidenceProvider evidence={withDeals.evidence}><Deals s={withDeals} /></EvidenceProvider>);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent('a:src-1'); expect(screen.getByRole('dialog')).toHaveTextContent('test reason'); expect(screen.getByRole('dialog')).toHaveTextContent('excerpt 1');
  });
  it('shows "not established" for missing fields', () => {
    render(<EvidenceProvider evidence={withDeals.evidence}><Deals s={withDeals} /></EvidenceProvider>);
    expect(screen.getAllByText('Date not established').length).toBe(2);
  });
  it('status badge exposes help text', () => { render(<StatusBadge status="TOLD" />); expect(screen.getByTitle(/stakeholder/)).toBeInTheDocument(); });
});
