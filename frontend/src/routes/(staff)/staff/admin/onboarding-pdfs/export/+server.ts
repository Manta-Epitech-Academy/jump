import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Zip, ZipPassThrough } from 'fflate';
import { getStorage, isObjectNotFound } from '$lib/server/infra/storage';
import {
  collectFinishedOnboardingDocs,
  isExportableDocumentType,
  recordOnboardingDocsExport,
  type DateRange,
  type ExportableDocumentType,
  type FinishedOnboardingDoc,
} from '$lib/server/services/onboardingDocuments';

// How many PDFs to pull from S3 at once. Firing one GET per talent
// simultaneously would open hundreds of sockets at once; eight keeps the pipe
// busy without that. Note this bounds only the *fetch* side: the workers
// enqueue zip output as fast as they fetch and don't honour stream
// backpressure, so on a slow client the unsent bytes can grow to ~the whole
// archive. At our scale (a few hundred small, already-generated PDFs) that's
// tens of MB, which is fine; revisit if the corpus ever grows by an order of
// magnitude.
const FETCH_CONCURRENCY = 8;

// Self-documenting top-level folders inside the archive, one per document kind.
const ARCHIVE_FOLDER: Record<FinishedOnboardingDoc['type'], string> = {
  'image-rights': 'droit-image',
  rules: 'reglement-interieur',
};

// A document the row promised but the export couldn't include. `missing` = the
// object is genuinely gone (deleted, or a stale `*FilePath`); `error` = a
// storage incident that survived the S3 client's own retries. Recorded so the
// omission surfaces in a manifest instead of vanishing.
type SkippedDoc = { doc: FinishedOnboardingDoc; reason: 'missing' | 'error' };

const archivePath = (doc: FinishedOnboardingDoc): string =>
  `${ARCHIVE_FOLDER[doc.type]}/${doc.filename}`;

// Filename stem of the downloaded ZIP, by scope. A scoped export names its kind
// so the admin's Downloads folder stays self-explanatory.
const ARCHIVE_STEM: Record<ExportableDocumentType | 'all', string> = {
  all: 'documents-onboarding',
  'image-rights': 'droits-image-onboarding',
  rules: 'reglements-onboarding',
};

