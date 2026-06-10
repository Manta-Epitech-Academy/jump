import type { Cookies } from '@sveltejs/kit';

// One-shot "you just finished onboarding" flash. Onboarding completion arms it;
// the next dashboard load consumes it and fires the arrival celebration (the XP
// float + welcome toast). It rides a cookie rather than a `?welcome=1` URL param
// so the signal survives a resume detour: a talent who onboarded via an
// émargement deep link lands on the check-in first, then still gets the
// celebration on their first dashboard visit (the param never reached the
// dashboard and was lost). The cookie carries no payload; the dashboard
// recomputes the XP total from the XpGrant ledger. This is purely "fire it once".
const ARRIVAL_CELEBRATION_COOKIE = 'welcome_celebration';
// A safety bound only: the first dashboard load consumes it, so this just caps
// how long an unredeemed flash can linger if that load never happens.
const ARRIVAL_CELEBRATION_MAX_AGE = 30 * 60; // 30 minutes

/** Arm the arrival celebration for the talent's next dashboard load. */
export function signalArrivalCelebration(cookies: Cookies): void {
  cookies.set(ARRIVAL_CELEBRATION_COOKIE, '1', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: ARRIVAL_CELEBRATION_MAX_AGE,
  });
}

/**
 * Read + clear the arrival-celebration flash. True only on the first dashboard
 * load after onboarding completion; every later load returns false.
 */
export function consumeArrivalCelebration(cookies: Cookies): boolean {
  const armed = cookies.get(ARRIVAL_CELEBRATION_COOKIE) === '1';
  if (armed) cookies.delete(ARRIVAL_CELEBRATION_COOKIE, { path: '/' });
  return armed;
}
