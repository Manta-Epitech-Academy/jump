import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { formPost, loginAs, requireEnv } from '../lib/auth.js';
import { data } from '../lib/manifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// STRESS 2K — "tout le monde tape à donf, surtout en écriture"
//
// Goal: ~2000 distinct users hammering writes (and some reads) as hard as the
// box will take, to find where it knees over. This is a BREAK test, not an SLA
// test — the thresholds are abort guards, not pass criteria.
//
// Two independent scenarios so the metrics split per pressure source:
//   • talent_spam     — up to 2000 seeded talents, each pinned to ONE VU, each
//                       logging in ONCE then POSTing signRules back-to-back.
//                       signRules is the heaviest talent write: it stamps the
//                       Talent row, appends an XpGrant, AND enqueues an
//                       OnboardingPdfJob every call (no "already signed" guard),
//                       so it floods the ledger + the PDF queue at once.
//   • staff_contention — a small staff pool slamming togglePresent on a SHARED
//                       set of participation rows. Same rows on purpose: this is
//                       where you see Postgres row locks / serialization
//                       failures on the atomic XP recompute under concurrency.
//
// Why this shape (vs the existing ramping-vus scenarios):
//   • Login is amortized PER VU (a real user logs in once, not per request).
//     Calling loginAs every iteration mints a fresh BetterAuth session each
//     time and turns session-creation into the dominant write — not realistic.
//   • Each VU is pinned to a distinct seeded talent, so we genuinely spread
//     across "tous les users" instead of replaying 46 prod accounts.
//   • discardResponseBodies keeps the k6 generator from choking on 2000 VUs
//     (writes return a tiny 303 anyway).
//
// PREREQS — seed a real 2000-user pool first, then refresh the manifest:
//   cd frontend
//   COUNT=2000 bun scripts/load-test/seed-load-talents.ts
//   bun scripts/load-test/manifest.ts
//   # …then from repo root:
//   k6 run -e BASE_URL=https://jump-preprod.epiboost.eu \
//          -e LOAD_TEST_SECRET=*** -e VUS=2000 \
//          load/k6/scenarios/stress-2k.js
//
// AFTER — this pollutes preprod HARD (hundreds of k OnboardingPdfJob rows, XP
// grants, presence flips). Clean up: `cd frontend && bun scripts/load-test/cleanup.ts`.
// NEVER run against prod.
// ─────────────────────────────────────────────────────────────────────────────

const TALENT_VUS = Number(__ENV.VUS || 2000);
const STAFF_VUS = Number(__ENV.STAFF_VUS || 50);
const RAMP = __ENV.RAMP || '1m'; // time to climb to full VUs
const HOLD = __ENV.HOLD || '5m'; // soak at full load (catches pool/queue/leak issues)

