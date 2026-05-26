import type { Actions, PageServerLoad } from './$types';
import type { ActivityType } from '@prisma/client';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { revokeXp } from '$lib/server/services/xpService';
import { env } from '$env/dynamic/private';
import { getStartOfDay } from '$lib/utils';
import {
  checkTalentEligibility,
  getActivePublication,
  getClosestEventForTalent,
  applyCallback,
} from '$lib/server/services/minigameService';
import { renderWelcomeMessage } from '$lib/domain/welcomeMessage';
import { stageWindowEnd } from '$lib/domain/event';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  try {
    const studentId = locals.talent.id;

    // Calculate boundaries for "Today" in the user's browser timezone
    const tz = getBrowserTimezone(cookies);
    const filterDateStart = getStartOfDay(tz);
    const tzNow = now(tz);
    const endOfDay = tzNow.set({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
    const filterDateEnd = endOfDay.toDate();
    const filterDateStartDate = new Date(filterDateStart);

    // Fetch participations for today with full planning chain.
    // Match single-day events happening today AND multi-day events whose span
    // covers today (event.date <= today <= event.endDate).
    const participations = await prisma.participation.findMany({
      where: {
        talentId: studentId,
        event: {
          date: { lte: filterDateEnd },
          OR: [
            { endDate: { gte: filterDateStartDate } },
            { endDate: null, date: { gte: filterDateStartDate } },
          ],
        },
      },
      include: {
        event: {
          include: {
            planning: {
              include: {
                timeSlots: {
                  where: {
                    activity: { activityType: { not: 'orga' } },
                    startTime: {
                      gte: filterDateStartDate,
                      lte: filterDateEnd,
                    },
                  },
                  include: { activity: true },
                  orderBy: { startTime: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Fetch the NEXT upcoming participation (if any)
    const upcomingParticipation = await prisma.participation.findFirst({
      where: {
        talentId: studentId,
        event: { date: { gt: filterDateEnd } },
      },
      include: {
        event: true,
      },
      orderBy: { event: { date: 'asc' } },
    });

    // Count past missions (present activities excluding orga, before today).
    // Only the tally feeds the dashboard now — the history route owns the full
    // list — so count in SQL rather than fetching every participation to size it.
    const totalPastMissions = await prisma.participationActivity.count({
      where: {
        participation: {
          talentId: studentId,
          isPresent: true,
          event: { date: { lt: filterDateStartDate } },
        },
        activity: { activityType: { not: 'orga' } },
      },
    });

    // If there are multiple event today, grab the first one
    const todayParticipation =
      participations.length > 0 ? participations[0] : null;

    // Fetch completion status for today's activities
    const completedActivityIds: Set<string> = new Set();
    if (todayParticipation?.event) {
      const progressRecords = await prisma.stepsProgress.findMany({
        where: {
          talentId: studentId,
          eventId: todayParticipation.event.id,
          activityId: { not: null },
          status: 'completed',
        },
        select: { activityId: true },
      });
      for (const p of progressRecords) {
        if (p.activityId) completedActivityIds.add(p.activityId);
      }
    }

    const isMultiDay = (
      event:
        | {
            date: Date;
            endDate: Date | null;
          }
        | null
        | undefined,
    ): boolean => {
      if (!event?.endDate) return false;
      const a = new Date(event.date);
      const b = new Date(event.endDate);
      return (
        a.getFullYear() !== b.getFullYear() ||
        a.getMonth() !== b.getMonth() ||
        a.getDate() !== b.getDate()
      );
    };
    const todayIsMultiDay = isMultiDay(todayParticipation?.event);
    const upcomingIsMultiDay = isMultiDay(upcomingParticipation?.event);

    // For an in-progress multi-day event, preview tomorrow's activities in the
    // "Planning à venir" rail — but only while tomorrow still falls within the
    // event span. Tomorrow's slots aren't in the today-scoped query above, so
    // fetch them on their own.
    let tomorrowPreview: {
      date: number;
      slots: {
        startTime: Date;
        endTime: Date;
        activity: {
          id: string;
          nom: string;
          description: string | null;
          activityType: ActivityType;
          difficulte: string | null;
          isDynamic: boolean;
        };
      }[];
    } | null = null;
    if (todayParticipation?.event && todayIsMultiDay) {
      const tomorrow = tzNow.add({ days: 1 });
      const tomorrowStartDate = tomorrow
        .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
        .toDate();
      const tomorrowEndDate = tomorrow
        .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
        .toDate();
      const eventEnd = todayParticipation.event.endDate;
      if (eventEnd && new Date(eventEnd) >= tomorrowStartDate) {
        const slots = await prisma.timeSlot.findMany({
          where: {
            planning: { eventId: todayParticipation.event.id },
            activity: { activityType: { not: 'orga' } },
            startTime: { gte: tomorrowStartDate, lte: tomorrowEndDate },
          },
          include: { activity: true },
          orderBy: { startTime: 'asc' },
        });
        // Carry the full slot + activity so the dashboard can open the same
        // preview dialog used for not-yet-started activities today.
        const previewSlots = slots.flatMap((s) =>
          s.activity
            ? [
                {
                  startTime: s.startTime,
                  endTime: s.endTime,
                  activity: {
                    id: s.activity.id,
                    nom: s.activity.nom,
                    description: s.activity.description,
                    activityType: s.activity.activityType,
                    difficulte: s.activity.difficulte,
                    isDynamic: s.activity.isDynamic,
                  },
                },
              ]
            : [],
        );
        if (previewSlots.length > 0) {
          tomorrowPreview = {
            date: tomorrowStartDate.getTime(),
            slots: previewSlots,
          };
        }
      }
    }

    // Minigames are intrinsic but require the games backend to be wired up.
    // No backend configured → no card (can't play). An absent/already-played
    // publication is handled downstream by checkTalentEligibility.
    const minigame = env.JUMP_GAMES_URL
      ? await checkTalentEligibility(studentId)
      : null;

    // A finalized attempt that earned XP the talent hasn't seen celebrated yet:
    // drives the one-shot "+XP" float, the same as the onboarding arrival. The
    // float is acknowledged client-side (xpSeenAt) so it fires exactly once,
    // wherever the talent first lands back on the dashboard after playing.
    const lastAttempt =
      minigame && !minigame.ok ? minigame.lastAttempt : undefined;
    const minigameReward =
      lastAttempt?.xpAwarded != null && lastAttempt.xpSeenAt == null
        ? { xp: lastAttempt.xpAwarded }
        : null;

    // The stage welcome message is the seed item of the dashboard's Actualités
    // feed. It shows for the whole stage window — the message permanently lives
    // here, this is its only home (the standalone /welcome page was removed).
    let welcome: { content: string } | null = null;
    {
      const stageParticipation = await prisma.participation.findFirst({
        where: {
          talentId: studentId,
          event: { eventType: 'stage_seconde' },
        },
        orderBy: { event: { date: 'desc' } },
        select: {
          event: {
            select: {
              id: true,
              titre: true,
              endDate: true,
              date: true,
              campus: { select: { name: true, contactEmail: true } },
            },
          },
        },
      });
      if (stageParticipation) {
        const { event } = stageParticipation;
        const stageEnd = stageWindowEnd(event.date, event.endDate);
        if (stageEnd >= new Date()) {
          const welcomePage = await prisma.cmsPage.findUnique({
            where: { slug_eventId: { slug: 'welcome', eventId: event.id } },
            select: { content: true },
          });
          if (welcomePage?.content) {
            welcome = {
              content: renderWelcomeMessage(welcomePage.content, {
                prenom: locals.talent.prenom,
                nom: locals.talent.nom,
                campusName: event.campus.name,
                campusContactEmail: event.campus.contactEmail,
                stageName: event.titre,
              }),
            };
          }
        }
      }
    }

    return {
      student: locals.talent,
      participation: todayParticipation,
      completedActivityIds: [...completedActivityIds],
      upcomingParticipation,
      totalPastMissions,
      todayIsMultiDay,
      upcomingIsMultiDay,
      tomorrowPreview,
      serverNow: Date.now(),
      minigame,
      minigameReward,
      welcome,
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};

export const actions: Actions = {
  /**
   * Mark the minigame XP celebration as seen, so the "+XP" float fires exactly
   * once. Triggered client-side right after the float plays. Scoped to the
   * talent's own unseen-but-awarded attempts (today's, in practice) and
   * idempotent, so a double-fire or a stale tab is harmless.
   */
  acknowledgeMinigameReward: async ({ locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    await prisma.minigameAttempt.updateMany({
      where: {
        talentId: locals.talent.id,
        xpAwarded: { not: null },
        xpSeenAt: null,
      },
      data: { xpSeenAt: new Date() },
    });

    return { acknowledged: true };
  },

  /**
   * Dev-only shortcut to toggle today's minigame attempt without playing it or
   * editing the DB by hand: finalizes the attempt (→ "déjà joué") if not done,
   * or deletes it (→ rejouable) if done. Compiled out of production builds via
   * the `dev` guard.
   */
  devToggleMinigame: async ({ locals }) => {
    if (!dev) throw error(404, 'Indisponible.');
    if (!locals.talent) throw error(401, 'Non autorisé');

    const publication = await getActivePublication();
    if (!publication) return { toggled: false };

    const talentId = locals.talent.id;
    const where = {
      talentId_publicationId: { talentId, publicationId: publication.id },
    };
    const existing = await prisma.minigameAttempt.findUnique({ where });

    if (existing && existing.status !== 'pending') {
      // Reset: revoke this attempt's ledger grant before dropping the row, so
      // repeated dev toggles don't inflate the talent's balance. Revoke first —
      // the grant keys on the attempt id, which the delete would take away.
      await prisma.$transaction(async (tx) => {
        await revokeXp(tx, {
          talentId,
          source: 'minigame',
          sourceId: existing.id,
        });
        await tx.minigameAttempt.delete({ where: { id: existing.id } });
      });
      return { toggled: true, played: false };
    }

    // Play: stand up a pending attempt, then drive the *real* award path so the
    // dev shortcut and a genuine game-end callback grant XP identically.
    const closest = await getClosestEventForTalent(talentId);
    const score = Math.floor(Math.random() * 1000);
    const chrono = Math.floor(Math.random() * 60_000) + 5_000;
    await prisma.minigameAttempt.upsert({
      where,
      update: {
        status: 'pending',
        eventId: closest?.eventId ?? null,
        campusId: closest?.campusId ?? null,
      },
      create: {
        talentId,
        publicationId: publication.id,
        jti: `dev-${crypto.randomUUID()}`,
        status: 'pending',
        eventId: closest?.eventId ?? null,
        campusId: closest?.campusId ?? null,
      },
    });
    await applyCallback({
      playerId: talentId,
      game: publication.game,
      level: publication.level,
      score,
      chrono,
      valid: true,
    });
    return { toggled: true, played: true };
  },
};
