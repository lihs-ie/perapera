import { render, screen, waitFor } from '@testing-library/react';
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
import { ActiveSessionDetailList } from './active-session-detail-list';

const DUMMY_START: BackgroundResponse<StartSourceSessionResult> = {
  ok: true,
  value: { sessionId: 's', state: 'x', startedAt: 'now' },
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

const buildClient = (monitor: BackgroundClient['getSessionMonitorState']): BackgroundClient => ({
  startSourceSession: vi.fn(() => Promise.resolve(DUMMY_START)),
  stopSourceSession: vi.fn(() => Promise.resolve(DUMMY_STOP)),
  updateSourceSettings: vi.fn(() => Promise.resolve(DUMMY_UPDATE)),
  exportSessionResult: vi.fn(() => Promise.resolve(DUMMY_EXPORT)),
  getSessionMonitorState: monitor,
});

describe('ActiveSessionDetailList organism (IMPL-543)', () => {
  it('shows empty message when no sessions', async () => {
    const client = buildClient(
      vi.fn(() =>
        Promise.resolve<BackgroundResponse<SessionMonitorStateResult>>({
          ok: true,
          value: { sessions: [], latestSegments: [] },
        }),
      ),
    );
    render(<ActiveSessionDetailList client={client} intervalMs={10000} />);
    await waitFor(() =>
      expect(screen.getByText('稼働中のセッションはありません。')).toBeInTheDocument(),
    );
  });

  it('renders a SessionDetailCard per active session with latest segments', async () => {
    const client = buildClient(
      vi.fn(() =>
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
            latestSegments: [
              {
                sessionId: 's-1',
                segmentId: 'seg-1',
                originalText: 'Hello',
                translatedText: 'こんにちは',
              },
              {
                sessionId: 's-2',
                segmentId: 'seg-2',
                originalText: 'Good morning',
              },
            ],
          },
        }),
      ),
    );
    render(<ActiveSessionDetailList client={client} intervalMs={10000} />);
    await waitFor(() => expect(screen.getByText('Tab 1')).toBeInTheDocument());
    expect(screen.getByText('Mic')).toBeInTheDocument();
    // latestSegments が session ごとに分かれて表示される
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
  });

  it('renders loading message before first fetch resolves', () => {
    const neverResolve = new Promise<BackgroundResponse<SessionMonitorStateResult>>(() => {
      /* never resolves during this test */
    });
    const client = buildClient(vi.fn(() => neverResolve));
    render(<ActiveSessionDetailList client={client} intervalMs={10000} />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });
});
