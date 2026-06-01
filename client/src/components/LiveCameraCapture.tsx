import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, X } from 'lucide-react'

interface LiveCameraCaptureProps {
  open: boolean
  busy?: boolean
  caption?: string
  onCaptionChange?: (value: string) => void
  onClose: () => void
  onCapture: (blob: Blob) => void
}

export default function LiveCameraCapture({
  open,
  busy = false,
  caption = '',
  onCaptionChange,
  onClose,
  onCapture
}: LiveCameraCaptureProps) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setReady(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stopStream()
      setCameraError(null)
      return
    }

    let cancelled = false

    const start = async () => {
      setCameraError(null)
      setReady(false)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t('logs.live_photo_camera_unavailable'))
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
          setReady(true)
        }
      } catch (err) {
        console.error('Camera access failed:', err)
        if (!cancelled) {
          setCameraError(t('logs.live_photo_camera_denied'))
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, stopStream, t])

  const handleCapture = () => {
    const video = videoRef.current
    if (!video || !ready || busy) return

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob)
      },
      'image/jpeg',
      0.92
    )
  }

  if (!open) return null

  return (
    <div
      className="live-log-modal-backdrop live-camera-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="live-log-modal live-camera-modal" onClick={(e) => e.stopPropagation()}>
        <div className="live-camera-header">
          <h3>{t('logs.live_photo_btn')}</h3>
          <button
            type="button"
            className="btn secondary live-camera-close"
            onClick={onClose}
            disabled={busy}
            aria-label={t('logs.confirm_no')}
          >
            <X size={18} />
          </button>
        </div>

        {cameraError ? (
          <p className="live-log-modal-hint auth-error">{cameraError}</p>
        ) : (
          <div className="live-camera-preview-wrap">
            <video
              ref={videoRef}
              className="live-camera-preview"
              playsInline
              muted
              autoPlay
            />
            {!ready && (
              <p className="live-camera-loading">{t('logs.live_photo_camera_starting')}</p>
            )}
          </div>
        )}

        {onCaptionChange && (
          <div className="input-group live-camera-caption">
            <label>{t('logs.photo_caption_label')}</label>
            <input
              type="text"
              className="input-text"
              placeholder={t('logs.photo_caption_placeholder')}
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              disabled={busy}
            />
          </div>
        )}

        <div className="live-log-modal-actions live-camera-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {t('logs.confirm_no')}
          </button>
          <button
            type="button"
            className="btn primary live-camera-shutter"
            onClick={handleCapture}
            disabled={busy || !ready || !!cameraError}
          >
            <Camera size={18} />
            {busy ? t('logs.photo_processing') : t('logs.live_photo_capture_btn')}
          </button>
        </div>
      </div>
    </div>
  )
}
