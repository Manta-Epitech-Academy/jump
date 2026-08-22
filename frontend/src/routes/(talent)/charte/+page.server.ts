import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { isOnboardingEligible } from '$lib/domain/niveau';
import { charteSchema } from '$lib/validation/onboarding';

/**
 * Standalone Charte Informatique et Éthique.
 *
 * The charte is the RGPD document that conditions any use of Jump, and it is
 * due whatever the talent's level: their data is processed either way. A talent
 * who walks the onboarding ladder signs it there, in the same transaction as
 * the règlement, so this page is for the ones who never enter the wizard -
 * collégiens. Without it, taking them out of onboarding would take the charte
 * with it, since the wizard is otherwise the only place it is signed.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  // Already accepted, or handled inside the wizard: nothing to do here. The
  // route guard enforces the same two conditions; this is the page-level
  // restatement every other funnel page carries.
  if (
    locals.talent.charterAcceptedAt ||
    isOnboardingEligible(locals.talent.niveau)
  ) {
    throw redirect(303, resolve('/'));
  }

  return { prenom: locals.talent.prenom };
};

export const actions: Actions = {
  accept: async ({ request, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const result = charteSchema.safeParse(
      Object.fromEntries(await request.formData()),
    );
    if (!result.success) {
      return fail(400, {
        error: result.error.issues[0]?.message ?? 'Données invalides.',
      });
    }

    await prisma.talent.update({
      where: { id: locals.talent.id },
      data: { charterAcceptedAt: new Date() },
    });

    throw redirect(303, resolve('/'));
  },
};
