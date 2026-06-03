import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Square, X } from 'lucide-react'
import {
  assertVoiceMemoBlobSize,
  formatVoiceDuration,
  pickMediaRecorderMimeType,
  VOICE_MEMO_MAX_DURATION_SEC
} from '../utils/audioBlob.js'

interface LiveVoiceCaptureProps {
  open: boolean
  busy?: boolean
  caption?: string
  onCaptionChange?: (value: string) => void
  onClose: () => void
  onSave: (blob: Blob, mimeType: string, durationSec: number) => void
}

type Phase = 'idle' | 'recording' | 'preview'

export default function LiveVoiceCapture({
  open,
  busy = false,
  caption = '',
  onCaptionChange,
  onClose,
  onSave
}: LiveVoiceCaptureProps) {
  const { t } = useTranslation()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const previewUrlRef = useRef<string | null>(null)
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [micError, setMicError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMime, setPreviewMime] = useState('audio/webm')
  const [previewDurationSec, setPreviewDurationSec] = useState(0)
  const [saving, setSaving] = useState(false)

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
  }, [])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
    setPreviewBlob(null)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetAll = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    clearTimer()
    stopStream()
    clearPreview()
    setPhase('idle')
    setMicError(null)
    setElapsedSec(0)
    setSaving(false)
  }, [stopStream, clearPreview, clearTimer])

  useEffect(() => {
    if (!open) {
      resetAll()
    }
  }, [open, resetAll])

  useEffect(() => {
    return () => {
      resetAll()
    }
  }, [resetAll])

  const finishRecording = useCallback((blob: Blob, mimeType: string, durationSec: number) => {
    clearPreview()
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setPreviewBlob(blob)
    setPreviewUrl(url)
    setPreviewMime(mimeType)
    setPreviewDurationSec(durationSec)
    setPhase('preview')
  }, [clearPreview])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.stop()
    clearTimer()
    stopStream()
  }, [clearTimer, stopStream])

  const startRecording = async () => {
    setMicError(null)
    chunksRef.current = []
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(t('logs.live_voice_mic_denied'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMediaRecorderMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      const resolvedMime = recorder.mimeType || mimeType || 'audio/webm'

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onstop = () => {
        const durationSec = Math.min(
          VOICE_MEMO_MAX_DURATION_SEC,
          Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        )
        const blob = new Blob(chunksRef.current, { type: resolvedMime })
        chunksRef.current = []
        try {
          assertVoiceMemoBlobSize(blob)
          finishRecording(blob, resolvedMime, durationSec)
        } catch {
          setMicError(t('logs.live_voice_too_large'))
          setPhase('idle')
        }
      }

      recorder.onerror = () => {
        setMicError(t('logs.live_voice_record_failed'))
        resetAll()
      }

      startedAtRef.current = Date.now()
      recorder.start(200)
      setPhase('recording')
      setElapsedSec(0)
      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setElapsedSec(sec)
        if (sec >= VOICE_MEMO_MAX_DURATION_SEC) {
          stopRecording()
        }
      }, 250)
    } catch {
      setMicError(t('logs.live_voice_mic_denied'))
      stopStream()
    }
  }

  const handleSave = async () => {
    if (!previewBlob || saving || busy) return
    setSaving(true)
    try {
      onSave(previewBlob, previewMime, previewDurationSec)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="live-log-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && !saving && phase !== 'recording') onClose()
      }}
    >
      <div className="live-log-modal live-voice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="live-voice-modal-header">
          <h3>{t('logs.live_voice_btn')}</h3>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={busy || saving || phase === 'recording'}
            aria-label={t('logs.live_cancel')}
          >
            <X size={18} />
          </button>
        </div>

        {micError && <p className="live-log-modal-hint auth-error">{micError}</p>}

        {phase === 'idle' && (
          <>
            <p className="live-log-modal-hint">{t('logs.live_voice_hint')}</p>
            <button
              type="button"
              className="btn primary live-voice-record-btn"
              onClick={() => void startRecording()}
              disabled={busy || saving}
            >
              <Mic size={18} />
              {t('logs.live_voice_record')}
            </button>
          </>
        )}

        {phase === 'recording' && (
          <>
            <p className="live-voice-recording-indicator" role="status" aria-live="polite">
              <span className="live-voice-recording-dot" aria-hidden />
              {t('logs.live_voice_recording', { time: formatVoiceDuration(elapsedSec) })}
            </p>
            <button
              type="button"
              className="btn primary live-voice-stop-btn"
              onClick={stopRecording}
            >
              <Square size={16} fill="currentColor" />
              {t('logs.live_voice_stop')}
            </button>
          </>
        )}

        {phase === 'preview' && previewUrl && (
          <>
            <audio className="voice-memo-player" controls src={previewUrl} preload="auto" />
            {onCaptionChange && (
              <label className="live-voice-caption-field">
                <span>{t('logs.live_voice_caption_label')}</span>
                <input
                  type="text"
                  className="input-text"
                  value={caption}
                  onChange={(e) => onCaptionChange(e.target.value)}
                  placeholder={t('logs.live_voice_caption_placeholder')}
                  disabled={busy || saving}
                />
              </label>
            )}
            <div className="live-log-modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  clearPreview()
                  setPhase('idle')
                }}
                disabled={busy || saving}
              >
                {t('logs.live_voice_retake')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleSave()}
                disabled={busy || saving}
              >
                {saving ? t('logs.live_voice_saving') : t('logs.live_voice_save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
