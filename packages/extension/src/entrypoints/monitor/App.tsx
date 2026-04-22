import { useOverlayListener } from './use-overlay-listener';

/**
 * IMPL-564 Monitor page App。
 *
 * 非タブ系ソース (マイク / デスクトップ音声) 向けの overlay 表示先。
 * `useOverlayListener` で chrome.runtime.onMessage を監視し、
 * Shadow DOM オーバーレイを自ページ上に描画する。
 *
 * 本ページ自体の UI は「説明ヘッダ」のみで、実際の字幕は Shadow DOM 内に
 * 独立描画される (`data-perapera-overlay` host)。
 */
export function App() {
  useOverlayListener();
  return (
    <div className="container">
      <header className="header">
        <h1 className="title">perapera Monitor</h1>
      </header>
      <section className="section">
        <p className="message">
          マイクやデスクトップ音声など、ブラウザタブ以外のソースを使用している場合、
          このページに字幕オーバーレイが表示されます。
        </p>
        <p className="message" data-variant="muted">
          セッション開始後、数秒で初期字幕が届きます。届かない場合は popup から
          セッションを再開してください。
        </p>
      </section>
    </div>
  );
}
