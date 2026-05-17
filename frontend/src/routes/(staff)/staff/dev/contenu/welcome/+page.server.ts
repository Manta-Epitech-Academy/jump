import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';
import { can } from '$lib/domain/permissions';
import { resolveStageContext } from '$lib/server/services/stageContext';
import DOMPurify from 'isomorphic-dompurify';

const SLUG = 'welcome';

async function getActiveStageId(locals: App.Locals): Promise<string> {
  const db = scopedPrisma(getCampusId(locals));
  const stage = await resolveStageContext(db);
  if (!stage) throw error(404, 'Aucun stage actif.');
  return stage.id;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
  requireFlag(locals, 'staff_welcome_page');
  requireStaffGroup(locals, 'devMember');
  const { activeStage } = await parent();
  if (!activeStage) throw error(404, 'Aucun stage actif.');
  const canEdit = can('devLead', locals.staffProfile?.staffRole);

  const page = await prisma.cmsPage.findUnique({
    where: { slug_eventId: { slug: SLUG, eventId: activeStage.id } },
  });

  return { cmsContent: page?.content ?? '', canEdit };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireFlag(locals, 'staff_welcome_page');
    requireStaffGroup(locals, 'devLead');
    const eventId = await getActiveStageId(locals);
    const userId = locals.user!.id;

    const formData = await request.formData();
    const rawContent = formData.get('content');

    if (typeof rawContent !== 'string') {
      return fail(400, { error: 'Contenu invalide.' });
    }

    const content = DOMPurify.sanitize(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_eventId: { slug: SLUG, eventId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, eventId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
