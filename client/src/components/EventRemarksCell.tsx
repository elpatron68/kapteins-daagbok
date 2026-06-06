import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Loader2 } from 'lucide-react'
import type { LogEventPayload } from '../utils/logEntryPayload.js'
import { parseLiveVoiceRemark } from '../utils/liveEventCodes.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import VoiceMemoPlayer, { type PreloadedVoiceMemo } from './VoiceMemoPlayer.tsx'
import { useDialog } from './ModalDialog.tsx'
import { updateVoiceMemoTranscript } from '../services/voiceAttachments.js'

interface EventRemarksCellProps {
  event: LogEventPayload
  logbookId: string
  voiceMemoLookup?: Map<string, PreloadedVoiceMemo>
  readOnly?: boolean
}

export default function EventRemarksCell({
  event,
  logbookId,
  voiceMemoLookup,
  readOnly = false
}: EventRemarksCellProps) {
  const { t } = useTranslation()
  const { showAlert } = useDialog()
  const voiceId = parseLiveVoiceRemark(event.remarks.trim())
  const preloaded = voiceId ? voiceMemoLookup?.get(voiceId) : undefined

  const [transcribing, setTranscribing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleTranscribe = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (transcribing || !preloaded?.audio || !voiceId) return
    setTranscribing(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ audioDataUrl: preloaded.audio }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`)
      }
      const data = await res.json()
      const text = (data.text || '').trim()
      if (!text) {
        throw new Error('Transcription returned empty text')
      }
      await updateVoiceMemoTranscript(logbookId, voiceId, text)
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('[EventRemarksCell] Transcription failed:', err)
      void showAlert(t('logs.live_voice_transcribe_failed'), t('logs.live_voice_btn'))
    } finally {
      setTranscribing(false)
    }
  }

  let summary = formatEventSummary(event, t)
  if (voiceId && preloaded?.caption) {
    summary = t('logs.live_voice_entry', { caption: preloaded.caption })
  }

  return (
    <div className={`event-remarks-cell${voiceId ? ' event-remarks-cell--voice' : ''}`}>
      <span>{summary}</span>
      {voiceId && (
        <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          <VoiceMemoPlayer
            audioId={voiceId}
            logbookId={logbookId}
            preloaded={preloaded}
            compact
          />
          {!readOnly && preloaded && preloaded.transcribed === false && isOnline && (
            <button
              type="button"
              className="btn-icon-text link-sec"
              style={{
                fontSize: '0.8rem',
                padding: '2px 6px',
                height: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                margin: 0
              }}
              onClick={handleTranscribe}
              disabled={transcribing}
              title={t('logs.live_voice_transcribe_action')}
            >
              {transcribing ? (
                <Loader2 size={12} className="spin" />
              ) : (
                <Mic size={12} />
              )}
              {transcribing ? t('logs.live_voice_transcribing') : t('logs.live_voice_transcribe_action')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
