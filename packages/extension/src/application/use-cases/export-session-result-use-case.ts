import { err, ok, type ResultAsync } from 'neverthrow';
import { createExportRecord } from '../../domain/export/export-record';
import { type ExportRecordRepository } from '../../domain/repositories/export-record-repository';
import {
  assembleExport,
  type ExportAssemblyOptions,
} from '../../domain/services/export-assembly-service';
import { parseSessionIdentifier } from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  parseExportSessionResultInput,
  type ExportSessionResultInput,
  type ExportSessionResultOutput,
} from '../dto/export-session-result-dto';
import { toApplicationError, type ApplicationError } from '../errors/application-errors';
import { type SessionStore } from '../ports/session-store';

export type ExportSessionResultDependencies = Readonly<{
  sessionStore: SessionStore;
  exportRecordRepository: ExportRecordRepository;
  clock: () => string;
  exportIdFactory: () => string;
}>;

export type ExportSessionResultUseCase = (
  input: ExportSessionResultInput,
) => ResultAsync<ExportSessionResultOutput, ApplicationError>;

/**
 * IMPL-216 ExportSessionResultUseCase (DD-307)。
 *
 * セッション永続データを取得し、`ExportAssemblyService` で TXT / JSON に
 * 整形した後、`ExportRecord` として永続化する。UTF-8 bytes を出力に含める。
 */
export const createExportSessionResultUseCase = (
  deps: ExportSessionResultDependencies,
): ExportSessionResultUseCase => {
  return (input) =>
    parseExportSessionResultInput(input)
      .asyncAndThen((parsed) =>
        parseSessionIdentifier(parsed.sessionId).asyncAndThen((sessionIdentifier) =>
          deps.sessionStore.loadExportBundle(sessionIdentifier).andThen((bundle) => {
            const options: ExportAssemblyOptions = {
              format: parsed.format,
              includeOriginal: parsed.includeOriginal,
              includeTranslation: parsed.includeTranslation,
            };
            return assembleExport(bundle.stream, options)
              .andThen((content) => {
                try {
                  const bytes = new TextEncoder().encode(content).byteLength;
                  return ok({ content, bytes });
                } catch (cause) {
                  return err<never, DomainError>(
                    invariantViolationError({
                      invariant: 'export-encoding-failed',
                      details: cause instanceof Error ? cause.message : 'unknown encoding error',
                    }),
                  );
                }
              })
              .asyncAndThen(({ bytes, content }) => {
                const createdAt = deps.clock();
                const exportId = deps.exportIdFactory();
                return createExportRecord({
                  exportIdentifier: exportId,
                  sessionIdentifier: sessionIdentifier,
                  format: parsed.format,
                  includeOriginal: parsed.includeOriginal,
                  includeTranslation: parsed.includeTranslation,
                  createdAt,
                }).asyncAndThen((record) =>
                  deps.exportRecordRepository.save(record).map(
                    (): ExportSessionResultOutput => ({
                      exportId: record.exportIdentifier,
                      format: record.format,
                      bytes,
                      content,
                    }),
                  ),
                );
              });
          }),
        ),
      )
      .mapErr(toApplicationError);
};
