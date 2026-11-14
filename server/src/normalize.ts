import type {
  Account,
  Deal,
  Deadline,
  Evidence,
  EvidenceStatus,
  Person,
  Signal,
  CrmState,
  StoredNote
} from './types.js';

type Json = any;

const isObj = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const arr = (v: Json): Json[] =>
  Array.isArray(v) ? v : [];

const text = (v: Json): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const slug = (v: string): string =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const short = (v: Json, limit = 500): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > limit ? s.slice(0, limit) + '...' : s;
};

const firstText = (obj: Json, keys: string[]): string | undefined => {
  if (!isObj(obj)) return undefined;

  for (const key of keys) {
    const value = text(obj[key]);
    if (value) return value;
  }

  return undefined;
};

const evidenceStatus = (value: Json): EvidenceStatus => {
  const status = String(value ?? '').toUpperCase();

  if (status === 'VERIFIED') return 'VERIFIED';
  if (status === 'TOLD') return 'TOLD';
  if (status === 'CLAIM') return 'CLAIM';

  return 'UNKNOWN';
};

export function parseMoney(value: string): number | undefined {
  const cleaned = value
    .replace(/â‚¬/g, '€')
    .replace(/Â£/g, '£')
    .replace(/Â/g, '')
    .trim();

  const match = cleaned.match(
    /^[€$£]?\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?$/
  );

  if (!match) return undefined;

  const number = Number(match[1].replace(/,/g, ''));

  const multiplier =
    match[2]?.toLowerCase() === 'k' ? 1000 :
    match[2]?.toLowerCase() === 'm' ? 1000000 : 1;

  return number * multiplier;
}

const numeric = (value: Json): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return parseMoney(value);
  }

  return undefined;
};

export function classifySource(path: string): {
  status: EvidenceStatus;
  reason: string;
} {
  if (/contract|invoice|insurer|policy|audit|flight.?log|letter/i.test(path)) {
    return {
      status: 'VERIFIED',
      reason: 'Authoritative supporting document'
    };
  }

  if (/transcript|meeting|email|conversation|call/i.test(path)) {
    return {
      status: 'TOLD',
      reason: 'Stakeholder communication'
    };
  }

  return {
    status: 'CLAIM',
    reason: 'Source is recorded but independent verification is not established'
  };
}

function getPaperworkRecords(payload: Json): Json[] {
  if (!isObj(payload)) return [];

  const data = isObj(payload.data) ? payload.data : payload;

  return arr(data.records);
}

function getRecord(
  records: Json[],
  kind: string
): Json | undefined {
  const record = records.find(
    (r) => isObj(r) && r.kind === kind
  );

  return isObj(record?.data) ? record.data : undefined;
}

function getRecordText(
  records: Json[],
  kind: string
): string[] {
  return records
    .filter(
      (r) =>
        isObj(r) &&
        r.kind === kind &&
        typeof r.text === 'string'
    )
    .map((r) => String(r.text));
}

function addMoneyEvidence(
  values: Json[],
  accountId: string,
  sourcePrefix: string,
  status: EvidenceStatus,
  addEvidence: (
    accountId: string,
    claim: string,
    sourceId: string,
    status: EvidenceStatus,
    reason: string,
    excerpt: string,
    options?: Partial<Evidence>
  ) => string,
  accountEvidenceIds: string[]
) {
  for (let index = 0; index < values.length; index++) {
    const item = values[index];

    if (!isObj(item)) continue;

    for (const [key, value] of Object.entries(item)) {
      if (!/(value|amount|savings|price|revenue|arr|acv)/i.test(key)) {
        continue;
      }

      const amount = numeric(value);

      if (amount === undefined) continue;

      const evId = addEvidence(
        accountId,
        `${key}: ${String(value)}`,
        `${sourcePrefix}:${index}:${key}`,
        status,
        status === 'VERIFIED'
          ? 'Amount appears in an authoritative supporting record'
          : 'Amount is recorded but independent verification is not established',
        short(item),
        {
          key,
          numericValue: amount
        }
      );

      accountEvidenceIds.push(evId);
    }
  }
}

export function normalize(input: {
  accounts: { id: string; name?: string; raw?: unknown }[];
  paperwork: Record<string, Json>;
  team?: Json;
  signals?: Json;
  notes?: StoredNote[];
}): Omit<
  CrmState,
  'risks' | 'unknowns' | 'actions' | 'generatedAt'
