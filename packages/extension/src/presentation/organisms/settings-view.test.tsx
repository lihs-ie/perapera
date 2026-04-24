import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundClient,
  type BackgroundResponse,
  type DefaultSettingsResult,
  type SavedAckResult,
} from '../infrastructure/background-client';
import { SettingsView } from './settings-view';

const SETTINGS: DefaultSettingsResult = {
  languagePair: { source: 'en-US', target: 'ja-JP' },
  overlaySettings: {
    positionPreset: 'bottom',
    opacity: 0.8,
    maxLines: 2,
    fontScale: 1,
    showOriginalText: true,
    showTranslatedText: true,
  },
  endpointing: {
    silenceThresholdMs: 600,
    punctuationAware: true,
    minUtteranceMs: 500,
  },
  translationContext: {
    maxSegments: 3,
    includeTranslatedText: true,
  },
  relayOverride: null,
};

const SAVED_ACK: BackgroundResponse<SavedAckResult> = {
  ok: true,
  value: { saved: true },
};

const buildClient = (overrides: Partial<BackgroundClient> = {}): BackgroundClient => ({
  startSourceSession: vi.fn(),
  stopSourceSession: vi.fn(),
  updateSourceSettings: vi.fn(),
  exportSessionResult: vi.fn(),
  getSessionMonitorState: vi.fn(),
  getDefaultSettings: vi.fn(
    (): Promise<BackgroundResponse<DefaultSettingsResult>> =>
      Promise.resolve({ ok: true, value: SETTINGS }),
  ),
  saveDefaultLanguagePair: vi.fn(() => Promise.resolve(SAVED_ACK)),
  saveDefaultOverlaySettings: vi.fn(() => Promise.resolve(SAVED_ACK)),
  saveDefaultEndpointingPolicy: vi.fn(() => Promise.resolve(SAVED_ACK)),
  saveDefaultTranslationContextWindow: vi.fn(() => Promise.resolve(SAVED_ACK)),
  saveRelayConnectionOverride: vi.fn(() => Promise.resolve(SAVED_ACK)),
  clearRelayConnectionOverride: vi.fn(() => Promise.resolve(SAVED_ACK)),
  getSessionHistory: vi.fn(),
  getSessionHistoryDetail: vi.fn(),
  ...overrides,
});

