import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { decryptJson } from '../services/crypto.js'
import VesselForm from './VesselForm.tsx'
import CrewForm from './CrewForm.tsx'
import LogEntriesList from './LogEntriesList.tsx'
import { Ship, Users, FileText, Lock, AlertCircle, Globe } from 'lucide-react'

interface ReadOnlyViewerProps {
  token: string
  hexKey: string
}

// Convert Hex String back to ArrayBuffer
const hexToBuffer = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes.buffer
}

export default function ReadOnlyViewer({ token, hexKey }: ReadOnlyViewerProps) {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<'vessel' | 'crew' | 'logs'>('logs')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Logbook data states
  const [logbookTitle, setLogbookTitle] = useState('Logbook')
  const [yacht, setYacht] = useState<any>(null)
  const [crews, setCrews] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [gpsTracks, setGpsTracks] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [token, hexKey])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const keyBuffer = hexToBuffer(hexKey)

      const res = await fetch(`/api/collaboration/share-pull?token=${token}`)
      if (!res.ok) {
        if (res.status === 410) {
          throw new Error(i18n.language.startsWith('de') ? 'Dieser Freigabelink ist abgelaufen.' : 'This share link has expired.')
        }
        throw new Error(i18n.language.startsWith('de') ? 'Fehler beim Laden des freigegebenen Logbuchs.' : 'Failed to fetch shared logbook data.')
      }

      const data = await res.json()

      // Decrypt Title
      let decryptedTitle = 'Shared Logbook'
      if (data.title) {
        const parsed = JSON.parse(data.title)
        decryptedTitle = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, keyBuffer)
      }
      setLogbookTitle(decryptedTitle)

      // Decrypt Yacht
      let decYacht = null
      if (data.yacht) {
        decYacht = await decryptJson(data.yacht.encryptedData, data.yacht.iv, data.yacht.tag, keyBuffer)
      }
      setYacht(decYacht)

      // Decrypt Crews
      const decCrews = []
      if (data.crews) {
        for (const c of data.crews) {
          const dec = await decryptJson(c.encryptedData, c.iv, c.tag, keyBuffer)
          decCrews.push({
            payloadId: c.payloadId,
            data: dec
          })
        }
      }
      setCrews(decCrews)

      // Decrypt Entries
      const decEntries = []
      if (data.entries) {
        for (const e of data.entries) {
          const dec = await decryptJson(e.encryptedData, e.iv, e.tag, keyBuffer)
          decEntries.push({
            payloadId: e.payloadId,
            ...dec
          })
        }
      }
      setEntries(decEntries)

      // Decrypt Photos
      const decPhotos = []
      if (data.photos) {
        for (const p of data.photos) {
          const dec = await decryptJson(p.encryptedData, p.iv, p.tag, keyBuffer)
          decPhotos.push({
            payloadId: p.payloadId,
            entryId: p.entryId,
            image: dec.image,
            caption: dec.caption || '',
            updatedAt: p.updatedAt
          })
        }
      }
      setPhotos(decPhotos)

      // Decrypt GPS Tracks
      const decGpsTracks = []
      if (data.gpsTracks) {
        for (const tr of data.gpsTracks) {
          const dec = await decryptJson(tr.encryptedData, tr.iv, tr.tag, keyBuffer)
          decGpsTracks.push({
            entryId: tr.entryId,
            waypoints: dec.waypoints || dec || [],
            filename: dec.filename || 'track.gpx'
          })
        }
      }
      setGpsTracks(decGpsTracks)

    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to decrypt logbook details.')
    } finally {
      setLoading(false)
    }
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(nextLang)
  }

  if (loading) {
    return (
      <div className="tab-placeholder" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <Ship className="header-logo spin" size={48} />
        <p>{i18n.language.startsWith('de') ? 'Lade freigegebenes Logbuch...' : 'Loading shared logbook...'}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
        <h2 style={{ color: '#f1f5f9', marginBottom: '8px' }}>{i18n.language.startsWith('de') ? 'Verbindungsfehler' : 'Access Error'}</h2>
        <p style={{ color: '#94a3b8', maxWidth: '400px', marginBottom: '24px' }}>{error}</p>
        <button className="btn primary" onClick={loadData} style={{ width: 'auto' }}>
          {i18n.language.startsWith('de') ? 'Erneut versuchen' : 'Retry'}
        </button>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Top Banner indicating read-only shared view */}
      <div className="sync-progress-bar" style={{ height: '4px', background: 'linear-gradient(90deg, #10b981, #3b82f6)' }} />
      
      <header className="app-header" style={{ borderBottom: '1px solid rgba(16, 185, 129, 0.2)' }}>
        <div className="app-header-left">
          <div className="app-title-area" style={{ marginLeft: 0 }}>
            <h2>{logbookTitle}</h2>
            <p className="app-subtitle" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={12} />
              <span>{i18n.language.startsWith('de') ? 'Schreibgeschützte Ansicht (Ende-zu-Ende verschlüsselt)' : 'Read-Only View (End-to-End Encrypted)'}</span>
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn secondary" onClick={toggleLanguage} style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}>
            <Globe size={14} style={{ marginRight: '4px' }} />
            {i18n.language.startsWith('de') ? 'English' : 'Deutsch'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <button
            className={`sidebar-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <FileText size={18} />
            {t('nav.logs')}
          </button>
          
          <button
            className={`sidebar-btn ${activeTab === 'vessel' ? 'active' : ''}`}
            onClick={() => setActiveTab('vessel')}
          >
            <Ship size={18} />
            {t('nav.vessel')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'crew' ? 'active' : ''}`}
            onClick={() => setActiveTab('crew')}
          >
            <Users size={18} />
            {t('nav.crew')}
          </button>
        </aside>

        <main className="app-content">
          {activeTab === 'logs' && (
            <LogEntriesList
              logbookId="shared"
              readOnly={true}
              preloadedYacht={yacht}
              preloadedEntries={entries}
              preloadedPhotos={photos}
              preloadedGpsTracks={gpsTracks}
            />
          )}

          {activeTab === 'vessel' && (
            <VesselForm
              logbookId="shared"
              readOnly={true}
              preloadedData={yacht}
            />
          )}

          {activeTab === 'crew' && (
            <CrewForm
              logbookId="shared"
              readOnly={true}
              preloadedData={crews}
            />
          )}
        </main>
      </div>
    </div>
  )
}
