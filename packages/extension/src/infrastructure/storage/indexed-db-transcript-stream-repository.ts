import { ResultAsync, errAsync } from 'neverthrow';
import {
  type TranscriptSearchMatch,
  type TranscriptStreamRepository,
} from '../../domain/repositories/transcript-stream-repository';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import {
  INDEXED_DB_NAME,
  TRANSCRIPT_STORE,
  TRANSLATION_STORE,
  createPeraperaDbHandle,
  toPersistenceError,
} from './open-perapera-db';
import { transcriptSegmentToRecord, translationSegmentToRecord } from './records';
import { assembleTranscriptStream } from './transcript-stream-assembler';

/**
 * 拡張インタフェース。`TranscriptStreamRepository` に加えてテスト cleanup や
 * Service Worker シャットダウン時に IndexedDB connection を閉じる `close()`
 * を公開する。
 */
export type CloseableTranscriptStreamRepository = TranscriptStreamRepository & {
  close: () => Promise<void>;
};

export type IndexedDbTranscriptStreamRepositoryOptions = Readonly<{
  /** Override for tests. Production should omit to use the default. */
  databaseName?: string;
}>;

/**
 * IMPL-141 IndexedDbTranscriptStreamRepository (DD-261, DB-002 / DB-003)。
 *
 * `transcript_segments` / `translation_segments` 2 object store を集約単位で
 * 操作する adapter。`IndexedDbSessionStore` と同一 IndexedDB を共有する。
 *
 * - `findBySessionId`: `by-sessionId` index で両 store から全行取得 →
 *   `assembleTranscriptStream` で集約を再構築。両方とも 0 件なら
 *   `notFoundError({ resourceType: 'TranscriptStream' })`。
 * - `appendPartial`: そのまま upsert (isFinal=false 前提だが、防御検証は行わない
 *   — `TranscriptSegment` factory 側で revision 単調増加などのドメイン不変条件
 *   は既に保証されている)。
 * - `appendFinal`: **防御検証** `segment.isFinal === true` を要求。違反時
 *   `invariantViolationError({ invariant: 'append-final-requires-final-segment' })`。
 * - `appendTranslation`: **防御検証** 対応する final segment
 *   (`segmentId` 一致 & `isFinal=true`) が DB 上に存在することを要求。違反時
 *   `invariantViolationError({ invariant: 'translation-requires-final-segment' })`。
 *
 * 設計書 (`transcript-stream-repository.ts:17-23`) の契約に準拠。
 */
