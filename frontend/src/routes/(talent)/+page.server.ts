import type { Actions, PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { prisma } from '#lib/server/db.ts';
import { revokeXp } from '#lib/server/services/xpService.ts';
import { loadPendingCelebrations } from '#lib/server/talent/celebrations.ts';
import { JUMP_GAMES_URL } from '$app/env/private';
import { getCatalogPreview } from '#lib/server/services/minigameCatalog.ts';
import {
  checkTalentEligibility,
  getActivePublication,
  getClosestEventForTalent,
  applyCallback,
} from '#lib/server/services/minigameService.ts';
import { pendingFeedbackForm } from '#lib/domain/feedback.ts';
import {
  feedbackParticipationWhere,
  resolveEventNudgeForm,
} from '#lib/server/feedbackForms.ts';
import { buildPersonaIconUrl } from '#lib/domain/feedbackForms/schema.ts';
import { loadHomeHero } from '#lib/server/services/talentHomeHero.ts';
import { activitiesToDoCount } from '#lib/domain/workshops.ts';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  try {
    const studentId = locals.talent.id;

    // Minigames are intrinsic but require the games backend to be wired up.
    // No backend configured → no card (can't play). An absent/already-played
    // publication is handled downstream by checkTalentEligibility.
    const minigame = JUMP_GAMES_URL
      ? await checkTalentEligibility(studentId)
      : null;

    // The day's game preview on the training card, drawn by jump-games and read
    // from its catalogue. Started here and awaited at the end, so the catalogue
    // (cached, and bounded when jump-games is slow) runs alongside the rest of
    // the load instead of after it. It never rejects: no catalogue, no preview.
    const trainingPreview: Promise<string | null> = minigame?.publication
      ? getCatalogPreview(minigame.publication.game)
      : Promise.resolve(null);

    // The CTFd activities the talent's own events offer, with whatever CTFd last
    // reported about each, what their campus puts on their home (its note, what
    // it puts forward), and the one thing the blue hero shows from all of it
    // with their own enrolments (`pickHomeHero`), each read on its event's
    // campus clock.
    const { hero, workshops, home } = await loadHomeHero(
      studentId,
      locals.talentCampusId ?? null,
    );
    // How many activities are left to walk, counted on the « Mon parcours »
    // pill: the list itself lives on that page, the home only suggests one.
    const toDoCount = activitiesToDoCount([
      ...workshops.today,
      ...workshops.activities,
    ]);

    // Feedback banner: nudge about the event whose feedback form still awaits
    // this talent's answer.
    let pendingFeedback: Array<{
      eventId: string;
      formId: string;
      personaIconUrl?: string;
    }> = [];
    // A talent can match several events with a form; feedback is owed after the
    // event, so nudge about the most recently started one, not a DB-arbitrary
    // one. Only events carrying a feedback form qualify, through the enrolments
    // the form's own page accepts (`feedbackParticipationWhere`).
    const feedbackParticipation = await prisma.participation.findFirst({
      where: {
        AND: [
          feedbackParticipationWhere(studentId),
          { event: { feedbackFormId: { not: null } } },
        ],
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
      minigame,
      trainingPreview: await trainingPreview,
      hero,
      toDoCount,
      hasActivities:
        workshops.today.length > 0 || workshops.activities.length > 0,
      // What the talent earned and has not seen celebrated, played by the
      // duck's stage. Consumes the arrival's one-shot cookie.
      celebrations: await loadPendingCelebrations(locals.talent, cookies),
      note: home.note,
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
      // repeated dev toggles don't inflate the talent's balance. Revoke first:
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
