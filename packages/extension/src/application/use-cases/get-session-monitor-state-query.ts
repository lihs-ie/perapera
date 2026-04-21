import { okAsync, ResultAsync } from 'neverthrow';
import { type SourceSessionRepository } from '../../domain/repositories/source-session-repository';
import { type TranscriptStreamRepository } from '../../domain/repositories/transcript-stream-repository';
import { type SourceSession } from '../../domain/session/source-session';
import { type DomainError } from '../../domain/shared/errors';
import { type TranscriptStream } from '../../domain/transcript/transcript-stream';
import {
  parseGetSessionMonitorStateInput,
  type GetSessionMonitorStateInput,
  type SessionMonitorStateOutput,
} from '../dto/get-session-monitor-state-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type SettingsStore } from '../ports/settings-store';

export type GetSessionMonitorStateDependencies = Readonly<{
  sourceSessionRepository: SourceSessionRepository;
  transcriptStreamRepository: TranscriptStreamRepository;
  settingsStore: SettingsStore;
}>;

export type GetSessionMonitorStateQuery = (
  input: GetSessionMonitorStateInput,
) => ResultAsync<SessionMonitorStateOutput, ApplicationError>;

/** 1 stream あたり latestSegments に含める最大件数 */
const MAX_LATEST_SEGMENTS_PER_STREAM = 3;

type SessionSummary = SessionMonitorStateOutput['sessions'][number];
type LatestSegment = SessionMonitorStateOutput['latestSegments'][number];
type OverlayState = NonNullable<SessionMonitorStateOutput['overlayState']>;

const projectSessionSummary = (session: SourceSession): SessionSummary => ({
  sessionId: session.sessionIdentifier,
  // NOTE: SourceSession 集約に displayName フィールドが無いため、現時点では
  // `${sourceType}-${sessionId の末尾 6 文字}` で代替。将来 session に
  // displayName を追加したらここを置き換える。
  displayName: `${session.sourceType}-${session.sessionIdentifier.slice(-6)}`,
  state: session.state,
  sourceType: session.sourceType,
});

const projectLatestSegments = (
  session: SourceSession,
  stream: TranscriptStream,
): LatestSegment[] => {
  const finals = [...stream.segments.values()]
    .filter((segment) => segment.isFinal)
    .sort((a, b) => b.timeRange.startMs - a.timeRange.startMs)
    .slice(0, MAX_LATEST_SEGMENTS_PER_STREAM);
  return finals.map((segment): LatestSegment => {
    const translation = stream.translations.get(segment.segmentIdentifier);
    const entry: LatestSegment = {
      sessionId: session.sessionIdentifier,
      segmentId: segment.segmentIdentifier,
      originalText: segment.text,
    };
    if (translation?.status === 'completed') {
      return { ...entry, translatedText: translation.text };
    }
    return entry;
  });
};

/**
 * IMPL-211 GetSessionMonitorStateQuery (DD-302)。
 * Side Panel / Popup の状態表示用 Query。読み取り専用。
 */
export const createGetSessionMonitorStateQuery = (
  deps: GetSessionMonitorStateDependencies,
): GetSessionMonitorStateQuery => {
  return (input) =>
    parseGetSessionMonitorStateInput(input)
      .asyncAndThen((parsed) =>
        deps.sourceSessionRepository.findActiveSessions().andThen((allSessions) => {
          const filterIds = parsed.sessionIds;
          const filtered =
            filterIds !== undefined
              ? allSessions.filter((session) =>
                  filterIds.some((id) => id === session.sessionIdentifier),
                )
              : allSessions;

          if (filtered.length === 0) {
            const empty: SessionMonitorStateOutput = { sessions: [], latestSegments: [] };
            return okAsync(empty);
          }

          const streamLookups = filtered.map((session) =>
            deps.transcriptStreamRepository
              .findBySessionId(session.sessionIdentifier)
              .map((stream): { session: SourceSession; stream: TranscriptStream | null } => ({
                session,
                stream,
              }))
              .orElse(() =>
                okAsync<{ session: SourceSession; stream: TranscriptStream | null }, DomainError>({
                  session,
                  stream: null,
                }),
              ),
          );

          return ResultAsync.combine(streamLookups).andThen((pairs) => {
            const sessions = pairs.map(({ session }) => projectSessionSummary(session));
            const latestSegments = pairs.flatMap(({ session, stream }) =>
              stream === null ? [] : projectLatestSegments(session, stream),
            );

            const representativeSessionId = filtered[0]?.sessionIdentifier;
            if (!parsed.includeOverlayState || representativeSessionId === undefined) {
              const output: SessionMonitorStateOutput = { sessions, latestSegments };
              return okAsync(output);
            }

            return deps.settingsStore
              .getDefaultOverlaySettings()
              .map(
                (settings): OverlayState => ({
                  sessionId: representativeSessionId,
                  positionPreset: settings.positionPreset,
                  opacity: settings.opacity,
                  maxLines: settings.maxLines,
                  fontScale: settings.fontScale,
                  showOriginalText: settings.showOriginalText,
                  showTranslatedText: settings.showTranslatedText,
                }),
              )
              .orElse(() => okAsync<OverlayState | null, DomainError>(null))
              .map((overlayState): SessionMonitorStateOutput => {
                if (overlayState === null) {
                  return { sessions, latestSegments };
                }
                return { sessions, latestSegments, overlayState };
              });
          });
        }),
      )
      .mapErr(toApplicationError);
};
