/**
 * Shared shaping helpers.
 *
 * They exist so the distributions in PROFILE.md are applied in one place rather
 * than approximated per scenario, which is how a dataset ends up looking
 * plausible everywhere and matching nothing.
 */

import { NOMS, PRENOMS } from '../catalog/people';
import { MANUAL_SCHOOL_NAMES } from '../catalog/schools';
import type { World, CampusRef, TalentRef } from '../world';

/** The niveau mix, from PROFILE.md. `null` is a real value: 3.9% carry none. */
export const NIVEAU_MIX: readonly (readonly [string | null, number])[] = [
  ['2nde', 55.7],
  ['1ere', 16.1],
  ['terminale', 14.0],
  ['3eme', 4.4],
  [null, 3.9],
  ['bac_1', 1.3],
  ['bac_2', 1.0],
  ['bac_3', 1.0],
  ['4eme', 0.8],
  ['bac_5', 0.6],
  ['autre', 0.5],
  ['bac_4', 0.3],
  ['wac', 0.1],
  ['5eme', 0.1],
  ['6eme', 0.1],
  ['tech2', 0.1],
  ['coding_academy', 0.1],
];

/** The presence mix: 81% present, 16% absent, 2% excused, 0.4% late. */
export const PRESENCE_MIX = [
  ['present', 81],
  ['absent', 16],
  ['excused', 2],
  ['late', 1],
] as const;

/** How a cell got marked: system 42%, QR 35%, manual 23%. */
export const PRESENCE_SOURCE_MIX = [
  ['system', 42],
  ['qr', 35],
  ['manual', 23],
] as const;

/**
 * A cohort.
 *
 * 43.5% of talents resolve to a school and about 1% carry a free-text school
 * name with no UAI at all - both figures from production, and both are states a
 * screen rendering a lycée has to survive.
 */
export function makeCohort(
  world: World,
  opts: { size: number; campus: CampusRef; schoolYear: string },
): TalentRef[] {
  const { rng } = world.ctx;
  const uais = [...world.schools.keys()];
  const cohort: TalentRef[] = [];

  for (let i = 0; i < opts.size; i += 1) {
    const index = world.nextTalentIndex();
    const hasSchool = rng.chance(0.435);
    const manualSchool = !hasSchool && rng.chance(0.02);
    const schoolId = hasSchool
      ? (world.schools.get(rng.pick(uais)) ?? null)
      : null;

    const talent = world.addTalent({
      prenom: rng.pick(PRENOMS),
      nom: rng.pick(NOMS),
      niveau: rng.weighted(NIVEAU_MIX),
      campus: opts.campus,
      index,
      schoolId,
      highSchoolNameManual: manualSchool ? rng.pick(MANUAL_SCHOOL_NAMES) : null,
    });
    world.addSchoolingRecord(talent, opts.schoolYear, schoolId);
    cohort.push(talent);
  }

  return cohort;
}

/**
 * Enrolment counts drawn from the real distribution: median 23, three quarters
 * under 40, a long tail. Passing a flat number everywhere is what makes every
 * list screen look the same and none of them look real.
 */
export function cohortSize(world: World, scale: number): number {
  const { rng } = world.ctx;
  const base = rng.weighted([
    [rng.int(1, 9), 25],
    [rng.int(10, 23), 25],
    [rng.int(24, 39), 25],
    [rng.int(40, 66), 15],
    [rng.int(67, 140), 10],
  ]);
  return Math.max(1, Math.round(base * scale));
}
