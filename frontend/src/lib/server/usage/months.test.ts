import { describe, it, expect } from 'vitest';
import {
  completeMonths,
  monthBounds,
  monthsCovering,
  shiftMonth,
} from './months';

describe('monthsCovering', () => {
  it('rounds outward, so a partial month is a whole month', () => {
    // The direction matters: rounding inward would drop 20 August entirely, and
    // a feature used only in those days would read as never used.
    expect(
      monthsCovering(
        new Date('2026-08-20T00:00:00Z'),
        new Date('2026-08-29T00:00:00Z'),
      ),
    ).toEqual(['2026-08']);
  });

  it('spans a year boundary', () => {
    expect(
      monthsCovering(
        new Date('2025-11-15T00:00:00Z'),
        new Date('2026-02-03T00:00:00Z'),
      ),
    ).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('does not pull in the month that an exclusive end opens', () => {
    // `to` is exclusive, so a period ending exactly at midnight on 1 September
    // covers August and not September.
    expect(
      monthsCovering(
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).toEqual(['2026-08']);
  });

  it('is empty for an inverted or empty period', () => {
    const d = new Date('2026-08-01T00:00:00Z');
    expect(monthsCovering(d, d)).toEqual([]);
    expect(monthsCovering(new Date('2026-08-02T00:00:00Z'), d)).toEqual([]);
  });
});

describe('shiftMonth', () => {
  it('goes back a year across the boundary', () => {
    expect(shiftMonth('2026-01', -12)).toBe('2025-01');
    expect(shiftMonth('2026-08', -12)).toBe('2025-08');
  });

  it('does not clamp on a short month', () => {
    // Month arithmetic on day 1 can never overflow into the next month, which
    // is why `monthBounds` anchors there.
    expect(shiftMonth('2024-02', -12)).toBe('2023-02');
    expect(shiftMonth('2026-03', -1)).toBe('2026-02');
  });
});

describe('monthBounds', () => {
  it('is half-open on the next month', () => {
    const { from, to } = monthBounds('2026-02');
    expect(from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('completeMonths', () => {
  it('drops the month in progress', () => {
    // The cube folds the current month only as far as the last rollup run, so
    // comparing it against a whole month a year ago would report a decline that
    // is an artefact of the cron schedule.
    expect(
      completeMonths(
        ['2026-06', '2026-07', '2026-08'],
        new Date('2026-08-28T00:00:00Z'),
      ),
    ).toEqual(['2026-06', '2026-07']);
  });

  it('is empty when the window is only the month in progress', () => {
    expect(
      completeMonths(['2026-08'], new Date('2026-08-03T00:00:00Z')),
    ).toEqual([]);
  });
});
