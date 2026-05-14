import { defineConfig } from 'vite'

export default defineConfig({
  // Polyfill: plotly.js (e algumas de suas deps) usa `global` como no Node.js.
  // No browser isso não existe — substituímos por `globalThis`.
  define: {
    global: 'globalThis',
  },
  esbuild: {
    jsx: 'automatic',
  },
})
