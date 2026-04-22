import { type ResultAsync } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-613 TabStreamIdResolver (application port)。
 *
 * Chrome `chrome.tabCapture.getMediaStreamId` で取得できる streamId を
 * application 層から port 経由で参照するための抽象。
 *
 * offscreen 側は `TabStreamApi.acquire(streamId)` で実際の MediaStream を
 * 確保するが、streamId の取得自体は SW (Service Worker) 側でしか実行できない
 * (offscreen では `chrome.tabCapture` が利用不可)。従って SW 側の UseCase で
 * 本 port を呼び、取得した streamId を offscreen への `audio.open` command に
 * 乗せる。
 *
 * production では `createChromeTabStreamIdResolver(tabCaptureApi)` を明示注入。
 * test では fake resolver を注入する。
 */
export type TabStreamIdResolver = Readonly<{
  resolve: (targetTabId: number) => ResultAsync<string, DomainError>;
}>;
