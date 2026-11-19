import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { formatPrice } from '../lib/format';
import { normalizeQuery } from '../lib/query';

type Item = { id: number; name: string; price: number };

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`/api/items?q=${encodeURIComponent(normalizeQuery(query))}`);
      if (response.ok) {
        const data: any = await response.json();
        setItems(data);
      }
    } catch (error) {}
    setLoading(false);
  }

  return (
    <>
      <h1>商品検索</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="query">キーワード</label>
          <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button type="submit" variant="primary" disabled={query === ''}>
          検索
        </Button>
      </form>
      {loading && <p>検索中…</p>}
      {items !== null && items.length === 0 && <p>該当する商品がありません</p>}
      {items !== null && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.name} {formatPrice(item.price)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
