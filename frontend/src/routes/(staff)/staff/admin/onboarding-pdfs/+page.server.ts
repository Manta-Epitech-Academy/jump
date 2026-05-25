import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { runOnboardingPdfJob } from '$lib/server/services/onboardingPdfJobService';

type JobStatus = 'pending' | 'processing' | 'success' | 'error';

export const load: PageServerLoad = async () => {
  const [jobs, counts] = await Promise.all([
    prisma.onboardingPdfJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
      },
    }),
    prisma.onboardingPdfJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
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
    errorCount: countByStatus.error,
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
};
