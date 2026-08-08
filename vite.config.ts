/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config (Electron client):
//  - base './' so the build output can be loaded via the file:// protocol (Electron loadFile)
//  - database reads are served by the Electron main process over IPC (no HTTP proxy)
//
// The `test` block is only used by Vitest. It reuses the React plugin so JSX
// transforms correctly, and uses the jsdom environment so tests that touch
// browser globals (localStorage, navigator) can run.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    globals: true,
  },
});
