import type {
  ChangeEvent,
  OwnershipEvent,
  PlanningOverride,
  Sprint,
  Ticket,
} from '@sprintos/types';
import { ticketContentHash } from '@sprintos/shared';
import { getDb } from './db.js';

export interface SyncRunRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  jira_issue_count: number | null;
  github_pr_count: number | null;
  error_message: string | null;
}

export function upsertSprint(sprint: Sprint): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sprints (id, name, start_date, end_date, freeze_day, working_days)
    VALUES (@id, @name, @startDate, @endDate, @freezeDay, @workingDays)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      freeze_day = excluded.freeze_day,
      working_days = excluded.working_days
  `).run({
    id: sprint.id,
    name: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    freezeDay: sprint.freezeDay,
    workingDays: sprint.workingDays,
  });
}

export function getSprint(sprintId: string): Sprint | null {
  const row = getDb()
    .prepare('SELECT * FROM sprints WHERE id = ?')
    .get(sprintId) as
    | {
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        freeze_day: number;
        working_days: number;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    freezeDay: row.freeze_day,
    workingDays: row.working_days,
  };
}

export function getLatestSprint(): Sprint | null {
  const row = getDb().prepare('SELECT * FROM sprints ORDER BY rowid DESC LIMIT 1').get() as
    | {
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        freeze_day: number;
        working_days: number;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    freezeDay: row.freeze_day,
    workingDays: row.working_days,
  };
}

export function loadTicketsForSprint(sprintId: string): Ticket[] {
  const rows = getDb()
    .prepare('SELECT data_json FROM tickets WHERE sprint_id = ?')
    .all(sprintId) as Array<{ data_json: string }>;

  return rows.map((row) => JSON.parse(row.data_json) as Ticket);
}

export function loadTicket(key: string): Ticket | null {
  const row = getDb().prepare('SELECT data_json FROM tickets WHERE key = ?').get(key) as
    | { data_json: string }
    | undefined;
  if (!row) return null;
  return JSON.parse(row.data_json) as Ticket;
}

export function upsertTickets(tickets: Ticket[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tickets (key, sprint_id, data_json, content_hash, updated_at)
    VALUES (@key, @sprintId, @dataJson, @contentHash, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      sprint_id = excluded.sprint_id,
      data_json = excluded.data_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction((items: Ticket[]) => {
    for (const ticket of items) {
      stmt.run({
        key: ticket.key,
        sprintId: ticket.sprintId,
        dataJson: JSON.stringify(ticket),
        contentHash: ticketContentHash({
          key: ticket.key,
          status: ticket.status,
          storyPoints: ticket.storyPoints,
          assignee: ticket.assignee,
          operationalOwner: ticket.operationalOwner,
          prUrl: ticket.pr?.url,
        }),
        updatedAt: ticket.lastSeenAt,
      });
    }
  });

  tx(tickets);
}

/** Replace the sprint's ticket rows with the filtered sync result (drops tickets no longer matched). */
export function replaceTicketsForSprint(sprintId: string, tickets: Ticket[]): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO tickets (key, sprint_id, data_json, content_hash, updated_at)
    VALUES (@key, @sprintId, @dataJson, @contentHash, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      sprint_id = excluded.sprint_id,
      data_json = excluded.data_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction((items: Ticket[]) => {
    const keys = items.map((t) => t.key);
    if (keys.length === 0) {
      db.prepare('DELETE FROM tickets WHERE sprint_id = ?').run(sprintId);
    } else {
      const placeholders = keys.map(() => '?').join(',');
      db.prepare(`DELETE FROM tickets WHERE sprint_id = ? AND key NOT IN (${placeholders})`).run(
        sprintId,
        ...keys,
      );
    }
    for (const ticket of items) {
      upsert.run({
        key: ticket.key,
        sprintId: ticket.sprintId,
        dataJson: JSON.stringify(ticket),
        contentHash: ticketContentHash({
          key: ticket.key,
          status: ticket.status,
          storyPoints: ticket.storyPoints,
          assignee: ticket.assignee,
          operationalOwner: ticket.operationalOwner,
          prUrl: ticket.pr?.url,
        }),
        updatedAt: ticket.lastSeenAt,
      });
    }
  });

  tx(tickets);
}

export function hasSnapshotsForSprint(sprintId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM snapshots WHERE sprint_id = ? LIMIT 1')
    .get(sprintId);
  return row != null;
}

export function getSnapshotCount(sprintId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS count FROM snapshots WHERE sprint_id = ?')
    .get(sprintId) as { count: number };
  return row.count;
}

export function loadLatestSnapshotTickets(sprintId: string): Ticket[] {
  const snapshot = getDb()
    .prepare(`
      SELECT id FROM snapshots
      WHERE sprint_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(sprintId) as { id: number } | undefined;

  if (!snapshot) return [];

  const rows = getDb()
    .prepare('SELECT data_json FROM snapshot_tickets WHERE snapshot_id = ?')
    .all(snapshot.id) as Array<{ data_json: string }>;

  return rows.map((row) => JSON.parse(row.data_json) as Ticket);
}

