import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { type ExportRecordRepository } from '../../domain/repositories/export-record-repository';
import { createLanguagePair } from '../../domain/session/language-pair';
import { createSourceSession } from '../../domain/session/source-session';
import {
  invariantViolationError,
  notFoundError,
  type DomainError,
} from '../../domain/shared/errors';
import { createTimestampRange } from '../../domain/transcript/timestamp-range';
import {
  appendPartialTranscriptSegment,
  createTranscriptStream,
  finalizeSegment,
} from '../../domain/transcript/transcript-stream';
import { type ExportBundle, type SessionStore } from '../ports/session-store';
import {
  createExportSessionResultUseCase,
  type ExportSessionResultDependencies,
} from './export-session-result-use-case';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SOURCE_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7B1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const EXPORT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';
const CREATED_AT = '2026-04-21T00:15:00.000Z';

const buildBundle = (): ExportBundle => {
  const session = createSourceSession({
    sessionIdentifier: SESSION_ID,
    sourceIdentifier: SOURCE_ID,
    sourceType: 'tab',
    languagePair: createLanguagePair({ source: 'en-US', target: 'ja-JP' })._unsafeUnwrap(),
    startedAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();
  let stream = createTranscriptStream({ sessionIdentifier: SESSION_ID })._unsafeUnwrap();
  stream = appendPartialTranscriptSegment(stream, {
    segmentIdentifier: SEGMENT_ID,
    revision: 1,
    text: 'hello world',
    timeRange: createTimestampRange({ startMs: 0, endMs: 1500 })._unsafeUnwrap(),
  })._unsafeUnwrap();
  stream = finalizeSegment(stream, { segmentIdentifier: SEGMENT_ID })._unsafeUnwrap();
  return { session, stream };
};

const buildDependencies = (
  overrides: Partial<ExportSessionResultDependencies> = {},
): ExportSessionResultDependencies => {
  const sessionStore: SessionStore = {
    saveSession: vi.fn(() => okAsync(undefined)),
    appendTranscript: vi.fn(() => okAsync(undefined)),
    appendTranslation: vi.fn(() => okAsync(undefined)),
    loadExportBundle: vi.fn(() => okAsync(buildBundle())),
    purgeOlderThan: vi.fn(() => okAsync({ purgedSessionIds: [] })),
    purgeBeyondCount: vi.fn(() => okAsync({ purgedSessionIds: [] })),
    purgeAll: vi.fn(() => okAsync({ purgedSessionIds: [] })),
  };
  const exportRecordRepository: ExportRecordRepository = {
    save: vi.fn(() => okAsync(undefined)),
    findBySessionId: vi.fn(() => okAsync([])),
  };
  return {
    sessionStore,
    exportRecordRepository,
    clock: () => CREATED_AT,
    exportIdFactory: () => EXPORT_ID,
    ...overrides,
  };
};

describe('createExportSessionResultUseCase (IMPL-216, DD-307)', () => {
  it('exports txt with bytes, exportId, and format on success', async () => {
    const deps = buildDependencies();
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      format: 'txt',
      includeOriginal: true,
      includeTranslation: false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.exportId).toBe(EXPORT_ID);
      expect(result.value.format).toBe('txt');
      expect(result.value.bytes).toBeGreaterThan(0);
      expect(result.value.content.length).toBeGreaterThan(0);
    }
    expect(deps.exportRecordRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns validation error for invalid input', async () => {
    const deps = buildDependencies();
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: '',
      format: 'txt',
      includeOriginal: true,
      includeTranslation: false,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('validation');
  });

  it('returns session-not-found when loadExportBundle reports missing session', async () => {
    const deps = buildDependencies({
      sessionStore: {
        saveSession: vi.fn(() => okAsync(undefined)),
        appendTranscript: vi.fn(() => okAsync(undefined)),
        appendTranslation: vi.fn(() => okAsync(undefined)),
        loadExportBundle: vi.fn(() =>
          errAsync<ExportBundle, DomainError>(
            notFoundError({ resourceType: 'SourceSession', identifier: SESSION_ID }),
          ),
        ),
        purgeOlderThan: vi.fn(() => okAsync({ purgedSessionIds: [] })),
        purgeBeyondCount: vi.fn(() => okAsync({ purgedSessionIds: [] })),
        purgeAll: vi.fn(() => okAsync({ purgedSessionIds: [] })),
      },
    });
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      format: 'txt',
      includeOriginal: true,
      includeTranslation: true,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('session-not-found');
  });

  it('returns conflict error when exportRecordRepository.save fails', async () => {
    const deps = buildDependencies({
      exportRecordRepository: {
        save: vi.fn(() =>
          errAsync<void, DomainError>(
            invariantViolationError({ invariant: 'export-persistence', details: 'quota' }),
          ),
        ),
        findBySessionId: vi.fn(() => okAsync([])),
      },
    });
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      format: 'txt',
      includeOriginal: true,
      includeTranslation: true,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe('conflict');
  });

  it('emits JSON format with correct bytes count', async () => {
    const deps = buildDependencies();
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      format: 'json',
      includeOriginal: true,
      includeTranslation: false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.format).toBe('json');
      expect(result.value.bytes).toBeGreaterThan(10);
      expect(() => {
        JSON.parse(result.value.content);
      }).not.toThrow();
    }
  });

  it('emits CSV format with UTF-8 BOM, header row, and byte count matching UTF-8 encoded length', async () => {
    const deps = buildDependencies();
    const useCase = createExportSessionResultUseCase(deps);
    const result = await useCase({
      sessionId: SESSION_ID,
      format: 'csv',
      includeOriginal: true,
      includeTranslation: true,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.format).toBe('csv');
      // CSV は BOM (`U+FEFF`) で始まる
      expect(result.value.content.startsWith('﻿')).toBe(true);
      // header 行が含まれる
      expect(result.value.content).toContain(
        'session_identifier,segment_identifier,start_ms,end_ms,original_text,target_language,translation_text',
      );
      // bytes は UTF-8 byte length と一致 (BOM 含む)
      const encoded = new TextEncoder().encode(result.value.content);
      expect(result.value.bytes).toBe(encoded.length);
    }
  });
});
