
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CrmState } from '../types';

import {
  Card,
  Empty,
  money,
  accName,
  AGREED,
  Sev,
} from '../components/ui';

import {
  EvidenceLink,
  StatusBadge,
  best,
} from '../components/Evidence';

// Calculate verified and unverified pipeline totals.
export function pipelineTotals(s: CrmState) {
  const supported = s.deals.filter(
    (d) =>
      d.value !== undefined &&
      best(d.evidenceIds, s.evidence) === 'VERIFIED'
  );

  const unverified = s.deals.filter(
    (d) =>
      d.value !== undefined &&
      best(d.evidenceIds, s.evidence) !== 'VERIFIED'
  );

  const agreed = supported.filter(
    (d) => d.stage && AGREED.test(d.stage)
  );

  // Numeric totals retained for existing tests and compatibility.
  const sum = (deals: typeof s.deals): number => {
    return deals.reduce(
      (total, deal) => total + (deal.value ?? 0),
      0
    );
  };

  // Separate totals by currency.
  const sumByCurrency = (
    deals: typeof s.deals
  ): Record<string, number> => {
    const totals: Record<string, number> = {};

    for (const deal of deals) {
      const currency = deal.currency ?? 'UNKNOWN';

      totals[currency] =
        (totals[currency] ?? 0) + (deal.value ?? 0);
    }

    return totals;
  };

  return {
    supported,
    unverified,
    agreed,

    supportedSum: sum(supported),
    unverifiedSum: sum(unverified),
    agreedSum: sum(agreed),
    potentialSum: sum(supported) - sum(agreed),

    supportedByCurrency: sumByCurrency(supported),
    unverifiedByCurrency: sumByCurrency(unverified),
    agreedByCurrency: sumByCurrency(agreed),
  };
}

// Format currency totals without combining different currencies.
function formatCurrencyTotals(
  totals: Record<string, number>
): string {
  return Object.entries(totals)
    .map(([currency, value]) => {
      if (currency === 'UNKNOWN') {
        return money(value);
      }

      return money(value, currency);
    })
    .join(' + ');
}

