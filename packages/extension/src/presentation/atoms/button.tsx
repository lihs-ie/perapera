import React from 'react';

export type Props = Readonly<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  ariaLabel?: string;
}>;

/**
 * IMPL-520 Button atom (CLAUDE.md §React ルール準拠)。
 *
 * - className は単一単語 `button`。variant は `data-variant` 属性で区別
 * - props は `props.xxx` アクセス (destructuring 禁止)
 * - ロジックなし、値を流し込むだけ
 */
export function Button(props: Props) {
  return (
    <button
      className="button"
      type={props.type ?? 'button'}
      data-variant={props.variant ?? 'primary'}
      disabled={props.disabled === true}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
