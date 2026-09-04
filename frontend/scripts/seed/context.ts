/**
 * What every catalogue, factory and scenario receives.
 *
 * One object rather than module-level singletons, so a scenario cannot reach
 * for the clock or the database behind the runner's back - which is what makes
 * `--today` and `--seed` enforceable rather than merely documented.
 */

import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Clock } from './clock';
import type { Rng } from './rng';
import type { SeedTarget } from './guard';

/**
 * The repo-root `.env`, loaded the way every other script here loads it.
 * `dotenv` never overwrites a variable that is already set, which is what lets
 * `scripts/with-test-db.sh` win by exporting `DATABASE_URL` last.
 */
export function loadEnv(): void {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

export function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type SeedProfileName = 'ci' | 'dev' | 'staging' | 'demo';

export type SeedContext = {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly target: SeedTarget;
  readonly profile: SeedProfile;
  /** Collected by scenarios, rendered by `manifest.ts`. */
  readonly manifest: ManifestEntry[];
  readonly log: (message: string) => void;
};

export type SeedProfile = {
  readonly name: SeedProfileName;
  /** How many campuses to create, from the real list in PROFILE.md order. */
  readonly campuses: number;
  /** Roughly how many talents in total. Scenarios scale their cohorts to it. */
  readonly talents: number;
  /** Roughly how many events in total. */
  readonly events: number;
  /**
   * Whether to include the states that only exist to be ugly: unresolved sync
   * errors, an anonymised talent, a deletion request, a partially failed
   * broadcast. `demo` says no; everything else says yes, because those are the
   * states the coverage check is about.
   */
  readonly includeMessyStates: boolean;
};

export type ManifestAccount = {
  readonly role: string;
  readonly email: string;
  readonly note?: string;
};

export type ManifestEntry = {
  /** The scenario's own name, which is how a person refers to it. */
  readonly scenario: string;
  readonly summary: string;
  readonly campus?: string;
  readonly event?: string;
  /** What this scenario makes testable. One line each, no prose. */
  readonly covers: readonly string[];
  readonly accounts?: readonly ManifestAccount[];
};
