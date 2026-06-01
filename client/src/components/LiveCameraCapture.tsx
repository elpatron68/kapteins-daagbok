import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, X } from 'lucide-react'
import {
  captureVideoFrame,
  preferNativeCameraPicker
} from '../utils/captureVideoFrame.js'

interface LiveCameraCaptureProps {
  open: boolean
  busy?: boolean
  caption?: string
  onCaptionChange?: (value: string) => void
  onClose: () => void
  onCapture: (blob: Blob) => void
}

type Phase = 'live' | 'preview' | 'native'

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [phase, setPhase] = useState<Phase>(() => (preferNativeCameraPicker() ? 'native' : 'live'))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [streamGeneration, setStreamGeneration] = useState(0)

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
    setPreviewBlob(null)
  }, [])

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

  const enterPreview = useCallback((blob: Blob) => {
    stopStream()
    clearPreview()
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setPreviewBlob(blob)
    setPreviewUrl(url)
    setPhase('preview')
  }, [stopStream, clearPreview])

  const resetToLive = useCallback(() => {
    clearPreview()
    setCameraError(null)
    setCapturing(false)
    if (preferNativeCameraPicker()) {
      setPhase('native')
    } else {
      setPhase('live')
      setStreamGeneration((n) => n + 1)
    }
  }, [clearPreview])

  useEffect(() => {
    if (!open) {
      stopStream()
      clearPreview()
      setCameraError(null)
      setCapturing(false)
      setPhase(preferNativeCameraPicker() ? 'native' : 'live')
      return
    }
    setPhase(preferNativeCameraPicker() ? 'native' : 'live')
    clearPreview()
  }, [open, stopStream, clearPreview])

  useEffect(() => {
    if (!open || phase !== 'live') {
      stopStream()
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
        if (!video) return

        const markReady = () => {
          if (cancelled) return
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setReady(true)
          }
        }

        video.onloadedmetadata = markReady
        video.srcObject = stream
        await video.play()
        markReady()
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
  }, [open, phase, streamGeneration, stopStream, t])

  const handleCapture = async () => {
    const video = videoRef.current
    if (!video || !ready || busy || capturing) return

    setCapturing(true)
    setCameraError(null)
    try {
      const blob = await captureVideoFrame(video)
      enterPreview(blob)
    } catch (err) {
      console.error('Live camera capture failed:', err)
      setCameraError(t('logs.live_photo_capture_failed'))
    } finally {
      setCapturing(false)
    }
  }

  const handleNativeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || busy) return

    setCameraError(null)
    try {
      enterPreview(file)
    } catch (err) {
      console.error('Live camera file pick failed:', err)
      setCameraError(t('logs.live_photo_capture_failed'))
    }
  }

  const handleSave = () => {
    if (!previewBlob || busy) return
    onCapture(previewBlob)
  }

  const handleRetake = () => {
    if (busy) return
    resetToLive()
  }

  const openNativePicker = () => {
    if (busy) return
    fileInputRef.current?.click()
  }

  if (!open) return null

  const showPreview = phase === 'preview' && previewUrl

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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="live-camera-file-input"
          onChange={(e) => void handleNativeFile(e)}
        />

        {cameraError && (
          <p className="live-log-modal-hint auth-error">{cameraError}</p>
        )}

        {showPreview ? (
          <div className="live-camera-preview-wrap">
            <img
              src={previewUrl}
              alt=""
              className="live-camera-preview live-camera-preview-still"
            />
          </div>
        ) : phase === 'native' ? (
          <div className="live-camera-native-prompt">
            <p className="live-log-modal-hint">{t('logs.live_photo_native_hint')}</p>
            <button
              type="button"
              className="btn primary live-camera-open-native"
              onClick={openNativePicker}
              disabled={busy}
            >
              <Camera size={18} />
              {t('logs.live_photo_open_camera_btn')}
            </button>
          </div>
        ) : cameraError && !ready ? null : (
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

          {showPreview ? (
            <>
              <button type="button" className="btn secondary" onClick={handleRetake} disabled={busy}>
                {t('logs.live_photo_retake_btn')}
              </button>
              <button
                type="button"
                className="btn primary live-camera-shutter"
                onClick={handleSave}
                disabled={busy || !previewBlob}
              >
                <Camera size={18} />
                {busy ? t('logs.photo_processing') : t('logs.live_photo_save_btn')}
              </button>
            </>
          ) : phase === 'native' ? null : (
            <button
              type="button"
              className="btn primary live-camera-shutter"
              onClick={() => void handleCapture()}
              disabled={busy || capturing || !ready || !!cameraError}
            >
              <Camera size={18} />
              {capturing ? t('logs.photo_processing') : t('logs.live_photo_capture_btn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
