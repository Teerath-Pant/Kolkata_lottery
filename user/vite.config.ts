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


export default defineConfig({
  plugins: [react(), banner('USER APP (players)', 'http://localhost:5173/')],
  clearScreen: false,
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
