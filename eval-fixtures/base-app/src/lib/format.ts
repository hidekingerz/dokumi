export function formatPrice(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('amount must be a non-negative number');
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}
