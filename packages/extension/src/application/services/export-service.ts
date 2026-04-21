import { type ResultAsync } from 'neverthrow';
import {
  type ExportSessionResultInput,
  type ExportSessionResultOutput,
} from '../dto/export-session-result-dto';
import { type ApplicationError } from '../errors/application-errors';
import { type ExportSessionResultUseCase } from '../use-cases/export-session-result-use-case';

/**
 * IMPL-344 ExportService (detailed-design §2.2)。
 *
 * `ExportSessionResultUseCase` を presentation 層 (SidePanelController) に
 * 公開する薄い facade。class diagram 上で独立した service として存在する
 * ため、直接 UseCase を注入するより名前付き service を間に挟むことで
 * 依存方向が明確になる。
 *
 * 用途:
 * - SidePanelController は `exportService.export(command)` を呼ぶだけで済む
 * - UseCase の実装詳細 (repository / assembly service) は隠蔽される
 *
 * 本 service 自身にロジックを持たせず、上位で UseCase を差し替える際の
 * 配線点 (seam) として機能する。
 */
export type ExportService = Readonly<{
  export: (
    input: ExportSessionResultInput,
  ) => ResultAsync<ExportSessionResultOutput, ApplicationError>;
}>;

export type ExportServiceDependencies = Readonly<{
  exportSessionResultUseCase: ExportSessionResultUseCase;
}>;

export const createExportService = (deps: ExportServiceDependencies): ExportService => ({
  export: (input) => deps.exportSessionResultUseCase(input),
});
