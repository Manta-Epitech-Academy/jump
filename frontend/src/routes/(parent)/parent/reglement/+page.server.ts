import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolve } from '$app/paths';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '#lib/server/db.ts';
import { requireParentSession } from '#lib/server/auth/guards.ts';
import { requireOwnChild } from '#lib/server/services/parentChildren.ts';
import { recordParentRulesSignature } from '#lib/server/services/parentRulesService.ts';
import { applicableReglementVersion } from '#lib/content/reglement/index.ts';
import { parentSignerRelationship } from '#lib/domain/profile.ts';
import {
  parentRulesSignatureSchema,
  parentSignatureFormId,
  signerOf,
} from '#lib/validation/parentSignature.ts';

export const load: PageServerLoad = async ({ locals }) => {
  requireParentSession(locals);

  // Children whose guardian has not yet co-signed the règlement intérieur.
  // Pre-fill the signer fields from what the talent entered for their guardian
  // during onboarding, same rationale as the image-rights flow.
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

  // Règlement done for everyone, move on to the image-rights step (which in
  // turn forwards to /parent/merci once it too is settled).
  if (unsignedChildren.length === 0) {
    throw redirect(303, resolve('parent/signature'));
  }

  return {
    children: await Promise.all(
      unsignedChildren.map(async (child) => ({
        id: child.id,
        prenom: child.prenom,
        nom: child.nom,
        // Resolve each child's applicable version here rather than in the page:
        // the guardian co-signs the very document their child signed, so a
        // sibling who signed an older wording must not be shown the newer one.
        reglementVersion: applicableReglementVersion(
          child.rulesSignedAt,
          child.reglementVersion,
        ),
        form: await superValidate(
          {
            talentId: child.id,
            signerPrenom: child.parentPrenom ?? '',
            signerNom: child.parentNom ?? '',
            relationship: parentSignerRelationship(
              child.parentType,
              child.parentCivilite,
            ),
          },
          zod4(parentRulesSignatureSchema),
          { id: parentSignatureFormId('rules', child.id), errors: false },
        ),
      })),
    ),
  };
};

export const actions: Actions = {
  sign: async ({ request, locals }) => {
    requireParentSession(locals);
    const form = await superValidate(request, zod4(parentRulesSignatureSchema));
    if (!form.valid) return fail(400, { form });

    const child = await requireOwnChild(locals.user.email, form.data.talentId, {
      id: true,
      prenom: true,
      nom: true,
      rulesSignedAt: true,
      reglementVersion: true,
    });

    // Records the signature + enqueues the matching PDF atomically, then fires
    // the (non-blocking) generation. The signed-at timestamp is set now, so the
    // `remaining` count below already excludes this child.
    await recordParentRulesSignature({
      talentId: child.id,
      ...signerOf(form.data),
      // Recomputed from the row rather than read off the form: this is what the
      // page rendered, and it must not be something a client can choose.
      reglementVersion: applicableReglementVersion(
        child.rulesSignedAt,
        child.reglementVersion,
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
      throw redirect(303, resolve('parent/signature'));
    }

    return message(form, { signedFor: `${child.prenom} ${child.nom}` });
  },
};
