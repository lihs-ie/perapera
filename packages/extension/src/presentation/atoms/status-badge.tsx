import React from 'react';

/**
 * セッション状態を色コード化して表示するための variant 集合。
 * 対応しない state は 'neutral' として処理される。
 */
export const STATUS_BADGE_VARIANTS = [
  'active',
  'pending',
  'degraded',
  'error',
  'stopped',
  'neutral',
] as const;
export type StatusBadgeVariant = (typeof STATUS_BADGE_VARIANTS)[number];

const STATE_TO_VARIANT: Readonly<Record<string, StatusBadgeVariant>> = {
  idle: 'neutral',
  requesting_permission: 'pending',
  connecting: 'pending',
  capturing: 'active',
  transcribing: 'active',
  translating: 'active',
  paused: 'neutral',
  reconnecting: 'pending',
  degraded: 'degraded',
  error: 'error',
  stopped: 'stopped',
};

export type Props = Readonly<{
  state: string;
  children?: React.ReactNode;
}>;

/**
 * IMPL-525 StatusBadge atom。
 *
 * SessionState (stringified) を受け取って pill 表示する。
 * `data-variant` でスタイル分岐 (active / pending / degraded / error /
 * stopped / neutral)。className は `badge` 単一単語。
 */
export function StatusBadge(props: Props) {
  const variant: StatusBadgeVariant = STATE_TO_VARIANT[props.state] ?? 'neutral';
  return (
    <span className="badge" data-variant={variant} role="status">
      {props.children ?? props.state}
    </span>
  );
}
