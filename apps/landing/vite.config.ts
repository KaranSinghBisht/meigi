import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The 3D stage and the chain client are loaded with dynamic imports, so the
// DOM hero paints first and three.js / viem arrive in their own chunks.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
