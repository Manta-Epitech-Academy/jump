import { prisma } from '$lib/server/db';

/**
 * Reset (delete) a closing that was finalised by mistake.
 *
 * The clôture is a one-way door for the dev team that conducts closings, so one
 * opened "to test the feature" and then closed cannot be undone from the dev
 * space. This is the admin escape hatch: the {@link Closing_Record} row is
 * hard-deleted, which returns the talent to "à faire" everywhere (every read
 * derives state from the row's presence), so a brand-new closing can be
 * conducted normally. No answers carry over - they cascade with the record.
 *
 * Deletion, not a soft "voided" status: the discarded closing is an error to
 * erase, not a domain fact to preserve, and its answers about a minor should not
 * linger (RGPD). The only thing kept is a {@link Closing_ResetEvent} audit row,
 * so a destructive reversal of a colleague's finalised work never happens
 * silently.
 *
 * @returns the talent id of the reset closing, or `null` if the id matched no
 * closing (already reset, or a stale row from a concurrent action).
 */
export async function resetClosing(params: {
  closingId: string;
  resetByStaffId: string;
  reason: string;
}): Promise<{ talentId: string } | null> {
  const { closingId, resetByStaffId, reason } = params;

  const closing = await prisma.closing_Record.findUnique({
    where: { id: closingId },
    select: { id: true, talentId: true, staffId: true, conductedAt: true },
  });
  if (!closing) return null;

  // Audit-then-delete in one transaction so the trace can never be lost while
  // the closing itself is gone.
  await prisma.$transaction([
    prisma.closing_ResetEvent.create({
      data: {
        talentId: closing.talentId,
        conductedByStaffId: closing.staffId,
        conductedAt: closing.conductedAt,
        resetByStaffId,
        reason,
      },
    }),
    prisma.closing_Record.delete({ where: { id: closing.id } }),
  ]);

  return { talentId: closing.talentId };
}
