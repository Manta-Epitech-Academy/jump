import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { eventSchema } from '$lib/validation/events';
import { CalendarDateTime } from '@internationalized/date';
import { generatePin } from '$lib/utils';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { m } from '$lib/paraglide/messages.js';
import {
  analyzeCampaignFile,
  importCampaignData,
  type ImportAction,
} from '$lib/server/services/campaignService';

export const load: PageServerLoad = async ({ locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });
  const staff = await db.staffProfile.findMany({
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const form = await superValidate(zod4(eventSchema));
  return { themes, staff, form };
};

export const actions: Actions = {
  createManual: async ({ request, locals }) => {
    const formData = await request.formData();
    const dateStr = formData.get('date') as string;
    const timeStr = formData.get('time') as string;
    const themeInput = formData.get('theme') as string;

    let calendarDateTime: CalendarDateTime | undefined;
    if (dateStr && timeStr) {
      try {
        const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
        const [hour, minute] = timeStr.split(':').map(Number);
        calendarDateTime = new CalendarDateTime(year, month, day, hour, minute);
      } catch {
        // handled by validation
      }
    }

    const transformedData = {
      titre: (formData.get('titre') as string) || '',
      date: calendarDateTime,
      time: timeStr,
      theme: themeInput,
      notes: (formData.get('notes') as string) || '',
      mantas: formData.getAll('mantas') as string[],
    };

    const form = await superValidate(transformedData, zod4(eventSchema));
    if (form.data.date && typeof form.data.date !== 'string')
      form.data.date = form.data.date.toString();
    if (!form.valid) return fail(400, { form });

    let newEventId = '';
    try {
      const campusId = getCampusId(locals);
      const db = scopedPrisma(campusId);

      let themeId: string | null = null;
      if (form.data.theme && form.data.theme.trim() !== '') {
        const existing = await db.theme.findFirst({
          where: { nom: form.data.theme },
        });
        if (existing) {
          themeId = existing.id;
        } else {
          const created = await db.theme.create({
            data: { nom: form.data.theme },
          });
          themeId = created.id;
        }
      }

      if (!calendarDateTime) throw new Error('Date invalide');
      const jsDate = calendarDateTime.toDate('Europe/Paris');

      const record = await prisma.event.create({
        data: {
          titre: form.data.titre,
          date: jsDate,
          themeId,
          notes: form.data.notes,
          campusId,
          pin: generatePin(),
          mantas: form.data.mantas.length > 0
            ? { create: form.data.mantas.map((id) => ({ staffProfileId: id })) }
            : undefined,
        },
      });
      newEventId = record.id;
    } catch (err) {
      console.error('Erreur création événement:', err);
      return message(form, m.event_create_error(), {
        status: 500,
      });
    }
    throw redirect(303, resolve(`/events/${newEventId}/builder`));
  },

  analyzeCampaign: async ({ request, locals }) => {
    const formData = await request.formData();
    const file = formData.get('csvFile') as File;

    if (!file || file.size === 0)
      return fail(400, {
        error: 'Veuillez sélectionner un fichier CSV valide.',
      });

    try {
      const campusId = getCampusId(locals);
      const result = await analyzeCampaignFile(file, campusId);
      return result;
    } catch (err) {
      console.error('CSV Analysis Error:', err);
      return fail(500, {
        error: "Erreur lors de l'analyse : " + (err as Error).message,
      });
    }
  },

  confirmCampaignImport: async ({ request, locals }) => {
    const formData = await request.formData();
    const rawData = formData.get('importData') as string;
    const eventName = formData.get('eventName') as string;
    const eventDateStr = formData.get('eventDate') as string;
    const mantas = formData.getAll('mantas') as string[];
    const notes = formData.get('notes') as string;

    if (!rawData) return fail(400, { error: m.server_error_missing_data() });

    let newEventId = '';
    try {
      const campusId = getCampusId(locals);
      const importList = JSON.parse(rawData) as ImportAction[];
      newEventId = await importCampaignData(
        importList,
        eventName,
        eventDateStr,
        mantas,
        notes,
        campusId,
      );
    } catch (err) {
      console.error('Final Import Error:', err);
      return fail(500, { error: "Erreur lors de l'import final" });
    }
    throw redirect(303, resolve(`/events/${newEventId}/builder`));
  },
};
