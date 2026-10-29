/**
 * Cross-site request forgery, refused for every route at once.
 *
 * SvelteKit's own check (`csrf.checkOrigin`) refuses a cross-origin request
 * only when it carries a form content type, because a plain HTML form can send
 * nothing else. A script can: `fetch(url, { method: 'POST', mode: 'no-cors',
 * body: new Blob([json]) })` sends no `Content-Type` at all, needs no preflight,
 * and passes kit's check. The session cookie is `SameSite=Lax`, which a browser
 * still attaches when the page that sends it is on the same SITE, and Jump's
 * site is shared: production is `jump.epiboost.fr`, and the CTFd instances that
 * talents use are `*.epiboost.fr` too. So one injected script on any sibling
 * host could make a staff member's browser call a JSON `+server.ts` as them.
 *
 * The rule mirrors Go 1.25's `http.CrossOriginProtection`:
 * - a safe method (GET, HEAD, OPTIONS) is never refused: it must not change
 *   anything, and refusing it would break plain links into Jump;
 * - a browser that sends `Sec-Fetch-Site` is believed: `same-origin` and
 *   `none` (typed in the address bar) pass, `same-site` and `cross-site` do not;
 * - an older browser without it still sends `Origin` on a cross-origin write,
 *   so `Origin` decides when present;
 * - a request with neither header is not from a browser (the Salesforce worker,
 *   the CTFd and jump-games callbacks, the k3s jobs, an admin API client), so
 *   there is no ambient cookie to forge and it passes. Those callers prove who
 *   they are with their own secret or token.
 *
 * Nothing legitimate POSTs to Jump from another origin in a browser: the
 * Microsoft sign-in returns by GET (BetterAuth sets no `response_mode`), and
 * CTFd's "Continue with Jump" is a link.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when a browser sent this state-changing request from a page that is not
 * Jump itself. `origin` is the origin Jump is served on (`event.url.origin`, the
 * same value kit's own check compares against).
 */
export function isCrossSiteWrite(request: Request, origin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return false;

  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site !== 'same-origin' && site !== 'none';

  const requestOrigin = request.headers.get('origin');
  return requestOrigin !== null && requestOrigin !== origin;
}
