import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { NewsletterForm } from '../src/components/NewsletterForm';

afterEach(cleanup);

test('登録ボタンで登録し、完了を表示する', async () => {
  const onSubscribe = vi.fn();
  render(<NewsletterForm onSubscribe={onSubscribe} />);
  await userEvent.type(screen.getByLabelText('メールアドレス'), 'a@example.com');
  await userEvent.click(screen.getByRole('button', { name: '登録' }));
  expect(onSubscribe).toHaveBeenCalledTimes(1);
  expect(onSubscribe).toHaveBeenCalledWith('a@example.com');
  expect(screen.getByRole('status').textContent).toBe('登録しました');
});

test('入力欄で Enter を押しても登録できる', async () => {
  const onSubscribe = vi.fn();
  render(<NewsletterForm onSubscribe={onSubscribe} />);
  await userEvent.type(screen.getByLabelText('メールアドレス'), 'b@example.com{Enter}');
  expect(onSubscribe).toHaveBeenCalledTimes(1);
  expect(onSubscribe).toHaveBeenCalledWith('b@example.com');
});

test('登録前は完了を表示しない', () => {
  render(<NewsletterForm />);
  expect(screen.queryByRole('status')).toBeNull();
});
