import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { formPost, loginAs, requireEnv } from '../lib/auth.js';
import { data } from '../lib/manifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// STRESS 2K - "tout le monde tape à donf, surtout en écriture"
//
// Goal: ~2000 distinct users hammering the box as hard as it will take, to find
// where it knees over. This is a BREAK test, not an SLA test: the thresholds are
// abort guards, not pass criteria.
//
// Two independent scenarios so the metrics split per pressure source:
//   • talent_signup_storm: up to 2000 seeded talents, each pinned to ONE VU.
//                       Each VU logs in once, signs the rules ONCE, then settles
//                       into the dashboard read it lands on. signRules is the
//                       heaviest talent write: one transaction stamps the Talent
//                       row, upserts the onboarding XpGrant (one row per talent,
//                       keyed on (source, sourceId), so it is NOT appended per
//                       call) and enqueues an OnboardingPdfJob (always created,
//                       so the PDF queue is what actually piles up). 2000 of
//                       these inside the ramp window models the real event: a
//                       whole cohort signing at once, flooding the PDF queue +
//                       the Puppeteer browser pool (cap 5) in one burst.
//                       WHY ONE SIGN, NOT A LOOP: signRules is TERMINAL. It sets
//                       rulesSignedAt + charterAcceptedAt, which flips the talent
//                       to "onboarding complete"; the route guard (guards.ts)
//                       then 303-redirects any further /onboarding POST to `/`
//                       BEFORE the action runs. So a talent can be signed exactly
//                       once per seed. Looping signRules would just hammer the
//                       guard's redirect, not the write. After its sign each VU
//                       therefore switches to the dashboard read (the multi-query
//                       hotspot) to keep sustained pressure through the HOLD.
//   • staff_contention: a small staff pool slamming togglePresent on a SHARED
//                       set of participation rows. Unlike signRules this write IS
//                       repeatable (it flips isPresent each iteration), so it
//                       genuinely sustains. Same rows on purpose: this is where
//                       you see Postgres row locks / serialization failures on
//                       the atomic presence + XP recompute under concurrency.
//                       NOTE: these are REAL (manifest-sampled) participations,
//                       not @loadtest.invalid ones, so it mutates real talents'
//                       presence + XP. `cleanup` only deletes @loadtest.invalid
//                       accounts, so those flipped rows are NOT reverted. Fine on
//                       a throwaway preprod; never point this at anything else.
//
// Why this shape (vs the existing ramping-vus scenarios):
//   • Login is amortized PER VU (a real user logs in once, not per request).
//     Calling loginAs every iteration mints a fresh BetterAuth session each
//     time and turns session-creation into the dominant write, not realistic.
//   • Each VU is pinned to a distinct seeded talent, so we genuinely spread
//     across "tous les users" instead of replaying 46 prod accounts.
//   • discardResponseBodies keeps the k6 generator from choking on 2000 VUs
//     (writes return a tiny 303 anyway; the sign check reads only the Location
//     header, which survives the discard).
//
// PREREQS: seed a fresh 2000-user pool + manifest, then run. Seeding RESETS the
// signature state, which is exactly why the launcher always seeds immediately
// before a run (so every VU's one sign is a real write, not a guard bounce). The
// launcher does all of it over the API (no DB access); easiest is just:
//   BASE_URL=https://jump-preprod.epiboost.eu VUS=2000 ./load/stress-2k.sh
// or step by step:
//   COUNT=2000 ./load/run.sh seed     # POST /api/test/seed-talents + refresh manifest
//   k6 run -e BASE_URL=https://jump-preprod.epiboost.eu \
//          -e LOAD_TEST_SECRET=*** -e VUS=2000 \
//          load/k6/scenarios/stress-2k.js
//
// AFTER: this pollutes the target HARD (thousands of OnboardingPdfJob rows, an
// onboarding XpGrant per talent, real presence flips). Clean up the throwaway
// accounts: `./load/stress-2k.sh cleanup` (real presence flips are NOT undone).
// NEVER run against prod.
// ─────────────────────────────────────────────────────────────────────────────

