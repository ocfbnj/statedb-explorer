import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置（Electron 客户端）：
//  - base './' 使打包产物可用 file:// 协议加载（Electron loadFile）
//  - 数据库读取由 Electron 主进程通过 IPC 提供，无需 HTTP proxy
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
});
