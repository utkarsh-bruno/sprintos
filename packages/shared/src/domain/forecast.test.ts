import { describe, it, expect } from 'vitest';
import type { AppConfig, Ticket } from '@sprintos/types';
import { buildForecast, buildPersonForecast } from './forecast.js';

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
      developerHoursPerDay: 8,
      leadReviewHoursPerDay: 8,
      additionalReviewHoursPerDay: 8,
      qaHoursPerDay: 8,
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
    expect(devRow?.capacityHours).toBe(24);
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

  it('marks overload when load exceeds capacity', () => {
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
    expect(devRow?.status).toBe('overload');
    expect(devRow?.utilizationPct).toBeGreaterThanOrEqual(100);
  });
});

describe('buildPersonForecast', () => {
  const teamConfig: AppConfig = {
    ...config,
    teamMembers: [
      {
        jiraAccountId: 'dev-1',
        displayName: 'Alice',
        roles: ['developer'],
        hoursPerDay: 8,
      },
      {
        jiraAccountId: 'dev-2',
        displayName: 'Bob',
        roles: ['developer'],
      },
    ],
  };

  it('attributes dev load by assignee', () => {
    const rows = buildPersonForecast(
      [
        ticket({
          key: 'BRU-1',
          storyPoints: 8,
          assignee: { accountId: 'dev-1', displayName: 'Alice' },
        }),
        ticket({
          key: 'BRU-2',
          storyPoints: 4,
          assignee: { accountId: 'dev-2', displayName: 'Bob' },
        }),
      ],
      teamConfig,
      3,
    );
    const alice = rows.find((r) => r.party.startsWith('Alice'));
    const bob = rows.find((r) => r.party.startsWith('Bob'));
    expect(alice?.loadHours).toBe(30);
    expect(bob?.loadHours).toBe(15);
  });

  it('returns empty when roster is empty', () => {
    expect(buildPersonForecast([ticket()], config, 3)).toEqual([]);
  });

  it('counts To Do tickets toward developer even when operational owner is product', () => {
    const rows = buildPersonForecast(
      [
        ticket({
          key: 'BRU-3077',
          status: 'To Do',
          operationalOwner: 'product',
          storyPoints: 2,
          assignee: { accountId: 'dev-1', displayName: 'Alice' },
        }),
      ],
      teamConfig,
      3,
    );
    expect(rows.find((r) => r.party.startsWith('Alice'))?.loadHours).toBe(10);
  });

  it('attributes lead review queue to roster members with lead role', () => {
    const leadConfig: AppConfig = {
      ...config,
      teamMembers: [
        {
          jiraAccountId: 'lead-1',
          displayName: 'Utkarsh',
          roles: ['developer', 'lead'],
        },
        {
          jiraAccountId: 'dev-2',
          displayName: 'Gopu',
          roles: ['developer'],
        },
      ],
    };
    const rows = buildPersonForecast(
      [
        ticket({
          key: 'BRU-4221',
          status: 'In Review',
          operationalOwner: 'lead',
          assignee: { accountId: 'dev-2', displayName: 'Gopu' },
          pr: {
            url: 'https://github.com/usebruno/bruno/pull/1',
            repoType: 'oss',
            state: 'open',
            changedFiles: 10,
            changedLines: 500,
          },
        }),
      ],
      leadConfig,
      3,
    );
    const utkarsh = rows.find((r) => r.party.startsWith('Utkarsh'));
    const gopu = rows.find((r) => r.party.startsWith('Gopu'));
    expect(utkarsh?.loadHours).toBeGreaterThan(0);
    expect(gopu?.loadHours).toBe(0);
  });

  it('skips lead review load for lead-authored PRs on the lead person row', () => {
    const leadConfig: AppConfig = {
      ...config,
      teamMembers: [
        {
          jiraAccountId: 'lead-1',
          displayName: 'Utkarsh',
          roles: ['developer', 'lead'],
        },
      ],
    };
    const rows = buildPersonForecast(
      [
        ticket({
          key: 'BRU-4185',
          status: 'In Review',
          operationalOwner: 'lead',
          assignee: { accountId: 'lead-1', displayName: 'Utkarsh' },
          pr: {
            url: 'https://github.com/usebruno/bruno/pull/8963',
            repoType: 'oss',
            state: 'open',
            changedFiles: 10,
            changedLines: 500,
          },
        }),
      ],
      leadConfig,
      3,
    );
    expect(rows.find((r) => r.party.startsWith('Utkarsh'))?.loadHours).toBe(0);
  });
});
