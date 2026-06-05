import type { ReactNode } from 'react';

type Props = Readonly<{
  label: string;
  hint?: string;
  children: ReactNode;
}>;

/**
 * SettingsRow molecule (perapera-scenes.jsx SettingsScene Row 移植)。
 *
 * 140px 固定 + 1fr の 2 列 grid。左にラベル (12px primary) + 任意の hint
 * (10.5px dim)、右に control。
 */
export function SettingsRow(props: Props) {
  return (
    <div
      className="container"
      data-component="settings-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div>
        <div
          data-part="label"
          style={{ fontSize: 12, color: 'var(--pp-text-primary)', fontWeight: 500 }}
        >
          {props.label}
        </div>
        {props.hint !== undefined && props.hint !== '' ? (
          <div
            data-part="hint"
            style={{
              fontSize: 10.5,
              color: 'var(--pp-text-dim)',
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {props.hint}
          </div>
        ) : null}
      </div>
      <div data-part="control">{props.children}</div>
    </div>
  );
}
