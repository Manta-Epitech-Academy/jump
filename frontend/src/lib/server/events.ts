import { getTotalXp } from '$lib/xp';
import { createScoped } from '$lib/pocketbase';
import { generatePin } from '$lib/utils';
import type {
  TypedPocketBase,
  ParticipationsResponse,
  SubjectsResponse,
} from '$lib/pocketbase-types';

type ParticipationExpand = {
  subjects?: SubjectsResponse[];
};

export const EventService = {
  /**
   * Deletes an event and automatically rolls back XP for all present students.
   */
  async deleteEvent(pb: TypedPocketBase, eventId: string) {
    // 1. Fetch participations to calculate XP to remove
    const participations = await pb
      .collection('participations')
      .getFullList<ParticipationsResponse<ParticipationExpand>>({
        filter: `event = "${eventId}" && is_present = true`,
        expand: 'subjects',
      });

    // 2. Rollback XP (clamp to avoid going below 0)
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

    // 3. Delete the event record
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
    // 1. Get original event to copy theme
    const original = await pb.collection('events').getOne(originalId);

    // 2. Create new event
    const pin = generatePin();

    const newEvent = await createScoped(pb, 'events', {
      titre: newData.titre,
      date: newData.date,
      theme: original.theme,
      mantas: original.mantas,
      pin,
    });

    // 3. Fetch original participations
    const participations = await pb.collection('participations').getFullList({
      filter: `event = "${originalId}"`,
      requestKey: null,
    });

    // 4. Duplicate participants (resetting status)
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
};
