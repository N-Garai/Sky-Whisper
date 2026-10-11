import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Build marker: Render exposes RENDER_GIT_COMMIT at build time, so the
// footer can show exactly which commit the running bundle came from —
// the fastest way to settle "is my browser on the old build?".
const buildSha =
  process.env.RENDER_GIT_COMMIT?.slice(0, 7) ??
  process.env.VITE_BUILD_SHA ??
  'local';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
});