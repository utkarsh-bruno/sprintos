# SprintOS

Sprint Control Cockpit — a local-first companion for active Jira sprints. Jira and
GitHub stay the source of truth; SprintOS syncs sprint tickets, enriches them with
PR metadata, resolves operational ownership, forecasts capacity to freeze day, and
surfaces a daily brief. State lives in SQLite (`data/sprintos.db`); credentials in
`data/config.json` (gitignored).

## Workflow

1. Copy `data/config.example.json` to `data/config.json` and fill in Jira + GitHub tokens, people account IDs, and status→owner mapping (or use **Settings** in the UI).
2. Start the dev servers (or Docker — see below).
3. Open **Current** and click **Sync** to pull the active Jira sprint, linked GitHub PRs, and compute the brief.
4. Use **Tickets** for the full table with filters and planning overrides; **Capacity** for load vs capacity forecast; **Changes** for snapshot diffs; **Settings** to update config.

Re-sync anytime. First sync establishes a baseline (no “added to sprint” noise); later syncs detect changes. If GitHub fails partially, data is still saved with incomplete PR flags. If Jira sync fails after a prior success, the UI shows **Stale data** from the last good sync.

## Pages

| Page | Purpose |
|---|---|
| **Current** | Daily brief: what changed, needs me, attention by party, forecast, today's calls |
| **Tickets** | Filterable ticket table, planning mode per ticket, risk flags |
| **Capacity** | Developer / lead review / additional review / QA utilization to freeze day |
| **Changes** | Chronological change events from snapshot diffs |
| **Settings** | Jira & GitHub credentials (tokens redacted on read), people IDs, status map |

## Config (`data/config.json`)

Key fields (see `data/config.example.json` for full schema):

- **jira** — `url`, `email`, `token`, custom field IDs (`teamField`, `prField`, `sprintField`, `storyPointFields`)
- **github** — `token` for PR enrichment
- **repos** — `oss` and `enterprise` slug lists (drives review path)
- **people** — `lead.jiraAccountId`, `additionalReview.jiraAccountId`
- **statusOwnerMap** — Jira status name → operational owner (`product`, `developer`, `lead`, `qa`, …)
- **sprint** — working days, freeze day, capacity hours, thresholds, estimate formulas

`GET /api/config` returns redacted tokens (`••••••`). `PUT /api/config` merges updates; leave token fields blank or masked to preserve existing secrets.

## Develop

```bash
npm install
npm run dev:api   # Fastify on :4100
npm run dev:web   # Vite on :5173, proxies /api to :4100
```

```bash
npm test          # unit tests (packages/shared)
npm run typecheck # build all workspaces
```

API health: `GET http://localhost:4100/api/health`  
Sync: `POST http://localhost:4100/api/sync`  
Status: `GET http://localhost:4100/api/status`

## Docker (single container)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Serves the built web app and API from one Fastify process on `:4100`. Mount `./data` for config and SQLite persistence.

## Structure

```
apps/api          Fastify + TypeScript, SQLite (better-sqlite3), Jira/GitHub sync
apps/web          Vite + React + Tailwind + TanStack Query
packages/types    Shared domain + config types
packages/shared   Pure business logic (ownership, forecast, brief, diff, …)
data/             config.json + sprintos.db (local only, gitignored)
```
