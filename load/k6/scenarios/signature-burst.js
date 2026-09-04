import { check, fail } from 'k6';
import { formPost, loginAs, requireEnv } from '../lib/auth.js';
import { data } from '../lib/manifest.js';

// Signature burst: N seeded "load-test" talents POST signRules at the same
// time. Tests that the synchronous path (signature → redirect) stays snappy
// regardless of the PDF queue depth. Each iteration enqueues exactly one
// OnboardingPdfJob row.
//
// Prereqs (all via the API, no DB access):
//   COUNT=500 ./load/run.sh seed            # seeds the pool + refreshes manifest
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/signature-burst.js
//
// The PDF queue drains itself: signRules fires `void runOnboardingPdfJob` inline
// (Puppeteer on the pod). Observe / retry failures at /staff/admin/onboarding-pdfs.
export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: Number(__ENV.COUNT || 100),
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:sign}': ['p(95)<2000'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  const pool = data().loadTestTalents;
  if (pool.length === 0) {
    fail(
      'No load-test talents in manifest. Run:\n' +
        '  bun load/scripts/seed-load-talents.ts\n' +
        '  bun load/scripts/manifest.ts',
    );
  }
  return { pool };
}

export default function (ctx) {
  // Spread iterations across the seeded pool. Re-signing the same talent
  // isn't a hard error (signRules has no "already signed" guard: it just
  // overwrites rulesSignedAt and enqueues another OnboardingPdfJob row),
  // but spreading keeps the workload representative of distinct users.
  const idx = (__VU - 1) * 1000 + __ITER;
  const talent = ctx.pool[idx % ctx.pool.length];

  loginAs(baseUrl, secret, { email: talent.email });

  // signRules action: SvelteKit form action via ?/signRules. Body is
  // x-www-form-urlencoded; rulesSchema requires `city` plus both consents
  // as `z.literal('true')` (RGPD enforcement, see validation/onboarding.ts).
  const res = formPost(
    baseUrl,
    '/onboarding?/signRules',
    { city: 'Paris', acceptedCharter: 'true', acceptedRules: 'true' },
    {
      redirects: 0, // we expect a 303 to /?welcome=1: don't follow it
      tags: { endpoint: 'sign' },
    },
  );
  check(res, {
    'sign 303': (r) => r.status === 303,
    'sign redirect to home': (r) =>
      (r.headers['Location'] || '').includes('welcome=1'),
  });
}
