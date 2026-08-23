import type {
  AppConfig,
  BriefItem,
  BriefPayload,
  ChangeEvent,
  PlanningOverride,
  SyncStatus,
  Ticket,
} from '@sprintos/types';
import { buildForecast, buildPersonForecast } from './forecast.js';
import { filterChangeEventsForScope } from './history.js';
import { ownerDisplayLabel } from './ownership.js';
import { planningVerdict } from './planning.js';
import { isPrMergedOrClosed } from './pr-state.js';
import { resolveReviewPath } from './review-path.js';
import { buildTicketFlags } from './risk.js';

export interface BuildBriefInput {
  tickets: Ticket[];
  changeEvents: ChangeEvent[];
  config: AppConfig;
  syncStatus: SyncStatus;
  newTickets: Ticket[];
  planningOverrides?: Map<string, PlanningOverride>;
  previousScopedTickets?: Ticket[];
}

function isInReviewQueue(ticket: Ticket, config: AppConfig): boolean {
  if (!ticket.pr || ticket.pr.incomplete || isPrMergedOrClosed(ticket.pr)) return false;
  const repoType = ticket.pr.repoType ?? 'unknown';
  const leadIsAuthor = ticket.assignee?.accountId === config.people.lead.jiraAccountId;
  const path = resolveReviewPath(repoType, leadIsAuthor);
  return path.leadReview;
}

function isNeedsMe(ticket: Ticket, config: AppConfig): boolean {
  if (ticket.operationalOwner === 'done') return false;
  if (ticket.operationalOwner === 'lead') return true;

  const leadId = config.people.lead.jiraAccountId;
  if (leadId && ticket.assignee?.accountId === leadId) return true;

  // Open PR review is lead work only while dev/merge still own the ticket — not once it's in QA.
  if (ticket.operationalOwner === 'developer' || ticket.operationalOwner === 'merge') {
    return isInReviewQueue(ticket, config);
  }

  return false;
}

function needsMeLabel(ticket: Ticket): string {
  if (ticket.operationalOwner === 'lead') return 'Review Queue Says Hi';
  return `${ticket.key} needs you`;
}

function needsMeReason(ticket: Ticket, config: AppConfig): string {
  if (ticket.operationalOwner === 'lead') return ticket.ownerReason;
  const leadId = config.people.lead.jiraAccountId;
  if (leadId && ticket.assignee?.accountId === leadId) {
    return 'Assigned to you in Jira';
  }
  if (isInReviewQueue(ticket, config)) {
    return 'Open PR waiting for your review';
  }
  return ticket.ownerReason;
}

function ticketToBriefItem(ticket: Ticket, label: string, reason: string): BriefItem {
  return { ticketKey: ticket.key, label, reason };
}

function isPlanningStatus(status: string): boolean {
  const lower = status.toLowerCase();
  return lower.includes('planning');
}

function buildAwaitingVerdict(
  tickets: Ticket[],
  config: AppConfig,
  sprintDay: number,
  workingDaysUntilFreeze: number,
  planningOverrides?: Map<string, PlanningOverride>,
): BriefItem[] {
  return tickets
    .filter((t) => t.operationalOwner === 'product' && isPlanningStatus(t.status))
    .filter((t) => {
      const mode = planningOverrides?.get(t.key)?.mode;
      return mode !== 'planned' && mode !== 'not-touching' && mode !== 'defer';
    })
    .map((t) => {
      const verdict = planningVerdict(
        t,
        tickets,
        config,
        sprintDay,
        workingDaysUntilFreeze,
        planningOverrides,
      );
      return {
        ...verdict,
        reason: `${t.summary} — ${verdict.reason}`,
      };
    });
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

  const overload = forecast.find((row) => row.status === 'overload');
  if (overload) {
    return {
      overallLabel: 'Day 8 Is Looking Nervous',
      overallReason: `${overload.party} is at ${overload.utilizationPct}% capacity with ${syncStatus.workingDaysUntilFreeze ?? 0} working days until QA freeze (day ${freezeDay}).`,
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
  const { tickets, config, syncStatus, newTickets: _newTickets } = input;
  const changeEvents = filterChangeEventsForScope(
    input.changeEvents,
    tickets,
    input.previousScopedTickets ?? [],
  );
  const sprintDay = syncStatus.sprintDay ?? 1;
  const workingDaysUntilFreeze = syncStatus.workingDaysUntilFreeze ?? 0;

  const forecast = buildForecast(
    tickets,
    config,
    sprintDay,
    workingDaysUntilFreeze,
    input.planningOverrides,
  );
  const personForecast = buildPersonForecast(
    tickets,
    config,
    workingDaysUntilFreeze,
    input.planningOverrides,
  );

  const needsMe = tickets
    .filter((t) => isNeedsMe(t, config))
    .map((t) => ticketToBriefItem(t, needsMeLabel(t), needsMeReason(t, config)));

  const awaitingVerdict = buildAwaitingVerdict(
    tickets,
    config,
    sprintDay,
    workingDaysUntilFreeze,
    input.planningOverrides,
  );
  const attentionByParty = buildAttentionByParty(tickets, config);
  const todaysCalls = [...awaitingVerdict, ...buildTodaysCalls(tickets, config, sprintDay)];
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
    personForecast,
    todaysCalls,
    overallLabel,
    overallReason,
  };
}
