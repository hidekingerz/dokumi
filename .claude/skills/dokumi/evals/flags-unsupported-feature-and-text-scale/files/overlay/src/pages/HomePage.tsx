import { ShippingInfo } from '../components/ShippingInfo';
import { formatPrice } from '../lib/format';

const FEATURED = [
  { id: 1, name: 'りんご', price: 120 },
  { id: 3, name: 'みかん', price: 80 },
];

const FREE_SHIPPING_FROM = 100;

export function HomePage() {
  return (
    <>
      <h1>おすすめ</h1>
      <ul>
        {FEATURED.map((item) => (
          <li key={item.id}>
            {item.name} {formatPrice(item.price)}
            {item.price >= FREE_SHIPPING_FROM && <span className="badge">送料無料</span>}
            <ShippingInfo />
          </li>
        ))}
      </ul>
    </>
  );
}
