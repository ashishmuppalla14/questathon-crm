# Account Quest CRM — Thinking Document

**What it does.** A Customer Success CRM for FlytBase covering two accounts. It pulls the Questathon account sheet, paperwork, team, requests, release notes and signals; turns them into people, deals, deadlines, risks, unknowns and ranked actions; and shows where every figure came from.

**Who it is for.** A Customer Success Manager who has to decide what to do this week and needs to know which numbers they can stand behind.

**The five questions.** *Book worth:* pipeline split into VERIFIED-supported value and unverified (claim/told) value, never summed together. *Power:* stakeholder table with decision roles, labelled "(inferred)" when not stated in the data. *Do first:* three ranked actions per account with a stated reason, owner and deadline ("Date not established" when none exists). *Going wrong:* rule-triggered risks (blockers, guarded relationships, unverified financials, discrepancies, adoption gaps). *Don't know:* unknowns with why it matters, who can answer, a precise question and the decision it blocks.

**Evidence and source IDs.** Every fact carries the original API source id, source type, an evidence status, a recorded reason for that status, and an excerpt. Click any figure to see them.

**Claim vs told vs verified.** CLAIM = official sheet, unchecked. TOLD = a stakeholder said it. VERIFIED = backed by paperwork or another authoritative source. Statuses come from source kind, default to CLAIM, and are never upgraded silently. A customer's own savings figure therefore stays unverified until a document supports it, and a conflict with a verified figure raises a discrepancy risk.

**How recommendations are made.** Transparent rules, no model guessing. Each rule has an ID, a plain-English "why" and links to its evidence. Actions are scored on commercial impact, urgency, dependency, customer impact and evidence strength.

**What it does not do yet.** The normaliser is heuristic and must be tuned to the real data format after the first sync; relationship and influence scores are only shown when present in the data; no automatic writes; no per-user login (a single admin key protects sync/write); cache is a JSON file, not a database; deployment and live-data verification are manual steps.

**How AI tools were used.** Claude (Anthropic) wrote the initial architecture, code and tests from a detailed brief; a human reviews every rule, the evidence-status mapping and the final deliverables. *(Edit this paragraph to describe your own use accurately.)*

**The one-call-per-minute limit.** One serial queue for all calls, ≥65 s spacing persisted to disk, dedupe, caching of every success, backoff for reads, no retry for writes, resumable ~10-minute initial sync, no polling (signals refresh is manual or on a ≥65 s timer), and cached data keeps the dashboard working if the API is down.
