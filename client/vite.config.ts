/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readAppVersion(): string {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION.trim()
  }
  try {
    return readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim()
  } catch {
    return '0.1.0.0-dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts']
  },
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion())
  },
  optimizeDeps: {
    include: ['leaflet']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      devOptions: {
        enabled: false
      },
      includeAssets: ['favicon.ico', 'logo.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}']
      },
      manifest: {
        name: 'Kapteins Daagbok',
        short_name: 'Daagbok',
        lang: 'de',
        description:
          'Digitales Yacht-Logbuch — E2E-verschlüsselt, offline-fähig.',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
