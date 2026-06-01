/** WebAuthn challenge TTL — align with sign route. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface TimedValue<T> {
  value: T
  expiresAt: number
}

/** Challenge keyed by arbitrary string (e.g. username) with a string payload. */
export class ChallengeMap {
  private readonly entries = new Map<string, TimedValue<string>>()

  prune(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  set(key: string, value: string): void {
    this.prune()
    this.entries.set(key, { value, expiresAt: Date.now() + CHALLENGE_TTL_MS })
  }

  get(key: string): string | undefined {
    this.prune()
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}

/** Challenge keyed by challenge id (login/reauth) with optional metadata. */
export class ChallengeSet<T = undefined> {
  private readonly entries = new Map<string, TimedValue<T | undefined>>()

  prune(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  add(key: string, value?: T): void {
    this.prune()
    this.entries.set(key, { value, expiresAt: Date.now() + CHALLENGE_TTL_MS })
  }

  has(key: string): boolean {
    this.prune()
    const entry = this.entries.get(key)
    if (!entry) return false
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return false
    }
    return true
  }

  get(key: string): T | undefined {
    if (!this.has(key)) return undefined
    return this.entries.get(key)?.value as T | undefined
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}
