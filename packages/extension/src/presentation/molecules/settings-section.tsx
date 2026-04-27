import type { ReactNode } from 'react';
import { useState } from 'react';

type Props = Readonly<{
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}>;

/**
 * SettingsSection molecule (perapera-scenes.jsx SettingsScene Section 移植)。
 *
 * uppercase numeric font の title + 1px hairline + collapsible flag。
 * 子要素は flex column で gap 10px。collapsible 時はクリックで開閉。
 */
export function SettingsSection(props: Props) {
  const [open, setOpen] = useState(props.defaultOpen !== false);
  const collapsible = props.collapsible === true;
  const expanded = !collapsible || open;
  return (
    <section
      className="container"
      data-component="settings-section"
      data-open={expanded ? 'true' : 'false'}
      style={{ marginBottom: 22 }}
    >
      <header
        onClick={() => {
          if (collapsible) setOpen((prev) => !prev);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          fontFamily: 'var(--pp-font-numeric)',
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--pp-text-dim)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span>{props.title}</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--pp-border)' }} />
        {collapsible ? (
          <span aria-label={expanded ? '折りたたむ' : '展開する'}>{expanded ? '−' : '+'}</span>
        ) : null}
      </header>
      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{props.children}</div>
      ) : null}
    </section>
  );
}
