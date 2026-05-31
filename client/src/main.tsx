import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './themes.css'
import './index.css'
import './App.css'
import './i18n'
import App from './App.tsx'
import { applyAppearanceToDocument } from './services/appearance.ts'
import {
  installStaleAssetRecovery,
  markReloadAttempt,
  reconcileVersionOnStartup
} from './services/pwaStartup.ts'

/** Stale PWA precache on localhost can shadow Vite dev modules. */
async function clearDevServiceWorkerCaches(): Promise<void> {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((r) => r.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

function renderBootstrapError(message: string): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card glass" role="alert" style="max-width:420px">
        <h2 style="margin-top:0">Kapteins Daagbok</h2>
        <p style="color:var(--app-text-muted);line-height:1.5">${message}</p>
        <button type="button" class="btn primary" style="width:100%;margin-top:16px" onclick="location.reload()">
          Neu laden
        </button>
      </div>
    </div>`
}

async function bootstrap(): Promise<void> {
  applyAppearanceToDocument()
  installStaleAssetRecovery()
  await clearDevServiceWorkerCaches()

  const startupResult = await reconcileVersionOnStartup()
  if (startupResult === 'reload') {
    markReloadAttempt()
    window.location.reload()
    return
  }
  if (startupResult === 'recovered') {
    return
  }

  const rootEl = document.getElementById('root')
  if (!rootEl) {
    throw new Error('Missing #root element')
  }

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap().catch((err) => {
  console.error('App bootstrap failed:', err)
  renderBootstrapError(
    'Die App konnte nicht gestartet werden. Bitte neu laden oder die App vollständig beenden und erneut öffnen.',
  )
})
