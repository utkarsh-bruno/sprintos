import type { DependencyState, OwnerParty } from '@sprintos/types';

export function lookupStatusOwner(
  status: string,
  statusOwnerMap: Record<string, OwnerParty>,
): OwnerParty | undefined {
  if (statusOwnerMap[status]) return statusOwnerMap[status];
  const lower = status.toLowerCase();
  for (const [key, value] of Object.entries(statusOwnerMap)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function collectUnmappedStatuses(
  statuses: string[],
  statusOwnerMap: Record<string, OwnerParty>,
): string[] {
  return [...new Set(statuses.filter((s) => !lookupStatusOwner(s, statusOwnerMap)))].sort();
}

export function resolveOperationalOwner(
  status: string,
  statusOwnerMap: Record<string, OwnerParty>,
  dependency?: DependencyState
): { owner: OwnerParty; reason: string } {
  if (dependency?.blocked) {
    const party = dependency.type === 'external' || dependency.type === 'unknown'
      ? 'unknown' as OwnerParty
      : (dependency.type as OwnerParty);
    return {
      owner: party,
      reason: `Blocked on ${dependency.type}${dependency.note ? `: ${dependency.note}` : ''} (SprintOS dependency override)`
    };
  }
  const mapped = lookupStatusOwner(status, statusOwnerMap);
  if (mapped) return { owner: mapped, reason: `Status "${status}" maps to ${mapped}` };
  return { owner: 'unknown', reason: `Unmapped Jira status "${status}" — configure statusOwnerMap` };
}

export function ownerDisplayLabel(owner: OwnerParty, config: { roles: { pmLabel: string; additionalReviewLabel: string } }): string {
  switch (owner) {
    case 'product': return config.roles.pmLabel;
    case 'merge': return config.roles.additionalReviewLabel;
    case 'developer': return 'Developer';
    case 'lead': return 'Lead';
    case 'qa': return 'QA';
    case 'done': return 'Done';
    default: return 'Unknown';
  }
}
