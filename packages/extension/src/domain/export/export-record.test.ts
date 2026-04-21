import { describe, expect, it } from 'vitest';
import { createExportRecord, EXPORT_FORMATS } from './export-record.js';

const VALID_EXPORT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X8';
const VALID_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7X9';

describe('ExportRecord', () => {
  it('exposes TXT / JSON as the allowed formats (DD-273)', () => {
    expect(EXPORT_FORMATS).toEqual(['txt', 'json']);
  });

  it.each(EXPORT_FORMATS)('creates a record with format=%s', (format) => {
    const result = createExportRecord({
      exportIdentifier: VALID_EXPORT_ID,
      sessionIdentifier: VALID_SESSION_ID,
      format,
      includeOriginal: true,
      includeTranslation: true,
      createdAt: '2026-04-21T00:00:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.format).toBe(format);
    }
  });

  it('rejects unknown format', () => {
    const result = createExportRecord({
      exportIdentifier: VALID_EXPORT_ID,
      sessionIdentifier: VALID_SESSION_ID,
      format: 'pdf',
      includeOriginal: true,
      includeTranslation: true,
      createdAt: '2026-04-21T00:00:00.000Z',
    });
    expect(result.isErr()).toBe(true);
  });

  it('rejects when both includeOriginal and includeTranslation are false', () => {
    const result = createExportRecord({
      exportIdentifier: VALID_EXPORT_ID,
      sessionIdentifier: VALID_SESSION_ID,
      format: 'txt',
      includeOriginal: false,
      includeTranslation: false,
      createdAt: '2026-04-21T00:00:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('validation');
  });

  it('rejects invalid identifiers', () => {
    expect(
      createExportRecord({
        exportIdentifier: 'bad',
        sessionIdentifier: VALID_SESSION_ID,
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
        createdAt: '2026-04-21T00:00:00.000Z',
      }).isErr(),
    ).toBe(true);
  });

  it('rejects invalid createdAt', () => {
    const result = createExportRecord({
      exportIdentifier: VALID_EXPORT_ID,
      sessionIdentifier: VALID_SESSION_ID,
      format: 'json',
      includeOriginal: true,
      includeTranslation: true,
      createdAt: 'not-a-date',
    });
    expect(result.isErr()).toBe(true);
  });
});
