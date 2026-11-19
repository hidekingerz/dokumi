export function headingWithCount(label: string, count: number): string {
  return count > 0 ? `${label}（${count}件）` : label;
}