const TALENT_VUS = Number(__ENV.VUS || 2000);
const STAFF_VUS = Number(__ENV.STAFF_VUS || 50);
const RAMP = __ENV.RAMP || '1m'; // time to climb to full VUs
const HOLD = __ENV.HOLD || '5m'; // soak at full load (catches pool/queue/leak issues)

export const options = {
  // 2000 VUs from one machine is heavy. Tiny bodies + no body parsing keeps the
  // generator honest. If the LOAD GENERATOR saturates (CPU pinned, dropped
  // iterations), split across machines / k6 Cloud: see the note at the bottom.
  discardResponseBodies: true,
  scenarios: {
    talent_signup_storm: {
      executor: 'ramping-vus',
      exec: 'talentSignupThenRead',
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

// Per-VU flags. Module scope persists across a VU's iterations (k6 keeps one
// module instance per VU), so each VU authenticates exactly once and reuses its
// cookie jar, and signs exactly once before switching to reads.
const authed = new Set();
const signed = new Set();

export function setup() {
  const d = data();
  const pool = d.loadTestTalents || [];
  if (pool.length === 0) {
    throw new Error(
      'No loadTestTalents in manifest. Seed them first:\n' +
        '  COUNT=2000 ./load/run.sh seed',
    );
  }
  if (pool.length < TALENT_VUS) {
    // Not fatal: VUs just wrap and share talents (more row contention). Warn so
    // it's not a silent "I thought I had 2000 distinct users".
    console.warn(
      `⚠ only ${pool.length} seeded talents for ${TALENT_VUS} VUs, ` +
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
  const hasStaff = d.staffPeda.length > 0;
  if (!hasStaff || pairs.length === 0) {
    // Don't let the staff scenario silently no-op: on a fresh preprod the
    // manifest may carry no orga activities / participations to target, in which
    // case staff_contention does nothing and the "no contention seen" reading is
    // a false negative, not a clean result.
    console.warn(
      `⚠ staff_contention will be a no-op: ${d.staffPeda.length} peda staff, ` +
        `${pairs.length} target rows. Re-run the manifest against an env that ` +
        `has recent events with orga activities + participations.`,
    );
  }
  return { pool, pairs, hasStaff };
}

// Pin each VU to one distinct seeded talent: log in once, sign once, then read.
export function talentSignupThenRead(ctx) {
  const talent = ctx.pool[(__VU - 1) % ctx.pool.length];

  if (!authed.has(__VU)) {
    loginAs(baseUrl, secret, { email: talent.email });
    authed.add(__VU);
  }

  if (!signed.has(__VU)) {
    // The write: one real signature per talent (signRules is terminal, see the
    // header). One transaction = 1 Talent update + 1 XpGrant upsert + 1
    // OnboardingPdfJob create + a fired-and-forgotten Puppeteer render.
    group('sign', () => {
      const r = formPost(
        baseUrl,
        '/onboarding?/signRules',
        { city: 'Paris', acceptedCharter: 'true', acceptedRules: 'true' },
        { redirects: 0, tags: { endpoint: 'sign' } },
      );
      // Distinguish a REAL write from a guard bounce: a successful sign 303s to
      // the dashboard arrival splash (`/?welcome=1`), while an already-signed
      // talent (state not reset before the run) 303s to plain `/`. Asserting on
      // the splash location means a storm that silently degraded into guard
      // redirects shows up RED instead of a misleading green.
      check(r, {
        'sign wrote (303 → welcome)': (res) =>
          res.status === 303 &&
          (res.headers['Location'] || '').includes('welcome=1'),
      });
    });
    signed.add(__VU);
  } else {
    // Post-arrival steady state: the dashboard is the multi-query read hotspot.
    // Keeps the pool + box under sustained read load through the HOLD window
    // while the OnboardingPdfJob queue from the signature burst drains behind it
    // (the Puppeteer browser pool, cap 5, is the natural backpressure).
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
