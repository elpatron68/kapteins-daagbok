const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0.0-dev'

export function getAppVersion(): string {
  return APP_VERSION
}

export function parseAppVersion(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

/** Positive when `a` is newer than `b`. */
export function compareAppVersions(a: string, b: string): number {
  const partsA = parseAppVersion(a)
  const partsB = parseAppVersion(b)
  const length = Math.max(partsA.length, partsB.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

export function isNewerAppVersion(serverVersion: string, clientVersion: string): boolean {
  return compareAppVersions(serverVersion, clientVersion) > 0
}

export async function fetchDeployedVersion(timeoutMs = 4_000): Promise<string | null> {
  if (!navigator.onLine) return null

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`/version.json?_=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    })
    if (!response.ok) return null

    const payload = (await response.json()) as { version?: unknown }
    return typeof payload.version === 'string' ? payload.version.trim() : null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function isDeployedVersionNewer(): Promise<boolean> {
  const deployedVersion = await fetchDeployedVersion()
  if (!deployedVersion) return false
  return isNewerAppVersion(deployedVersion, getAppVersion())
}
