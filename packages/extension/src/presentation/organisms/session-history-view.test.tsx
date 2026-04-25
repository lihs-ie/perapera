import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundClient,
  type BackgroundResponse,
  type ExportSessionResultResult,
  type SessionHistoryDetailResult,
  type SessionHistoryListResult,
} from '../infrastructure/background-client';
import { SessionHistoryView } from './session-history-view';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SECOND_SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A2';

const buildList = (
  overrides: Partial<SessionHistoryListResult> = {},
): BackgroundResponse<SessionHistoryListResult> => ({
  ok: true,
  value: {
    sessions: [
      {
        sessionId: SESSION_ID,
        displayName: SESSION_ID,
        sourceType: 'tab',
        state: 'stopped',
        sourceLanguage: 'en-US',
        targetLanguage: 'ja-JP',
        startedAt: '2026-04-21T00:00:00.000Z',
        stoppedAt: '2026-04-21T00:01:00.000Z',
        durationMs: 60_000,
      },
      {
        sessionId: SECOND_SESSION_ID,
        displayName: SECOND_SESSION_ID,
        sourceType: 'microphone',
        state: 'stopped',
        sourceLanguage: 'ja-JP',
        targetLanguage: 'en-US',
        startedAt: '2026-04-22T00:00:00.000Z',
        stoppedAt: '2026-04-22T00:00:30.000Z',
        durationMs: 30_000,
      },
    ],
    ...overrides,
  },
});

const buildDetail = (): BackgroundResponse<SessionHistoryDetailResult> => ({
  ok: true,
  value: {
    summary: {
      sessionId: SESSION_ID,
      displayName: SESSION_ID,
      sourceType: 'tab',
      state: 'stopped',
      sourceLanguage: 'en-US',
      targetLanguage: 'ja-JP',
      startedAt: '2026-04-21T00:00:00.000Z',
      stoppedAt: '2026-04-21T00:01:00.000Z',
      durationMs: 60_000,
    },
    lines: [
      {
        segmentIdentifier: '01HZX8Y2R8M7D3Q2P4T5V6W7B1',
        originalText: 'hello world',
        translatedText: 'こんにちは',
        targetLanguage: 'ja-JP',
        isFinal: true,
        precedingSegmentIdentifier: null,
        hasTranslationContext: false,
      },
    ],
  },
});

const buildClient = (overrides: Partial<BackgroundClient> = {}): BackgroundClient => ({
  startSourceSession: vi.fn(),
  stopSourceSession: vi.fn(),
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
  getDefaultGlossary: vi.fn(),
  saveDefaultGlossary: vi.fn(),
  getSessionRetentionPolicy: vi.fn(),
  saveSessionRetentionPolicy: vi.fn(),
  purgeExpiredSessions: vi.fn(),
  purgeAllSessions: vi.fn(),
  searchSessionHistory: vi.fn(),
  toggleTranscriptBookmark: vi.fn(),
  getBookmarkedSegments: vi.fn(),
  getSessionHistory: vi.fn(() => Promise.resolve(buildList())),
  getSessionHistoryDetail: vi.fn(() => Promise.resolve(buildDetail())),
  ...overrides,
});

describe('SessionHistoryView organism (Issue #109)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom には URL.createObjectURL / revokeObjectURL が無い。
    // ExportControls の downloadViaAnchor が依存するため stub する。
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders the list of past sessions', async () => {
    const client = buildClient();
    render(<SessionHistoryView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(client.getSessionHistory).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('fetches detail and renders lines when an entry is clicked', async () => {
    const client = buildClient();
    render(<SessionHistoryView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }));
    await waitFor(() => {
      expect(client.getSessionHistoryDetail).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    });
    await waitFor(() => {
      expect(screen.getByTestId('history-detail')).toBeInTheDocument();
    });
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
  });

  it('renders ExportControls in the detail panel after selecting a session', async () => {
    const client = buildClient();
    render(<SessionHistoryView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }));
    await waitFor(() => {
      expect(screen.getByTestId('history-detail')).toBeInTheDocument();
    });
    // ExportControls molecule は data-testid="export-controls" を持つ
    expect(screen.getByTestId('export-controls')).toBeInTheDocument();
  });

  it('invokes exportSessionResult with the selected sessionId via ExportControls', async () => {
    const exportResult: BackgroundResponse<ExportSessionResultResult> = {
      ok: true,
      value: {
        exportId: 'exp_history_1',
        format: 'json',
        bytes: 42,
        content: '{"sessionIdentifier":"' + SESSION_ID + '","segments":[]}',
      },
    };
    const client = buildClient({
      exportSessionResult: vi.fn(() => Promise.resolve(exportResult)),
    });
    render(<SessionHistoryView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }));
    await waitFor(() => {
      expect(screen.getByTestId('export-controls')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }));
    await waitFor(() => {
      expect(client.exportSessionResult).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
    });
  });

  it('shows error message when detail fetch fails', async () => {
    const client = buildClient({
      getSessionHistoryDetail: vi.fn(() =>
        Promise.resolve<BackgroundResponse<SessionHistoryDetailResult>>({
          ok: false,
          error: { type: 'internal', code: 'INTERNAL_ERROR', message: 'boom' },
        }),
      ),
    });
    render(<SessionHistoryView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: `セッション ${SESSION_ID} を開く` }));
    await waitFor(() => {
      expect(
        screen.getAllByRole('alert').some((el) => el.textContent?.includes('詳細取得に失敗')),
      ).toBe(true);
    });
  });
});
