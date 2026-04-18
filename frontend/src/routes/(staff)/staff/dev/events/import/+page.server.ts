import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import {
  analyzeCampaignFile,
  importCampaignData,
  type ImportAction,
} from '$lib/server/services/campaignService';

export const load: PageServerLoad = async ({ locals }) => {
  const db = scopedPrisma(getCampusId(locals));

  const staff = await db.staffProfile.findMany({
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  return { staff };
};

export const actions: Actions = {
  analyzeCampaign: async ({ request, locals }) => {
    const formData = await request.formData();
    const file = formData.get('csvFile') as File;

    if (!file || file.size === 0)
      return fail(400, {
        error: 'Veuillez sélectionner un fichier CSV valide.',
      });

    try {
      const result = await analyzeCampaignFile(file);
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

    if (!rawData) return fail(400, { error: 'Données manquantes' });

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
    throw redirect(303, resolve(`/staff/dev/events/${newEventId}/manage`));
  },
};
