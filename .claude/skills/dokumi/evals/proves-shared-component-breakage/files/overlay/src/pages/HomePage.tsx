import { NewsletterForm } from '../components/NewsletterForm';
import { formatPrice } from '../lib/format';

const FEATURED = [
  { id: 1, name: 'りんご', price: 120 },
  { id: 3, name: 'みかん', price: 80 },
];

export function HomePage() {
  return (
    <>
      <h1>おすすめ</h1>
      <ul>
        {FEATURED.map((item) => (
          <li key={item.id}>
            {item.name} {formatPrice(item.price)}
          </li>
        ))}
      </ul>
      <NewsletterForm />
    </>
  );
}
