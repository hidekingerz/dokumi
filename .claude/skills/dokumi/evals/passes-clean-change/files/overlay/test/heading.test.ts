import { describe, expect, test } from 'vitest';
import { headingWithCount } from '../src/lib/heading';

describe('headingWithCount', () => {
  test('1 件以上なら件数を付ける', () => {
    expect(headingWithCount('おすすめ', 1)).toBe('おすすめ（1件）');
    expect(headingWithCount('おすすめ', 2)).toBe('おすすめ（2件）');
  });
  test('0 件なら見出しだけ', () => {
    expect(headingWithCount('おすすめ', 0)).toBe('おすすめ');
  });
});
