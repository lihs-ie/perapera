import React from 'react';

export type Props = Readonly<{
  htmlFor?: string;
  children: React.ReactNode;
}>;

/**
 * IMPL-524 Label atom。`<label>` wrapper。
 */
export function Label(props: Props) {
  return (
    <label className="label" htmlFor={props.htmlFor}>
      {props.children}
    </label>
  );
}
