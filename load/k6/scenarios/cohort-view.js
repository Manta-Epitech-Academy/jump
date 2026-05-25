import http from 'k6/http';
import { check, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Cohort-view: staff loading the heavy "inscrits" page (a stage de seconde
// has ~200 students, so this page joins talent×interest×school×interview
// rows). Hotspot N°1 per CLAUDE.md.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/cohort-view.js
export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:inscrits}': ['p(95)<3000'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  const d = data();
  if (d.staffDev.length === 0) fail('Manifest has no staffDev — cannot run.');
  if (d.events.length === 0) fail('Manifest has no events — cannot run.');
}

export default function () {
  const d = data();
  const user = pick(d.staffDev, 'cohort');
  const event = pick(d.events, 'cohort');

  loginAs(baseUrl, secret, { email: user.email });

  const res = http.get(`${baseUrl}/staff/dev/events/${event.id}/inscrits`, {
    tags: { endpoint: 'inscrits' },
  });
  check(res, {
    'inscrits 200': (r) => r.status === 200,
    'inscrits has html': (r) => (r.body || '').includes('<html'),
  });
}
