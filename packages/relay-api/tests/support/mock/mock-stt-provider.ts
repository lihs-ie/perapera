import { ResultAsync, ok, okAsync } from 'neverthrow';
import { type DomainError } from '../../../src/domain/shared/errors';
import {
  type SttPort,
  type SttStreamHandle,
  type TranscriptEvent,
} from '../../../src/application/ports/stt-port';

/**
 * tests/support/mock: `SttPort` の deterministic な mock。
 *
 * **src/ からは import しない** (ESLint `no-restricted-imports` で防御)。
 * UseCase test / WebSocket integration test で production Deepgram adapter の
 * 代替として DI 注入する。
 */
export type MockSttProviderConfig = Readonly<{
  /** audio.frame 受信 N 回ごとに transcript.partial / final を emit */
  transcripts?: readonly TranscriptEvent[];
}>;

export const createMockSttProvider = (config: MockSttProviderConfig = {}): SttPort => {
  const scripted = config.transcripts ?? [];
  return {
    openStream: () => {
      let iteratorIndex = 0;
      const handle: SttStreamHandle = {
        sendFrame: () => ok(undefined),
        close: () => okAsync<void, DomainError>(undefined),
        events: {
          [Symbol.asyncIterator]: () => ({
            next: (): Promise<IteratorResult<TranscriptEvent>> => {
              if (iteratorIndex >= scripted.length) {
                return Promise.resolve({ done: true, value: undefined });
              }
              const event = scripted[iteratorIndex];
              iteratorIndex += 1;
              if (event === undefined) {
                return Promise.resolve({ done: true, value: undefined });
              }
              return Promise.resolve({ done: false, value: event });
            },
          }),
        },
      };
      return ResultAsync.fromSafePromise(Promise.resolve(handle));
    },
  };
};
