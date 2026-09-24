import { defineConfig } from 'vite';

// The client lives in src/client; the game server (src/server) runs separately
// and serves the built client from dist/client in production.
export default defineConfig({
  root: 'src/client',
  publicDir: false,
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
