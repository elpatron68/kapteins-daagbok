/**
 * WebAuthn / Passkeys require a valid domain (see WHATWG valid domain).
 * IP addresses such as 127.0.0.1 are rejected by browsers and @simplewebauthn/browser.
 */
export function isPasskeyCompatibleHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^((xn--[a-z0-9-]+|[a-z0-9]+(-[a-z0-9]+)*)\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(hostname)
  )
}

export function isPasskeyCompatibleLocation(loc: Location = window.location): boolean {
  return isPasskeyCompatibleHostname(loc.hostname)
}

/** Same page on localhost — for dev links when opened via 127.0.0.1. */
export function toPasskeyCompatibleUrl(href: string): string {
  const url = new URL(href)
  if (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1') {
    url.hostname = 'localhost'
  }
  return url.toString()
}

/**
 * Redirect 127.0.0.1 / ::1 to localhost (dev). Returns true if navigation was started.
 */
export function redirectToPasskeyCompatibleHostIfNeeded(loc: Location = window.location): boolean {
  if (isPasskeyCompatibleHostname(loc.hostname)) return false

  const target = toPasskeyCompatibleUrl(loc.href)
  if (target === loc.href) return false

  window.location.replace(target)
  return true
}

export function isPasskeyInvalidDomainError(message: string): boolean {
  return /is an invalid domain$/i.test(message)
}

export function localizePasskeyHostError(message: string, invalidHostMessage: string): string {
  return isPasskeyInvalidDomainError(message) ? invalidHostMessage : message
}

/** User dismissed or denied the platform passkey prompt (do not auto-retry WebAuthn). */
export function isWebAuthnUserAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name: string }).name) : ''
  if (name === 'NotAllowedError' || name === 'AbortError') return true
  const message = 'message' in err ? String((err as { message: string }).message) : String(err)
  return /timed out|not allowed|cancel/i.test(message)
}

export function localizeWebAuthnError(
  message: string,
  messages: {
    invalidHost: string
    cancelled: string
    invalidRpId?: string
  }
): string {
  if (isPasskeyInvalidDomainError(message)) return messages.invalidHost
  if (/timed out|not allowed|cancel/i.test(message)) return messages.cancelled
  if (/invalid for this domain/i.test(message) && messages.invalidRpId) {
    return messages.invalidRpId
  }
  return message
}
