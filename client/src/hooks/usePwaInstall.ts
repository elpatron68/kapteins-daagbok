import { useState, useEffect, useCallback } from 'react'

const DISMISS_KEY = 'pwa_install_dismissed_until'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PwaInstallPlatform = 'ios' | 'android' | 'desktop'

export function isRunningStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIosDevice(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ may report as Mac with touch support
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function readDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY)
    if (!until) return false
    if (until === 'forever') return true
    return Date.now() < Number(until)
  } catch {
    return false
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const isStandalone = isRunningStandalone()

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const platform: PwaInstallPlatform | null = isIosDevice()
    ? 'ios'
    : deferredPrompt
      ? /Android/i.test(navigator.userAgent)
        ? 'android'
        : 'desktop'
      : null

  const canPrompt = !isStandalone && !dismissed && (platform === 'ios' || !!deferredPrompt)

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome === 'accepted'
  }, [deferredPrompt])

  const dismissLater = useCallback(() => {
    const until = Date.now() + 3 * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISS_KEY, String(until))
    setDismissed(true)
  }, [])

  const dismissForever = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, 'forever')
    setDismissed(true)
  }, [])

  return {
    canPrompt,
    platform,
    install,
    dismissLater,
    dismissForever,
    isStandalone,
    hasNativeInstall: !!deferredPrompt
  }
}
