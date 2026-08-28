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
  listTalentDocuments,
} from '$lib/server/services/onboardingDocuments';
import { resolveTalentDocumentStatus } from '$lib/server/services/onboardingPdfJobService';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const [participationsCount, latestDeletion, latestPdfJobs, signedDocuments] =
    await Promise.all([
      prisma.participation.count({ where: { talentId: locals.talent.id } }),
      getLatestDeletionRequest(locals.talent.id),
      // Latest generation job per document, to tell "still rendering" apart from
      // "errored/stranded": the stored file path only says whether the file
      // landed, not why it hasn't yet. Distinct on the school year too, since a
      // talent has one règlement per year and each has its own render.
      prisma.onboardingPdfJob.findMany({
        where: {
          talentId: locals.talent.id,
          documentType: { in: [...TALENT_VIEWABLE_DOCUMENTS] },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['documentType', 'schoolYear'],
        select: {
          documentType: true,
          schoolYear: true,
          status: true,
          updatedAt: true,
        },
      }),
      listTalentDocuments(locals.talent.id),
    ]);
  const jobKey = (type: string, schoolYear: string | null) =>
    `${type}:${schoolYear ?? ''}`;
  const latestPdfJobByDoc = new Map(
    latestPdfJobs.map((job) => [jobKey(job.documentType, job.schoolYear), job]),
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

  // Signed onboarding documents the talent can review, newest first: their
  // image-rights decision, plus one règlement per school year they completed.
  // `listTalentDocuments` reads each règlement off its own dossier, so an older
  // one keeps the guardian and the date that actually signed it.
  const documents = signedDocuments
    // Only list a document that has a PDF, or a job generating one. A recorded
    // signature with neither a file nor a job means the document was never
    // produced through the signing flow (e.g. a campus that bypasses
    // image-rights signing, or a pre-pipeline legacy row), so there is nothing
    // to review; omit it rather than show a permanently "indisponible" entry.
    // Genuine flow signatures always enqueue a job in the signature's own
    // transaction, so this never hides a document that is really on its way.
    .filter(
      (doc) =>
        doc.ready || latestPdfJobByDoc.has(jobKey(doc.type, doc.schoolYear)),
    )
    .map((doc) => ({
      type: doc.type,
      label: doc.label,
      schoolYear: doc.schoolYear,
      signedAt: doc.signedAt,
      signerName: doc.signerName,
      coSigner: doc.coSigner,
      // Fold the stored file path with the latest job so the UI can show a
      // terminal "indisponible" instead of an unending spinner.
      status: resolveTalentDocumentStatus(
        doc.ready,
        latestPdfJobByDoc.get(jobKey(doc.type, doc.schoolYear)) ?? null,
      ),
    }));

  return {
    talent: locals.talent,
    participationsCount,
    deletion,
    documents,
    usageAnalyticsOptedOut: locals.talent.usageAnalyticsOptOutAt !== null,
  };
};

export const actions: Actions = {
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

  // The talent's right to object (RGPD art. 21). Usage measurement runs on
  // legitimate interest rather than consent, so it is on until it is refused,
  // and refusing it has to actually stop the recording rather than hide it: the
  // recorder reads this timestamp before every write.
  //
  // Storing the date and not a boolean because that is what the flat-column
  // convention on `Talent` does everywhere else, and because "since when" is the
  // question anyone auditing the objection will ask.
  setUsageAnalytics: async ({ locals, request }) => {
    if (!locals.talent || !locals.user) {
      return fail(401, { message: 'Non autorisé' });
    }

    const optOut = (await request.formData()).get('optOut') === 'true';
    try {
      await prisma.talent.update({
        where: { id: locals.talent.id },
        data: { usageAnalyticsOptOutAt: optOut ? new Date() : null },
      });
    } catch (err) {
      console.error('Error updating usage analytics preference:', err);
      return fail(500, { message: 'Erreur lors de l’enregistrement' });
    }

    return { usageAnalyticsUpdated: true };
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
