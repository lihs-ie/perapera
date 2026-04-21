import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createExportRecord, type ExportRecord } from '../export/export-record.js';
import { parseSessionIdentifier, type SessionIdentifier } from '../session/session-identifier.js';
import { invariantViolationError, type DomainError } from '../shared/errors.js';
import { type ExportRecordRepository } from './export-record-repository.js';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const EXPORT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';
const EXPORT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7F2';

const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildRecord = (exportId: string): ExportRecord =>
  createExportRecord({
    exportIdentifier: exportId,
    sessionIdentifier: SESSION_ID,
    format: 'txt',
    includeOriginal: true,
    includeTranslation: true,
    createdAt: '2026-04-21T00:00:00.000Z',
  })._unsafeUnwrap();

describe('ExportRecordRepository (DD-263)', () => {
  describe('type contract', () => {
    it('accepts an object literal that implements all required methods', () => {
      const mock: ExportRecordRepository = {
        save: () => okAsync(undefined),
        findBySessionId: () => okAsync([]),
      };
      expect(typeof mock.save).toBe('function');
      expect(typeof mock.findBySessionId).toBe('function');
    });
  });

  describe('save', () => {
    it('resolves to ok(void) on the success path', async () => {
      const mock: ExportRecordRepository = {
        save: () => okAsync(undefined),
        findBySessionId: () => okAsync([]),
      };
      const result = await mock.save(buildRecord(EXPORT_ID_1));
      expect(result.isOk()).toBe(true);
    });

    it('can return an invariantViolationError on storage failure', async () => {
      const mock: ExportRecordRepository = {
        save: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'export-persistence',
              details: 'storage quota exceeded',
            }),
          ),
        findBySessionId: () => okAsync([]),
      };
      const result = await mock.save(buildRecord(EXPORT_ID_1));
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });

  describe('findBySessionId', () => {
    it('returns an empty array when no export history exists (ok([]), not an error)', async () => {
      const mock: ExportRecordRepository = {
        save: () => okAsync(undefined),
        findBySessionId: () => okAsync([]),
      };
      const result = await mock.findBySessionId(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toEqual([]);
    });

    it('returns all export records associated with the session, preserving insertion order', async () => {
      const records: readonly ExportRecord[] = [buildRecord(EXPORT_ID_1), buildRecord(EXPORT_ID_2)];
      const mock: ExportRecordRepository = {
        save: () => okAsync(undefined),
        findBySessionId: () => okAsync(records),
      };
      const result = await mock.findBySessionId(sessionIdentifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.exportIdentifier).toBe(EXPORT_ID_1);
        expect(result.value[1]?.exportIdentifier).toBe(EXPORT_ID_2);
      }
    });
  });
});
