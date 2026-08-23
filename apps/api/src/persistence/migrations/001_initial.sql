CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  jira_issue_count INTEGER,
  github_pr_count INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  freeze_day INTEGER NOT NULL DEFAULT 8,
  working_days INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS tickets (
  key TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES sprints(id),
  data_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_tickets (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  ticket_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, ticket_key)
);

CREATE TABLE IF NOT EXISTS ownership_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_key TEXT NOT NULL,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  reason TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_key TEXT NOT NULL,
  type TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  detected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planning_overrides (
  ticket_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL
);
