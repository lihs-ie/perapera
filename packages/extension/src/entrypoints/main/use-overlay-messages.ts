import { useEffect, useState } from 'react';
import { type OverlayLine } from '../../application/ports/overlay-presenter';
import { type SessionIdentifier } from '../../domain/session/session-identifier';
import { type SessionState } from '../../domain/session/session-state';
import { parseOverlayCommand } from '../../infrastructure/overlay/overlay-commands';

export type OverlayMessagesState = Readonly<{
  sessionIdentifier: SessionIdentifier | null;
  lines: readonly OverlayLine[];
  /** Issue #108: 直近受信した session state ('connecting' / 'capturing' 等) */
  sessionState: SessionState | null;
  /** Issue #108: degraded / error 等で Relay が付与した補足理由 */
  sessionStateReason: string | null;
}>;

const initialState: OverlayMessagesState = {
  sessionIdentifier: null,
  lines: [],
  sessionState: null,
  sessionStateReason: null,
};

/**
 * Main window hook: `chrome.runtime.onMessage` で broadcast される
 * `OverlayCommand` を subscribe し、最新の session / lines を React state として
 * 公開する。
 *
 * - `overlay.mount`: 対象 session を記録し lines を空に
 * - `overlay.render`: 同一 session のみ lines を差し替え
 * - `overlay.unmount`: 同一 session のみ state をリセット
 * - `overlay.update-settings`: MVP では反映せず (settings は OverlaySettings
 *   として presenter 側で保持、main window UI は固定レイアウト)
 *
 * 他の runtime message (audio.frame.forward など) は parse に失敗するので
 * silent ignore される。
 */
export const useOverlayMessages = (): OverlayMessagesState => {
  const [state, setState] = useState<OverlayMessagesState>(initialState);

  useEffect(() => {
    const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
      message,
      _sender,
      sendResponse,
    ) => {
      const parsed = parseOverlayCommand(message);
      if (parsed.isErr()) return false;
      const command = parsed.value;
      console.log(
        '[main:use-overlay-messages] received',
        command.type,
        command.type === 'overlay.render' ? `(${command.model.lines.length.toString()} lines)` : '',
      );
      setState((prev): OverlayMessagesState => {
        switch (command.type) {
          case 'overlay.mount':
            return {
              sessionIdentifier: command.sessionIdentifier,
              lines: [],
              sessionState: prev.sessionState,
              sessionStateReason: prev.sessionStateReason,
            };
          case 'overlay.render':
            // prior mount が無くても先行 render を adopt する。現状
            // start-source-session-use-case は overlayPresenter.mount を
            // 明示的に呼ばず、最初の transcript.partial/final で render が
            // broadcast される。受信側 (main window) はそれを認識して
            // sessionIdentifier を記録する。
            if (
              prev.sessionIdentifier !== null &&
              prev.sessionIdentifier !== command.model.sessionIdentifier
            ) {
              console.warn(
                '[main:use-overlay-messages] render session mismatch; ignoring',
                'current=',
                prev.sessionIdentifier,
                'incoming=',
                command.model.sessionIdentifier,
              );
              return prev;
            }
            return {
              sessionIdentifier: command.model.sessionIdentifier,
              lines: command.model.lines,
              sessionState: prev.sessionState,
              sessionStateReason: prev.sessionStateReason,
            };
          case 'overlay.unmount':
            if (prev.sessionIdentifier !== command.sessionIdentifier) return prev;
            return initialState;
          case 'overlay.update-settings':
            return prev;
          case 'session.state':
            // Issue #108: 別 session の state は無視 (active session のみ追従)。
            // active が null の場合は最初の state イベント自体で session を
            // 採用する (start レスポンスより先に届く可能性に備える)。
            if (
              prev.sessionIdentifier !== null &&
              prev.sessionIdentifier !== command.sessionIdentifier
            ) {
              return prev;
            }
            return {
              sessionIdentifier: command.sessionIdentifier,
              lines: prev.lines,
              sessionState: command.state,
              sessionStateReason: command.reason,
            };
        }
      });
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
