import { describe, it, expect } from 'vitest';
import type { PullRequestData, Ticket } from '@sprintos/types';
import { hasConfirmedOpenPr, hasOpenPr, isPrMergedOrClosed } from './pr-state.js';

function ticket(pr?: PullRequestData): Ticket {
  return {
    id: '1',
    key: 'BRU-1',
    summary: 'Test',
    status: 'Done',
    storyPoints: 1,
    sprintId: 's1',
    operationalOwner: 'done',
    ownerReason: 'done',
    jiraUpdatedAt: '2026-01-01T00:00:00Z',
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    flags: [],
    ...(pr ? { pr } : {}),
  };
}

describe('isPrMergedOrClosed', () => {
  it('detects merged PRs', () => {
    expect(isPrMergedOrClosed({ url: 'https://github.com/a/b/pull/1', merged: true })).toBe(true);
  });

  it('detects closed unmerged PRs', () => {
    expect(isPrMergedOrClosed({ url: 'https://github.com/a/b/pull/1', state: 'closed' })).toBe(true);
  });
});

describe('hasConfirmedOpenPr', () => {
  it('returns false for incomplete PR metadata', () => {
    expect(
      hasConfirmedOpenPr(
        ticket({ url: 'https://github.com/usebruno/bruno/pull/8978', incomplete: true }),
      ),
    ).toBe(false);
  });

  it('returns false for merged PRs', () => {
    expect(
      hasConfirmedOpenPr(
        ticket({
          url: 'https://github.com/usebruno/bruno/pull/8978',
          state: 'closed',
          merged: true,
        }),
      ),
    ).toBe(false);
  });

  it('returns true for confirmed open PRs', () => {
    expect(
      hasConfirmedOpenPr(
        ticket({
          url: 'https://github.com/usebruno/bruno/pull/8978',
          state: 'open',
          merged: false,
        }),
      ),
    ).toBe(true);
  });
});

describe('hasOpenPr', () => {
  it('treats incomplete PR links as having a PR for missing-PR checks', () => {
    expect(hasOpenPr(ticket({ url: 'https://github.com/usebruno/bruno/pull/1', incomplete: true }))).toBe(
      true,
    );
  });
});
