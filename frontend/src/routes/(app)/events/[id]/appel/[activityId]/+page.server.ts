import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { getTotalXp } from '$lib/domain/xp';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { assertEventCampus } from '$lib/server/db/assert';

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
    throw error(400, "Cette activité n'est pas de type organisation");
  }

  const event = activity.timeSlot.planning.event;

  if (event.id !== params.id) {
    throw error(400, "L'activité ne correspond pas à cet événement");
  }

  const rawParticipations = await db.participation.findMany({
    where: { eventId: event.id },
    include: {
      studentProfile: true,
      subjects: { include: { subject: true } },
    },
  });

  // Ensure ParticipationActivity records exist for this orga activity
  await db.participationActivity.createMany({
    data: rawParticipations.map((p) => ({
      participationId: p.id,
      activityId: params.activityId,
    })),
    skipDuplicates: true,
  });

  // Fetch activity-level attendance
  const allPAs = await db.participationActivity.findMany({
    where: { activityId: params.activityId },
  });
  const paMap = new Map(allPAs.map((pa) => [pa.participationId, pa]));

  // Override isPresent/delay with activity-level values
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
      const nomA = a.studentProfile.nom.toUpperCase();
      const nomB = b.studentProfile.nom.toUpperCase();
      if (nomA < nomB) return -1;
      if (nomA > nomB) return 1;
      return a.studentProfile.prenom
        .toLowerCase()
        .localeCompare(b.studentProfile.prenom.toLowerCase());
    });

  const progressData = await prisma.stepsProgress.findMany({
    where: { eventId: event.id },
  });

  return {
    event,
    activityId: params.activityId,
    participations,
    progressData,
  };
};

/**
 * Sync event-level Participation.isPresent based on all orga activities.
 * Present at event level = present in at least one orga activity.
 */
async function syncEventPresence(
  participationId: string,
  db: ReturnType<typeof scopedPrisma>,
) {
  const allPAs = await db.participationActivity.findMany({
    where: {
      participationId,
      activity: { activityType: 'orga' },
    },
  });
  const presentInAny = allPAs.some((pa) => pa.isPresent);

  const participation = await db.participation.findUniqueOrThrow({
    where: { id: participationId },
    include: { subjects: { include: { subject: true } } },
  });

  if (participation.isPresent === presentInAny) return;

  const subjects = participation.subjects.map((ps) => ({
    difficulte: ps.subject.difficulte,
  }));
  const xpValue = getTotalXp(subjects);

  await db.participation.update({
    where: { id: participationId },
    data: { isPresent: presentInAny },
  });

  if (presentInAny) {
    await db.studentProfile.update({
      where: { id: participation.studentProfileId },
      data: {
        xp: { increment: xpValue },
        eventsCount: { increment: 1 },
      },
    });
  } else {
    const profile = await db.studentProfile.findUniqueOrThrow({
      where: { id: participation.studentProfileId },
      select: { xp: true, eventsCount: true },
    });
    await db.studentProfile.update({
      where: { id: participation.studentProfileId },
      data: {
        xp: Math.max(0, profile.xp - xpValue),
        eventsCount: Math.max(0, profile.eventsCount - 1),
      },
    });
  }
}

export const actions: Actions = {
  togglePresent: async ({ request, params, locals }) => {
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
      console.error('Error updating presence/XP:', err);
      return fail(500, { error: 'Erreur mise à jour présence' });
    }
  },

  updateDelay: async ({ request, params, locals }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    const delayStr = data.get('delay') as string;
    const delay = parseInt(delayStr, 10);

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
      console.error('Error updating delay:', err);
      return fail(500, { error: 'Erreur mise à jour retard' });
    }
  },

  updateNote: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    const note = data.get('note') as string;
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.participation.update({
        where: { id },
        data: {
          note,
          noteAuthorId: locals.staffProfile?.id || null,
        },
      });
      return { success: true };
    } catch {
      return fail(500, { error: 'Erreur sauvegarde note' });
    }
  },

  unlockStep: async ({ request, locals }) => {
    const data = await request.formData();
    const progressId = data.get('progressId') as string;

    try {
      const progress = await prisma.stepsProgress.findUniqueOrThrow({
        where: { id: progressId },
      });
      await assertEventCampus(progress.eventId, getCampusId(locals));
      const subject = await prisma.subject.findUniqueOrThrow({
        where: { id: progress.subjectId },
      });
      const content = subject.contentStructure as { steps?: { id: string }[] };
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
      console.error('Remote unlock error:', err);
      return fail(500, { error: 'Erreur lors du déblocage distant' });
    }
  },

  toggleBringPc: async ({ request, locals }) => {
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },

  dismissAlert: async ({ request, locals }) => {
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
};
