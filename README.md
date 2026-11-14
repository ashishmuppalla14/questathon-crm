# Account Quest CRM (Questathon · FlytBase Customer Success)

A CRM dashboard for two customer accounts that answers: **What is the book worth? Who holds the power? What do I do first? What is about to go wrong? What do I still not know?** Every number links to its evidence; unknowns are shown, not hidden.

> **Status honesty:** this code was built and tested without access to the live Questathon API (no token, host unreachable from the build sandbox). The MCP client follows the standard MCP JSON-RPC shape and the normaliser is a *heuristic* walker. After your first real sync, check **Evidence & Documents** and adjust `server/src/mcp.ts` (protocol/header) and `server/src/normalize.ts` (field names from `get_data_format`) if anything is mis-parsed. See "First run checklist".

## Architecture
```
Browser (React/Vite/Tailwind/Recharts)  ──HTTP──▶  Express API (server/)  ──queue (≥65s apart)──▶  Questathon MCP
                                                    ├ store.ts   JSON cache in DATA_DIR
                                                    ├ queue.ts   single serial queue, dedupe, backoff, persisted clock
                                                    ├ mcp.ts     JSON-RPC client (token stays here)
                                                    ├ sync.ts    ordered initial sync + signals refresh
                                                    ├ normalize.ts  raw JSON → evidence-tagged entities
                                                    └ rules.ts   deterministic risks / unknowns / actions
```
The browser only talks to *our* API, which serves cached data. The token never reaches the browser.

## Install & run
```bash
npm install
cp .env.example server/.env      # fill AQ_TOKEN and ADMIN_KEY (never commit)
cp .env.example web/.env.local   # only VITE_API_URL is used here
npm run dev                      # API :8787, web :5173
npm test && npm run build
```
Open the app → **Synchronization** → enter your `ADMIN_KEY` → **Run initial sync**. It makes 9 calls, one every ≥65 s (~10 min). Progress is saved after each call; re-running resumes from cache (only `get_signals` is refetched).

## First run checklist
1. Compare `server/src/mcp.ts` with the Questathon **CONNECT** page example (headers, whether an `initialize` step is needed). Only this file should change.
2. After sync, open **Evidence & Documents**: are people/deals/dates parsed? If not, adjust regexes at the top of `normalize.ts` (use `GET /api/raw/get_all_paperwork:<accountId>` with `x-admin-key`).
3. Check evidence statuses. `SOURCE_RULES` in `normalize.ts` maps source kind → CLAIM/TOLD/VERIFIED; correct anything wrong. Unrecognised sources default to **CLAIM**, never VERIFIED.

## API rate limit (1 call/min/token, writes included)
All calls go through `RequestQueue`: one promise chain (never concurrent), ≥65 s between call starts (clamped, cannot be configured lower), last-call time persisted to disk (survives restarts), identical keys deduped, every success cached, exponential backoff for recoverable read errors, **writes never retried**, failed calls still consume the interval. The Sync page shows the next permitted call time. Auto-refresh (`REFRESH_SECONDS`, ≥65) only refreshes `get_signals`.

## Evidence model
`CLAIM` official sheet, unverified · `TOLD` stakeholder statement · `VERIFIED` paperwork/authoritative · `UNKNOWN` not established. Each evidence record has claim, account, source id, source type, status, **statusReason**, date, confidence and an excerpt. Statuses are never upgraded silently; inferred roles are labelled "(inferred)". Unverified money is shown separately and never added to supported pipeline.

## Recommendation rules (rules.ts)
`R-DOC-BLOCK` documentation blocker · `R-BLOCKER` other blocker · `R-GUARDED` weak relationship · `R-UNVERIFIED-FIN` · `R-DISCREPANCY` claim vs verified figure · `R-DEADLINE-NO-OWNER` · `R-ADOPTION` installs without usage evidence · `R-NO-OWNER`. Actions are scored (impact + urgency + dependency + customer + evidence strength); top 3 per account. Missing dates read "Date not established".

## Write-back
Sync page → note form → **Preview** (no API call) → **Confirm and write**. One call, no retry; returned id is stored.

## Tests
`npm test` — queue spacing/dedupe/persistence/backoff, MCP parsing & token redaction, normalisation, rules, full sync order with a local stand-in MCP, cache-when-offline, write confirmation, token-never-leaks, UI evidence drill-down and honest empty states. Test fixtures are synthetic and used only in tests.

## Deploy
See `docs/DEPLOYMENT.md`.
