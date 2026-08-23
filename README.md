# SprintOS

## Config

Copy `data/config.example.json` to `data/config.json` and fill in Jira + GitHub tokens.

Docker mounts `./data` into the container so `config.json` and `sprintos.db` persist. On first run without a config file, the container creates one from the example — edit it or use **Settings** in the UI.

## Commands

```bash
# Local dev
npm install
npm run dev:api   # API on :4100
npm run dev:web   # UI on :5173

# Docker (API + UI on :4100)
docker compose up --build
```

Open http://localhost:4100 and run **Sync**.
