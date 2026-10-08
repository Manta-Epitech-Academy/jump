// The class A writes for the CTFd activities, one per entity: a host and its
// address (`write_workshop_instance`), and an activity, the content a host
// serves, curated and presented in one call (`write_workshop`). Which ones an
// event offers is part of the event's configuration (`write_event_config`).
// Bounded to named rows and reversible.
//
// Curation (the name a talent reads, the host serving it, whether it is offered)
// and presentation (the cover on the talent dashboard) are facets of one
// activity, so they are fields of one write rather than two tools, and a new
// activity can be declared with its cover in one call. The host is not a facet
// of it: several activities name one host, so its address is written once, on
// the host.
//
// Presenting one downloads the pictures it is given and does not already hold,
// from addresses an admin chose, before anything is stored. That read sends
// nothing anywhere a person would receive and writes only to the named activity,
// so the class does not move. It is all or nothing: a picture that cannot be
// copied refuses the whole write, curation included, and the activity stays as
// it was.
//
// There is deliberately no delete. `config_workshops` returns slugs, so a delete
// tool would be something a model could aim on its own, which puts it in class
// C. An activity is retired with `enabled: false`, and every FK onto it and onto
// its host is `Restrict` so a hand-deletion of one still in use fails loudly.
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
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

/** What the host write reports, before and after. */
async function instanceState(slug: string) {
  const row = await prisma.workshop_Instance.findUnique({
    where: { slug },
    select: {
      slug: true,
      baseUrl: true,
      activities: { select: { slug: true }, orderBy: { slug: 'asc' } },
    },
  });
  return row
    ? {
        instance: row.slug,
        baseUrl: row.baseUrl,
        activities: row.activities.map((a) => a.slug),
      }
    : null;
}

/** Declare a CTFd host, or move it to another address. */
export async function writeWorkshopInstance(params: {
  instance: string;
  baseUrl: string;
}): Promise<WriteOutcome> {
  const slug = params.instance.trim();
  if (!slug) {
    throw new OperationRefusedError(
      "Une instance a besoin d'une clé technique : celle que son administration CTFd affiche comme « slug » de l'instance.",
    );
  }

  const before = await instanceState(slug);
  const baseUrl = normaliseBaseUrl(params.baseUrl);

  await prisma.workshop_Instance.upsert({
    where: { slug },
    create: { slug, baseUrl },
    update: { baseUrl },
  });

  return { applied: true, before, after: await instanceState(slug) };
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
  const activity = await db.workshop_Activity.findUnique({
    where: { slug },
    select: {
      slug: true,
      label: true,
      enabled: true,
      instance: { select: { slug: true } },
      tagline: true,
      coverImages: {
        select: { kind: true, sourceUrl: true },
        orderBy: { kind: 'asc' },
      },
    },
  });
  if (!activity) return null;
  const { instance, tagline, coverImages, ...curation } = activity;
  // The address each picture was copied from, by kind.
  return {
    ...curation,
    instance: instance.slug,
    cover: { tagline, images: coverImages },
  };
}

/**
 * Moving an activity to another host is refused once a talent has entered it.
 *
 * The other host holds a fresh CTFd account for each of them, and a progress
 * report is the whole state recounted, so the first step validated there
 * replaces a finished activity's grant with one step's worth: the XP of a
 * content walked once, for life, would fall back to nearly nothing. Before
 * anybody enters, a move only corrects a declaration, which is what it is for.
 * A host that merely changes address keeps its accounts, and is
 * `write_workshop_instance`'s.
 */
async function refuseMoveOnceEntered(
  activityId: string,
  slug: string,
  currentInstance: string,
): Promise<void> {
  const entered = await prisma.workshop_Participation.count({
    where: { activityId },
  });
  if (entered > 0) {
    throw new OperationRefusedError(
      `L'activité « ${slug} » ne change plus d'instance : ${entered} talent(s) y sont déjà entrés sur « ${currentInstance} », et l'autre instance les ferait repartir de zéro, XP compris. Si c'est la même instance à une nouvelle adresse, mettez cette adresse à jour avec write_workshop_instance.`,
    );
  }
}

