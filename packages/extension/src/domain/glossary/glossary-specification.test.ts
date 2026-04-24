import { describe, expect, it } from 'vitest';
import { GLOSSARY_ENTRY_FIELD_MAX_LENGTH, GLOSSARY_MAX_ENTRIES } from './glossary';
import {
  hasUniqueSources,
  isValidGlossaryEntryCount,
  isValidGlossaryField,
} from './glossary-specification';

describe('isValidGlossaryField', () => {
  it('accepts non-empty string within 64 chars', () => {
    expect(isValidGlossaryField('API')).toBe(true);
    expect(isValidGlossaryField('a'.repeat(GLOSSARY_ENTRY_FIELD_MAX_LENGTH))).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidGlossaryField('')).toBe(false);
  });

  it('rejects string longer than 64 chars', () => {
    expect(isValidGlossaryField('a'.repeat(GLOSSARY_ENTRY_FIELD_MAX_LENGTH + 1))).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidGlossaryField(123)).toBe(false);
    expect(isValidGlossaryField(undefined)).toBe(false);
    expect(isValidGlossaryField(null)).toBe(false);
  });
});

describe('isValidGlossaryEntryCount', () => {
  it('accepts counts from 0 to 200', () => {
    expect(isValidGlossaryEntryCount(0)).toBe(true);
    expect(isValidGlossaryEntryCount(1)).toBe(true);
    expect(isValidGlossaryEntryCount(GLOSSARY_MAX_ENTRIES)).toBe(true);
  });

  it('rejects counts above 200', () => {
    expect(isValidGlossaryEntryCount(GLOSSARY_MAX_ENTRIES + 1)).toBe(false);
  });

  it('rejects negative counts', () => {
    expect(isValidGlossaryEntryCount(-1)).toBe(false);
  });

  it('rejects non-integer or non-number input', () => {
    expect(isValidGlossaryEntryCount(1.5)).toBe(false);
    expect(isValidGlossaryEntryCount('1')).toBe(false);
    expect(isValidGlossaryEntryCount(Number.NaN)).toBe(false);
  });
});

describe('hasUniqueSources', () => {
  it('returns true for empty input', () => {
    expect(hasUniqueSources([])).toBe(true);
  });

  it('returns true when all sources differ', () => {
    expect(hasUniqueSources([{ source: 'API' }, { source: 'SDK' }, { source: 'CLI' }])).toBe(true);
  });

  it('returns false when duplicate sources exist', () => {
    expect(hasUniqueSources([{ source: 'API' }, { source: 'API' }])).toBe(false);
  });

  it('treats source "API" and "api" as distinct (case-sensitive check)', () => {
    expect(hasUniqueSources([{ source: 'API' }, { source: 'api' }])).toBe(true);
  });
});
