import { describe, expect, it, vi } from 'vitest'
import { captureVideoFrame, preferNativeCameraPicker } from './captureVideoFrame.js'

describe('preferNativeCameraPicker', () => {
  it('returns true on Android user agents', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Linux; Android 14)' })
    expect(preferNativeCameraPicker()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns false on desktop without touch', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      maxTouchPoints: 0
    })
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    }))
    Object.defineProperty(window, 'ontouchstart', { value: undefined, configurable: true })
    expect(preferNativeCameraPicker()).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('captureVideoFrame', () => {
  it('throws when video dimensions are zero', async () => {
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement
    await expect(captureVideoFrame(video)).rejects.toThrow('video_frame_not_ready')
  })
})
