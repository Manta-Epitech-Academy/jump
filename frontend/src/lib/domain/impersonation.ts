// How long an impersonation session stays alive. It behaves as an *idle*
// timeout, not an absolute one: the server slides it forward while the admin is
// active (`slideImpersonationExpiry`) and the client counts the same window of
// inactivity before bowing out gracefully (`ImpersonationAutoExit`). Shared so
// both sides, plus BetterAuth's `impersonationSessionDuration` (the creation
// window), stay in lockstep.
//
// Client-safe on purpose (no server imports): the browser timer needs this too.
export const IMPERSONATION_IDLE_WINDOW_SEC = 30 * 60;
