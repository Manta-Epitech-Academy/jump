import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { requireStaffGroup } from '$lib/server/auth/guards';

/**
 * Read-only view of a broadcast for the dev workspace. Surfaces just what
 * the recipient saw (subject + rendered body) plus light metadata — the
 * full recipient table and admin actions live in `/staff/admin/broadcasts/`
 * which dev roles can't access.
 *
 * `?from=<talentId>` lets the page render a "Retour au profil" link to the
 * student page the user clicked through from.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireStaffGroup(locals, 'devMember');

  const broadcast = await prisma.broadcast.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      channel: true,
      audience: true,
      status: true,
      createdAt: true,
      subjectSnapshot: true,
      bodySnapshot: true,
      campus: { select: { name: true } },
      event: { select: { titre: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!broadcast) error(404, 'Envoi introuvable');

  const fromTalentId = url.searchParams.get('from');

  return { broadcast, fromTalentId };
};
