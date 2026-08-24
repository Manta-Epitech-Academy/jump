/**
 * The class A writes that unblock something: a stuck document, a pile of sync
 * errors, a lycée the annuaire never resolved, and an interview closed by
 * mistake.
 *
 * Each delegates to the service the admin pages already use, so a repair made
 * from a chat is the same repair a human would have made from the screen.
 * Idempotency is stated per write below, because a model retries on timeout and
 * has to know whether that is safe.
 */

import { prisma } from '$lib/server/db';
import { runOnboardingPdfJob } from '$lib/server/services/onboardingPdfJobService';
import {
  resolveSyncErrors,
  resolveAllSyncErrors,
} from '$lib/server/services/syncErrorService';
import { resolveSchoolByUai } from '$lib/server/services/schoolService';
import { resetInterview } from '$lib/server/services/interviewResetService';
import { OperationRefusedError } from '../errors';
import { handleProvenanceFr } from '../handles';
import type { WriteOutcome } from '../plan';

/** How many unresolved schools one call will try to enrich. */
export const SCHOOL_RESOLVE_LIMIT = 25;

// ── Retry one onboarding document ────────────────────────────────────────────

/**
 * Safe to repeat: the job claims itself with an update scoped to rows that have
 * not succeeded, so a second call on an already-generated document does
 * nothing. Generation stores a file and sends no message.
 */
export async function retryPdfJob(params: {
  jobId: string;
}): Promise<WriteOutcome> {
  const job = await prisma.onboardingPdfJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, documentType: true, status: true, filePath: true },
  });
  if (!job) {
    throw new OperationRefusedError(
      `Génération « ${params.jobId} » introuvable. ${handleProvenanceFr('pdfJobId')}`,
    );
  }
  if (job.status === 'success') {
    throw new OperationRefusedError(
      'Ce document a déjà été généré : il n’y a rien à relancer.',
    );
  }

  const before = { status: job.status, hasFile: job.filePath != null };
  // Awaited on purpose. Everywhere else this runs detached (a talent must not
  // wait on a PDF), but here the caller asked for the outcome, and answering
  // "relancé" without knowing whether it worked is exactly the kind of
  // confident non-answer this tier exists to avoid.
  await runOnboardingPdfJob(job.id);

  const after = await prisma.onboardingPdfJob.findUnique({
    where: { id: job.id },
    select: { status: true, filePath: true, errorMessage: true },
  });

  return {
    applied: true,
    before,
    after: {
      status: after?.status ?? 'unknown',
      hasFile: after?.filePath != null,
      error: after?.errorMessage ?? null,
    },
  };
}

// ── Clear sync errors ────────────────────────────────────────────────────────

/**
 * Safe to repeat: resolving is a flag, and the update is scoped to rows still
 * unresolved, so a second call clears nothing and reports zero.
 */
export async function resolveSyncErrorRows(params: {
  errorType?: string;
}): Promise<WriteOutcome> {
  // By kind, or not at all. The operation used to take a list of row ids as well,
  // and no read in the catalogue has ever returned a `SyncError.id`, so that
  // branch could not be reached by the one consumer this tier has. Between adding
  // a read to feed a parameter and removing a parameter nothing can feed, the
  // second is the honest move: `errorType` and `ops_resolve_all_sync_errors`
  // already cover the act.
  if (!params.errorType) {
    throw new OperationRefusedError(
      "Précisez le type d'erreur à traiter. Sans filtre, l'opération viderait toute la file d'un coup ; c'est ce que fait ops_resolve_all_sync_errors, délibérément à part.",
    );
  }

  const before = await prisma.syncError.count({ where: { resolved: false } });

  const rows = await prisma.syncError.findMany({
    where: { resolved: false, errorType: params.errorType },
    select: { id: true },
  });
  const resolved = (await resolveSyncErrors(rows.map((r) => r.id))).count;

  const after = await prisma.syncError.count({ where: { resolved: false } });
  return {
    applied: true,
    before: { unresolved: before },
    after: { unresolved: after, resolved },
  };
}

/** Kept apart from the filtered path: emptying the whole queue is its own act. */
export async function resolveAllSyncErrorRows(): Promise<WriteOutcome> {
  const before = await prisma.syncError.count({ where: { resolved: false } });
  const { count } = await resolveAllSyncErrors();
  return {
    applied: true,
    before: { unresolved: before },
    after: { unresolved: 0, resolved: count },
  };
}

