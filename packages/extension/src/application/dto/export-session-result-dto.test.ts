import { describe, expect, it } from 'vitest';
import {
  parseExportSessionResultInput,
  type ExportSessionResultInput,
  type ExportSessionResultOutput,
} from './export-session-result-dto';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const EXPORT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7F1';

describe('ExportSessionResultDTO (DD-307)', () => {
  describe('parseExportSessionResultInput', () => {
    it('accepts a fully populated payload with format=txt', () => {
      const result = parseExportSessionResultInput({
        sessionId: SESSION_ID,
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.format).toBe('txt');
    });

    it('accepts format=json', () => {
      const result = parseExportSessionResultInput({
        sessionId: SESSION_ID,
        format: 'json',
        includeOriginal: false,
        includeTranslation: true,
      });
      expect(result.isOk()).toBe(true);
    });

    it('rejects unknown format values', () => {
      const result = parseExportSessionResultInput({
        sessionId: SESSION_ID,
        format: 'csv',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('validation');
    });

    it('rejects when sessionId is empty', () => {
      const result = parseExportSessionResultInput({
        sessionId: '',
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects when required include flags are missing', () => {
      const result = parseExportSessionResultInput({
        sessionId: SESSION_ID,
        format: 'txt',
      });
      expect(result.isErr()).toBe(true);
    });

    it('rejects when both include flags are false (defensive at DTO layer)', () => {
      const result = parseExportSessionResultInput({
        sessionId: SESSION_ID,
        format: 'txt',
        includeOriginal: false,
        includeTranslation: false,
      });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('ExportSessionResultOutput', () => {
    it('carries exportId, format, and bytes', () => {
      const output: ExportSessionResultOutput = {
        exportId: EXPORT_ID,
        format: 'json',
        bytes: 1024,
      };
      expect(output.bytes).toBe(1024);
    });
  });

  describe('ExportSessionResultInput type shape', () => {
    it('accepts a typed literal that matches the DTO', () => {
      const input: ExportSessionResultInput = {
        sessionId: SESSION_ID,
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      };
      expect(input.includeOriginal).toBe(true);
    });
  });
});
