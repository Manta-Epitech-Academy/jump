/**
 * The two pieces of Content-Security-Policy that `kit.csp` cannot own.
 *
 * Everything fixed lives in `svelte.config.js`, which hands out a real
 * per-request `script-src` nonce (issue #277). What is left here is what a
 * build-time config genuinely cannot express, and it is deliberately two small
 * values rather than a policy: `hooks.server.ts` appends them, it does not
 * rebuild a header, and `security/csp.test.ts` fails if it starts to.
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
