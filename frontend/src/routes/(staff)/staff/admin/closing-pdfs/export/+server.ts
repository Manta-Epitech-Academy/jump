import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { Zip, ZipPassThrough } from 'fflate';
import {
  generateClosingPdf,
  closingPdfFilename,
  closingPdfSelect,
} from '$lib/server/services/closingPdfGenerator';
import { resolveClosingGrids } from '$lib/server/closingTemplates';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';

// Closings are rendered on demand (no stored artifact to fetch, unlike the
// onboarding export): each PDF is generated through the shared Puppeteer pool,
// so this is CPU-bound, not I/O-bound. Three concurrent renders keep the pool
// (max 5 pages) productive without starving the other PDF features. The ZIP is
// streamed so bytes flow as each render lands: peak memory stays around one PDF
// per worker rather than the whole archive, and the connection keeps feeding
// the client so a large corpus does not idle-timeout. At our scale (a few
// hundred finished closings) a full export is minutes of wall-clock at worst;
// revisit (a background job writing to storage) only if the corpus grows by an
// order of magnitude.
const GEN_CONCURRENCY = 3;

// Parse a `from`/`to` query param into an instant. The client sends full ISO
// instants; an unparseable value is ignored rather than erroring, degrading to
// a wider export instead of a 500.
function parseInstant(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

export const GET: RequestHandler = async ({ url, locals }) => {
  recordUsage(USAGE_FEATURES.ADMIN_CLOSING_PDFS_EXPORT, { locals });
  // The /staff/admin layout guard already redirects non-admins; this is defence
  // in depth for an endpoint that streams minors' closing data.
  const staffProfile = locals.staffProfile;
  if (staffProfile?.staffRole !== 'admin') throw error(403, 'Accès refusé.');

  const from = parseInstant(url.searchParams.get('from'));
  const to = parseInstant(url.searchParams.get('to'));

  const where: Prisma.Closing_RecordWhereInput = { status: 'done' };
  if (from || to) {
    where.conductedAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
  }

  // Whether this download advances the admin's export high-water mark. Only an
  // open-ended "everything up to now" archive may: an upper time bound makes it
  // a historical window, not "up to now". The client sets `advance` on the
  // all-time and "depuis le dernier export" downloads; this check is the safety
  // rail so a stray flag on a windowed link can't corrupt the mark.
  const advanceMark = url.searchParams.get('advance') === '1' && !to;

  // One clock for the request. The mark, when advanced, is set to this
  // pre-query instant so a closing finalised mid-export is re-offered next
  // time rather than skipped.
  const exportedAt = new Date();

  const closings = await prisma.closing_Record.findMany({
    where,
    select: closingPdfSelect,
    orderBy: { conductedAt: 'desc' },
  });

  if (closings.length === 0) {
    throw error(404, 'Aucun closing à exporter.');
  }

  // One resolve per distinct grid rather than one per record: the archive spans
  // hundreds of closings and a handful of grids.
  const grids = await resolveClosingGrids(closings.map((c) => c.templateId));

  // Stream the archive: each rendered PDF is appended and flushed as it lands,
  // so the browser sees progress immediately and peak memory stays bounded.
  // Store-level (ZipPassThrough, no deflate) because PDFs are already
  // compressed; recompressing would only burn CPU.
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
            // Tell the admin which closings are missing and why, inside the
            // artifact they downloaded.
            const manifest = errors
              .map((e) => `${e.name}: ${e.error}`)
              .join('\n');
            const file = new ZipPassThrough('_ERREURS-GENERATION.txt');
            zip.add(file);
            file.push(new TextEncoder().encode(manifest), true);
          }
          zip.end();
          // Record an "up to now" pass AFTER assembly, anchored to the request
          // start so a closing finalised mid-export is re-offered next time.
          // This tracks assembly, not client delivery (a streamed download can't
          // confirm the latter); the mark is a convenience filter, not a
          // receipt, and the all-time export ignores it. Fire-and-forget; a
          // failed write safely re-offers next time.
          if (advanceMark) {
            void prisma.staffProfile
              .update({
                where: { id: staffProfile.id },
                data: { closingDocsExportedAt: exportedAt },
              })
              .catch((err) =>
                console.error('[closing-zip] mark export failed', err),
              );
          }
        })
        .catch((err) => controller.error(err));
    },
  });

  let stem = 'closings';
  if (from && to) stem += `-${ymd(from)}_${ymd(to)}`;
  else if (from) stem += `-depuis-${ymd(from)}`;
  else stem += `-${ymd(exportedAt)}`;

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${stem}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
};
