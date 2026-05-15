import type { CalendarSyncMode } from './config';

export type ReconcileOpts = {
  staffProfileId: string;
  userId: string;
  eventId: string;
  /**
   * IANA timezone of the campus that owns the event. Used by the email
   * backend to format the human-readable body (subject line, "Acceptez
   * l'invitation" text) in local time. The `.ics` attachment itself
   * stays UTC per RFC 5545 — recipient mail clients localize that.
   */
  timezone: string;
};

export type CalendarSyncSummary = {
  /** Newly created (Graph: POST event / Email: first invite). */
  created: number;
  /** Updated in place (Graph: PATCH / Email: SEQUENCE-bumped REQUEST). */
  updated: number;
  /** Removed (Graph: DELETE / Email: METHOD:CANCEL). */
  deleted: number;
  /** Per-row failures the backend chose not to throw on. */
  failed: number;
};

export type CalendarSyncStatus =
  /** Graph mode: token healthy. lastRefreshedAt is the bauth_account
   *  updatedAt from the last successful refresh. */
  | { kind: 'connected'; lastRefreshedAt: Date | null }
  /** Graph mode: user must re-OAuth (no account, missing scope, or
   *  refresh-token revoked). UI surfaces "Connecter Outlook". */
  | {
      kind: 'needs_reauth';
      reason: 'no_account' | 'missing_scope' | 'no_refresh_token';
    }
  /** Email mode: always usable (no auth state). Reports the user's
   *  mailbox so the UI can confirm where invites go. */
  | { kind: 'email_ready'; recipient: string | null };

export type CalendarSyncState = {
  mode: CalendarSyncMode;
  status: CalendarSyncStatus;
  /** Number of OutlookCalendarSync rows for (user, event). */
  syncedCount: number;
  /** Most recent `syncedAt` across the user's rows on this event. */
  lastSyncedAt: Date | null;
};

export type ReconcileResult =
  | CalendarSyncSummary
  | { error: 'needs_reauth' | 'disabled' | 'no_email' };

export interface CalendarSyncBackend {
  readonly mode: CalendarSyncMode;
  reconcile(opts: ReconcileOpts): Promise<ReconcileResult>;
  loadState(opts: ReconcileOpts): Promise<CalendarSyncState>;
}
