/** Request durable IndexedDB storage (important on iOS Safari). */
export async function requestPersistentStorage(): Promise<{
  persisted: boolean
  supported: boolean
}> {
  if (!('storage' in navigator) || !navigator.storage.persist) {
    return { persisted: false, supported: false }
  }
  try {
    const persisted = await navigator.storage.persisted()
    if (persisted) return { persisted: true, supported: true }
    const granted = await navigator.storage.persist()
    return { persisted: granted, supported: true }
  } catch {
    return { persisted: false, supported: true }
  }
}
