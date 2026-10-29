/**
 * The CTFd activity catalogue: three hosts, and the five contents they served.
 *
 * One host has served two contents in turn, the first one retired, which is
 * how an instance passes from one request to the next in production and the
 * case the activity key exists for: a regular who walked both keeps two rows in
 * their history, under two names.
 *
 * Five activities, four offered and one retired, because `assert/coverage.ts` wants
 * both values of every boolean and the `MinigameConfig.enabled` exemption does
 * not carry over: that one sits outside the wipe and its value depends on the
 * history of the database, while these are removed and rewritten on every full
 * run.
 *
 * Each is filed in the subject catalogue as an admin would have filed it with
 * `write_workshop`, and the five between them stand every state the catalogue
 * has to show or hide: a complete subject in two domains, one with no notions,
 * one that keeps an archived domain, an offered one still missing its tagline
 * and pictures (hidden), and the retired one with no level (hidden). Together
 * they carry every `WorkshopLevel`, which `assert/enums.ts` asks for. The
 * shown ones sit on two hosts with two supervisor codes, so the cards show the
 * code is the host's; the third host, serving only a hidden subject, has none.
 *
 * Each carries the cover an admin would have written with `write_workshop`,
 * in the three shapes the dashboard has to render: a full one (tagline,
 * animation, still, mascot), a sparse one (a still and no tagline), and none at
 * all (the label alone). The pictures are real, drawn for the seed and kept
 * beside this file (`pictures/<slug>/`), and stored the way the write stores
 * what it copies (`preparePicture`, `WORKSHOP_COVER_MAX_EDGE`): a still
 * re-encoded, an animation kept with its still, each row carrying the size of
 * the bytes it names. Where the bytes go, and when they go nowhere, is
 * `../storage.ts`.
 *
 * `baseUrl` POINTS AT A HOST THAT CANNOT RESOLVE, and that is the point rather
 * than a placeholder. `.invalid` is reserved by RFC 2606. A dev or preprod
 * database carrying the real `epiboost.fr` address behind an enabled activity would be
 * one click away from handing a talent over to a live instance from a validation
 * environment, which is the class of thing this generator exists to make
 * impossible (see the worker-inertness rule in `.claude/rules/seed.md`).
 *
 * Like every other catalogue seeder here, it is CREATE-ONLY: it never overwrites
 * a row somebody has since edited, which is what makes `--catalog-only` safe
 * against a populated database. Unlike the feedback forms it needs no slug list
 * passed to `wipe()`, because these rows carry derived `sd_` ids: the id
 * predicate already removes them on a full run, so an edit to this file reaches a
 * database that had already been seeded once.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient, WorkshopLevel } from '@prisma/client';
import { id } from '../ids';
import type { SeedStorage } from '../storage';
import { WORKSHOP_DOMAIN } from './workshopDomains';
import {
  WORKSHOP_COVER_MAX_EDGE,
  workshopCoverKey,
  type WorkshopCoverKind,
} from '../../../src/lib/domain/workshops';
import { stillKeyOf } from '../../../src/lib/domain/pictures';
import { preparePicture } from '../../../src/lib/server/images/prepare';

type CoverImageSpec = {
  readonly kind: WorkshopCoverKind;
  /** The picture in `pictures/<slug>/`, as an admin would have given it. */
  readonly file: string;
};

export type WorkshopInstanceSpec = {
  readonly slug: string;
  readonly baseUrl: string;
  /**
   * The code its catalogue cards show; null for a host Jump holds none for,
   * whose subjects the catalogue keeps off.
   */
  readonly supervisorCode: string | null;
};

export const WORKSHOP_INSTANCES = {
  /** The season's host: one content, then the next. */
  season: {
    slug: 'ctfd-saison',
    baseUrl: 'https://saison.ctfd.invalid',
    supervisorCode: 'SAISON-SUPERVISION-2026',
  },
  santa: {
    slug: 'ctfd-santa',
    baseUrl: 'https://santa-shooter.ctfd.invalid',
    supervisorCode: null,
  },
  /**
   * A campus's own host, serving two contents side by side: both of its
   * catalogue cards show its one supervisor code.
   */
  campus: {
    slug: 'ctfd-campus',
    baseUrl: 'https://campus.ctfd.invalid',
    supervisorCode: 'CAMPUS-SUPERVISION-2026',
  },
} as const satisfies Record<string, WorkshopInstanceSpec>;

export type WorkshopSpec = {
  readonly slug: string;
  readonly label: string;
  /** The host serving it. */
  readonly instance: WorkshopInstanceSpec;
  readonly enabled: boolean;
  /** How many steps the subject holds, mirrored by a seeded participation. */
  readonly totalSteps: number;
  /**
   * What one counted step is worth in CTFd, so in XP. Uniform here, where a
   * real subject prices each step: a seeded participation is worth
   * `solvedSteps * stepPoints`, which is what its callback would report.
   */
  readonly stepPoints: number;
  /** The line the hero leads with; null to lead with the label. */
  readonly tagline: string | null;
  /** The pictures, as copied: none for an activity that stands on its label. */
  readonly images: readonly CoverImageSpec[];
  /** How demanding the catalogue says it is; null until an admin says. */
  readonly level: WorkshopLevel | null;
  /** What a talent practises on it, in the order the catalogue shows them. */
  readonly notions: readonly string[];
  /** The catalogue domains it is filed under, by key. */
  readonly domains: readonly string[];
};

