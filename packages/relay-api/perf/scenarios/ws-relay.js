import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// IMPL-610 k6 scenario: WebSocket ホットパスの SLO 検証。
//
// フロー (api-specification §3 / operations-design §4.4):
//   1. POST /sessions で streamToken を取得 (HTTP Bearer access token 付き)
//   2. wss://…/relay?sessionId=<id>&protocolVersion=1.0 に
//      Authorization: Bearer <streamToken> で接続
//   3. session.ready server event を受信 → レイテンシ計測
//   4. 接続クローズ
//
// SLO 閾値:
//   - ws_connecting p95 < 3000ms   (WebSocket ハンドシェイク)
//   - session_ready_latency p95 < 1000ms  (接続後の server event 応答)
//   - http_req_duration p95 < 500ms (POST /sessions 本体)
//
// Relay 側の同時セッション上限は 3 (SessionConcurrencyPolicy, DD-240) のため
// VUs は 3 固定。constant-vus executor で 30s 維持。

export const options = {
  scenarios: {
    concurrent_relay: {
      executor: 'constant-vus',
      vus: 3,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    ws_connecting: ['p(95)<3000'],
    session_ready_latency_ms: ['p(95)<1000'],
    ws_session_errors: ['count<5'],
  },
};

const BASE_URL = __ENV.RELAY_BASE_URL ?? 'http://localhost:3001';
const WS_BASE_URL = __ENV.RELAY_WS_BASE_URL ?? BASE_URL.replace(/^http/, 'ws');
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN ?? 'dev-access-token';
const PROTOCOL_VERSION = '1.0';

const sessionReadyLatency = new Trend('session_ready_latency_ms');
const wsSessionErrors = new Counter('ws_session_errors');

export default function () {
  const postStart = Date.now();
  const payload = JSON.stringify({
    sourceType: 'tab',
    displayName: 'k6 ws-relay',
    sourceLanguage: 'en-US',
    autoDetectLanguage: false,
    targetLanguage: 'ja-JP',
    overlayTarget: { kind: 'tab', tabId: __VU },
    client: { extensionVersion: '0.0.0', protocolVersion: PROTOCOL_VERSION },
  });

  const sessionResponse = http.post(`${BASE_URL}/sessions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    tags: { endpoint: 'post-sessions' },
  });

  const created = check(sessionResponse, {
    'session created (201/200)': (r) => r.status === 201 || r.status === 200,
  });
  if (!created) {
    wsSessionErrors.add(1);
    return;
  }

  const body = sessionResponse.json();
  const data = body?.data ?? body;
  const sessionId = data?.sessionId;
  const streamToken = data?.streamToken;
  if (typeof sessionId !== 'string' || typeof streamToken !== 'string') {
    wsSessionErrors.add(1);
    return;
  }

  const wsUrl = `${WS_BASE_URL}/relay?sessionId=${encodeURIComponent(sessionId)}&protocolVersion=${PROTOCOL_VERSION}`;
  const connectStart = Date.now();
  let sessionReadyObserved = false;

  const wsResponse = ws.connect(
    wsUrl,
    { headers: { Authorization: `Bearer ${streamToken}` }, tags: { endpoint: 'ws-relay' } },
    (socket) => {
      socket.on('message', (raw) => {
        try {
          const event = JSON.parse(raw);
          if (event && event.type === 'session.ready') {
            sessionReadyLatency.add(Date.now() - connectStart);
            sessionReadyObserved = true;
            socket.close();
          }
        } catch {
          wsSessionErrors.add(1);
          socket.close();
        }
      });
      socket.on('error', () => {
        wsSessionErrors.add(1);
      });
      // 5 秒経っても session.ready が来なければ abort (SLO 閾値の上限)
      socket.setTimeout(() => {
        if (!sessionReadyObserved) wsSessionErrors.add(1);
        socket.close();
      }, 5000);
    },
  );

  check(wsResponse, {
    'ws handshake accepted (101)': (r) => r && r.status === 101,
  });

  // POST レスポンスタイムを可観測化 (thresholds で assert される http_req_duration とは別のログ用)
  const postDuration = Date.now() - postStart;
  if (postDuration > 2000) {
    console.warn(`[vu=${__VU}] POST /sessions took ${postDuration}ms`);
  }
}
