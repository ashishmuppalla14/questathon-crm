import type { Action, CrmState, Risk, Unknown } from './types.js';

type Base = Omit<
  CrmState,
  'risks' | 'unknowns' | 'actions' | 'generatedAt'
>;

const NO_DATE = 'Date not established';

const DOC_RE =
  /(document|documentation|pack|assessment|review|dpia|paperwork|sign-?off)/i;

const ADOPT_RE =
  /(install|deploy|dock|plant|site|rollout)/i;

/**
 * Deterministic, transparent rules.
 * Each output carries ruleId, why and evidenceIds.
 *
 * Score:
 * impact (0-40) + urgency (0-25) +
 * dependency (0-15) + customer (0-10) + evidence (0-10).
 */

export function deriveInsights(
  s: Base,
  today = new Date()
): Pick<CrmState, 'risks' | 'unknowns' | 'actions'> {

  const risks: Risk[] = [];
  const unknowns: Unknown[] = [];

  const cand: Omit<Action, 'rank' | 'status'>[] = [];

  let r = 0;
  let u = 0;
  let a = 0;

  const ev = (ids: string[]) =>
    s.evidence.filter((e) => ids.includes(e.id));

  const strength = (ids: string[]) => {
    const evidence = ev(ids);

    if (evidence.some((x) => x.status === 'VERIFIED')) return 10;
    if (evidence.some((x) => x.status === 'TOLD')) return 6;

    return evidence.length ? 3 : 0;
  };

  const daysTo = (date?: string) =>
    date
      ? Math.round(
          (new Date(date).getTime() - today.getTime()) /
          86_400_000
        )
      : undefined;

  const urgency = (date?: string) => {
    const days = daysTo(date);

    if (days === undefined || Number.isNaN(days)) return 5;
    if (days < 0) return 25;
    if (days <= 14) return 22;
    if (days <= 45) return 14;

    return 8;
  };

  const addRisk = (item: Omit<Risk, 'id'>) => {
    risks.push({
      id: `risk-${++r}`,
      ...item
    });
  };

  const addUnknown = (item: Omit<Unknown, 'id'>) => {
    const duplicate = unknowns.some(
      (existing) =>
        existing.accountId === item.accountId &&
        existing.what === item.what
    );

    if (!duplicate) {
      unknowns.push({
        id: `unk-${++u}`,
        ...item
      });
    }
  };

  const addAction = (
    item: Omit<Action, 'id' | 'rank' | 'status'>
  ) => {
    cand.push({
      id: `act-${++a}`,
      ...item
    });
  };

  // --------------------------------------------------
  // 1. DEALS AND OPPORTUNITIES
  // --------------------------------------------------

  for (const d of s.deals) {

    const impact = d.value
      ? Math.min(
          40,
          10 + Math.log10(Math.max(d.value, 1)) * 5
        )
      : 8;

    // Documentation blocker
    if (d.blocker && DOC_RE.test(d.blocker)) {

      addRisk({
        accountId: d.accountId,
        title: `${d.name} blocked by documentation: ${d.blocker}`,
        severity: 'high',
        ruleId: 'R-DOC-BLOCK',
        why: 'Deal blocker mentions documentation or assessment.',
        mitigation:
          'Confirm the pack was received, agree a review date, and offer a walkthrough.',
        owner: d.owner,
        deadline: d.deadline,
        evidenceIds: d.evidenceIds
      });

      addAction({
        accountId: d.accountId,
        title: `Unblock "${d.name}": chase documentation review`,
        reason: `Blocker recorded as "${d.blocker}".`,
        owner: d.owner ?? 'Owner not established',
        deadline: d.deadline ?? NO_DATE,
        expectedOutcome:
          'Reviewer confirms receipt and commits to a completion date.',
        score:
          impact +
          urgency(d.deadline) +
          15 +
          8 +
          strength(d.evidenceIds),
        ruleId: 'R-DOC-BLOCK',
        evidenceIds: d.evidenceIds
      });

    } else if (d.blocker) {

      addRisk({
        accountId: d.accountId,
        title: `${d.name}: unresolved blocker — ${d.blocker}`,
        severity: 'medium',
        ruleId: 'R-BLOCKER',
        why: 'A blocker is recorded and no resolution evidence exists.',
        mitigation: 'Name an owner and a resolution date.',
        owner: d.owner,
        deadline: d.deadline,
        evidenceIds: d.evidenceIds
      });

      addAction({
        accountId: d.accountId,
        title: `Resolve blocker on "${d.name}"`,
        reason: `Blocker: ${d.blocker}`,
        owner: d.owner ?? 'Owner not established',
        deadline: d.deadline ?? NO_DATE,
        expectedOutcome: 'Blocker has an owner and a date.',
        score:
          impact +
          urgency(d.deadline) +
          10 +
          6 +
          strength(d.evidenceIds),
        ruleId: 'R-BLOCKER',
        evidenceIds: d.evidenceIds
      });
    }

    // Missing deal owner
    if (!d.owner) {
      addRisk({
        accountId: d.accountId,
        title: `${d.name}: no owner recorded`,
        severity: 'medium',
        ruleId: 'R-NO-OWNER',
        why: 'Deal has no owner in the data.',
        mitigation: 'Assign an accountable owner.',
        evidenceIds: d.evidenceIds
      });
    }

    // Missing deal value
    if (d.value === undefined) {
      addUnknown({
        accountId: d.accountId,
        what: `Value of "${d.name}"`,
        whyItMatters:
          'Cannot include the deal in pipeline value.',
        whoCanAnswer: d.approver ?? 'Account owner',
        question:
          `What is the contracted or expected value of ${d.name}, and where is it documented?`,
        dependsOn: 'Pipeline total',
        evidenceIds: d.evidenceIds
      });
    }

    // Missing approver
    if (!d.approver) {
      addUnknown({
        accountId: d.accountId,
        what: `Approver for "${d.name}"`,
        whyItMatters:
          'Unknown approver means unknown path to signature.',
        whoCanAnswer: 'Customer champion',
        question:
          `Who must approve ${d.name} and who signs?`,
        dependsOn: 'Deal closure plan',
        evidenceIds: d.evidenceIds
      });
    }

    // Missing decision deadline
    if (!d.deadline) {
      addUnknown({
        accountId: d.accountId,
        what: `Deadline for "${d.name}"`,
        whyItMatters:
          'Urgency cannot be ranked.',
        whoCanAnswer: d.approver ?? 'Customer champion',
        question:
          `Is there a decision date or contract expiry for ${d.name}?`,
        dependsOn: 'Action prioritisation',
        evidenceIds: d.evidenceIds
      });
    }

    // Generate action for identified opportunities
    const hasAction = cand.some(
      (action) =>
        action.accountId === d.accountId &&
        action.evidenceIds.some(
          (id) => d.evidenceIds.includes(id)
        )
    );

    if (
      !hasAction &&
      d.stage &&
      /identified/i.test(d.stage)
    ) {
      addAction({
        accountId: d.accountId,
        title: `Advance opportunity: ${d.name}`,
        reason:
          'Opportunity is identified but has not progressed to an agreed stage.',
        owner: d.owner ?? 'CSM — owner to be confirmed',
        deadline: d.deadline ?? NO_DATE,
        expectedOutcome:
          'Confirm the customer decision process and agree on the next milestone.',
        score:
          impact +
          10 +
          strength(d.evidenceIds),
        ruleId: 'R-IDENTIFIED-OPPORTUNITY',
        evidenceIds: d.evidenceIds
      });
    }
  }

  // --------------------------------------------------
  // 2. CUSTOMER RELATIONSHIP RISKS
  // --------------------------------------------------

  for (const p of s.people.filter(
    (person) => person.side === 'customer'
  )) {

    if (
      p.relationship &&
      /guarded|cold|hostile|weak|new/i.test(p.relationship)
    ) {

      addRisk({
        accountId: p.accountId,
        title: `Weak relationship: ${p.name} (${p.relationship})`,
        severity: 'medium',
        ruleId: 'R-GUARDED',
        why: `Relationship recorded as "${p.relationship}".`,
        mitigation:
          'Use low-pressure, value-first contact and address the stakeholder concern.',
        evidenceIds: p.evidenceIds
      });

      addAction({
        accountId: p.accountId,
        title: `Build trust with ${p.name}`,
        reason:
          `Relationship is "${p.relationship}"` +
          (p.title ? ` and they are ${p.title}.` : '.'),
        owner: 'CSM',
        deadline: NO_DATE,
        expectedOutcome:
          'A scheduled conversation and a named concern list.',
        score:
          20 +
          5 +
          8 +
          8 +
          strength(p.evidenceIds),
        ruleId: 'R-GUARDED',
        evidenceIds: p.evidenceIds
      });
    }
  }

  // --------------------------------------------------
  // 3. UNVERIFIED FINANCIAL FIGURES
  // --------------------------------------------------

  for (const e of s.evidence) {

    if (
      e.numericValue !== undefined &&
      e.status !== 'VERIFIED' &&
      e.key &&
      /value|amount|savings|price|arr|acv/i.test(e.key)
    ) {

      addRisk({
        accountId: e.accountId,
        title: `Unverified financial figure: ${e.claim}`,
        severity: 'medium',
        ruleId: 'R-UNVERIFIED-FIN',
        why:
          `Evidence status is ${e.status}: ${e.statusReason}.`,
        mitigation:
          'Obtain supporting documentation before counting it as confirmed.',
        evidenceIds: [e.id]
      });
    }
  }

  // --------------------------------------------------
  // 4. FINANCIAL DISCREPANCIES
  // --------------------------------------------------

  const byKey = new Map<string, typeof s.evidence>();

  for (const e of s.evidence) {

    if (e.key && e.numericValue !== undefined) {

      const key = `${e.accountId}|${e.key}`;

      byKey.set(key, [
        ...(byKey.get(key) ?? []),
        e
      ]);
    }
  }

  for (const list of byKey.values()) {

    const verified = list.find(
      (x) => x.status === 'VERIFIED'
    );

    const claim = list.find(
      (x) =>
        x.status !== 'VERIFIED' &&
        x.numericValue !== verified?.numericValue
    );

    if (verified && claim) {

      addRisk({
        accountId: verified.accountId,
        title:
          `Discrepancy on "${verified.key}": ` +
          `${claim.numericValue} (${claim.status}) vs ` +
          `${verified.numericValue} (VERIFIED)`,
        severity: 'high',
        ruleId: 'R-DISCREPANCY',
        why:
          'A claim differs from a verified figure for the same field.',
        mitigation:
          'Reconcile the figures with the stakeholder and update the working record.',
        evidenceIds: [verified.id, claim.id]
      });
    }
  }

  // --------------------------------------------------
  // 5. UPCOMING DEADLINES
  // --------------------------------------------------

  for (const d of s.deadlines) {

    const days = daysTo(d.date);

    // Ignore invalid dates and past deadlines.
    if (
      days === undefined ||
      Number.isNaN(days) ||
      days < 0
    ) {
      continue;
    }

    if (days <= 30 && !d.owner) {

      addRisk({
        accountId: d.accountId,
        title:
          `Upcoming deadline without an owner: ${d.label} (${d.date})`,
        severity: days <= 7 ? 'high' : 'medium',
        ruleId: 'R-DEADLINE-NO-OWNER',
        why: `${days} days remaining and no owner recorded.`,
        mitigation:
          'Assign an owner and confirm the required next step.',
        deadline: d.date,
        evidenceIds: d.evidenceIds
      });
    }
  }

  // --------------------------------------------------
  // 6. ADOPTION RISKS AND ACCOUNT-LEVEL UNKNOWNS
  // --------------------------------------------------

  for (const acc of s.accounts) {

    const evs = s.evidence.filter(
      (e) => e.accountId === acc.id
    );

    const installs = evs.filter(
      (e) =>
        ADOPT_RE.test(e.claim) &&
        /install|deploy/i.test(e.claim)
    );

    const usage = evs.some(
      (e) =>
        /(patrol|usage|flight log|active|utili[sz]ation)/i.test(
          e.claim + e.excerpt
        )
    );

    if (installs.length && !usage) {

      addRisk({
        accountId: acc.id,
        title:
          'Deployment recorded without usage evidence (adoption risk)',
        severity: 'medium',
        ruleId: 'R-ADOPTION',
        why:
          'Install/deploy facts exist but no usage, patrol or log evidence was found.',
        mitigation:
          'Request usage data per site.',
        evidenceIds: installs.map((e) => e.id)
      });
    }

    const customerPeople = s.people.filter(
      (p) =>
        p.accountId === acc.id &&
        p.side === 'customer'
    );

    if (
      !customerPeople.some(
        (p) =>
          p.roles.some(
            (role) => /sign|econom|budget/i.test(role)
          )
      )
    ) {

      addUnknown({
        accountId: acc.id,
        what: 'Who signs / holds budget',
        whyItMatters:
          'No person has an evidenced signatory or budget role.',
        whoCanAnswer:
          'Champion or programme lead',
        question:
          'Who holds budget and who signs the order form?',
        dependsOn: 'Deal closure plan',
        evidenceIds: []
      });
    }

    if (!evs.length) {

      addUnknown({
        accountId: acc.id,
        what: 'Any paperwork for this account',
        whyItMatters:
          'Nothing was synced; every conclusion is blank.',
        whoCanAnswer: 'You (run sync)',
        question:
          'Has the initial sync completed for this account?',
        dependsOn: 'Everything',
        evidenceIds: []
      });
    }
  }

  // --------------------------------------------------
  // 7. RANK AND RETURN ACTIONS
  // --------------------------------------------------

  const actions: Action[] = [];

  for (const acc of s.accounts) {

    cand
      .filter((c) => c.accountId === acc.id)
      .sort(
        (x, y) =>
          y.score - x.score ||
          x.id.localeCompare(y.id)
      )
      .slice(0, 3)
      .forEach((c, index) => {

        actions.push({
          ...c,
          rank: index + 1,
          status: 'open'
        });
      });
  }

  return {
    risks,
    unknowns,
    actions
  };
}