export const WORKSHOPS: readonly WorkshopSpec[] = [
  {
    // What the season's host serves now, after `discover-linux` below.
    slug: 'pacman-ia',
    label: 'Pacman IA',
    instance: WORKSHOP_INSTANCES.season,
    enabled: true,
    totalSteps: 15,
    stepPoints: 25,
    tagline: 'Bientôt c’est TON code qui fera bouger ce fantôme',
    images: [
      { kind: 'media', file: 'jeu-demo.gif' },
      { kind: 'poster', file: 'jeu.png' },
      { kind: 'mascot', file: 'fantome.png' },
    ],
    // Complete, and in two domains: the catalogue files it under both.
    level: 'beginner',
    notions: ['Arbres de décision', 'Machines à états'],
    domains: [WORKSHOP_DOMAIN.ALGORITHMICS, WORKSHOP_DOMAIN.AI_DATA],
  },
  {
    // What the season's host served first, retired rather than deleted once
    // the host moved on, which is how an activity leaves the catalogue: the
    // events that offered it keep their rows, and the talents who walked it keep
    // their XP, under its own name.
    slug: 'discover-linux',
    label: 'Discover Linux',
    instance: WORKSHOP_INSTANCES.season,
    enabled: false,
    totalSteps: 12,
    stepPoints: 10,
    tagline: null,
    images: [{ kind: 'poster', file: 'terminal.png' }],
    // Retired before anybody gave it a level: out of the catalogue twice over.
    level: null,
    notions: [],
    domains: [WORKSHOP_DOMAIN.SYSTEMS],
  },
  {
    // Offered and never given a cover, which the dashboard renders with the
    // label alone.
    slug: 'santa-shooter',
    label: 'Santa Shooter',
    instance: WORKSHOP_INSTANCES.santa,
    enabled: true,
    totalSteps: 31,
    stepPoints: 50,
    tagline: null,
    images: [],
    // Filed in the catalogue but missing its tagline and pictures, so the
    // catalogue does not show it yet.
    level: 'intermediate',
    notions: ['TIC-80', 'Programmation orientée objet'],
    domains: [WORKSHOP_DOMAIN.GAME_DEV],
  },
  {
    // Complete, and still filed under a domain the team has archived since.
    slug: 'babel-ship',
    label: 'BabelShip',
    instance: WORKSHOP_INSTANCES.campus,
    enabled: true,
    totalSteps: 8,
    stepPoints: 30,
    tagline: 'Fais parler des navires qui n’ont pas la même langue',
    images: [{ kind: 'poster', file: 'navires.png' }],
    level: 'all_levels',
    notions: ['Encodage', 'Morse', 'Chiffre de César'],
    domains: [WORKSHOP_DOMAIN.CYBERSECURITY, WORKSHOP_DOMAIN.ELECTRONICS],
  },
  {
    // Complete with a mascot alone and no notions: the card drops that line.
    slug: 'rayban',
    label: 'RayBan',
    instance: WORKSHOP_INSTANCES.campus,
    enabled: true,
    totalSteps: 10,
    stepPoints: 40,
    tagline: 'Une image 3D, née de simples rayons de lumière',
    images: [{ kind: 'mascot', file: 'rayon.png' }],
    level: 'expert',
    notions: [],
    domains: [WORKSHOP_DOMAIN.GAME_DEV],
  },
];

/**
 * The ids a seeded host and a seeded activity carry, derived rather than read
 * back.
 *
 * `loadPreexistingRows` exists for catalogue rows whose ids the generator does
 * not choose (the feedback forms' cuids, the closing bank a migration owns).
 * These are `sd_`-derived, so a scenario composes the id instead of querying for
 * it, which is the same call `id('evt', ...)` makes everywhere else.
 */
export function workshopInstanceId(slug: string): string {
  return id('wsi', slug);
}

export function workshopActivityId(slug: string): string {
  return id('wsa', slug);
}

/**
 * Returns how many activities were inserted; 0 means everything was already there.
 *
 * A row is only ever hung off a row carrying the id this file derives. A slug
 * can already be held by a row the generator did not write under that id, an
 * admin's own declaration or an activity a migration backfilled under its
 * host's id, and `skipDuplicates` then skips the insert in silence. Attaching
 * to it anyway would fail on the foreign key at best, and at worst dress a real
 * activity with seed pictures or point a seeded one at a real host, so what
 * hangs off a skipped row is skipped with it.
 */