export default function Overview({ s }: { s: CrmState }) {
  const t = pipelineTotals(s);

  const atRisk = s.risks.length;

  // Account-wise chart data.
  const chart = s.accounts.map((account) => {
    const verified = s.deals
      .filter(
        (d) =>
          d.accountId === account.id &&
          d.value !== undefined &&
          best(d.evidenceIds, s.evidence) === 'VERIFIED'
      )
      .reduce(
        (total, deal) => total + (deal.value ?? 0),
        0
      );

    const unverifiedValue = s.deals
      .filter(
        (d) =>
          d.accountId === account.id &&
          d.value !== undefined &&
          best(d.evidenceIds, s.evidence) !== 'VERIFIED'
      )
      .reduce(
        (total, deal) => total + (deal.value ?? 0),
        0
      );

    return {
      name: account.name,
      Verified: verified,
      'Unverified (claim/told)': unverifiedValue,
    };
  });

  const upcoming = [...s.deadlines]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Summary cards.
  const summaryCards: [string, string][] = [
    [
      'Supported pipeline (VERIFIED only)',
      t.supported.length > 0
        ? formatCurrencyTotals(t.supportedByCurrency)
        : 'No verified deal values yet',
    ],
    [
      'Unverified value (claim / told)',
      t.unverified.length > 0
        ? formatCurrencyTotals(t.unverifiedByCurrency)
        : 'None recorded',
    ],
    ['Deals recorded', String(s.deals.length)],
    ['At-risk items', String(atRisk)],
  ];

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold">
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Financial clarification */}
      <p className="text-xs text-slate-500">
        Unverified amounts are never added to confirmed revenue.
        Agreed (stage matches agreed/signed/won, VERIFIED):{' '}
        {t.agreed.length} deal(s)
        {t.agreed.length > 0
          ? ', ' + formatCurrencyTotals(t.agreedByCurrency)
          : ''}
        .
      </p>

      <div className="grid gap-4 xl:grid-cols-2">

        {/* 1. Book value */}
        <Card title="1. What is the book worth?">
          {s.deals.length === 0 ? (
            <Empty>
              No deals found in synced data. Run a sync, then
              check Evidence & Documents to see what was parsed.
            </Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.deals.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="font-medium">
                    {d.name}
                  </span>

                  <EvidenceLink ids={d.evidenceIds}>
                    {money(d.value, d.currency)}
                  </EvidenceLink>

                  <StatusBadge
                    status={best(d.evidenceIds, s.evidence)}
                  />

                  <span className="text-slate-500">
                    {d.stage ?? 'Stage not established'}
                    {' - '}
                    {accName(s, d.accountId)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {chart.some(
            (c) =>
              c.Verified > 0 ||
              c['Unverified (claim/told)'] > 0
          ) && (
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />

                  <Bar
                    dataKey="Verified"
                    stackId="a"
                    fill="#059669"
                  />

                  <Bar
                    dataKey="Unverified (claim/told)"
                    stackId="a"
                    fill="#f59e0b"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* 2. Stakeholders */}
        <Card title="2. Who holds the power?">
          {s.people.filter(
            (p) => p.side === 'customer'
          ).length === 0 ? (
            <Empty>No stakeholders parsed yet.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.people
                .filter((p) => p.side === 'customer')
                .map((p) => (
                  <li key={p.id}>
                    <EvidenceLink ids={p.evidenceIds}>
                      <b>{p.name}</b>
                    </EvidenceLink>

                    {' - '}
                    {p.title ?? 'title not established'}

                    <span className="text-slate-500">
                      {' ('}
                      {accName(s, p.accountId)}
                      {')'}
                    </span>

                    <div className="text-xs text-slate-500">
                      {p.roles.length > 0
                        ? 'Role: ' + p.roles.join(', ')
                        : 'Decision role not established'}

                      {p.rolesInferred && p.roles.length > 0
                        ? ' (inferred)'
                        : ''}

                      {p.relationship
                        ? ' | Relationship: ' + p.relationship
                        : ''}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* 3. Recommended actions */}
        <Card title="3. What do I do first?">
          {s.actions.length === 0 ? (
            <Empty>
              No actions yet. They are derived from deals,
              blockers and relationships.
            </Empty>
          ) : (
            s.accounts.map((account) => (
              <div
                key={account.id}
                className="mb-3"
              >
                <p className="mb-1 text-xs font-semibold text-slate-500">
                  {account.name}
                </p>

                <ol className="space-y-1 text-sm">
                  {s.actions
                    .filter(
                      (action) =>
                        action.accountId === account.id
                    )
                    .map((action) => (
                      <li key={action.id}>
                        <b>{action.rank}.</b>{' '}

                        <EvidenceLink ids={action.evidenceIds}>
                          {action.title}
                        </EvidenceLink>

                        <span className="text-xs text-slate-500">
                          {' - '}
                          {action.reason}
                        </span>
                      </li>
                    ))}
                </ol>
              </div>
            ))
          )}
        </Card>

        {/* 4. Risks */}
        <Card title="4. What is about to go wrong?">
          {s.risks.length === 0 ? (
            <Empty>
              No risks triggered by the current rules.
            </Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.risks.slice(0, 8).map((risk) => (
                <li
                  key={risk.id}
                  className="flex gap-2"
                >
                  <Sev s={risk.severity} />

                  <EvidenceLink ids={risk.evidenceIds}>
                    {risk.title}
                  </EvidenceLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 5. Unknown information */}
        <Card title="5. What do I still not know?">
          {s.unknowns.length === 0 ? (
            <Empty>No unknowns detected.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {s.unknowns.slice(0, 8).map((unknown) => (
                <li key={unknown.id}>
                  <b>{unknown.what}</b>

                  <div className="text-xs text-slate-500">
                    Ask {unknown.whoCanAnswer}:{' '}
                    {unknown.question}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming deadlines */}
        <Card title="Upcoming deadlines">
          {upcoming.length === 0 ? (
            <Empty>
              No dated deadlines found. Dates are never invented.
            </Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {upcoming.map((deadline) => (
                <li key={deadline.id}>
                  <EvidenceLink ids={deadline.evidenceIds}>
                    {deadline.date}
                  </EvidenceLink>

                  {' - '}
                  {deadline.label}

                  <span className="text-slate-500">
                    {' ('}
                    {accName(s, deadline.accountId)}
                    {')'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Latest customer updates */}
      {s.signals.length > 0 && (
        <Card title="Latest customer updates (signals)">
          <ul className="space-y-1 text-sm">
            {s.signals.slice(0, 6).map((signal) => (
              <li key={signal.id}>
                {signal.date && (
                  <span className="text-slate-500">
                    {signal.date}
                    {' - '}
                  </span>
                )}
                {signal.text}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
