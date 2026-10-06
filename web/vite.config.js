import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// the browser calls /api/*; Vite forwards it to the Express API (dev server and preview alike)
const proxy = { '/api': { target: 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
})
