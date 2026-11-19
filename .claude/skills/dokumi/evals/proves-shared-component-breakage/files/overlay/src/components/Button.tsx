import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

// アプリ共通のボタン。フォームの中では Enter や クリックで送信できるよう、type の既定値は "submit"。
export function Button({ variant = 'secondary', type = 'submit', className, ...rest }: Props) {
  const classes = ['btn', variant === 'primary' ? 'btn--primary' : '', className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}
