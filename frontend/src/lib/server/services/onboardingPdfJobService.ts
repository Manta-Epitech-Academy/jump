import { prisma } from '$lib/server/db';
import { generateOnboardingPDF } from './onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';

type DocumentType = 'charter' | 'rules' | 'image-rights';

type PdfJobPayload = {
  studentName: string;
  city?: string;
  signerName?: string;
  relationship?: string;
  signedAt: string;
};

const FILE_PATH_FIELD: Record<
  DocumentType,
  'charterFilePath' | 'rulesFilePath' | 'imageRightsFilePath'
> = {
  charter: 'charterFilePath',
  rules: 'rulesFilePath',
  'image-rights': 'imageRightsFilePath',
};

async function processOne(jobId: string): Promise<'success' | 'error'> {
  const job = await prisma.onboardingPdfJob.findUnique({
    where: { id: jobId },
  });
  if (!job || job.status !== 'pending') return 'success';

  const payload = job.payload as PdfJobPayload;
  const documentType = job.documentType as DocumentType;

  try {
    const pdf = await generateOnboardingPDF({
      type: documentType,
      studentName: payload.studentName,
      signerName: payload.signerName,
      relationship: payload.relationship,
      city: payload.city,
      signedAt: new Date(payload.signedAt),
    });

    const storage = getStorage();
    const key = `documents/${job.talentId}/${documentType}-${new Date(payload.signedAt).getTime()}.pdf`;
    await storage.save(key, pdf);

    const filePathField = FILE_PATH_FIELD[documentType];
    await prisma.$transaction([
      prisma.talent.update({
        where: { id: job.talentId },
        data: { [filePathField]: key },
      }),
      prisma.onboardingPdfJob.update({
        where: { id: job.id },
        data: {
          status: 'success',
          filePath: key,
          errorMessage: null,
          processedAt: new Date(),
        },
      }),
    ]);
    return 'success';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.onboardingPdfJob.update({
      where: { id: job.id },
      data: {
        status: 'error',
        errorMessage: message,
        processedAt: new Date(),
      },
    });
    console.error(`[onboarding-pdf-job] ${jobId} failed:`, err);
    return 'error';
  }
}

/**
 * Drains all pending onboarding-PDF jobs. Each job is processed in
 * isolation so one failure does not abort the rest. Returns per-status
 * counts for the cron caller.
 */
export async function processPendingOnboardingPdfJobs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await prisma.onboardingPdfJob.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;
  for (const { id } of pending) {
    const outcome = await processOne(id);
    if (outcome === 'success') succeeded++;
    else failed++;
  }

  return { processed: pending.length, succeeded, failed };
}
