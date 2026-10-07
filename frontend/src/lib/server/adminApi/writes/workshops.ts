// The class A writes for the CTFd activities: curating an instance, presenting
// it on the talent dashboard, and saying which ones an event offers. Bounded to
// named rows and reversible.
//
// Presenting one (`writeWorkshopCover`) downloads the pictures it is given and
// does not already hold, from addresses an admin chose, before anything is
// stored. That read sends nothing
// anywhere a person would receive and writes only to the named activity, so the
// class does not move. It is all or nothing: a picture that cannot be copied
// refuses the whole write, and the cover stays as it was.
//
// There is deliberately no delete. `config_workshop_instances` returns slugs, so
// a delete tool would be something a model could aim on its own, which puts it in
// class C. An instance is retired with `enabled: false`, and the link's FK is
// `Restrict` so a hand-deletion of one still offered fails loudly.
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { UnknownScopeError } from '../scope';
import type { WriteOutcome } from '../plan';
import { replacePictures, type StoredPicture } from '$lib/server/images/remote';
import {
  workshopCoverKey,
  type WorkshopCoverKind,
} from '$lib/domain/workshops';

type WorkshopInstanceState = {
  slug: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
};

const INSTANCE_SELECT = {
  slug: true,
  label: true,
  baseUrl: true,
  enabled: true,
} as const;

function instanceState(slug: string): Promise<WorkshopInstanceState | null> {
  return prisma.workshop_Instance.findUnique({
    where: { slug },
    select: INSTANCE_SELECT,
  });
}

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

export async function writeWorkshopInstance(params: {
  slug: string;
  label: string;
  baseUrl: string;
  enabled?: boolean;
}): Promise<WriteOutcome> {
  const slug = params.slug.trim();
  const label = params.label.trim();
  if (!slug || !label) {
    throw new OperationRefusedError(
      "Une activité a besoin d'une clé technique et d'un libellé français (celui que lit un talent sur son accueil).",
    );
  }

  const before = await instanceState(slug);
  const baseUrl = normaliseBaseUrl(params.baseUrl);
  // Left as it stands when the caller says nothing, so editing a label cannot
  // silently put a retired instance back in front of a cohort.
  const enabled = params.enabled ?? before?.enabled ?? true;

  await prisma.workshop_Instance.upsert({
    where: { slug },
    create: { slug, label, baseUrl, enabled },
    update: { label, baseUrl, enabled },
  });

  return { applied: true, before, after: await instanceState(slug) };
}

/** How an activity presents itself, as `write_workshop_cover` states it. */
type WorkshopCoverState = {
  slug: string;
  tagline: string | null;
  /** The address each picture was copied from, by kind. */
  images: { kind: WorkshopCoverKind; sourceUrl: string }[];
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

async function coverState(
  tx: Prisma.TransactionClient,
  instanceId: string,
): Promise<WorkshopCoverState> {
  const instance = await tx.workshop_Instance.findUniqueOrThrow({
    where: { id: instanceId },
    select: {
      slug: true,
      tagline: true,
      coverImages: {
        select: { kind: true, sourceUrl: true },
        orderBy: { kind: 'asc' },
      },
    },
  });
  return {
    slug: instance.slug,
    tagline: instance.tagline,
    images: instance.coverImages,
  };
}

/**
 * Set how one activity presents itself. The call states the whole cover:
 * anything omitted is removed. A picture whose address has not changed keeps
 * the copy already stored (`replacePictures`), so restating the cover to
 * change its tagline downloads nothing.
 */
export async function writeWorkshopCover(params: {
  slug: string;
  tagline?: string;
  mediaUrl?: string;
  posterUrl?: string;
  mascotUrl?: string;
}): Promise<WriteOutcome> {
  const instance = await prisma.workshop_Instance.findUnique({
    where: { slug: params.slug.trim() },
    select: { id: true },
  });
  if (!instance) {
    throw new OperationRefusedError(
      `Activité « ${params.slug} » introuvable. ${handleProvenanceFr('workshopSlug')}`,
    );
  }

  const tagline = params.tagline?.trim() || null;
  const urls: Partial<Record<WorkshopCoverKind, string>> = {
    media: params.mediaUrl,
    poster: params.posterUrl,
    mascot: params.mascotUrl,
  };

  const { before, after } = await replacePictures({
    requests: COVER_KINDS.filter((kind) => urls[kind]).map((kind) => ({
      slot: kind,
      sourceUrl: urls[kind]!,
      maxEdge: COVER_MAX_EDGE[kind],
    })),
    keyFor: (request, writeId, extension) =>
      workshopCoverKey(
        instance.id,
        request.slot as WorkshopCoverKind,
        writeId,
        extension,
      ),
    refusal: (request, why) =>
      new OperationRefusedError(
        `${COVER_LABEL_FR[request.slot as WorkshopCoverKind]} (${request.sourceUrl}) ${why}. L'aperçu de l'activité n'a pas changé.`,
      ),
    readStored: async (db): Promise<StoredPicture[]> =>
      (
        await db.workshop_CoverImage.findMany({
          where: { instanceId: instance.id },
          select: COVER_IMAGE_SELECT,
        })
      ).map(({ kind, ...picture }) => ({ slot: kind, ...picture })),
    // Taken before the cover is read, so a second write on this activity
    // waits here and then reads what this one wrote.
    lock: async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Workshop_Instance" WHERE id = ${instance.id} FOR UPDATE`;
    },
    commit: async (tx, pictures) => {
      const before = await coverState(tx, instance.id);
      await tx.workshop_Instance.update({
        where: { id: instance.id },
        data: { tagline },
      });
      await tx.workshop_CoverImage.deleteMany({
        where: { instanceId: instance.id },
      });
      await tx.workshop_CoverImage.createMany({
        data: pictures.map(({ slot, ...picture }) => ({
          instanceId: instance.id,
          kind: slot as WorkshopCoverKind,
          ...picture,
        })),
      });
      return { before, after: await coverState(tx, instance.id) };
    },
  });

  return { applied: true, before, after };
}

