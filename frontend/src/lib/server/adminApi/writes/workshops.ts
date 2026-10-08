// The class A write for the CTFd activities: one activity, curated and
// presented in one call. Which ones an event offers is part of the event's
// configuration (`write_event_config`). Bounded to named rows and reversible.
//
// Curation (where Jump sends a talent: the name, the instance address, whether it
// is offered) and presentation (the cover on the talent dashboard) are facets of
// one activity, so they are fields of one write rather than two tools, and a new
// activity can be declared with its cover in one call.
//
// Presenting one downloads the pictures it is given and does not already hold,
// from addresses an admin chose, before anything is stored. That read sends
// nothing anywhere a person would receive and writes only to the named activity,
// so the class does not move. It is all or nothing: a picture that cannot be
// copied refuses the whole write, curation included, and the activity stays as
// it was.
//
// There is deliberately no delete. `config_workshop_instances` returns slugs, so
// a delete tool would be something a model could aim on its own, which puts it in
// class C. An instance is retired with `enabled: false`, and the link's FK is
// `Restrict` so a hand-deletion of one still offered fails loudly.
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { OperationRefusedError } from '../errors';
import type { WriteOutcome } from '../plan';
import { replacePictures, type StoredPicture } from '$lib/server/images/remote';
import {
  workshopCoverKey,
  type WorkshopCoverKind,
} from '$lib/domain/workshops';

/**
 * An origin and nothing else: no path, no query, no trailing slash, because the
 * entry action appends `/jump/enter?t=...` to it. A stored `https://host/` would
 * produce a double slash, and a stored path would silently move the endpoint.
 */
function normaliseBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new OperationRefusedError(
      `« ${raw} » n'est pas une adresse valide. Attendu : l'adresse complète de l'instance, par exemple https://pacman.epiboost.fr.`,
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new OperationRefusedError(
      "L'adresse d'une instance doit être en http ou https.",
    );
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new OperationRefusedError(
      "L'adresse d'une instance est une origine seule, sans chemin ni paramètre : Jump y ajoute lui-même le chemin d'entrée.",
    );
  }
  return parsed.origin;
}

/** How an activity presents itself on the talent dashboard. */
type WorkshopCoverInput = {
  tagline?: string;
  mediaUrl?: string;
  posterUrl?: string;
  mascotUrl?: string;
};

const COVER_KINDS: WorkshopCoverKind[] = ['media', 'poster', 'mascot'];

/** French name of each picture, for a refusal the admin reads. */
const COVER_LABEL_FR: Record<WorkshopCoverKind, string> = {
  media: 'Le visuel',
  poster: "L'image fixe",
  mascot: 'La mascotte',
};

/**
 * Longest stored edge of each picture: the hero's picture slot for the visual
 * and its still, a small sprite for the mascot. Any proportion and any format
 * Jump can show are taken, an animation included (`copyRemoteImage`); the hero
 * lays out whatever it is given.
 */
const COVER_MAX_EDGE: Record<WorkshopCoverKind, number> = {
  media: 1280,
  poster: 1280,
  mascot: 512,
};

const COVER_IMAGE_SELECT = {
  kind: true,
  sourceUrl: true,
  key: true,
  stillKey: true,
  contentType: true,
  width: true,
  height: true,
} as const;

/** What the activity write reports, before and after: everything it can set. */
async function workshopState(db: Prisma.TransactionClient, slug: string) {
  const instance = await db.workshop_Instance.findUnique({
    where: { slug },
    select: {
      slug: true,
      label: true,
      baseUrl: true,
      enabled: true,
      tagline: true,
      coverImages: {
        select: { kind: true, sourceUrl: true },
        orderBy: { kind: 'asc' },
      },
    },
  });
  if (!instance) return null;
  const { tagline, coverImages, ...curation } = instance;
  // The address each picture was copied from, by kind.
  return { ...curation, cover: { tagline, images: coverImages } };
}

/**
 * Declare or update one activity: a slug that does not exist yet creates one,
 * which then needs its name and address; an existing slug changes only what the
 * call names. `cover` states the whole cover when given (anything it omits is
 * removed), `null` removes it, and an omitted `cover` leaves it alone. A picture
 * whose address has not changed keeps the copy already stored
 * (`replacePictures`), so restating the cover to change its tagline downloads
 * nothing.
 */
