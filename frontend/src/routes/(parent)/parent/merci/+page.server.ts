import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  const parentEmail = locals.user.email;

  // Defensive mirror of the route guard: a parent with anything still pending
  // belongs back in the flow, not on the thank-you page. Règlement first, then
  // image rights, matching the welcome → règlement → droit-image order.
  const unsignedRules = await prisma.talent.count({
    where: { parentEmail, parentRulesSignedAt: null },
  });
  if (unsignedRules > 0) {
    throw redirect(303, resolve('/parent/reglement'));
  }

  const undecidedCount = await prisma.talent.count({
    where: { parentEmail, imageRightsDecidedAt: null },
  });
  if (undecidedCount > 0) {
    throw redirect(303, resolve('/parent/signature'));
  }

  // Personalise the acknowledgement from the most recently decided child.
  const child = await prisma.talent.findFirst({
    where: { parentEmail },
    orderBy: { imageRightsDecidedAt: 'desc' },
    select: { prenom: true, id: true, imageRightsDecision: true },
  });

  // No child resolves under this address, e.g. a second legal guardian, whose
  // children are tracked under the primary parent's email. There is nothing to
  // confirm, so render a neutral acknowledgement. Redirecting away here would
  // loop: the guard sends every signed-up parent straight back to /parent/merci.
  if (!child) {
    return {
      childPrenom: null,
      childDecision: null,
      campusName: '',
      contactEmail: '',
    };
  }

  // Campus comes from the child's most recent participation.
  const participation = await prisma.participation.findFirst({
    where: { talentId: child.id },
    orderBy: { event: { date: 'desc' } },
    select: {
      event: {
        select: {
          campus: {
            select: { name: true, contactEmail: true },
          },
        },
      },
    },
  });

  const campus = participation?.event?.campus;

  return {
    childPrenom: child.prenom,
    childDecision: child.imageRightsDecision,
    campusName: campus?.name ?? '',
    contactEmail: campus?.contactEmail ?? '',
  };
};