type EventWorkshopsState = {
  eventId: string;
  workshops: {
    slug: string;
    label: string;
    durationMinutes: number;
    labelOverride: string | null;
  }[];
};

async function eventWorkshopsState(
  eventId: string,
): Promise<EventWorkshopsState> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      workshops: {
        orderBy: { position: 'asc' },
        select: {
          durationMinutes: true,
          labelOverride: true,
          instance: { select: { slug: true, label: true } },
        },
      },
    },
  });
  if (!event) {
    throw new UnknownScopeError(
      `Événement « ${eventId} » introuvable. ${handleProvenanceFr('eventId')}`,
    );
  }
  return {
    eventId: event.id,
    workshops: event.workshops.map((link) => ({
      slug: link.instance.slug,
      label: link.instance.label,
      durationMinutes: link.durationMinutes,
      labelOverride: link.labelOverride,
    })),
  };
}

export async function writeEventWorkshops(params: {
  eventId: string;
  workshops: {
    slug: string;
    durationMinutes: number;
    labelOverride?: string;
  }[];
}): Promise<WriteOutcome> {
  const before = await eventWorkshopsState(params.eventId);

  const slugs = params.workshops.map((w) => w.slug.trim());
  const duplicates = slugs.filter(
    (slug, index) => slugs.indexOf(slug) !== index,
  );
  if (duplicates.length > 0) {
    throw new OperationRefusedError(
      `Une activité ne peut être proposée qu'une fois par événement. En double : ${[...new Set(duplicates)].join(', ')}.`,
    );
  }

  const known = await prisma.workshop_Instance.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(known.map((i) => [i.slug, i.id]));
  const unknown = slugs.filter((slug) => !idBySlug.has(slug));
  if (unknown.length > 0) {
    throw new OperationRefusedError(
      `Activités introuvables : ${unknown.join(', ')}. ${handleProvenanceFr('workshopSlug')}`,
    );
  }

  // Replaced whole, for one named event: removing a link takes the activity off
  // that event's dashboards and nothing else, because a talent's participation
  // holds its own snapshot of the event, the campus and the minute budget and is
  // not bound to this row. XP already granted stay granted.
  await prisma.$transaction(async (tx) => {
    await tx.eventConfig_Workshop.deleteMany({
      where: { eventId: params.eventId },
    });
    if (slugs.length === 0) return;
    await tx.eventConfig_Workshop.createMany({
      data: params.workshops.map((workshop, index) => ({
        eventId: params.eventId,
        instanceId: idBySlug.get(workshop.slug.trim())!,
        position: index,
        durationMinutes: workshop.durationMinutes,
        labelOverride: workshop.labelOverride?.trim() || null,
      })),
    });
  });

  return {
    applied: true,
    before,
    after: await eventWorkshopsState(params.eventId),
  };
}
