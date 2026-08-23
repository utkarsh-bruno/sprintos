import type { AppConfig, Ticket, TicketFlag } from '@sprintos/types';
import { hasConfirmedOpenPr, hasOpenPr } from './pr-state.js';

function isDoneStatus(status: string): boolean {
  const lower = status.toLowerCase();
  return lower.includes('done') || lower.includes('closed');
}

export function buildTicketFlags(
  ticket: Ticket,
  config: AppConfig,
  sprintDay: number,
): TicketFlag[] {
  const flags: TicketFlag[] = [];

  if (ticket.operationalOwner === 'unknown') {
    flags.push({
      label: 'Who Owns This?',
      reason: ticket.ownerReason,
      severity: 'warning',
    });
  }

  if (ticket.dependency?.blocked && ticket.dependency.type === 'product') {
    const note = ticket.dependency.note ? `: ${ticket.dependency.note}` : '';
    flags.push({
      label: 'Product, We Have a Problem',
      reason: `${ticket.key} is blocked on product${note}. Clarify dependency before work can continue.`,
      severity: 'warning',
    });
  }

  const prThreshold = config.sprint.thresholds.developerPrExpectedByDay;
  if (
    ticket.operationalOwner === 'developer' &&
    !isDoneStatus(ticket.status) &&
    sprintDay >= prThreshold &&
    !hasOpenPr(ticket)
  ) {
    flags.push({
      label: 'PR, Please Leave the House',
      reason: `${ticket.key} is in "${ticket.status}" on sprint day ${sprintDay} with no open PR (expected by day ${prThreshold}).`,
      severity: sprintDay > prThreshold ? 'urgent' : 'warning',
    });
  }

  if (
    hasConfirmedOpenPr(ticket) &&
    (ticket.operationalOwner === 'qa' || ticket.operationalOwner === 'done')
  ) {
    flags.push({
      label: 'PR, Still in the Building',
      reason: `${ticket.key} is in "${ticket.status}" but still has an open PR — merge it or clear the PR field in Jira.`,
      severity: 'warning',
    });
  }

  return flags;
}
