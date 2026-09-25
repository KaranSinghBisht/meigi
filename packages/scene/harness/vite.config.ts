import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Dev-only preview of the package: `pnpm --filter @meigi/scene harness`.
// JSX runs through Vite's built-in automatic runtime; no React plugin needed.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
  server: { port: 5190 },
  preview: { port: 5191 },
  build: { outDir: 'dist', emptyOutDir: true },
})
