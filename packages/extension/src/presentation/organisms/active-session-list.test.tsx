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
import { ActiveSessionList } from './active-session-list';

const DUMMY_START: BackgroundResponse<StartSourceSessionResult> = {
  ok: true,
  value: { sessionId: 's', state: 'idle', startedAt: 'now' },
};
const DUMMY_STOP_OK: BackgroundResponse<StopSourceSessionResult> = {
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

const buildClient = (overrides: {
  monitor?: BackgroundClient['getSessionMonitorState'];
  stop?: BackgroundClient['stopSourceSession'];
}): BackgroundClient => ({
  startSourceSession: vi.fn(() => Promise.resolve(DUMMY_START)),
  stopSourceSession: overrides.stop ?? vi.fn(() => Promise.resolve(DUMMY_STOP_OK)),
  updateSourceSettings: vi.fn(() => Promise.resolve(DUMMY_UPDATE)),
  exportSessionResult: vi.fn(() => Promise.resolve(DUMMY_EXPORT)),
  getSessionMonitorState:
    overrides.monitor ??
    vi.fn(() =>
      Promise.resolve<BackgroundResponse<SessionMonitorStateResult>>({
        ok: true,
        value: { sessions: [], latestSegments: [] },
      }),
    ),
});

describe('ActiveSessionList organism (IMPL-541)', () => {
  it('shows a loading indicator before the first fetch resolves', async () => {
    let resolveFn: (value: BackgroundResponse<SessionMonitorStateResult>) => void = () => undefined;
    const pending = new Promise<BackgroundResponse<SessionMonitorStateResult>>((resolve) => {
      resolveFn = resolve;
    });
    const client = buildClient({ monitor: vi.fn(() => pending) });
    render(<ActiveSessionList client={client} intervalMs={10000} />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    resolveFn({ ok: true, value: { sessions: [], latestSegments: [] } });
    await waitFor(() =>
      expect(screen.getByText('稼働中のセッションはありません。')).toBeInTheDocument(),
    );
  });

  it('displays empty message when no active sessions', async () => {
    const client = buildClient({});
    render(<ActiveSessionList client={client} intervalMs={10000} />);
    await waitFor(() =>
      expect(screen.getByText('稼働中のセッションはありません。')).toBeInTheDocument(),
    );
  });

  it('renders SessionListItem for each active session', async () => {
    const client = buildClient({
      monitor: vi.fn(() =>
        Promise.resolve<BackgroundResponse<SessionMonitorStateResult>>({
          ok: true,
          value: {
            sessions: [
              {
                sessionId: 's-1',
                displayName: 'Tab 1',
                state: 'capturing',
                sourceType: 'tab',
              },
              {
                sessionId: 's-2',
                displayName: 'Mic',
                state: 'transcribing',
                sourceType: 'microphone',
              },
            ],
            latestSegments: [],
          },
        }),
      ),
    });
    render(<ActiveSessionList client={client} intervalMs={10000} />);
    await waitFor(() => expect(screen.getByText('Tab 1')).toBeInTheDocument());
    expect(screen.getByText('Mic')).toBeInTheDocument();
  });

  it('calls stopSourceSession and refetches when Stop is clicked', async () => {
    const stopFn = vi.fn(() => Promise.resolve(DUMMY_STOP_OK));
    const monitorFn = vi
      .fn<() => Promise<BackgroundResponse<SessionMonitorStateResult>>>()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          sessions: [
            {
              sessionId: 's-1',
              displayName: 'Tab 1',
              state: 'capturing',
              sourceType: 'tab',
            },
          ],
          latestSegments: [],
        },
      })
      .mockResolvedValue({
        ok: true,
        value: { sessions: [], latestSegments: [] },
      });
    const client = buildClient({ monitor: monitorFn, stop: stopFn });
    const onChanged = vi.fn();
    render(<ActiveSessionList client={client} intervalMs={10000} onSessionChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText('Tab 1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Tab 1 を停止' }));
    await waitFor(() => expect(stopFn).toHaveBeenCalledWith({ sessionId: 's-1' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText('稼働中のセッションはありません。')).toBeInTheDocument(),
    );
  });
});
