import type { ChangeEvent, OwnershipEvent, Ticket } from '@sprintos/types';

export function ticketContentHash(
  ticket: Pick<Ticket, 'key' | 'status' | 'storyPoints' | 'assignee' | 'operationalOwner'> & {
    prUrl?: string;
  },
): string {
  const parts = [
    ticket.key,
    ticket.status,
    String(ticket.storyPoints),
    ticket.assignee?.accountId ?? '',
    ticket.operationalOwner,
    ticket.prUrl ?? '',
  ];
  return parts.join('|');
}

export interface DiffOptions {
  isFirstSync?: boolean;
}

export function diffSnapshots(
  previous: Ticket[],
  current: Ticket[],
  options: DiffOptions = {},
): { changeEvents: ChangeEvent[]; ownershipEvents: OwnershipEvent[]; newTickets: Ticket[] } {
  const now = new Date().toISOString();
  const prevMap = new Map(previous.map((t) => [t.key, t]));
  const changeEvents: ChangeEvent[] = [];
  const ownershipEvents: OwnershipEvent[] = [];
  const newTickets: Ticket[] = [];

  for (const ticket of current) {
    const prev = prevMap.get(ticket.key);
    if (!prev) {
      if (!options.isFirstSync) {
        changeEvents.push({
          ticketKey: ticket.key,
          type: 'ticket_added_to_sprint',
          afterValue: ticket.summary,
          detectedAt: now,
        });
        newTickets.push(ticket);
      }
      continue;
    }
    if (prev.status !== ticket.status) {
      changeEvents.push({
        ticketKey: ticket.key,
        type: 'status_changed',
        beforeValue: prev.status,
        afterValue: ticket.status,
        detectedAt: now,
      });
    }
    if (prev.storyPoints !== ticket.storyPoints) {
      changeEvents.push({
        ticketKey: ticket.key,
        type: 'story_points_changed',
        beforeValue: String(prev.storyPoints),
        afterValue: String(ticket.storyPoints),
        detectedAt: now,
      });
    }
    if (prev.assignee?.accountId !== ticket.assignee?.accountId) {
      changeEvents.push({
        ticketKey: ticket.key,
        type: 'assignee_changed',
        beforeValue: prev.assignee?.displayName,
        afterValue: ticket.assignee?.displayName,
        detectedAt: now,
      });
    }
    if (prev.operationalOwner !== ticket.operationalOwner) {
      ownershipEvents.push({
        ticketKey: ticket.key,
        fromOwner: prev.operationalOwner,
        toOwner: ticket.operationalOwner,
        reason: ticket.ownerReason,
        detectedAt: now,
      });
      changeEvents.push({
        ticketKey: ticket.key,
        type: 'owner_changed',
        beforeValue: prev.operationalOwner,
        afterValue: ticket.operationalOwner,
        detectedAt: now,
      });
    }
    const prevPr = prev.pr?.url ?? '';
    const curPr = ticket.pr?.url ?? '';
    if (prevPr !== curPr) {
      changeEvents.push({
        ticketKey: ticket.key,
        type: curPr ? 'pr_added' : 'pr_changed',
        beforeValue: prevPr || undefined,
        afterValue: curPr || undefined,
        detectedAt: now,
      });
    }
    prevMap.delete(ticket.key);
  }

  for (const [key] of prevMap) {
    changeEvents.push({
      ticketKey: key,
      type: 'ticket_removed_from_sprint',
      detectedAt: now,
    });
  }

  return { changeEvents, ownershipEvents, newTickets };
}

/** Keep change events only for tickets in the current or previous scoped set (team/project filter). */
export function filterChangeEventsForScope(
  events: ChangeEvent[],
  currentTickets: Ticket[],
  previousScopedTickets: Ticket[],
): ChangeEvent[] {
  const inScope = new Set([
    ...currentTickets.map((t) => t.key),
    ...previousScopedTickets.map((t) => t.key),
  ]);
  return events.filter((e) => inScope.has(e.ticketKey));
}
