import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { Zip, ZipPassThrough } from 'fflate';
import {
  generateInterviewPdf,
  interviewPdfFilename,
  type InterviewForPdf,
} from '$lib/server/services/interviewPdfGenerator';

/** Max concurrent Puppeteer pages for PDF generation. */
const GEN_CONCURRENCY = 3;

const interviewSelect = {
  id: true,
  conductedAt: true,
  recommendation: true,
  verdictNote: true,
  satisfactionStars: true,
  oneSentence: true,
  discoveryChannel: true,
  motivation: true,
  orientationTalkAtSchool: true,
  passionateTeacher: true,
  wantsMore: true,
  techProjection: true,
  specialties: true,
  otherJobs: true,
  infoSources: true,
  nextYearEvents: true,
  teacherName: true,
  teacherSubject: true,
  discoveryChannelOther: true,
  specialtiesOther: true,
  otherJobsOther: true,
  infoSourcesOther: true,
  talent: { select: { prenom: true, nom: true } },
  staff: { select: { user: { select: { name: true } } } },
  campus: { select: { name: true } },
  participation: { select: { event: { select: { titre: true } } } },
} as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.staffProfile) throw error(403, 'Acces refuse.');

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const advance = url.searchParams.get('advance') === '1';

  const where: Record<string, unknown> = { status: 'done' };
  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);
  if (Object.keys(dateFilter).length > 0) where.conductedAt = dateFilter;

  const interviews = (await prisma.interview.findMany({
    where,
    select: interviewSelect,
    orderBy: { conductedAt: 'desc' },
  })) as unknown as InterviewForPdf[];

  if (interviews.length === 0) {
    throw error(404, 'Aucun entretien a exporter.');
  }

  // Advance the high-water mark for full-corpus or "since" exports
  if (advance && !to && locals.staffProfile) {
    const snapshotTime =
      interviews.length > 0
        ? new Date(Math.max(...interviews.map((i) => i.conductedAt.getTime())))
        : new Date();
    prisma.staffProfile
      .update({
        where: { id: locals.staffProfile.id },
        data: { interviewDocsExportedAt: snapshotTime },
      })
      .catch((e) =>
        console.warn('[interview-export] mark advance failed:', e.message),
      );
  }

  // Build a streaming ZIP with concurrent PDF generation
  const zip = new Zip();
  const chunks: Uint8Array[] = [];

  zip.ondata = (err, data, final) => {
    if (err) throw err;
    if (data) chunks.push(data);
  };

  // Generate PDFs concurrently with a semaphore
  let cursor = 0;
  const errors: { name: string; error: string }[] = [];

  async function processNext(): Promise<void> {
    while (cursor < interviews.length) {
      const idx = cursor++;
      const interview = interviews[idx];
      const filename = interviewPdfFilename(interview);

      try {
        const pdf = await generateInterviewPdf(interview);
        const file = new ZipPassThrough(filename);
        zip.add(file);
        file.push(pdf, true);
      } catch (e) {
        errors.push({
          name: filename,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Run GEN_CONCURRENCY workers
  const workers = Array.from({ length: GEN_CONCURRENCY }, () => processNext());
  await Promise.all(workers);

  // Add error manifest if any failed
  if (errors.length > 0) {
    const manifest = errors.map((e) => `${e.name}: ${e.error}`).join('\n');
    const enc = new TextEncoder();
    const file = new ZipPassThrough('_ERREURS-GENERATION.txt');
    zip.add(file);
    file.push(enc.encode(manifest), true);
  }

  zip.end();

  // Concatenate all chunks into a single buffer
  const totalLength = chunks.reduce((s, c) => s + c.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  let stem = 'entretiens';
  if (from && to) stem += `-${ymd(new Date(from))}_${ymd(new Date(to))}`;
  else if (from) stem += `-depuis-${ymd(new Date(from))}`;
  else stem += `-${ymd(new Date())}`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${stem}.zip"`,
    },
  });
};
