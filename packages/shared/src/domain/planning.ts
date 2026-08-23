import type { AppConfig, BriefItem, PlanningOverride, Ticket } from '@sprintos/types';
import {
  estimateImplementationHours,
  estimateMergeHours,
  estimateReviewHours,
} from './estimates.js';
import { buildForecast } from './forecast.js';
import { ownerDisplayLabel } from './ownership.js';
import { resolveReviewPath } from './review-path.js';

export interface AppliedPlanning {
  ticket: Ticket;
  excludeFromCapacity: boolean;
}

export function applyPlanningOverride(
  ticket: Ticket,
  override?: PlanningOverride,
): AppliedPlanning {
  return {
    ticket,
    excludeFromCapacity: override?.mode === 'not-touching',
  };
}

export function isExcludedFromCapacity(override?: PlanningOverride): boolean {
  return override?.mode === 'not-touching';
}

export interface WhatIfImpact {
  extraLoadHours: number;
  extraLoadByParty: Record<string, number>;
  recommendation?: BriefItem;
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

function ticketLoadByParty(ticket: Ticket, config: AppConfig): Record<string, number> {
  const { sprint } = config;
  const loads: Record<string, number> = {};

  if (ticket.operationalOwner === 'developer') {
    loads.Developer = estimateImplementationHours(
      ticket.storyPoints,
      ticket.status,
      sprint.hoursPerPoint,
    );
  }

  if (ticket.operationalOwner === 'qa') {
    loads.QA = 2;
  }

  if (hasActivePr(ticket)) {
    const repoType = ticket.pr!.repoType ?? 'unknown';
    const leadIsAuthor = isLeadAuthor(ticket, config);
    const path = resolveReviewPath(repoType, leadIsAuthor);

    if (path.leadReview) {
      loads.Lead = estimateReviewHours(
        ticket.pr,
        sprint.estimates,
        ticket.pr!.incomplete,
      );
    }

    const mergeLabel = ownerDisplayLabel('merge', config);
    if (path.additionalReview) {
      loads[mergeLabel] = estimateMergeHours(sprint.estimates);
    } else if (path.leadMerge) {
      loads.Lead = (loads.Lead ?? 0) + estimateMergeHours(sprint.estimates);
    }
  }

  return loads;
}

function dailyCapacityForParty(party: string, config: AppConfig): number {
  const { sprint, roles } = config;
  switch (party) {
    case 'Developer':
      return sprint.capacity.developerHoursPerDay;
    case 'Lead':
      return sprint.capacity.leadReviewHoursPerDay;
    case roles.additionalReviewLabel:
    case ownerDisplayLabel('merge', config):
      return sprint.capacity.additionalReviewHoursPerDay;
    case 'QA':
      return sprint.capacity.qaHoursPerDay;
    default:
      return 0;
  }
}

function bufferWorkingDays(row: { loadHours: number; capacityHours: number }, dailyCapacity: number): number {
  if (dailyCapacity <= 0) return 0;
  return (row.capacityHours - row.loadHours) / dailyCapacity;
}

/** Simulate a planning ticket as if it were picked into active dev work. */
export function ticketIfPicked(ticket: Ticket): Ticket {
  return {
    ...ticket,
    operationalOwner: 'developer',
    status: 'To Do',
    ownerReason: 'Simulated as picked for capacity check',
  };
}

/** Capacity-based pick / no-pick verdict for a ticket still in planning. */
export function planningVerdict(
  ticket: Ticket,
  tickets: Ticket[],
  config: AppConfig,
  sprintDay: number,
  workingDaysUntilFreeze: number,
  planningOverrides?: Map<string, PlanningOverride>,
): BriefItem {
  const asPicked = ticketIfPicked(ticket);
  const impact = whatIfImpact(
    asPicked,
    tickets,
    config,
    sprintDay,
    workingDaysUntilFreeze,
    planningOverrides,
  );

  const devHours =
    impact.extraLoadByParty.Developer ??
    estimateImplementationHours(ticket.storyPoints, 'To Do', config.sprint.hoursPerPoint);

  if (impact.recommendation) {
    return {
      ticketKey: ticket.key,
      label: "Can't pick up",
      reason: `${ticket.storyPoints}pt (~${devHours}h dev) — ${impact.recommendation.reason.replace(/^Adding this ticket leaves /, '')}`,
    };
  }

  const others = tickets.filter((t) => t.key !== ticket.key);
  const forecast = buildForecast(
    [...others, asPicked],
    config,
    sprintDay,
    workingDaysUntilFreeze,
    planningOverrides,
  );
  const devRow = forecast.find((r) => r.party === 'Developer');
  const dailyDev = config.sprint.capacity.developerHoursPerDay;
  const bufferDays =
    devRow && dailyDev > 0 ? (devRow.capacityHours - devRow.loadHours) / dailyDev : 0;
  const bufferText =
    bufferDays >= 0
      ? `${bufferDays.toFixed(1)} working day${Math.abs(bufferDays - 1) < 0.05 ? '' : 's'} dev buffer`
      : `${Math.abs(bufferDays).toFixed(1)} working day${Math.abs(bufferDays - 1) < 0.05 ? '' : 's'} over dev capacity`;

  const constrained = forecast
    .filter((r) => r.status === 'tight' || r.status === 'overload')
    .map((r) => `${r.party} ${r.utilizationPct}%`)
    .join(', ');

  const suffix = constrained ? ` · watch ${constrained}` : '';

  return {
    ticketKey: ticket.key,
    label: 'Developer can pick up',
    reason: `${ticket.storyPoints}pt (~${devHours}h dev) · ${bufferText} before day-${config.sprint.freezeDay} freeze${suffix}`,
  };
}

export function whatIfImpact(
  newTicket: Ticket,
  tickets: Ticket[],
  config: AppConfig,
  sprintDay: number,
  workingDaysUntilFreeze: number,
  planningOverrides?: Map<string, PlanningOverride>,
): WhatIfImpact {
  const others = tickets.filter((t) => t.key !== newTicket.key);
  const baseline = buildForecast(others, config, sprintDay, workingDaysUntilFreeze, planningOverrides);
  const withNew = buildForecast(
    [...others, newTicket],
    config,
    sprintDay,
    workingDaysUntilFreeze,
    planningOverrides,
  );

  const extraLoadByParty: Record<string, number> = {};
  let extraLoadHours = 0;

  for (const row of withNew) {
    const baseRow = baseline.find((r) => r.party === row.party);
    const delta = row.loadHours - (baseRow?.loadHours ?? 0);
    if (delta > 0) {
      extraLoadByParty[row.party] = Math.round(delta * 10) / 10;
      extraLoadHours += delta;
    }
  }

  extraLoadHours = Math.round(extraLoadHours * 10) / 10;

  let recommendation: BriefItem | undefined;
  const minBufferDays = 0.5;

  for (const row of withNew) {
    const baseRow = baseline.find((r) => r.party === row.party);
    const dailyCapacity = dailyCapacityForParty(row.party, config);
    const buffer = bufferWorkingDays(row, dailyCapacity);
    const baseBuffer = baseRow ? bufferWorkingDays(baseRow, dailyCapacity) : Infinity;
    const worsened =
      row.status === 'overload' ||
      (row.status === 'tight' && baseRow?.status !== 'tight' && baseRow?.status !== 'overload');

    if (buffer < minBufferDays || worsened) {
      const bufferText =
        buffer < 0
          ? `${Math.abs(buffer).toFixed(1)} working day${Math.abs(buffer) === 1 ? '' : 's'} beyond day-${config.sprint.freezeDay} capacity`
          : buffer < minBufferDays
            ? `less than ${minBufferDays} working day buffer before day-${config.sprint.freezeDay}`
            : `${row.party} utilization rises to ${row.utilizationPct}%`;

      recommendation = {
        ticketKey: newTicket.key,
        label: "I'm Not Touching That",
        reason: `Adding this ticket leaves ${bufferText}${baseBuffer >= minBufferDays && buffer < minBufferDays ? ` (was ${baseBuffer.toFixed(1)} day buffer)` : ''}.`,
      };
      break;
    }
  }

  if (!recommendation && extraLoadHours === 0) {
    const loads = ticketLoadByParty(newTicket, config);
    for (const [party, hours] of Object.entries(loads)) {
      extraLoadByParty[party] = hours;
      extraLoadHours += hours;
    }
    extraLoadHours = Math.round(extraLoadHours * 10) / 10;
  }

  return {
    extraLoadHours,
    extraLoadByParty,
    ...(recommendation ? { recommendation } : {}),
  };
}
