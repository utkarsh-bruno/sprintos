import type { Member, CapacityOverride, Ticket, RepositoryType } from '@sprintos/types';
import { REVIEW_STAGES } from '@sprintos/types';

export function effectiveCapacity(members: Member[], overrides: CapacityOverride[] = []): number {
  const overrideMap = new Map(overrides.map((o) => [o.memberId, o.effectiveCapacity]));
  return members.reduce((sum, m) => sum + (overrideMap.get(m.id) ?? m.capacity), 0);
}

export function reviewStagesFor(repository: RepositoryType): string[] {
  return REVIEW_STAGES[repository];
}

export interface SprintPoints {
  imported: number;
  committed: number;
  deferred: number;
}

export function sprintPoints(tickets: Ticket[]): SprintPoints {
  const imported = tickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const committed = tickets
    .filter((t) => t.committed)
    .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  return { imported, committed, deferred: imported - committed };
}
