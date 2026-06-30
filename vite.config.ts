import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import type { Plugin } from 'postcss'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5045
  },
  css: {
    postcss: {
      plugins: [tailwindcss() as unknown as Plugin],
    },
  },
})
