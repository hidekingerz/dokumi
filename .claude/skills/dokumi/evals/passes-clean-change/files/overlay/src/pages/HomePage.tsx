import { formatPrice } from '../lib/format';
import { headingWithCount } from '../lib/heading';

type Item = { id: number; name: string; price: number };

const FEATURED: Item[] = [
  { id: 1, name: 'りんご', price: 120 },
  { id: 3, name: 'みかん', price: 80 },
];

type Props = { items?: Item[] };

export function HomePage({ items = FEATURED }: Props) {
  return (
    <>
      <h1>{headingWithCount('おすすめ', items.length)}</h1>
      {items.length === 0 ? (
        <p>おすすめはありません</p>
      ) : (
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
