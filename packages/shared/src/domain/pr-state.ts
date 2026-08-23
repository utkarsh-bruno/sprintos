import type { PullRequestData, Ticket } from '@sprintos/types';

export function isPrMergedOrClosed(pr: PullRequestData): boolean {
  if (pr.merged === true) return true;
  if (pr.state === 'closed') return true;
  return false;
}

/** PR link exists in Jira (GitHub metadata may be missing). */
export function hasPrReference(ticket: Ticket): boolean {
  return Boolean(ticket.pr?.url);
}

/** GitHub confirmed the PR is still open (not merged/closed). */
export function hasConfirmedOpenPr(ticket: Ticket): boolean {
  const pr = ticket.pr;
  if (!pr?.url || pr.incomplete) return false;
  return !isPrMergedOrClosed(pr);
}

/** Treat incomplete PR links as "has a PR" for missing-PR checks; confirmed open when metadata exists. */
export function hasOpenPr(ticket: Ticket): boolean {
  if (!ticket.pr?.url) return false;
  if (ticket.pr.incomplete) return true;
  return !isPrMergedOrClosed(ticket.pr);
}
