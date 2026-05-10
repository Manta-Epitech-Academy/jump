import { env } from '$env/dynamic/private';

/**
 * How interview events get pushed to staff calendars.
 *
 *   - `email` (default): server emails an iCalendar invite (`METHOD:REQUEST`)
 *     via Resend; the staff member's mail client (Outlook / Apple Mail /
 *     Gmail) writes the event on accept. No OAuth scope needed; works for
 *     every staff regardless of tenant policy. Also lets us reconcile
 *     calendars for staff *other than the actor* — useful for reassign
 *     and bulk auto-schedule fan-out.
 *   - `graph`: server writes directly to Outlook via Microsoft Graph using
 *     each user's delegated `Calendars.ReadWrite` token. Smoother UX than
 *     email but requires Epitech tenant admin to grant the scope (default
 *     Azure policy gates it behind an "approval required" prompt). Opt in
 *     once admin consent is in hand.
 *   - `off`: feature disabled. Sync controls hide; no background calls.
 *
 * The `INTERVIEW_SYNC_MODE` env var picks at server start. Flipping
 * between modes is just an env change + redeploy.
 */
export type CalendarSyncMode = 'graph' | 'email' | 'off';

const RAW = (env.INTERVIEW_SYNC_MODE ?? 'email').toLowerCase();

export const calendarSyncMode: CalendarSyncMode =
  RAW === 'graph' || RAW === 'off' ? RAW : 'email';

export function isGraphMode(): boolean {
  return calendarSyncMode === 'graph';
}
export function isEmailMode(): boolean {
  return calendarSyncMode === 'email';
}
export function isSyncEnabled(): boolean {
  return calendarSyncMode !== 'off';
}
