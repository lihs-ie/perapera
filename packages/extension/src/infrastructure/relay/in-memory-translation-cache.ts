/**
 * IMPL-322 InMemoryTranslationCache (DD-133)。
 *
 * ホットパスで同一原文の翻訳結果を 30 秒間短期保持するキャッシュ。
 * 再翻訳要求を重複させないことで Relay API / 翻訳プロバイダへの負荷を抑える
 * (`infrastructure.md` §7.3)。
 *
 * **本番実装で mock が利用されない設計**:
 * - `clock: () => number` を **必須** DI (default 引数なし)
 * - production の entrypoint で `() => Date.now()` を明示的に渡す
 * - `ttlMs` は仕様定数 (30000) で default を許容 (mock ではない)
 * - 呼び出し側は必ず自分で clock を選択するため、production で
 *   偶発的に mock clock が使われる事故を防ぐ
 */

export const DEFAULT_TRANSLATION_CACHE_TTL_MS = 30000 as const;

export type TranslationCacheEntry = Readonly<{
  targetLanguage: string;
  text: string;
}>;

export type TranslationCache = Readonly<{
  get: (key: string) => TranslationCacheEntry | null;
  set: (key: string, entry: TranslationCacheEntry) => void;
  has: (key: string) => boolean;
  clear: () => void;
}>;

export type TranslationCacheDependencies = Readonly<{
  clock: () => number;
  ttlMs?: number;
}>;

type StoredEntry = {
  entry: TranslationCacheEntry;
  expiresAt: number;
};

export const createInMemoryTranslationCache = (
  deps: TranslationCacheDependencies,
): TranslationCache => {
  const ttl = deps.ttlMs ?? DEFAULT_TRANSLATION_CACHE_TTL_MS;
  const store = new Map<string, StoredEntry>();

  const evictIfExpired = (key: string): void => {
    const stored = store.get(key);
    if (stored !== undefined && stored.expiresAt <= deps.clock()) {
      store.delete(key);
    }
  };

  return {
    get: (key) => {
      evictIfExpired(key);
      return store.get(key)?.entry ?? null;
    },
    set: (key, entry) => {
      store.set(key, { entry, expiresAt: deps.clock() + ttl });
    },
    has: (key) => {
      evictIfExpired(key);
      return store.has(key);
    },
    clear: () => {
      store.clear();
    },
  };
};
