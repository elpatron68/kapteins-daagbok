import { describe, expect, it, vi } from 'vitest'
import {
  cameraErrorKeyFromDomException,
  isCameraApiSupported,
  probeCameraAvailability
} from './cameraAvailability.js'

describe('cameraAvailability', () => {
  it('detects missing camera API', () => {
    const nav = { mediaDevices: undefined }
    vi.stubGlobal('navigator', nav)
    expect(isCameraApiSupported()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('returns none when no videoinput devices', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'a1', label: '', groupId: '' }
        ])
      }
    })
    await expect(probeCameraAvailability()).resolves.toBe('none')
    vi.unstubAllGlobals()
  })

  it('returns available when a videoinput exists', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'v1', label: '', groupId: '' }
        ])
      }
    })
    await expect(probeCameraAvailability()).resolves.toBe('available')
    vi.unstubAllGlobals()
  })

  it('maps NotFoundError to no-camera i18n key', () => {
    expect(cameraErrorKeyFromDomException(new DOMException('', 'NotFoundError'))).toBe(
      'logs.live_photo_no_camera'
    )
  })
})
