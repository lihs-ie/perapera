import { WarningTriangleIcon } from '../atoms/icons/warning-triangle-icon';

export type ToolbarBannerVariant = 'error' | 'warn';

type Props = Readonly<{
  variant: ToolbarBannerVariant;
  message: string;
  action?: Readonly<{ label: string; onClick: () => void }>;
}>;

/**
 * ToolbarErrorBanner molecule (perapera-toolbar.jsx Toolbar banner 移植)。
 *
 * Toolbar 下部に重ねて表示する `error` / `warn` バナー。warning triangle icon
 * + メッセージ + 任意のアクションボタン。borderTop は variant に応じた色。
 */
export function ToolbarErrorBanner(props: Props) {
  const isError = props.variant === 'error';
  return (
    <div
      role="alert"
      className="container"
      data-component="toolbar-error-banner"
      data-variant={props.variant}
      style={{
        padding: '8px 16px',
        background: isError ? 'var(--pp-err-soft)' : 'var(--pp-warn-soft)',
        borderTop: `1px solid ${isError ? 'rgba(248,113,113,0.25)' : 'rgba(245,158,11,0.25)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        fontSize: 11.5,
        color: isError ? 'var(--pp-err)' : 'var(--pp-warn)',
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      <WarningTriangleIcon size={13} />
      <span style={{ flex: 1 }}>{props.message}</span>
      {props.action !== undefined ? (
        <button
          type="button"
          onClick={props.action.onClick}
          style={{
            padding: '3px 9px',
            background: 'transparent',
            border: '1px solid currentColor',
            color: 'currentColor',
            borderRadius: 4,
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--pp-font-body)',
            letterSpacing: '0.03em',
          }}
        >
          {props.action.label}
        </button>
      ) : null}
    </div>
  );
}
