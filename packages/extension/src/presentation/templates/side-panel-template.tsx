import type { ReactNode } from 'react';

export type Props = Readonly<{
  listSlot: ReactNode;
  version?: string;
}>;

/**
 * IMPL-552 SidePanelTemplate。
 *
 * Side Panel (持続表示) の最外レイアウト。CLAUDE.md §React ルール準拠:
 * - root className は `container`
 * - 単一単語 className
 * - props は `props.xxx` アクセス
 *
 * Popup より縦長・幅広の表示を想定し、list セクションをスクロール可能にする。
 */
export function SidePanelTemplate(props: Props) {
  return (
    <div className="container">
      <header className="header">
        <h1 className="title">perapera セッション</h1>
        {props.version !== undefined ? <span className="version">v{props.version}</span> : null}
      </header>
      <section className="section" aria-label="稼働中のセッション詳細">
        {props.listSlot}
      </section>
    </div>
  );
}
