import { describe, it, expect } from 'vitest';
import type { OwnerParty } from '@sprintos/types';
import { resolveOperationalOwner, ownerDisplayLabel } from './ownership.js';

describe('resolveOperationalOwner', () => {
  const statusOwnerMap = {
    'In Progress': 'developer',
    'To Do': 'product',
    'In Review': 'lead',
  } as Record<string, OwnerParty>;

  it('maps In Progress to developer', () => {
    const result = resolveOperationalOwner('In Progress', statusOwnerMap);
    expect(result.owner).toBe('developer');
    expect(result.reason).toMatch(/In Progress/);
  });

  it('maps IN REVIEW case-insensitively', () => {
    const result = resolveOperationalOwner('IN REVIEW', statusOwnerMap);
    expect(result.owner).toBe('lead');
  });

  it('returns unknown for unmapped status', () => {
    const result = resolveOperationalOwner('Weird Status', statusOwnerMap);
    expect(result.owner).toBe('unknown');
    expect(result.reason).toMatch(/unmapped/i);
  });

  it('dependency override wins when blocked on product', () => {
    const result = resolveOperationalOwner('In Progress', statusOwnerMap, {
      type: 'product',
      blocked: true,
    });
    expect(result.owner).toBe('product');
    expect(result.reason).toMatch(/dependency/i);
  });
});

describe('ownerDisplayLabel', () => {
  const config = {
    roles: {
      pmLabel: 'PM',
      additionalReviewLabel: 'Additional Review',
    },
  };

  it('maps product to PM label', () => {
    expect(ownerDisplayLabel('product', config)).toBe('PM');
  });
});
