/**
 * The CTFd activity catalogue.
 *
 * Three rows, two offered and one retired, because `assert/coverage.ts` wants
 * both values of every boolean and the `MinigameConfig.enabled` exemption does
 * not carry over: that one sits outside the wipe and its value depends on the
 * history of the database, while these are removed and rewritten on every full
 * run.
 *
 * Each carries the cover a real instance would have handed back on
 * `/jump/meta`, in the three shapes the dashboard has to render: a full one
 * (headline, animation, still, mascot), a sparse one (a title and a still), and
 * none at all (an instance never read). Like every stored file here, the
 * pictures are KEYS WITHOUT BYTES: a seeded environment has no bucket behind
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

type CoverImageSpec = {
  readonly kind: WorkshopCoverKind;
  readonly file: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
};

/** What the instance would answer on `/jump/meta`, already copied. */
type CoverSpec = {
  readonly title: string;
  readonly summary: string | null;
  readonly tagline: string | null;
  readonly images: readonly CoverImageSpec[];
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
  /** Null for an instance Jump has never read. */
  readonly cover: CoverSpec | null;
};

export const WORKSHOPS: readonly WorkshopSpec[] = [
  {
    slug: 'pacman-ia',
    label: 'Pacman IA',
    baseUrl: 'https://pacman-ia.ctfd.invalid',
    enabled: true,
    durationMinutes: 120,
    totalSteps: 15,
    cover: {
      title: 'IA du fantôme de Pac-Man',
      summary: "Programmez l'intelligence du fantôme de Pac-Man, en Lua.",
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
    cover: {
      title: 'Découverte de Linux',
      summary: null,
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
  },
  {
    // Offered and never read: a cover the instance has not handed back yet,
    // which the dashboard renders with the label alone.
    slug: 'santa-shooter',
    label: 'Santa Shooter',
    baseUrl: 'https://santa-shooter.ctfd.invalid',
    enabled: true,
    durationMinutes: 180,
    totalSteps: 31,
    cover: null,
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

  // Create-only like the rows above: an instance an admin has since re-read
  // keeps the cover it was given.
  const covered = WORKSHOPS.flatMap((workshop) =>
    workshop.cover
      ? [
          {
            instanceId: workshopInstanceId(workshop.slug),
            cover: workshop.cover,
          },
        ]
      : [],
  );
  await prisma.workshop_Cover.createMany({
    data: covered.map(({ instanceId, cover }) => ({
      instanceId,
      title: cover.title,
      summary: cover.summary,
      tagline: cover.tagline,
      fetchedAt: anchor,
    })),
    skipDuplicates: true,
  });
  await prisma.workshop_CoverImage.createMany({
    data: covered.flatMap(({ instanceId, cover }) =>
      cover.images.map((image) => {
        const extension = image.contentType === 'image/gif' ? 'gif' : 'webp';
        return {
          instanceId,
          kind: image.kind,
          sourcePath: `/files/ws-seed/${image.file}-0000seed.${image.contentType === 'image/gif' ? 'gif' : 'png'}`,
          key: workshopCoverKey(instanceId, image.kind, '0000seed', extension),
          contentType: image.contentType,
          width: image.width,
          height: image.height,
        };
      }),
    ),
    skipDuplicates: true,
  });
  return count;
}
