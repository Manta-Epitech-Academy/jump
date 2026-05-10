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

export async function reconcileForStaff(
  opts: ReconcileOpts,
): Promise<ReconcileResult> {
  return backend.reconcile(opts);
}

/**
 * Fire-and-forget reconcile fan-out. Resolves each staff profile to its
 * owning user, then asks the backend to reconcile that user's calendar
 * for the event. Email backend writes for arbitrary users (Resend doesn't
 * need the recipient's token), so reassign / autoSchedule fan-out actually
 * lands invites in everyone's mailbox. Graph backend silently no-ops for
 * users it doesn't have a stored token for — same code path, no harm.
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
      await Promise.all(
        profiles.map((p) =>
          backend
            .reconcile({
              staffProfileId: p.id,
              userId: p.userId,
              eventId: opts.eventId,
              timezone: opts.timezone,
            })
            .catch((err: unknown) => {
              console.error('background reconcile (per-staff) failed', err);
            }),
        ),
      );
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
