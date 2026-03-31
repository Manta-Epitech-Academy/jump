import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, eventSchema } from '$lib/validation/events';
import { studentSchema } from '$lib/validation/students';
import { getTotalXp } from '$lib/domain/xp';
import {
  suggestBestSubject,
  preloadCompletedSubjects,
} from '$lib/domain/recommender';
import { createScoped } from '$lib/pocketbase';
import { EventService } from '$lib/server/services/events';
import {
  type ParticipationsResponse,
  type StudentsResponse,
  type SubjectsResponse,
  StudentsNiveauOptions,
  StudentsNiveauDifficulteOptions,
  StudentsLevelOptions,
} from '$lib/pocketbase-types';
import { CalendarDateTime } from '@internationalized/date';
import { ClientResponseError } from 'pocketbase';

type ParticipationExpand = {
  student?: StudentsResponse;
  subjects?: SubjectsResponse[];
};

export const load: PageServerLoad = async ({ locals, params }) => {
  let event;
  try {
    event = await locals.pb.collection('events').getOne(params.id, {
      expand: 'theme,mantas',
      requestKey: null,
    });
  } catch (e) {
    console.error(e);
    throw error(404, 'Événement introuvable');
  }

  const participationsRaw = await locals.pb
    .collection('participations')
    .getFullList<ParticipationsResponse<ParticipationExpand>>({
      filter: `event = "${event.id}"`,
      expand: 'student,subjects',
      requestKey: null,
    });

  // Sort alphabetically by NOM then Prenom
  participationsRaw.sort((a, b) => {
    const nomA = a.expand?.student?.nom?.toUpperCase() ?? '';
    const nomB = b.expand?.student?.nom?.toUpperCase() ?? '';
    if (nomA < nomB) return -1;
    if (nomA > nomB) return 1;

    const prenomA = a.expand?.student?.prenom?.toLowerCase() ?? '';
    const prenomB = b.expand?.student?.prenom?.toLowerCase() ?? '';
    return prenomA.localeCompare(prenomB);
  });

  // Batch-fetch completed subject history for all students in this event (fixes N+1)
  const studentIds = participationsRaw
    .map((p) => p.expand?.student?.id)
    .filter(Boolean) as string[];

  const completedMap =
    studentIds.length > 0
      ? await preloadCompletedSubjects(locals.pb, studentIds, event.id)
      : new Map<string, Set<string>>();

  const difficultyWeights: Record<string, number> = {
    Débutant: 0,
    Intermédiaire: 1,
    Avancé: 2,
  };

  const participations = participationsRaw.map((p) => {
    const student = p.expand?.student;
    const currentSubjects = p.expand?.subjects || [];
    const alerts: { type: 'danger' | 'warning'; message: string }[] = [];

    if (student && currentSubjects.length > 0) {
      const completed = completedMap.get(student.id) ?? new Set();

      for (const subject of currentSubjects) {
        if (completed.has(subject.id)) {
          alerts.push({
            type: 'danger',
            message: `DÉJÀ FAIT : L'élève a déjà validé "${subject.nom}".`,
          });
        }

        const studentLevel =
          difficultyWeights[student.niveau_difficulte || 'Débutant'] ?? 0;
        const subjectLevel = difficultyWeights[subject.difficulte] ?? 0;

        if (subjectLevel > studentLevel) {
          alerts.push({
            type: 'warning',
            message: `DIFFICILE : Le sujet "${subject.nom}" est de niveau "${subject.difficulte}", ce qui est supérieur au niveau de l'élève (${student.niveau_difficulte || 'Débutant'}).`,
          });
        }
      }
    }

    return { ...p, alerts };
  });

  const subjects = await locals.pb.collection('subjects').getFullList({
    sort: 'nom',
    expand: 'themes,campus',
    requestKey: null,
  });

  const themes = await locals.pb.collection('themes').getFullList({
    sort: 'nom',
    requestKey: null,
  });

  const user = locals.user as any;
  const staff = await locals.pb.collection('users').getFullList({
    filter: user?.campus ? `campus = "${user.campus}"` : '',
    sort: 'name',
  });

  const eventDate = new Date(event.date);
  const dateString = eventDate.toISOString().split('T')[0];

  const timeParts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  }).formatToParts(eventDate);

  const hours = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minutes = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const timeString = `${hours}:${minutes}`;

  const editForm = await superValidate(
    {
      titre: event.titre,
      theme:
        (event as { expand?: { theme?: { nom?: string } } }).expand?.theme
          ?.nom || '',
      date: dateString,
      time: timeString,
      notes: event.notes || '',
      mantas: event.mantas || [],
    },
    zod4(eventSchema),
  );

  const addForm = await superValidate(zod4(addParticipantSchema));
  const createStudentForm = await superValidate(zod4(studentSchema));

  return {
    event,
    participations,
    subjects,
    themes,
    staff,
    addForm,
    createStudentForm,
    editForm,
  };
};

