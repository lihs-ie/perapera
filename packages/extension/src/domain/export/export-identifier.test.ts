import { describe, expect, it } from 'vitest';
import { createExportIdentifier, parseExportIdentifier } from './export-identifier';

describe('ExportIdentifier', () => {
  it('creates a ULID-shaped identifier', () => {
    expect(createExportIdentifier()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('parses a valid ULID', () => {
    const result = parseExportIdentifier('01HZX8Y1R8M7D3Q2P4T5V6W7X8');
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(parseExportIdentifier('exp_bad').isErr()).toBe(true);
  });
});
