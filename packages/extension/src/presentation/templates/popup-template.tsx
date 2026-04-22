import type { ReactNode } from 'react';

export type Props = Readonly<{
  formSlot: ReactNode;
  listSlot: ReactNode;
  version?: string;
}>;

/**
 * IMPL-550 PopupTemplate。
 *
 * Popup UI の最外レイアウト。CLAUDE.md §React ルール準拠:
 * - root className は `container` 固定
 * - 単一単語 className (`header` / `section` など)
 * - props は `props.xxx` で参照 (destructuring 禁止)
 *
 * form と active session list を 2 スロットとして受ける (caller 側が
 * organisms を差し込む)。将来設定パネルや footer を追加する際も本
 * template の責務は「配置のみ」で organisms を知らない。
 */
export function PopupTemplate(props: Props) {
  return (
    <div className="container">
      <header className="header">
        <h1 className="title">perapera</h1>
        {props.version !== undefined ? <span className="version">v{props.version}</span> : null}
      </header>
      <section className="section" aria-label="新しいセッションを開始">
        <h2 className="subtitle">新規開始</h2>
        {props.formSlot}
      </section>
      <section className="section" aria-label="稼働中のセッション">
        <h2 className="subtitle">稼働中</h2>
        {props.listSlot}
      </section>
    </div>
  );
}
