import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { resolve } from 'path'

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        desktop: resolve(__dirname, 'desktop.html'),
      },
    },
  },
})
