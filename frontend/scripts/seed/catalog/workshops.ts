/**
 * The CTFd activity catalogue.
 *
 * Two rows, one offered and one retired, because `assert/coverage.ts` wants both
 * values of every boolean and the `MinigameConfig.enabled` exemption does not
 * carry over: that one sits outside the wipe and its value depends on the history
 * of the database, while these are removed and rewritten on every full run.
 *
 * `baseUrl` POINTS AT A HOST THAT CANNOT RESOLVE, and that is the point rather
 * than a placeholder. `.invalid` is reserved by RFC 2606. A dev or preprod
 * database carrying the real `epiboost.fr` address with `enabled: true` would be
 * one click away from handing a talent over to a live instance from a validation
 * environment, which is the class of thing this generator exists to make
 * impossible (see the worker-inertness rule in `scripts/seed/CLAUDE.md`).
 *
 * Like every other catalogue seeder here, it is CREATE-ONLY: it never overwrites
 * a row somebody has since edited, which is what makes `--catalog-only` safe
 * against a populated database. Unlike the feedback forms it needs no slug list
 * passed to `wipe()`, because these rows carry derived `sd_` ids: the id
 * predicate already removes them on a full run, so an edit to this file reaches a
 * database that had already been seeded once.
 */

import type { PrismaClient } from '@prisma/client';
import { id } from '../ids';

export type WorkshopSpec = {
  readonly slug: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly enabled: boolean;
  /** How long it runs where a scenario attaches it, in minutes. */
  readonly durationMinutes: number;
  /** How many steps the subject holds, mirrored by a seeded participation. */
  readonly totalSteps: number;
};

export const WORKSHOPS: readonly WorkshopSpec[] = [
  {
    slug: 'pacman-ia',
    label: 'Pacman IA',
    baseUrl: 'https://pacman-ia.ctfd.invalid',
    enabled: true,
    durationMinutes: 120,
    totalSteps: 15,
  },
  {
    // Retired rather than deleted, which is how an activity leaves the
    // catalogue: the events that offered it keep their rows, and the talents who
    // walked it keep their XP.
    slug: 'discover-linux',
    label: 'Discover Linux',
    baseUrl: 'https://discover-linux.ctfd.invalid',
    enabled: false,
    durationMinutes: 90,
    totalSteps: 12,
  },
];

export const WORKSHOP_SLUGS = WORKSHOPS.map((workshop) => workshop.slug);

/**
 * The id a seeded instance carries, derived rather than read back.
 *
 * `loadPreexistingRows` exists for catalogue rows whose ids the generator does
 * not choose (the feedback forms' cuids, the closing bank a migration owns).
 * These are `sd_`-derived, so a scenario composes the id instead of querying for
 * it, which is the same call `id('evt', ...)` makes everywhere else.
 */
export function workshopInstanceId(slug: string): string {
  return id('wsi', slug);
}

/** Returns how many instances were inserted; 0 means everything was already there. */
export async function seedWorkshopInstances(
  prisma: PrismaClient,
  anchor: Date,
): Promise<number> {
  const { count } = await prisma.workshop_Instance.createMany({
    data: WORKSHOPS.map((workshop) => ({
      id: workshopInstanceId(workshop.slug),
      slug: workshop.slug,
      label: workshop.label,
      baseUrl: workshop.baseUrl,
      enabled: workshop.enabled,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });
  return count;
}
