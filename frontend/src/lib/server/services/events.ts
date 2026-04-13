import { error } from '@sveltejs/kit';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { generatePin } from '$lib/utils';
import {
  suggestBestSubject,
  preloadCompletedSubjects,
} from '$lib/domain/recommender';
import { prisma } from '$lib/server/db';

export const EventService = {
  /**
   * Deletes an event and automatically rolls back XP for all present students.
   * Verifies the event belongs to the given campus before proceeding.
   */
  async deleteEvent(eventId: string, campusId: string) {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { campusId: true },
    });
    if (event.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    await prisma.$transaction(async (tx) => {
      const participations = await tx.participation.findMany({
        where: { eventId, isPresent: true },
        include: {
          activities: { include: { activity: true } },
        },
      });

      for (const p of participations) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));

        const profile = await tx.studentProfile.findUniqueOrThrow({
          where: { id: p.studentProfileId },
          select: { xp: true, eventsCount: true },
        });
        await tx.studentProfile.update({
          where: { id: p.studentProfileId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      // All related records (participations, subjects, mantas, progress, portfolio)
      // are cascade-deleted by PostgreSQL foreign keys.
      await tx.event.delete({ where: { id: eventId } });
    });
  },

  /**
   * Duplicates an event and its participants (resetting status).
   */
  async duplicateEvent(
    originalId: string,
    newData: { titre: string; date: string },
    campusId: string,
  ) {
    const original = await prisma.event.findUniqueOrThrow({
      where: { id: originalId },
      include: {
        mantas: true,
        participations: {
          include: { subjects: true },
        },
      },
    });
    if (original.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    const pin = generatePin();

    const newEvent = await prisma.event.create({
      data: {
        titre: newData.titre,
        date: new Date(newData.date),
        themeId: original.themeId,
        campusId,
        pin,
        mantas: {
          create: original.mantas.map((m) => ({
            staffProfileId: m.staffProfileId,
          })),
        },
      },
    });

    for (const p of original.participations) {
      await prisma.participation.create({
        data: {
          studentProfileId: p.studentProfileId,
          eventId: newEvent.id,
          campusId,
          bringPc: p.bringPc,
          isPresent: false,
          subjects: {
            create: p.subjects.map((s) => ({ subjectId: s.subjectId })),
          },
        },
      });
    }

    return newEvent.id;
  },

  /**
   * Auto-assigns the best subject to all unassigned students in an event.
   * Verifies the event belongs to the given campus.
   */
  async autoAssignAll(eventId: string, campusId: string) {
    const unassigned = await prisma.participation.findMany({
      where: {
        eventId,
        subjects: { none: {} },
      },
      include: { studentProfile: true },
    });

    if (unassigned.length === 0) return 0;

    const subjects = await prisma.subject.findMany({
      where: { OR: [{ campusId }, { campusId: null }] },
      include: { subjectThemes: true },
    });
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (event.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }

    const studentProfileIds = unassigned.map((p) => p.studentProfileId);
    const completedMap = await preloadCompletedSubjects(
      studentProfileIds,
      eventId,
    );

    let count = 0;

    for (const p of unassigned) {
      const suggestedId = await suggestBestSubject(
        p.studentProfileId,
        subjects,
        event.themeId,
        [],
        completedMap.get(p.studentProfileId),
      );

      if (suggestedId) {
        await prisma.participationSubject.create({
          data: {
            participationId: p.id,
            subjectId: suggestedId,
          },
        });
        count++;
      }
    }

    return count;
  },

  /**
   * Updates an event. If the theme is changed, it automatically recalculates
   * subjects for eligible unassigned/absent students.
   */
  async updateEvent(
    eventId: string,
    campusId: string,
    data: {
      titre: string;
      date: string;
      theme?: string;
      notes?: string;
      mantas?: string[];
    },
  ) {
    const currentEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (currentEvent.campusId !== campusId) {
      throw error(
        403,
        'Accès refusé : cet événement appartient à un autre campus.',
      );
    }
    const oldThemeId = currentEvent.themeId;

    let newThemeId: string | null = null;
    if (data.theme && data.theme.trim() !== '') {
      const existing = await prisma.theme.findFirst({
        where: { nom: data.theme },
      });

      if (existing) {
        newThemeId = existing.id;
      } else {
        const created = await prisma.theme.create({
          data: { nom: data.theme, campusId },
        });
        newThemeId = created.id;
      }
    }

    // Update mantas and event atomically
    await prisma.$transaction(async (tx) => {
      if (data.mantas) {
        await tx.eventManta.deleteMany({ where: { eventId } });
        if (data.mantas.length > 0) {
          await tx.eventManta.createMany({
            data: data.mantas.map((staffProfileId) => ({
              eventId,
              staffProfileId,
            })),
          });
        }
      }

      await tx.event.update({
        where: { id: eventId },
        data: {
          titre: data.titre,
          date: new Date(data.date),
          themeId: newThemeId ?? undefined,
          notes: data.notes,
        },
      });
    });

    if (oldThemeId !== newThemeId) {
      const participations = await prisma.participation.findMany({
        where: { eventId },
        include: { subjects: true },
      });

      const subjects = await prisma.subject.findMany({
        where: { OR: [{ campusId }, { campusId: null }] },
        include: { subjectThemes: true },
      });

      const eligibleStudentProfileIds = participations
        .filter((p) => !p.isPresent && p.subjects.length === 0)
        .map((p) => p.studentProfileId);

      const completedMap = await preloadCompletedSubjects(
        eligibleStudentProfileIds,
        eventId,
      );

      for (const p of participations) {
        if (!p.isPresent && p.subjects.length === 0) {
          const newSubjectId = await suggestBestSubject(
            p.studentProfileId,
            subjects,
            newThemeId,
            [],
            completedMap.get(p.studentProfileId),
          );

          if (newSubjectId) {
            await prisma.participationSubject.create({
              data: {
                participationId: p.id,
                subjectId: newSubjectId,
              },
            });
          }
        }
      }
      return true;
    }
    return false;
  },
};
