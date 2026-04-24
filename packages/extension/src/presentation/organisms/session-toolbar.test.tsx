import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundClient,
  type BackgroundResponse,
  type StopSourceSessionResult,
} from '../infrastructure/background-client';
import { SessionToolbar, type ActiveSession } from './session-toolbar';

const buildClient = (overrides: Partial<BackgroundClient> = {}): BackgroundClient => ({
  startSourceSession: vi.fn(),
  stopSourceSession: vi.fn(
    (): Promise<BackgroundResponse<StopSourceSessionResult>> =>
      Promise.resolve({
        ok: true,
        value: { sessionId: 's-1', state: 'stopped', stoppedAt: '2026-04-23T00:00:00Z' },
      }),
  ),
  updateSourceSettings: vi.fn(),
  exportSessionResult: vi.fn(),
  getSessionMonitorState: vi.fn(),
  getDefaultSettings: vi.fn(),
  saveDefaultLanguagePair: vi.fn(),
  saveDefaultOverlaySettings: vi.fn(),
  saveDefaultEndpointingPolicy: vi.fn(),
  saveDefaultTranslationContextWindow: vi.fn(),
  saveRelayConnectionOverride: vi.fn(),
  clearRelayConnectionOverride: vi.fn(),
  getSessionHistory: vi.fn(),
  getSessionHistoryDetail: vi.fn(),
  ...overrides,
});

const session: ActiveSession = {
  sessionId: 's-1',
  displayName: 'YouTube',
  state: 'capturing',
};

describe('SessionToolbar organism', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders displayName and status badge', () => {
    render(<SessionToolbar client={buildClient()} session={session} onStopped={() => undefined} />);
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('capturing');
  });

  it('invokes stopSourceSession with sessionId on click', async () => {
    const client = buildClient();
    const onStopped = vi.fn();
    render(<SessionToolbar client={client} session={session} onStopped={onStopped} />);
    fireEvent.click(screen.getByRole('button', { name: 'セッションを停止' }));
    await waitFor(() => {
      expect(client.stopSourceSession).toHaveBeenCalledWith({ sessionId: 's-1' });
    });
    await waitFor(() => {
      expect(onStopped).toHaveBeenCalledTimes(1);
    });
  });

  it('does not invoke onStopped when stop fails', async () => {
    const client = buildClient({
      stopSourceSession: vi.fn(
        (): Promise<BackgroundResponse<StopSourceSessionResult>> =>
          Promise.resolve({
            ok: false,
            error: { type: 'internal', code: 'INTERNAL_ERROR', message: 'boom' },
          }),
      ),
    });
    const onStopped = vi.fn();
    render(<SessionToolbar client={client} session={session} onStopped={onStopped} />);
    fireEvent.click(screen.getByRole('button', { name: 'セッションを停止' }));
    await waitFor(() => {
      expect(client.stopSourceSession).toHaveBeenCalled();
    });
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('shows a state banner when active state is degraded (Issue #108)', () => {
    const degraded: ActiveSession = {
      sessionId: 's-1',
      displayName: 'YouTube',
      state: 'degraded',
    };
    render(
      <SessionToolbar
        client={buildClient()}
        session={degraded}
        stateReason="translation timeout"
        onStopped={() => undefined}
      />,
    );
    const banner = screen.getByTestId('session-state-banner');
    expect(banner).toHaveTextContent('翻訳が一時停止');
    expect(banner).toHaveTextContent('translation timeout');
  });

  it('hides the state banner for normal states (Issue #108)', () => {
    render(<SessionToolbar client={buildClient()} session={session} onStopped={() => undefined} />);
    expect(screen.queryByTestId('session-state-banner')).toBeNull();
  });

  it('toggles the export panel via the dedicated button (Issue #106)', () => {
    render(<SessionToolbar client={buildClient()} session={session} onStopped={() => undefined} />);
    expect(screen.queryByTestId('export-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'エクスポートを開く' }));
    expect(screen.getByTestId('export-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'エクスポートを開く' }));
    expect(screen.queryByTestId('export-panel')).toBeNull();
  });

  it('shows pending label while in-flight', async () => {
    let resolveStop: (value: BackgroundResponse<StopSourceSessionResult>) => void = () => undefined;
    const stopPromise = new Promise<BackgroundResponse<StopSourceSessionResult>>((resolve) => {
      resolveStop = resolve;
    });
    const client = buildClient({
      stopSourceSession: vi.fn(() => stopPromise),
    });
    render(<SessionToolbar client={client} session={session} onStopped={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'セッションを停止' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セッションを停止' })).toHaveTextContent('停止中…');
    });
    await act(async () => {
      resolveStop({
        ok: true,
        value: { sessionId: 's-1', state: 'stopped', stoppedAt: '2026-04-23T00:00:00Z' },
      });
      await stopPromise;
    });
  });
});
