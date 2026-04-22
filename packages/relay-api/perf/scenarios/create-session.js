import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // SLO: POST /sessions p95 500ms (operations-design.md §2.2)
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.RELAY_BASE_URL ?? 'http://localhost:3001';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN ?? 'dev-access-token';

export default function () {
  const payload = JSON.stringify({
    sourceType: 'tab',
    displayName: 'k6 load test',
    sourceLanguage: 'en-US',
    autoDetectLanguage: false,
    targetLanguage: 'ja-JP',
    overlayTarget: { kind: 'tab', tabId: 1 },
    client: { extensionVersion: '0.0.0', protocolVersion: '1.0' },
  });

  const response = http.post(`${BASE_URL}/sessions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  });

  check(response, {
    'status is 201 or 200': (r) => r.status === 201 || r.status === 200,
  });

  sleep(1);
}
