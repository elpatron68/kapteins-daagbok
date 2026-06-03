export type CameraAvailability = 'available' | 'none' | 'unsupported'

/** Whether the browser exposes camera APIs at all. */
export function isCameraApiSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Best-effort probe for at least one video input device (no permission prompt). */
export async function probeCameraAvailability(): Promise<CameraAvailability> {
  if (!isCameraApiSupported()) return 'unsupported'
  if (!navigator.mediaDevices?.enumerateDevices) {
    // Cannot list devices; defer to getUserMedia attempt in the capture UI.
    return 'available'
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    if (devices.some((d) => d.kind === 'videoinput')) return 'available'
    return 'none'
  } catch {
    return 'none'
  }
}

export function cameraErrorKeyFromDomException(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'logs.live_photo_no_camera'
  }
  if (name === 'NotAllowedError' || name === 'NotReadableError' || name === 'SecurityError') {
    return 'logs.live_photo_camera_denied'
  }
  return 'logs.live_photo_camera_unavailable'
}
