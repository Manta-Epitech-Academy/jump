import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';
import { recordParentRulesSignature } from '$lib/server/services/parentRulesService';
import { applicableReglementVersion } from '$lib/content/reglement';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  // Children whose guardian has not yet co-signed the règlement intérieur.
  // Pre-fill the signer-name inputs from what the talent entered for their
  // guardian during onboarding — same rationale as the image-rights flow.
  const unsignedChildren = await prisma.talent.findMany({
    where: {
      parentEmail: locals.user.email,
      parentRulesSignedAt: null,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      parentPrenom: true,
      parentNom: true,
      parentType: true,
      parentCivilite: true,
      rulesSignedAt: true,
      reglementVersion: true,
    },
  });

  // Règlement done for everyone — move on to the image-rights step (which in
  // turn forwards to /parent/merci once it too is settled).
  if (unsignedChildren.length === 0) {
    throw redirect(303, resolve('/parent/signature'));
  }

  return {
    // Resolve each child's applicable version here rather than in the page: the
    // guardian co-signs the very document their child signed, so a sibling who
    // signed an older wording must not be shown the newer one.
    children: unsignedChildren.map(
      ({ rulesSignedAt, reglementVersion, ...child }) => ({
        ...child,
        reglementVersion: applicableReglementVersion(
          rulesSignedAt,
          reglementVersion,
        ),
      }),
    ),
  };
};

export const actions: Actions = {
  sign: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'parent') {
      throw error(401, 'Non autorisé');
    }

    const formData = await request.formData();
    const talentId = (formData.get('talentId') as string)?.trim();
    const signerPrenom = (formData.get('signerPrenom') as string)?.trim();
    const signerNom = (formData.get('signerNom') as string)?.trim();
    const relationship = (formData.get('relationship') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();

    if (!talentId) {
      return { error: 'Identifiant enfant manquant.' };
    }

    // Security: verify this child belongs to the authenticated parent.
    const profile = await prisma.talent.findUnique({
      where: { id: talentId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        parentEmail: true,
        rulesSignedAt: true,
        reglementVersion: true,
      },
    });

    if (!profile || profile.parentEmail !== locals.user.email) {
      throw error(403, 'Accès non autorisé pour cet enfant.');
    }

    if (!signerPrenom || signerPrenom.length < 1) {
      return { error: 'Veuillez entrer votre prénom.', talentId };
    }

    if (!signerNom || signerNom.length < 1) {
      return { error: 'Veuillez entrer votre nom.', talentId };
    }

    if (!relationship) {
      return {
        error: 'Veuillez indiquer votre qualité (mère, père, tuteur).',
        talentId,
      };
    }

    if (!city) {
      return { error: 'Veuillez indiquer la ville.', talentId };
    }

    const studentName = `${profile.prenom} ${profile.nom}`;

    // Records the signature + enqueues the matching PDF atomically, then fires
    // the (non-blocking) generation. The signed-at timestamp is set now, so the
    // `remaining` count below already excludes this child.
    await recordParentRulesSignature({
      talentId: profile.id,
      signerPrenom,
      signerNom,
      relationship,
      city,
      // Recomputed from the row rather than read off the form: this is what the
      // page rendered, and it must not be something a client can choose.
      reglementVersion: applicableReglementVersion(
        profile.rulesSignedAt,
        profile.reglementVersion,
      ),
    });

    // Any child whose règlement is still unsigned keeps the parent on this page.
    const remaining = await prisma.talent.count({
      where: {
        parentEmail: locals.user.email,
        parentRulesSignedAt: null,
      },
    });

    if (remaining === 0) {
      throw redirect(303, resolve('/parent/signature'));
    }

    return { success: studentName };
  },
};
