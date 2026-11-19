import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { SearchPage } from '../src/pages/SearchPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

test('要件1: 空のとき検索ボタンは押せない', () => {
  render(<SearchPage />);
  expect((screen.getByRole('button', { name: '検索' }) as HTMLButtonElement).disabled).toBe(true);
});

test('要件2: 検索結果を一覧表示する', async () => {
  stubFetch([{ id: 1, name: 'りんご', price: 120 }]);
  render(<SearchPage />);
  await userEvent.type(screen.getByLabelText('キーワード'), 'りんご');
  await userEvent.click(screen.getByRole('button', { name: '検索' }));
  expect(await screen.findByRole('list')).toBeTruthy();
});

test('要件3: 0 件のときメッセージを表示する', async () => {
  stubFetch([]);
  render(<SearchPage />);
  await userEvent.type(screen.getByLabelText('キーワード'), 'ぶどう');
  await userEvent.click(screen.getByRole('button', { name: '検索' }));
  expect(await screen.findByText('該当する商品がありません')).toBeTruthy();
});

test.skip('要件4: 取得に失敗したらエラーを表示する', async () => {
  stubFetch({ message: 'boom' }, false);
  render(<SearchPage />);
  await userEvent.type(screen.getByLabelText('キーワード'), 'りんご');
  await userEvent.click(screen.getByRole('button', { name: '検索' }));
  expect(await screen.findByText('検索に失敗しました')).toBeTruthy();
});
