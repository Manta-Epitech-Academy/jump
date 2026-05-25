import { fail } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import { runOnboardingPdfJob } from '$lib/server/services/onboardingPdfJobService';

type JobStatus = 'pending' | 'processing' | 'success' | 'error';

const PAGE_SIZE = 100;
const STATUS_FILTERS = ['all', 'active', 'success', 'error'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const DOCUMENT_TYPES = ['rules', 'charter', 'image-rights'] as const;

// `active` collapses the two transient states into the one the admin thinks of
// as "in flight"; the others map 1:1 to a status.
const STATUS_FILTER_WHERE: Record<
  Exclude<StatusFilter, 'all'>,
  Prisma.OnboardingPdfJobWhereInput['status']
> = {
  active: { in: ['pending', 'processing'] },
  success: 'success',
  error: 'error',
};

export const load: PageServerLoad = async ({ url, depends }) => {
  // Tagged so the client can poll just this query (invalidate) for a live feed
  // without re-running every load on the layout.
  depends('admin:onboarding-pdfs');

  const status: StatusFilter = STATUS_FILTERS.includes(
    url.searchParams.get('status') as StatusFilter,
  )
    ? (url.searchParams.get('status') as StatusFilter)
    : 'all';
  const typeParam = url.searchParams.get('type') ?? 'all';
  const type = (DOCUMENT_TYPES as readonly string[]).includes(typeParam)
    ? typeParam
    : 'all';
  const q = (url.searchParams.get('q') ?? '').trim();

  const where: Prisma.OnboardingPdfJobWhereInput = {};
  if (status !== 'all') where.status = STATUS_FILTER_WHERE[status];
  if (type !== 'all') where.documentType = type;
  if (q) {
    where.talent = {
      OR: [
        { prenom: { contains: q, mode: 'insensitive' } },
        { nom: { contains: q, mode: 'insensitive' } },
      ],
    };
  }

  const [jobs, counts, matchCount] = await Promise.all([
    prisma.onboardingPdfJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
      },
    }),
    prisma.onboardingPdfJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.onboardingPdfJob.count({ where }),
  ]);

  const countByStatus: Record<JobStatus, number> = {
    pending: 0,
    processing: 0,
    success: 0,
    error: 0,
  };
  for (const row of counts) {
    if (row.status in countByStatus) {
      countByStatus[row.status as JobStatus] = row._count._all;
    }
  }

  return {
    filters: { status, type, q },
    errorCount: countByStatus.error,
    matchCount,
    truncated: matchCount > PAGE_SIZE,
    jobs: jobs.map((j) => ({
      id: j.id,
      documentType: j.documentType,
      status: j.status,
      filePath: j.filePath,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
      processedAt: j.processedAt?.toISOString() ?? null,
      talent: j.talent
        ? {
            id: j.talent.id,
            name: `${j.talent.prenom} ${j.talent.nom}`.trim(),
          }
        : null,
    })),
    countByStatus,
  };
};

// Re-runs the background generation for a job. The runner claims any
// not-yet-succeeded row, so this recovers both `error` jobs and ones stranded
// in `pending`/`processing` by a crash. Fire-and-forget — the page reloads to
// show the job back in `processing`, then `success` on the next refresh.
export const actions: Actions = {
  retry: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const job = await prisma.onboardingPdfJob.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!job) return fail(404, { message: 'Job introuvable.' });
    if (job.status === 'success')
      return fail(409, { message: 'Ce job a déjà réussi.' });

    void runOnboardingPdfJob(id);
    return { success: true };
  },

  retryAll: async () => {
    const failed = await prisma.onboardingPdfJob.findMany({
      where: { status: 'error' },
      select: { id: true },
    });
    for (const { id } of failed) void runOnboardingPdfJob(id);
    return { success: true, count: failed.length };
  },

  // Mints a short-lived signed URL for a generated PDF so the admin can open it.
  view: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const job = await prisma.onboardingPdfJob.findUnique({
      where: { id },
      select: { filePath: true },
    });
    if (!job?.filePath)
      return fail(404, { message: 'Aucun fichier pour ce job.' });

    try {
      const url = await getStorage().getDownloadUrl(job.filePath);
      return { url };
    } catch (err) {
      console.error('[onboarding-pdf-job] signed URL failed:', err);
      return fail(500, { message: 'Erreur lors de la génération du lien.' });
    }
  },
};
