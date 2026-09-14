/**
 * How much of each thing to make.
 *
 * A profile scales volume; it never changes which situations exist. Every
 * scenario runs in every profile except `demo`, because the coverage check is a
 * statement about the generator and not about one profile - a scenario that only
 * ran at staging scale would be unverified in CI, which is the one place it is
 * always run.
 *
 * `demo` is the exception and says so: it drops the deliberately ugly states,
 * since a screen being shown to somebody should not open on an unresolved sync
 * error queue.
 *
 * **`events` and `talents` are not independent dials.** Production carries 3.66
 * non-stage enrolments for every stage one (5 998 against 1 640), and almost
 * every per-talent figure in the dataset is a ratio between the two: how often
 * somebody comes back, how many carry a dossier, how many have any XP at all.
 * The stage campaign is sized by `CAMPAIGN_SIZE` in `scenarios/stage.ts` and
 * the long tail by `events`, so the two have to move together - `events * 0.7`
 * of them, at `cohortSize`'s MEAN of about 31.5, against that campaign.
 *
 * The mean and not PROFILE.md's median of 23, which is the tempting number to
 * reach for and undershoots by a third: the cohort draw has a long right tail
 * (a tenth of it lands between 67 and 140), so what a hundred events add up to
 * is their mean, and a median is what a single one looks like. Sizing a profile
 * off 23 asks for half again as many events as it needs and puts the stage back
 * under its real share, which is the exact error this header exists about.
 *
 * Getting that wrong is not a volume error, it is a shape error, and it does
 * not look like one: `dev` used to carry 40 events whose cohorts were then
 * scaled to a quarter, which put the stage at 41% of all enrolments instead of
 * 21%, and left 87% of talents at exactly one event where production has 69%.
 * Every count in the dataset looked plausible.
 */

import type { SeedProfile, SeedProfileName } from './context';

export const PROFILES: Record<SeedProfileName, SeedProfile> = {
  // Small enough to run inside `verify` without anybody noticing, wide enough
  // that every enum value and every reachable state is present.
  // The one profile whose ratio the header's arithmetic cannot reach: a 40-strong
  // campaign wants about five long-tail events, and `longue-traine` floors at
  // six because below that it stops covering its own lifecycle branches. So `ci`
  // runs slightly long-tail-heavy on purpose, which is the harmless direction:
  // the states it exists to cover are all there, and no per-talent PROPORTION is
  // ever read off a profile this small.
  ci: {
    name: 'ci',
    campuses: 3,
    talents: 60,
    events: 8,
    includeMessyStates: true,
  },

  // A working day's dataset: big enough that a cohort table, an export and an
  // aggregate behave like the real thing.
  //
  // 67 events, so `longue-traine` builds 47 of them against a 400-strong stage
  // campaign: 47 mean cohorts is 1 480, and 3.66 times 400 is 1 464, which is
  // the ratio this file's header is about.
  dev: {
    name: 'dev',
    campuses: 6,
    talents: 500,
    events: 67,
    includeMessyStates: true,
  },

  // Production shape. The presence table alone lands around 25 000 rows, which
  // is the volume the émargement and export screens are actually judged at.
  staging: {
    name: 'staging',
    campuses: 15,
    talents: 5000,
    events: 290,
    includeMessyStates: true,
  },

  // Presentable. Same scenarios, no queues full of failures.
  // 30 events against a 180-strong campaign, on the same ratio as `dev`.
  demo: {
    name: 'demo',
    campuses: 4,
    talents: 200,
    events: 30,
    includeMessyStates: false,
  },
};

export function isProfileName(value: string): value is SeedProfileName {
  return value in PROFILES;
}
