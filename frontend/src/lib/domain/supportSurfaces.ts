// Where the Crisp live-chat bubble is offered.
//
// We deliberately limit support to the login and onboarding surfaces, for both
// talents and parents. The intent is to help people get INTO the app (sign in,
// complete onboarding / parent co-signature) and then step out of the way. If
// the bubble lived across the whole talent space, the national team would be
// flooded during a stage de seconde with local, on-site questions ("ou sont les
// toilettes ?") that aren't ours to answer.
//
// Single source of truth for that policy: `Crisp.svelte` consults this on every
// client-side route change to show or hide the widget. Path prefixes match the
// resolved pathname (the app has no base path).
const SUPPORT_SURFACE_PREFIXES = [
  '/login', // talent + parent share this entry point; /parent/login 301s here
  '/onboarding', // talent onboarding wizard
  '/parent/welcome', // parent co-signature flow (the active onboarding steps) ...
  '/parent/reglement',
  '/parent/signature',
  // NB: not /parent/merci -- a parent who has finished co-signing is redirected
  // there on every login (login/+page.server.ts), so it's their recurring
  // landing, not an onboarding step. Keeping the bubble off it avoids the same
  // flooding we're scoping away from the rest of the app.
];

/** True on the login / onboarding surfaces where live-chat support is offered. */
export function isSupportSurface(pathname: string): boolean {
  return SUPPORT_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
