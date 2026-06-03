import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'

export interface PreloadedVoiceMemo {
  payloadId: string
  audio: string
  mimeType?: string
  durationSec?: number
  caption?: string
}

interface VoiceMemoPlayerProps {
  audioId: string
  logbookId: string
  preloaded?: PreloadedVoiceMemo | null
  compact?: boolean
}

export default function VoiceMemoPlayer({
  audioId,
  logbookId,
  preloaded,
  compact = false
}: VoiceMemoPlayerProps) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(preloaded?.audio ?? null)
  const [error, setError] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const handleLoadedMetadata = () => {
      if (el.duration === Infinity || isNaN(el.duration) || el.duration === 0) {
        el.currentTime = 1e10
        const onTimeUpdate = () => {
          el.currentTime = 0
          el.removeEventListener('timeupdate', onTimeUpdate)
        }
        el.addEventListener('timeupdate', onTimeUpdate)
      }
    }

    if (el.readyState >= 1) {
      handleLoadedMetadata()
    } else {
      el.addEventListener('loadedmetadata', handleLoadedMetadata)
    }

    return () => {
      el.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [src])

  useEffect(() => {
    if (preloaded?.audio) {
      setSrc(preloaded.audio)
      setError(false)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const record = await db.voiceMemos.get(audioId)
        if (!record || cancelled) return
        const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
        if (!masterKey || cancelled) return
        const decrypted = await decryptJson(record.encryptedData, record.iv, record.tag, masterKey)
        if (!decrypted?.audio || cancelled) {
          setError(true)
          return
        }
        setSrc(String(decrypted.audio))
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [audioId, logbookId, preloaded?.audio])

  if (error || !src) {
    return (
      <span className="voice-memo-player-unavailable">
        {t('logs.live_voice_unavailable')}
      </span>
    )
  }

  const playerClass = compact
    ? 'voice-memo-player voice-memo-player--compact'
    : 'voice-memo-player'

  return (
    <div className="voice-memo-player-shell">
      <audio ref={audioRef} className={playerClass} controls preload="none" src={src} />
    </div>
  )
}
