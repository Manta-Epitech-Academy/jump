import { prisma } from '$lib/server/db';

/**
 * Mark a BroadcastRecipient as opened, idempotently and fire-and-forget.
 *
 * The `openedAt: null` filter makes the first hit win, so repeat clicks are
 * no-ops; `updateMany` silently no-ops on an unknown id. The write is never
 * awaited: open-tracking must not block or fail the request it rides on (an
 * email-link page load, a fastlogin redirect), so errors are swallowed.
 *
 * Two paths reach this: the `tracking_id` query param appended by
 * `linkRewriter` (validated in `hooks.server.ts`), and the `recipientId`
 * embedded in a fastlogin JWT (for links not wrapped in an `<a>`, where the
 * tracking param never gets added).
 */
export function markRecipientOpened(recipientId: string): void {
  prisma.broadcastRecipient
    .updateMany({
      where: { id: recipientId, openedAt: null },
      data: { openedAt: new Date() },
    })
    .catch(() => {});
}
