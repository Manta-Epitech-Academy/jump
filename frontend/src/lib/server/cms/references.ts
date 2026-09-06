import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';

// CMS images are referenced from saved content by their proxy URL,
// `/api/cms/images/<id>`. The content is the single source of truth for which
// images are in use; an image referenced by no content is garbage.
//
// The sweep scans every `CmsPage` row (today that is exactly the welcome pages,
// the only slug in use), so do not narrow it to a slug filter. Treating
// unreferenced images as orphans is sound *because* image upload is gated to the
// welcome editors (`CmsEditor`'s `allowImageUpload` prop, on for welcome only).
// The shared editor is also mounted on activity and template surfaces, whose
// content lives in other tables this sweep never reads; if upload is ever
// enabled there, an uploaded image would be reclaimed as a false orphan.
// Enabling upload on a new surface therefore means scanning its content here.

const IMAGE_URL_RE = /\/api\/cms\/images\/([a-z0-9]+)/gi;

/** Ids of every CMS image the given HTML embeds (deduplicated). */
function extractCmsImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(IMAGE_URL_RE)) ids.add(match[1]);
  return [...ids];
}

/**
 * Delete CMS images that are older than `staleAfterMs` and referenced by no
 * welcome page: abandoned uploads, images edited out of a message, and rows
 * whose page was deleted. Frees both the row and the S3 object. Returns the
 * number reclaimed.
 *
 * This is the one reconciliation point for CMS images, and it is necessary
 * rather than incidental: S3 and Postgres cannot commit atomically, and an
 * abandoned upload (tab closed before saving) fires no server event to clean up
 * synchronously. The age threshold protects uploads that belong to an editor
 * that is still open but not yet saved.
 */
export async function sweepOrphanCmsImages(
  staleAfterMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stale = await prisma.cmsImage.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, s3Key: true },
  });
  if (stale.length === 0) return 0;

  // Build the set of ids still referenced anywhere, then keep only the orphans.
  const pages = await prisma.cmsPage.findMany({ select: { content: true } });
  const referenced = new Set<string>();
  for (const page of pages) {
    for (const id of extractCmsImageIds(page.content)) referenced.add(id);
  }
  const orphans = stale.filter((row) => !referenced.has(row.id));
  if (orphans.length === 0) return 0;

  const storage = getStorage();
  await Promise.all(
    orphans.map(async (row) => {
      try {
        await storage.delete(row.s3Key);
      } catch (err) {
        // Row deletion still proceeds; a leaked object is preferable to a
        // dangling row that would never be retried.
        console.error('[gc-cms-images] S3 delete failed', row.s3Key, err);
      }
    }),
  );
  await prisma.cmsImage.deleteMany({
    where: { id: { in: orphans.map((row) => row.id) } },
  });

  return orphans.length;
}
