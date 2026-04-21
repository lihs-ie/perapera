import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  type ExportSessionResultInput,
  type ExportSessionResultOutput,
} from '../dto/export-session-result-dto';
import { sessionNotFoundAppError } from '../errors/application-errors';
import { type ExportSessionResultUseCase } from '../use-cases/export-session-result-use-case';
import { createExportService } from './export-service';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';

const buildInput = (): ExportSessionResultInput => ({
  sessionId: SESSION_ID,
  format: 'txt',
  includeOriginal: true,
  includeTranslation: true,
});

const buildOutput = (): ExportSessionResultOutput => ({
  exportId: '01HZX8Y1R8M7D3Q2P4T5V6W7B1',
  format: 'txt',
  bytes: 42,
});

describe('createExportService (IMPL-344)', () => {
  it('export delegates to the ExportSessionResultUseCase and returns the output', async () => {
    const useCase = vi.fn<ExportSessionResultUseCase>(() => okAsync(buildOutput()));
    const service = createExportService({ exportSessionResultUseCase: useCase });
    const result = await service.export(buildInput());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.exportId).toBe('01HZX8Y1R8M7D3Q2P4T5V6W7B1');
    }
    expect(useCase).toHaveBeenCalledWith(buildInput());
  });

  it('export propagates useCase failures', async () => {
    const appError = sessionNotFoundAppError({
      identifier: SESSION_ID,
      message: 'session not found',
    });
    const useCase: ExportSessionResultUseCase = () => errAsync(appError);
    const service = createExportService({ exportSessionResultUseCase: useCase });
    const result = await service.export(buildInput());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SESSION_NOT_FOUND');
  });
});