export const actions: Actions = {
  addExisting: async ({ request, locals, params }) => {
    const form = await superValidate(request, zod4(addParticipantSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const duplicate = await locals.pb
        .collection('participations')
        .getList(1, 1, {
          filter: `student = "${form.data.studentId}" && event = "${params.id}"`,
        });

      if (duplicate.totalItems > 0) {
        return message(form, 'Cet élève est déjà inscrit à cet événement.', {
          status: 400,
        });
      }

      const event = await locals.pb.collection('events').getOne(params.id);
      const subjects = await locals.pb.collection('subjects').getFullList();
      const suggestedSubjectId = await suggestBestSubject(
        locals.pb,
        form.data.studentId,
        subjects,
        event.theme,
      );

      await createScoped(locals.pb, 'participations', {
        student: form.data.studentId,
        event: params.id,
        subjects: suggestedSubjectId ? [suggestedSubjectId] : [],
        is_present: false,
      });

      return message(form, 'Élève ajouté avec une suggestion intelligente !');
    } catch (err) {
      console.error(err);
      return message(form, "Erreur technique lors de l'ajout.", {
        status: 500,
      });
    }
  },

  updateSubjects: async ({ request, locals }) => {
    const data = await request.formData();
    const participationId = data.get('participationId') as string;
    const subjectsRaw = data.get('subjectIds') as string;
    const subjectIds = subjectsRaw
      ? subjectsRaw.split(',').filter(Boolean)
      : [];

    try {
      await locals.pb
        .collection('participations')
        .update(participationId, { subjects: subjectIds });
      return { success: true };
    } catch (err) {
      console.error('Update subjects error:', err);
      return fail(500);
    }
  },

  bulkAssign: async ({ request, locals, params }) => {
    const data = await request.formData();
    const subjectsRaw = data.get('subjectIds') as string;

    if (!subjectsRaw) return fail(400, { message: 'Aucun sujet sélectionné.' });
    const newSubjectIds = subjectsRaw.split(',').filter(Boolean);

    try {
      const participations = await locals.pb
        .collection('participations')
        .getFullList({ filter: `event = "${params.id}"`, requestKey: null });

      let updateCount = 0;

      await Promise.all(
        participations.map(async (p) => {
          const currentSubjects = p.subjects || [];
          const combinedSubjects = new Set([
            ...currentSubjects,
            ...newSubjectIds,
          ]);

          if (combinedSubjects.size > currentSubjects.length) {
            await locals.pb.collection('participations').update(p.id, {
              subjects: Array.from(combinedSubjects),
            });
            updateCount++;
          }
        }),
      );

      return { success: true, message: `${updateCount} élèves mis à jour !` };
    } catch (err) {
      console.error('Bulk assign error:', err);
      return fail(500, { message: "Erreur lors de l'assignation de masse." });
    }
  },

  autoAssignAll: async ({ params, locals }) => {
    try {
      const count = await EventService.autoAssignAll(locals.pb, params.id);
      if (count === 0)
        return { success: true, message: 'Aucun élève à assigner.' };
      return {
        success: true,
        message: `${count} élèves assignés automatiquement !`,
      };
    } catch (err) {
      console.error('Auto-assign error:', err);
      return fail(500, { message: "Erreur lors de l'auto-assignation" });
    }
  },

  quickCreateStudent: async ({ request, locals, params }) => {
    const form = await superValidate(request, zod4(studentSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const tempPassword = crypto.randomUUID() + Math.random().toString(36);

      const newStudent = await createScoped(locals.pb, 'students', {
        ...form.data,
        email: form.data.email || '',
        niveau: form.data.niveau as StudentsNiveauOptions,
        niveau_difficulte: form.data
          .niveau_difficulte as StudentsNiveauDifficulteOptions,
        emailVisibility: true,
        password: tempPassword,
        passwordConfirm: tempPassword,
        verified: false,
        level: StudentsLevelOptions.Novice,
        badges: [],
        xp: 0,
        events_count: 0,
      });

      const event = await locals.pb.collection('events').getOne(params.id);
      const subjects = await locals.pb.collection('subjects').getFullList();
      const suggestedSubjectId = await suggestBestSubject(
        locals.pb,
        newStudent.id,
        subjects,
        event.theme,
      );

      await createScoped(locals.pb, 'participations', {
        student: newStudent.id,
        event: params.id,
        subjects: suggestedSubjectId ? [suggestedSubjectId] : [],
        is_present: false,
      });

      return message(form, 'Élève créé et assigné automatiquement !');
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 400) {
        return message(
          form,
          'Un élève identique (même nom, prénom et email) existe déjà.',
          {
            status: 400,
          },
        );
      }
      console.error('Quick create student error:', err);
      return message(form, 'Erreur lors de la création rapide.', {
        status: 500,
      });
    }
  },

  updateEvent: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const dateStr = formData.get('date') as string;
    const timeStr = formData.get('time') as string;

    const transformedData = {
      titre: (formData.get('titre') as string) || '',
      date: dateStr,
      time: timeStr,
      theme: formData.get('theme') as string,
      notes: formData.get('notes') as string,
      mantas: formData.getAll('mantas') as string[],
    };

    const form = await superValidate(transformedData, zod4(eventSchema));
    if (!form.valid) return fail(400, { form });

    try {
      if (!dateStr || !timeStr) throw new Error('Date ou heure manquante');

      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const cdt = new CalendarDateTime(year, month, day, hour, minute);
      const jsDate = cdt.toDate('Europe/Paris');

      if (isNaN(jsDate.getTime())) {
        return message(form, 'Format de date invalide', { status: 400 });
      }

      const themeChanged = await EventService.updateEvent(
        locals.pb,
        params.id,
        {
          ...form.data,
          date: jsDate.toISOString(),
        },
      );

      if (themeChanged) {
        return message(form, 'Événement mis à jour et sujets recalculés !');
      }

      return message(form, 'Événement mis à jour !');
    } catch (err) {
      console.error('Update Event Error:', err);
      return message(form, "Impossible de mettre à jour l'événement", {
        status: 500,
      });
    }
  },

  remove: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      const p = await locals.pb
        .collection('participations')
        .getOne<
          ParticipationsResponse<ParticipationExpand>
        >(id, { expand: 'subjects' });

      if (p.is_present) {
        const subjects = p.expand?.subjects || [];
        const xpValue = getTotalXp(subjects);
        const student = await locals.pb
          .collection('students')
          .getOne(p.student);

        await locals.pb.collection('students').update(p.student, {
          'xp-': Math.min(xpValue, student.xp ?? 0),
          'events_count-': Math.min(1, student.events_count ?? 0),
        });
      }

      await locals.pb.collection('participations').delete(id);
      return { success: true };
    } catch (err) {
      console.error('Remove participation error:', err);
      return fail(500);
    }
  },

  deleteEvent: async ({ params, locals }) => {
    try {
      await EventService.deleteEvent(locals.pb, params.id);
    } catch (err) {
      console.error('Delete event error:', err);
      return fail(500);
    }
    throw redirect(303, resolve('/'));
  },
};
