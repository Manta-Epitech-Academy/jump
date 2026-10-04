/**
 * The CTFd activities: which ones a talent may enter, and what CTFd says they
 * have done.
 *
 * Two directions, and they never cross. Jump decides who may enter and mints a
 * ticket for it (`workshops/ticket.ts`); CTFd reports progress back over a signed
 * callback, and this file turns that report into one XP grant. Nothing here polls
 * CTFd: a talent's progress arrives, it is never asked for. (The one thing Jump
 * does read from an instance, its cover, is read when an admin declares it, in
 * `workshops/cover.ts`, never on a talent's request.)
 *
 * Which activities a talent is offered is ONE rule, `selectWorkshopOfferings`,
 * and both readers go through `offeredWorkshops`: the dashboard that shows them
 * and the entry action that lets a talent in. A rule the page applied and the
 * entry did not would be a hidden activity one hand-made POST away.
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { workshopXp } from '$lib/domain/xp';
import {
  selectWorkshopOfferings,
  workshopCoverUrl,
  workshopGrantSourceId,
} from '$lib/domain/workshops';
import {
  getEventStatus,
  getLifecycleBounds,
  type LifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { eventDisplayName } from '$lib/domain/event';
import { grantXp } from './xpService';

export type WorkshopCoverImage = { url: string; width: number; height: number };

export type WorkshopActivity = {
  slug: string;
  /** What the talent reads: the event's own wording when it set one. */
  label: string;
  /** The event offering it, as a talent reads its name. */
  eventName: string;
  solvedSteps: number;
  totalSteps: number;
  /** Null until the talent has entered once. */
  startedAt: Date | null;
  /** What the subject says about itself, copied from the instance; null until read. */
  cover: {
    tagline: string | null;
    media: WorkshopCoverImage | null;
    poster: WorkshopCoverImage | null;
    mascot: WorkshopCoverImage | null;
  } | null;
};

export type TalentWorkshops = {
  /**
   * The activities of the event running today, for the dashboard's hero. Null
   * on any day no event of the talent's offering one is running.
   */
  today: { eventName: string; activities: WorkshopActivity[] } | null;
  /** Every other activity the talent has been offered, newest event first. */
  activities: WorkshopActivity[];
};

export type WorkshopEntry = {
  instanceId: string;
  slug: string;
  baseUrl: string;
  /** The enrolment that authorised the entry, pinned on first entry only. */
  eventId: string;
  campusId: string;
  budgetMinutes: number;
};

/**
 * Every activity the talent is offered, one per instance, through the enrolment
 * `selectWorkshopOfferings` resolves it to.
 *
 * Each event's status is read on its OWN campus clock, so "today" for a Réunion
 * event is Réunion's today, whatever the browser says.
 */
