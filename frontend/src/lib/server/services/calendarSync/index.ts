/**
 * Mode-aware calendar sync façade. Picks the active backend at module load
 * based on `INTERVIEW_SYNC_MODE`. Callers depend only on this file — flip
 * the env var, redeploy, no code changes.
 *
 *   - graph  → Microsoft Graph push (`./graph.ts`)
 *   - email  → iCalendar invite emails (`./email.ts`)
 *   - off    → no-op backend (sync controls hide in UI)
 *
 * Public API mirrors the previous `outlookSync.ts` — same names, same
 * shapes — so existing call sites only swap the import path.
 */

import { calendarSyncMode } from './config';
import { prisma } from '$lib/server/db';
import type {
  CalendarSyncBackend,
  CalendarSyncState,
  ReconcileOpts,
  ReconcileResult,
} from './types';
import { graphBackend } from './graph';
import { emailBackend } from './email';
import { reconcileKey, scheduleReconcile } from './scheduler';

export type { CalendarSyncMode } from './config';
export {
  calendarSyncMode,
  isGraphMode,
  isEmailMode,
  isSyncEnabled,
} from './config';
export type {
  CalendarSyncBackend,
  CalendarSyncState,
  CalendarSyncStatus,
  CalendarSyncSummary,
  ReconcileOpts,
  ReconcileResult,
} from './types';

const noopBackend: CalendarSyncBackend = {
  mode: 'off',
  async reconcile(): Promise<ReconcileResult> {
    return { error: 'disabled' };
  },
  async loadState(): Promise<CalendarSyncState> {
    return {
      mode: 'off',
      status: { kind: 'email_ready', recipient: null },
      syncedCount: 0,
      lastSyncedAt: null,
    };
  },
};

const backend: CalendarSyncBackend =
  calendarSyncMode === 'graph'
    ? graphBackend
    : calendarSyncMode === 'email'
      ? emailBackend
      : noopBackend;

/**
 * Reconcile the actor's calendar for an event and return the result. Routed
 * through the per-(user, event) coalescing scheduler so a foreground call
 * landing on a key that already has an in-flight pass shares that pass's
 * result rather than racing it — see {@link scheduleReconcile}.
 */
export async function reconcileForStaff(
  opts: ReconcileOpts,
): Promise<ReconcileResult> {
  return scheduleReconcile(reconcileKey(opts.userId, opts.eventId), () =>
    backend.reconcile(opts),
  );
}

/**
 * Fire-and-forget reconcile fan-out. Resolves each staff profile to its
 * owning user, then asks the backend to reconcile that user's calendar
 * for the event. Email backend writes for arbitrary users (Resend doesn't
 * need the recipient's token), so reassign / autoSchedule fan-out actually
 * lands invites in everyone's mailbox. Graph backend silently no-ops for
 * users it doesn't have a stored token for — same code path, no harm.
 *
 * Each per-staff reconcile is queued through the coalescing scheduler keyed
 * by (userId, eventId), so a burst of triggers on the same key (saveGrid →
 * updateStatus → reassign) collapses into at most one extra pass after the
 * current one finishes. Removes the `OutlookCalendarSync(interviewId,
 * userId)` race that previously surfaced as P2002 + duplicate invites.
 *
 * Never throws, never blocks the calling action's response.
 */
export function backgroundReconcile(opts: {
  eventId: string;
  staffProfileIds: readonly string[];
  /** Campus timezone — propagated into ReconcileOpts. */
  timezone: string;
}): void {
  if (calendarSyncMode === 'off') return;
  if (opts.staffProfileIds.length === 0) return;
  void (async () => {
    try {
      const profiles = await prisma.staffProfile.findMany({
        where: { id: { in: [...opts.staffProfileIds] } },
        select: { id: true, userId: true },
      });
      for (const p of profiles) {
        scheduleReconcile(reconcileKey(p.userId, opts.eventId), () =>
          backend.reconcile({
            staffProfileId: p.id,
            userId: p.userId,
            eventId: opts.eventId,
            timezone: opts.timezone,
          }),
        ).catch((err: unknown) => {
          console.error('background reconcile (per-staff) failed', err);
        });
      }
    } catch (err) {
      console.error('background reconcile fan-out failed', err);
    }
  })();
}

export async function loadCalendarSyncState(opts: {
  userId: string;
  staffProfileId: string;
  eventId: string;
  timezone: string;
}): Promise<CalendarSyncState> {
  return backend.loadState(opts);
}

/**
 * Force-resync escape hatch for the email backend. Clears `contentHash` on
 * every email-mode sync row matching the scope, so the next reconcile pass
 * cannot dedupe and re-emits a REQUEST (with a bumped sequence) for each
 * row. UID is preserved, so recipient mail clients merge the new invite
 * onto the existing event rather than creating a duplicate.
 *
 * Two scopes:
 *   - `{ scope: 'event' }` — every staff on the event. Use for the
 *     dev-only "Tout renvoyer" action (recovery after a wrong recipient
 *     batch, e.g. dev-redirect set after the first send).
 *   - `{ scope: 'user' }` — just one user's rows. Use for the actor's
 *     personal re-send.
 *
 * Returns the number of rows touched. Caller is expected to invoke
 * `backgroundReconcile` (or `reconcileForStaff`) afterwards to actually
 * re-emit the invites.
 *
 * No-op outside email mode — graph backend doesn't dedupe via
 * `contentHash`, every reconcile already pushes the latest body. Returns
 * `0` so callers don't need to special-case the mode.
 */
export async function clearEmailSyncCache(
  opts:
    | { scope: 'event'; eventId: string }
    | { scope: 'user'; userId: string; eventId: string },
): Promise<number> {
  if (calendarSyncMode !== 'email') return 0;
  const where =
    opts.scope === 'event'
      ? {
          syncKind: 'email',
          interview: { participation: { eventId: opts.eventId } },
        }
      : {
          syncKind: 'email',
          userId: opts.userId,
          interview: { participation: { eventId: opts.eventId } },
        };
  const result = await prisma.outlookCalendarSync.updateMany({
    where,
    data: { contentHash: null },
  });
  return result.count;
}
