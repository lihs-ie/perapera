type Props = Readonly<{
  message?: string;
}>;

const DEFAULT_MESSAGE = '音声を検出できません — 入力デバイス / タブ音量を確認してください。';

/**
 * ToolbarSilentBanner molecule (perapera-toolbar.jsx silent 表示 移植)。
 *
 * Toolbar 下部に subtle な「音声を検出できません」バナー。muted 色の dot +
 * テキストで、error バナーと同時には出さない (前者が優先)。
 */
export function ToolbarSilentBanner(props: Props) {
  return (
    <div
      className="container"
      data-component="toolbar-silent-banner"
      role="status"
      style={{
        padding: '7px 16px',
        background: 'rgba(125,138,156,0.06)',
        borderTop: '1px solid var(--pp-border)',
        fontSize: 11,
        color: 'var(--pp-text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--pp-text-muted)',
          opacity: 0.6,
        }}
      />
      {props.message ?? DEFAULT_MESSAGE}
    </div>
  );
}
