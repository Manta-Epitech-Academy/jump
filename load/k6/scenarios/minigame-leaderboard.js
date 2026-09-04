import http from 'k6/http';
import { check, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Minigame leaderboard fetch: talents loading the per-campus leaderboard.
// Lighter than the home page but called by every participant after
// playing, easy to spike around publication windows.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/minigame-leaderboard.js
export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: 50 },
        { duration: '1m', target: 150 },
        { duration: '20s', target: 0 },
      ],
      gracefulStop: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:leaderboard}': ['p(95)<1500'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  const d = data();
  if (d.talents.length === 0) fail('Manifest has no talents.');
  if (d.publications.length === 0) fail('Manifest has no minigame publications.');
}

export default function () {
  const talent = pick(data().talents, 'mg');
  const pub = pick(data().publications, 'mg');
  loginAs(baseUrl, secret, { email: talent.email });

  const res = http.get(
    `${baseUrl}/minigames/${pub.id}/leaderboard`,
    { tags: { endpoint: 'leaderboard' } },
  );
  check(res, {
    'leaderboard 200/3xx': (r) => r.status === 200 || r.status === 303,
  });
}
