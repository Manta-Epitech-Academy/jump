/**
 * The CTFd activity catalogue.
 *
 * Three rows, two offered and one retired, because `assert/coverage.ts` wants
 * both values of every boolean and the `MinigameConfig.enabled` exemption does
 * not carry over: that one sits outside the wipe and its value depends on the
 * history of the database, while these are removed and rewritten on every full
 * run.
 *
 * Each carries the cover an admin would have written with `write_workshop_cover`,
 * in the three shapes the dashboard has to render: a full one (tagline,
 * animation, still, mascot), a sparse one (a still and no tagline), and none at
 * all (the label alone). Like every stored file here, the pictures are KEYS
 * WITHOUT BYTES: a seeded environment has no bucket behind
 * them, so the dashboard's fallback for a picture that does not load is what a
 * reviewer sees, which is also the path that most needs looking at.
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
import {
  workshopCoverKey,
  type WorkshopCoverKind,
} from '../../../src/lib/domain/workshops';
import { stillKeyOf } from '../../../src/lib/domain/pictures';

type CoverImageSpec = {
  readonly kind: WorkshopCoverKind;
  readonly file: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
};

export type WorkshopSpec = {
  readonly slug: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly enabled: boolean;
  /** How long it runs where a scenario attaches it, in minutes. */
  readonly durationMinutes: number;
  /** How many steps the subject holds, mirrored by a seeded participation. */
  readonly totalSteps: number;
  /** The line the hero leads with; null to lead with the label. */
  readonly tagline: string | null;
  /** The pictures, as copied: none for an activity that stands on its label. */
  readonly images: readonly CoverImageSpec[];
};

export const WORKSHOPS: readonly WorkshopSpec[] = [
  {
    slug: 'pacman-ia',
    label: 'Pacman IA',
    baseUrl: 'https://pacman-ia.ctfd.invalid',
    enabled: true,
    durationMinutes: 120,
    totalSteps: 15,
    tagline: 'Bientôt c’est TON code qui fera bouger ce fantôme',
    images: [
      {
        kind: 'media',
        file: 'jeu-demo',
        contentType: 'image/gif',
        width: 640,
        height: 400,
      },
      {
        kind: 'poster',
        file: 'jeu',
        contentType: 'image/webp',
        width: 640,
        height: 400,
      },
      {
        kind: 'mascot',
        file: 'fantome',
        contentType: 'image/webp',
        width: 256,
        height: 256,
      },
    ],
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
    tagline: null,
    images: [
      {
        kind: 'poster',
        file: 'terminal',
        contentType: 'image/webp',
        width: 1280,
        height: 720,
      },
    ],
  },
  {
    // Offered and never given a cover, which the dashboard renders with the
    // label alone.
    slug: 'santa-shooter',
    label: 'Santa Shooter',
    baseUrl: 'https://santa-shooter.ctfd.invalid',
    enabled: true,
    durationMinutes: 180,
    totalSteps: 31,
    tagline: null,
    images: [],
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
      tagline: workshop.tagline,
      baseUrl: workshop.baseUrl,
      enabled: workshop.enabled,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });

  // Create-only like the rows above: an activity an admin has since dressed
  // keeps the pictures it was given.
  await prisma.workshop_CoverImage.createMany({
    data: WORKSHOPS.flatMap((workshop) => {
      const instanceId = workshopInstanceId(workshop.slug);
      return workshop.images.map((image) => {
        const animated = image.contentType === 'image/gif';
        const extension = animated ? 'gif' : 'webp';
        const key = workshopCoverKey(
          instanceId,
          image.kind,
          '0000seed',
          extension,
        );
        return {
          instanceId,
          kind: image.kind,
          // As an admin would have given it: an https address, here on a host
          // that cannot resolve, since nothing ever downloads it again.
          sourceUrl: `https://assets.seed.invalid/${workshop.slug}/${image.file}.${image.contentType === 'image/gif' ? 'gif' : 'png'}`,
          key,
          // An animation is stored with its first frame, as the copy does.
          stillKey: animated ? stillKeyOf(key) : null,
          contentType: image.contentType,
          width: image.width,
          height: image.height,
        };
      });
    }),
    skipDuplicates: true,
  });
  return count;
}
