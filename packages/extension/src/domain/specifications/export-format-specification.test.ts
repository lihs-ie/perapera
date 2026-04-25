import { describe, expect, it } from 'vitest';
import { isValidExportFormat } from './export-format-specification';

describe('ExportFormatSpecification (DD-273)', () => {
  describe('isValidExportFormat', () => {
    it('accepts "txt"', () => {
      expect(isValidExportFormat('txt')).toBe(true);
    });

    it('accepts "json"', () => {
      expect(isValidExportFormat('json')).toBe(true);
    });

    it('accepts "csv"', () => {
      expect(isValidExportFormat('csv')).toBe(true);
    });

    it('rejects unknown string values', () => {
      expect(isValidExportFormat('xml')).toBe(false);
      expect(isValidExportFormat('')).toBe(false);
      expect(isValidExportFormat('TXT')).toBe(false); // case-sensitive
    });

    it('rejects non-string values', () => {
      expect(isValidExportFormat(0)).toBe(false);
      expect(isValidExportFormat(null)).toBe(false);
      expect(isValidExportFormat(undefined)).toBe(false);
      expect(isValidExportFormat({})).toBe(false);
      expect(isValidExportFormat([])).toBe(false);
    });

    it('acts as a type guard that narrows unknown to ExportFormat', () => {
      const candidate: unknown = 'txt';
      if (isValidExportFormat(candidate)) {
        // Within this branch, candidate is narrowed to ExportFormat ('txt' | 'json' | 'csv')
        expect(candidate).toBe('txt');
      } else {
        throw new Error('should have been valid');
      }
    });
  });
});
