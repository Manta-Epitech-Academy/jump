/**
 * The pieces of Content-Security-Policy that `kit.csp` cannot own.
 *
 * Everything fixed lives in `svelte.config.js`, which hands out a real
 * per-request `script-src` nonce (issue #277). What is left here is what a
 * build-time config genuinely cannot express, and it is deliberately a few small
 * values rather than a policy: `hooks.server.ts` appends them, it does not
 * rebuild a header, and `security/csp.test.ts` fails if it starts to.
 *
 * A DIRECTIVE APPENDED HERE MUST BE ABSENT FROM `kit.csp`, and that is a
 * property of CSP rather than a convention: a header repeating a directive keeps
 * the FIRST occurrence and ignores the rest, unlike two separate policies, which
 * intersect. So a `form-action` left declared in `svelte.config.js` would make
 * the one computed below dead text that still reads as if it worked.
 */

/**
 * `frame-src`, the one directive still computed per request.
 *
 * Its `JUMP_GAMES_URL`-derived entry is genuinely per-deployment, and
 * `svelte.config.js` only ever runs at build time (see the Dockerfile: one image,
 * built before any environment's env vars exist, then deployed everywhere with
 * different ones), so a value read from `process.env` there would freeze to
 * whatever the CI build happened to have.
 *
 * Deployed games hosts already match the `*.epiboost.eu` wildcard; only a local
 * jump-games (e.g. `http://localhost:5174`) needs the extra entry.
 *
 * A malformed `JUMP_GAMES_URL` yields the wildcards alone rather than throwing.
 * That is the safe direction and the deliberate one: a typo in an env var must
 * cost a mini-game that will not frame, never a request that 500s, and never a
 * policy that fails open.
 */
export function frameSrcDirective(gamesUrl: string | undefined): string {
  let extra = '';
  try {
    extra = gamesUrl ? ` ${new URL(gamesUrl).origin}` : '';
  } catch {
    extra = '';
  }
  return `frame-src 'self' https://*.epiboost.eu https://*.epiboost.fr${extra}`;
}

/**
 * `form-action`, the hosts a talent's own submit may be handed to.
 *
 * `'self'` alone is what every other form on this platform needs, and it was the
 * whole directive until the activities arrived. Entering one is a POST whose 303
 * leaves for a CTFd instance, and Chrome applies `form-action` to the REDIRECT
 * as well as to the submit: the browser blocks it and reports the violation
 * against the same-origin action URL, so the tell reads like a policy that
 * should have allowed it.
 *
 * The origins come from the `Workshop_Instance` rows, and no other source would
 * hold: they are curated at runtime over the API, they are not derivable from an
 * environment variable, and a wildcard over the brand domains would not cover
 * them either, since the instances run on a third party's DNS today and where
 * they run at the end of October is still an open question. Taking them from the
 * same rows the redirect is built from is what makes this unable to drift.
 *
 * An unparseable `baseUrl` is dropped rather than thrown on, and an empty list
 * yields `'self'` alone: a bad row costs one activity that will not open, never
 * a request that 500s and never a policy that fails open.
 */
export function formActionDirective(baseUrls: readonly string[]): string {
  const origins = new Set<string>();
  for (const baseUrl of baseUrls) {
    try {
      origins.add(new URL(baseUrl).origin);
    } catch {
      // Dropped on purpose; see above.
    }
  }
  const extra = origins.size > 0 ? ` ${[...origins].sort().join(' ')}` : '';
  return `form-action 'self'${extra}`;
}

/**
 * The policy for a response kit never rendered: an early guard redirect, a JSON
 * action result, a `+server.ts` endpoint.
 *
 * None of them go through kit's page renderer, so none carry the `kit.csp`
 * header. Nothing runs a script or embeds a frame on any of them either, so
 * refusing everything is both correct and much better than the alternative,
 * which is a response with no policy at all.
 */
export const LOCKED_DOWN_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
