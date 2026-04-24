import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundClient,
  type BackgroundResponse,
  type ExportSessionResultResult,
} from '../infrastructure/background-client';
import { ExportControls } from './export-controls';

const SESSION_ID = 'sess_01HZX8Y1R8M7D3Q2P4T5V6W7X8';

const okResult = (
  overrides: Partial<ExportSessionResultResult> = {},
): BackgroundResponse<ExportSessionResultResult> => ({
  ok: true,
  value: {
    exportId: 'exp_1',
    format: 'txt',
    bytes: 42,
    content: 'hello world',
    ...overrides,
  },
});

const buildClient = (overrides: Partial<BackgroundClient> = {}): BackgroundClient => ({
  startSourceSession: vi.fn(),
  stopSourceSession: vi.fn(),
  updateSourceSettings: vi.fn(),
  exportSessionResult: vi.fn(() => Promise.resolve(okResult())),
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

describe('ExportControls molecule (Issue #106)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders format select and include checkboxes with sane defaults', () => {
    const client = buildClient();
    render(<ExportControls client={client} sessionId={SESSION_ID} download={vi.fn()} />);
    expect(screen.getByLabelText('エクスポート形式')).toHaveValue('txt');
    expect(screen.getByLabelText('includeOriginal')).toBeChecked();
    expect(screen.getByLabelText('includeTranslation')).toBeChecked();
    expect(screen.getByRole('button', { name: 'エクスポート' })).toBeEnabled();
  });

  it('disables Export button when both include flags are off', () => {
    const client = buildClient();
    const download =
      vi.fn<(params: { filename: string; content: string; mimeType: string }) => void>();
    render(<ExportControls client={client} sessionId={SESSION_ID} download={download} />);
    fireEvent.click(screen.getByLabelText('includeOriginal'));
    fireEvent.click(screen.getByLabelText('includeTranslation'));
    expect(screen.getByRole('button', { name: 'エクスポート' })).toBeDisabled();
  });

  it('invokes exportSessionResult and download with TXT defaults', async () => {
    const client = buildClient();
    const download =
      vi.fn<(params: { filename: string; content: string; mimeType: string }) => void>();
    render(<ExportControls client={client} sessionId={SESSION_ID} download={download} />);
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }));
    await waitFor(() => {
      expect(client.exportSessionResult).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        format: 'txt',
        includeOriginal: true,
        includeTranslation: true,
      });
    });
    await waitFor(() => {
      expect(download).toHaveBeenCalledTimes(1);
    });
    const args = download.mock.calls[0]?.[0];
    expect(args?.content).toBe('hello world');
    expect(args?.mimeType).toBe('text/plain;charset=utf-8');
    expect(args?.filename).toMatch(/perapera-.*\.txt$/);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('保存しました (42 bytes)');
    });
  });

  it('switches MIME type and extension when format=JSON', async () => {
    const client = buildClient({
      exportSessionResult: vi.fn(() =>
        Promise.resolve(okResult({ format: 'json', content: '{"a":1}', bytes: 7 })),
      ),
    });
    const download =
      vi.fn<(params: { filename: string; content: string; mimeType: string }) => void>();
    render(<ExportControls client={client} sessionId={SESSION_ID} download={download} />);
    fireEvent.change(screen.getByLabelText('エクスポート形式'), {
      target: { value: 'json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }));
    await waitFor(() => {
      expect(download).toHaveBeenCalledTimes(1);
    });
    const args = download.mock.calls[0]?.[0];
    expect(args?.mimeType).toBe('application/json;charset=utf-8');
    expect(args?.filename).toMatch(/perapera-.*\.json$/);
  });

  it('shows failure message when exportSessionResult fails', async () => {
    const client = buildClient({
      exportSessionResult: vi.fn(() =>
        Promise.resolve<BackgroundResponse<ExportSessionResultResult>>({
          ok: false,
          error: { type: 'internal', code: 'INTERNAL_ERROR', message: 'boom' },
        }),
      ),
    });
    const download =
      vi.fn<(params: { filename: string; content: string; mimeType: string }) => void>();
    render(<ExportControls client={client} sessionId={SESSION_ID} download={download} />);
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('エクスポートに失敗しました: boom');
    });
    expect(download).not.toHaveBeenCalled();
  });
});
