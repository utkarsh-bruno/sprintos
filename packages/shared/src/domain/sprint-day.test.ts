import { describe, it, expect } from 'vitest';
import { sprintDayIndex, workingDaysBetween, workingDaysUntil } from './sprint-day.js';

describe('sprintDayIndex', () => {
  it('returns 1 on sprint start (Monday)', () => {
    expect(sprintDayIndex('2026-08-17', '2026-08-17')).toBe(1);
  });
  it('skips weekends', () => {
    // Mon Aug 17 start → Mon Aug 24 = day 6 (5 working days in first week + Mon = 6)
    expect(sprintDayIndex('2026-08-17', '2026-08-24')).toBe(6);
  });
});

describe('workingDaysUntil', () => {
  it('counts working days until freeze day from current day', () => {
    const days = workingDaysUntil('2026-08-17', '2026-08-20', 8);
    expect(days).toBeGreaterThan(0);
  });
});
