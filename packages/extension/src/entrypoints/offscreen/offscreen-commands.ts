import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { validationError, type DomainError } from '../../domain/shared/errors';

/**
 * IMPL-560 Offscreen command schema (Background → Offscreen)。
 *
 * MV3 Service Worker は DOM / AudioContext を直接扱えないため、
 * `chrome.offscreen.createDocument` で作成した offscreen document に
 * `chrome.runtime.sendMessage` で命令を送り、audio 処理を delegate する。
 *
 * MVP スコープでは:
 * - `offscreen.audio.open`: sessionId に対する AudioContext を確保
 * - `offscreen.audio.close`: sessionId の AudioContext を破棄
 * - `offscreen.ping`: living-proof (offscreen doc が応答できるかの死活確認)
 *
 * 実際の PCM frame 転送や AudioWorklet への音声 pipe は Phase 6 integration で
 * 実装する。本 PR は shell (lifecycle + message routing) を整える。
 */

const audioOpenSchema = z.object({
  type: z.literal('offscreen.audio.open'),
  sessionIdentifier: z.string().min(1),
  /** AudioContext のサンプルレート (default 16000) */
  sampleRateHz: z.number().int().positive().optional(),
  /**
   * `chrome.tabCapture.getMediaStreamId` で取得した stream id。
   * IMPL-610: offscreen 側で `navigator.mediaDevices.getUserMedia({
   *   audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: tabStreamId } }
   * })` を呼び MediaStream を確保するのに必要。tab source 以外では省略 (microphone は
   * offscreen 側で deviceId ベースの getUserMedia を直接呼ぶ設計)。
   */
  tabStreamId: z.string().min(1).optional(),
});

const audioCloseSchema = z.object({
  type: z.literal('offscreen.audio.close'),
  sessionIdentifier: z.string().min(1),
});

const pingSchema = z.object({
  type: z.literal('offscreen.ping'),
});

const offscreenCommandRawSchema = z.discriminatedUnion('type', [
  audioOpenSchema,
  audioCloseSchema,
  pingSchema,
]);

export type OffscreenCommand =
  | Readonly<{
      type: 'offscreen.audio.open';
      sessionIdentifier: SessionIdentifier;
      sampleRateHz?: number;
      tabStreamId?: string;
    }>
  | Readonly<{ type: 'offscreen.audio.close'; sessionIdentifier: SessionIdentifier }>
  | Readonly<{ type: 'offscreen.ping' }>;

export const parseOffscreenCommand = (raw: unknown): Result<OffscreenCommand, DomainError> => {
  const parsed = offscreenCommandRawSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      validationError({
        field: 'OffscreenCommand',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }),
    );
  }
  const data = parsed.data;
  switch (data.type) {
    case 'offscreen.ping':
      return ok<OffscreenCommand, DomainError>({ type: 'offscreen.ping' });
    case 'offscreen.audio.open':
      return parseSessionIdentifier(data.sessionIdentifier).map((sessionIdentifier) => {
        const base: {
          type: 'offscreen.audio.open';
          sessionIdentifier: SessionIdentifier;
          sampleRateHz?: number;
          tabStreamId?: string;
        } = { type: 'offscreen.audio.open', sessionIdentifier };
        if (data.sampleRateHz !== undefined) base.sampleRateHz = data.sampleRateHz;
        if (data.tabStreamId !== undefined) base.tabStreamId = data.tabStreamId;
        return base satisfies OffscreenCommand;
      });
    case 'offscreen.audio.close':
      return parseSessionIdentifier(data.sessionIdentifier).map(
        (sessionIdentifier): OffscreenCommand => ({
          type: 'offscreen.audio.close',
          sessionIdentifier,
        }),
      );
  }
};
