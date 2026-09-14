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

/**
 * The Salesforce member status distribution is NOT here, on purpose: it is
 * applied by `World.enrol` rather than by a scenario, and `world.ts` deliberately
 * imports nothing from this directory. It lives beside the code that draws it,
 * which is what this file's header actually asks for.
 */

/** How a cell got marked: system 42%, QR 35%, manual 23%. */
export const PRESENCE_SOURCE_MIX = [
  ['system', 42],
  ['qr', 35],
  ['manual', 23],
] as const;

/**
 * How much of an ordinary cohort has been to something before.
 *
 * Derived, not chosen. PROFILE.md's histogram gives 7 638 enrolments over 5 313
 * enrolled talents, so 2 325 of those enrolments are somebody's second or
 * later. Every one of them has to land outside the stage de seconde: the stage
 * runs before the long tail, so in the order this generator composes in, the
 * campaign is always where a talent is created and never where they come BACK.
 * 2 325 repeats over the 5 998 non-stage enrolments is 39%.
 *
 * The 30.5% this first read - 1 minus 1/1.438, the steady-state share of ALL
 * enrolments - was the same arithmetic applied to the wrong denominator. The
 * stage carries a fifth of the platform's enrolments and contributes no
 * repeats, so the rest has to carry more than the average, not the average.
 *
 * It is an upper bound in practice, and that is deliberate: `makeCohort` takes
 * what the pool offers and no more, and the pool only offers talents whose
 * career has room left. So the careers drawn in `world.ts` stay the binding
 * constraint and this share cannot overshoot the histogram - at a profile whose
 * long tail is small relative to its stage, it simply falls short of it, which
 * is a volume limit rather than a wrong shape.
 */
export const RETURNING_SHARE = 0.39;

/**
 * The share on an event that conducts closings, and the one deliberate
 * departure of this change.
 *
 * Production cannot be consulted on multi-closing: `Closing_Record` per event
 * is new in v3, and the model it replaced was 1:1 with the talent. What
 * production does say is that only 25 of its 292 events conduct closings at
 * all, so a returning talent recruited uniformly would almost never land on two
 * of them, and « Son parcours » would have nothing to show.
 *
 * Raising THIS rather than the number of events that carry the module is the
 * smaller departure, and deliberately so. It leaves every measured figure
 * standing - how many events conduct closings, the 68 to 79% conducted per
 * roster, the cohort sizes - and changes only WHICH talents fill a list, which
 * PROFILE.md does not measure. Putting the module on more events would have
 * moved the per-campus closing coverage that `campusComparison.ts` reads.
 */
export const RETURNING_SHARE_WITH_CLOSINGS = 0.7;

/**
 * A cohort.
 *
 * 43.5% of talents resolve to a school and about 1% carry a free-text school
 * name with no UAI at all - both figures from production, and both are states a
 * screen rendering a lycée has to survive.
 *
 * It fills from the returning pool first and mints the rest. Taking what the
 * pool offers and no more (`Math.min`) is what keeps the careers drawn in
 * `world.ts` the binding constraint: the share below is a preference for who
 * gets picked, never a second target competing with the histogram.
 */
export function makeCohort(
  world: World,
  opts: {
    size: number;
    campus: CampusRef;
    schoolYear: string;
    /**
     * Part of the cohort to recruit among talents who have already been to
     * something on this campus. Omitted means a cohort of newcomers, which is
     * what the stage de seconde is: it runs second, so the pool is empty
     * anyway, and « imported from the CRM, never opened » is its dominant
     * state.
     */
    returning?: { share: number };
    /**
     * The career to place on this cohort, instead of drawing one. For a format
     * that is itself the tail of the career distribution: a club regular
     * attends its season by definition, so drawing a career of one for them and
     * then enrolling them ten times would make the cap a decoration.
     *
     * It reads « this many events FROM HERE ON » and applies to the whole
     * cohort, minted and recruited alike. A talent this call mints has attended
     * nothing, so the two spellings agree on them; a talent it recruits keeps
     * what they already did and gains a season on top. Placing it on only half
     * the cohort is what made the returning share unreachable: the recruits
     * were then expected to satisfy a histogram the season cannot fit inside.
     */
    career?: number;
  },
): TalentRef[] {
  const { rng } = world.ctx;
  const uais = [...world.schools.keys()];
  const cohort: TalentRef[] = [];

  if (opts.returning) {
    const pool = world.returningPool({ campusId: opts.campus.id });
    const wanted = Math.min(
      Math.round(opts.size * opts.returning.share),
      pool.length,
      opts.size,
    );
    for (const talent of rng.sample(pool, wanted)) {
      // Declared a regular before the caller enrols them, not after: the pool
      // only ever promises room for one more event, and a season is ten.
      if (opts.career !== undefined) world.placeCareer(talent, opts.career);
      cohort.push(talent);
    }
  }

  for (let i = cohort.length; i < opts.size; i += 1) {
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
      career: opts.career,
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
 *
 * It takes no scale, and that is the point. How many people come to an event is
 * a MEASUREMENT; how many events there are is the volume dial. Scaling this as
 * well as the event count scaled the same quantity twice, which is what left
 * the smaller profiles the wrong shape - see the comment on `target` in
 * `longTail.ts`.
 */
export function cohortSize(world: World): number {
  const { rng } = world.ctx;
  return Math.max(
    1,
    rng.weighted([
      [rng.int(1, 9), 25],
      [rng.int(10, 23), 25],
      [rng.int(24, 39), 25],
      [rng.int(40, 66), 15],
      [rng.int(67, 140), 10],
    ]),
  );
}
