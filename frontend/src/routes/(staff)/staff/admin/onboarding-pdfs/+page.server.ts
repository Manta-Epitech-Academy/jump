import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';

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

  const countByStatus = {
    pending: 0,
    success: 0,
    error: 0,
  } as Record<'pending' | 'success' | 'error', number>;
  for (const row of counts) {
    if (
      row.status === 'pending' ||
      row.status === 'success' ||
      row.status === 'error'
    ) {
      countByStatus[row.status] = row._count._all;
    }
  }

  const errorCount = countByStatus.error;

  return {
    errorCount,
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

// Re-queue an errored job for the next cron tick. Limited to status='error'
// so the action can't yank a successful job back into pending (which would
// duplicate the S3 file on the next run).
export const actions: Actions = {
  retry: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return fail(400);

    const updated = await prisma.onboardingPdfJob.updateMany({
      where: { id, status: 'error' },
      data: { status: 'pending', errorMessage: null, processedAt: null },
    });
    if (updated.count === 0)
      return fail(409, { message: 'Job introuvable ou non-errored.' });

    return { success: true };
  },

  retryAll: async () => {
    const updated = await prisma.onboardingPdfJob.updateMany({
      where: { status: 'error' },
      data: { status: 'pending', errorMessage: null, processedAt: null },
    });
    return { success: true, count: updated.count };
  },
};
