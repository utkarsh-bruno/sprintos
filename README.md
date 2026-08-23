# SprintOS

Lightweight sprint planning and execution companion for Jira. Jira stays the
source of truth for projects/boards/sprints/issues/points/status; SprintOS
stores only what Jira doesn't: commitments, capacity, review pipeline,
repository type, and planning metadata — in flat JSON files under `data/`.

## Planning workflow

1. Choose the active sprint or a future sprint and import it from Jira.
2. Configure teams and each member's normal point capacity.
3. Commit or defer imported work. SprintOS keeps that decision locally, so it
   never changes Jira's backlog or sprint membership.
4. Classify committed work as `OSS`, `Enterprise`, or `Shared`, select its
   review stage, and record reviewers.
5. Add temporary capacity overrides and planning notes for the selected sprint.

Refreshing an import updates Jira-owned fields (summary, status, story points)
and retains all SprintOS planning metadata.

## Develop

```bash
npm install
npm run dev:api   # Fastify on :4100
npm run dev:web   # Vite on :5173, proxies /api to :4100
```

`data/config.json` holds Jira credentials, so it's gitignored — copy
`data/config.example.json` to `data/config.json` and fill in `jira.email` and
`jira.token`. Basic auth (email + API token), same scheme `git-jiras` uses
against this org's Jira instance. `jira.teamField` already defaults to
`customfield_10392`, confirmed against that same instance via `git-jiras`.
`PUT /api/config` also works once the UI has a settings form.

## Docker (single container)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Serves the built web app and the API from one Fastify process on `:4100`,
backed by `data/` on the host (bind-mounted, no database).

## Structure

```
apps/api      Fastify + TypeScript, JSON file storage, Jira REST client
apps/web      Vite + React + TypeScript + Tailwind, TanStack Query
packages/types    Shared domain types (Team, Ticket, SprintData, Config)
packages/shared   Shared logic (capacity calc, review stages, point rollups)
data/         config.json + sprint-XX.json — the only persistent state
```

`packages/ui` (shadcn components), TanStack Table, and dnd-kit are named in
the intended stack but not wired up yet — deferred to v0.2 (drag-and-drop
assignment, table grids), no point installing them before a screen needs them.
