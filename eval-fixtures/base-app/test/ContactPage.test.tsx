import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ContactPage } from '../src/pages/ContactPage';

afterEach(cleanup);

test('送信ボタンで内容を送り、完了を表示する', async () => {
  const onSend = vi.fn();
  render(<ContactPage onSend={onSend} />);
  await userEvent.type(screen.getByLabelText('内容'), 'こんにちは');
  await userEvent.click(screen.getByRole('button', { name: '送信' }));
  expect(onSend).toHaveBeenCalledWith('こんにちは');
  expect(screen.getByRole('status').textContent).toBe('送信しました');
});
