import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlossaryEditor, type GlossaryEntryValue } from './glossary-editor';

describe('GlossaryEditor molecule (Issue #123)', () => {
  it('renders empty state message when no entries', () => {
    render(<GlossaryEditor entries={[]} onChange={vi.fn()} />);
    expect(screen.getByText('用語集は未登録です。')).toBeInTheDocument();
  });

  it('lists entries with source -> target', () => {
    const entries: GlossaryEntryValue[] = [
      { source: 'API', target: 'インターフェース', caseSensitive: true },
      { source: 'SDK', target: '開発キット', caseSensitive: false },
    ];
    render(<GlossaryEditor entries={entries} onChange={vi.fn()} />);
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('インターフェース')).toBeInTheDocument();
    expect(screen.getByText('SDK')).toBeInTheDocument();
    expect(screen.getByText('開発キット')).toBeInTheDocument();
  });

  it('adds a new entry when valid source/target provided and Add clicked', () => {
    const onChange = vi.fn();
    render(<GlossaryEditor entries={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'API' } });
    fireEvent.change(screen.getByLabelText('訳文'), {
      target: { value: 'インターフェース' },
    });
    fireEvent.click(screen.getByRole('button', { name: '用語集にエントリを追加' }));

    expect(onChange).toHaveBeenCalledWith([
      { source: 'API', target: 'インターフェース', caseSensitive: false },
    ]);
  });

  it('disables Add button when source equals target', () => {
    render(<GlossaryEditor entries={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'API' } });
    fireEvent.change(screen.getByLabelText('訳文'), { target: { value: 'API' } });
    expect(screen.getByRole('button', { name: '用語集にエントリを追加' })).toBeDisabled();
  });

  it('disables Add button when source is empty', () => {
    render(<GlossaryEditor entries={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用語集にエントリを追加' })).toBeDisabled();
  });

  it('removes entry when Delete clicked', () => {
    const onChange = vi.fn();
    const entries: GlossaryEntryValue[] = [
      { source: 'API', target: 'X', caseSensitive: true },
      { source: 'SDK', target: 'Y', caseSensitive: false },
    ];
    render(<GlossaryEditor entries={entries} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'API を削除' }));
    expect(onChange).toHaveBeenCalledWith([{ source: 'SDK', target: 'Y', caseSensitive: false }]);
  });

  it('shows count indicator', () => {
    const entries: GlossaryEntryValue[] = [{ source: 'API', target: 'X', caseSensitive: true }];
    render(<GlossaryEditor entries={entries} onChange={vi.fn()} />);
    expect(screen.getByText('登録可能数: 1 / 200')).toBeInTheDocument();
  });

  it('disables all inputs and buttons when disabled prop is true', () => {
    const entries: GlossaryEntryValue[] = [{ source: 'API', target: 'X', caseSensitive: true }];
    render(<GlossaryEditor entries={entries} onChange={vi.fn()} disabled={true} />);
    expect(screen.getByLabelText('原文')).toBeDisabled();
    expect(screen.getByLabelText('訳文')).toBeDisabled();
    expect(screen.getByRole('button', { name: '用語集にエントリを追加' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'API を削除' })).toBeDisabled();
  });
});
