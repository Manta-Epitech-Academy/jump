// How long an impersonation session stays alive. It behaves as an *idle*
// timeout, not an absolute one: the server slides it forward while the admin is
// active (`slideImpersonationExpiry`) and the client counts the same window of
// inactivity before bowing out gracefully (`ImpersonationAutoExit`). Shared so
// both sides, plus BetterAuth's `impersonationSessionDuration` (the creation
// window), stay in lockstep.
//
// Client-safe on purpose (no server imports): the browser timer needs this too.
export const IMPERSONATION_IDLE_WINDOW_SEC = 30 * 60;

/**
 * The admin's user id behind an impersonated session, or null for a session
 * its user opened themselves. BetterAuth writes it on the session row
 * (`impersonatedBy`), which its types do not declare, so every reader, server
 * or browser, goes through here rather than casting on its own.
 *
 * This says the session is an impersonation, not that the admin still holds
 * the authority: that is `locals.impersonator`, checked by the hook.
 */
export function impersonatedBy(session: unknown): string | null {
  const id = (session as { impersonatedBy?: string | null } | null)
    ?.impersonatedBy;
  return id || null;
}
