import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser } from 'lucide-react'
import { isSignatureImage } from '../utils/signatures.js'

interface SignaturePadProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
}

const STROKE_COLOR = '#0f172a'
const STROKE_WIDTH = 2.2

export default function SignaturePad({
  id,
  label,
  value,
  onChange,
  disabled = false,
  readOnly = false
}: SignaturePadProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const skipExternalRedraw = useRef(false)
  const hasInk = useRef(false)
  const [showHint, setShowHint] = useState(() => !value)

  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    hasInk.current = false
  }, [getContext])

  const drawImageValue = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return

    const img = new Image()
    img.onload = () => {
      clearCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.drawImage(img, 0, 0, width, height)
      hasInk.current = true
    }
    img.src = dataUrl
  }, [clearCanvas, getContext])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width, 1)
    const height = Math.max(rect.height, 1)
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = STROKE_WIDTH
    ctx.strokeStyle = STROKE_COLOR

    if (value && isSignatureImage(value)) {
      drawImageValue(value)
    } else {
      clearCanvas()
    }
  }, [clearCanvas, drawImageValue, value])

  useEffect(() => {
    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [setupCanvas])

  useEffect(() => {
    if (skipExternalRedraw.current) {
      skipExternalRedraw.current = false
      return
    }
    if (value && isSignatureImage(value)) {
      drawImageValue(value)
      setShowHint(false)
    } else if (!value) {
      clearCanvas()
      setShowHint(true)
    }
  }, [value, clearCanvas, drawImageValue])

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
  }

  const commitCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasInk.current) {
      skipExternalRedraw.current = true
      onChange('')
      return
    }
    skipExternalRedraw.current = true
    onChange(canvas.toDataURL('image/png'))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || disabled) return
    event.preventDefault()
    const point = getPoint(event)
    if (!point) return

    isDrawing.current = true
    lastPoint.current = point
    setShowHint(false)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || readOnly || disabled) return
    event.preventDefault()

    const point = getPoint(event)
    const ctx = getContext()
    const prev = lastPoint.current
    if (!point || !ctx || !prev) return

    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    lastPoint.current = point
    hasInk.current = true
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    isDrawing.current = false
    lastPoint.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    commitCanvas()
  }

  const handleClear = () => {
    if (readOnly || disabled) return
    clearCanvas()
    skipExternalRedraw.current = true
    setShowHint(true)
    onChange('')
  }

  const interactive = !readOnly && !disabled

  if (readOnly && value && !isSignatureImage(value)) {
    return (
      <div className="input-group signature-pad-group">
        <label htmlFor={id}>{label}</label>
        <div className="signature-legacy-text">{value}</div>
      </div>
    )
  }

  return (
    <div className="input-group signature-pad-group">
      <div className="signature-pad-header">
        <label htmlFor={id}>{label}</label>
        {interactive && (
          <button type="button" className="signature-pad-clear" onClick={handleClear}>
            <Eraser size={14} />
            {t('logs.sign_clear')}
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className={`signature-pad ${readOnly ? 'readonly' : ''} ${disabled ? 'disabled' : ''}`}
      >
        {readOnly && value && isSignatureImage(value) ? (
          <img src={value} alt={label} className="signature-pad-image" />
        ) : (
          <canvas
            id={id}
            ref={canvasRef}
            className="signature-pad-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerLeave={finishStroke}
            onPointerCancel={finishStroke}
          />
        )}
        {interactive && showHint && (
          <span className="signature-pad-hint">{t('logs.sign_hint')}</span>
        )}
      </div>
    </div>
  )
}
