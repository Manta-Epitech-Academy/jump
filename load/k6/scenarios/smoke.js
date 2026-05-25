import http from 'k6/http';
import { check, sleep } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';

// Minimal smoke test: a handful of VUs, a few iterations each. Use this
// first to confirm BASE_URL is reachable and login-as works end-to-end
// before running heavier scenarios.
//
//   k6 run -e BASE_URL=https://preprod.example.com \
//          -e LOAD_TEST_SECRET=*** \
//          -e LOGIN_EMAIL=load-test-talent@example.com \
//          load/k6/scenarios/smoke.js
export const options = {
  vus: 3,
  iterations: 9,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

const { baseUrl, secret } = requireEnv();
const email = __ENV.LOGIN_EMAIL;
if (!email) throw new Error('Missing env LOGIN_EMAIL');

export default function () {
  loginAs(baseUrl, secret, { email });

  const res = http.get(`${baseUrl}/`, { tags: { endpoint: 'home' } });
  check(res, { 'home 2xx/3xx': (r) => r.status < 400 });

  sleep(1);
}
