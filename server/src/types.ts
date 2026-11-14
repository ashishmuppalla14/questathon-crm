export type EvidenceStatus = 'CLAIM' | 'TOLD' | 'VERIFIED' | 'UNKNOWN';
export type Confidence = 'low' | 'medium' | 'high';

export interface Evidence {
  id: string;
  claim: string;
  accountId: string;
  personId?: string;
  sourceId: string;        // original API id/path the claim came from
  sourceType: string;      // account | paperwork | team | feature_request | release_note | signal
  status: EvidenceStatus;
  statusReason: string;    // why this status was assigned (never silent)
  date?: string;
  confidence: Confidence;
  excerpt: string;
  key?: string;            // leaf key name, used for discrepancy detection
  numericValue?: number;
}

export interface Account { id: string; name: string; raw: unknown; evidenceIds: string[] }
export interface Person {
  id: string; accountId: string; name: string; title?: string;
  side: 'customer' | 'flytbase'; roles: string[]; rolesInferred: boolean;
  relationship?: string; said?: string; evidenceIds: string[];
}
export interface Deal {
  id: string; accountId: string; name: string; value?: number; currency?: string;
  stage?: string; blocker?: string; approver?: string; owner?: string; deadline?: string;
  nextAction?: string; evidenceIds: string[];
}
export interface Deadline { id: string; accountId: string; label: string; date: string; owner?: string; evidenceIds: string[] }
export interface Signal { id: string; accountId?: string; text: string; date?: string; raw: unknown }

export interface Risk {
  id: string; accountId: string; title: string; severity: 'high' | 'medium' | 'low';
  ruleId: string; why: string; mitigation: string; owner?: string; deadline?: string;
  probability?: string; evidenceIds: string[];
}
export interface Unknown {
  id: string; accountId: string; what: string; whyItMatters: string;
  whoCanAnswer: string; question: string; dependsOn: string; evidenceIds: string[];
}
export interface Action {
  id: string; accountId: string; rank: number; title: string; reason: string;
  owner: string; deadline: string; expectedOutcome: string; status: 'open';
  score: number; ruleId: string; evidenceIds: string[];
}

export interface CrmState {
  generatedAt: string;
  accounts: Account[]; people: Person[]; deals: Deal[]; deadlines: Deadline[];
  signals: Signal[]; evidence: Evidence[]; risks: Risk[]; unknowns: Unknown[]; actions: Action[];
  files: { id: string; accountId?: string; name: string }[];
  notes: StoredNote[];
}
export interface StoredNote { id: string; text: string; accountId?: string; kind?: string; title?: string; savedAt: string }
