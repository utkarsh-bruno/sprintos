import type { AppConfig, ForecastRow, PlanningOverride, TeamMember, TeamMemberRole, Ticket } from '@sprintos/types';
import { isExcludedFromCapacity } from './planning.js';
import {
  estimateImplementationHours,
  estimateMergeHours,
  estimateReviewHours,
} from './estimates.js';
import { ownerDisplayLabel } from './ownership.js';
import { resolveReviewPath } from './review-path.js';

function isDoneTicket(ticket: Ticket): boolean {
  return ticket.operationalOwner === 'done';
}

function leadAccountIds(config: AppConfig): Set<string> {
  const ids = new Set<string>();
  if (config.people.lead.jiraAccountId) {
    ids.add(config.people.lead.jiraAccountId);
  }
  for (const member of config.teamMembers ?? []) {
    if (member.roles.includes('lead')) {
      ids.add(member.jiraAccountId);
    }
  }
  return ids;
}

function isLeadAuthor(ticket: Ticket, config: AppConfig): boolean {
  const assigneeId = ticket.assignee?.accountId;
  if (!assigneeId) return false;
  return leadAccountIds(config).has(assigneeId);
}

function ticketLeadLaneHours(ticket: Ticket, config: AppConfig): number {
  if (!hasActivePr(ticket)) return 0;
  const repoType = ticket.pr!.repoType ?? 'unknown';
  const path = resolveReviewPath(repoType, isLeadAuthor(ticket, config));
  let hours = 0;
  if (path.leadReview) {
    hours += estimateReviewHours(
      ticket.pr,
      config.sprint.estimates,
      ticket.pr!.incomplete,
    );
  }
  if (path.leadMerge) {
    hours += estimateMergeHours(config.sprint.estimates);
  }
  return hours;
}

function hasActivePr(ticket: Ticket): boolean {
  if (!ticket.pr?.url) return false;
  if (ticket.pr.merged) return false;
  if (ticket.pr.state === 'closed') return false;
  return true;
}

function utilizationStatus(utilizationPct: number): ForecastRow['status'] {
  if (utilizationPct >= 100) return 'overload';
  if (utilizationPct >= 80) return 'tight';
  return 'ok';
}

function buildRow(
  party: string,
  loadHours: number,
  dailyCapacity: number,
  workingDaysUntilFreeze: number,
): ForecastRow {
  const capacityHours = dailyCapacity * workingDaysUntilFreeze;
  const utilizationPct =
    capacityHours > 0 ? Math.round((loadHours / capacityHours) * 100) : loadHours > 0 ? 100 : 0;

  return {
    party,
    loadHours: Math.round(loadHours * 10) / 10,
    capacityHours: Math.round(capacityHours * 10) / 10,
    utilizationPct,
    status: utilizationStatus(utilizationPct),
  };
}

export function buildForecast(
  tickets: Ticket[],
  config: AppConfig,
  _sprintDay: number,
  workingDaysUntilFreeze: number,
  planningOverrides?: Map<string, PlanningOverride>,
): ForecastRow[] {
  const { sprint } = config;
  const active = tickets.filter((t) => !isDoneTicket(t));

  let developerLoad = 0;
  let leadReviewLoad = 0;
  let additionalReviewLoad = 0;
  let qaTicketCount = 0;

  for (const ticket of active) {
    const override = planningOverrides?.get(ticket.key);
    if (isExcludedFromCapacity(override)) {
      continue;
    }
    if (ticket.operationalOwner === 'developer') {
      developerLoad += estimateImplementationHours(
        ticket.storyPoints,
        ticket.status,
        sprint.hoursPerPoint,
      );
    }

    if (ticket.operationalOwner === 'qa') {
      qaTicketCount += 1;
    }

    if (hasActivePr(ticket)) {
      const repoType = ticket.pr!.repoType ?? 'unknown';
      const leadIsAuthor = isLeadAuthor(ticket, config);
      const path = resolveReviewPath(repoType, leadIsAuthor);

      if (path.leadReview) {
        leadReviewLoad += estimateReviewHours(
          ticket.pr,
          sprint.estimates,
          ticket.pr!.incomplete,
        );
      }

      if (path.additionalReview) {
        additionalReviewLoad += estimateMergeHours(sprint.estimates);
      } else if (path.leadMerge) {
        leadReviewLoad += estimateMergeHours(sprint.estimates);
      }
    }
  }

  const qaLoad = qaTicketCount * 2;

  return [
    buildRow(
      'Developer',
      developerLoad,
      sprint.capacity.developerHoursPerDay,
      workingDaysUntilFreeze,
    ),
    buildRow(
      'Lead',
      leadReviewLoad,
      sprint.capacity.leadReviewHoursPerDay,
      workingDaysUntilFreeze,
    ),
    buildRow(
      ownerDisplayLabel('merge', config),
      additionalReviewLoad,
      sprint.capacity.additionalReviewHoursPerDay,
      workingDaysUntilFreeze,
    ),
    buildRow('QA', qaLoad, sprint.capacity.qaHoursPerDay, workingDaysUntilFreeze),
  ];
}

