import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';
import { getBrowserTimezone } from '$lib/server/db/scoped';
import { revokeXp } from '$lib/server/services/xpService';
import { consumeArrivalCelebration } from '$lib/server/talent/arrivalCelebration';
import { env } from '$env/dynamic/private';
import {
  checkTalentEligibility,
  getActivePublication,
  getClosestEventForTalent,
  applyCallback,
  getUnseenMinigameRankReward,
} from '$lib/server/services/minigameService';
import { WELCOME_XP_BONUS } from '$lib/domain/xp';
import { renderNewsPost } from '$lib/domain/newsPost';
import { toPlanningView } from '$lib/domain/talentPlanning';
import { buildPreviewPlanningView } from '$lib/server/talentPlanningPreview';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  try {
    const studentId = locals.talent.id;

    // Calculate boundaries for "Today" in the user's browser timezone
    const tz = getBrowserTimezone(cookies);
    const tzNow = now(tz);
    const startOfDay = tzNow
      .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
      .toDate();
    const endOfDay = tzNow.set({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });
    const filterDateEnd = endOfDay.toDate();

    // "Planning à venir" widget state, collapsed to a single view-model. When
    // an admin impersonating this talent has armed a preview, we substitute the
    // view-model wholesale and skip the queries entirely (there's no real state
    // to recompute once we're faking it), mirroring the dev space's phase
    // override. Otherwise we derive it from the talent's actual participations.
    // The two events we read are scoped to just the fields the widget shows.
    //
    // Always computed, even when the campus runs its schedule outside Jump
    // (planning flag off): this is participation-derived (Participation → Event),
    // never planning rows, so a talent there still has events to surface. The
    // flag only gates the detailed /calendar grid — the widget drops its "Voir
    // le planning" CTA client-side when it's off, keeping the state itself.
    const eventSelect = {
      event: {
        select: {
          eventType: true,
          titre: true,
          date: true,
          startMinutes: true,
        },
      },
    } as const;

    let planning;
    if (locals.planningPreview) {
      planning = buildPreviewPlanningView(locals.planningPreview);
    } else {
      // Event whose date range covers today (ongoing multi-day or single-day today).
      const activeParticipation = await prisma.participation.findFirst({
        where: {
          talentId: studentId,
          event: {
            date: { lte: filterDateEnd },
            OR: [
              { endDate: { gte: startOfDay } },
              { endDate: null, date: { gte: startOfDay } },
            ],
          },
        },
        select: eventSelect,
        orderBy: { event: { date: 'asc' } },
      });

      // The NEXT upcoming participation (if any), only when not in an active event.
      const upcomingParticipation = activeParticipation
        ? null
        : await prisma.participation.findFirst({
            where: {
              talentId: studentId,
              event: { date: { gt: filterDateEnd } },
            },
            select: eventSelect,
            orderBy: { event: { date: 'asc' } },
          });

      planning = toPlanningView(activeParticipation, upcomingParticipation);
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

    // The rank bonus is granted at finish; the play page floats only the base
    // finish reward, so MinigameRewardCelebration shows the podium float on the
    // first page the player lands on afterwards (dashboard or leaderboard). Shared
    // helper so both pages surface it identically.
    const minigameRankReward = await getUnseenMinigameRankReward(studentId);

    // Arrival celebration total. Only resolved on the first dashboard load after
    // onboarding completion (the arrival-celebration cookie, consumed here), so
    // the float shows the real boosted total (base + early-bird) rather than a
    // hardcoded 200. `earlyBirdBonus` lets the toast call out the pioneer bonus.
    let onboardingArrival: { totalXp: number; earlyBirdBonus: number } | null =
      null;
    if (consumeArrivalCelebration(cookies)) {
      const earlyBird = await prisma.xpGrant.findUnique({
        where: {
          source_sourceId: {
            source: 'onboarding_early_bird',
            sourceId: studentId,
          },
        },
        select: { amount: true },
      });
      const earlyBirdBonus = earlyBird?.amount ?? 0;
      onboardingArrival = {
        totalXp: WELCOME_XP_BONUS + earlyBirdBonus,
        earlyBirdBonus,
      };
    }

    // Latest non-expired news post visible to this talent.
    let latestNews: {
      id: string;
      title: string;
      content: string;
      publishedAt: string;
    } | null = null;
    {
      // Resolve the talent's campus ID from the campus name already in locals.
      const talentCampusId = locals.talentCampusName
        ? ((
            await prisma.campus.findFirst({
              where: { name: locals.talentCampusName },
              select: { id: true },
            })
          )?.id ?? null)
        : null;

      const now = new Date();
      const talentEventIds = await prisma.participation.findMany({
        where: { talentId: locals.talent!.id },
        select: { eventId: true },
        distinct: ['eventId'],
      });
      const eventIdSet = new Set(talentEventIds.map((p) => p.eventId));

      const post = await prisma.newsPost.findFirst({
        where: {
          AND: [
            { OR: [{ campusId: talentCampusId }, { campusId: null }] },
            { publishedAt: { lte: now } },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            {
              OR: [
                { eventId: null },
                ...(eventIdSet.size > 0
                  ? [{ eventId: { in: [...eventIdSet] } }]
                  : []),
              ],
            },
          ],
        },
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          title: true,
          content: true,
          publishedAt: true,
          event: {
            select: {
              titre: true,
              campus: { select: { name: true, contactEmail: true } },
            },
          },
        },
      });

      if (post) {
        const campus = post.event?.campus;
        const rendered = renderNewsPost(post.content, {
          prenom: locals.talent!.prenom,
          nom: locals.talent!.nom,
          campusName: campus?.name ?? locals.talentCampusName ?? '',
          campusContactEmail: campus?.contactEmail ?? null,
          stageName: post.event?.titre ?? null,
        });
        latestNews = {
          id: post.id,
          title: post.title,
          content: rendered,
          publishedAt: post.publishedAt.toISOString(),
        };
      }
    }

    return {
      student: locals.talent,
      planning,
      minigame,
      minigameReward,
      minigameRankReward,
      onboardingArrival,
      latestNews,
    };
  } catch (err) {
    console.error('Error fetching camper dashboard data:', err);
    throw error(500, 'Erreur lors du chargement du dashboard');
  }
};

export const actions: Actions = {
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
      // Reset: revoke this attempt's ledger grants before dropping the row, so
      // repeated dev toggles don't inflate the talent's balance. Revoke first —
      // the grants key on the attempt id, which the delete would take away. Both
      // the base finish reward and any rank bonus earned at finish are reverted.
      await prisma.$transaction(async (tx) => {
        await revokeXp(tx, {
          talentId,
          source: 'minigame',
          sourceId: existing.id,
        });
        await revokeXp(tx, {
          talentId,
          source: 'minigame_rank',
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