export const options = {
  // 2000 VUs from one machine is heavy. Tiny bodies + no body parsing keeps the
  // generator honest. If the LOAD GENERATOR saturates (CPU pinned, dropped
  // iterations), split across machines / k6 Cloud — see the note at the bottom.
  discardResponseBodies: true,
  scenarios: {
    talent_spam: {
      executor: 'ramping-vus',
      exec: 'talentSpam',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: TALENT_VUS },
        { duration: HOLD, target: TALENT_VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
    staff_contention: {
      executor: 'ramping-vus',
      exec: 'staffContention',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: STAFF_VUS },
        { duration: HOLD, target: STAFF_VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  // Break-test guards: abort the run if it falls off a cliff, so you don't sit
  // there burning preprod for 6 minutes after it's already on fire.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_duration{endpoint:sign}': ['p(95)<5000', 'p(99)<10000'],
    'http_req_duration{endpoint:togglePresent}': ['p(95)<5000'],
  },
};

const { baseUrl, secret } = requireEnv();

// Per-VU "have I logged in yet" flag. Module scope persists across a VU's
// iterations (k6 keeps one module instance per VU), so each VU authenticates
// exactly once and reuses its cookie jar for the rest of the run.
const authed = new Set();

export function setup() {
  const d = data();
  const pool = d.loadTestTalents || [];
  if (pool.length === 0) {
    throw new Error(
      'No loadTestTalents in manifest. Seed them first:\n' +
        '  cd frontend && COUNT=2000 bun scripts/load-test/seed-load-talents.ts\n' +
        '  bun scripts/load-test/manifest.ts',
    );
  }
  if (pool.length < TALENT_VUS) {
    // Not fatal — VUs just wrap and share talents (more row contention). Warn so
    // it's not a silent "I thought I had 2000 distinct users".
    console.warn(
      `⚠ only ${pool.length} seeded talents for ${TALENT_VUS} VUs — ` +
        `VUs will share talents (re-seed with COUNT=${TALENT_VUS} for 1:1).`,
    );
  }

  // Build the shared (event, activity, participation) target set for the
  // contention scenario, same join as cockpit-presence.js.
  const pairs = [];
  for (const a of d.activities) {
    const evParts = d.participations.filter((p) => p.eventId === a.eventId);
    for (const p of evParts.slice(0, 5)) {
      pairs.push({ eventId: a.eventId, activityId: a.id, participationId: p.id });
    }
  }
  return { pool, pairs, hasStaff: d.staffPeda.length > 0 };
}

// Pin each VU to one distinct seeded talent, log in once, then spam writes.
export function talentSpam(ctx) {
  const talent = ctx.pool[(__VU - 1) % ctx.pool.length];

  if (!authed.has(__VU)) {
    loginAs(baseUrl, secret, { email: talent.email });
    authed.add(__VU);
  }

  // The hammer: re-sign every iteration. No idempotency guard server-side, so
  // each call = 1 Talent update + 1 XpGrant + 1 OnboardingPdfJob enqueue.
  group('sign', () => {
    const r = formPost(
      baseUrl,
      '/onboarding?/signRules',
      { city: 'Paris', acceptedCharter: 'true', acceptedRules: 'true' },
      { redirects: 0, tags: { endpoint: 'sign' } },
    );
    check(r, { 'sign 2xx/3xx': (res) => res.status >= 200 && res.status < 400 });
  });

  // 1 in 4: also pull the home dashboard so the workload isn't 100% writes —
  // home is the multi-query read hotspot, good to see it degrade alongside.
  if (__ITER % 4 === 0) {
    const r = http.get(`${baseUrl}/`, { tags: { endpoint: 'home' } });
    check(r, { 'home 2xx/3xx': (res) => res.status < 400 });
  }

  // Near-zero think time with a little jitter: aggressive, but not a lockstep
  // thundering herd and not a client-side busy-spin.
  sleep(Math.random() * 0.3);
}

// Staff slamming the SAME participation rows → lock / serialization contention
// on the atomic presence+XP recompute. Small pool, no sleep: max contention.
export function staffContention(ctx) {
  if (!ctx.hasStaff || ctx.pairs.length === 0) return;
  const staff = data().staffPeda[(__VU - 1) % data().staffPeda.length];
  const target = ctx.pairs[(__VU * 13 + __ITER) % ctx.pairs.length];

  if (!authed.has(-__VU)) {
    // negative key so a staff VU id can't collide with a talent VU id
    loginAs(baseUrl, secret, { email: staff.email });
    authed.add(-__VU);
  }

  const state = __ITER % 2 === 0 ? 'true' : 'false';
  const r = formPost(
    baseUrl,
    `/staff/pedago/events/${target.eventId}/cockpit/${target.activityId}?/togglePresent`,
    { id: target.participationId, state },
    { redirects: 0, tags: { endpoint: 'togglePresent' } },
  );
  check(r, { 'toggle 2xx/3xx': (res) => res.status >= 200 && res.status < 400 });
}
