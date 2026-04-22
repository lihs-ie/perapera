/**
 * IMPL-601 Offscreen document lifecycle helper。
 *
 * MV3 拡張の Service Worker は DOM / AudioContext を直接扱えないため、
 * `chrome.offscreen.createDocument` で生成した offscreen document に audio
 * 処理を delegate する (offscreen 側の受信は IMPL-562 で実装済)。本 helper は
 * SW 起動時に `ensure` を呼べば 1 回だけ createDocument し、既に存在する場合は
 * no-op する idempotent lifecycle を提供する。
 *
 * **本番実装で mock を使わない設計**:
 * - `offscreenApi` は必須 DI。production では `defaultOffscreenApi`
 *   (`chrome.offscreen` を直接 wrap) を明示注入
 * - test では minimal fake を注入する
 */

export type OffscreenApi = Readonly<{
  hasDocument?: () => Promise<boolean>;
  createDocument: (params: chrome.offscreen.CreateParameters) => Promise<void>;
  closeDocument: () => Promise<void>;
}>;

export const defaultOffscreenApi: OffscreenApi = {
  hasDocument: () => chrome.offscreen.hasDocument(),
  createDocument: (params) => chrome.offscreen.createDocument(params),
  closeDocument: () => chrome.offscreen.closeDocument(),
};

export type OffscreenLifecycle = Readonly<{
  /** Offscreen document を 1 回だけ作成 (既に存在すれば no-op)。idempotent */
  ensure: () => Promise<void>;
  /** Service Worker shutdown 時に document を close */
  close: () => Promise<void>;
}>;

export type OffscreenLifecycleDependencies = Readonly<{
  offscreenApi: OffscreenApi;
  /** offscreen.html の絶対 URL (`chrome.runtime.getURL('/offscreen.html')`) */
  documentUrl: string;
  /** 作成理由 (Chrome が permission 理由を記録する)。default `['AUDIO_PLAYBACK']` */
  reasons?: chrome.offscreen.Reason[];
  /** 作成正当化理由。default `'AudioContext host'` */
  justification?: string;
  /** Err ログ sink。default `console.warn` */
  logWarn?: (message: string) => void;
}>;

const DEFAULT_REASONS: chrome.offscreen.Reason[] = [chrome.offscreen.Reason.AUDIO_PLAYBACK];
const DEFAULT_JUSTIFICATION = 'AudioContext host for tab / microphone / desktop capture';

const defaultLogWarn = (message: string): void => {
  console.warn(message);
};

const isAlreadyExistsError = (cause: unknown): boolean => {
  if (!(cause instanceof Error)) return false;
  return /already|exist/i.test(cause.message);
};

export const createOffscreenLifecycle = (
  deps: OffscreenLifecycleDependencies,
): OffscreenLifecycle => {
  const reasons = deps.reasons ?? DEFAULT_REASONS;
  const justification = deps.justification ?? DEFAULT_JUSTIFICATION;
  const logWarn = deps.logWarn ?? defaultLogWarn;
  let created = false;

  return {
    ensure: async () => {
      if (created) return;
      if (deps.offscreenApi.hasDocument !== undefined) {
        try {
          const exists = await deps.offscreenApi.hasDocument();
          if (exists) {
            created = true;
            return;
          }
        } catch (cause) {
          logWarn(
            `[perapera] offscreen-lifecycle hasDocument check failed: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
          );
        }
      }
      try {
        await deps.offscreenApi.createDocument({
          url: deps.documentUrl,
          reasons,
          justification,
        });
        created = true;
      } catch (cause) {
        if (isAlreadyExistsError(cause)) {
          // 別ルートで先に createDocument された race condition。OK として扱う
          created = true;
          return;
        }
        logWarn(
          `[perapera] offscreen-lifecycle createDocument failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
        throw cause instanceof Error ? cause : new Error(String(cause));
      }
    },
    close: async () => {
      if (!created) return;
      try {
        await deps.offscreenApi.closeDocument();
      } catch (cause) {
        logWarn(
          `[perapera] offscreen-lifecycle closeDocument failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      } finally {
        created = false;
      }
    },
  };
};
