import type { Prisma, OnboardingPdfJob } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { generateOnboardingPDF } from './onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';

export type OnboardingPdfDocumentType = 'charter' | 'rules' | 'image-rights';

const FILE_PATH_FIELD: Record<
  OnboardingPdfDocumentType,
  'charterFilePath' | 'rulesFilePath' | 'imageRightsFilePath'
> = {
  charter: 'charterFilePath',
  rules: 'rulesFilePath',
  'image-rights': 'imageRightsFilePath',
};

// Snapshot of the generator inputs, frozen at signature time. Parsed (not
// cast) on read so a malformed payload surfaces as a clean job error instead
// of throwing midway through Puppeteer.
const payloadSchema = z.object({
  studentName: z.string(),
  city: z.string().optional(),
  signerName: z.string().optional(),
  relationship: z.string().optional(),
  signedAt: z.string(),
});
export type OnboardingPdfJobPayload = z.infer<typeof payloadSchema>;

/**
 * Records a PDF-generation job in the SAME transaction as the signature it
 * documents, so the queue entry can never diverge from the signed fact.
 * Does not run it — call {@link runOnboardingPdfJob} once the transaction has
 * committed (the row must be visible before the background worker reads it).
 */
export function enqueueOnboardingPdfJob(
  tx: Prisma.TransactionClient,
  args: {
    talentId: string;
    documentType: OnboardingPdfDocumentType;
    payload: OnboardingPdfJobPayload;
  },
): Promise<OnboardingPdfJob> {
  return tx.onboardingPdfJob.create({
    data: {
      talentId: args.talentId,
      documentType: args.documentType,
      payload: args.payload,
    },
  });
}

/**
 * Generates the PDF + uploads it to S3 for one job, then writes the resulting
 * key back onto the talent.
 *
 * Fire-and-forget: callers do `void runOnboardingPdfJob(id)` right after the
 * enqueueing transaction commits, so the HTTP response (the redirect to the
 * dashboard) is never blocked by Puppeteer/S3 latency — the file lands a few
 * seconds later. The browser pool (max 5 concurrent) is the natural backpressure
 * when a whole cohort signs at once.
 *
 * Idempotent and safe to re-invoke from the admin dashboard to recover a failed
 * — or crash-stranded — job: it claims any not-yet-succeeded row, regenerates,
 * and overwrites the same signature-timestamp-keyed S3 object.
 */
export async function runOnboardingPdfJob(jobId: string): Promise<void> {
  // Claim: flip a not-yet-succeeded row to `processing`. A zero count means the
  // job already succeeded (or was deleted) — nothing left to do.
  const claimed = await prisma.onboardingPdfJob.updateMany({
    where: { id: jobId, status: { not: 'success' } },
    data: { status: 'processing', errorMessage: null, processedAt: null },
  });
  if (claimed.count === 0) return;

  const job = await prisma.onboardingPdfJob.findUnique({
    where: { id: jobId },
  });
  if (!job) return;

  try {
    const payload = payloadSchema.parse(job.payload);
    const documentType = job.documentType as OnboardingPdfDocumentType;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.onboardingPdfJob.update({
      where: { id: jobId },
      data: { status: 'error', errorMessage: message, processedAt: new Date() },
    });
    console.error(`[onboarding-pdf-job] ${jobId} failed:`, err);
  }
}
