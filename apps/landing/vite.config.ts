import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The 3D stage (@meigi/scene/stage) and the chain client are loaded with
// dynamic imports, so the DOM hero paints first and three.js / viem arrive in
// their own chunks.
export default defineConfig({
  plugins: [react()],
  // @meigi/scene is a workspace package: make sure it shares one React,
  // three.js and R3F instance with the app.
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
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
