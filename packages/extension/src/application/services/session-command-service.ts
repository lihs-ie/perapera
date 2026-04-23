import { okAsync, type ResultAsync } from 'neverthrow';
import {
  type HandleTranscriptFinalInput,
  type HandleTranscriptFinalOutput,
} from '../dto/handle-transcript-final-dto';
import {
  type HandleTranscriptPartialInput,
  type HandleTranscriptPartialOutput,
} from '../dto/handle-transcript-partial-dto';
import {
  type StartSourceSessionInput,
  type StartSourceSessionOutput,
} from '../dto/start-source-session-dto';
import {
  type StopSourceSessionInput,
  type StopSourceSessionOutput,
} from '../dto/stop-source-session-dto';
import {
  type UpdateSourceSettingsInput,
  type UpdateSourceSettingsOutput,
} from '../dto/update-source-settings-dto';
import { type ApplicationError } from '../errors/application-errors';
import { type RelayEvent } from '../ports/relay-gateway';
import { type HandleTranscriptFinalUseCase } from '../use-cases/handle-transcript-final-use-case';
import { type HandleTranscriptPartialUseCase } from '../use-cases/handle-transcript-partial-use-case';
import { type StartSourceSessionUseCase } from '../use-cases/start-source-session-use-case';
import { type StopSourceSessionUseCase } from '../use-cases/stop-source-session-use-case';
import { type UpdateSourceSettingsUseCase } from '../use-cases/update-source-settings-use-case';

/**
 * IMPL-340 SessionCommandService (detailed-design §2.2 中核)。
 *
 * Popup / SidePanel controller へ公開する **application-level facade**。
 * 複数の UseCase を 1 つの service にまとめ、controller が個別 UseCase を
 * 知らなくて済むようにする。
 *
 * **本番実装で mock が利用されない設計**:
 * - 5 UseCase と clock は全て必須 DI (default なし)
 * - production entrypoint で createStartSourceSessionUseCase 等の factory
 *   呼び出しを経由して明示的に配線する
 *
 * **handleRelayEvent の方針**:
 * - `transcript.partial` → HandleTranscriptPartialUseCase (時刻は clock() から合成)
 * - `transcript.final` → HandleTranscriptFinalUseCase (translation なし)
 * - `translation.final` → HandleTranscriptFinalUseCase (translation 付き)
 * - `session.ready` / `session.state.changed` / `session.error` は現状 no-op。
 *   これらは `SessionRegistry` や controller 側の UI 更新でハンドリング想定
 *
 * 注: `transcript.partial` / `final` の `timeRange` は RelayEvent に含まれない
 * ため `clock()` を起点に 100ms 幅で合成する。将来 Relay API が時刻を含む
 * ように更新されたら差し替える。
 */
export type SessionCommandService = Readonly<{
  startSource: (
    input: StartSourceSessionInput,
  ) => ResultAsync<StartSourceSessionOutput, ApplicationError>;
  stopSource: (
    input: StopSourceSessionInput,
  ) => ResultAsync<StopSourceSessionOutput, ApplicationError>;
  applySourceSettings: (
    input: UpdateSourceSettingsInput,
  ) => ResultAsync<UpdateSourceSettingsOutput, ApplicationError>;
  handleRelayEvent: (event: RelayEvent) => ResultAsync<void, ApplicationError>;
}>;

export type SessionCommandServiceDependencies = Readonly<{
  startSourceSessionUseCase: StartSourceSessionUseCase;
  stopSourceSessionUseCase: StopSourceSessionUseCase;
  updateSourceSettingsUseCase: UpdateSourceSettingsUseCase;
  handleTranscriptPartialUseCase: HandleTranscriptPartialUseCase;
  handleTranscriptFinalUseCase: HandleTranscriptFinalUseCase;
  clock: () => number;
}>;

const FRAME_WINDOW_MS = 100;

const toPartialInput = (
  event: Extract<RelayEvent, { type: 'transcript.partial' }>,
  nowMs: number,
): HandleTranscriptPartialInput => ({
  sessionId: event.sessionIdentifier,
  segmentId: event.segmentIdentifier,
  revision: event.revision,
  text: event.text,
  timeRange: {
    startMs: nowMs - FRAME_WINDOW_MS,
    endMs: nowMs,
  },
});

const toFinalInput = (
  event: Extract<RelayEvent, { type: 'transcript.final' }>,
  nowMs: number,
): HandleTranscriptFinalInput => ({
  sessionId: event.sessionIdentifier,
  segmentId: event.segmentIdentifier,
  text: event.text,
  timeRange: {
    startMs: nowMs - FRAME_WINDOW_MS,
    endMs: nowMs,
  },
});

const toTranslationFinalInput = (
  event: Extract<RelayEvent, { type: 'translation.final' }>,
  nowMs: number,
): HandleTranscriptFinalInput => ({
  sessionId: event.sessionIdentifier,
  segmentId: event.segmentIdentifier,
  text: '',
  timeRange: {
    startMs: nowMs - FRAME_WINDOW_MS,
    endMs: nowMs,
  },
  translation: {
    targetLanguage: event.targetLanguage,
    text: event.text,
    status: 'completed',
  },
});

export const createSessionCommandService = (
  deps: SessionCommandServiceDependencies,
): SessionCommandService => ({
  startSource: (input) => {
    console.log('[session-command-service] startSource received:', {
      sourceType: input.sourceType,
      target: input.targetLanguage,
    });
    return deps.startSourceSessionUseCase(input).map((output) => {
      console.log('[session-command-service] startSource ok:', {
        sessionId: output.sessionId,
        state: output.state,
      });
      return output;
    });
  },
  stopSource: (input) => {
    console.log('[session-command-service] stopSource received:', input);
    return deps.stopSourceSessionUseCase(input);
  },
  applySourceSettings: (input) => deps.updateSourceSettingsUseCase(input),
  handleRelayEvent: (event) => {
    if (event.type === 'session.error') {
      console.error('[session-command-service] relay session.error:', {
        code: event.code,
        message: event.message,
        retryable: event.retryable,
        fatal: event.fatal,
      });
    } else {
      console.log('[session-command-service] relay event:', event.type);
    }
    switch (event.type) {
      case 'transcript.partial': {
        const input = toPartialInput(event, deps.clock());
        return deps
          .handleTranscriptPartialUseCase(input)
          .map((_output: HandleTranscriptPartialOutput): void => undefined);
      }
      case 'transcript.final': {
        const input = toFinalInput(event, deps.clock());
        return deps
          .handleTranscriptFinalUseCase(input)
          .map((_output: HandleTranscriptFinalOutput): void => undefined);
      }
      case 'translation.final': {
        const input = toTranslationFinalInput(event, deps.clock());
        return deps
          .handleTranscriptFinalUseCase(input)
          .map((_output: HandleTranscriptFinalOutput): void => undefined);
      }
      case 'session.ready':
      case 'session.state.changed':
      case 'session.error':
        return okAsync<void, ApplicationError>(undefined);
    }
  },
});
