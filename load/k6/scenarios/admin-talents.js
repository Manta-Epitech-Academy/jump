import http from 'k6/http';
import { check, fail } from 'k6';
import { loginAs, requireEnv } from '../lib/auth.js';
import { data, pick } from '../lib/manifest.js';

// Admin talents list: paginated 50/page across the global talent base
// with computed onboarding status per row. Heavy because campus-agnostic.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e LOAD_TEST_SECRET=*** \
//     load/k6/scenarios/admin-talents.js
export const options = {
  vus: 20,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:admin_talents}': ['p(95)<3000'],
  },
};

const { baseUrl, secret } = requireEnv();

export function setup() {
  if (data().staffAdmin.length === 0) fail('Manifest has no staffAdmin.');
}

export default function () {
  const admin = pick(data().staffAdmin, 'admin');
  loginAs(baseUrl, secret, { email: admin.email });

  const page = 1 + (__ITER % 5);
  const res = http.get(`${baseUrl}/staff/admin/talents?page=${page}`, {
    tags: { endpoint: 'admin_talents' },
  });
  check(res, {
    'admin/talents 200': (r) => r.status === 200,
  });
}
