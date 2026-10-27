// Regenerate `src/lib/domain/schoolHolidays.data.ts` from the éducation
// nationale's school calendar, the open dataset `fr-en-calendrier-scolaire`.
// Run with `bun scripts/fetch-school-holidays.ts`, then commit the file.
//
// The data is copied into the repository rather than fetched at runtime so a
// page never waits on, or breaks with, a government API. Nobody has to remember
// to rerun it: `.github/workflows/school-holidays.yml` does every month and
// opens an issue when the ministry's dates have changed. The ministry publishes
// two school years ahead, and the campus calendar says so on a year the file
// does not hold instead of showing it without holidays.
//
// The output depends on the dataset alone, never on the day it ran, so an
// unchanged dataset leaves the file byte for byte as it was: that is what the
// workflow compares.
//
// The dataset has one row per académie and period, as instants. What is kept:
// - Days, read in Europe/Paris, where the dataset writes its midnights (a
//   Réunion row is Paris midnight too). `start_date` is the first day off and
//   `end_date` the day classes resume, except a one-day row (a "pont") whose two
//   dates are that day.
// - The pupils' dates: a period given per population keeps "-" or "Élèves", and
//   failing those the lycée or second-degré row, the audience of Jump.
// - Real periods only. A "Début des …" row marks a start whose end the next
//   school year's file will carry; until then that period is not shown.
// - Académies under the names `domain/school.ts` gives them, so a campus reaches
//   its row through `academieOf`. A location that maps to none is refused here,
//   loudly, rather than dropped.

import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseDate } from '@internationalized/date';
import { toDateKey } from '../src/lib/domain/planningTime';
import { academieOf, DEPARTEMENTS } from '../src/lib/domain/school';

const DATASET = 'fr-en-calendrier-scolaire';
const EXPORT_URL = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/exports/json`;
const OUT = new URL(
  '../src/lib/domain/schoolHolidays.data.ts',
  import.meta.url,
);

/** The oldest school year kept: the first one Jump ran events in. */
const FIRST_SCHOOL_YEAR = 2024;

/** Dataset locations whose name differs from `domain/school.ts`. */
const ACADEMIE_ALIASES: Record<string, string> = {
  Réunion: 'La Réunion',
  Polynésie: 'Polynésie française',
  'Nouvelle Calédonie': 'Nouvelle-Calédonie',
  'Wallis et Futuna': 'Wallis-et-Futuna',
};

/** Dataset locations with no académie in `domain/school.ts`, so no campus. */
const NO_ACADEMIE = new Set(['Saint Pierre et Miquelon']);

/** Which row of a period wins, best first, when it is given per population. */
const POPULATION_RANK = [
  '-',
  'Élèves',
  'Élèves des lycées',
  'Second degré',
  'Élèves du second degré',
];

type Row = {
  description: string;
  population: string;
  start_date: string;
  end_date: string;
  location: string;
  annee_scolaire: string;
};

type Period = [schoolYear: string, name: string, first: string, last: string];

const response = await fetch(EXPORT_URL);
if (!response.ok) throw new Error(`${EXPORT_URL}: HTTP ${response.status}`);
const rows = (await response.json()) as Row[];

const known = new Set(DEPARTEMENTS.map((d) => academieOf(d)));
const best = new Map<string, { rank: number; period: Period }>();

for (const row of rows) {
  if (Number(row.annee_scolaire.slice(0, 4)) < FIRST_SCHOOL_YEAR) continue;
  if (row.description.startsWith('Début ')) continue;
  if (NO_ACADEMIE.has(row.location)) continue;
  const rank = POPULATION_RANK.indexOf(row.population);
  if (rank === -1) continue;

  const academie = ACADEMIE_ALIASES[row.location] ?? row.location;
  if (!known.has(academie)) {
    throw new Error(
      `"${row.location}" is no académie of domain/school.ts: alias it or list it in NO_ACADEMIE`,
    );
  }

  const first = toDateKey(row.start_date, 'Europe/Paris');
  const resume = toDateKey(row.end_date, 'Europe/Paris');
  const last =
    resume === first
      ? first
      : parseDate(resume).subtract({ days: 1 }).toString();
  if (last < first) throw new Error(`empty period: ${JSON.stringify(row)}`);

  const key = `${academie}|${row.annee_scolaire}|${row.description}`;
  const held = best.get(key);
  if (!held || rank < held.rank) {
    best.set(key, {
      rank,
      period: [row.annee_scolaire, row.description, first, last],
    });
  }
}

const byAcademie = new Map<string, Period[]>();
for (const [key, { period }] of best) {
  const academie = key.split('|')[0];
  byAcademie.set(academie, [...(byAcademie.get(academie) ?? []), period]);
}

const academies = [...byAcademie.keys()].sort((a, b) =>
  a.localeCompare(b, 'fr'),
);
const body = academies
  .map((academie) => {
    const periods = byAcademie
      .get(academie)!
      .sort((a, b) => a[2].localeCompare(b[2]))
      .map((p) => `    ${JSON.stringify(p)},`)
      .join('\n');
    return `  ${JSON.stringify(academie)}: [\n${periods}\n  ],`;
  })
  .join('\n');

await writeFile(
  OUT,
  `// GENERATED by \`bun scripts/fetch-school-holidays.ts\` from the éducation
// nationale's open dataset \`${DATASET}\`. Do not edit by hand: rerun the
// script, which says what it keeps and why.

import type { SchoolHolidayPeriod } from './schoolHolidays';

/** Holiday periods per académie: [school year, name, first day, last day]. */
export const SCHOOL_HOLIDAYS: Readonly<
  Record<string, readonly SchoolHolidayPeriod[]>
> = {
${body}
};
`,
);
execFileSync('bunx', ['prettier', '--write', OUT.pathname], {
  stdio: 'inherit',
});
console.log(
  `${best.size} periods across ${academies.length} académies -> ${OUT.pathname}`,
);