/** Snapshot before the most recent one (for scoped change detection). */
export function loadPreviousSnapshotTickets(sprintId: string): Ticket[] {
  const snapshots = getDb()
    .prepare(`
      SELECT id FROM snapshots
      WHERE sprint_id = ?
      ORDER BY id DESC
      LIMIT 2
    `)
    .all(sprintId) as Array<{ id: number }>;

  if (snapshots.length < 2) return [];

  const rows = getDb()
    .prepare('SELECT data_json FROM snapshot_tickets WHERE snapshot_id = ?')
    .all(snapshots[1].id) as Array<{ data_json: string }>;

  return rows.map((row) => JSON.parse(row.data_json) as Ticket);
}

export function createSnapshot(sprintId: string, tickets: Ticket[]): number {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const contentHash = tickets
    .map((ticket) =>
      ticketContentHash({
        key: ticket.key,
        status: ticket.status,
        storyPoints: ticket.storyPoints,
        assignee: ticket.assignee,
        operationalOwner: ticket.operationalOwner,
        prUrl: ticket.pr?.url,
      }),
    )
    .sort()
    .join('||');

  const tx = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO snapshots (sprint_id, created_at, content_hash) VALUES (?, ?, ?)')
      .run(sprintId, createdAt, contentHash);
    const snapshotId = Number(result.lastInsertRowid);

    const stmt = db.prepare(`
      INSERT INTO snapshot_tickets (snapshot_id, ticket_key, data_json, content_hash)
      VALUES (?, ?, ?, ?)
    `);

    for (const ticket of tickets) {
      stmt.run(
        snapshotId,
        ticket.key,
        JSON.stringify(ticket),
        ticketContentHash({
          key: ticket.key,
          status: ticket.status,
          storyPoints: ticket.storyPoints,
          assignee: ticket.assignee,
          operationalOwner: ticket.operationalOwner,
          prUrl: ticket.pr?.url,
        }),
      );
    }

    return snapshotId;
  });

  return tx();
}

export function insertChangeEvents(events: ChangeEvent[]): void {
  if (events.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO change_events (ticket_key, type, before_value, after_value, detected_at)
    VALUES (@ticketKey, @type, @beforeValue, @afterValue, @detectedAt)
  `);

  const tx = db.transaction((items: ChangeEvent[]) => {
    for (const event of items) {
      stmt.run({
        ticketKey: event.ticketKey,
        type: event.type,
        beforeValue: event.beforeValue ?? null,
        afterValue: event.afterValue ?? null,
        detectedAt: event.detectedAt,
      });
    }
  });

  tx(events);
}

export function insertOwnershipEvents(events: OwnershipEvent[]): void {
  if (events.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ownership_events (ticket_key, from_owner, to_owner, reason, detected_at)
    VALUES (@ticketKey, @fromOwner, @toOwner, @reason, @detectedAt)
  `);

  const tx = db.transaction((items: OwnershipEvent[]) => {
    for (const event of items) {
      stmt.run({
        ticketKey: event.ticketKey,
        fromOwner: event.fromOwner,
        toOwner: event.toOwner,
        reason: event.reason,
        detectedAt: event.detectedAt,
      });
    }
  });

  tx(events);
}

export function upsertPlanningOverride(override: PlanningOverride): void {
  getDb()
    .prepare(`
      INSERT INTO planning_overrides (ticket_key, mode, note, updated_at)
      VALUES (@ticketKey, @mode, @note, @updatedAt)
      ON CONFLICT(ticket_key) DO UPDATE SET
        mode = excluded.mode,
        note = excluded.note,
        updated_at = excluded.updated_at
    `)
    .run({
      ticketKey: override.ticketKey,
      mode: override.mode,
      note: override.note ?? null,
      updatedAt: override.updatedAt,
    });
}

