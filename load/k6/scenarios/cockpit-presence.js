import http from 'k6/http';
import { check, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Cockpit mark-present: pedago staff toggling ParticipationActivity.isPresent
// in real time during an event. Each call recomputes Participation.isPresent
// from all orga activities + syncs the XP ledger atomically.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/cockpit-presence.js
//
// ⚠️ Writes pollute the participation/XP data on the target campus. Acceptable
// on preprod since data is throwaway; do NOT run against prod.
export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:togglePresent}': ['p(95)<1500'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  const d = data();
  if (d.staffPeda.length === 0) fail('Manifest has no staffPeda.');
  if (d.activities.length === 0) fail('Manifest has no activities.');
  if (d.participations.length === 0) fail('Manifest has no participations.');

  // Join activities ↔ participations on eventId so each call targets a
  // valid (activityId, participationId) pair for the same event.
  const pairs = [];
  for (const a of d.activities) {
    const evParts = d.participations.filter((p) => p.eventId === a.eventId);
    for (const p of evParts.slice(0, 5)) {
      pairs.push({
        eventId: a.eventId,
        activityId: a.id,
        participationId: p.id,
      });
    }
  }
  if (pairs.length === 0)
    fail('No (activity, participation) pairs from the same event.');
  return { pairs };
}

export default function (ctx) {
  const staff = pick(data().staffPeda, 'cockpit');
  const target = ctx.pairs[(__VU * 7 + __ITER) % ctx.pairs.length];
  loginAs(baseUrl, secret, { email: staff.email });

  // Toggle alternates between true/false on consecutive iterations so the
  // ledger writes flip both directions over time.
  const state = __ITER % 2 === 0 ? 'true' : 'false';
  const res = http.post(
    `${baseUrl}/staff/pedago/events/${target.eventId}/cockpit/${target.activityId}?/togglePresent`,
    { id: target.participationId, state },
    {
      redirects: 0,
      tags: { endpoint: 'togglePresent' },
    },
  );
  check(res, {
    'toggle 2xx/3xx': (r) => r.status >= 200 && r.status < 400,
  });
}
