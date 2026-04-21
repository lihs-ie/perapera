---
title: API仕様書
version: '0.1.0'
status: draft
created: '2026-04-20'
last_updated: '2026-04-20'
author: 'Codex'
---

# API仕様書

## 1. はじめに

### 1.1 目的

本文書は、リアルタイム文字起こし翻訳 Chrome 拡張と中継バックエンド間で利用する Relay API の仕様を定義する。特に本アプリで最重要となる翻訳速度を担保するため、セッション初期化などの制御面は HTTP、音声フレーム送信と字幕 / 翻訳受信のホットパスは WebSocket を使用する。

### 1.2 ベースURL

| 環境         | HTTP ベースURL                         | WebSocket ベースURL                        |
| ------------ | -------------------------------------- | ------------------------------------------ |
| 開発         | `http://localhost:3001/api/v1`         | `ws://localhost:3001/api/v1/relay`         |
| ステージング | `https://stg-relay.example.com/api/v1` | `wss://stg-relay.example.com/api/v1/relay` |
| 本番         | `https://relay.example.com/api/v1`     | `wss://relay.example.com/api/v1/relay`     |

### 1.3 対応する基本設計

- [基本設計書 - 外部インターフェース](../02-system-design/system-design.md#7-外部インターフェース)
- [詳細設計書](../03-detailed-design/detailed-design.md)
- [インフラストラクチャ層設計書](../03-detailed-design/infrastructure.md)

## 2. 共通仕様

### 2.1 プロトコル方針

- HTTP はヘルスチェック、セッション初期化、セッション状態参照に限定する
- WebSocket は音声送信と字幕 / 翻訳イベント配信に利用する
- 翻訳ホットパスでは `transcript.final` 受信後にサーバー側で永続キューを挟まず翻訳処理を開始する
- MVP の音声フレーム転送形式は JSON テキストフレーム + Base64 とする

### 2.2 リクエスト形式

| 項目                   | 仕様                                            |
| ---------------------- | ----------------------------------------------- |
| HTTP Content-Type      | `application/json`                              |
| WebSocket 制御イベント | JSON テキストフレーム                           |
| 文字コード             | UTF-8                                           |
| 日時フォーマット       | ISO 8601 UTC 形式                               |
| 音声形式               | `pcm_s16le` / モノラル / 16kHz / 100ms フレーム |

### 2.3 認証方式

HTTP 制御 API は拡張利用者に紐づくアクセストークン、WebSocket はセッション初期化時に払い出された短命のストリームトークンで認証する。

**HTTP:**

```http
Authorization: Bearer <access_token>
```

**WebSocket:**

```http
Authorization: Bearer <stream_token>
```

### 2.4 レートリミット

| 対象                        | 制限                            | 超過時                     |
| --------------------------- | ------------------------------- | -------------------------- |
| `POST /sessions`            | 30 リクエスト / 分 / 利用者     | `429 Too Many Requests`    |
| `GET /sessions/{sessionId}` | 60 リクエスト / 分 / 利用者     | `429 Too Many Requests`    |
| WebSocket 同時接続数        | 3 セッション / 拡張インストール | `session.error` + 接続拒否 |
| `audio.frame`               | 10 イベント / 秒 / セッション   | `session.error`            |

HTTP レートリミット応答には次のヘッダーを含める。

| ヘッダー                | 説明         |
| ----------------------- | ------------ |
| `X-RateLimit-Limit`     | 上限値       |
| `X-RateLimit-Remaining` | 残回数       |
| `X-RateLimit-Reset`     | リセット時刻 |

### 2.5 ページネーション

本仕様の対象 API ではページネーションを使用しない。

### 2.6 レイテンシ優先ポリシー

| 項目                 | 目標値      | 方針                                            |
| -------------------- | ----------- | ----------------------------------------------- |
| WebSocket 接続確立   | 3000ms 以内 | 接続失敗時は拡張側で再接続へ移行                |
| STT 初回部分字幕     | 1000ms 以内 | 初回応答を超過した場合は `session.error` を返す |
| 確定字幕から翻訳開始 | 50ms 以内   | `transcript.final` 受信後に即時翻訳を開始       |
| 翻訳 API 応答        | 800ms 以内  | 超過時は翻訳を打ち切り、文字起こしのみ継続      |
| ハートビート         | 15 秒間隔   | 切断検知に利用                                  |

注意: 上記は運用上の SLO であり、外部プロバイダやネットワーク状況により絶対保証ではない。

**視点の区別** (IMPL-005 で確定、Phase 0 合意事項):

- 本節の **翻訳 API 応答 800ms** は **Relay API 単体** の翻訳プロバイダ応答上限。超過で該当セグメントの翻訳を打ち切り、セッションは `degraded` へ遷移する
- 拡張の音声取得から Overlay 描画までの **end-to-end SLO** は別指標として [`operations-design.md` §2.2](../10-operations-design/operations-design.md) に定義（翻訳字幕表示遅延 p50 800ms / p95 1500ms / p99 2500ms）
- 運用アラート閾値 ([`operations-design.md` §4.4](../10-operations-design/operations-design.md)) は E2E p95 視点

## 3. 共通レスポンス形式

### 3.1 HTTP 成功レスポンス

```json
{
  "data": {
    "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8"
  },
  "meta": {
    "requestId": "req_01HZX8Y5ATB5T8R7S6Q4P3N2M1"
  }
}
```

### 3.2 HTTP エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "targetLanguage は必須です",
    "details": [
      {
        "field": "targetLanguage",
        "message": "ISO 言語コードを指定してください"
      }
    ]
  },
  "meta": {
    "requestId": "req_01HZX8Y5ATB5T8R7S6Q4P3N2M1"
  }
}
```

### 3.3 WebSocket イベント共通形式

すべての WebSocket イベントは次のエンベロープを持つ。`sequence` は送信者ごとの単調増加整数であり、クライアントとサーバーで独立した系列を持つ。

```json
{
  "eventType": "transcript.final",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 42,
  "timestamp": "2026-04-20T12:34:56.789Z",
  "payload": {}
}
```

### 3.4 共通エラーコード

#### HTTP エラーコード

| HTTP ステータス | エラーコード            | 説明                         |
| --------------- | ----------------------- | ---------------------------- |
| 400             | `VALIDATION_ERROR`      | リクエスト値が不正           |
| 401             | `UNAUTHORIZED`          | アクセストークンが無効       |
| 403             | `FORBIDDEN`             | 利用権限がない               |
| 404             | `NOT_FOUND`             | 指定セッションが存在しない   |
| 409             | `CONFLICT`              | セッション状態が競合している |
| 429             | `RATE_LIMIT_EXCEEDED`   | レート制限超過               |
| 500             | `INTERNAL_SERVER_ERROR` | サーバー内部エラー           |

#### WebSocket エラーコード

| コード                        | 説明                             | retryable |
| ----------------------------- | -------------------------------- | --------- |
| `SESSION_NOT_READY`           | `session.start` 前に音声送信した | Yes       |
| `AUDIO_FRAME_INVALID`         | 音声形式または Base64 が不正     | No        |
| `RATE_LIMIT_EXCEEDED`         | イベント送信頻度が上限超過       | Yes       |
| `STT_STREAM_FAILED`           | STT ストリームが維持できない     | Yes       |
| `TRANSLATION_PROVIDER_FAILED` | 翻訳プロバイダ呼び出し失敗       | Yes       |
| `UNSUPPORTED_LANGUAGE_PAIR`   | 翻訳言語ペアが非対応             | No        |
| `SESSION_TIMEOUT`             | 非アクティブによりセッション失効 | Yes       |
| `INTERNAL_SERVER_ERROR`       | Relay API 内部エラー             | Yes       |

## 4. エンドポイント一覧

| ID      | プロトコル | メソッド / 種別 | パス / eventType        | 概要                                     | 認証 |
| ------- | ---------- | --------------- | ----------------------- | ---------------------------------------- | ---- |
| API-001 | HTTP       | `GET`           | `/health`               | ヘルスチェック                           | 不要 |
| API-002 | HTTP       | `POST`          | `/sessions`             | セッション初期化とストリームトークン発行 | 必要 |
| API-003 | HTTP       | `GET`           | `/sessions/{sessionId}` | セッション状態参照                       | 必要 |
| API-004 | WebSocket  | `CONNECT`       | `/relay`                | リアルタイム音声送受信チャネル確立       | 必要 |

## 5. HTTP エンドポイント詳細

### API-001: ヘルスチェック

| 項目     | 内容                       |
| -------- | -------------------------- |
| メソッド | `GET`                      |
| パス     | `/health`                  |
| 認証     | 不要                       |
| 概要     | Relay API の疎通確認を行う |
| 関連要件 | なし                       |

**成功レスポンス（200 OK）:**

```json
{
  "data": {
    "status": "ok",
    "service": "relay-api",
    "version": "0.1.0",
    "serverTime": "2026-04-20T12:34:56.789Z"
  }
}
```

### API-002: セッション初期化

| 項目     | 内容                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| メソッド | `POST`                                                                                                                                                                                                                                                                             |
| パス     | `/sessions`                                                                                                                                                                                                                                                                        |
| 認証     | 必要                                                                                                                                                                                                                                                                               |
| 概要     | ソースセッションを初期化し、WebSocket 接続用の短命トークンを払い出す                                                                                                                                                                                                               |
| 関連要件 | [REQ-001](../01-requirements/requirements-specification.md#req-001), [REQ-002](../01-requirements/requirements-specification.md#req-002), [REQ-004](../01-requirements/requirements-specification.md#req-004), [REQ-006](../01-requirements/requirements-specification.md#req-006) |

**リクエストボディ:**

| フィールド                | 型             | 必須 | 説明                                     |
| ------------------------- | -------------- | ---- | ---------------------------------------- |
| `sourceType`              | string         | Yes  | `tab` / `microphone` / `desktop`         |
| `displayName`             | string         | Yes  | UI 表示用のソース名                      |
| `sourceLanguage`          | string \| null | No   | 入力言語。自動判定時は `null`            |
| `autoDetectLanguage`      | boolean        | Yes  | 入力言語の自動判定有無                   |
| `targetLanguage`          | string         | Yes  | 翻訳先言語                               |
| `overlayTarget.kind`      | string         | Yes  | `tab` / `extension-monitor`              |
| `overlayTarget.tabId`     | integer        | No   | `kind=tab` の場合の対象タブ ID           |
| `overlayTarget.pageId`    | string         | No   | `kind=extension-monitor` の場合の固定 ID |
| `client.extensionVersion` | string         | Yes  | 拡張機能バージョン                       |
| `client.protocolVersion`  | string         | Yes  | API プロトコルバージョン                 |

**リクエスト例:**

```json
{
  "sourceType": "tab",
  "displayName": "YouTube Live",
  "sourceLanguage": "en-US",
  "autoDetectLanguage": false,
  "targetLanguage": "ja-JP",
  "overlayTarget": {
    "kind": "tab",
    "tabId": 187
  },
  "client": {
    "extensionVersion": "0.1.0",
    "protocolVersion": "1.0"
  }
}
```

**成功レスポンス（201 Created）:**

| フィールド                          | 型      | 説明                         |
| ----------------------------------- | ------- | ---------------------------- |
| `data.sessionId`                    | string  | ソースセッション ID          |
| `data.streamToken`                  | string  | WebSocket 接続用短命トークン |
| `data.relayUrl`                     | string  | 接続先 WSS URL               |
| `data.expiresAt`                    | string  | ストリームトークン失効時刻   |
| `data.heartbeatIntervalSec`         | integer | ハートビート間隔             |
| `data.audio.encoding`               | string  | `pcm_s16le`                  |
| `data.audio.sampleRateHz`           | integer | 16000                        |
| `data.audio.channels`               | integer | 1                            |
| `data.audio.frameDurationMs`        | integer | 100                          |
| `data.audio.transport`              | string  | `json-base64`                |
| `data.limits.maxConcurrentSessions` | integer | 同時セッション上限           |
| `data.limits.maxFrameRatePerSecond` | integer | 毎秒フレーム上限             |

```json
{
  "data": {
    "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
    "streamToken": "strm_01HZX8Z3WBQXJY6D7K8L9M0N1P",
    "relayUrl": "wss://relay.example.com/api/v1/relay",
    "expiresAt": "2026-04-20T13:04:56.789Z",
    "heartbeatIntervalSec": 15,
    "audio": {
      "encoding": "pcm_s16le",
      "sampleRateHz": 16000,
      "channels": 1,
      "frameDurationMs": 100,
      "transport": "json-base64"
    },
    "limits": {
      "maxConcurrentSessions": 3,
      "maxFrameRatePerSecond": 10
    }
  },
  "meta": {
    "requestId": "req_01HZX8Y5ATB5T8R7S6Q4P3N2M1"
  }
}
```

**エラーレスポンス:**

| HTTP ステータス | エラーコード          | 条件                         |
| --------------- | --------------------- | ---------------------------- |
| 400             | `VALIDATION_ERROR`    | 必須項目不足、言語コード不正 |
| 401             | `UNAUTHORIZED`        | アクセストークン不正         |
| 409             | `CONFLICT`            | 同時セッション上限を超過     |
| 429             | `RATE_LIMIT_EXCEEDED` | 初期化 API 呼び出し過多      |

### API-003: セッション状態参照

| 項目     | 内容                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| メソッド | `GET`                                                                                                                                                                                                         |
| パス     | `/sessions/{sessionId}`                                                                                                                                                                                       |
| 認証     | 必要                                                                                                                                                                                                          |
| 概要     | 指定ソースセッションの現在状態を取得する                                                                                                                                                                      |
| 関連要件 | [REQ-002](../01-requirements/requirements-specification.md#req-002), [REQ-006](../01-requirements/requirements-specification.md#req-006), [REQ-009](../01-requirements/requirements-specification.md#req-009) |

**パスパラメータ:**

| パラメータ  | 型     | 説明                    |
| ----------- | ------ | ----------------------- |
| `sessionId` | string | 参照対象のセッション ID |

**成功レスポンス（200 OK）:**

| フィールド            | 型             | 説明                                                                                                                       |
| --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `data.sessionId`      | string         | セッション ID                                                                                                              |
| `data.state`          | string         | `connecting` / `capturing` / `transcribing` / `translating` / `paused` / `reconnecting` / `degraded` / `stopped` / `error` |
| `data.sourceType`     | string         | ソース種別                                                                                                                 |
| `data.displayName`    | string         | ソース名                                                                                                                   |
| `data.sourceLanguage` | string \| null | 現在の入力言語                                                                                                             |
| `data.targetLanguage` | string         | 翻訳先言語                                                                                                                 |
| `data.startedAt`      | string         | 開始時刻                                                                                                                   |
| `data.lastEventAt`    | string \| null | 最終イベント時刻                                                                                                           |
| `data.lastErrorCode`  | string \| null | 直近エラーコード                                                                                                           |

```json
{
  "data": {
    "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
    "state": "transcribing",
    "sourceType": "tab",
    "displayName": "YouTube Live",
    "sourceLanguage": "en-US",
    "targetLanguage": "ja-JP",
    "startedAt": "2026-04-20T12:34:56.789Z",
    "lastEventAt": "2026-04-20T12:35:07.214Z",
    "lastErrorCode": null
  }
}
```

## 6. WebSocket 仕様

### 6.1 API-004: 接続仕様

| 項目     | 内容                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接続先   | `/relay?sessionId={sessionId}&protocolVersion=1.0`                                                                                                                                                                                                                                                                                                      |
| 認証     | `Authorization: Bearer <stream_token>`                                                                                                                                                                                                                                                                                                                  |
| 概要     | 音声フレーム送信と字幕 / 翻訳イベント受信を同一接続で処理する                                                                                                                                                                                                                                                                                           |
| 関連要件 | [REQ-003](../01-requirements/requirements-specification.md#req-003), [REQ-005](../01-requirements/requirements-specification.md#req-005), [REQ-006](../01-requirements/requirements-specification.md#req-006), [REQ-007](../01-requirements/requirements-specification.md#req-007), [REQ-009](../01-requirements/requirements-specification.md#req-009) |

**接続シーケンス:**

1. 拡張が `POST /sessions` を呼び出して `sessionId` と `streamToken` を取得する
2. 拡張が `sessionId` をクエリに付与して WebSocket へ接続する
3. 拡張が `session.start` を送信する
4. Relay API が `session.ready` を返却する
5. 拡張が `audio.frame` を継続送信する
6. Relay API が `transcript.partial`、`transcript.final`、`translation.final` を返却する

### 6.2 クライアント送信イベント

#### `session.start`

セッションのストリーミング開始を宣言する制御イベント。

| フィールド                   | 型             | 必須 | 説明                          |
| ---------------------------- | -------------- | ---- | ----------------------------- |
| `payload.sourceLanguage`     | string \| null | No   | 入力言語。自動判定時は `null` |
| `payload.autoDetectLanguage` | boolean        | Yes  | 自動判定有無                  |
| `payload.targetLanguage`     | string         | Yes  | 翻訳先言語                    |
| `payload.translationEnabled` | boolean        | Yes  | 翻訳有効フラグ                |

```json
{
  "eventType": "session.start",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 1,
  "timestamp": "2026-04-20T12:34:57.001Z",
  "payload": {
    "sourceLanguage": "en-US",
    "autoDetectLanguage": false,
    "targetLanguage": "ja-JP",
    "translationEnabled": true
  }
}
```

#### `audio.frame`

音声フレーム送信用イベント。100ms 単位で送信する。

| フィールド                | 型      | 必須 | 説明                               |
| ------------------------- | ------- | ---- | ---------------------------------- |
| `payload.chunkId`         | string  | Yes  | フレーム識別子                     |
| `payload.audioBase64`     | string  | Yes  | Base64 エンコード済み PCM16 データ |
| `payload.encoding`        | string  | Yes  | `pcm_s16le`                        |
| `payload.sampleRateHz`    | integer | Yes  | 16000                              |
| `payload.channels`        | integer | Yes  | 1                                  |
| `payload.frameDurationMs` | integer | Yes  | 100                                |
| `payload.capturedAt`      | string  | Yes  | クライアント側の採取時刻           |

```json
{
  "eventType": "audio.frame",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 2,
  "timestamp": "2026-04-20T12:34:57.105Z",
  "payload": {
    "chunkId": "chk_000001",
    "audioBase64": "AAABAAIAAwAEAAUA...",
    "encoding": "pcm_s16le",
    "sampleRateHz": 16000,
    "channels": 1,
    "frameDurationMs": 100,
    "capturedAt": "2026-04-20T12:34:57.093Z"
  }
}
```

#### `session.pause`

| フィールド       | 型     | 必須 | 説明                     |
| ---------------- | ------ | ---- | ------------------------ |
| `payload.reason` | string | No   | 利用者起因の一時停止理由 |

#### `session.resume`

| フィールド       | 型     | 必須 | 説明     |
| ---------------- | ------ | ---- | -------- |
| `payload.reason` | string | No   | 再開理由 |

#### `session.stop`

| フィールド       | 型     | 必須 | 説明     |
| ---------------- | ------ | ---- | -------- |
| `payload.reason` | string | No   | 停止理由 |

#### `session.ping`

ハートビート維持用のイベント。`payload` は空オブジェクトとする。

### 6.3 サーバー送信イベント

#### `session.ready`

WebSocket セッション開始受理イベント。

| フィールド                              | 型      | 説明                                 |
| --------------------------------------- | ------- | ------------------------------------ |
| `payload.state`                         | string  | 接続受理後の状態。通常は `capturing` |
| `payload.heartbeatIntervalSec`          | integer | ハートビート間隔                     |
| `payload.acceptedAudio.transport`       | string  | `json-base64`                        |
| `payload.acceptedAudio.sampleRateHz`    | integer | 16000                                |
| `payload.acceptedAudio.channels`        | integer | 1                                    |
| `payload.acceptedAudio.frameDurationMs` | integer | 100                                  |

```json
{
  "eventType": "session.ready",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 1,
  "timestamp": "2026-04-20T12:34:57.030Z",
  "payload": {
    "state": "capturing",
    "heartbeatIntervalSec": 15,
    "acceptedAudio": {
      "transport": "json-base64",
      "sampleRateHz": 16000,
      "channels": 1,
      "frameDurationMs": 100
    }
  }
}
```

#### `transcript.partial`

発話中の暫定字幕イベント。同一 `segmentId` に対して複数回送信されることがある。

| フィールド              | 型             | 説明                         |
| ----------------------- | -------------- | ---------------------------- |
| `payload.segmentId`     | string         | 字幕セグメント ID            |
| `payload.revision`      | integer        | 暫定更新回数                 |
| `payload.text`          | string         | 暫定原文                     |
| `payload.language`      | string \| null | 推定または設定済み入力言語   |
| `payload.startOffsetMs` | integer        | セッション開始からの開始位置 |
| `payload.endOffsetMs`   | integer        | セッション開始からの終了位置 |

#### `transcript.final`

確定字幕イベント。翻訳はこのイベント受信後に直ちに開始される。

| フィールド              | 型             | 説明                         |
| ----------------------- | -------------- | ---------------------------- |
| `payload.segmentId`     | string         | 字幕セグメント ID            |
| `payload.text`          | string         | 確定原文                     |
| `payload.language`      | string \| null | 確定した入力言語             |
| `payload.startOffsetMs` | integer        | セッション開始からの開始位置 |
| `payload.endOffsetMs`   | integer        | セッション開始からの終了位置 |
| `payload.finalizedAt`   | string         | 確定時刻                     |

```json
{
  "eventType": "transcript.final",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 17,
  "timestamp": "2026-04-20T12:35:01.210Z",
  "payload": {
    "segmentId": "seg_0007",
    "text": "Thank you for joining us today.",
    "language": "en-US",
    "startOffsetMs": 3820,
    "endOffsetMs": 5120,
    "finalizedAt": "2026-04-20T12:35:01.208Z"
  }
}
```

#### `translation.final`

翻訳字幕イベント。必ず `transcript.final` の `segmentId` を参照する。

| フィールド                | 型             | 説明                                      |
| ------------------------- | -------------- | ----------------------------------------- |
| `payload.translationId`   | string         | 翻訳イベント ID                           |
| `payload.sourceSegmentId` | string         | 対応する原文セグメント ID                 |
| `payload.text`            | string         | 翻訳結果                                  |
| `payload.sourceLanguage`  | string \| null | 入力言語                                  |
| `payload.targetLanguage`  | string         | 翻訳先言語                                |
| `payload.latencyMs`       | integer        | `transcript.final` から翻訳完了までの時間 |

```json
{
  "eventType": "translation.final",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 18,
  "timestamp": "2026-04-20T12:35:01.684Z",
  "payload": {
    "translationId": "trn_0007",
    "sourceSegmentId": "seg_0007",
    "text": "本日はご参加ありがとうございます。",
    "sourceLanguage": "en-US",
    "targetLanguage": "ja-JP",
    "latencyMs": 476
  }
}
```

#### `session.state.changed`

セッション状態変化イベント。

| フィールド              | 型             | 説明       |
| ----------------------- | -------------- | ---------- |
| `payload.previousState` | string         | 直前状態   |
| `payload.currentState`  | string         | 遷移後状態 |
| `payload.reason`        | string \| null | 遷移理由   |

状態値は `connecting` / `capturing` / `transcribing` / `translating` / `paused` / `reconnecting` / `degraded` / `stopped` / `error` を使用する。

#### `session.error`

非致命・致命の双方を表現するエラーイベント。翻訳失敗時は `fatal=false` とし、文字起こしは継続する。

| フィールド          | 型      | 説明               |
| ------------------- | ------- | ------------------ |
| `payload.code`      | string  | エラーコード       |
| `payload.message`   | string  | エラー概要         |
| `payload.retryable` | boolean | 再試行可否         |
| `payload.fatal`     | boolean | セッション継続可否 |
| `payload.details`   | object  | 補足情報           |

```json
{
  "eventType": "session.error",
  "sessionId": "sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8",
  "sequence": 19,
  "timestamp": "2026-04-20T12:35:02.020Z",
  "payload": {
    "code": "TRANSLATION_PROVIDER_FAILED",
    "message": "Translation request timed out",
    "retryable": true,
    "fatal": false,
    "details": {
      "segmentId": "seg_0008",
      "timeoutMs": 800
    }
  }
}
```

#### `session.pong`

`session.ping` に対する応答イベント。`payload` は空オブジェクトとする。

### 6.4 イベント処理ルール

- `transcript.partial` は同一 `segmentId` に対して `revision` を増やしながら上書き更新する
- `transcript.final` は 1 セグメントにつき 1 回だけ送信する
- `translation.final` は必ず既存の `transcript.final.segmentId` に紐づく
- 翻訳が 800ms を超過した場合、該当セグメントの翻訳は打ち切り、`session.error` と `session.state.changed(degraded)` を返す
- `degraded` 状態でも後続の `transcript.final` は継続する
- 翻訳プロバイダが回復した場合、Relay API は後続セグメントから `translation.final` を再開できる

### 6.5 劣化運転時の扱い

| 事象               | Relay API の挙動                                 | 拡張側期待動作           |
| ------------------ | ------------------------------------------------ | ------------------------ |
| 翻訳タイムアウト   | `session.error` を返し、状態を `degraded` にする | 原文字幕のみ表示継続     |
| STT 一時障害       | `session.error` を返す                           | 再接続待機表示           |
| 無効な音声フレーム | `session.error(fatal=true)` を返す               | 当該セッション停止       |
| 同時接続上限超過   | 接続拒否または `session.error(fatal=true)`       | 新規ソース開始を失敗表示 |

## 7. 変更履歴

| バージョン | 日付       | 変更者 | 変更内容 |
| ---------- | ---------- | ------ | -------- |
| 0.1.0      | 2026-04-20 | Codex  | 初版作成 |
