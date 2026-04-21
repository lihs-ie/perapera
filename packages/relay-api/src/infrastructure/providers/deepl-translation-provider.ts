import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import {
  type TranslationPort,
  type TranslationResponse,
} from '../../application/ports/translation-port';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-445 DeepL translation provider (DD-413)。
 *
 * REST POST `/v2/translate` で翻訳する。認証は `Authorization: DeepL-Auth-Key
 * <API_KEY>` header。
 *
 * **Mock ではない本番実装**。標準 `fetch` を使い、DI で `fetchImpl` を上書き
 * 可能にする (テスト時は決定的 fetch mock を渡す)。
 */
export type DeepLTranslationProviderConfig = Readonly<{
  apiKey: string;
  /** 既定 `https://api-free.deepl.com`。有料版は `https://api.deepl.com` */
  baseUrl?: string;
  /** test 向け DI。未指定時は global `fetch` を使用 */
  fetchImpl?: typeof fetch;
  /** 経過時間計測用 clock (performance.now 等)。test で deterministic */
  monotonicClock?: () => number;
}>;

type DeepLTranslation = {
  detected_source_language?: string;
  text?: string;
};

type DeepLResponseBody = {
  translations?: readonly DeepLTranslation[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asTranslationBody = (raw: unknown): DeepLResponseBody | null => {
  if (!isObject(raw)) return null;
  const translations = raw['translations'];
  if (!Array.isArray(translations)) return null;
  const normalized: DeepLTranslation[] = [];
  for (const entry of translations) {
    if (!isObject(entry)) return null;
    const text = entry['text'];
    const detected = entry['detected_source_language'];
    const translation: DeepLTranslation = {};
    if (typeof text === 'string') translation.text = text;
    if (typeof detected === 'string') translation.detected_source_language = detected;
    normalized.push(translation);
  }
  return { translations: normalized };
};

const normalizeLanguage = (lang: string): string => {
  const base = lang.split('-')[0] ?? lang;
  return base.toUpperCase();
};

export const createDeepLTranslationProvider = (
  config: DeepLTranslationProviderConfig,
): TranslationPort => {
  if (config.apiKey.length === 0) {
    throw new Error('createDeepLTranslationProvider: apiKey must be non-empty');
  }
  const baseUrl = config.baseUrl ?? 'https://api-free.deepl.com';
  const fetchImpl = config.fetchImpl ?? fetch;
  const monotonic = config.monotonicClock ?? (() => performance.now());

  return {
    translate: (request) => {
      const startedAt = monotonic();
      const body = {
        text: [request.text],
        target_lang: normalizeLanguage(request.targetLanguage),
        ...(request.sourceLanguage === null
          ? {}
          : { source_lang: normalizeLanguage(request.sourceLanguage) }),
      };

      return ResultAsync.fromPromise(
        fetchImpl(`${baseUrl}/v2/translate`, {
          method: 'POST',
          headers: {
            Authorization: `DeepL-Auth-Key ${config.apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
        }),
        (cause) =>
          invariantViolationError({
            invariant: 'deepl-fetch-failed',
            details: cause instanceof Error ? cause.message : 'unknown fetch error',
          }),
      )
        .andThen((response): ResultAsync<unknown, DomainError> => {
          if (!response.ok) {
            return ResultAsync.fromSafePromise(response.text()).andThen((text) =>
              errAsync<unknown, DomainError>(
                invariantViolationError({
                  invariant: 'deepl-http-error',
                  details: `status=${String(response.status)} body=${text.slice(0, 200)}`,
                }),
              ),
            );
          }
          return ResultAsync.fromPromise(response.json(), (cause) =>
            invariantViolationError({
              invariant: 'deepl-json-parse-failed',
              details: cause instanceof Error ? cause.message : 'unknown parse error',
            }),
          );
        })
        .andThen((raw): ResultAsync<TranslationResponse, DomainError> => {
          const parsed = asTranslationBody(raw);
          const first = parsed?.translations?.[0];
          if (first === undefined || typeof first.text !== 'string') {
            return errAsync<TranslationResponse, DomainError>(
              invariantViolationError({
                invariant: 'deepl-response-malformed',
                details: 'translations[0].text missing or non-string',
              }),
            );
          }
          const latencyMs = Math.max(0, Math.round(monotonic() - startedAt));
          return okAsync<TranslationResponse, DomainError>({
            text: first.text,
            detectedSourceLanguage: first.detected_source_language ?? request.sourceLanguage,
            latencyMs,
          });
        });
    },
  };
};
