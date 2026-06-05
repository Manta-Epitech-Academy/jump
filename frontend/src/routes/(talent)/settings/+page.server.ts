import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  acknowledgeDeletionRejection,
  cancelTalentDeletion,
  getLatestDeletionRequest,
  requestTalentDeletion,
} from '$lib/server/services/talentDeletionService';
import {
  TALENT_VIEWABLE_DOCUMENTS,
  projectTalentDocument,
} from '$lib/server/services/onboardingDocuments';
import { resolveTalentDocumentStatus } from '$lib/server/services/onboardingPdfJobService';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const [participationsCount, latestDeletion, latestPdfJobs] =
    await Promise.all([
      prisma.participation.count({ where: { talentId: locals.talent.id } }),
      getLatestDeletionRequest(locals.talent.id),
      // Latest generation job per viewable document, to tell "still rendering"
      // apart from "errored/stranded": the talent's `*FilePath` column only
      // says whether the file landed, not why it hasn't yet.
      prisma.onboardingPdfJob.findMany({
        where: {
          talentId: locals.talent.id,
          documentType: { in: [...TALENT_VIEWABLE_DOCUMENTS] },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['documentType'],
        select: { documentType: true, status: true, updatedAt: true },
      }),
    ]);
  const latestPdfJobByType = new Map(
    latestPdfJobs.map((job) => [job.documentType, job]),
  );

  // Surface only the two states the talent acts on: a request still pending
  // (account stays usable meanwhile), or one that was refused and not yet
  // dismissed (RGPD owes them the reason). Cancelled/fulfilled show nothing.
  let deletion: {
    status: 'pending' | 'rejected';
    at: Date;
    note: string | null;
  } | null = null;
  if (latestDeletion?.status === 'pending') {
    deletion = {
      status: 'pending',
      at: latestDeletion.requestedAt,
      note: null,
    };
  } else if (
    latestDeletion?.status === 'rejected' &&
    !latestDeletion.acknowledgedAt
  ) {
    deletion = {
      status: 'rejected',
      at: latestDeletion.resolvedAt ?? latestDeletion.requestedAt,
      note: latestDeletion.resolutionNote,
    };
  }

  // Signed onboarding documents the talent can review. Only the ones actually
  // signed surface here; `signerName` carries a legal guardian's name for
  // image-rights (which they alone decide), and `coSigner` carries the same for
  // the règlement (which the guardian co-signs on top of the talent's own
  // signature — both signature events live on the single shared PDF).
  const documents = TALENT_VIEWABLE_DOCUMENTS.map((type) =>
    projectTalentDocument(locals.talent!, type),
  )
    .filter(
      (doc): doc is typeof doc & { signedAt: Date } => doc.signedAt !== null,
    )
    // Only list a document that has a PDF, or a job generating one. A recorded
    // signature with neither a file nor a job means the document was never
    // produced through the signing flow (e.g. a campus that bypasses
    // image-rights signing, or a pre-pipeline legacy row), so there is nothing
    // to review; omit it rather than show a permanently "indisponible" entry.
    // Genuine flow signatures always enqueue a job in the signature's own
    // transaction, so this never hides a document that is really on its way.
    .filter((doc) => doc.ready || latestPdfJobByType.has(doc.type))
    .map((doc) => {
      // Fold the cached file-path projection with the latest job so the UI can
      // show a terminal "indisponible" instead of an unending spinner.
      const base = {
        type: doc.type,
        label: doc.label,
        signedAt: doc.signedAt,
        status: resolveTalentDocumentStatus(
          doc.ready,
          latestPdfJobByType.get(doc.type) ?? null,
        ),
      };
      if (doc.type === 'image-rights') {
        const prenom = locals.talent!.imageRightsSignerPrenom;
        const nom = locals.talent!.imageRightsSignerNom;
        return {
          ...base,
          signerName: prenom && nom ? `${prenom} ${nom}` : (nom ?? prenom),
          coSigner: null as { name: string; signedAt: Date } | null,
        };
      }
      if (doc.type === 'rules') {
        const parentSignedAt = locals.talent!.parentRulesSignedAt;
        const prenom = locals.talent!.parentRulesSignerPrenom;
        const nom = locals.talent!.parentRulesSignerNom;
        const parentSignerName =
          prenom && nom ? `${prenom} ${nom}` : (nom ?? prenom);
        return {
          ...base,
          signerName: null,
          coSigner:
            parentSignedAt && parentSignerName
              ? { name: parentSignerName, signedAt: parentSignedAt }
              : null,
        };
      }
      return { ...base, signerName: null, coSigner: null };
    });

  return { talent: locals.talent, participationsCount, deletion, documents };
};

export const actions: Actions = {
  unlinkDiscord: async ({ locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await prisma.talent.update({
        where: { id: locals.talent.id },
        data: { discordId: null },
      });
    } catch (err) {
      console.error('Error unlinking Discord:', err);
      return fail(500, { message: 'Erreur lors de la déconnexion de Discord' });
    }

    return { discordUnlinked: true };
  },

  // A talent can't wipe their own account on the spot — a stage de seconde
  // cohort depends on these accounts and GDPR allows a fulfilment window. This
  // opens a pending deletion request that staff fulfil (→ anonymisation) or
  // reject. The account stays fully usable in the meantime. Idempotent.
  requestDeletion: async ({ locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await requestTalentDeletion(locals.talent.id);
    } catch (err) {
      console.error('Error requesting account deletion:', err);
      return fail(500, {
        message: 'Erreur lors de la demande de suppression',
      });
    }

    return { deletionRequested: true };
  },

  // Talent withdraws their own pending request.
  cancelDeletion: async ({ locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await cancelTalentDeletion(locals.talent.id);
    } catch (err) {
      console.error('Error cancelling account deletion:', err);
      return fail(500, {
        message: "Erreur lors de l'annulation de la demande",
      });
    }

    return { deletionCancelled: true };
  },

  // Talent dismisses the "your request was refused" notice.
  acknowledgeRejection: async ({ locals }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    try {
      await acknowledgeDeletionRejection(locals.talent.id);
    } catch (err) {
      console.error('Error acknowledging deletion rejection:', err);
      return fail(500, { message: 'Erreur' });
    }

    return { rejectionAcknowledged: true };
  },
};
