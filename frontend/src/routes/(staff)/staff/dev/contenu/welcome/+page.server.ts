import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getCampusId } from '$lib/server/db/scoped';
import { requireStaffGroup } from '$lib/server/auth/guards';
import { can } from '$lib/domain/permissions';
import DOMPurify from 'isomorphic-dompurify';

const SLUG = 'welcome';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaffGroup(locals, 'devMember');
  const campusId = getCampusId(locals);
  const canEdit = can('devLead', locals.staffProfile?.staffRole);

  const page = await prisma.cmsPage.findUnique({
    where: { slug_campusId: { slug: SLUG, campusId } },
  });

  return { cmsContent: page?.content ?? '', canEdit };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devLead');
    const campusId = getCampusId(locals);
    const userId = locals.user!.id;

    const formData = await request.formData();
    const rawContent = formData.get('content');

    if (typeof rawContent !== 'string') {
      return fail(400, { error: 'Contenu invalide.' });
    }

    const content = DOMPurify.sanitize(rawContent);

    await prisma.cmsPage.upsert({
      where: { slug_campusId: { slug: SLUG, campusId } },
      update: { content, updatedBy: userId },
      create: { slug: SLUG, campusId, content, updatedBy: userId },
    });

    return { success: true };
  },
};
