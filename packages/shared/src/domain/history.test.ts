import { describe, it, expect } from 'vitest';
import type { OwnerParty, Ticket } from '@sprintos/types';
import { diffSnapshots, filterChangeEventsForScope, ticketContentHash } from './history.js';

function ticket(overrides: Partial<Ticket> & { key: string }): Ticket {
  return {
    id: overrides.key,
    key: overrides.key,
    summary: overrides.summary ?? `Summary for ${overrides.key}`,
    status: overrides.status ?? 'To Do',
    storyPoints: overrides.storyPoints ?? 3,
    sprintId: 'sprint-1',
    operationalOwner: overrides.operationalOwner ?? 'product',
    ownerReason: overrides.ownerReason ?? 'mapped from status',
    jiraUpdatedAt: '2026-01-01T00:00:00.000Z',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    flags: [],
    ...overrides,
  };
}

describe('ticketContentHash', () => {
  it('joins key fields with pipe separator', () => {
    const hash = ticketContentHash({
      key: 'PROJ-1',
      status: 'In Progress',
      storyPoints: 5,
      assignee: { accountId: 'abc', displayName: 'Alice' },
      operationalOwner: 'developer',
      prUrl: 'https://github.com/org/repo/pull/1',
    });
    expect(hash).toBe('PROJ-1|In Progress|5|abc|developer|https://github.com/org/repo/pull/1');
  });
});

describe('diffSnapshots', () => {
  it('detects new ticket on non-first sync', () => {
    const { changeEvents, newTickets } = diffSnapshots([], [ticket({ key: 'NEW-1' })]);
    expect(changeEvents).toHaveLength(1);
    expect(changeEvents[0].type).toBe('ticket_added_to_sprint');
    expect(changeEvents[0].ticketKey).toBe('NEW-1');
    expect(newTickets).toHaveLength(1);
    expect(newTickets[0].key).toBe('NEW-1');
  });

  it('first sync does not emit added events for baseline', () => {
    const baseline = [ticket({ key: 'A-1' }), ticket({ key: 'A-2' })];
    const { changeEvents, newTickets } = diffSnapshots([], baseline, { isFirstSync: true });
    expect(changeEvents.filter((e) => e.type === 'ticket_added_to_sprint')).toHaveLength(0);
    expect(newTickets).toHaveLength(0);
  });

  it('detects status change', () => {
    const prev = ticket({ key: 'PROJ-1', status: 'To Do' });
    const cur = ticket({ key: 'PROJ-1', status: 'In Progress' });
    const { changeEvents } = diffSnapshots([prev], [cur]);
    const statusEvent = changeEvents.find((e) => e.type === 'status_changed');
    expect(statusEvent).toBeDefined();
    expect(statusEvent?.beforeValue).toBe('To Do');
    expect(statusEvent?.afterValue).toBe('In Progress');
  });

  it('detects owner change and emits ownership event', () => {
    const prev = ticket({ key: 'PROJ-1', operationalOwner: 'product' as OwnerParty });
    const cur = ticket({
      key: 'PROJ-1',
      operationalOwner: 'developer' as OwnerParty,
      ownerReason: 'status In Progress',
    });
    const { changeEvents, ownershipEvents } = diffSnapshots([prev], [cur]);
    expect(changeEvents.some((e) => e.type === 'owner_changed')).toBe(true);
    expect(ownershipEvents).toHaveLength(1);
    expect(ownershipEvents[0].fromOwner).toBe('product');
    expect(ownershipEvents[0].toOwner).toBe('developer');
    expect(ownershipEvents[0].reason).toBe('status In Progress');
  });
});

describe('filterChangeEventsForScope', () => {
  it('drops removal events for tickets outside team scope', () => {
    const previousScoped = [ticket({ key: 'BRU-4030' })];
    const current = [ticket({ key: 'BRU-4030' })];
    const events = [
      { ticketKey: 'BRU-3731', type: 'ticket_removed_from_sprint' as const, detectedAt: '2026-01-01' },
      { ticketKey: 'BRU-4030', type: 'status_changed' as const, detectedAt: '2026-01-01', beforeValue: 'To Do', afterValue: 'In Progress' },
    ];
    const filtered = filterChangeEventsForScope(events, current, previousScoped);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ticketKey).toBe('BRU-4030');
  });
});
