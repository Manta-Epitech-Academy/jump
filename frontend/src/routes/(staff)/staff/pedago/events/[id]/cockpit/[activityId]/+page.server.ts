import type { PageServerLoad, Actions } from './$types';
import type { Prisma } from '@prisma/client';
import { error, fail } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { prisma } from '$lib/server/db';
import {
  grantXp,
  revokeXp,
  recomputeEventsCount,
} from '$lib/server/services/xpService';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { assertEventCampus } from '$lib/server/db/assert';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { getAdjacentSlots, getEventOrgaSlots } from '$lib/domain/presences';
import { isVerdict, isContextTag } from '$lib/domain/verdict';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const event = await db.event
    .findUniqueOrThrow({
      where: { id: params.id },
      include: { theme: true },
    })
    .catch(() => {
      throw error(404, 'Événement introuvable');
    });

  const orgaSlots = await getEventOrgaSlots(event.id, db);
  const { prev, next, current } = getAdjacentSlots(
    orgaSlots,
    params.activityId,
  );

  if (!current) {
    throw error(404, "Créneau d'appel introuvable.");
  }

  const rawParticipations = await db.participation.findMany({
    where: { eventId: event.id },
    include: {
      talent: true,
    },
  });

  await db.participationActivity.createMany({
    data: rawParticipations.map((p) => ({
      participationId: p.id,
      activityId: params.activityId,
    })),
    skipDuplicates: true,
  });

  const allPAs = await db.participationActivity.findMany({
    where: { activityId: params.activityId },
  });
  const paMap = new Map(allPAs.map((pa) => [pa.participationId, pa]));

  const participations = rawParticipations
    .map((p) => {
      const pa = paMap.get(p.id);
      return {
        ...p,
        isPresent: pa?.isPresent ?? false,
        delay: pa?.delay ?? 0,
        verdict: pa?.verdict ?? null,
        contextTag: pa?.contextTag ?? null,
      };
    })
    .sort((a, b) => {
      const nomA = a.talent.nom.toUpperCase();
      const nomB = b.talent.nom.toUpperCase();
      if (nomA < nomB) return -1;
      if (nomA > nomB) return 1;
      return a.talent.prenom
        .toLowerCase()
        .localeCompare(b.talent.prenom.toLowerCase());
    });

  const progressData = await prisma.stepsProgress.findMany({
    where: { eventId: event.id },
    include: { activity: true },
  });

  // Format dates explicitly as strings to prevent serialization mismatch in the timer
  const formattedProgressData = progressData.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return {
    event,
    activityId: params.activityId,
    participations,
    progressData: formattedProgressData,
    currentSlot: current,
    prevSlot: prev,
    nextSlot: next,
    timezone: getCampusTimezone(locals),
  };
};

/**
 * Recomputes a participation's presence/delay from its orga activities and syncs
 * the XP ledger + cached projections to match. Runs entirely on the caller's
 * transaction client, so the presence row and the ledger commit atomically —
 * there is no window where `isPresent` is flipped without its matching grant.
 * Campus authorization is the caller's responsibility (a scoped read in front of
 * the transaction).
 */
async function syncEventPresence(
  tx: Prisma.TransactionClient,
  participationId: string,
) {
  const participation = await tx.participation.findUniqueOrThrow({
    where: { id: participationId },
    include: { activities: { include: { activity: true } } },
  });

  const orgaPAs = participation.activities.filter(
    (pa) => pa.activity.activityType === 'orga',
  );
  const presentInAny = orgaPAs.some((pa) => pa.isPresent);
  const maxDelay = orgaPAs.reduce(
    (max, pa) => (pa.isPresent && pa.delay > max ? pa.delay : max),
    0,
  );

  const presenceChanged = participation.isPresent !== presentInAny;
  const delayChanged = (participation.delay ?? 0) !== maxDelay;
  if (!presenceChanged && !delayChanged) return;

  await tx.participation.update({
    where: { id: participationId },
    data: { isPresent: presentInAny, delay: maxDelay },
  });

  if (!presenceChanged) return;

  const xpValue = getTotalXp(getXpEligibleActivities(participation.activities));
  if (presentInAny) {
    await grantXp(tx, {
      talentId: participation.talentId,
      source: 'activity_presence',
      sourceId: participation.id,
      amount: xpValue,
      campusId: participation.campusId,
    });
  } else {
    await revokeXp(tx, {
      talentId: participation.talentId,
      source: 'activity_presence',
      sourceId: participation.id,
    });
  }
  await recomputeEventsCount(tx, participation.talentId);
}