// Parse a `from`/`to` query param into an instant. The client sends full ISO
// instants (start/end of day, or the last-export mark), so this is a plain
// parse; an unparseable value is ignored rather than erroring, degrading to a
// wider export rather than a 500.
function parseInstant(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// Date suffix that makes the downloaded file self-documenting: the window when a
// range is set, otherwise the export date.
function archiveDateSuffix(range: DateRange, exportDate: string): string {
  const { from, to } = range;
  if (from && to) return `${ymd(from)}_${ymd(to)}`;
  if (from) return `depuis-${ymd(from)}`;
  if (to) return `jusquau-${ymd(to)}`;
  return exportDate;
}

// French, admin-facing text dropped into the archive when anything was left
// out, so a short export is visible without reading pod logs. Legal documents:
// a silent omission is worse than a loud one.
function renderSkipManifest(skipped: SkippedDoc[], date: string): string {
  const missing = skipped.filter((s) => s.reason === 'missing');
  const failed = skipped.filter((s) => s.reason === 'error');
  const lines = [
    `Documents absents de cette archive (export du ${date})`,
    '',
    `${skipped.length} document(s) attendu(s) n'ont pas pu être inclus :`,
    '',
  ];
  if (missing.length > 0) {
    lines.push(
      `Introuvables dans le stockage (${missing.length}) : fichier supprimé ou`,
      'jamais généré. Relancer la génération du PDF concerné.',
      ...missing.map((s) => `  - ${archivePath(s.doc)}  [clé : ${s.doc.key}]`),
      '',
    );
  }
  if (failed.length > 0) {
    lines.push(
      `Erreurs de récupération (${failed.length}) : incident temporaire du`,
      "stockage. Relancer l'export devrait les rapatrier.",
      ...failed.map((s) => `  - ${archivePath(s.doc)}  [clé : ${s.doc.key}]`),
      '',
    );
  }
  return lines.join('\n');
}

// Bulk download of every finished onboarding PDF as a single ZIP: the
// image-rights document for each decided talent, plus the règlement intérieur
// for talents whose copy is co-signed by both the student and the parent (the
// filter lives in `collectFinishedOnboardingDocs`). The PDFs already exist in
// S3, so this only fetches and repackages them; nothing is regenerated.
//
// Streamed rather than assembled into one Blob: bytes start flowing before the
// whole archive is built, so the browser sees progress at once and a large
// export doesn't stall long enough to trip a proxy idle timeout. (Streaming
// doesn't cap memory here, see FETCH_CONCURRENCY; total memory is bounded by
// archive size, tens of MB at our scale.) Store-level (ZipPassThrough, no
// deflate) because PDFs are already compressed; recompressing would only burn
// CPU.
export const GET: RequestHandler = async ({ locals, url }) => {
  // The /staff/admin layout already redirects non-admins; this is defence in
  // depth for an endpoint that streams minors' signed documents.
  const staffProfile = locals.staffProfile;
  if (staffProfile?.staffRole !== 'admin') throw error(403, 'Accès refusé');

  // Optional scope: a single document kind and/or a completion-time window
  // instead of everything. Unknown/unparseable params fall through to a wider
  // export rather than erroring.
  const typeParam = url.searchParams.get('type');
  const onlyType: ExportableDocumentType | undefined =
    typeParam && isExportableDocumentType(typeParam) ? typeParam : undefined;
  const range: DateRange = {
    from: parseInstant(url.searchParams.get('from')),
    to: parseInstant(url.searchParams.get('to')),
  };

  // Whether this download advances the admin's archival high-water mark. Only a
  // full-corpus, open-ended archive ("everything up to now") may: no type filter
  // (else the other kind is absent) and no upper time bound (else it's a
  // historical window, not "up to now"). The client sets `advance` only on the
  // all-time and "depuis le dernier export" downloads; these two structural
  // checks are the safety rail so a stray flag on a scoped link can't corrupt
  // the mark.
  const advanceMark =
    url.searchParams.get('advance') === '1' && !onlyType && !range.to;

  // One clock for the request. The mark, when advanced, is set to this
  // pre-snapshot instant (see `recordOnboardingDocsExport`) so a doc finishing
  // mid-export is re-offered next time rather than skipped.
  const exportedAt = new Date();

  const docs = await collectFinishedOnboardingDocs({ onlyType, range });
  if (docs.length === 0) throw error(404, 'Aucun document à exporter');

  const storage = getStorage();
  const date = exportedAt.toISOString().slice(0, 10);

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
      // pairs even though the S3 fetches run concurrently. Each worker returns
      // the docs it had to skip; one bad object must not abort the archive, but
      // it must not vanish silently either (see the manifest below).
      let cursor = 0;
      const worker = async (): Promise<SkippedDoc[]> => {
        const skipped: SkippedDoc[] = [];
        while (cursor < docs.length) {
          const doc = docs[cursor++];
          let bytes: Buffer;
          try {
            bytes = await storage.get(doc.key);
          } catch (err) {
            const reason = isObjectNotFound(err) ? 'missing' : 'error';
            console.error(`[onboarding-zip] ${reason}: ${doc.key}`, err);
            skipped.push({ doc, reason });
            continue;
          }
          const file = new ZipPassThrough(archivePath(doc));
          zip.add(file);
          file.push(new Uint8Array(bytes), true);
        }
        return skipped;
      };

      Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker))
        .then((perWorker) => {
          const skipped = perWorker.flat();
          if (skipped.length > 0) {
            // Tell the admin which expected documents are absent and why,
            // inside the artifact they downloaded.
            const manifest = new ZipPassThrough('_DOCUMENTS-MANQUANTS.txt');
            zip.add(manifest);
            manifest.push(
              new TextEncoder().encode(renderSkipManifest(skipped, date)),
              true,
            );
          }
          zip.end();
          // Archive assembled: record an "up to now" archival pass so the page's
          // "depuis le dernier export" delta moves forward on the next poll. This
          // tracks ASSEMBLY, not client delivery, which a streamed download can't
          // confirm. A cancel before assembly finishes rejects the workers above
          // and never reaches here, so a quick cancel won't advance the mark; a
          // cancel after assembly may leave it advanced even though the bytes
          // never reached the browser. Acceptable because the mark is a
          // convenience filter, not a receipt: the all-time export ignores it and
          // stays the authoritative archive. Not reached on the 404/empty path
          // above. Fire-and-forget; a failed write safely re-offers next time.
          if (advanceMark) {
            void recordOnboardingDocsExport(staffProfile.id, exportedAt).catch(
              (err) =>
                console.error('[onboarding-zip] mark export failed', err),
            );
          }
        })
        .catch((err) => controller.error(err));
    },
  });

  const filename = `${ARCHIVE_STEM[onlyType ?? 'all']}-${archiveDateSuffix(range, date)}.zip`;

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
