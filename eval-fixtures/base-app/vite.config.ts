import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// 開発用のモック API。GET /api/items?q=<語> で mock/items.json を絞り込んで返す。
// q=__error__ のときは 500 を返す（エラー表示の確認用）。
function mockApi(): Plugin {
  return {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use('/api/items', (req, res) => {
        const q = new URL(req.url ?? '', 'http://localhost').searchParams.get('q') ?? '';
        if (q === '__error__') {
          res.statusCode = 500;
          res.end('{"message":"boom"}');
          return;
        }
        const items: { id: number; name: string; price: number }[] = JSON.parse(
          readFileSync(new URL('./mock/items.json', import.meta.url), 'utf8'),
        );
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(items.filter((item) => item.name.includes(q))));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mockApi()],
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
