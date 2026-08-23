import type { BriefPayload, PullRequestData, Sprint, SyncStatus, Ticket } from '@sprintos/types';
import {
  buildBrief,
  diffSnapshots,
  repoTypeFromSlug,
  resolveOperationalOwner,
  sprintDayIndex,
  workingDaysUntil,
} from '@sprintos/shared';
import { readAppConfig } from '../lib/config.js';
import { fetchPullRequest, parsePrNumber } from '../integrations/github.js';
import {
  fetchActiveSprint,
  fetchSprintMeta,
  fetchSprintTickets,
  type JiraTicketRaw,
} from '../integrations/jira.js';
import {
  completeSyncRun,
  createSnapshot,
  getChangeEventsForSyncRun,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getLatestSprint,
  getSnapshotCount,
  hasSnapshotsForSprint,
  insertChangeEvents,
  insertOwnershipEvents,
  loadPlanningOverrides,
  loadTicketsForSprint,
  startSyncRun,
  upsertSprint,
  upsertTickets,
} from '../persistence/tickets.js';

let cachedBrief: BriefPayload | null = null;

export function clearBriefCache(): void {
  cachedBrief = null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildSprint(
  sprintId: string,
  name: string,
  meta: { startDate?: string; endDate?: string },
  freezeDay: number,
  workingDays: number,
): Sprint {
  const startDate = meta.startDate?.slice(0, 10) ?? todayIsoDate();
  const endDate = meta.endDate?.slice(0, 10) ?? startDate;
  return { id: sprintId, name, startDate, endDate, freezeDay, workingDays };
}

async function fetchPrForTicket(
  token: string,
  prUrl: string,
  repos: { oss: string[]; enterprise: string[] },
): Promise<PullRequestData> {
  const parsed = parsePrNumber(prUrl);
  if (!parsed) {
    return { url: prUrl, incomplete: true };
  }

  try {
    const pr = await fetchPullRequest(token, parsed.slug, parsed.number);
    return {
      ...pr,
      repoType: repoTypeFromSlug(parsed.slug, { repos }),
    };
  } catch {
    return {
      url: prUrl,
      owner: parsed.slug.split('/')[0],
      repo: parsed.slug.split('/')[1],
      number: parsed.number,
      incomplete: true,
    };
  }
}

function buildTicket(
  raw: JiraTicketRaw,
  pr: PullRequestData | undefined,
  config: Awaited<ReturnType<typeof readAppConfig>>,
  existing: Ticket | undefined,
  now: string,
): Ticket {
  const dependency = existing?.dependency;
  const { owner, reason } = resolveOperationalOwner(raw.status, config.statusOwnerMap, dependency);

  return {
    id: raw.id,
    key: raw.key,
    summary: raw.summary,
    status: raw.status,
    ...(raw.statusCategory ? { statusCategory: raw.statusCategory } : {}),
    ...(raw.priority ? { priority: raw.priority } : {}),
    storyPoints: raw.storyPoints,
    ...(raw.assignee ? { assignee: raw.assignee } : {}),
    ...(raw.team ? { team: raw.team } : {}),
    sprintId: raw.sprintId,
    operationalOwner: owner,
    ownerReason: reason,
    ...(dependency ? { dependency } : {}),
    ...(pr ? { pr } : {}),
    jiraUpdatedAt: raw.jiraUpdatedAt,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    flags: [],
  };
}

function buildSyncStatusFromRun(
  sprint: Sprint | null,
  syncRun: ReturnType<typeof getLatestSyncRun> | ReturnType<typeof getLatestSuccessfulSyncRun>,
  isFirstSync?: boolean,
): SyncStatus {
  if (!syncRun) {
    return { status: 'idle' };
  }

  const today = todayIsoDate();
  const status: SyncStatus['status'] =
    syncRun.status === 'syncing'
      ? 'syncing'
      : syncRun.status === 'success'
        ? 'success'
        : syncRun.status === 'partial'
          ? 'partial'
          : syncRun.status === 'failed'
            ? 'failed'
            : 'idle';

  const result: SyncStatus = {
    status,
    lastSyncAt: syncRun.completed_at ?? syncRun.started_at,
    ...(syncRun.status === 'success' || syncRun.status === 'partial'
      ? { lastSuccessAt: syncRun.completed_at ?? undefined }
      : {}),
    ...(syncRun.jira_issue_count != null ? { jiraIssueCount: syncRun.jira_issue_count } : {}),
    ...(syncRun.github_pr_count != null ? { githubPrCount: syncRun.github_pr_count } : {}),
    ...(syncRun.error_message ? { errorMessage: syncRun.error_message } : {}),
  };

  if (sprint) {
    result.sprint = sprint;
    result.sprintDay = sprintDayIndex(sprint.startDate, today);
    result.workingDaysUntilFreeze = workingDaysUntil(sprint.startDate, today, sprint.freezeDay);
    if (isFirstSync != null) {
      result.isFirstSync = isFirstSync;
    } else if (hasSnapshotsForSprint(sprint.id)) {
      result.isFirstSync = getSnapshotCount(sprint.id) === 1;
    }
  }

  return result;
}

export async function runSync(): Promise<BriefPayload> {
  const config = await readAppConfig();
  const startedAt = new Date().toISOString();
  const syncRunId = startSyncRun(startedAt);

  try {
    const activeSprint = await fetchActiveSprint(config.jira);
    if (!activeSprint) {
      throw new Error('No active Jira sprint found — start or assign a sprint in Jira first');
    }

    const sprintId = String(activeSprint.id);
    const meta = await fetchSprintMeta(config, activeSprint.id);
    const sprint = buildSprint(
      sprintId,
      meta.name || activeSprint.name,
      meta,
      config.sprint.freezeDay,
      config.sprint.workingDays,
    );
    upsertSprint(sprint);

    const rawTickets = await fetchSprintTickets(config, activeSprint.id, sprintId);
    const previousTickets = loadTicketsForSprint(sprintId);
    const previousByKey = new Map(previousTickets.map((ticket) => [ticket.key, ticket]));
    const now = new Date().toISOString();

    let githubAttempts = 0;
    let githubSuccesses = 0;
    const tickets: Ticket[] = [];

    for (const raw of rawTickets) {
      const existing = previousByKey.get(raw.key);

      let pr: PullRequestData | undefined;
      const firstPrUrl = raw.prUrls[0];
      if (firstPrUrl) {
        githubAttempts++;
        pr = await fetchPrForTicket(config.github.token, firstPrUrl, config.repos);
        if (!pr.incomplete) {
          githubSuccesses++;
        }
      }

      tickets.push(buildTicket(raw, pr, config, existing, now));
    }

    const isFirstSync = !hasSnapshotsForSprint(sprintId);
    const { changeEvents, ownershipEvents } = diffSnapshots(previousTickets, tickets, { isFirstSync });

    insertChangeEvents(changeEvents);
    insertOwnershipEvents(ownershipEvents);
    upsertTickets(tickets);
    createSnapshot(sprintId, tickets);

    const completedAt = new Date().toISOString();
    const allGithubFailed = githubAttempts > 0 && githubSuccesses === 0;
    const syncStatus: SyncStatus['status'] = allGithubFailed ? 'partial' : 'success';

    completeSyncRun(
      syncRunId,
      syncStatus,
      completedAt,
      rawTickets.length,
      githubSuccesses,
      allGithubFailed ? 'GitHub PR fetch failed for all linked pull requests' : undefined,
    );

    const sync = buildSyncStatusFromRun(sprint, getLatestSyncRun(), isFirstSync);
    const newTicketKeys = new Set(
      changeEvents.filter((e) => e.type === 'ticket_added_to_sprint').map((e) => e.ticketKey),
    );
    const newTickets = tickets.filter((t) => newTicketKeys.has(t.key));

    const planningOverrides = loadPlanningOverrides();
    const brief = buildBrief({
      tickets,
      changeEvents,
      config,
      syncStatus: sync,
      newTickets,
      planningOverrides,
    });

    cachedBrief = brief;
    return brief;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    completeSyncRun(syncRunId, 'failed', new Date().toISOString(), undefined, undefined, message);
    throw err;
  }
}

export function getSyncStatus(): SyncStatus {
  const sprint = getLatestSprint();
  const latest = getLatestSyncRun();
  const lastSuccess = getLatestSuccessfulSyncRun();
  const status = buildSyncStatusFromRun(sprint, latest);

  if (lastSuccess?.completed_at && !status.lastSuccessAt) {
    status.lastSuccessAt = lastSuccess.completed_at;
  }

  return status;
}

export async function getLatestBrief(): Promise<BriefPayload | null> {
  if (cachedBrief) {
    return cachedBrief;
  }

  const syncRun = getLatestSuccessfulSyncRun();
  if (!syncRun) {
    return null;
  }

  const sprint = getLatestSprint();
  if (!sprint) {
    return null;
  }

  const config = await readAppConfig();
  const tickets = loadTicketsForSprint(sprint.id);
  const changed = getChangeEventsForSyncRun(syncRun);
  const isFirstSync = getSnapshotCount(sprint.id) === 1;
  const sync = buildSyncStatusFromRun(sprint, syncRun, isFirstSync);

  const newTicketKeys = new Set(
    changed.filter((e) => e.type === 'ticket_added_to_sprint').map((e) => e.ticketKey),
  );
  const newTickets = tickets.filter((t) => newTicketKeys.has(t.key));

  const planningOverrides = loadPlanningOverrides();
  const brief = buildBrief({
    tickets,
    changeEvents: changed,
    config,
    syncStatus: sync,
    newTickets,
    planningOverrides,
  });

  cachedBrief = brief;
  return brief;
}
