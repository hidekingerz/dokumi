import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

// アプリ共通のボタン。フォームの中に置いても勝手に送信しないよう、type の既定値は "button"。
export function Button({ variant = 'secondary', type = 'button', className, ...rest }: Props) {
  const classes = ['btn', variant === 'primary' ? 'btn--primary' : '', className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
