import { Zip, ZipPassThrough } from 'fflate';
import type { ClosingGrid } from '$lib/domain/closing';
import {
  generateClosingPdf,
  closingPdfFilename,
  type ClosingForPdf,
} from './closingPdfGenerator';

/**
 * A ZIP of closing synthesis PDFs, streamed as each render lands.
 *
 * Two callers with two scopes and one implementation: the admin archive spans
 * every campus over a date window, the dev-space one covers a single event, and
 * a difference between what the two produce would be a difference nobody asked
 * for. Each route keeps what is genuinely its own - its guard, its `where`, its
 * filename, and for the admin its export high-water mark, which is what
 * `onAssembled` is for.
 *
 * Closings are rendered on demand (no stored artifact to fetch, unlike the
 * onboarding export): each PDF goes through the shared Puppeteer pool, so this
 * is CPU-bound, not I/O-bound. Three concurrent renders keep the pool (max 5
 * pages) productive without starving the other PDF features. The archive is
 * streamed so bytes flow as each render lands: peak memory stays around one PDF
 * per worker rather than the whole archive, and the connection keeps feeding the
 * client so a large corpus does not idle-timeout. At our scale (a few hundred
 * finished closings) a full export is minutes of wall-clock at worst; revisit (a
 * background job writing to storage) only if the corpus grows by an order of
 * magnitude.
 */
const GEN_CONCURRENCY = 3;

/** Named so a reader knows the archive is telling on itself, not hiding a gap. */
const ERROR_MANIFEST_NAME = '_ERREURS-GENERATION.txt';

export interface ClosingPdfArchiveOptions {
  /**
   * Called once every render has been attempted and the archive is closed, so a
   * caller can record that it produced one. Runs whether or not some renders
   * failed, because the archive was still assembled and delivered. Must not
   * throw: it is invoked inside the stream's own lifecycle.
   */
  onAssembled?: () => void;
}

export function streamClosingPdfArchive(
  closings: ClosingForPdf[],
  grids: ReadonlyMap<string, ClosingGrid>,
  options: ClosingPdfArchiveOptions = {},
): ReadableStream<Uint8Array> {
  // Store-level (ZipPassThrough, no deflate) because PDFs are already
  // compressed; recompressing would only burn CPU.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });

      // Workers share a cursor over `closings`. Appending to the archive is
      // synchronous, so the single-threaded runtime serialises the add/push
      // pairs even though the renders run concurrently. One failed render must
      // not abort the archive, but it must not vanish silently either (see the
      // manifest below).
      let cursor = 0;
      const errors: { name: string; error: string }[] = [];
      const worker = async (): Promise<void> => {
        while (cursor < closings.length) {
          const closing = closings[cursor++];
          const filename = closingPdfFilename(closing);
          try {
            // The grid the record was conducted WITH: the caller resolves them
            // by `templateId`, so a retargeted event cannot rewrite a past
            // closing here either.
            const grid = grids.get(closing.templateId);
            if (!grid) throw new Error('grille de closing introuvable');
            const pdf = await generateClosingPdf(closing, grid);
            const file = new ZipPassThrough(filename);
            zip.add(file);
            file.push(pdf, true);
          } catch (e) {
            console.error(`[closing-zip] generation failed: ${filename}`, e);
            errors.push({
              name: filename,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      };

      Promise.all(Array.from({ length: GEN_CONCURRENCY }, worker))
        .then(() => {
          if (errors.length > 0) {
            // Say which closings are missing and why, inside the artifact that
            // was downloaded: an archive short a few files with no explanation
            // reads as a complete one.
            const manifest = errors
              .map((e) => `${e.name}: ${e.error}`)
              .join('\n');
            const file = new ZipPassThrough(ERROR_MANIFEST_NAME);
            zip.add(file);
            file.push(new TextEncoder().encode(manifest), true);
          }
          zip.end();
          options.onAssembled?.();
        })
        .catch((err) => controller.error(err));
    },
  });
}
