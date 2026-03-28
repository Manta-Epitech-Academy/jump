import { getTotalXp } from '$lib/domain/xp';
import { createScoped } from '$lib/pocketbase';
import { generatePin } from '$lib/utils';
import { suggestBestSubject, preloadCompletedSubjects } from '$lib/domain/recommender';
import type {
  TypedPocketBase,
  ParticipationsResponse,
  SubjectsResponse,
  StudentsResponse,
} from '$lib/pocketbase-types';

type ParticipationExpand = {
  subjects?: SubjectsResponse[];
  student?: StudentsResponse;
};

export const EventService = {
  /**
   * Deletes an event and automatically rolls back XP for all present students.
   */
  async deleteEvent(pb: TypedPocketBase, eventId: string) {
    const participations = await pb
      .collection('participations')
      .getFullList<ParticipationsResponse<ParticipationExpand>>({
        filter: `event = "${eventId}" && is_present = true`,
        expand: 'subjects',
      });

    const studentIds = [...new Set(participations.map((p) => p.student))];
    const students =
      studentIds.length > 0
        ? await pb.collection('students').getFullList({
            filter: studentIds.map((id) => `id = "${id}"`).join(' || '),
          })
        : [];
    const studentMap = new Map(students.map((s) => [s.id, s]));

    for (const p of participations) {
      const subjects = p.expand?.subjects || [];
      const xpValue = getTotalXp(subjects);
      const student = studentMap.get(p.student);
      if (!student) continue;

      const currentXp = student.xp ?? 0;
      const currentEventsCount = student.events_count ?? 0;

      await pb.collection('students').update(p.student, {
        'xp-': Math.min(xpValue, currentXp),
        'events_count-': Math.min(1, currentEventsCount),
      });
    }

    await pb.collection('events').delete(eventId);
  },

  /**
   * Duplicates an event and its participants (resetting status).
   */
  async duplicateEvent(
    pb: TypedPocketBase,
    originalId: string,
    newData: { titre: string; date: string },
  ) {
    const original = await pb.collection('events').getOne(originalId);
    const pin = generatePin();

    const newEvent = await createScoped(pb, 'events', {
      titre: newData.titre,
      date: newData.date,
      theme: original.theme,
      mantas: original.mantas,
      pin,
    });

    const participations = await pb.collection('participations').getFullList({
      filter: `event = "${originalId}"`,
      requestKey: null,
    });

    for (const p of participations) {
      await createScoped(pb, 'participations', {
        student: p.student,
        event: newEvent.id,
        subjects: p.subjects,
        bring_pc: p.bring_pc,
        is_present: false,
        note: '',
      });
    }

    return newEvent.id;
  },

  /**
   * Auto-assigns the best subject to all unassigned students in an event.
   */
  async autoAssignAll(pb: TypedPocketBase, eventId: string) {
    const unassigned = await pb
      .collection('participations')
      .getFullList<ParticipationsResponse<ParticipationExpand>>({
        filter: `event = "${eventId}" && subjects:length = 0`,
        expand: 'student',
      });

    if (unassigned.length === 0) return 0;

    const subjects = await pb.collection('subjects').getFullList();
    const event = await pb
      .collection('events')
      .getOne(eventId, { expand: 'theme' });

    const studentIds = unassigned
      .map((p) => p.expand?.student?.id)
      .filter(Boolean) as string[];
    const completedMap = await preloadCompletedSubjects(
      pb,
      studentIds,
      eventId,
    );

    let count = 0;

    for (const p of unassigned) {
      const studentId = p.expand?.student?.id ?? '';
      const suggestedId = await suggestBestSubject(
        pb,
        studentId,
        subjects,
        event.theme,
        [],
        completedMap.get(studentId),
      );

      if (suggestedId) {
        await pb.collection('participations').update(p.id, {
          subjects: [suggestedId],
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
    pb: TypedPocketBase,
    eventId: string,
    data: {
      titre: string;
      date: string;
      theme?: string;
      notes?: string;
      mantas?: string[];
    },
  ) {
    const currentEvent = await pb.collection('events').getOne(eventId);
    const oldThemeId = currentEvent.theme;

    let newThemeId: string | null = null;
    if (data.theme && data.theme.trim() !== '') {
      const existing = await pb.collection('themes').getList(1, 1, {
        filter: `nom = "${data.theme.replace(/"/g, '\\"')}"`,
      });

      if (existing.items.length > 0) {
        newThemeId = existing.items[0].id;
      } else {
        const created = await createScoped(pb, 'themes', { nom: data.theme });
        newThemeId = created.id;
      }
    }

    await pb.collection('events').update(eventId, {
      titre: data.titre,
      date: data.date, // Assumes ISO string
      theme: newThemeId ?? undefined,
      notes: data.notes,
      mantas: data.mantas,
    });

    if (oldThemeId !== newThemeId) {
      const participations = await pb.collection('participations').getFullList({
        filter: `event = "${eventId}"`,
        requestKey: null,
      });

      const subjects = await pb.collection('subjects').getFullList();

      const eligibleStudentIds = participations
        .filter(
          (p) => !p.is_present && (!p.subjects || p.subjects.length === 0),
        )
        .map((p) => p.student);

      const completedMap = await preloadCompletedSubjects(
        pb,
        eligibleStudentIds,
        eventId,
      );

      for (const p of participations) {
        if (!p.is_present && (!p.subjects || p.subjects.length === 0)) {
          const newSubjectId = await suggestBestSubject(
            pb,
            p.student,
            subjects,
            newThemeId,
            [],
            completedMap.get(p.student),
          );

          if (newSubjectId) {
            await pb.collection('participations').update(p.id, {
              subjects: [newSubjectId],
            });
          }
        }
      }
      return true; // Indicates theme changed
    }
    return false; // Indicates standard update
  },
};
