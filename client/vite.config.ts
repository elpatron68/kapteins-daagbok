/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

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

function versionJsonPlugin(version: string): Plugin {
  return {
    name: 'version-json',
    writeBundle(options) {
      const outDir = options.dir ?? resolve(__dirname, 'dist')
      writeFileSync(
        resolve(outDir, 'version.json'),
        `${JSON.stringify({ version }, null, 2)}\n`
      )
    }
  }
}

function readPlausibleConfig(): { plausibleEnabled: boolean; plausibleHost: string } {
  const host = (process.env.PLAUSIBLE_HOST || 'https://plausible.elpatron.me').replace(/\/$/, '')
  const flag = (process.env.PLAUSIBLE_ENABLED ?? 'true').trim().toLowerCase()
  const plausibleEnabled = !['false', '0', 'no'].includes(flag)
  return { plausibleEnabled, plausibleHost: host }
}

function runtimeConfigPlugin(): Plugin {
  return {
    name: 'runtime-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/runtime-config.json') return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(`${JSON.stringify(readPlausibleConfig())}\n`)
      })
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolve(__dirname, 'dist')
      writeFileSync(
        resolve(outDir, 'runtime-config.json'),
        `${JSON.stringify(readPlausibleConfig(), null, 2)}\n`
      )
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  envDir: resolve(__dirname, '..'),
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
    // Passkeys require localhost or a real domain — not 127.0.0.1
    host: 'localhost',
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
    versionJsonPlugin(readAppVersion()),
    runtimeConfigPlugin(),
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
