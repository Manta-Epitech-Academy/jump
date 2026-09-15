/**
 * The CTFd activities: which ones a talent may enter, and what CTFd says they
 * have done.
 *
 * Two directions, and they never cross. Jump decides who may enter and mints a
 * ticket for it (`workshops/ticket.ts`); CTFd reports progress back over a signed
 * callback, and this file turns that report into one XP grant. Nothing here polls
 * CTFd: a talent's progress arrives, it is never asked for.
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { workshopXp } from '$lib/domain/xp';
import { workshopGrantSourceId } from '$lib/domain/workshops';
import { grantXp } from './xpService';

export type WorkshopMission = {
  slug: string;
  /** What the talent reads: the event's own wording when it set one. */
  label: string;
  solvedSteps: number;
  totalSteps: number;
  /** Null until the talent has entered once. */
  startedAt: Date | null;
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
 * Every activity the talent's enrolments offer, one row per instance.
 *
 * Ordered by the offering event's date ascending, so the FIRST enrolment that
 * offers an activity is the one that authorises it. Two talents enrolled in two
 * events carrying the same subject therefore get one mission and one snapshot,
 * which is what the `(talent, instance)` key already says: the activity is worth
 * its XP once, for life.
 *
 * Deliberately not narrowed by date. A Coding Club is designed never to finish
 * and the students carry on at home in the evening and the days after, so an
 * activity whose event is over is still an activity to walk.
 */
async function offeredWorkshops(
  talentId: string,
  slug?: string,
): Promise<
  {
    eventId: string;
    campusId: string;
    position: number;
    durationMinutes: number;
    labelOverride: string | null;
    instance: {
      id: string;
      slug: string;
      label: string;
      baseUrl: string;
    };
  }[]
> {
  const instanceWhere: Prisma.Workshop_InstanceWhereInput = {
    enabled: true,
    ...(slug ? { slug } : {}),
  };

  const enrolments = await prisma.participation.findMany({
    where: {
      talentId,
      event: { workshops: { some: { instance: instanceWhere } } },
    },
    orderBy: [{ event: { date: 'asc' } }, { eventId: 'asc' }],
    select: {
      eventId: true,
      campusId: true,
      event: {
        select: {
          workshops: {
            where: { instance: instanceWhere },
            orderBy: [{ position: 'asc' }, { instanceId: 'asc' }],
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
  });

  const seen = new Set<string>();
  const offered = [];
  for (const enrolment of enrolments) {
    for (const link of enrolment.event.workshops) {
      if (seen.has(link.instance.id)) continue;
      seen.add(link.instance.id);
      offered.push({
        eventId: enrolment.eventId,
        campusId: enrolment.campusId,
        position: link.position,
        durationMinutes: link.durationMinutes,
        labelOverride: link.labelOverride,
        instance: link.instance,
      });
    }
  }
  return offered;
}

/** What the dashboard's "Mission du jour" card renders, progress included. */
export async function listWorkshopMissions(
  talentId: string,
): Promise<WorkshopMission[]> {
  const offered = await offeredWorkshops(talentId);
  if (offered.length === 0) return [];

  const entries = await prisma.workshop_Participation.findMany({
    where: {
      talentId,
      instanceId: { in: offered.map((o) => o.instance.id) },
    },
    select: {
      instanceId: true,
      solvedSteps: true,
      totalSteps: true,
      firstEnteredAt: true,
    },
  });
  const byInstance = new Map(entries.map((e) => [e.instanceId, e]));

  return offered
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const entry = byInstance.get(o.instance.id);
      return {
        slug: o.instance.slug,
        label: o.labelOverride ?? o.instance.label,
        solvedSteps: entry?.solvedSteps ?? 0,
        totalSteps: entry?.totalSteps ?? 0,
        startedAt: entry?.firstEnteredAt ?? null,
      };
    });
}

/**
 * Whether this talent may enter this activity, and on whose enrolment.
 *
 * `null` is the refusal: no such instance, it is switched off, or no enrolment of
 * this talent offers it.
 */
export async function resolveWorkshopEntry(
  talentId: string,
  slug: string,
): Promise<WorkshopEntry | null> {
  const offered = await offeredWorkshops(talentId, slug);
  const match = offered[0];
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
