import { describe, it, expect } from 'vitest';
import { compareLastActive } from './lastActive';
import { rowComparator } from './datatable/sort';

describe('compareLastActive', () => {
  type Row = { nom: string; at: string | null };
  const rows: Row[] = [
    { nom: 'récent', at: '2026-08-01T00:00:00Z' },
    { nom: 'jamais', at: null },
    { nom: 'ancien', at: '2026-01-01T00:00:00Z' },
  ];
  const byActivity = (a: Row, b: Row) => compareLastActive(a.at, b.at);

  it('puts never connected first when the oldest leads', () => {
    // The whole point of the column: one click and every account nobody has
    // ever opened is grouped at the top. Passing `isMissing` here, as every
    // other column does, would sink them instead and there would be no way to
    // reach them at all once the tile that filtered on them is gone.
    const out = [...rows].sort(
      rowComparator({ compare: byActivity, dir: 'asc' }),
    );
    expect(out.map((r) => r.nom)).toEqual(['jamais', 'ancien', 'récent']);
  });

  it('puts them last on the way back, because it is one axis and not a filter', () => {
    const out = [...rows].sort(
      rowComparator({ compare: byActivity, dir: 'desc' }),
    );
    expect(out.map((r) => r.nom)).toEqual(['récent', 'ancien', 'jamais']);
  });
});
