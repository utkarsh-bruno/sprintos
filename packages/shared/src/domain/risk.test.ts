import { describe, it, expect } from 'vitest';
import type { AppConfig, Ticket } from '@sprintos/types';
import { buildTicketFlags } from './risk.js';

const config: AppConfig = {
  jira: {
    url: '',
    email: '',
    token: '',
    teamField: '',
    prField: '',
    sprintField: '',
    storyPointFields: [],
  },
  github: { token: '' },
  repos: { oss: [], enterprise: [] },
  people: {
    lead: { jiraAccountId: 'lead-1', actsAsDeveloper: true },
    additionalReview: { jiraAccountId: 'review-1' },
  },
  roles: { pmLabel: 'PM', additionalReviewLabel: 'Additional Review' },
  statusOwnerMap: { 'In Progress': 'developer' },
  sprint: {
    workingDays: 10,
    freezeDay: 8,
    hoursPerPoint: 5,
    capacity: {
      developerHoursPerDay: 5,
      leadReviewHoursPerDay: 3,
      additionalReviewHoursPerDay: 2,
      qaHoursPerDay: 5,
    },
    thresholds: {
      developerPrExpectedByDay: 6,
      leadReviewSlaWorkingDays: 1,
      staleWatchDays: 1,
      staleWarningDays: 2,
      staleUrgentDays: 3,
    },
    estimates: {
      baseReviewHours: 0.5,
      mergeHours: 0.5,
      fileReviewFactor: 0.05,
      maxFileReviewFactor: 1.5,
      linesPerReviewUnit: 500,
      lineReviewFactor: 0.25,
      maxLineReviewFactor: 2,
    },
  },
};

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '1',
    key: 'BRU-1',
    summary: 'Test ticket',
    status: 'In Progress',
    storyPoints: 3,
    sprintId: 's1',
    operationalOwner: 'developer',
    ownerReason: 'Status maps to developer',
    jiraUpdatedAt: '2026-01-01T00:00:00Z',
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    flags: [],
    ...overrides,
  };
}

describe('buildTicketFlags', () => {
  it('flags missing PR after developerPrExpectedByDay', () => {
    const flags = buildTicketFlags(ticket(), config, 6);
    expect(flags.some((f) => f.label === 'PR, Please Leave the House')).toBe(true);
    expect(flags.find((f) => f.label === 'PR, Please Leave the House')?.reason).toMatch(/day 6/i);
  });

  it('does not flag PR before threshold day', () => {
    const flags = buildTicketFlags(ticket(), config, 5);
    expect(flags.some((f) => f.label === 'PR, Please Leave the House')).toBe(false);
  });

  it('flags blocked product dependency', () => {
    const flags = buildTicketFlags(
      ticket({
        dependency: { type: 'product', blocked: true, note: 'Needs spec' },
        operationalOwner: 'product',
        ownerReason: 'Blocked on product',
      }),
      config,
      3,
    );
    expect(flags.some((f) => f.label === 'Product, We Have a Problem')).toBe(true);
    expect(flags.find((f) => f.label === 'Product, We Have a Problem')?.reason).toMatch(/Needs spec/);
  });

  it('flags unmapped status as warning', () => {
    const flags = buildTicketFlags(
      ticket({
        operationalOwner: 'unknown',
        ownerReason: 'Unmapped Jira status "Weird" — configure statusOwnerMap',
      }),
      config,
      3,
    );
    expect(flags.some((f) => f.severity === 'warning' && f.label === 'Who Owns This?')).toBe(true);
  });
});
