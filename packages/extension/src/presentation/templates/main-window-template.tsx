import type { ReactNode } from 'react';

export type Props = Readonly<{
  isActive: boolean;
  /** 未開始状態の body (StartSessionForm) */
  formSlot: ReactNode;
  /** アクティブ時の header (SessionToolbar) */
  toolbarSlot: ReactNode;
  /** アクティブ時の body (TranscriptPairStream) */
  streamSlot: ReactNode;
  /** idle header の `⚙` クリックで設定画面を開く (active 時は toolbar 側で担当) */
  onOpenSettings?: () => void;
}>;

/**
 * MainWindowTemplate。独立 floating window (480×720 想定) のレイアウト。
 *
 * - `isActive === false`: 未開始状態。上部は簡素な header、body に form を配置
 * - `isActive === true`: アクティブ状態。toolbar (displayName + state + 停止) と
 *   transcript stream を縦に積む
 *
 * CLAUDE.md §React ルール準拠:
 * - root className は `container`
 * - 単一単語 className
 * - props は `props.xxx` アクセス
 */
export function MainWindowTemplate(props: Props) {
  if (props.isActive) {
    // active 時は streamSlot 自身が scroll container (TranscriptPairStream
    // が `.body` を root として render する)。template 側でさらに body を
    // 包むと flex chain / overflow の二重化で高さが破綻するため直接配置する。
    return (
      <div className="container">
        {props.toolbarSlot}
        {props.streamSlot}
      </div>
    );
  }
  return (
    <div className="container">
      <header className="header">
        <h1 className="title">perapera</h1>
        {props.onOpenSettings !== undefined ? (
          <div className="actions">
            <button
              type="button"
              className="iconButton"
              aria-label="設定を開く"
              onClick={props.onOpenSettings}
            >
              ⚙
            </button>
          </div>
        ) : null}
      </header>
      <div className="body">{props.formSlot}</div>
    </div>
  );
}