export async function seedWorkshops(
  prisma: PrismaClient,
  anchor: Date,
  storage: SeedStorage | null,
): Promise<number> {
  await prisma.workshop_Instance.createMany({
    data: Object.values(WORKSHOP_INSTANCES).map((instance) => ({
      id: workshopInstanceId(instance.slug),
      slug: instance.slug,
      baseUrl: instance.baseUrl,
      supervisorCode: instance.supervisorCode,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });
  const ownHosts = await presentIds(
    prisma.workshop_Instance.findMany({
      where: {
        id: {
          in: Object.values(WORKSHOP_INSTANCES).map((instance) =>
            workshopInstanceId(instance.slug),
          ),
        },
      },
      select: { id: true },
    }),
  );
  const onOwnHost = WORKSHOPS.filter((workshop) =>
    ownHosts.has(workshopInstanceId(workshop.instance.slug)),
  );

  const { count } = await prisma.workshop_Activity.createMany({
    data: onOwnHost.map((workshop) => ({
      id: workshopActivityId(workshop.slug),
      slug: workshop.slug,
      instanceId: workshopInstanceId(workshop.instance.slug),
      label: workshop.label,
      tagline: workshop.tagline,
      level: workshop.level,
      notions: [...workshop.notions],
      enabled: workshop.enabled,
      createdAt: anchor,
      updatedAt: anchor,
    })),
    skipDuplicates: true,
  });

  const ownActivities = await presentIds(
    prisma.workshop_Activity.findMany({
      where: {
        id: {
          in: WORKSHOPS.map((workshop) => workshopActivityId(workshop.slug)),
        },
      },
      select: { id: true },
    }),
  );

  // Create-only like the rows above: an activity an admin has since dressed
  // keeps the pictures it was given.
  const covers = await Promise.all(
    WORKSHOPS.filter((workshop) =>
      ownActivities.has(workshopActivityId(workshop.slug)),
    ).flatMap((workshop) =>
      workshop.images.map((image) => preparedCover(workshop.slug, image)),
    ),
  );
  await prisma.workshop_CoverImage.createMany({
    data: covers.map((cover) => cover.row),
    skipDuplicates: true,
  });

  // The bytes of the rows that are there under the seed's own keys, and of no
  // others: a skipped row is an admin's, and its pictures are theirs.
  if (storage) {
    const written = new Set(
      (
        await prisma.workshop_CoverImage.findMany({
          where: { key: { in: covers.map((cover) => cover.row.key) } },
          select: { key: true },
        })
      ).map((row) => row.key),
    );
    for (const { row, picture } of covers) {
      if (!written.has(row.key)) continue;
      await storage.put(row.key, picture.bytes, picture.contentType);
      if (row.stillKey && picture.still) {
        await storage.put(row.stillKey, picture.still, 'image/webp');
      }
    }
  }

  // Only onto a domain that is there: `--catalog-only` writes no domain, since
  // a populated database's domains are the team's, so a seeded activity there
  // is filed under the ones that already exist and no others.
  const presentDomains = new Set(
    (
      await prisma.workshop_Domain.findMany({
        where: {
          key: { in: WORKSHOPS.flatMap((workshop) => workshop.domains) },
        },
        select: { key: true },
      })
    ).map((domain) => domain.key),
  );
  await prisma.workshop_ActivityDomain.createMany({
    data: WORKSHOPS.filter((workshop) =>
      ownActivities.has(workshopActivityId(workshop.slug)),
    ).flatMap((workshop) =>
      workshop.domains
        .filter((key) => presentDomains.has(key))
        .map((domainKey) => ({
          activityId: workshopActivityId(workshop.slug),
          domainKey,
        })),
    ),
    skipDuplicates: true,
  });
  return count;
}

const PICTURES = path.join(__dirname, 'pictures');

/** A picture of the catalogue, as `write_workshop` would have stored it. */
async function preparedCover(slug: string, image: CoverImageSpec) {
  const activityId = workshopActivityId(slug);
  const raw = new Uint8Array(
    await readFile(path.join(PICTURES, slug, image.file)),
  );
  const picture = await preparePicture(
    raw,
    WORKSHOP_COVER_MAX_EDGE[image.kind],
  );
  const key = workshopCoverKey(
    activityId,
    image.kind,
    '0000seed',
    picture.extension,
  );
  return {
    picture,
    row: {
      activityId,
      kind: image.kind,
      // As an admin would have given it: an https address, here on a host
      // that cannot resolve, since nothing ever downloads it again.
      sourceUrl: `https://assets.seed.invalid/${slug}/${image.file}`,
      key,
      // An animation is stored with its first frame, as the copy does.
      stillKey: picture.still ? stillKeyOf(key) : null,
      contentType: picture.contentType,
      width: picture.width,
      height: picture.height,
    },
  };
}

async function presentIds(
  rows: Promise<{ id: string }[]>,
): Promise<Set<string>> {
  return new Set((await rows).map((row) => row.id));
}
