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
 */

import type { SeedProfile, SeedProfileName } from './context';

export const PROFILES: Record<SeedProfileName, SeedProfile> = {
  // Small enough to run inside `verify` without anybody noticing, wide enough
  // that every enum value and every reachable state is present.
  ci: {
    name: 'ci',
    campuses: 3,
    talents: 60,
    events: 12,
    includeMessyStates: true,
  },

  // A working day's dataset: big enough that a cohort table, an export and an
  // aggregate behave like the real thing.
  dev: {
    name: 'dev',
    campuses: 6,
    talents: 500,
    events: 40,
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
  demo: {
    name: 'demo',
    campuses: 4,
    talents: 200,
    events: 20,
    includeMessyStates: false,
  },
};

export function isProfileName(value: string): value is SeedProfileName {
  return value in PROFILES;
}
