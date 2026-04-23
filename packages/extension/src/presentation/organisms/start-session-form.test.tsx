import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type BackgroundClient,
  type BackgroundResponse,
  type ExportSessionResultResult,
  type SessionMonitorStateResult,
  type StartSourceSessionResult,
  type StopSourceSessionResult,
  type UpdateSourceSettingsResult,
} from '../infrastructure/background-client';
import { StartSessionForm } from './start-session-form';

const EMPTY_MONITOR: BackgroundResponse<SessionMonitorStateResult> = {
  ok: true,
  value: { sessions: [], latestSegments: [] },
};
const DUMMY_STOP: BackgroundResponse<StopSourceSessionResult> = {
  ok: true,
  value: { sessionId: 's', state: 'stopped', stoppedAt: 'now' },
};
const DUMMY_UPDATE: BackgroundResponse<UpdateSourceSettingsResult> = {
  ok: true,
  value: { sessionId: 's', appliedAt: 'now' },
};
const DUMMY_EXPORT: BackgroundResponse<ExportSessionResultResult> = {
  ok: true,
  value: { exportId: 'e', format: 'txt', bytes: 0 },
};

const buildClient = (start: BackgroundClient['startSourceSession']): BackgroundClient => ({
  startSourceSession: start,
  stopSourceSession: vi.fn(() => Promise.resolve(DUMMY_STOP)),
  updateSourceSettings: vi.fn(() => Promise.resolve(DUMMY_UPDATE)),
  exportSessionResult: vi.fn(() => Promise.resolve(DUMMY_EXPORT)),
  getSessionMonitorState: vi.fn(() => Promise.resolve(EMPTY_MONITOR)),
  getDefaultSettings: vi.fn(),
  saveDefaultLanguagePair: vi.fn(),
  saveDefaultOverlaySettings: vi.fn(),
  saveRelayConnectionOverride: vi.fn(),
  clearRelayConnectionOverride: vi.fn(),
});

describe('StartSessionForm organism (IMPL-540)', () => {
  it('renders form fields with defaults', () => {
    const client = buildClient(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's', state: 'requesting_permission', startedAt: 'now' },
      }),
    );
    render(<StartSessionForm client={client} />);
    expect(screen.getByRole('radio', { name: 'ブラウザタブ' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: '表示名' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '入力言語' })).toHaveValue('en-US');
    expect(screen.getByRole('combobox', { name: '翻訳先言語' })).toHaveValue('ja-JP');
  });

  it('disables submit when displayName is empty', () => {
    const client = buildClient(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's', state: 'x', startedAt: 'now' },
      }),
    );
    render(<StartSessionForm client={client} />);
    expect(screen.getByRole('button', { name: '開始' })).toBeDisabled();
  });

  it('submits startSourceSession with collected input on submit', async () => {
    const startFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's-1', state: 'requesting_permission', startedAt: 'now' },
      }),
    );
    const client = buildClient(startFn);
    const onStarted = vi.fn();
    render(
      <StartSessionForm
        client={client}
        onStarted={onStarted}
        resolveActiveTabId={() => Promise.resolve(42)}
      />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: '表示名' }), 'YouTube Live');
    await userEvent.click(screen.getByRole('button', { name: '開始' }));
    await waitFor(() => expect(startFn).toHaveBeenCalledOnce());
    expect(startFn).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'tab',
        displayName: 'YouTube Live',
        sourceLanguage: 'en-US',
        targetLanguage: 'ja-JP',
        autoDetectLanguage: false,
        overlayTarget: { kind: 'tab', tabId: 42 },
      }),
    );
    await waitFor(() => expect(onStarted).toHaveBeenCalledOnce());
  });

  it('falls back to extension-monitor when active tab id is unresolved for tab source', async () => {
    const startFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's-2', state: 'requesting_permission', startedAt: 'now' },
      }),
    );
    const client = buildClient(startFn);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
    try {
      render(<StartSessionForm client={client} resolveActiveTabId={() => Promise.resolve(null)} />);
      await userEvent.type(screen.getByRole('textbox', { name: '表示名' }), 'Fallback');
      await userEvent.click(screen.getByRole('button', { name: '開始' }));
      await waitFor(() => expect(startFn).toHaveBeenCalledOnce());
      expect(startFn).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'tab',
          overlayTarget: { kind: 'extension-monitor', pageId: 'monitor' },
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('sends sourceLanguage=null when autoDetect is on', async () => {
    const startFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's', state: 'x', startedAt: 'now' },
      }),
    );
    const client = buildClient(startFn);
    render(<StartSessionForm client={client} />);
    await userEvent.type(screen.getByRole('textbox', { name: '表示名' }), 'test');
    await userEvent.click(screen.getByRole('checkbox', { name: '入力言語を自動判定' }));
    await userEvent.click(screen.getByRole('button', { name: '開始' }));
    await waitFor(() => expect(startFn).toHaveBeenCalledOnce());
    expect(startFn).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: null, autoDetectLanguage: true }),
    );
  });

  it('shows an error message when submission fails', async () => {
    const client = buildClient(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: false,
        error: {
          type: 'permission-required',
          code: 'CAPTURE-PERMISSION-DENIED',
          sourceType: 'tab',
          message: 'タブ音声取得が拒否されました',
        },
      }),
    );
    render(<StartSessionForm client={client} />);
    await userEvent.type(screen.getByRole('textbox', { name: '表示名' }), 'test');
    await userEvent.click(screen.getByRole('button', { name: '開始' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('タブ音声取得が拒否されました'),
    );
  });

  it('blocks submit when source and target languages are identical', async () => {
    const client = buildClient(() =>
      Promise.resolve<BackgroundResponse<StartSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's', state: 'x', startedAt: 'now' },
      }),
    );
    render(<StartSessionForm client={client} />);
    await userEvent.type(screen.getByRole('textbox', { name: '表示名' }), 'x');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '翻訳先言語' }),
      '英語 (米国)',
    );
    expect(screen.getByRole('button', { name: '開始' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('異なるものを選んでください');
  });
});
