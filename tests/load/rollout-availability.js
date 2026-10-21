import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://api.relativa.local';
const v100 = new Counter('responses_v1_0_0');
const v110 = new Counter('responses_v1_1_0');
const other = new Counter('responses_other');

export const options = {
  scenarios: {
    availability: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: __ENV.DURATION || '90s',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
  },
};

export default function () {
  const res = http.get(`${BASE}/version`);
  check(res, { 'status is 200': (r) => r.status === 200 });
  if (res.status !== 200) return;
  const version = res.json('version');
  if (version === '1.0.0') v100.add(1);
  else if (version === '1.1.0') v110.add(1);
  else other.add(1);
}
