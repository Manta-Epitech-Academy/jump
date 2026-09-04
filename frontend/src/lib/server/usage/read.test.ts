import { describe, it, expect, vi } from 'vitest';
import { OperationRefusedError } from '$lib/server/adminApi/errors';

vi.mock('$lib/server/db', () => ({ prisma: {} }));

const { foldByFeature, foldByFeatureCampus, usageWindowFor } =
  await import('./read');

const NOW = new Date('2026-08-28T12:00:00Z');

const cell = (
  feature: string,
  month: string,
  campusId: string | null,
  uses: number,
  actors: number,
) => ({ feature, month, campusId, uses, actors });

describe('usageWindowFor', () => {
  it('reads the detailed rows for a window inside the retention period', () => {
    const w = usageWindowFor({}, 30, NOW);
    expect(w.store).toBe('lignes détaillées');
    expect(w.months).toBeNull();
  });

  it('reads the monthly totals once the window reaches past retention', () => {
    const w = usageWindowFor({}, 400, NOW);
    expect(w.store).toBe('totaux mensuels');
    // Rounded outward: the period actually read starts at a month boundary and
    // is therefore wider than the one asked for.
    expect(w.months?.[0]).toBe('2025-07');
    expect(w.from.getTime()).toBeLessThan(w.asked.from.getTime());
  });

  it('refuses a window that does not meet the school year, instead of answering zero', () => {
    // Every window on a past school year used to cross: `from` came from the day
    // count and `to` from the year, so the range was inverted and every feature
    // read zero with the filters echoed back to confirm it. That is the
    // "unknown scope is never a zero" rule, in the time dimension.
    expect(() => usageWindowFor({ schoolYear: '2024-2025' }, 365, NOW)).toThrow(
      OperationRefusedError,
    );
    expect(() => usageWindowFor({ schoolYear: '2024-2025' }, 7, NOW)).toThrow(
      /ne se recouvrent pas/,
    );
  });

  it('refuses a school year that has not opened yet, with or without a day count', () => {
    // The other half of the same guard, and the half that used to slip through:
    // it lived inside the `days` branch, so a year still ahead produced an
    // inverted range nothing checked, answered as zeros for every feature with a
    // `source` whose « au » preceded its « du ».
    expect(() =>
      usageWindowFor({ schoolYear: '2027-2028' }, undefined, NOW),
    ).toThrow(/n'a pas encore commencé/);
    expect(() => usageWindowFor({ schoolYear: '2027-2028' }, 30, NOW)).toThrow(
      OperationRefusedError,
    );
  });

  it('accepts the school year in progress', () => {
    expect(() =>
      usageWindowFor({ schoolYear: '2026-2027' }, 30, NOW),
    ).not.toThrow();
    expect(() =>
      usageWindowFor({ schoolYear: '2026-2027' }, undefined, NOW),
    ).not.toThrow();
  });
});

describe('foldByFeature', () => {
  it('never sums distinct actors across months', () => {
    // The talent pseudonym rotates monthly, so one person active in three months
    // appears as three values. Summing them counted that person three times and
    // let a share pass 100 %.
    const totals = foldByFeature([
      cell('f', '2026-06', 'c1', 1, 1),
      cell('f', '2026-07', 'c1', 1, 1),
      cell('f', '2026-08', 'c1', 1, 1),
    ]);
    expect(totals.get('f')?.peakActors).toBe(1);
    expect(totals.get('f')?.uses).toBe(3);
  });

  it('does sum distinct actors across campuses within one month', () => {
    // Inside a month an actor carries exactly one campus, so this addition is
    // exact rather than an approximation.
    const totals = foldByFeature([
      cell('f', '2026-08', 'c1', 3, 2),
      cell('f', '2026-08', 'c2', 4, 3),
    ]);
    expect(totals.get('f')?.peakActors).toBe(5);
    expect(totals.get('f')?.uses).toBe(7);
  });

  it('reports the busiest month and names it', () => {
    const totals = foldByFeature([
      cell('f', '2026-06', 'c1', 1, 2),
      cell('f', '2026-07', 'c1', 1, 9),
      cell('f', '2026-08', 'c1', 1, 4),
    ]);
    expect(totals.get('f')?.peakActors).toBe(9);
    expect(totals.get('f')?.peakMonth).toBe('2026-07');
  });

  it('reports the latest month on a tie, so a plateau does not read as stale', () => {
    const totals = foldByFeature([
      cell('f', '2026-06', 'c1', 1, 4),
      cell('f', '2026-08', 'c1', 1, 4),
    ]);
    expect(totals.get('f')?.peakMonth).toBe('2026-08');
  });

  it('gives the last month anything happened', () => {
    const totals = foldByFeature([
      cell('f', '2026-06', 'c1', 2, 1),
      cell('f', '2026-08', 'c1', 0, 0),
    ]);
    expect(totals.get('f')?.lastMonth).toBe('2026-06');
  });
});

describe('foldByFeatureCampus', () => {
  it('keeps only campuses that actually used the feature', () => {
    const byCampus = foldByFeatureCampus([
      cell('f', '2026-08', 'c1', 2, 1),
      cell('f', '2026-08', 'c2', 0, 0),
    ]);
    expect([...(byCampus.get('f') ?? [])]).toEqual(['c1']);
  });
});
