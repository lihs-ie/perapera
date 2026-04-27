import { useEffect, useState } from 'react';
import type { OverlayLine } from '../../application/ports/overlay-presenter';
import { mapSessionStateToWaveformMode } from '../../presentation/molecules/session-state-mapper';
import { OverlayPanel } from '../../presentation/organisms/overlay-panel';

type OverlayState = Readonly<{
  sourceName: string;
  sessionState: string;
  audioSilent: boolean;
  lines: readonly OverlayLine[];
}>;

const INITIAL: OverlayState = {
  sourceName: 'PERAPERA',
  sessionState: 'idle',
  audioSilent: false,
  lines: [],
};

function isOverlayLineCandidate(value: unknown): value is OverlayLine {
  if (typeof value !== 'object' || value === null) return false;
  const segmentIdentifier: unknown = Reflect.get(value, 'segmentIdentifier');
  const isFinal: unknown = Reflect.get(value, 'isFinal');
  return typeof segmentIdentifier === 'string' && typeof isFinal === 'boolean';
}

/**
 * Content script Overlay React app — chrome.runtime.onMessage で
 * `overlay.line.appended` / `overlay.session.state.changed` を受信し、
 * 最新行を Shadow DOM 内の OverlayPanel に表示する。
 *
 * UI は `pointer-events: none` の host 内で描画されるため、host page の
 * 動画 / cursor 操作を阻害しない。
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState>(INITIAL);

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return;
      const type = String(Reflect.get(message, 'type'));
      if (type === 'overlay.line.appended') {
        const raw: unknown = Reflect.get(message, 'line');
        if (!isOverlayLineCandidate(raw)) return;
        setState((prev) => ({
          ...prev,
          lines: [...prev.lines.slice(-2), raw],
        }));
      } else if (type === 'overlay.session.state.changed') {
        const next = String(Reflect.get(message, 'state') ?? 'idle');
        const audioSilent = Reflect.get(message, 'audioSilent') === true;
        setState((prev) => ({ ...prev, sessionState: next, audioSilent }));
      } else if (type === 'overlay.session.started') {
        const name = String(Reflect.get(message, 'displayName') ?? 'PERAPERA');
        setState((prev) => ({ ...prev, sourceName: name }));
      } else if (type === 'overlay.session.stopped') {
        setState(INITIAL);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const latest = state.lines.at(-1);
  if (latest === undefined) return null;
  const mode = mapSessionStateToWaveformMode(state.sessionState, state.audioSilent);
  return (
    <OverlayPanel
      sourceName={state.sourceName}
      state={state.sessionState}
      mode={mode}
      original={latest.originalText ?? ''}
      translation={latest.translatedText ?? ''}
      isPartial={!latest.isFinal}
    />
  );
}
