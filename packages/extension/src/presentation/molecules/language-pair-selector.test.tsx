import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguagePairSelector } from './language-pair-selector';

describe('LanguagePairSelector molecule (IMPL-531)', () => {
  it('renders source / target selects with initial values', () => {
    render(
      <LanguagePairSelector sourceLanguage="en-US" targetLanguage="ja-JP" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: '入力言語' })).toHaveValue('en-US');
    expect(screen.getByRole('combobox', { name: '翻訳先言語' })).toHaveValue('ja-JP');
  });

  it('calls onChange with updated source while preserving target', async () => {
    const onChange = vi.fn();
    render(
      <LanguagePairSelector sourceLanguage="en-US" targetLanguage="ja-JP" onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '入力言語' }), '韓国語');
    expect(onChange).toHaveBeenCalledWith({ sourceLanguage: 'ko-KR', targetLanguage: 'ja-JP' });
  });

  it('calls onChange with updated target while preserving source', async () => {
    const onChange = vi.fn();
    render(
      <LanguagePairSelector sourceLanguage="en-US" targetLanguage="ja-JP" onChange={onChange} />,
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '翻訳先言語' }),
      '中国語 (簡体)',
    );
    expect(onChange).toHaveBeenCalledWith({ sourceLanguage: 'en-US', targetLanguage: 'zh-CN' });
  });

  it('disables both selects when disabled', () => {
    render(
      <LanguagePairSelector
        sourceLanguage="en-US"
        targetLanguage="ja-JP"
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByRole('combobox', { name: '入力言語' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '翻訳先言語' })).toBeDisabled();
  });
});
