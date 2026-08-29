import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Talent home (`GET /`): heavy multi-query load (participations, planning,
// timeslots, steps, minigame eligibility, CMS lookup). Hits cohort scale
// when many talents land on their dashboard around the same time
// (typically after the daily push).
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/talent-home.js
export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:home}': ['p(95)<2000'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  if (data().talents.length === 0)
    fail('Manifest has no talents: cannot run.');
}

export default function () {
  const talent = pick(data().talents, 'home');
  loginAs(baseUrl, secret, { email: talent.email });

  const res = http.get(`${baseUrl}/`, { tags: { endpoint: 'home' } });
  check(res, {
    'home 200': (r) => r.status === 200,
    'home has html': (r) => (r.body || '').includes('<html'),
  });

  sleep(1);
}