/**
 * Declare or update one activity: a slug that does not exist yet creates one,
 * which then needs its name and its host; an existing slug changes only what the
 * call names. The slug is the plugin's own name for the content, so it is taken
 * as given and never derived: a mismatch is refused by the host at the first
 * entry, which is the point. `cover` states the whole cover when given
 * (anything it omits is removed), `null` removes it, and an omitted `cover`
 * leaves it alone. A picture whose address has not changed keeps the copy
 * already stored (`replacePictures`), so restating the cover to change its
 * tagline downloads nothing.
 */
export async function writeWorkshop(params: {
  slug: string;
  instance?: string;
  label?: string;
  enabled?: boolean;
  cover?: WorkshopCoverInput | null;
}): Promise<WriteOutcome> {
  const slug = params.slug.trim();
  const existing = await prisma.workshop_Activity.findUnique({
    where: { slug },
    select: { id: true, instance: { select: { id: true, slug: true } } },
  });
  const label = params.label?.trim();
  if (label === '') {
    throw new OperationRefusedError(
      "Le libellé d'une activité ne peut pas être vide : c'est le nom que lit un talent sur son accueil.",
    );
  }

  let instanceId: string | undefined;
  if (params.instance !== undefined) {
    const host = await prisma.workshop_Instance.findUnique({
      where: { slug: params.instance.trim() },
      select: { id: true },
    });
    if (!host) {
      throw new OperationRefusedError(
        `Instance « ${params.instance} » introuvable. ${handleProvenanceFr('workshopInstanceSlug')}`,
      );
    }
    instanceId = host.id;
    if (existing && existing.instance.id !== host.id) {
      await refuseMoveOnceEntered(existing.id, slug, existing.instance.slug);
    }
  }

  // A new activity's id is minted here rather than by the database, because its
  // cover's storage keys are named after it before the row exists.
  const id = existing?.id ?? randomUUID();
  let creation: Prisma.Workshop_ActivityUncheckedCreateInput | null = null;
  if (!existing) {
    if (!label || !instanceId) {
      throw new OperationRefusedError(
        "Une nouvelle activité a besoin d'un libellé français (celui que lit un talent sur son accueil) et de l'instance qui la sert (label, instance).",
      );
    }
    creation = { id, slug, label, instanceId, enabled: params.enabled ?? true };
  }
  // On an existing activity, only what the call names changes: an omitted
  // `enabled` in particular stays as it stands, so editing a label cannot
  // silently put a retired activity back in front of a cohort.
  const saveActivity = async (
    tx: Prisma.TransactionClient,
    tagline?: string | null,
  ) => {
    if (!creation) {
      return tx.workshop_Activity.update({
        where: { id },
        data: { label, instanceId, enabled: params.enabled, tagline },
      });
    }
    try {
      return await tx.workshop_Activity.create({
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
    await saveActivity(prisma);
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
          where: { activityId: id },
          select: COVER_IMAGE_SELECT,
        })
      ).map(({ kind, ...picture }) => ({ slot: kind, ...picture })),
    // Taken before the cover is read, so a second write on this activity
    // waits here and then reads what this one wrote.
    lock: async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Workshop_Activity" WHERE id = ${id} FOR UPDATE`;
    },
    commit: async (tx, pictures) => {
      // Read under the lock, so what the audit row calls "before" is the state
      // this write actually replaced, not one a concurrent write has moved on.
      const before = await workshopState(tx, slug);
      await saveActivity(tx, tagline);
      await tx.workshop_CoverImage.deleteMany({ where: { activityId: id } });
      await tx.workshop_CoverImage.createMany({
        data: pictures.map(({ slot, ...picture }) => ({
          activityId: id,
          kind: slot as WorkshopCoverKind,
          ...picture,
        })),
      });
      return { before, after: await workshopState(tx, slug) };
    },
  });

  return { applied: true, before, after };
}
