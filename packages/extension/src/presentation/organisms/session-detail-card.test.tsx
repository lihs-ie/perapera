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
import { SessionDetailCard, type SessionDetailViewModel } from './session-detail-card';

const DUMMY_START: BackgroundResponse<StartSourceSessionResult> = {
  ok: true,
  value: { sessionId: 's', state: 'x', startedAt: 'now' },
};
const DUMMY_UPDATE: BackgroundResponse<UpdateSourceSettingsResult> = {
  ok: true,
  value: { sessionId: 's', appliedAt: 'now' },
};
const DUMMY_MONITOR: BackgroundResponse<SessionMonitorStateResult> = {
  ok: true,
  value: { sessions: [], latestSegments: [] },
};

const buildClient = (overrides: {
  stop?: BackgroundClient['stopSourceSession'];
  exportFn?: BackgroundClient['exportSessionResult'];
}): BackgroundClient => ({
  startSourceSession: vi.fn(() => Promise.resolve(DUMMY_START)),
  stopSourceSession:
    overrides.stop ??
    vi.fn(() =>
      Promise.resolve<BackgroundResponse<StopSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's', state: 'stopped', stoppedAt: 'now' },
      }),
    ),
  updateSourceSettings: vi.fn(() => Promise.resolve(DUMMY_UPDATE)),
  exportSessionResult:
    overrides.exportFn ??
    vi.fn(() =>
      Promise.resolve<BackgroundResponse<ExportSessionResultResult>>({
        ok: true,
        value: { exportId: 'exp-1', format: 'txt', bytes: 1024 },
      }),
    ),
  getSessionMonitorState: vi.fn(() => Promise.resolve(DUMMY_MONITOR)),
});

const session: SessionDetailViewModel = {
  sessionId: 's-1',
  displayName: 'YouTube Live',
  state: 'capturing',
  sourceType: 'tab',
};

describe('SessionDetailCard organism (IMPL-542)', () => {
  it('renders session info and status badge', () => {
    render(<SessionDetailCard client={buildClient({})} session={session} latestSegments={[]} />);
    expect(screen.getByText('YouTube Live')).toBeInTheDocument();
    expect(screen.getByText('[tab]')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'active');
  });

  it('shows latest transcript preview when segments exist', () => {
    render(
      <SessionDetailCard
        client={buildClient({})}
        session={session}
        latestSegments={[
          {
            sessionId: 's-1',
            segmentId: 'seg-1',
            originalText: 'Hello',
            translatedText: 'こんにちは',
          },
        ]}
      />,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
  });

  it('dispatches stopSourceSession and calls onStopped on success', async () => {
    const stopFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<StopSourceSessionResult>>({
        ok: true,
        value: { sessionId: 's-1', state: 'stopped', stoppedAt: 'now' },
      }),
    );
    const onStopped = vi.fn();
    render(
      <SessionDetailCard
        client={buildClient({ stop: stopFn })}
        session={session}
        latestSegments={[]}
        onStopped={onStopped}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'YouTube Live を停止' }));
    await waitFor(() => expect(stopFn).toHaveBeenCalledWith({ sessionId: 's-1' }));
    await waitFor(() => expect(onStopped).toHaveBeenCalled());
  });

  it('shows error message when stop fails', async () => {
    const stopFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<StopSourceSessionResult>>({
        ok: false,
        error: { type: 'internal', code: 'INTERNAL_ERROR', message: '停止失敗' },
      }),
    );
    render(
      <SessionDetailCard
        client={buildClient({ stop: stopFn })}
        session={session}
        latestSegments={[]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'YouTube Live を停止' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('停止失敗'));
  });

  it('dispatches exportSessionResult with collected input and shows bytes', async () => {
    const exportFn = vi.fn(() =>
      Promise.resolve<BackgroundResponse<ExportSessionResultResult>>({
        ok: true,
        value: { exportId: 'exp-1', format: 'json', bytes: 4096 },
      }),
    );
    const onExported = vi.fn();
    render(
      <SessionDetailCard
        client={buildClient({ exportFn })}
        session={session}
        latestSegments={[]}
        onExported={onExported}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'エクスポート形式' }),
      'JSON (.json)',
    );
    await userEvent.click(screen.getByRole('button', { name: 'エクスポートを実行' }));
    await waitFor(() =>
      expect(exportFn).toHaveBeenCalledWith({
        sessionId: 's-1',
        format: 'json',
        includeOriginal: true,
        includeTranslation: true,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText('4096 バイトを出力しました。')).toBeInTheDocument(),
    );
    expect(onExported).toHaveBeenCalled();
  });
});
