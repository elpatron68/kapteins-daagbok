import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cycleAppLanguage, getNextLanguage } from '../utils/i18nLanguages.js'
import VesselForm from './VesselForm.tsx'
import CrewForm from './CrewForm.tsx'
import LogEntriesList from './LogEntriesList.tsx'
import { Ship, Users, FileText, Lock, Globe, ChevronLeft, UserPlus } from 'lucide-react'
import { buildPublicDemoFixture, type PublicDemoFixture } from '../services/demoLogbookData.js'
import { useAppTour, type AppTab } from '../context/AppTourContext.tsx'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

interface DemoViewerProps {
  onExit: () => void
}

export default function DemoViewer({ onExit }: DemoViewerProps) {
  const { t, i18n } = useTranslation()
  const { registerNavigation, registerDemoTourContext, startTour } = useAppTour()
  const [activeTab, setActiveTab] = useState<AppTab>('logs')
  const [tourSelectedEntryId, setTourSelectedEntryId] = useState<string | null>(null)
  const [fixture, setFixture] = useState<PublicDemoFixture>(() => buildPublicDemoFixture())

  useEffect(() => {
    trackPlausibleEvent(PlausibleEvents.DEMO_OPENED)
  }, [])

  useEffect(() => {
    setFixture(buildPublicDemoFixture())
  }, [i18n.language])

  useEffect(() => {
    registerNavigation({
      setActiveTab,
      setSelectedEntryId: setTourSelectedEntryId,
      setFeedbackOpen: () => {},
      setLogbookActive: () => {},
      setProfileOpen: () => {}
    })
    registerDemoTourContext({ firstEntryId: fixture.firstEntryId })

    const timer = window.setTimeout(() => {
      startTour({ force: true, demoMode: true })
    }, 400)

    return () => {
      window.clearTimeout(timer)
      registerDemoTourContext(null)
    }
  }, [registerNavigation, registerDemoTourContext, startTour, fixture.firstEntryId])

  const toggleLanguage = () => {
    cycleAppLanguage(i18n)
  }

  const { title, yacht, crews, entries, gpsTracks, photos, firstEntryId } = fixture

  return (
    <div className="app-layout">
      <div className="sync-progress-bar" style={{ height: '4px', background: 'linear-gradient(90deg, #f59e0b, #3b82f6)' }} />

      <header className="app-header" style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.25)' }}>
        <div className="app-header-left">
          <button className="btn-back" onClick={onExit}>
            <ChevronLeft size={16} />
            {t('demo.back_to_login')}
          </button>
          <div className="app-title-area">
            <div className="app-title-row">
              <h2>{title}</h2>
              <span className="demo-badge">{t('demo.badge')}</span>
            </div>
            <p className="app-subtitle" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={12} />
              <span>{t('demo.public_banner')}</span>
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="btn primary"
            onClick={onExit}
            style={{ width: 'auto', padding: '6px 14px', fontSize: '13px' }}
          >
            <UserPlus size={14} style={{ marginRight: '4px' }} />
            {t('demo.cta_register')}
          </button>
          <button className="btn secondary" onClick={toggleLanguage} style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}>
            <Globe size={14} style={{ marginRight: '4px' }} />
            {t(`languages.${getNextLanguage(i18n.language)}`)}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <button
            className={`sidebar-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
            data-tour="nav-logs"
          >
            <FileText size={18} />
            {t('nav.logs')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'vessel' ? 'active' : ''}`}
            onClick={() => setActiveTab('vessel')}
            data-tour="nav-vessel"
          >
            <Ship size={18} />
            {t('nav.vessel')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'crew' ? 'active' : ''}`}
            onClick={() => setActiveTab('crew')}
            data-tour="nav-crew"
          >
            <Users size={18} />
            {t('nav.crew')}
          </button>
        </aside>

        <main className="app-content">
          {activeTab === 'logs' && (
            <LogEntriesList
              logbookId="demo"
              readOnly={true}
              preloadedYacht={yacht}
              preloadedEntries={entries}
              preloadedPhotos={photos}
              preloadedGpsTracks={gpsTracks}
              controlledSelectedEntryId={tourSelectedEntryId}
              onSelectedEntryIdChange={setTourSelectedEntryId}
              highlightEntryId={firstEntryId}
            />
          )}

          {activeTab === 'vessel' && (
            <VesselForm logbookId="demo" readOnly={true} preloadedData={yacht} />
          )}

          {activeTab === 'crew' && (
            <CrewForm logbookId="demo" readOnly={true} preloadedData={crews} />
          )}
        </main>
      </div>
    </div>
  )
}