export const actions: Actions = {
  togglePresent: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const id = data.get('id') as string;
    const currentState = data.get('state') === 'true';
    const db = scopedPrisma(getCampusId(locals));

    try {
      const isNowPresent = !currentState;
      // Authorize the participation's campus once via the scoped client (throws
      // 403 cross-campus), then run every write — the activity toggle, the
      // recomputed participation presence, and the XP ledger — in one
      // transaction so a mid-flight failure can't leave presence flipped
      // without its matching grant.
      await db.participation.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.participationActivity.update({
          where: {
            participationId_activityId: {
              participationId: id,
              activityId: params.activityId,
            },
          },
          data: {
            isPresent: isNowPresent,
            ...(isNowPresent ? {} : { delay: 0 }),
          },
        });
        await syncEventPresence(tx, id);
      });
      return { success: true };
    } catch (err) {
      console.error('togglePresent failed', err);
      return fail(500, { error: 'Erreur mise à jour présence' });
    }
  },

  updateDelay: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const id = data.get('id') as string;
    const delay = parseInt(data.get('delay') as string, 10);

    if (isNaN(delay)) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.participation.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.participationActivity.update({
          where: {
            participationId_activityId: {
              participationId: id,
              activityId: params.activityId,
            },
          },
          data: { delay, isPresent: true },
        });
        await syncEventPresence(tx, id);
      });
      return { success: true };
    } catch (err) {
      console.error('updateDelay failed', err);
      return fail(500, { error: 'Erreur mise à jour retard' });
    }
  },

  updateVerdict: async ({ request, params, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const id = data.get('id') as string;
    const rawVerdict = data.get('verdict');
    const rawContextTag = data.get('contextTag');

    const verdict =
      rawVerdict === '' || rawVerdict === null
        ? null
        : isVerdict(rawVerdict)
          ? rawVerdict
          : undefined;
    const contextTag =
      rawContextTag === '' || rawContextTag === null
        ? null
        : isContextTag(rawContextTag)
          ? rawContextTag
          : undefined;

    if (verdict === undefined || contextTag === undefined) {
      return fail(400, { error: 'Verdict ou contexte invalide' });
    }

    const db = scopedPrisma(getCampusId(locals));
    const where = {
      participationId_activityId: {
        participationId: id,
        activityId: params.activityId,
      },
    };

    try {
      const current = await db.participationActivity.findUniqueOrThrow({
        where,
        select: { verdict: true },
      });

      // Attribution follows the verdict, not the contextTag — toggling a tag
      // alone must not reassign authorship of the verdict itself.
      const verdictChanged = current.verdict !== verdict;
      const verdictAttribution = verdictChanged
        ? verdict !== null
          ? {
              verdictAuthorId: locals.staffProfile?.id ?? null,
              verdictAt: new Date(),
            }
          : { verdictAuthorId: null, verdictAt: null }
        : {};

      await db.participationActivity.update({
        where,
        data: {
          verdict,
          contextTag,
          ...verdictAttribution,
        },
      });
      return { success: true };
    } catch {
      return fail(500, { error: 'Erreur sauvegarde verdict' });
    }
  },

  unlockStep: async ({ request, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const progressId = data.get('progressId') as string;

    try {
      const progress = await prisma.stepsProgress.findUniqueOrThrow({
        where: { id: progressId },
      });
      await assertEventCampus(progress.eventId, getCampusId(locals));
      if (!progress.activityId) return fail(400);
      const activity = await prisma.activity.findUniqueOrThrow({
        where: { id: progress.activityId },
      });
      const content = activity.contentStructure as { steps?: { id: string }[] };
      const steps = content?.steps || [];

      const currentIndex = steps.findIndex(
        (s) => s.id === progress.currentStepId,
      );
      if (currentIndex === -1) return fail(400);

      const isLastStep = currentIndex === steps.length - 1;
      const nextStepId = !isLastStep ? steps[currentIndex + 1].id : 'COMPLETED';

      await prisma.stepsProgress.update({
        where: { id: progressId },
        data: {
          currentStepId:
            nextStepId === 'COMPLETED' ? progress.currentStepId : nextStepId,
          unlockedStepId: nextStepId,
          status: nextStepId === 'COMPLETED' ? 'completed' : 'active',
          lastUnlockSource: 'staff',
        },
      });
      return { success: true };
    } catch (err) {
      console.error('unlockStep failed', err);
      return fail(500, { error: 'Erreur lors du déblocage distant' });
    }
  },

  dismissAlert: async ({ request, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const progressId = data.get('progressId') as string;
    try {
      const progress = await prisma.stepsProgress.findUniqueOrThrow({
        where: { id: progressId },
        select: { eventId: true },
      });
      await assertEventCampus(progress.eventId, getCampusId(locals));
      await prisma.stepsProgress.update({
        where: { id: progressId },
        data: { status: 'active' },
      });
      return { success: true };
    } catch {
      return fail(500, { error: "Erreur lors de l'annulation de l'alerte" });
    }
  },

  toggleBringPc: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals), params.id);
  },
};
