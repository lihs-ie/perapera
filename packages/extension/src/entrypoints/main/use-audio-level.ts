import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

/**
 * Issue #110: 音声レベル hook (main window)。
 *
 * `offscreen/main.ts` が `chrome.runtime.sendMessage({ type:
 * 'audio.level.forward', sessionIdentifier, rms, capturedAt })` で
 * broadcast する RMS を購読する。1 秒以上 RMS < `SILENCE_THRESHOLD` の
 * 場合は `isSilent=true` を返し、UI 側で警告表示に使う。
 */

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1000;

const audioLevelSchema = z.object({
  type: z.literal('audio.level.forward'),
  sessionIdentifier: z.string().min(1),
  rms: z.number(),
  capturedAt: z.string().nullable().optional(),
});

export type AudioLevelState = Readonly<{
  rms: number;
  isSilent: boolean;
}>;

const initialState: AudioLevelState = { rms: 0, isSilent: false };

export const useAudioLevel = (): AudioLevelState => {
  const [state, setState] = useState<AudioLevelState>(initialState);
  const lastLoudAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
      message,
      _sender,
      sendResponse,
    ) => {
      const parsed = audioLevelSchema.safeParse(message);
      if (!parsed.success) return false;
      const { rms } = parsed.data;
      const clamped = Math.max(0, Math.min(1, rms));
      const now = Date.now();
      if (clamped >= SILENCE_THRESHOLD) {
        lastLoudAtRef.current = now;
      }
      const isSilent = now - lastLoudAtRef.current >= SILENCE_DURATION_MS;
      setState((prev) =>
        prev.rms === clamped && prev.isSilent === isSilent ? prev : { rms: clamped, isSilent },
      );
      sendResponse(undefined);
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  return state;
};
