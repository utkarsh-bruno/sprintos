import { describe, it, expect } from 'vitest';
import type { AppConfig, Ticket } from '@sprintos/types';
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

describe('buildForecast', () => {
  it('sums developer implementation load for dev-owned tickets', () => {
    const rows = buildForecast([ticket()], config, 5, 3);
    const devRow = rows.find((r) => r.party === 'Developer');
    expect(devRow?.loadHours).toBe(30);
    expect(devRow?.capacityHours).toBe(15);
  });

  it('includes lead review hours for open PRs needing lead review', () => {
    const rows = buildForecast(
      [
        ticket({
          status: 'In Review',
          operationalOwner: 'lead',
          pr: {
            url: 'https://github.com/usebruno/bruno/pull/1',
            repoType: 'oss',
            state: 'open',
            changedFiles: 10,
            changedLines: 500,
          },
        }),
      ],
      config,
      5,
      3,
    );
    const leadRow = rows.find((r) => r.party === 'Lead');
    expect(leadRow?.loadHours).toBeGreaterThan(0);
  });

  it('counts QA tickets at 2 hours each', () => {
    const rows = buildForecast(
      [
        ticket({ operationalOwner: 'qa', status: 'QA' }),
        ticket({ key: 'BRU-2', operationalOwner: 'qa', status: 'QA' }),
      ],
      config,
      5,
      3,
    );
    const qaRow = rows.find((r) => r.party === 'QA');
    expect(qaRow?.loadHours).toBe(4);
  });

  it('marks bottleneck when load exceeds capacity', () => {
    const rows = buildForecast(
      [
        ticket({ storyPoints: 20 }),
        ticket({ key: 'BRU-2', storyPoints: 20 }),
      ],
      config,
      5,
      1,
    );
    const devRow = rows.find((r) => r.party === 'Developer');
    expect(devRow?.status).toBe('bottleneck');
    expect(devRow?.utilizationPct).toBeGreaterThanOrEqual(100);
  });
});
