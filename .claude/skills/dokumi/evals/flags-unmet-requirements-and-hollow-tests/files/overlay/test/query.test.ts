import { expect, test } from 'vitest';
import { normalizeQuery } from '../src/lib/query';

test('normalizeQuery', () => {
  expect(normalizeQuery('  りんご  ')).toBeTruthy();
});