function memberRoleLabel(roles: TeamMember['roles']): string {
  const labels: Record<TeamMemberRole, string> = {
    developer: 'dev',
    product: 'product',
    qa: 'qa',
    lead: 'lead',
    merge: 'merge',
  };
  return roles.map((role) => labels[role]).join(', ');
}

function isPlanningStatus(status: string): boolean {
  return status.toLowerCase().includes('planning');
}

function isToDoStatus(status: string): boolean {
  const lower = status.toLowerCase();
  return lower === 'to do' || lower.includes('to do');
}

/** Dev lane: In Progress and picked To Do tickets (even when status map still says product). */
function ticketCountsAsDevLoad(ticket: Ticket): boolean {
  if (ticket.operationalOwner === 'developer') return true;
  if (ticket.operationalOwner === 'product' && isToDoStatus(ticket.status)) return true;
  return false;
}

/** Product lane: planning / verdict work only — not picked To Do. */
function ticketCountsAsProductLoad(ticket: Ticket): boolean {
  if (ticket.operationalOwner !== 'product') return false;
  return isPlanningStatus(ticket.status);
}

/** Per-person load vs capacity for roster members (developers and QA). */
export function buildPersonForecast(
  tickets: Ticket[],
  config: AppConfig,
  workingDaysUntilFreeze: number,
  planningOverrides?: Map<string, PlanningOverride>,
): ForecastRow[] {
  const members = config.teamMembers ?? [];
  if (members.length === 0) return [];

  const { sprint } = config;
  const active = tickets.filter((t) => !isDoneTicket(t));
  const defaultHours = sprint.capacity.developerHoursPerDay;
  const rows: ForecastRow[] = [];
  const rosterIds = new Set(members.map((m) => m.jiraAccountId));

  const leadMembers = members.filter((m) => m.roles.includes('lead'));

  for (const member of members) {
    let load = 0;
    const isDev = member.roles.includes('developer');
    const isProduct = member.roles.includes('product');
    const isQa = member.roles.includes('qa');
    const isLead = member.roles.includes('lead');

    if (isLead && leadMembers.length > 0) {
      let leadQueueLoad = 0;
      for (const ticket of active) {
        if (isExcludedFromCapacity(planningOverrides?.get(ticket.key))) continue;
        leadQueueLoad += ticketLeadLaneHours(ticket, config);
      }
      load += leadQueueLoad / leadMembers.length;
    }

    for (const ticket of active) {
      if (isExcludedFromCapacity(planningOverrides?.get(ticket.key))) continue;

      if (
        isDev &&
        ticket.assignee?.accountId === member.jiraAccountId &&
        ticketCountsAsDevLoad(ticket)
      ) {
        load += estimateImplementationHours(
          ticket.storyPoints,
          ticket.status,
          sprint.hoursPerPoint,
        );
      }

      if (
        isProduct &&
        ticket.assignee?.accountId === member.jiraAccountId &&
        ticketCountsAsProductLoad(ticket)
      ) {
        load += estimateImplementationHours(
          ticket.storyPoints,
          ticket.status,
          sprint.hoursPerPoint,
        );
      }

      if (isQa) {
        const qaPersonId = ticket.qaAssignee?.accountId ?? (
          ticket.operationalOwner === 'qa' ? ticket.assignee?.accountId : undefined
        );
        if (qaPersonId === member.jiraAccountId) {
          load += 2;
        }
      } else if (
        isDev &&
        ticket.operationalOwner === 'qa' &&
        ticket.assignee?.accountId === member.jiraAccountId
      ) {
        load += 2;
      }
    }

    const dailyCapacity =
      isLead && !isDev
        ? (member.hoursPerDay ?? sprint.capacity.leadReviewHoursPerDay)
        : (member.hoursPerDay ?? defaultHours);
    rows.push(
      buildRow(
        `${member.displayName} (${memberRoleLabel(member.roles)})`,
        load,
        dailyCapacity,
        workingDaysUntilFreeze,
      ),
    );
  }

  let unassignedDevLoad = 0;
  for (const ticket of active) {
    if (isExcludedFromCapacity(planningOverrides?.get(ticket.key))) continue;
    if (ticket.operationalOwner !== 'developer') continue;
    if (!ticket.assignee || !rosterIds.has(ticket.assignee.accountId)) {
      unassignedDevLoad += estimateImplementationHours(
        ticket.storyPoints,
        ticket.status,
        sprint.hoursPerPoint,
      );
    }
  }

  if (unassignedDevLoad > 0) {
    rows.push(
      buildRow('Unassigned (dev)', unassignedDevLoad, defaultHours, workingDaysUntilFreeze),
    );
  }

  return rows.sort((a, b) => b.utilizationPct - a.utilizationPct);
}
