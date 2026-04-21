import { type Result } from 'neverthrow';
import { type DomainError } from '../../domain/shared/errors';
import { type SttStreamHandle } from '../ports/stt-port';

/**
 * IMPL-402 RelayAudioFrameUseCase。
 *
 * WebSocket `audio.frame` client event を受信した際に呼び出される薄い
 * coordinator。input (base64 PCM + chunkId) を `SttStreamHandle.sendFrame`
 * へ転送する。
 *
 * 本 UseCase 自体は state を持たない pure function。stream handle は WS 接続
 * 毎に確立され、接続スコープの map (relay-route.ts) で管理する。
 */
export type RelayAudioFrameInput = Readonly<{
  audioBase64: string;
  chunkId: string;
}>;

export type RelayAudioFrameUseCase = (
  handle: SttStreamHandle,
  input: RelayAudioFrameInput,
) => Result<void, DomainError>;

export const createRelayAudioFrameUseCase = (): RelayAudioFrameUseCase => (handle, input) =>
  handle.sendFrame({
    audioBase64: input.audioBase64,
    chunkId: input.chunkId,
  });