describe('SettingsView organism', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches current settings on mount and prefills form', async () => {
    const client = buildClient();
    render(<SettingsView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(client.getDefaultSettings).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
    });
    expect(screen.getByLabelText('翻訳先言語')).toHaveValue('ja-JP');
    expect(screen.getByLabelText(/透明度/)).toHaveValue('0.8');
  });

  it('saves both language pair and overlay settings on Save click', async () => {
    const client = buildClient();
    render(<SettingsView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(client.getDefaultSettings).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
    });

    // defaults の 保存 ボタンは最初に出現する (Relay section の 保存 は後)
    const defaultsSaveButton = screen.getAllByRole('button', { name: /保存/ })[0];
    if (defaultsSaveButton === undefined) throw new Error('defaults save button not found');
    fireEvent.click(defaultsSaveButton);

    await waitFor(() => {
      expect(client.saveDefaultLanguagePair).toHaveBeenCalledWith({
        source: 'en-US',
        target: 'ja-JP',
      });
    });
    expect(client.saveDefaultOverlaySettings).toHaveBeenCalledWith({
      positionPreset: 'bottom',
      opacity: 0.8,
      maxLines: 2,
      fontScale: 1,
      showOriginalText: true,
      showTranslatedText: true,
    });
    await waitFor(() => {
      expect(screen.getByText('設定を保存しました。')).toBeInTheDocument();
    });
  });

  it('disables Save when source/target language are the same', async () => {
    const client = buildClient({
      getDefaultSettings: vi.fn(() =>
        Promise.resolve<BackgroundResponse<DefaultSettingsResult>>({
          ok: true,
          value: {
            ...SETTINGS,
            languagePair: { source: 'ja-JP', target: 'ja-JP' },
            relayOverride: null,
          },
        }),
      ),
    });
    render(<SettingsView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('ja-JP');
    });
    const defaultsSaveButton = screen.getAllByRole('button', { name: /保存/ })[0];
    if (defaultsSaveButton === undefined) throw new Error('defaults save button not found');
    expect(defaultsSaveButton).toBeDisabled();
    expect(
      screen.getByText('入力言語と翻訳先言語は異なるものを選んでください。'),
    ).toBeInTheDocument();
  });

  it('shows failure message when save fails', async () => {
    const client = buildClient({
      saveDefaultLanguagePair: vi.fn(() =>
        Promise.resolve<BackgroundResponse<SavedAckResult>>({
          ok: false,
          error: {
            type: 'internal',
            code: 'INTERNAL_ERROR',
            message: 'storage write failed',
          },
        }),
      ),
    });
    render(<SettingsView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
    });
    const defaultsSaveButton = screen.getAllByRole('button', { name: /保存/ })[0];
    if (defaultsSaveButton === undefined) throw new Error('defaults save button not found');
    fireEvent.click(defaultsSaveButton);
    await waitFor(() => {
      expect(screen.getByText(/保存に失敗しました/)).toBeInTheDocument();
    });
  });

  it('resets fields to build-time defaults on Reset click', async () => {
    const client = buildClient({
      getDefaultSettings: vi.fn(() =>
        Promise.resolve<BackgroundResponse<DefaultSettingsResult>>({
          ok: true,
          value: {
            languagePair: { source: 'ko-KR', target: 'zh-CN' },
            overlaySettings: {
              positionPreset: 'top',
              opacity: 0.5,
              maxLines: 5,
              fontScale: 1.5,
              showOriginalText: false,
              showTranslatedText: true,
            },
            endpointing: {
              silenceThresholdMs: 800,
              punctuationAware: true,
              minUtteranceMs: 500,
            },
            translationContext: {
              maxSegments: 5,
              includeTranslatedText: true,
            },
            relayOverride: null,
          },
        }),
      ),
    });
    render(<SettingsView client={client} onClose={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('ko-KR');
    });
    fireEvent.click(screen.getByRole('button', { name: '既定値に戻す' }));
    expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
    expect(screen.getByLabelText('翻訳先言語')).toHaveValue('ja-JP');
  });

  it('invokes onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const client = buildClient();
    render(<SettingsView client={client} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
    });
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Relay 接続 section (Step B)', () => {
    it('shows "build-time default" badge when no override is saved', async () => {
      const client = buildClient();
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
      });
      expect(screen.getByTestId('relay-override-badge')).toHaveTextContent('build-time default');
      expect(screen.getByLabelText('Relay baseUrl')).toHaveValue('');
      expect(screen.getByLabelText('Relay accessToken')).toHaveValue('');
    });

    it('shows "user override" badge and fills inputs when override present', async () => {
      const client = buildClient({
        getDefaultSettings: vi.fn(() =>
          Promise.resolve<BackgroundResponse<DefaultSettingsResult>>({
            ok: true,
            value: {
              ...SETTINGS,
              relayOverride: {
                baseUrl: 'https://staging.relay.example.com',
                accessToken: 'staging-access-token-1234567890',
              },
            },
          }),
        ),
      });
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByTestId('relay-override-badge')).toHaveTextContent('user override');
      });
      expect(screen.getByLabelText('Relay baseUrl')).toHaveValue(
        'https://staging.relay.example.com',
      );
      expect(screen.getByLabelText('Relay accessToken')).toHaveValue(
        'staging-access-token-1234567890',
      );
    });

    it('saves baseUrl + accessToken when valid inputs are submitted', async () => {
      const client = buildClient();
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
      });
      fireEvent.change(screen.getByLabelText('Relay baseUrl'), {
        target: { value: 'http://localhost:3001' },
      });
      fireEvent.change(screen.getByLabelText('Relay accessToken'), {
        target: { value: 'dev-access-token-abcdef' },
      });
      // Relay 保存ボタンは section 内の「保存」。両方の "保存" ボタンから relay 側 (2 つ目) を取得。
      const saveButtons = screen.getAllByRole('button', { name: /保存/ });
      const relaySaveButton = saveButtons[saveButtons.length - 1];
      if (relaySaveButton === undefined) throw new Error('relay save button not found');
      fireEvent.click(relaySaveButton);
      await waitFor(() => {
        expect(client.saveRelayConnectionOverride).toHaveBeenCalledWith({
          baseUrl: 'http://localhost:3001',
          accessToken: 'dev-access-token-abcdef',
        });
      });
      await waitFor(() => {
        expect(screen.getByTestId('relay-override-badge')).toHaveTextContent('user override');
      });
    });

    it('disables save button when baseUrl is invalid', async () => {
      const client = buildClient();
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
      });
      fireEvent.change(screen.getByLabelText('Relay baseUrl'), {
        target: { value: 'not-a-url' },
      });
      fireEvent.change(screen.getByLabelText('Relay accessToken'), {
        target: { value: 'dev-access-token-abcdef' },
      });
      const saveButtons = screen.getAllByRole('button', { name: /保存/ });
      const relaySaveButton = saveButtons[saveButtons.length - 1];
      if (relaySaveButton === undefined) throw new Error('relay save button not found');
      expect(relaySaveButton).toBeDisabled();
    });

    it('disables save button when accessToken is shorter than 16 chars', async () => {
      const client = buildClient();
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
      });
      fireEvent.change(screen.getByLabelText('Relay baseUrl'), {
        target: { value: 'http://localhost:3001' },
      });
      fireEvent.change(screen.getByLabelText('Relay accessToken'), { target: { value: 'short' } });
      const saveButtons = screen.getAllByRole('button', { name: /保存/ });
      const relaySaveButton = saveButtons[saveButtons.length - 1];
      if (relaySaveButton === undefined) throw new Error('relay save button not found');
      expect(relaySaveButton).toBeDisabled();
    });

    it('clears override when Clear button is clicked (override was active)', async () => {
      const client = buildClient({
        getDefaultSettings: vi.fn(() =>
          Promise.resolve<BackgroundResponse<DefaultSettingsResult>>({
            ok: true,
            value: {
              ...SETTINGS,
              relayOverride: {
                baseUrl: 'https://staging.relay.example.com',
                accessToken: 'staging-access-token-1234567890',
              },
            },
          }),
        ),
      });
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByTestId('relay-override-badge')).toHaveTextContent('user override');
      });
      fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
      await waitFor(() => {
        expect(client.clearRelayConnectionOverride).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('relay-override-badge')).toHaveTextContent('build-time default');
      });
      expect(screen.getByLabelText('Relay baseUrl')).toHaveValue('');
      expect(screen.getByLabelText('Relay accessToken')).toHaveValue('');
    });

    it('disables Clear button when no override is active', async () => {
      const client = buildClient();
      render(<SettingsView client={client} onClose={() => undefined} />);
      await waitFor(() => {
        expect(screen.getByLabelText('入力言語')).toHaveValue('en-US');
      });
      expect(screen.getByRole('button', { name: 'クリア' })).toBeDisabled();
    });
  });
});
