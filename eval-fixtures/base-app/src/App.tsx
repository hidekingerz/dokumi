import { useEffect, useState } from 'react';
import { ContactPage } from './pages/ContactPage';
import { HomePage } from './pages/HomePage';

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  return (
    <>
      <nav aria-label="メイン">
        <a href="#/">ホーム</a>
        <a href="#/contact">お問い合わせ</a>
      </nav>
      <main>{route === '/contact' ? <ContactPage /> : <HomePage />}</main>
    </>
  );
}
