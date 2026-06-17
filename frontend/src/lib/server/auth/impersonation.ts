import { prisma } from '$lib/server/db';
import { IMPERSONATION_IDLE_WINDOW_SEC } from '$lib/domain/impersonation';

// BetterAuth creates an impersonation session with a *fixed* `expiresAt`
// (now + the window). Its normal sliding refresh never reliably fires inside so
// short a window, so without help the value is an absolute wall: at N minutes
// the admin is bounced to the login screen and, because impersonation swapped
// the session cookie, loses their own (separate, still-valid) admin session
// with it.
//
// `slideImpersonationExpiry` turns that wall into an *idle* timeout: on each
// request the admin makes while impersonating, it pushes the expiry back to
// now + window. An actively-working admin is therefore never interrupted; an
// abandoned session still lapses a full window after the last activity, which
// is the property the cap exists for (bounded exposure of a minor's account).
//
// Called from hooks *after* `getSession`, so this write is the last word on the
// row's `expiresAt` for the request: it both extends a stale value and clamps a
// value BetterAuth's own refresh may have pushed too far, keeping the window a
// hard ceiling.

// Skip the write unless `expiresAt` is off target by more than this, so a burst
// of requests doesn't write on every one. Must stay well below the client's
// `STOP_BEFORE_MS` so the client always bows out before the server expiry.
const MIN_BUMP_MS = 10_000;

// `expiresAt` is a Date from the DB adapter but an ISO string when the session
// comes from BetterAuth's signed cookie cache (JSON has no Date type), so
// normalize before any date math.
type SlidableSession = { token: string; expiresAt: Date | string };

export function slideImpersonationExpiry(session: SlidableSession): void {
  const now = Date.now();
  const expiresAt = new Date(session.expiresAt).getTime();
  // Never resurrect a dead session: if it already lapsed, getSession has
  // returned null and hooks won't call us, but guard anyway.
  if (Number.isNaN(expiresAt) || expiresAt <= now) return;

  const next = now + IMPERSONATION_IDLE_WINDOW_SEC * 1000;
  if (Math.abs(next - expiresAt) <= MIN_BUMP_MS) return;

  const nextDate = new Date(next);
  session.expiresAt = nextDate; // keep this request's locals in sync
  prisma.bauth_session
    .update({ where: { token: session.token }, data: { expiresAt: nextDate } })
    .catch((e) => console.warn('[impersonation] slide failed:', e.message));
}
