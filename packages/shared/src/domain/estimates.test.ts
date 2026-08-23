import { describe, it, expect } from 'vitest';
import type { SprintConfig } from '@sprintos/types';
import {
  estimateReviewHours,
  estimateMergeHours,
  estimateImplementationHours,
} from './estimates.js';

const estimates: SprintConfig['estimates'] = {
  baseReviewHours: 0.5,
  mergeHours: 0.5,
  fileReviewFactor: 0.05,
  maxFileReviewFactor: 1.5,
  linesPerReviewUnit: 500,
  lineReviewFactor: 0.25,
  maxLineReviewFactor: 2,
};

const hoursPerPoint = 5;
const storyPoints = 8;

describe('estimateReviewHours', () => {
  it('uses base + file + line factors', () => {
    expect(
      estimateReviewHours({ changedFiles: 10, changedLines: 1000 }, estimates),
    ).toBeCloseTo(1.5, 1);
  });

  it('fallback when PR incomplete', () => {
    expect(estimateReviewHours(undefined, estimates, true)).toBe(1.0);
  });

  it('fallback when PR is undefined without incomplete flag', () => {
    expect(estimateReviewHours(undefined, estimates)).toBe(1.0);
  });
});

describe('estimateMergeHours', () => {
  it('returns configured merge hours', () => {
    expect(estimateMergeHours(estimates)).toBe(0.5);
  });
});

describe('estimateImplementationHours', () => {
  it('returns 0 for done status', () => {
    expect(estimateImplementationHours(storyPoints, 'Done', hoursPerPoint)).toBe(0);
  });

  it('returns 0 for closed status', () => {
    expect(estimateImplementationHours(storyPoints, 'Closed', hoursPerPoint)).toBe(0);
  });

  it('returns 10% of base for review status', () => {
    expect(estimateImplementationHours(storyPoints, 'In Review', hoursPerPoint)).toBe(4);
  });

  it('returns 10% of base for qa status', () => {
    expect(estimateImplementationHours(storyPoints, 'QA', hoursPerPoint)).toBe(4);
  });

  it('returns 75% of base for in progress status', () => {
    expect(estimateImplementationHours(storyPoints, 'In Progress', hoursPerPoint)).toBe(30);
  });

  it('returns full base for unstarted status', () => {
    expect(estimateImplementationHours(storyPoints, 'To Do', hoursPerPoint)).toBe(40);
  });
});
