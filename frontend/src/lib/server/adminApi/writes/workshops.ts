// The class A writes for the CTFd activities: curating an instance, and saying
// which ones an event offers. Bounded to named rows, reversible, and nothing
// leaves the platform.
//
// There is deliberately no delete. `config_workshop_instances` returns slugs, so
// a delete tool would be something a model could aim on its own, which puts it in
// class C. An instance is retired with `enabled: false`, and the link's FK is
// `Restrict` so a hand-deletion of one still offered fails loudly.
import { prisma } from '$lib/server/db';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import { UnknownScopeError } from '../scope';
import type { WriteOutcome } from '../plan';

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

  const before = await prisma.workshop_Instance.findUnique({
    where: { slug },
    select: INSTANCE_SELECT,
  });
  const baseUrl = normaliseBaseUrl(params.baseUrl);
  // Left as it stands when the caller says nothing, so editing a label cannot
  // silently put a retired instance back in front of a cohort.
  const enabled = params.enabled ?? before?.enabled ?? true;

  const after = await prisma.workshop_Instance.upsert({
    where: { slug },
    create: { slug, label, baseUrl, enabled },
    update: { label, baseUrl, enabled },
    select: INSTANCE_SELECT,
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
