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
import { renderWelcomeMessage } from '$lib/domain/welcomeMessage';
import { eventWindowEnd, eventDisplayName } from '$lib/domain/event';
import { pendingFeedbackForm } from '$lib/domain/feedback';
import { resolveEventNudgeForm } from '$lib/server/feedbackForms';
import { buildPersonaIconUrl } from '$lib/domain/feedbackForms/schema';
import { toPlanningView } from '$lib/domain/talentPlanning';
import { buildPreviewPlanningView } from '$lib/server/talentPlanningPreview';
import { listAttendedEvents } from '$lib/server/talent/attendedEvents';

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
          titre: true,
          publicName: true,
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

    // The staff-authored CMS welcome message seeds the dashboard's Actualités
    // feed and shows while the event's window is open; this card is its only
    // home. Distinct from the fixed pre-onboarding splash at /welcome, which owns
    // its own copy. Content-existence is the gate: any event carrying a `welcome`
    // CMS page shows the card - no event type involved.
    let welcome: { content: string } | null = null;
    {
      // Prefer the earliest-starting event whose window is still open AND that
      // has a welcome page (an ongoing event outranks a not-yet-started one). A
      // single-day event (no endDate) is "open" on its own day.
      const now = new Date();
      const participation = await prisma.participation.findFirst({
        where: {
          talentId: studentId,
          event: {
            cmsPages: { some: { slug: 'welcome' } },
            OR: [
              { endDate: { gte: now } },
              { endDate: null, date: { gte: startOfDay } },
            ],
          },
        },
        orderBy: { event: { date: 'asc' } },
        select: {
          event: {
            select: {
              titre: true,
              publicName: true,
              campus: { select: { name: true, contactEmail: true } },
              cmsPages: {
                where: { slug: 'welcome' },
                select: { content: true },
              },
            },
          },
        },
      });
      const content = participation?.event.cmsPages[0]?.content;
      if (participation && content) {
        const { event } = participation;
        welcome = {
          content: renderWelcomeMessage(content, {
            prenom: locals.talent.prenom,
            nom: locals.talent.nom,
            campusName: event.campus.name,
            campusContactEmail: event.campus.contactEmail,
            stageName: eventDisplayName({
              publicName: event.publicName,
              titre: event.titre,
            }),
          }),
        };
      }
    }

    // Past events the talent attended (widget: 5 most recent).
    const pastEvents = await listAttendedEvents(studentId, {
      timeZone: tz,
      take: 5,
    });

    // Feedback banner: nudge about the event whose feedback form still awaits
    // this talent's answer.
    let pendingFeedback: Array<{
      eventId: string;
      formId: string;
      personaIconUrl?: string;
    }> = [];
    // A talent can match several events with a form; feedback is owed after the
    // event, so nudge about the most recently started one, not a DB-arbitrary
    // one. Only events carrying a feedback form qualify.
    const feedbackParticipation = await prisma.participation.findFirst({
      where: {
        talentId: studentId,
        event: { feedbackFormId: { not: null } },
      },
      orderBy: { event: { date: 'desc' } },
      include: {
        event: {
          select: { date: true, feedbackFormId: true },
        },
      },
    });
    if (feedbackParticipation) {
      // The nudge points at THIS event's form, so a talent is only ever reminded
      // about the form their event actually uses. The resolver yields it only
      // when it's a live nudge (published, answerable, nudge on).
      const form = await resolveEventNudgeForm({
        feedbackFormId: feedbackParticipation.event.feedbackFormId,
      });
      if (form) {
        const existingSubs = await prisma.feedback_Submission.findMany({
          where: {
            talentId: studentId,
            eventId: feedbackParticipation.eventId,
          },
          select: { formId: true },
        });
        const pending = pendingFeedbackForm(
          feedbackParticipation.event.date,
          new Date(),
          [{ id: form.id, slug: form.slug }],
          existingSubs.map((s) => s.formId),
        );
        if (pending) {
          pendingFeedback = [
            {
              ...pending,
              eventId: feedbackParticipation.eventId,
              personaIconUrl: buildPersonaIconUrl(form.id, form.personaIconKey),
            },
          ];
        }
      }
    }

    return {
      student: locals.talent,
      planning,
      minigame,
      minigameReward,
      minigameRankReward,
      onboardingArrival,
      welcome,
      pastEvents,
      timeZone: tz,
      pendingFeedback,
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
