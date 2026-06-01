/** Capture current video frame as JPEG blob (with Android-safe fallbacks). */
export async function captureVideoFrame(video: HTMLVideoElement, quality = 0.92): Promise<Blob> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) {
    throw new Error('video_frame_not_ready')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas_context_unavailable')
  }
  ctx.drawImage(video, 0, 0, width, height)

  const blob = await canvasToJpegBlob(canvas, quality)
  if (blob) return blob

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const response = await fetch(dataUrl)
  const fallback = await response.blob()
  if (!fallback.size) {
    throw new Error('capture_encode_failed')
  }
  return fallback
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (blob: Blob | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(blob)
    }

    const timer = window.setTimeout(() => finish(null), 3000)

    try {
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', quality)
    } catch {
      finish(null)
    }
  })
}

/** Mobile: native camera via file input is more reliable than getUserMedia + canvas. */
export function preferNativeCameraPicker(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 768px)').matches
  return touch && (coarse || narrow)
}
