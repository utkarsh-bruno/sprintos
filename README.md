# SprintOS

Lightweight sprint planning and execution companion for Jira. Jira stays the
source of truth for projects/boards/sprints/issues/points/status; SprintOS
stores only what Jira doesn't: commitments, capacity, review pipeline,
repository type, and planning metadata — in flat JSON files under `data/`.

v0.1 scope: Jira connection, sprint import, team management, capacity calc.
See root spec for the full roadmap.

## Develop

```bash
npm install
npm run dev:api   # Fastify on :4100
npm run dev:web   # Vite on :5173, proxies /api to :4100
```

Set Jira credentials in `data/config.json` (`jira.url`, `jira.token`) before
importing a sprint — `PUT /api/config` also works from the UI once wired up.

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
