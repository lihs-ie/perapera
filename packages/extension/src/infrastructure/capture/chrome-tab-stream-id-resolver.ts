import { ResultAsync } from 'neverthrow';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import { type TabStreamIdResolver } from '../../application/ports/tab-stream-id-resolver';
import { type TabCaptureApi } from './tab-capture-source-adapter';

/**
 * IMPL-613 ChromeTabStreamIdResolver (infrastructure adapter)。
 *
 * `TabCaptureApi.getMediaStreamId` (IMPL-609) を wrap し、
 * application 層の `TabStreamIdResolver` port を実装する。失敗 / 空 streamId は
 * `invariantViolationError` に変換。
 *
 * **本番実装で mock を使わない設計**:
 * - `tabCaptureApi` は必須 DI (default なし)
 * - production では `defaultTabCaptureApi` を composition で注入
 * - test では fake TabCaptureApi を注入
 */
export const createChromeTabStreamIdResolver = (
  tabCaptureApi: TabCaptureApi,
): TabStreamIdResolver => {
  return {
    resolve: (targetTabId) =>
      ResultAsync.fromPromise(
        tabCaptureApi.getMediaStreamId({ targetTabId }),
        (cause): DomainError =>
          invariantViolationError({
            invariant: 'chrome-tab-stream-id-resolver',
            details: cause instanceof Error ? cause.message : String(cause),
          }),
      ),
  };
};
