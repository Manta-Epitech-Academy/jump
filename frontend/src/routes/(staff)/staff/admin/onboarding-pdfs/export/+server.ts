import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Zip, ZipPassThrough } from 'fflate';
import { getStorage } from '$lib/server/infra/storage';
import {
  collectFinishedOnboardingDocs,
  type FinishedOnboardingDoc,
} from '$lib/server/services/onboardingDocuments';

// How many PDFs to pull from S3 at once. A global export can span thousands of
// files; firing one GET per talent simultaneously would exhaust sockets and
// memory. Eight keeps the pipe busy while peak memory stays at ~8 buffered PDFs.
const FETCH_CONCURRENCY = 8;

// Self-documenting top-level folders inside the archive, one per document kind.
const ARCHIVE_FOLDER: Record<FinishedOnboardingDoc['type'], string> = {
  'image-rights': 'droit-image',
  rules: 'reglement-interieur',
};

// Bulk download of every finished onboarding PDF as a single ZIP: the
// image-rights document for each decided talent, plus the règlement intérieur
// for talents whose copy is co-signed by both the student and the parent (the
// filter lives in `collectFinishedOnboardingDocs`). The PDFs already exist in
// S3, so this only fetches and repackages them; nothing is regenerated.
//
// Streamed rather than buffered: bytes start flowing before the whole archive
// is built, so a large global export neither blows pod memory nor stalls long
// enough to trip a proxy idle timeout. Store-level (ZipPassThrough, no deflate)
// because PDFs are already compressed; recompressing would only burn CPU.
export const GET: RequestHandler = async ({ locals }) => {
  // The /staff/admin layout already redirects non-admins; this is defence in
  // depth for an endpoint that streams minors' signed documents.
  if (locals.staffProfile?.staffRole !== 'admin')
    throw error(403, 'Accès refusé');

  const docs = await collectFinishedOnboardingDocs();
  if (docs.length === 0) throw error(404, 'Aucun document à exporter');

  const storage = getStorage();
  const date = new Date().toISOString().slice(0, 10);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });

      // Workers share a cursor over `docs`. Appending to the archive is
      // synchronous, so the single-threaded runtime serialises the add/push
      // pairs even though the S3 fetches run concurrently.
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < docs.length) {
          const doc = docs[cursor++];
          let bytes: Buffer;
          try {
            bytes = await storage.get(doc.key);
          } catch (err) {
            // A `*FilePath` set on the row but missing in S3 (deleted object,
            // transient error) is skipped, not fatal: one stale pointer must
            // not abort the whole archive.
            console.error(`[onboarding-zip] skipping ${doc.key}:`, err);
            continue;
          }
          const file = new ZipPassThrough(
            `${ARCHIVE_FOLDER[doc.type]}/${doc.filename}`,
          );
          zip.add(file);
          file.push(new Uint8Array(bytes), true);
        }
      };

      Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker))
        .then(() => zip.end())
        .catch((err) => controller.error(err));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="documents-onboarding-${date}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
};
