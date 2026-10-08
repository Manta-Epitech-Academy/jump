/**
 * The CTFd activities: which ones a talent may enter, and what CTFd says they
 * have done.
 *
 * Two directions, and they never cross. Jump decides who may enter and mints a
 * ticket for it (`workshops/ticket.ts`); CTFd reports progress back over a signed
 * callback, and this file turns that report into one XP grant. Nothing here polls
 * CTFd: a talent's progress arrives, it is never asked for. How an activity is
 * presented (its tagline and pictures) is not CTFd's either: it is authored over
 * the API (`write_workshop`) and only read here.
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
  type TalentWorkshops,
  type WorkshopActivity,
  type WorkshopCoverKind,
} from '$lib/domain/workshops';
import {
  getEventStatus,
  getLifecycleBounds,
  type LifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { grantXp } from './xpService';

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
            campus: { select: { timezone: true } },
            workshops: {
              where: { instance: instanceWhere },
              select: {
                position: true,
                durationMinutes: true,
                labelOverride: true,
                instance: {
                  select: {
                    id: true,
                    slug: true,
                    label: true,
                    tagline: true,
                    baseUrl: true,
                  },
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
  if (offered.length === 0) return { today: [], activities: [] };

  const instanceIds = offered.map((o) => o.instanceId);
  const [entries, images] = await Promise.all([
    prisma.workshop_Participation.findMany({
      where: { talentId, instanceId: { in: instanceIds } },
      select: {
        instanceId: true,
        solvedSteps: true,
        totalSteps: true,
        firstEnteredAt: true,
      },
    }),
    prisma.workshop_CoverImage.findMany({
      where: { instanceId: { in: instanceIds } },
      select: {
        instanceId: true,
        kind: true,
        key: true,
        stillKey: true,
        width: true,
        height: true,
      },
    }),
  ]);
  const entryByInstance = new Map(entries.map((e) => [e.instanceId, e]));

  const toActivity = (o: (typeof offered)[number]): WorkshopActivity => {
    const entry = entryByInstance.get(o.instanceId);
    const image = (kind: WorkshopCoverKind) => {
      const found = images.find(
        (i) => i.instanceId === o.instanceId && i.kind === kind,
      );
      return found
        ? {
            url: workshopCoverUrl(found.key),
            width: found.width,
            height: found.height,
            stillUrl: found.stillKey ? workshopCoverUrl(found.stillKey) : null,
          }
        : null;
    };
    return {
      slug: o.instance.slug,
      label: o.labelOverride ?? o.instance.label,
      solvedSteps: entry?.solvedSteps ?? 0,
      totalSteps: entry?.totalSteps ?? 0,
      startedAt: entry?.firstEnteredAt ?? null,
      cover: {
        tagline: o.instance.tagline,
        media: image('media'),
        poster: image('poster'),
        mascot: image('mascot'),
      },
    };
  };

  return {
    today: offered.filter((o) => o.today).map(toActivity),
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

  // No celebration state is written here: what the dashboard owes is derived
  // from this grant (see `getUnseenWorkshopReward`), which is what makes a
  // replayed or concurrent callback harmless rather than counted twice.
  await prisma.$transaction(async (tx) => {
    await grantXp(tx, {
      talentId: payload.talentId,
      source: 'workshop',
      sourceId: workshopGrantSourceId(instance.slug, payload.talentId),
      amount,
      campusId: participation.campusId,
    });

    await tx.workshop_Participation.update({
      where: key,
      data: {
        solvedSteps: payload.solvedSteps,
        totalSteps: payload.totalSteps,
      },
    });
  });
}

/**
 * The float the dashboard owes this talent, or null when it owes none.
 *
 * `xp` is what it announces; `upTo` is what it acknowledges once shown, one
 * grant amount per activity, so XP arriving while the animation plays are not
 * acknowledged with it.
 */
export type WorkshopReward = {
  xp: number;
  upTo: { instanceId: string; amount: number }[];
};

/**
 * Each activity owes its grant minus the amount already celebrated, read off
 * the same ledger `Talent.xp` sums, so the toast can never announce more than
 * the profile gained. A grant that fell below what was shown owes nothing until
 * it climbs past it again.
 */
export async function getUnseenWorkshopReward(
  talentId: string,
): Promise<WorkshopReward | null> {
  const [participations, grants] = await Promise.all([
    prisma.workshop_Participation.findMany({
      where: { talentId },
      select: {
        instanceId: true,
        xpCelebrated: true,
        instance: { select: { slug: true } },
      },
    }),
    prisma.xpGrant.findMany({
      where: { talentId, source: 'workshop' },
      select: { sourceId: true, amount: true },
    }),
  ]);
  const earnedBySourceId = new Map(
    grants.map((grant) => [grant.sourceId, grant.amount]),
  );

  const upTo: WorkshopReward['upTo'] = [];
  let xp = 0;
  for (const participation of participations) {
    const earned =
      earnedBySourceId.get(
        workshopGrantSourceId(participation.instance.slug, talentId),
      ) ?? 0;
    if (earned <= participation.xpCelebrated) continue;
    xp += earned - participation.xpCelebrated;
    upTo.push({ instanceId: participation.instanceId, amount: earned });
  }
  return xp > 0 ? { xp, upTo } : null;
}

/**
 * Record what the dashboard showed, and only ever upwards.
 *
 * The amounts come from the client, and are not clamped to the grant on
 * purpose: a grant that fell after the page loaded must not pull the mark back
 * down, or the climb back would be celebrated a second time. An inflated amount
 * can only silence this talent's own celebration. Idempotent by its predicate,
 * so a second call, or a stale tab acknowledging less, changes nothing.
 */
export async function markWorkshopRewardsSeen(
  talentId: string,
  upTo: WorkshopReward['upTo'],
): Promise<void> {
  await prisma.$transaction(
    upTo.map(({ instanceId, amount }) =>
      prisma.workshop_Participation.updateMany({
        where: { talentId, instanceId, xpCelebrated: { lt: amount } },
        data: { xpCelebrated: amount },
      }),
    ),
  );
}
