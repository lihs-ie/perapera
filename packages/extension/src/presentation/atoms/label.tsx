import type { ReactNode } from 'react';

export type LabelVariant = 'form' | 'field';

export type Props = Readonly<{
  htmlFor?: string;
  children: ReactNode;
  variant?: LabelVariant;
}>;

/**
 * Label atom — フォームラベル or FieldLabel (uppercase) を切替。
 *
 * `variant='form'` (既定): 12.5px primary text。input/select の上に置く。
 * `variant='field'`: 9.5px uppercase letterSpacing 0.12em (perapera-scenes.jsx
 *   FieldLabel 相当)。スクリーン上部のセクション見出し用。
 */
export function Label(props: Props) {
  const variant = props.variant ?? 'form';
  const isField = variant === 'field';
  return (
    <label
      className="container"
      data-component="label"
      data-variant={variant}
      htmlFor={props.htmlFor}
      style={{
        display: 'block',
        marginBottom: isField ? 7 : 4,
        fontFamily: isField ? 'var(--pp-font-numeric)' : 'var(--pp-font-body)',
        fontSize: isField ? 9.5 : 12.5,
        fontWeight: 500,
        letterSpacing: isField ? '0.12em' : '0.01em',
        textTransform: isField ? 'uppercase' : 'none',
        color: isField ? 'var(--pp-text-dim)' : 'var(--pp-text-primary)',
      }}
    >
      {props.children}
    </label>
  );
}
