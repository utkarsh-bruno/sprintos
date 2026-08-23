import type { PullRequestData } from '@sprintos/types';
import type { SprintConfig } from '@sprintos/types';

type EstimateConfig = SprintConfig['estimates'];

export function estimateReviewHours(
  pr: Pick<PullRequestData, 'changedFiles' | 'changedLines'> | undefined,
  estimates: EstimateConfig,
  incomplete = false,
): number {
  if (incomplete || !pr) {
    return estimates.baseReviewHours + 0.5;
  }
  const fileFactor = Math.min(
    (pr.changedFiles ?? 0) * estimates.fileReviewFactor,
    estimates.maxFileReviewFactor,
  );
  const lineFactor = Math.min(
    ((pr.changedLines ?? 0) / estimates.linesPerReviewUnit) * estimates.lineReviewFactor,
    estimates.maxLineReviewFactor,
  );
  return estimates.baseReviewHours + fileFactor + lineFactor;
}

export function estimateMergeHours(estimates: EstimateConfig): number {
  return estimates.mergeHours;
}

export function estimateImplementationHours(
  storyPoints: number,
  status: string,
  hoursPerPoint: number,
): number {
  const base = storyPoints * hoursPerPoint;
  const lower = status.toLowerCase();
  if (lower.includes('done') || lower.includes('closed')) return 0;
  if (lower.includes('review') || lower.includes('qa') || lower.includes('test')) return base * 0.1;
  if (lower.includes('progress')) return base * 0.75;
  return base;
}
