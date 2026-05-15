import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import {
  getFileResponse,
  parseRepoUrl,
  GitHubError,
} from '$lib/server/services/githubClient';

/**
 * Streams a subject asset (typically an image) from GitHub through Jump.
 *
 * Why proxy instead of using `raw.githubusercontent.com`:
 *   - Private subject repos are unreachable for the browser without an auth
 *     header. The Contents API + GITHUB_TOKEN works server-side for both
 *     visibilities, so this is the only flow that survives a public→private
 *     repo flip.
 *   - The URL is sha-pinned, which lets us serve `Cache-Control: immutable`.
 *
 * Auth: any authenticated user (staff or talent). Subject content shows up in
 * sanitized HTML they already have access to; gating the asset further would
 * be redundant.
 */
export const GET: RequestHandler = async ({ params, locals, fetch: _ }) => {
  if (!locals.user) throw error(401, 'Non autorisé');

  const subject = await prisma.subject.findUnique({
    where: { id: params.subjectId },
    select: {
      repoUrl: true,
      versions: {
        where: { repoCommitSha: params.sha },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!subject) throw error(404, 'Sujet introuvable');
  // Only serve assets for commits we've actually imported. Stops the proxy
  // being abused as an arbitrary GitHub fetch under a known subject id.
  if (subject.versions.length === 0) {
    throw error(404, 'Commit non importé pour ce sujet');
  }

  const coords = parseRepoUrl(subject.repoUrl);
  try {
    const upstream = await getFileResponse(coords, params.path, params.sha);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':
          upstream.headers.get('Content-Type') ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if (err instanceof GitHubError) throw error(err.status, err.message);
    throw err;
  }
};
