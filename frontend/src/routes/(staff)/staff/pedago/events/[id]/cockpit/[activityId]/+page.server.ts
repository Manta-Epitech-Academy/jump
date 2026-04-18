import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { assertEventCampus } from '$lib/server/db/assert';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { requireStaffGroup } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const activity = await db.activity
    .findUniqueOrThrow({
      where: { id: params.activityId },
      include: {
        timeSlot: {
          include: {
            planning: {
              include: {
                event: { include: { theme: true } },
              },
            },
          },
        },
      },
    })
    .catch(() => {
      throw error(404, 'Activité introuvable');
    });

  if (activity.activityType !== 'orga') {
    throw error(400, "Cette activité n'est pas un créneau d'appel/pilotage.");
  }

  const event = activity.timeSlot.planning.event;

  if (event.id !== params.id) {
    throw error(400, "L'activité ne correspond pas à cet événement");
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
  };
};

async function syncEventPresence(
  participationId: string,
  db: ReturnType<typeof scopedPrisma>,
) {
  const participation = await db.participation.findUniqueOrThrow({
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

  await db.participation.update({
    where: { id: participationId },
    data: { isPresent: presentInAny, delay: maxDelay },
  });

  if (presenceChanged) {
    const xpValue = getTotalXp(
      getXpEligibleActivities(participation.activities),
    );

    if (presentInAny) {
      await db.talent.update({
        where: { id: participation.talentId },
        data: { xp: { increment: xpValue }, eventsCount: { increment: 1 } },
      });
    } else {
      const profile = await db.talent.findUniqueOrThrow({
        where: { id: participation.talentId },
        select: { xp: true, eventsCount: true },
      });
      await db.talent.update({
        where: { id: participation.talentId },
        data: {
          xp: Math.max(0, profile.xp - xpValue),
          eventsCount: Math.max(0, profile.eventsCount - 1),
        },
      });
    }
  }
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
      await db.participationActivity.update({
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
      await syncEventPresence(id, db);
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
      await db.participationActivity.update({
        where: {
          participationId_activityId: {
            participationId: id,
            activityId: params.activityId,
          },
        },
        data: { delay, isPresent: true },
      });
      await syncEventPresence(id, db);
      return { success: true };
    } catch (err) {
      console.error('updateDelay failed', err);
      return fail(500, { error: 'Erreur mise à jour retard' });
    }
  },

  updateNote: async ({ request, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    const id = data.get('id') as string;
    const note = data.get('note') as string;
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.participation.update({
        where: { id },
        data: { note, noteAuthorId: locals.staffProfile?.id || null },
      });
      return { success: true };
    } catch {
      return fail(500, { error: 'Erreur sauvegarde note' });
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

  toggleBringPc: async ({ request, locals }) => {
    requireStaffGroup(locals, 'pedaMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },
};
