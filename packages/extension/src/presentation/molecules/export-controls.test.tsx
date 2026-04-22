import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportControls } from './export-controls';

describe('ExportControls molecule (IMPL-533)', () => {
  it('renders default settings (txt / both included)', () => {
    render(<ExportControls sessionId="s-1" status={{ kind: 'idle' }} onExport={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'エクスポート形式' })).toHaveValue('txt');
    expect(screen.getByRole('checkbox', { name: '原文を含める' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '翻訳を含める' })).toBeChecked();
  });

  it('dispatches onExport with collected input on click', async () => {
    const onExport = vi.fn();
    render(<ExportControls sessionId="s-1" status={{ kind: 'idle' }} onExport={onExport} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'エクスポート形式' }),
      'JSON (.json)',
    );
    await userEvent.click(screen.getByRole('button', { name: 'エクスポートを実行' }));
    expect(onExport).toHaveBeenCalledWith({
      sessionId: 's-1',
      format: 'json',
      includeOriginal: true,
      includeTranslation: true,
    });
  });

  it('blocks submit when neither original nor translation is selected', async () => {
    const onExport = vi.fn();
    render(<ExportControls sessionId="s-1" status={{ kind: 'idle' }} onExport={onExport} />);
    await userEvent.click(screen.getByRole('checkbox', { name: '原文を含める' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '翻訳を含める' }));
    expect(screen.getByRole('button', { name: 'エクスポートを実行' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('少なくともどちらか一方');
  });

  it('shows pending state while status is pending', () => {
    render(<ExportControls sessionId="s-1" status={{ kind: 'pending' }} onExport={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'エクスポートを実行' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'エクスポートを実行' })).toHaveTextContent('出力中…');
  });

  it('shows success message with bytes count', () => {
    render(
      <ExportControls
        sessionId="s-1"
        status={{ kind: 'success', bytes: 2048 }}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('2048 バイトを出力しました。')).toBeInTheDocument();
  });

  it('shows error message on error status', () => {
    render(
      <ExportControls
        sessionId="s-1"
        status={{ kind: 'error', message: '書き込み失敗' }}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('書き込み失敗');
  });

  it('disables everything when disabled prop is set', () => {
    render(
      <ExportControls sessionId="s-1" status={{ kind: 'idle' }} onExport={vi.fn()} disabled />,
    );
    expect(screen.getByRole('button', { name: 'エクスポートを実行' })).toBeDisabled();
  });
});
