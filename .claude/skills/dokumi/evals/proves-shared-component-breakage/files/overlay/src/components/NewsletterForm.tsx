import { useState, type FormEvent } from 'react';
import { Button } from './Button';

type Props = { onSubscribe?: (email: string) => void };

export function NewsletterForm({ onSubscribe }: Props) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubscribe?.(email);
    setDone(true);
  }

  return (
    <section aria-labelledby="newsletter-heading">
      <h2 id="newsletter-heading">メールマガジン</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="newsletter-email">メールアドレス</label>
          <input
            id="newsletter-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button variant="primary">登録</Button>
      </form>
      {done && <p role="status">登録しました</p>}
    </section>
  );
}