export async function writeWorkshop(params: {
  slug: string;
  label?: string;
  baseUrl?: string;
  enabled?: boolean;
  cover?: WorkshopCoverInput | null;
}): Promise<WriteOutcome> {
  const slug = params.slug.trim();
  const existing = await prisma.workshop_Instance.findUnique({
    where: { slug },
    select: { id: true },
  });
  const label = params.label?.trim();
  if (label === '') {
    throw new OperationRefusedError(
      "Le libellé d'une activité ne peut pas être vide : c'est le nom que lit un talent sur son accueil.",
    );
  }
  const baseUrl =
    params.baseUrl === undefined ? undefined : normaliseBaseUrl(params.baseUrl);
  // A new activity's id is minted here rather than by the database, because its
  // cover's storage keys are named after it before the row exists.
  const id = existing?.id ?? randomUUID();
  let creation: Prisma.Workshop_InstanceCreateInput | null = null;
  if (!existing) {
    if (!label || !baseUrl) {
      throw new OperationRefusedError(
        "Une nouvelle activité a besoin d'un libellé français (celui que lit un talent sur son accueil) et de l'adresse de son instance (label, baseUrl).",
      );
    }
    creation = { id, slug, label, baseUrl, enabled: params.enabled ?? true };
  }
  // On an existing activity, only what the call names changes: an omitted
  // `enabled` in particular stays as it stands, so editing a label cannot
  // silently put a retired instance back in front of a cohort.
  const saveInstance = async (
    tx: Prisma.TransactionClient,
    tagline?: string | null,
  ) => {
    if (!creation) {
      return tx.workshop_Instance.update({
        where: { id },
        data: { label, baseUrl, enabled: params.enabled, tagline },
      });
    }
    try {
      return await tx.workshop_Instance.create({
        data: { ...creation, tagline },
      });
    } catch (err) {
      // Another call created this slug since it was looked up: a retry after a
      // timeout, overlapping the call it retries. Its id is not the one this
      // call minted and named its pictures after, so the honest answer is to
      // stop here, and a retry now finds the activity and updates it.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new OperationRefusedError(
          `L'activité « ${slug} » vient d'être créée par un autre appel. Relancez celui-ci : il la mettra à jour.`,
        );
      }
      throw err;
    }
  };

  if (params.cover === undefined) {
    const before = await workshopState(prisma, slug);
    await saveInstance(prisma);
    return {
      applied: true,
      before,
      after: await workshopState(prisma, slug),
    };
  }

  const cover = params.cover ?? {};
  const tagline = cover.tagline?.trim() || null;
  const urls: Partial<Record<WorkshopCoverKind, string>> = {
    media: cover.mediaUrl,
    poster: cover.posterUrl,
    mascot: cover.mascotUrl,
  };
  const { before, after } = await replacePictures({
    requests: COVER_KINDS.filter((kind) => urls[kind]).map((kind) => ({
      slot: kind,
      sourceUrl: urls[kind]!,
      maxEdge: COVER_MAX_EDGE[kind],
    })),
    keyFor: (request, writeId, extension) =>
      workshopCoverKey(
        id,
        request.slot as WorkshopCoverKind,
        writeId,
        extension,
      ),
    refusal: (request, why) =>
      new OperationRefusedError(
        `${COVER_LABEL_FR[request.slot as WorkshopCoverKind]} (${request.sourceUrl}) ${why}. L'activité n'a pas changé.`,
      ),
    readStored: async (db): Promise<StoredPicture[]> =>
      (
        await db.workshop_CoverImage.findMany({
          where: { instanceId: id },
          select: COVER_IMAGE_SELECT,
        })
      ).map(({ kind, ...picture }) => ({ slot: kind, ...picture })),
    // Taken before the cover is read, so a second write on this activity
    // waits here and then reads what this one wrote.
    lock: async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Workshop_Instance" WHERE id = ${id} FOR UPDATE`;
    },
    commit: async (tx, pictures) => {
      // Read under the lock, so what the audit row calls "before" is the state
      // this write actually replaced, not one a concurrent write has moved on.
      const before = await workshopState(tx, slug);
      await saveInstance(tx, tagline);
      await tx.workshop_CoverImage.deleteMany({ where: { instanceId: id } });
      await tx.workshop_CoverImage.createMany({
        data: pictures.map(({ slot, ...picture }) => ({
          instanceId: id,
          kind: slot as WorkshopCoverKind,
          ...picture,
        })),
      });
      return { before, after: await workshopState(tx, slug) };
    },
  });

  return { applied: true, before, after };
}
