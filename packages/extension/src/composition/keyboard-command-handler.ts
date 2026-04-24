/**
 * Issue #112: chrome.commands キーボードショートカット配線 helper。
 *
 * background service worker から呼ばれ、`chrome.commands.onCommand` listener を
 * 登録する。2 つの command を扱う:
 *
 * - `open-main-window`: MainWindowLifecycle.openOrFocus() を呼ぶ
 * - `stop-active-session`: 全活性 SourceSession を sessionCommandService 経由で停止
 *
 * DI を挟むことで unit test で chrome.commands / 依存 service を mock 可能にする。
 */

import { type SessionCommandService } from '../application/services/session-command-service';
import { type SourceSessionRepository } from '../domain/repositories/source-session-repository';
import { describeDomainError } from '../domain/shared/errors';
import { type MainWindowLifecycle } from './main-window-lifecycle';

export type ChromeCommandsApi = Readonly<{
  onCommand: {
    addListener: (listener: (command: string) => void) => void;
    removeListener?: (listener: (command: string) => void) => void;
  };
}>;

export const defaultChromeCommandsApi: ChromeCommandsApi = {
  onCommand: {
    addListener: (listener) => {
      chrome.commands.onCommand.addListener(listener);
    },
    removeListener: (listener) => {
      chrome.commands.onCommand.removeListener(listener);
    },
  },
};

export const OPEN_MAIN_WINDOW_COMMAND = 'open-main-window';
export const STOP_ACTIVE_SESSION_COMMAND = 'stop-active-session';

export type KeyboardCommandHandlerDependencies = Readonly<{
  commandsApi: ChromeCommandsApi;
  mainWindowLifecycle: Pick<MainWindowLifecycle, 'openOrFocus'>;
  sessionCommandService: Pick<SessionCommandService, 'stopSource'>;
  sourceSessionRepository: Pick<SourceSessionRepository, 'findActiveSessions'>;
  logWarn?: (message: string, cause?: unknown) => void;
  logInfo?: (message: string) => void;
}>;

const defaultLogWarn = (message: string, cause?: unknown): void => {
  if (cause === undefined) console.warn(message);
  else console.warn(message, cause);
};

const defaultLogInfo = (message: string): void => {
  console.log(message);
};

/**
 * chrome.commands.onCommand listener を登録する。idempotent ではないため
 * 1 度だけ呼ぶこと (SW 初期化時)。
 */
export const registerKeyboardCommandHandler = (deps: KeyboardCommandHandlerDependencies): void => {
  const logWarn = deps.logWarn ?? defaultLogWarn;
  const logInfo = deps.logInfo ?? defaultLogInfo;

  deps.commandsApi.onCommand.addListener((command) => {
    if (command === OPEN_MAIN_WINDOW_COMMAND) {
      logInfo('[perapera] keyboard: open-main-window');
      void deps.mainWindowLifecycle.openOrFocus().catch((cause: unknown) => {
        logWarn('[perapera] keyboard: open-main-window failed', cause);
      });
      return;
    }

    if (command === STOP_ACTIVE_SESSION_COMMAND) {
      logInfo('[perapera] keyboard: stop-active-session');
      void deps.sourceSessionRepository.findActiveSessions().match(
        (sessions) => {
          if (sessions.length === 0) {
            logInfo('[perapera] keyboard: stop-active-session — no active session');
            return;
          }
          for (const session of sessions) {
            void deps.sessionCommandService
              .stopSource({ sessionId: session.sessionIdentifier })
              .match(
                () => {
                  logInfo(`[perapera] keyboard: stopped session ${session.sessionIdentifier}`);
                },
                (error) => {
                  logWarn('[perapera] keyboard: stopSource failed', error);
                },
              );
          }
        },
        (error) => {
          logWarn(`[perapera] keyboard: findActiveSessions failed: ${describeDomainError(error)}`);
        },
      );
      return;
    }

    // 未知の command は silent ignore (Chrome が送る可能性がある内部 command 用)
  });
};
