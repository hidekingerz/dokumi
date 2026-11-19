import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';

type Props = { onSend?: (message: string) => void };

export function ContactPage({ onSend }: Props) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSend?.(message);
    setSent(true);
  }

  return (
    <>
      <h1>お問い合わせ</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="message">内容</label>
          <textarea id="message" value={message} onChange={(event) => setMessage(event.target.value)} />
        </div>
        <div className="row">
          <Button onClick={() => setMessage('')}>クリア</Button>
          <Button type="submit" variant="primary">
            送信
          </Button>
        </div>
      </form>
      {sent && <p role="status">送信しました</p>}
    </>
  );
}
