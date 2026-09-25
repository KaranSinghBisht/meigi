import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports match the services' default APP_ORIGINS (verifier, agent, x402 demo), so CORS works locally.
// idkit-core loads its WASM with `new URL(..., import.meta.url)`; pre-bundling would break that path in dev.
export default defineConfig({
  plugins: [react()],
  // One React and one three/R3F instance, even if a workspace package ever resolves its own copy.
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
  server: { port: 5173 },
  preview: { port: 4173 },
  optimizeDeps: { exclude: ['@worldcoin/idkit-core'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
})
