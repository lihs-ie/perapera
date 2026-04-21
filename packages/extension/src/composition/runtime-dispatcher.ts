import { type ResultAsync } from 'neverthrow';
import {
  type ApplicationError,
  toApplicationError,
} from '../application/errors/application-errors';
import { type ExportService } from '../application/services/export-service';
import { type SessionCommandService } from '../application/services/session-command-service';
import { type GetSessionMonitorStateQuery } from '../application/use-cases/get-session-monitor-state-query';
import { parseBackgroundRequest, type BackgroundResponse } from './runtime-messages';

/**
 * IMPL-502 Runtime message dispatcher。
 *
 * chrome.runtime.onMessage に登録する handler。`BackgroundRequest` を
 * discriminated union で分岐し、対応する application facade に dispatch する。
 *
 * **本番実装で mock / in-memory を使わない設計**:
 * - `SessionCommandService` / `ExportService` / `GetSessionMonitorStateQuery`
 *   は **必須 DI** (default なし)
 * - production entrypoint (`background.ts`) で `createExtensionApp` が返した
 *   全 facade を明示的に渡す
 */
export type RuntimeDispatcherDependencies = Readonly<{
  sessionCommandService: SessionCommandService;
  exportService: ExportService;
  getSessionMonitorStateQuery: GetSessionMonitorStateQuery;
}>;

/**
 * Response は chrome.runtime.sendMessage のペイロードとして JSON serialize
 * されるため、dispatcher 側は UseCase output DTO をそのまま包んで返す。
 * UI 側 (popup / sidepanel) は request.type ごとに value の shape を
 * type-narrow する (presentation 層で改めて schema 検証)。
 */
export type RuntimeDispatcher = (raw: unknown) => Promise<BackgroundResponse<unknown>>;

const toOk = (value: unknown): BackgroundResponse<unknown> => ({ ok: true, value });
const toErr = (error: ApplicationError): BackgroundResponse<unknown> => ({ ok: false, error });

const run = async (promise: ResultAsync<unknown, ApplicationError>) => {
  const result = await promise;
  return result.match(toOk, toErr);
};

/**
 * `createRuntimeDispatcher(deps)(rawMessage)` 形式で呼び出す。
 * return 値は単一 `BackgroundResponse<unknown>`。chrome.runtime.onMessage の
 * sendResponse にそのまま渡せる。
 */
export const createRuntimeDispatcher = (deps: RuntimeDispatcherDependencies): RuntimeDispatcher => {
  return async (raw) => {
    const parseResult = parseBackgroundRequest(raw).mapErr(toApplicationError);
    if (parseResult.isErr()) {
      return toErr(parseResult.error);
    }
    const request = parseResult.value;
    switch (request.type) {
      case 'command.start-source-session':
        return run(deps.sessionCommandService.startSource(request.input));
      case 'command.stop-source-session':
        return run(deps.sessionCommandService.stopSource(request.input));
      case 'command.update-source-settings':
        return run(deps.sessionCommandService.applySourceSettings(request.input));
      case 'command.export-session-result':
        return run(deps.exportService.export(request.input));
      case 'query.get-session-monitor-state':
        return run(deps.getSessionMonitorStateQuery(request.input));
    }
  };
};
