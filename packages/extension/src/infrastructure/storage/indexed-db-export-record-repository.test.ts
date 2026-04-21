import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createExportRecord, type ExportRecord } from '../../domain/export/export-record';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { INDEXED_DB_NAME } from './open-perapera-db';
import {
  createIndexedDbExportRecordRepository,
  type CloseableExportRecordRepository,
} from './indexed-db-export-record-repository';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const OTHER_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';
const EXPORT_ID_1 = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';
const EXPORT_ID_2 = '01HZX8Y1R8M7D3Q2P4T5V6W7F2';
const EXPORT_ID_3 = '01HZX8Y1R8M7D3Q2P4T5V6W7F3';

const identifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const otherIdentifier: SessionIdentifier = parseSessionIdentifier(OTHER_SESSION_ID)._unsafeUnwrap();

const buildRecord = (
  exportId: string,
  sessionId: string = SESSION_ID,
  format: 'txt' | 'json' = 'txt',
  createdAt = '2026-04-21T00:00:00.000Z',
): ExportRecord =>
  createExportRecord({
    exportIdentifier: exportId,
    sessionIdentifier: sessionId,
    format,
    includeOriginal: true,
    includeTranslation: true,
    createdAt,
  })._unsafeUnwrap();

describe('createIndexedDbExportRecordRepository (IMPL-143, DD-263)', () => {
  let repo: CloseableExportRecordRepository;
  let databaseName: string;

  beforeEach(() => {
    databaseName = `${INDEXED_DB_NAME}-test-${String(Math.random()).slice(2)}`;
    repo = createIndexedDbExportRecordRepository({ databaseName });
  });

  afterEach(async () => {
    await repo.close();
  });

  describe('save', () => {
    it('persists a new export record', async () => {
      const result = await repo.save(buildRecord(EXPORT_ID_1));
      expect(result.isOk()).toBe(true);
    });

    it('upserts on identical exportIdentifier', async () => {
      await repo.save(buildRecord(EXPORT_ID_1, SESSION_ID, 'txt'));
      const updated = buildRecord(EXPORT_ID_1, SESSION_ID, 'json');
      const result = await repo.save(updated);
      expect(result.isOk()).toBe(true);

      const lookup = await repo.findBySessionId(identifier);
      expect(lookup.isOk()).toBe(true);
      if (lookup.isOk()) {
        expect(lookup.value.length).toBe(1);
        expect(lookup.value[0]?.format).toBe('json');
      }
    });
  });

  describe('findBySessionId', () => {
    it('returns ok([]) when the session has no export records', async () => {
      const result = await repo.findBySessionId(identifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all records for the session', async () => {
      await repo.save(buildRecord(EXPORT_ID_1, SESSION_ID, 'txt', '2026-04-21T00:00:00.000Z'));
      await repo.save(buildRecord(EXPORT_ID_2, SESSION_ID, 'json', '2026-04-21T00:05:00.000Z'));
      await repo.save(buildRecord(EXPORT_ID_3, OTHER_SESSION_ID, 'txt'));

      const result = await repo.findBySessionId(identifier);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const ids = result.value.map((record) => record.exportIdentifier).sort();
        expect(ids).toEqual([EXPORT_ID_1, EXPORT_ID_2].sort());
      }
    });

    it('isolates records by sessionId', async () => {
      await repo.save(buildRecord(EXPORT_ID_1, SESSION_ID));
      await repo.save(buildRecord(EXPORT_ID_3, OTHER_SESSION_ID));

      const a = await repo.findBySessionId(identifier);
      const b = await repo.findBySessionId(otherIdentifier);
      expect(a.isOk() && a.value.length).toBe(1);
      expect(b.isOk() && b.value.length).toBe(1);
    });
  });
});
