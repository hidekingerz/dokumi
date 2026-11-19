export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}
