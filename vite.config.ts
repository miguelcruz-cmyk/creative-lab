import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { config as loadEnv } from 'dotenv'
import { metaCreativeApi } from './scripts/meta-creative-api/vitePlugin.js'

// Load ad-platform credentials from .env into process.env for the dev API middleware.
loadEnv()

export default defineConfig({
  plugins: [react(), tailwindcss(), metaCreativeApi()],
})
