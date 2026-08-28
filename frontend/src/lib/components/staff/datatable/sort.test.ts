import { describe, expect, it } from 'vitest';
import { nextSort, rowComparator } from './sort';
import type { ColumnDef } from './types';

const COLUMNS: ColumnDef[] = [
  { key: 'nom', label: 'Nom', sortable: true },
  { key: 'xp', label: 'XP', sortable: true, defaultSortDir: 'desc' },
];

describe('nextSort', () => {
  it('flips the direction on the active column', () => {
    expect(nextSort(COLUMNS, { key: 'nom', dir: 'asc' }, 'nom')).toEqual({
      key: 'nom',
      dir: 'desc',
    });
    expect(nextSort(COLUMNS, { key: 'nom', dir: 'desc' }, 'nom')).toEqual({
      key: 'nom',
      dir: 'asc',
    });
  });

  it('opens a new column in its declared direction', () => {
    expect(nextSort(COLUMNS, { key: 'nom', dir: 'desc' }, 'xp')).toEqual({
      key: 'xp',
      dir: 'desc',
    });
  });

  it('opens a new column ascending when it declares nothing', () => {
    expect(nextSort(COLUMNS, { key: 'xp', dir: 'desc' }, 'nom')).toEqual({
      key: 'nom',
      dir: 'asc',
    });
  });

  it('treats no active column as a new column', () => {
    expect(nextSort(COLUMNS, { key: null, dir: 'asc' }, 'xp')).toEqual({
      key: 'xp',
      dir: 'desc',
    });
  });
});

describe('rowComparator', () => {
  type Row = { nom: string; lycee: string | null };
  const rows: Row[] = [
    { nom: 'c', lycee: null },
    { nom: 'a', lycee: 'Zola' },
    { nom: 'b', lycee: 'Camus' },
  ];
  const byLycee = (a: Row, b: Row) =>
    (a.lycee ?? '').localeCompare(b.lycee ?? '');
  const missingLycee = (r: Row) => !r.lycee;

  it('sorts ascending', () => {
    const out = [...rows].sort(
      rowComparator({ compare: byLycee, dir: 'asc', isMissing: missingLycee }),
    );
    expect(out.map((r) => r.nom)).toEqual(['b', 'a', 'c']);
  });

  it('sinks the rows with no value in the other direction too', () => {
    const out = [...rows].sort(
      rowComparator({ compare: byLycee, dir: 'desc', isMissing: missingLycee }),
    );
    // 'c' has no lycée: last on the way down as well, never first.
    expect(out.map((r) => r.nom)).toEqual(['a', 'b', 'c']);
  });

  it('reverses a plain column with no missing rule', () => {
    const out = [...rows].sort(
      rowComparator({
        compare: (a, b) => a.nom.localeCompare(b.nom),
        dir: 'desc',
      }),
    );
    expect(out.map((r) => r.nom)).toEqual(['c', 'b', 'a']);
  });
});
