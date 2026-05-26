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

  const filePath =
    locals.talent[ONBOARDING_DOCUMENTS[params.type].filePathField];
  if (!filePath) {
    throw error(404, 'Document indisponible');
  }

  const url = await getStorage().getDownloadUrl(filePath);
  throw redirect(302, url);
};