export function loadAllChangeEvents(): ChangeEvent[] {
  const rows = getDb()
    .prepare(`
      SELECT id, ticket_key, type, before_value, after_value, detected_at
      FROM change_events
      ORDER BY detected_at DESC, id DESC
    `)
    .all() as Array<{
      id: number;
      ticket_key: string;
      type: string;
      before_value: string | null;
      after_value: string | null;
      detected_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    ticketKey: row.ticket_key,
    type: row.type,
    ...(row.before_value != null ? { beforeValue: row.before_value } : {}),
    ...(row.after_value != null ? { afterValue: row.after_value } : {}),
    detectedAt: row.detected_at,
  }));
}

export function loadPlanningOverrides(): Map<string, PlanningOverride> {
  const rows = getDb().prepare('SELECT ticket_key, mode, note, updated_at FROM planning_overrides').all() as Array<{
    ticket_key: string;
    mode: string;
    note: string | null;
    updated_at: string;
  }>;

  const map = new Map<string, PlanningOverride>();
  for (const row of rows) {
    map.set(row.ticket_key, {
      ticketKey: row.ticket_key,
      mode: row.mode as PlanningOverride['mode'],
      ...(row.note ? { note: row.note } : {}),
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export interface ClearSyncDataResult {
  snapshotsRemoved: number;
  ticketsRemoved: number;
  changeEventsRemoved: number;
  ownershipEventsRemoved: number;
  syncRunsRemoved: number;
}

/** Wipe sync history so the next sync establishes a fresh baseline (planning overrides kept). */
export function clearSyncData(): ClearSyncDataResult {
  const db = getDb();

  return db.transaction(() => {
    db.prepare('DELETE FROM snapshot_tickets').run();
    const snapshotsRemoved = (db.prepare('DELETE FROM snapshots').run() as { changes: number }).changes;
    const ticketsRemoved = (db.prepare('DELETE FROM tickets').run() as { changes: number }).changes;
    const changeEventsRemoved = (
      db.prepare('DELETE FROM change_events').run() as { changes: number }
    ).changes;
    const ownershipEventsRemoved = (
      db.prepare('DELETE FROM ownership_events').run() as { changes: number }
    ).changes;
    const syncRunsRemoved = (db.prepare('DELETE FROM sync_runs').run() as { changes: number }).changes;

    return {
      snapshotsRemoved,
      ticketsRemoved,
      changeEventsRemoved,
      ownershipEventsRemoved,
      syncRunsRemoved,
    };
  })();
}

export function startSyncRun(startedAt: string): number {
  const result = getDb()
    .prepare('INSERT INTO sync_runs (started_at, status) VALUES (?, ?)')
    .run(startedAt, 'syncing');
  return Number(result.lastInsertRowid);
}

export function completeSyncRun(
  id: number,
  status: 'success' | 'partial' | 'failed',
  completedAt: string,
  jiraIssueCount?: number,
  githubPrCount?: number,
  errorMessage?: string,
): void {
  getDb()
    .prepare(`
      UPDATE sync_runs
      SET completed_at = ?, status = ?, jira_issue_count = ?, github_pr_count = ?, error_message = ?
      WHERE id = ?
    `)
    .run(completedAt, status, jiraIssueCount ?? null, githubPrCount ?? null, errorMessage ?? null, id);
}

export function getLatestSyncRun(): SyncRunRow | null {
  const row = getDb()
    .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1')
    .get() as SyncRunRow | undefined;
  return row ?? null;
}

export function getLatestSuccessfulSyncRun(): SyncRunRow | null {
  const row = getDb()
    .prepare(`
      SELECT * FROM sync_runs
      WHERE status IN ('success', 'partial')
      ORDER BY id DESC
      LIMIT 1
    `)
    .get() as SyncRunRow | undefined;
  return row ?? null;
}

export function getChangeEventsForSyncRun(syncRun: SyncRunRow): ChangeEvent[] {
  if (!syncRun.completed_at) return [];

  const rows = getDb()
    .prepare(`
      SELECT id, ticket_key, type, before_value, after_value, detected_at
      FROM change_events
      WHERE detected_at >= ? AND detected_at <= ?
      ORDER BY id ASC
    `)
    .all(syncRun.started_at, syncRun.completed_at) as Array<{
      id: number;
      ticket_key: string;
      type: string;
      before_value: string | null;
      after_value: string | null;
      detected_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    ticketKey: row.ticket_key,
    type: row.type,
    ...(row.before_value != null ? { beforeValue: row.before_value } : {}),
    ...(row.after_value != null ? { afterValue: row.after_value } : {}),
    detectedAt: row.detected_at,
  }));
}