async function offeredWorkshops(talentId: string, now: Date, slug?: string) {
  const instanceWhere: Prisma.Workshop_InstanceWhereInput = {
    enabled: true,
    ...(slug ? { slug } : {}),
  };

  const [enrolments, started] = await Promise.all([
    prisma.participation.findMany({
      where: {
        talentId,
        event: { workshops: { some: { instance: instanceWhere } } },
      },
      select: {
        eventId: true,
        campusId: true,
        event: {
          select: {
            date: true,
            endDate: true,
            titre: true,
            publicName: true,
            campus: { select: { timezone: true } },
            workshops: {
              where: { instance: instanceWhere },
              select: {
                position: true,
                durationMinutes: true,
                labelOverride: true,
                instance: {
                  select: { id: true, slug: true, label: true, baseUrl: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.workshop_Participation.findMany({
      where: { talentId },
      select: { instanceId: true },
    }),
  ]);

  const boundsByTimezone = new Map<string, LifecycleBounds>();
  const boundsFor = (timezone: string) => {
    let bounds = boundsByTimezone.get(timezone);
    if (!bounds) {
      bounds = getLifecycleBounds(timezone, now);
      boundsByTimezone.set(timezone, bounds);
    }
    return bounds;
  };

  return selectWorkshopOfferings(
    enrolments.flatMap((enrolment) => {
      const { event } = enrolment;
      const status = getEventStatus(event, boundsFor(event.campus.timezone));
      return event.workshops.map((link) => ({
        instanceId: link.instance.id,
        eventDate: event.date,
        position: link.position,
        status,
        eventId: enrolment.eventId,
        campusId: enrolment.campusId,
        eventName: eventDisplayName(event),
        durationMinutes: link.durationMinutes,
        labelOverride: link.labelOverride,
        instance: link.instance,
      }));
    }),
    new Set(started.map((row) => row.instanceId)),
  );
}

/** What the dashboard renders: today's hero, and every other activity. */
export async function listTalentWorkshops(
  talentId: string,
  now: Date = new Date(),
): Promise<TalentWorkshops> {
  const offered = await offeredWorkshops(talentId, now);
  if (offered.length === 0) return { today: null, activities: [] };

  const instanceIds = offered.map((o) => o.instanceId);
  const [entries, covers] = await Promise.all([
    prisma.workshop_Participation.findMany({
      where: { talentId, instanceId: { in: instanceIds } },
      select: {
        instanceId: true,
        solvedSteps: true,
        totalSteps: true,
        firstEnteredAt: true,
      },
    }),
    prisma.workshop_Cover.findMany({
      where: { instanceId: { in: instanceIds } },
      select: {
        instanceId: true,
        tagline: true,
        images: {
          select: { kind: true, key: true, width: true, height: true },
        },
      },
    }),
  ]);
  const entryByInstance = new Map(entries.map((e) => [e.instanceId, e]));
  const coverByInstance = new Map(covers.map((c) => [c.instanceId, c]));

  const toActivity = (o: (typeof offered)[number]): WorkshopActivity => {
    const entry = entryByInstance.get(o.instanceId);
    const cover = coverByInstance.get(o.instanceId);
    const image = (kind: 'media' | 'poster' | 'mascot') => {
      const found = cover?.images.find((i) => i.kind === kind);
      return found
        ? {
            url: workshopCoverUrl(found.key),
            width: found.width,
            height: found.height,
          }
        : null;
    };
    return {
      slug: o.instance.slug,
      label: o.labelOverride ?? o.instance.label,
      eventName: o.eventName,
      solvedSteps: entry?.solvedSteps ?? 0,
      totalSteps: entry?.totalSteps ?? 0,
      startedAt: entry?.firstEnteredAt ?? null,
      cover: cover
        ? {
            tagline: cover.tagline,
            media: image('media'),
            poster: image('poster'),
            mascot: image('mascot'),
          }
        : null,
    };
  };

  const todays = offered.filter((o) => o.today);
  return {
    today:
      todays.length > 0
        ? {
            // Two events of one talent's running the same day is rare, and
            // naming both is still one hero.
            eventName: [...new Set(todays.map((o) => o.eventName))].join(' · '),
            activities: todays.map(toActivity),
          }
        : null,
    activities: offered.filter((o) => !o.today).map(toActivity),
  };
}

/**
 * Whether this talent may enter this activity, and on whose enrolment.
 *
 * `null` is the refusal: no such instance, it is switched off, no enrolment of
 * this talent offers it, or the event offering it has not started yet.
 */
export async function resolveWorkshopEntry(
  talentId: string,
  slug: string,
  now: Date = new Date(),
): Promise<WorkshopEntry | null> {
  const [match] = await offeredWorkshops(talentId, now, slug);
  if (!match) return null;
  return {
    instanceId: match.instance.id,
    slug: match.instance.slug,
    baseUrl: match.instance.baseUrl,
    eventId: match.eventId,
    campusId: match.campusId,
    budgetMinutes: match.durationMinutes,
  };
}

/**
 * Open or reopen the talent's participation, and answer with the label CTFd will
 * show them.
 *
 * The event, the campus and the minute budget are pinned on CREATION ONLY, which
 * is what makes an admin replaying a duration harmless to whoever has already
 * started. They are taken off the enrolment that just authorised the entry, which
 * is exact: re-resolving the "closest" event here, the way the minigame path has
 * to, would replace a precise value with a heuristic.
 */
export async function enterWorkshop(
  talentId: string,
  entry: WorkshopEntry,
): Promise<void> {
  await prisma.workshop_Participation.upsert({
    where: {
      talentId_instanceId: { talentId, instanceId: entry.instanceId },
    },
    create: {
      talentId,
      instanceId: entry.instanceId,
      eventId: entry.eventId,
      campusId: entry.campusId,
      budgetMinutes: entry.budgetMinutes,
    },
    update: {},
  });
}

export type WorkshopCallbackPayload = {
  instanceSlug: string;
  talentId: string;
  solvedSteps: number;
  totalSteps: number;
  isComplete: boolean;
};

/**
 * Record what CTFd reports, and recompute the one grant that describes it.
 *
 * `isComplete` is carried by the contract and deliberately not scored on: the
 * scale reads the steps, so a payload claiming completion with a partial count is
 * paid for what it actually reports.
 *
 * An unknown instance or an unknown participation returns silently rather than
 * failing, the shape `minigameService.applyCallback` uses: the sender is an outbox
 * with a backoff, so a refusal it cannot act on would simply be retried forever.
 */
export async function applyWorkshopProgress(
  payload: WorkshopCallbackPayload,
): Promise<void> {
  const instance = await prisma.workshop_Instance.findUnique({
    where: { slug: payload.instanceSlug },
    select: { id: true, slug: true },
  });
  if (!instance) return;

  const key = {
    talentId_instanceId: {
      talentId: payload.talentId,
      instanceId: instance.id,
    },
  };
  const participation = await prisma.workshop_Participation.findUnique({
    where: key,
    select: { budgetMinutes: true, campusId: true },
  });
  if (!participation) return;

  const amount = workshopXp(
    payload.solvedSteps,
    payload.totalSteps,
    participation.budgetMinutes,
  );
  const sourceId = workshopGrantSourceId(instance.slug, payload.talentId);

  await prisma.$transaction(async (tx) => {
    const previous = await tx.xpGrant.findUnique({
      where: { source_sourceId: { source: 'workshop', sourceId } },
      select: { amount: true },
    });
    // What is still owed a celebration. Floored at zero so a subject that loses a
    // step, which lowers the denominator and can lower the amount, never leaves a
    // negative arrears behind.
    const gained = Math.max(0, amount - (previous?.amount ?? 0));

    await grantXp(tx, {
      talentId: payload.talentId,
      source: 'workshop',
      sourceId,
      amount,
      campusId: participation.campusId,
    });

    await tx.workshop_Participation.update({
      where: key,
      data: {
        solvedSteps: payload.solvedSteps,
        totalSteps: payload.totalSteps,
        xpPending: { increment: gained },
      },
    });
  });
}

/** The float the dashboard owes this talent, or null when it owes none. */
export async function getUnseenWorkshopReward(
  talentId: string,
): Promise<{ xp: number } | null> {
  const pending = await prisma.workshop_Participation.aggregate({
    where: { talentId, xpPending: { gt: 0 } },
    _sum: { xpPending: true },
  });
  const xp = pending._sum.xpPending ?? 0;
  return xp > 0 ? { xp } : null;
}

/**
 * Idempotent by its predicate rather than by a guard: a second call matches no
 * row, so leaving mid-animation cannot replay the celebration.
 */
export async function markWorkshopRewardsSeen(talentId: string): Promise<void> {
  await prisma.workshop_Participation.updateMany({
    where: { talentId, xpPending: { gt: 0 } },
    data: { xpPending: 0, xpSeenAt: new Date() },
  });
}
