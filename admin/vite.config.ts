import react from '@vitejs/plugin-react';
import { defineConfig, Plugin } from 'vite';

// prints which app this dev server is, so the combined `npm run dev` output is easy to read
const banner = (label: string, url: string): Plugin => ({
  name: 'banner',
  configureServer(s) {
    s.httpServer?.once('listening', () => setTimeout(() => console.log(`
  ➜  ${label}: ${url}
`), 100));
  },
});


// In production the API server serves this build under /admin/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react(), banner('ADMIN PANEL', 'http://localhost:5174/')],
  clearScreen: false,
  server: { port: 5174, proxy: { '/api': 'http://localhost:4000' } },
}));
