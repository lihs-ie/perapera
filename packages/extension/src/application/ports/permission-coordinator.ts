import { type ResultAsync } from 'neverthrow';
import { type SourceType } from '../../domain/session/source-type';
import { type DomainError } from '../../domain/shared/errors';

/**
 * 権限要求の結果 (DD-001)。
 *
 * 拒否 (`denied`) は**ビジネス的に有効な結果**であり DomainError で Err
 * として返さない。DomainError を返すのは chrome.permissions API 自体が
 * 動作不能な system-level エラーのみ。
 */
export type PermissionGrant =
  | Readonly<{ status: 'granted'; sourceType: SourceType }>
  | Readonly<{ status: 'denied'; sourceType: SourceType; reason?: string }>;

/**
 * 権限調整ポート (DD-001)。
 *
 * SourceType に応じた Chrome 拡張権限要求 (activeTab / microphone /
 * desktopCapture) を抽象化する。詳細設計書 §3.1 DD-001 の音声ソース開始
 * シーケンスで呼ばれる。
 */
export type PermissionCoordinator = Readonly<{
  requestFor: (sourceType: SourceType) => ResultAsync<PermissionGrant, DomainError>;
}>;
