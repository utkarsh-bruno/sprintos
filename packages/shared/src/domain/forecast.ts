import type { AppConfig, ForecastRow, Ticket } from '@sprintos/types';
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

function isLeadAuthor(ticket: Ticket, config: AppConfig): boolean {
  return ticket.assignee?.accountId === config.people.lead.jiraAccountId;
}

function hasActivePr(ticket: Ticket): boolean {
  if (!ticket.pr?.url) return false;
  if (ticket.pr.merged) return false;
  if (ticket.pr.state === 'closed') return false;
  return true;
}

function utilizationStatus(utilizationPct: number): ForecastRow['status'] {
  if (utilizationPct >= 100) return 'bottleneck';
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
): ForecastRow[] {
  const { sprint } = config;
  const active = tickets.filter((t) => !isDoneTicket(t));

  let developerLoad = 0;
  let leadReviewLoad = 0;
  let additionalReviewLoad = 0;
  let qaTicketCount = 0;

  for (const ticket of active) {
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
