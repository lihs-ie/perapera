import type { ReactNode } from 'react';
import { IconButton } from '../atoms/icon-button';
import { SettingsIcon } from '../atoms/icons/settings-icon';
import { PPMark } from '../atoms/pp-mark';

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
 * MainWindowTemplate (perapera-ui.jsx PPWindow 移植)。
 *
 * - `isActive === false`: 上部に macOS-like chrome (PPMark + title + 設定 button)、
 *   body に StartSessionForm を配置
 * - `isActive === true`: SessionToolbar が自身で gradient header を描画するため、
 *   template 側は包むだけ (chrome を出さない)。stream は scroll container を兼ねる
 */
export function MainWindowTemplate(props: Props) {
  const rootStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  } as const;
  if (props.isActive) {
    return (
      <div
        className="container"
        data-component="main-window-template"
        data-mode="active"
        style={rootStyle}
      >
        {props.toolbarSlot}
        {props.streamSlot}
      </div>
    );
  }
  return (
    <div
      className="container"
      data-component="main-window-template"
      data-mode="idle"
      style={rootStyle}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 16px',
          borderBottom: '1px solid var(--pp-border)',
          background: 'linear-gradient(180deg, rgba(26,33,46,0.7) 0%, rgba(19,25,36,0.95) 100%)',
          flexShrink: 0,
        }}
      >
        <PPMark size={18} />
        <h1
          style={{
            margin: 0,
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--pp-text-primary)',
            letterSpacing: '0.02em',
          }}
        >
          perapera
        </h1>
        {props.onOpenSettings !== undefined ? (
          <IconButton label="設定を開く" onClick={props.onOpenSettings}>
            <SettingsIcon size={14} />
          </IconButton>
        ) : null}
      </header>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {props.formSlot}
      </div>
    </div>
  );
}
