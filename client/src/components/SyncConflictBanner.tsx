import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import {
  getSyncConflicts,
  subscribeSyncConflicts,
  type SyncConflict
} from '../services/syncConflicts.js'
import {
  resolveSyncConflictKeepLocal,
  resolveSyncConflictUseServer
} from '../services/sync.js'

interface SyncConflictBannerProps {
  logbookId: string | null
}

export default function SyncConflictBanner({ logbookId }: SyncConflictBannerProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<SyncConflict[]>([])

  useEffect(() => {
    const refresh = () => {
      setItems(logbookId ? getSyncConflicts(logbookId) : getSyncConflicts())
    }
    refresh()
    return subscribeSyncConflicts(refresh)
  }, [logbookId])

  if (items.length === 0) return null

  const first = items[0]

  return (
    <div className="sync-conflict-banner" role="alert">
      <AlertTriangle size={20} aria-hidden />
      <div className="sync-conflict-banner__body">
        <strong>{t('sync.conflict_title')}</strong>
        <p>
          {t('sync.conflict_message', {
            count: items.length,
            id: first.payloadId.slice(0, 8)
          })}
        </p>
        <div className="sync-conflict-banner__actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => void resolveSyncConflictUseServer(first)}
          >
            {t('sync.conflict_use_server')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void resolveSyncConflictKeepLocal(first)}
          >
            {t('sync.conflict_keep_local')}
          </button>
        </div>
      </div>
    </div>
  )
}
