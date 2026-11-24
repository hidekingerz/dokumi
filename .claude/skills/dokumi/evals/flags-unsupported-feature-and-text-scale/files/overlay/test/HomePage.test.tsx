import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { HomePage } from '../src/pages/HomePage';

afterEach(cleanup);

test('100 円以上の商品にだけ送料無料バッジが付く', () => {
  render(<HomePage />);
  const items = screen.getAllByRole('listitem');
  expect(within(items[0]).queryByText('送料無料')).not.toBeNull();
  expect(within(items[1]).queryByText('送料無料')).toBeNull();
});

test('各商品に送料の説明がある', () => {
  render(<HomePage />);
  expect(screen.getAllByRole('button', { name: '送料について' })).toHaveLength(2);
  expect(screen.getAllByText('100 円以上の商品は送料無料です')).toHaveLength(2);
});
