import type {
  AppConfig,
  BriefItem,
  BriefPayload,
  ChangeEvent,
  SyncStatus,
  Ticket,
} from '@sprintos/types';
import { buildForecast } from './forecast.js';
import { ownerDisplayLabel } from './ownership.js';
import { resolveReviewPath } from './review-path.js';
import { buildTicketFlags } from './risk.js';

export interface BuildBriefInput {
  tickets: Ticket[];
  changeEvents: ChangeEvent[];
  config: AppConfig;
  syncStatus: SyncStatus;
  newTickets: Ticket[];
}

function isInReviewQueue(ticket: Ticket, config: AppConfig): boolean {
  if (!ticket.pr || ticket.pr.merged || ticket.pr.state === 'closed') return false;
  const repoType = ticket.pr.repoType ?? 'unknown';
  const leadIsAuthor = ticket.assignee?.accountId === config.people.lead.jiraAccountId;
  const path = resolveReviewPath(repoType, leadIsAuthor);
  return path.leadReview;
}

function isNeedsMe(ticket: Ticket, config: AppConfig): boolean {
  if (ticket.operationalOwner === 'done') return false;
  if (ticket.operationalOwner === 'lead') return true;
  if (ticket.assignee?.accountId === config.people.lead.jiraAccountId) return true;
  return isInReviewQueue(ticket, config);
}

function ticketToBriefItem(ticket: Ticket, label: string, reason: string): BriefItem {
  return { ticketKey: ticket.key, label, reason };
}

function buildAttentionByParty(tickets: Ticket[], config: AppConfig): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ticket of tickets) {
    if (ticket.operationalOwner === 'done') continue;
    const label = ownerDisplayLabel(ticket.operationalOwner, config);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

function buildTodaysCalls(tickets: Ticket[], config: AppConfig, sprintDay: number): BriefItem[] {
  const calls: BriefItem[] = [];
  for (const ticket of tickets) {
    const flags = buildTicketFlags(ticket, config, sprintDay);
    for (const flag of flags) {
      if (flag.severity === 'urgent' || flag.severity === 'warning') {
        calls.push(ticketToBriefItem(ticket, flag.label, flag.reason));
      }
    }
  }
  return calls;
}

function buildOverallAssessment(
  tickets: Ticket[],
  config: AppConfig,
  syncStatus: SyncStatus,
  forecast: ReturnType<typeof buildForecast>,
): { overallLabel?: string; overallReason?: string } {
  if (syncStatus.isFirstSync) {
    return {
      overallLabel: "First sync — we're starting the clock.",
      overallReason:
        'Baseline established for this sprint; changes will be tracked from the next sync.',
    };
  }

  const sprintDay = syncStatus.sprintDay ?? 0;
  const freezeDay = config.sprint.freezeDay;
  const inProgressCount = tickets.filter(
    (t) =>
      t.operationalOwner === 'developer' && t.status.toLowerCase().includes('progress'),
  ).length;

  const bottleneck = forecast.find((row) => row.status === 'bottleneck');
  if (bottleneck) {
    return {
      overallLabel: 'Day 8 Is Looking Nervous',
      overallReason: `${bottleneck.party} is at ${bottleneck.utilizationPct}% capacity with ${syncStatus.workingDaysUntilFreeze ?? 0} working days until QA freeze (day ${freezeDay}).`,
    };
  }

  if (sprintDay > freezeDay - 2 && inProgressCount >= 3) {
    return {
      overallLabel: 'Day 8 Is Looking Nervous',
      overallReason: `${inProgressCount} developer tickets still in progress with ${syncStatus.workingDaysUntilFreeze ?? 0} working days until QA freeze (day ${freezeDay}).`,
    };
  }

  return {
    overallLabel: 'Nothing to See Here',
    overallReason: 'Sprint load looks manageable heading into freeze.',
  };
}

export function buildBrief(input: BuildBriefInput): BriefPayload {
  const { tickets, changeEvents, config, syncStatus, newTickets: _newTickets } = input;
  const sprintDay = syncStatus.sprintDay ?? 1;
  const workingDaysUntilFreeze = syncStatus.workingDaysUntilFreeze ?? 0;

  const forecast = buildForecast(tickets, config, sprintDay, workingDaysUntilFreeze);

  const needsMe = tickets
    .filter((t) => isNeedsMe(t, config))
    .map((t) =>
      ticketToBriefItem(
        t,
        t.operationalOwner === 'lead' ? 'Review Queue Says Hi' : `${t.key} needs you`,
        t.ownerReason,
      ),
    );

  const attentionByParty = buildAttentionByParty(tickets, config);
  const todaysCalls = buildTodaysCalls(tickets, config, sprintDay);
  const { overallLabel, overallReason } = buildOverallAssessment(
    tickets,
    config,
    syncStatus,
    forecast,
  );

  return {
    sync: syncStatus,
    changed: changeEvents,
    needsMe,
    attentionByParty,
    forecast,
    todaysCalls,
    overallLabel,
    overallReason,
  };
}
