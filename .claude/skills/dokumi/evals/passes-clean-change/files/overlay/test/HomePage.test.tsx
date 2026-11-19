import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { HomePage } from '../src/pages/HomePage';

afterEach(cleanup);

test('既定のおすすめを件数つきの見出しと一覧で表示する', () => {
  render(<HomePage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('おすすめ（2件）');
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['りんご ¥120', 'みかん ¥80']);
  expect(screen.queryByText('おすすめはありません')).toBeNull();
});

test('渡した商品を表示する', () => {
  render(<HomePage items={[{ id: 9, name: 'ぶどう', price: 1500 }]} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('おすすめ（1件）');
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ぶどう ¥1,500']);
});

test('0 件のときは見出しだけにして、一覧の代わりにメッセージを表示する', () => {
  render(<HomePage items={[]} />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('おすすめ');
  expect(screen.getByText('おすすめはありません')).toBeTruthy();
  expect(screen.queryByRole('list')).toBeNull();
});
