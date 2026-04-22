import { errAsync, ResultAsync } from 'neverthrow';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-611 TabStreamApi (offscreen 側 port)。
 *
 * `chrome.tabCapture.getMediaStreamId` (SW 側 `TabCaptureApi.getMediaStreamId`,
 * IMPL-609) で取得した streamId を MediaStream に解決する port。
 * offscreen document の `navigator.mediaDevices.getUserMedia` を呼び出し、
 * Chrome 独自の `chromeMediaSource: 'tab'` + `chromeMediaSourceId: <streamId>`
 * constraint で tab 音声 MediaStream を確保する。
 *
 * 本 port は SW 側では呼ばれない (MV3 SW は `navigator.mediaDevices` を持たない)。
 * offscreen document でのみ利用され、Phase 5+ Step 2b で配線される。
 *
 * **本番実装で mock を使わない設計**:
 * - production adapter は `defaultTabStreamApi` を明示注入
 * - test では minimal fake (Promise<MediaStream> を返す関数) を注入
 */
export type TabStreamApi = Readonly<{
  /** streamId から tab 音声 MediaStream を解決 */
  acquire: (streamId: string) => ResultAsync<MediaStream, DomainError>;
}>;

/**
 * `navigator.mediaDevices.getUserMedia` の low-level constraint form を
 * 抽象化した最小 API。production では `navigator.mediaDevices.getUserMedia`
 * を直接 wrap、test では minimal fake を注入する。
 *
 * - `chromeMediaSource: 'tab'` + `chromeMediaSourceId` は TypeScript 標準型
 *   `MediaStreamConstraints` に含まれない legacy mandatory 構文だが、
 *   Chrome tab capture では必須。production adapter 内部の 1 箇所でのみ
 *   `as MediaStreamConstraints` 型 assertion を行うため、本 port 自身は
 *   標準型で扱う。
 */
export type TabStreamFetcher = Readonly<{
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}>;

export const defaultTabStreamFetcher: TabStreamFetcher = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
};

const buildTabConstraints = (streamId: string): MediaStreamConstraints => {
  // Chrome tab capture は legacy mandatory 構文。TS 標準 MediaStreamConstraints
  // には含まれないため、object literal を一度 cast する必要がある。本 adapter
  // 内部に閉じた限定的な使用 (eslint rule 'consistent-type-assertions' の
  // 正当な例外)。
  const legacy = {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return legacy as unknown as MediaStreamConstraints;
};

export const createTabStreamApi = (
  fetcher: TabStreamFetcher = defaultTabStreamFetcher,
): TabStreamApi => {
  return {
    acquire: (streamId) => {
      if (streamId.length === 0) {
        return errAsync<MediaStream, DomainError>(
          invariantViolationError({
            invariant: 'tab-stream-api',
            details: 'streamId must be non-empty',
          }),
        );
      }
      return ResultAsync.fromPromise(
        fetcher.getUserMedia(buildTabConstraints(streamId)),
        (cause): DomainError =>
          invariantViolationError({
            invariant: 'tab-stream-api',
            details: cause instanceof Error ? cause.message : String(cause),
          }),
      );
    },
  };
};

/** Production 既定 adapter。offscreen entrypoint から `createTabStreamApi()` を呼び出して利用。 */
export const defaultTabStreamApi: TabStreamApi = createTabStreamApi(defaultTabStreamFetcher);
