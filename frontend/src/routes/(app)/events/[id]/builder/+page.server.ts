import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
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
import { EventService } from '$lib/server/services/events';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';

const difficultyWeights: Record<string, number> = {
  Débutant: 0,
  Intermédiaire: 1,
  Avancé: 2,
};

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = scopedPrisma(getCampusId(locals));
  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
      },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const participationsRaw = await db.participation.findMany({
    where: { eventId: event.id },
    include: {
      studentProfile: true,
      subjects: { include: { subject: true } },
    },
  });

  participationsRaw.sort((a, b) => {
    const nomA = a.studentProfile.nom.toUpperCase();
    const nomB = b.studentProfile.nom.toUpperCase();
    if (nomA < nomB) return -1;
    if (nomA > nomB) return 1;
    return a.studentProfile.prenom
      .toLowerCase()
      .localeCompare(b.studentProfile.prenom.toLowerCase());
  });

  const studentProfileIds = participationsRaw.map((p) => p.studentProfileId);
  const completedMap =
    studentProfileIds.length > 0
      ? await preloadCompletedSubjects(studentProfileIds, event.id)
      : new Map<string, Set<string>>();

  const participations = participationsRaw.map((p) => {
    const student = p.studentProfile;
    const currentSubjects = p.subjects.map((ps) => ps.subject);
    const alerts: { type: 'danger' | 'warning'; message: string }[] = [];

    if (currentSubjects.length > 0) {
      const completed = completedMap.get(student.id) ?? new Set();

      for (const subject of currentSubjects) {
        if (completed.has(subject.id)) {
          alerts.push({
            type: 'danger',
            message: `DÉJÀ FAIT : L'élève a déjà validé "${subject.nom}".`,
          });
        }

        const studentLevel =
          difficultyWeights[student.niveauDifficulte || 'Débutant'] ?? 0;
        const subjectLevel = difficultyWeights[subject.difficulte] ?? 0;

        if (subjectLevel > studentLevel) {
          alerts.push({
            type: 'warning',
            message: `DIFFICILE : Le sujet "${subject.nom}" est de niveau "${subject.difficulte}", ce qui est supérieur au niveau de l'élève (${student.niveauDifficulte || 'Débutant'}).`,
          });
        }
      }
    }

    return { ...p, alerts };
  });

  const subjects = await db.subject.findMany({
    include: { subjectThemes: { include: { theme: true } }, campus: true },
    orderBy: { nom: 'asc' },
  });

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });

  const staff = await db.staffProfile.findMany({
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
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
      theme: event.theme?.nom || '',
      date: dateString,
      time: timeString,
      notes: event.notes || '',
      mantas: event.mantas.map((m) => m.staffProfileId),
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
      const existing = await prisma.participation.findUnique({
        where: {
          studentProfileId_eventId: {
            studentProfileId: form.data.studentId,
            eventId: params.id,
          },
        },
      });

      if (existing) {
        return message(form, 'Cet élève est déjà inscrit à cet événement.', {
          status: 400,
        });
      }

      const db = scopedPrisma(getCampusId(locals));
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });
      const subjects = await db.subject.findMany({
        include: { subjectThemes: true },
      });
      const suggestedSubjectId = await suggestBestSubject(
        form.data.studentId,
        subjects,
        event.themeId,
      );

      const campusId = getCampusId(locals);
      await prisma.participation.create({
        data: {
          studentProfileId: form.data.studentId,
          eventId: params.id,
          campusId,
          isPresent: false,
          subjects: suggestedSubjectId
            ? { create: [{ subjectId: suggestedSubjectId }] }
            : undefined,
        },
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
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.participation.findUniqueOrThrow({
        where: { id: participationId },
      });
      await prisma.participationSubject.deleteMany({
        where: { participationId },
      });
      if (subjectIds.length > 0) {
        await prisma.participationSubject.createMany({
          data: subjectIds.map((subjectId) => ({ participationId, subjectId })),
        });
      }
      return { success: true };
    } catch (err) {
      console.error('Update subjects error:', err);
      return fail(500);
    }
  },

  bulkAssign: async ({ request, params, locals }) => {
    const data = await request.formData();
    const subjectsRaw = data.get('subjectIds') as string;

    if (!subjectsRaw) return fail(400, { message: 'Aucun sujet sélectionné.' });
    const newSubjectIds = subjectsRaw.split(',').filter(Boolean);

    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.event.findUniqueOrThrow({ where: { id: params.id } });
      const participations = await db.participation.findMany({
        where: { eventId: params.id },
        include: { subjects: true },
      });

      let updateCount = 0;

      await Promise.all(
        participations.map(async (p) => {
          const currentSubjectIds = p.subjects.map((s) => s.subjectId);
          const toAdd = newSubjectIds.filter(
            (id) => !currentSubjectIds.includes(id),
          );

          if (toAdd.length > 0) {
            await prisma.participationSubject.createMany({
              data: toAdd.map((subjectId) => ({
                participationId: p.id,
                subjectId,
              })),
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
      const count = await EventService.autoAssignAll(
        params.id,
        getCampusId(locals),
      );
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
      const campusId = getCampusId(locals);

      const user = await prisma.bauth_user.create({
        data: {
          email: form.data.email || `${crypto.randomUUID()}@placeholder.local`,
          role: 'student',
          name: `${form.data.prenom} ${form.data.nom}`,
          studentProfile: {
            create: {
              nom: form.data.nom,
              prenom: form.data.prenom,
              campusId,
              niveau: form.data.niveau || null,
              niveauDifficulte: form.data.niveau_difficulte || 'Débutant',
              xp: 0,
              eventsCount: 0,
              parentEmail: form.data.parent_email || null,
              parentPhone: form.data.parent_phone || null,
              phone: form.data.phone || null,
            },
          },
        },
        include: { studentProfile: true },
      });

      const studentProfileId = user.studentProfile!.id;
      const db = scopedPrisma(campusId);

      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });
      const subjects = await db.subject.findMany({
        include: { subjectThemes: true },
      });
      const suggestedSubjectId = await suggestBestSubject(
        studentProfileId,
        subjects,
        event.themeId,
      );

      await prisma.participation.create({
        data: {
          studentProfileId,
          eventId: params.id,
          campusId,
          isPresent: false,
          subjects: suggestedSubjectId
            ? { create: [{ subjectId: suggestedSubjectId }] }
            : undefined,
        },
      });

      return message(form, 'Élève créé et assigné automatiquement !');
    } catch (err: any) {
      if (err.code === 'P2002') {
        return message(
          form,
          'Un élève identique (même nom, prénom et email) existe déjà.',
          { status: 400 },
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

      const campusId = getCampusId(locals);
      const themeChanged = await EventService.updateEvent(params.id, campusId, {
        ...form.data,
        date: jsDate.toISOString(),
      });

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

  toggleBringPc: async ({ request, locals }) => {
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },

  remove: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findUniqueOrThrow({
        where: { id },
        include: { subjects: { include: { subject: true } } },
      });

      if (p.isPresent) {
        const subjects = p.subjects.map((ps) => ({
          difficulte: ps.subject.difficulte,
        }));
        const xpValue = getTotalXp(subjects);

        const profile = await prisma.studentProfile.findUniqueOrThrow({
          where: { id: p.studentProfileId },
          select: { xp: true, eventsCount: true },
        });
        await prisma.studentProfile.update({
          where: { id: p.studentProfileId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      await prisma.participationSubject.deleteMany({
        where: { participationId: id },
      });
      await prisma.participation.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error('Remove participation error:', err);
      return fail(500);
    }
  },

  deleteEvent: async ({ params, locals }) => {
    try {
      await EventService.deleteEvent(params.id, getCampusId(locals));
    } catch (err) {
      console.error('Delete event error:', err);
      return fail(500);
    }
    throw redirect(303, resolve('/'));
  },
};
