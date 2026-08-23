import { describe, it, expect } from 'vitest';
import type { AppConfig, ChangeEvent, SyncStatus, Ticket } from '@sprintos/types';
import { buildBrief } from './brief.js';

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
  statusOwnerMap: {
    'In Progress': 'developer',
    'In Review': 'lead',
    Done: 'done',
  },
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

const baseSync: SyncStatus = {
  status: 'success',
  sprintDay: 7,
  workingDaysUntilFreeze: 2,
  sprint: {
    id: 's1',
    name: 'Sprint 42',
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    freezeDay: 8,
    workingDays: 10,
  },
};

describe('buildBrief', () => {
  it('lists planning tickets with capacity verdict', () => {
    const brief = buildBrief({
      tickets: [
        ticket({
          key: 'BRU-4359',
          status: 'PLANNING',
          operationalOwner: 'product',
          summary: 'Mock server bug',
          storyPoints: 2,
        }),
        ticket({
          key: 'BRU-4030',
          status: 'To Do',
          operationalOwner: 'product',
          summary: 'Already picked',
        }),
      ],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.todaysCalls.some((c) => c.ticketKey === 'BRU-4359')).toBe(true);
    expect(brief.todaysCalls.find((c) => c.ticketKey === 'BRU-4359')?.label).toMatch(/pick up/i);
    expect(brief.todaysCalls.find((c) => c.ticketKey === 'BRU-4359')?.reason).toMatch(/Mock server bug/);
  });

  it('includes lead-owned tickets in needsMe', () => {
    const brief = buildBrief({
      tickets: [ticket({ key: 'BRU-2', operationalOwner: 'lead', status: 'In Review', ownerReason: 'In review' })],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.needsMe.some((item) => item.ticketKey === 'BRU-2')).toBe(true);
  });

  it('does not include QA tickets in needsMe when Jira still links an open PR', () => {
    const brief = buildBrief({
      tickets: [
        ticket({
          key: 'BRU-4153',
          status: 'QA',
          operationalOwner: 'qa',
          ownerReason: 'Status "QA" maps to qa',
          pr: {
            url: 'https://github.com/usebruno/bruno/pull/8957',
            state: 'open',
            merged: false,
            repoType: 'oss',
          },
        }),
      ],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.needsMe.some((item) => item.ticketKey === 'BRU-4153')).toBe(false);
  });

  it('includes developer tickets with open PRs in needsMe', () => {
    const brief = buildBrief({
      tickets: [
        ticket({
          key: 'BRU-9',
          status: 'In Progress',
          operationalOwner: 'developer',
          ownerReason: 'Status "In Progress" maps to developer',
          pr: {
            url: 'https://github.com/usebruno/bruno/pull/1',
            state: 'open',
            merged: false,
            repoType: 'oss',
          },
        }),
      ],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.needsMe.some((item) => item.ticketKey === 'BRU-9')).toBe(true);
    expect(brief.needsMe.find((item) => item.ticketKey === 'BRU-9')?.reason).toBe(
      'Open PR waiting for your review',
    );
  });

  it('counts attention by party using display labels', () => {
    const brief = buildBrief({
      tickets: [
        ticket({ operationalOwner: 'product' }),
        ticket({ key: 'BRU-2', operationalOwner: 'developer' }),
        ticket({ key: 'BRU-3', operationalOwner: 'developer' }),
      ],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.attentionByParty['PM']).toBe(1);
    expect(brief.attentionByParty['Developer']).toBe(2);
  });

  it('builds todaysCalls from urgent/warning flags', () => {
    const brief = buildBrief({
      tickets: [ticket({ key: 'BRU-9' })],
      changeEvents: [],
      config,
      syncStatus: { ...baseSync, sprintDay: 7 },
      newTickets: [],
    });
    expect(brief.todaysCalls.some((c) => c.label === 'PR, Please Leave the House')).toBe(true);
  });

  it('returns first-sync overall message', () => {
    const brief = buildBrief({
      tickets: [],
      changeEvents: [],
      config,
      syncStatus: { ...baseSync, isFirstSync: true },
      newTickets: [],
    });
    expect(brief.overallLabel).toMatch(/first sync/i);
  });

  it('returns nervous label when late sprint with many in progress', () => {
    const brief = buildBrief({
      tickets: [
        ticket({ key: 'BRU-1', status: 'In Progress' }),
        ticket({ key: 'BRU-2', status: 'In Progress' }),
        ticket({ key: 'BRU-3', status: 'In Progress' }),
      ],
      changeEvents: [] as ChangeEvent[],
      config,
      syncStatus: { ...baseSync, sprintDay: 7, isFirstSync: false },
      newTickets: [],
    });
    expect(brief.overallLabel).toBe('Day 8 Is Looking Nervous');
  });

  it('includes forecast rows', () => {
    const brief = buildBrief({
      tickets: [ticket()],
      changeEvents: [],
      config,
      syncStatus: baseSync,
      newTickets: [],
    });
    expect(brief.forecast.length).toBe(4);
    expect(brief.forecast[0]?.party).toBe('Developer');
  });
});
