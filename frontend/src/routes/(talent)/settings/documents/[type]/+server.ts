import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStorage } from '$lib/server/infra/storage';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  isTalentViewableDocument,
  onboardingDownloadFilename,
  resolveTalentDocumentKey,
} from '$lib/server/services/onboardingDocuments';

/**
 * Serves a talent their own signed onboarding PDF. The key is resolved from the
 * authenticated talent's own records, never from a client-supplied id, so the
 * route can only ever hand back the caller's own document, then 302s to a
 * short-lived presigned URL rather than proxying the bytes.
 *
 * `?annee=` picks which year's document for the règlement, which a talent has
 * one of per school year. Untrusted like any query param, and it does not need
 * to be trusted: it only ever narrows a lookup already scoped to this talent, so
 * an unknown or forged year finds nothing rather than somebody else's file.
 * Omitted, it resolves to their most recently signed one, so a bare link works.
 */
export const GET: RequestHandler = async ({ params, url: reqUrl, locals }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  if (!isTalentViewableDocument(params.type)) {
    throw error(404, 'Document inconnu');
  }

  const resolved = await resolveTalentDocumentKey(
    locals.talent.id,
    params.type,
    reqUrl.searchParams.get('annee'),
  );
  if (!resolved) {
    throw error(404, 'Document indisponible');
  }

  const url = await getStorage().getDownloadUrl(resolved.key, {
    filename: onboardingDownloadFilename(
      params.type,
      locals.talent,
      resolved.schoolYear,
    ),
    contentType: 'application/pdf',
  });
  recordUsage(USAGE_FEATURES.TALENT_DOCUMENT_VIEW, { locals });

  throw redirect(302, url);
};