// ── Re-resolve unidentified schools ──────────────────────────────────────────

/**
 * Safe to repeat: a school that resolves stops being a candidate, and one whose
 * UAI the annuaire still does not know is simply retried, at no cost beyond the
 * lookup. Nothing is written when the annuaire has nothing to say.
 */
export async function resolveSchools(params: {
  limit?: number;
}): Promise<WriteOutcome> {
  const limit = Math.min(
    Math.max(params.limit ?? SCHOOL_RESOLVE_LIMIT, 1),
    SCHOOL_RESOLVE_LIMIT,
  );
  // The whole queue, not just the slice this call will attempt: `before` has to
  // be the state of the world, or a caller reads "25 en attente, 5 résolus" off
  // a queue of three hundred and concludes it is nearly done.
  const [unresolved, pending] = await Promise.all([
    prisma.school.count({ where: { resolvedAt: null } }),
    prisma.school.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, uai: true, name: true },
    }),
  ]);

  for (const school of pending) {
    // Enriches in place when the annuaire answers; a failure leaves the row
    // exactly as it was, to be retried another day.
    await resolveSchoolByUai(school.uai);
  }

  const stillPending = await prisma.school.count({
    where: { id: { in: pending.map((s) => s.id) }, resolvedAt: null },
  });
  const resolved = pending.length - stillPending;

  return {
    applied: true,
    before: { unresolved },
    after: {
      // Same key on both sides, so the audit row reads as a change; `attempted`
      // says how much of the queue this one call could touch.
      unresolved: unresolved - resolved,
      attempted: pending.length,
      resolved,
    },
  };
}

// ── Reset an interview ───────────────────────────────────────────────────────

/**
 * NOT safe to repeat, and the only write here that destroys anything: the
 * interview row is deleted so the talent returns to "à faire" and a fresh one
 * can be conducted. The answers do not come back.
 *
 * Two things keep that defensible. The id can only come from the admin
 * interviews page, since no operation in this tier returns one, so a model
 * cannot pick a victim on its own. And what lands on the audit row is a summary
 * of what was discarded - its state, when it was held, how many questions had
 * been answered, the team's verdict - never the answers themselves, which are a
 * minor's and have no business sitting in a call log for the retention window.
 */
export async function resetInterviewById(params: {
  interviewId: string;
  reason: string;
  /** `bauth_user.id` behind the call, resolved to a staff profile below. */
  actorUserId: string;
}): Promise<WriteOutcome> {
  const interview = await prisma.interview.findUnique({
    where: { id: params.interviewId },
    select: {
      id: true,
      status: true,
      conductedAt: true,
      recommendation: true,
      discoveryChannel: true,
      motivation: true,
      orientationTalkAtSchool: true,
      passionateTeacher: true,
      wantsMore: true,
      satisfactionStars: true,
    },
  });
  if (!interview) {
    throw new OperationRefusedError(
      `Entretien « ${params.interviewId} » introuvable : il a peut-être déjà été réinitialisé. ${handleProvenanceFr('interviewId')}`,
    );
  }
  // The `InterviewReset` trail names a staff profile, not an account: a reset
  // that cannot be attributed to a colleague is a reset that does not happen.
  const staff = await prisma.staffProfile.findUnique({
    where: { userId: params.actorUserId },
    select: { id: true },
  });
  if (!staff) {
    throw new OperationRefusedError(
      "Réinitialiser un entretien demande de savoir qui le fait, et ce token n'est rattaché à aucun profil de l'équipe.",
    );
  }

  const answered = [
    interview.discoveryChannel,
    interview.motivation,
    interview.orientationTalkAtSchool,
    interview.passionateTeacher,
    interview.wantsMore,
    interview.satisfactionStars,
  ].filter((value) => value != null).length;

  const result = await resetInterview({
    interviewId: interview.id,
    resetByStaffId: staff.id,
    reason: params.reason,
  });
  if (!result) {
    throw new OperationRefusedError(
      'Cet entretien vient de disparaître : quelqu’un d’autre l’a réinitialisé entre-temps.',
    );
  }

  return {
    applied: true,
    // A summary, never the answers: see the note above.
    before: {
      status: interview.status,
      conductedAt: interview.conductedAt.toISOString(),
      answeredQuestions: answered,
      recommendation: interview.recommendation,
    },
    after: { status: 'à faire', reason: params.reason },
  };
}
