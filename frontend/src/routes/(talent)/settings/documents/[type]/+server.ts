import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStorage } from '$lib/server/infra/storage';
import {
  ONBOARDING_DOCUMENTS,
  isTalentViewableDocument,
} from '$lib/server/services/onboardingDocuments';

/**
 * Serves a talent their own signed onboarding PDF. Reads the S3 key from the
 * authenticated talent's record — never from a client-supplied id — so the
 * route can only ever hand back the caller's own document, then 302s to a
 * short-lived presigned URL rather than proxying the bytes.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  if (!isTalentViewableDocument(params.type)) {
    throw error(404, 'Document inconnu');
  }

  const descriptor = ONBOARDING_DOCUMENTS[params.type];
  // The route's contract is to serve a *signed* document, so require both the
  // signature timestamp and the generated file. Gating on the file alone would
  // keep handing back a stale PDF after the signature is voided (e.g. an admin
  // onboarding reset nulls `rulesSignedAt`), serving a document the rest of the
  // app already treats as unsigned.
  const filePath = locals.talent[descriptor.filePathField];
  if (!locals.talent[descriptor.signedAtField] || !filePath) {
    throw error(404, 'Document indisponible');
  }

  const url = await getStorage().getDownloadUrl(filePath);
  throw redirect(302, url);
};