export const createIndexedDbTranscriptStreamRepository = (
  options: IndexedDbTranscriptStreamRepositoryOptions = {},
): CloseableTranscriptStreamRepository => {
  const databaseName = options.databaseName ?? INDEXED_DB_NAME;
  const handle = createPeraperaDbHandle(databaseName);

  const findBySessionId = (
    sessionIdentifier: SessionIdentifier,
  ): ResultAsync<TranscriptStream, DomainError> =>
    ResultAsync.fromPromise(
      (async () => {
        const connection = await handle.get();
        const transcripts = await connection.getAllFromIndex(
          TRANSCRIPT_STORE,
          'by-sessionId',
          sessionIdentifier,
        );
        const translations = await connection.getAllFromIndex(
          TRANSLATION_STORE,
          'by-sessionId',
          sessionIdentifier,
        );
        return { transcripts, translations };
      })(),
      toPersistenceError('findBySessionId'),
    ).andThen((raw): ResultAsync<TranscriptStream, DomainError> => {
      if (raw.transcripts.length === 0 && raw.translations.length === 0) {
        return errAsync<TranscriptStream, DomainError>(
          notFoundError({ resourceType: 'TranscriptStream', identifier: sessionIdentifier }),
        );
      }
      const assembled = assembleTranscriptStream(
        sessionIdentifier,
        raw.transcripts,
        raw.translations,
      );
      if (assembled.isErr()) {
        return errAsync<TranscriptStream, DomainError>(assembled.error);
      }
      return ResultAsync.fromSafePromise(Promise.resolve(assembled.value));
    });

  return {
    findBySessionId,

    appendPartial: (sessionIdentifier, segment) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(
            TRANSCRIPT_STORE,
            transcriptSegmentToRecord(sessionIdentifier, segment),
          );
        })(),
        toPersistenceError('appendPartial'),
      ),

    appendFinal: (sessionIdentifier, segment) => {
      if (!segment.isFinal) {
        return errAsync<void, DomainError>(
          invariantViolationError({
            invariant: 'append-final-requires-final-segment',
            details: `segment ${segment.segmentIdentifier} is not finalized (isFinal=false)`,
          }),
        );
      }
      return ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          await connection.put(
            TRANSCRIPT_STORE,
            transcriptSegmentToRecord(sessionIdentifier, segment),
          );
        })(),
        toPersistenceError('appendFinal'),
      );
    },

    appendTranslation: (sessionIdentifier, translation) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const rows = await connection.getAllFromIndex(
            TRANSCRIPT_STORE,
            'by-sessionId',
            sessionIdentifier,
          );
          return rows;
        })(),
        toPersistenceError('appendTranslation/lookup'),
      ).andThen((rows): ResultAsync<void, DomainError> => {
        const hasFinal = rows.some(
          (row) => row.segmentId === translation.segmentIdentifier && row.isFinal,
        );
        if (!hasFinal) {
          return errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'translation-requires-final-segment',
              details: `no final segment found for segmentId=${translation.segmentIdentifier} in session ${sessionIdentifier}`,
            }),
          );
        }
        return ResultAsync.fromPromise(
          (async () => {
            const connection = await handle.get();
            await connection.put(
              TRANSLATION_STORE,
              translationSegmentToRecord(sessionIdentifier, translation),
            );
          })(),
          toPersistenceError('appendTranslation/put'),
        );
      }),

    search: (query) =>
      ResultAsync.fromPromise(
        (async () => {
          const connection = await handle.get();
          const transcripts =
            query.language === 'target' ? [] : await connection.getAll(TRANSCRIPT_STORE);
          const translations =
            query.language === 'source' ? [] : await connection.getAll(TRANSLATION_STORE);
          return { transcripts, translations };
        })(),
        toPersistenceError('search'),
      ).andThen((raw): ResultAsync<readonly TranscriptSearchMatch[], DomainError> => {
        const keyword = query.caseSensitive ? query.keyword : query.keyword.toLowerCase();
        const matches: TranscriptSearchMatch[] = [];
        const snippetAround = (text: string, start: number): string => {
          const before = Math.max(0, start - 20);
          const after = Math.min(text.length, start + query.keyword.length + 20);
          return `${before > 0 ? '…' : ''}${text.slice(before, after)}${
            after < text.length ? '…' : ''
          }`;
        };
        for (const row of raw.transcripts) {
          if (!row.isFinal) continue;
          const haystack = query.caseSensitive ? row.text : row.text.toLowerCase();
          const index = haystack.indexOf(keyword);
          if (index === -1) continue;
          const sessionResult = parseSessionIdentifier(row.sessionId);
          if (sessionResult.isErr()) continue;
          matches.push({
            sessionIdentifier: sessionResult.value,
            segmentIdentifier: row.segmentId,
            snippet: snippetAround(row.text, index),
            matchedLanguage: 'source',
            startTimeMs: row.startMs,
          });
        }
        for (const row of raw.translations) {
          if (row.status !== 'completed') continue;
          const haystack = query.caseSensitive ? row.text : row.text.toLowerCase();
          const index = haystack.indexOf(keyword);
          if (index === -1) continue;
          const sessionResult = parseSessionIdentifier(row.sessionId);
          if (sessionResult.isErr()) continue;
          // 対応する transcript segment の startMs を取得する (ない場合は 0)
          const transcriptRow = raw.transcripts.find((t) => t.segmentId === row.segmentId);
          matches.push({
            sessionIdentifier: sessionResult.value,
            segmentIdentifier: row.segmentId,
            snippet: snippetAround(row.text, index),
            matchedLanguage: 'target',
            startTimeMs: transcriptRow?.startMs ?? 0,
          });
        }
        const readonlyMatches: readonly TranscriptSearchMatch[] = matches;
        return ResultAsync.fromSafePromise(Promise.resolve(readonlyMatches));
      }),

    close: handle.close,
  };
};
