import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './themes.css'
import './index.css'
import App from './App.tsx'
import './i18n'
import { applyAppearanceToDocument } from './services/appearance.ts'

applyAppearanceToDocument()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