> {
  const accounts: Account[] = [];
  const people: Person[] = [];
  const deals: Deal[] = [];
  const deadlines: Deadline[] = [];
  const evidence: Evidence[] = [];
  const files: CrmState['files'] = [];

  let evidenceCounter = 0;

  const addEvidence = (
    accountId: string,
    claim: string,
    sourceId: string,
    status: EvidenceStatus,
    reason: string,
    excerpt: string,
    options: Partial<Evidence> = {}
  ): string => {
    const id = `ev-${++evidenceCounter}`;

    evidence.push({
      id,
      accountId,
      claim,
      sourceId,
      sourceType: 'paperwork',
      status,
      statusReason: reason,
      confidence:
        status === 'VERIFIED' ? 'high' :
        status === 'UNKNOWN' ? 'low' : 'medium',
      excerpt,
      ...options
    });

    return id;
  };

  const seenPeople = new Set<string>();

  for (const sourceAccount of input.accounts) {
    const accountId = sourceAccount.id;

    const raw: Record<string, any> = isObj(sourceAccount.raw)
      ? sourceAccount.raw
      : {};

    const paperwork = input.paperwork[accountId];
    const records = getPaperworkRecords(paperwork);

    const profile =
      getRecord(records, 'profile') ??
      raw.profile ??
      {};

    const dealHistory =
      getRecord(records, 'deal_history') ??
      {};

    const accountName =
      sourceAccount.name ??
      firstText(profile, ['name']) ??
      firstText(raw, ['name', 'title']) ??
      accountId;

    const accountEvidenceIds: string[] = [];

    accounts.push({
      id: accountId,
      name: accountName,
      raw,
      evidenceIds: accountEvidenceIds
    });

    // 1. Customer stakeholders from actual profiles.
    const profilePeople = arr(profile.contacts_on_file);

    // 2. Support synthetic account_sheet.people fixtures.
    const syntheticPeople = arr(
      isObj(paperwork?.account_sheet)
        ? paperwork.account_sheet.people
        : undefined
    );

    const structuredPeople = [
      ...arr(raw.stakeholders),
      ...profilePeople,
      ...syntheticPeople
    ];

    for (const person of structuredPeople) {
      if (!isObj(person)) continue;

      const name = firstText(person, [
        'name',
        'full_name',
        'person',
        'contact'
      ]);

      if (!name) continue;

      const personId = `${accountId}:${slug(name)}`;

      if (seenPeople.has(personId)) continue;
      seenPeople.add(personId);

      const title = firstText(person, [
        'title',
        'job_title',
        'position',
        'role'
      ]);

      const relationship = firstText(person, [
        'relationship',
        'status',
        'sentiment'
      ]);

      const role = firstText(person, [
        'decision_role',
        'buying_role',
        'influence'
      ]);

      const evId = addEvidence(
        accountId,
        `${name}${title ? ` - ${title}` : ''}`,
        `account:${accountId}:person:${slug(name)}`,
        'UNKNOWN',
        'Customer contact record; decision authority is not independently established',
        short(person)
      );

      accountEvidenceIds.push(evId);

      people.push({
        id: personId,
        accountId,
        name,
        title,
        side: 'customer',
        roles: role ? [role] : [],
        rolesInferred: !role,
        relationship,
        said: firstText(person, ['said', 'quote']),
        evidenceIds: [evId]
      });
    }

    // 3. People appearing in synthetic call records.
    const callRecords = arr(paperwork?.calls);

    for (const call of callRecords) {
      if (!isObj(call)) continue;

      const name = firstText(call, [
        'name',
        'person',
        'contact',
        'attendee'
      ]);

      if (!name) continue;

      const personId = `${accountId}:${slug(name)}`;

      if (seenPeople.has(personId)) continue;
      seenPeople.add(personId);

      const evId = addEvidence(
        accountId,
        `${name} mentioned in call record`,
        `paperwork:${accountId}:call:${slug(name)}`,
        'TOLD',
        'Person identified in a stakeholder communication',
        short(call)
      );

      accountEvidenceIds.push(evId);

      people.push({
        id: personId,
        accountId,
        name,
        title: firstText(call, ['title', 'role']),
        side: 'customer',
        roles: [],
        rolesInferred: true,
        relationship: firstText(call, ['relationship']),
        evidenceIds: [evId]
      });
    }

    // 4. People from actual call text, where a name is explicitly present.
    for (const record of records) {
      if (!isObj(record) || record.kind !== 'call') continue;

      const body = text(record.text);
      if (!body) continue;

      const match = body.match(
        /(?:attendees?|present|participants?)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i
      );

      if (!match) continue;

      const name = match[1].trim();
      const personId = `${accountId}:${slug(name)}`;

      if (seenPeople.has(personId)) continue;
      seenPeople.add(personId);

      const evId = addEvidence(
        accountId,
        `${name} identified in a call`,
        String(record.path ?? `call:${slug(name)}`),
        'TOLD',
        'Name explicitly appears in a call record',
        short(body)
      );

      accountEvidenceIds.push(evId);

      people.push({
        id: personId,
        accountId,
        name,
        side: 'customer',
        roles: [],
        rolesInferred: true,
        evidenceIds: [evId]
      });
    }

    // 5. Account profile evidence.
    if (isObj(profile) && Object.keys(profile).length) {
      const evId = addEvidence(
        accountId,
        `Account profile: ${accountName}`,
        `profile:${accountId}`,
        'CLAIM',
        'Account profile record; individual claims retain their own evidence status',
        short(profile)
      );

      accountEvidenceIds.push(evId);
    }

    // 6. Actual open opportunities from deal_history.
    const openDeals = arr(dealHistory.on_file_as_open_at_handover);

    for (let index = 0; index < openDeals.length; index++) {
      const item = openDeals[index];

      if (!isObj(item)) continue;

      const name = firstText(item, ['what', 'name', 'title']);

      if (!name) continue;

      const value = numeric(item.value);
      const due = firstText(item, ['due', 'deadline']);

      const evId = addEvidence(
        accountId,
        `Open opportunity: ${name}`,
        `deal_history:${accountId}:${index}`,
        /contract|signed/i.test(String(item.basis ?? ''))
          ? 'VERIFIED'
          : 'CLAIM',
        text(item.basis) ?? 'Open opportunity record',
        short(item),
        {
          key: 'opportunity_value',
          numericValue: value
        }
      );

      accountEvidenceIds.push(evId);

      deals.push({
        id: `${accountId}:open:${index}`,
        accountId,
        name,
        value,
        currency:
          firstText(dealHistory, ['currency']) ??
          firstText(profile, ['currency']),
        stage: /contract/i.test(String(item.basis ?? ''))
          ? 'Renewal'
          : 'Identified',
        deadline: due,
        evidenceIds: [evId]
      });

      if (due) {
        deadlines.push({
          id: `${accountId}:open-deadline:${index}`,
          accountId,
          label: name,
          date: due,
          evidenceIds: [evId]
        });
      }
    }

    // 7. Synthetic account_sheet deals.
    const accountSheet = isObj(paperwork?.account_sheet)
      ? paperwork.account_sheet
      : {};

    for (let index = 0; index < arr(accountSheet.deals).length; index++) {
      const item = accountSheet.deals[index];

      if (!isObj(item)) continue;

      const name = firstText(item, [
        'deal',
        'name',
        'title'
      ]);

      if (!name) continue;

      const value = numeric(item.value);
      const sourceId = `paperwork.account_sheet.deals:${index}`;

      const evId = addEvidence(
        accountId,
        `Deal: ${name}`,
        sourceId,
        'CLAIM',
        'Deal amount is recorded in an account sheet but is not independently verified',
        short(item),
        {
          key: 'opportunity_value',
          numericValue: value
        }
      );

      accountEvidenceIds.push(evId);

      deals.push({
        id: `${accountId}:deal:${index}`,
        accountId,
        name,
        value,
        currency: firstText(item, ['currency']),
        stage: firstText(item, ['stage', 'status']),
        blocker: firstText(item, ['blocker', 'blocked_by']),
        owner: firstText(item, ['owner']),
        approver: firstText(item, ['approver']),
        deadline: firstText(item, ['deadline', 'due_date']),
        nextAction: firstText(item, ['next_action']),
        evidenceIds: [evId]
      });
    }

    // 8. Structured facts.
    const facts = [
      ...arr(raw.facts),
      ...arr(accountSheet.facts)
    ];

    for (let index = 0; index < facts.length; index++) {
      const fact = facts[index];

      if (!isObj(fact)) continue;

      const claim =
        firstText(fact, [
          'text',
          'claim',
          'description',
          'statement',
          'fact'
        ]) ?? short(fact);

      const status = evidenceStatus(
        fact.status ?? fact.evidence_status
      );

      const evId = addEvidence(
        accountId,
        claim,
        String(fact.id ?? `fact:${accountId}:${index}`),
        status,
        firstText(fact, ['status_reason', 'reason']) ??
          `Source evidence status: ${status}`,
        short(fact),
        {
          date: firstText(fact, ['date', 'created_at']),
          key: firstText(fact, ['key', 'field']),
          numericValue: numeric(
            fact.numeric_value ?? fact.value
          )
        }
      );

      accountEvidenceIds.push(evId);
    }

    // 9. Financial figures in synthetic calls and letters.
    addMoneyEvidence(
      arr(paperwork?.calls),
      accountId,
      `paperwork.calls:${accountId}`,
      'TOLD',
      addEvidence,
      accountEvidenceIds
    );

    addMoneyEvidence(
      arr(paperwork?.letters),
      accountId,
      `paperwork.letters:${accountId}`,
      'VERIFIED',
      addEvidence,
      accountEvidenceIds
    );

    // 10. Actual structured financial records.
    for (const record of records) {
      if (!isObj(record) || !isObj(record.data)) continue;

      const status = classifySource(
        String(record.path ?? record.kind ?? '')
      ).status;

      const values = [record.data];

      addMoneyEvidence(
        values,
        accountId,
        String(record.path ?? record.kind ?? 'paperwork'),
        status,
        addEvidence,
        accountEvidenceIds
      );
    }

    // 11. Actual text records become evidence.
    for (const record of records) {
      if (!isObj(record) || typeof record.text !== 'string') continue;

      const sourceId = String(record.path ?? 'paperwork:text');
      const classified = classifySource(sourceId);

      const evId = addEvidence(
        accountId,
        `${String(record.kind ?? 'Document')}: ${sourceId}`,
        sourceId,
        classified.status,
        classified.reason,
        short(record.text)
      );

      accountEvidenceIds.push(evId);
    }

    // 12. Synthetic account-sheet evidence.
    if (isObj(accountSheet)) {
      const evId = addEvidence(
        accountId,
        'Account sheet',
        'paperwork.account_sheet',
        'CLAIM',
        'Account sheet information has not been independently verified',
        short(accountSheet)
      );

      accountEvidenceIds.push(evId);
    }

    // 13. Actual paperwork file list.
    for (const record of records) {
      if (!isObj(record)) continue;

      const fileName = text(record.path);
      if (!fileName) continue;

      files.push({
        id: `${accountId}:file:${slug(fileName)}`,
        accountId,
        name: fileName
      });
    }

    // 14. Legacy structured files.
    for (const file of arr(paperwork?.files)) {
      if (!isObj(file)) continue;

      const fileName = firstText(file, [
        'name',
        'filename',
        'file',
        'path',
        'title'
      ]);

      if (!fileName) continue;

      files.push({
        id: `${accountId}:file:${slug(fileName)}`,
        accountId,
        name: fileName
      });
    }
  }

  // 15. FlytBase internal team.
  const teamList = Array.isArray(input.team)
    ? input.team
    : arr(input.team?.team);

  for (const member of teamList) {
    if (!isObj(member)) continue;

    const name = firstText(member, [
      'name',
      'full_name',
      'person'
    ]);

    if (!name) continue;

    const title = firstText(member, [
      'title',
      'job_title',
      'role',
      'position'
    ]);

    const personId = `flytbase:${slug(name)}`;

    if (seenPeople.has(personId)) continue;
    seenPeople.add(personId);

    const evId = addEvidence(
      'flytbase',
      `${name} (FlytBase)`,
      `team:${personId}`,
      'UNKNOWN',
      'Internal team record; role details should be confirmed from source',
      short(member)
    );

    people.push({
      id: personId,
      accountId: 'flytbase',
      name,
      title,
      side: 'flytbase',
      roles: [],
      rolesInferred: true,
      evidenceIds: [evId]
    });
  }

  // 16. Signals.
  const signalPayload = isObj(input.signals?.data)
    ? input.signals.data
    : input.signals;

  const signalList = Array.isArray(signalPayload)
    ? signalPayload
    : arr(signalPayload?.signals);

  const signals: Signal[] = signalList.map((signal, index) => ({
    id: String(signal.id ?? `signal-${index}`),
    accountId: signal.account ?? signal.account_id,
    text: String(
      signal.text ??
      signal.message ??
      signal.title ??
      short(signal, 200)
    ),
    date: signal.date ?? signal.created_at,
    raw: signal
  }));

  return {
    accounts,
    people,
    deals,
    deadlines,
    signals,
    evidence,
    files,
    notes: input.notes ?? []
  };
}