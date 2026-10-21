import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function preserveBrowserOrigin(proxy) {
  proxy.on('proxyReq', (proxyReq, request) => {
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    if (host) proxyReq.setHeader('x-forwarded-host', host);
    proxyReq.setHeader('x-forwarded-proto', request.headers['x-forwarded-proto'] || 'http');
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://127.0.0.1:4173', changeOrigin: true, configure: preserveBrowserOrigin },
      '/socket.io': { target: 'http://127.0.0.1:4173', ws: true, changeOrigin: true, configure: preserveBrowserOrigin },
    },
  },
});
