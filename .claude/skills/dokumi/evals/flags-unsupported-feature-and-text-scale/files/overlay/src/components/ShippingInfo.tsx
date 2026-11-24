import { useId } from 'react';

export function ShippingInfo() {
  const id = useId();
  // interestfor は React の型にまだないので、属性として渡す
  const interest = { interestfor: id } as Record<string, string>;
  return (
    <>
      <button type="button" className="info" aria-label="送料について" {...interest}>
        i
      </button>
      <div id={id} popover="hint" className="tooltip">
        100 円以上の商品は送料無料です
      </div>
    </>
  );
}
