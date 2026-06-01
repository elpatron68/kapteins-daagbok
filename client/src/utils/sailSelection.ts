/** Toggle one sail label in a multi-select list (case-insensitive). */
export function toggleSailInSelection(selected: readonly string[], sail: string): string[] {
  const normalized = sail.trim()
  if (!normalized) return [...selected]

  return selected.some((s) => s.toLowerCase() === normalized.toLowerCase())
    ? selected.filter((s) => s.toLowerCase() !== normalized.toLowerCase())
    : [...selected, normalized]
}

export function isSailInSelection(selected: readonly string[], sail: string): boolean {
  const normalized = sail.trim().toLowerCase()
  if (!normalized) return false
  return selected.some((s) => s.toLowerCase() === normalized)
}

/** Join selected sails for logbook `sailsOrMotor` (matches LogEntryEditor). */
export function joinSailSelection(selected: readonly string[]): string {
  return selected.map((s) => s.trim()).filter(Boolean).join(' + ')
}

export function splitSailSelection(value: string): string[] {
  return value
    .split(/\s*(?:\+|\bplus\b|,)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Deduplicate sail names for picker UI (case-insensitive, keeps first spelling). */
export function dedupeSailNames(sails: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const sail of sails) {
    const trimmed = sail.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}
