import { useMemo, useState } from 'react';
import {
  GLOSSARY_ENTRY_FIELD_MAX_LENGTH,
  GLOSSARY_MAX_ENTRIES,
  hasUniqueSources,
  isValidGlossaryField,
} from '../../domain/glossary';
import { Button } from '../atoms/button';
import { Checkbox } from '../atoms/checkbox';
import { Label } from '../atoms/label';
import { TextInput } from '../atoms/text-input';

export type GlossaryEntryValue = Readonly<{
  source: string;
  target: string;
  caseSensitive: boolean;
}>;

export type Props = Readonly<{
  entries: readonly GlossaryEntryValue[];
  onChange: (next: readonly GlossaryEntryValue[]) => void;
  disabled?: boolean;
}>;

type Draft = { source: string; target: string; caseSensitive: boolean };

const emptyDraft = (): Draft => ({ source: '', target: '', caseSensitive: false });

const isDraftValid = (
  draft: Draft,
  existing: readonly GlossaryEntryValue[],
): { ok: true } | { ok: false; reason: string } => {
  if (!isValidGlossaryField(draft.source)) {
    return {
      ok: false,
      reason: `原文は 1〜${String(GLOSSARY_ENTRY_FIELD_MAX_LENGTH)} 文字必要です`,
    };
  }
  if (!isValidGlossaryField(draft.target)) {
    return {
      ok: false,
      reason: `訳文は 1〜${String(GLOSSARY_ENTRY_FIELD_MAX_LENGTH)} 文字必要です`,
    };
  }
  if (draft.source === draft.target) {
    return { ok: false, reason: '原文と訳文は異なる文字列である必要があります' };
  }
  if (existing.some((entry) => entry.source === draft.source)) {
    return { ok: false, reason: '同じ原文は既に登録済みです' };
  }
  if (!hasUniqueSources([...existing, { source: draft.source }])) {
    return { ok: false, reason: '原文が重複しています' };
  }
  if (existing.length >= GLOSSARY_MAX_ENTRIES) {
    return { ok: false, reason: `エントリは最大 ${String(GLOSSARY_MAX_ENTRIES)} 件です` };
  }
  return { ok: true };
};

/**
 * 用語集エディタ molecule (DD-238, Issue #123)。
 *
 * 原文→訳文ペアを追加・削除し、`caseSensitive` flag を切り替える UI。
 * CSV import/export は親 organism で実装し、本 molecule は純粋な配列 CRUD に
 * 限定する (atoms/molecules の責務分離、IO は持たない)。
 */
export function GlossaryEditor(props: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const disabled = props.disabled === true;

  const validation = useMemo(() => isDraftValid(draft, props.entries), [draft, props.entries]);

  const handleAdd = (): void => {
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }
    const next: readonly GlossaryEntryValue[] = [
      ...props.entries,
      { source: draft.source, target: draft.target, caseSensitive: draft.caseSensitive },
    ];
    props.onChange(next);
    setDraft(emptyDraft());
    setError(null);
  };

  const handleRemove = (source: string): void => {
    const next = props.entries.filter((entry) => entry.source !== source);
    props.onChange(next);
  };

  return (
    <div className="container">
      <div className="form" role="group" aria-label="用語集エントリ追加">
        <Label htmlFor="glossary-source">原文</Label>
        <TextInput
          id="glossary-source"
          value={draft.source}
          onChange={(value) => {
            setDraft((prev) => ({ ...prev, source: value }));
            setError(null);
          }}
          disabled={disabled}
          maxLength={GLOSSARY_ENTRY_FIELD_MAX_LENGTH}
          ariaLabel="原文"
        />
        <Label htmlFor="glossary-target">訳文</Label>
        <TextInput
          id="glossary-target"
          value={draft.target}
          onChange={(value) => {
            setDraft((prev) => ({ ...prev, target: value }));
            setError(null);
          }}
          disabled={disabled}
          maxLength={GLOSSARY_ENTRY_FIELD_MAX_LENGTH}
          ariaLabel="訳文"
        />
        <Label htmlFor="glossary-case-sensitive">大文字小文字を区別する</Label>
        <Checkbox
          id="glossary-case-sensitive"
          checked={draft.caseSensitive}
          onChange={(checked) => setDraft((prev) => ({ ...prev, caseSensitive: checked }))}
          disabled={disabled}
          ariaLabel="大文字小文字を区別する"
        />
        <Button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !validation.ok}
          ariaLabel="用語集にエントリを追加"
        >
          追加
        </Button>
        {error !== null ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
      </div>
      {props.entries.length === 0 ? (
        <p className="hint">用語集は未登録です。</p>
      ) : (
        <ul className="list" aria-label="用語集エントリ一覧">
          {props.entries.map((entry) => (
            <li key={entry.source} className="item">
              <span className="source">{entry.source}</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span className="target">{entry.target}</span>
              {entry.caseSensitive ? (
                <span className="badge" aria-label="大文字小文字を区別">
                  Aa
                </span>
              ) : null}
              <Button
                type="button"
                variant="danger"
                onClick={() => handleRemove(entry.source)}
                disabled={disabled}
                ariaLabel={`${entry.source} を削除`}
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        登録可能数: {String(props.entries.length)} / {String(GLOSSARY_MAX_ENTRIES)}
      </p>
    </div>
  );
}
