import { describe, it, expect } from 'vitest';
import { resolveReviewPath, repoTypeFromSlug } from './review-path.js';

const config = {
  repos: {
    oss: ['usebruno/bruno'],
    enterprise: ['teambruno/bruno-enterprise-edition'],
  },
};

describe('resolveReviewPath', () => {
  it('enterprise: leadReview=true, additionalReview=true, leadMerge=false', () => {
    expect(resolveReviewPath('enterprise', false)).toEqual({
      leadReview: true,
      leadMerge: false,
      additionalReview: true,
    });
  });

  it('oss non-lead: leadReview=true, leadMerge=true, additionalReview=false', () => {
    expect(resolveReviewPath('oss', false)).toEqual({
      leadReview: true,
      leadMerge: true,
      additionalReview: false,
    });
  });

  it('oss lead-authored: leadReview=false, additionalReview=true', () => {
    expect(resolveReviewPath('oss', true)).toEqual({
      leadReview: false,
      leadMerge: false,
      additionalReview: true,
    });
  });
});

describe('repoTypeFromSlug', () => {
  it('maps usebruno/bruno to oss', () => {
    expect(repoTypeFromSlug('usebruno/bruno', config)).toBe('oss');
  });

  it('maps teambruno/bruno-enterprise-edition to enterprise', () => {
    expect(repoTypeFromSlug('teambruno/bruno-enterprise-edition', config)).toBe('enterprise');
  });
});
