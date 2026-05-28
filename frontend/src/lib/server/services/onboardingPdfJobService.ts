import type { Prisma, OnboardingPdfJob } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import { generateOnboardingPDF } from './onboardingDocumentGenerator';
import { getStorage } from '$lib/server/infra/storage';
import {
  ONBOARDING_DOCUMENTS,
  type OnboardingDocumentType,
} from './onboardingDocuments';

export type OnboardingPdfDocumentType = OnboardingDocumentType;

// Snapshot of the generator inputs, frozen at signature time. Parsed (not
// cast) on read so a malformed payload surfaces as a clean job error instead
// of throwing midway through Puppeteer.
const payloadSchema = z.object({
  studentName: z.string(),
  city: z.string().optional(),
  signerName: z.string().optional(),
  relationship: z.string().optional(),
  // image-rights only: which way the guardian decided. Optional for back-compat
  // with rows enqueued before refusal existed (the generator defaults to accept).
  decision: z.enum(['accepted', 'refused']).optional(),
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
  // Invariant: this never rejects. Callers fire it as `void runOnboardingPdfJob(id)`
  // with no `.catch`, so a leaked rejection would become an unhandledRejection and
  // (Node ≥ 15) take down the whole server for a background PDF task. The two failure
  // domains are handled differently: a *generation* failure is recorded on the row so
  // the admin can see and retry it; an *infra* failure around the claim itself (DB
  // unreachable) leaves nothing to write to, so it's only logged and the row is left
  // in place for a later manual retry.
  let job: OnboardingPdfJob | null = null;
  try {
    // Claim: flip a not-yet-succeeded row to `processing`. A zero count means the
    // job already succeeded (or was deleted) — nothing left to do. `updatedAt` is
    // bumped here, which is what marks "processing since" for stranded detection.
    const claimed = await prisma.onboardingPdfJob.updateMany({
      where: { id: jobId, status: { not: 'success' } },
      data: { status: 'processing', errorMessage: null, processedAt: null },
    });
    if (claimed.count === 0) return;

    job = await prisma.onboardingPdfJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const payload = payloadSchema.parse(job.payload);
    const documentType = job.documentType as OnboardingPdfDocumentType;

    const pdf = await generateOnboardingPDF({
      type: documentType,
      decision: payload.decision,
      studentName: payload.studentName,
      signerName: payload.signerName,
      relationship: payload.relationship,
      city: payload.city,
      signedAt: new Date(payload.signedAt),
    });

    const storage = getStorage();
    const key = `documents/${job.talentId}/${documentType}-${new Date(payload.signedAt).getTime()}.pdf`;
    await storage.save(key, pdf);

    const filePathField = ONBOARDING_DOCUMENTS[documentType].filePathField;
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
    // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
    console.error(`[onboarding-pdf-job] ${jobId} failed:`, err);
    // Record the failure only if the claim succeeded — otherwise we have no row we
    // own. Guard the write itself so a secondary DB failure can't re-leak.
    if (job) {
      await prisma.onboardingPdfJob
        .update({
          where: { id: jobId },
          data: {
            status: 'error',
            errorMessage: message,
            processedAt: new Date(),
          },
        })
        .catch((e) =>
          // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
          console.error(`[onboarding-pdf-job] ${jobId} error-write failed:`, e),
        );
    }
  }
}

/**
 * A `processing` row whose last state change predates this window is treated as
 * crash-stranded rather than legitimately in-flight, and re-exposed for retry.
 *
 * Generation itself is seconds, but a whole cohort signing at once queues jobs
 * behind the browser pool (cap 5) — a job can sit in `processing` for a few
 * minutes simply waiting for a slot. The window is deliberately generous so a
 * queued job is never mistaken for a dead one; on the off chance a still-queued
 * job is retried anyway, {@link runOnboardingPdfJob} is idempotent (same
 * signature-keyed S3 object), so the worst case is one wasted generation.
 */
export const STRANDED_AFTER_MS = 5 * 60_000;

/**
 * Whether the admin page should offer a manual "Relancer" for a job. `error` and
 * `pending` always; `processing` only once {@link STRANDED_AFTER_MS} has elapsed
 * since its last state change (`updatedAt`); `success` never.
 */
export function isOnboardingPdfJobRetryable(job: {
  status: string;
  updatedAt: Date;
}): boolean {
  switch (job.status) {
    case 'error':
    case 'pending':
      return true;
    case 'processing':
      return Date.now() - job.updatedAt.getTime() >= STRANDED_AFTER_MS;
    default:
      return false;
  }
}
