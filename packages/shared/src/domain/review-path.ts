import type { AppConfig, RepoType } from '@sprintos/types';

export interface ReviewPath {
  leadReview: boolean;
  leadMerge: boolean;
  additionalReview: boolean;
}

export function resolveReviewPath(repoType: RepoType, leadIsAuthor: boolean): ReviewPath {
  if (repoType === 'enterprise') {
    return { leadReview: true, leadMerge: false, additionalReview: true };
  }
  if (leadIsAuthor) {
    return { leadReview: false, leadMerge: false, additionalReview: true };
  }
  return { leadReview: true, leadMerge: true, additionalReview: false };
}

export function repoTypeFromSlug(slug: string, config: Pick<AppConfig, 'repos'>): RepoType {
  if (config.repos.enterprise.includes(slug)) return 'enterprise';
  if (config.repos.oss.includes(slug)) return 'oss';
  return 'unknown';
}

export function parseGithubSlug(url: string): string | null {
  const m = url.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1] : null;
}
