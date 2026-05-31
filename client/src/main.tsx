import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './themes.css'
import './index.css'
import { applyAppearanceToDocument } from './services/appearance.ts'

/** Stale PWA precache on localhost can shadow Vite dev modules and old locale bundles. */
async function clearDevServiceWorkerCaches(): Promise<void> {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((r) => r.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

async function bootstrap(): Promise<void> {
  await clearDevServiceWorkerCaches()
  await import('./i18n')
  const { default: App } = await import('./App.tsx')
  applyAppearanceToDocument()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
