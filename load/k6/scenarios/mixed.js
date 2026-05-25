import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Mixed workload: closest thing to "real concurrent traffic" — talents
// browsing their dashboard / leaderboard while staff load cohort views
// and (occasionally) flip presence. Tuned to hit ~70% reads / 30% writes.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/mixed.js
//
// Three concurrent scenarios so each user-type has its own VU pool and
// arrival rate — the metrics breakdown lets you see which surface is
// slowing under combined load.
export const options = {
  scenarios: {
    talents_browsing: {
      executor: 'ramping-vus',
      exec: 'talentBrowse',
      stages: [
        { duration: '30s', target: 50 },
        { duration: '3m', target: 150 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
    staff_dashboards: {
      executor: 'ramping-vus',
      exec: 'staffDashboards',
      stages: [
        { duration: '30s', target: 5 },
        { duration: '3m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
    cockpit_mutations: {
      executor: 'ramping-vus',
      exec: 'cockpitToggle',
      stages: [
        { duration: '30s', target: 2 },
        { duration: '3m', target: 10 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.03'],
    'http_req_duration{endpoint:home}': ['p(95)<2500'],
    'http_req_duration{endpoint:leaderboard}': ['p(95)<2000'],
    'http_req_duration{endpoint:inscrits}': ['p(95)<3500'],
    'http_req_duration{endpoint:togglePresent}': ['p(95)<2000'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  const d = data();
  if (d.talents.length === 0) fail('Manifest has no talents.');
  if (d.staffDev.length === 0) fail('Manifest has no staffDev.');
  if (d.staffPeda.length === 0) fail('Manifest has no staffPeda.');
  if (d.events.length === 0) fail('Manifest has no events.');

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
  return { pairs };
}

export function talentBrowse() {
  const talent = pick(data().talents, 'mixed_talent');
  loginAs(baseUrl, secret, { email: talent.email });

  group('home', () => {
    const r = http.get(`${baseUrl}/`, { tags: { endpoint: 'home' } });
    check(r, { 'home 200': (res) => res.status === 200 });
  });

  // 1 in 3 talents also opens a leaderboard.
  if (__ITER % 3 === 0 && data().publications.length > 0) {
    const pub = pick(data().publications, 'mixed_lb');
    group('leaderboard', () => {
      const r = http.get(`${baseUrl}/minigames/${pub.id}/leaderboard`, {
        tags: { endpoint: 'leaderboard' },
      });
      check(r, { 'leaderboard ok': (res) => res.status < 400 });
    });
  }

  sleep(1 + Math.random() * 2);
}

export function staffDashboards() {
  const staff = pick(data().staffDev, 'mixed_staff');
  const event = pick(data().events, 'mixed_staff');
  loginAs(baseUrl, secret, { email: staff.email });

  const r = http.get(`${baseUrl}/staff/dev/events/${event.id}/inscrits`, {
    tags: { endpoint: 'inscrits' },
  });
  check(r, { 'inscrits 200': (res) => res.status === 200 });

  sleep(2 + Math.random() * 3);
}

export function cockpitToggle(ctx) {
  if (ctx.pairs.length === 0) return;
  const staff = pick(data().staffPeda, 'mixed_cockpit');
  const target = ctx.pairs[(__VU * 13 + __ITER) % ctx.pairs.length];
  loginAs(baseUrl, secret, { email: staff.email });

  const state = __ITER % 2 === 0 ? 'true' : 'false';
  const r = http.post(
    `${baseUrl}/staff/pedago/events/${target.eventId}/cockpit/${target.activityId}?/togglePresent`,
    { id: target.participationId, state },
    {
      redirects: 0,
      tags: { endpoint: 'togglePresent' },
    },
  );
  check(r, { 'toggle ok': (res) => res.status >= 200 && res.status < 400 });

  sleep(1);
}
