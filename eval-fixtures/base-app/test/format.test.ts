import { describe, expect, test } from 'vitest';
import { formatPrice } from '../src/lib/format';

describe('formatPrice', () => {
  test('3 桁ごとに区切って円記号を付ける', () => {
    expect(formatPrice(1234567)).toBe('¥1,234,567');
  });
  test('小数は四捨五入する', () => {
    expect(formatPrice(99.5)).toBe('¥100');
    expect(formatPrice(99.4)).toBe('¥99');
  });
  test('0 は ¥0', () => {
    expect(formatPrice(0)).toBe('¥0');
  });
  test('負の数と数でない値は RangeError', () => {
    expect(() => formatPrice(-1)).toThrow(RangeError);
    expect(() => formatPrice(Number.NaN)).toThrow(RangeError);
  });
});
