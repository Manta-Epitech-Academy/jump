import http from 'k6/http';
import { check, fail, sleep } from 'k6';

/**
 * Authenticate the current VU as `email`. Hits POST /api/test/login-as
 * (preprod-only endpoint guarded by LOAD_TEST_SECRET) which mints a
 * BetterAuth session and returns Set-Cookie headers. k6's cookie jar
 * captures them, so subsequent requests in this VU are authenticated.
 *
 * Returns the userId on success, throws otherwise.
 *
 * Retries transient failures (default 3 attempts). Under heavy sustained load
 * the target autoscales: a freshly-spun pod that lacks `LOAD_TEST_SECRET` in its
 * env answers this endpoint with 404, and an overloaded pod may 5xx. Both are
 * transient at the fleet level (other pods are fine), so a short backoff rides
 * them out instead of killing the VU. A 401 (wrong token) is NOT retried — it's
 * a config error that won't fix itself.
 */
export function loginAs(baseUrl, secret, { email, userId, retries = 3 } = {}) {
  if (!email && !userId) fail('loginAs: must pass email or userId');

  const payload = JSON.stringify(email ? { email } : { userId });
  let res;
  for (let attempt = 1; attempt <= retries; attempt++) {
    res = http.post(`${baseUrl}/api/test/login-as`, payload, {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      tags: { endpoint: 'login-as' },
      // Override the scenario-wide discardResponseBodies so a failure body
      // (e.g. "Not Found" vs "User not found") stays readable in the log.
      responseType: 'text',
    });

    if (res.status === 200 && res.headers['Set-Cookie']) break;
    if (res.status === 401) break; // bad secret — fatal, don't waste retries
    if (attempt < retries) sleep(0.2 * attempt);
  }

  const ok = check(res, {
    'login-as 200': (r) => r.status === 200,
    'login-as set-cookie': (r) => !!r.headers['Set-Cookie'],
  });
  if (!ok) fail(`login-as failed: ${res.status} ${res.body}`);

  return res.json('userId');
}

/**
 * Read `BASE_URL` + `LOAD_TEST_SECRET` from k6 env, fail fast if missing.
 * Call this once at the top of a scenario.
 */
export function requireEnv() {
  const baseUrl = __ENV.BASE_URL;
  const secret = __ENV.LOAD_TEST_SECRET;
  if (!baseUrl) fail('Missing env BASE_URL (e.g. https://preprod.example.com)');
  if (!secret) fail('Missing env LOAD_TEST_SECRET');
  return { baseUrl, secret };
}

/**
 * POST a form-urlencoded body to a SvelteKit action.
 *
 * SvelteKit's CSRF guard (`@sveltejs/kit/src/runtime/server/respond.js`,
 * gated by `if (!DEV)`) rejects form POSTs whose `Origin` header doesn't
 * match `url.origin` with a 403. k6 doesn't set `Origin` by default, so
 * every form POST passes in `bun run dev` and fails in any prod build
 * (preprod included). Set it here so callers don't have to remember.
 */
export function formPost(baseUrl, path, body, params = {}) {
  return http.post(`${baseUrl}${path}`, body, {
    ...params,
    headers: {
      Origin: baseUrl,
      ...(params.headers || {}),
    },
  });
}
