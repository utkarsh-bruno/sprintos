import { describe, it, expect } from 'vitest';
import type { AppConfig, PlanningOverride, Ticket } from '@sprintos/types';
import { applyPlanningOverride, isExcludedFromCapacity, whatIfImpact } from './planning.js';
import { buildForecast } from './forecast.js';

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
  repos: { oss: ['usebruno/bruno'], enterprise: [] },
  people: {
    lead: { jiraAccountId: 'lead-1', actsAsDeveloper: true },
    additionalReview: { jiraAccountId: 'review-1' },
  },
  roles: { pmLabel: 'PM', additionalReviewLabel: 'Additional Review' },
  statusOwnerMap: {},
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
    summary: 'Test',
    status: 'In Progress',
    storyPoints: 8,
    sprintId: 's1',
    operationalOwner: 'developer',
    ownerReason: 'dev',
    jiraUpdatedAt: '2026-01-01T00:00:00Z',
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    flags: [],
    ...overrides,
  };
}

describe('applyPlanningOverride', () => {
  it('excludes not-touching tickets from capacity', () => {
    const override: PlanningOverride = {
      ticketKey: 'BRU-1',
      mode: 'not-touching',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const result = applyPlanningOverride(ticket(), override);
    expect(result.excludeFromCapacity).toBe(true);
    expect(isExcludedFromCapacity(override)).toBe(true);
  });

  it('does not exclude planned tickets', () => {
    const override: PlanningOverride = {
      ticketKey: 'BRU-1',
      mode: 'planned',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(applyPlanningOverride(ticket(), override).excludeFromCapacity).toBe(false);
  });
});

describe('buildForecast with planning overrides', () => {
  it('skips not-touching tickets in load calculation', () => {
    const overrides = new Map<string, PlanningOverride>([
      [
        'BRU-1',
        { ticketKey: 'BRU-1', mode: 'not-touching', updatedAt: '2026-01-01T00:00:00Z' },
      ],
    ]);

    const withOverride = buildForecast([ticket()], config, 5, 3, overrides);
    const without = buildForecast([ticket()], config, 5, 3);

    expect(withOverride.find((r) => r.party === 'Developer')?.loadHours).toBe(0);
    expect(without.find((r) => r.party === 'Developer')?.loadHours).toBe(30);
  });
});

describe('whatIfImpact', () => {
  it('returns extra load hours for a new developer ticket', () => {
    const existing = [ticket({ key: 'BRU-1', storyPoints: 4 })];
    const newOne = ticket({ key: 'BRU-2', storyPoints: 2 });

    const impact = whatIfImpact(newOne, existing, config, 5, 3);
    expect(impact.extraLoadHours).toBeGreaterThan(0);
    expect(impact.extraLoadByParty.Developer).toBe(7.5);
  });

  it('recommends not touching when forecast buffer is tight', () => {
    const existing = [ticket({ key: 'BRU-1', storyPoints: 20 })];
    const newOne = ticket({ key: 'BRU-2', storyPoints: 20 });

    const impact = whatIfImpact(newOne, existing, config, 5, 1);
    expect(impact.recommendation?.label).toBe("I'm Not Touching That");
    expect(impact.recommendation?.ticketKey).toBe('BRU-2');
  });
});
