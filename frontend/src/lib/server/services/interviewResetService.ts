import { prisma } from '$lib/server/db';

/**
 * Reset (delete) an orientation interview that was finalized by mistake.
 *
 * The clôture is a one-way door for the dev team that conducts interviews, so
 * an interview opened "to test the feature" and then closed cannot be undone
 * from the dev space. This is the admin escape hatch: the {@link Interview} row
 * is hard-deleted, which returns the talent to "à faire" everywhere (every read
 * derives state from the row's presence), so a brand-new interview can be
 * conducted normally. No answers carry over.
 *
 * Deletion, not a soft "voided" status: the discarded interview is an error to
 * erase, not a domain fact to preserve, and its answers about a minor should not
 * linger (RGPD). The only thing kept is an {@link InterviewReset} audit row, so a
 * destructive reversal of a colleague's finalized work never happens silently.
 *
 * @returns the talent id of the reset interview, or `null` if the id matched no
 * interview (already reset, or stale row from a concurrent action).
 */
export async function resetInterview(params: {
  interviewId: string;
  resetByStaffId: string;
  reason: string;
}): Promise<{ talentId: string } | null> {
  const { interviewId, resetByStaffId, reason } = params;

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { id: true, talentId: true, staffId: true, conductedAt: true },
  });
  if (!interview) return null;

  // Audit-then-delete in one transaction so the trace can never be lost while
  // the interview itself is gone.
  await prisma.$transaction([
    prisma.interviewReset.create({
      data: {
        talentId: interview.talentId,
        conductedByStaffId: interview.staffId,
        conductedAt: interview.conductedAt,
        resetByStaffId,
        reason,
      },
    }),
    prisma.interview.delete({ where: { id: interview.id } }),
  ]);

  return { talentId: interview.talentId };
}
